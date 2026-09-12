-- Профили инспектора счётчика (inspectors/counter).
--
-- Тот же приём, что у контракта (050) и действий (054): профиль -- документ
-- jsonb, форма описана в Go (inspectors/counter/internal/config/profile.go) и
-- в контроллере (counter-profile-doc.ts), колонки на поле разъехались бы с
-- ними на первом новом ключе.
--
-- Сверх профилей у счётчика есть общая секция -- объявления счётчиков и
-- источники ключей субъектов (counters.yaml). Она одна на инспектор, а не на
-- профиль: счётчики общие по имени, ключи Redis без профиля, и два маршрута с
-- разными профилями намеренно греют один счёт. Отсюда отдельная таблица со
-- строкой на пространство, а не поле в профиле.

create table if not exists counter_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: mode, trigger, request (judge, outcomes), response
    -- (measure). Схема -- docs/inspectors/counter/README.md.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists counter_profiles_space on counter_profiles (http_space_id);

comment on column counter_profiles.doc is
    'Документ профиля счётчика. Валидация -- в контроллере и в инспекторе, не в типах.';

create table if not exists counter_shared (
    http_space_id   uuid primary key references http_spaces(id) on delete cascade,
    -- Документ общей секции: counters (имя -> оси -> max/loss), subjects
    -- (sess.cookie, user.from). В манифест едет псевдопрофилем _shared.
    doc             jsonb not null default '{}'::jsonb,
    updated_at      timestamptz not null default now()
);

comment on table counter_shared is
    'Общая секция счётчика: объявления счётчиков и источники ключей субъектов, одна на пространство.';

-- Каталог инспекторов: счётчик объявляется процессом, иначе его нельзя
-- поставить на маршрут из UX. Обе фазы: фаза ответа меряет, фаза запроса
-- судит, и маршрут вправе включить любую из них отдельно.
insert into inspectors (http_space_id, name, subject, phases, conf)
select s.id, 'counter', 'waf.req.counter', array['request', 'response']::text[],
       $conf$# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
$conf$
  from http_spaces s
 where not exists (
           select 1 from inspectors i
            where i.http_space_id = s.id and i.name = 'counter'
       );

-- Каталог отказов. 429: отказ счётчика -- это «слишком много получено», и
-- врать клиенту другим кодом значит мешать честным клиентам понять паузу.
insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'counter_limit', 'http', '{"status": 429}'::jsonb, 62
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'counter_limit'
       );

-- Общая секция со служебным счётчиком пробы: правило _probe с порогом 0
-- срабатывает на пустой корзине, и healthcheck не зависит ни от Redis, ни от
-- трафика. Ряд заводится только там, где секции ещё нет: объявления оператора
-- миграция не трогает.
insert into counter_shared (http_space_id, doc)
select s.id,
       jsonb_build_object(
           'counters', jsonb_build_object(
               'probe', jsonb_build_object(
                   'unit', '',
                   'axes', jsonb_build_object(
                       'ip', jsonb_build_object('max', 1, 'loss', 100)
                   )
               )
           ),
           'subjects', jsonb_build_object(
               'sess', jsonb_build_object('cookie', 'waf_cid'),
               'user', jsonb_build_object('from', '')
           )
       )
  from http_spaces s
 where not exists (
           select 1 from counter_shared c where c.http_space_id = s.id
       );

-- Профиль default. Пустой намеренно: без правил judge и measure счётчик ничего
-- не считает и не судит, и это его честное состояние по умолчанию. Существовать
-- он обязан -- поколение без него инспектор отвергает целиком.
insert into counter_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Правил нет: счётчик молчит',
       jsonb_build_object(
           'mode', 'enforce',
           'description', 'Правил нет: счётчик молчит',
           'request', jsonb_build_object('enabled', true, 'judge', '[]'::jsonb),
           'response', jsonb_build_object('enabled', true, 'measure', '[]'::jsonb)
       )
  from http_spaces s
 where not exists (
           select 1 from counter_profiles p
            where p.http_space_id = s.id and p.name = 'default'
       );

-- Служебный профиль пробы: deny с пустой корзины, см. cmd/probe инспектора.
insert into counter_profiles (http_space_id, name, description, doc)
select s.id, '_probe', 'Проба: deny с пустой корзины',
       jsonb_build_object(
           'mode', 'enforce',
           'description', 'Проба: deny с пустой корзины',
           'request', jsonb_build_object(
               'enabled', true,
               'deny_response', 'counter_limit',
               'judge', jsonb_build_array(jsonb_build_object(
                   'counter', 'probe',
                   'axis', 'ip',
                   'at', 0,
                   'action', 'deny',
                   'code', 'CNT_PROBE'
               ))
           ),
           'response', jsonb_build_object('enabled', false)
       )
  from http_spaces s
 where not exists (
           select 1 from counter_profiles p
            where p.http_space_id = s.id and p.name = '_probe'
       );
