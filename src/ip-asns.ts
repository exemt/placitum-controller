import {
  addressSearchSql,
  type AddressSearch,
} from "./address-query.ts";
import type { Pool } from "./db.ts";
import { isIpAsnType, type IpAsn, type IpAsnAddress } from "./model/ip-profile.ts";

interface AsnRow {
  id: string;
  http_space_id: string;
  asn: string | number;
  type: string;
  description: string;
  size?: string | number;
  created_at: Date;
  updated_at: Date;
}

interface AddressRow {
  id: string;
  asn_id: string;
  address: string;
}

function asAsn(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`invalid asn "${value}"`);
  }

  return n;
}

function ofAsn(row: AsnRow): IpAsn {
  if (!isIpAsnType(row.type)) {
    throw new Error(`unknown asn type "${row.type}"`);
  }

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    asn: asAsn(row.asn),
    type: row.type,
    description: row.description,
    size: Number(row.size ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofAddress(row: AddressRow): IpAsnAddress {
  return {
    id: row.id,
    asnId: row.asn_id,
    address: row.address,
  };
}

const META_COLS = `c.id, c.http_space_id, c.asn, c.type, c.description,
                   coalesce(s.size, 0) as size,
                   c.created_at, c.updated_at`;

const META_FROM = `ip_asns c
   left join (
     select asn_id, count(*) as size
       from ip_asn_addresses
      group by asn_id
   ) s on s.asn_id = c.id`;

export class IpAsnRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<IpAsn[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<AsnRow>(
            `select ${META_COLS} from ${META_FROM}
              order by c.asn, c.type`,
          )
        : await this.pool.query<AsnRow>(
            `select ${META_COLS} from ${META_FROM}
              where c.http_space_id = $1
              order by c.asn, c.type`,
            [httpSpaceId],
          );

    return rows.map(ofAsn);
  }

  async get(id: string): Promise<IpAsn | null> {
    const { rows } = await this.pool.query<AsnRow>(
      `select c.id, c.http_space_id, c.asn, c.type, c.description,
              (select count(*) from ip_asn_addresses a where a.asn_id = c.id) as size,
              c.created_at, c.updated_at
         from ip_asns c
        where c.id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofAsn(rows[0]);
  }

  async addresses(asnId: string): Promise<IpAsnAddress[]> {
    const { rows } = await this.pool.query<AddressRow>(
      `select id, asn_id, address
         from ip_asn_addresses
        where asn_id = $1
        order by address`,
      [asnId],
    );

    return rows.map(ofAddress);
  }

  async addressesPage(
    asnId: string,
    limit: number,
    offset: number,
    search: AddressSearch = { kind: "none" },
  ): Promise<{ rows: IpAsnAddress[]; total: number }> {
    const extra = addressSearchSql(search, "address", 2);
    const limitAt = 2 + extra.values.length;
    const counted = await this.pool.query<{ n: string }>(
      `select count(*)::bigint as n
         from ip_asn_addresses
        where asn_id = $1 ${extra.sql}`,
      [asnId, ...extra.values],
    );
    const total = Number(counted.rows[0]?.n ?? 0);

    if (total === 0) {
      return { rows: [], total: 0 };
    }

    const { rows } = await this.pool.query<AddressRow>(
      `select id, asn_id, address
         from ip_asn_addresses
        where asn_id = $1 ${extra.sql}
        order by address
        limit $${limitAt} offset $${limitAt + 1}`,
      [asnId, ...extra.values, limit, offset],
    );

    return { rows: rows.map(ofAddress), total };
  }

  async addressTexts(asnId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ address: string }>(
      `select address
         from ip_asn_addresses
        where asn_id = $1
        order by address`,
      [asnId],
    );

    return rows.map((row) => row.address);
  }

  async asnsInSpace(httpSpaceId: string, asns: number[]): Promise<number[]> {
    if (asns.length === 0) {
      return [];
    }

    const { rows } = await this.pool.query<{ asn: string | number }>(
      `select distinct asn from ip_asns
        where http_space_id = $1 and asn = any($2::bigint[])`,
      [httpSpaceId, asns],
    );

    return rows.map((row) => asAsn(row.asn));
  }

  async filled(httpSpaceId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      `select exists(
                select 1 from ip_asns where http_space_id = $1
              ) as ok`,
      [httpSpaceId],
    );

    return rows[0]?.ok === true;
  }

  async lookup(
    httpSpaceId: string,
    addresses: string[],
  ): Promise<{ addr: string; asn: number; name: string }[]> {
    if (addresses.length === 0) {
      return [];
    }

    const { rows } = await this.pool.query<{
      addr: string;
      asn: string | number;
      description: string;
    }>(
      `select q.addr, c.asn, c.description
         from unnest($2::text[]) as q(addr)
         join lateral (
                select a.asn_id
                  from ip_asn_addresses a
                 where (a.address::cidr) >>= q.addr::inet
              ) hit on true
         join ip_asns c
           on c.id = hit.asn_id
          and c.http_space_id = $1
        order by q.addr, c.asn`,
      [httpSpaceId, addresses],
    );

    return rows.map((row) => ({
      addr: row.addr,
      asn: asAsn(row.asn),
      name: row.description,
    }));
  }
}
