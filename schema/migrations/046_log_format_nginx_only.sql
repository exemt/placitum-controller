-- `waf_log_format` снят вместе с `waf_audit` / `waf_audit_body` / `waf_audit_mask`:
-- модуль ни одной из этих директив не знает, агент пишет запись аудита по
-- фиксированной схеме, а компилятор печатал `waf_log_format` в http {} --
-- любой формат с kind = waf ронял nginx -t на ноде. Каталог форматов теперь
-- только про `log_format` nginx.
--
-- Колонки `kind` и `fields` остаются: значение у kind одно, fields пуст.

delete from log_formats where kind = 'waf';

alter table log_formats
    alter column kind set default 'nginx';

alter table log_formats
    drop constraint if exists log_formats_kind_check;

alter table log_formats
    add constraint log_formats_kind_check check (kind in ('nginx'));

comment on column log_formats.kind is
    'nginx -- log_format (access-лог, читается format). waf_log_format снят.';
