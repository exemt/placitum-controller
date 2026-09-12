-- Страница ответа у handler=return.
--
-- Свободного тела у `return` больше нет: строкой туда уезжал бы HTML целиком,
-- в конфигурацию, без SSI-переменных ($waf_ray, $waf_deny_name) -- то есть
-- копия страницы, которую контур и так умеет отдавать. Страницу собирает
-- именованный путь (`ssi on; root pages:; try_files ...`), а путь-обработчик
-- только уводит на него: `error_page <код> =<код> @имя;` рядом с `return <код>;`.
-- Устройство -- docs/deny-pages.md.
alter table locations add column if not exists return_page text;

comment on column locations.return_page is
    'Цель error_page для handler=return: именованный путь того же сервера (@waf_deny).';

-- Строкой остаётся только адрес редиректа: у 3xx nginx вторым аргументом
-- `return` ждёт URL, а не тело, и страницу туда не подставить. Прежние тела
-- переезжают в это же поле -- их читает только 3xx-ветка компилятора.
-- Переименование в do-блоке: на живой базе стенда файл накатывают руками, и
-- повторный прогон не должен падать на уже переименованной колонке.
do $$
begin
    if exists (select 1 from information_schema.columns
                where table_name = 'locations' and column_name = 'return_body') then
        alter table locations rename column return_body to return_url;
    end if;
end $$;

comment on column locations.return_url is
    'Адрес для 3xx: return 302 <url>. Не тело ответа -- у прочих кодов не печатается.';
