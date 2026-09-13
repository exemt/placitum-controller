-- Узел пула резолвится на лету: server host:port resolve. Нужен тем, кто ходит
-- к соседним контейнерам по имени: без него nginx -t отвергает поколение целиком,
-- пока имени нет в DNS. Умолчание прежнее -- имя резолвится при загрузке.

alter table upstream_peers add column if not exists resolve boolean not null default false;
