-- 06.09.2026: у mutate что переключить и куда называет отправитель -- поля
-- group и set в самой просьбе, как корзина у note. Правило приёма rewrite --
-- грант по имени и поводу (from / accept / codes), группу оно больше не
-- называет: ключ groups у правил снимается. У отправителей просьба mutate
-- обязана нести group и set, иначе загрузчик её не примет.
--
-- Общего способа досочинить группу старой просьбе нет -- её знал только
-- грант получателя. Единственный отправитель mutate в поставке -- стендовый
-- профиль action stand-rewrite (inspectors/action/profiles/stand-rewrite.yaml),
-- у него группа prefixed: докручивается здесь же.
begin;

update rewrite_profiles
   set doc = jsonb_set(doc, '{prior}',
       (select coalesce(jsonb_agg(rule - 'groups'), '[]'::jsonb)
          from jsonb_array_elements(doc->'prior') as rule))
 where jsonb_typeof(doc->'prior') = 'array'
   and doc->'prior' <> '[]'::jsonb;

update action_profiles
   set doc = jsonb_set(doc, '{rules}',
       (select coalesce(jsonb_agg(
           case when jsonb_typeof(rule->'actions') = 'array' then
               jsonb_set(rule, '{actions}',
                   (select coalesce(jsonb_agg(
                       case when act->>'do' = 'mutate' and not (act ? 'group')
                            then act || '{"group": "prefixed", "set": "on"}'::jsonb
                            else act end), '[]'::jsonb)
                      from jsonb_array_elements(rule->'actions') as act))
           else rule end), '[]'::jsonb)
          from jsonb_array_elements(doc->'rules') as rule))
 where name = 'stand-rewrite'
   and jsonb_typeof(doc->'rules') = 'array'
   and doc::text like '%"mutate"%';

commit;
