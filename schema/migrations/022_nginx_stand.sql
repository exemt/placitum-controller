-- Поля, без которых компилятор не соберёт стендовый deploy/nginx/nginx.conf:
-- заявка обменника инспектора, live_max набора, слот в шаблоне (не IP-каталог),
-- порядок печати каталогов.

alter table inspectors
    add column if not exists needs text,
    add column if not exists position integer not null default 0;

alter table datasets
    add column if not exists live_max integer,
    add column if not exists in_nginx boolean not null default false,
    add column if not exists position integer not null default 0;

alter table deny_responses
    add column if not exists position integer not null default 0;

alter table body_stores
    add column if not exists position integer not null default 0;

comment on column datasets.in_nginx is
    'Слот waf_local_dataset в шаблоне nginx. Наборы ip-компилятора -- false.';
