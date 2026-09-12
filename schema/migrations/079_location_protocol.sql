-- Протокол пути: http (запрос и ответ) или websocket (рукопожатие и кадры).
--
-- Фазы у пути зависят от протокола, а не от набора ключей: у websocket-пути
-- фазы ответа нет (101 без тела), ключи кадров есть только у него. Пути,
-- заведённые до колонки, угадываются по пресету заголовков апгрейда и по
-- ключам кадров -- других websocket-путей до фазы кадров не было.

begin;

alter table locations
    add column if not exists protocol text not null default 'http';

comment on column locations.protocol is
    'http | websocket: какие фазы у пути; websocket печатает пресет апгрейда и снимает фазу ответа';

update locations
   set protocol = 'websocket'
 where protocol = 'http'
   and (nginx->>'proxyHeaders' = 'websocket' or waf ? 'frameInspectors');

commit;
