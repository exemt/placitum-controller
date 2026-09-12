-- Автономные системы -- тот же принцип, что страны: номер + семейство +
-- таблица префиксов. Заливка GeoLite2-ASN:
--   npm run load-geo -- --docker --dump
-- Дамп: schema/seed/ip_asns.sql; на пустой том — 019_ip_geo_seed.sh.

create table if not exists ip_asns (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    asn             bigint not null check (asn > 0),
    type            text not null check (type in ('v4', 'v6')),
    description     text not null default '',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, asn, type)
);

create index if not exists ip_asns_space on ip_asns (http_space_id);

create table if not exists ip_asn_addresses (
    id          uuid primary key default gen_random_uuid(),
    asn_id      uuid not null references ip_asns(id) on delete cascade,
    address     text not null,
    unique (asn_id, address)
);

create index if not exists ip_asn_addresses_asn on ip_asn_addresses (asn_id);
