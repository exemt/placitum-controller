-- Каталог инспекторов -- процессы, не алиасы стендовых маршрутов.
-- Было десять имён на четыре subject: crs/modsec, ai/model/model-ip/vlai,
-- pii-wiki/pii-out/pii. В каталоге остаются ip, modsec, vlai, pii.

create or replace function waf_rename_inspector_refs(doc jsonb, from_name text, to_name text)
returns jsonb
language plpgsql
as $$
declare
  key text;
  arr jsonb;
  updated jsonb := doc;
begin
  if doc is null then
    return doc;
  end if;

  foreach key in array array['requestInspectors', 'responseInspectors']
  loop
    if jsonb_typeof(doc -> key) = 'array' then
      select jsonb_agg(
        case
          when elem ? 'name' and elem ->> 'name' = from_name
            then jsonb_set(elem, '{name}', to_jsonb(to_name))
          else elem
        end
      )
      into arr
      from jsonb_array_elements(doc -> key) as elem;
      updated := jsonb_set(updated, array[key], coalesce(arr, '[]'::jsonb));
    end if;
  end loop;

  foreach key in array array['inspectorModes', 'inspectorProfiles']
  loop
    if jsonb_typeof(doc -> key) = 'object' and doc -> key ? from_name then
      updated := jsonb_set(
        updated - key,
        array[key],
        (doc -> key) - from_name || jsonb_build_object(to_name, doc -> key -> from_name)
      );
    end if;
  end loop;

  return updated;
end;
$$;

update locations
set waf = waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(waf, 'crs', 'modsec'),
        'ai', 'vlai'),
        'model', 'vlai'),
        'model-ip', 'vlai'),
        'pii-wiki', 'pii'),
        'pii-out', 'pii')
where waf is not null and waf <> '{}'::jsonb;

update servers
set waf = waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(waf, 'crs', 'modsec'),
        'ai', 'vlai'),
        'model', 'vlai'),
        'model-ip', 'vlai'),
        'pii-wiki', 'pii'),
        'pii-out', 'pii')
where waf is not null and waf <> '{}'::jsonb;

update http_spaces
set waf = waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(
      waf_rename_inspector_refs(waf, 'crs', 'modsec'),
        'ai', 'vlai'),
        'model', 'vlai'),
        'model-ip', 'vlai'),
        'pii-wiki', 'pii'),
        'pii-out', 'pii')
where waf is not null and waf <> '{}'::jsonb;

delete from inspectors
where name in ('ai', 'crs', 'model', 'model-ip', 'pii-out', 'pii-wiki');

update inspectors child
set after = array[parent.id]
from inspectors parent
where child.name = 'modsec'
  and parent.name = 'ip'
  and child.http_space_id = parent.http_space_id;

update inspectors child
set after = array[
    (select ip.id from inspectors ip
      where ip.http_space_id = child.http_space_id and ip.name = 'ip'),
    (select ms.id from inspectors ms
      where ms.http_space_id = child.http_space_id and ms.name = 'modsec')
]
where child.name = 'vlai';

drop function waf_rename_inspector_refs(jsonb, text, text);
