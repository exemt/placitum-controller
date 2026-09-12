-- Модель конфигурации nginx, которую хранит контроллер.
--
-- Иерархия как у nginx: одно http-пространство, внутри него каталоги (инспекторы,
-- наборы, апстримы, порты, сертификаты) и серверы; у сервера -- listen и пути.
-- Первичный ключ везде UUID: ссылка в шаблоне, в store:<uuid> и в API -- одно
-- и то же, без сюрприза «id=17 на staging это другой объект».
--
-- Что в таблицах, что в jsonb.
--   Таблица -- у сущности есть имя, на неё ссылаются чужие строки, её список
--   рисует UX. jsonb -- набор скаляров без собственной идентичности.
--
-- Наследование http -> server -> location живёт в приложении, не в SQL.
-- В jsonb ключ отсутствует -- взять у родителя; ключ есть -- заменить целиком,
-- в том числе пустым массивом (снять проверки на этом пути). Слияния массивов
-- нет: так же ведут себя waf_request_inspectors, waf_local_check, waf_local_rate.

create extension if not exists pgcrypto;


-- --- пространство http ----------------------------------------------------

create table http_spaces (
    id              uuid primary key default gen_random_uuid(),
    name            text not null unique,
    -- ядро nginx этого http {}: keepalive, resolver, client_max_body_size.
    nginx           jsonb not null default '{}',
    -- http-only директивы модуля: шина, зона, пределы сообщений.
    waf_http        jsonb not null default '{}',
    -- наследуемые вниз значения модуля: waf on, deadline, набор инспекторов.
    -- Сервер и путь хранят тот же документ, только разреженный.
    waf             jsonb not null default '{}',
    -- raw: оператор пишет тело http {} сам; серверы и пути не печатаются.
    raw             boolean not null default false,
    raw_nginx       text not null default '',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Всегда есть пространство, в которое кладут первый контур.
insert into http_spaces (name) values ('default');


-- --- каталоги http --------------------------------------------------------
--
-- Объявляются в http {}, на сервер и путь ссылаются по uuid, в шаблон едут
-- своими именами. Имя уникально в пределах пространства, не глобально:
-- staging и prod могут оба иметь инспектора "modsec". Адреса набора и файлы
-- SecLang -- 003_datasets_and_rule_sets.sql.

create table inspectors (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    subject         text not null,
    phase           text not null default 'request'
                    check (phase in ('request', 'response', 'frame')),
    role            text not null default 'mandatory'
                    check (role in ('mandatory', 'advisory')),
    placement       text not null default 'remote'
                    check (placement in ('remote', 'local')),
    timeout_ms      integer,
    body            text not null default 'none',
    weight_milli    integer not null default 1000,
    sample_milli    integer not null default 1000,
    after           uuid[] not null default '{}',
    headers         text not null default 'all',
    allow_headers   text[] not null default '{}',
    allow_cookies   text[] not null default '{}',
    breaker         jsonb not null default '{}',
    unique (http_space_id, name)
);

create table datasets (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    subject         text not null,
    type            text not null default 'cidr'
                    check (type in ('cidr', 'string')),
    max_entries     integer not null default 1000000 check (max_entries > 0),
    unique (http_space_id, name)
);

create table deny_responses (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    type            text not null default 'http'
                    check (type in ('http', 'grpc', 'websocket')),
    -- status / page / message / code / reason -- в jsonb, потому что набор
    -- полей зависит от type, а отдельная таблица на каждый type не окупается.
    spec            jsonb not null default '{}',
    unique (http_space_id, name)
);

create table body_stores (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    driver          text not null
                    check (driver in ('none', 'inline', 'tmpfs', 'redis', 's3')),
    spec            jsonb not null default '{}',
    unique (http_space_id, name)
);

create table log_formats (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    fields          text[] not null,
    unique (http_space_id, name)
);


-- --- апстримы -------------------------------------------------------------
--
-- Живут в http {}, не принадлежат серверу: один пул может принимать и shop,
-- и api. Путь ссылается на апстрим, не наоборот.

create table upstreams (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    -- round_robin по умолчанию в nginx -- отсутствие директивы, не имя.
    method          text not null default 'round_robin'
                    check (method in ('round_robin', 'least_conn', 'ip_hash', 'hash')),
    hash_key        text,
    keepalive       integer,
    keepalive_requests integer,
    keepalive_timeout_ms integer,
    unique (http_space_id, name)
);

create table upstream_peers (
    id              uuid primary key default gen_random_uuid(),
    upstream_id     uuid not null references upstreams(id) on delete cascade,
    host            text not null,
    port            integer not null check (port between 1 and 65535),
    weight          integer not null default 1 check (weight > 0),
    max_fails       integer,
    fail_timeout_ms integer,
    backup          boolean not null default false,
    down            boolean not null default false,
    position        integer not null default 0
);


-- --- порты ----------------------------------------------------------------
--
-- Каталог listen-адресов пространства. Сам по себе порт ничего не слушает:
-- слушает сервер, к которому порт привязан. Один порт на несколько серверов --
-- это виртуальные хосты на одном listen (SNI / server_name).

create table ports (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    -- 0.0.0.0, ::, 127.0.0.1, конкретный адрес ноды.
    address         text not null default '0.0.0.0',
    port            integer not null check (port between 1 and 65535),
    -- listen-флаги сокета. На виртуальных хостах общие: один адрес — один ssl.
    ssl             boolean not null default false,
    http2           boolean not null default false,
    proxy_protocol  boolean not null default false,
    unique (http_space_id, name),
    unique (http_space_id, address, port)
);


-- --- сертификаты ----------------------------------------------------------
--
-- PEM в postgres нет: в шаблоне стоит store:<uuid>, тело -- ciphertext в
-- store_objects (см. 002_store_objects.sql). Здесь -- SAN, срок и ссылки.

create table certificates (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    cert_store_id   uuid not null,
    key_store_id    uuid not null,
    chain_store_id  uuid,
    sans            text[] not null default '{}',
    not_before      timestamptz,
    not_after       timestamptz,
    unique (http_space_id, name)
);


-- --- серверы --------------------------------------------------------------

create table servers (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    server_names    text[] not null default '{}',
    enabled         boolean not null default true,
    nginx           jsonb not null default '{}',
    waf             jsonb not null default '{}',
    -- raw: внутри server {} текст оператора; пути и оверлеи не печатаются.
    -- Скелет остаётся: listen, server_name, сертификаты.
    raw             boolean not null default false,
    raw_nginx       text not null default '',
    unique (http_space_id, name)
);

-- listen 443 ssl http2 -- свойства listen, не сервера. default_server -- тоже:
-- в nginx он стоит на listen, и на одном порту default может быть только один.
create table server_ports (
    id              uuid primary key default gen_random_uuid(),
    server_id       uuid not null references servers(id) on delete cascade,
    port_id         uuid not null references ports(id) on delete restrict,
    ssl             boolean not null default false,
    http2           boolean not null default false,
    proxy_protocol  boolean not null default false,
    default_server  boolean not null default false,
    unique (server_id, port_id)
);

create unique index server_ports_one_default
    on server_ports (port_id) where default_server;

create table server_certificates (
    id              uuid primary key default gen_random_uuid(),
    server_id       uuid not null references servers(id) on delete cascade,
    certificate_id  uuid not null references certificates(id) on delete restrict,
    -- server -- ssl_certificate / ssl_certificate_key;
    -- client_ca -- ssl_client_certificate (mTLS);
    -- trusted -- ssl_trusted_certificate.
    kind            text not null default 'server'
                    check (kind in ('server', 'client_ca', 'trusted')),
    unique (server_id, kind)
);


-- --- пути -----------------------------------------------------------------

create table locations (
    id              uuid primary key default gen_random_uuid(),
    server_id       uuid not null references servers(id) on delete cascade,
    -- prefix / exact / regex / regex_i / named -- как у nginx, не «путь строкой».
    match           text not null default 'prefix'
                    check (match in ('prefix', 'exact', 'regex', 'regex_i', 'named')),
    path            text not null,
    -- порядок в файле: для regex nginx берёт первое совпадение, для prefix --
    -- самое длинное. Генератор печатает строки в этом порядке.
    position        integer not null default 0,
    enabled         boolean not null default true,
    handler         text not null default 'proxy'
                    check (handler in ('proxy', 'static', 'return', 'named', 'metrics')),
    upstream_id     uuid references upstreams(id) on delete restrict,
    -- URI после имени апстрима: proxy_pass http://app/; пусто -- передать как есть.
    upstream_uri    text,
    return_status   integer,
    return_body     text,
    nginx           jsonb not null default '{}',
    waf             jsonb not null default '{}',
    -- raw: внутри location {} текст оператора; handler и оверлеи не печатаются.
    -- Скелет остаётся: match и path.
    raw             boolean not null default false,
    raw_nginx       text not null default '',
    unique (server_id, match, path)
);

create index locations_server_position on locations (server_id, position);


-- --- служебное ------------------------------------------------------------

create index inspectors_space on inspectors (http_space_id);
create index datasets_space on datasets (http_space_id);
create index upstreams_space on upstreams (http_space_id);
create index upstream_peers_upstream on upstream_peers (upstream_id);
create index ports_space on ports (http_space_id);
create index certificates_space on certificates (http_space_id);
create index servers_space on servers (http_space_id);
create index server_ports_server on server_ports (server_id);
create index server_ports_port on server_ports (port_id);
create index locations_server on locations (server_id);
create index locations_upstream on locations (upstream_id);
