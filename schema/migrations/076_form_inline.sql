-- Форма и виджет телом ответа: gate.inline вместо gate.formResponse.
--
-- Прежний режим держался на записи каталога отказов и прокси-локации
-- /pages/<имя>.html, проксирующей на сервис формы. Теперь инспектор сам кладёт
-- страницу в обменник и называет её модулю секцией rewrite: записи и локации
-- больше не нужны, а рычаг режима -- булево поле.
--
-- Непустое formResponse (в документах контроллера ключ camelCase; snake_case
-- встречался в импортированных YAML) означало «телом ответа», и это значение
-- переезжает в inline: true. Само поле стирается: инспекторы читают его одно
-- поколение как синоним, но в документах контроллера ему делать больше нечего.

begin;

update auth_profiles
   set doc = jsonb_set(doc, '{gate,inline}', 'true'::jsonb)
 where coalesce(doc #>> '{gate,formResponse}', doc #>> '{gate,form_response}', '') <> '';

update auth_profiles
   set doc = (doc #- '{gate,formResponse}') #- '{gate,form_response}'
 where doc -> 'gate' ? 'formResponse' or doc -> 'gate' ? 'form_response';

update captcha_profiles
   set doc = jsonb_set(doc, '{gate,inline}', 'true'::jsonb)
 where coalesce(doc #>> '{gate,formResponse}', doc #>> '{gate,form_response}', '') <> '';

update captcha_profiles
   set doc = (doc #- '{gate,formResponse}') #- '{gate,form_response}'
 where doc -> 'gate' ? 'formResponse' or doc -> 'gate' ? 'form_response';

commit;
