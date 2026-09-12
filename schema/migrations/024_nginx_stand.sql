-- Стендовый deploy/nginx/nginx.conf, разобранный на сущности.
--
-- Это не пример и не фикстура под тест: то же самое дерево, с которого сейчас
-- живёт compose, только в таблицах. Компилятор (controller/src/compile/nginx.ts)
-- обязан собрать из него конфигурацию, которую nginx примет и на которой
-- проходят те же прогоны, что и на файле. Расхождение между этим сидом и
-- deploy/nginx/nginx.conf -- дефект одного из двух, а не два способа настроить.
--
-- Комментарии, объясняющие каждый маршрут, живут в самом deploy/nginx/nginx.conf
-- и здесь не дублируются: их место -- рядом с текстом, который читает оператор.
-- Здесь только то, что видно из таблиц плохо.
--
-- Идемпотентно: на пустой том едет из initdb.d, на живую базу докатывается
-- руками (controller/README.md#модель-конфигурации).


-- --- пространство ---------------------------------------------------------
--
-- nginx_main -- скелет файла: агент пишет напечатанное целиком в nginx.conf.
-- Идентичность ноды (waf_node_id, waf_bus) приезжает include'ом
-- /etc/nginx/waf-node.conf: шаблон один на флот, инбокс у каждой ноды свой.

update http_spaces set
    nginx_main = jsonb_build_object(
        'loadModules', jsonb_build_array('modules/ngx_http_waf_module.so'),
        -- Не auto: в контейнере видны все ядра хоста, а квота compose -- 2 CPU.
        'workerProcesses', 2,
        -- info, а не error: подключение к шине и подписки на наборы пишутся
        -- вне запроса, то есть в лог цикла.
        'errorLog', '/var/log/nginx/error.log info',
        'events', jsonb_build_object('workerConnections', 1024)
    ),
    nginx = jsonb_build_object(
        'includes', jsonb_build_array(
            '/etc/nginx/mime.types',
            '/etc/nginx/waf-node.conf'
        ),
        'defaultType', 'application/octet-stream',
        'accessLog', '/var/log/nginx/access.log',
        'errorLog', '/var/log/nginx/error.log info',
        'sendfile', true,
        'keepaliveTimeoutS', 65
    ),
    waf_http = jsonb_build_object(
        'maxInflight', 4096,
        -- Итог фазы -- локальному агенту, не на шину вердиктов.
        'agentSocket', '/var/run/waf/verdict.sock',
        -- Зона общая на воркеры: circuit breaker, счётчики частоты, наборы.
        'shmZone', jsonb_build_object('name', 'waf', 'size', '8m')
    ),
    -- Только реестр. Решения по запросу -- на серверах ниже: контур
    -- объявляет инспекторов, хост решает, что с запросом делать. Ключ
    -- решения здесь компилятор отвергает (route_at_http).
    --
    -- Профиль -- опция реестра, а не вызова: `profile=` печатается один раз на
    -- строке `waf_inspector <name>`, и на `waf_inspect` его нет вовсе. Значит
    -- набор правил разводится именем узла, а не ключом на маршруте: два имени
    -- на один subject -- один процесс, разные наборы. Просить с маршрута
    -- второй профиль на то же имя нельзя -- compileHttp роняет сборку
    -- (`profile_conflict`), и это правильно: молча уехать половиной маршрутов
    -- на чужом наборе хуже, чем не собраться. Имена ниже -- те же, что в
    -- deploy/nginx/nginx.conf (waf_inspector, строки 110-129).
    waf = jsonb_build_object(
        'inspectors', jsonb_build_object(
            'ip', jsonb_build_object(
                'timeoutMs', 20,
                'needs', 'none'
            ),
            'ip-admin', jsonb_build_object(
                'timeoutMs', 20,
                'needs', 'none',
                'profile', 'admin'
            ),
            'ip-ext', jsonb_build_object(
                'timeoutMs', 20,
                'needs', 'none',
                'profile', 'ext'
            ),
            -- Профиля с таким именем у инспектора нет: проверяется, что
            -- отсутствие набора -- отказ, а не откат на default.
            'ip-unknown', jsonb_build_object(
                'timeoutMs', 20,
                'needs', 'none',
                'profile', 'no-such'
            ),
            'ip-heavy', jsonb_build_object(
                'timeoutMs', 20,
                'needs', 'none',
                'profile', 'heavy'
            ),
            'modsec', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body',
                'body', 'full',
                'after', jsonb_build_array('ip')
            ),
            'modsec-strict', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body',
                'body', 'full',
                'after', jsonb_build_array('ip'),
                'profile', 'strict'
            ),
            'modsec-unknown', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body',
                'body', 'full',
                'after', jsonb_build_array('ip'),
                'profile', 'no-such-profile'
            ),
            'modsec-deny', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body',
                'body', 'full',
                'after', jsonb_build_array('ip'),
                'profile', 'deny'
            ),
            'modsec-allow', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body',
                'body', 'full',
                'after', jsonb_build_array('ip'),
                'profile', 'allow'
            ),
            'modsec-api', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body',
                'body', 'full',
                'after', jsonb_build_array('ip'),
                'profile', 'api'
            ),
            -- Набор профиля e2e заводит раннер через API; имя узла --
            -- то, что tests/runner/scenarios/modsec.mjs держит в INSPECTOR.
            'modsec-e2e', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body',
                'body', 'full',
                'after', jsonb_build_array('ip'),
                'profile', 'e2e'
            ),
            'vlai', jsonb_build_object(
                'timeoutMs', 200,
                'needs', 'headers,args,body',
                'after', jsonb_build_array('ip', 'modsec')
            ),
            'pii', jsonb_build_object(
                'timeoutMs', 500,
                'needs', 'headers,args,body'
            )
        )
    ),
    updated_at = now()
where name = 'default';


-- --- инспекторы -----------------------------------------------------------
--
-- Каталог -- реестр процессов: имя, subject, фаза. Цепочка и timeout
-- живут в http_spaces.waf.inspectors выше. Инспектор не из набора
-- маршрута при nginx -t отбрасывается (after= на объявлении).

insert into inspectors (http_space_id, name, subject, phase, position)
select s.id, v.name, v.subject, v.phase, v.position
from http_spaces s,
     (values
        -- Один subject на семью имён: процесс тот же, различает их profile=
        -- на узле реестра. Имя, которого нет в каталоге, компилятор отвергает
        -- (`unknown_inspector`), поэтому варианты перечислены здесь наравне
        -- с базовым.
        ('modsec',         'waf.req.modsec', 'request', 10),
        ('modsec-strict',  'waf.req.modsec', 'request', 11),
        ('modsec-unknown', 'waf.req.modsec', 'request', 12),
        ('modsec-deny',    'waf.req.modsec', 'request', 13),
        ('modsec-allow',   'waf.req.modsec', 'request', 14),
        ('modsec-api',     'waf.req.modsec', 'request', 15),
        ('modsec-e2e',     'waf.req.modsec', 'request', 16),
        ('ip',             'waf.req.ip',     'request', 20),
        ('ip-admin',       'waf.req.ip',     'request', 21),
        ('ip-ext',         'waf.req.ip',     'request', 22),
        ('ip-unknown',     'waf.req.ip',     'request', 23),
        ('ip-heavy',       'waf.req.ip',     'request', 24),
        ('vlai',           'waf.req.vlai',   'request', 30),
        ('pii',            'waf.req.pii',    'request', 40)
     ) as v(name, subject, phase, position)
where s.name = 'default'
on conflict (http_space_id, name) do update set
    subject  = excluded.subject,
    phase    = excluded.phase,
    position = excluded.position;


-- --- каталог отказов ------------------------------------------------------
--
-- Инспектор присылает имя записи, а не статус и тело. malformed -- 400:
-- «запрос не разобран» и «запрос запрещён» должны различаться клиентом.
-- too_many -- 429: превышение частоты клиент может исправить сам.

insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, v.name, 'http', v.spec::jsonb, v.position
from http_spaces s,
     (values
        ('blocked',    '{"status": 403}', 10),
        ('suspicious', '{"status": 403}', 20),
        ('malformed',  '{"status": 400}', 30),
        ('too_many',   '{"status": 429}', 40)
     ) as v(name, spec, position)
where s.name = 'default'
on conflict (http_space_id, name) do update set
    type     = excluded.type,
    spec     = excluded.spec,
    position = excluded.position;


-- --- наборы локального слоя -----------------------------------------------
--
-- in_nginx -- слот waf_local_dataset в шаблоне. Наборы ip-компилятора
-- остаются false: они едут инспектору, а не в зону модуля.
-- e2e_* уже могут существовать -- их заводит tests/lists.

insert into datasets (
    http_space_id, name, subject, kind, type, max_entries, live_max,
    in_nginx, position
)
select s.id, v.name, v.subject, 'list', v.type, v.max_entries, v.live_max,
       true, v.position
from http_spaces s,
     (values
        ('blocklist', 'waf.data.blocklist', 'ipv4',   1000000, null::integer, 10),
        ('allowlist', 'waf.data.allowlist', 'ipv4',      1024, null,          20),
        ('badua',     'waf.data.badua',     'string',   65536, null,          30),
        ('e2e_cidr',  'waf.data.e2e_cidr',  'ipv4',    100000, 20000,         40),
        ('e2e_ua',    'waf.data.e2e_ua',    'string',  100000, 20000,         50),
        ('e2e_key',   'waf.data.e2e_key',   'string',  100000, 20000,         60)
     ) as v(name, subject, type, max_entries, live_max, position)
where s.name = 'default'
on conflict (http_space_id, name) do update set
    subject     = excluded.subject,
    max_entries = excluded.max_entries,
    live_max    = excluded.live_max,
    in_nginx    = true,
    position    = excluded.position;


-- --- горячий обменник --------------------------------------------------------
--
-- Обменник на контур ровно один: строка тут одна, и вторая сломала бы nginx -t --
-- модуль принимает единственный waf_store. Имя остаётся ключом строки в базе,
-- в конфиг оно не едет.
--
-- op_timeout меньше waf_deadline нарочно: размещение тела -- часть бюджета
-- запроса. retain_ttl -- окно, пока агент забирает названное в
-- waf_archive; штатно ключ убивает агент, а не срок.

insert into body_stores (http_space_id, name, driver, spec, position)
select s.id, v.name, 'redis', v.spec::jsonb, v.position
from http_spaces s,
     (values
        ('hot', '{"url": "redis://redis:6379", "ttl": "1m", "max": "8m",
                  "retain_ttl": "5m", "pool": "2",
                  "connect_timeout": "200ms", "op_timeout": "200ms"}', 10)
     ) as v(name, spec, position)
where s.name = 'default'
on conflict (http_space_id, name) do update set
    driver   = excluded.driver,
    spec     = excluded.spec,
    position = excluded.position;

-- Второй обменник 'log' жил тут до слияния waf_body_store в waf_store.
delete from body_stores bs
using http_spaces s
where bs.http_space_id = s.id and s.name = 'default' and bs.name = 'log';


-- --- апстрим и порты ------------------------------------------------------

insert into upstreams (http_space_id, name, method)
select s.id, 'backend', 'round_robin'
from http_spaces s where s.name = 'default'
on conflict (http_space_id, name) do nothing;

insert into upstream_peers (upstream_id, host, port, position)
select u.id, 'backend', 8080, 0
from upstreams u
join http_spaces s on s.id = u.http_space_id
where s.name = 'default' and u.name = 'backend'
  and not exists (
      select 1 from upstream_peers p
      where p.upstream_id = u.id and p.host = 'backend' and p.port = 8080
  );

insert into ports (http_space_id, name, address, port)
select s.id, v.name, '0.0.0.0', v.port
from http_spaces s,
     (values ('http-8080', 8080), ('http-8082', 8082)) as v(name, port)
where s.name = 'default'
on conflict (http_space_id, name) do nothing;


-- --- серверы --------------------------------------------------------------
--
-- edge -- рабочий контур, shadow -- тот же контур целиком под наблюдением:
-- режим стоит на сервере, и все его маршруты наследуют его.
--
-- 0.0.0.0/0 в set_real_ip_from -- только стенд: t/e2e.sh и t/ip.sh задают
-- адрес заголовком, а не hop HAProxy. В бою сюда свои hop'ы.

-- Решения по запросу стоят здесь, а не на пространстве: серверы на проде
-- принадлежат разным клиентам, и общий на контур бюджет с общим набором
-- инспекторов для них либо избыточен, либо недостаточен. Стенд повторяет ту
-- же форму, хотя оба его сервера настроены одинаково.
insert into servers (http_space_id, name, nginx, waf)
select s.id, v.name, v.nginx::jsonb, v.waf::jsonb
from http_spaces s,
     (values
        ('edge', '{
            "root": "/var/www",
            "realIpFrom": ["0.0.0.0/0", "::/0"],
            "realIpHeader": "X-Forwarded-For",
            "errorPages": [
                {"codes": [400], "status": 400, "target": "@waf_deny"},
                {"codes": [403], "status": 403, "target": "@waf_deny"},
                {"codes": [429], "status": 429, "target": "@waf_deny"}
            ]
         }', '{
            "enabled": true,
            "deadlineMs": 500,
            "deadlinePolicy": "block",
            "onAbsent": "block",
            "onBusError": "block",
            "scoreDeny": {"threshold": 100, "response": "suspicious"},
            "cookieDefaults": {"secure": false, "httpOnly": true, "sameSite": "Lax"},
            "debugHeader": true,
            "redirectAllow": ["/waf/captcha", "https://*.chal.example.com/c/"],
            "capture": ["headers", "args", "body"],
            "preview": ["headers=30k/2k", "args=8k/1k", "body=10k"],
            "requestInspectors": [{"name": "ip"}]
         }'),
        ('shadow', '{
            "root": "/var/www",
            "realIpFrom": ["0.0.0.0/0", "::/0"],
            "realIpHeader": "X-Forwarded-For",
            "errorPages": [
                {"codes": [400], "status": 400, "target": "@waf_deny"},
                {"codes": [403], "status": 403, "target": "@waf_deny"},
                {"codes": [429], "status": 429, "target": "@waf_deny"}
            ]
         }', '{
            "enabled": true,
            "deadlineMs": 500,
            "deadlinePolicy": "block",
            "onAbsent": "block",
            "onBusError": "block",
            "scoreDeny": {"threshold": 100, "response": "suspicious"},
            "cookieDefaults": {"secure": false, "httpOnly": true, "sameSite": "Lax"},
            "debugHeader": true,
            "redirectAllow": ["/waf/captcha", "https://*.chal.example.com/c/"],
            "capture": ["headers", "args", "body"],
            "preview": ["headers=30k/2k", "args=8k/1k", "body=10k"],
            "requestInspectors": [{"name": "ip"}],
            "inspectorModes": {"ip": "passive"}
         }')
     ) as v(name, nginx, waf)
where s.name = 'default'
on conflict (http_space_id, name) do update set
    nginx = excluded.nginx,
    waf   = excluded.waf;

insert into server_ports (server_id, port_id)
select srv.id, p.id
from servers srv
join http_spaces s on s.id = srv.http_space_id
join ports p on p.http_space_id = s.id
where s.name = 'default'
  and ((srv.name = 'edge' and p.name = 'http-8080')
    or (srv.name = 'shadow' and p.name = 'http-8082'))
on conflict (server_id, port_id) do nothing;


-- --- пути -----------------------------------------------------------------
--
-- Порядок печати -- position, шаг 10: маршрут вставляется между соседями без
-- переписывания всей таблицы.
--
-- Апстрим у всех один, различается хвост: /app/ режет префикс ("/"),
-- маршруты инспекторов ведут на /echo, маршруты раннера -- на /echo/, чтобы
-- <runId>/<case> уехал апстриму путём, а не слипся с именем ручки.
--
-- Контент отдаётся статикой, а не через return: return принадлежит
-- rewrite-модулю и срабатывает до access-фазы, то есть обработчик модуля в
-- таком location не вызывается вовсе.

insert into locations (
    server_id, match, path, position, handler, upstream_id, upstream_uri,
    nginx, waf
)
select srv.id, v.match, v.path, v.position, v.handler,
       case when v.handler = 'proxy' then up.id end,
       v.upstream_uri,
       v.nginx::jsonb, v.waf::jsonb
from (values

-- === сервер edge ==========================================================

-- Страница отказа: модуль возвращает код, error_page уводит сюда, SSI
-- подставляет $waf_ray и $waf_deny_name, try_files выбирает файл по имени
-- записи каталога.
('edge', 'named', 'waf_deny', 10, 'static', null::text, '{
    "root": "/usr/share/waf/pages",
    "ssi": true,
    "ssiTypes": ["*"],
    "tryFiles": ["/$waf_deny_name.html", "/blocked.html"]
 }', '{"enabled": false}'),

('edge', 'prefix', '/', 20, 'static', null, '{
    "tryFiles": ["$uri", "$uri/", "/index.html"]
 }', '{}'),

-- Настоящий апстрим, а не статика: через него проверяется проксирование
-- запроса и ответа. /app/hang живёт дольше keepalive_timeout нарочно.
('edge', 'prefix', '/app/', 30, 'proxy', '/', '{
    "proxyHttpVersion": "1.1",
    "proxyReadTimeoutMs": 90000,
    "proxySetHeaders": [
        {"name": "Host", "value": "$host"},
        {"name": "X-Forwarded-For", "value": "$proxy_add_x_forwarded_for"},
        {"name": "X-Forwarded-Proto", "value": "$scheme"}
    ]
 }', '{}'),

-- Тело запроса. Все шесть маршрутов ведут на /echo: статика отвечает 405 на
-- POST, а тело здесь -- это то, что проверяется. Порог 50 -- калибровка CRS.
--
-- Имена /body/inline/ и /body/store/ исторические: порога инлайна больше нет,
-- оба маршрута кладут тело в обменник и отвечают одинаково.
('edge', 'prefix', '/body/inline/', 40, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

('edge', 'prefix', '/body/store/', 50, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

-- Предел ниже присланного: инспектор видит unavailable: oversize, исход
-- решает второе слово waf_body_limit. Три политики -- три маршрута.
('edge', 'prefix', '/body/oversize/', 60, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"},
    "bodyLimit": "1k"
 }'),

('edge', 'prefix', '/body/oversize-pass/', 70, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"},
    "bodyLimit": "1k",
    "bodyLimitPolicy": "pass"
 }'),

('edge', 'prefix', '/body/truncate/', 80, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"},
    "bodyLimit": "1k",
    "bodyLimitPolicy": "trim"
 }'),

-- Отсечение до волн: локальный лимит решает на месте, и тело при этом не
-- читается вовсе. burst=1 -- запас ровно в один запрос.
('edge', 'prefix', '/body/rate/', 90, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"},
    "localRates": [{
        "key": "$binary_remote_addr", "rate": "1r/s", "burst": 1,
        "response": "too_many"
    }]
 }'),

-- Архивация: владение ключами переходит агенту. Бакета под заголовки на
-- стенде нет нарочно -- вторая ветвь, archive_error, тоже проверяется. Тело
-- едет своей строкой: срок у него дольше, а в S3 уезжает только начало.
('edge', 'prefix', '/body/archive/', 100, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"},
    "archive": [
        "request headers ttl=7d",
        "request body=64k ttl=30d"
    ]
 }'),

-- Маршруты инспектора правил. Порог 50, а не унаследованная сотня: 5 баллов
-- аномального счёта CRS -- это score 50.
('edge', 'prefix', '/modsec/', 110, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

('edge', 'prefix', '/modsec-strict/', 120, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec-strict"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

-- Профиля с таким именем у инспектора нет. Политика deny: отсутствие набора --
-- отказ, а не откат на default.
('edge', 'prefix', '/modsec-unknown/', 130, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec-unknown"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

-- Суффикс passive -- режим, а не профиль: вердикт в лог, трафик не трогается.
('edge', 'prefix', '/modsec-passive/', 140, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec", "mode": "passive"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

-- Профили-фикстуры: ответ не зависит от запроса. Порог не задан намеренно --
-- ни один из двух через счёт не проходит.
('edge', 'prefix', '/modsec-deny/', 150, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{"requestInspectors": [{"name": "modsec-deny"}]}'),

('edge', 'prefix', '/modsec-allow/', 160, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{"requestInspectors": [{"name": "modsec-allow"}]}'),

('edge', 'prefix', '/modsec-api/', 170, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec-api"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

-- Профиль под управлением e2e-раннера: rule-файлы и набор он заводит через
-- API, поэтому маршрут -- постоянная фикстура. Обменник log, не hot: после
-- вердикта объекты уезжают агенту, а не снимаются сразу.
--
-- proxy_pass с завершающим слешем (upstream_uri '/echo/'): раннер навешивает
-- на путь <runId>/<case>, и суффикс должен уехать апстриму как
-- /echo/<runId>/<case>, а не слипнуться в /echo<runId>.
--
-- Архив: `when=` решает судьбу всего набора сразу, не отдельной строки
-- (docs/directives/list/archive.md). Здесь when=deny -- на allow в S3 не
-- уезжает ничего; на /modsec-e2e-body/ ниже `when=` нет намеренно, то есть
-- любой исход. Эту пару различий и проверяет modsec.mjs (кейс clean-no-body
-- ждёт archived: false, clean-with-body -- archived: true).
('edge', 'prefix', '/modsec-e2e/', 180, 'proxy', '/echo/', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec-e2e"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"},
    "archive": ["request headers args body ttl=1h when=deny"]
 }'),

('edge', 'prefix', '/modsec-e2e-body/', 190, 'proxy', '/echo/', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec-e2e"}],
    "scoreDeny": {"threshold": 50, "response": "suspicious"},
    "archive": ["request headers args body ttl=1h"]
 }'),

-- Инспектор адреса. realip на маршруте: модуль кладёт в conn.client_ip то,
-- что приехало в X-Forwarded-For, и t/ip.sh гоняет curl, не только probe.
('edge', 'prefix', '/ip/', 200, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{"requestInspectors": [{"name": "ip"}]}'),

('edge', 'prefix', '/ip-admin/', 210, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{"requestInspectors": [{"name": "ip-admin"}]}'),

('edge', 'prefix', '/ip-ext/', 220, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{"requestInspectors": [{"name": "ip-ext"}]}'),

('edge', 'prefix', '/ip-unknown/', 230, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{"requestInspectors": [{"name": "ip-unknown"}]}'),

-- Классификатор серьёзности описания. Порог унаследован (100): score 98 не
-- отказывает -- модель не ставит deny.
('edge', 'prefix', '/vlai/', 240, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "vlai"}],
    "deadlineMs": 200,
    "deadlinePolicy": "pass"
 }'),

('edge', 'prefix', '/vlai-deny/', 250, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "vlai"}],
    "deadlineMs": 200,
    "deadlinePolicy": "pass",
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

-- Комбинации ip -> CRS -> модель. Отдельный обменник и архив на любой исход:
-- allow без архива выглядит в карточке как «содержимого нет».
('edge', 'prefix', '/ip-modsec/', 260, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "ip"}, {"name": "modsec"}],
    "archive": ["request headers args body ttl=15s"],
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

('edge', 'prefix', '/ip-vlai/', 270, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "ip"}, {"name": "vlai"}],
    "archive": ["request headers args body ttl=15s"],
    "deadlineMs": 400,
    "deadlinePolicy": "pass",
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

('edge', 'prefix', '/ip-modsec-vlai/', 280, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "ip"}, {"name": "modsec"}, {"name": "vlai"}],
    "archive": ["request headers args body ttl=15s"],
    "deadlineMs": 400,
    "deadlinePolicy": "pass",
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

-- Волна 0 -- CRS, волна 1 -- vlai: классический SQLi режет modsec и до модели
-- не доходит, русское описание бюллетеня закрывает ai.
('edge', 'prefix', '/modsec-vlai/', 290, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "modsec"}, {"name": "vlai"}],
    "deadlineMs": 400,
    "deadlinePolicy": "pass",
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

('edge', 'prefix', '/pii/', 300, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "pii"}],
    "deadlineMs": 500,
    "deadlinePolicy": "pass"
 }'),

('edge', 'prefix', '/pii-deny/', 310, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "pii"}],
    "deadlineMs": 500,
    "deadlinePolicy": "pass",
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

('edge', 'prefix', '/pii-wiki/', 320, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "pii"}],
    "deadlineMs": 2000,
    "deadlinePolicy": "pass"
 }'),

('edge', 'prefix', '/pii-wiki-deny/', 330, 'proxy', '/echo', '{
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{
    "requestInspectors": [{"name": "pii"}],
    "deadlineMs": 2000,
    "deadlinePolicy": "pass",
    "scoreDeny": {"threshold": 50, "response": "suspicious"}
 }'),

('edge', 'prefix', '/ip-heavy/', 340, 'proxy', '/echo', '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "proxySetHeaders": [{"name": "Host", "value": "$host"}]
 }', '{"requestInspectors": [{"name": "ip-heavy"}]}'),

-- Пассивный режим: адрес из blocklist здесь даёт 200.
('edge', 'prefix', '/passive/', 350, 'static', null, '{
    "tryFiles": ["/index.html", "=404"]
 }', '{"requestInspectors": [{"name": "ip", "mode": "passive"}]}'),

-- Смешанный маршрут: ip решает, modsec только наблюдает.
('edge', 'prefix', '/shadow/', 360, 'static', null, '{
    "tryFiles": ["/index.html", "=404"]
 }', '{
    "requestInspectors": [{"name": "ip"}, {"name": "modsec"}],
    "inspectorModes": {"modsec": "passive"}
 }'),

-- Полное игнорирование: на шину не уходит ни одного сообщения.
('edge', 'prefix', '/ignored/', 370, 'static', null, '{
    "tryFiles": ["/index.html", "=404"]
 }', '{"inspectorModes": {"ip": "ignore"}}'),

-- Локальный слой: порядок проверок -- порядок объявления, и разрешающая стоит
-- выше запрещающих нарочно.
('edge', 'prefix', '/local/', 380, 'static', null, '{
    "tryFiles": ["/index.html", "=404"]
 }', '{
    "localChecks": [
        {"dataset": "allowlist", "variable": "$binary_remote_addr", "action": "allow"},
        {"dataset": "blocklist", "variable": "$binary_remote_addr", "action": "block",
         "response": "blocked"},
        {"dataset": "badua", "variable": "$http_user_agent", "action": "block",
         "response": "suspicious"}
    ],
    "localRates": [{
        "key": "$binary_remote_addr", "rate": "5r/s", "burst": 5,
        "response": "too_many"
    }]
 }'),

-- Наблюдающий лимит. Числа отличаются от /local/ нарочно: счётчик отделяется
-- подписью правила, в которую входят ключ, частота и всплеск, но не маршрут,
-- и одинаково объявленный лимит был бы одной корзиной на два пути.
('edge', 'prefix', '/local-pass/', 390, 'static', null, '{
    "tryFiles": ["/index.html", "=404"]
 }', '{
    "localRates": [{
        "key": "$binary_remote_addr", "rate": "5r/s", "burst": 2,
        "action": "pass"
    }]
 }'),

-- Счёт по волнам: усиление на шине даёт волна, и запрос с двумя волнами стоит
-- контуру вдвое дороже одноволнового.
('edge', 'prefix', '/local-waves/', 400, 'static', null, '{
    "tryFiles": ["/index.html", "=404"]
 }', '{
    "requestInspectors": [{"name": "ip"}, {"name": "modsec"}],
    "localRates": [{
        "key": "$binary_remote_addr", "rate": "10r/s", "burst": 10,
        "count": "waves", "response": "too_many"
    }]
 }'),

-- Списки контроллера. Инспекторы выключены: проверяется только локальный слой,
-- и чужой вердикт ip не должен маскировать 403 от набора.
('edge', 'prefix', '/lists/', 410, 'static', null, '{
    "realIpFrom": ["0.0.0.0/0", "::/0"],
    "realIpHeader": "X-Forwarded-For",
    "tryFiles": ["/index.html", "=404"]
 }', '{
    "inspectorModes": {"ip": "ignore"},
    "localChecks": [
        {"dataset": "e2e_cidr", "variable": "$binary_remote_addr", "action": "block",
         "response": "blocked"},
        {"dataset": "e2e_ua", "variable": "$http_user_agent", "action": "block",
         "response": "suspicious"},
        {"dataset": "e2e_key", "variable": "$http_x_e2e_key", "action": "block",
         "response": "blocked"}
    ]
 }'),

-- Цель редиректа. Модуль выключен: страница челленджа обязана открываться и
-- тогда, когда инспектор недоступен, иначе клиент попадёт в цикл.
('edge', 'exact', '/waf/captcha', 420, 'static', null, '{
    "tryFiles": ["/waf/captcha.html", "=404"]
 }', '{"enabled": false}'),

('edge', 'exact', '/healthz', 430, 'static', null, '{}', '{"enabled": false}'),

-- === сервер shadow ========================================================

('shadow', 'named', 'waf_deny', 10, 'static', null, '{
    "root": "/usr/share/waf/pages",
    "ssi": true,
    "ssiTypes": ["*"],
    "tryFiles": ["/$waf_deny_name.html", "/blocked.html"]
 }', '{"enabled": false}'),

('shadow', 'prefix', '/', 20, 'static', null, '{
    "tryFiles": ["$uri", "$uri/", "/index.html"]
 }', '{}'),

('shadow', 'prefix', '/app/', 30, 'proxy', '/', '{
    "proxyHttpVersion": "1.1",
    "proxyReadTimeoutMs": 90000,
    "proxySetHeaders": [
        {"name": "Host", "value": "$host"},
        {"name": "X-Forwarded-For", "value": "$proxy_add_x_forwarded_for"},
        {"name": "X-Forwarded-Proto", "value": "$scheme"}
    ]
 }', '{}'),

('shadow', 'exact', '/healthz', 40, 'static', null, '{}', '{"enabled": false}')

     ) as v(server, match, path, position, handler, upstream_uri, nginx, waf)
join http_spaces s on s.name = 'default'
join servers srv on srv.http_space_id = s.id and srv.name = v.server
left join upstreams up on up.http_space_id = s.id and up.name = 'backend'
on conflict (server_id, match, path) do update set
    position     = excluded.position,
    handler      = excluded.handler,
    upstream_id  = excluded.upstream_id,
    upstream_uri = excluded.upstream_uri,
    nginx        = excluded.nginx,
    waf          = excluded.waf;
