import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import { renderProfileYaml, validateDoc } from "./cookie-profile-doc.ts";
import type { CookieProfileRepo } from "./cookie-profiles.ts";
import type { DatasetRepo } from "./datasets.ts";
import type { ActionDatasetInfo } from "./model/action-cond.ts";

/** Каталог наборов пространства на момент сборки: тип и хеш для условий. */
export type CookieDatasetsSource = (spaceId: string) => Promise<ActionDatasetInfo[]>;

/*
 * Условия профиля ссылаются на наборы по имени. Что это за набор -- список
 * ли, активен ли, адресный ли, хеширован ли, -- знает только каталог, и
 * проверка с печатью берут его снимок на каждый вызов.
 */
export function cookieDatasetsOf(datasets: DatasetRepo): CookieDatasetsSource {
  return async (spaceId) =>
    (await datasets.list(spaceId)).map((row) => ({
      name: row.name,
      type: row.type,
      kind: row.kind,
      active: row.active,
      hash: row.hash === true,
    }));
}

/**
 * Поколение профилей инспектора куки. Ключ и канон хеша те же, что у auth,
 * captcha и json -- docs/inspector-config-distribution.md. Файл у профиля один:
 * YAML, который на ноде ложится как <имя>.yaml плоского каталога.
 *
 * Манифест -- полный снимок, не дельта.
 */

export const COOKIE_KEY = "policy/cookie";
/** Имя процесса в каталоге инспекторов: чьи настройки едут в поколении. */
export const COOKIE_PROCESS = "cookie";
export const DEFAULT_PROFILE = "default";

const PROFILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export interface CookieManifestFile {
  name: string;
  text: string;
}

export interface CookieManifestProfile {
  files: CookieManifestFile[];
}

export interface CookieManifest {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: Record<string, CookieManifestProfile>;
  /** Настройки процесса из каталога; в старых поколениях блока нет. */
  settings?: InspectorSettings;
}

export type CookieSendError =
  | "no_profiles"
  | "missing_default"
  | "invalid_profile_name"
  | "invalid_profile"
  | "kv_unavailable";

export interface CookieSendFailure {
  error: CookieSendError;
  profile?: string;
  detail?: string;
}

export function hashCookieProfiles(
  profiles: Record<string, CookieManifestProfile>,
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

export async function buildCookieManifest(
  repo: CookieProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
  datasetsOf: CookieDatasetsSource,
): Promise<{ manifest: CookieManifest } | CookieSendFailure> {
  const rows = await repo.list(spaceId);
  const datasets = await datasetsOf(spaceId);

  if (rows.length === 0) {
    return { error: "no_profiles" };
  }

  /*
   * Профиль default обязан быть: его требует разбор манифеста на ноде, и он же
   * применяется, когда маршрут не назвал профиля.
   */
  if (!rows.some((row) => row.name === DEFAULT_PROFILE)) {
    return { error: "missing_default" };
  }

  const profiles: Record<string, CookieManifestProfile> = {};

  for (const row of rows) {
    if (!PROFILE_NAME.test(row.name)) {
      return { error: "invalid_profile_name", profile: row.name };
    }

    let yaml: string;

    try {
      yaml = renderProfileYaml(row.name, validateDoc(row.doc, datasets), datasets);
    } catch (err) {
      return {
        error: "invalid_profile",
        profile: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    profiles[row.name] = { files: [{ name: "profile.yaml", text: yaml }] };
  }

  const settings = await settingsOf(spaceId, COOKIE_PROCESS);

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashCookieProfiles(profiles, settings),
      profiles,
      settings,
    },
  };
}

export function parseCookieManifest(value: unknown): CookieManifest | null {
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

  const profiles: Record<string, CookieManifestProfile> = {};

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
        name: String((file as CookieManifestFile).name ?? ""),
        text: String((file as CookieManifestFile).text ?? ""),
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
