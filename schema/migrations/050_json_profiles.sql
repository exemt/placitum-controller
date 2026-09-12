-- Профили контракта API (inspectors/json).
--
-- Тот же приём, что у калитки (037) и капчи (044): профиль -- документ jsonb,
-- форма его описана в Go (inspectors/json/internal/config/profile.go) и в
-- контроллере (json-profile-doc.ts), колонки на поле разъехались бы с ними на
-- первом новом ключе.
--
-- Сервера у профиля нет, в отличие от капчи: адреса он не задаёт вовсе. Что
-- срезать с URI перед сопоставлением со спекой, говорит base_path, а на каком
-- маршруте профиль применяется -- тег profile= записи waf_inspector.
--
-- Спецификация здесь тоже не лежит: она объект содержимого раздела данных, а в
-- документе -- ссылка на него. Так документ остаётся один на всех, кто им
-- пользуется, и правится там же, где остальные файлы контура.

create table if not exists json_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: mode, schema, request, response, bindings, limits,
    -- audit. Схема -- docs/inspectors/json/README.md.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists json_profiles_space on json_profiles (http_space_id);

comment on column json_profiles.doc is
    'Документ профиля контракта. Валидация -- в контроллере и в инспекторе, не в типах.';

-- Каталог инспекторов: контракт объявляется процессом, иначе его нельзя
-- выбрать на маршруте из UX. Обе фазы -- они независимы, и маршрут вправе
-- включить только фазу ответа.
insert into inspectors (http_space_id, name, subject, phases, conf)
select s.id, 'json', 'waf.req.json', array['request', 'response']::text[],
       $conf$# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
$conf$
  from http_spaces s
 where not exists (
           select 1 from inspectors i
            where i.http_space_id = s.id and i.name = 'json'
       );

-- Каталог отказов. Две записи, и разница между ними не косметическая: тело, не
-- сошедшееся с контрактом, -- ошибка клиента (400), а ответ приложения, не
-- сошедшийся со своей же спекой, -- ошибка апстрима (502). Отдавать за вторую
-- 400 значит врать клиенту о том, кто виноват.
insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'json_invalid', 'http', '{"status": 400}'::jsonb, 60
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'json_invalid'
       );

insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'json_response_invalid', 'http', '{"status": 502}'::jsonb, 61
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'json_response_invalid'
       );

-- Профиль default. Выключен намеренно: без спецификации проверять нечего, а
-- пустой включённый профиль выглядел бы как проверка, которой нет. Он обязан
-- существовать -- поколение без него инспектор отвергает целиком, -- поэтому
-- заводится миграцией, а не оператором.
insert into json_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Контракт не задан: проверка выключена',
       jsonb_build_object(
           'mode', 'off',
           'description', 'Контракт не задан: проверка выключена'
       )
  from http_spaces s
 where not exists (
           select 1 from json_profiles p
            where p.http_space_id = s.id and p.name = 'default'
       );
