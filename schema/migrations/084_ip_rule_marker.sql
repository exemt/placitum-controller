-- Метка события у mark: строка, которую модуль кладёт в маркеры записи
-- (docs/inspector-actions.md#маркеры). Живёт рядом с остальными параметрами
-- действия правила адреса; у инициаторов (jsonb outcomes) колонки не нужно --
-- поле живёт в документе, как counter.
alter table ip_profile_rules
    add column if not exists marker text not null default '';
