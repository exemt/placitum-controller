# Контроллер

Точка, куда оператор кладёт шаблон nginx и чувствительные файлы. Секреты шифрует браузер, контроллер
их не видит; разослать поколение — `send`. Спецификация —
`docs/config-distribution.md`.

Пока в коде каркас Express и UX, плюс store, наборы IP и тексты правил modsec в
Postgres. Живая модель процесса — Redux: запись идёт `HTTP → thunk → Postgres →
редьюсер → listener`. Каталоги читаются из стора после гидрации с базы.
Адреса наборов и blob store в Redux не кладутся. Все URI конфигурации —
`/api/<scope_uuid>/…`, см. `docs/requirements.md`.
`send` правил инспектора пишет манифест в JetStream KV; `send` шаблона nginx —
ещё впереди. Listener набора адресов — место, куда встанет публикация в
JetStream, не `send` шаблона.

UX собирается Vite'ом и в проде отдаётся тем же процессом: `/` — панель, `/api` — API.
Позже это разъедет nginx. Для правки интерфейса Vite на :5173 проксирует `/api` на :8080.

```
controller/          Express, TypeScript, node исполняет исходники напрямую
controller/ux/       Vite + React + MUI
```

Правила полей ввода — [ux/src/components/fields.md](ux/src/components/fields.md).
Модальные окна — [ux/modals.md](ux/modals.md): одно окно на все окна панели,
своего `Dialog` в страницах нет.
Таблицы — [ux/settings-table.md](ux/settings-table.md).

## Запуск

Сначала база из `deploy/`, затем контроллер. Сборка UX кладёт файлы в `ux/dist`, процесс отдаёт их с `:8080`.

```sh
cd controller/ux && npm install && npm run build
cd ../
npm install
npm run dev          # :8080 — UX на / и API на /api
```

Горячая перезагрузка панели — второй процесс:

```sh
cd controller/ux
npm run dev          # :5173, /api → :8080
```

В Docker то же самое на `http://localhost:8080` (сервис `controller` в `deploy/`).
UX запекается в образ на сборке. После правки `ux/` пересобрать сервис, иначе на `:8080` останется старая панель:

```sh
cd deploy
docker compose up -d --build controller
```

```sh
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8080/api/meta
curl http://127.0.0.1:8080/api/spaces
# публичный ключ контура: uuid пространства из /api/spaces
curl http://127.0.0.1:8080/api/<scope_uuid>/crypto
```

Локально без compose публичный PEM задаёт `CONTROLLER_CRYPTO_PUBLIC_KEY`
(путь к `deploy/secrets/contour.pub` или сам PEM). Приватный файл контроллеру
не скармливать: загрузка отвергнет `BEGIN PRIVATE KEY`.

## API

Конфигурация живёт под `/api/<scope_uuid>/…`, где `scope_uuid` — id пространства.
Правила — `docs/requirements.md`.

| Маршрут | Что делает |
| --- | --- |
| `GET /healthz` | `ok` текстом — для healthcheck процесса |
| `GET /api/health` | `{ ok: true, db: true }` после `select 1` |
| `GET /api/meta` | Имя, версия, hostname, pid, uptime, `mode: "debug"` |
| `GET /api/spaces` | Каталог пространств: uuid, name, raw — чтобы собрать scoped URI |
| `GET /api/:scope/http` | Четыре документа: `nginx_main`, `nginx`, `waf_http`, `waf`, плюс `raw` |
| `PUT /api/:scope/http` | Заменить эти документы. `waf_node_id` не принимается |
| `GET /api/:scope/http/inheritance` | Родитель для карточки сервера: `http.waf` / `http.nginx` и список ключей, которые сервер наследует |
| `GET /api/:scope/servers/:uuid/inheritance` | Родитель для карточки пути: `http` → `server` и список ключей, которые путь наследует |
| `GET /api/:scope/locations/:uuid/inheritance` | То же, что у сервера этого пути: `http` → `server` и список унаследованных ключей |
| `GET /api/:scope/config/preview` | Собранный `nginx.conf` текстом, без записи в KV. Не собрался — `422` с причиной, не `500` |
| `POST /api/:scope/config/preview` | Тот же компилятор, но поверх дерева кладётся несохранённая карточка: `{ draft, node }`. `draft` — `http`, `server` (с привязками `listens`/`certificates`), `location` или `upstream`; пустой `uuid` — карточка ещё не сохранена. `node` — какой блок показать: `{ kind: "http" }` печатает файл, где апстримы и серверы стоят заглушками `include servers/<uuid>.conf; # server …`; `{ kind: "server" \| "location" \| "upstream", uuid }` — сам блок, у сервера пути тоже заглушками. Без `node` — файл целиком, как на `send`. В ответе `text` и находки проверки дерева |
| `GET /api/:scope/catalog` | Всё, на что настройки ссылаются по имени, одним ответом: ответы отказа, форматы, наборы, инспекторы, страницы, обменники, апстримы |
| `GET`/`POST /api/:scope/deny-responses`, `PUT`/`DELETE …/:uuid` | Каталог `waf_deny_response`. Статус вне 4xx/5xx у `type=http` отвергается |
| `GET`/`POST /api/:scope/body-stores`, `PUT …/:uuid` | Каталог `waf_store`. Один на контур. Форма задаёт сроки и пределы; `driver=` и `url=` не принимаются и печатаются из `CONTROLLER_REDIS_URL` -- тот же redis знают агент и инспекторы. `DELETE` нет: снятие обменника ломает снимок и архив у всех маршрутов сразу |
| `GET`/`POST /api/:scope/log-formats`, `PUT`/`DELETE …/:uuid` | Каталог форматов access-лога (`log_format`) |
| `POST /api/:scope/config/send` | Тот же текст в Redis blob + KV `policy/nginx` + PUB `waf.desired.nginx` |
| `GET /api/:scope/config/desired` | Указатель текущего шаблона: rev, hash |
| `GET /api/fleet` | Кластер: агенты, воркеры, инспекторы, Redis, сервисы; `up`/`degraded` |
| WS `/agent_health_socket` | Тот же снимок пушем при изменении seq |
| `GET /api/:scope/crypto` | Публичный ключ контура: `alg`, `public_key`, `fingerprint` |
| `GET /api/:scope/store` | Каталог объектов: uuid, type, metadata, size — без blob |
| `POST /api/:scope/store` | Принять ciphertext (`type`, `metadata`, `blob` base64), выдать uuid |
| `GET /api/:scope/store/:uuid` | Метаданные и blob base64 |
| `GET /api/:scope/store/:uuid/meta` | Только метаданные |
| `GET /api/:scope/store/:uuid/blob` | Сырой ciphertext, для агента |
| `GET /api/:scope/datasets` | Каталог наборов. `linked` и `linked_profiles` — профили адреса, которые включают список |
| `POST /api/:scope/datasets` | Создать набор (`name`, `description`, `subject`, `type`, `active` для динамической шины) |
| `GET /api/:scope/datasets/:uuid` | Объявление набора, без адресов |
| `PUT /api/:scope/datasets/:uuid` | Поправить имя, описание, subject, max, `active`. Тип после создания не меняется |
| `GET /api/:scope/datasets/:uuid/addresses` | Элементы набора (`ttl_s`, `expires_at`). `?q=` — подстрока |
| `POST /api/:scope/datasets/:uuid/addresses` | `{ address }`, `{ addresses: [] }` или `{ text }`, опционально `ttl_s` |
| `GET /api/:scope/addresses?address=` | Найти адрес в наборах этого пространства |
| `GET /api/:scope/addresses/:uuid` | Один адрес |
| `DELETE /api/:scope/addresses/:uuid` | Убрать адрес из набора |

Сквозной прогон трёх списков под k6 — `tests/lists`.
| `GET /api/:scope/rule-files` | Каталог файлов SecLang (мини-наборы) |
| `POST /api/:scope/rule-files` | `{ name, description, text_raw }` |
| `GET /api/:scope/rule-files/:uuid` | Файл с текстом |
| `PUT /api/:scope/rule-files/:uuid` | Имя, описание, текст |
| `GET /api/:scope/rule-sets` | Каталог профилей пространства |
| `POST /api/:scope/rule-sets` | `{ name, description, files: [uuid, …] }` — порядок = include |
| `GET /api/:scope/rule-sets/:uuid` | Профиль и файлы в заданном порядке |
| `PUT /api/:scope/rule-sets/:uuid` | Имя, описание, замена состава |
| `GET /api/:scope/rules/desired` | Указатель текущего pack: rev, hash, имена профилей |
| `POST /api/:scope/rules/send` | Compile + Redis blobs + KV `policy/rules-pack` + PUB `waf.desired.rules` |
| `POST /api/:scope/rules/compile` | Файлы в Redis `waf.blob.<sha256>` без сжатия; дерево хешей в KV `policy/rules-pack` и PUB `waf.desired.rules` |
| `GET /api/:scope/rules/pack` | Дерево: sha256, files/profiles → hash, prefix ключей Redis |
| `GET /api/:scope/ip-countries` | Наборы гео (код + v4/v6 + размер) |
| `GET /api/:scope/ip-countries/:uuid` | Один набор гео |
| `GET /api/:scope/ip-countries/:uuid/addresses` | Страница префиксов гео. `?page=0&page_size=10` (макс. 200), `?q=` — хост (`>>=`), CIDR (`&&`), иначе префикс текста. `{ addresses, total, count, page, page_size, page_count }` |
| `GET /api/:scope/ip-countries/:uuid/addresses/export` | Все префиксы набора гео, `text/plain`, по одному в строке |
| `GET /api/:scope/ip-asns` | Наборы ASN (номер + v4/v6 + размер) |
| `GET /api/:scope/ip-asns/:uuid` | Один набор ASN |
| `GET /api/:scope/ip-asns/:uuid/addresses` | Страница префиксов ASN. `?page=0&page_size=10` (макс. 200), `?q=` — как у гео |
| `GET /api/:scope/ip-asns/:uuid/addresses/export` | Все префиксы набора ASN, `text/plain`, по одному в строке |
| `GET /api/:scope/ip-profiles` | Каталог профилей инспектора ip |
| `POST /api/:scope/ip-profiles` | `{ name, description, whitelist, blacklist }` — списки, страны, ASN |
| `GET /api/:scope/ip-profiles/:uuid` | Профиль: стороны, datasets, гео, ASN, inverse |
| `PUT /api/:scope/ip-profiles/:uuid` | Имя, описание, замена сторон |
| `POST /api/:scope/geo/lookup/batch` | Страна и ASN пачкой: `{ addrs: [] }` → `{ results: [] }`. Отвечает каталог пространства, кодер — только за то, чего в каталоге нет |

Объект store не обновляется: замена файла — новый uuid. Адреса и файлы правил
правятся на месте. Тела в лог не пишутся.

Остальное — `404 { "error": "not_found" }`.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `CONTROLLER_PORT` / `PORT` | `8080` | Порт UX+API |
| `CONTROLLER_NAME` | `controller` | Имя в `/api/meta` и в логах |
| `CONTROLLER_LOG` | `info` | Стартовый уровень журнала: словарь `error_log` nginx без `emerg` (`debug` … `alert`); живьём — «Журналы → Уровни журнала», документ `policy/log-levels` (`docs/logger/logs.md`) |
| `WAF_LOG_SHIP` | `on` | `off` — журнал только в stdout, без копии в waf.log |
| `WAF_LOG_WRITER` | имя машины | Колонка `writer` строк контроллера в waf.log |
| `CONTROLLER_CORS_ORIGIN` | `http://127.0.0.1:5173` | Origin Vite; пустая строка — любой |
| `CONTROLLER_DATABASE_URL` | `postgres://waf:waf@127.0.0.1:5432/waf` | База; контейнер — `postgres` в `deploy/` |
| `CONTROLLER_STORE_MAX_BYTES` | `2097152` | Потолок ciphertext одного объекта store |
| `CONTROLLER_UX_DIR` | `ux/dist`, если есть `index.html` | Каталог сборки UX; пусто — только API |
| `CONTROLLER_FLEET_DEGRADED_MS` | `15000` | Нет healthup — `degraded` |
| `CONTROLLER_FLEET_EXPIRE_MS` | `60000` | Нет healthup — выкинуть из стора |
| `CONTROLLER_FLEET_TICK_MS` | `1000` | Шаг тика флота |
| `CONTROLLER_FLEET_DEMO` | включён, пока не `0` | Demo-пульсы воркеров; в `deploy/` выключен |
| `CONTROLLER_SEARCH_URL` | пусто | HTTP waf-search; в `deploy/` — `http://search:8091` |
| `CONTROLLER_GEO_URL` | пусто | HTTP geo/asn кодера; в `deploy/` — `http://geo:8092` |
| `CONTROLLER_CRYPTO_PUBLIC_KEY` | пусто | Публичный PEM контура или путь; приватный отвергается |
| `CONTROLLER_COMPILE_DIR` | `data/compile` | Куда `compile` кладёт деревья |
| `CONTROLLER_REDIS_URL` | пусто | Боевой обменник: `url=` в `waf_store` и адрес на чтение в панели. Сам контроллер туда не ходит; в `deploy/` — `redis://redis:6379` |
| `CONTROLLER_REDIS_INTERNAL_URL` | `CONTROLLER_REDIS_URL` | Внутренний Redis контура: блобы поколений `waf.blob.<sha256>` (`SET NX EX 300`) и keep-alive их срока раз в минуту; пусто и то и другое — только диск, рассылки нет. В `deploy/` — `redis://redis-internal:6379` |
| `CONTROLLER_NATS_USER`, `_PASS`, `_TOKEN` | пусто | Реквизиты шины в `waf_bus`. Пусто — опции не печатаются |

Адреса шины и обменника — часть развёртывания, а не документа пространства: тот же
NATS и тот же Redis подняты у агента (`nginx/agent/agent.conf`) и у инспекторов
(`REDIS_URL`, `WAF_NATS_URL`). Компилятор печатает `waf_bus` и `waf_store` из
`CONTROLLER_NATS_URL` / `CONTROLLER_REDIS_URL`, панель их показывает на чтение
(`GET /api/:scope/http` → `infra`, `GET /api/:scope/body-stores` → `url`), а
`PUT` их не принимает. Правка одного из трёх объявлений развела бы их молча:
модуль клал бы объект туда, откуда никто не читает.

## Устройство кода

| Файл | Назначение |
| --- | --- |
| [`src/app.ts`](../src/app.ts) | Express: CORS, JSON, `/api`, статика UX на `/`, 404 |
| [`src/main.ts`](../src/main.ts) | Слушает порт, ping Postgres, гидрация Redux, дренаж по сигналу |
| [`src/config.ts`](../src/config.ts), [`src/log.ts`](../src/log.ts) | Окружение и лог в JSON |
| [`src/ux-static.ts`](../src/ux-static.ts) | `vite build` → `/` и SPA fallback |
| [`src/spaces-http.ts`](../src/spaces-http.ts) | `GET /api/spaces` |
| [`src/space-settings-http.ts`](../src/space-settings-http.ts) | `GET`/`PUT /api/:scope/http`, `GET …/inheritance` |
| [`src/inheritance.ts`](../src/inheritance.ts) | JSON наследования: http {} → server {} → список ключей пути |
| [`src/db.ts`](../src/db.ts), [`src/store.ts`](../src/store.ts) | Пул Postgres и объекты store |
| [`src/state/`](../src/state) | Redux: стор, слайсы, thunk'и записи, listener'ы модели |
| [`src/datasets.ts`](../src/datasets.ts), [`src/rule-files.ts`](../src/rule-files.ts), [`src/rule-sets.ts`](../src/rule-sets.ts) | Наборы, адреса, файлы и профили SecLang |
| [`src/crypto.ts`](../src/crypto.ts), [`src/crypto-http.ts`](../src/crypto-http.ts) | Публичный ключ контура, `GET /api/:scope/crypto` |
| [`src/store-http.ts`](../src/store-http.ts) | `GET`/`POST /api/:scope/store` |
| [`src/datasets-http.ts`](../src/datasets-http.ts), [`src/rule-files-http.ts`](../src/rule-files-http.ts), [`src/rule-sets-http.ts`](../src/rule-sets-http.ts) | `/api/:scope/datasets`, `addresses`, `rule-files`, `rule-sets` |
| [`src/rules-http.ts`](../src/rules-http.ts), [`src/desired.ts`](../src/desired.ts), [`src/rules-manifest.ts`](../src/rules-manifest.ts) | `send` правил в KV `WAF_DESIRED/policy/modsec` |
| [`src/fleet-http.ts`](../src/fleet-http.ts) | Снимок флота |
| [`src/search-http.ts`](../src/search-http.ts) | Прокси к waf-search: `/api/search/…` |
| [`src/geo-http.ts`](../src/geo-http.ts) | Страна и ASN адреса из каталога пространства: `POST /api/:scope/geo/lookup/batch`; запасной источник — geo/asn кодер |
| [`src/model/`](../src/model) | Модель http-пространства, сервера и пути |
| [`src/compile/nginx.ts`](../src/compile/nginx.ts) | Дерево пространства → текст `nginx.conf` целиком, от `load_module` до последнего `location` |
| [`src/config-http.ts`](../src/config-http.ts) | `/api/:scope/config/preview` (`GET` и `POST` с черновиком), `send`, `desired` |
| [`src/compile/nginx-draft.ts`](../src/compile/nginx-draft.ts) | Наложение несохранённой карточки на дерево и вырезка блока для превью |
| [`src/model/log.ts`](../src/model/log.ts) | `access_log` / `error_log`: типы и разбор старой строки-хвоста |
| [`src/catalog-http.ts`](../src/catalog-http.ts) | `GET /api/:scope/catalog` -- имена для селектов панели |
| [`schema/`](../schema) | Схема Postgres; на пустой том целиком, на живой — вручную |
| [`schema/seed/`](../schema/seed) | Дампы GeoLite2 (страны, ASN); на пустой том — `019_ip_geo_seed.sh` |
| [`src/load-geo.ts`](../src/load-geo.ts), [`src/dump-geo.ts`](../src/dump-geo.ts) | Заливка MMDB и выгрузка seed SQL |
| [`src/geo-import.ts`](../src/geo-import.ts), [`src/geo-files.ts`](../src/geo-files.ts), [`src/geo-mmdb.ts`](../src/geo-mmdb.ts) | Загрузка выгрузки из панели: разбор MMDB, сверка каталога, файл кодеру (`policy/geo`) |
| [`ux/`](../ux) | Панель: обзор, наборы, правила, настройки http {} |
| [`ux/src/config/`](../ux/src/config) | Настройки маршрута: наследование строкой, общая форма на три уровня, волны, живое превью |

## Модель конфигурации

Контроллер хранит не текст `nginx.conf`, а дерево, из которого шаблон потом собирается.
Первичный ключ везде UUID: в API, в FK и в `store:<uuid>` это одна строка.

Иерархия как у nginx:

```
http_space                один блок http {} (всегда есть "default")
├── каталоги              инспекторы, IP-наборы, ответы отказа, хранилища, форматы
├── rule_files            мини-наборы SecLang: text_raw
├── rule_sets             профили: упорядоченный список файлов
├── upstreams             пулы; пути ссылаются на них, серверу они не принадлежат
│                         tls/tls_name/host_header -- схема и имя узла: пул за
│                         https печатает proxy_ssl_*, порт 443 сам по себе нет
├── ports                 адреса listen; сами по себе ничего не слушают
├── certificates          метаданные + ссылки на store_objects, без PEM
│                         kind: server (пара с ключом) | client_ca (корень mTLS + CRL)
└── servers
    ├── server_ports      listen 443 ssl http2; default_server -- здесь
    ├── server_certificates
    └── locations         путь, обработчик, оверлей waf/nginx

store_objects             глобально по uuid: ciphertext, на пространство не вешается
dataset_addresses         uuid, dataset_id, address
```

Общие опции `http {}` не сваливаются в одну кучу. Четыре места, и смешивать их нельзя:

1. **Таблицы-каталоги.** У сущности есть имя, на неё ссылаются. Инспектор, набор, апстрим, порт,
   сертификат. jsonb-массивом это не выразить: пропадут FK и уникальность имени в контуре.
2. **`http_spaces.waf_http`.** То, что в nginx бывает только в `http`: шина, зона, пределы
   сообщения. На сервер это не наследуется.
3. **`http_spaces.waf`.** То, что наследуется на каждый сервер и путь, пока те не заменят ключ.
   Тот же документ `WafRouteSettings`, только на пространстве он полный, ниже -- разреженный.
   Одно исключение: набор инспекторов (`waf_inspect`) на пространстве не задаётся. Контур
   объявляет инспекторов (`waf_inspector` из `waf.inspectors`), а кого звать -- решает сервер и
   при необходимости переопределяет путь. Набор в `http {}` компилятор отвергает.
4. **`http_spaces.nginx_main`.** Всё, что стоит выше `http {}`: `load_module`, `worker_processes`,
   `error_log` процесса, блок `events {}`. Агент пишет вывод компилятора прямо в `nginx.conf` и
   проверяет через `nginx -t -c`, поэтому файл обязан быть целым, а не одним блоком `http`.

## Инспектор: каталог и реестр

Запись инспектора живёт в двух местах, и путать их нельзя.

**Каталог** -- таблица `inspectors`, страница `/inspectors`. Свойства самого
процесса: имя, тема шины, фазы, которые он умеет вести, текст `inspector.conf`.
Больше там ничего нет: колонки под `timeout`, `needs`, `body`, `after`,
`breaker` остались от старой схемы и сняты в
[`049`](../schema/migrations/049_inspector_catalog_columns.sql).

Имя, тема шины, фазы и ссылка на доки прибиты к процессу, и **в панели каталога
их нет** -- не «только для чтения», а нет вовсе. Полей три: имя (строкой только
для чтения, чтобы опознать запись), описание и `inspector.conf`; их `PATCH` и
шлёт. Тема и фазы видны колонками таблицы, доки -- иконкой книги в строке.
`docs_url` на сервере обновляется через `coalesce`, поэтому отсутствие поля в
теле запроса его не стирает.

**Реестр** -- ключ `inspectors` в `*.waf`, таблица на `/config`. Что печатать в
строке `waf_inspector` и с какими опциями. Он же наследуется по уровням, потому
что у одного имени на пространстве и на пути опции разные.

Связь между ними односторонняя и жёсткая: **каждое имя реестра обязано иметь
строку каталога** -- иначе компилятор не знает, в какую тему публиковать, и
отвечает `NginxCompileError` со списком неизвестных имён. Обратное неверно:
запись каталога может лежать не объявленной ни на одном уровне.

Отсюда следует то, что на первый взгляд выглядит дублированием. Профиль --
опция реестра: `profile=` печатается один раз на строке `waf_inspector <name>`,
а на вызове `waf_inspect` его нет вовсе (`docs/directives/list/inspector.md`).
Значит на одно имя во всём конфиге приходится ровно один набор правил, и
маршруты, просящие у одного имени разные профили, не сводятся ни во что --
компилятор отвечает `profile_conflict` вместо того, чтобы взять первый
попавшийся и промолчать. Разводить надо именами: `modsec` и `modsec-strict` --
одна тема, один процесс, два узла реестра и **две строки каталога**. Алиасы в
каталоге поэтому норма, хотя [`028`](../schema/migrations/028_inspector_catalog_real.sql)
однажды их оттуда и вычистила: тогда графа ещё не было и подтверждать имена
было нечем.

Снятие -- зеркало заведения, и половинами не делается. `DELETE` записи каталога
отказывает с 409 `inspector_in_use`, пока имя объявлено в реестре любого уровня
или зовётся с маршрута; список мест приходит в ответе. Снятие узла реестра, в
свою очередь, убирает имя из чужих `after`.

Слияние ключа -- замена, не сложение. Три `waf_local_check` на сервере и один на пути -- на пути
остаётся один. Ключа нет -- взять у родителя. Пустой массив -- снять (то, чего в модуле пока нет
как `waf_local_check none`).

Эти три состояния панель показывает явно: `…/inheritance` отдаёт действующее значение и уровень,
откуда оно пришло, и строка настройки говорит «наследует 500ms из http» либо «переопределено,
вместо 500ms» либо «снято». Пустое поле не означает ничего.

**Логи.** `access_log` и `error_log` -- поля `nginx` уровня, как и остальное ядро, и наследуются
тем же правилом. `accessLog` -- массив приёмников либо `"off"`: последнее и есть то, чем глушат лог
на `= /healthz`. Формат берётся из каталога `log_formats`.

Сертификат привязывается к серверу, не к порту: SNI выбирает `server {}`, и у него свои
`ssl_certificate`. PEM в базе нет, только UUID объекта store.

Порт привязывается к серверу: один порт на два `server_name` -- обычные виртуальные хосты.
`ssl` / `http2` / `default_server` живут на привязке, потому что в nginx они стоят на `listen`.

```sh
cd deploy
docker compose up -d --wait postgres
```

На пустой том `initdb.d` кладёт поставку: `01-baseline.sql` (структура) и
`02-shipped.sql` (данные) — см. [controller/schema/README.md](../schema/README.md).
Всё, что выпущено после поставки, лежит файлами в `schema/migrations/` и катается поверх;
отметки о применённом — в таблице `waf_schema_log`, она приезжает заполненной. Докатить
один файл руками:

```sh
docker compose exec -T postgres psql -U waf -d waf -f /docker-entrypoint-initdb.d/migrations/100_example.sql
```

Стенд лежит в базе сущностями: [`schema/stand/stand.sql`](../schema/stand/stand.sql)
раскладывает `deploy/nginx/nginx.conf` по каталогам, серверам и путям пространства `default`.
В поставку он не входит и из `initdb.d` не читается — подкаталоги postgres пропускает; на стенд
его кладёт предполёт e2e после `--reset-db`, руками — тем же `psql -f`. Файл идемпотентный,
так что его можно докатывать на живую базу. Проверка после наката —
`GET /api/<scope>/config/preview` даёт файл, совпадающий со стендовым директива в директиву.

Гео и ASN — выгрузка MaxMind; тестовые три страны из архивных `011`/`014` остались фикстурой
в [`schema/stand/geo-test.sql`](../schema/stand/geo-test.sql) для базы без выгрузки.
Полный GeoLite2 загружают из панели: «Наборы адресов → Гео» и «→ ASN», кнопка «Загрузить
данные» — `POST /api/:scope/geo/import/country|asn`, тело — файл `.mmdb`, ответ 202 и задача;
ход, загруженные файлы и копии кодера — `GET /api/:scope/geo/import`. Каталог пространства
сверяется с файлом одной транзакцией (пропавшие сети снимаются, новые добавляются, UUID
совпавших остаются), сам файл ложится туда же в `geo_files` (миграция 101) и уходит кодеру
документом `policy/geo` в KV: кодер скачивает копию `GET /api/geo/files/<вид>` и подменяет
таблицы, отвечая по прежним до самой подмены. Документ, не легший в KV, досылается повтором и
стартом контроллера.

Из командной строки — как раньше; кодеру файл при этом не едет:

```sh
cd controller
npm run load-geo -- --docker --dump
```

Без путей берёт `GeoLite2-Country.mmdb` и `GeoLite2-ASN.mmdb` из `~/Downloads`
или `data/geo/`. `--dump` пишет `schema/seed/*.sql` (без UUID пространства).
На новый том дампы накатывает `03-geo.sh`, если файлы на месте.
Повторно снять дамп с живой базы — `npm run dump-geo -- --docker`.

Идеи, пробелы и инвентарь параметров, которые ещё не в спецификации —
`docs/research/controller-config-model.md`.
