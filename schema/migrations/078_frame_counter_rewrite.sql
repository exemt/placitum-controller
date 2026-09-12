-- Фаза кадров WebSocket, вторая итерация: оба направления и подмена
-- полезной нагрузки (docs/streaming.md#websocket).
--
-- Каталог: процессы counter и rewrite умеют фазу frame -- счётчик меряет и
-- судит кадры в обе стороны (секция frame профиля), rewrite правит полезную
-- нагрузку кадра кадровыми группами (on: frame). Заявка возможностей, не
-- расписание: когда их зовут, решает waf_inspect frame:c2s / frame:s2c на
-- маршруте.

begin;

update inspectors
   set phases = array_append(phases, 'frame')
 where name in ('counter', 'rewrite')
   and not ('frame' = any(phases));

commit;
