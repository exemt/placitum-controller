import { createHash } from "node:crypto";

import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

import {
  checkReferences,
  renderCountersYaml,
  renderProfileYaml,
  validateDoc,
  validateShared,
} from "./counter-profile-doc.ts";
import type { CounterProfileRepo } from "./counter-profiles.ts";

export const COUNTER_KEY = "policy/counter";
export const COUNTER_PROCESS = "counter";
export const DEFAULT_PROFILE = "default";
export const SHARED_PROFILE = "_shared";
export const COUNTERS_FILE = "counters.yaml";

const PROFILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export interface CounterManifestFile {
  name: string;
  text: string;
}

export interface CounterManifestProfile {
  files: CounterManifestFile[];
}

export interface CounterManifest {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: Record<string, CounterManifestProfile>;
  settings?: InspectorSettings;
}

export type CounterSendError =
  | "no_profiles"
  | "missing_default"
  | "missing_shared"
  | "invalid_profile_name"
  | "invalid_profile"
  | "invalid_shared"
  | "kv_unavailable";

export interface CounterSendFailure {
  error: CounterSendError;
  profile?: string;
  detail?: string;
}

export function hashCounterProfiles(
  profiles: Record<string, CounterManifestProfile>,
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

export async function buildCounterManifest(
  repo: CounterProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
): Promise<{ manifest: CounterManifest } | CounterSendFailure> {
  const rows = await repo.list(spaceId);

  if (rows.length === 0) {
    return { error: "no_profiles" };
  }

  if (!rows.some((row) => row.name === DEFAULT_PROFILE)) {
    return { error: "missing_default" };
  }

  let shared;

  try {
    shared = validateShared(await repo.shared(spaceId));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);

    return detail.includes("no counters declared")
      ? { error: "missing_shared" }
      : { error: "invalid_shared", detail };
  }

  const profiles: Record<string, CounterManifestProfile> = {
    [SHARED_PROFILE]: {
      files: [{ name: COUNTERS_FILE, text: renderCountersYaml(shared) }],
    },
  };

  for (const row of rows) {
    if (!PROFILE_NAME.test(row.name) || row.name === SHARED_PROFILE) {
      return { error: "invalid_profile_name", profile: row.name };
    }

    let yaml: string;

    try {
      const doc = validateDoc(row.doc);

      checkReferences(doc, shared);

      yaml = renderProfileYaml(row.name, doc);
    } catch (err) {
      return {
        error: "invalid_profile",
        profile: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    profiles[row.name] = { files: [{ name: "profile.yaml", text: yaml }] };
  }

  const settings = await settingsOf(spaceId, COUNTER_PROCESS);

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashCounterProfiles(profiles, settings),
      profiles,
      settings,
    },
  };
}

export function parseCounterManifest(value: unknown): CounterManifest | null {
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

  const profiles: Record<string, CounterManifestProfile> = {};

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
        name: String((file as CounterManifestFile).name ?? ""),
        text: String((file as CounterManifestFile).text ?? ""),
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
