/**
 * Pointer schema for nginx config pack in JetStream KV.
 * Blobs in Redis: template text (plaintext) + store objects (ciphertext).
 */

import { createHash } from "node:crypto";

import { BLOB_PREFIX } from "./pointer.ts";
import { sha256 } from "./zip.ts";

export const NGINX_PACK_KEY = "policy/nginx-pack";
export const NGINX_PACK_SUBJECT = "waf.desired.nginx";

export interface NginxStoreEntry {
  hash: string;
  type: string;
}

export interface NginxPackPointer {
  v: 1;
  kind: "nginx-pack";
  rev: number;
  sha256: string;
  prefix: string;
  config: string;
  store: Record<string, NginxStoreEntry>;
  /**
   * Страницы отказа: имя файла на ноде -> хеш тела. Как `files` у правил и в
   * отличие от `store`: страница не секрет, она уезжает клиенту, и ключ
   * контура для неё означал бы только, что её нельзя посмотреть в каталоге.
   */
  pages: Record<string, string>;
  blobs: number;
  wrote: number;
  reused: number;
  bytes: number;
}

export interface PackedNginx {
  sha256: string;
  config: string;
  store: Record<string, NginxStoreEntry>;
  pages: Record<string, string>;
  blobs: Map<string, Buffer>;
  bytes: number;
}

/** Объект содержимого в том виде, в каком он уезжает на ноду. */
export interface NginxPageFile {
  /** Имя файла в каталоге страниц ноды, оно же цель `pages:/<file>`. */
  file: string;
  /* Буфер, а не строка: содержимым бывает и картинка, и шрифт формы входа. */
  content: string | Buffer;
}

export function hashNginxTree(
  configHash: string,
  store: Record<string, NginxStoreEntry>,
  pages: Record<string, string> = {},
): string {
  const digest = createHash("sha256");

  digest.update("config");
  digest.update("\0");
  digest.update(configHash);
  digest.update("\0");

  const uuids = Object.keys(store).sort();
  for (const uuid of uuids) {
    digest.update(uuid);
    digest.update("\0");
    digest.update(store[uuid].hash);
    digest.update("\0");
  }

  // Секция отделена меткой: без неё страница с именем-uuid попадала бы в хеш
  // неотличимо от store-объекта.
  digest.update("pages");
  digest.update("\0");
  for (const name of Object.keys(pages).sort()) {
    digest.update(name);
    digest.update("\0");
    digest.update(pages[name]);
    digest.update("\0");
  }

  return `sha256:${digest.digest("hex")}`;
}

export function blobKey(hash: string): string {
  const hex = hash.startsWith("sha256:") ? hash.slice(7) : hash;
  return `${BLOB_PREFIX}${hex}`;
}

export function packNginx(
  configText: string,
  storeBlobs: { uuid: string; type: string; blob: Buffer }[],
  pageFiles: NginxPageFile[] = [],
): PackedNginx {
  const blobs = new Map<string, Buffer>();

  const configBuf = Buffer.from(configText, "utf-8");
  const configHash = sha256(configBuf);
  blobs.set(configHash, configBuf);

  const store: Record<string, NginxStoreEntry> = {};

  for (const obj of storeBlobs) {
    const hash = sha256(obj.blob);
    if (!blobs.has(hash)) {
      blobs.set(hash, obj.blob);
    }
    store[obj.uuid] = { hash, type: obj.type };
  }

  const pages: Record<string, string> = {};

  for (const page of pageFiles) {
    const buf = Buffer.isBuffer(page.content)
      ? page.content
      : Buffer.from(page.content, "utf-8");
    const hash = sha256(buf);
    if (!blobs.has(hash)) {
      blobs.set(hash, buf);
    }
    pages[page.file] = hash;
  }

  let bytes = 0;
  for (const buf of blobs.values()) {
    bytes += buf.length;
  }

  return {
    sha256: hashNginxTree(configHash, store, pages),
    config: configHash,
    store,
    pages,
    blobs,
    bytes,
  };
}

export function pointerOf(
  packed: PackedNginx,
  rev: number,
  wrote: number,
  reused: number,
): NginxPackPointer {
  return {
    v: 1,
    kind: "nginx-pack",
    rev,
    sha256: packed.sha256,
    prefix: BLOB_PREFIX,
    config: packed.config,
    store: packed.store,
    pages: packed.pages,
    blobs: packed.blobs.size,
    wrote,
    reused,
    bytes: packed.bytes,
  };
}

export function parseNginxPointer(input: unknown): NginxPackPointer | null {
  if (typeof input !== "object" || input === null) return null;

  const row = input as Record<string, unknown>;

  if (
    row.v !== 1 ||
    row.kind !== "nginx-pack" ||
    typeof row.rev !== "number" ||
    !Number.isInteger(row.rev) ||
    row.rev < 1 ||
    typeof row.sha256 !== "string" ||
    typeof row.prefix !== "string" ||
    typeof row.config !== "string" ||
    typeof row.store !== "object" ||
    row.store === null ||
    typeof row.blobs !== "number" ||
    typeof row.wrote !== "number" ||
    typeof row.reused !== "number" ||
    typeof row.bytes !== "number"
  ) {
    return null;
  }

  const store: Record<string, NginxStoreEntry> = {};
  for (const [uuid, entry] of Object.entries(row.store as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.hash !== "string" || typeof e.type !== "string") return null;
    store[uuid] = { hash: e.hash, type: e.type };
  }

  // Поколение, записанное до появления страниц, читается как поколение без
  // страниц: отсутствующий ключ -- не повод отвергнуть манифест ноды.
  const pages: Record<string, string> = {};
  if (row.pages !== undefined && row.pages !== null) {
    if (typeof row.pages !== "object") return null;
    for (const [name, hash] of Object.entries(row.pages as Record<string, unknown>)) {
      if (typeof hash !== "string" || !hash.startsWith("sha256:")) return null;
      pages[name] = hash;
    }
  }

  return {
    v: 1,
    kind: "nginx-pack",
    rev: row.rev,
    sha256: row.sha256,
    prefix: row.prefix,
    config: row.config,
    store,
    pages,
    blobs: row.blobs,
    wrote: row.wrote,
    reused: row.reused,
    bytes: row.bytes,
  };
}

export function jsonSendNginxPack(p: NginxPackPointer) {
  return {
    v: 1 as const,
    rev: p.rev,
    config_hash: p.sha256,
    store: Object.keys(p.store).length,
    pages: Object.keys(p.pages ?? {}).sort(),
  };
}
