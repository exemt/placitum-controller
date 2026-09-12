-- Пользователи провайдера local переезжают в обычные списки.
--
-- Набор пользователей был третьим хранилищем именованной коллекции строк -- при
-- живом разделе «Данные → Списки» со своим UI, импортом, поиском и TTL. Своей
-- таблицы он не заслуживал: `admin:<bcrypt>` -- такая же строка, как адрес или
-- ключ, а профиль обязан лишь сказать, какой список считать пользователями.
--
-- Формат записи: login:bcrypt[:группы[:store-uuid секрета TOTP]]. Двоеточие
-- безопасно как разделитель: в логине оно запрещено, в bcrypt-хеше не
-- встречается, а группы перечисляются запятой.
--
-- `display` не переносится: до приложения он не доезжал никогда -- в
-- удостоверении едет sub, -- а в файле был украшением.
--
-- `enabled` не переносится тоже, и это осознанный размен: есть строка -- есть
-- пользователь. Взамен запись получает TTL списка, то есть доступ на время,
-- чего у набора не было вовсе. Выключенные записи переносятся закомментированными
-- -- список их игнорирует, а оператор видит, что они были.

do $$
declare
    set_row record;
    fresh   text;
    created uuid;
    line    text;
begin
    if to_regclass('public.auth_user_sets') is null then
        return;
    end if;

    for set_row in select * from auth_user_sets loop
        -- Имя списка уникально в пространстве: набор мог назваться как список.
        fresh := set_row.name;

        if exists (select 1 from datasets d
                    where d.http_space_id = set_row.http_space_id and d.name = fresh) then
            fresh := set_row.name || '_users';
        end if;

        insert into datasets (http_space_id, name, description, subject, kind, type,
                              content_type_id, max_entries, active)
        values (set_row.http_space_id, fresh,
                coalesce(nullif(set_row.description, ''), 'Пользователи калитки'),
                'waf.data.' || fresh, 'list', 'string', null, 100000, false)
        returning id into created;

        for line in
            select case when u.enabled then '' else '# ' end
                   || u.login || ':' || u.password_hash
                   || case
                        when array_length(u.groups, 1) is null and u.totp_store_id is null
                            then ''
                        else ':' || array_to_string(u.groups, ',')
                      end
                   || case
                        when u.totp_store_id is null then ''
                        else ':' || u.totp_store_id::text
                      end
              from auth_users u
             where u.auth_user_set_id = set_row.id
             order by u.position, u.login
        loop
            insert into dataset_addresses (dataset_id, address) values (created, line)
            on conflict do nothing;
        end loop;

        -- Профиль называет список по имени, как называл набор.
        update auth_profiles
           set doc = jsonb_set(doc, '{providers,local,users}', to_jsonb(fresh))
         where http_space_id = set_row.http_space_id
           and doc -> 'providers' -> 'local' ->> 'users' = set_row.name;
    end loop;
end $$;

drop table if exists auth_users;
drop table if exists auth_user_sets;
