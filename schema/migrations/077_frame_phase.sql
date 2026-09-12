-- Фаза кадров WebSocket: первая итерация обработчика в модуле
-- (docs/streaming.md#websocket) и инспекторы на кадрах.
--
-- Каталог: процессы json и modsec умеют фазу frame -- селектор набора на
-- маршруте предлагает только умеющих её. Заявка возможностей, не расписание:
-- когда их зовут, решает waf_inspect frame:c2s на маршруте.
--
-- Каталог отказов: запись ws_policy type=websocket -- код и причина кадра
-- Close, которым модуль закрывает соединение по отказу на кадре. Её же
-- называет умолчание deny_response направлений в профиле контракта.

begin;

update inspectors
   set phases = array_append(phases, 'frame')
 where name in ('json', 'modsec')
   and not ('frame' = any(phases));

insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'ws_policy', 'websocket',
       '{"code": 1008, "reason": "policy violation"}'::jsonb, 62
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'ws_policy'
       );

commit;
