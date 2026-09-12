-- Профиль адреса собирает уже существующие datasets (ipv4/ip) и
-- именованные страны. Отдельные ip_list_files не нужны.
-- Страна -- почти статичный список: код + семейство + таблица префиксов.
-- Свежая база — три тестовые страны из inspectors/ip/data/geo.
-- Полная заливка GeoLite2: npm run load-geo -- --docker --dump
-- Дамп: schema/seed/ip_countries.sql; на пустой том — 019_ip_geo_seed.sh.

drop table if exists ip_profile_files;
drop table if exists ip_list_files;

create table if not exists ip_profile_lists (
    ip_profile_id  uuid not null references ip_profiles(id) on delete cascade,
    dataset_id     uuid not null references datasets(id) on delete restrict,
    side           text not null check (side in ('whitelist', 'blacklist')),
    position       integer not null default 0,
    unique (ip_profile_id, dataset_id, side)
);

create index if not exists ip_profile_lists_dataset on ip_profile_lists (dataset_id);

create table if not exists ip_countries (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    code            text not null,
    type            text not null check (type in ('v4', 'v6')),
    description     text not null default '',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, code, type)
);

create index if not exists ip_countries_space on ip_countries (http_space_id);

create table if not exists ip_country_addresses (
    id          uuid primary key default gen_random_uuid(),
    country_id  uuid not null references ip_countries(id) on delete cascade,
    address     text not null,
    unique (country_id, address)
);

create index if not exists ip_country_addresses_country on ip_country_addresses (country_id);

insert into ip_countries (http_space_id, code, type, description)
select s.id, x.code, x.type, x.description
  from http_spaces s
  cross join (values
    ('ru', 'v4', 'Тестовая выгрузка ru'),
    ('ru', 'v6', 'Тестовая выгрузка ru'),
    ('en', 'v4', 'Тестовая выгрузка en'),
    ('en', 'v6', 'Тестовая выгрузка en'),
    ('jp', 'v4', 'Тестовая выгрузка jp'),
    ('jp', 'v6', 'Тестовая выгрузка jp')
  ) as x(code, type, description)
 where s.name = 'default'
on conflict (http_space_id, code, type) do nothing;

insert into ip_country_addresses (country_id, address)
select c.id, a.address
  from ip_countries c
  join http_spaces s on s.id = c.http_space_id
  join (values
    ('ru', 'v4', '5.8.8.0/24'),
    ('ru', 'v4', '95.24.0.0/16'),
    ('ru', 'v6', '2a02:6b8::/32'),
    ('en', 'v4', '8.8.8.0/24'),
    ('en', 'v4', '1.1.1.0/24'),
    ('en', 'v6', '2606:4700:4700::/48'),
    ('jp', 'v4', '133.0.0.0/8'),
    ('jp', 'v4', '210.173.160.0/19'),
    ('jp', 'v6', '2400:2200::/24')
  ) as a(code, type, address)
    on a.code = c.code and a.type = c.type
 where s.name = 'default'
on conflict (country_id, address) do nothing;
