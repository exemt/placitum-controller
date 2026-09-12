/*
 * Кого адресуют инспекторы: карта «объявленное имя -> имена адресатов».
 *
 * Профили отправителей лежат в своих таблицах, а маршруты зовут объявленные
 * имена, и связывает их пара (процесс, профиль) из реестра пространства.
 * Собрать это в одном месте нужно затем, чтобы `action-receivers.ts` мог
 * сверить адресатов с набором маршрута до рассылки конфига.
 *
 * Таблица профилей выбирается по имени процесса из каталога. Это соглашение, а
 * не схема: процесс `counter` хранит профили в `counter_profiles`, `modsec` --
 * в `rule_sets`, `ip` -- в `ip_profiles` с правилами отдельной таблицей,
 * `json`, `vlai`, `action`, `captcha` и `auth` -- документом профиля, у каждого
 * со своим разделом исходящих просьб. Процесс, которого здесь нет, просто не
 * проверяется: у `rewrite` исходящих действий нет вовсе, а молчаливо
 * додумывать чужую схему хуже, чем не проверять.
 */

import type { Pool } from "./db.ts";
import type { InspectorDecl } from "./model/waf-route.ts";

const DEFAULT_PROFILE = "default";

/** Имя объявления -> кого оно адресует. */
export type ActionTargets = Map<string, string[]>;

interface ProfileTargets {
  /** имя профиля -> адресаты его действий */
  byProfile: Map<string, string[]>;
}

function push(map: Map<string, string[]>, profile: string, to: unknown): void {
  if (typeof to !== "string" || to === "") {
    // Пустой адресат -- широковещание: доедет до всех поздних волн,
    // и проверять там нечего.
    return;
  }

  const list = map.get(profile);

  if (list === undefined) {
    map.set(profile, [to]);
    return;
  }

  if (!list.includes(to)) {
    list.push(to);
  }
}

/** Счётчик: `doc.request.outcomes[].to`. */
async function counterTargets(pool: Pool, space: string): Promise<ProfileTargets> {
  const rows = await pool.query(
    `select name, doc from counter_profiles where http_space_id = $1`,
    [space],
  );
  const byProfile = new Map<string, string[]>();

  for (const row of rows.rows as { name: string; doc: unknown }[]) {
    const doc = row.doc as { request?: { outcomes?: { to?: unknown }[] } } | null;

    for (const out of doc?.request?.outcomes ?? []) {
      push(byProfile, row.name, out?.to);
    }
  }

  return { byProfile };
}

/** Правила SecLang: набор правил и есть профиль, действия -- в `policy`. */
async function modsecTargets(pool: Pool, space: string): Promise<ProfileTargets> {
  const rows = await pool.query(
    `select name, policy from rule_sets where http_space_id = $1`,
    [space],
  );
  const byProfile = new Map<string, string[]>();

  for (const row of rows.rows as { name: string; policy: unknown }[]) {
    const policy = row.policy as { outcomes?: { to?: unknown }[] } | null;

    for (const out of policy?.outcomes ?? []) {
      push(byProfile, row.name, out?.to);
    }
  }

  return { byProfile };
}

/** Адрес: правила профиля лежат отдельной таблицей, адресат -- колонкой. */
async function ipTargets(pool: Pool, space: string): Promise<ProfileTargets> {
  const rows = await pool.query(
    `select p.name, r.to_inspector
       from ip_profile_rules r
       join ip_profiles p on p.id = r.ip_profile_id
      where p.http_space_id = $1`,
    [space],
  );
  const byProfile = new Map<string, string[]>();

  for (const row of rows.rows as { name: string; to_inspector: unknown }[]) {
    push(byProfile, row.name, row.to_inspector);
  }

  return { byProfile };
}

/** Контракт API: `doc.request|response|frame.outcomes[].to`. */
async function jsonTargets(pool: Pool, space: string): Promise<ProfileTargets> {
  const rows = await pool.query(
    `select name, doc from json_profiles where http_space_id = $1`,
    [space],
  );
  const byProfile = new Map<string, string[]>();

  type Section = { outcomes?: { to?: unknown }[] };

  for (const row of rows.rows as { name: string; doc: unknown }[]) {
    const doc = row.doc as
      | { request?: Section; response?: Section; frame?: Section }
      | null;

    for (const section of [doc?.request, doc?.response, doc?.frame]) {
      for (const out of section?.outcomes ?? []) {
        push(byProfile, row.name, out?.to);
      }
    }
  }

  return { byProfile };
}

/** Классификатор: `doc.outcomes[].to`. */
async function vlaiTargets(pool: Pool, space: string): Promise<ProfileTargets> {
  const rows = await pool.query(
    `select name, doc from vlai_profiles where http_space_id = $1`,
    [space],
  );
  const byProfile = new Map<string, string[]>();

  for (const row of rows.rows as { name: string; doc: unknown }[]) {
    const doc = row.doc as { outcomes?: { to?: unknown }[] } | null;

    for (const out of doc?.outcomes ?? []) {
      push(byProfile, row.name, out?.to);
    }
  }

  return { byProfile };
}

/** Инспектор действий: `doc.rules[].actions[].to`. */
async function actionTargets(pool: Pool, space: string): Promise<ProfileTargets> {
  const rows = await pool.query(
    `select name, doc from action_profiles where http_space_id = $1`,
    [space],
  );
  const byProfile = new Map<string, string[]>();

  for (const row of rows.rows as { name: string; doc: unknown }[]) {
    const doc = row.doc as { rules?: { actions?: { to?: unknown }[] }[] } | null;

    for (const rule of doc?.rules ?? []) {
      for (const ask of rule?.actions ?? []) {
        push(byProfile, row.name, ask?.to);
      }
    }
  }

  return { byProfile };
}

/**
 * Инспектор куки: та же форма, что у инспектора действий, -- `to` у строк
 * правил. Строки с `list` адресата не имеют: это запись в набор.
 */
async function cookieTargets(pool: Pool, space: string): Promise<ProfileTargets> {
  const rows = await pool.query(
    `select name, doc from cookie_profiles where http_space_id = $1`,
    [space],
  );
  const byProfile = new Map<string, string[]>();

  for (const row of rows.rows as { name: string; doc: unknown }[]) {
    const doc = row.doc as { rules?: { actions?: { to?: unknown }[] }[] } | null;

    for (const rule of doc?.rules ?? []) {
      for (const ask of rule?.actions ?? []) {
        push(byProfile, row.name, ask?.to);
      }
    }
  }

  return { byProfile };
}

/**
 * Правила по событиям (капча, калитка): `doc.rules[].to` у строк с `do`.
 * Строки без глагола -- заряд корзины или запись в набор -- адресата не
 * имеют.
 */
function eventRuleTargets(table: string) {
  return async (pool: Pool, space: string): Promise<ProfileTargets> => {
    const rows = await pool.query(
      `select name, doc from ${table} where http_space_id = $1`,
      [space],
    );
    const byProfile = new Map<string, string[]>();

    for (const row of rows.rows as { name: string; doc: unknown }[]) {
      const doc = row.doc as { rules?: { do?: unknown; to?: unknown }[] } | null;

      for (const rule of doc?.rules ?? []) {
        if (typeof rule?.do !== "string" || rule.do === "") {
          continue;
        }

        push(byProfile, row.name, rule.to);
      }
    }

    return { byProfile };
  };
}

const LOADERS: Record<string, (pool: Pool, space: string) => Promise<ProfileTargets>> = {
  counter: counterTargets,
  modsec: modsecTargets,
  ip: ipTargets,
  json: jsonTargets,
  vlai: vlaiTargets,
  action: actionTargets,
  cookie: cookieTargets,
  captcha: eventRuleTargets("captcha_profiles"),
  auth: eventRuleTargets("auth_profiles"),
};

/**
 * Разложить профили отправителей по объявленным именам.
 *
 * `decls` -- реестр пространства (`http_spaces.waf.inspectors`): ключ карты и
 * есть имя, которым маршрут зовёт инспектора, а `process`/`profile` говорят,
 * чей профиль под этим именем работает. Имя без `process` ссылается на процесс,
 * названный так же; имя без `profile` работает на профиле по умолчанию.
 */
export async function loadActionTargets(
  pool: Pool,
  space: string,
  decls: Record<string, InspectorDecl>,
): Promise<ActionTargets> {
  const out: ActionTargets = new Map();
  const processes = new Set<string>();

  for (const [name, decl] of Object.entries(decls ?? {})) {
    processes.add(decl?.process ?? name);
  }

  const loaded = new Map<string, ProfileTargets>();

  for (const process of processes) {
    const loader = LOADERS[process];

    if (loader === undefined) {
      continue;
    }

    loaded.set(process, await loader(pool, space));
  }

  for (const [name, decl] of Object.entries(decls ?? {})) {
    const process = decl?.process ?? name;
    const targets = loaded.get(process);

    if (targets === undefined) {
      continue;
    }

    const list = targets.byProfile.get(decl?.profile ?? DEFAULT_PROFILE);

    if (list !== undefined && list.length > 0) {
      out.set(name, list);
    }
  }

  return out;
}
