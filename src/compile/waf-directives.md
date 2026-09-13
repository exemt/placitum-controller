# Директивы waf_* и то, откуда компилятор их берёт

«Реализовано» здесь — `compileHttp` / `emitWafRoute` печатают директиву из
Postgres. Статус C-модуля — `docs/nginx/module/directives.md`.

Ключи jsonb — camelCase модели (`maxInflight`, `requestInspectors`), не
snake_case nginx. Нет ключа — наследовать; ключ есть — заменить целиком.

| Компилятор | Смысл |
| --- | --- |
| печатает | полный эмит |
| частично | печатается неполно или опасно |
| в jsonb | парсер принимает, эмита нет |
| нет | нет поля и таблицы |

## Реестр

| Директива | Контекст | Компилятор | Хранение |
| --- | --- | --- | --- |
| `waf_bus` | http | печатает | `http_spaces.waf_http.bus` — `tls=` / `creds=` не печатаются |
| `waf_bus_flush_interval` | http | нет | снято; jsonb ещё парсится |
| `waf_node_id` | http | печатает | `waf_http.nodeId` — API пространства ключ снимает; задумано как include ноды |
| `waf_agent_socket` | http | печатает | `waf_http.agentSocket` |
| `waf_protocol_versions` | http | нет | снято; jsonb ещё парсится |
| `waf_reply_max` | http | печатает | `waf_http.replyMax` |
| `waf_header_value_max` | http | печатает | `waf_http.headerValueMax` |
| `waf_max_inflight` | http | печатает | `waf_http.maxInflight` — нет страницы в list/ |
| `waf_var` | http | печатает | `waf_http.vars[]`; имена стандартного набора (`BUILTIN_VARS`) не печатаются — поле едет само, разбор такую пару отвергает (`reserved_waf_var`) |
| `waf_shm_zone` | http | печатает | `waf_http.shmZone {name,size}` |
| `waf_body_max_holds` | http | печатает | `waf_http.bodyMaxHolds` |
| `waf_body_remote_min_deadline` | http | нет | снято: класса `remote` нет ни у одного драйвера; jsonb ещё парсится |
| `waf_inspector` | http | печатает | `*.waf.inspectors` + `subject` из таблицы `inspectors`; `profile=` с decl / `inspectorProfiles` / ref. `mutate=` больше не печатается: право подменить объект снято у директивы, модуль принимает секцию `rewrite` от любой декларации. `vars=` — с `decl.vars`; имена сверяются со стандартным набором (`BUILTIN_VARS`) и `waf_http.vars`, чужое имя — ошибка `unknown_var` |
| `waf_inspector_allow_headers` | http | нет | снято в модуле; jsonb ещё парсится |
| `waf_inspector_allow_cookies` | http | нет | снято в модуле; jsonb ещё парсится |
| `waf_store` | http | печатает | таблица `body_stores` — одна строка; две — ошибка компиляции |
| `waf_local_dataset` | http | печатает | `datasets` при `kind=list` и `in_nginx≠false`: `active`/`internal`, `limit=`, `ttl=` у active; internal — слот + `<entry>` |
| `waf_deny_response` | http | печатает | таблица `deny_responses` |
| `waf_body_staging` | http | нет | — |
| `waf_transformer` | http | нет | — |
| `waf` | inherit | печатает | `*.waf.enabled` |
| `waf_inspect` | server, location | печатает | `requestInspectors` / `responseInspectors` / `frameInspectors` → `waf_inspect request\|response\|frame:c2s\|frame:s2c\|frame … wave=` (сторона кадров -- `ref.stream`: без ключа `c2s`, `s2c`, `both` → `frame`); `none` → `waf_inspect <фаза> none`. `ref.keep` → `keep=on` только на `request` (на потребляющих фазах парсер ключ отвергает: `keep_on_consumer`); `ref.resume` → `resume=` только на потребляющих фазах (`off` — умолчание, не печатается; на `request` парсер ключ отвергает: `resume_on_request`). Парность `keep`/`resume` по эффективным маршрутам проверяет `validateNginxExport` (`keep_without_resume`, `resume_without_keep`) — то же, что `nginx -t` на ноде. `ref.mode` → `mode=passive\|off` (`active` -- умолчание, не печатается; `ignore` -- строка не печатается); `mode=off` -- спящая строка, её поднимает любой инспектор, спрошенный на маршруте: разрешения у адресата нет. **В `http {}` отвергается** (`inspect_at_http`) |
| `waf_request_inspectors` | inherit | нет | снято; ключ jsonb → `waf_inspect request` |
| `waf_response_inspectors` | inherit | нет | снято; ключ jsonb → `waf_inspect response` |
| `waf_inspector_mode` | inherit | нет | снято; значение → `mode=` на `waf_inspect`; `ignore` не печатается |
| `waf_inspector_profile` | inherit | нет | снято; значение → `profile=` на `waf_inspector` |
| `waf_deadline` | inherit | печатает | `deadlineMs` → `request`; `responseDeadlineMs` → `response`; `frameDeadlineMs` → `frame` (обе стороны). Только бюджет: политика переехала в `waf_exception` |
| `waf_hold` | inherit | печатает | `responseHold` → `waf_hold response gate\|monitor`. Фазы запроса у ключа нет: `request monitor` — `nginx -t` |
| `waf_response_deadline` | inherit | нет | снято; ключ → `waf_deadline response` |
| `waf_exception` | inherit | печатает | `exception[]` — хвост с фазой первым словом и необязательным классом вторым: `request deny response=error`, `response bus pass`. Классы `timeout`/`absent`/`bus`/`body`/`inspector`; класс на уровне дважды — `exception_duplicate`, незаявленная страница — `unknown_deny_response`, `response=` при `pass` — `exception_pass_response` |
| `waf_send` | inherit | печатает | `send[]` — хвост с фазой первым словом: `request headers=original body=store`, `response body=store`; значения объектов только `original`/`store` (`send_value`), объект вне словаря фазы — `send_object`. Своего распоряжения на случай сбоя подъёма нет: решает `waf_exception <фаза> body`. Пустой массив ничего не печатает |
| `waf_on_partial_rewrite` | inherit | нет | снята; неполный снимок из обменника не отдаётся — сбой подъёма по `waf_exception <фаза> body` |
| `waf_deny_mode` | inherit | печатает | `denyMode` → `waf_deny_mode request` |
| `waf_score_deny` | inherit | печатает | `scoreDeny` → `request`; `responseScoreDeny` → `response`; `frameScoreDeny` → `frame` (обе стороны) |
| `waf_response_score_deny` | inherit | нет | снято; ключ → `waf_score_deny response` |
| `waf_frame_score_deny` | inherit | нет | — |
| `waf_capture` | inherit | печатает | `capture[]` — первое слово `request`/`response`/`frame:c2s`/`frame:s2c`/`frame` (без слова — `request`); `[]` → `none` на запросе и ответе; у кадров `none` за пустоту не печатается |
| `waf_response_body_access` | inherit | нет | снято; jsonb ещё парсится |
| `waf_archive` | inherit | печатает | `archive[]` — первое слово `request`/`response`/`frame[:dir]`; инспекторы фазы не нужны — фаза без волн пишет журнал (`archive_needs_inspect` снят) |
| `waf_body_limit` | inherit | печатает | `bodyLimit` + `bodyLimitPolicy` |
| `waf_body_encrypt` | inherit | в jsonb | `bodyEncrypt` |
| `waf_body_transform` | inherit | нет | — |
| `waf_transform_after` | inherit | нет | — |
| `waf_on_transform_error` | inherit | нет | — |
| `waf_mask_args` | inherit | нет | — |
| `waf_mask_headers` | inherit | нет | — |
| `waf_deny_response_default` | inherit | печатает | `denyResponseDefault` |
| `waf_action_max` | inherit | печатает | `actionMax` |
| `waf_actions_max` | inherit | печатает | `actionsMax` — `0` печатается: «канал выключен здесь», а не «ключа нет» |
| `waf_redirect_allow` | inherit | печатает | `redirectAllow` |
| `waf_cookie_defaults` | inherit | печатает | `cookieDefaults` |
| `waf_local_rate` | inherit | печатает | `localRates[]`; `count=requests\|waves\|frames` — `frames` считает кадры и допустим только на websocket-пути (`frame_needs_websocket`) |
| `waf_local_check` | inherit | печатает | `localChecks[]`; `action=block\|allow\|wave`; `response=` только у `block` |
| `waf_preview` | inherit | печатает | `preview[]` — первое слово `request`/`response` |
| `waf_debug_header` | inherit | печатает | `debugHeader` |
| кадры, обе стороны (`waf_inspect frame:c2s\|frame:s2c\|frame`, `waf_deadline frame`, `waf_body_limit frame:*`) | inherit | печатает | `frameInspectors` (сторона — `ref.stream`), `frameDeadlineMs`/`frameDeadlinePolicy`, `bodyLimit` с первым словом `frame:c2s`/`frame:s2c`/`frame`; `waf_hold frame:*` не печатается — модуль ведёт кадры только в gate |
| `waf_audit_frames` | location (websocket) | печатает | `frameAudit` → `off`/`deny`/`all`, `frameAuditSample` → `sample=` (только с `all`, `>1`); без ключа не печатается — умолчание модуля `deny` |
| `waf_frame_reassemble` | location (websocket) | печатает | `frameReassemble` → `on`/`off`; без ключа не печатается — умолчание модуля `off` |
| `waf_frame_control_rate` | location (websocket) | печатает | `frameControlRate` → `<n>r/s`/`<n>r/m`/`off` (форма проверяется, `frame_control_rate_invalid`); без ключа — умолчание модуля `10r/s` |
| `waf_frame_cache` | location (websocket) | печатает | `frameCacheTtl` → `ttl=` (до часа, `frame_cache_ttl_invalid`; требует `shmZone` — `shm_zone_required`), `frameCacheStream` → `frame`/`frame:c2s`/`frame:s2c` (умолчание `both`); без срока не печатается |
| кадры: `waf_frame_sample` | — | нет | модуль не принимает (ждёт `monitor`) |

`inherit` — один документ `WafRouteSettings`, но живёт он только на
`servers.waf` и `locations.waf`. На `http_spaces.waf` допустимы лишь
`inspectors` и `inspectorProfiles`: пространство объявляет инспекторов, а
решения по запросу принимает хост. Любой другой ключ там — `route_at_http`.

Порядок печати `compileHttp`: `log_format` → `nginx` → `waf_http` → инспекторы →
deny → `waf` пространства → datasets → stores → upstreams →
servers. `log_format` стоит первым не по вкусу: nginx разбирает файл
последовательно и ищет имя формата в момент разбора `access_log`, поэтому
объявление ниже по файлу для него не существует.

## Ядро nginx: логи

Не директивы модуля, но наследуются тем же правилом и живут в том же поле
`nginx` уровня.

| Директива | Контекст | Компилятор | Хранение |
| --- | --- | --- | --- |
| `log_format` | http | печатает | `log_formats` при `kind='nginx'`; тело в колонке `format`, кавычка внутри — строка пропускается |
| `access_log` | http, server, location | печатает | `nginx.accessLog`: массив приёмников либо `"off"`. Ключа нет — родительский. Строка-хвост из старого jsonb принимается |
| `error_log` | http, server, location | печатает | `nginx.errorLog`: `{ path, level? }`. Строка-хвост принимается |

`"off"` — форма директивы, а не пустой список: пустой массив означал бы
«ключа нет». Ради `access_log off` на `= /healthz` директива на пути и
заводилась.

## Ядро nginx: редиректы

`absolute_redirect off;` печатается в `http {}` **всегда**, ключа в jsonb нет.
Контур отдаёт относительные Location (redirect-режим калитки, продление
сессии, виджет капчи), а nginx по умолчанию достраивает их до абсолютных
портом своего listen. Управляемый край стоит за балансировщиком или пробросом
портов, где этот порт клиенту не виден, — абсолютная форма уводит редирект
мимо контура, и случая, где она была бы правильнее, у края нет.

---

## Инспекторы: процессы, объявления, набор

Три разных списка. Каталог перечисляет **процессы** и даёт `subject` и фазы;
объявления дают **имена**, к которым привязываются маршруты. timeout/`after`
в jsonb узла больше не опции `waf_inspector`: из них считаются `wave=` и
`timeout=` на `waf_inspect`.

```
таблица inspectors          →  subject, phase, conf     «процессы: кто есть в системе»
*.waf.inspectors            →  waf_inspector …          «объявления: имя → процесс, profile, audit, breaker»
*.waf.requestInspectors     →  waf_inspect …            «кого звать здесь» (только объявленные имена)
пульс флота WAF_STATUS      →  страница Inspectors      «кто сейчас жив»
```

### 1. Каталог процессов — таблица `inspectors`

Имя процесса, subject, фазы, `inspector.conf`. `unique (http_space_id, name)`.
Одна строка на процесс: тема, фазы и conf — свойства процесса, вторые имена
их не копируют, а ссылаются (`process` на объявлении). В `waf_inspector` из
строки едет только `subject=`. Колонки timeout/`after`/`needs` компилятор
не читает.

`conf` в nginx.conf не печатается. API каталога: имя, subject, фазы, `conf`.
`GET /api/{scope}/inspectors/declared` отдаёт слитый граф объявлений,
развёрнутый через процессы: имя, process, subject, phases, profile, known —
ровно то, что ест селектор набора на маршруте.

Объявление, чей процесс (`process`, без ключа — само имя) не находит строку
каталога, — ошибка компиляции (`unknown_inspector`): нечего писать в
`subject=`. Вызов с маршрута по имени, которого нет среди объявлений, —
`undeclared_inspector`: раньше такой вызов молча дообъявлял `waf_inspector`
из каталога с дефолтным профилем, мимо объявленных оператором имён.

Контекст `waf_inspect` -- сервер и путь, не http, как и у остальных решений
по запросу. Пространство объявляет инспекторов, но не назначает инспекцию:
кого звать -- свойство хоста. На проде серверы принадлежат разным клиентам, и
общий на контур набор для них либо избыточен, либо недостаточен. Ключ,
оставшийся на пространстве от прежней модели, компилятор отвергает, а не
печатает молча; UX снимает его при первом сохранении.

### 2. Объявления — `*.waf.inspectors`

Карта `Record<name, InspectorDecl>`. Обычно на `http_spaces.waf`. Тот же
документ на server/location: узел, которого нет на http, всё равно
печатается в `http {}`. При конфликте одного имени побеждает более широкий
уровень (http, потом server, потом location). Порядок `waf_inspector` —
порядок ключей на http, затем имена, которые есть только на server/location.
Набор маршрута строк реестра не добавляет.

| Поле | Опция | Когда печатается |
| --- | --- | --- |
| (ключ карты) | имя | всегда |
| `process` | — | ссылка на процесс каталога; нет ключа — само имя. `subject=` берётся с его строки |
| каталог(process).subject | `subject=` | всегда |
| `profile` / `inspectorProfiles` / `ref.profile` | `profile=` | если не `default`; первое найденное, decl первым |
| `audit` | `audit=` | если ключ есть |
| `breaker` | `breaker*` | если поля заданы |

Это весь список опций директивы: `subject=`, `profile=`, `audit=`,
`breaker=`, `breaker_threshold=`, `breaker_window=`, `breaker_probe=`
(docs/directives/list/inspector.md).

Остальное на реестре роняет `nginx -t`, а не игнорируется молча: `needs=`,
`sample=`, `placement=`, `after=`, `role=`, `body=`, `headers=`, `timeout=`,
`phase=`, `mode=`; `allow_headers` / `allow_cookies` нет вовсе, `weight=` — нигде.
В jsonb эти ключи ещё читаются ради старых строк, компилятор их не печатает,
UX не показывает, а сохранение карточки их выбрасывает.

`after=` нет ни у одной директивы: порядок описывает обязательный `wave=` на
`waf_inspect`, а не граф зависимостей. Генератор считает волну из `after`
только для строк, где `wave` ещё не проставлен.

Два профиля на одно имя непредставимы: нужны два объявления. Второе имя на
тот же процесс — узел со ссылкой `process` и своим `profile`, а не копия
строки каталога: раньше пара `modsec` / `modsec-strict` требовала две строки
каталога с повтором темы, фаз и conf, и повторы разъезжались.

### 3. Набор на маршруте

| Ключ | Тип | Директива |
| --- | --- | --- |
| `requestInspectors` | `InspectorRef[]` \| `"none"` \| `"all"` | `waf_inspect` |
| `responseInspectors` | то же | `waf_inspect response` |
| `frameInspectors` | то же | `waf_inspect frame:c2s\|frame:s2c\|frame` — кадры WebSocket, сторона у вызова |
| `protocol` (свойство пути) | location | решает фазы | `http` — запрос и ответ; `websocket` — рукопожатие и кадры: печатает пресет апгрейда, `proxy_read_timeout 3600s` и `waf_inspect response none`; ключи ответа на нём — `websocket_no_response`, ключи кадров на http-пути — `frame_needs_websocket`, на сервере и в http — `frame_at_server`; обработчик только proxy (`websocket_needs_proxy`) |
| `waf_require_upgrade` | location (websocket) | печатает | `requireUpgrade` → `on`/`off`, `requireUpgradeResponse` → `response=`; у websocket-пути без ключа печатается `on response=upgrade_required` (миграция 080); запись сверяется с каталогом (`unknown_deny_response`) |
| `waf_ws_strip_extensions` | location (websocket) | печатает | `wsStripExtensions[]` → слова через пробел, `[]` → `off`; у websocket-пути без ключа печатается `permessage-deflate` |
| `inspectorModes` | `Record<name, active\|passive\|ignore>` | `mode=` на вызове; `ignore` — строка не печатается |
| `inspectorProfiles` | `Record<name, string>` | `profile=` на `waf_inspector` |

`InspectorRef`: `{ name, wave?, timeoutMs?, mode?, keep?, resume?, phase?, profile? }`.
`name` — объявленное имя: вызов мимо объявлений — `undeclared_inspector`.
Нет ключа (или `[]`) — директивы нет, nginx возьмёт родителя.
`"none"` или все вызовы `ignore` — `waf_inspect <фаза> none`.
`"all"` — объявленные имена, чей процесс умеет фазу.
`wave=` из `ref.wave`, иначе из `after` среди выбранного набора
(0, если родителей в наборе нет; цикл → 0). Явный `wave` побеждает.
`timeout=` — с вызова, иначе с узла; `weight=` снят и не печатается.

Парсер: `parseWaf`. UX графа — секция инспекторов на странице пространства.
Набор — `WafProtect` на сервере и пути, не на http.

### Цепочка до текста

```
каталог + *.waf.inspectors + *.waf.requestInspectors
        ↓ exportNginx / compileHttp
waf_inspector …                 (объявления; subject — с процесса каталога)
waf_inspect …                   (если ключ есть на этом уровне)
        ↓ POST /config/send | GET /config/preview
```
