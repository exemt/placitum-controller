--
-- Форматы логов: одна таблица, две директивы.
--
-- `waf_log_format <name> <field>...` -- набор полей записи аудита, поэтому
-- состав лежит массивом `fields`.
-- `log_format <name> '<текст>'` -- формат access-лога самого nginx, и это одна
-- строка с переменными, разобрать её на поля нечем.
--
-- Разделять на две таблицы незачем: имя уникально в пространстве у обеих, и
-- страница каталога у оператора одна. `kind` говорит, какую директиву печатать
-- и какую колонку читать.
--
alter table log_formats
    add column if not exists kind text not null default 'waf'
        check (kind in ('waf', 'nginx')),
    add column if not exists format text not null default '';

comment on column log_formats.kind is
    'waf -- waf_log_format (аудит, читается fields); nginx -- log_format (access-лог, читается format).';
comment on column log_formats.format is
    'Тело log_format без кавычек. Только при kind = nginx.';

-- Формат nginx по умолчанию: тот же combined, но с временем ответа апстрима и
-- идентификатором запроса WAF -- без них лог края не связывается ни с аудитом,
-- ни с медленным бэкендом.
insert into log_formats (http_space_id, name, kind, fields, format)
select s.id,
       'main',
       'nginx',
       '{}'::text[],
       '$remote_addr - $remote_user [$time_local] "$request" '
       '$status $body_bytes_sent "$http_referer" '
       '"$http_user_agent" rt=$request_time urt=$upstream_response_time'
  from http_spaces s
 on conflict (http_space_id, name) do nothing;
