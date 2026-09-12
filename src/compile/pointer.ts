/**
 * Дерево правил: тела в Redis по sha256, на шине — хеши и ключи.
 * Watch KV — desired. PUB waf.desired.rules — «обновилось».
 */

import {
  parseInspectorSettings,
  type InspectorSettings,
} from "../inspector-settings.ts";

export const RULES_PACK_KEY = "policy/rules-pack";
export const RULES_PACK_SUBJECT = "waf.desired.rules";
export const BLOB_PREFIX = "waf.blob.";
/**
 * Срок блоба в Redis, секунд. Один на все поколения -- nginx, правила, ip:
 * решение владельца 11.09.2026 «у всего свой TTL, около пяти минут». Блоб
 * без срока копился бы до noeviction, а с TTL живёт ровно столько, сколько
 * его продлевает keep-alive контроллера (compile/keepalive.ts) -- то есть
 * пока указатель на него опубликован. Ноды, промахнувшиеся мимо истёкшего
 * блоба, повторяют забор сами, а не ждут следующего send.
 */
export const BLOB_TTL_SEC = 300;

export interface RulesPackPointer {
  v: 1;
  kind: "rules-pack";
  rev: number;
  sha256: string;
  prefix: string;
  files: Record<string, string>;
  profiles: Record<string, string>;
  data: Record<string, string>;
  /** Политика профиля: имя -> хеш блоба с policy.yaml. */
  policies?: Record<string, string>;
  /** Настройки процесса из каталога; в паках прошлых поколений блока нет. */
  settings?: InspectorSettings;
  blobs: number;
  wrote: number;
  reused: number;
  bytes: number;
}

export function jsonSendPack(row: RulesPackPointer) {
  return {
    v: 1 as const,
    rev: row.rev,
    config_hash: row.sha256,
    profiles: Object.keys(row.profiles).sort(),
  };
}

export function parsePointer(input: unknown): RulesPackPointer | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const row = input as Record<string, unknown>;

  if (
    row.v !== 1 ||
    row.kind !== "rules-pack" ||
    typeof row.rev !== "number" ||
    !Number.isInteger(row.rev) ||
    row.rev < 1 ||
    typeof row.sha256 !== "string" ||
    typeof row.prefix !== "string" ||
    typeof row.files !== "object" ||
    row.files === null ||
    typeof row.profiles !== "object" ||
    row.profiles === null ||
    typeof row.blobs !== "number" ||
    typeof row.wrote !== "number" ||
    typeof row.reused !== "number" ||
    typeof row.bytes !== "number"
  ) {
    return null;
  }

  const files = hashesOf(row.files);
  const profiles = hashesOf(row.profiles);
  const data =
    row.data === undefined || row.data === null
      ? {}
      : typeof row.data === "object"
        ? hashesOf(row.data)
        : null;

  if (files === null || profiles === null || data === null) {
    return null;
  }

  // Блока нет -- пак прошлого поколения; мусор в блоке -- не указатель.
  const settings = parseInspectorSettings(row.settings);

  if (settings === null) {
    return null;
  }

  return {
    v: 1,
    kind: "rules-pack",
    rev: row.rev,
    sha256: row.sha256,
    prefix: row.prefix,
    files,
    profiles,
    data,
    ...(settings === undefined ? {} : { settings }),
    blobs: row.blobs,
    wrote: row.wrote,
    reused: row.reused,
    bytes: row.bytes,
  };
}

function hashesOf(value: object): Record<string, string> | null {
  const out: Record<string, string> = {};

  for (const [key, hash] of Object.entries(value)) {
    if (typeof hash !== "string" || !hash.startsWith("sha256:")) {
      return null;
    }

    out[key] = hash;
  }

  return out;
}
