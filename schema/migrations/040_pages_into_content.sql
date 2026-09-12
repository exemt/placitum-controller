-- Страницы отказа переезжают в содержимое наборов.
--
-- Хранилищ статики было два: `response_pages` -- со своей таблицей, API и
-- разделом UX, но с работающей доставкой на край; и наборы `kind=content` --
-- общий именованный объект с типом из каталога, но без единого потребителя и
-- без транспорта. Остаётся второе: страница -- частный случай содержимого, и
-- держать под неё отдельную сущность значит держать два места, где лежит одно
-- и то же.
--
-- Привязка страницы отказа остаётся по имени: агент раскладывает каталог, а
-- `try_files /$waf_deny_name.html` ищет файл, названный как запись каталога
-- waf_deny_response. Имя набора уникально в пространстве, поэтому имя файла
-- строится из него и типа содержимого.

do $$
declare
    page    record;
    html    uuid;
    fresh   text;
    created uuid;
begin
    if to_regclass('public.response_pages') is null then
        return;
    end if;

    select id into html from content_types where name = 'html';

    for page in select * from response_pages loop
        -- Имя набора уникально в пространстве: список мог занять его раньше.
        fresh := page.name;

        if exists (select 1 from datasets d
                    where d.http_space_id = page.http_space_id and d.name = fresh) then
            fresh := page.name || '_page';
        end if;

        insert into datasets (http_space_id, name, description, subject, kind, type,
                              content_type_id, max_entries)
        values (page.http_space_id, fresh, '', 'waf.data.' || fresh, 'content', 'string',
                html, 1000000)
        returning id into created;

        insert into dataset_contents (dataset_id, name, body)
        values (created, fresh || '.html', convert_to(page.content, 'UTF8'));
    end loop;
end $$;

drop table if exists response_pages;
