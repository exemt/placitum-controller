-- Наборы и правила адреса вместо двух сторон профиля.
--
-- Составной набор -- именованное выражение над сырьём: списки, страны, ASN,
-- минус исключения, плюс inverse. Колонки повторяют прежнюю сторону один в
-- один, поэтому перенос -- копирование, а не преобразование.
--
-- Профиль своих адресов больше не содержит: он ссылается на наборы и говорит
-- про каждый, что тот значит. "Белый" и "чёрный" остались двумя из пяти
-- значений колонки action.
--
-- docs/profiles.md репозитория ip

create table if not exists ip_sets (
    id                   uuid primary key default gen_random_uuid(),
    http_space_id        uuid not null references http_spaces(id) on delete cascade,
    name                 text not null,
    description          text not null default '',
    inverse              boolean not null default false,
    countries            text[] not null default '{}',
    asns                 bigint[] not null default '{}',
    exclude_countries    text[] not null default '{}',
    exclude_asns         bigint[] not null default '{}',
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists ip_sets_space on ip_sets (http_space_id);

create table if not exists ip_set_lists (
    ip_set_id   uuid not null references ip_sets(id) on delete cascade,
    dataset_id  uuid not null references datasets(id) on delete restrict,
    exclude     boolean not null default false,
    position    integer not null default 0,
    unique (ip_set_id, dataset_id, exclude)
);

create index if not exists ip_set_lists_dataset on ip_set_lists (dataset_id);

-- Действие правила. Терминальные дают вердикт и заканчивают проход,
-- накопительные -- нет; проверку "что с чем сочетается" держит приложение,
-- здесь только словарь.
create table if not exists ip_profile_rules (
    id             uuid primary key default gen_random_uuid(),
    ip_profile_id  uuid not null references ip_profiles(id) on delete cascade,
    position       integer not null default 0,
    ip_set_id      uuid not null references ip_sets(id) on delete restrict,
    action         text not null check (action in ('allow', 'deny', 'score', 'request', 'list')),
    response       text not null default '',
    code           text not null default '',
    score          integer,
    to_inspector   text not null default '',
    do_verb        text not null default '',
    -- Ось: о ком высказывание. Пара глагол-ось проверяется приложением:
    -- модуль отбраковывает ответ с несовпадением целиком.
    apply_axis     text not null default '',
    delta          integer,
    value          integer,
    list_dataset_id uuid references datasets(id) on delete restrict,
    list_ttl_s     integer not null default 0,
    enabled        boolean not null default true
);

create index if not exists ip_profile_rules_profile
    on ip_profile_rules (ip_profile_id, position);

create index if not exists ip_profile_rules_set on ip_profile_rules (ip_set_id);

-- Строка "иначе": чем закрывается профиль, в котором не совпало ни одно
-- правило. Умолчание allow -- прежнее поведение.
alter table ip_profiles
    add column if not exists default_action text not null default 'allow',
    add column if not exists default_score integer,
    add column if not exists default_code text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ip_profiles_default_action_check'
  ) then
    alter table ip_profiles
      add constraint ip_profiles_default_action_check
      check (default_action in ('allow', 'deny', 'score'));
  end if;
end $$;

-- --- перенос -----------------------------------------------------------------
--
-- Каждая непустая сторона становится набором <профиль>.white / <профиль>.black
-- и одним правилом. Порядок тот же, что был зашит в инспекторе: белый раньше
-- чёрного, потому что исключение обязано побеждать запрет.

do $$
declare
  side record;
  new_set uuid;
  seq int;
begin
  if to_regclass('public.ip_profile_lists') is null then
    return;
  end if;

  for side in
    select p.id as profile_id, p.http_space_id, p.name as profile_name,
           s.side,
           case when s.side = 'whitelist' then p.whitelist_inverse
                else p.blacklist_inverse end as inverse,
           case when s.side = 'whitelist' then p.whitelist_countries
                else p.blacklist_countries end as countries,
           case when s.side = 'whitelist' then p.whitelist_asns
                else p.blacklist_asns end as asns,
           case when s.side = 'whitelist' then p.whitelist_exclude_countries
                else p.blacklist_exclude_countries end as ex_countries,
           case when s.side = 'whitelist' then p.whitelist_exclude_asns
                else p.blacklist_exclude_asns end as ex_asns
      from ip_profiles p
      cross join (values ('whitelist'), ('blacklist')) as s(side)
     -- Не по алфавиту: 'blacklist' < 'whitelist', и чёрное правило встало бы
     -- первым. Порядок правил решает исход, а прежний порядок проверок был
     -- «белый, потом чёрный» -- исключение обязано побеждать запрет.
     order by p.name, case when s.side = 'whitelist' then 0 else 1 end
  loop
    -- Пустая сторона правила не порождает: набор без единого блока не
    -- совпадает ни с чем, и правило по нему было бы мусором в таблице.
    if coalesce(array_length(side.countries, 1), 0) = 0
       and coalesce(array_length(side.asns, 1), 0) = 0
       and not exists (
         select 1 from ip_profile_lists m
          where m.ip_profile_id = side.profile_id
            and m.side = side.side
            and not m.exclude
       )
    then
      continue;
    end if;

    insert into ip_sets (
      http_space_id, name, description,
      inverse, countries, asns, exclude_countries, exclude_asns
    ) values (
      side.http_space_id,
      side.profile_name || case when side.side = 'whitelist' then '.white' else '.black' end,
      'Перенесено из стороны профиля ' || side.profile_name,
      side.inverse,
      coalesce(side.countries, '{}'),
      coalesce(side.asns, '{}'),
      coalesce(side.ex_countries, '{}'),
      coalesce(side.ex_asns, '{}')
    )
    on conflict (http_space_id, name) do update set updated_at = now()
    returning id into new_set;

    insert into ip_set_lists (ip_set_id, dataset_id, exclude, position)
    select new_set, m.dataset_id, m.exclude, m.position
      from ip_profile_lists m
     where m.ip_profile_id = side.profile_id
       and m.side = side.side
    on conflict do nothing;

    select coalesce(max(position), 0) + 1 into seq
      from ip_profile_rules where ip_profile_id = side.profile_id;

    insert into ip_profile_rules (ip_profile_id, position, ip_set_id, action, response)
    select side.profile_id, seq, new_set,
           case when side.side = 'whitelist' then 'allow' else 'deny' end,
           case when side.side = 'whitelist' then '' else 'blocked' end
     where not exists (
       select 1 from ip_profile_rules r
        where r.ip_profile_id = side.profile_id and r.ip_set_id = new_set
     );
  end loop;
end $$;

drop table if exists ip_profile_lists;

alter table ip_profiles
    drop column if exists whitelist_inverse,
    drop column if exists blacklist_inverse,
    drop column if exists whitelist_countries,
    drop column if exists blacklist_countries,
    drop column if exists whitelist_asns,
    drop column if exists blacklist_asns,
    drop column if exists whitelist_exclude_countries,
    drop column if exists blacklist_exclude_countries,
    drop column if exists whitelist_exclude_asns,
    drop column if exists blacklist_exclude_asns;
