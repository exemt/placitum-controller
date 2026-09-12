-- Пространство default и привязка правил к пространству.
-- На живом томе 001/003 уже накатились без этого.

insert into http_spaces (name)
values ('default')
on conflict (name) do nothing;

alter table rule_sets
    add column if not exists http_space_id uuid references http_spaces(id) on delete cascade;

update rule_sets
   set http_space_id = (select id from http_spaces where name = 'default')
 where http_space_id is null;

alter table rule_sets
    alter column http_space_id set not null;

alter table rule_sets drop constraint if exists rule_sets_name_key;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'rule_sets_http_space_id_name_key'
    ) then
        alter table rule_sets
            add constraint rule_sets_http_space_id_name_key unique (http_space_id, name);
    end if;
end $$;

create index if not exists rule_sets_space on rule_sets (http_space_id);
