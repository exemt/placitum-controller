-- Вид набора: список (waf_local_dataset) или содержимое (один файл).
-- Типы элементов списка остаются в datasets.type.
-- Типы файлов -- каталог content_types; тело -- dataset_contents, 1:1.

create table content_types (
    id           uuid primary key default gen_random_uuid(),
    name         text not null unique,
    mime         text not null,
    description  text not null default ''
);

insert into content_types (id, name, mime, description) values
    ('c1000000-0000-4000-8000-000000000001', 'text',   'text/plain',              'Текст'),
    ('c1000000-0000-4000-8000-000000000002', 'html',   'text/html',               'HTML'),
    ('c1000000-0000-4000-8000-000000000003', 'json',   'application/json',        'JSON'),
    ('c1000000-0000-4000-8000-000000000004', 'xml',    'application/xml',         'XML'),
    ('c1000000-0000-4000-8000-000000000005', 'binary', 'application/octet-stream', 'Двоичный файл'),
    ('c1000000-0000-4000-8000-000000000006', 'other',  'application/octet-stream', 'Прочее');

alter table datasets
    add column kind text not null default 'list',
    add column content_type_id uuid references content_types(id);

alter table datasets drop constraint if exists datasets_type_check;

alter table datasets
    add constraint datasets_kind_check
    check (kind in ('list', 'content'));

alter table datasets
    add constraint datasets_kind_shape
    check (
        (kind = 'list'
         and type in ('string', 'numeric', 'ipv4', 'ip')
         and content_type_id is null)
        or
        (kind = 'content' and content_type_id is not null)
    );

create table dataset_contents (
    dataset_id  uuid primary key references datasets(id) on delete cascade,
    name        text not null default '',
    body        bytea not null default ''::bytea,
    updated_at  timestamptz not null default now()
);
