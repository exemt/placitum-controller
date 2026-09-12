-- Вердикт error: инспектор больше не отвечает за маршрут при собственном сбое.
--
-- До 091 инспектору приходилось врать: перегруженная очередь, неизвестный
-- профиль или разъезд версий отвечались `allow` («проверил, чисто») либо `deny`
-- («блокирую»), и выбор между ними был зашит в каждый инспектор по-своему. С
-- 091 такой ответ -- `verdict: "error"`, а исход выбирает маршрут: класс
-- `inspector` у `waf_exception` (умолчание -- deny).
--
-- Данных модуля это не касается: класс новый, ничего переносить не нужно.
-- Убрать надо одно -- исход `budget` в профилях инспектора json. Он говорил то
-- же самое («не успели в дедлайн -- вот что делать»), но словами инспектора и
-- мимо маршрута; инспектор его больше не читает, и оставленный в документе он
-- был бы настройкой, которая ничего не меняет.

update json_profiles
   set doc        = jsonb_set(
                        jsonb_set(
                            doc,
                            '{request,policy}',
                            coalesce(doc #> '{request,policy}', '{}'::jsonb) - 'budget',
                            false),
                        '{response,policy}',
                        coalesce(doc #> '{response,policy}', '{}'::jsonb) - 'budget',
                        false),
       updated_at = now()
 where doc #> '{request,policy}' ? 'budget'
    or doc #> '{response,policy}' ? 'budget';

-- Кадры: правила лежат по направлениям.
update json_profiles
   set doc        = jsonb_set(
                        jsonb_set(
                            doc,
                            '{frame,c2s,policy}',
                            coalesce(doc #> '{frame,c2s,policy}', '{}'::jsonb) - 'budget',
                            false),
                        '{frame,s2c,policy}',
                        coalesce(doc #> '{frame,s2c,policy}', '{}'::jsonb) - 'budget',
                        false),
       updated_at = now()
 where doc #> '{frame,c2s,policy}' ? 'budget'
    or doc #> '{frame,s2c,policy}' ? 'budget';

-- Профили vlai: полная очередь больше не выбирает судьбу запроса. Из словаря
-- остались `wait` (стоять до дедлайна) и `shed` (ответить сразу вердиктом
-- error); прежние `allow` и `deny` означали то же «ответить сразу», отличаясь
-- лишь тем, что́ инспектор выдумывал за маршрут.
update vlai_profiles
   set doc        = jsonb_set(doc, '{overload}', '"shed"'::jsonb, true),
       updated_at = now()
 where doc ->> 'overload' in ('allow', 'deny');
