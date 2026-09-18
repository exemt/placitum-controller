import type { Dataset } from "./http-space.ts";

// Mirror of node/module/src/local/ngx_http_waf_shm.c: what the module reserves in the shared
// zone for every declared dataset, and what it keeps for its own tables. nginx -t refuses a zone
// that does not fit, and the edge drops the whole generation, so the controller checks first.
// Change the numbers together with the module.
export const NGINX_DS_BYTES_PER_ENTRY = 128;
export const NGINX_SHM_RESERVE = 256 * 1024;
export const NGINX_SHM_MIN_SIZE = 256 * 1024;

// ngx_parse_size: digits with an optional k or m suffix, either case; nothing larger.
export function parseNginxSize(text: string): number | null {
  const m = /^(\d+)([kKmM]?)$/.exec(text.trim());
  if (m === null) {
    return null;
  }
  const n = Number(m[1]);
  if (!Number.isSafeInteger(n)) {
    return null;
  }
  const unit = m[2].toLowerCase();
  return unit === "k" ? n * 1024 : unit === "m" ? n * 1024 * 1024 : n;
}

export type ShmDataset = Pick<
  Dataset,
  "kind" | "inNginx" | "active" | "maxEntries" | "size" | "entries"
>;

// A dataset that becomes a waf_local_dataset line: lists only, and only those kept in nginx.
export function countsInNginx(ds: Pick<Dataset, "kind" | "inNginx">): boolean {
  return ds.kind === "list" && ds.inNginx !== false;
}

// Entries the module reserves for one dataset: an active set gets its limit= up front
// (live_max= is not printed, so it equals the limit), an internal one only what it holds.
export function datasetShmEntries(ds: ShmDataset): number {
  if (ds.active) {
    return ds.maxEntries;
  }
  return ds.entries?.length ?? ds.size;
}

export function shmNeed(datasets: ShmDataset[]): number {
  return datasets
    .filter(countsInNginx)
    .reduce((sum, ds) => sum + datasetShmEntries(ds) * NGINX_DS_BYTES_PER_ENTRY, NGINX_SHM_RESERVE);
}

export interface ShmShortfall {
  zone: string;
  size: number;
  need: number;
}

// Null when the zone fits or when there is nothing to compare: no zone declared, or a size the
// parser rejects on its own.
export function shmShortfall(
  shmZone: { name: string; size: string } | undefined,
  datasets: ShmDataset[],
): ShmShortfall | null {
  if (shmZone === undefined) {
    return null;
  }
  const size = parseNginxSize(shmZone.size);
  if (size === null) {
    return null;
  }
  const need = shmNeed(datasets);
  return need > size ? { zone: shmZone.name, size, need } : null;
}

// The same words nginx -t would print on the edge, so the operator sees one story.
export function shmShortfallText(short: ShmShortfall): string {
  return (
    `zone "${short.zone}" of ${short.size} bytes does not fit the datasets declared in nginx: ` +
    `they need about ${short.need} bytes (${NGINX_DS_BYTES_PER_ENTRY} per entry plus ` +
    `${NGINX_SHM_RESERVE} of overhead); raise waf_shm_zone or lower limit= on the datasets`
  );
}
