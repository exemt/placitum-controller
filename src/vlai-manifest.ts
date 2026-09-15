import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import { renderProfileYaml, validateDoc } from "./vlai-profile-doc.ts";
import type { VlaiProfileRepo } from "./vlai-profiles.ts";

export const VLAI_KEY = "policy/vlai";
export const VLAI_PROCESS = "vlai";
export const DEFAULT_PROFILE = "default";

const PROFILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export interface VlaiManifestFile {
  name: string;
  text: string;
}

export interface VlaiManifestProfile {
  files: VlaiManifestFile[];
}

export interface VlaiManifest {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: Record<string, VlaiManifestProfile>;
  settings?: InspectorSettings;
}

export type VlaiSendError =
  | "no_profiles"
  | "missing_default"
  | "invalid_profile_name"
  | "invalid_profile"
  | "kv_unavailable";

export interface VlaiSendFailure {
  error: VlaiSendError;
  profile?: string;
  detail?: string;
}

export function hashVlaiProfiles(
  profiles: Record<string, VlaiManifestProfile>,
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

export async function buildVlaiManifest(
  repo: VlaiProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
): Promise<{ manifest: VlaiManifest } | VlaiSendFailure> {
  const rows = await repo.list(spaceId);

  if (rows.length === 0) {
    return { error: "no_profiles" };
  }

  if (!rows.some((row) => row.name === DEFAULT_PROFILE)) {
    return { error: "missing_default" };
  }

  const profiles: Record<string, VlaiManifestProfile> = {};

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

  const settings = await settingsOf(spaceId, VLAI_PROCESS);

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashVlaiProfiles(profiles, settings),
      profiles,
      settings,
    },
  };
}

export function parseVlaiManifest(value: unknown): VlaiManifest | null {
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

  const profiles: Record<string, VlaiManifestProfile> = {};

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
        name: String((file as VlaiManifestFile).name ?? ""),
        text: String((file as VlaiManifestFile).text ?? ""),
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
