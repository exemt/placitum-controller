-- Профили инспектора rewrite (inspectors/rewrite) -- модификация ответов.
--
-- Тот же приём, что у действий (054): профиль -- документ jsonb, форма его
-- описана в Go (inspectors/rewrite/internal/config/profile.go) и в контроллере
-- (rewrite-profile-doc.ts), колонки на поле разъехались бы с ними на первом
-- новом ключе.
--
-- Профиль -- группы модификаторов (regex по телу, операции над заголовками,
-- условия по коду и типу), правила приёма чужих просьб (trigger.prior:
-- mutate и skip) и политика на решённую, но несостоявшуюся подмену (снята в 089).
-- Сами байты и regex до nginx не доезжают никогда: модуль поднимает
-- переписанный объект из обменника по секции rewrite реплая.

create table if not exists rewrite_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: mode, deny_response, groups[], prior[] (on_error снят в 089).
    -- Схема -- inspectors/rewrite/README.md.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists rewrite_profiles_space on rewrite_profiles (http_space_id);

comment on column rewrite_profiles.doc is
    'Документ профиля rewrite. Валидация -- в контроллере и в инспекторе, не в типах.';

-- Каталог инспекторов: процесс объявляется здесь, иначе его нельзя поставить
-- на маршрут из UX. Фаза одна -- ответ: править нечего, пока апстрим не
-- ответил. Декларации этого процесса получают mutate=on при сборке nginx.
insert into inspectors (http_space_id, name, subject, phases, conf, description)
select s.id, 'rewrite', 'waf.req.rewrite', array['response']::text[],
       $conf$# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
$conf$,
       'Модификация ответов: подмена тела через обменник, операции над заголовками'
  from http_spaces s
 where not exists (
           select 1 from inspectors i
            where i.http_space_id = s.id and i.name = 'rewrite'
       );

-- Страница отказа: подмена решена, но обменник не отдал объект.
-- 502 -- виноват контур, не клиент; отдать оригинал значило бы слить ровно
-- то, что маскировали.
insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'rewrite_failed', 'http', '{"status": 502}'::jsonb, 63
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'rewrite_failed'
       );

-- Профиль default. mode off -- инертная точка опоры, как у остальных
-- подсистем (060_default_profiles.sql): поколение без default инспектор
-- отвергает целиком, поэтому он заводится миграцией, а не оператором.
insert into rewrite_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию, выключен', '{"mode":"off"}'::jsonb
  from http_spaces s
 where not exists (
         select 1 from rewrite_profiles p
          where p.http_space_id = s.id and p.name = 'default');
