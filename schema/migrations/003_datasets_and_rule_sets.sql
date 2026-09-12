-- Состав локальных наборов и тексты правил modsec.
--
-- Набор -- uuid + имя (плюс объявление nginx: subject, type, max). Адреса не
-- массив на ряде: отдельная таблица, по ним будем искать и делать операции.
-- Desired state по-прежнему здесь; в shm модуля набор попадает снапшотом
-- JetStream, воркер postgres не читает.
--
-- Правила -- как CRS: набор (имя профиля) принадлежит пространству, файлы --
-- сырой SecLang. Имя уникально в пространстве: staging и prod оба могут иметь
-- "strict". Инспектор включает файлы в лексическом порядке имён.
-- Контроллер текст не компилирует.

alter table datasets
    add column created_at timestamptz not null default now(),
    add column updated_at timestamptz not null default now();

create table dataset_addresses (
    id          uuid primary key default gen_random_uuid(),
    dataset_id  uuid not null references datasets(id) on delete cascade,
    address     text not null,
    unique (dataset_id, address)
);

create index dataset_addresses_dataset on dataset_addresses (dataset_id);
create index dataset_addresses_address on dataset_addresses (address);

create table rule_sets (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index rule_sets_space on rule_sets (http_space_id);

create table rule_set_files (
    id           uuid primary key default gen_random_uuid(),
    rule_set_id  uuid not null references rule_sets(id) on delete cascade,
    -- 00-engine.conf, 10-crs-setup.conf, 30-policy.conf -- как в профиле CRS.
    name         text not null,
    text_raw     text not null,
    unique (rule_set_id, name)
);

create index rule_set_files_set on rule_set_files (rule_set_id);
