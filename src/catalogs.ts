import type { Pool } from "./db.ts";
import type { BodyStore, DenyResponse, LogFormat } from "./model/http-space.ts";

export const DENY_TYPES = ["http", "grpc", "websocket"] as const;

export const DENY_PARAMS = ["ray", "addr", "scope", "subject", "retry"] as const;
export const STORE_DRIVERS = ["redis"] as const;
export const LOG_FORMAT_KINDS = ["nginx"] as const;

export const CATALOG_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

// page= of a deny response names a named location: nginx -t on the edge rejects anything else
// and the node drops the whole generation.
export const NAMED_LOCATION_RE = /^@\S+$/;

export function isNamedLocation(value: string): boolean {
  return NAMED_LOCATION_RE.test(value);
}

export interface DenyResponseInput {
  name: string;
  type: (typeof DENY_TYPES)[number];
  spec: DenyResponse["spec"];
}

export interface BodyStoreInput {
  name: string;
  driver: (typeof STORE_DRIVERS)[number];
  spec: Record<string, string | number | boolean>;
}

export interface LogFormatInput {
  name: string;
  kind: (typeof LOG_FORMAT_KINDS)[number];
  fields: string[];
  format: string;
}

function denyOf(r: Record<string, unknown>): DenyResponse {
  return {
    id: r.id as string,
    httpSpaceId: r.http_space_id as string,
    name: r.name as string,
    type: (r.type ?? "http") as DenyResponse["type"],
    spec: (r.spec ?? {}) as DenyResponse["spec"],
  };
}

function storeOf(r: Record<string, unknown>): BodyStore {
  return {
    id: r.id as string,
    httpSpaceId: r.http_space_id as string,
    name: r.name as string,
    driver: "redis",
    spec: (r.spec ?? {}) as BodyStore["spec"],
  };
}

function formatOf(r: Record<string, unknown>): LogFormat {
  return {
    id: r.id as string,
    httpSpaceId: r.http_space_id as string,
    name: r.name as string,
    kind: "nginx",
    fields: (r.fields ?? []) as string[],
    format: (r.format ?? "") as string,
  };
}

export class DenyResponseRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(space: string): Promise<DenyResponse[]> {
    const rows = await this.pool.query(
      `select * from deny_responses where http_space_id = $1 order by position, name`,
      [space],
    );
    return rows.rows.map(denyOf);
  }

  async create(space: string, input: DenyResponseInput): Promise<DenyResponse> {
    const rows = await this.pool.query(
      `insert into deny_responses (http_space_id, name, type, spec)
       values ($1, $2, $3, $4::jsonb) returning *`,
      [space, input.name, input.type, JSON.stringify(input.spec)],
    );
    return denyOf(rows.rows[0]);
  }

  async update(
    space: string,
    id: string,
    input: DenyResponseInput,
  ): Promise<DenyResponse | null> {
    const rows = await this.pool.query(
      `update deny_responses set name = $3, type = $4, spec = $5::jsonb
        where http_space_id = $1 and id = $2 returning *`,
      [space, id, input.name, input.type, JSON.stringify(input.spec)],
    );
    return rows.rows[0] === undefined ? null : denyOf(rows.rows[0]);
  }

  async remove(space: string, id: string): Promise<boolean> {
    const rows = await this.pool.query(
      `delete from deny_responses where http_space_id = $1 and id = $2 returning id`,
      [space, id],
    );
    return rows.rowCount === 1;
  }

  async referenceUses(space: string): Promise<Map<string, { at: string; kind: string }[]>> {
    const { rows } = await this.pool.query<{ kind: string; at: string; resp: string }>(
      `select distinct kind, at, resp from (
         select 'ip_profile' as kind, p.name as at, r.response as resp
           from ip_profile_rules r
           join ip_profiles p on p.id = r.ip_profile_id
          where p.http_space_id = $1 and r.response <> ''
         union all
         select 'auth', a.name,
                coalesce(a.doc #>> '{gate,deny_response}',
                         a.doc #>> '{gate,denyResponse}', 'auth_required')
           from auth_profiles a
          where a.http_space_id = $1
         union all
         select 'auth', a.name,
                coalesce(a.doc #>> '{gate,forbidden_response}',
                         a.doc #>> '{gate,forbiddenResponse}', 'auth_forbidden')
           from auth_profiles a
          where a.http_space_id = $1
            and jsonb_array_length(coalesce(a.doc #> '{gate,groups}', '[]'::jsonb)) > 0
         union all
         select 'captcha', c.name,
                coalesce(c.doc #>> '{gate,denyResponse}', 'captcha_required')
           from captcha_profiles c
          where c.http_space_id = $1
         union all
         select 'json', j.name,
                coalesce(j.doc #>> '{request,denyResponse}',
                         j.doc #>> '{request,deny_response}', 'json_invalid')
           from json_profiles j
          where j.http_space_id = $1
         union all
         select 'json', j.name,
                coalesce(j.doc #>> '{response,denyResponse}',
                         j.doc #>> '{response,deny_response}', 'json_response_invalid')
           from json_profiles j
          where j.http_space_id = $1
         union all
         select 'counter', c.name,
                coalesce(c.doc #>> '{request,denyResponse}',
                         c.doc #>> '{request,deny_response}', 'counter_limit')
           from counter_profiles c
          where c.http_space_id = $1
       ) t
       order by kind, at`,
      [space],
    );

    const out = new Map<string, { at: string; kind: string }[]>();
    for (const row of rows) {
      const list = out.get(row.resp) ?? [];
      list.push({ at: row.at, kind: row.kind });
      out.set(row.resp, list);
    }
    return out;
  }
}

export class BodyStoreRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(space: string): Promise<BodyStore[]> {
    const rows = await this.pool.query(
      `select * from body_stores where http_space_id = $1 order by position, name`,
      [space],
    );
    return rows.rows.map(storeOf);
  }

  async create(space: string, input: BodyStoreInput): Promise<BodyStore> {
    const rows = await this.pool.query(
      `insert into body_stores (http_space_id, name, driver, spec)
       values ($1, $2, $3, $4::jsonb) returning *`,
      [space, input.name, input.driver, JSON.stringify(input.spec)],
    );
    return storeOf(rows.rows[0]);
  }

  async update(space: string, id: string, input: BodyStoreInput): Promise<BodyStore | null> {
    const rows = await this.pool.query(
      `update body_stores set name = $3, driver = $4, spec = $5::jsonb
        where http_space_id = $1 and id = $2 returning *`,
      [space, id, input.name, input.driver, JSON.stringify(input.spec)],
    );
    return rows.rows[0] === undefined ? null : storeOf(rows.rows[0]);
  }

  async remove(space: string, id: string): Promise<boolean> {
    const rows = await this.pool.query(
      `delete from body_stores where http_space_id = $1 and id = $2 returning id`,
      [space, id],
    );
    return rows.rowCount === 1;
  }
}

export class LogFormatRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(space: string): Promise<LogFormat[]> {
    const rows = await this.pool.query(
      `select id, http_space_id, name, coalesce(kind, 'waf') as kind,
              fields, coalesce(format, '') as format
         from log_formats where http_space_id = $1 order by kind, name`,
      [space],
    );
    return rows.rows.map(formatOf);
  }

  async create(space: string, input: LogFormatInput): Promise<LogFormat> {
    const rows = await this.pool.query(
      `insert into log_formats (http_space_id, name, kind, fields, format)
       values ($1, $2, $3, $4::text[], $5)
       returning id, http_space_id, name, kind, fields, format`,
      [space, input.name, input.kind, input.fields, input.format],
    );
    return formatOf(rows.rows[0]);
  }

  async update(space: string, id: string, input: LogFormatInput): Promise<LogFormat | null> {
    const rows = await this.pool.query(
      `update log_formats set name = $3, kind = $4, fields = $5::text[], format = $6
        where http_space_id = $1 and id = $2
        returning id, http_space_id, name, kind, fields, format`,
      [space, id, input.name, input.kind, input.fields, input.format],
    );
    return rows.rows[0] === undefined ? null : formatOf(rows.rows[0]);
  }

  async remove(space: string, id: string): Promise<boolean> {
    const rows = await this.pool.query(
      `delete from log_formats where http_space_id = $1 and id = $2 returning id`,
      [space, id],
    );
    return rows.rowCount === 1;
  }
}
