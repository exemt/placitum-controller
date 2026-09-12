-- Объекты store: ciphertext в Postgres, не в S3.
--
-- Идентификатор глобальный UUID -- тот же, что в шаблоне `store:<uuid>` и в
-- GET /api/store/:uuid. Пространству http объект не принадлежит: один ключ
-- может ссылаться из нескольких серверов, откат поколения не копирует blob.
--
-- Контроллер тела не открывает. blob -- непрозрачный конверт (DEK + ciphertext),
-- который собрал браузер. metadata -- то, что можно показать без ключа: имя,
-- заметка, срок. type -- зачем объект, не формат байтов.
--
-- Объект не обновляется: замена файла -- новый UUID и правка ссылки. Старый
-- ряд остаётся, иначе откат поколения не нашёл бы ключ.

create table store_objects (
    id          uuid primary key default gen_random_uuid(),
    type        text not null
                check (type in (
                    'certificate',
                    'private_key',
                    'chain',
                    'ca',
                    'creds',
                    'dhparam',
                    'deny_page',
                    'other'
                )),
    metadata    jsonb not null default '{}',
    blob        bytea not null,
    created_at  timestamptz not null default now()
);

create index store_objects_type on store_objects (type);

alter table certificates
    add constraint certificates_cert_store_fk
        foreign key (cert_store_id) references store_objects(id)
        on delete restrict,
    add constraint certificates_key_store_fk
        foreign key (key_store_id) references store_objects(id)
        on delete restrict,
    add constraint certificates_chain_store_fk
        foreign key (chain_store_id) references store_objects(id)
        on delete restrict;
