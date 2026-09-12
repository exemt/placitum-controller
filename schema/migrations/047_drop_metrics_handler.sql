-- Обработчик `metrics` печатал `waf_status;` -- директивы, которой у модуля нет:
-- любой такой путь ронял nginx -t на ноде. Снят вместе со старым справочником
-- directives; счётчики наружу отдаст `waf_status` тогда, когда появится в
-- модуле, и это будет новая страница в docs/directives/list/.

update locations set handler = 'static' where handler = 'metrics';

alter table locations drop constraint if exists locations_handler_check;

alter table locations
    add constraint locations_handler_check
        check (handler in ('proxy', 'static', 'return', 'named'));
