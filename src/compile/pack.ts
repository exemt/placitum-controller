import { createHash } from "node:crypto";
import { basename } from "node:path";

import {
  hashInspectorSettings,
  type InspectorSettings,
} from "../inspector-settings.ts";
import { BLOB_PREFIX } from "./pointer.ts";
import type { RuleCompileSource } from "./rules.ts";
import { sha256 } from "./zip.ts";

/*
 * Операторы SecLang «из файла» и их сокращения. Один список с инспектором
 * (modsec/internal/desired/apply.go): собранное здесь он переписывает на
 * абсолютные пути, и оператор, которого нет в его списке, остался бы с
 * относительным путём и промахнулся бы мимо каталога профиля.
 */
const FROM_FILE = /@(?:pmFromFile|pmf|ipMatchFromFile|ipMatchF)\s+"?([^"\s]+)"?/g;

export function blobKey(hash: string): string {
  const hex = hash.startsWith("sha256:") ? hash.slice(7) : hash;
  return `${BLOB_PREFIX}${hex}`;
}

export function profileText(files: string[]): string {
  return files.length === 0 ? "" : `${files.join("\n")}\n`;
}

export function referencedDataFiles(text: string): string[] {
  const out: string[] = [];

  for (const match of text.matchAll(FROM_FILE)) {
    const name = basename(match[1] ?? "");
    if (name !== "" && !out.includes(name)) {
      out.push(name);
    }
  }

  return out;
}

export function hashTree(
  files: Record<string, string>,
  profiles: Record<string, string>,
  data: Record<string, string> = {},
  policies: Record<string, string> = {},
  settings?: InspectorSettings,
): string {
  const digest = createHash("sha256");

  for (const id of Object.keys(files).sort()) {
    digest.update(id);
    digest.update("\0");
    digest.update(files[id]);
    digest.update("\0");
  }

  for (const name of Object.keys(profiles).sort()) {
    digest.update(name);
    digest.update("\0");
    digest.update(profiles[name]);
    digest.update("\0");
  }

  for (const name of Object.keys(data).sort()) {
    digest.update(name);
    digest.update("\0");
    digest.update(data[name]);
    digest.update("\0");
  }

  /*
   * Политики -- в хвосте канона намеренно: пак без них хешируется ровно так
   * же, как хешировался раньше, и поколение, где политик нет, не переедет
   * на новый sha256 из-за одного лишь появления слота.
   */
  for (const name of Object.keys(policies).sort()) {
    digest.update(name);
    digest.update("\0");
    digest.update(policies[name]);
    digest.update("\0");
  }

  /*
   * Настройки процесса -- за политиками, и только когда блок есть: пак без
   * них хешируется как раньше (inspectors/modsec/internal/desired).
   */
  hashInspectorSettings(digest, settings);

  return `sha256:${digest.digest("hex")}`;
}

export interface PackedRules {
  sha256: string;
  files: Record<string, string>;
  profiles: Record<string, string>;
  data: Record<string, string>;
  /** Политика профиля: имя профиля -> хеш блоба с policy.yaml. */
  policies: Record<string, string>;
  /** Настройки процесса из каталога: в канон входят, телом не едут. */
  settings?: InspectorSettings;
  blobs: Map<string, Buffer>;
  bytes: number;
}

export function packSource(
  source: RuleCompileSource,
  settings?: InspectorSettings,
): PackedRules {
  const blobs = new Map<string, Buffer>();
  const files: Record<string, string> = {};
  const profiles: Record<string, string> = {};
  const data: Record<string, string> = {};
  const policies: Record<string, string> = {};
  const byName = new Map<string, string>();

  function put(text: string): string {
    const buf = Buffer.from(text);
    const hash = sha256(buf);
    if (!blobs.has(hash)) {
      blobs.set(hash, buf);
    }
    return hash;
  }

  for (const file of source.files) {
    files[file.id] = put(file.text);
    if (file.name !== undefined && file.name !== "") {
      byName.set(basename(file.name), file.id);
    }
  }

  /*
   * Файлы данных, привязанные к профилям. Секция data в паке общая -- на ноде
   * она раскладывается в каталог каждого профиля, -- поэтому одноимённые
   * файлы двух профилей обязаны совпадать телом: молча победивший последним
   * подменял бы список фраз одного профиля списком другого.
   */
  for (const profile of source.profiles) {
    for (const bound of profile.data ?? []) {
      const hash = put(bound.text);

      if (data[bound.name] !== undefined && data[bound.name] !== hash) {
        throw new Error(
          `compile: data file "${bound.name}" differs between profiles`,
        );
      }

      data[bound.name] = hash;
    }
  }

  for (const file of source.files) {
    for (const name of referencedDataFiles(file.text)) {
      if (data[name] !== undefined) {
        continue;
      }

      const id = byName.get(name);
      if (id === undefined) {
        throw new Error(
          `compile: *FromFile ${name} is not in the catalog and not bound to a profile`,
        );
      }

      data[name] = files[id];
    }
  }

  for (const profile of source.profiles) {
    profiles[profile.name] = put(profileText(profile.files));

    // Пустая политика файла не заводит: профиль, который никого не слушает и
    // никого не просит, -- обычное состояние, а не незаполненная форма.
    if (profile.policy !== undefined && profile.policy !== "") {
      policies[profile.name] = put(profile.policy);
    }
  }

  let bytes = 0;
  for (const buf of blobs.values()) {
    bytes += buf.length;
  }

  return {
    sha256: hashTree(files, profiles, data, policies, settings),
    files,
    profiles,
    data,
    policies,
    ...(settings === undefined ? {} : { settings }),
    blobs,
    bytes,
  };
}
