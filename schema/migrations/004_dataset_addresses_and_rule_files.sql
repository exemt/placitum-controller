-- Живой том, на который уже накатился прежний 003: entries text[] на наборе
-- и одно body на правилах. Раскладывает состав в ряды и файлы, колонки снимает.
-- На пустой том после нового 003 этот файл ничего не ломает.

create table if not exists dataset_addresses (
    id          uuid primary key default gen_random_uuid(),
    dataset_id  uuid not null references datasets(id) on delete cascade,
    address     text not null,
    unique (dataset_id, address)
);

create index if not exists dataset_addresses_dataset on dataset_addresses (dataset_id);
create index if not exists dataset_addresses_address on dataset_addresses (address);

create table if not exists rule_set_files (
    id           uuid primary key default gen_random_uuid(),
    rule_set_id  uuid not null references rule_sets(id) on delete cascade,
    name         text not null,
    text_raw     text not null,
    unique (rule_set_id, name)
);

create index if not exists rule_set_files_set on rule_set_files (rule_set_id);

do $$
begin
    if exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'datasets'
           and column_name = 'entries'
    ) then
        insert into dataset_addresses (dataset_id, address)
        select d.id, trim(e)
          from datasets d
          cross join lateral unnest(d.entries) as e
         where trim(e) <> ''
        on conflict (dataset_id, address) do nothing;

        alter table datasets drop constraint if exists datasets_entries_max;
        alter table datasets drop column entries;
    end if;

    if exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'rule_sets'
           and column_name = 'body'
    ) then
        insert into rule_set_files (rule_set_id, name, text_raw)
        select id, '00-rules.conf', body
          from rule_sets
         where body is not null and body <> ''
        on conflict (rule_set_id, name) do nothing;

        alter table rule_sets drop column body;
    end if;
end $$;
