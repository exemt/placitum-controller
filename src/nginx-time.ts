/**
 * ngx_parse_time(..., 1): секунды. 5m, 1h, 30s, 180d, голое число.
 */

const UNIT: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseNginxTimeS(spec: string | undefined): number | undefined {
  if (spec === undefined) return undefined;
  const raw = spec.trim();
  if (raw.length === 0) return undefined;
  const m = /^(\d+)([smhd])?$/i.exec(raw);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = (m[2] ?? "s").toLowerCase();
  return n * (UNIT[unit] ?? 1);
}

/** ttl события; нет своего — ttl списка; списка нет — отказ. */
export function eventTtlS(
  eventTtl: number | undefined,
  listTtl: string | undefined,
): number | undefined {
  if (typeof eventTtl === "number" && eventTtl > 0) {
    return Math.floor(eventTtl);
  }
  return parseNginxTimeS(listTtl);
}
