-- TLS до защищаемого сервера: пул за https.
--
-- До сих пор пул умел только адрес: `server host:port`, а схему за него
-- решал компилятор -- всегда `proxy_pass http://`. Для внутреннего
-- приложения этого хватало, для внешнего ресурса -- нет: узел на 443 порту
-- отвечает на такой запрос «400 The plain HTTP request was sent to HTTPS
-- port», и никакая настройка пути этого не меняла.
--
-- Три колонки закрывают все три половины разговора с внешним узлом:
--
--   tls          -- схема: proxy_pass пойдёт по https и получит proxy_ssl_*;
--   tls_name     -- SNI (proxy_ssl_name). Умолчание nginx -- хост из
--                   proxy_pass, то есть ИМЯ ПУЛА, а не узла: без своего
--                   имени рукопожатие уходит не туда. Пусто -- компилятор
--                   подставит хост единственного узла пула;
--   host_header  -- что уедет в `Host:`. Имя пула в этом заголовке внешний
--                   узел встречает 403 так же уверенно, как имя своего
--                   виртуального сервера. Пусто и tls -- берётся tls_name.
--
-- Заголовок с пути (proxy_set_header Host) при заполненном host_header не
-- печатается: два Host в одном location -- это два Host на проводе.

alter table upstreams
    add column if not exists tls         boolean not null default false,
    add column if not exists tls_name    text,
    add column if not exists host_header text;
