-- Файлы адресов инспектора ip -- каталог пространства, не принадлежат профилю.
-- Профиль -- белая и чёрная стороны: файлы, страны, inverse.
-- Имя профиля уходит в waf_inspector_profile / route.profile.

create table if not exists ip_list_files (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    text_raw        text not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists ip_list_files_space on ip_list_files (http_space_id);

create table if not exists ip_profiles (
    id                   uuid primary key default gen_random_uuid(),
    http_space_id        uuid not null references http_spaces(id) on delete cascade,
    name                 text not null,
    description          text not null default '',
    whitelist_inverse    boolean not null default false,
    blacklist_inverse    boolean not null default false,
    whitelist_countries  text[] not null default '{}',
    blacklist_countries  text[] not null default '{}',
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists ip_profiles_space on ip_profiles (http_space_id);

create table if not exists ip_profile_files (
    ip_profile_id    uuid not null references ip_profiles(id) on delete cascade,
    ip_list_file_id  uuid not null references ip_list_files(id) on delete restrict,
    side             text not null check (side in ('whitelist', 'blacklist')),
    position         integer not null default 0,
    unique (ip_profile_id, ip_list_file_id, side)
);

create index if not exists ip_profile_files_file on ip_profile_files (ip_list_file_id);
