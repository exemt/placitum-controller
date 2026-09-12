-- Инспектор pii снят с поставки.
--
-- Процесса больше нет: каталог `inspectors/pii`, образ, профили и прогоны
-- убраны из дерева, маршруты `/pii*` сняты с nginx.conf стенда. В базе от него
-- остаётся три следа, и все три надо убрать здесь: иначе панель продолжит
-- показывать имя, которому никто не ответит, а compile напечатает
-- `waf_inspector` на мёртвую тему и первый же запрос уйдёт в дедлайн.
--
-- Первый след -- стендовые маршруты `/pii*` (024). Они заведены ровно ради
-- этого инспектора и других вызовов не несут, поэтому снимаются целиком:
-- оставить их значило бы держать пути, которые ничего не проверяют. Отбор по
-- имени пути и по вызову вместе -- путь с похожим именем, зовущий не его,
-- остаётся на месте. Второй след -- ссылки в `waf` пространства, серверов и
-- маршрутов: узел реестра, вызов на фазе, чужой `after=`, старые
-- `inspectorModes`/`inspectorProfiles`. Третий -- запись каталога.
--
-- Имя и процесс -- разные вещи: спутник, объявленный с `process=pii`, зовёт
-- тот же процесс под своим именем (на стенде так жили `pii-out` и
-- `pii-wiki`). Снять одно `pii` значило бы оставить такой узел без темы.
-- Объявление стоит на любом ярусе, а действует в своём пространстве, поэтому
-- семья имён считается на пространство и применяется ко всему его дереву --
-- иначе вызов спутника на сервере пережил бы удаление узла в пространстве.
--
-- Порядок обязателен: семья считается до правок, маршруты уходят до чистки
-- документов, документы -- до удаления записи каталога. Иначе на пути остался
-- бы вызов имени, которого уже нет.

create or replace function waf_drop_inspector_refs(doc jsonb, names text[])
returns jsonb
language plpgsql
as $$
declare
  key text;
  arr jsonb;
  graph jsonb;
  holder text;
  decl jsonb;
begin
  if doc is null then
    return doc;
  end if;

  -- Вызовы на фазе: элемент с этим именем уходит, соседи по набору остаются.
  -- `all` и `none` -- строки, а не набор имён: там снимать нечего.
  foreach key in array array['requestInspectors', 'responseInspectors']
  loop
    if jsonb_typeof(doc -> key) = 'array' then
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
        into arr
        from jsonb_array_elements(doc -> key) as elem
       where not (elem ? 'name' and elem ->> 'name' = any(names));
      doc := jsonb_set(doc, array[key], arr);
    end if;
  end loop;

  -- Старая форма тех же вызовов: ключ карты -- то же имя.
  foreach key in array array['inspectorModes', 'inspectorProfiles']
  loop
    if jsonb_typeof(doc -> key) = 'object' then
      select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
        into arr
        from jsonb_each(doc -> key) as item
       where not (item.key = any(names));
      doc := jsonb_set(doc, array[key], arr);
    end if;
  end loop;

  -- Реестр: узлы семьи и чужие after=, которые на них ссылались.
  if jsonb_typeof(doc -> 'inspectors') = 'object' then
    select coalesce(jsonb_object_agg(node.key, node.value), '{}'::jsonb)
      into graph
      from jsonb_each(doc -> 'inspectors') as node
     where not (node.key = any(names));

    for holder, decl in select * from jsonb_each(graph)
    loop
      if jsonb_typeof(decl -> 'after') = 'array' then
        select coalesce(jsonb_agg(item), '[]'::jsonb)
          into arr
          from jsonb_array_elements_text(decl -> 'after') as item
         where not (item = any(names));
        graph := jsonb_set(graph, array[holder, 'after'], arr);
      end if;
    end loop;

    doc := jsonb_set(doc, '{inspectors}', graph);
  end if;

  return doc;
end;
$$;

-- Семья имён на пространство: сам процесс и спутники с process=pii, откуда бы
-- их ни объявили.
create temporary table waf_pii_names as
with docs as (
    select id as http_space_id, waf from http_spaces
    union all
    select http_space_id, waf from servers
    union all
    select sv.http_space_id, l.waf
      from locations l
      join servers sv on sv.id = l.server_id
)
select d.http_space_id,
       array['pii']
       || coalesce(
            array_agg(distinct node.key) filter (where node.key is not null),
            '{}'::text[]
          ) as names
  from docs d
  left join lateral jsonb_each(
         case when jsonb_typeof(d.waf -> 'inspectors') = 'object'
              then d.waf -> 'inspectors'
              else '{}'::jsonb
         end
       ) as node
    on node.value ->> 'process' = 'pii'
   and node.key <> 'pii'
 group by d.http_space_id;

-- Маршруты стенда: путь заведён под инспектора и кроме него вызовов не несёт.
delete from locations l
 using servers sv, waf_pii_names n
 where sv.id = l.server_id
   and n.http_space_id = sv.http_space_id
   and l.path like '/pii%'
   and exists (
         select 1
           from jsonb_array_elements(
                  case when jsonb_typeof(l.waf -> 'requestInspectors') = 'array'
                       then l.waf -> 'requestInspectors' else '[]'::jsonb end
                ) as elem
          where elem ->> 'name' = any(n.names)
       );

update locations l
   set waf = waf_drop_inspector_refs(l.waf, n.names)
  from servers sv, waf_pii_names n
 where sv.id = l.server_id
   and n.http_space_id = sv.http_space_id
   and l.waf <> '{}'::jsonb;

update servers sv
   set waf = waf_drop_inspector_refs(sv.waf, n.names)
  from waf_pii_names n
 where n.http_space_id = sv.http_space_id
   and sv.waf <> '{}'::jsonb;

update http_spaces s
   set waf = waf_drop_inspector_refs(s.waf, n.names),
       updated_at = now()
  from waf_pii_names n
 where n.http_space_id = s.id
   and s.waf <> '{}'::jsonb;

delete from inspectors where name = 'pii';

-- Обе вещи одноразовые: переименований, ради которых 028 оставила свою
-- waf_rename_inspector_refs, здесь не будет.
drop table waf_pii_names;
drop function waf_drop_inspector_refs(jsonb, text[]);
