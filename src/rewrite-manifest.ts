import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import { renderProfileYaml, validateDoc } from "./rewrite-profile-doc.ts";
import type { RewriteProfileRepo } from "./rewrite-profiles.ts";

export const REWRITE_KEY = "policy/rewrite";
export const REWRITE_PROCESS = "rewrite";
export const DEFAULT_PROFILE = "default";

const PROFILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export interface RewriteManifestFile {
  name: string;
  text: string;
}

export interface RewriteManifestProfile {
  files: RewriteManifestFile[];
}

export interface RewriteManifest {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: Record<string, RewriteManifestProfile>;
  settings?: InspectorSettings;
}

export type RewriteSendError =
  | "no_profiles"
  | "missing_default"
  | "invalid_profile_name"
  | "invalid_profile"
  | "kv_unavailable";

export interface RewriteSendFailure {
  error: RewriteSendError;
  profile?: string;
  detail?: string;
}

export function hashRewriteProfiles(
  profiles: Record<string, RewriteManifestProfile>,
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

export async function buildRewriteManifest(
  repo: RewriteProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
): Promise<{ manifest: RewriteManifest } | RewriteSendFailure> {
  const rows = await repo.list(spaceId);

  if (rows.length === 0) {
    return { error: "no_profiles" };
  }

  if (!rows.some((row) => row.name === DEFAULT_PROFILE)) {
    return { error: "missing_default" };
  }

  const profiles: Record<string, RewriteManifestProfile> = {};

  for (const row of rows) {
    if (!PROFILE_NAME.test(row.name)) {
      return { error: "invalid_profile_name", profile: row.name };
    }

    let yaml: string;

    try {
      yaml = renderProfileYaml(row.name, validateDoc(row.doc));
    } catch (err) {
      return {
        error: "invalid_profile",
        profile: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    profiles[row.name] = { files: [{ name: "profile.yaml", text: yaml }] };
  }

  const settings = await settingsOf(spaceId, REWRITE_PROCESS);

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashRewriteProfiles(profiles, settings),
      profiles,
      settings,
    },
  };
}

export function parseRewriteManifest(value: unknown): RewriteManifest | null {
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

  const profiles: Record<string, RewriteManifestProfile> = {};

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
        name: String((file as RewriteManifestFile).name ?? ""),
        text: String((file as RewriteManifestFile).text ?? ""),
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
