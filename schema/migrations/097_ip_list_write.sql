-- Кого строка IP фильтра пишет в набор: адрес клиента либо то, во что он
-- разворачивается у кодера гео -- эффективный анонс (net), все анонсы,
-- накрывающие адрес (net_all), состав системы (asn). Те же слова, что у
-- остальных отправителей канала. Инициаторы держат ключ write в том же jsonb
-- (outcomes); правилам нужна колонка -- как ask_phase (096).
alter table ip_profile_rules
    add column if not exists list_write text not null default 'addr';

alter table ip_profile_rules
    drop constraint if exists ip_profile_rules_list_write;

alter table ip_profile_rules
    add constraint ip_profile_rules_list_write
        check (list_write in ('addr', 'net', 'net_all', 'asn'));

comment on column ip_profile_rules.list_write is
    'Кого писать в набор у action list: addr, net, net_all, asn. Подсеть и систему инспектор берёт у кодера гео и пишет одной пачкой.';
