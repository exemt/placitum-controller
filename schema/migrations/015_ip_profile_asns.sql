-- Сторона профиля адреса: страны и автономные системы — одни и те же
-- именованные наборы. Номер ASN, не UUID строки каталога: v4 и v6 едут вместе.

alter table ip_profiles
    add column if not exists whitelist_asns bigint[] not null default '{}',
    add column if not exists blacklist_asns bigint[] not null default '{}';
