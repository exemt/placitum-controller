--
-- Решения по запросу переезжают с пространства на серверы.
--
-- Граница модели: `http {}` -- конфигурация контура (процесс, шина, зона,
-- каталоги и реестр `waf_inspector`), сервер и путь -- решения по запросу
-- (включён ли WAF, кого звать, что блокировать локально, каков бюджет).
--
-- Причина не в удобстве. На проде серверы принадлежат разным клиентам, и один
-- набор политик на контур для них либо избыточен, либо недостаточен: общий
-- `waf_deadline` и общий набор инспекторов для API и для статики -- это либо
-- лишняя латентность, либо непроверенный трафик. Раньше такие ключи стояли на
-- пространстве и молча наследовались всеми; теперь компилятор их там отвергает
-- (`route_at_http`).
--
-- Миграция переносит их вниз, а не удаляет: конфигурация обязана остаться той
-- же. `||` справа налево -- ключ, уже заданный на сервере, побеждает, как и при
-- наследовании.
--
-- На пространстве остаются только `inspectors` и `inspectorProfiles`.
--

update servers s
   set waf = (
        (h.waf - 'inspectors' - 'inspectorProfiles') || s.waf
   )
  from http_spaces h
 where s.http_space_id = h.id
   and h.waf is not null
   and (h.waf - 'inspectors' - 'inspectorProfiles') <> '{}'::jsonb;

update http_spaces
   set waf = coalesce(waf, '{}'::jsonb)
             - (
                 select coalesce(array_agg(key), '{}')
                   from jsonb_object_keys(coalesce(waf, '{}'::jsonb)) as key
                  where key not in ('inspectors', 'inspectorProfiles')
               )
 where waf is not null;

comment on column http_spaces.waf is
    'Реестр инспекторов контура: inspectors, inspectorProfiles. Решения по запросу живут на servers.waf и locations.waf.';
