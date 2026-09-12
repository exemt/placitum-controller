/**
 * Keep-alive блобов поколений во внутреннем Redis.
 *
 * Блобы живут со сроком (BLOB_TTL_SEC), а не вечно: без срока каждый send
 * оставлял бы в Redis тела прошлых поколений до noeviction. Но указатель в KV
 * ссылается на хеши, и нода, поднявшаяся после истечения срока, поколение не
 * соберёт. Поэтому срок продлевается здесь -- раз в everyMs каждому блобу
 * опубликованного указателя. Продлевается только опубликованное: блобы старых
 * поколений никто не трогает, и они сгорают сами. Это и есть уборка.
 *
 * Пропавший блоб (Redis перезапущен, контроллер лежал дольше срока) -- не
 * ошибка, а работа: тело берётся из плана того пространства, чей хеш совпал с
 * указателем, и кладётся обратно. Не совпал ни один (база правлена после
 * издания) -- вернуть нечего, о чём и говорится в журнале: лечится publish.
 * Ноды, промахнувшиеся мимо блоба, повторяют забор сами (desired watch у
 * агента, ip и modsec), поэтому вернуть тело -- достаточно.
 */

import type { BlobItems } from "../compile.ts";
import type { IpPackPointer } from "./ip-pack.ts";
import type { NginxPackPointer } from "./nginx-pack.ts";
import { blobKey } from "./pack.ts";
import type { RulesPackPointer } from "./pointer.ts";

export type KeepaliveChannelId = "nginx" | "rules" | "ip";

/** Опубликованное поколение канала: чем оно названо и на какие блобы ссылается. */
export interface PublishedBlobs {
  rev: number;
  sha256: string;
  keys: string[];
}

export interface KeepaliveRedis {
  expireMany(keys: string[], ttlSec: number): Promise<string[]>;
  setNxExpireMany(
    items: { key: string; value: Buffer }[],
    ttlSec: number,
  ): Promise<{ wrote: number; reused: number }>;
}

export interface KeepaliveChannel {
  id: KeepaliveChannelId;
  /** Указатель из KV; null -- канал ещё не издавался. */
  published(): Promise<PublishedBlobs | null>;
  /** Тела поколения пространства из плана; null -- план не собрался. */
  blobs(httpSpaceId: string): Promise<BlobItems | null>;
}

export type KeepaliveLog = (
  level: "info" | "warn",
  msg: string,
  fields: Record<string, unknown>,
) => void;

export interface KeepaliveOptions {
  redis: KeepaliveRedis;
  channels: KeepaliveChannel[];
  /** Пространства, среди которых ищется план с хешем указателя. */
  spaces: () => Promise<string[]>;
  ttlSec: number;
  log: KeepaliveLog;
}

export interface KeepaliveTickResult {
  channel: KeepaliveChannelId;
  rev: number;
  /** Сколько блобов было на месте и получило новый срок. */
  kept: number;
  /** Сколько пропало. */
  missing: number;
  /** null -- восстанавливать было нечего; false -- пропали и вернуть не из чего. */
  restored: boolean | null;
}

export interface BlobKeepalive {
  tick(): Promise<KeepaliveTickResult[]>;
  stop(): void;
}

/** Один проход по всем каналам. Ошибка одного канала не мешает остальным. */
export async function keepaliveTick(
  opts: KeepaliveOptions,
): Promise<KeepaliveTickResult[]> {
  const out: KeepaliveTickResult[] = [];

  for (const channel of opts.channels) {
    try {
      const result = await keepChannel(opts, channel);

      if (result !== null) {
        out.push(result);
      }
    } catch (err) {
      opts.log("warn", "desired blobs keep-alive failed", {
        channel: channel.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}

async function keepChannel(
  opts: KeepaliveOptions,
  channel: KeepaliveChannel,
): Promise<KeepaliveTickResult | null> {
  const published = await channel.published();

  if (published === null || published.keys.length === 0) {
    return null;
  }

  const missing = await opts.redis.expireMany(published.keys, opts.ttlSec);
  const base = {
    channel: channel.id,
    rev: published.rev,
    kept: published.keys.length - missing.length,
    missing: missing.length,
  };

  if (missing.length === 0) {
    return { ...base, restored: null };
  }

  for (const spaceId of await opts.spaces()) {
    let plan: BlobItems | null;

    try {
      plan = await channel.blobs(spaceId);
    } catch (err) {
      opts.log("warn", "desired blobs plan failed", {
        channel: channel.id,
        space: spaceId,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (plan === null || plan.sha256 !== published.sha256) {
      continue;
    }

    const put = await opts.redis.setNxExpireMany(plan.items, opts.ttlSec);
    opts.log("info", "desired blobs restored", {
      channel: channel.id,
      space: spaceId,
      rev: published.rev,
      missing: missing.length,
      wrote: put.wrote,
      reused: put.reused,
    });

    return { ...base, restored: true };
  }

  opts.log("warn", "desired blobs expired and cannot be restored", {
    channel: channel.id,
    rev: published.rev,
    hash: published.sha256,
    missing: missing.length,
    hint: "source changed since publish; run publish to reissue the generation",
  });

  return { ...base, restored: false };
}

/**
 * Таймер: первый проход через firstMs (дать KV и базе подняться), дальше
 * раз в everyMs. everyMs обязан быть заметно меньше ttlSec, иначе окно между
 * проходами сгорит: при сроке 300 с проход раз в минуту оставляет запас в
 * четыре пропущенных тика.
 */
export function startBlobKeepalive(
  opts: KeepaliveOptions & { everyMs: number; firstMs?: number },
): BlobKeepalive {
  const tick = () => keepaliveTick(opts);
  const run = () => {
    void tick().catch((err: unknown) => {
      opts.log("warn", "desired blobs keep-alive tick failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const first = setTimeout(run, opts.firstMs ?? 5_000);
  first.unref();
  const every = setInterval(run, opts.everyMs);
  every.unref();

  return {
    tick,
    stop() {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}

/* --- какие блобы называет указатель ------------------------------------ */

export function rulesBlobKeys(p: RulesPackPointer): string[] {
  return keysOf([
    ...Object.values(p.files),
    ...Object.values(p.profiles),
    ...Object.values(p.data),
    ...Object.values(p.policies ?? {}),
  ]);
}

export function nginxBlobKeys(p: NginxPackPointer): string[] {
  return keysOf([
    p.config,
    ...Object.values(p.pages),
    ...Object.values(p.store).map((entry) => entry.hash),
  ]);
}

/**
 * Живые наборы (`live`) блобами не едут: инспектор берёт их у keeper по
 * ссылке, в Redis тел нет -- ровно как в Pack.Hashes() у самого инспектора.
 */
export function ipBlobKeys(p: IpPackPointer): string[] {
  return keysOf([
    ...Object.values(p.lists),
    ...Object.values(p.countries),
    ...Object.values(p.asns),
  ]);
}

/** Один хеш может стоять под несколькими именами: ключ один. */
function keysOf(hashes: string[]): string[] {
  return [...new Set(hashes.map((hash) => blobKey(hash)))];
}
