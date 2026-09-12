-- Список отзыва как самостоятельный тип store-объекта.
--
-- До этого CRL приезжал типом `other`. Функционально это работало -- агент
-- пишет объект в файл по uuid и на тип не смотрит, -- но манифест поколения
-- (docs/config-distribution.md) и список store-объектов в UX показывали
-- «прочее» там, где лежит список отзыва. Тип объекта существует ровно для
-- того, чтобы по нему было видно, что внутри, не открывая ciphertext.

alter table store_objects
    drop constraint store_objects_type_check;

alter table store_objects
    add constraint store_objects_type_check
    check (type in (
        'certificate',
        'private_key',
        'chain',
        'ca',
        'crl',
        'creds',
        'dhparam',
        'deny_page',
        'other'
    ));
