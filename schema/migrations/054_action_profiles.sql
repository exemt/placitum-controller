-- Профили инспектора действий (inspectors/action).
--
-- Тот же приём, что у контракта (050): профиль -- документ jsonb, форма его
-- описана в Go (inspectors/action/internal/policy/policy.go) и в контроллере
-- (action-profile-doc.ts), колонки на поле разъехались бы с ними на первом
-- новом ключе.
--
-- Инспектор ничего не проверяет: он смотрит на маршрут и рассказывает соседям
-- действиями канала docs/inspector-actions.md. Правило -- признак запроса
-- (префикс пути, суффиксы, методы) плюс список просьб.

create table if not exists action_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: mode, rules[]. Схема -- inspectors/action/README.md.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists action_profiles_space on action_profiles (http_space_id);

comment on column action_profiles.doc is
    'Документ профиля действий. Валидация -- в контроллере и в инспекторе, не в типах.';

-- Каталог инспекторов: отправитель объявляется процессом, иначе его нельзя
-- поставить на маршрут из UX. Фаза одна: действия едут только с запроса.
insert into inspectors (http_space_id, name, subject, phases, conf)
select s.id, 'action', 'waf.req.action', array['request']::text[],
       $conf$# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
$conf$
  from http_spaces s
 where not exists (
           select 1 from inspectors i
            where i.http_space_id = s.id and i.name = 'action'
       );

-- Профиль default. Пустой намеренно: без правил инспектор молчит, и это его
-- честное состояние по умолчанию. Существовать он обязан -- поколение без него
-- инспектор отвергает целиком, -- поэтому заводится миграцией, а не оператором.
insert into action_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Правил нет: инспектор молчит',
       jsonb_build_object(
           'mode', 'enforce',
           'description', 'Правил нет: инспектор молчит',
           'rules', '[]'::jsonb
       )
  from http_spaces s
 where not exists (
           select 1 from action_profiles p
            where p.http_space_id = s.id and p.name = 'default'
       );
