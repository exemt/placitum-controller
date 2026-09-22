import { createHash, type Hash } from "node:crypto";

import { blobKey } from "./compile/pack.ts";
import { BLOB_TTL_SEC } from "./compile/pointer.ts";
import type { DatasetRepo } from "./datasets.ts";
import type { ActionDatasetInfo } from "./model/action-cond.ts";

/*
 * Static lists for the inspectors that compare a value with a list (cookie, action). A dynamic list
 * is mirrored by the inspector over the keeper protocol; a static one lives in the controller
 * database and travels with the generation: its body goes to the internal Redis as a blob
 * (waf.blob.<hex>), and the manifest carries only name -> sha256.
 */

export interface ListInfo extends ActionDatasetInfo {
  id: string;
}

/* The lists of a space: the catalog, and the entries of a static list. */
export interface ListSource {
  catalog(spaceId: string): Promise<ListInfo[]>;
  entries(id: string): Promise<string[]>;
}

export function listSourceOf(datasets: DatasetRepo): ListSource {
  return {
    async catalog(spaceId) {
      return (await datasets.list(spaceId)).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        kind: row.kind,
        active: row.active,
        hash: row.hash === true,
      }));
    },
    async entries(id) {
      const rows = await datasets.listAddresses(id);

      return Array.isArray(rows) ? rows.map((row) => row.address) : [];
    },
  };
}

/* Where the bodies go before the generation that names them: the internal Redis. */
export interface BlobWriter {
  setNxExpireMany(
    items: { key: string; value: Buffer }[],
    ttlSec: number,
  ): Promise<{ wrote: number; reused: number }>;
}

export interface Blob {
  key: string;
  value: Buffer;
}

/* The body of a static list: its values sorted, one per line. */
export function listBlob(values: string[]): Buffer {
  const sorted = [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))].sort();

  return Buffer.from(sorted.length === 0 ? "" : `${sorted.join("\n")}\n`, "utf8");
}

/* The static lists among the named ones, with their bodies: name -> sha256, and the blobs. */
export async function packStaticLists(
  names: Iterable<string>,
  catalog: ListInfo[],
  source: ListSource,
): Promise<{ lists: Record<string, string>; blobs: Blob[] }> {
  const lists: Record<string, string> = {};
  const blobs: Blob[] = [];

  for (const name of [...new Set(names)].sort()) {
    const info = catalog.find((row) => row.name === name);

    if (info === undefined || info.active) {
      continue;
    }

    const value = listBlob(await source.entries(info.id));
    const hash = `sha256:${createHash("sha256").update(value).digest("hex")}`;

    lists[name] = hash;
    blobs.push({ key: blobKey(hash), value });
  }

  return { lists, blobs };
}

/*
 * The lists part of a config_hash, after the profiles and before the settings: "list" NUL name
 * NUL hash NUL per list, by name. No lists add nothing, so older generations keep their hash.
 */
export function hashListHashes(digest: Hash, lists: Record<string, string> = {}): void {
  for (const name of Object.keys(lists).sort()) {
    digest.update("list");
    digest.update("\0");
    digest.update(name);
    digest.update("\0");
    digest.update(lists[name]);
    digest.update("\0");
  }
}

/*
 * Put the bodies before the generation that names them: the inspector reads them as soon as the
 * manifest points to them. The answer is the error for the caller, or null.
 */
export async function putListBlobs(
  writer: BlobWriter | null,
  blobs: Blob[],
): Promise<{ error: "blobs_unavailable"; detail: string } | null> {
  if (blobs.length === 0) {
    return null;
  }

  if (writer === null) {
    return {
      error: "blobs_unavailable",
      detail: "static lists travel through the internal Redis, and it is not configured",
    };
  }

  try {
    await writer.setNxExpireMany(blobs, BLOB_TTL_SEC);
  } catch (err) {
    return {
      error: "blobs_unavailable",
      detail: `the internal Redis did not take the lists: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return null;
}

export function listBlobKeys(lists: Record<string, string> | undefined): string[] {
  return [...new Set(Object.values(lists ?? {}).map((hash) => blobKey(hash)))];
}

/* The lists field of a manifest read back: {} when there is none, null when it is malformed. */
export function parseListHashes(raw: unknown): Record<string, string> | null {
  const lists: Record<string, string> = {};

  if (raw === undefined || raw === null) {
    return lists;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  for (const [name, hash] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof hash !== "string" || !hash.startsWith("sha256:")) {
      return null;
    }

    lists[name] = hash;
  }

  return lists;
}
