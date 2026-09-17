-- Placitum shipped data: default space, reference tables, deny pages, CRS rules, inspector catalog,
-- node port and default profiles. Applied after 01-schema.sql.

INSERT INTO public.http_spaces (id, name, nginx, waf_http, waf, raw, raw_nginx, created_at, updated_at, nginx_main) VALUES ('00000000-0000-4000-8000-000000000001', 'default', '{"errorLog": "/var/log/nginx/error.log info", "includes": ["/etc/nginx/mime.types", "/etc/nginx/waf-node.conf"], "sendfile": true, "accessLog": "/var/log/nginx/access.log", "defaultType": "application/octet-stream", "keepaliveTimeoutS": 65}', '{"shmZone": {"name": "waf", "size": "8m"}, "agentSocket": "/var/run/waf/verdict.sock", "maxInflight": 4096}', '{"inspectors": {}}', false, '', '2026-09-12 15:27:32.86284+00', '2026-09-12 15:27:34.903887+00', '{"events": {"workerConnections": 1024}, "errorLog": "/var/log/nginx/error.log info", "loadModules": ["modules/ngx_http_waf_module.so"], "workerProcesses": 2}') ON CONFLICT DO NOTHING;

INSERT INTO public.content_types (id, name, mime, description) VALUES ('c1000000-0000-4000-8000-000000000001', 'text', 'text/plain', 'Текст') ON CONFLICT DO NOTHING;
INSERT INTO public.content_types (id, name, mime, description) VALUES ('c1000000-0000-4000-8000-000000000002', 'html', 'text/html', 'HTML') ON CONFLICT DO NOTHING;
INSERT INTO public.content_types (id, name, mime, description) VALUES ('c1000000-0000-4000-8000-000000000003', 'json', 'application/json', 'JSON') ON CONFLICT DO NOTHING;
INSERT INTO public.content_types (id, name, mime, description) VALUES ('c1000000-0000-4000-8000-000000000004', 'xml', 'application/xml', 'XML') ON CONFLICT DO NOTHING;
INSERT INTO public.content_types (id, name, mime, description) VALUES ('c1000000-0000-4000-8000-000000000005', 'binary', 'application/octet-stream', 'Двоичный файл') ON CONFLICT DO NOTHING;
INSERT INTO public.content_types (id, name, mime, description) VALUES ('c1000000-0000-4000-8000-000000000006', 'other', 'application/octet-stream', 'Прочее') ON CONFLICT DO NOTHING;

INSERT INTO public.action_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('2760e0c4-d28e-428b-b570-cc2eaa3cde13', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию', '{}', '2026-09-12 15:27:34.587148+00', '2026-09-12 15:27:34.587148+00') ON CONFLICT DO NOTHING;

INSERT INTO public.auth_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('93a2ae70-8746-4b92-8676-aa3a6bca1038', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию', '{}', '2026-09-12 15:27:34.696357+00', '2026-09-12 15:27:34.991053+00') ON CONFLICT DO NOTHING;

INSERT INTO public.body_stores (id, http_space_id, name, driver, spec, "position") VALUES ('6ff36aeb-c8be-48a4-97a3-ac7ea2e6c816', (select id from public.http_spaces where name = 'default'), 'hot', 'redis', '{"max": "8m", "ttl": "1m", "pool": "2", "op_timeout": "200ms", "retain_ttl": "5m", "connect_timeout": "200ms"}', 10) ON CONFLICT DO NOTHING;

INSERT INTO public.cookie_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('d85a2a9f-dcca-4a5b-868e-95b6631f7795', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию', '{"rules": [], "cookies": [], "conditions": [], "description": ""}', '2026-09-12 15:27:35.489891+00', '2026-09-12 15:27:35.489891+00') ON CONFLICT DO NOTHING;

INSERT INTO public.counter_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('191d1c97-7f56-43b4-8d29-742836ee7c98', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию', '{}', '2026-09-12 15:27:34.65105+00', '2026-09-12 15:27:34.65105+00') ON CONFLICT DO NOTHING;
INSERT INTO public.counter_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('a5eaebdb-a3b1-4fa5-bbde-e3ef45234849', (select id from public.http_spaces where name = 'default'), '_probe', 'Проба: deny с пустой корзины', '{"mode": "enforce", "request": {"judge": [{"at": 0, "axis": "ip", "code": "CNT_PROBE", "action": "deny", "counter": "probe"}], "enabled": true, "deny_response": "counter_limit"}, "response": {"enabled": false}, "description": "Проба: deny с пустой корзины"}', '2026-09-12 15:27:34.652556+00', '2026-09-12 15:27:34.652556+00') ON CONFLICT DO NOTHING;

INSERT INTO public.counter_shared (http_space_id, doc, updated_at) VALUES ((select id from public.http_spaces where name = 'default'), '{"counters": {"probe": {"axes": {"ip": {"max": 1, "loss": 100}}, "unit": ""}}, "subjects": {"sess": {"cookie": "waf_cid"}, "user": {"from": ""}}}', '2026-09-12 15:27:34.649455+00') ON CONFLICT DO NOTHING;

INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('27d4c4bc-619b-442e-8f2f-354507b4734d', (select id from public.http_spaces where name = 'default'), 'malformed', 'string', 1000000, '2026-09-12 15:27:34.731454+00', '2026-09-12 15:27:34.731454+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Запрос не разобран: не тот формат (400)', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('2c521647-5b25-49e5-ad60-0ae595cbab64', (select id from public.http_spaces where name = 'default'), 'default_allowlist', 'ip', 1000000, '2026-09-12 15:27:34.74933+00', '2026-09-12 15:27:34.74933+00', 'list', NULL, false, NULL, false, 0, 'Стандартный список разрешаемых адресов, пустой с поставки', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('4f3584f9-4e1c-47b4-88e7-f2ca477f9fdb', (select id from public.http_spaces where name = 'default'), 'error', 'string', 1000000, '2026-09-12 15:27:34.731454+00', '2026-09-12 15:27:34.731454+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Сбой самого контура защиты (502/503)', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('4fd43b34-d6ae-45df-9bb3-8ec0bdf38c44', (select id from public.http_spaces where name = 'default'), 'auth_required', 'string', 1000000, '2026-09-12 15:27:34.731454+00', '2026-09-12 15:27:34.731454+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Нужен второй фактор: калитка не нашла сессии (401)', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('7f5be547-094c-4b26-8ead-332fdac259f0', (select id from public.http_spaces where name = 'default'), 'login_form', 'string', 1000000, '2026-09-12 15:27:34.237074+00', '2026-09-12 15:27:34.237074+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Стандартная форма входа калитки', NULL, false, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('8f6e6e54-2341-4412-870c-bbbe0ec5ce87', (select id from public.http_spaces where name = 'default'), 'suspicious', 'string', 1000000, '2026-09-12 15:27:34.731454+00', '2026-09-12 15:27:34.731454+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Отказ по сумме признаков: сработал порог счёта', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('95da0716-6811-487e-bacd-58678b8ece75', (select id from public.http_spaces where name = 'default'), 'captcha_page', 'string', 1000000, '2026-09-12 15:27:34.322251+00', '2026-09-12 15:27:34.322251+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Стандартная страница капчи', NULL, false, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('9b12fbd9-8026-467e-805f-dc044a708477', (select id from public.http_spaces where name = 'default'), 'blocked', 'string', 1000000, '2026-09-12 15:27:34.731454+00', '2026-09-12 15:27:34.731454+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Отказ по политике: запрос остановлен контуром', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('a98bd327-a6a9-439e-9cea-5347aa552be9', (select id from public.http_spaces where name = 'default'), 'auth_forbidden', 'string', 1000000, '2026-09-12 15:27:34.935275+00', '2026-09-12 15:27:34.935275+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Вошли, но допуска нет: у сессии не та группа (403)', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('c4b7fc66-d796-4e04-bff5-a928f07da623', (select id from public.http_spaces where name = 'default'), 'panel_login', 'string', 1000000, '2026-09-17 12:00:00+00', '2026-09-17 12:00:00+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Branded panel sign-in page, cosmetic and removable', NULL, false, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('c653ae7e-2305-4fa3-8f3d-78cb4e3c451a', (select id from public.http_spaces where name = 'default'), 'too_many', 'string', 1000000, '2026-09-12 15:27:34.731454+00', '2026-09-12 15:27:34.731454+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Превышена частота запросов (429)', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('f4d6e96c-f194-406e-b27b-5037e48a07ba', (select id from public.http_spaces where name = 'default'), 'default_blocklist', 'ip', 1000000, '2026-09-12 15:27:34.74933+00', '2026-09-12 15:27:34.74933+00', 'list', NULL, false, NULL, false, 0, 'Стандартный список блокируемых адресов, пустой с поставки', NULL, true, false) ON CONFLICT DO NOTHING;
INSERT INTO public.datasets (id, http_space_id, name, type, max_entries, created_at, updated_at, kind, content_type_id, active, live_max, in_nginx, "position", description, ttl, builtin, hash) VALUES ('ff9aa17e-6a68-43fb-a36a-6da99f455e90', (select id from public.http_spaces where name = 'default'), 'captcha_required', 'string', 1000000, '2026-09-12 15:27:34.731454+00', '2026-09-12 15:27:34.731454+00', 'content', 'c1000000-0000-4000-8000-000000000002', false, NULL, false, 0, 'Нужна проверка на человека: нет клиренса (403)', NULL, true, false) ON CONFLICT DO NOTHING;

INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('010c3b2c-5619-4f70-9a13-529a0970d1fb', (select id from public.http_spaces where name = 'default'), 'too_many', 'http', '{"status": 429}', 40) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('173994c8-a7a7-4db8-ba8a-77a88b4543ab', (select id from public.http_spaces where name = 'default'), 'counter_limit', 'http', '{"status": 429}', 62) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('3ba2dad9-6010-4b62-816f-01687d995f9b', (select id from public.http_spaces where name = 'default'), 'suspicious', 'http', '{"status": 403}', 20) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('3e6b5bce-2797-42b5-84e0-18628337198b', (select id from public.http_spaces where name = 'default'), 'json_invalid', 'http', '{"status": 400}', 60) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('57769b23-fe57-4d09-96c4-6ee9cca4efa6', (select id from public.http_spaces where name = 'default'), 'auth_forbidden', 'http', '{"status": 403}', 55) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('7a6f789e-c058-49d5-ab28-250902f3f222', (select id from public.http_spaces where name = 'default'), 'blocked', 'http', '{"status": 403}', 10) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('879bfe14-6382-4ca2-984d-b03bc2bff8a2', (select id from public.http_spaces where name = 'default'), 'upgrade_required', 'http', '{"status": 426}', 63) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('9e6a2b20-9e0b-4a30-9257-7331a69504f5', (select id from public.http_spaces where name = 'default'), 'json_response_invalid', 'http', '{"status": 502}', 61) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('c406d92d-7888-4da2-b95e-a67533feb4ee', (select id from public.http_spaces where name = 'default'), 'captcha_required', 'http', '{"status": 403}', 50) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('c593c6e9-c594-4312-98b1-086892af6fa0', (select id from public.http_spaces where name = 'default'), 'rewrite_failed', 'http', '{"status": 502}', 63) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('e27350bb-0762-4b39-9417-b086409a7778', (select id from public.http_spaces where name = 'default'), 'malformed', 'http', '{"status": 400}', 30) ON CONFLICT DO NOTHING;
INSERT INTO public.deny_responses (id, http_space_id, name, type, spec, "position") VALUES ('e9abfb73-dca6-4dd2-a484-61193f2d0e7b', (select id from public.http_spaces where name = 'default'), 'ws_policy', 'websocket', '{"code": 1008, "reason": "policy violation"}', 62) ON CONFLICT DO NOTHING;

INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level, installed) VALUES ('0d249ed3-1921-4e9f-80c6-ee7c84334072', (select id from public.http_spaces where name = 'default'), 'vlai', 'waf.req.vlai', 30, '# inspector.conf — локальная очередь процесса
queue_max     8;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:33.935897+00', '2026-09-12 15:27:34.665214+00', '{request}', 'Классификатор серьёзности: ML-модель оценивает описание в теле, отвечает score.', '', 'info', false) ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('34b8eed9-7107-43bc-8859-a6d13dd4f03c', (select id from public.http_spaces where name = 'default'), 'rewrite', 'waf.req.rewrite', 0, '# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:35.081174+00', '2026-09-12 15:27:35.081174+00', '{response,frame}', 'Модификация ответов: подмена тела через обменник, операции над заголовками', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('3583778c-6bd1-4904-84f7-095218cac4ce', (select id from public.http_spaces where name = 'default'), 'action', 'waf.req.action', 0, '# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:34.583707+00', '2026-09-12 15:27:34.665214+00', '{request}', 'Отправитель канала действий: смотрит на маршрут и подсказывает соседям — threshold, note, skip. Сам ничего не проверяет.', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('3ed92a9e-0339-4111-b553-fce1e026fa1c', (select id from public.http_spaces where name = 'default'), 'auth', 'waf.req.auth', 0, '# inspector.conf — локальная очередь процесса
queue_max     32;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:34.146064+00', '2026-09-12 15:27:35.185001+00', '{request,response}', 'Второй фактор: калитка перед маршрутом — форма и TOTP, пропуск по сессии профиля.', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('5f19f68c-64cd-4a43-ab65-26bafdf8d490', (select id from public.http_spaces where name = 'default'), 'modsec', 'waf.req.modsec', 10, '# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:33.935897+00', '2026-09-12 15:27:34.665214+00', '{request,response,frame}', 'Движок правил SecLang (Coraza): CRS и свои наборы, запрос и ответ одной транзакцией.', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('71393095-178b-42e5-a7c1-2e323329456a', (select id from public.http_spaces where name = 'default'), 'captcha', 'waf.req.captcha', 0, '# inspector.conf — локальная очередь процесса
queue_max     32;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:34.314046+00', '2026-09-12 15:27:34.665214+00', '{request}', 'Капча: испытание подозрительному клиенту, решившим — пропуск по сессии.', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('a4df5a50-bc3b-401f-bad9-f752d6909ca4', (select id from public.http_spaces where name = 'default'), 'cookie', 'waf.req.cookie', 0, '# inspector.conf — локальная очередь процесса
queue_max     256;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:35.485557+00', '2026-09-12 15:27:35.485557+00', '{request,response}', 'Кука: выдаёт и снимает Set-Cookie, пишет её значение в живые наборы и рассказывает соседям. Ничего не проверяет.', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('bdcd5209-ecbf-45c9-92dd-1f9e29a10dda', (select id from public.http_spaces where name = 'default'), 'counter', 'waf.req.counter', 0, '# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:34.644318+00', '2026-09-12 15:27:34.665214+00', '{request,response,frame}', 'Поведенческий счёт полученного: судит не намерение, а результат — сколько клиент унёс за окно.', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('d0534de3-e068-4d97-a5a5-b752ebbec749', (select id from public.http_spaces where name = 'default'), 'ip', 'waf.req.ip', 20, '# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:33.935897+00', '2026-09-12 15:27:34.665214+00', '{request}', 'IP фильтр: страны, ASN, наборы и списки. Отвечает allow или deny, тело не читает.', '', 'info') ON CONFLICT DO NOTHING;
INSERT INTO public.inspectors (id, http_space_id, name, subject, "position", conf, created_at, updated_at, phases, description, docs_url, log_level) VALUES ('d86788fe-b683-4dfa-91cb-bfc0c5b46c26', (select id from public.http_spaces where name = 'default'), 'json', 'waf.req.json', 0, '# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
', '2026-09-12 15:27:34.42567+00', '2026-09-12 15:27:34.665214+00', '{request,response,frame}', 'Контракт API: сверяет вызов с OpenAPI или JSON Schema, читает целое тело фазы из обменника.', '', 'info') ON CONFLICT DO NOTHING;

INSERT INTO public.ip_profiles (id, http_space_id, name, description, created_at, updated_at, default_action, default_code, outcomes) VALUES ('e1000000-0000-4000-8000-000000000001', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию: без правил, иначе allow', '2026-09-12 15:27:33.697676+00', '2026-09-12 15:27:33.697676+00', 'allow', '', '[]') ON CONFLICT DO NOTHING;

INSERT INTO public.json_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('a379f2d1-d73b-4f54-ba42-945c81ddba89', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию', '{}', '2026-09-12 15:27:34.432558+00', '2026-09-12 15:27:34.432558+00') ON CONFLICT DO NOTHING;

INSERT INTO public.log_formats (id, http_space_id, name, fields, kind, format) VALUES ('bf7ae59f-159f-40bf-8dbf-5440e58216ad', (select id from public.http_spaces where name = 'default'), 'main', '{}', 'nginx', '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" rt=$request_time urt=$upstream_response_time') ON CONFLICT DO NOTHING;

INSERT INTO public.ports (id, http_space_id, name, address, port, ssl, http2, proxy_protocol) VALUES ('efa4b6ec-fe54-47f2-b9aa-fbe1be6de12f', (select id from public.http_spaces where name = 'default'), 'http-8080', '0.0.0.0', 8080, false, false, false) ON CONFLICT DO NOTHING;

INSERT INTO public.rewrite_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('3f27aec0-496e-4aea-9d34-40df23ae9b98', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию', '{}', '2026-09-12 15:27:35.086708+00', '2026-09-12 15:27:35.086708+00') ON CONFLICT DO NOTHING;

INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000001', (select id from public.http_spaces where name = 'default'), 'engine', 'Движок', 'Include @coraza.conf-recommended
SecRuleEngine DetectionOnly
SecAuditEngine Off
SecAuditLog /dev/null
SecDebugLogLevel 0
SecResponseBodyAccess Off
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000004', (select id from public.http_spaces where name = 'default'), 'setup-pl1', 'CRS setup, паранойя 1', 'Include @crs-setup.conf.example
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.blocking_paranoia_level=1"
SecAction "id:900110,phase:1,nolog,pass,t:none,setvar:tx.inbound_anomaly_score_threshold=5"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000005', (select id from public.http_spaces where name = 'default'), 'setup-pl2', 'CRS setup, паранойя 2', 'Include @crs-setup.conf.example
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.blocking_paranoia_level=2"
SecAction "id:900110,phase:1,nolog,pass,t:none,setvar:tx.inbound_anomaly_score_threshold=5"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000006', (select id from public.http_spaces where name = 'default'), 'crs-init', 'CRS 901 + сканеры + LFI', 'Include @owasp_crs/REQUEST-901-INITIALIZATION.conf
Include @owasp_crs/REQUEST-913-SCANNER-DETECTION.conf
Include @owasp_crs/REQUEST-930-APPLICATION-ATTACK-LFI.conf
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000007', (select id from public.http_spaces where name = 'default'), 'crs-init-api', 'CRS 901 для API', 'Include @owasp_crs/REQUEST-901-INITIALIZATION.conf
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000008', (select id from public.http_spaces where name = 'default'), 'extra-default', 'Политика default', 'SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=default"
SecRule REQUEST_URI "@beginsWith /healthz" "id:1000001,phase:1,allow,nolog"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000009', (select id from public.http_spaces where name = 'default'), 'extra-strict', 'Политика strict поверх CRS', 'SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=strict"
SecRule REQUEST_HEADERS:User-Agent "@rx (?i)nikto|sqlmap|nessus|w3af" \
  "id:1001001,phase:1,deny,status:403,msg:''scanner''"
SecRule ARGS "@rx \.\./" "id:1001002,phase:2,deny,status:403,msg:''lfi''"
SecRule ARGS "@rx (?:;|\|\||&&)\s*(?:wget|curl|bash|nc)\b" \
  "id:1001003,phase:2,deny,status:403,msg:''rce''"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-00000000000a', (select id from public.http_spaces where name = 'default'), 'extra-api', 'Политика api поверх CRS', 'SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=api"
SecRule ARGS "@rx (?i)union\s+select" "id:1002001,phase:2,deny,status:403,msg:''sqli''"
SecRule ARGS "@rx (?i)<script" "id:1002002,phase:2,deny,status:403,msg:''xss''"
SecRule REQUEST_HEADERS:Content-Type "@rx (?i)text/xml|application/xml" \
  "id:1002003,phase:1,pass,nolog,setvar:tx.modsec_api=xml"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000010', (select id from public.http_spaces where name = 'default'), 'crs-934', 'CRS generic + SSRF', '# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:934011,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:934012,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#


# [ NodeJS Insecure unserialization / generic RCE signatures ]
#
# Libraries performing insecure unserialization:
# - node-serialize: _$$ND_FUNC$$_ (CVE-2017-5941)
# - funcster: __js_function
#
# See:
# https://opsecx.com/index.php/2017/02/08/exploiting-node-js-deserialization-bug-for-remote-code-execution/
# https://www.acunetix.com/blog/web-security-zone/deserialization-vulnerabilities-attacking-deserialization-in-js/
#
# Some generic snippets used:
# - function() {
# - new Function(
# - eval(
# - String.fromCharCode(
#
# Last two are used by nodejsshell.py,
# https://github.com/ajinabraham/Node.Js-Security-Course/blob/master/nodejsshell.py
#
# As base64 is sometimes (but not always) used to encode serialized values,
# use multiMatch and t:base64decode.
#
# Regular expression generated from regex-assembly/934100.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934100
#
# Stricter sibling: 934101
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx _(?:\$\$ND_FUNC\$\$_|_js_function)|(?:\beval|new[\s\x0b]+Function[\s\x0b]*)\(|(?:String\.fromCharCod|Module:prototyp)e|function\(\)\{|this\.constructor|module\.exports=|\([\s\x0b]*[^0-9A-Z_a-z]child_process[^0-9A-Z_a-z][\s\x0b]*\)|cons(?:tructor:constructor|ole(?:\.(?:(?:debu|lo)g|error|info|trace|warn)(?:\.call)?\(|\[[\"''`](?:(?:debu|lo)g|error|info|trace|warn)[\"''`]\]))|process(?:\.(?:(?:a(?:ccess|ppendfile|rgv|vailability)|c(?:aveats|h(?:mod|own)|(?:los|opyfil)e|p|reate(?:read|write)stream)|ex(?:ec(?:file)?|ists)|f(?:ch(?:mod|own)|data(?:sync)?|s(?:tat|ync)|utimes)|inodes|l(?:chmod|ink|stat|utimes)|mkd(?:ir|temp)|open(?:dir)?|r(?:e(?:ad(?:dir|file|link|v)?|name)|m)|s(?:pawn(?:file)?|tat|ymlink)|truncate|u(?:n(?:link|watchfile)|times)|w(?:atchfile|rite(?:file|v)?))(?:sync)?(?:\.call)?\(|binding|constructor|env|global|main(?:Module)?|process|require)|\[[\"''`](?:(?:a(?:ccess|ppendfile|rgv|vailability)|c(?:aveats|h(?:mod|own)|(?:los|opyfil)e|p|reate(?:read|write)stream)|ex(?:ec(?:file)?|ists)|f(?:ch(?:mod|own)|data(?:sync)?|s(?:tat|ync)|utimes)|inodes|l(?:chmod|ink|stat|utimes)|mkd(?:ir|temp)|open(?:dir)?|r(?:e(?:ad(?:dir|file|link|v)?|name)|m)|s(?:pawn(?:file)?|tat|ymlink)|truncate|u(?:n(?:link|watchfile)|times)|w(?:atchfile|rite(?:file|v)?))(?:sync)?|binding|constructor|env|global|main(?:Module)?|process|require)[\"''`]\])|(?:binding|constructor|env|global|main(?:Module)?|process|require)\[|require(?:\.(?:resolve(?:\.call)?\(|main|extensions|cache)|\[[\"''`](?:(?:resolv|cach)e|main|extensions)[\"''`]\])" \
    "id:934100,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,t:removeWhitespace,t:base64Decode,t:urlDecodeUni,t:jsDecode,t:removeWhitespace,\
    msg:''Node.js Injection Attack 1/2'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-javascript'',\
    tag:''platform-multi'',\
    tag:''platform-nodejs'',\
    tag:''attack-rce'',\
    tag:''attack-injection-generic'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    multiMatch,\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# -=[ SSRF Attacks ]=-
#
# We provide only partial protection to SSRF. DNS Rebinding attacks needs
# to be handled at application level, and even those might be difficult to catch.
#
# PL1 rules are based on common attacks on cloud providers, based on well-known URLs.
#
# -=[ References ]=-
# https://highon.coffee/blog/ssrf-cheat-sheet/
# https://cwe.mitre.org/data/definitions/918.html
# https://capec.mitre.org/data/definitions/664.html)
#
# Preventing: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|ARGS_NAMES|ARGS|XML:/* "@pmFromFile ssrf.data" \
    "id:934110,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:''Possible Server Side Request Forgery (SSRF) Attack: Cloud provider metadata URL in Parameter'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-ssrf'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/225/664'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# This rule detects SSRF attempts using hostnames without schemes.
# Some frameworks and libraries add implicit ''http://'' or ''https://'' schemes
# when processing URLs, making scheme-less hostnames effective attack vectors.
#
# Examples:
# - localhost/
# - host.docker.internal/
# - kubernetes.default.svc.cluster.local/
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|ARGS_NAMES|ARGS|XML:/* "@pmFromFile ssrf-no-scheme.data" \
    "id:934190,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:''Possible Server Side Request Forgery (SSRF) Attack: Scheme-less localhost or internal hostname detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-ssrf'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/225/664'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# JavaScript prototype pollution injection attempts
#
# Example from https://hackerone.com/reports/869574 critical
# vulnerability in the TypeORM library:
# {"text":"a","title":{"__proto__":{"where":{"name":"sqlinjection","where":null}}}}
#
# Test cases are based on this list of payloads:
# https://github.com/BlackFan/client-side-prototype-pollution/blob/master/README.md
#
# See also: https://cwe.mitre.org/data/definitions/1321.html
#
# Note: only server-based (not DOM-based) attacks are covered here.

# Regular expression generated from regex-assembly/934130.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934130
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx __proto__|constructor[\s\x0b]*(?:\.|\]?\[)[\s\x0b]*prototype" \
    "id:934130,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,\
    msg:''JavaScript Prototype Pollution'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-javascript'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''attack-injection-generic'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1/180/77'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    multiMatch,\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# [ Ruby generic RCE signatures ]
#
# Detects Ruby-based injection attacks.
# Example: Process.spawn("id")
#
# Regular expression generated from regex-assembly/934150.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934150
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx Process[\s\x0b]*\.[\s\x0b]*spawn[\s\x0b]*\(" \
    "id:934150,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:''Ruby Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-ruby'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''attack-injection-generic'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# [ NodeJS DoS signatures ]
#
# NodeJS runs in a single thread, so any evaluated payloads that block execution can cause an easy DoS.
# This rule attempts to block e.g. while(true).
#
# Regular expression generated from regex-assembly/934160.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934160
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx while[\s\x0b]*\([\s\x0b\(]*(?:!+(?:false|null|undefined|NaN|[\+\-]?0|\"{2}|''{2}|`{2})|(?:!!)*(?:(?:t(?:rue|his)|[\+\-]?(?:Infinity|[1-9][0-9]*)|new [A-Za-z][0-9A-Z_a-z]*|window|String|(?:Boolea|Functio)n|Object|Array)\b|\{[^\}]*\}|\[[^\]]*\]|\"[^\"]+\"|''[^'']+''|`[^`]+`)).*\)" \
    "id:934160,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,t:base64Decode,t:urlDecodeUni,t:jsDecode,t:replaceComments,\
    msg:''Node.js DoS attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-javascript'',\
    tag:''platform-nodejs'',\
    tag:''attack-rce'',\
    tag:''attack-injection-generic'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    multiMatch,\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# [ PHP data: scheme ]
#
# PHP supports the `data:` scheme without using `//` before the content-type.
#
# Regular expression generated from regex-assembly/934170.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934170
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx ^data:(?:(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)/(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)|\*)(?:[\s\x0b]*;[\s\x0b]*(?:charset[\s\x0b]*=[\s\x0b]*\"?(?:iso-8859-15?|utf-8|windows-1252)\b\"?|(?:[^\s\x0b-\"\(\),/:-\?\[-\]c\{\}]|c(?:[^!\"\(\),/:-\?\[-\]h\{\}]|h(?:[^!\"\(\),/:-\?\[-\]a\{\}]|a(?:[^!\"\(\),/:-\?\[-\]r\{\}]|r(?:[^!\"\(\),/:-\?\[-\]s\{\}]|s(?:[^!\"\(\),/:-\?\[-\]e\{\}]|e[^!\"\(\),/:-\?\[-\]t\{\}]))))))[^!\"\(\),/:-\?\[-\]\{\}]*[\s\x0b]*=[\s\x0b]*[^!\(\),/:-\?\[-\]\{\}]+);?)*(?:[\s\x0b]*,[\s\x0b]*(?:(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)/(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)|\*)(?:[\s\x0b]*;[\s\x0b]*(?:charset[\s\x0b]*=[\s\x0b]*\"?(?:iso-8859-15?|utf-8|windows-1252)\b\"?|(?:[^\s\x0b-\"\(\),/:-\?\[-\]c\{\}]|c(?:[^!\"\(\),/:-\?\[-\]h\{\}]|h(?:[^!\"\(\),/:-\?\[-\]a\{\}]|a(?:[^!\"\(\),/:-\?\[-\]r\{\}]|r(?:[^!\"\(\),/:-\?\[-\]s\{\}]|s(?:[^!\"\(\),/:-\?\[-\]e\{\}]|e[^!\"\(\),/:-\?\[-\]t\{\}]))))))[^!\"\(\),/:-\?\[-\]\{\}]*[\s\x0b]*=[\s\x0b]*[^!\(\),/:-\?\[-\]\{\}]+);?)*)*" \
    "id:934170,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''PHP data scheme attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-php'',\
    tag:''platform-multi'',\
    tag:''attack-ssrf'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:934013,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:934014,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#

# This rule is a stricter sibling of 934100.
# Regular expression generated from regex-assembly/934101.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934101
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?:close|exists|fork|(?:ope|spaw)n|re(?:ad|quire)|w(?:atch|rite))[\s\x0b]*\(" \
    "id:934101,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,t:base64Decode,t:urlDecodeUni,t:jsDecode,\
    msg:''Node.js Injection Attack 2/2'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-javascript'',\
    tag:''platform-nodejs'',\
    tag:''attack-rce'',\
    tag:''attack-injection-generic'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    multiMatch,\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# -=[ SSRF Attacks ]=-
#
# PL2 rules adds SSRF capture for common evasion techniques.
#
# We add captures for these evasion techniques: (see source in util/regexp-assemble/data/regexp-934120.data)
# http://425.510.425.510/ Dotted decimal with overflow (already covered by RFI rule 931100)
# http://2852039166/ Dotless decimal - \d{10}
# http://7147006462/ Dotless decimal with overflow - \d{10}
# http://0xA9.0xFE.0xA9.0xFE/ Dotted hexadecimal - (?:0x[a-f0-9]{2}\.){3}0x[a-f0-9]{2}
# http://0xA9FEA9FE/ Dotless hexadecimal - 0x[a-f0-9]{8}
# http://0x41414141A9FEA9FE/ Dotless hexadecimal with overflow - 0x[a-f0-9]{16}
# http://0251.0376.0251.0376/ Dotted octal - Covered by the same below
# http://0251.00376.000251.0000376/ Dotted octal with padding - (?:0{1,4}\d{3}\.){3}0{1,4}\d{3})
# http://169.254.43518/ - (?:\d{1,3}\.){2}\.\d{5}
# http://169.16689662/ - \d{1,3}\.\d{8}
# http://[::ffff:a9fe:a9fe] IPV6 Compressed - IPv6 regex from https://ihateregex.io/expr/ipv6/, with [0-9] converted to \d and with non-capturing groups (below)
# http://[0:0:0:0:0:ffff:a9fe:a9fe] IPV6 Expanded -  (?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d)\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d)|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d))
# http://[0:0:0:0:0:ffff:169.254.169.254] IPV6/IPV4 - ((?:[0-9a-fA-F]{1,4}:){6}(?:(25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d)\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d))
# http://[::]
# http://127.88.23.245:22/+&@google.com:80#+@google.com:80/ (already covered by RFI rule 931100)
# http://127.88.23.245:22/?@google.com:80/ (already covered by RFI rule 931100)
# http://127.88.23.245:22/#@www.google.com:80/ (already covered by RFI rule 931100)
# http://google.com:80\\@127.88.23.245:22/ (already covered by RFI rule 931100)
# http://google.com:80+&@127.88.23.245:22/#+@google.com:80/
# http://google.com:80+&@google.com:80#+@127.88.23.245:22/
#
# Regular expression generated from regex-assembly/934120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934120
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:a(?:cap|f[ps]|ttachment)|b(?:eshare|itcoin|lob)|c(?:a(?:llto|p)|id|vs|ompress.(?:zlib|bzip2))|d(?:a(?:v|ta)|ict|n(?:s|tp))|e(?:d2k|xpect)|f(?:(?:ee)?d|i(?:le|nger|sh)|tps?)|g(?:it|o(?:pher)?|lob)|h(?:323|ttps?)|i(?:ax|cap|(?:ma|p)ps?|rc[6s]?)|ja(?:bbe)?r|l(?:dap[is]?|ocal_file)|m(?:a(?:ilto|ven)|ms|umble)|n(?:e(?:tdoc|ws)|fs|ntps?)|ogg|p(?:aparazzi|h(?:ar|p)|op(?:2|3s?)|r(?:es|oxy)|syc)|r(?:mi|sync|tm(?:f?p)?|ar)|s(?:3|ftp|ips?|m(?:[bs]|tps?)|n(?:ews|mp)|sh(?:2(?:.(?:s(?:hell|(?:ft|c)p)|exec|tunnel))?)?|vn(?:\+ssh)?)|t(?:e(?:amspeak|lnet)|ftp|urns?)|u(?:dp|nreal|t2004)|v(?:entrilo|iew-source|nc)|w(?:ebcal|ss?)|x(?:mpp|ri)|zip):/?/?(?:[0-9]{7,10}|(?:0x[0-9a-f]{2}\.){3}0x[0-9a-f]{2}|0x(?:[0-9a-f]{8}|[0-9a-f]{16})|(?:0{1,4}[0-9]{1,3}\.){3}0{1,4}[0-9]{1,3}|[0-9]{1,3}\.(?:[0-9]{1,3}\.[0-9]{5}|[0-9]{8})|(?:\x5c\x5c[\-0-9a-z]\.?_?)+|\[[0-:a-f]+(?:[\.0-9]+|%[0-9A-Z_a-z]+)?\]|[a-z][\-\.0-9A-Z_a-z]{1,255}:[0-9]{1,5}(?:#?[\s\x0b]*&?@(?:(?:[0-9]{1,3}\.){3}[0-9]{1,3}|[a-z][\-\.0-9A-Z_a-z]{1,255}):[0-9]{1,5}/?)+|[\.0-9]{0,11}(?:\x{e2}(?:\x91[\xa0-\x{bf}]|\x92[\x80-\x{bf}]|\x93[\x80-\x{a9}\x{ab}-\x{bf}])|\x{e3}\x80\x82)+)" \
    "id:934120,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:''Possible Server Side Request Forgery (SSRF) Attack: URL Parameter using IP Address'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-ssrf'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/225/664'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# [ Perl generic RCE signatures ]
#
# Detects Perl-based injection attacks.
# Example: @{[system whoami]}
#
# Regular expression generated from regex-assembly/934140.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934140
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx @+\{[\s\x0b]*\[" \
    "id:934140,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:''Perl Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-perl'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''attack-injection-generic'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# [ Generic RCE signatures ]
#
# Detects General SSTI attacks.
# Example: <%= File.open(''/etc/passwd'').read %>
# Note: there is another rule 941380 that checks for {{.*}} regex.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?:\{%[^%}]*%}|<%=?[^%>]*%>)" \
    "id:934180,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:''SSTI Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''platform-multi'',\
    tag:''attack-ssti'',\
    tag:''attack-injection-generic'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-GENERIC'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:934015,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:934016,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:934017,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:934018,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000011', (select id from public.http_spaces where name = 'default'), 'crs-941', 'CRS XSS', '# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:941011,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:941012,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#


# In CRS v4.0, we have added REQUEST_FILENAME to the list of variables to
# be checked for XSS to catch path-based XSS exploits such as:
# /index.php/%3Csvg/onload=alert()
#
# However, the REQUEST_FILENAME is always populated (while ARGS etc. are
# only set on some requests) and we found that always checking the
# REQUEST_FILENAME has a significant performance impact.
# Therefore, we are disabling the REQUEST_FILENAME XSS checks when the
# REQUEST_FILENAME is clearly not containing special characters necessary
# for a successful XSS.
#
# Some bona-fide REQUEST_FILENAMEs will still contain special characters
# and will be checked by the rules, but it will be a much lower amount,
# and that is a trade-off we are willing to make.
#
# So, we check for XSS in REQUEST_FILENAME only if it contains
# other characters than alphanumeric characters, hyphens, underscores etc.
# typically found in filenames and paths:
#
# - ascii 20 (whitespace)
# - ascii 45-47 (- . /)
# - ascii 48-57 (0-9)
# - ascii 65-90 (A-Z)
# - ascii 95 (underscore)
# - ascii 97-122 (a-z)
#
# If just these characters are present, we make use of a special tag to remove
# REQUEST_FILENAME from the target list of all the 941xxx rules starting 941100.
#
# Please note that it would be preferable to start without REQUEST_FILENAME in the
# target list and to add it on a case to case base, but the rule language does not
# support this feature at runtime.
#
SecRule REQUEST_FILENAME "!@validateByteRange 20,45-47,48-57,65-90,95,97-122" \
    "id:941010,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    ctl:ruleRemoveTargetByTag=xss-perf-disable;REQUEST_FILENAME,\
    ver:''OWASP_CRS/4.25.0''"


#
# -=[ Libinjection - XSS Detection ]=-
#
# Ref: https://github.com/client9/libinjection
# Ref: https://speakerdeck.com/ngalbreath/libinjection-from-sqli-to-xss
#
# -=[ Targets ]=-
#
# 941100: PL1 : REQUEST_COOKIES|
#               REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|
#               ARGS_NAMES|ARGS|XML:/*
#
# 941101: PL2 : REQUEST_FILENAME|REQUEST_HEADERS:Referer
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|XML:/* "@detectXSS" \
    "id:941100,\
    phase:2,\
    block,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''XSS Attack Detected via libinjection'',\
    logdata:''Matched Data: XSS data found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ XSS Filters - Category 1 ]=-
# http://xssplayground.net23.net/xssfilter.html
# script tag based XSS vectors, e.g., <script> alert(1)</script>
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|ARGS_NAMES|ARGS|XML:/* "@rx (?i)<script[^>]*>[\s\S]*?" \
    "id:941110,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''XSS Filter - Category 1: Script Tag Vector'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ XSS Filters - Category 2 ]=-
# XSS vectors making use of event handlers like onerror, onload etc, e.g., <body onload="alert(1)">
#
# We are not listing all the known event handlers like rule 941160, but we
# limit the alerts to keywords of 3-50 characters after the prefix ("on").
#
# The shortest known event is "onget". The longest known event is "onwebkitplaybacktargetavailabilitychanged"
# with 39 chars after the prefix. 50 chars adds a little bit of safety.
#
# The regex requires the equals sign to be followed by a non-equals character (=[^=])
# to prevent false positives with base64-encoded strings (which often end in = or ==).
# This improvement allows the rule to be placed at PL1 despite having previously been
# moved to PL2 in v3.4 due to base64-related false positives with the older regex.
#
# Regular expression generated from regex-assembly/941120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941120
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[\t-\r \"''\(,/-9;=`]on[a-z]{3,50}[\t-\r \(,;]*?=[^=]" \
    "id:941120,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''XSS Filter - Category 2: Event Handler Vector'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ XSS Filters - Category 3 ]=-
#
# Regular expression generated from regex-assembly/941130.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941130
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i).(?:\b(?:(?:x(?:link:href|html|mlns)|data:text/html|formaction)\b|pattern[\s\x0b]*=)|(?:!ENTITY[\s\x0b]+(?:%[\s\x0b]+)?[^\s\x0b]+[\s\x0b]+(?:SYSTEM|PUBLIC)|@import|;base64)\b)" \
    "id:941130,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''XSS Filter - Category 3: Attribute Vector'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ XSS Filters - Category 4 ]=-
# XSS vectors making use of javascript uri and tags, e.g., <p style="background:url(javascript:alert(1))">
# https://portswigger.net/web-security/cross-site-scripting/cheat-sheet#css-expressions-ie7
# https://portswigger.net/web-security/cross-site-scripting/cheat-sheet#behaviors-for-older-modes-of-ie
# examples: https://regex101.com/r/FFEpsh/1
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[a-z]+=(?:[^:=]+:.+;)*?[^:=]+:url\(javascript" \
    "id:941140,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,t:removeWhitespace,\
    msg:''XSS Filter - Category 4: Javascript URI Vector'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ NoScript XSS Filters ]=-
# Ref: http://noscript.net/
#
# [NoScript InjectionChecker] HTML injection
#
# Regular expression generated from regex-assembly/941160.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941160
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<[^0-9<>A-Z_a-z]*(?:[^\s\x0b\"''<>]*:)?[^0-9<>A-Z_a-z]*[^0-9A-Z_a-z]*?(?:s[^0-9A-Z_a-z]*?(?:c[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?p[^0-9A-Z_a-z]*?t|t[^0-9A-Z_a-z]*?y[^0-9A-Z_a-z]*?l[^0-9A-Z_a-z]*?e|v[^0-9A-Z_a-z]*?g|e[^0-9A-Z_a-z]*?t[^0-9>A-Z_a-z])|f[^0-9A-Z_a-z]*?o[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?m|d[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?l[^0-9A-Z_a-z]*?o[^0-9A-Z_a-z]*?g|m[^0-9A-Z_a-z]*?(?:a[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?q[^0-9A-Z_a-z]*?u[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?e|e[^0-9A-Z_a-z]*?t[^0-9A-Z_a-z]*?a[^0-9>A-Z_a-z])|(?:l[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?n[^0-9A-Z_a-z]*?k|o[^0-9A-Z_a-z]*?b[^0-9A-Z_a-z]*?j[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?c[^0-9A-Z_a-z]*?t|e[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?b[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?d|a[^0-9A-Z_a-z]*?(?:p[^0-9A-Z_a-z]*?p[^0-9A-Z_a-z]*?l[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?t|u[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?o|n[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?t[^0-9A-Z_a-z]*?e)|p[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?m|i?[^0-9A-Z_a-z]*?f[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?e|b[^0-9A-Z_a-z]*?(?:a[^0-9A-Z_a-z]*?s[^0-9A-Z_a-z]*?e|o[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?y|i[^0-9A-Z_a-z]*?n[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?n[^0-9A-Z_a-z]*?g[^0-9A-Z_a-z]*?s)|i[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?a?[^0-9A-Z_a-z]*?g[^0-9A-Z_a-z]*?e?|v[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?o)[^0-9>A-Z_a-z])|(?:<[0-9A-Z_a-z][^\s\x0b/]*[\s\x0b/]|[\"''](?:[^\s\x0b/]*[\s\x0b/])?)(?:background|formaction|lowsrc|on(?:a(?:bort|ctivate|d(?:apteradded|dtrack)|fter(?:print|(?:scriptexecu|upda)te)|lerting|n(?:imation(?:cancel|end|iteration|start)|tennastatechange)|ppcommand|u(?:dio(?:end|process|start)|xclick))|b(?:e(?:fore(?:(?:(?:(?:de)?activa|scriptexecu)t|toggl)e|c(?:opy|ut)|editfocus|input|p(?:aste|rint)|u(?:nload|pdate))|gin(?:Event)?)|l(?:ocked|ur)|oun(?:ce|dary)|roadcast|usy)|c(?:a(?:(?:ch|llschang)ed|nplay(?:through)?|rdstatechange)|(?:ell|fstate)change|h(?:a(?:rging(?:time)?cha)?nge|ecking)|l(?:ick|ose)|o(?:m(?:mand(?:update)?|p(?:lete|osition(?:end|start|update)))|n(?:nect(?:ed|ing)|t(?:extmenu|rolselect))|py)|u(?:echange|t))|d(?:ata(?:(?:availabl|chang)e|error|setc(?:hanged|omplete))|blclick|e(?:activate|livery(?:error|success)|vice(?:found|light|(?:mo|orienta)tion|proximity))|i(?:aling|s(?:abled|c(?:hargingtimechange|onnect(?:ed|ing))))|o(?:m(?:a(?:ctivate|ttrmodified)|(?:characterdata|subtree)modified|focus(?:in|out)|mousescroll|node(?:inserted(?:intodocument)?|removed(?:fromdocument)?))|wnloading)|r(?:ag(?:drop|e(?:n(?:d|ter)|xit)|(?:gestur|leav)e|over|start)|op)|urationchange)|e(?:mptied|n(?:abled|d(?:ed|Event)?|ter)|rror(?:update)?|xit)|f(?:ailed|i(?:lterchange|nish)|o(?:cus(?:in|out)?|rm(?:change|input))|ullscreenchange)|g(?:amepad(?:axismove|button(?:down|up)|(?:dis)?connected)|et)|h(?:ashchange|e(?:adphoneschange|l[dp])|olding)|i(?:cc(?:cardlockerror|infochange)|n(?:coming|put|valid))|key(?:down|press|up)|l(?:evelchange|o(?:ad(?:e(?:d(?:meta)?data|nd)|start)?|secapture)|y)|m(?:ark|essage|o(?:use(?:down|enter|(?:lea|mo)ve|o(?:ut|ver)|up|wheel)|ve(?:end|start)?|z(?:a(?:fterpaint|udioavailable)|(?:beforeresiz|orientationchang|t(?:apgestur|imechang))e|(?:edgeui(?:c(?:ancel|omplet)|start)e|network(?:down|up)loa)d|fullscreen(?:change|error)|m(?:agnifygesture(?:start|update)?|ouse(?:hittest|pixelscroll))|p(?:ointerlock(?:change|error)|resstapgesture)|rotategesture(?:start|update)?|s(?:crolledareachanged|wipegesture(?:end|start|update)?))))|no(?:match|update)|o(?:(?:bsolet|(?:ff|n)lin)e|pen|verflow(?:changed)?)|p(?:a(?:ge(?:hide|show)|int|(?:st|us)e)|lay(?:ing)?|o(?:inter(?:down|enter|(?:(?:lea|mo)v|rawupdat)e|o(?:ut|ver)|up)|p(?:state|up(?:hid(?:den|ing)|show(?:ing|n))))|ro(?:gress|pertychange))|r(?:atechange|e(?:adystatechange|ceived|movetrack|peat(?:Event)?|quest|s(?:et|ize|u(?:lt|m(?:e|ing)))|trieving)|ow(?:e(?:nter|xit)|s(?:delete|inserted)))|s(?:croll(?:end)?|e(?:arch|ek(?:complete|ed|ing)|lect(?:ionchange|start)?|n(?:ding|t)|t)|how|(?:ound|peech)(?:end|start)|t(?:a(?:lled|rt|t(?:echange|uschanged))|k(?:comma|sessione)nd|op)|u(?:bmit|ccess|spend)|vg(?:abort|error|(?:un)?load|resize|scroll|zoom))|t(?:ext|ime(?:out|update)|o(?:ggle|uch(?:cancel|en(?:d|ter)|(?:lea|mo)ve|start))|ransition(?:cancel|end|run|start))|u(?:n(?:derflow|handledrejection|load)|p(?:dateready|gradeneeded)|s(?:erproximity|sdreceived))|v(?:ersion|o(?:ic|lum)e)change|w(?:a(?:it|rn)ing|ebkit(?:animation(?:end|iteration|start)|(?:playbacktargetavailabilitychange|transitionen)d)|heel)|zoom)|ping|s(?:rc|tyle))[\x08-\n\f\r ]*?=" \
    "id:941160,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''NoScript XSS InjectionChecker: HTML Injection'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# [NoScript InjectionChecker] Attributes injection
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)(?:\W|^)(?:javascript:(?:[\s\S]+[=\x5c\(\[\.<]|[\s\S]*?(?:\bname\b|\x5c[ux]\d))|data:(?:(?:[a-z]\w+/\w[\w+-]+\w)?[;,]|[\s\S]*?;[\s\S]*?\b(?:base64|charset=)|[\s\S]*?,[\s\S]*?<[\s\S]*?\w[\s\S]*?>))|@\W*?i\W*?m\W*?p\W*?o\W*?r\W*?t\W*?(?:/\*[\s\S]*?)?(?:[\"'']|\W*?u\W*?r\W*?l[\s\S]*?\()|[^-]*?-\W*?m\W*?o\W*?z\W*?-\W*?b\W*?i\W*?n\W*?d\W*?i\W*?n\W*?g[^:]*?:\W*?u\W*?r\W*?l[\s\S]*?\(" \
    "id:941170,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''NoScript XSS InjectionChecker: Attribute Injection'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# [Deny List Keywords from Node-Validator]
# https://github.com/validatorjs/validator.js/
# This rule has a stricter sibling 941181 (PL2) that covers the additional payload "-->"
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@pm document.cookie document.domain document.querySelector document.body.appendChild document.write .parentnode .innerhtml window.location -moz-binding <!-- <![cdata[" \
    "id:941180,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''Node-Validator Deny List Keywords'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-nodejs'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ XSS Filters from IE ]=-
# Ref: http://blogs.technet.com/srd/archive/2008/08/18/ie-8-xss-filter-architecture-implementation.aspx
# Ref: http://xss.cx/examples/ie/internet-exploror-ie9-xss-filter-rules-example-regexp-mshtmldll.txt
#
# Regular expression generated from regex-assembly/941190.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941190
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<style.*?>.*?(?:@[\x5ci]|(?:[:=]|&#x?0*(?:58|3[AD]|61);?).*?(?:[\(\x5c]|&#x?0*(?:40|28|92|5C);?))" \
    "id:941190,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i:<.*[:]?vmlframe.*?[\s/+]*?src[\s/+]*=)" \
    "id:941200,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# This rule tries to match all the possible ways to write ''javascript'' using
# html entities, and javascript escape sequences.
# Regular expression generated from regex-assembly/941210.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941210
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)(?:j|&#(?:0*(?:74|106)|x0*[46]A);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:a|&#(?:0*(?:65|97)|x0*[46]1);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:v|&#(?:0*(?:86|118)|x0*[57]6);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:a|&#(?:0*(?:65|97)|x0*[46]1);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:s|&#(?:0*(?:115|83)|x0*[57]3);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:c|&#(?:x0*[46]3|0*(?:99|67));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:r|&#(?:x0*[57]2|0*(?:114|82));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:i|&#(?:x0*[46]9|0*(?:105|73));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:p|&#(?:x0*[57]0|0*(?:112|80));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:t|&#(?:x0*[57]4|0*(?:116|84));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?::|&(?:#(?:0*58|x0*3A);?|colon;))." \
    "id:941210,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''Javascript Word Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# Regular expression generated from regex-assembly/941220.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941220
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)(?:v|&#(?:0*(?:118|86)|x0*[57]6);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:b|&#(?:0*(?:98|66)|x0*[46]2);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:s|&#(?:0*(?:115|83)|x0*[57]3);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:c|&#(?:x0*[46]3|0*(?:99|67));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:r|&#(?:x0*[57]2|0*(?:114|82));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:i|&#(?:x0*[46]9|0*(?:105|73));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:p|&#(?:x0*[57]0|0*(?:112|80));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:t|&#(?:x0*[57]4|0*(?:116|84));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?::|&(?:#(?:0*58|x0*3A);?|colon;))." \
    "id:941220,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<EMBED[\s/+].*?(?:src|type).*?=" \
    "id:941230,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx <[?]?import[\s/+\S]*?implementation[\s/+]*?=" \
    "id:941240,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:lowercase,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# Regular expression generated from regex-assembly/941250.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941250
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<META[\s\x0b\+/].*?http-equiv[\s\x0b\+/]*=[\s\x0b\+/]*[\"''`]?(?:[crs]|&#x?0*(?:6[37]|43|99|[578][23]|11[45]);?)" \
    "id:941250,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i:<META[\s/+].*?charset[\s/+]*=)" \
    "id:941260,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<LINK[\s/+].*?href[\s/+]*=" \
    "id:941270,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<BASE[\s/+].*?href[\s/+]*=" \
    "id:941280,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<APPLET[\s/+>]" \
    "id:941290,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# Regular expression generated from regex-assembly/941300.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941300
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<OBJECT[\s\x0b\+/].*?(?:type|c(?:ode(?:type)?|lassid)|data)[\s\x0b\+/]*=" \
    "id:941300,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

#
# https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html
# US-ASCII encoding bypass listed on XSS filter evasion
# Reported by Mazin Ahmed
#
# This evasion covered by this chain of rules is specific to webservers that deliver content in US-ASCII.
# Only Apache Tomcat is known (according to the page linked above) to be vulnerable to this and probably has to be
# misconfigured for this to happen.
#
# Since US-ASCII is a seven bit encoding, bit 8 is ignored. Consider the following ISO 8859-1 sequence:
#
# ¼script¾alert(¢XSS¢)¼/script¾
#
# A filter looking for tags will usually not match against this sequence because there are no angle brackets (< / >). However,
# the characters where the brackets would be are ISO 8859-1 characters:
# - ¼: 0x00BC
# - ¾: 0x00BE
# - ¢: 0x00A2
#
# And this is how the sequence looks in in US-ASCII:
#
# <script>alert("XSSB")</script/>
#
# This enables an attacker to craft a string that will be delivered in a form that a browser will execute as script
# while being ignored by input filters.
#
# This rule looks for a start tag sequence that looks like "<...>" (checks for hex and plain to be sure).
# Because the bytes matched occur in many different languages encoded as multibyte characters (e.g. UTF-8)
# (e.g. German umlauts, Russian characters) this isn''t very helpful and can cause many false positives. We, therefore,
# use a chained rule to also look for an end tag sequence that looks like "</...>". Only if the chained rule matches will
# the request be blocked.
#
# This is of course still not perfect but should at least make it harder to hide most tags using this technique while
# requiring very specific patterns in a language to match, which should get rid of most false positives.
# These rules would, for example, not guard against an element without an end tag, e.g. "<img... />".
#
# US-ASCII on Wikipedia: https://en.wikipedia.org/wiki/ASCII
# ISO 8859-1 on Wikipedia: https://en.wikipedia.org/wiki/ISO/IEC_8859-1

# Regular expression generated from regex-assembly/941310.ra and
# regex-assembly/941310-chain1.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941310 941310-chain1
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx \x{bc}[^>\x{be}]*[>\x{be}]|<[^\x{be}]*\x{be}" \
    "id:941310,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,\
    msg:''US-ASCII Malformed Encoding XSS Filter - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-tomcat'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    chain"
    SecRule MATCHED_VARS "@rx \x{bc}[\s\x0b]*/[\s\x0b]*[^>\x{be}]*[>\x{be}]|<[\s\x0b]*/[\s\x0b]*[^\x{be}]*\x{be}" \
        "setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

#
# https://nedbatchelder.com/blog/200704/xss_with_utf7.html
# UTF-7 encoding XSS filter evasion for IE.
# Reported by Vladimir Ivanov
#

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx \+ADw-.*(?:\+AD4-|>)|<.*\+AD4-" \
    "id:941350,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,\
    msg:''UTF-7 Encoding IE XSS - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-internet-explorer'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

#
# Defend against JSFuck and Hieroglyphy obfuscation of Javascript code
#
# https://en.wikipedia.org/wiki/JSFuck
# https://github.com/alcuadrado/hieroglyphy
#
# These JS obfuscations mostly aim for client side XSS exploits, hence the
# integration of this rule into the XSS rule group. But serverside JS could
# also be attacked via these techniques.
#
# Detection pattern / Core elements of JSFuck and Hieroglyphy are the
# following two items:
# !![]
# !+[]
#
# ModSecurity always transforms "+" into " " with query strings and the
# URLENCODE body processor (but not for JSON). So we need to check for
# the following patterns:
# !![]
# !+[]
# ! []

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx ![!+ ]\[\]" \
    "id:941360,\
    phase:2,\
    block,\
    t:none,\
    msg:''JSFuck / Hieroglyphy obfuscation detected'',\
    logdata:''Matched Data: Suspicious payload found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242/63'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

#
# Prevent 941180 bypass by using JavaScript global variables
# Refer to: https://www.secjuice.com/bypass-xss-filters-using-javascript-global-variables/
#
# Examples:
#    - /?search=/?a=";+alert(self["document"]["cookie"]);//
#    - /?search=/?a=";+document+/*foo*/+.+/*bar*/+cookie;//
#
# Regular expression generated from regex-assembly/941370.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941370
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?:self|document|t(?:his|op)|window)[\s\x0b]*(?:/\*|[\)\[]).+?(?:\]|\*/)" \
    "id:941370,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:compressWhitespace,\
    msg:''JavaScript global variable found'',\
    logdata:''Matched Data: Suspicious JS global variable found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242/63'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

#
# JavaScript methods which take code as a string types are considered unsafe.
# Unsafe JS functions like eval(), setInterval(), setTimeout()
# Unsafe JS constructor new Function()
# https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#dangerous-contexts
# https://snyk.io/blog/5-ways-to-prevent-code-injection-in-javascript-and-node-js/
#
# Regular expression generated from regex-assembly/941390.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941390
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)\b(?:eval|set(?:timeout|interval)|new[\s\x0b]+Function|a(?:lert|tob)|btoa|(?:promp|impor)t|con(?:firm|sole\.(?:log|dir))|fetch)[\s\x0b]*[\(\{]" \
    "id:941390,\
    phase:2,\
    block,\
    capture,\
    t:none,t:htmlEntityDecode,t:jsDecode,\
    msg:''Javascript method detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-nodejs'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# JavaScript function without parentheses
# Reference: https://portswigger.net/research/the-seventh-way-to-call-a-javascript-function-without-parentheses
#
# Example Payloads:
# [].sort.call`${alert}1337`
# [].map.call`${eval}\\u{61}lert\x281337\x29`
# Reflect.apply.call`${navigation.navigate}${navigation}${[name]}`
#
# Regular expression generated from regex-assembly/941400.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941400
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx ((?:\[[^\]]*\]|Reflect)[^\.]*\.).*(?:map|sort|apply)[^\.]*\..*call[^`]*`.*`" \
    "id:941400,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:compressWhitespace,\
    msg:''XSS JavaScript function without parentheses'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:941013,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:941014,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#

#
# This is a stricter sibling of rule 941100.
#
SecRule REQUEST_FILENAME|REQUEST_HEADERS:Referer "@detectXSS" \
    "id:941101,\
    phase:1,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''XSS Attack Detected via libinjection'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


#
# -=[ XSS Filters - Category 5 ]=-
# HTML attributes - src, style and href
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)\b(?:s(?:tyle|rc)|href)\b[\s\S]*?=" \
    "id:941150,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:''XSS Filter - Category 5: Disallowed HTML Attributes'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"



#
# [Deny List Keywords from Node-Validator]
# https://github.com/validatorjs/validator.js/
# This rule is a stricter sibling of 941180 (PL1)
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@contains -->" \
    "id:941181,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:lowercase,t:removeNulls,\
    msg:''Node-Validator Deny List Keywords'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"



#
# -=[ XSS Filters from IE ]=-

# Detect tags that are the most common direct HTML injection points.
#
#     <a href=javascript:...
#     <applet src="..." type=text/html>
#     <applet src="data:text/html;base64,PHNjcmlwdD5hbGVydCgvWFNTLyk8L3NjcmlwdD4" type=text/html>
#     <base href=javascript:...
#     <base href=... // change base URL to something else to exploit relative filename inclusion
#     <bgsound src=javascript:...
#     <body background=javascript:...
#     <body onload=...
#     <embed src=http://www.example.com/flash.swf allowScriptAccess=always
#     <embed src="data:image/svg+xml;
#     <frameset><frame src="javascript:..."></frameset>
#     <iframe src=javascript:...
#     <img src=x onerror=...
#     <input type=image src=javascript:...
#     <layer src=...
#     <link href="javascript:..." rel="stylesheet" type="text/css"
#     <link href="http://www.example.com/xss.css" rel="stylesheet" type="text/css"
#     <meta http-equiv="refresh" content="0;url=javascript:..."
#     <meta http-equiv="refresh" content="0;url=http://;javascript:..." // evasion
#     <meta http-equiv="link" rel=stylesheet content="http://www.example.com/xss.css">
#     <meta http-equiv="Set-Cookie" content="NEW_COOKIE_VALUE">
#     <object data=http://www.example.com
#     <object type=text/x-scriptlet data=...
#     <object type=application/x-shockwave-flash data=xss.swf>
#     <object classid=clsid:ae24fdae-03c6-11d1-8b76-0080c744f389><param name=url value=javascript:...></object> // not verified
#     <script>...</script>
#     <script src=http://www.example.com/xss.js></script> - TODO add another rule for this
#     <script src="data:text/javascript,alert(1)"></script>
#     <script src="data:text/javascript;base64,PHNjcmlwdD5hbGVydChkb2N1bWVudC5jb29raWUpOzwvc2NyaXB0Pg=="></script>
#     <style>STYLE</style>
#     <style type=text/css>STYLE</style>
#     <style type=text/javascript>alert(''xss'')</style>
#     <table background=javascript:...
#     <td background=javascript:
#
#
# NOTES
#
#  - Reference the WASC Script Mapping Project - http://projects.webappsec.org/Script-Mapping
#
#  - Not using closing brackets because they are not needed for the
#    attacks to succeed. The following seems to work in FF: <body/s/onload=...
#
#  - Also, browsers sometimes tend to translate < into >, in order to "repair"
#    what they think was a mistake made by the programmer/template designer.
#
#  - Browsers are flexible when it comes to what they accept as separator between
#    tag names and attributes. The following is commonly used in payloads: <img/src=...
#    A better example: <BODY onload!#$%&amp;()*~+-_.,:;?@[/|\]^=alert("XSS")>
#
#  - Grave accents are sometimes used as an evasion technique (as a replacement for quotes),
#    but I don''t believe we need to look for quotes anywhere.
#
#  - Links do not have to be fully qualified. For example, the following works:
#    <script src="//ha.ckers.org/.j">
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/941320.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941320
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx <(?:a(?:bbr|cronym|ddress|pplet|rea|udioscope)?|b(?:ase(?:front)?|do|gsound|ig|l(?:(?:ackfac|ockquot)e|ink)|ody|[qr]|utton)?|c(?:aption|enter|ite|o(?:de|l(?:group)?|mment))|d(?:[dt]|e?l|fn|i[rv])|em(?:bed)?|f(?:ieldset|n|o(?:nt|rm)|rame(?:set)?)|h(?:[1r]|ead|tml)|i(?:frame|layer|mg|n(?:put|s)|sindex)?|k(?:db|eygen)|l(?:a(?:bel|yer)|egend|i(?:mittext|nk|sting)?)|m(?:a(?:p|rquee)|e(?:nu|ta)|ulticol)|no(?:br|embed|frames|s(?:cript|martquotes))|o(?:bject|l|pt(?:group|ion))|p(?:aram|laintext|re)?|q|r(?:t|uby)|s(?:amp|cript|e(?:lect|rver)|hadow|idebar|mall|pa(?:cer|n)|t(?:r(?:ike|ong)|yle)|u[bp])?|t(?:(?:ab|it)le|body|[dr]|extarea|(?:foo)?t|h(?:ead)?)|ul?|(?:va|wb)r|xm[lp])[^0-9A-Z_a-z]" \
    "id:941320,\
    phase:2,\
    block,\
    capture,\
    t:none,t:jsDecode,t:lowercase,\
    msg:''Possible XSS Attack Detected - HTML Tag Handler'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242/63'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/941330.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941330
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[\"''] *(?:[^ ''0-:_a-z~]|in).*?(?:(?:l|\x5cu006C)(?:o|\x5cu006F)(?:c|\x5cu0063)(?:a|\x5cu0061)(?:t|\x5cu0074)(?:i|\x5cu0069)(?:o|\x5cu006F)(?:n|\x5cu006E)|(?:n|\x5cu006E)(?:a|\x5cu0061)(?:m|\x5cu006D)(?:e|\x5cu0065)|(?:o|\x5cu006F)(?:n|\x5cu006E)(?:e|\x5cu0065)(?:r|\x5cu0072)(?:r|\x5cu0072)(?:o|\x5cu006F)(?:r|\x5cu0072)|(?:v|\x5cu0076)(?:a|\x5cu0061)(?:l|\x5cu006C)(?:u|\x5cu0075)(?:e|\x5cu0065)(?:O|\x5cu004F)(?:f|\x5cu0066)).*?=" \
    "id:941330,\
    phase:2,\
    block,\
    capture,\
    t:none,t:htmlEntityDecode,t:compressWhitespace,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[\"\''][ ]*(?:[^a-z0-9~_:\'' ]|in).+?[.].+?=" \
    "id:941340,\
    phase:2,\
    block,\
    capture,\
    t:none,t:htmlEntityDecode,t:compressWhitespace,\
    msg:''IE XSS Filters - Attack Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

#
# Defend against AngularJS client side template injection
#
# Of course, pure client-side AngularJS commands can not be intercepted.
# But once a command is sent to the server, the CRS will trigger.
#
# https://portswigger.net/research/xss-without-html-client-side-template-injection-with-angularjs
#
# Example payload:
# http://localhost/login?user=%20x%20%7B%7Bconstructor.constructor(%27alert(1)%27)()%7D%7D%20.%20ff
# Decoded argument:
# {{constructor.constructor(''alert(1)'')()}}
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx \{\{.*?}}" \
    "id:941380,\
    phase:2,\
    block,\
    t:none,\
    msg:''AngularJS client side template injection detected'',\
    logdata:''Matched Data: Suspicious payload found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''attack-xss'',\
    tag:''xss-perf-disable'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-XSS'',\
    tag:''capec/1000/152/242/63'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.xss_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:941015,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:941016,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:941017,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:941018,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-941-APPLICATION-ATTACK-XSS"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000012', (select id from public.http_spaces where name = 'default'), 'crs-942', 'CRS SQLi', '# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:942011,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:942012,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#

#
# References:
#
# SQL Injection Knowledgebase (via @LightOS) -
# http://websec.ca/kb/sql_injection
#
# SQLi Filter Evasion Cheat Sheet -
# http://websec.wordpress.com/2010/12/04/sqli-filter-evasion-cheat-sheet-mysql/
#
# SQL Injection Cheat Sheet -
# http://ferruh.mavituna.com/sql-injection-cheatsheet-oku/
#
# SQLMap''s Tamper Scripts (for evasions)
# https://github.com/sqlmapproject/sqlmap
#

#
# -=[ LibInjection Check ]=-
#
# There is a stricter sibling of this rule at 942101. It covers REQUEST_BASENAME and REQUEST_FILENAME.
#
# Ref: https://github.com/libinjection/libinjection
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@detectSQLi" \
    "id:942100,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:removeNulls,\
    msg:''SQL Injection Attack Detected via libinjection'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    multiMatch,\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}''"


#
# -=[ Detect DB Names ]=-
#
# Regular expression generated from regex-assembly/942140.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942140
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:d(?:atabas|b_nam)e[^0-9A-Z_a-z]*\(|(?:information_schema|m(?:aster\.\.sysdatabases|s(?:db|ys(?:ac(?:cess(?:objects|storage|xml)|es)|modules2?|(?:object|querie|relationship)s))|ysql\.db)|northwind|pg_(?:catalog|toast)|tempdb)\b|s(?:chema(?:_name\b|[^0-9A-Z_a-z]*\()|(?:qlite_(?:temp_)?master|ys(?:aux|\.database_name))\b))" \
    "id:942140,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack: Common DB Names Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ SQL Function Names ]=-
#
# This rule has a stricter sibling to this rule (942152) that checks for SQL function names in
# request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942151.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942151
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:a(?:dd(?:dat|tim)e|es_(?:de|en)crypt|s(?:cii(?:str)?|in)|tan2?)|b(?:enchmark|i(?:n_to_num|t_(?:and|count|length|x?or)))|c(?:har(?:acter)?_length|eil(?:ing)?|o(?:alesce|ercibility|llation|(?:mpres)?s|n(?:cat(?:_ws)?|nection_id|v(?:ert_tz)?)|t)|rc32|ur(?:(?:dat|tim)e|rent_(?:date|setting|time(?:stamp)?|user)))|d(?:a(?:t(?:abase(?:_to_xml)?|e(?:_(?:add|format|sub)|diff))|y(?:name|of(?:month|week|year)))|count|e(?:code|s_(?:de|en)crypt)|ump)|e(?:n(?:c(?:ode|rypt)|ds_?with)|x(?:p(?:ort_set)?|tract(?:value)?))|f(?:i(?:el|n)d_in_set|ound_rows|rom_(?:base64|days|unixtime))|g(?:e(?:ometrycollection|t(?:_(?:format|lock)|pgusername))|(?:r(?:eates|oup_conca)|tid_subse)t)|hex(?:toraw)?|i(?:fnull|n(?:et6?_(?:aton|ntoa)|s(?:ert|tr)|terval)|s(?:_(?:(?:free|used)_lock|ipv(?:4(?:_(?:compat|mapped))?|6)|n(?:ot(?:_null)?|ull)|superuser)|null))|json(?:_(?:a(?:gg|rray(?:_(?:elements(?:_text)?|length))?)|build_(?:array|object)|e(?:ac|xtract_pat)h(?:_text)?|object(?:_(?:agg|keys))?|populate_record(?:set)?|strip_nulls|t(?:o_record(?:set)?|ypeof))|b(?:_(?:array(?:_(?:elements(?:_text)?|length))?|build_(?:array|object)|e(?:ac|xtract_pat)h(?:_text)?|insert|object(?:_(?:agg|keys))?|p(?:ath_(?:(?:exists|match)(?:_tz)?|query(?:_(?:(?:array|first)(?:_tz)?|tz))?)|opulate_record(?:set)?|retty)|s(?:et(?:_lax)?|trip_nulls)|t(?:o_record(?:set)?|ypeof)))?|path)?|l(?:ast_(?:day|insert_id)|case|east|i(?:kely|nestring)|o(?:_(?:from_bytea|put)|ad_file|ca(?:ltimestamp|te)|g(?:10|2))|pad|trim)|m(?:a(?:ke(?:_set|date)|ster_pos_wait)|d5|i(?:crosecon)?d|onthname|ulti(?:linestring|po(?:int|lygon)))|n(?:ame_const|ot_in|ullif)|o(?:ct(?:et_length)?|(?:ld_passwo)?rd)|p(?:eriod_(?:add|diff)|g_(?:client_encoding|(?:databas|read_fil)e|l(?:argeobject|s_dir)|sleep|user)|o(?:lygon|w)|rocedure_analyse)|qu(?:ery_to_xml|ote)|r(?:a(?:dians|nd|wtohex)|elease_lock|ow_(?:count|to_json)|pad|trim)|s(?:chema|e(?:c_to_time|ssion_user)|ha[12]?|in|oundex|q(?:lite_(?:compileoption_(?:get|used)|source_id)|rt)|t(?:arts_?with|d(?:dev_(?:po|sam)p)?|r(?:_to_date|cmp))|ub(?:(?:dat|tim)e|str(?:ing(?:_index)?)?)|ys(?:date|tem_user))|t(?:ime(?:_(?:format|to_sec)|diff|stamp(?:add|diff)?)|o(?:_(?:base64|jsonb?)|n?char|(?:day|second)s)|r(?:im|uncate))|u(?:case|n(?:compress(?:ed_length)?|hex|i(?:str|x_timestamp))|(?:pdatexm|se_json_nul)l|tc_(?:date|time(?:stamp)?)|uid(?:_short)?)|var(?:_(?:po|sam)p|iance)|we(?:ek(?:day|ofyear)|ight_string)|xmltype|yearweek)[^0-9A-Z_a-z]*\(" \
    "id:942151,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack: SQL function name detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# -=[ PHPIDS - Converted SQLI Filters ]=-
#
# https://raw.githubusercontent.com/PHPIDS/PHPIDS/master/lib/IDS/default_filter.xml
#
# The rule 942160 prevents time-based blind SQL injection attempts
# by prohibiting sleep() or benchmark(,) functions:
#
# * The sleep command takes a number of seconds as an argument.
# * The benchmark command executes the specified expression multiple times.
#
# Using a long sleep time or high number of executions, you can create a delay
# with the response from the server.  This allows to determine whether the
# query has been executed or not.  A high response time proves that the SQLi
# worked successfully. It can now be equipped with the real payload.
#
# Therefore this rule does not prevent the attack itself, but blocks an
# attacker from using the standard utils to tinker with blind SQLi.
#
# A positive side effect is that it prevents certain DoS attacks via the directives
# described above.
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i:sleep\s*?\(.*?\)|benchmark\s*?\(.*?\,.*?\))" \
    "id:942160,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:''Detects blind sqli tests using sleep() or benchmark()'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942170.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942170
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:select|;)[\s\x0b]+(?:benchmark|if|sleep)[\s\x0b]*?\([\s\x0b]*?\(?[\s\x0b]*?[0-9A-Z_a-z]+" \
    "id:942170,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects SQL benchmark and sleep injection attempts including conditional queries'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942190.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942190
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"''`](?:[\s\x0b]*![\s\x0b]*[\"''0-9A-Z_-z]|;?[\s\x0b]*(?:having|select|union\b[\s\x0b]*(?:all|(?:distin|sele)ct))\b[\s\x0b]*[^\s\x0b])|\b(?:(?:(?:c(?:onnection_id|urrent_user)|database|schema|user)[\s\x0b]*?|select.*?[0-9A-Z_a-z]?user)\(|exec(?:ute)?[\s\x0b]+master\.|from[^0-9A-Z_a-z]+information_schema[^0-9A-Z_a-z]|into[\s\x0b\+]+(?:dump|out)file[\s\x0b]*?[\"''`]|union(?:[\s\x0b]select[\s\x0b]@|[\s\x0b\(0-9A-Z_a-z]*?select))|[\s\x0b]*?exec(?:ute)?.*?[^0-9A-Z_a-z]xp_cmdshell|[^0-9A-Z_a-z]iif[\s\x0b]*?\(" \
    "id:942190,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:removeCommentsChar,\
    msg:''Detects MSSQL code execution and information gathering attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Magic number crash in PHP strtod from 2011:
# https://www.exploringbinary.com/php-hangs-on-numeric-value-2-2250738585072011e-308/
#
# Regular expression generated from regex-assembly/942220.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942220
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)^(?:429496729[56]|2(?:14748364[78]|.22507385850720(?:07|11)e-308)|-(?:214748364[89]|0000023456)|00000(?:12345|23456)|1e309)$" \
    "id:942220,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Looking for integer overflow attacks, these are taken from skipfish, except 2.2.2250738585072011e-308 is the \"magic number\" crash'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942230.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942230
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\s\x0b\(\)]case[\s\x0b]+when.*?then|\)[\s\x0b]*?like[\s\x0b]*?\(|select.*?having[\s\x0b]*?[^\s\x0b]+[\s\x0b]*?[^\s\x0b0-9A-Z_a-z]|if[\s\x0b]?\([0-9A-Z_a-z]+[\s\x0b]*?[<->~]" \
    "id:942230,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects conditional SQL injection attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942240.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942240
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)alter[\s\x0b]*?[0-9A-Z_a-z]+.*?char(?:acter)?[\s\x0b]+set[\s\x0b]+[0-9A-Z_a-z]+|[\"''`](?:;*?[\s\x0b]*?waitfor[\s\x0b]+(?:time|delay)[\s\x0b]+[\"''`]|;.*?:[\s\x0b]*?goto)" \
    "id:942240,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects MySQL charset switch and MSSQL DoS attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942250.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942250
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)m(?:erge.*?using|atch[\s\x0b]*?[\(\)\+-\-0-9A-Z_a-z]+[\s\x0b]*?against)[\s\x0b]*?\(|execute[\s\x0b]*?immediate[\s\x0b]*?[\"''`]" \
    "id:942250,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects MATCH AGAINST, MERGE and EXECUTE IMMEDIATE injections'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)union.*?select.*?from" \
    "id:942270,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Looking for basic sql injection. Common attack string for mysql, oracle and others'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942280.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942280
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@rx (?i)select[\s\x0b]*?pg_sleep|waitfor[\s\x0b]*?delay[\s\x0b]?[\"''`]+[\s\x0b]?[0-9]|;[\s\x0b]*?shutdown[\s\x0b]*?(?:[#;\{]|/\*|--)" \
    "id:942280,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects Postgres pg_sleep injection, waitfor delay attacks and database shutdown attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942290.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942290
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\[?\$(?:a(?:bs|c(?:cumulator|osh?)|dd(?:ToSet)?|ll(?:ElementsTrue)?|n(?:d|yElementTrue)|rray(?:ElemA|ToObjec)t|sinh?|tan[2h]?|vg)|b(?:etween|i(?:narySize|t(?:And|Not|(?:O|Xo)r)?)|ottomN?|sonSize|ucket(?:Auto)?)|c(?:eil|mp|o(?:n(?:cat(?:Arrays)?|d|vert)|sh?|unt|variance(?:Po|Sam)p)|urrentDate)|d(?:a(?:te(?:Add|Diff|From(?:Parts|String)|Subtract|T(?:o(?:Parts|String)|runc))|yOf(?:Month|Week|Year))|e(?:greesToRadians|nseRank|rivative)|iv(?:ide)?|ocumentNumber)|e(?:(?:a|lemMat)ch|q|x(?:ists|p(?:MovingAvg|r)?))|f(?:i(?:lter|rstN?)|loor|unction)|g(?:etField|roup|te?)|(?:hou|xo|yea)r|i(?:fNull|n(?:c|dexOf(?:Array|Bytes|CP)|tegral)?|s(?:Array|Number|o(?:DayOfWeek|Week(?:Year)?)))|jsonSchema|l(?:astN?|et|i(?:ke|(?:nearFil|tera)l)|n|o(?:cf|g(?:10)?)|t(?:e|rim)?)|m(?:a(?:p|xN?)|e(?:dian|rgeObjects|ta)|i(?:llisecond|n(?:N|ute)?)|o(?:d|nth)|ul(?:tiply)?)|n(?:atural|e|in|o[rt])|o(?:bjectToArray|r)|p(?:ercentile|o(?:[pw]|sition)|roject|u(?:ll(?:All)?|sh))|r(?:a(?:diansToDegrees|n(?:[dk]|ge))|e(?:(?:duc|nam)e|gex(?:Find(?:All)?|Match)?|place(?:All|One)|verseArray)|ound|trim)|s(?:(?:ampleRat|lic)e|e(?:cond|t(?:Difference|(?:Equal|WindowField)s|Field|I(?:ntersection|sSubset)|OnInsert|Union)?)|(?:hif|pli|qr)t|i(?:nh?|ze)|ort(?:Array)?|t(?:dDev(?:Po|Sam)p|r(?:Len(?:Bytes|CP)|casecmp))|u(?:b(?:str(?:Bytes|CP)?|tract)|m)|witch)|t(?:anh?|ext|o(?:Bool|D(?:(?:at|oubl)e|ecimal)|HashedIndexKey|Int|Lo(?:ng|wer)|ObjectId|String|U(?:UID|pper)|pN?)|r(?:im|unc)|s(?:Increment|Second)|ype)|unset|w(?:eek|here)|zip)\]?" \
    "id:942290,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Finds basic MongoDB SQL injection attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# This rule has a stricter sibling (942321) that checks for MySQL and PostgreSQL procedures / functions in
# request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942320.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942320
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)create[\s\x0b]+(?:function|procedure)[\s\x0b]*?[0-9A-Z_a-z]+[\s\x0b]*?\([\s\x0b]*?\)[\s\x0b]*?-|d(?:eclare[^0-9A-Z_a-z]+[#@][\s\x0b]*?[0-9A-Z_a-z]+|iv[\s\x0b]*?\([\+\-]*[\s\x0b\.0-9]+,[\+\-]*[\s\x0b\.0-9]+\))|exec[\s\x0b]*?\([\s\x0b]*?@|(?:lo_(?:impor|ge)t|procedure[\s\x0b]+analyse)[\s\x0b]*?\(|;[\s\x0b]*?(?:declare|open)[\s\x0b]+[\-0-9A-Z_a-z]+|::(?:b(?:igint|ool)|double[\s\x0b]+precision|int(?:eger)?|numeric|oid|real|(?:tex|smallin)t)" \
    "id:942320,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects MySQL and PostgreSQL stored procedure/function injections'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942350.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942350
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)create[\s\x0b]+function[\s\x0b].+[\s\x0b]returns|;[\s\x0b]*?(?:alter|(?:(?:cre|trunc|upd)at|re(?:nam|plac))e|d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load)\b[\s\x0b]*?[\(\[]?[0-9A-Z_a-z]{2,}" \
    "id:942350,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:''Detects MySQL UDF injection and other data/structure manipulation attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# This rule has two stricter sibling: 942361 and 942362.
# The keywords ''alter'' and ''union'' led to false positives.
# Therefore they have been moved to PL2 and the keywords have been extended on PL1.
# The original version also had loose word boundaries and context checksum cause further false positives.
# Because fixing those introduced bypass, the original variant was moved to PL2 as 942362.
#
# Sources for SQL ALTER statements:
# MySQL: https://dev.mysql.com/doc/refman/5.7/en/sql-syntax-data-definition.html
# Oracle/PLSQL: https://docs.oracle.com/search/?q=alter&size=60&category=database
# PostgreQSL: https://www.postgresql.org/search/?u=%2Fdocs&q=alter
# MSSQL: https://learn.microsoft.com/en-us/sql/t-sql/statements/statements?view=sql-server-ver16
# DB2: https://www.ibm.com/docs/en/search/alter?scope=SSEPGG_9.5.0
#
# Regular expression generated from regex-assembly/942360.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942360
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:(?:alter|(?:(?:cre|trunc|upd)at|renam)e|de(?:lete|sc)|(?:inser|selec)t|load)[\s\x0b]+(?:char|group_concat|load_file)\b[\s\x0b]*\(?|end[\s\x0b]*?\);)|[\s\x0b\(]load_file[\s\x0b]*?\(|[\"''`][\s\x0b]+regexp[^0-9A-Z_a-z]|[\"''0-9A-Z_-z][\s\x0b]+as\b[\s\x0b]*[\"''0-9A-Z_-z]+[\s\x0b]*\bfrom|^[^A-Z_a-z]+[\s\x0b]*?(?:(?:(?:(?:cre|trunc)at|renam)e|d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load)[\s\x0b]+[0-9A-Z_a-z]+|u(?:pdate[\s\x0b]+[0-9A-Z_a-z]+|nion[\s\x0b]*(?:all|(?:sele|distin)ct)\b)|alter[\s\x0b]*(?:a(?:(?:ggregat|pplication[\s\x0b]*rol)e|s(?:sembl|ymmetric[\s\x0b]*ke)y|u(?:dit|thorization)|vailability[\s\x0b]*group)|b(?:roker[\s\x0b]*priority|ufferpool)|c(?:ertificate|luster|o(?:l(?:latio|um)|nversio)n|r(?:edential|yptographic[\s\x0b]*provider))|d(?:atabase|efault|i(?:mension|skgroup)|omain)|e(?:(?:ndpoi|ve)nt|xte(?:nsion|rnal))|f(?:lashback|oreign|u(?:lltext|nction))|hi(?:erarchy|stogram)|group|in(?:dex(?:type)?|memory|stance)|java|l(?:a(?:ngua|r)ge|ibrary|o(?:ckdown|g(?:file[\s\x0b]*group|in)))|m(?:a(?:s(?:k|ter[\s\x0b]*key)|terialized)|e(?:ssage[\s\x0b]*type|thod)|odule)|(?:nicknam|queu)e|o(?:perator|utline)|p(?:a(?:ckage|rtition)|ermission|ro(?:cedur|fil)e)|r(?:e(?:mot|sourc)e|o(?:l(?:e|lback)|ute))|s(?:chema|e(?:arch|curity|rv(?:er|ice)|quence|ssion)|y(?:mmetric[\s\x0b]*key|nonym)|togroup)|t(?:able(?:space)?|ext|hreshold|r(?:igger|usted)|ype)|us(?:age|er)|view|w(?:ork(?:load)?|rapper)|x(?:ml[\s\x0b]*schema|srobject))\b)" \
    "id:942360,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects concatenated basic SQL injection and SQLLFI attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

#
# -=[ Detect MySQL in-line comments ]=-
#
# MySQL in-line comments can be used to bypass SQLi detection.
#
# Ref: https://dev.mysql.com/doc/refman/8.0/en/comments.html:
# SELECT /*! STRAIGHT_JOIN */ col1 FROM table1,table2 WHERE ...
# CREATE TABLE t1(a INT, KEY (a)) /*!50110 KEY_BLOCK_SIZE=1024 */;
# SELECT /*+ BKA(t1) */ FROM ... ;
#
# http://localhost/test.php?id=9999+or+{if+length((/*!5000select+username/*!50000from*/user+where+id=1))>0}
#
# The minimal string that triggers this regexp is: /*!*/ or /*+*/.
# The rule 942500 is related to 942440 which catches both /*! and */ independently.
#
# Regular expression generated from regex-assembly/942500.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942500
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)/\*[\s\x0b]*?[!\+](?:[\s\x0b\(\)\-0-9=A-Z_a-z]+)?\*/" \
    "id:942500,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''MySQL in-line comment detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    multiMatch,\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# This rule catches an authentication bypass via SQL injection that abuses semi-colons to end the SQL query early.
# Any characters after the semi-colon are ignored by some DBMSes (e.g. SQLite).
#
# An example of this would be:
#   email=admin%40juice-sh.op'';&password=foo
#
# The server then turns this into:
#   SELECT * FROM users WHERE email=''admin@juice-sh.op'';'' AND password=''foo''
#
# Regular expression generated from regex-assembly/942540.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942540
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx ^(?:[^'']*''|[^\"]*\"|[^`]*`)[\s\x0b]*;" \
    "id:942540,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:''SQL Authentication bypass (split query)'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''paranoia-level/1'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# This rule catches on Scientific Notation bypass payloads in MySQL
# Reference: https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/SQL%20Injection/MySQL%20Injection.md#scientific-notation
#
# Regular expression generated from regex-assembly/942560.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942560
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)1\.e(?:[\(\),]|\.[\$0-9A-Z_a-z])" \
    "id:942560,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:''MySQL Scientific Notation payload detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# This rule tries to match JSON SQL syntax that could be used as a bypass technique.
# Referring to this research: https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf
#
# Regular expression generated from regex-assembly/942550.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942550
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"''`][\[\{][^#\]\}]*[\]\}]+[\"''`]|(?:[\-@]>?|<@|@[\?@]|\?(?:(?:)|&|\|#>)|#(?:>>|-)|->>|[<>])[\"''`](?:[\[\{][^#\]\}]*[\]\}]+[\"''`]|\$[\.\[])|\bjson_extract\b[^\(]*\([^\)]*\)" \
    "id:942550,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:removeWhitespace,\
    msg:''JSON-Based SQL Injection'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:942013,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:942014,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#


#
# -=[ SQL Operators ]=-
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942120
#
SecRule ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[!=]=|&&|\|\||->|>[=>]|<(?:[<=]|>(?:[\s\x0b]+binary)?)|\b(?:(?:xor|r(?:egexp|like)|i(?:snull|like)|notnull)\b|collate(?:[^0-9A-Z_a-z]*?(?:U&)?[\"''`]|[^0-9A-Z_a-z]+(?:(?:binary|nocase|rtrim)\b|[0-9A-Z_a-z]*?_))|(?:likel(?:ihood|y)|unlikely)[\s\x0b]*\()|r(?:egexp|like)[\s\x0b]+binary|not[\s\x0b]+between[\s\x0b]+(?:0[\s\x0b]+and|(?:''[^'']*''|\"[^\"]*\")[\s\x0b]+and[\s\x0b]+(?:''[^'']*''|\"[^\"]*\"))|is[\s\x0b]+null|like[\s\x0b]+(?:null|[0-9A-Z_a-z]+[\s\x0b]+escape\b)|(?:^|[^0-9A-Z_a-z])in[\s\x0b\+]*\([\s\x0b\"0-9]+[^\(\)]*\)|[!<->][\s\x0b]*all\b" \
    "id:942120,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,\
    msg:''SQL Injection Attack: SQL Operator Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


#
# -=[ SQL Tautologies ]=-
#
# Boolean-based SQL injection or tautology attack. Boolean values (True or False) are used to carry out
# this type of SQL injection. The malicious SQL query forces the web application to return a different result de-
# pending on whether the query returns a TRUE or FALSE result.
#
# The original 942130 was split in two rules:
# - 942130 targets tautologies using equalities (e.g. 1 = 1)
# - 942131 targets tautologies using inequalities (e.g. 1 != 2)
#
# We use captures to check for (in)equality in the regexp. So TX.1 will capture the left hand side (LHS) of the inequality,
# and TX.2 will capture the right hand side (RHS) of the logical query.
#
# Regular expression generated from regex-assembly/942130.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942130
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\s\x0b\"''-\)`]*?\b([0-9A-Z_a-z]+)\b[\s\x0b\"''-\)`]*?(?:=|<=>|(?:sounds[\s\x0b]+)?like|glob|r(?:like|egexp))[\s\x0b\"''-\)`]*?\b([0-9A-Z_a-z]+)\b" \
    "id:942130,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:''SQL Injection Attack: SQL Boolean-based attack detected'',\
    logdata:''Matched Data: %{TX.0} found within %{TX.942130_MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.942130_matched_var_name=%{matched_var_name}'',\
    chain"
    SecRule TX:1 "@streq %{TX.2}" \
        "t:none,\
        setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Rule Targeting logical inequalities that return TRUE (e.g. 1 != 2)
#
#
# We use captures to check for (in)equality in the regexp. So TX.1 will capture the left hand side (LHS) of the inequality,
# and TX.2 will capture the right hand side (RHS) of the logical query.
#
# Regular expression generated from regex-assembly/942131.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942131
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\s\x0b\"''-\)`]*?\b([0-9A-Z_a-z]+)\b[\s\x0b\"''-\)`]*?(?:![<->]|<[=>]?|>=?|\^|is[\s\x0b]+not|not[\s\x0b]+(?:like|r(?:like|egexp)))[\s\x0b\"''-\)`]*?\b([0-9A-Z_a-z]+)\b" \
    "id:942131,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:''SQL Injection Attack: SQL Boolean-based attack detected'',\
    logdata:''Matched Data: %{TX.0} found within %{TX.942131_MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    multiMatch,\
    setvar:''tx.942131_matched_var_name=%{matched_var_name}'',\
    chain"
    SecRule TX:1 "!@streq %{TX.2}" \
        "t:none,\
        setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

#
# -=[ SQL Function Names ]=-
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942150.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942150
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:json(?:_[0-9A-Z_a-z]+)?|a(?:bs|(?:cos|sin)h?|tan[2h]?|vg)|c(?:eil(?:ing)?|h(?:a(?:nges|r(?:set)?)|r)|o(?:alesce|sh?|unt)|ast)|d(?:e(?:grees|fault)|a(?:te|y))|exp|f(?:loor(?:avg)?|ormat|ield)|g(?:lob|roup_concat)|h(?:ex|our)|i(?:f(?:null)?|if|n(?:str)?)|l(?:ast(?:_insert_rowid)?|ength|ike(?:l(?:ihood|y))?|n|o(?:ad_extension|g(?:10|2)?|wer(?:pi)?|cal)|trim)|m(?:ax|in(?:ute)?|o(?:d|nth))|n(?:ullif|ow)|p(?:i|ow(?:er)?|rintf|assword)|quote|r(?:a(?:dians|ndom(?:blob)?)|e(?:p(?:lace|eat)|verse)|ound|trim|ight)|s(?:i(?:gn|nh?)|oundex|q(?:lite_(?:compileoption_(?:get|used)|offset|source_id|version)|rt)|u(?:bstr(?:ing)?|m)|econd|leep)|t(?:anh?|otal(?:_changes)?|r(?:im|unc)|ypeof|ime)|u(?:n(?:icode|likely)|(?:pp|s)er)|zeroblob|bin|v(?:alues|ersion)|week|year)[^0-9A-Z_a-z]*\(" \
    "id:942150,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack: SQL function name detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

#
# -=[ SQL Authentication Bypasses ]=-
#
# Authentication bypass occurs when the attacker can log in as another user
# without knowing the user''s password. The example bypass could look like this:
#
# x'' OR ''x
#
# Because of the quantity of different rules they are split into:
# - 942540 PL1
# - 942180 PL2
# - 942260 PL2
# - 942340 PL2
# - 942520 PL2
#   - 942521 PL2
#   - 942522 PL2

# Regular expression generated from regex-assembly/942180.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942180
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:/\*)+[\"''`]+[\s\x0b]?(?:--|[#\{]|/\*)?|[\"''`](?:[\s\x0b]*(?:(?:x?or|and|div|like|between)[\s\x0b\-0-9A-Z_a-z]+[\(\)\+-\-<->][\s\x0b]*[\"''0-9`]|[!=\|](?:[\s\x0b!\+\-0-9=]+[^\[]*[\"''\(`].*|[\s\x0b!0-9=]+[^0-9]*[0-9]+)$|(?:like|print)[^0-9A-Z_a-z]+[\"''\(0-9A-Z_-z]|;)|(?:[<>~]+|[\s\x0b]*[^\s\x0b0-9A-Z_a-z]?=[\s\x0b]*|[^0-9A-Z_a-z]*?[\+=]+[^0-9A-Z_a-z]*?)[\"''`])|[0-9][\"''`][\s\x0b]+[\"''`][\s\x0b]+[0-9]|^admin[\s\x0b]*?[\"''`]|[\s\x0b\"''\(`][\s\x0b]*?glob[^0-9A-Z_a-z]+[\"''\(0-9A-Z_-z]|[\s\x0b]is[\s\x0b]*?0[^0-9A-Z_a-z]|where[\s\x0b][\s\x0b,-\.0-9A-Z_a-z]+[\s\x0b]=" \
    "id:942180,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects basic SQL authentication bypass attempts 1/3'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942200.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942200
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:,[^\)]*?(?:[0-9a-f]+|\([0-9a-f]+\))|\([^,]+(?:,[\s\x0b]*[0-9a-f]+)+\))(?:$|[\"''`](?:$|[^\"''`]+[\"''`])|(?:\r?\n)?\z)|,[^\)]*?[\"''`][^\"''`]+[\"''`]|[^0-9A-Z_a-z]select.+[^0-9A-Z_a-z]*?from|(?:alter|(?:(?:cre|trunc|upd)at|renam)e|d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load)[\s\x0b]*?\([\s\x0b]*?space[\s\x0b]*?\(" \
    "id:942200,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects MySQL comment-/space-obfuscated injections and backtick termination'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942210.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942210
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:&&|\|\||and|between|div|like|n(?:and|ot)|(?:xx?)?or)[\s\x0b\(]+[0-9A-Z_a-z]+[\s\x0b\)]*?[!\+=]+[\s\x0b0-9]*?[\"''-\)=`]|[0-9](?:[\s\x0b]*?(?:and|between|div|like|x?or)[\s\x0b]*?[0-9]+[\s\x0b]*?[\+\-]|[\s\x0b]+group[\s\x0b]+by.+\()|/[0-9A-Z_a-z]+;?[\s\x0b]+(?:and|between|div|having|like|x?or|select)[^0-9A-Z_a-z]|(?:[#;]|--)[\s\x0b]*?(?:alter|drop|(?:insert|update)[\s\x0b]*?[0-9A-Z_a-z]{2,})|@.+=[\s\x0b]*?\([\s\x0b]*?select|[^0-9A-Z_a-z]SET[\s\x0b]*?@[0-9A-Z_a-z]+" \
    "id:942210,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects chained SQL injection attempts 1/2'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942260.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942260
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"''`][\s\x0b]*?(?:(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between|\|\||&&)[\s\x0b]+[\s\x0b0-9A-Z_a-z]+=[\s\x0b]*?[0-9A-Z_a-z]+[\s\x0b]*?having[\s\x0b]+|like[^0-9A-Z_a-z]*?[\"''0-9`])|[0-9A-Z_a-z][\s\x0b]+like[\s\x0b]+[\"''`]|like[\s\x0b]*?[\"''`]%|select[\s\x0b]+?[\s\x0b\"''-\),-\.0-9A-\[\]_-z]+from[\s\x0b]+" \
    "id:942260,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects basic SQL authentication bypass attempts 2/3'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942300.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942300
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\)[\s\x0b]*?when[\s\x0b]*?[0-9]+[\s\x0b]*?then|[\"''`][\s\x0b]*?(?:[#\{]|--)|/\*![\s\x0b]?[0-9]+|\b(?:(?:binary|cha?r)[\s\x0b]*?\([\s\x0b]*?[0-9]|(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between|r(?:egexp|like))[\s\x0b]+[0-9A-Z_a-z]+\()|(?:\|\||&&)[\s\x0b]*?[0-9A-Z_a-z]+\(" \
    "id:942300,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects MySQL comments, conditions and ch(a)r injections'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942310.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942310
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:\([\s\x0b]*?select[\s\x0b]*?[0-9A-Z_a-z]+|coalesce|order[\s\x0b]+by[\s\x0b]+if[0-9A-Z_a-z]*?)[\s\x0b]*?\(|\*/from|\+[\s\x0b]*?[0-9]+[\s\x0b]*?\+[\s\x0b]*?@|[0-9A-Z_a-z][\"''`][\s\x0b]*?(?:(?:[\+\-=@\|]+[\s\x0b]+?)+|[\+\-=@\|]+)[\(0-9]|@@[0-9A-Z_a-z]+[\s\x0b]*?[^\s\x0b0-9A-Z_a-z]|[^0-9A-Z_a-z]!+[\"''`][0-9A-Z_a-z]|[\"''`](?:;[\s\x0b]*?(?:if|while|begin)|[\s\x0b0-9]+=[\s\x0b]*?[0-9])|[\s\x0b\(]+case[0-9]*?[^0-9A-Z_a-z].+[tw]hen[\s\x0b\(]" \
    "id:942310,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects chained SQL injection attempts 2/2'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

#
# -=[ SQL Injection Probings ]=-
#
# This is a group of three similar rules aiming to detect SQL injection probings.
#
# 942330 PL 2
# 942370 PL 2
# 942490 PL 3
# Regular expression generated from regex-assembly/942330.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942330
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"''`][\s\x0b]*?\b(?:x?or|div|like|between|and)\b[\s\x0b]*?[\"''`]?[0-9]|\x5cx(?:2[37]|3d)|^(?:.?[\"''`]$|[\"''\x5c`]*?(?:[\"''0-9`]+|[^\"''`]+[\"''`])[\s\x0b]*?\b(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between|\|\||&&)\b[\s\x0b]*?[\"''0-9A-Z_-z][!&\(\)\+-\.@])|[^\s\x0b0-9A-Z_a-z][0-9A-Z_a-z]+[\s\x0b]*?[\-\|][\s\x0b]*?[\"''`][\s\x0b]*?[0-9A-Z_a-z]|@(?:[0-9A-Z_a-z]+[\s\x0b]+(?:and|x?or|div|like|between)\b[\s\x0b]*?[\"''0-9`]+|[\-0-9A-Z_a-z]+[\s\x0b](?:and|x?or|div|like|between)\b[\s\x0b]*?[^\s\x0b0-9A-Z_a-z])|[^\s\x0b0-:A-Z_a-z][\s\x0b]*?[0-9][^0-9A-Z_a-z]+[^\s\x0b0-9A-Z_a-z][\s\x0b]*?[\"''`].|[^0-9A-Z_a-z]information_schema|table_name[^0-9A-Z_a-z]" \
    "id:942330,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects classic SQL injection probings 1/3'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942340.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942340
#
# Note that part of 942340.data is already optimized, to avoid a
# Regexp::Assemble behaviour, where the regex is not optimized very nicely.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)in[\s\x0b]*?\(+[\s\x0b]*?select|(?:(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between)[\s\x0b]+|(?:\|\||&&)[\s\x0b]*?)[\s\x0b\+0-9A-Z_a-z]+(?:regexp[\s\x0b]*?\(|sounds[\s\x0b]+like[\s\x0b]*?[\"''`]|[0-9=]+x)|[\"''`](?:[\s\x0b]*?(?:(?:[0-9]+[\s\x0b]*?(?:--|#)|is[\s\x0b]*?(?:[0-9][^\"''`]+[\"''`]?[0-9A-Z_a-z]|[\.0-9]+[\s\x0b]*?[^0-9A-Z_a-z][^\"''`]*[\"''`])|(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between)[\s\x0b]+|(?:\|\||&&)[\s\x0b]*?)(?:array[\s\x0b]*?\[|(?:tru|fals)e\b|[0-9A-Z_a-z]+(?:[\s\x0b]*?!?~|[\s\x0b]+(?:not[\s\x0b]+)?similar[\s\x0b]+to[\s\x0b]+))|[%&<->\^]+[0-9]+[\s\x0b]*?(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between)=)|(?:[^0-9A-Z_a-z]+[\+\-0-9A-Z_a-z]+[\s\x0b]*?=[\s\x0b]*?[0-9][^0-9A-Z_a-z]+|\|?[\-0-9A-Z_a-z]{3,}[^\s\x0b,\.0-9A-Z_a-z]+)[\"''`])|\bexcept[\s\x0b]+(?:select\b|values[\s\x0b]*?\()" \
    "id:942340,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects basic SQL authentication bypass attempts 3/3'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# This rule is a stricter sibling of 942360.
# The keywords ''alter'' and ''union'' led to false positives.
# Therefore they have been moved to PL2 and the keywords have been extended on PL1.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i:^[\W\d]+\s*?(?:alter|union)\b)" \
    "id:942361,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects basic SQL injection based on keyword alter or union'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# This rule is a stricter sibling of 942360.
# The loose word boundaries and light context led to false positives.
# Because the stricter variant does miss quite a few legitimate payloads, the loose version was moved to PL2.
#
# Regular expression generated from regex-assembly/942362.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942362
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:alter|(?:(?:cre|trunc|upd)at|renam)e|de(?:lete|sc)|(?:inser|selec)t|load)[\s\x0b]+(?:char|group_concat|load_file)[\s\x0b]?\(?|end[\s\x0b]*?\);|[\s\x0b\(]load_file[\s\x0b]*?\(|[\"''`][\s\x0b]+regexp[^0-9A-Z_a-z]|[^A-Z_a-z][\s\x0b]+as\b[\s\x0b]*[\"''0-9A-Z_-z]+[\s\x0b]*\bfrom|^[^A-Z_a-z]+[\s\x0b]*?(?:create[\s\x0b]+[0-9A-Z_a-z]+|(?:d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load|(?:renam|truncat)e|u(?:pdate|nion[\s\x0b]*(?:all|(?:sele|distin)ct))|alter[\s\x0b]*(?:a(?:(?:ggregat|pplication[\s\x0b]*rol)e|s(?:sembl|ymmetric[\s\x0b]*ke)y|u(?:dit|thorization)|vailability[\s\x0b]*group)|b(?:roker[\s\x0b]*priority|ufferpool)|c(?:ertificate|luster|o(?:l(?:latio|um)|nversio)n|r(?:edential|yptographic[\s\x0b]*provider))|d(?:atabase|efault|i(?:mension|skgroup)|omain)|e(?:(?:ndpoi|ve)nt|xte(?:nsion|rnal))|f(?:lashback|oreign|u(?:lltext|nction))|hi(?:erarchy|stogram)|group|in(?:dex(?:type)?|memory|stance)|java|l(?:a(?:ngua|r)ge|ibrary|o(?:ckdown|g(?:file[\s\x0b]*group|in)))|m(?:a(?:s(?:k|ter[\s\x0b]*key)|terialized)|e(?:ssage[\s\x0b]*type|thod)|odule)|(?:nicknam|queu)e|o(?:perator|utline)|p(?:a(?:ckage|rtition)|ermission|ro(?:cedur|fil)e)|r(?:e(?:mot|sourc)e|o(?:l(?:e|lback)|ute))|s(?:chema|e(?:arch|curity|rv(?:er|ice)|quence|ssion)|y(?:mmetric[\s\x0b]*key|nonym)|togroup)|t(?:able(?:space)?|ext|hreshold|r(?:igger|usted)|ype)|us(?:age|er)|view|w(?:ork(?:load)?|rapper)|x(?:ml[\s\x0b]*schema|srobject)))\b)" \
    "id:942362,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects concatenated basic SQL injection and SQLLFI attempts'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# This rule is a sibling of 942330. See that rule for a description and overview.
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942370.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942370
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:Referer|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"''`](?:[\s\x0b]*?(?:(?:\*.+(?:x?or|div|like|between|(?:an|i)d)[^0-9A-Z_a-z]*?[\"''`]|(?:x?or|div|like|between|and)[\s\x0b][^0-9]+[\-0-9A-Z_a-z]+[^0-9]*)[0-9]|[^\s\x0b0-9\?A-Z_a-z]+[\s\x0b]*?[^\s\x0b0-9A-Z_a-z]+[\s\x0b]*?[\"''`]|[^\s\x0b0-9A-Z_a-z]+[\s\x0b]*?[^A-Z_a-z](?:[^#]*#|.*?--))|[^\*]*\*[\s\x0b]*?[0-9])|\^[\"''`]|[%\(-\+\-<>][\-0-9A-Z_a-z]+[^\s\x0b0-9A-Z_a-z]+[\"''`][^,]" \
    "id:942370,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects classic SQL injection probings 2/3'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942380.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942380
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:having\b(?:[\s\x0b]+(?:[0-9]{1,10}|''[^=]{1,10}'')[\s\x0b]*?[<->]| ?(?:[0-9]{1,10} ?[<->]+|[\"''][^=]{1,10}[ \"''<-\?\[]+))|ex(?:ecute(?:\(|[\s\x0b]{1,5}[\$\.0-9A-Z_a-z]{1,5}[\s\x0b]{0,3})|ists[\s\x0b]*?\([\s\x0b]*?select\b)|(?:create[\s\x0b]+?table.{0,20}?|like[^0-9A-Z_a-z]*?char[^0-9A-Z_a-z]*?)\()|select.*?case|from.*?limit|order[\s\x0b]by|exists[\s\x0b](?:[\s\x0b]select|s(?:elect[^\s\x0b](?:if(?:null)?[\s\x0b]\(|top|concat)|ystem[\s\x0b]\()|\bhaving\b[\s\x0b]+[0-9]{1,10}|''[^=]{1,10}'')" \
    "id:942380,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942390.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942390
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:or\b(?:[\s\x0b]?(?:[0-9]{1,10}|[\"''][^=]{1,10}[\"''])[\s\x0b]?[<->]+|[\s\x0b]+(?:[0-9]{1,10}|''[^=]{1,10}'')(?:[\s\x0b]*?[<->])?)|xor\b[\s\x0b]+(?:[0-9]{1,10}|''[^=]{1,10}'')(?:[\s\x0b]*?[<->])?)|''[\s\x0b]+x?or[\s\x0b]+.{1,20}[!\+\-<->]" \
    "id:942390,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/942400.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942400
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\band\b(?:[\s\x0b]+(?:[0-9]{1,10}[\s\x0b]*?[<->]|''[^=]{1,10}'')| ?(?:[0-9]{1,10}|[\"''][^=]{1,10}[\"'']) ?[<->]+)" \
    "id:942400,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# The former rule id 942410 was split into three new rules: 942410, 942470, 942480
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942410.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942410
#
SecRule REQUEST_COOKIES|!REQUEST_COOKIES:/_pk_ref/|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:a(?:(?:b|co)s|vg)|bin|c(?:(?:as|o(?:nver|un))t|h(?:ar(?:set)?|r))|d(?:a(?:te|y)|e(?:fault|grees))|elt|f(?:ield|loor|ormat)|(?:hou|quarte|yea)r|i[fns]|l(?:ast|e(?:ft|ngth)|n|ikelihood|o(?:cal|g|wer))|m(?:ax|in(?:ute)?|o(?:d|nth))|now|p(?:assword|i|o(?:sition|wer))|r(?:awtonhex(?:toraw)?|e(?:p(?:eat|lace)|verse)|ight|ound)|s(?:econd|ign|leep|pace|tddev|um)|t(?:an|ime|o_(?:n?char|(?:day|second)s))|u(?:nlikely|(?:pp|s)er)|v(?:alues|ersion)|week)[^0-9A-Z_a-z]*?\(" \
    "id:942410,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# The former rule id 942410 was split into three new rules: 942410, 942470, 942480
#
# Regular expression generated from regex-assembly/942470.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942470
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)autonomous_transaction|(?:current_use|n?varcha|tbcreato)r|db(?:a_users|ms_java)|open(?:owa_util|query|rowset)|s(?:p_(?:(?:addextendedpro|sqlexe)c|execute(?:sql)?|help|is_srvrolemember|makewebtask|oacreate|p(?:assword|repare)|replwritetovarbin)|ql_(?:longvarchar|variant))|utl_(?:file|http)|xp_(?:availablemedia|(?:cmdshel|servicecontro)l|dirtree|e(?:numdsn|xecresultset)|filelist|loginconfig|makecab|ntsec(?:_enumdomains)?|reg(?:addmultistring|delete(?:key|value)|enum(?:key|value)s|re(?:ad|movemultistring)|write)|terminate(?:_process)?)" \
    "id:942470,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# The former rule id 942410 was split into three new rules: 942410, 942470, 942480
#
# Regular expression generated from regex-assembly/942480.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942480
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:(?:d(?:bms_[0-9A-Z_a-z]+\.|elete\b[^0-9A-Z_a-z]*?\bfrom)|(?:group\b.*?\bby\b.{1,100}?\bhav|overlay\b[^0-9A-Z_a-z]*?\(.*?\b[^0-9A-Z_a-z]*?plac)ing|in(?:ner\b[^0-9A-Z_a-z]*?\bjoin|sert\b[^0-9A-Z_a-z]*?\binto|to\b[^0-9A-Z_a-z]*?\b(?:dump|out)file)|load\b[^0-9A-Z_a-z]*?\bdata\b.*?\binfile|s(?:elect\b.{1,100}?\b(?:(?:.*?\bdump\b.*|(?:count|length)\b.{1,100}?)\bfrom|(?:data_typ|from\b.{1,100}?\bwher)e|instr|to(?:_(?:cha|numbe)r|p\b.{1,100}?\bfrom))|ys_context)|u(?:nion\b.{1,100}?\bselect|tl_inaddr))\b|print\b[^0-9A-Z_a-z]*?@@)|(?:collation[^0-9A-Z_a-z]*?\(a|@@version|;[^0-9A-Z_a-z]*?\b(?:drop|shutdown))\b|''(?:dbo|msdasql|s(?:a|qloledb))''" \
    "id:942480,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


#
# [ SQL Injection Character Anomaly Usage ]
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# This rules attempts to gauge when there is an excessive use of
# meta-characters within a single parameter payload.
#
# Expect a lot of false positives with this rule.
# The most likely false positive instances will be free-form text fields.
# This will make it necessary to disable the rule for certain known parameters.
# The following directive is an example to switch off the rule globally for
# the parameter foo. Place this instruction in your configuration after
# the include directive for the Core Rules Set.
#
# SecRuleUpdateTargetById 942430 "!ARGS:foo"
#

# Regular expression generated from regex-assembly/942430.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942430
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){12})" \
    "id:942430,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Restricted SQL Character Anomaly Detection (args): # of special characters exceeded (12)'',\
    logdata:''Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''WARNING'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.warning_anomaly_score}'',\
    setvar:''tx.sql_injection_score=+%{tx.warning_anomaly_score}''"

#
# -=[ Detect SQL Comment Sequences ]=-
#
# Example Payloads Detected:
# -------------------------
# OR 1#
# DROP sampletable;--
# admin''--
# DROP/*comment*/sampletable
# DR/**/OP/*bypass deny listing*/sampletable
# SELECT/*avoid-spaces*/password/**/FROM/**/Members
# SELECT /*!32302 1/0, */ 1 FROM tablename
# ‘ or 1=1#
# ‘ or 1=1-- -
# ‘ or 1=1/*
# '' or 1=1;\x00
# 1=''1'' or-- -
# '' /*!50000or*/1=''1
# '' /*!or*/1=''1
# 0/**/union/*!50000select*/table_name`foo`/**/
# -------------------------
#
# The chained rule is designed to prevent false positives by specifically
# targeting JWT tokens and common tokens (brid, fbclid, gclid, recaptcha, ttclid, etc).
#
# Starting with ''ey'' targets JWT tokens, where the ''ey''
# prefix corresponds to the beginning of the Base64-encoded header section.
#
# example:
# $ echo ''{"'' | base64
# eyIK
#
# Regular expressions generated from regex-assembly/942440.ra and regex-assembly/942440-chain1.ra.
# To update the regular expressions run the following shell scripts
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942440
#   crs-toolchain regex update 942440-chain1
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx /\*!?|\*/|['';]--|--(?:[\s\x0b]|[^\-]*?-)|[^&\-]#.*?[\s\x0b]|;?\x00" \
    "id:942440,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Comment Sequence Detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    chain"
    SecRule MATCHED_VARS "!@rx ^(?:ey[\-0-9A-Z_a-z]+\.ey[\-0-9A-Z_a-z]+\.)?[\-0-9A-Z_a-z]+$" \
        "t:none,\
        setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}''"


#
# -=[ SQL Bin / Hex Evasion Methods ]=-
#
# Hex encoding detection:
# (?i:\b0x[a-f\d]{3,}) will match any 3 or more hex bytes after "0x", together forming a hexadecimal payload(e.g 0xf00, 0xf00d and so on)
#
# Regular expression generated from regex-assembly/942450.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942450
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b0x[0-9a-f]{3,}|(?:x''[0-9a-f]{3,}|b''[01]{10,})''" \
    "id:942450,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Bin or Hex Encoding Identified'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


#
# -=[ Detect SQLi bypass: backticks ]=-
#
# Quotes and backticks can be used to bypass SQLi detection.
#
# Example:
# GET http://localhost/test.php?id=9999%20or+{`if`(2=(select+2+from+wp_users+where+user_login=''admin''))}
#
# The minimum text between the ticks or backticks must be 2 (if, for example) and a maximum of 29.
# 29 is a compromise: The lower this number (29), the lower the probability of FP and the higher the probability of false negatives.
# In tests we got a minimum number of FP with {2,29}.
#
# Base64 encoding detection:
# (?:[A-Za-z0-9+/]{4})+ #match any number of 4-letter blocks of the base64 char set
# (?:[A-Za-z0-9+/]{2}== #match 2-letter block of the base64 char set followed by "==", together forming a 4-letter block
# |                     # or
# [A-Za-z0-9+/]{3}=     #match 3-letter block of the base64 char set followed by "=", together forming a 4-letter block
# )?
#
# The minimal string that triggers this regexp is: `if`
#
# The rule 942511 is similar to this rule, but triggers on normal quotes
# (''if''). That rule runs in paranoia level 3 or higher since it is prone to
# false positives in natural text.
#
# Regular expression generated from regex-assembly/942510.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942510
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx `(?:[\s\x0b\(\)\+\-0-9<=@-Z_a-\{\}]{2,29}|(?:[\+/-9A-Za-z]{4})+(?:(?:[\+/-9A-Za-z]{2}=|[\+/-9A-Za-z]{3})=)?)`" \
    "id:942510,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQLi bypass attempt by ticks or backticks detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# Regular expression generated from regex-assembly/942520.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942520
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"''`][\s\x0b]*?(?:(?:is[\s\x0b]+not|not[\s\x0b]+(?:like|glob|(?:betwee|i)n|null|regexp|match)|mod|div|sounds[\s\x0b]+like)\b|[%&\*\+\-/<->\^\|]{1,3})" \
    "id:942520,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects basic SQL authentication bypass attempts 4.0/4'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# Complementary rule to PL2 942520 that block and/or-based bypasses.
# It blocks data with odd number of quotes and then (and|or).
#
# The rule uses the expression ^b*a*(b*a*b*a*)* to odd number of a''s. It''s not
# vulnerable to ReDos as it executes linearly many steps compared to input size.
#
# Regular expression generated from regex-assembly/942521.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942521
#
SecRule REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@rx (?i)^(?:[^'']*?(?:''[^'']*?''[^'']*?)*?''|[^\"]*?(?:\"[^\"]*?\"[^\"]*?)*?\"|[^`]*?(?:`[^`]*?`[^`]*?)*?`)[\s\x0b]*([0-9A-Z_a-z]+)\b" \
    "id:942521,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects basic SQL authentication bypass attempts 4.1/4'',\
    logdata:''Matched Data: %{TX.0} found within %{TX.942521_MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.942521_matched_var_name=%{matched_var_name}'',\
    chain"
    SecRule TX:1 "@rx ^(?:and|or)$" \
        "t:none,\
        setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# Complementary rule to PL2 942521 that block escaped quotes followed by (and|or)
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx ^.*?\x5c[''\"`](?:.*?[''\"`])?\s*(?:and|or)\b" \
    "id:942522,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects basic SQL authentication bypass attempts 4.1/4'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


#
# This is a sibling of rule 942100 that adds checking of the path.
#
# REQUEST_BASENAME provides the last url segment (slash excluded).
# This segment is the most likely to be used for injections. Stripping out
# the slash permits libinjection to do not consider it as a payload starting
# with not unary arithmetical operators (not a valid SQL command, e.g.
# ''/9 union all''). The latter would lead to do not detect malicious payloads.
#
# REQUEST_FILENAME matches SQLi payloads inside (or across) other segments
# of the path. Here, libinjection will detect a true positive only if
# the url leading slash is considered as part of a comment block or part
# of a string (with a quote or double quote after it). In these circumstances,
# previous slashes do not affect libinjection result, making it able to detect
# some SQLi inside the path.
#
SecRule REQUEST_BASENAME|REQUEST_FILENAME "@detectSQLi" \
    "id:942101,\
    phase:1,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:removeNulls,\
    msg:''SQL Injection Attack Detected via libinjection'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

#
# -=[ SQL Function Names ]=-
#
# This rule is a stricter sibling of 942151.
# This rule 942152 checks for the same regex in request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942152.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942152
#
SecRule REQUEST_HEADERS:Referer|REQUEST_HEADERS:User-Agent "@rx (?i)\b(?:a(?:dd(?:dat|tim)e|es_(?:de|en)crypt|s(?:cii(?:str)?|in)|tan2?)|b(?:enchmark|i(?:n_to_num|t_(?:and|count|length|x?or)))|c(?:har(?:acter)?_length|eil(?:ing)?|o(?:alesce|ercibility|llation|(?:mpres)?s|n(?:cat(?:_ws)?|nection_id|v(?:ert(?:_tz)?)?)|t)|rc32|ur(?:(?:dat|tim)e|rent_(?:date|setting|time(?:stamp)?|user)))|d(?:a(?:t(?:abase(?:_to_xml)?|e(?:_(?:add|format|sub)|diff))|y(?:name|of(?:month|week|year)))|count|e(?:code|grees|s_(?:de|en)crypt)|ump)|e(?:lt|n(?:c(?:ode|rypt)|ds_?with)|x(?:p(?:ort_set)?|tract(?:value)?))|f(?:i(?:el|n)d_in_set|ound_rows|rom_(?:base64|days|unixtime))|g(?:e(?:ometrycollection|t(?:_(?:format|lock)|pgusername))|(?:r(?:eates|oup_conca)|tid_subse)t)|hex(?:toraw)?|i(?:fnull|n(?:et6?_(?:aton|ntoa)|s(?:ert|tr)|terval)|s(?:_(?:(?:free|used)_lock|ipv(?:4(?:_(?:compat|mapped))?|6)|n(?:ot(?:_null)?|ull)|superuser)|null))|json(?:_(?:a(?:gg|rray(?:_(?:elements(?:_text)?|length))?)|build_(?:array|object)|e(?:ac|xtract_pat)h(?:_text)?|object(?:_(?:agg|keys))?|populate_record(?:set)?|strip_nulls|t(?:o_record(?:set)?|ypeof))|b(?:_(?:array(?:_(?:elements(?:_text)?|length))?|build_(?:array|object)|object(?:_(?:agg|keys))?|e(?:ac|xtract_pat)h(?:_text)?|insert|p(?:ath_(?:(?:exists|match)(?:_tz)?|query(?:_(?:(?:array|first)(?:_tz)?|tz))?)|opulate_record(?:set)?|retty)|s(?:et(?:_lax)?|trip_nulls)|t(?:o_record(?:set)?|ypeof)))?|path)?|l(?:ast_(?:day|insert_id)|case|e(?:as|f)t|i(?:kel(?:ihood|y)|nestring)|o(?:_(?:from_bytea|put)|ad_file|ca(?:ltimestamp|te)|g(?:10|2)|wer)|pad|trim)|m(?:a(?:ke(?:_set|date)|ster_pos_wait)|d5|i(?:crosecon)?d|onthname|ulti(?:linestring|po(?:int|lygon)))|n(?:ame_const|ot_in|ullif)|o(?:ct(?:et_length)?|(?:ld_passwo)?rd)|p(?:eriod_(?:add|diff)|g_(?:client_encoding|(?:databas|read_fil)e|l(?:argeobject|s_dir)|sleep|user)|o(?:(?:lyg|siti)on|w)|rocedure_analyse)|qu(?:arter|ery_to_xml|ote)|r(?:a(?:dians|nd|wtohex)|elease_lock|ow_(?:count|to_json)|pad|trim)|s(?:chema|e(?:c_to_time|ssion_user)|ha[12]?|in|oundex|pace|q(?:lite_(?:compileoption_(?:get|used)|source_id)|rt)|t(?:arts_?with|d(?:dev_(?:po|sam)p)?|r(?:_to_date|cmp))|ub(?:(?:dat|tim)e|str(?:ing(?:_index)?)?)|ys(?:date|tem_user))|t(?:ime(?:_(?:format|to_sec)|diff|stamp(?:add|diff)?)|o(?:_(?:base64|jsonb?)|n?char|(?:day|second)s)|r(?:im|uncate))|u(?:case|n(?:compress(?:ed_length)?|hex|i(?:str|x_timestamp)|likely)|(?:pdatexm|se_json_nul)l|tc_(?:date|time(?:stamp)?)|uid(?:_short)?)|var(?:_(?:po|sam)p|iance)|we(?:ek(?:day|ofyear)|ight_string)|xmltype|yearweek)[^0-9A-Z_a-z]*\(" \
    "id:942152,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQL Injection Attack: SQL function name detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

#
# This rule is a stricter sibling of 942320.
# It checks for the same regex in request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942321.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942321
#
SecRule REQUEST_HEADERS:Referer|REQUEST_HEADERS:User-Agent "@rx (?i)create[\s\x0b]+(?:function|procedure)[\s\x0b]*?[0-9A-Z_a-z]+[\s\x0b]*?\([\s\x0b]*?\)[\s\x0b]*?-|d(?:eclare[^0-9A-Z_a-z]+[#@][\s\x0b]*?[0-9A-Z_a-z]+|iv[\s\x0b]*?\([\+\-]*[\s\x0b\.0-9]+,[\+\-]*[\s\x0b\.0-9]+\))|exec[\s\x0b]*?\([\s\x0b]*?@|(?:lo_(?:impor|ge)t|procedure[\s\x0b]+analyse)[\s\x0b]*?\(|;[\s\x0b]*?(?:declare|open)[\s\x0b]+[\-0-9A-Z_a-z]+|::(?:b(?:igint|ool)|double[\s\x0b]+precision|int(?:eger)?|numeric|oid|real|(?:tex|smallin)t)" \
    "id:942321,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects MySQL and PostgreSQL stored procedure/function injections'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:942015,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:942016,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#


#
# [ SQL HAVING queries ]
#
# This pattern was split off from rule 942250 due to frequent
# false positives in English text. Testing showed that SQL
# injections with HAVING should be detected by libinjection
# (rule 942100).
#
# This is a stricter sibling of rule 942250.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\W+\d*?\s*?\bhaving\b\s*?[^\s\-]" \
    "id:942251,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects HAVING injections'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}''"

# This rule is a stricter sibling of 942330. See that rule for a
# description and overview.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx [\"''`][\s\d]*?[^\w\s]\W*?\d\W*?.*?[\"''`\d]" \
    "id:942490,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Detects classic SQL injection probings 3/3'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}''"

#
# [ SQL Injection Character Anomaly Usage ]
#
# This rule attempts to gauge when there is an excessive use of
# meta-characters within a single parameter payload.
#
# It is similar to 942430, but focuses on Cookies instead of
# GET/POST parameters.
#
# Expect a lot of false positives with this rule.
# The most likely false positive instances will be complex session ids.
# This will make it necessary to disable the rule for certain known cookies.
# The following directive is an example to switch off the rule globally for
# the cookie foo_id. Place this instruction in your configuration after
# the include directive for the Core Rules Set.
#
# SecRuleUpdateTargetById 942420 "!REQUEST_COOKIES:foo_id"
#

# Regular expression generated from regex-assembly/942420.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942420
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){8})" \
    "id:942420,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Restricted SQL Character Anomaly Detection (cookies): # of special characters exceeded (8)'',\
    logdata:''Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''WARNING'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.warning_anomaly_score}'',\
    setvar:''tx.sql_injection_score=+%{tx.warning_anomaly_score}''"


#
# This is a stricter sibling of rule 942430.
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#

# Regular expression generated from regex-assembly/942431.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942431
#
SecRule ARGS_NAMES|!ARGS_NAMES:/^[\w]+\[[\w\-]+\]\[[\w\-]*?\]$/|!ARGS_NAMES:/^[\w]+\[[\w\-]+\]\[[\w\-]+\]\[[\w\-]*?\]$/|ARGS|XML:/* "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){6})" \
    "id:942431,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Restricted SQL Character Anomaly Detection (args): # of special characters exceeded (6)'',\
    logdata:''Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''WARNING'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.warning_anomaly_score}'',\
    setvar:''tx.sql_injection_score=+%{tx.warning_anomaly_score}''"


#
# [ Repetitive Non-Word Characters ]
#
# This rule attempts to identify when multiple (4 or more) non-word characters
# are repeated in sequence.
#
# The pattern may occur in some normal texts, e.g. "foo...." will match.
#
# If your traffic contains languages that include accented characters, such as French,
# Spanish, or German, be aware that you may encounter more false positives than
# usual. In this case, you may consider increasing the consecutive occurrence limit
# to 5 instead of 4.
#
# This will help avoid common triggers such as "test=+à+", which is frequent in French.
#
# All languages that use characters without a valid representation outside of UTF-8
# (i.e., relying solely on multi-byte sequences such as %E6%84%9B (Japanese))
# are incompatible with this rule.
# In such cases, the rule should be globally disabled.
#
SecRule ARGS "@rx \W{4}" \
    "id:942460,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:''Meta-Character Anomaly Detection Alert - Repetitive Non-Word Characters'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''WARNING'',\
    setvar:''tx.sql_injection_score=+%{tx.warning_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.warning_anomaly_score}''"


#
# -=[ Detect SQLi bypass: quotes ]=-
#
# Quotes and backticks can be used to bypass SQLi detection.
#
# Example:
# GET http://localhost/test.php?id=9999%20or+{`if`(2=(select+2+from+wp_users+where+user_login=''admin''))}
#
# The minimum text between the ticks or backticks must be 2 (if, for example) and a maximum of 29.
# 29 is a compromise: The lower this number (29), the lower the probability of FP and the higher the probability of false negatives.
# In tests we got a minimum number of FP with {2,29}.
#
# Base64 encoding detection:
# (?:[A-Za-z0-9+/]{4})+ #match any number of 4-letter blocks of the base64 char set
# (?:[A-Za-z0-9+/]{2}== #match 2-letter block of the base64 char set followed by "==", together forming a 4-letter block
# |                     # or
# [A-Za-z0-9+/]{3}=     #match 3-letter block of the base64 char set followed by "=", together forming a 4-letter block
# )?
#
# The minimal string that triggers this regexp is: ''if''
#
# The rule 942510 is similar to this rule, but triggers on backticks
# (`if`). That rule runs in paranoia level 2 or higher since the risk of
# false positives in natural text is still present but lower than this
# rule.
#
# Regular expression generated from regex-assembly/942511.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942511
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx ''(?:[\s\x0b\(\)\+\-0-9<=@-Z_a-\{\}]{2,29}|(?:[\+/-9A-Za-z]{4})+(?:(?:[\+/-9A-Za-z]{2}=|[\+/-9A-Za-z]{3})=)?)''" \
    "id:942511,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQLi bypass attempt by ticks detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}''"

# Detects '';
# '' Single quote. Used to delineate a query with an unmatched quote.
# ; Terminate a query. A prematurely terminated query creates an error.
# Explanation source:
# https://hwang.cisdept.cpp.edu/swanew/Text/SQL-Injection.htm
#
# Bug Bounty example: email=admin@juice-sh.op'';&password=foo
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx '';" \
    "id:942530,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''SQLi query termination detected'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.sql_injection_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}''"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:942017,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:942018,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#

#
# [ SQL Injection Character Anomaly Usage ]
#
# This is a stricter sibling of rule 942420.
#

# Regular expression generated from regex-assembly/942421.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942421
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){3})" \
    "id:942421,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Restricted SQL Character Anomaly Detection (cookies): # of special characters exceeded (3)'',\
    logdata:''Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/4'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''WARNING'',\
    setvar:''tx.inbound_anomaly_score_pl4=+%{tx.warning_anomaly_score}'',\
    setvar:''tx.sql_injection_score=+%{tx.warning_anomaly_score}''"


#
# This is a stricter sibling of rule 942430.
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#

# Regular expression generated from regex-assembly/942432.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942432
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){2})" \
    "id:942432,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Restricted SQL Character Anomaly Detection (args): # of special characters exceeded (2)'',\
    logdata:''Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-sqli'',\
    tag:''paranoia-level/4'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SQLI'',\
    tag:''capec/1000/152/248/66'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''WARNING'',\
    setvar:''tx.inbound_anomaly_score_pl4=+%{tx.warning_anomaly_score}'',\
    setvar:''tx.sql_injection_score=+%{tx.warning_anomaly_score}''"


#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-942-APPLICATION-ATTACK-SQLI"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000013', (select id from public.http_spaces where name = 'default'), 'crs-943', 'CRS session', '# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:943011,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:943012,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#

#
# Session fixation
#
# -=[ References ]=-
# http://projects.webappsec.org/Session-Fixation
# http://projects.webappsec.org/w/page/13246960/Session%20Fixation
# http://capec.mitre.org/data/definitions/61.html
#
# Regular expression generated from regex-assembly/943100.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 943100
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\.cookie\b.*?;[^0-9A-Z_a-z]*?(?:expires|domain)[^0-9A-Z_a-z]*?=|\bhttp-equiv[^0-9A-Z_a-z]+set-cookie\b" \
    "id:943100,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:''Possible Session Fixation Attack: Setting Cookie Values in HTML'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-fixation'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SESSION-FIXATION'',\
    tag:''capec/1000/225/21/593/61'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.session_fixation_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# Regular expression generated from regex-assembly/943110.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 943110
#
SecRule ARGS_NAMES "@rx ^(?:j(?:se(?:ssionid|rvsession)|wsession)|(?:asp(?:\.net_)?session|zend_session_)id|p(?:hpsessi(?:on|d)|lay_session)|(?:(?:w(?:eblogic|l)|rack\.|laravel_)sessio|(?:next-auth\.session-|meteor_login_)toke)n|s(?:(?:ession[\-_]?|ails\.s)id|hiny-token)|_(?:session_id|(?:(?:flask|rails)_sessio|_(?:secure|host)-next-auth\.session-toke)n)|c(?:f(?:s?id|token)|onnect\.sid|akephp|i_session)|koa[\.:]sess)$" \
    "id:943110,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,\
    msg:''Possible Session Fixation Attack: SessionID Parameter Name with Off-Domain Referer'',\
    logdata:''Matched Data: %{TX.0} found within %{TX.943110_MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-fixation'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SESSION-FIXATION'',\
    tag:''capec/1000/225/21/593/61'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.943110_matched_var_name=%{matched_var_name}'',\
    chain"
    SecRule REQUEST_HEADERS:Referer "@rx ^(?:ht|f)tps?://(.*?)/" \
        "capture,\
        chain"
        SecRule TX:1 "!@endsWith %{request_headers.host}" \
            "setvar:''tx.session_fixation_score=+%{tx.critical_anomaly_score}'',\
            setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# Regular expression generated from regex-assembly/943120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 943120
#
SecRule ARGS_NAMES "@rx ^(?:j(?:se(?:ssionid|rvsession)|wsession)|(?:asp(?:\.net_)?session|session[\-_]?)id|phpsessi(?:on|d)|(?:weblogic|laravel_)session|_(?:session_id|flask_session)|c(?:f(?:s?id|token)|onnect\.sid))$" \
    "id:943120,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,\
    msg:''Possible Session Fixation Attack: SessionID Parameter Name with No Referer'',\
    logdata:''Matched Data: %{TX.0} found within %{TX.943120_MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-multi'',\
    tag:''platform-multi'',\
    tag:''attack-fixation'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-SESSION-FIXATION'',\
    tag:''capec/1000/225/21/593/61'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.943120_matched_var_name=%{matched_var_name}'',\
    chain"
    SecRule &REQUEST_HEADERS:Referer "@eq 0" \
        "setvar:''tx.session_fixation_score=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"




SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:943013,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:943014,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:943015,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:943016,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:943017,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:943018,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000014', (select id from public.http_spaces where name = 'default'), 'crs-944', 'CRS Java', '# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#
# Many rules check request bodies, use "SecRequestBodyAccess On" to enable it on main modsecurity configuration file.

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:944011,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:944012,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#
# This rule is also triggered by an Apache Struts exploit:
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/xsscx/cve-2017-5638 ]
#
# This rule is also triggered by an Apache Struts Remote Code Execution exploit:
# [ Apache Struts vulnerability CVE-2017-9791 - Exploit tested: https://www.exploit-db.com/exploits/42324 ]
#
# This rule is also triggered by an Apache Struts Remote Code Execution exploit:
# [ Apache Struts vulnerability CVE-2017-9805 - Exploit tested: https://www.exploit-db.com/exploits/42627 ]
#
# This rule is also triggered by an Oracle WebLogic Remote Command Execution exploit:
# [ Oracle WebLogic vulnerability CVE-2017-10271 - Exploit tested: https://www.exploit-db.com/exploits/43458 ]
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx java\.lang\.(?:runtime|processbuilder)" \
    "id:944100,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:''Remote Command Execution: Suspicious Java class detected'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/137/6'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# This rule is also triggered by the following exploit(s):
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/xsscx/cve-2017-5638 ]
# [ Apache Struts vulnerability CVE-2017-9791 - Exploit tested: https://www.exploit-db.com/exploits/42324 ]
# [ Apache Struts vulnerability CVE-2017-9805 - Exploit tested: https://www.exploit-db.com/exploits/42627 ]
# [ Java deserialization vulnerability/Apache Struts (CVE-2017-9805) ]
# [ Java deserialization vulnerability/Oracle Weblogic (CVE-2017-10271) ]
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Generic rule to detect processbuilder or runtime calls, if any of those is found and the same target contains
# java. unmarshaller or base64data to trigger a potential payload execution
# tested with https://www.exploit-db.com/exploits/42627/ and https://www.exploit-db.com/exploits/43458/

SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?:runtime|processbuilder)" \
    "id:944110,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:''Remote Command Execution: Java process spawn (CVE-2017-9805)'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    chain"
    SecRule MATCHED_VARS|XML:/*|XML://@* "@rx (?i)(?:unmarshaller|base64data|java\.)" \
        "setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# Magic bytes detected and payload included possibly RCE vulnerable classes detected and process execution methods detected
# anomaly score set to critical as all conditions indicate the request try to perform RCE.
# Regular expression generated from regex-assembly/944120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944120
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx (?:clonetransform|xmldecod)er|f(?:orclosure|ilewriter)|in(?:stantiate(?:factory|transformer)|vokertransformer)|(?:prototype(?:clone|serialization)factor|getpropert)y|whileclosure" \
    "id:944120,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:''Remote Command Execution: Java serialization (CVE-2015-4852)'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    chain"
    SecRule MATCHED_VARS "@rx (?:runtime|processbuilder)" \
        "setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
        setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"

# This rule is also triggered by the following exploit(s):
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/mazen160/struts-pwn ]
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/xsscx/cve-2017-5638 ]
# [ Apache Struts vulnerability CVE-2017-9791 - Exploit tested: https://www.exploit-db.com/exploits/42324 ]
# [ Apache Struts vulnerability CVE-2017-9805 - Exploit tested: https://www.exploit-db.com/exploits/42627 ]
# [ Oracle WebLogic vulnerability CVE-2017-10271 - Exploit tested: https://www.exploit-db.com/exploits/43458 ]
# [ Apache Struts vulnerability CVE-2018-11776 - Exploit tested: https://www.exploit-db.com/exploits/45262 ]
# [ Apache Struts vulnerability CVE-2018-11776 - Exploit tested: https://www.exploit-db.com/exploits/45260 ]
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_FILENAME|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@pmFromFile java-classes.data" \
    "id:944130,\
    phase:2,\
    block,\
    t:none,\
    msg:''Suspicious Java class detected'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


#
# [ Java Script Uploads ]
#
# Block file uploads with filenames ending in Java scripts (.jsp, .jspx)
#
# Many application contain Unrestricted File Upload vulnerabilities.
# https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload
#
# Attackers may use such a vulnerability to achieve remote code execution
# by uploading a script file. If the upload storage location is predictable
# and not adequately protected, the attacker may then request the uploaded
# file and have the code within it executed on the server.
#
# Some AJAX uploaders use the nonstandard request headers X-Filename,
# X_Filename, or X-File-Name to transmit the file name to the server;
# scan these request headers as well as multipart/form-data file names.
#
SecRule FILES|REQUEST_HEADERS:X-Filename|REQUEST_HEADERS:X_Filename|REQUEST_HEADERS:X.Filename|REQUEST_HEADERS:X-File-Name "@rx .*\.(?:jsp|jspx)\.*$" \
    "id:944140,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,t:removeWhitespace,\
    msg:''Java Injection Attack: Java Script File Upload Found'',\
    logdata:''Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-injection-java'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/242'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


# Log4J / Log4Shell Defense
#
# This addresses exploits against the Log4J library described in several CVEs:
# * CVE-2021-44228
# * CVE-2021-44832
# * CVE-2021-45046
# * CVE-2021-45105
#
# See https://coreruleset.org/20211213/crs-and-log4j-log4shell-cve-2021-44228/
#
# This rule attempts to detect two things:
# * Nested use of ${
# * use of ${jndi:... without the closing bracket
#
# Rule 932130 is also essential for defense since there are certain
# bypasses of the log4j rules that can be caught by 932130.
#
# The payload is not displayed in the alert message since log4j could
# potentially be executed on the logviewer.
#
# This rule has stricter siblings: 944151 (PL2), 944152 (PL4)
#
# Regular expression generated from regex-assembly/944150.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944150
#
SecRule REQUEST_LINE|ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?i)(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)(?:[^\}]{0,15}(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)|jndi|ctx)" \
    "id:944150,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:jsDecode,t:htmlEntityDecode,\
    log,\
    msg:''Potential Remote Command Execution: Log4j / Log4shell'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/1'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/137/6'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}''"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:944013,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:944014,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#

# This is a stricter sibling of 944150.
# It is a re-iteration of said rule without the curly bracket distance limiter
# between the nested "${". This is prone to backtracking and therefore a potential
# DoS problem for backtracking regular expression engines (e.g. PCRE2), but it also avoids evasions that fill the space between the nested
# elements with arbitrary data.
#
# Regular expression generated from regex-assembly/944151.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944151
#
SecRule REQUEST_LINE|ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?i)(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)(?:[^\}]*(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)|jndi|ctx)" \
    "id:944151,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:jsDecode,t:htmlEntityDecode,\
    log,\
    msg:''Potential Remote Command Execution: Log4j / Log4shell'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/137/6'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# [ Java deserialization vulnerability/Apache Commons (CVE-2015-4852) ]
#
# Detect exploitation of "Java deserialization" Apache Commons.
#
# Based on rules by @spartantri.
# https://spartantri.com/ModSecurity/?p=44
#
# Interesting references about the vulnerability
# https://foxglovesecurity.com/2015/11/06/what-do-weblogic-websphere-jboss-jenkins-opennms-and-your-application-have-in-common-this-vulnerability/
# https://github.com/GrrrDog/Java-Deserialization-Cheat-Sheet
#
# Potential false positives with random fields, the anomaly level is set low to avoid blocking request
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx \xac\xed\x00\x05" \
    "id:944200,\
    phase:2,\
    block,\
    msg:''Magic bytes Detected, probable java serialization in use'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Detecting possible base64 text to match encoded magic bytes \xac\xed\x00\x05 with padding encoded in base64 strings are rO0ABQ KztAAU Cs7QAF
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx (?:rO0ABQ|KztAAU|Cs7QAF)" \
    "id:944210,\
    phase:2,\
    block,\
    msg:''Magic bytes Detected Base64 Encoded, probable java serialization in use'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# Regular expression generated from regex-assembly/944240.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944240
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx (?:clonetransform|xmldecod)er|f(?:orclosure|ilewriter)|in(?:stantiate(?:factory|transformer)|vokertransformer)|(?:prototype(?:clone|serialization)factor|getpropert)y|whileclosure" \
    "id:944240,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:''Remote Command Execution: Java serialization (CVE-2015-4852)'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx java\b.+(?:runtime|processbuilder)" \
    "id:944250,\
    phase:2,\
    block,\
    t:lowercase,\
    msg:''Remote Command Execution: Suspicious Java method detected'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


# This rule is also triggered by the following exploit(s):
# - https://www.rapid7.com/blog/post/2022/03/30/spring4shell-zero-day-vulnerability-in-spring-framework/
#
# Regular expression generated from regex-assembly/944260.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944260
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx class\.module\.classLoader\.resources\.context\.parent\.pipeline|springframework\.context\.support\.FileSystemXmlApplicationContext" \
    "id:944260,\
    phase:2,\
    block,\
    t:urlDecodeUni,\
    msg:''Remote Command Execution: Malicious class-loading payload'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/2'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}''"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:944015,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:944016,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#
# Interesting keywords for possibly RCE on vulnerable classes and methods base64 encoded
# Keywords = [''runtime'', ''processbuilder'', ''clonetransformer'', ''forclosure'', ''instantiatefactory'', ''instantiatetransformer'', ''invokertransformer'', ''prototypeclonefactory'', ''prototypeserializationfactory'', ''whileclosure'']
#for item in keywords:
#   pad=''\x00''
#   for padding in xrange(3):
#     print base64.b64encode(''''.join([pad*padding,item])).replace(''='','''')[padding:],
#cnVudGltZQ HJ1bnRpbWU BydW50aW1l cHJvY2Vzc2J1aWxkZXI HByb2Nlc3NidWlsZGVy Bwcm9jZXNzYnVpbGRlcg Y2xvbmV0cmFuc2Zvcm1lcg GNsb25ldHJhbnNmb3JtZXI BjbG9uZXRyYW5zZm9ybWVy Zm9yY2xvc3VyZQ GZvcmNsb3N1cmU Bmb3JjbG9zdXJl aW5zdGFudGlhdGVmYWN0b3J5 Gluc3RhbnRpYXRlZmFjdG9yeQ BpbnN0YW50aWF0ZWZhY3Rvcnk aW5zdGFudGlhdGV0cmFuc2Zvcm1lcg Gluc3RhbnRpYXRldHJhbnNmb3JtZXI BpbnN0YW50aWF0ZXRyYW5zZm9ybWVy aW52b2tlcnRyYW5zZm9ybWVy Gludm9rZXJ0cmFuc2Zvcm1lcg BpbnZva2VydHJhbnNmb3JtZXI cHJvdG90eXBlY2xvbmVmYWN0b3J5 HByb3RvdHlwZWNsb25lZmFjdG9yeQ Bwcm90b3R5cGVjbG9uZWZhY3Rvcnk cHJvdG90eXBlc2VyaWFsaXphdGlvbmZhY3Rvcnk HByb3RvdHlwZXNlcmlhbGl6YXRpb25mYWN0b3J5 Bwcm90b3R5cGVzZXJpYWxpemF0aW9uZmFjdG9yeQ d2hpbGVjbG9zdXJl HdoaWxlY2xvc3VyZQ B3aGlsZWNsb3N1cmU
#
# Regular expression generated from regex-assembly/944300.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944300
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx c(?:nVudGltZQ|HJv(?:Y2Vzc2J1aWxkZXI|dG90eXBl(?:Y2xvbmVmYWN0b3J5|c2VyaWFsaXphdGlvbmZhY3Rvcnk)))|H(?:J1bnRpbWU|Byb(?:2Nlc3NidWlsZGVy|3RvdHlwZ(?:WNsb25lZmFjdG9yeQ|XNlcmlhbGl6YXRpb25mYWN0b3J5))|doaWxlY2xvc3VyZQ)|B(?:(?:ydW50aW1|mb3JjbG9zdXJ)l|wcm9(?:jZXNzYnVpbGRlcg|0b3R5cGV(?:jbG9uZWZhY3Rvcnk|zZXJpYWxpemF0aW9uZmFjdG9yeQ))|jbG9uZXRyYW5zZm9ybWVy|pbn(?:N0YW50aWF0Z(?:WZhY3Rvcnk|XRyYW5zZm9ybWVy)|Zva2VydHJhbnNmb3JtZXI)|3aGlsZWNsb3N1cmU)|Y2xvbmV0cmFuc2Zvcm1lcg|G(?:Nsb25ldHJhbnNmb3JtZXI|ZvcmNsb3N1cmU|lu(?:c3RhbnRpYXRl(?:ZmFjdG9yeQ|dHJhbnNmb3JtZXI)|dm9rZXJ0cmFuc2Zvcm1lcg))|Zm9yY2xvc3VyZQ|aW5(?:zdGFudGlhdGV(?:mYWN0b3J5|0cmFuc2Zvcm1lcg)|2b2tlcnRyYW5zZm9ybWVy)|d2hpbGVjbG9zdXJl" \
    "id:944300,\
    phase:2,\
    block,\
    t:none,\
    msg:''Base64 encoded string matched suspicious keyword'',\
    logdata:''Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/3'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/248'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}''"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:944017,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:944018,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#

# This is a stricter sibling of 944150.
# It simply checks for the existence of `${`, taking into account the same encoding evasions
# as 944150.
#
# Regular expression generated from regex-assembly/944152.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944152
#
SecRule REQUEST_LINE|ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?i)(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)" \
    "id:944152,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:jsDecode,t:htmlEntityDecode,\
    log,\
    msg:''Potential Remote Command Execution: Log4j / Log4shell'',\
    tag:''application-multi'',\
    tag:''language-java'',\
    tag:''platform-multi'',\
    tag:''attack-rce'',\
    tag:''paranoia-level/4'',\
    tag:''OWASP_CRS'',\
    tag:''OWASP_CRS/ATTACK-JAVA'',\
    tag:''capec/1000/152/137/6'',\
    ver:''OWASP_CRS/4.25.0'',\
    severity:''CRITICAL'',\
    setvar:''tx.rce_score=+%{tx.critical_anomaly_score}'',\
    setvar:''tx.inbound_anomaly_score_pl4=+%{tx.critical_anomaly_score}''"

#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-944-APPLICATION-ATTACK-JAVA"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000015', (select id from public.http_spaces where name = 'default'), 'crs-949', 'CRS blocking', '# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#

# Summing up the blocking and detection anomaly scores in phase 1
# even when early blocking is disabled, we need to sum up the scores in phase 1
# this prevents bugs in phase 5 if Apache skips phases because of error handling
# See: https://github.com/coreruleset/coreruleset/issues/2319#issuecomment-1047503932

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 1" \
    "id:949052,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 1" \
    "id:949152,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}''"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 2" \
    "id:949053,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 2" \
    "id:949153,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}''"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 3" \
    "id:949054,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 3" \
    "id:949154,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}''"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 4" \
    "id:949055,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 4" \
    "id:949155,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}''"

# at start of phase 2, we reset the aggregate scores to 0 to prevent duplicate counting of per-PL scores
# this is necessary because the per-PL scores are counted across phases
SecAction \
    "id:949059,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=0''"

SecAction \
    "id:949159,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=0''"

# Summing up the blocking and detection anomaly scores in phase 2

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 1" \
    "id:949060,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 1" \
    "id:949160,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}''"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 2" \
    "id:949061,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 2" \
    "id:949161,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}''"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 3" \
    "id:949062,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 3" \
    "id:949162,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}''"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 4" \
    "id:949063,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 4" \
    "id:949163,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    setvar:''tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}''"


SecMarker "BEGIN-REQUEST-BLOCKING-EVAL"

#
# -=[ Anomaly Mode: Overall Transaction Anomaly Score ]=-
#

# if early blocking is active, check threshold in phase 1
SecRule TX:BLOCKING_INBOUND_ANOMALY_SCORE "@ge %{tx.inbound_anomaly_score_threshold}" \
    "id:949111,\
    phase:1,\
    deny,\
    t:none,\
    msg:''Inbound Anomaly Score Exceeded in phase 1 (Total Score: %{TX.BLOCKING_INBOUND_ANOMALY_SCORE})'',\
    tag:''anomaly-evaluation'',\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0'',\
    chain"
    SecRule TX:EARLY_BLOCKING "@eq 1"

# always check threshold in phase 2
SecRule TX:BLOCKING_INBOUND_ANOMALY_SCORE "@ge %{tx.inbound_anomaly_score_threshold}" \
    "id:949110,\
    phase:2,\
    deny,\
    t:none,\
    msg:''Inbound Anomaly Score Exceeded (Total Score: %{TX.BLOCKING_INBOUND_ANOMALY_SCORE})'',\
    tag:''anomaly-evaluation'',\
    tag:''OWASP_CRS'',\
    ver:''OWASP_CRS/4.25.0''"

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:949011,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:949012,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:949013,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:949014,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:949015,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:949016,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:949017,phase:1,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:949018,phase:2,pass,nolog,tag:''OWASP_CRS'',ver:''OWASP_CRS/4.25.0'',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-949-BLOCKING-EVALUATION"
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000016', (select id from public.http_spaces where name = 'default'), 'ssrf.data', 'Словарь SSRF для @pmFromFile', '# Sources:
# - https://gist.githubusercontent.com/jhaddix/78cece26c91c6263653f31ba453e273b/raw/a4869d58a5ce337d1465c2d1b29777b9eecd371f/cloud_metadata.txt
# - https://book.hacktricks.xyz/pentesting-web/ssrf-server-side-request-forgery/cloud-ssrf
# - https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Server%20Side%20Request%20Forgery
# - https://github.com/assetnote/blind-ssrf-chains

## AWS
# from http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-categories
#
# To fully protect, use IMDSv2 (see https://aws.amazon.com/blogs/security/defense-in-depth-open-firewalls-reverse-proxies-ssrf-vulnerabilities-ec2-instance-metadata-service/)

http://instance-data/latest/
http://169.254.169.254/latest/

# Common evasion techniques:
http://2852039166/latest/
http://025177524776/latest/
http://0251.0376.0251.0376/latest/
http://0xA9.0xFE.0xA9.0xFE/latest/
http://0xA9FEA9FE/latest/
http://0251.254.169.254/latest/
http://[::ffff:a9fe:a9fe]/latest/
http://[0:0:0:0:0:ffff:a9fe:a9fe]/latest/
http://[0:0:0:0:0:ffff:169.254.169.254]/latest/
http://169.254.169.254.nip.io/latest/
http://nicob.net/redir-http-169.254.169.254:80-

# http://127.0.0.1
http://2130706433/
# http://192.168.0.1
http://3232235521/
# http://192.168.1.1
http://3232235777/
# http://169.254.169.254
http://2852039166/
# IPv6 base
http://[::]:

# localhost bypass
http://localtest.me
http://127.0.0.1.nip.io
http://127.127.127.127
http://127.0.1.3
http://127.0.0.0
http://127.0.0.1
http://0.0.0.0
http://localhost
http://0177.0.0.1/
http://[::1]
http://[0000::1]
http://[::ffff:127.0.0.1]
http://[0:0:0:0:0:ffff:127.0.0.1]
http://0/
http://127.1
http://127.0.1
http:127.0.0.1

# AWS ECS
http://169.254.170.2/v2

## Google Cloud
#  https://cloud.google.com/compute/docs/metadata/overview
#  - Requires the header "Metadata-Flavor: Google" or "X-Google-Metadata-Request: True"

http://169.254.169.254/computeMetadata/v1/
http://metadata.google.internal/computeMetadata/v1/
http://metadata/computeMetadata/v1/
# Common evasion techniques:
http://2852039166/computeMetadata/v1/
http://025177524776/computeMetadata/v1/
http://0251.0376.0251.0376/computeMetadata/v1/
http://[::ffff:a9fe:a9fe]/computeMetadata/v1/
http://[0:0:0:0:0:ffff:a9fe:a9fe]/computeMetadata/v1/
http://[0:0:0:0:0:ffff:169.254.169.254]/computeMetadata/v1/
http://169.254.169.254.nip.io/computeMetadata/v1/
http://0xA9.0xFE.0xA9.0xFE/computeMetadata/v1/
http://0xA9FEA9FE/computeMetadata/v1/
http://0251.254.169.254/computeMetadata/v1/

# Google gopher SSRF
gopher://metadata.google.internal

# Google allows recursive pulls
http://metadata.google.internal/computeMetadata/v1/instance/disks/?recursive=true

## Google
#  Beta does NOT require a header atm
http://metadata.google.internal/computeMetadata/v1beta1/

## Digital Ocean
# https://developers.digitalocean.com/documentation/metadata/

http://169.254.169.254/metadata/v1.json
# This other prefix will be used from Azure: http://169.254.169.254/metadata/v1/

## Packetcloud

https://metadata.packet.net/userdata

## Azure
#
# To be effective, these also have to:
#
# - contain the header Metadata: true
# - not contain an X-Forwarded-For header

http://169.254.169.254/metadata/v1/
http://169.254.169.254/metadata/instance?api-version=2017-04-02
http://169.254.169.254/metadata/instance/network/interface/0/ipv4/ipAddress/0/publicIpAddress?api-version=2017-04-02&format=text
# Common evasion techniques:
http://2852039166/metadata/v1/
http://025177524776/metadata/v1/
http://0251.0376.0251.0376/metadata/v1/
http://[::ffff:a9fe:a9fe]/metadata/v1/
http://[0:0:0:0:0:ffff:a9fe:a9fe]/metadata/v1/
http://[0:0:0:0:0:ffff:169.254.169.254]/metadata/v1/
http://169.254.169.254.nip.io/metadata/v1/
http://0xA9.0xFE.0xA9.0xFE/metadata/v1/
http://0xA9FEA9FE/metadata/v1/
http://0251.254.169.254/metadata/v1/

## OpenStack/RackSpace
http://169.254.169.254/openstack

## HP Helion
# (header required? unknown)
http://169.254.169.254/2009-04-04/meta-data/

## Oracle Cloud
http://192.0.0.192/latest/

## Alibaba
http://100.100.100.200/latest/meta-data/

# Rancher metadata
http://rancher-metadata/

# Local Docker
http://127.0.0.1:2375
http://2130706433:2375/
http://[::]:2375/
http://[0000::1]:2375/
http://[0:0:0:0:0:ffff:127.0.0.1]:2375/
http://2130706433:2375/
http://017700000001:2375/
http://0x7f000001:2375/
http://0xc0a80014:2375/
# Kubernetes etcd
http://127.0.0.1:2379

# Enclosed alphanumerics
http://169。254。169。254
http://169｡254｡169｡254
http://⑯⑨。②⑤④。⑯⑨｡②⑤④
http://⓪ⓧⓐ⑨｡⓪ⓧⓕⓔ｡⓪ⓧⓐ⑨｡⓪ⓧⓕⓔ
http://⓪ⓧⓐ⑨ⓕⓔⓐ⑨ⓕⓔ
http://②⑧⑤②⓪③⑨①⑥⑥
http://④②⑤｡⑤①⓪｡④②⑤｡⑤①⓪
http://⓪②⑤①。⓪③⑦⑥。⓪②⑤①。⓪③⑦⑥
http://⓪⓪②⑤①｡⓪⓪⓪③⑦⑥｡⓪⓪⓪⓪②⑤①｡⓪⓪⓪⓪⓪③⑦⑥
http://[::①⑥⑨｡②⑤④｡⑯⑨｡②⑤④]
http://[::ⓕⓕⓕⓕ:①⑥⑨。②⑤④。⑯⑨。②⑤④]
http://⓪ⓧⓐ⑨。⓪③⑦⑥。④③⑤①⑧
http://⓪ⓧⓐ⑨｡⑯⑥⑧⑨⑥⑥②
http://⓪⓪②⑤①。⑯⑥⑧⑨⑥⑥②
http://⓪⓪②⑤①｡⓪ⓧⓕⓔ｡④③⑤①⑧

# Java only blind ssrf
jar:http://127.0.0.1!/
jar:https://127.0.0.1!/
jar:ftp://127.0.0.1!/

# Other PL1 protocols
gopher://127.0.0.1
gopher://localhost

# AWS Lambda
http://localhost:9001/2018-06-01/runtime/
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000017', (select id from public.http_spaces where name = 'default'), 'ssrf-no-scheme.data', 'SSRF без схемы', '# SSRF patterns without schemes
#
# This file contains localhost and internal DNS names that are commonly used
# in SSRF attacks. These patterns are checked without URI schemes to catch
# cases where frameworks automatically prepend ''http://'' or ''https://''.
#
# Sources:
# - https://gist.githubusercontent.com/jhaddix/78cece26c91c6263653f31ba453e273b/raw/a4869d58a5ce337d1465c2d1b29777b9eecd371f/cloud_metadata.txt
# - https://book.hacktricks.xyz/pentesting-web/ssrf-server-side-request-forgery/cloud-ssrf
# - https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Server%20Side%20Request%20Forgery
# - https://github.com/assetnote/blind-ssrf-chains
# - https://github.com/coreruleset/coreruleset/issues/4427

# Standard hosts aliases
localhost/
localhost.localdomain/
localhost4/
localhost4.localdomain4/
ipv6-localhost/
ip6-loopback/

# Docker based aliases
host.docker.internal/
gateway.docker.internal/
kubernetes.docker.internal/

# Podman
host.containers.internal/

# K8s API local service
kubernetes.default.svc.cluster.local/

# Testing services
localtest.me/
lvh.me/
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_files (id, http_space_id, name, description, text_raw, created_at, updated_at) VALUES ('a0000000-0000-4000-8000-000000000018', (select id from public.http_spaces where name = 'default'), 'java-classes.data', 'Классы Java RCE', '# Java Classes for use with Java RCEs
#
# Used With Rule 944130 in Apache Struts and Oracle Weblogic RCEs Detection:
#
# CVE-2017-5638  (2017.01.29) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-5638
# CVE-2017-9791  (2017.06.21) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-9791
# CVE-2017-9805  (2017.06.21) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-9805
# CVE-2017-10271 (2017.06.21) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-10271
# CVE-2018-11776 (2018.06.05) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2018-11776
# CVE-2021-44228 (2021.11.26) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2021-44228
#
# Additional Resources
# Apache S2-057 (2019.01.20) https://cwiki.apache.org/confluence/display/WW/S2-057

com.opensymphony.xwork2
com.sun.org.apache
classLoader
declaredClass
freemarker.core
freemarker.template
freemarker.ext.rhino
java.io.BufferedInputStream
java.io.BufferedReader
java.io.ByteArrayInputStream
java.io.ByteArrayOutputStream
java.io.CharArrayReader
java.io.DataInputStream
java.io.File
java.io.FileOutputStream
java.io.FilePermission
java.io.FileWriter
java.io.FilterInputStream
java.io.FilterOutputStream
java.io.FilterReader
java.io.InputStream
java.io.IOException
java.io.LineNumberReader
java.io.ObjectInputStream
java.io.ObjectOutputStream
java.io.OutputStream
java.io.PipedOutputStream
java.io.PipedReader
java.io.PrintStream
java.io.PushbackInputStream
java.io.Reader
java.io.StringReader
java.lang.Class
java.lang.Enum
java.lang.Integer
java.lang.Number
java.lang.Object
java.lang.Process
java.lang.ProcessBuilder
java.lang.reflect
java.lang.Runtime
java.lang.String
java.lang.System
java.net.HttpURLConnection
java.net.JarURLConnection
java.net.DatagramSocket
java.net.MulticastSocket
java.net.ServerSocket
java.net.Socket
java.net.URL
javassist
javax.naming.InitialContext
javax.script.ScriptEngineManager
javax.xml.parsers
javax.xml.stream
OgnlContext
OgnlUtil
org.apache.commons
org.apache.struts
org.apache.struts2
org.dom4j.io.SAXReader
org.jdom2.input.SAXBuilder
org.omg.CORBA
org.xml.sax
PropertyUtilsBean
java.beans.XMLDecode
java.nio.file
sun.reflect
', '2026-09-12 15:27:33.518274+00', '2026-09-12 15:27:33.518274+00') ON CONFLICT DO NOTHING;

INSERT INTO public.rule_sets (id, http_space_id, name, description, created_at, updated_at, policy) VALUES ('b0000000-0000-4000-8000-000000000001', (select id from public.http_spaces where name = 'default'), 'default', 'Базовый CRS: XSS, SQLi, LFI, сканеры', '2026-09-12 15:27:33.526865+00', '2026-09-12 15:27:33.526865+00', '{}') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_sets (id, http_space_id, name, description, created_at, updated_at, policy) VALUES ('b0000000-0000-4000-8000-000000000002', (select id from public.http_spaces where name = 'default'), 'strict', 'CRS паранойя 2 и доп. сканеры/LFI/RCE', '2026-09-12 15:27:33.526865+00', '2026-09-12 15:27:33.526865+00', '{}') ON CONFLICT DO NOTHING;
INSERT INTO public.rule_sets (id, http_space_id, name, description, created_at, updated_at, policy) VALUES ('b0000000-0000-4000-8000-000000000003', (select id from public.http_spaces where name = 'default'), 'api', 'CRS XSS/SQLi и правила API сверху', '2026-09-12 15:27:33.526865+00', '2026-09-12 15:27:33.526865+00', '{}') ON CONFLICT DO NOTHING;

INSERT INTO public.vlai_profiles (id, http_space_id, name, description, doc, created_at, updated_at) VALUES ('dc432476-e2c1-409e-b439-106df2293b99', (select id from public.http_spaces where name = 'default'), 'default', 'Профиль по умолчанию', '{}', '2026-09-12 15:27:34.85268+00', '2026-09-12 15:27:34.85268+00') ON CONFLICT DO NOTHING;

INSERT INTO public.captcha_profiles (id, http_space_id, server_id, name, description, doc, created_at, updated_at) VALUES ('92bfad12-eaeb-425e-9605-f9afa11c378e', (select id from public.http_spaces where name = 'default'), NULL, 'default', 'Профиль по умолчанию', '{}', '2026-09-12 15:27:34.322251+00', '2026-09-12 15:27:34.322251+00') ON CONFLICT DO NOTHING;

INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('27d4c4bc-619b-442e-8f2f-354507b4734d', 'malformed.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed09dd0b5d0bad0bed180d180d0b5d0bad182d0bdd18bd0b920d0b7d0b0d0bfd180d0bed1813c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20236233323631653b0a20202d2d746f6e652d62673a20236664656165613b0a20202d2d746f6e652d6c696e653a20236630636363633b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20236666396439353b0a202020202d2d746f6e652d62673a20233361316631663b0a202020202d2d746f6e652d6c696e653a20233561326232623b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a2057414620d0bdd0b520d181d0bcd0bed0b320d180d0b0d0b7d0bed0b1d180d0b0d182d18c20d0b7d0b0d0bfd180d0bed18120d0bad0bbd0b8d0b5d0bdd182d0b0223e3c7061746820636c6173733d22776972652064696d2220643d224d3734203432483932222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d31323020343248313338222f3e3c636972636c6520636c6173733d226261646765222063783d22313036222063793d2234322220723d223131222f3e3c7061746820636c6173733d226d61726b2220643d224d3130322033386c3820384d3131302033386c2d382038222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32303220343248323636222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2234303022202d2d3e3c2f703e0a20203c68313ed09dd0b5d0bad0bed180d180d0b5d0bad182d0bdd18bd0b920d0b7d0b0d0bfd180d0bed1813c2f68313e0a20203c7020636c6173733d226c656164223ed097d0b0d0bfd180d0bed18120d0bdd0b520d183d0b4d0b0d0bbd0bed181d18c20d180d0b0d0b7d0bed0b1d180d0b0d182d18c3a20d0bed0bd20d0bdd0b520d181d0bed0bed182d0b2d0b5d182d181d182d0b2d183d0b5d18220d0bed0b6d0b8d0b4d0b0d0b5d0bcd0bed0bcd18320d184d0bed180d0bcd0b0d182d1832e3c2f703e0a20203c64697620636c6173733d22776879223e0a3c212d2d2320696620657870723d22247761665f64656e795f73636f7065203d206e6574776f726b22202d2d3e0a20203c703ed097d0b0d0bad180d18bd182d0b020d181d0b5d182d18c203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20e2809420d0b220d0bdd0b5d19120d0b2d185d0bed0b4d0b8d18220d0b2d0b0d18820d0b0d0b4d180d0b5d1812e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d206164647265737322202d2d3e0a20203c703ed097d0b0d0bad180d18bd18220d0b0d0b4d180d0b5d181203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d20636f756e74727922202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d0b2d0b0d188d0b5d0b3d0be20d180d0b5d0b3d0b8d0bed0bdd0b020d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2061736e22202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d181d0b5d182d0b8203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2073657373696f6e22202d2d3e0a20203c703ed09ed0b3d180d0b0d0bdd0b8d187d0b5d0bdd0b8d0b520d0b4d0b5d0b9d181d182d0b2d183d0b5d18220d0bdd0b020d0b2d0b0d188d18320d181d0b5d181d181d0b8d18e2e3c2f703e0a3c212d2d2320656c7365202d2d3e0a20203c703ed0a4d0bed180d0bcd0b0d18220d0b7d0b0d0bfd180d0bed181d0b020d0bdd0b0d180d183d188d0b5d0bd2e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f726574727922202d2d3e0a20203c703ed09fd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed18120d0bcd0bed0b6d0bdd0be20d187d0b5d180d0b5d0b7203c623e3c212d2d23206563686f207661723d227761665f64656e795f7265747279222064656661756c743d2222202d2d3e3c2f623e20d1812e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed09fd180d0bed0b2d0b5d180d18cd182d0b520d0b0d0b4d180d0b5d1812c20d0bcd0b5d182d0bed0b420d0b820d0b4d0b0d0bdd0bdd18bd0b520d0b7d0b0d0bfd180d0bed181d0b020d0b820d0bfd0bed0b2d182d0bed180d0b8d182d0b520d0bfd0bed0bfd18bd182d0bad1832e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('4f3584f9-4e1c-47b4-88e7-f2ca477f9fdb', 'error.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed092d180d0b5d0bcd0b5d0bdd0bdd0be20d0bdd0b5d0b4d0bed181d182d183d0bfd0bdd0be3c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20233462353035383b0a20202d2d746f6e652d62673a20236630663166333b0a20202d2d746f6e652d6c696e653a20236463646565323b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20236236626363343b0a202020202d2d746f6e652d62673a20233237326233313b0a202020202d2d746f6e652d6c696e653a20233361336634373b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a20d181d0b1d0bed0b920d0bdd0b020d181d0b0d0bcd0bed0bc20574146223e3c7061746820636c6173733d22776972652220643d224d373420343248313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382034326c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32303220343248323636222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c636972636c6520636c6173733d226261646765222063783d22313932222063793d2232302220723d22392e35222f3e3c7061746820636c6173733d226d61726b2220643d224d3139322031352e3576352e344d3139322032342e34682e3031222f3e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2235303222202d2d3e3c2f703e0a20203c68313ed092d180d0b5d0bcd0b5d0bdd0bdd0be20d0bdd0b5d0b4d0bed181d182d183d0bfd0bdd0be3c2f68313e0a20203c7020636c6173733d226c656164223ed097d0b0d0bfd180d0bed18120d0bdd0b520d183d0b4d0b0d0bbd0bed181d18c20d0bed0b1d180d0b0d0b1d0bed182d0b0d182d18c2e20d0add182d0be20d181d0b1d0bed0b920d0bdd0b020d0bdd0b0d188d0b5d0b920d181d182d0bed180d0bed0bdd0b520e2809420d18120d0b2d0b0d188d0b8d0bc20d0b7d0b0d0bfd180d0bed181d0bed0bc20d0b2d181d19120d0b220d0bfd0bed180d18fd0b4d0bad0b52e3c2f703e0a20203c64697620636c6173733d22776879223e0a3c212d2d2320696620657870723d22247761665f64656e795f73636f7065203d206e6574776f726b22202d2d3e0a20203c703ed097d0b0d0bad180d18bd182d0b020d181d0b5d182d18c203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20e2809420d0b220d0bdd0b5d19120d0b2d185d0bed0b4d0b8d18220d0b2d0b0d18820d0b0d0b4d180d0b5d1812e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d206164647265737322202d2d3e0a20203c703ed097d0b0d0bad180d18bd18220d0b0d0b4d180d0b5d181203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d20636f756e74727922202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d0b2d0b0d188d0b5d0b3d0be20d180d0b5d0b3d0b8d0bed0bdd0b020d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2061736e22202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d181d0b5d182d0b8203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2073657373696f6e22202d2d3e0a20203c703ed09ed0b3d180d0b0d0bdd0b8d187d0b5d0bdd0b8d0b520d0b4d0b5d0b9d181d182d0b2d183d0b5d18220d0bdd0b020d0b2d0b0d188d18320d181d0b5d181d181d0b8d18e2e3c2f703e0a3c212d2d2320656c7365202d2d3e0a20203c703ed092d0bdd183d182d180d0b5d0bdd0bdd18fd18f20d0bed188d0b8d0b1d0bad0b020d181d0b5d180d0b2d0b8d181d0b02e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f726574727922202d2d3e0a20203c703ed09fd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed18120d0bcd0bed0b6d0bdd0be20d187d0b5d180d0b5d0b7203c623e3c212d2d23206563686f207661723d227761665f64656e795f7265747279222064656661756c743d2222202d2d3e3c2f623e20d1812e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed09fd0bed0b2d182d0bed180d0b8d182d0b520d0bfd0bed0bfd18bd182d0bad18320d187d0b5d180d0b5d0b720d0bcd0b8d0bdd183d182d1832e20d095d181d0bbd0b820d0bed188d0b8d0b1d0bad0b020d0bfd0bed0b2d182d0bed180d18fd0b5d182d181d18f2c20d0bed0b1d180d0b0d182d0b8d182d0b5d181d18c20d0b220d0bfd0bed0b4d0b4d0b5d180d0b6d0bad18320d0b820d183d0bad0b0d0b6d0b8d182d0b5204576656e742049442e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('4fd43b34-d6ae-45df-9bb3-8ec0bdf38c44', 'auth_required.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed09dd183d0b6d0b5d0bd20d0b2d185d0bed0b43c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20233266366264383b0a20202d2d746f6e652d62673a20236561663066643b0a20202d2d746f6e652d6c696e653a20236339643866353b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20233866623466353b0a202020202d2d746f6e652d62673a20233164323733383b0a202020202d2d746f6e652d6c696e653a20233266343436383b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a2057414620d0b4d0b5d180d0b6d0b8d18220d0b7d0b0d0bfd180d0bed18120d0b4d0be20d0b2d185d0bed0b4d0b0223e3c7061746820636c6173733d22776972652220643d224d373420343248313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382034326c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652064696d2220643d224d32303220343248323230222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32343820343248323636222f3e3c636972636c6520636c6173733d226261646765222063783d22323334222063793d2234322220723d223131222f3e3c7061746820636c6173733d226d61726b2220643d224d3233302e342034312e3468372e3276352e32682d372e327a222f3e3c7061746820636c6173733d226d61726b2220643d224d3233322034312e34762d322e32613220322030203020312034203076322e32222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2234303122202d2d3e3c2f703e0a20203c68313ed09dd183d0b6d0b5d0bd20d0b2d185d0bed0b43c2f68313e0a20203c7020636c6173733d226c656164223ed0add182d0bed18220d180d0b5d181d183d180d18120d0b4d0bed181d182d183d0bfd0b5d0bd20d182d0bed0bbd18cd0bad0be20d0bfd0bed181d0bbd0b520d0b2d185d0bed0b4d0b02e3c2f703e0a20203c64697620636c6173733d22776879223e0a3c212d2d2320696620657870723d22247761665f64656e795f73636f7065203d206e6574776f726b22202d2d3e0a20203c703ed097d0b0d0bad180d18bd182d0b020d181d0b5d182d18c203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20e2809420d0b220d0bdd0b5d19120d0b2d185d0bed0b4d0b8d18220d0b2d0b0d18820d0b0d0b4d180d0b5d1812e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d206164647265737322202d2d3e0a20203c703ed097d0b0d0bad180d18bd18220d0b0d0b4d180d0b5d181203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d20636f756e74727922202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d0b2d0b0d188d0b5d0b3d0be20d180d0b5d0b3d0b8d0bed0bdd0b020d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2061736e22202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d181d0b5d182d0b8203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2073657373696f6e22202d2d3e0a20203c703ed09ed0b3d180d0b0d0bdd0b8d187d0b5d0bdd0b8d0b520d0b4d0b5d0b9d181d182d0b2d183d0b5d18220d0bdd0b020d0b2d0b0d188d18320d181d0b5d181d181d0b8d18e2e3c2f703e0a3c212d2d2320656c7365202d2d3e0a20203c703ed092d185d0bed0b420d0bdd0b520d0b2d18bd0bfd0bed0bbd0bdd0b5d0bd20d0b8d0bbd0b820d181d0b5d181d181d0b8d18f20d0b8d181d182d0b5d0bad0bbd0b02e3c2f703e0a3c212d2d2320656e646966202d2d3e0a20203c703e3c6120687265663d222f7761662f6c6f67696e223ed092d0bed0b9d182d0b83c2f613e20d0b820d0bfd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed1812e3c2f703e0a3c212d2d2320696620657870723d22247761665f64656e795f726574727922202d2d3e0a20203c703ed09fd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed18120d0bcd0bed0b6d0bdd0be20d187d0b5d180d0b5d0b7203c623e3c212d2d23206563686f207661723d227761665f64656e795f7265747279222064656661756c743d2222202d2d3e3c2f623e20d1812e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed095d181d0bbd0b820d0b2d185d0bed0b420d0b2d18bd0bfd0bed0bbd0bdd0b5d0bd2c20d0b020d0b4d0bed181d182d183d0bf20d0b2d181d19120d180d0b0d0b2d0bdd0be20d0b7d0b0d0bad180d18bd1822c20d0bed0b1d180d0b0d182d0b8d182d0b5d181d18c20d0b220d0bfd0bed0b4d0b4d0b5d180d0b6d0bad18320d0b820d183d0bad0b0d0b6d0b8d182d0b5204576656e742049442e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('7f5be547-094c-4b26-8ead-332fdac259f0', 'login_form.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653e7b7b2e5469746c657d7d3c2f7469746c653e0a3c212d2d0a2020d0a1d182d180d0b0d0bdd0b8d186d0b020d0b2d185d0bed0b4d0b020d0bad0bed0bdd182d183d180d0b02e20d09fd180d0b0d0b2d0b8d0bbd0b020d182d0b520d0b6d0b52c20d187d182d0be20d18320d181d182d180d0b0d0bdd0b8d18620d0bed182d0bad0b0d0b7d0b00a202028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c20d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b90a2020d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e0a0a2020d091d0b5d0b7204a5320d0bdd0b520d0b8d0b720d0b0d181d0bad0b5d182d0b8d0b7d0bcd0b03a20d181d182d180d0b0d0bdd0b8d186d0b020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc20d0b820d0bfd0b5d180d0b5d0b420d0b2d185d0bed0b4d0bed0bc2c0a2020d182d0be20d0b5d181d182d18c20d0b220d0b5d0b4d0b8d0bdd181d182d0b2d0b5d0bdd0bdd0bed0bc20d0bcd0b5d181d182d0b520d0bad0bed0bdd182d183d180d0b02c20d0b3d0b4d0b520d181d0bad180d0b8d0bfd18220d0b2d0b8d0b4d0b5d0bb20d0b1d18b20d0bfd0b0d180d0bed0bbd18c2e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b20636f6c6f722d736368656d653a206c69676874206461726b3b207d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20236634663566373b0a2020636f6c6f723a20233163316532313b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2033383070783b0a20206261636b67726f756e643a20236666663b0a2020626f726465723a2031707820736f6c696420236532653465383b0a2020626f726465722d7261646975733a20313070783b0a202070616464696e673a20323870783b0a7d0a6831207b206d617267696e3a20302030203670783b20666f6e742d73697a653a20313970783b20666f6e742d7765696768743a203630303b207d0a702e6e6f7465207b206d617267696e3a2030203020323070783b20636f6c6f723a20233631363536633b20666f6e742d73697a653a20313370783b207d0a6c6162656c207b20646973706c61793a20626c6f636b3b206d617267696e3a20313470782030203570783b20666f6e742d73697a653a20313370783b20636f6c6f723a20233361336434323b207d0a696e707574207b0a202077696474683a20313030253b0a202070616464696e673a2039707820313170783b0a2020666f6e743a20696e68657269743b0a2020636f6c6f723a20696e68657269743b0a20206261636b67726f756e643a20236666663b0a2020626f726465723a2031707820736f6c696420236363643064363b0a2020626f726465722d7261646975733a203670783b0a7d0a696e7075743a666f637573207b206f75746c696e653a2032707820736f6c696420233362366664343b206f75746c696e652d6f66667365743a202d3170783b20626f726465722d636f6c6f723a20233362366664343b207d0a627574746f6e207b0a202077696474683a20313030253b0a20206d617267696e2d746f703a20323070783b0a202070616464696e673a20313070783b0a2020666f6e743a20696e68657269743b0a2020666f6e742d7765696768743a203630303b0a2020636f6c6f723a20236666663b0a20206261636b67726f756e643a20233266366264383b0a2020626f726465723a20303b0a2020626f726465722d7261646975733a203670783b0a2020637572736f723a20706f696e7465723b0a7d0a627574746f6e3a686f766572207b206261636b67726f756e643a20233235353962383b207d0a2e6572726f72207b0a20206d617267696e3a20302030203470783b0a202070616464696e673a2039707820313170783b0a2020666f6e742d73697a653a20313370783b0a2020636f6c6f723a20233861316631663b0a20206261636b67726f756e643a20236664656165613b0a2020626f726465723a2031707820736f6c696420236633633963393b0a2020626f726465722d7261646975733a203670783b0a7d0a2e646f6e65207b206d617267696e3a20303b20636f6c6f723a20233361336434323b207d0a61207b20636f6c6f723a20233266366264383b207d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a2020626f6479207b206261636b67726f756e643a20233136313831633b20636f6c6f723a20236536653865623b207d0a20206d61696e207b206261636b67726f756e643a20233165323132363b20626f726465722d636f6c6f723a20233263333033373b207d0a2020702e6e6f7465207b20636f6c6f723a20233961613061383b207d0a20206c6162656c207b20636f6c6f723a20236333633863663b207d0a2020696e707574207b206261636b67726f756e643a20233136313831633b20626f726465722d636f6c6f723a20233361336634373b207d0a20202e6572726f72207b20636f6c6f723a20236666623462343b206261636b67726f756e643a20233361316631663b20626f726465722d636f6c6f723a20233561326232623b207d0a20202e646f6e65207b20636f6c6f723a20236333633863663b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c68313e7b7b2e5469746c657d7d3c2f68313e0a0a20207b7b6966202e446f6e657d7d0a202020203c7020636c6173733d22646f6e65223e7b7b2e446f6e65546578747d7d3c2f703e0a202020203c703e3c6120687265663d227b7b2e4c6f67696e5552497d7d223ed092d0bed0b9d182d0b820d181d0bdd0bed0b2d0b03c2f613e3c2f703e0a20207b7b656c73657d7d0a202020207b7b6966202e4e6f74657d7d3c7020636c6173733d226e6f7465223e7b7b2e4e6f74657d7d3c2f703e7b7b656e647d7d0a202020207b7b6966202e4572726f727d7d3c7020636c6173733d226572726f72223e7b7b2e4572726f727d7d3c2f703e7b7b656e647d7d0a0a202020203c666f726d206d6574686f643d22706f73742220616374696f6e3d227b7b2e416374696f6e7d7d22206175746f636f6d706c6574653d226f6e223e0a2020202020203c696e70757420747970653d2268696464656e22206e616d653d2263737266222076616c75653d227b7b2e4e6f6e63657d7d223e0a0a2020202020207b7b6966202e41736b4c6f67696e7d7d0a2020202020203c6c6162656c20666f723d226c6f67696e223ed09bd0bed0b3d0b8d0bd3c2f6c6162656c3e0a2020202020203c696e7075742069643d226c6f67696e22206e616d653d226c6f67696e2220747970653d227465787422206175746f636f6d706c6574653d22757365726e616d65220a202020202020202020202020206175746f6361706974616c697a653d226e6f6e6522207370656c6c636865636b3d2266616c736522206175746f666f6375732072657175697265643e0a2020202020207b7b656e647d7d0a0a2020202020207b7b6966202e41736b50617373776f72647d7d0a2020202020203c6c6162656c20666f723d2270617373776f7264223ed09fd0b0d180d0bed0bbd18c3c2f6c6162656c3e0a2020202020203c696e7075742069643d2270617373776f726422206e616d653d2270617373776f72642220747970653d2270617373776f7264220a202020202020202020202020206175746f636f6d706c6574653d2263757272656e742d70617373776f7264222072657175697265643e0a2020202020207b7b656e647d7d0a0a2020202020207b7b6966202e41736b436f64657d7d0a2020202020203c6c6162656c20666f723d22636f6465223ed09ad0bed0b43c2f6c6162656c3e0a2020202020203c696e7075742069643d22636f646522206e616d653d22636f64652220747970653d22746578742220696e7075746d6f64653d226e756d65726963220a202020202020202020202020206175746f636f6d706c6574653d226f6e652d74696d652d636f646522207370656c6c636865636b3d2266616c7365222072657175697265643e0a2020202020207b7b656e647d7d0a0a2020202020203c627574746f6e20747970653d227375626d6974223ed092d0bed0b9d182d0b83c2f627574746f6e3e0a202020203c2f666f726d3e0a20207b7b656e647d7d0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:34.237074+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('8f6e6e54-2341-4412-870c-bbbe0ec5ce87', 'suspicious.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed097d0b0d0bfd180d0bed18120d0bed182d0bad0bbd0bed0bdd191d0bd3c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20233861353330303b0a20202d2d746f6e652d62673a20236664663365323b0a20202d2d746f6e652d6c696e653a20236566646362383b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20236630626436613b0a202020202d2d746f6e652d62673a20233361326331373b0a202020202d2d746f6e652d6c696e653a20233561343532363b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a2057414620d0bdd0b520d0bfd180d0bed0bfd183d181d182d0b8d0bb20d0b7d0b0d0bfd180d0bed18120d0ba20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d18e223e3c7061746820636c6173733d22776972652220643d224d373420343248313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382034326c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652064696d2220643d224d32303220343248323230222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32343820343248323636222f3e3c636972636c6520636c6173733d226261646765222063783d22323334222063793d2234322220723d223131222f3e3c7061746820636c6173733d226d61726b2220643d224d3233302033386c3820384d3233382033386c2d382038222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2234303322202d2d3e3c2f703e0a20203c68313ed097d0b0d0bfd180d0bed18120d0bed182d0bad0bbd0bed0bdd191d0bd3c2f68313e0a20203c7020636c6173733d226c656164223ed097d0b0d0bfd180d0bed18120d0bfd0bed185d0bed0b620d0bdd0b020d0b0d182d0b0d0bad18320d0b820d0b4d0be20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d18f20d0bdd0b520d0b4d0bed188d191d0bb2e3c2f703e0a20203c64697620636c6173733d22776879223e0a3c212d2d2320696620657870723d22247761665f64656e795f73636f7065203d206e6574776f726b22202d2d3e0a20203c703ed097d0b0d0bad180d18bd182d0b020d181d0b5d182d18c203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20e2809420d0b220d0bdd0b5d19120d0b2d185d0bed0b4d0b8d18220d0b2d0b0d18820d0b0d0b4d180d0b5d1812e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d206164647265737322202d2d3e0a20203c703ed097d0b0d0bad180d18bd18220d0b0d0b4d180d0b5d181203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d20636f756e74727922202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d0b2d0b0d188d0b5d0b3d0be20d180d0b5d0b3d0b8d0bed0bdd0b020d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2061736e22202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d181d0b5d182d0b8203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2073657373696f6e22202d2d3e0a20203c703ed09ed0b3d180d0b0d0bdd0b8d187d0b5d0bdd0b8d0b520d0b4d0b5d0b9d181d182d0b2d183d0b5d18220d0bdd0b020d0b2d0b0d188d18320d181d0b5d181d181d0b8d18e2e3c2f703e0a3c212d2d2320656c7365202d2d3e0a20203c703ed09220d0b7d0b0d0bfd180d0bed181d0b520d0bdd0b0d188d0bbd0b8d181d18c20d0bfd180d0b8d0b7d0bdd0b0d0bad0b820d0b0d182d0b0d0bad0b82e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f726574727922202d2d3e0a20203c703ed09fd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed18120d0bcd0bed0b6d0bdd0be20d187d0b5d180d0b5d0b7203c623e3c212d2d23206563686f207661723d227761665f64656e795f7265747279222064656661756c743d2222202d2d3e3c2f623e20d1812e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed095d181d0bbd0b820d18dd182d0be20d0bed188d0b8d0b1d0bad0b02c20d0bed0b1d180d0b0d182d0b8d182d0b5d181d18c20d0b220d0bfd0bed0b4d0b4d0b5d180d0b6d0bad18320d0b820d183d0bad0b0d0b6d0b8d182d0b5204576656e742049442e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('95da0716-6811-487e-bacd-58678b8ece75', 'captcha_page.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227b7b2e4c616e677d7d223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e646578223e0a3c7469746c653e7b7b2e5469746c657d7d3c2f7469746c653e0a3c7374796c653e0a20203a726f6f74207b20636f6c6f722d736368656d653a206c69676874206461726b3b207d0a2020626f6479207b206d617267696e3a20303b20666f6e743a20313670782f312e352073797374656d2d75692c2073616e732d73657269663b20646973706c61793a20677269643b206d696e2d6865696768743a2031303076683b0a202020202020202020706c6163652d6974656d733a2063656e7465723b206261636b67726f756e643a2043616e7661733b20636f6c6f723a2043616e766173546578743b207d0a20206d61696e207b206d61782d77696474683a20323672656d3b2070616464696e673a203272656d3b207d0a20206831207b20666f6e742d73697a653a20312e323572656d3b206d617267696e3a20302030202e3572656d3b207d0a202070207b206d617267696e3a202e3572656d20303b207d0a20202e6e6f7465207b206f7061636974793a202e373b207d0a20202e6572726f72207b20636f6c6f723a20236234323331383b207d0a20202e776964676574207b206d617267696e3a20312e323572656d20303b207d0a20202e7769646765745b68696464656e5d207b20646973706c61793a206e6f6e653b207d0a2020696e7075745b747970653d746578745d207b20666f6e743a20696e68657269743b2070616464696e673a202e3572656d3b2077696474683a20313030253b20626f782d73697a696e673a20626f726465722d626f783b207d0a2020627574746f6e207b20666f6e743a20696e68657269743b2070616464696e673a202e3572656d203172656d3b206d617267696e2d746f703a202e373572656d3b207d0a20202e616c74207b20666f6e742d73697a653a202e38373572656d3b206f7061636974793a202e373b207d0a20202e636170746368612d696d67207b20646973706c61793a20626c6f636b3b206d61782d77696474683a20313030253b20626f726465722d7261646975733a203470783b206d617267696e3a202e3572656d20303b207d0a20202e657874207b206d696e2d6865696768743a20363670783b206d617267696e3a202e3572656d20303b207d0a202061207b20636f6c6f723a20696e68657269743b207d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c68313e7b7b2e5469746c657d7d3c2f68313e0a20207b7b6966202e4e6f74657d7d3c7020636c6173733d226e6f7465223e7b7b2e4e6f74657d7d3c2f703e7b7b656e647d7d0a20207b7b6966202e4572726f727d7d3c7020636c6173733d226572726f722220726f6c653d22616c657274223e7b7b2e4572726f727d7d3c2f703e7b7b656e647d7d0a0a20207b7b6966202e4e6f5469636b65747d7d0a202020203c703e3c6120687265663d227b7b2e52657475726e546f7d7d223ed092d0b5d180d0bdd183d182d18cd181d18f20d0bdd0b020d181d0b0d0b9d1823c2f613e3c2f703e0a20207b7b656c7365206966202e576964676574737d7d0a20203c666f726d206d6574686f643d22706f73742220616374696f6e3d227b7b2e416374696f6e7d7d222069643d22636170746368612220646174612d636f6c6c6563743d227b7b6966202e436f6c6c6563747d7d317b7b656e647d7d2220646174612d63616e7661733d227b7b6966202e43616e7661737d7d317b7b656e647d7d223e0a202020203c696e70757420747970653d2268696464656e22206e616d653d2263737266222076616c75653d227b7b2e4e6f6e63657d7d223e0a202020203c696e70757420747970653d2268696464656e22206e616d653d2270726f7669646572222069643d2270726f7669646572222076616c75653d22223e0a202020203c696e70757420747970653d2268696464656e22206e616d653d22616e73776572222069643d22616e73776572222076616c75653d22223e0a202020203c696e70757420747970653d2268696464656e22206e616d653d226670222069643d226670222076616c75653d22223e0a0a202020207b7b72616e6765202e576964676574737d7d0a202020203c64697620636c6173733d227769646765742220646174612d6b696e643d227b7b2e4b696e647d7d2220646174612d7072696d6172793d227b7b6966202e5072696d6172797d7d317b7b656e647d7d22207b7b6966206e6f74202e5072696d6172797d7d68696464656e7b7b656e647d7d3e0a2020202020203c73637269707420747970653d226170706c69636174696f6e2f6a736f6e2220636c6173733d226368616c6c656e6765223e7b7b2e446174617d7d3c2f7363726970743e0a2020202020207b7b6966206571202e4b696e642022696d616765227d7d0a20202020202020203c703ed092d0b2d0b5d0b4d0b8d182d0b520d181d0b8d0bcd0b2d0bed0bbd18b20d18120d0bad0b0d180d182d0b8d0bdd0bad0b83a3c2f703e0a20202020202020203c696d6720636c6173733d22636170746368612d696d672220616c743d22d0a1d0b8d0bcd0b2d0bed0bbd18b20d0b4d0bbd18f20d0b2d0b2d0bed0b4d0b022207372633d227b7b2e496d6167657d7d223e0a20202020202020203c7020636c6173733d22616c74223e3c6120687265663d22223ed094d180d183d0b3d0b0d18f20d0bad0b0d180d182d0b8d0bdd0bad0b03c2f613e7b7b6966202e417564696f7d7d20c2b7203c6120687265663d227b7b242e416374696f6e7d7d2f617564696f223ed09fd180d0bed181d0bbd183d188d0b0d182d18c3c2f613e7b7b656e647d7d3c2f703e0a20202020202020207b7b6966202e417564696f7d7d3c617564696f20636f6e74726f6c73207072656c6f61643d226e6f6e6522207372633d227b7b242e416374696f6e7d7d2f617564696f223e3c2f617564696f3e7b7b656e647d7d0a20202020202020203c696e70757420747970653d227465787422206e616d653d22616e737765725f696d61676522206175746f636f6d706c6574653d226f666622206175746f6361706974616c697a653d22636861726163746572732220696e7075746d6f64653d226c6174696e2220617269612d6c6162656c3d22d0a1d0b8d0bcd0b2d0bed0bbd18b20d18120d0bad0b0d180d182d0b8d0bdd0bad0b8223e0a20202020202020203c627574746f6e20747970653d227375626d6974223ed09fd180d0bed0b4d0bed0bbd0b6d0b8d182d18c3c2f627574746f6e3e0a2020202020207b7b656c73657d7d0a20202020202020203c64697620636c6173733d226578742220646174612d6578743d227b7b2e4b696e647d7d223e3c2f6469763e0a20202020202020203c7020636c6173733d22616c74206578742d77616974223ed097d0b0d0b3d180d183d0b6d0b0d0b5d0bc20d0bfd180d0bed0b2d0b5d180d0bad183e280a63c2f703e0a20202020202020203c6e6f7363726970743e3c7020636c6173733d226572726f72223ed094d0bbd18f20d18dd182d0bed0b920d0bfd180d0bed0b2d0b5d180d0bad0b820d0bdd183d0b6d0b5d0bd204a6176615363726970742e3c2f703e3c2f6e6f7363726970743e0a2020202020207b7b656e647d7d0a202020203c2f6469763e0a202020207b7b656e647d7d0a0a202020203c7020636c6173733d22616c74223e3c6120687265663d227b7b2e52657475726e546f7d7d223ed092d0b5d180d0bdd183d182d18cd181d18f20d0bdd0b020d181d0b0d0b9d1823c2f613e7b7b6966206774202e417474656d707420317d7d20c2b720d0bfd0bed0bfd18bd182d0bad0b0207b7b2e417474656d70747d7d7b7b656e647d7d3c2f703e0a20203c2f666f726d3e0a20203c736372697074207372633d227b7b2e53637269707455524c7d7d222064656665723e3c2f7363726970743e0a20207b7b656c73657d7d0a202020203c703e3c6120687265663d227b7b2e52657475726e546f7d7d223ed092d0b5d180d0bdd183d182d18cd181d18f20d0bdd0b020d181d0b0d0b9d1823c2f613e3c2f703e0a20207b7b656e647d7d0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:34.595918+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('9b12fbd9-8026-467e-805f-dc044a708477', 'blocked.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed094d0bed181d182d183d0bf20d0b7d0b0d0bad180d18bd1823c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20236233323631653b0a20202d2d746f6e652d62673a20236664656165613b0a20202d2d746f6e652d6c696e653a20236630636363633b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20236666396439353b0a202020202d2d746f6e652d62673a20233361316631663b0a202020202d2d746f6e652d6c696e653a20233561326232623b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a2057414620d0bdd0b520d0bfd180d0bed0bfd183d181d182d0b8d0bb20d0b7d0b0d0bfd180d0bed18120d0ba20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d18e223e3c7061746820636c6173733d22776972652220643d224d373420343248313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382034326c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652064696d2220643d224d32303220343248323230222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32343820343248323636222f3e3c636972636c6520636c6173733d226261646765222063783d22323334222063793d2234322220723d223131222f3e3c7061746820636c6173733d226d61726b2220643d224d3233302033386c3820384d3233382033386c2d382038222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2234303322202d2d3e3c2f703e0a20203c68313ed094d0bed181d182d183d0bf20d0b7d0b0d0bad180d18bd1823c2f68313e0a20203c7020636c6173733d226c656164223ed097d0b0d0bfd180d0bed18120d0bed182d0bad0bbd0bed0bdd191d0bd20d181d0b8d181d182d0b5d0bcd0bed0b920d0b7d0b0d189d0b8d182d18b20d0b820d0b4d0be20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d18f20d0bdd0b520d0b4d0bed188d191d0bb2e3c2f703e0a20203c64697620636c6173733d22776879223e0a3c212d2d2320696620657870723d22247761665f64656e795f73636f7065203d206e6574776f726b22202d2d3e0a20203c703ed097d0b0d0bad180d18bd182d0b020d181d0b5d182d18c203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20e2809420d0b220d0bdd0b5d19120d0b2d185d0bed0b4d0b8d18220d0b2d0b0d18820d0b0d0b4d180d0b5d1812e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d206164647265737322202d2d3e0a20203c703ed097d0b0d0bad180d18bd18220d0b0d0b4d180d0b5d181203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d20636f756e74727922202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d0b2d0b0d188d0b5d0b3d0be20d180d0b5d0b3d0b8d0bed0bdd0b020d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2061736e22202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d181d0b5d182d0b8203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2073657373696f6e22202d2d3e0a20203c703ed09ed0b3d180d0b0d0bdd0b8d187d0b5d0bdd0b8d0b520d0b4d0b5d0b9d181d182d0b2d183d0b5d18220d0bdd0b020d0b2d0b0d188d18320d181d0b5d181d181d0b8d18e2e3c2f703e0a3c212d2d2320656c7365202d2d3e0a20203c703ed094d0bed181d182d183d0bf20d0ba20d18dd182d0bed0bcd18320d180d0b5d181d183d180d181d18320d0b7d0b0d0bad180d18bd18220d0bdd0b0d181d182d180d0bed0b9d0bad0b0d0bcd0b820d0b1d0b5d0b7d0bed0bfd0b0d181d0bdd0bed181d182d0b82e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f726574727922202d2d3e0a20203c703ed09fd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed18120d0bcd0bed0b6d0bdd0be20d187d0b5d180d0b5d0b7203c623e3c212d2d23206563686f207661723d227761665f64656e795f7265747279222064656661756c743d2222202d2d3e3c2f623e20d1812e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed095d181d0bbd0b820d0b4d0bed181d182d183d0bf20d0b2d0b0d0bc20d0bdd183d0b6d0b5d0bd2c20d0bed0b1d180d0b0d182d0b8d182d0b5d181d18c20d0b220d0bfd0bed0b4d0b4d0b5d180d0b6d0bad18320d0b820d183d0bad0b0d0b6d0b8d182d0b5204576656e742049442e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('a98bd327-a6a9-439e-9cea-5347aa552be9', 'auth_forbidden.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed09dd0b5d0b4d0bed181d182d0b0d182d0bed187d0bdd0be20d0bfd180d0b0d0b23c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20233266366264383b0a20202d2d746f6e652d62673a20236561663066643b0a20202d2d746f6e652d6c696e653a20236339643866353b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20233866623466353b0a202020202d2d746f6e652d62673a20233164323733383b0a202020202d2d746f6e652d6c696e653a20233266343436383b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a2057414620d0b4d0b5d180d0b6d0b8d18220d0b7d0b0d0bfd180d0bed18120d0b1d0b5d0b720d0b4d0bed0bfd183d181d0bad0b0223e3c7061746820636c6173733d22776972652220643d224d373420343248313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382034326c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652064696d2220643d224d32303220343248323230222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32343820343248323636222f3e3c636972636c6520636c6173733d226261646765222063783d22323334222063793d2234322220723d223131222f3e3c7061746820636c6173733d226d61726b2220643d224d3233302e342034312e3468372e3276352e32682d372e327a222f3e3c7061746820636c6173733d226d61726b2220643d224d3233322034312e34762d322e32613220322030203020312034203076322e32222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2234303322202d2d3e3c2f703e0a20203c68313ed09dd0b5d0b4d0bed181d182d0b0d182d0bed187d0bdd0be20d0bfd180d0b0d0b23c2f68313e0a20203c7020636c6173733d226c656164223ed092d185d0bed0b420d0b2d18bd0bfd0bed0bbd0bdd0b5d0bd2c20d0bdd0be20d0bfd180d0b0d0b220d0bdd0b020d18dd182d0bed18220d180d0b0d0b7d0b4d0b5d0bb20d18320d0b2d0b0d188d0b5d0b920d183d187d191d182d0bdd0bed0b920d0b7d0b0d0bfd0b8d181d0b820d0bdd0b5d1822e3c2f703e0a20203c64697620636c6173733d22776879223e0a20203c703ed0a0d0b0d0b7d0b4d0b5d0bb20d0bed182d0bad180d18bd18220d183d187d0b0d181d182d0bdd0b8d0bad0b0d0bc20d0bed182d0b4d0b5d0bbd18cd0bdd0bed0b920d0b3d180d183d0bfd0bfd18b2e20d092d0b0d188d0b020d183d187d191d182d0bdd0b0d18f20d0b7d0b0d0bfd0b8d181d18c20d0b220d0bdd0b5d19120d0bdd0b520d0b2d185d0bed0b4d0b8d1822e3c2f703e0a20203c703ed094d0bed181d182d183d0bf20d0b2d18bd0b4d0b0d191d18220d0b0d0b4d0bcd0b8d0bdd0b8d181d182d180d0b0d182d0bed18020d180d0b5d181d183d180d181d0b02e3c2f703e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed095d181d0bbd0b820d0b4d0bed181d182d183d0bf20d0b2d0b0d0bc20d0bdd183d0b6d0b5d0bd2c20d0bed0b1d180d0b0d182d0b8d182d0b5d181d18c20d0ba20d0b0d0b4d0bcd0b8d0bdd0b8d181d182d180d0b0d182d0bed180d18320d180d0b5d181d183d180d181d0b020d0b820d183d0bad0b0d0b6d0b8d182d0b5204576656e742049442e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('c4b7fc66-d796-4e04-bff5-a928f07da623', 'panel_login.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d22656e223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653e7b7b2e5469746c657d7d3c2f7469746c653e0a3c6c696e6b2072656c3d2269636f6e2220747970653d22696d6167652f7376672b786d6c2220687265663d22646174613a696d6167652f7376672b786d6c2c25334373766720786d6c6e733d27687474703a2f2f7777772e77332e6f72672f323030302f737667272076696577426f783d27302030203634203634272533452533437374796c652533452e697b66696c6c3a2532333133323032637d2e617b7374726f6b653a2532333162356662387d406d656469612028707265666572732d636f6c6f722d736368656d653a6461726b297b2e697b66696c6c3a2532336436653266307d2e617b7374726f6b653a2532333661613866667d7d2533432f7374796c652533452533437061746820636c6173733d27692720643d274d32342e38362034342e30304831392e303356382e30304833342e35305133372e383020382e30302034302e313520392e33345134322e35302031302e36382034332e37332031332e31315134342e39372031352e35332034342e39372031382e38335134342e39372032322e30382034332e37332032342e35305134322e35302032362e39332034302e31352032382e33305133372e38302032392e36362033342e35302032392e36364832342e38365a4d32342e38362031332e31315632342e35364833342e31345133352e35382032342e35362033362e36342032342e30345133372e37302032332e35322033382e32372032322e35325133382e38332032312e35312033382e38332032302e30375631372e35395133382e38332031362e31302033382e32372031352e31325133372e37302031342e31342033362e36342031332e36325133352e35382031332e31312033342e31342031332e31315a272f2533452533437061746820636c6173733d27612720643d274d31392e30332035344834342e393727207374726f6b652d77696474683d2737272f2533452533432f737667253345223e0a3c212d2d204e6f204a61766153637269707420616e64206e6f2065787465726e616c2066696c65733a206120736372697074206f6e2074686973207061676520636f756c642072656164207468652070617373776f72642e202d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d67726f756e643a20236565663266363b0a20202d2d74696e743a20726762612832372c2039352c203138342c20302e3036293b0a20202d2d676c6f773a20726762612832372c2039352c203138342c20302e3133293b0a20202d2d646f743a20726762612832372c2039352c203138342c20302e3136293b0a20202d2d746578743a20233133323032633b0a20202d2d6d757465643a20233461356337303b0a20202d2d7072696d6172793a20233162356662383b0a20202d2d7072696d6172792d686f7665723a20233136346639623b0a20202d2d6f6e2d7072696d6172793a20236634663866663b0a20202d2d636172643a2072676261283235352c203235352c203235352c20302e3834293b0a20202d2d6c696e653a20726762612832372c2039352c203138342c20302e3136293b0a20202d2d6669656c643a20236666663b0a20202d2d6669656c642d6c696e653a20726762612831392c2033322c2034342c20302e32293b0a20202d2d6669656c642d686f7665723a20726762612831392c2033322c2034342c20302e34293b0a20202d2d72696e673a20726762612832372c2039352c203138342c20302e3232293b0a20202d2d6572726f723a20236336323834613b0a20202d2d6572726f722d62673a2072676261283139382c2034302c2037342c20302e3037293b0a20202d2d6572726f722d6c696e653a2072676261283139382c2034302c2037342c20302e3238293b0a20202d2d736861646f773a2030203170782032707820726762612831392c2033322c2034342c20302e3036292c203020313870782034387078202d3132707820726762612831392c2033322c2034342c20302e3232293b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d67726f756e643a20233037306231323b0a202020202d2d74696e743a2072676261283130362c203136382c203235352c20302e3035293b0a202020202d2d676c6f773a2072676261283130362c203136382c203235352c20302e3134293b0a202020202d2d646f743a2072676261283130362c203136382c203235352c20302e3134293b0a202020202d2d746578743a20236436653266303b0a202020202d2d6d757465643a20233834393661643b0a202020202d2d7072696d6172793a20233661613866663b0a202020202d2d7072696d6172792d686f7665723a20233866626566663b0a202020202d2d6f6e2d7072696d6172793a20233037313031383b0a202020202d2d636172643a20726762612831322c2031382c2032382c20302e38293b0a202020202d2d6c696e653a2072676261283130362c203136382c203235352c20302e3136293b0a202020202d2d6669656c643a207267626128372c2031312c2031382c20302e37293b0a202020202d2d6669656c642d6c696e653a2072676261283231342c203232362c203234302c20302e3136293b0a202020202d2d6669656c642d686f7665723a2072676261283231342c203232362c203234302c20302e3334293b0a202020202d2d72696e673a2072676261283130362c203136382c203235352c20302e33293b0a202020202d2d6572726f723a20236666356337613b0a202020202d2d6572726f722d62673a2072676261283235352c2039322c203132322c20302e3039293b0a202020202d2d6572726f722d6c696e653a2072676261283235352c2039322c203132322c20302e3332293b0a202020202d2d736861646f773a20302031707820327078207267626128302c20302c20302c20302e35292c203020323470782035367078202d31327078207267626128302c20302c20302c20302e37293b0a20207d0a20202e72696e6773202e6c2c202e72696e6773202e73207b207374726f6b652d6f7061636974793a20302e32363b207d0a20202e72696e6773202e66207b207374726f6b652d6f7061636974793a20302e31353b207d0a20202e72696e6773202e64207b207374726f6b652d6f7061636974793a20302e35353b207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a68746d6c207b206261636b67726f756e643a20766172282d2d67726f756e64293b207d0a626f6479207b0a20206d617267696e3a20303b0a2020666f6e743a20313570782f312e35202249424d20506c65782053616e73222c20225365676f65205549205661726961626c652054657874222c20225365676f65205549222c2073797374656d2d75692c202d6170706c652d73797374656d2c20526f626f746f2c2073616e732d73657269663b0a2020636f6c6f723a20766172282d2d74657874293b0a20206261636b67726f756e643a0a2020202072616469616c2d6772616469656e7428373630707820353230707820617420353025203436252c20766172282d2d676c6f77292c207472616e73706172656e7420373025292c0a202020206c696e6561722d6772616469656e74283138306465672c20766172282d2d74696e74292c207472616e73706172656e7420343225292c0a20202020766172282d2d67726f756e64293b0a20202d7765626b69742d666f6e742d736d6f6f7468696e673a20616e7469616c69617365643b0a7d0a2e67726964207b0a2020706f736974696f6e3a2066697865643b0a2020746f703a20303b0a202072696768743a20303b0a2020626f74746f6d3a20303b0a20206c6566743a20303b0a2020706f696e7465722d6576656e74733a206e6f6e653b0a20206261636b67726f756e642d696d6167653a2072616469616c2d6772616469656e7428636972636c652c20766172282d2d646f7429203170782c207472616e73706172656e7420312e367078293b0a20206261636b67726f756e642d73697a653a203234707820323470783b0a20206261636b67726f756e642d706f736974696f6e3a2063656e7465723b0a20202d7765626b69742d6d61736b2d696d6167653a2072616469616c2d6772616469656e7428656c6c69707365203538252035322520617420353025203530252c2023303030203235252c207472616e73706172656e742031303025293b0a20206d61736b2d696d6167653a2072616469616c2d6772616469656e7428656c6c69707365203538252035322520617420353025203530252c2023303030203235252c207472616e73706172656e742031303025293b0a7d0a2e72696e6773207b0a2020706f736974696f6e3a206162736f6c7574653b0a2020746f703a203530253b0a20206c6566743a203530253b0a202077696474683a203134303070783b0a20206865696768743a203134303070783b0a20206d617267696e3a202d373030707820302030202d37303070783b0a2020636f6c6f723a20766172282d2d7072696d617279293b0a2020706f696e7465722d6576656e74733a206e6f6e653b0a20202d7765626b69742d6d61736b2d696d6167653a2072616469616c2d6772616469656e7428636c6f736573742d736964652c2023303030203530252c207472616e73706172656e7420393725293b0a20206d61736b2d696d6167653a2072616469616c2d6772616469656e7428636c6f736573742d736964652c2023303030203530252c207472616e73706172656e7420393725293b0a7d0a2e72696e6773202a207b2066696c6c3a206e6f6e653b207374726f6b653a2063757272656e74436f6c6f723b207374726f6b652d77696474683a20313b207d0a2e72696e6773202e6c207b207374726f6b652d6f7061636974793a20302e323b207d0a2e72696e6773202e66207b207374726f6b652d6f7061636974793a20302e31313b207d0a2e72696e6773202e73207b207374726f6b652d6f7061636974793a20302e323b207374726f6b652d6461736861727261793a20352031313b207d0a2e72696e6773202e64207b207374726f6b652d6f7061636974793a20302e34353b207374726f6b652d77696474683a20322e343b207374726f6b652d6c696e656361703a20726f756e643b207d0a2e72696e6773202e61207b207374726f6b652d6f7061636974793a20302e383b207374726f6b652d77696474683a20322e353b207374726f6b652d6c696e656361703a20726f756e643b207d0a2e72696e6773202e68207b2066696c6c3a2063757272656e74436f6c6f723b2066696c6c2d6f7061636974793a20302e31323b207374726f6b653a206e6f6e653b207d0a2e72696e6773202e6e207b2066696c6c3a20766172282d2d67726f756e64293b207374726f6b652d77696474683a20323b207374726f6b652d6f7061636974793a20302e393b207d0a2e7368656c6c207b0a2020706f736974696f6e3a2072656c61746976653b0a20206f766572666c6f773a2068696464656e3b0a2020646973706c61793a20666c65783b0a2020666c65782d646972656374696f6e3a20636f6c756d6e3b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a20206761703a20333070783b0a20206d696e2d6865696768743a2031303076683b0a20206d696e2d6865696768743a203130306476683b0a202070616464696e673a203430707820313670783b0a7d0a2e6272616e64207b20646973706c61793a20626c6f636b3b2077696474683a2032373270783b206865696768743a206175746f3b207d0a2e6272616e64202e696e6b207b2066696c6c3a20766172282d2d74657874293b207d0a2e6272616e64202e737562207b2066696c6c3a20766172282d2d6d75746564293b207d0a2e6272616e64202e72756c65207b207374726f6b653a20766172282d2d74657874293b207374726f6b652d6f7061636974793a20302e32383b207374726f6b652d77696474683a20313b207d0a2e6272616e64202e616363656e74207b207374726f6b653a20766172282d2d7072696d617279293b207374726f6b652d77696474683a20373b207d0a2e7374616765207b20706f736974696f6e3a2072656c61746976653b2077696474683a20313030253b206d61782d77696474683a2033383470783b207d0a6d61696e207b0a2020706f736974696f6e3a2072656c61746976653b0a202070616464696e673a2033307078203330707820323870783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a2020626f782d736861646f773a20766172282d2d736861646f77293b0a20202d7765626b69742d6261636b64726f702d66696c7465723a20626c75722831347078293b0a20206261636b64726f702d66696c7465723a20626c75722831347078293b0a7d0a6831207b206d617267696e3a20303b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c696e652d6865696768743a20312e333b206c65747465722d73706163696e673a202d302e303135656d3b207d0a2e6e6f7465207b206d617267696e3a20367078203020303b20666f6e742d73697a653a20313470783b20636f6c6f723a20766172282d2d6d75746564293b207d0a666f726d207b206d617267696e3a2032327078203020303b207d0a6c6162656c207b20646973706c61793a20626c6f636b3b206d617267696e3a20302030203670783b20666f6e742d73697a653a20313370783b20666f6e742d7765696768743a203530303b20636f6c6f723a20766172282d2d6d75746564293b207d0a696e7075743a6e6f74285b747970653d2268696464656e225d29202b206c6162656c207b206d617267696e2d746f703a20313670783b207d0a696e707574207b0a2020646973706c61793a20626c6f636b3b0a202077696474683a20313030253b0a20206865696768743a20343270783b0a202070616464696e673a203020313270783b0a2020666f6e743a20696e68657269743b0a2020636f6c6f723a20766172282d2d74657874293b0a20206261636b67726f756e643a20766172282d2d6669656c64293b0a2020626f726465723a2031707820736f6c696420766172282d2d6669656c642d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a20206f75746c696e653a2032707820736f6c6964207472616e73706172656e743b0a20207472616e736974696f6e3a20626f726465722d636f6c6f7220302e3135732c20626f782d736861646f7720302e3135733b0a7d0a696e7075743a686f766572207b20626f726465722d636f6c6f723a20766172282d2d6669656c642d686f766572293b207d0a696e7075743a666f637573207b20626f726465722d636f6c6f723a20766172282d2d7072696d617279293b20626f782d736861646f773a2030203020302033707820766172282d2d72696e67293b207d0a696e7075743a2d7765626b69742d6175746f66696c6c207b0a20202d7765626b69742d746578742d66696c6c2d636f6c6f723a20766172282d2d74657874293b0a2020626f782d736861646f773a203020302030203430707820766172282d2d6669656c642920696e7365743b0a202063617265742d636f6c6f723a20766172282d2d74657874293b0a7d0a696e7075743a2d7765626b69742d6175746f66696c6c3a666f637573207b20626f782d736861646f773a203020302030203430707820766172282d2d6669656c642920696e7365742c2030203020302033707820766172282d2d72696e67293b207d0a2e627574746f6e207b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a20206761703a203870783b0a202077696474683a20313030253b0a20206865696768743a20343270783b0a20206d617267696e3a2032347078203020303b0a202070616464696e673a203020313670783b0a2020666f6e743a20696e68657269743b0a2020666f6e742d7765696768743a203630303b0a2020746578742d6465636f726174696f6e3a206e6f6e653b0a2020636f6c6f723a20766172282d2d6f6e2d7072696d617279293b0a20206261636b67726f756e643a20766172282d2d7072696d617279293b0a2020626f726465723a20303b0a2020626f726465722d7261646975733a203870783b0a20206f75746c696e653a2032707820736f6c6964207472616e73706172656e743b0a2020637572736f723a20706f696e7465723b0a20207472616e736974696f6e3a206261636b67726f756e642d636f6c6f7220302e3135732c20626f782d736861646f7720302e3135733b0a7d0a2e627574746f6e3a686f766572207b206261636b67726f756e643a20766172282d2d7072696d6172792d686f766572293b207d0a2e627574746f6e3a666f6375732d76697369626c65207b20626f782d736861646f773a2030203020302033707820766172282d2d72696e67293b207d0a2e627574746f6e3a616374697665207b207472616e73666f726d3a207472616e736c6174655928317078293b207d0a2e627574746f6e20737667207b2077696474683a20313670783b206865696768743a20313670783b2066696c6c3a206e6f6e653b207374726f6b653a2063757272656e74436f6c6f723b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e6572726f722c202e646f6e65207b0a2020646973706c61793a20666c65783b0a20206761703a20313070783b0a2020616c69676e2d6974656d733a20666c65782d73746172743b0a20206d617267696e3a2031387078203020303b0a2020666f6e742d73697a653a20313470783b0a20206c696e652d6865696768743a20312e34353b0a7d0a2e6572726f72207b0a202070616464696e673a203130707820313270783b0a2020636f6c6f723a20766172282d2d6572726f72293b0a20206261636b67726f756e643a20766172282d2d6572726f722d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d6572726f722d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a7d0a2e646f6e65207b20636f6c6f723a20766172282d2d6d75746564293b207d0a2e6572726f72207376672c202e646f6e6520737667207b0a2020666c65783a206e6f6e653b0a202077696474683a20313870783b0a20206865696768743a20313870783b0a20206d617267696e2d746f703a20303b0a202066696c6c3a206e6f6e653b0a20207374726f6b653a2063757272656e74436f6c6f723b0a20207374726f6b652d77696474683a20312e383b0a20207374726f6b652d6c696e656361703a20726f756e643b0a20207374726f6b652d6c696e656a6f696e3a20726f756e643b0a7d0a2e646f6e6520737667207b20636f6c6f723a20766172282d2d7072696d617279293b207d0a406d6564696120286d61782d77696474683a20343830707829207b0a20202e7368656c6c207b206761703a20323470783b2070616464696e673a203238707820313670783b207d0a20202e6272616e64207b2077696474683a2032323470783b207d0a20206d61696e207b2070616464696e673a2032347078203230707820323270783b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c64697620636c6173733d22677269642220617269612d68696464656e3d2274727565223e3c2f6469763e0a3c64697620636c6173733d227368656c6c223e0a20203c73766720636c6173733d226272616e64222076696577426f783d22302030203332322035382e32382220726f6c653d22696d672220617269612d6c6162656c3d22506c61636974756d204170706c69636174696f6e204669726577616c6c223e0a202020203c7061746820636c6173733d22696e6b2220643d224d342e38342032352e313448312e303056312e34314831312e32305131332e333820312e34312031342e393220322e32395131362e343720332e31382031372e323920342e37375131382e313020362e33372031382e313020382e35355131382e31302031302e36392031372e32392031322e32395131362e34372031332e38392031342e39322031342e37395131332e33382031352e36392031312e32302031352e363948342e38345a4d342e383420342e37375631322e33324831302e39365131312e39312031322e33322031322e36312031312e39385131332e33312031312e36342031332e36382031302e39385131342e30362031302e33322031342e303620392e333656372e37335131342e303620362e37352031332e363820362e31305131332e333120352e34352031322e363120352e31315131312e393120342e37372031302e393620342e37375a204d35382e34342032352e31344834342e393556312e34314834382e37395632312e37344835382e34345a204d3130332e37382032352e31344839392e37374c39372e37302031382e37314838382e38324c38362e37322032352e31344838322e38344c39302e393320312e34314839352e37335a4d39362e37352031352e34322039342e343020382e33382039332e333120342e39344839332e31344c39322e303520382e33384c38392e37312031352e34325a204d3133382e39392032352e3535513133352e39302032352e3535203133332e36352032342e3137513133312e34312032322e3739203133302e32322032302e3131513132392e30332031372e3432203132392e30332031332e3431513132392e303320392e3433203133302e323220362e3636513133312e343120332e3839203133332e363520322e3435513133352e393020312e3030203133382e393920312e3030513134322e303520312e3030203134342e313420322e3336513134362e323320332e3732203134372e343620362e33374c3134342e323320382e3134513134332e363220362e3434203134322e333420352e3434513134312e303720342e3433203133382e393920342e3433513133362e323420342e3433203133342e363720362e3334513133332e313120382e3234203133332e31312031312e35345631352e3138513133332e31312031382e3434203133342e36372032302e3238513133362e32342032322e3131203133382e39392032322e3131513134312e31302032322e3131203134322e34362032312e3031513134332e38322031392e3930203134342e34372031382e31374c3134372e35362032302e3034513134362e33372032322e3539203134342e32312032342e3037513134322e30352032352e3535203133382e39392032352e35355a204d3138332e35322032352e3134483137332e32355632322e3031483137362e343556342e3534483137332e323556312e3431483138332e353256342e3534483138302e32395632322e3031483138332e35325a204d3232362e383520342e3831483231392e37385632352e3134483231352e393456342e3831483230382e383756312e3431483232362e38355a204d3235332e303820312e3431483235362e38365631362e3033513235362e38362031382e3033203235372e33352031392e3339513235372e38342032302e3735203235382e39372032312e3433513236302e30392032322e3131203236312e39322032322e3131513236332e37392032322e3131203236342e39302032312e3433513236362e30302032302e3735203236362e35312031392e3339513236372e30322031382e3033203236372e30322031362e303356312e3431483237302e38305631352e3432513237302e38302031382e3838203236392e39332032312e3133513236392e30362032332e3337203236372e31312032342e3436513236352e31352032352e3535203236312e38392032352e3535513235382e36332032352e3535203235362e37302032342e3436513235342e37382032332e3337203235332e39332032312e3133513235332e30382031382e3838203235332e30382031352e34325a204d3239392e31342032352e313456312e3431483330332e36364c3330372e353720382e38324c3331302e30352031332e3438483331302e31354c3331322e363420382e38324c3331362e353520312e3431483332312e30305632352e3134483331372e33335631302e383956372e3035483331372e31394c3331352e32392031302e37394c3331302e30352032302e33314c3330342e38382031302e38334c3330322e393520362e3935483330322e38315631302e38395632352e31345a222f3e0a202020203c7061746820636c6173733d2272756c652220643d224d312033382e313448333231222f3e0a202020203c7061746820636c6173733d22616363656e742220643d224d312033382e31344832322e3332222f3e0a202020203c7061746820636c6173733d227375622220643d224d382e33392035372e313448362e39384c362e32342035342e383748332e31314c322e33372035372e313448312e30304c332e38362034382e373648352e35355a4d352e39312035332e373120352e30382035312e323220342e37302035302e303148342e36344c342e32352035312e32324c332e34322035332e37315a204d32302e35372035372e31344831392e32325634382e37364832322e38325132332e35392034382e37362032342e31332034392e30385132342e36382034392e33392032342e39372034392e39355132352e32352035302e35322032352e32352035312e32385132352e32352035322e30342032342e39372035322e36305132342e36382035332e31372032342e31332035332e34395132332e35392035332e38302032322e38322035332e38304832302e35375a4d32302e35372034392e39355635322e36324832322e37335132332e30372035322e36322032332e33322035322e35305132332e35362035322e33382032332e36392035322e31345132332e38332035312e39312032332e38332035312e35375635312e30305132332e38332035302e36352032332e36392035302e34325132332e35362035302e31392032332e33322035302e30375132332e30372034392e39352032322e37332034392e39355a204d33372e36332035372e31344833362e32375634382e37364833392e38375134302e36342034382e37362034312e31382034392e30385134312e37332034392e33392034322e30322034392e39355134322e33312035302e35322034322e33312035312e32385134322e33312035322e30342034322e30322035322e36305134312e37332035332e31372034312e31382035332e34395134302e36342035332e38302033392e38372035332e38304833372e36335a4d33372e36332034392e39355635322e36324833392e37395134302e31322035322e36322034302e33372035322e35305134302e36312035322e33382034302e37352035322e31345134302e38382035312e39312034302e38382035312e35375635312e30305134302e38382035302e36352034302e37352035302e34325134302e36312035302e31392034302e33372035302e30375134302e31322034392e39352033392e37392034392e39355a204d35382e30392035372e31344835332e33325634382e37364835342e36385635352e39344835382e30395a204d37322e32372035372e31344836382e36355635362e30344836392e37385634392e38374836382e36355634382e37364837322e32375634392e38374837312e31335635362e30344837322e32375a204d38362e36352035372e32385138352e35362035372e32382038342e37372035362e38305138332e39372035362e33312038332e35352035352e33365138332e31332035342e34322038332e31332035332e30305138332e31332035312e36302038332e35352035302e36325138332e39372034392e36342038342e37372034392e31335138352e35362034382e36322038362e36352034382e36325138372e37332034382e36322038382e34372034392e31305138392e32312034392e35382038392e36342035302e35324c38382e35302035312e31345138382e32382035302e35342038372e38332035302e31395138372e33382034392e38332038362e36352034392e38335138352e36382034392e38332038352e31332035302e35305138342e35372035312e31382038342e35372035322e33345635332e36325138342e35372035342e37382038352e31332035352e34325138352e36382035362e30372038362e36352035362e30375138372e33392035362e30372038372e38372035352e36385138382e33352035352e32392038382e35382035342e36384c38392e36372035352e33345138392e32352035362e32342038382e34392035362e37365138372e37332035372e32382038362e36352035372e32385a204d3130372e32372035372e3134483130352e38354c3130352e31322035342e3837483130312e39394c3130312e32342035372e31344839392e38374c3130322e37332034382e3736483130342e34325a4d3130342e37382035332e3731203130332e39352035312e3232203130332e35372035302e3031483130332e35314c3130332e31332035312e32324c3130322e33302035332e37315a204d3132332e37302034392e3936483132312e32305635372e3134483131392e38345634392e3936483131372e33355634382e3736483132332e37305a204d3133372e38312035372e3134483133342e31385635362e3034483133352e33315634392e3837483133342e31385634382e3736483133372e38315634392e3837483133362e36375635362e3034483133372e38315a204d3135322e32372035372e3238513135312e31382035372e3238203135302e33372035362e3739513134392e35362035362e3239203134392e31312035352e3332513134382e36372035342e3336203134382e36372035322e3935513134382e36372035312e3534203134392e31312035302e3538513134392e35362034392e3632203135302e33372034392e3132513135312e31382034382e3632203135322e32372034382e3632513135332e33372034382e3632203135342e31382034392e3132513135342e39392034392e3632203135352e34342035302e3538513135352e38382035312e3534203135352e38382035322e3935513135352e38382035342e3336203135352e34342035352e3332513135342e39392035362e3239203135342e31382035362e3739513135332e33372035372e3238203135322e32372035372e32385a4d3135322e32372035362e3037513135322e39332035362e3037203135332e34312035352e3737513135332e38392035352e3437203135342e31372035342e3932513135342e34342035342e3337203135342e34342035332e36315635322e3239513135342e34342035312e3532203135342e31372035302e3937513135332e38392035302e3432203135332e34312035302e3133513135322e39332034392e3833203135322e32372034392e3833513135312e36332034392e3833203135312e31342035302e3133513135302e36352035302e3432203135302e33382035302e3937513135302e31312035312e3532203135302e31312035322e32395635332e3631513135302e31312035342e3337203135302e33382035342e3932513135302e36352035352e3437203135312e31342035352e3737513135312e36332035362e3037203135322e32372035362e30375a204d3137322e30392035372e3134203136392e33362035322e3532203136382e34332035302e3733483136382e34305635322e35365635372e3134483136372e31305634382e3736483136382e36334c3137312e33352035332e33384c3137322e32372035352e3137483137322e33315635332e33355634382e3736483137332e36315635372e31345a204d3139382e39322035372e3134483139372e35365634382e3736483230322e37395634392e3936483139382e39325635322e3330483230322e33365635332e3530483139382e39325a204d3231372e31392035372e3134483231332e35375635362e3034483231342e37305634392e3837483231332e35375634382e3736483231372e31395634392e3837483231362e30355635362e3034483231372e31395a204d3232392e37382035332e37375635372e3134483232382e34335634382e3736483233322e3034513233322e37392034382e3736203233332e33332034392e3036513233332e38362034392e3336203233342e31362034392e3932513233342e34362035302e3438203233342e34362035312e3237513233342e34362035322e3135203233342e30352035322e3737513233332e36332035332e3338203233322e38342035332e36324c3233342e36342035372e3134483233332e31334c3233312e34362035332e37375a4d3232392e37382035322e3632483233312e3934513233322e32382035322e3632203233322e35322035322e3530513233322e37372035322e3338203233322e39302035322e3134513233332e30332035312e3931203233332e30332035312e35375635312e3030513233332e30332035302e3635203233322e39302035302e3432513233322e37372035302e3139203233322e35322035302e3037513233322e32382034392e3935203233312e39342034392e3935483232392e37385a204d3235312e31382035372e3134483234352e38325634382e3736483235312e31385634392e3936483234372e31375635322e3330483235302e38315635332e3530483234372e31375635352e3934483235312e31385a204d3236352e32322035372e3134483236332e37304c3236312e37322034382e3736483236332e31304c3236332e39352035322e38304c3236342e35342035352e3538483236342e35374c3236352e32342035322e38304c3236362e32342034382e3736483236372e37354c3236382e37342035322e38304c3236392e34302035352e3537483236392e34334c3237302e30342035322e38304c3237302e39322034382e3736483237322e32354c3237302e31392035372e3134483236382e36364c3236372e36302035322e38314c3236362e39372035302e3236483236362e39354c3236362e33312035322e38315a204d3238392e37332035372e3134483238382e33314c3238372e35382035342e3837483238342e34354c3238332e37302035372e3134483238322e33334c3238352e31392034382e3736483238362e38385a4d3238372e32342035332e3731203238362e34312035312e3232203238362e30332035302e3031483238352e39374c3238352e35392035312e32324c3238342e37362035332e37315a204d3330352e33312035372e3134483330302e35355634382e3736483330312e39315635352e3934483330352e33315a204d3332312e30302035372e3134483331362e32345634382e3736483331372e35395635352e3934483332312e30305a222f3e0a20203c2f7376673e0a20203c64697620636c6173733d227374616765223e0a20203c73766720636c6173733d2272696e67732220617269612d68696464656e3d2274727565222076696577426f783d2230203020313430302031343030223e3c636972636c6520636c6173733d2264222063783d22373030222063793d223730302220723d2233333022207374726f6b652d6461736861727261793d22302031312e393835222f3e3c636972636c6520636c6173733d226c222063783d22373030222063793d223730302220723d22343330222f3e3c636972636c6520636c6173733d2273222063783d22373030222063793d223730302220723d22353430222f3e3c636972636c6520636c6173733d2266222063783d22373030222063793d223730302220723d22363630222f3e3c7061746820636c6173733d22612220643d224d3930312e39203332302e33413433302034333020302030203120313034372e39203434372e33222f3e3c7061746820636c6173733d22612220643d224d3339302e37203939382e374134333020343330203020302031203334332e35203934302e35222f3e3c7061746820636c6173733d22612220643d224d37392e38203437342e334136363020363630203020302031203135322e38203333302e39222f3e3c636972636c6520636c6173733d2268222063783d22313034372e39222063793d223434372e332220723d223133222f3e3c636972636c6520636c6173733d226e222063783d22313034372e39222063793d223434372e332220723d22342e35222f3e3c636972636c6520636c6173733d2268222063783d223339302e37222063793d223939382e372220723d223133222f3e3c636972636c6520636c6173733d226e222063783d223339302e37222063793d223939382e372220723d22342e35222f3e3c636972636c6520636c6173733d2268222063783d223135322e38222063793d223333302e392220723d223133222f3e3c636972636c6520636c6173733d226e222063783d223135322e38222063793d223333302e392220723d22342e35222f3e3c636972636c6520636c6173733d2268222063783d22313135372e39222063793d223938362e322220723d223133222f3e3c636972636c6520636c6173733d226e222063783d22313135372e39222063793d223938362e322220723d22342e35222f3e3c2f7376673e0a20203c6d61696e3e0a202020203c68313e7b7b2e5469746c657d7d3c2f68313e0a0a202020207b7b6966202e446f6e657d7d0a2020202020203c7020636c6173733d22646f6e65223e3c7376672076696577426f783d223020302032302032302220617269612d68696464656e3d2274727565223e3c636972636c652063783d223130222063793d2231302220723d2238222f3e3c7061746820643d224d362e352031302e326c322e3420322e3320342e362d342e39222f3e3c2f7376673e3c7370616e3e7b7b2e446f6e65546578747d7d3c2f7370616e3e3c2f703e0a2020202020203c6120636c6173733d22627574746f6e2220687265663d227b7b2e4c6f67696e5552497d7d223e5369676e20696e20616761696e3c2f613e0a202020207b7b656c73657d7d0a2020202020207b7b6966202e4e6f74657d7d3c7020636c6173733d226e6f7465223e7b7b2e4e6f74657d7d3c2f703e7b7b656e647d7d0a2020202020207b7b6966202e4572726f727d7d3c7020636c6173733d226572726f722220726f6c653d22616c657274223e3c7376672076696577426f783d223020302032302032302220617269612d68696464656e3d2274727565223e3c636972636c652063783d223130222063793d2231302220723d2238222f3e3c7061746820643d224d3130203676342e364d31302031332e36762e3031222f3e3c2f7376673e3c7370616e3e7b7b2e4572726f727d7d3c2f7370616e3e3c2f703e7b7b656e647d7d0a0a2020202020203c666f726d206d6574686f643d22706f73742220616374696f6e3d227b7b2e416374696f6e7d7d22206175746f636f6d706c6574653d226f6e223e0a20202020202020203c696e70757420747970653d2268696464656e22206e616d653d2263737266222076616c75653d227b7b2e4e6f6e63657d7d223e0a0a20202020202020207b7b6966202e41736b4c6f67696e7d7d0a20202020202020203c6c6162656c20666f723d226c6f67696e223e557365726e616d653c2f6c6162656c3e0a20202020202020203c696e7075742069643d226c6f67696e22206e616d653d226c6f67696e2220747970653d227465787422206175746f636f6d706c6574653d22757365726e616d65220a2020202020202020202020202020206175746f6361706974616c697a653d226e6f6e6522207370656c6c636865636b3d2266616c736522206175746f666f6375732072657175697265643e0a20202020202020207b7b656e647d7d0a0a20202020202020207b7b6966202e41736b50617373776f72647d7d0a20202020202020203c6c6162656c20666f723d2270617373776f7264223e50617373776f72643c2f6c6162656c3e0a20202020202020203c696e7075742069643d2270617373776f726422206e616d653d2270617373776f72642220747970653d2270617373776f7264220a2020202020202020202020202020206175746f636f6d706c6574653d2263757272656e742d70617373776f726422207b7b6966206e6f74202e41736b4c6f67696e7d7d6175746f666f637573207b7b656e647d7d72657175697265643e0a20202020202020207b7b656e647d7d0a0a20202020202020207b7b6966202e41736b436f64657d7d0a20202020202020203c6c6162656c20666f723d22636f6465223e436f64653c2f6c6162656c3e0a20202020202020203c696e7075742069643d22636f646522206e616d653d22636f64652220747970653d22746578742220696e7075746d6f64653d226e756d65726963220a2020202020202020202020202020206175746f636f6d706c6574653d226f6e652d74696d652d636f646522207370656c6c636865636b3d2266616c736522207b7b6966206e6f7420286f72202e41736b4c6f67696e202e41736b50617373776f7264297d7d6175746f666f637573207b7b656e647d7d72657175697265643e0a20202020202020207b7b656e647d7d0a0a20202020202020203c627574746f6e20636c6173733d22627574746f6e2220747970653d227375626d6974223e5369676e20696e3c7376672076696577426f783d223020302031362031362220617269612d68696464656e3d2274727565223e3c7061746820643d224d33203868392e354d382e3520346c3420342d342034222f3e3c2f7376673e3c2f627574746f6e3e0a2020202020203c2f666f726d3e0a202020207b7b656e647d7d0a20203c2f6d61696e3e0a20203c2f6469763e0a3c2f6469763e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-17 12:00:00+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('c653ae7e-2305-4fa3-8f3d-78cb4e3c451a', 'too_many.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed0a1d0bbd0b8d188d0bad0bed0bc20d0bcd0bdd0bed0b3d0be20d0b7d0b0d0bfd180d0bed181d0bed0b23c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20233861353330303b0a20202d2d746f6e652d62673a20236664663365323b0a20202d2d746f6e652d6c696e653a20236566646362383b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20236630626436613b0a202020202d2d746f6e652d62673a20233361326331373b0a202020202d2d746f6e652d6c696e653a20233561343532363b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a2057414620d0bfd180d0b8d0b4d0b5d180d0b6d0b0d0bb20d0bfd0bed182d0bed0ba20d0b7d0b0d0bfd180d0bed181d0bed0b2223e3c7061746820636c6173733d22776972652220643d224d373820333048313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382033306c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652220643d224d373420343248313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382034326c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652220643d224d373820353448313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382035346c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652064696d2220643d224d32303220343248323230222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32343820343248323636222f3e3c636972636c6520636c6173733d226261646765222063783d22323334222063793d2234322220723d223131222f3e3c7061746820636c6173733d226d61726b2220643d224d3233312e342033372e3676382e384d3233362e362033372e3676382e38222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2234323922202d2d3e3c2f703e0a20203c68313ed0a1d0bbd0b8d188d0bad0bed0bc20d0bcd0bdd0bed0b3d0be20d0b7d0b0d0bfd180d0bed181d0bed0b23c2f68313e0a20203c7020636c6173733d226c656164223ed0a120d0b2d0b0d188d0b5d0b3d0be20d0b0d0b4d180d0b5d181d0b020d0bfd180d0b8d185d0bed0b4d0b8d18220d0b1d0bed0bbd18cd188d0b520d0b7d0b0d0bfd180d0bed181d0bed0b22c20d187d0b5d0bc20d180d0b0d0b7d180d0b5d188d0b5d0bdd0be2e3c2f703e0a20203c64697620636c6173733d22776879223e0a3c212d2d2320696620657870723d22247761665f64656e795f73636f7065203d206e6574776f726b22202d2d3e0a20203c703ed097d0b0d0bad180d18bd182d0b020d181d0b5d182d18c203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20e2809420d0b220d0bdd0b5d19120d0b2d185d0bed0b4d0b8d18220d0b2d0b0d18820d0b0d0b4d180d0b5d1812e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d206164647265737322202d2d3e0a20203c703ed097d0b0d0bad180d18bd18220d0b0d0b4d180d0b5d181203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d20636f756e74727922202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d0b2d0b0d188d0b5d0b3d0be20d180d0b5d0b3d0b8d0bed0bdd0b020d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2061736e22202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d181d0b5d182d0b8203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2073657373696f6e22202d2d3e0a20203c703ed09ed0b3d180d0b0d0bdd0b8d187d0b5d0bdd0b8d0b520d0b4d0b5d0b9d181d182d0b2d183d0b5d18220d0bdd0b020d0b2d0b0d188d18320d181d0b5d181d181d0b8d18e2e3c2f703e0a3c212d2d2320656c7365202d2d3e0a20203c703ed09fd180d0b5d0b2d18bd188d0b5d0bdd0b020d0b4d0bed0bfd183d181d182d0b8d0bcd0b0d18f20d187d0b0d181d182d0bed182d0b020d0b7d0b0d0bfd180d0bed181d0bed0b22e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f726574727922202d2d3e0a20203c703ed09fd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed18120d0bcd0bed0b6d0bdd0be20d187d0b5d180d0b5d0b7203c623e3c212d2d23206563686f207661723d227761665f64656e795f7265747279222064656661756c743d2222202d2d3e3c2f623e20d1812e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed09fd0bed0b4d0bed0b6d0b4d0b8d182d0b520d0b820d0bfd0bed0b2d182d0bed180d0b8d182d0b520d0bfd0bed0bfd18bd182d0bad1832e20d090d0b2d182d0bed0bcd0b0d182d0b8d187d0b5d181d0bad0b8d0bc20d0bad0bbd0b8d0b5d0bdd182d0b0d0bc20d181d182d0bed0b8d18220d181d0bdd0b8d0b7d0b8d182d18c20d187d0b0d181d182d0bed182d18320d0b7d0b0d0bfd180d0bed181d0bed0b22e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;
INSERT INTO public.dataset_contents (dataset_id, name, body, updated_at) VALUES ('ff9aa17e-6a68-43fb-a36a-6da99f455e90', 'captcha_required.html', '\x3c21646f63747970652068746d6c3e0a3c68746d6c206c616e673d227275223e0a3c686561643e0a3c6d65746120636861727365743d227574662d38223e0a3c6d657461206e616d653d2276696577706f72742220636f6e74656e743d2277696474683d6465766963652d77696474682c20696e697469616c2d7363616c653d31223e0a3c6d657461206e616d653d22726f626f74732220636f6e74656e743d226e6f696e6465782c206e6f666f6c6c6f77223e0a3c7469746c653ed09fd0bed0b4d182d0b2d0b5d180d0b4d0b8d182d0b52c20d187d182d0be20d0b2d18b20d187d0b5d0bbd0bed0b2d0b5d0ba3c2f7469746c653e0a3c212d2d0a2020d0a1d182d0b0d0bdd0b4d0b0d180d182d0bdd0b0d18f20d181d182d180d0b0d0bdd0b8d186d0b020d0bed182d0bad0b0d0b7d0b020d0bad0bed0bdd182d183d180d0b02028646f63732f64656e792d70616765732e6d64293a20d187d0b8d181d182d18bd0b92048544d4c352c0a2020d181d182d0b8d0bbd18c20d0b2d0bdd183d182d180d0b82c20d0bdd0b820d0bed0b4d0bdd0bed0b920d0b2d0bdd0b5d188d0bdd0b5d0b920d0b7d0b0d0b2d0b8d181d0b8d0bcd0bed181d182d0b820d0b820d0bdd0b820d0bed0b4d0bdd0bed0b920d181d182d180d0bed0bad0b8204a532e20d0a1d182d180d0b0d0bdd0b8d186d0b00a2020d181d182d0bed0b8d18220d0bfd0b5d180d0b5d0b420d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b5d0bc2c20d0b820d0b7d0b0d0b3d180d183d0b6d0b0d182d18c20d18120d0bdd0b5d19120d187d182d0be2dd0bbd0b8d0b1d0be20d0bed0b7d0bdd0b0d187d0b0d0bbd0be20d0b1d18b20d0b2d0b5d181d182d0b80a2020d0b7d0b0d0b1d0bbd0bed0bad0b8d180d0bed0b2d0b0d0bdd0bdd0bed0b3d0be20d0bad0bbd0b8d0b5d0bdd182d0b020d0b5d189d19120d0bad183d0b4d0b02dd182d0be2e0a0a2020d097d0bdd0b0d187d0b5d0bdd0b8d18f20d0bfd0bed0b4d181d182d0b0d0b2d0bbd18fd0b5d1822053534920d0b8d0b720d0bfd0b5d180d0b5d0bcd0b5d0bdd0bdd18bd18520d0bcd0bed0b4d183d0bbd18f2e20d091d0b5d0b720737369206f6e20d184d0b0d0b9d0bb20d0bed181d182d0b0d191d182d181d18f0a2020d0b2d0b0d0bbd0b8d0b4d0bdd18bd0bc2048544d4c3a20d0b4d0b8d180d0b5d0bad182d0b8d0b2d18b202d2d20d0bed0b1d18bd187d0bdd18bd0b520d0bad0bed0bcd0bcd0b5d0bdd182d0b0d180d0b8d0b82e0a2d2d3e0a3c7374796c653e0a3a726f6f74207b0a2020636f6c6f722d736368656d653a206c69676874206461726b3b0a20202d2d62673a20236634663566373b0a20202d2d636172643a20236666663b0a20202d2d6c696e653a20236532653465383b0a20202d2d736f66743a20236637663866613b0a20202d2d746578743a20233163316532313b0a20202d2d6d757465643a20233631363536633b0a20202d2d746f6e653a20233266366264383b0a20202d2d746f6e652d62673a20236561663066643b0a20202d2d746f6e652d6c696e653a20236339643866353b0a7d0a406d656469612028707265666572732d636f6c6f722d736368656d653a206461726b29207b0a20203a726f6f74207b0a202020202d2d62673a20233136313831633b0a202020202d2d636172643a20233165323132363b0a202020202d2d6c696e653a20233263333033373b0a202020202d2d736f66743a20233232323632633b0a202020202d2d746578743a20236536653865623b0a202020202d2d6d757465643a20233961613061383b0a202020202d2d746f6e653a20233866623466353b0a202020202d2d746f6e652d62673a20233164323733383b0a202020202d2d746f6e652d6c696e653a20233266343436383b0a20207d0a7d0a2a207b20626f782d73697a696e673a20626f726465722d626f783b207d0a626f6479207b0a20206d617267696e3a20303b0a20206d696e2d6865696768743a2031303076683b0a2020646973706c61793a20666c65783b0a2020616c69676e2d6974656d733a2063656e7465723b0a20206a7573746966792d636f6e74656e743a2063656e7465723b0a202070616464696e673a20323470783b0a2020666f6e743a20313570782f312e35352073797374656d2d75692c202d6170706c652d73797374656d2c20225365676f65205549222c20526f626f746f2c2073616e732d73657269663b0a20206261636b67726f756e643a20766172282d2d6267293b0a2020636f6c6f723a20766172282d2d74657874293b0a7d0a6d61696e207b0a202077696474683a20313030253b0a20206d61782d77696474683a2035363070783b0a20206261636b67726f756e643a20766172282d2d63617264293b0a2020626f726465723a2031707820736f6c696420766172282d2d6c696e65293b0a2020626f726465722d7261646975733a20313270783b0a202070616464696e673a2033307078203238707820323470783b0a7d0a2e666c6f77207b20646973706c61793a20626c6f636b3b2077696474683a20313030253b206d61782d77696474683a2033343070783b206d617267696e3a2030206175746f20323070783b207d0a2e666c6f77202e626f78207b2066696c6c3a20766172282d2d736f6674293b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20312e353b207d0a2e666c6f77202e626f782e686f74207b2066696c6c3a20766172282d2d746f6e652d6267293b207374726f6b653a20766172282d2d746f6e652d6c696e65293b207d0a2e666c6f77202e626f782e6f6666207b2066696c6c3a206e6f6e653b207374726f6b652d6461736861727261793a203420343b207d0a2e666c6f77202e69636f207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6d75746564293b207374726f6b652d77696474683a20312e383b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e69636f2e686f74207b207374726f6b653a20766172282d2d746f6e65293b207d0a2e666c6f77202e69636f2e6f6666207b207374726f6b653a20766172282d2d6c696e65293b207d0a2e666c6f77202e77697265207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d6c696e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e776972652e64617368207b207374726f6b652d6461736861727261793a203520343b207d0a2e666c6f77202e68656164207b2066696c6c3a20766172282d2d6c696e65293b207374726f6b653a206e6f6e653b207d0a2e666c6f77202e6261646765207b2066696c6c3a20766172282d2d63617264293b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207d0a2e666c6f77202e6d61726b207b2066696c6c3a206e6f6e653b207374726f6b653a20766172282d2d746f6e65293b207374726f6b652d77696474683a20323b207374726f6b652d6c696e656361703a20726f756e643b207374726f6b652d6c696e656a6f696e3a20726f756e643b207d0a2e666c6f77202e636170207b2066696c6c3a20766172282d2d6d75746564293b20666f6e742d73697a653a20313170783b20666f6e742d7765696768743a203530303b20746578742d616e63686f723a206d6964646c653b207d0a2e737461747573207b0a2020646973706c61793a20696e6c696e652d626c6f636b3b0a20206d617267696e3a2030203020313070783b0a202070616464696e673a20327078203970783b0a2020666f6e742d73697a653a20313270783b0a2020666f6e742d7765696768743a203630303b0a20206c65747465722d73706163696e673a202e3034656d3b0a2020636f6c6f723a20766172282d2d746f6e65293b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a20323070783b0a7d0a6831207b206d617267696e3a20302030203870783b20666f6e742d73697a653a20323070783b20666f6e742d7765696768743a203630303b206c65747465722d73706163696e673a202d2e3031656d3b207d0a2e6c656164207b206d617267696e3a20303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313470783b207d0a2e776879207b0a20206d617267696e3a2031387078203020303b0a202070616464696e673a203132707820313470783b0a20206261636b67726f756e643a20766172282d2d746f6e652d6267293b0a2020626f726465723a2031707820736f6c696420766172282d2d746f6e652d6c696e65293b0a2020626f726465722d7261646975733a203870783b0a2020666f6e742d73697a653a20313470783b0a7d0a2e7768792070207b206d617267696e3a20303b207d0a2e7768792070202b2070207b206d617267696e2d746f703a203670783b207d0a2e776879202e6d6f6e6f207b20636f6c6f723a20766172282d2d746f6e65293b207d0a2e6d657461207b206d617267696e3a2031387078203020303b2070616464696e673a20303b20626f726465722d746f703a2031707820736f6c696420766172282d2d6c696e65293b207d0a2e6d65746120646976207b0a2020646973706c61793a20666c65783b0a20206761703a20313270783b0a2020616c69676e2d6974656d733a20626173656c696e653b0a20206a7573746966792d636f6e74656e743a2073706163652d6265747765656e3b0a202070616464696e673a2038707820303b0a2020626f726465722d626f74746f6d3a2031707820736f6c696420766172282d2d6c696e65293b0a7d0a2e6d657461206474207b20666c65783a206e6f6e653b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313270783b20746578742d7472616e73666f726d3a207570706572636173653b206c65747465722d73706163696e673a202e3035656d3b207d0a2e6d657461206464207b206d617267696e3a20303b20746578742d616c69676e3a2072696768743b20666f6e742d73697a653a20313370783b206f766572666c6f772d777261703a20616e7977686572653b207d0a2e6d6f6e6f207b20666f6e742d66616d696c793a2075692d6d6f6e6f73706163652c2053464d6f6e6f2d526567756c61722c204d656e6c6f2c20436f6e736f6c61732c206d6f6e6f73706163653b207d0a2e666f6f74207b206d617267696e3a2031367078203020303b20636f6c6f723a20766172282d2d6d75746564293b20666f6e742d73697a653a20313370783b207d0a61207b20636f6c6f723a20766172282d2d746f6e65293b207d0a406d6564696120286d61782d77696474683a20343230707829207b0a20206d61696e207b2070616464696e673a2032327078203138707820313870783b207d0a20202e6d65746120646976207b20666c65782d646972656374696f6e3a20636f6c756d6e3b206761703a203270783b207d0a20202e6d657461206464207b20746578742d616c69676e3a206c6566743b207d0a7d0a3c2f7374796c653e0a3c2f686561643e0a3c626f64793e0a3c6d61696e3e0a20203c73766720636c6173733d22666c6f77222076696577426f783d2230203020333430203130302220726f6c653d22696d672220617269612d6c6162656c3d22d09ad0bbd0b8d0b5d0bdd1822c205741462c20d0bfd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53a2057414620d0b4d0b5d180d0b6d0b8d18220d0b7d0b0d0bfd180d0bed18120d0b4d0be20d0bfd180d0bed0b2d0b5d180d0bad0b8223e3c7061746820636c6173733d22776972652220643d224d373420343248313331222f3e3c7061746820636c6173733d22686561642220643d224d3133382034326c2d382d342e3576397a222f3e3c7061746820636c6173733d22776972652064696d2220643d224d32303220343248323230222f3e3c7061746820636c6173733d22776972652064696d20646173682220643d224d32343820343248323636222f3e3c636972636c6520636c6173733d226261646765222063783d22323334222063793d2234322220723d223131222f3e3c7061746820636c6173733d226d61726b2220643d224d3233302e342034312e3468372e3276352e32682d372e327a222f3e3c7061746820636c6173733d226d61726b2220643d224d3233322034312e34762d322e32613220322030203020312034203076322e32222f3e3c7265637420636c6173733d22626f782220783d2231342220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f22207472616e73666f726d3d227472616e736c61746528343220343229223e3c7265637420783d222d31312220793d222d3130222077696474683d22323222206865696768743d223135222072783d22322e35222f3e3c7061746820643d224d2d3620396831324d3020357634222f3e3c2f673e3c7465787420636c6173733d226361702220783d2234322220793d223838223ed09ad0bbd0b8d0b5d0bdd1823c2f746578743e3c7265637420636c6173733d22626f7820686f742220783d223134322220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f20686f7422207472616e73666f726d3d227472616e736c6174652831373020343229223e3c7061746820643d224d302d31322031302e352d372e36562d31633020352e342d342e3420392e332d31302e352031312e35432d362e3120382e332d31302e3520342e342d31302e352d31762d362e367a222f3e3c2f673e3c7465787420636c6173733d226361702220783d223137302220793d223838223e5741463c2f746578743e3c7265637420636c6173733d22626f78206f66662220783d223237302220793d223134222077696474683d22353622206865696768743d223536222072783d223135222f3e3c6720636c6173733d2269636f206f666622207472616e73666f726d3d227472616e736c6174652832393820343229223e3c7265637420783d222d31302e352220793d222d3130222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7265637420783d222d31302e352220793d22312e34222077696474683d22323122206865696768743d22382e36222072783d2232222f3e3c7061746820643d224d2d362d352e37682e30314d2d3620352e37682e3031222f3e3c2f673e3c7465787420636c6173733d226361702220783d223239382220793d223838223ed09fd180d0b8d0bbd0bed0b6d0b5d0bdd0b8d0b53c2f746578743e3c2f7376673e0a20203c7020636c6173733d22737461747573223e48545450203c212d2d23206563686f207661723d227761665f64656e795f737461747573222064656661756c743d2234303322202d2d3e3c2f703e0a20203c68313ed09fd0bed0b4d182d0b2d0b5d180d0b4d0b8d182d0b52c20d187d182d0be20d0b2d18b20d187d0b5d0bbd0bed0b2d0b5d0ba3c2f68313e0a20203c7020636c6173733d226c656164223ed09fd180d0b5d0b6d0b4d0b520d187d0b5d0bc20d0bed182d0bad180d18bd182d18c20d180d0b5d181d183d180d1812c20d0bdd183d0b6d0bdd0be20d0bfd180d0bed0b9d182d0b820d0bfd180d0bed0b2d0b5d180d0bad1832e3c2f703e0a20203c64697620636c6173733d22776879223e0a3c212d2d2320696620657870723d22247761665f64656e795f73636f7065203d206e6574776f726b22202d2d3e0a20203c703ed097d0b0d0bad180d18bd182d0b020d181d0b5d182d18c203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20e2809420d0b220d0bdd0b5d19120d0b2d185d0bed0b4d0b8d18220d0b2d0b0d18820d0b0d0b4d180d0b5d1812e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d206164647265737322202d2d3e0a20203c703ed097d0b0d0bad180d18bd18220d0b0d0b4d180d0b5d181203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d20636f756e74727922202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d0b2d0b0d188d0b5d0b3d0be20d180d0b5d0b3d0b8d0bed0bdd0b020d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2061736e22202d2d3e0a20203c703ed097d0b0d0bfd180d0bed181d18b20d0b8d0b720d181d0b5d182d0b8203c6220636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f7375626a656374222064656661756c743d2222202d2d3e3c2f623e20d0bdd0b520d0bfd180d0b8d0bdd0b8d0bcd0b0d18ed182d181d18f2e3c2f703e0a3c212d2d2320656c696620657870723d22247761665f64656e795f73636f7065203d2073657373696f6e22202d2d3e0a20203c703ed09ed0b3d180d0b0d0bdd0b8d187d0b5d0bdd0b8d0b520d0b4d0b5d0b9d181d182d0b2d183d0b5d18220d0bdd0b020d0b2d0b0d188d18320d181d0b5d181d181d0b8d18e2e3c2f703e0a3c212d2d2320656c7365202d2d3e0a20203c703ed09fd180d0bed0b2d0b5d180d0bad0b020d0bdd0b520d0bfd180d0bed0b9d0b4d0b5d0bdd0b020d0b8d0bbd0b820d0b5d19120d180d0b5d0b7d183d0bbd18cd182d0b0d18220d183d181d182d0b0d180d0b5d0bb2e3c2f703e0a3c212d2d2320656e646966202d2d3e0a20203c703ed09ed182d0bad180d0bed0b9d182d0b520d181d182d180d0b0d0bdd0b8d186d18320d0b7d0b0d0bdd0bed0b2d0be20e2809420d0bfd180d0bed0b2d0b5d180d0bad0b020d0bdd0b0d187d0bdd191d182d181d18f20d0b0d0b2d182d0bed0bcd0b0d182d0b8d187d0b5d181d0bad0b82e3c2f703e0a3c212d2d2320696620657870723d22247761665f64656e795f726574727922202d2d3e0a20203c703ed09fd0bed0b2d182d0bed180d0b8d182d18c20d0b7d0b0d0bfd180d0bed18120d0bcd0bed0b6d0bdd0be20d187d0b5d180d0b5d0b7203c623e3c212d2d23206563686f207661723d227761665f64656e795f7265747279222064656661756c743d2222202d2d3e3c2f623e20d1812e3c2f703e0a3c212d2d2320656e646966202d2d3e0a3c2f6469763e0a20203c646c20636c6173733d226d657461223e0a3c212d2d2320696620657870723d22247761665f64656e795f72617922202d2d3e0a20203c6469763e3c64743e4576656e742049443c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f726179222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c212d2d2320696620657870723d22247761665f64656e795f6164647222202d2d3e0a20203c6469763e3c64743ed092d0b0d18820d0b0d0b4d180d0b5d1813c2f64743e3c646420636c6173733d226d6f6e6f223e3c212d2d23206563686f207661723d227761665f64656e795f61646472222064656661756c743d2222202d2d3e3c2f64643e3c2f6469763e0a3c212d2d2320656e646966202d2d3e0a3c2f646c3e0a20203c7020636c6173733d22666f6f74223ed095d181d0bbd0b820d0bfd180d0bed0b2d0b5d180d0bad0b020d0bdd0b520d0bfd180d0bed185d0bed0b4d0b8d1822c20d0bfd0bed0b2d182d0bed180d0b8d182d0b520d0bfd0bed0bfd18bd182d0bad18320d0bfd0bed0b7d0b6d0b520d0b8d0bbd0b820d0bed0b1d180d0b0d182d0b8d182d0b5d181d18c20d0b220d0bfd0bed0b4d0b4d0b5d180d0b6d0bad18320d0b820d183d0bad0b0d0b6d0b8d182d0b5204576656e742049442e3c2f703e0a3c2f6d61696e3e0a3c2f626f64793e0a3c2f68746d6c3e0a', '2026-09-12 15:27:35.417413+00') ON CONFLICT DO NOTHING;

INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('0e33015f-f8c6-4ac8-bd01-69954f7b6441', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('23eafc35-14d5-41c0-a988-22bbc1aa79c5', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000015', 5) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('2600608c-338f-4f22-93f5-617f0fbfda07', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011', 4) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('290b66b6-32b8-48d5-bbef-51c9085b312d', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000012', 5) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('45a13a11-b0f9-4323-bbb3-03a167bc3e01', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', 9) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('493411fd-5246-4ad3-91fb-c0e8f9345f80', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000008', 9) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('4a04157e-6af2-4e97-93a4-5dbe555a9c20', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000015', 8) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('4b6808da-4678-495e-aea2-65e3aa5eb7a4', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000014', 7) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('4cb4fa2e-26f2-4507-a216-7a9735c9aac3', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000007', 2) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('506eb795-0a71-43c8-9504-6e81db4fc021', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000014', 7) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('517c779f-326f-47be-be1c-f9d296f22b45', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000011', 3) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('58f3465f-b9a1-4133-81e7-8c3df7183da0', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 2) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('7e3f532a-7fa4-44a7-9c23-9abbd5bf60d0', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('852f880d-c8a9-4de1-bb16-e74d800018df', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000010', 3) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('8b20fcf4-3268-4fec-943e-6f2b175bd2c3', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000011', 4) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('8f203d29-e899-4e89-8b61-9fe713ffe7ab', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000013', 6) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('9a8c9afe-155a-4800-945c-a65428af1d40', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000015', 8) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('b82dc52d-8574-4dd7-a822-46d099118efd', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 0) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('bc278f75-e9c1-46b3-98af-005c754b1e5d', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 0) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('d0d03073-f7b3-4ce2-858d-bcbb668dc482', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000012', 4) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('d5d1139a-318e-4f52-8e20-4ba0bd486e0e', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a', 6) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('df8795d4-5da6-4e62-8017-0b5b8dc9e92f', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('f13f9970-b92e-455c-b797-5feefac122d3', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000010', 3) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('f4b0ceeb-2111-4510-8263-0efa9eff92b3', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000013', 6) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('f4d06075-9398-459b-836e-5355e81ffab6', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000006', 2) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('f7205fda-b152-484b-9d11-e789ed212161', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 0) ON CONFLICT DO NOTHING;
INSERT INTO public.rule_set_files (id, rule_set_id, rule_file_id, "position") VALUES ('fcd1aed7-6bd5-48f0-8582-ac3900ca4692', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000012', 5) ON CONFLICT DO NOTHING;

