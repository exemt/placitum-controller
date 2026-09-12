-- Профили калитки второго фактора (inspectors/auth).
--
-- Профиль хранится документом jsonb, а не колонкой на поле. Причина не в лени:
-- форма профиля описана в двух местах сразу -- здесь и в Go
-- (inspectors/auth/internal/config), -- и разъехаться они не должны. Колонки
-- заставляли бы править миграцию на каждое новое поле профиля и всё равно не
-- давали бы валидации: она в Go и в контроллере, а не в типах Postgres.
-- Тот же приём уже применён к locations.waf.
--
-- Отдельными таблицами вынесено ровно то, у чего своя жизнь: набор
-- пользователей (каталог пространства, как ip_list_files) и сами записи в нём.

create table if not exists auth_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: mode, login, gate, session, ticket, list, upstream,
    -- factors, providers, lockout, roster. Схема -- docs/README.md репозитория auth.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists auth_profiles_space on auth_profiles (http_space_id);

comment on column auth_profiles.doc is
    'Документ профиля калитки. Валидация -- в контроллере и в инспекторе, не в типах.';

-- Набор пользователей провайдера local. Каталог пространства: один набор может
-- обслуживать несколько профилей, и удалять его вместе с профилем нельзя.
create table if not exists auth_user_sets (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists auth_user_sets_space on auth_user_sets (http_space_id);

/*
 * Пользователь набора.
 *
 * password_hash -- bcrypt, и только он: пароль приходит в API один раз, тут же
 * хешируется и не сохраняется. Открытый пароль отвергается на входе, как и в
 * users.yaml инспектора.
 *
 * totp_store_id -- ссылка на store-объект. Секрет TOTP восстановим по
 * определению (по нему считают код), поэтому он идёт тем же путём, что PEM:
 * шифруется в браузере ключом контура, контроллер видит только конверт.
 */
create table if not exists auth_users (
    id                uuid primary key default gen_random_uuid(),
    auth_user_set_id  uuid not null references auth_user_sets(id) on delete cascade,
    login             text not null,
    display           text not null default '',
    password_hash     text not null,
    totp_store_id     uuid references store_objects(id) on delete set null,
    groups            text[] not null default '{}',
    enabled           boolean not null default true,
    position          integer not null default 0,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    -- Логин в нижнем регистре: каталоги и люди регистр не различают, а
    -- сравнение по разным правилам в двух местах даёт вход через раз.
    unique (auth_user_set_id, login)
);

create index if not exists auth_users_set on auth_users (auth_user_set_id);
create index if not exists auth_users_totp on auth_users (totp_store_id);

-- Каталог инспекторов: калитка объявляется процессом, как ip и modsec, иначе
-- её нельзя выбрать на маршруте из UX.
insert into inspectors (http_space_id, name, subject, conf)
select s.id, 'auth', 'waf.req.auth', $conf$# inspector.conf — локальная очередь процесса
queue_max     32;
queue_full    drop;
queue_expand  off;
$conf$
  from http_spaces s
 where not exists (
           select 1 from inspectors i
            where i.http_space_id = s.id and i.name = 'auth'
       );
