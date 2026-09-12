-- Рукопожатие websocket-пути: запись отказа для запроса без апгрейда.
--
-- Путь с protocol=websocket обычный GET получать не должен: компилятор
-- печатает `waf_require_upgrade on response=upgrade_required`, и модуль
-- отказывает таким запросам локальным слоем, до шины не доходя. 426 -- код,
-- который HTTP отвёл ровно под это.

begin;

insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'upgrade_required', 'http', '{"status": 426}'::jsonb, 63
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'upgrade_required'
       );

commit;
