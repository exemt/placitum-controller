-- Placitum controller schema. Applied to an empty database on first start, before 02-seed.sql.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.action_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.action_profiles.doc IS 'Документ профиля действий. Валидация -- в контроллере и в инспекторе, не в типах.';

CREATE TABLE public.agent_settings (
    http_space_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.agent_settings IS 'Настройки агента контура: адрес и бакеты архива, темп выгрузки. Реквизиты S3 -- секрет ноды, не здесь.';

CREATE TABLE public.auth_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.auth_profiles.doc IS 'Документ профиля калитки. Валидация -- в контроллере и в инспекторе, не в типах.';

CREATE TABLE public.auth_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    server_id uuid,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.body_stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    driver text NOT NULL,
    spec jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT body_stores_driver_check CHECK ((driver = 'redis'::text))
);

CREATE TABLE public.captcha_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    server_id uuid,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.captcha_profiles.doc IS 'Документ профиля капчи. Валидация -- в контроллере и в инспекторе, не в типах.';

CREATE TABLE public.certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    cert_store_id uuid NOT NULL,
    key_store_id uuid,
    chain_store_id uuid,
    sans text[] DEFAULT '{}'::text[] NOT NULL,
    not_before timestamp with time zone,
    not_after timestamp with time zone,
    fingerprint text NOT NULL,
    kind text DEFAULT 'server'::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    issuer text DEFAULT ''::text NOT NULL,
    serial text DEFAULT ''::text NOT NULL,
    crl_store_id uuid,
    crl_this_update timestamp with time zone,
    crl_next_update timestamp with time zone,
    crl_revoked integer,
    crl_issuer text,
    CONSTRAINT certificates_crl_needs_client_ca CHECK (((crl_store_id IS NULL) OR (kind = 'client_ca'::text))),
    CONSTRAINT certificates_key_matches_kind CHECK ((((kind = 'server'::text) AND (key_store_id IS NOT NULL)) OR ((kind = 'client_ca'::text) AND (key_store_id IS NULL)))),
    CONSTRAINT certificates_kind_check CHECK ((kind = ANY (ARRAY['server'::text, 'client_ca'::text])))
);

CREATE TABLE public.content_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    mime text NOT NULL,
    description text DEFAULT ''::text NOT NULL
);

CREATE TABLE public.cookie_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.cookie_profiles.doc IS 'Документ профиля куки. Валидация -- в контроллере и в инспекторе, не в типах.';

CREATE TABLE public.counter_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.counter_profiles.doc IS 'Документ профиля счётчика. Валидация -- в контроллере и в инспекторе, не в типах.';

CREATE TABLE public.counter_shared (
    http_space_id uuid NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.counter_shared IS 'Общая секция счётчика: объявления счётчиков и источники ключей субъектов, одна на пространство.';

CREATE TABLE public.dataset_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_id uuid NOT NULL,
    address text NOT NULL,
    ttl_s integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    origin text DEFAULT ''::text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    CONSTRAINT dataset_addresses_ttl_s_check CHECK ((ttl_s >= 0))
);

CREATE TABLE public.dataset_contents (
    dataset_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    body bytea DEFAULT '\x'::bytea NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'ipv4'::text NOT NULL,
    max_entries integer DEFAULT 1000000 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'list'::text NOT NULL,
    content_type_id uuid,
    active boolean DEFAULT false NOT NULL,
    live_max integer,
    in_nginx boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    ttl text,
    builtin boolean DEFAULT false NOT NULL,
    hash boolean DEFAULT false NOT NULL,
    source jsonb,
    CONSTRAINT datasets_kind_check CHECK ((kind = ANY (ARRAY['list'::text, 'content'::text]))),
    CONSTRAINT datasets_kind_shape CHECK ((((kind = 'list'::text) AND (type = ANY (ARRAY['string'::text, 'numeric'::text, 'ipv4'::text, 'ip'::text])) AND (content_type_id IS NULL)) OR ((kind = 'content'::text) AND (content_type_id IS NOT NULL)))),
    CONSTRAINT datasets_max_entries_check CHECK ((max_entries > 0))
);

COMMENT ON COLUMN public.datasets.in_nginx IS 'Слот waf_local_dataset в шаблоне nginx. Наборы ip-компилятора -- false.';

COMMENT ON COLUMN public.datasets.description IS 'Описание для каталога. На compile и шину не влияет.';
COMMENT ON COLUMN public.datasets.source IS 'Набор сервера лицензий, из которого скачан список: {feed, version, sha256, fetched_at, server}. NULL -- список свой.';

CREATE TABLE public.deny_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'http'::text NOT NULL,
    spec jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT deny_responses_type_check CHECK ((type = ANY (ARRAY['http'::text, 'grpc'::text, 'websocket'::text])))
);

CREATE TABLE public.geo_files (
    kind text NOT NULL,
    sha256 text NOT NULL,
    size bigint NOT NULL,
    database_type text NOT NULL,
    build_epoch bigint DEFAULT 0 NOT NULL,
    data bytea NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT geo_files_kind_check CHECK ((kind = ANY (ARRAY['country'::text, 'asn'::text])))
);

CREATE TABLE public.haproxy_settings (
    http_space_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.haproxy_settings IS 'Настройки haproxy контура: пределы, таймауты, вход и состав backend''а. Пустой документ компилируется в поставочный конфиг стенда.';

CREATE TABLE public.http_spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    nginx jsonb DEFAULT '{}'::jsonb NOT NULL,
    waf_http jsonb DEFAULT '{}'::jsonb NOT NULL,
    waf jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw boolean DEFAULT false NOT NULL,
    raw_nginx text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nginx_main jsonb DEFAULT '{}'::jsonb NOT NULL
);

COMMENT ON COLUMN public.http_spaces.waf IS 'Реестр инспекторов контура: inspectors, inspectorProfiles. Решения по запросу живут на servers.waf и locations.waf.';

COMMENT ON COLUMN public.http_spaces.nginx_main IS 'Скелет файла: load_module, worker_processes, error_log, events {}.';

CREATE TABLE public.license (
    id integer DEFAULT 1 NOT NULL,
    key text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT license_id_check CHECK ((id = 1))
);

COMMENT ON TABLE public.license IS 'Ключ коммерческой лицензии установки: одна строка, подписанный документ сервера лицензий. Проверяется контроллером офлайн.';

CREATE TABLE public.inspectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    conf text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phases text[] DEFAULT ARRAY['request'::text] NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    docs_url text DEFAULT ''::text NOT NULL,
    log_level text DEFAULT 'info'::text NOT NULL,
    installed boolean DEFAULT true NOT NULL,
    CONSTRAINT inspectors_log_level_check CHECK ((log_level = ANY (ARRAY['debug'::text, 'info'::text, 'notice'::text, 'warn'::text, 'error'::text, 'crit'::text, 'alert'::text]))),
    CONSTRAINT inspectors_phases_filled CHECK ((COALESCE(array_length(phases, 1), 0) > 0)),
    CONSTRAINT inspectors_phases_known CHECK ((phases <@ ARRAY['request'::text, 'response'::text, 'frame'::text]))
);

COMMENT ON TABLE public.inspectors IS 'Каталог процессов: имя, тема шины, фазы, inspector.conf. Опции директив -- в http_spaces.waf.inspectors.';

COMMENT ON COLUMN public.inspectors.subject IS 'Тема шины процесса: waf.req.modsec. Имя в каталоге совпадает с процессом.';

COMMENT ON COLUMN public.inspectors.conf IS 'Текст inspector.conf: queue_max / queue_full / queue_expand. Не уезжает в nginx.conf.';

COMMENT ON COLUMN public.inspectors.phases IS 'Фазы, которые процесс умеет вести. Когда его зовут -- решает waf_inspect на маршруте.';

COMMENT ON COLUMN public.inspectors.description IS 'Описание процесса для каталога. На compile и шину не влияет.';

COMMENT ON COLUMN public.inspectors.docs_url IS 'Ссылка на документацию процесса. Пусто, пока доков нет.';

COMMENT ON COLUMN public.inspectors.log_level IS 'Уровень журнала процесса: словарь error_log nginx без emerg. Едет в поколение (settings.log_level), применяется без рестарта.';

COMMENT ON COLUMN public.inspectors.installed IS 'Процесс запущен в установке: выключенный установщиком для панели, маршрутов и сборки как будто не существует.';

CREATE TABLE public.ip_asn_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asn_id uuid NOT NULL,
    address text NOT NULL
);

CREATE TABLE public.ip_asns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    asn bigint NOT NULL,
    type text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ip_asns_asn_check CHECK ((asn > 0)),
    CONSTRAINT ip_asns_type_check CHECK ((type = ANY (ARRAY['v4'::text, 'v6'::text])))
);

CREATE TABLE public.ip_countries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    code text NOT NULL,
    type text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ip_countries_type_check CHECK ((type = ANY (ARRAY['v4'::text, 'v6'::text])))
);

CREATE TABLE public.ip_country_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_id uuid NOT NULL,
    address text NOT NULL
);

CREATE TABLE public.ip_profile_datasets (
    ip_profile_id uuid NOT NULL,
    dataset_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);

COMMENT ON TABLE public.ip_profile_datasets IS 'Сырые списки, которые профиль просит упаковать: логики не несут, их только везут. Условие накопительной строки выбирается из них.';

CREATE TABLE public.ip_profile_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_profile_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    ip_set_id uuid,
    action text NOT NULL,
    response text DEFAULT ''::text NOT NULL,
    code text DEFAULT ''::text NOT NULL,
    to_inspector text DEFAULT ''::text NOT NULL,
    do_verb text DEFAULT ''::text NOT NULL,
    apply_axis text DEFAULT ''::text NOT NULL,
    delta integer,
    value integer,
    list_dataset_id uuid,
    list_ttl_s integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    counter text DEFAULT ''::text NOT NULL,
    marker text DEFAULT ''::text NOT NULL,
    set_not boolean DEFAULT false NOT NULL,
    dataset_id uuid,
    ask_set text DEFAULT ''::text NOT NULL,
    ask_ttl_s integer DEFAULT 0 NOT NULL,
    ask_when text[] DEFAULT '{}'::text[] NOT NULL,
    ask_objects jsonb DEFAULT '{}'::jsonb NOT NULL,
    ask_group text DEFAULT ''::text NOT NULL,
    ask_phase text DEFAULT ''::text NOT NULL,
    list_write text DEFAULT 'addr'::text NOT NULL,
    CONSTRAINT ip_profile_rules_action_check CHECK ((action = ANY (ARRAY['allow'::text, 'deny'::text, 'request'::text, 'list'::text]))),
    CONSTRAINT ip_profile_rules_condition CHECK (
CASE
    WHEN (action = ANY (ARRAY['allow'::text, 'deny'::text])) THEN ((ip_set_id IS NOT NULL) AND (dataset_id IS NULL) AND (NOT set_not))
    ELSE ((dataset_id IS NOT NULL) AND (ip_set_id IS NULL))
END),
    CONSTRAINT ip_profile_rules_list_write CHECK ((list_write = ANY (ARRAY['addr'::text, 'net'::text, 'net_all'::text, 'asn'::text])))
);

COMMENT ON COLUMN public.ip_profile_rules.set_not IS 'Условие наоборот: строка срабатывает на промахе. Только у request и list.';

COMMENT ON COLUMN public.ip_profile_rules.dataset_id IS 'Условие накопительной строки: сырой список. У терминальной пусто -- она спрашивает ip_set_id.';

COMMENT ON COLUMN public.ip_profile_rules.ask_set IS 'Сторона просьбы записи: on -- писать, off -- не писать. Пусто у остальных глаголов.';

COMMENT ON COLUMN public.ip_profile_rules.ask_ttl_s IS 'Срок объектов в архиве, сек. Только у archive с ask_set on; 0 -- как на маршруте.';

COMMENT ON COLUMN public.ip_profile_rules.ask_when IS 'Исходы маршрута, на которых исполнять archive. Пусто -- любой.';

COMMENT ON COLUMN public.ip_profile_rules.ask_objects IS 'Объекты просьбы записи: headers, args, body -- каждый со своей стороной, пределом и источником.';

COMMENT ON COLUMN public.ip_profile_rules.ask_group IS 'Группа модификаторов получателя при do: mutate; куда переключить -- ask_set. Пусто у остальных глаголов.';

COMMENT ON COLUMN public.ip_profile_rules.ask_phase IS 'Фаза вызова адресата у active / passive / vote / off: request, response, frame. Пусто -- всем вызовам имени и у прочих глаголов.';

COMMENT ON COLUMN public.ip_profile_rules.list_write IS 'Кого писать в набор у action list: addr, net, net_all, asn. Подсеть и систему инспектор берёт у кодера гео и пишет одной пачкой.';

CREATE TABLE public.ip_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_action text DEFAULT 'allow'::text NOT NULL,
    default_code text DEFAULT ''::text NOT NULL,
    outcomes jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT ip_profiles_default_action_check CHECK ((default_action = ANY (ARRAY['allow'::text, 'deny'::text])))
);

CREATE TABLE public.ip_set_lists (
    ip_set_id uuid NOT NULL,
    dataset_id uuid NOT NULL,
    exclude boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.ip_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    inverse boolean DEFAULT false NOT NULL,
    countries text[] DEFAULT '{}'::text[] NOT NULL,
    asns bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    exclude_countries text[] DEFAULT '{}'::text[] NOT NULL,
    exclude_asns bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.json_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.json_profiles.doc IS 'Документ профиля контракта. Валидация -- в контроллере и в инспекторе, не в типах.';

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    match text DEFAULT 'prefix'::text NOT NULL,
    path text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    handler text DEFAULT 'proxy'::text NOT NULL,
    upstream_id uuid,
    upstream_uri text,
    return_status integer,
    return_url text,
    nginx jsonb DEFAULT '{}'::jsonb NOT NULL,
    waf jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw boolean DEFAULT false NOT NULL,
    raw_nginx text DEFAULT ''::text NOT NULL,
    return_page text,
    builtin boolean DEFAULT false NOT NULL,
    protocol text DEFAULT 'http'::text NOT NULL,
    static_file text,
    CONSTRAINT locations_handler_check CHECK ((handler = ANY (ARRAY['proxy'::text, 'static'::text, 'return'::text]))),
    CONSTRAINT locations_match_check CHECK ((match = ANY (ARRAY['prefix'::text, 'exact'::text, 'regex'::text, 'regex_i'::text, 'named'::text])))
);

COMMENT ON COLUMN public.locations.return_url IS 'Адрес для 3xx: return 302 <url>. Не тело ответа -- у прочих кодов не печатается.';

COMMENT ON COLUMN public.locations.return_page IS 'Цель error_page для handler=return: именованный путь того же сервера (@waf_deny).';

COMMENT ON COLUMN public.locations.static_file IS 'Файл пространства для handler=static: имя набора вида content из «Файлов». Печатается как root pages: и try_files /имя.расширение =404.';

COMMENT ON COLUMN public.locations.builtin IS 'Корень сервера: не удаляется, match и path не меняются. Заводится вместе с сервером.';

COMMENT ON COLUMN public.locations.protocol IS 'http | websocket: какие фазы у пути; websocket печатает пресет апгрейда и снимает фазу ответа';

CREATE TABLE public.log_formats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    fields text[] NOT NULL,
    kind text DEFAULT 'nginx'::text NOT NULL,
    format text DEFAULT ''::text NOT NULL,
    CONSTRAINT log_formats_kind_check CHECK ((kind = 'nginx'::text))
);

COMMENT ON COLUMN public.log_formats.kind IS 'nginx -- log_format (access-лог, читается format). waf_log_format снят.';

COMMENT ON COLUMN public.log_formats.format IS 'Тело log_format без кавычек. Только при kind = nginx.';

CREATE TABLE public.ports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    address text DEFAULT '0.0.0.0'::text NOT NULL,
    port integer NOT NULL,
    ssl boolean DEFAULT false NOT NULL,
    http2 boolean DEFAULT false NOT NULL,
    proxy_protocol boolean DEFAULT false NOT NULL,
    CONSTRAINT ports_port_check CHECK (((port >= 1) AND (port <= 65535)))
);

CREATE TABLE public.rewrite_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.rewrite_profiles.doc IS 'Документ профиля rewrite: mode, deny_response, groups[], prior[]. Валидация -- в контроллере и в инспекторе, не в типах.';

CREATE TABLE public.rule_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    text_raw text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.rule_set_data (
    rule_set_id uuid NOT NULL,
    dataset_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.rule_set_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_set_id uuid NOT NULL,
    rule_file_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.rule_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    policy jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.server_certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    certificate_id uuid NOT NULL,
    kind text DEFAULT 'server'::text NOT NULL,
    CONSTRAINT server_certificates_kind_check CHECK ((kind = ANY (ARRAY['server'::text, 'client_ca'::text, 'trusted'::text])))
);

CREATE TABLE public.server_ports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    port_id uuid NOT NULL,
    ssl boolean DEFAULT false NOT NULL,
    http2 boolean DEFAULT false NOT NULL,
    proxy_protocol boolean DEFAULT false NOT NULL,
    default_server boolean DEFAULT false NOT NULL
);

CREATE TABLE public.servers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    server_names text[] DEFAULT '{}'::text[] NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    nginx jsonb DEFAULT '{}'::jsonb NOT NULL,
    waf jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw boolean DEFAULT false NOT NULL,
    raw_nginx text DEFAULT ''::text NOT NULL,
    upstream_id uuid
);

CREATE TABLE public.store_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    blob bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_objects_type_check CHECK ((type = ANY (ARRAY['certificate'::text, 'private_key'::text, 'chain'::text, 'ca'::text, 'crl'::text, 'creds'::text, 'dhparam'::text, 'deny_page'::text, 'other'::text])))
);

CREATE TABLE public.upstream_peers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upstream_id uuid NOT NULL,
    host text NOT NULL,
    port integer NOT NULL,
    weight integer DEFAULT 1 NOT NULL,
    max_fails integer,
    fail_timeout_ms integer,
    backup boolean DEFAULT false NOT NULL,
    down boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    resolve boolean DEFAULT false NOT NULL,
    CONSTRAINT upstream_peers_port_check CHECK (((port >= 1) AND (port <= 65535))),
    CONSTRAINT upstream_peers_weight_check CHECK ((weight > 0))
);

CREATE TABLE public.upstreams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    method text DEFAULT 'round_robin'::text NOT NULL,
    hash_key text,
    keepalive integer,
    keepalive_requests integer,
    keepalive_timeout_ms integer,
    tls boolean DEFAULT false NOT NULL,
    tls_name text,
    host_header text,
    CONSTRAINT upstreams_method_check CHECK ((method = ANY (ARRAY['round_robin'::text, 'least_conn'::text, 'ip_hash'::text, 'hash'::text])))
);

CREATE TABLE public.vlai_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    http_space_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    doc jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.vlai_profiles.doc IS 'Документ профиля vlai. Валидация -- в контроллере и в инспекторе, не в типах.';

ALTER TABLE ONLY public.action_profiles
    ADD CONSTRAINT action_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.action_profiles
    ADD CONSTRAINT action_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agent_settings
    ADD CONSTRAINT agent_settings_pkey PRIMARY KEY (http_space_id);

ALTER TABLE ONLY public.auth_profiles
    ADD CONSTRAINT auth_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.auth_profiles
    ADD CONSTRAINT auth_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_sources
    ADD CONSTRAINT auth_sources_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.auth_sources
    ADD CONSTRAINT auth_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.body_stores
    ADD CONSTRAINT body_stores_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.body_stores
    ADD CONSTRAINT body_stores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.captcha_profiles
    ADD CONSTRAINT captcha_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.captcha_profiles
    ADD CONSTRAINT captcha_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.content_types
    ADD CONSTRAINT content_types_name_key UNIQUE (name);

ALTER TABLE ONLY public.content_types
    ADD CONSTRAINT content_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cookie_profiles
    ADD CONSTRAINT cookie_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.cookie_profiles
    ADD CONSTRAINT cookie_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.counter_profiles
    ADD CONSTRAINT counter_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.counter_profiles
    ADD CONSTRAINT counter_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.counter_shared
    ADD CONSTRAINT counter_shared_pkey PRIMARY KEY (http_space_id);

ALTER TABLE ONLY public.dataset_addresses
    ADD CONSTRAINT dataset_addresses_dataset_id_address_key UNIQUE (dataset_id, address);

ALTER TABLE ONLY public.dataset_addresses
    ADD CONSTRAINT dataset_addresses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.dataset_contents
    ADD CONSTRAINT dataset_contents_pkey PRIMARY KEY (dataset_id);

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.deny_responses
    ADD CONSTRAINT deny_responses_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.deny_responses
    ADD CONSTRAINT deny_responses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.geo_files
    ADD CONSTRAINT geo_files_pkey PRIMARY KEY (kind);

ALTER TABLE ONLY public.haproxy_settings
    ADD CONSTRAINT haproxy_settings_pkey PRIMARY KEY (http_space_id);

ALTER TABLE ONLY public.http_spaces
    ADD CONSTRAINT http_spaces_name_key UNIQUE (name);

ALTER TABLE ONLY public.http_spaces
    ADD CONSTRAINT http_spaces_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inspectors
    ADD CONSTRAINT inspectors_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.inspectors
    ADD CONSTRAINT inspectors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ip_asn_addresses
    ADD CONSTRAINT ip_asn_addresses_asn_id_address_key UNIQUE (asn_id, address);

ALTER TABLE ONLY public.ip_asn_addresses
    ADD CONSTRAINT ip_asn_addresses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ip_asns
    ADD CONSTRAINT ip_asns_http_space_id_asn_type_key UNIQUE (http_space_id, asn, type);

ALTER TABLE ONLY public.ip_asns
    ADD CONSTRAINT ip_asns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ip_countries
    ADD CONSTRAINT ip_countries_http_space_id_code_type_key UNIQUE (http_space_id, code, type);

ALTER TABLE ONLY public.ip_countries
    ADD CONSTRAINT ip_countries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ip_country_addresses
    ADD CONSTRAINT ip_country_addresses_country_id_address_key UNIQUE (country_id, address);

ALTER TABLE ONLY public.ip_country_addresses
    ADD CONSTRAINT ip_country_addresses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ip_profile_datasets
    ADD CONSTRAINT ip_profile_datasets_pkey PRIMARY KEY (ip_profile_id, dataset_id);

ALTER TABLE ONLY public.ip_profile_rules
    ADD CONSTRAINT ip_profile_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ip_profiles
    ADD CONSTRAINT ip_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.ip_profiles
    ADD CONSTRAINT ip_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ip_set_lists
    ADD CONSTRAINT ip_set_lists_ip_set_id_dataset_id_exclude_key UNIQUE (ip_set_id, dataset_id, exclude);

ALTER TABLE ONLY public.ip_sets
    ADD CONSTRAINT ip_sets_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.ip_sets
    ADD CONSTRAINT ip_sets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.json_profiles
    ADD CONSTRAINT json_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.json_profiles
    ADD CONSTRAINT json_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_server_id_match_path_key UNIQUE (server_id, match, path);

ALTER TABLE ONLY public.log_formats
    ADD CONSTRAINT log_formats_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.log_formats
    ADD CONSTRAINT log_formats_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ports
    ADD CONSTRAINT ports_http_space_id_address_port_key UNIQUE (http_space_id, address, port);

ALTER TABLE ONLY public.ports
    ADD CONSTRAINT ports_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.ports
    ADD CONSTRAINT ports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rewrite_profiles
    ADD CONSTRAINT rewrite_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.rewrite_profiles
    ADD CONSTRAINT rewrite_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_files
    ADD CONSTRAINT rule_files_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.rule_files
    ADD CONSTRAINT rule_files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_set_data
    ADD CONSTRAINT rule_set_data_pkey PRIMARY KEY (rule_set_id, dataset_id);

ALTER TABLE ONLY public.rule_set_files
    ADD CONSTRAINT rule_set_files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_set_files
    ADD CONSTRAINT rule_set_files_rule_set_id_rule_file_id_key UNIQUE (rule_set_id, rule_file_id);

ALTER TABLE ONLY public.rule_sets
    ADD CONSTRAINT rule_sets_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.rule_sets
    ADD CONSTRAINT rule_sets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.server_certificates
    ADD CONSTRAINT server_certificates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.server_certificates
    ADD CONSTRAINT server_certificates_server_id_kind_key UNIQUE (server_id, kind);

ALTER TABLE ONLY public.server_ports
    ADD CONSTRAINT server_ports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.server_ports
    ADD CONSTRAINT server_ports_server_id_port_id_key UNIQUE (server_id, port_id);

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_objects
    ADD CONSTRAINT store_objects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.upstream_peers
    ADD CONSTRAINT upstream_peers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.upstreams
    ADD CONSTRAINT upstreams_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.upstreams
    ADD CONSTRAINT upstreams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vlai_profiles
    ADD CONSTRAINT vlai_profiles_http_space_id_name_key UNIQUE (http_space_id, name);

ALTER TABLE ONLY public.vlai_profiles
    ADD CONSTRAINT vlai_profiles_pkey PRIMARY KEY (id);

CREATE INDEX action_profiles_space ON public.action_profiles USING btree (http_space_id);

CREATE INDEX auth_profiles_space ON public.auth_profiles USING btree (http_space_id);

CREATE INDEX captcha_profiles_space ON public.captcha_profiles USING btree (http_space_id);

CREATE INDEX certificates_space ON public.certificates USING btree (http_space_id);

CREATE INDEX cookie_profiles_space ON public.cookie_profiles USING btree (http_space_id);

CREATE INDEX counter_profiles_space ON public.counter_profiles USING btree (http_space_id);

CREATE INDEX dataset_addresses_address ON public.dataset_addresses USING btree (address);

CREATE INDEX dataset_addresses_dataset ON public.dataset_addresses USING btree (dataset_id);

CREATE INDEX dataset_addresses_expires ON public.dataset_addresses USING btree (expires_at) WHERE (expires_at IS NOT NULL);

CREATE INDEX datasets_space ON public.datasets USING btree (http_space_id);

CREATE INDEX inspectors_space ON public.inspectors USING btree (http_space_id);

CREATE INDEX ip_asn_addresses_asn ON public.ip_asn_addresses USING btree (asn_id);

CREATE INDEX ip_asn_addresses_net ON public.ip_asn_addresses USING gist (((address)::cidr) inet_ops);

CREATE INDEX ip_asn_addresses_prefix ON public.ip_asn_addresses USING btree (asn_id, address text_pattern_ops);

CREATE INDEX ip_asns_space ON public.ip_asns USING btree (http_space_id);

CREATE INDEX ip_countries_space ON public.ip_countries USING btree (http_space_id);

CREATE INDEX ip_country_addresses_country ON public.ip_country_addresses USING btree (country_id);

CREATE INDEX ip_country_addresses_net ON public.ip_country_addresses USING gist (((address)::cidr) inet_ops);

CREATE INDEX ip_country_addresses_prefix ON public.ip_country_addresses USING btree (country_id, address text_pattern_ops);

CREATE INDEX ip_profile_datasets_dataset ON public.ip_profile_datasets USING btree (dataset_id);

CREATE INDEX ip_profile_rules_profile ON public.ip_profile_rules USING btree (ip_profile_id, "position");

CREATE INDEX ip_profile_rules_set ON public.ip_profile_rules USING btree (ip_set_id);

CREATE INDEX ip_profiles_space ON public.ip_profiles USING btree (http_space_id);

CREATE INDEX ip_set_lists_dataset ON public.ip_set_lists USING btree (dataset_id);

CREATE INDEX ip_sets_space ON public.ip_sets USING btree (http_space_id);

CREATE INDEX json_profiles_space ON public.json_profiles USING btree (http_space_id);

CREATE INDEX locations_server ON public.locations USING btree (server_id);

CREATE INDEX locations_server_position ON public.locations USING btree (server_id, "position");

CREATE INDEX locations_upstream ON public.locations USING btree (upstream_id);

CREATE INDEX ports_space ON public.ports USING btree (http_space_id);

CREATE INDEX rewrite_profiles_space ON public.rewrite_profiles USING btree (http_space_id);

CREATE INDEX rule_files_space ON public.rule_files USING btree (http_space_id);

CREATE INDEX rule_set_data_dataset ON public.rule_set_data USING btree (dataset_id);

CREATE INDEX rule_set_files_file ON public.rule_set_files USING btree (rule_file_id);

CREATE INDEX rule_set_files_set ON public.rule_set_files USING btree (rule_set_id);

CREATE INDEX rule_sets_space ON public.rule_sets USING btree (http_space_id);

CREATE UNIQUE INDEX server_ports_one_default ON public.server_ports USING btree (port_id) WHERE default_server;

CREATE INDEX server_ports_port ON public.server_ports USING btree (port_id);

CREATE INDEX server_ports_server ON public.server_ports USING btree (server_id);

CREATE INDEX servers_space ON public.servers USING btree (http_space_id);

CREATE INDEX servers_upstream ON public.servers USING btree (upstream_id);

CREATE INDEX store_objects_type ON public.store_objects USING btree (type);

CREATE INDEX upstream_peers_upstream ON public.upstream_peers USING btree (upstream_id);

CREATE INDEX upstreams_space ON public.upstreams USING btree (http_space_id);

CREATE INDEX vlai_profiles_space ON public.vlai_profiles USING btree (http_space_id);

ALTER TABLE ONLY public.action_profiles
    ADD CONSTRAINT action_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_settings
    ADD CONSTRAINT agent_settings_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_profiles
    ADD CONSTRAINT auth_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_sources
    ADD CONSTRAINT auth_sources_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_sources
    ADD CONSTRAINT auth_sources_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.body_stores
    ADD CONSTRAINT body_stores_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.captcha_profiles
    ADD CONSTRAINT captcha_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.captcha_profiles
    ADD CONSTRAINT captcha_profiles_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_cert_store_fk FOREIGN KEY (cert_store_id) REFERENCES public.store_objects(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_chain_store_fk FOREIGN KEY (chain_store_id) REFERENCES public.store_objects(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_key_store_fk FOREIGN KEY (key_store_id) REFERENCES public.store_objects(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.cookie_profiles
    ADD CONSTRAINT cookie_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.counter_profiles
    ADD CONSTRAINT counter_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.counter_shared
    ADD CONSTRAINT counter_shared_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dataset_addresses
    ADD CONSTRAINT dataset_addresses_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dataset_contents
    ADD CONSTRAINT dataset_contents_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_content_type_id_fkey FOREIGN KEY (content_type_id) REFERENCES public.content_types(id);

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.deny_responses
    ADD CONSTRAINT deny_responses_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.haproxy_settings
    ADD CONSTRAINT haproxy_settings_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inspectors
    ADD CONSTRAINT inspectors_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_asn_addresses
    ADD CONSTRAINT ip_asn_addresses_asn_id_fkey FOREIGN KEY (asn_id) REFERENCES public.ip_asns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_asns
    ADD CONSTRAINT ip_asns_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_countries
    ADD CONSTRAINT ip_countries_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_country_addresses
    ADD CONSTRAINT ip_country_addresses_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.ip_countries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_profile_datasets
    ADD CONSTRAINT ip_profile_datasets_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ip_profile_datasets
    ADD CONSTRAINT ip_profile_datasets_ip_profile_id_fkey FOREIGN KEY (ip_profile_id) REFERENCES public.ip_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_profile_rules
    ADD CONSTRAINT ip_profile_rules_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ip_profile_rules
    ADD CONSTRAINT ip_profile_rules_ip_profile_id_fkey FOREIGN KEY (ip_profile_id) REFERENCES public.ip_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_profile_rules
    ADD CONSTRAINT ip_profile_rules_ip_set_id_fkey FOREIGN KEY (ip_set_id) REFERENCES public.ip_sets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ip_profile_rules
    ADD CONSTRAINT ip_profile_rules_list_dataset_id_fkey FOREIGN KEY (list_dataset_id) REFERENCES public.datasets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ip_profiles
    ADD CONSTRAINT ip_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_set_lists
    ADD CONSTRAINT ip_set_lists_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ip_set_lists
    ADD CONSTRAINT ip_set_lists_ip_set_id_fkey FOREIGN KEY (ip_set_id) REFERENCES public.ip_sets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ip_sets
    ADD CONSTRAINT ip_sets_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.json_profiles
    ADD CONSTRAINT json_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_upstream_id_fkey FOREIGN KEY (upstream_id) REFERENCES public.upstreams(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.log_formats
    ADD CONSTRAINT log_formats_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ports
    ADD CONSTRAINT ports_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rewrite_profiles
    ADD CONSTRAINT rewrite_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_files
    ADD CONSTRAINT rule_files_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_set_data
    ADD CONSTRAINT rule_set_data_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.rule_set_data
    ADD CONSTRAINT rule_set_data_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES public.rule_sets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_set_files
    ADD CONSTRAINT rule_set_files_rule_file_id_fkey FOREIGN KEY (rule_file_id) REFERENCES public.rule_files(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.rule_set_files
    ADD CONSTRAINT rule_set_files_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES public.rule_sets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_sets
    ADD CONSTRAINT rule_sets_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.server_certificates
    ADD CONSTRAINT server_certificates_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.server_certificates
    ADD CONSTRAINT server_certificates_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.server_ports
    ADD CONSTRAINT server_ports_port_id_fkey FOREIGN KEY (port_id) REFERENCES public.ports(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.server_ports
    ADD CONSTRAINT server_ports_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_upstream_id_fkey FOREIGN KEY (upstream_id) REFERENCES public.upstreams(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.upstream_peers
    ADD CONSTRAINT upstream_peers_upstream_id_fkey FOREIGN KEY (upstream_id) REFERENCES public.upstreams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.upstreams
    ADD CONSTRAINT upstreams_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vlai_profiles
    ADD CONSTRAINT vlai_profiles_http_space_id_fkey FOREIGN KEY (http_space_id) REFERENCES public.http_spaces(id) ON DELETE CASCADE;
