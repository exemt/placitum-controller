/**
 * Разбор тела настроек агента.
 *
 * Проверки здесь -- те же, что агент сделал бы у себя, только раньше. Разница
 * в цене: у агента незаполненная настройка -- это `archive off` в логе одной
 * ноды, которую никто не читает, пока через неделю не спросят, где записи.
 *
 * Отдельно стоит правило «эндпоинт есть -- бакет обязателен»: у агента такая
 * пара валит `Finish()` (`no WAF_RETAIN_BUCKET_* is set`), то есть настройка
 * не применится целиком и молча останется прежней.
 */

import {
  ARCHIVE_KINDS,
  type AgentBatch,
  type AgentSettings,
  type ArchiveKind,
} from "./model/agent.ts";

export type ParseOk<T> = { ok: true; value: T };
export type ParseFail = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseFail;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Пусто, null и пустая строка -- «ключа нет», а не значение. */
function absent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

const ENDPOINT_RE = /^https?:\/\/[a-z0-9][a-z0-9.:_-]*(\/[^\s]*)?$/i;
const REGION_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Имя бакета S3: строчные, цифры, точка и дефис, 3..63, края -- буква/цифра.
const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function asInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined | ParseFail {
  if (absent(value)) {
    return undefined;
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `invalid_${field}` };
  }
  return n;
}

function failed<T>(value: T | undefined | ParseFail): value is ParseFail {
  return value !== undefined && typeof value === "object" && value !== null &&
    (value as ParseFail).ok === false;
}

function parseBatch(raw: unknown, kind: ArchiveKind): AgentBatch | ParseFail {
  if (!isRecord(raw)) {
    return { ok: false, error: `invalid_batch_${kind}` };
  }

  const out: AgentBatch = {};

  const size = asInt(raw.size, `batch_${kind}_size`, 1, 10000);
  if (failed(size)) return size;
  if (size !== undefined) out.size = size;

  const timeout = asInt(raw.timeout_ms, `batch_${kind}_timeout`, 0, 600000);
  if (failed(timeout)) return timeout;
  if (timeout !== undefined) out.timeoutMs = timeout;

  return out;
}

export function parseAgentSettingsBody(body: unknown): ParseResult<AgentSettings> {
  if (!isRecord(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const out: AgentSettings = {};

  if (!absent(body.s3)) {
    if (!isRecord(body.s3)) {
      return { ok: false, error: "invalid_s3" };
    }

    const s3: AgentSettings["s3"] = {};

    if (!absent(body.s3.endpoint)) {
      const endpoint = String(body.s3.endpoint).trim();
      if (endpoint.length > 200 || !ENDPOINT_RE.test(endpoint)) {
        return { ok: false, error: "invalid_endpoint" };
      }
      s3.endpoint = endpoint;
    }

    if (!absent(body.s3.region)) {
      const region = String(body.s3.region).trim();
      if (!REGION_RE.test(region)) {
        return { ok: false, error: "invalid_region" };
      }
      s3.region = region;
    }

    if (!absent(body.s3.buckets)) {
      if (!isRecord(body.s3.buckets)) {
        return { ok: false, error: "invalid_buckets" };
      }
      const buckets: NonNullable<AgentSettings["s3"]>["buckets"] = {};
      for (const kind of ARCHIVE_KINDS) {
        const value = body.s3.buckets[kind];
        if (absent(value)) {
          continue;
        }
        const name = String(value).trim();
        if (!BUCKET_RE.test(name) || name.includes("..")) {
          return { ok: false, error: `invalid_bucket_${kind}` };
        }
        buckets[kind] = name;
      }
      if (Object.keys(buckets).length > 0) {
        s3.buckets = buckets;
      }
    }

    // Эндпоинт без единого бакета -- отказ `Finish()` на ноде, а не «архив
    // выключен»: настройка не применится вообще.
    if (s3.endpoint !== undefined && s3.buckets === undefined) {
      return { ok: false, error: "buckets_required" };
    }

    if (Object.keys(s3).length > 0) {
      out.s3 = s3;
    }
  }

  if (!absent(body.archive)) {
    if (!isRecord(body.archive)) {
      return { ok: false, error: "invalid_archive" };
    }

    const archive: AgentSettings["archive"] = {};

    const workers = asInt(body.archive.workers, "workers", 1, 64);
    if (failed(workers)) return workers;
    if (workers !== undefined) archive.workers = workers;

    const queue = asInt(body.archive.queue, "queue", 1, 262144);
    if (failed(queue)) return queue;
    if (queue !== undefined) archive.queue = queue;

    const timeout = asInt(body.archive.timeout_ms, "timeout", 100, 600000);
    if (failed(timeout)) return timeout;
    if (timeout !== undefined) archive.timeoutMs = timeout;

    if (!absent(body.archive.batch)) {
      if (!isRecord(body.archive.batch)) {
        return { ok: false, error: "invalid_batch" };
      }
      const batch: NonNullable<AgentSettings["archive"]>["batch"] = {};
      for (const kind of ARCHIVE_KINDS) {
        const raw = body.archive.batch[kind];
        if (absent(raw)) {
          continue;
        }
        const parsed = parseBatch(raw, kind);
        if ("ok" in parsed && parsed.ok === false) {
          return parsed;
        }
        const policy = parsed as AgentBatch;
        if (Object.keys(policy).length > 0) {
          batch[kind] = policy;
        }
      }
      if (Object.keys(batch).length > 0) {
        archive.batch = batch;
      }
    }

    if (Object.keys(archive).length > 0) {
      out.archive = archive;
    }
  }

  return { ok: true, value: out };
}

/** Тело ответа: тот же вид, что принимает PUT. */
export function jsonAgentSettings(settings: AgentSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (settings.s3 !== undefined) {
    const s3: Record<string, unknown> = {};
    if (settings.s3.endpoint !== undefined) s3.endpoint = settings.s3.endpoint;
    if (settings.s3.region !== undefined) s3.region = settings.s3.region;
    if (settings.s3.buckets !== undefined) s3.buckets = settings.s3.buckets;
    out.s3 = s3;
  }

  if (settings.archive !== undefined) {
    const archive: Record<string, unknown> = {};
    if (settings.archive.workers !== undefined) {
      archive.workers = settings.archive.workers;
    }
    if (settings.archive.queue !== undefined) {
      archive.queue = settings.archive.queue;
    }
    if (settings.archive.timeoutMs !== undefined) {
      archive.timeout_ms = settings.archive.timeoutMs;
    }
    if (settings.archive.batch !== undefined) {
      const batch: Record<string, unknown> = {};
      for (const kind of ARCHIVE_KINDS) {
        const policy = settings.archive.batch[kind];
        if (policy === undefined) {
          continue;
        }
        const row: Record<string, unknown> = {};
        if (policy.size !== undefined) row.size = policy.size;
        if (policy.timeoutMs !== undefined) row.timeout_ms = policy.timeoutMs;
        batch[kind] = row;
      }
      archive.batch = batch;
    }
    out.archive = archive;
  }

  return out;
}
