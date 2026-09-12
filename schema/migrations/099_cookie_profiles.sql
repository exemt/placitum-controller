-- Профили инспектора куки (inspectors/cookie).
--
-- Тот же приём, что у контракта (050), действий (054) и счётчика (057):
-- профиль -- документ jsonb, форма его описана в Go
-- (inspectors/cookie/internal/policy/policy.go, cookie.go) и в контроллере
-- (cookie-profile-doc.ts), колонки на поле разъехались бы с ними на первом
-- новом ключе.
--
-- Документ в два уровня. cookies -- объявления: имя, срок, чем заполняется
-- значение и чем подписывается. rules -- когда её выдать или снять и о чём
-- при этом рассказать соседям каналом действий.

create table if not exists cookie_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: cookies[], conditions[], rules[]. Схема --
    -- inspectors/cookie/README.md.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists cookie_profiles_space on cookie_profiles (http_space_id);

comment on column cookie_profiles.doc is
    'Документ профиля куки. Валидация -- в контроллере и в инспекторе, не в типах.';

-- Каталог инспекторов: кука объявляется процессом, иначе её нельзя поставить
-- на маршрут из UX. Обе фазы: на запросе кука ставится до апстрима, на ответе
-- -- после, и там виден код ответа. Маршрут вправе включить любую отдельно.
insert into inspectors (http_space_id, name, subject, phases, conf)
select s.id, 'cookie', 'waf.req.cookie', array['request', 'response']::text[],
       $conf$# inspector.conf — локальная очередь процесса
queue_max     256;
queue_full    drop;
queue_expand  off;
$conf$
  from http_spaces s
 where not exists (
           select 1 from inspectors i
            where i.http_space_id = s.id and i.name = 'cookie'
       );

update inspectors
   set description = 'Кука: выдаёт и снимает Set-Cookie, пишет её значение в живые наборы и рассказывает соседям. Ничего не проверяет.'
 where name = 'cookie'
   and coalesce(description, '') = '';

-- Профиль default. Пустой намеренно: без объявлений инспектор не выдаёт и не
-- снимает ничего, и это его честное состояние по умолчанию. Существовать он
-- обязан -- поколение без него инспектор отвергает целиком, -- поэтому
-- заводится миграцией, а не оператором.
insert into cookie_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию',
       jsonb_build_object(
           'description', '',
           'cookies', '[]'::jsonb,
           'conditions', '[]'::jsonb,
           'rules', '[]'::jsonb
       )
  from http_spaces s
 where not exists (
           select 1 from cookie_profiles p
            where p.http_space_id = s.id and p.name = 'default'
       );
