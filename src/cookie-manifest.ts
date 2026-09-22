import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import { blobKey } from "./compile/pack.ts";
import { renderProfileYaml, staticLists, validateDoc } from "./cookie-profile-doc.ts";
import type { CookieProfileRepo } from "./cookie-profiles.ts";
import type { DatasetRepo } from "./datasets.ts";
import type { ActionDatasetInfo } from "./model/action-cond.ts";

export interface CookieListInfo extends ActionDatasetInfo {
  id: string;
}

/*
 * The lists of a space for cookie profiles: the catalog, and the entries of a static list. A rule
 * compares the value of its cookie with a static list too; the list travels to the inspector as a
 * blob in the internal Redis, and the generation carries only its hash.
 */
export interface CookieLists {
  catalog(spaceId: string): Promise<CookieListInfo[]>;
  entries(id: string): Promise<string[]>;
}

export function cookieListsOf(datasets: DatasetRepo): CookieLists {
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

/* The body of a static list blob: its values sorted, one per line. */
export function listBlob(values: string[]): Buffer {
  const sorted = [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))].sort();

  return Buffer.from(sorted.length === 0 ? "" : `${sorted.join("\n")}\n`, "utf8");
}

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

  for (const name of Object.keys(lists).sort()) {
    digest.update("list");
    digest.update("\0");
    digest.update(name);
    digest.update("\0");
    digest.update(lists[name]);
    digest.update("\0");
  }

  hashInspectorSettings(digest, settings);

  return `sha256:${digest.digest("hex")}`;
}

export interface CookieBuilt {
  manifest: CookieManifest;
  /* Blobs of the static lists, keyed as the internal Redis keeps them. */
  blobs: { key: string; value: Buffer }[];
}

export async function buildCookieManifest(
  repo: CookieProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
  listsOf: CookieLists,
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

  const lists: Record<string, string> = {};
  const blobs: { key: string; value: Buffer }[] = [];

  for (const name of [...wanted].sort()) {
    const info = datasets.find((row) => row.name === name);

    if (info === undefined) {
      continue;
    }

    const value = listBlob(await listsOf.entries(info.id));
    const hash = `sha256:${createHash("sha256").update(value).digest("hex")}`;

    lists[name] = hash;
    blobs.push({ key: blobKey(hash), value });
  }

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

export function cookieBlobKeys(manifest: CookieManifest): string[] {
  return [...new Set(Object.values(manifest.lists ?? {}).map((hash) => blobKey(hash)))];
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

  const lists: Record<string, string> = {};

  if (row.lists !== undefined && row.lists !== null) {
    if (typeof row.lists !== "object") {
      return null;
    }

    for (const [name, hash] of Object.entries(row.lists as Record<string, unknown>)) {
      if (typeof hash !== "string" || !hash.startsWith("sha256:")) {
        return null;
      }

      lists[name] = hash;
    }
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
