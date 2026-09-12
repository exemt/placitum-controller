-- Свободный текст набора: каталог и форма. На compile и шину не влияет.

alter table datasets
    add column if not exists description text not null default '';

comment on column datasets.description is
    'Описание для каталога. На compile и шину не влияет.';
