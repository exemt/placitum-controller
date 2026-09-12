-- SHA-256 листового сертификата, посчитанный crypto-сервисом при загрузке
-- (см. docs/crypto-service.md), не браузером: значение из ciphertext, а не
-- то, что клиент заявил о себе. Показывается оператору для идентификации
-- пары без повторного открытия store-объекта.
--
-- not null без default: таблица заполняется только через POST /certificates,
-- которого до этой миграции не было -- строк с NULL быть не может.

alter table certificates
    add column fingerprint text not null;
