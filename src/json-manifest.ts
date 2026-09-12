import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import { renderProfileYaml, validateDoc } from "./json-profile-doc.ts";
import type { JsonProfileRepo } from "./json-profiles.ts";

/**
 * Поколение профилей контракта. Ключ и канон хеша те же, что у auth, captcha и
 * modsec -- docs/inspector-config-distribution.md. В файлах едет YAML профиля и
 * тексты спецификаций, на которые он ссылается; имена файлов читает загрузчик
 * инспектора.
 *
 * Манифест -- полный снимок, не дельта.
 */

export const JSON_KEY = "policy/json";
/** Имя процесса в каталоге инспекторов: чьи настройки едут в поколении. */
export const JSON_PROCESS = "json";
export const DEFAULT_PROFILE = "default";

/** Как файл схемы называется рядом с profile.yaml (config.SchemaFilePrefix). */
const SCHEMA_PREFIX = "schema-";

/*
 * Имя профиля становится именем каталога на ноде, поэтому подчёркивание в
 * начале разрешено намеренно: `_probe` -- зарезервированное имя пробы, и
 * держать его под управлением контроллера так же законно, как любой другой
 * профиль. Запрещено то, что ломает раскладку: пустое имя, точки и разделители
 * пути (их же проверяет разбор манифеста в инспекторе).
 */
const PROFILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const OBJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface JsonManifestFile {
  name: string;
  text: string;
}

export interface JsonManifestProfile {
  files: JsonManifestFile[];
}

export interface JsonManifest {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: Record<string, JsonManifestProfile>;
  /** Настройки процесса из каталога; в старых поколениях блока нет. */
  settings?: InspectorSettings;
}

export type JsonSendError =
  | "no_profiles"
  | "missing_default"
  | "invalid_profile_name"
  | "invalid_profile"
  | "schema_not_found"
  | "schema_empty"
  | "schema_name_invalid"
  | "kv_unavailable";

export interface JsonSendFailure {
  error: JsonSendError;
  profile?: string;
  detail?: string;
}

export function hashJsonProfiles(
  profiles: Record<string, JsonManifestProfile>,
  settings?: InspectorSettings,
): string {
  const digest = createHash("sha256");

  for (const name of Object.keys(profiles).sort()) {
    digest.update(name);
    digest.update("\0");

    for (const file of profiles[name].files) {
      digest.update(file.name);
      digest.update("\0");
      digest.update(file.text);
      digest.update("\0");
    }
  }

  hashInspectorSettings(digest, settings);

  return `sha256:${digest.digest("hex")}`;
}

export async function buildJsonManifest(
  repo: JsonProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
): Promise<{ manifest: JsonManifest } | JsonSendFailure> {
  const rows = await repo.list(spaceId);

  if (rows.length === 0) {
    return { error: "no_profiles" };
  }

  /*
   * Профиль default обязан быть: его требует разбор манифеста на ноде, и он же
   * применяется, когда маршрут не назвал профиля. Поколение без него инспектор
   * отвергнет целиком, и увидеть это можно будет только в пульсе.
   */
  if (!rows.some((row) => row.name === DEFAULT_PROFILE)) {
    return { error: "missing_default" };
  }

  const profiles: Record<string, JsonManifestProfile> = {};

  for (const row of rows) {
    if (!PROFILE_NAME.test(row.name)) {
      return { error: "invalid_profile_name", profile: row.name };
    }

    let doc;

    try {
      doc = validateDoc(row.doc);
    } catch (err) {
      return {
        error: "invalid_profile",
        profile: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    /*
     * Все документы профиля -- основной и те, что названы привязками. Порядок
     * устойчив, дубликаты сведены: одна и та же схема на двух привязках едет
     * одним файлом.
     */
    const wanted = [
      doc.schema.source,
      ...doc.bindings.map((b) => b.schema),
      ...(doc.frame.enabled ? doc.frame.bindings.map((b) => b.schema) : []),
    ].filter((id) => id !== "");

    const files: JsonManifestFile[] = [];
    const names = new Map<string, string>();
    const seen = new Set<string>();

    for (const id of wanted) {
      if (seen.has(id)) {
        continue;
      }

      seen.add(id);

      const object = await repo.schemaObject(id, spaceId);

      if (object === null) {
        return { error: "schema_not_found", profile: row.name, detail: id };
      }

      /*
       * Имя объекта становится именем файла на ноде, поэтому проверяется
       * здесь: "../" в имени -- это запись мимо каталога поколения.
       */
      if (!OBJECT_NAME.test(object.name)) {
        return { error: "schema_name_invalid", profile: row.name, detail: object.name };
      }

      if (object.text.trim() === "") {
        return { error: "schema_empty", profile: row.name, detail: object.name };
      }

      names.set(id, object.name);
      files.push({ name: SCHEMA_PREFIX + object.name, text: object.text });
    }

    let yaml: string;

    try {
      yaml = renderProfileYaml(row.name, doc, names);
    } catch (err) {
      return {
        error: "invalid_profile",
        profile: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    profiles[row.name] = { files: [{ name: "profile.yaml", text: yaml }, ...files] };
  }

  const settings = await settingsOf(spaceId, JSON_PROCESS);

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashJsonProfiles(profiles, settings),
      profiles,
      settings,
    },
  };
}

export function parseJsonManifest(value: unknown): JsonManifest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (row.v !== 1 || typeof row.config_hash !== "string") {
    return null;
  }

  const rev = typeof row.rev === "number" ? row.rev : 0;
  const src = row.profiles;

  if (typeof src !== "object" || src === null) {
    return null;
  }

  const profiles: Record<string, JsonManifestProfile> = {};

  for (const [name, raw] of Object.entries(src as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }

    const files = (raw as Record<string, unknown>).files;

    if (!Array.isArray(files)) {
      return null;
    }

    profiles[name] = {
      files: files.map((file) => ({
        name: String((file as JsonManifestFile).name ?? ""),
        text: String((file as JsonManifestFile).text ?? ""),
      })),
    };
  }

  const settings = parseInspectorSettings(row.settings);

  if (settings === null) {
    return null;
  }

  return {
    v: 1,
    rev,
    config_hash: row.config_hash,
    profiles,
    ...(settings === undefined ? {} : { settings }),
  };
}
