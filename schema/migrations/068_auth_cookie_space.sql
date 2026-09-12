-- Пространство сессий = имя куки.
--
-- Токен калитки теперь несёт в scp имя куки, под которую выписан, и профиль
-- принимает его при совпадении со своей session.cookie. Умолчание инспектора
-- стало пер-профильным (waf_sid_<имя>), а пустое имя в документе означает
-- «умолчание на профиль». Явные waf_sid/waf_lgn прошлой эпохи -- это то самое
-- умолчание, размноженное панелью: оставить их как есть значило бы слепить все
-- панельные профили в одно пространство после пересборки образов.
--
-- Списка gate.api_paths больше нет («отдельные пути = отдельный профиль»,
-- спутник с той же кукой и пустыми redirect_methods): ключ вычищается, чтобы
-- не смущать при разборе, читать его всё равно некому.

update auth_profiles
   set doc = jsonb_set(doc, '{session,cookie}', '""'::jsonb)
 where doc #>> '{session,cookie}' = 'waf_sid';

update auth_profiles
   set doc = jsonb_set(doc, '{ticket,cookie}', '""'::jsonb)
 where doc #>> '{ticket,cookie}' = 'waf_lgn';

update auth_profiles
   set doc = doc #- '{gate,api_paths}'
 where doc -> 'gate' ? 'api_paths';

update auth_profiles
   set doc = doc #- '{gate,apiPaths}'
 where doc -> 'gate' ? 'apiPaths';
