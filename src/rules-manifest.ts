import { createHash } from "node:crypto";

/**
 * Поколение правил инспектора. Канон хеша — не JSON: экранирование `<`/`&`
 * разъедется между контроллером и Go. Спека —
 * docs/inspector-config-distribution.md.
 */

export const DESIRED_BUCKET = "WAF_DESIRED";
export const MODSEC_KEY = "policy/modsec";
/** Имя процесса в каталоге инспекторов: чьи настройки едут в паке правил. */
export const MODSEC_PROCESS = "modsec";
export const DEFAULT_PROFILE = "default";

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ManifestFile {
  name: string;
  text: string;
}

export interface ManifestProfile {
  files: ManifestFile[];
}

export interface RulesManifest {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: Record<string, ManifestProfile>;
}

export interface ProfileSource {
  name: string;
  files: { name: string; text: string }[];
}

export type RenderError =
  | "no_profiles"
  | "missing_default"
  | "empty_profile"
  | "invalid_profile_name";

export function emitFileName(position: number, name: string): string {
  const base = name.replace(/^.*[/\\]/, "");
  const withExt = base.toLowerCase().endsWith(".conf") ? base : `${base}.conf`;
  return `${String(position).padStart(2, "0")}-${withExt}`;
}

export function hashProfiles(
  profiles: Record<string, ManifestProfile>,
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

  return `sha256:${digest.digest("hex")}`;
}

export function renderManifest(
  sources: ProfileSource[],
  rev: number,
): { manifest: RulesManifest } | { error: RenderError } {
  if (sources.length === 0) {
    return { error: "no_profiles" };
  }

  const profiles: Record<string, ManifestProfile> = {};

  for (const source of sources) {
    const name = source.name.trim();

    if (!PROFILE_NAME.test(name)) {
      return { error: "invalid_profile_name" };
    }

    if (source.files.length === 0) {
      return { error: "empty_profile" };
    }

    profiles[name] = {
      files: source.files.map((file, index) => ({
        name: emitFileName(index, file.name),
        text: file.text,
      })),
    };
  }

  if (profiles[DEFAULT_PROFILE] === undefined) {
    return { error: "missing_default" };
  }

  return {
    manifest: {
      v: 1,
      rev,
      config_hash: hashProfiles(profiles),
      profiles,
    },
  };
}

export function parseManifest(input: unknown): RulesManifest | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const row = input as Record<string, unknown>;

  if (row.v !== 1 || typeof row.rev !== "number" || !Number.isInteger(row.rev)) {
    return null;
  }

  if (typeof row.config_hash !== "string" || row.config_hash.length === 0) {
    return null;
  }

  if (typeof row.profiles !== "object" || row.profiles === null) {
    return null;
  }

  const profiles: Record<string, ManifestProfile> = {};

  for (const [name, value] of Object.entries(
    row.profiles as Record<string, unknown>,
  )) {
    if (typeof value !== "object" || value === null) {
      return null;
    }

    const files = (value as { files?: unknown }).files;

    if (!Array.isArray(files) || files.length === 0) {
      return null;
    }

    const out: ManifestFile[] = [];

    for (const file of files) {
      if (typeof file !== "object" || file === null) {
        return null;
      }

      const item = file as { name?: unknown; text?: unknown };

      if (typeof item.name !== "string" || typeof item.text !== "string") {
        return null;
      }

      out.push({ name: item.name, text: item.text });
    }

    profiles[name] = { files: out };
  }

  return {
    v: 1,
    rev: row.rev,
    config_hash: row.config_hash,
    profiles,
  };
}

export function jsonManifest(row: RulesManifest) {
  return {
    v: row.v,
    rev: row.rev,
    config_hash: row.config_hash,
    profiles: row.profiles,
  };
}

export function jsonSend(row: RulesManifest) {
  return {
    v: row.v,
    rev: row.rev,
    config_hash: row.config_hash,
    profiles: Object.keys(row.profiles).sort(),
  };
}
