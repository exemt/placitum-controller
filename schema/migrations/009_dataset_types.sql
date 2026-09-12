-- Типы набора: строка, число, IPv4, IPv4+IPv6.
-- Старый cidr принимал оба семейства -- это теперь ip.
-- Тип задаётся при создании; элементы IP хранятся в CIDR с маской.

alter table datasets drop constraint if exists datasets_type_check;

update datasets set type = 'ip' where type = 'cidr';

alter table datasets
    alter column type set default 'ipv4';

alter table datasets
    add constraint datasets_type_check
    check (type in ('string', 'numeric', 'ipv4', 'ip'));
