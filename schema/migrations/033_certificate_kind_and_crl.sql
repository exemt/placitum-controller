-- Два типа сертификата и список отзыва.
--
-- До этой миграции `kind` жил только на привязке (server_certificates): сама
-- строка certificates всегда была парой «сертификат + приватный ключ», потому
-- что key_store_id был not null. Загрузить доверенный корень для mTLS было
-- нельзя в принципе -- у CA приватной половины в контуре нет и быть не должно,
-- а форма и crypto-сервис требовали ключ. Привязать при этом можно было
-- `client_ca`, то есть UX предлагал назначение, которого не существовало.
--
-- Теперь тип -- свойство самого сертификата:
--   server    -- ssl_certificate + ssl_certificate_key, ключ обязателен;
--   client_ca -- ssl_client_certificate (+ ssl_crl), ключа нет.
-- `trusted` в attach остаётся как назначение привязки: ssl_trusted_certificate
-- печатается из того же PEM, что и client_ca, отдельного типа не требует.

alter table certificates
    add column kind text not null default 'server'
               check (kind in ('server', 'client_ca'));

-- Ключ обязателен только у серверной пары. У client_ca его наличие -- ошибка
-- оператора (загрузил приватный ключ CA в контур), а не безобидная мелочь.
alter table certificates
    alter column key_store_id drop not null;

alter table certificates
    add constraint certificates_key_matches_kind
    check (
        (kind = 'server'    and key_store_id is not null) or
        (kind = 'client_ca' and key_store_id is null)
    );

-- Разбор сертификата crypto-сервисом, не заявление браузера. subject/issuer
-- показываются оператору: у client_ca SAN обычно пуст, и отличить два корня
-- в списке можно только по subject.
alter table certificates
    add column subject text not null default '',
    add column issuer  text not null default '',
    add column serial  text not null default '';

-- --- список отзыва (CRL) ---------------------------------------------------
--
-- Живёт на строке client_ca, а не отдельной сущностью: nginx печатает
-- `ssl_crl` рядом с `ssl_client_certificate`, один список на один корень.
-- store-объекты неизменяемы, поэтому обновление CRL -- это новый crl_store_id
-- на той же строке, а не update блоба.
--
-- this_update / next_update / revoked -- разбор crypto-сервиса
-- (POST /v1/crl/metadata). next_update опционален по RFC 5280.
alter table certificates
    add column crl_store_id    uuid,
    add column crl_this_update timestamptz,
    add column crl_next_update timestamptz,
    add column crl_revoked     integer,
    add column crl_issuer      text;

-- CRL без корня, к которому он относится, nginx применить не к чему.
alter table certificates
    add constraint certificates_crl_needs_client_ca
    check (crl_store_id is null or kind = 'client_ca');
