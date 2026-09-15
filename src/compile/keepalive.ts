import type { BlobItems } from "../compile.ts";
import type { IpPackPointer } from "./ip-pack.ts";
import type { NginxPackPointer } from "./nginx-pack.ts";
import { blobKey } from "./pack.ts";
import type { RulesPackPointer } from "./pointer.ts";

export type KeepaliveChannelId = "nginx" | "rules" | "ip";

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
  published(): Promise<PublishedBlobs | null>;
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
  spaces: () => Promise<string[]>;
  ttlSec: number;
  log: KeepaliveLog;
}

export interface KeepaliveTickResult {
  channel: KeepaliveChannelId;
  rev: number;
  kept: number;
  missing: number;
  restored: boolean | null;
}

export interface BlobKeepalive {
  tick(): Promise<KeepaliveTickResult[]>;
  stop(): void;
}

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

export function ipBlobKeys(p: IpPackPointer): string[] {
  return keysOf([
    ...Object.values(p.lists),
    ...Object.values(p.countries),
    ...Object.values(p.asns),
  ]);
}

function keysOf(hashes: string[]): string[] {
  return [...new Set(hashes.map((hash) => blobKey(hash)))];
}
