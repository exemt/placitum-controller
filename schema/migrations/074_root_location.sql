-- Обязательный корень у каждого сервера.
--
-- До этой миграции запрос, не попавший ни в один блок location, жил на уровне
-- server: модуль писал его в аудит как location "/", а uuid пути у такой
-- записи взять было неоткуда. Журнал схлопывает трафик по маршруту именно
-- по uuid (`route.id` записи аудита, waf_route_id в конфиге), и для этого у
-- каждого запроса обязан быть путь. Значит, у каждого сервера обязан быть
-- корень.
--
-- builtin -- запись нельзя удалить и нельзя сменить ей адрес (match и path).
-- Всё остальное правится свободно: обработчик, апстрим, инспекторы, лимиты.
-- Заперт именно адрес, потому что адрес и делает запись корнем; удалённый
-- корень вернул бы запросы на уровень server, где uuid нет.
--
-- Серверу без корня он заводится здесь с обработчиком return 404: до того,
-- как оператор укажет апстрим, сервер честно отвечает «ничего нет», а не
-- падает на сборке. Там, где prefix "/" уже есть, он помечается как корень
-- как есть -- со своим обработчиком и настройками. Дальше корень создаётся
-- вместе с сервером, одной транзакцией.

alter table locations
    add column if not exists builtin boolean not null default false;

comment on column locations.builtin is
    'Корень сервера: не удаляется, match и path не меняются. Заводится вместе с сервером.';

-- Существующий корень становится обязательным.
update locations
   set builtin = true
 where match = 'prefix'
   and path = '/';

-- Серверу без корня -- корень с return 404, в конец списка.
insert into locations
    (server_id, match, path, position, enabled, handler, return_status,
     nginx, waf, raw, raw_nginx, builtin)
select s.id, 'prefix', '/',
       coalesce((select max(l.position) from locations l where l.server_id = s.id), -1) + 1,
       true, 'return', 404,
       '{}'::jsonb, '{}'::jsonb, false, '', true
  from servers s
 where not exists (
        select 1 from locations l
         where l.server_id = s.id
           and l.match = 'prefix'
           and l.path = '/'
       );
