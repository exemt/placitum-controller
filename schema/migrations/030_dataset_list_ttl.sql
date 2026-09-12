-- Overlay active-списка: ttl=5m на waf_local_dataset. У записи свой ttl_s
-- сильнее. Нет колонки — компилятор не печатал ttl=, шина не наследовала.

alter table datasets
    add column if not exists ttl text;
