-- Keeper (docs/keeper.md): состав активных наборов держит keeper, адресует
-- их именем (waf.sets.<name>) и нумерует изменения в памяти. Тема шины и
-- bus_seq остались от секвенсора контроллера; читать их больше некому.

alter table datasets drop column if exists subject;
alter table datasets drop column if exists bus_seq;
