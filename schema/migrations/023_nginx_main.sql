-- Скелет файла и то, чего не хватало каталогам, чтобы напечатанное принял
-- сам nginx, а не только глаз оператора.
--
-- Агент пишет текст компилятора целиком в nginx.conf и запускает
-- `nginx -t -c` (nginx/agent/internal/desired/apply.go). Значит в шаблоне
-- обязаны быть load_module, worker_processes и events {} -- без events мастер
-- не стартует вовсе. Это не свойства http {}, поэтому отдельный документ, а не
-- новые ключи в http_spaces.nginx.
--
-- Идентичность ноды сюда по-прежнему не кладётся: waf_node_id и waf_bus
-- приезжают include'ом с самой ноды, потому что шаблон один на флот.

alter table http_spaces
    add column if not exists nginx_main jsonb not null default '{}';

comment on column http_spaces.nginx_main is
    'Скелет файла: load_module, worker_processes, error_log, events {}.';

-- audit=<subject>|off у waf_inspector: куда инспектор публикует подробности.
-- Умолчание модуля -- waf.audit.inspector.<name>, поэтому столбец nullable:
-- пусто -- директива без опции, а не пустая тема.
alter table inspectors
    add column if not exists audit text;

comment on column inspectors.audit is
    'Опция audit= у waf_inspector: тема подробностей либо off.';
