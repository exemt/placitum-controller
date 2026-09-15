import type { Pool } from "./db.ts";
import type { InspectorDecl } from "./model/waf-route.ts";

const DEFAULT_PROFILE = "default";

export type ActionTargets = Map<string, string[]>;

interface ProfileTargets {
  byProfile: Map<string, string[]>;
}

function push(map: Map<string, string[]>, profile: string, to: unknown): void {
  if (typeof to !== "string" || to === "") {
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
