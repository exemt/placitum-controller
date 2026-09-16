import type { Pool } from "./db.ts";
import type { IpAsnRepo } from "./ip-asns.ts";
import type { IpCountryRepo } from "./ip-countries.ts";
import type {
  IpSet,
  IpSetList,
  IpSetMatch,
  IpSetMeta,
} from "./model/ip-profile.ts";

interface SetRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  inverse: boolean;
  countries: string[];
  asns: string[] | number[];
  exclude_countries: string[];
  exclude_asns: string[] | number[];
  lists?: string | number;
  live?: boolean;
  created_at: Date;
  updated_at: Date;
}

interface MemberRow {
  ip_set_id: string;
  dataset_id: string;
  name: string;
  type: string;
  active: boolean;
  exclude: boolean;
}

export interface IpSetMatchInput {
  lists: string[];
  countries: string[];
  asns: number[];
}

export interface IpSetInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  inverse: boolean;
  match: IpSetMatchInput;
  exclude: IpSetMatchInput;
}

export interface IpSetPatch {
  name?: string;
  description?: string;
  inverse?: boolean;
  match?: IpSetMatchInput;
  exclude?: IpSetMatchInput;
}

export type IpSetError =
  | "unknown_list"
  | "unknown_country"
  | "unknown_asn"
  | "empty_set"
  | "in_use";

export function emptyMatchInput(): IpSetMatchInput {
  return { lists: [], countries: [], asns: [] };
}

function asns(value: string[] | number[] | null | undefined): number[] {
  if (value === undefined || value === null) {
    return [];
  }

  return value.map((item) => {
    const n = typeof item === "number" ? item : Number(item);

    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`invalid asn "${item}"`);
    }

    return n;
  });
}

function ofList(row: MemberRow): IpSetList {
  return {
    datasetId: row.dataset_id,
    name: row.name,
    type: row.type,
    active: row.active,
  };
}

function ofMeta(row: SetRow): IpSetMeta {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    lists: Number(row.lists ?? 0),
    live: row.live === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofSet(row: SetRow, members: MemberRow[]): IpSet {
  const pick = (exclude: boolean): IpSetMatch => ({
    lists: members.filter((m) => m.exclude === exclude).map(ofList),
    countries: exclude ? (row.exclude_countries ?? []) : (row.countries ?? []),
    asns: asns(exclude ? row.exclude_asns : row.asns),
  });

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    inverse: row.inverse,
    ...pick(false),
    exclude: pick(true),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isEmpty(match: IpSetMatchInput): boolean {
  return (
    match.lists.length === 0 &&
    match.countries.length === 0 &&
    match.asns.length === 0
  );
}

const SELECT = `select s.id, s.http_space_id, s.name, s.description,
                       s.inverse, s.countries, s.asns,
                       s.exclude_countries, s.exclude_asns,
                       s.created_at, s.updated_at`;

const COUNTS = `(select count(*) from ip_set_lists l where l.ip_set_id = s.id) as lists,
                exists (select 1
                          from ip_set_lists l
                          join datasets d on d.id = l.dataset_id
                         where l.ip_set_id = s.id and d.active) as live`;

export class IpSetRepo {
  private readonly pool: Pool;
  private readonly countries: IpCountryRepo;
  private readonly asns: IpAsnRepo;

  constructor(pool: Pool, countries: IpCountryRepo, asns: IpAsnRepo) {
    this.pool = pool;
    this.countries = countries;
    this.asns = asns;
  }

  async list(httpSpaceId?: string): Promise<IpSetMeta[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<SetRow>(
            `${SELECT}, ${COUNTS} from ip_sets s order by s.name`,
          )
        : await this.pool.query<SetRow>(
            `${SELECT}, ${COUNTS} from ip_sets s
              where s.http_space_id = $1 order by s.name`,
            [httpSpaceId],
          );

    return rows.map(ofMeta);
  }

  async get(id: string): Promise<IpSet | null> {
    const { rows } = await this.pool.query<SetRow>(
      `${SELECT} from ip_sets s where s.id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    return ofSet(rows[0], await members(this.pool, [id]));
  }

  async insert(input: IpSetInsert): Promise<IpSet | IpSetError> {
    if (isEmpty(input.match)) {
      return "empty_set";
    }

    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const bad = await this.check(input.httpSpaceId, input.match, input.exclude);

      if (bad !== null) {
        await client.query("rollback");
        return bad;
      }

      const { rows } = await client.query<SetRow>(
        `insert into ip_sets (
           http_space_id, name, description, inverse,
           countries, asns, exclude_countries, exclude_asns
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, http_space_id, name, description, inverse,
                   countries, asns, exclude_countries, exclude_asns,
                   created_at, updated_at`,
        [
          input.httpSpaceId,
          input.name,
          input.description,
          input.inverse,
          input.match.countries,
          input.match.asns,
          input.exclude.countries,
          input.exclude.asns,
        ],
      );

      const row = rows[0];
      const wrote = await replaceLists(
        client,
        row.id,
        input.httpSpaceId,
        input.match.lists,
        input.exclude.lists,
      );

      if (wrote === "unknown_list") {
        await client.query("rollback");
        return "unknown_list";
      }

      await client.query("commit");

      return ofSet(row, wrote);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async update(id: string, patch: IpSetPatch): Promise<IpSet | IpSetError | null> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const current = await this.get(id);

      if (current === null) {
        await client.query("rollback");
        return null;
      }

      const match = patch.match ?? matchInputOf(current);
      const exclude = patch.exclude ?? matchInputOf(current.exclude);

      if (isEmpty(match)) {
        await client.query("rollback");
        return "empty_set";
      }

      const bad = await this.check(current.httpSpaceId, match, exclude);

      if (bad !== null) {
        await client.query("rollback");
        return bad;
      }

      const { rows } = await client.query<SetRow>(
        `update ip_sets set
           name              = coalesce($2, name),
           description       = coalesce($3, description),
           inverse           = $4,
           countries         = $5,
           asns              = $6,
           exclude_countries = $7,
           exclude_asns      = $8,
           updated_at        = now()
         where id = $1
         returning id, http_space_id, name, description, inverse,
                   countries, asns, exclude_countries, exclude_asns,
                   created_at, updated_at`,
        [
          id,
          patch.name ?? null,
          patch.description ?? null,
          patch.inverse ?? current.inverse,
          match.countries,
          match.asns,
          exclude.countries,
          exclude.asns,
        ],
      );

      const wrote = await replaceLists(
        client,
        id,
        rows[0].http_space_id,
        match.lists,
        exclude.lists,
      );

      if (wrote === "unknown_list") {
        await client.query("rollback");
        return "unknown_list";
      }

      await client.query("commit");

      return ofSet(rows[0], wrote);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async remove(id: string): Promise<true | "in_use" | null> {
    const { rows } = await this.pool.query<{ n: string }>(
      `select count(*) as n from ip_profile_rules where ip_set_id = $1`,
      [id],
    );

    if (Number(rows[0]?.n ?? 0) > 0) {
      return "in_use";
    }

    const { rowCount } = await this.pool.query(`delete from ip_sets where id = $1`, [
      id,
    ]);

    return rowCount === 0 ? null : true;
  }

  private async check(
    httpSpaceId: string,
    match: IpSetMatchInput,
    exclude: IpSetMatchInput,
  ): Promise<IpSetError | null> {
    const codes = [...new Set([...match.countries, ...exclude.countries])];

    if (codes.length !== 0) {
      const known = await this.countries.codesInSpace(httpSpaceId, codes);

      if (known.length !== codes.length) {
        return "unknown_country";
      }
    }

    const numbers = [...new Set([...match.asns, ...exclude.asns])];

    if (numbers.length !== 0) {
      const known = await this.asns.asnsInSpace(httpSpaceId, numbers);

      if (known.length !== numbers.length) {
        return "unknown_asn";
      }
    }

    return null;
  }
}

function matchInputOf(match: IpSetMatch): IpSetMatchInput {
  return {
    lists: match.lists.map((list) => list.datasetId),
    countries: [...match.countries],
    asns: [...match.asns],
  };
}

type Queryable = { query: Pool["query"] };

async function members(db: Queryable, setIds: string[]): Promise<MemberRow[]> {
  if (setIds.length === 0) {
    return [];
  }

  const { rows } = await db.query<MemberRow>(
    `select l.ip_set_id, l.dataset_id, d.name, d.type, d.active, l.exclude
       from ip_set_lists l
       join datasets d on d.id = l.dataset_id
      where l.ip_set_id = any($1::uuid[])
      order by l.exclude, l.position, d.name`,
    [setIds],
  );

  return rows;
}

async function replaceLists(
  db: Queryable,
  setId: string,
  httpSpaceId: string,
  lists: string[],
  excluded: string[],
): Promise<MemberRow[] | "unknown_list"> {
  await db.query(`delete from ip_set_lists where ip_set_id = $1`, [setId]);

  const wanted = [...new Set([...lists, ...excluded])];

  if (wanted.length !== 0) {
    const { rows } = await db.query<{ id: string }>(
      `select id from datasets
        where http_space_id = $1
          and id = any($2::uuid[])
          and kind = 'list'
          and type in ('ipv4', 'ip')`,
      [httpSpaceId, wanted],
    );

    if (rows.length !== wanted.length) {
      return "unknown_list";
    }
  }

  const rows: [string, boolean, number][] = [
    ...lists.map((id, i): [string, boolean, number] => [id, false, i]),
    ...excluded.map((id, i): [string, boolean, number] => [id, true, i]),
  ];

  for (const [datasetId, exclude, position] of rows) {
    await db.query(
      `insert into ip_set_lists (ip_set_id, dataset_id, exclude, position)
       values ($1, $2, $3, $4)
       on conflict (ip_set_id, dataset_id, exclude) do update
         set position = excluded.position`,
      [setId, datasetId, exclude, position],
    );
  }

  return members(db, [setId]);
}
