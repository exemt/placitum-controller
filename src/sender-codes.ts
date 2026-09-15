import type { Pool } from "./db.ts";

export interface SenderCodeUse {
  inspector: string;
  profile: string;
}

export interface SenderCode {
  code: string;
  by: SenderCodeUse[];
}

export interface SenderCodeRow {
  inspector: string;
  profile: string;
  code: string;
}

function arrayOf(expr: string): string {
  return `case when jsonb_typeof(${expr}) = 'array' then ${expr} else '[]'::jsonb end`;
}

function outcomesOf(column: string, sections: readonly string[][]): string {
  return sections
    .map((path) => arrayOf(`${column}#>'{${path.join(",")}}'`))
    .join(" || ");
}

const SQL = `
with declared as (
    select 'ip'::text as inspector, p.name as profile, r.code as code
      from ip_profile_rules r
      join ip_profiles p on p.id = r.ip_profile_id
     where p.http_space_id = $1
       and r.action = 'request'
    union all
    select 'action', p.name, ask.value->>'code'
      from action_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as item,
           jsonb_array_elements(${arrayOf("item.value->'actions'")}) as ask
     where p.http_space_id = $1
    union all
    select 'cookie', p.name, ask.value->>'code'
      from cookie_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as item,
           jsonb_array_elements(${arrayOf("item.value->'actions'")}) as ask
     where p.http_space_id = $1
    union all
    select 'counter', p.name, o.value->>'code'
      from counter_profiles p,
           jsonb_array_elements(
               ${outcomesOf("p.doc", [
                 ["request", "outcomes"],
                 ["frame", "outcomes"],
               ])}
           ) as o
     where p.http_space_id = $1
    union all
    select 'json', p.name, o.value->>'code'
      from json_profiles p,
           jsonb_array_elements(
               ${outcomesOf("p.doc", [
                 ["request", "outcomes"],
                 ["response", "outcomes"],
                 ["frame", "outcomes"],
               ])}
           ) as o
     where p.http_space_id = $1
    union all
    select 'vlai', p.name, o.value->>'code'
      from vlai_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'outcomes'")}) as o
     where p.http_space_id = $1
    union all
    select 'modsec', s.name, o.value->>'code'
      from rule_sets s,
           jsonb_array_elements(${arrayOf("s.policy->'outcomes'")}) as o
     where s.http_space_id = $1
    union all
    select 'captcha', p.name, r.value->>'code'
      from captcha_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as r
     where p.http_space_id = $1
       and coalesce(r.value->>'do', '') <> ''
    union all
    select 'auth', p.name, r.value->>'code'
      from auth_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as r
     where p.http_space_id = $1
       and coalesce(r.value->>'do', '') <> ''
)
select distinct inspector, profile, code
  from declared
 where code is not null
   and code <> ''
 order by code, inspector, profile
`;

export function groupSenderCodes(rows: readonly SenderCodeRow[]): SenderCode[] {
  const out: SenderCode[] = [];
  const index = new Map<string, SenderCode>();

  for (const row of rows) {
    const found = index.get(row.code);
    const use = { inspector: row.inspector, profile: row.profile };

    if (found === undefined) {
      const item = { code: row.code, by: [use] };

      index.set(row.code, item);
      out.push(item);
      continue;
    }

    if (!found.by.some((by) => by.inspector === use.inspector && by.profile === use.profile)) {
      found.by.push(use);
    }
  }

  return out;
}

export async function loadSenderCodes(pool: Pool, httpSpaceId: string): Promise<SenderCode[]> {
  const { rows } = await pool.query<SenderCodeRow>(SQL, [httpSpaceId]);

  return groupSenderCodes(rows);
}
