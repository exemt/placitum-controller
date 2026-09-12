import {
  addressSearchSql,
  type AddressSearch,
} from "./address-query.ts";
import type { Pool } from "./db.ts";
import {
  isIpCountryType,
  type IpCountry,
  type IpCountryAddress,
} from "./model/ip-profile.ts";

interface CountryRow {
  id: string;
  http_space_id: string;
  code: string;
  type: string;
  description: string;
  size?: string | number;
  created_at: Date;
  updated_at: Date;
}

interface AddressRow {
  id: string;
  country_id: string;
  address: string;
}

function ofCountry(row: CountryRow): IpCountry {
  if (!isIpCountryType(row.type)) {
    throw new Error(`unknown country type "${row.type}"`);
  }

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    code: row.code,
    type: row.type,
    description: row.description,
    size: Number(row.size ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofAddress(row: AddressRow): IpCountryAddress {
  return {
    id: row.id,
    countryId: row.country_id,
    address: row.address,
  };
}

const META_COLS = `c.id, c.http_space_id, c.code, c.type, c.description,
                   (select count(*) from ip_country_addresses a where a.country_id = c.id) as size,
                   c.created_at, c.updated_at`;

export class IpCountryRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<IpCountry[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<CountryRow>(
            `select ${META_COLS} from ip_countries c
              order by c.code, c.type`,
          )
        : await this.pool.query<CountryRow>(
            `select ${META_COLS} from ip_countries c
              where c.http_space_id = $1
              order by c.code, c.type`,
            [httpSpaceId],
          );

    return rows.map(ofCountry);
  }

  async get(id: string): Promise<IpCountry | null> {
    const { rows } = await this.pool.query<CountryRow>(
      `select ${META_COLS} from ip_countries c where c.id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofCountry(rows[0]);
  }

  async addresses(countryId: string): Promise<IpCountryAddress[]> {
    const { rows } = await this.pool.query<AddressRow>(
      `select id, country_id, address
         from ip_country_addresses
        where country_id = $1
        order by address`,
      [countryId],
    );

    return rows.map(ofAddress);
  }

  async addressesPage(
    countryId: string,
    limit: number,
    offset: number,
    search: AddressSearch = { kind: "none" },
  ): Promise<{ rows: IpCountryAddress[]; total: number }> {
    const extra = addressSearchSql(search, "address", 2);
    const limitAt = 2 + extra.values.length;
    const counted = await this.pool.query<{ n: string }>(
      `select count(*)::bigint as n
         from ip_country_addresses
        where country_id = $1 ${extra.sql}`,
      [countryId, ...extra.values],
    );
    const total = Number(counted.rows[0]?.n ?? 0);

    if (total === 0) {
      return { rows: [], total: 0 };
    }

    const { rows } = await this.pool.query<AddressRow>(
      `select id, country_id, address
         from ip_country_addresses
        where country_id = $1 ${extra.sql}
        order by address
        limit $${limitAt} offset $${limitAt + 1}`,
      [countryId, ...extra.values, limit, offset],
    );

    return { rows: rows.map(ofAddress), total };
  }

  async addressTexts(countryId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ address: string }>(
      `select address
         from ip_country_addresses
        where country_id = $1
        order by address`,
      [countryId],
    );

    return rows.map((row) => row.address);
  }

  async codesInSpace(httpSpaceId: string, codes: string[]): Promise<string[]> {
    if (codes.length === 0) {
      return [];
    }

    const { rows } = await this.pool.query<{ code: string }>(
      `select distinct code from ip_countries
        where http_space_id = $1 and code = any($2::text[])`,
      [httpSpaceId, codes],
    );

    return rows.map((row) => row.code);
  }

  /** Есть ли в пространстве хоть один набор стран: каталог залит или пуст. */
  async filled(httpSpaceId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      `select exists(
                select 1 from ip_countries where http_space_id = $1
              ) as ok`,
      [httpSpaceId],
    );

    return rows[0]?.ok === true;
  }

  /**
   * Страна каждого адреса из пачки: вхождение в префиксы каталога.
   *
   * Ищется индексом `ip_country_addresses_net` (gist по `address::cidr`),
   * поэтому пачка на две сотни адресов -- это две сотни попаданий в индекс,
   * а не обход миллиона префиксов. Адрес приходит уже проверенным (см.
   * `geo-http.ts`): `::inet` на мусоре уронил бы весь запрос, а не свой
   * элемент.
   */
  async lookup(
    httpSpaceId: string,
    addresses: string[],
  ): Promise<{ addr: string; code: string; name: string }[]> {
    if (addresses.length === 0) {
      return [];
    }

    const { rows } = await this.pool.query<{
      addr: string;
      code: string;
      description: string;
    }>(
      `select q.addr, c.code, c.description
         from unnest($2::text[]) as q(addr)
         join lateral (
                select a.country_id
                  from ip_country_addresses a
                 where (a.address::cidr) >>= q.addr::inet
              ) hit on true
         join ip_countries c
           on c.id = hit.country_id
          and c.http_space_id = $1
        order by q.addr, c.code`,
      [httpSpaceId, addresses],
    );

    return rows.map((row) => ({
      addr: row.addr,
      code: row.code,
      name: row.description,
    }));
  }
}
