-- Строка «адрес не в наборе» и словарь мест у инициаторов.
--
-- Раньше «Когда» у строки канала мешало два языка: набор (`set`) и вердикт
-- (`on: allow | deny | score` с порогом). Теперь язык один -- где оказался
-- адрес: в наборе, не в наборе, в белых списках, в чёрных, ни в одних.
--
-- Пороги счёта сняты: чёрный список решает двумя действиями, и для строки по
-- исходу это один случай. `on: allow` -> `white`, `on: deny` и `on: score`
-- -> `black`. Строка со счётом после этого срабатывает на всём чёрном
-- списке, а не с порога: фильтра по числу в новом словаре нет, и молчащей
-- строке в профиле предпочтён честный перевод «на чёрном списке».
alter table ip_profile_rules
    add column if not exists set_not boolean not null default false;

comment on column ip_profile_rules.set_not is
    'Условие наоборот: строка срабатывает на промахе. Только у request и list.';

-- Инициаторы живут документом (jsonb), таблицы у них нет: словарь переводится
-- на месте, порог и сравнения выбрасываются.
update ip_profiles
   set outcomes = (
       select coalesce(jsonb_agg(
                  (item - 'at' - 'below' - 'eq')
                  || jsonb_build_object(
                       'on',
                       case item ->> 'on'
                         when 'allow' then 'white'
                         when 'deny'  then 'black'
                         when 'score' then 'black'
                         else item ->> 'on'
                       end)
                  order by ord),
              '[]'::jsonb)
         from jsonb_array_elements(outcomes) with ordinality as t(item, ord)
   )
 where jsonb_typeof(outcomes) = 'array'
   and jsonb_array_length(outcomes) > 0;
