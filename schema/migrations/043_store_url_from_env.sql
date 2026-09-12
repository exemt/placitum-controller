-- Адрес и драйвер горячего обменника -- свойство развёртывания, не настройка.
--
-- `url=` был одним из трёх объявлений одного redis: тот же адрес знают агент
-- (nginx/agent/agent.conf) и инспекторы (REDIS_URL в deploy/docker-compose.yml).
-- Правка его в панели двигала только модуль: он клал бы объект в новое
-- хранилище, а инспекторы и агент читали бы старое -- store_error у первых,
-- expired в аудите у второго. Теперь `url=` печатает контроллер из
-- CONTROLLER_REDIS_URL, а в spec остаются сроки и пределы.
--
-- Драйвер сведён к redis: `none` и `inline` горячий путь не вызывает
-- (docs/nginx/module/known-issues.md), маршрут со снимком или архивом при них
-- не проходит `nginx -t`, а `s3` в модуле нет и не будет -- архив пишет агент.
-- `tmpfs` не существовал никогда: он остался в check от первой редакции схемы.

update body_stores
   set driver = 'redis',
       spec   = spec - 'url' - 'driver'
 where driver <> 'redis' or spec ? 'url' or spec ? 'driver';

alter table body_stores
    drop constraint if exists body_stores_driver_check;

alter table body_stores
    add constraint body_stores_driver_check check (driver = 'redis');
