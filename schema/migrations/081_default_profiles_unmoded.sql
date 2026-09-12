-- Режим профиля снят (06.09.2026): включён ли инспектор и гейтит ли он,
-- решает вызов на маршруте (waf_inspect … mode=active|passive|off), а не
-- ключ mode в документе. Описание поставки «выключен» стало враньём --
-- нормализация ключ выбрасывает, и профиль без режима работает как enforce.
-- Документ не трогаем: лишний ключ безвреден, а точечное удаление в jsonb
-- пересобрало бы строки, которых оператор не касался.
--
-- Поставочный текст живёт в controller/src/default-profile.ts
-- (DEFAULT_DOC_BASELINE) слово в слово.
begin;

update auth_profiles    set description = 'Профиль по умолчанию' where name = 'default' and description = 'Профиль по умолчанию, выключен';
update captcha_profiles set description = 'Профиль по умолчанию' where name = 'default' and description = 'Профиль по умолчанию, выключен';
update json_profiles    set description = 'Профиль по умолчанию' where name = 'default' and description = 'Профиль по умолчанию, выключен';
update counter_profiles set description = 'Профиль по умолчанию' where name = 'default' and description = 'Профиль по умолчанию, выключен';
update action_profiles  set description = 'Профиль по умолчанию' where name = 'default' and description = 'Профиль по умолчанию, выключен';
update rewrite_profiles set description = 'Профиль по умолчанию' where name = 'default' and description = 'Профиль по умолчанию, выключен';
update vlai_profiles    set description = 'Профиль по умолчанию' where name = 'default' and description = 'Профиль по умолчанию, выключен';

commit;
