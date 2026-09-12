-- Селектор корзины у note: имя шкалы получателя в действии правила адреса.
-- Селектор поверх правил приёма получателя, а не адрес: грант остаётся у него.
-- У инициаторов (jsonb outcomes) колонки не нужно -- поле живёт в документе.
alter table ip_profile_rules
    add column if not exists counter text not null default '';
