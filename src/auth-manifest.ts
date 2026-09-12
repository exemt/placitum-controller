import { createHash } from "node:crypto";

import { validateDoc } from "./auth-profile-doc.ts";
import { renderProfileYaml } from "./auth-profile-doc.ts";
import type { AuthProfileRepo } from "./auth-profiles.ts";
import {
  renderSourceYaml,
  renderUsersYaml,
  validateLoginPage,
  validateSourceDoc,
} from "./auth-source-doc.ts";
import type { AuthSourceRepo } from "./auth-sources.ts";
import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
  type InspectorSettingsSource,
} from "./inspector-settings.ts";

/**
 * Поколение источников и профилей калитки. Ключ и канон хеша те же, что у
 * modsec, — docs/inspector-config-distribution.md. Отличий два: в файлах едет
 * YAML, а не SecLang, и карт две — sources и profiles (манифест v2), каждая
 * раскладывается инспектором в свой подкаталог поколения.
 *
 * Манифест — полный снимок, не дельта. Источник или профиль, которого в нём
 * нет, на ноде исчезает: иначе удалённый в UX продолжал бы пускать людей.
 */

export const AUTH_KEY = "policy/auth";
/** Имя процесса в каталоге инспекторов: чьи настройки едут в поколении. */
export const AUTH_PROCESS = "auth";
export const DEFAULT_PROFILE = "default";

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface AuthManifestFile {
  name: string;
  text: string;
}

export interface AuthManifestEntry {
  files: AuthManifestFile[];
}

export interface AuthManifest {
  v: 2;
  rev: number;
  config_hash: string;
  sources: Record<string, AuthManifestEntry>;
  profiles: Record<string, AuthManifestEntry>;
  /** Настройки процесса из каталога; в старых поколениях блока нет. */
  settings?: InspectorSettings;
}

export type AuthSendError =
  | "missing_login_page"
  | "invalid_login_page"
  | "login_page_not_html"
  | "no_profiles"
  | "missing_default"
  | "invalid_source_name"
  | "invalid_source"
  | "invalid_profile_name"
  | "invalid_profile"
  | "missing_user_set"
  | "unknown_source"
  | "unknown_identity_from"
  | "invalid_users"
  | "kv_unavailable";

export interface AuthSendFailure {
  error: AuthSendError;
  source?: string;
  profile?: string;
  detail?: string;
}

/*
 * Канон хеша — конкатенация UTF-8, не JSON: экранирование `<` и `&` разъедется
 * между Node и Go, а сравнивать хеши обязаны обе стороны. Секции в жёстком
 * порядке (sources, затем profiles), внутри — имена по алфавиту.
 */
export function hashAuthManifest(
  sources: Record<string, AuthManifestEntry>,
  profiles: Record<string, AuthManifestEntry>,
  settings?: InspectorSettings,
): string {
  const digest = createHash("sha256");

  for (const [label, entries] of [
    ["sources", sources],
    ["profiles", profiles],
  ] as const) {
    digest.update(label);
    digest.update("\0");

    for (const name of Object.keys(entries).sort()) {
      digest.update(name);
      digest.update("\0");

      for (const file of entries[name].files) {
        digest.update(file.name);
        digest.update("\0");
        digest.update(file.text);
        digest.update("\0");
      }
    }
  }

  hashInspectorSettings(digest, settings);

  return `sha256:${digest.digest("hex")}`;
}

/*
 * build собирает поколение из базы. Проверка идёт до печати: поколение, из-за
 * которого инспектор не поднимется, лучше не выпускать вовсе, чем разбирать
 * потом по apply_failed в пульсе.
 */
export async function buildAuthManifest(
  sourcesRepo: AuthSourceRepo,
  profilesRepo: AuthProfileRepo,
  spaceId: string,
  rev: number,
  settingsOf: InspectorSettingsSource,
): Promise<{ manifest: AuthManifest } | AuthSendFailure> {
  const sourceRows = await sourcesRepo.list(spaceId);
  const profileRows = await profilesRepo.list(spaceId);

  if (profileRows.length === 0) {
    return { error: "no_profiles" };
  }

  if (!profileRows.some((row) => row.name === DEFAULT_PROFILE)) {
    return { error: "missing_default" };
  }

  const sourceNames = new Set(sourceRows.map((row) => row.name));

  /* Ссылки обязаны разрешаться внутри поколения. */
  for (const row of profileRows) {
    if (row.doc.source !== "" && !sourceNames.has(row.doc.source)) {
      return { error: "unknown_source", profile: row.name, detail: row.doc.source };
    }
  }

  for (const row of sourceRows) {
    if (row.doc.identity.from !== "" && !sourceNames.has(row.doc.identity.from)) {
      return {
        error: "unknown_identity_from",
        source: row.name,
        detail: row.doc.identity.from,
      };
    }
  }

  const sources: Record<string, AuthManifestEntry> = {};
  const sets = new Map<string, string[] | null>();

  for (const row of sourceRows) {
    if (!NAME.test(row.name)) {
      return { error: "invalid_source_name", source: row.name };
    }

    try {
      validateSourceDoc(row.doc);
    } catch (err) {
      return {
        error: "invalid_source",
        source: row.name,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    const files: AuthManifestFile[] = [
      { name: "source.yaml", text: renderSourceYaml(row.name, row.doc) },
    ];

    /*
     * Своя форма входа уезжает телом, а не ссылкой: инспектор и форма про
     * каталог контроллера не знают, у них есть каталог источника на диске.
     */
    if (row.doc.login.page !== "") {
      const page = await sourcesRepo.loginPage(row.doc.login.page, spaceId);

      if (page === null) {
        return {
          error: "missing_login_page",
          source: row.name,
          detail: row.doc.login.page,
        };
      }

      if (page.type !== "html") {
        return {
          error: "login_page_not_html",
          source: row.name,
          detail: page.name,
        };
      }

      try {
        validateLoginPage(page.text);
      } catch (err) {
        return {
          error: "invalid_login_page",
          source: row.name,
          detail: err instanceof Error ? err.message : String(err),
        };
      }

      files.push({ name: "login.html", text: page.text });
    }

    /*
     * Публичный ключ проверки JWT -- тоже файлом рядом с source.yaml: там
     * его ищет key_file. Секрет HMAC в поколение не попадает по построению
     * -- он из окружения инспектора.
     */
    if (row.doc.provider === "jwt" && row.doc.providers.jwt !== null &&
      row.doc.providers.jwt.verify.key !== "") {
      files.push({ name: "jwt.key", text: row.doc.providers.jwt.verify.key });
    }

    /*
     * Набор пользователей нужен local (пароли) и code/totp (секреты): едет
     * файлом users.yaml рядом с источником.
     */
    const setName =
      row.doc.provider === "local"
        ? (row.doc.providers.local?.users ?? "")
        : row.doc.provider === "code" && row.doc.providers.code?.kind === "totp"
          ? row.doc.providers.code.users
          : "";

    if (setName !== "") {
      if (!sets.has(setName)) {
        sets.set(setName, await sourcesRepo.usersByName(spaceId, setName));
      }

      const lines = sets.get(setName) ?? null;

      if (lines === null) {
        return {
          error: "missing_user_set",
          source: row.name,
          detail: setName,
        };
      }

      /*
       * Разбор строк здесь, а не только при вводе: список правят и мимо формы
       * калитки -- импортом файла, через API, соседним сервисом. Мусор обязан
       * остановить рассылку, а не доехать до ноды битым users.yaml.
       */
      try {
        files.push({ name: "users.yaml", text: renderUsersYaml(lines) });
      } catch (err) {
        return {
          error: "invalid_users",
          source: row.name,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }

    sources[row.name] = { files };
  }

  const profiles: Record<string, AuthManifestEntry> = {};

  for (const row of profileRows) {
    if (!NAME.test(row.name)) {
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

    profiles[row.name] = {
      files: [{ name: "profile.yaml", text: renderProfileYaml(row.name, row.doc) }],
    };
  }

  const settings = await settingsOf(spaceId, AUTH_PROCESS);

  return {
    manifest: {
      v: 2,
      rev,
      config_hash: hashAuthManifest(sources, profiles, settings),
      sources,
      profiles,
      settings,
    },
  };
}

/* Разбор того, что лежит в KV: чужой формат туда попасть не должен, но
 * проверять всё равно надо -- ключ общий на контур. */
export function parseAuthManifest(value: unknown): AuthManifest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (row.v !== 2 || typeof row.config_hash !== "string") {
    return null;
  }

  const rev = typeof row.rev === "number" ? row.rev : 0;

  const section = (raw: unknown): Record<string, AuthManifestEntry> | null => {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }

    const out: Record<string, AuthManifestEntry> = {};

    for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const files = (entry as Record<string, unknown>).files;

      if (!Array.isArray(files)) {
        return null;
      }

      out[name] = {
        files: files.map((file) => ({
          name: String((file as AuthManifestFile).name ?? ""),
          text: String((file as AuthManifestFile).text ?? ""),
        })),
      };
    }

    return out;
  };

  const sources = section(row.sources ?? {});
  const profiles = section(row.profiles);

  if (sources === null || profiles === null) {
    return null;
  }

  const settings = parseInspectorSettings(row.settings);

  if (settings === null) {
    return null;
  }

  return {
    v: 2,
    rev,
    config_hash: row.config_hash,
    sources,
    profiles,
    ...(settings === undefined ? {} : { settings }),
  };
}
