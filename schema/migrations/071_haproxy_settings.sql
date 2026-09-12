-- Настройки балансировщика перед краями: глобальные пределы, таймауты,
-- вход, состав backend'а и страница статистики.
--
-- Отдельная таблица, а не колонка в http_spaces, по той же причине, что у
-- agent_settings: это другой документ с другой доставкой. Поколение nginx
-- проверяется `nginx -t` и заканчивается reload воркеров; здесь конфиг
-- собирает контроллер, а применяет агент haproxy -- `haproxy -c` и SIGUSR2
-- мастеру. Одна кнопка «сохранить» на два таких документа означала бы, что
-- сохранение одного молча раскатывает другой.
--
-- Что сюда НЕ кладётся:
--
--   * бутстрап агента -- адрес шины, каталоги, путь к бинарю и pidfile.
--     Ими агент дотягивается до шины; остаются окружением контейнера.
--   * TLS балансировщика -- когда появится, сертификаты поедут ссылками
--     store:<uuid> тем же конвертом, что у nginx, а не литералами здесь.
--
-- Строка одна на пространство: балансировщик у контура один.

create table haproxy_settings (
    http_space_id   uuid primary key references http_spaces(id) on delete cascade,
    -- {process:{maxconn,bufsize},
    --  timeouts:{connect_ms,client_ms,server_ms,keepalive_ms,tunnel_ms},
    --  frontend:{port}, stats:{enabled,port}, docker_dns,
    --  backend:{balance,check:{path,status,inter_ms},servers:[{name,host,port}]}}
    settings        jsonb not null default '{}',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table haproxy_settings is
    'Настройки haproxy контура: пределы, таймауты, вход и состав backend''а. Пустой документ компилируется в поставочный конфиг стенда.';
