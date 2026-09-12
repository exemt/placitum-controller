-- Кастомные страницы отказа. Имя совпадает с записью каталога
-- waf_deny_response / $waf_deny_name. Содержимое — HTML, JSON или текст
-- с SSI; стандартные файлы из /usr/share/waf/pages/ можно заменить.

create table if not exists response_pages (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    content         text not null default '',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists response_pages_space on response_pages (http_space_id);
