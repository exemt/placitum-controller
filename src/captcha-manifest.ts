import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import { renderProfileYaml, validateDoc, validatePage } from "./captcha-profile-doc.ts";
import type { CaptchaProfileRepo } from "./captcha-profiles.ts";

/**
 * Поколение профилей капчи. Ключ и канон хеша те же, что у auth и modsec --
 * docs/inspector-config-distribution.md. В файлах едет YAML профиля и, если
 * выбрана, страница captcha.html; имена читает загрузчик инспектора.
 *
 * Манифест -- полный снимок, не дельта.
 */

export const CAPTCHA_KEY = "policy/captcha";
/** Имя процесса в каталоге инспекторов: чьи настройки едут в поколении. */
export const CAPTCHA_PROCESS = "captcha";
export const DEFAULT_PROFILE = "default";

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface CaptchaManifestFile {
  name: string;
  text: string;
}

export interface CaptchaManifestProfile {
  files: CaptchaManifestFile[];
}

export interface CaptchaManifest {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: Record<string, CaptchaManifestProfile>;
  /** Настройки процесса из каталога; в старых поколениях блока нет. */
  settings?: InspectorSettings;
}

export type CaptchaSendError =
  | "missing_page"
  | "invalid_page"
  | "page_not_html"
  | "no_profiles"
  | "missing_default"
  | "invalid_profile_name"
  | "invalid_profile"
  | "kv_unavailable";

export interface CaptchaSendFailure {
  error: CaptchaSendError;
  profile?: string;
  detail?: string;
}

export function hashCaptchaProfiles(
  profiles: Record<string, CaptchaManifestProfile>,
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

export async function buildCaptchaManifest(
  repo: CaptchaProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
): Promise<{ manifest: CaptchaManifest } | CaptchaSendFailure> {
  const rows = await repo.list(spaceId);

  if (rows.length === 0) {
    return { error: "no_profiles" };
  }

  if (!rows.some((row) => row.name === DEFAULT_PROFILE)) {
    return { error: "missing_default" };
  }

  const profiles: Record<string, CaptchaManifestProfile> = {};

  for (const row of rows) {
    if (!PROFILE_NAME.test(row.name)) {
      return { error: "invalid_profile_name", profile: row.name };
    }

    try {
      validateDoc(row.doc);
    } catch (err) {
      return {
        error: "invalid_profile",
        profile: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    const files: CaptchaManifestFile[] = [
      { name: "profile.yaml", text: renderProfileYaml(row.name, row.doc) },
    ];

    if (row.doc.page !== "") {
      const page = await repo.page(row.doc.page, spaceId);

      if (page === null) {
        return { error: "missing_page", profile: row.name, detail: row.doc.page };
      }

      if (page.type !== "html") {
        return { error: "page_not_html", profile: row.name, detail: page.name };
      }

      try {
        validatePage(page.text);
      } catch (err) {
        return {
          error: "invalid_page",
          profile: row.name,
          detail: err instanceof Error ? err.message : String(err),
        };
      }

      files.push({ name: "captcha.html", text: page.text });
    }

    profiles[row.name] = { files };
  }

  const settings = await settingsOf(spaceId, CAPTCHA_PROCESS);

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashCaptchaProfiles(profiles, settings),
      profiles,
      settings,
    },
  };
}

export function parseCaptchaManifest(value: unknown): CaptchaManifest | null {
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

  const profiles: Record<string, CaptchaManifestProfile> = {};

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
        name: String((file as CaptchaManifestFile).name ?? ""),
        text: String((file as CaptchaManifestFile).text ?? ""),
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
