-- Неуничтожимый default у каждой подсистемы профилей.
--
-- Манифест любой подсистемы без default не собирается (auth/captcha ответят
-- default_required, json/counter/action -- default_is_required, у modsec --
-- missing_default), а опустевший источник оставляет канал в broken
-- (source_emptied): send отвергает пустой состав, и починить это из панели
-- нечем. Ручки не дают default ни удалить, ни переименовать; эта миграция
-- гарантирует, что ему есть откуда взяться -- в каждом пространстве.
--
-- mode off -- инертный профиль: подсистема объявлена, но ничего не делает,
-- пока оператор не настроит. Это не политика по умолчанию, а точка опоры.
-- ip_profiles без строк правил с default_action=allow -- то же самое.
--
-- Наборы правил (rule_sets) здесь не сеются: их default обязан включать файлы
-- (пустой профиль роняет рендер манифеста), и собрать его без решения
-- оператора нечем -- он приходит сидом 012_rule_profiles.sql.

insert into auth_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию, выключен', '{"mode":"off"}'::jsonb
  from http_spaces s
 where not exists (
         select 1 from auth_profiles p
          where p.http_space_id = s.id and p.name = 'default');

insert into captcha_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию, выключен', '{"mode":"off"}'::jsonb
  from http_spaces s
 where not exists (
         select 1 from captcha_profiles p
          where p.http_space_id = s.id and p.name = 'default');

insert into json_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию, выключен', '{"mode":"off"}'::jsonb
  from http_spaces s
 where not exists (
         select 1 from json_profiles p
          where p.http_space_id = s.id and p.name = 'default');

insert into counter_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию, выключен', '{"mode":"off"}'::jsonb
  from http_spaces s
 where not exists (
         select 1 from counter_profiles p
          where p.http_space_id = s.id and p.name = 'default');

insert into action_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию, выключен', '{"mode":"off"}'::jsonb
  from http_spaces s
 where not exists (
         select 1 from action_profiles p
          where p.http_space_id = s.id and p.name = 'default');

insert into ip_profiles (http_space_id, name, description)
select s.id, 'default', 'Профиль по умолчанию: без правил, иначе allow'
  from http_spaces s
 where not exists (
         select 1 from ip_profiles p
          where p.http_space_id = s.id and p.name = 'default');
