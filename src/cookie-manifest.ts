import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import { renderProfileYaml, staticLists, validateDoc } from "./cookie-profile-doc.ts";
import type { CookieProfileRepo } from "./cookie-profiles.ts";
import {
  hashListHashes,
  packStaticLists,
  parseListHashes,
  type Blob,
  type ListSource,
} from "./static-lists.ts";

export const COOKIE_KEY = "policy/cookie";
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
  /* Static lists the rules compare with: name -> sha256 of the blob in the internal Redis. */
  lists?: Record<string, string>;
  settings?: InspectorSettings;
}

export type CookieSendError =
  | "no_profiles"
  | "missing_default"
  | "invalid_profile_name"
  | "invalid_profile"
  | "blobs_unavailable"
  | "kv_unavailable";

export interface CookieSendFailure {
  error: CookieSendError;
  profile?: string;
  detail?: string;
}

export function hashCookieProfiles(
  profiles: Record<string, CookieManifestProfile>,
  settings?: InspectorSettings,
  lists: Record<string, string> = {},
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

  hashListHashes(digest, lists);
  hashInspectorSettings(digest, settings);

  return `sha256:${digest.digest("hex")}`;
}

export interface CookieBuilt {
  manifest: CookieManifest;
  /* Bodies of the static lists, keyed as the internal Redis keeps them. */
  blobs: Blob[];
}

export async function buildCookieManifest(
  repo: CookieProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
  listsOf: ListSource,
): Promise<CookieBuilt | CookieSendFailure> {
  const rows = await repo.list(spaceId);
  const datasets = await listsOf.catalog(spaceId);
  const wanted = new Set<string>();

  if (rows.length === 0) {
    return { error: "no_profiles" };
  }

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
      const doc = validateDoc(row.doc, datasets);

      for (const name of staticLists(doc, datasets)) {
        wanted.add(name);
      }

      yaml = renderProfileYaml(row.name, doc, datasets);
    } catch (err) {
      return {
        error: "invalid_profile",
        profile: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    profiles[row.name] = { files: [{ name: "profile.yaml", text: yaml }] };
  }

  const { lists, blobs } = await packStaticLists(wanted, datasets, listsOf);
  const settings = await settingsOf(spaceId, COOKIE_PROCESS);

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashCookieProfiles(profiles, settings, lists),
      profiles,
      ...(Object.keys(lists).length > 0 ? { lists } : {}),
      settings,
    },
    blobs,
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

  const lists = parseListHashes(row.lists);

  if (lists === null) {
    return null;
  }

  return {
    v: 1,
    rev,
    config_hash: row.config_hash,
    profiles,
    ...(Object.keys(lists).length > 0 ? { lists } : {}),
    ...(settings === undefined ? {} : { settings }),
  };
}
