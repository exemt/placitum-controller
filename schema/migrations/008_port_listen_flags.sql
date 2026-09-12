-- ssl / http2 / proxy_protocol -- свойства listen-сокета, не сервера.
-- Один адрес:порт на несколько server_name делит один сокет, флаги общие.
-- default_server по-прежнему на привязке: на порту он может быть только один.

alter table ports
    add column if not exists ssl            boolean not null default false,
    add column if not exists http2          boolean not null default false,
    add column if not exists proxy_protocol boolean not null default false;
