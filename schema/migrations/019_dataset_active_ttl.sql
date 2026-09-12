-- Realtime-списки: active включает шину, у записи может быть TTL.
-- bus_seq -- номер последнего опубликованного снапшота/дельты.

alter table datasets
    add column if not exists active boolean not null default false,
    add column if not exists bus_seq bigint not null default 0;

alter table dataset_addresses
    add column if not exists ttl_s integer not null default 0
        check (ttl_s >= 0),
    add column if not exists expires_at timestamptz,
    add column if not exists origin text not null default '',
    add column if not exists reason text not null default '';

create index if not exists dataset_addresses_expires
    on dataset_addresses (expires_at)
    where expires_at is not null;
