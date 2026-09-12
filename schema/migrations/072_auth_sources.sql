-- Источники входа калитки.
--
-- Профиль разрезан на две сущности: источник (провайдер, форма, сессии,
-- список, upstream, lockout, roster -- всё про сам вход) и профиль-калитку
-- (mode, gate, trigger + ссылка source). Источники объявляются первыми,
-- профили привязываются к ним -- как корзины и профили у счётчика.
--
-- Прежнее «пространство сессий = совпадение имён кук» становится ссылкой:
-- профили одного источника принимают сессии друг друга, источники независимы,
-- и кука уникальна на источник. Поэтому данные группируются по действующей
-- куке (явной либо умолчанию waf_sid_<имя профиля>): одна группа -- один
-- источник, представитель -- самый ранний профиль с формой (login.uri).
--
-- identity.from раньше называл профиль, теперь -- источник: переписывается на
-- имя источника той группы, куда попал названный профиль.
--
-- server_id переезжает с профиля на источник: он был нужен только проверке
-- адреса формы, а форма теперь живёт на источнике.

begin;

create table if not exists auth_sources (
    id            uuid primary key default gen_random_uuid(),
    http_space_id uuid not null references http_spaces(id) on delete cascade,
    server_id     uuid references servers(id) on delete set null,
    name          text not null,
    description   text not null default '',
    doc           jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (http_space_id, name)
);

do $$
declare
    p          record;
    grp        record;
    rep        record;
    src_name   text;
    src_doc    jsonb;
    new_from   text;
begin
    -- Карта профиль -> источник, чтобы переписать identity.from вторым проходом.
    create temporary table _auth_group (
        http_space_id uuid,
        profile_name  text,
        cookie        text,
        source_name   text
    ) on commit drop;

    -- 1. Группы: действующая кука каждого профиля, которому нужен источник.
    --    Профиль mode: off без провайдера и формы источника не требует.
    insert into _auth_group (http_space_id, profile_name, cookie)
    select a.http_space_id, a.name,
           coalesce(nullif(a.doc #>> '{session,cookie}', ''), 'waf_sid_' || a.name)
      from auth_profiles a
     where coalesce(a.doc ->> 'mode', 'off') <> 'off'
        or coalesce(a.doc ->> 'provider', '') <> ''
        or coalesce(a.doc #>> '{login,uri}', '') <> '';

    -- 2. Один источник на группу. Представитель -- самый ранний профиль с
    --    формой; без единого такого -- просто самый ранний: источник родится
    --    без login.uri, и send честно откажет, пока оператор не заполнит форму.
    for grp in
        select distinct g.http_space_id, g.cookie from _auth_group g
    loop
        select a.* into rep
          from auth_profiles a
          join _auth_group g
            on g.http_space_id = a.http_space_id and g.profile_name = a.name
         where g.http_space_id = grp.http_space_id and g.cookie = grp.cookie
         order by (coalesce(a.doc #>> '{login,uri}', '') = '') asc, a.created_at asc
         limit 1;

        src_name := rep.name;

        src_doc := jsonb_strip_nulls(jsonb_build_object(
            'login',     rep.doc -> 'login',
            'session',   rep.doc -> 'session',
            'ticket',    rep.doc -> 'ticket',
            'list',      rep.doc -> 'list',
            'upstream',  rep.doc -> 'upstream',
            'provider',  rep.doc -> 'provider',
            'identity',  rep.doc -> 'identity',
            'providers', rep.doc -> 'providers',
            'lockout',   rep.doc -> 'lockout',
            'roster',    rep.doc -> 'roster'
        ));

        insert into auth_sources (http_space_id, server_id, name, description, doc)
        values (grp.http_space_id, rep.server_id, src_name,
                'Источник входа (из профиля ' || rep.name || ')', src_doc)
        on conflict (http_space_id, name) do nothing;

        update _auth_group g
           set source_name = src_name
         where g.http_space_id = grp.http_space_id and g.cookie = grp.cookie;
    end loop;

    -- 3. identity.from: имя профиля -> имя источника его группы.
    for p in select s.id, s.http_space_id, s.doc from auth_sources s
    loop
        if coalesce(p.doc #>> '{identity,from}', '') = '' then
            continue;
        end if;

        select g.source_name into new_from
          from _auth_group g
         where g.http_space_id = p.http_space_id
           and g.profile_name = p.doc #>> '{identity,from}';

        if new_from is not null and new_from <> p.doc #>> '{identity,from}' then
            update auth_sources
               set doc = jsonb_set(doc, '{identity,from}', to_jsonb(new_from))
             where id = p.id;
        end if;
    end loop;

    -- 4. Профили ужимаются до новой формы: mode, source, gate, trigger.
    update auth_profiles a
       set doc = jsonb_strip_nulls(jsonb_build_object(
               'mode',    coalesce(a.doc -> 'mode', '"enforce"'::jsonb),
               'source',  coalesce(to_jsonb(g.source_name), '""'::jsonb),
               'gate',    a.doc -> 'gate',
               'trigger', a.doc -> 'trigger'
           )),
           updated_at = now()
      from _auth_group g
     where g.http_space_id = a.http_space_id and g.profile_name = a.name;

    -- Профили вне групп (инертные mode: off) ужимаются без ссылки.
    update auth_profiles a
       set doc = jsonb_build_object('mode', coalesce(a.doc ->> 'mode', 'off')),
           updated_at = now()
     where not exists (
               select 1 from _auth_group g
                where g.http_space_id = a.http_space_id and g.profile_name = a.name
           );
end $$;

-- 5. Сервер формы теперь у источника.
alter table auth_profiles drop column if exists server_id;

commit;
