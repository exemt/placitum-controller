-- Файлы SecLang -- каталог пространства, не принадлежат профилю.
-- Профиль (rule_sets) -- упорядоченный список файлов; имя профиля уходит
-- в waf_inspector_profile. Порядок -- position, не лексика имени.
-- Один файл может входить в несколько профилей.

create table if not exists rule_files (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    text_raw        text not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists rule_files_space on rule_files (http_space_id);

alter table rule_set_files
    add column if not exists rule_file_id uuid,
    add column if not exists position integer not null default 0;

do $$
begin
    if exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'rule_set_files'
           and column_name = 'text_raw'
    ) then
        insert into rule_files (id, http_space_id, name, description, text_raw)
        select f.id,
               s.http_space_id,
               case
                 when count(*) over (partition by s.http_space_id, f.name) > 1
                 then f.name || '-' || substr(replace(f.id::text, '-', ''), 1, 8)
                 else f.name
               end,
               '',
               f.text_raw
          from rule_set_files f
          join rule_sets s on s.id = f.rule_set_id
        on conflict (id) do nothing;

        update rule_set_files
           set rule_file_id = id
         where rule_file_id is null;

        update rule_set_files f
           set position = sub.ord
          from (
            select id,
                   row_number() over (partition by rule_set_id order by name) - 1 as ord
              from rule_set_files
          ) sub
         where f.id = sub.id;

        alter table rule_set_files
            drop constraint if exists rule_set_files_rule_set_id_name_key;
        alter table rule_set_files drop column name;
        alter table rule_set_files drop column text_raw;
    end if;
end $$;

do $$
begin
    if exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'rule_set_files'
           and column_name = 'rule_file_id'
           and is_nullable = 'YES'
    ) then
        update rule_set_files
           set rule_file_id = id
         where rule_file_id is null;
        delete from rule_set_files where rule_file_id is null;
        alter table rule_set_files
            alter column rule_file_id set not null;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conname = 'rule_set_files_rule_file_id_fkey'
    ) then
        alter table rule_set_files
            add constraint rule_set_files_rule_file_id_fkey
            foreign key (rule_file_id) references rule_files(id) on delete restrict;
    end if;

    if not exists (
        select 1 from pg_constraint
         where conname = 'rule_set_files_rule_set_id_rule_file_id_key'
    ) then
        alter table rule_set_files
            add constraint rule_set_files_rule_set_id_rule_file_id_key
            unique (rule_set_id, rule_file_id);
    end if;
end $$;

create index if not exists rule_set_files_file on rule_set_files (rule_file_id);
