-- Снятие on_error: несостоявшаяся подмена -- ошибка обработки запроса.
--
-- Рычагов на этот случай было три: поле `on_error` в секции rewrite реплая,
-- опция `on_error=` у `waf_send` на маршруте и одноимённое поле профиля
-- инспектора. Все три говорили об одном -- что делать, когда объект подмены не
-- поднялся, -- и все три дублировали политику фазы `waf_on_body_unavailable`,
-- которая уже распоряжается недоступностью объекта обменника. С 089 решает
-- только она: `block` -- отказ, `pass` -- оригинал, страница -- умолчание
-- маршрута.
--
-- Профиль сохраняет `deny_response`: это запись каталога для СОБСТВЕННОГО
-- отказа инспектора, когда подмена решена, но состояться не может. Сам отказ
-- стал безусловным -- прежнее `on_error: pass` означало «отдать оригинал
-- молча», то есть слить ровно то, что маскировали.

update rewrite_profiles
   set doc        = doc - 'on_error',
       updated_at = now()
 where doc ? 'on_error';

-- Строки waf_send в настройках http, серверов и путей: слова on_error= и
-- response= модуль больше не разбирает, и оставленные привели бы к отказу
-- nginx -t на первой же раскатке. Строка, от которой после чистки осталась
-- одна фаза, выбрасывается целиком: waf_send без единого объекта -- тоже
-- ошибка конфигурации.
do $$
declare
    tbl text;
begin
    foreach tbl in array array['http_spaces', 'servers', 'locations'] loop
        execute format($fmt$
            with cleaned as (
                select t.id,
                       coalesce(
                           jsonb_agg(to_jsonb(x.line) order by x.ord)
                               filter (where position(' ' in x.line) > 0),
                           '[]'::jsonb
                       ) as send
                  from %1$I t
                       cross join lateral (
                           select e.ord,
                                  btrim(regexp_replace(
                                      regexp_replace(e.elem #>> '{}',
                                          '\s+(on_error|response)=[^\s]+', '', 'g'),
                                      '\s+', ' ', 'g')) as line
                             from jsonb_array_elements(t.waf -> 'send')
                                      with ordinality as e(elem, ord)
                       ) x
                 where jsonb_typeof(t.waf -> 'send') = 'array'
                 group by t.id
            )
            update %1$I t
               set waf = jsonb_set(t.waf, '{send}', c.send)
              from cleaned c
             where c.id = t.id
               and t.waf -> 'send' is distinct from c.send
        $fmt$, tbl);
    end loop;
end
$$;

comment on column rewrite_profiles.doc is
    'Документ профиля rewrite: mode, deny_response, groups[], prior[]. '
    'Валидация -- в контроллере и в инспекторе, не в типах.';
