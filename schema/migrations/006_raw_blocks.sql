-- raw: пользователь редактирует текст блока nginx, а не дерево настроек.
-- Скелет остаётся: у пространства -- сам http {}, у сервера -- listen и
-- server_name, у пути -- match и path. Дети при raw родителя не печатаются
-- и не удаляются. PEM в raw запрещён, как в шаблоне.

alter table http_spaces
    add column if not exists raw        boolean not null default false,
    add column if not exists raw_nginx  text not null default '';

alter table servers
    add column if not exists raw        boolean not null default false,
    add column if not exists raw_nginx  text not null default '';

alter table locations
    add column if not exists raw        boolean not null default false,
    add column if not exists raw_nginx  text not null default '';
