/*
 * SQL заливки GeoLite2 в каталог пространства.
 * UUID пространства не зашиваются: join по http_spaces.name.
 */

export type GeoKind = "country" | "asn";

export interface GeoTarget {
  catalog: string;
  addresses: string;
  key: string;
  keyCast: string;
  fk: string;
  seed: string;
}

export function targetOf(kind: GeoKind): GeoTarget {
  if (kind === "asn") {
    return {
      catalog: "ip_asns",
      addresses: "ip_asn_addresses",
      key: "asn",
      keyCast: "::bigint",
      fk: "asn_id",
      seed: "ip_asns.sql",
    };
  }

  return {
    catalog: "ip_countries",
    addresses: "ip_country_addresses",
    key: "code",
    keyCast: "",
    fk: "country_id",
    seed: "ip_countries.sql",
  };
}

export function applyBody(kind: GeoKind, spaceName: string): string {
  const t = targetOf(kind);
  const key = `g.code${t.keyCast}`;
  return `insert into ${t.catalog} (http_space_id, ${t.key}, type, description)
select s.id, ${key}, g.type, min(g.name)
  from http_spaces s
  join geo_raw g on true
 where s.name = '${spaceName}'
 group by s.id, ${key}, g.type
on conflict (http_space_id, ${t.key}, type)
do update set description = excluded.description, updated_at = now();
delete from ${t.catalog} c
 using http_spaces s
 where s.id = c.http_space_id
   and s.name = '${spaceName}'
   and not exists (
     select 1 from geo_raw g where ${key} = c.${t.key} and g.type = c.type
   );
delete from ${t.addresses} a
 using ${t.catalog} c
 join http_spaces s on s.id = c.http_space_id
 where a.${t.fk} = c.id and s.name = '${spaceName}';
insert into ${t.addresses} (${t.fk}, address)
select c.id, g.address
  from geo_raw g
  join http_spaces s on s.name = '${spaceName}'
  join ${t.catalog} c
    on c.http_space_id = s.id and c.${t.key} = ${key} and c.type = g.type
on conflict (${t.fk}, address) do nothing;
`;
}

export function loadSql(kind: GeoKind, spaceName: string, tsvPath: string): string {
  return `${header()}
\\copy geo_raw from '${tsvPath.replace(/'/g, "''")}'
${applyBody(kind, spaceName)}commit;
`;
}

export function seedSql(kind: GeoKind, spaceName: string, tsv: string): string {
  const body = tsv.replace(/\r\n/g, "\n").replace(/\s+$/, "") + "\n";
  return `${header()}
copy geo_raw from stdin;
${body}\\.
${applyBody(kind, spaceName)}commit;
`;
}

export function dumpSelect(kind: GeoKind, spaceName: string): string {
  const t = targetOf(kind);
  const code = t.keyCast === "" ? `c.${t.key}` : `c.${t.key}::text`;
  return `select ${code}, c.type, a.address, c.description
  from ${t.catalog} c
  join http_spaces s on s.id = c.http_space_id
  join ${t.addresses} a on a.${t.fk} = c.id
 where s.name = '${spaceName}'`;
}

function header(): string {
  return `begin;
set local statement_timeout = '30min';
create temp table geo_raw (
  code text not null,
  type text not null,
  address text not null,
  name text not null
);
`;
}
