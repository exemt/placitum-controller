/**
 * Расширенные подсказки по переменным и коллекциям.
 *
 * Главный вопрос про переменную — не «что в ней лежит», а «существует ли она
 * в этой фазе и при этой конфигурации». Пустая переменная не даёт правилу
 * сработать, и внешне это неотличимо от того, что атаки не было.
 */

import { l, type DetailsMap } from './types';

export const VARIABLE_DETAILS: DetailsMap = {
  ARGS: {
    summary: l(
      'All request arguments, from the query string and from the body alike, already decoded by the parser. A collection: the rule runs the operator against every value separately.',
      'Все аргументы запроса — и из строки запроса, и из тела, уже раскодированные парсером. Это коллекция: оператор применяется к каждому значению по отдельности.',
    ),
    syntax: 'ARGS  |  ARGS:username  |  ARGS:/^user_/  |  !ARGS:csrf_token  |  &ARGS',
    tech: {
      scope: l(
        'Query-string arguments exist from phase 1; body arguments only appear in phase 2 and only with SecRequestBodyAccess On.',
        'Аргументы из строки запроса доступны с фазы 1; аргументы тела появляются только в фазе 2 и только при SecRequestBodyAccess On.',
      ),
      argument: l(
        'A selector picks one argument by name or by /regex/; a leading ! excludes it; a leading & turns the target into a count.',
        'Селектор выбирает аргумент по имени или по /регулярке/; ведущий ! исключает его; ведущий & превращает цель в счётчик.',
      ),
    },
    gotchas: [
      l(
        'ARGS holds values, not names — an attack hidden in the parameter name is only visible through ARGS_NAMES.',
        'В ARGS лежат значения, а не имена: атака, спрятанная в имени параметра, видна только через ARGS_NAMES.',
      ),
      l(
        'For a JSON or XML body the arguments appear only when the matching body processor is on.',
        'Для тела в JSON или XML аргументы появляются, только когда включён соответствующий обработчик тела.',
      ),
    ],
    seeAlso: ['ARGS_NAMES', 'ARGS_GET', 'ARGS_POST', 'ARGS_COMBINED_SIZE', 'phase'],
  },

  ARGS_NAMES: {
    summary: l(
      'The names of the arguments, as values. Rules over it catch parameter pollution and injections placed in the key rather than the value.',
      'Имена аргументов, поданные как значения. Правила по ней ловят загрязнение параметров и инъекции, помещённые в ключ, а не в значение.',
    ),
    syntax: 'ARGS_NAMES  |  &ARGS_NAMES',
    seeAlso: ['ARGS', 'ARGS_GET_NAMES', 'ARGS_POST_NAMES'],
  },

  ARGS_GET: {
    summary: l(
      'Arguments from the query string only. Available already in phase 1, which makes it the cheapest place to check things that cannot legitimately appear in a URL.',
      'Аргументы только из строки запроса. Доступны уже в фазе 1, поэтому это самое дешёвое место для проверок того, чего в URL быть не должно.',
    ),
    syntax: 'ARGS_GET  |  ARGS_GET:id',
    seeAlso: ['ARGS', 'ARGS_POST', 'QUERY_STRING'],
  },

  ARGS_GET_NAMES: {
    summary: l(
      'The names of the query-string arguments, available from phase 1. Counting them with &ARGS_GET_NAMES is a cheap way to spot a URL stuffed with parameters.',
      'Имена аргументов из строки запроса, доступны с фазы 1. Подсчёт через &ARGS_GET_NAMES — дешёвый способ заметить URL, набитый параметрами.',
    ),
    syntax: 'ARGS_GET_NAMES',
    seeAlso: ['ARGS_NAMES', 'ARGS_GET'],
  },

  ARGS_POST: {
    summary: l(
      'Arguments parsed out of the request body. Exists in phase 2 and later, and only for body types the engine knows how to parse.',
      'Аргументы, разобранные из тела запроса. Существуют с фазы 2 и только для тех типов тела, которые движок умеет разбирать.',
    ),
    syntax: 'ARGS_POST  |  ARGS_POST:password',
    gotchas: [
      l(
        'A rule over ARGS_POST placed in phase 1 never fires — the body has not been read yet.',
        'Правило по ARGS_POST, поставленное в фазу 1, не срабатывает никогда: тело ещё не прочитано.',
      ),
    ],
    seeAlso: ['ARGS', 'ARGS_GET', 'REQUEST_BODY', 'phase'],
  },

  ARGS_POST_NAMES: {
    summary: l(
      'The names of the body arguments, available from phase 2. A field name the application never defines is a strong hint that someone is probing the form.',
      'Имена аргументов из тела запроса, доступны с фазы 2. Имя поля, которого приложение не определяет, — сильный признак того, что форму прощупывают.',
    ),
    syntax: 'ARGS_POST_NAMES',
    seeAlso: ['ARGS_NAMES', 'ARGS_POST'],
  },

  ARGS_COMBINED_SIZE: {
    summary: l(
      'The total size of all arguments, names and values together. A single number, so it goes with numeric operators; used to catch oversized submissions without inspecting them.',
      'Суммарный размер всех аргументов — имён и значений вместе. Это одно число, поэтому используется с числовыми операторами; ловит раздутые отправки, не вчитываясь в них.',
    ),
    syntax: 'SecRule ARGS_COMBINED_SIZE "@gt 65536" "id:1301,phase:2,deny"',
    seeAlso: ['ARGS', 'REQUEST_BODY_LENGTH', 'gt', 'length'],
  },

  QUERY_STRING: {
    summary: l(
      'The raw text after the ? in the URI, undecoded and unsplit. The place to look for broken encoding and separator tricks that disappear once the arguments are parsed.',
      'Сырой текст после ? в URI, не раскодированный и не разбитый на аргументы. Здесь ищут сломанное кодирование и трюки с разделителями, которые исчезают после разбора аргументов.',
    ),
    syntax: 'QUERY_STRING',
    gotchas: [
      l(
        'For a normal per-argument check ARGS is more precise: a pattern over the whole query string easily matches across two different parameters.',
        'Для обычной проверки по каждому аргументу точнее ARGS: шаблон по всей строке запроса легко совпадёт на стыке двух разных параметров.',
      ),
    ],
    seeAlso: ['ARGS_GET', 'REQUEST_URI', 'validateUrlEncoding'],
  },

  REQUEST_URI: {
    summary: l(
      'The request URI without the host — path plus query string — after the server has normalised it. Available in phase 1, which makes it the standard target for early path rules.',
      'URI запроса без хоста — путь вместе со строкой запроса — после нормализации сервером. Доступна в фазе 1, поэтому это стандартная цель для ранних правил по пути.',
    ),
    syntax: 'REQUEST_URI',
    gotchas: [
      l(
        'It includes the query string, so an @endsWith check on a file extension fails as soon as a parameter is added.',
        'В неё входит строка запроса, поэтому проверка расширения через @endsWith ломается, как только к URL добавили параметр.',
      ),
    ],
    seeAlso: ['REQUEST_URI_RAW', 'REQUEST_FILENAME', 'REQUEST_BASENAME', 'QUERY_STRING'],
  },

  REQUEST_URI_RAW: {
    summary: l(
      'The URI exactly as it arrived, including the scheme and host if the client sent an absolute form. Used to spot what normalisation would have hidden.',
      'URI ровно в том виде, в каком он пришёл, включая схему и хост, если клиент прислал абсолютную форму. Нужна, чтобы заметить то, что скрыла бы нормализация.',
    ),
    syntax: 'REQUEST_URI_RAW',
    seeAlso: ['REQUEST_URI', 'REQUEST_LINE', 'normalizePath'],
  },

  REQUEST_LINE: {
    summary: l(
      'The complete first line of the request: method, URI and protocol. The target for protocol-level anomalies — a malformed line, an unexpected protocol version, an oversized request line.',
      'Полная первая строка запроса: метод, URI и протокол. Цель для аномалий уровня протокола — искажённой строки, неожиданной версии протокола, чрезмерной длины.',
    ),
    syntax: 'REQUEST_LINE',
    seeAlso: ['REQUEST_METHOD', 'REQUEST_PROTOCOL', 'REQUEST_URI_RAW'],
  },

  REQUEST_METHOD: {
    summary: l(
      'The HTTP method as sent. A single value, uppercase in practice, and the usual subject of an allow-list.',
      'HTTP-метод в том виде, как он прислан. Одно значение, на практике в верхнем регистре, обычный предмет белого списка.',
    ),
    syntax: 'SecRule REQUEST_METHOD "!@within GET POST HEAD" "id:1302,phase:1,deny,status:405"',
    seeAlso: ['REQUEST_LINE', 'within', 'streq'],
  },

  REQUEST_PROTOCOL: {
    summary: l(
      'The protocol version of the request, such as HTTP/1.1. Ancient clients and crude tools often give themselves away here with HTTP/1.0 or a malformed string.',
      'Версия протокола запроса, например HTTP/1.1. Древние клиенты и грубые инструменты часто выдают себя именно здесь — HTTP/1.0 или искажённой строкой.',
    ),
    syntax: 'REQUEST_PROTOCOL',
    seeAlso: ['REQUEST_LINE', 'REQUEST_METHOD'],
  },

  REQUEST_FILENAME: {
    summary: l(
      'The URI path with the query string removed. The right target for path checks: prefixes, extensions and traversal patterns all live here without parameter noise.',
      'Путь URI без строки запроса. Правильная цель для проверок пути: префиксы, расширения и обходы каталогов живут здесь без шума параметров.',
    ),
    syntax: 'SecRule REQUEST_FILENAME "@beginsWith /admin/" "id:1303,phase:1,t:none,t:lowercase,t:normalizePath,deny"',
    gotchas: [
      l(
        'Without t:normalizePath the value can still contain ../ and slip past a prefix comparison.',
        'Без t:normalizePath в значении может остаться ../, и оно проскочит мимо сравнения по префиксу.',
      ),
    ],
    seeAlso: ['REQUEST_URI', 'REQUEST_BASENAME', 'normalizePath', 'beginsWith'],
  },

  REQUEST_BASENAME: {
    summary: l(
      'The last segment of the path — the file name. The natural place to check an extension, since nothing follows it.',
      'Последний сегмент пути — имя файла. Естественное место для проверки расширения: после него ничего нет.',
    ),
    syntax: 'SecRule REQUEST_BASENAME "@rx \\.(?:php|phtml|jsp)$" "id:1304,phase:1,t:none,t:lowercase,deny"',
    seeAlso: ['REQUEST_FILENAME', 'endsWith', 'normalizePath'],
  },

  REQUEST_HEADERS: {
    summary: l(
      'All request headers as a collection. Header names in a selector are case-insensitive, so REQUEST_HEADERS:user-agent and REQUEST_HEADERS:User-Agent are the same target.',
      'Все заголовки запроса как коллекция. Имена заголовков в селекторе регистронезависимы, поэтому REQUEST_HEADERS:user-agent и REQUEST_HEADERS:User-Agent — одна и та же цель.',
    ),
    syntax: 'REQUEST_HEADERS  |  REQUEST_HEADERS:User-Agent  |  &REQUEST_HEADERS:Host',
    tech: {
      scope: l(
        'Available from phase 1 — the cheapest possible place to reject a request.',
        'Доступны с фазы 1 — самое дешёвое место, чтобы отклонить запрос.',
      ),
    },
    gotchas: [
      l(
        'An absent header produces no value, so the rule does not run at all. To require a header, count it: &REQUEST_HEADERS:Host @eq 0.',
        'Отсутствующий заголовок не даёт значения, и правило вообще не выполняется. Чтобы потребовать заголовок, считайте его: &REQUEST_HEADERS:Host @eq 0.',
      ),
    ],
    seeAlso: ['REQUEST_HEADERS_NAMES', 'REQUEST_COOKIES', 'eq', 'phase'],
  },

  REQUEST_HEADERS_NAMES: {
    summary: l(
      'The header names themselves. Rules over it catch garbage and injection attempts in the header name.',
      'Сами имена заголовков. Правила по ней ловят мусор и попытки инъекции в имени заголовка.',
    ),
    syntax: 'REQUEST_HEADERS_NAMES',
    seeAlso: ['REQUEST_HEADERS'],
  },

  REQUEST_COOKIES: {
    summary: l(
      'Cookies parsed out of the Cookie header, as a collection keyed by cookie name. Attacks in cookies are common precisely because rule sets often forget to look here.',
      'Cookie, разобранные из заголовка Cookie, как коллекция с ключами по именам. Атаки через cookie распространены именно потому, что наборы правил часто забывают сюда заглянуть.',
    ),
    syntax: 'REQUEST_COOKIES  |  REQUEST_COOKIES:sessionid  |  !REQUEST_COOKIES:/^__utm/',
    tech: {
      scope: l(
        'Parsing follows SecCookieFormat; malformed cookies may end up unparsed.',
        'Разбор подчиняется SecCookieFormat; искажённые cookie могут остаться неразобранными.',
      ),
    },
    seeAlso: ['REQUEST_COOKIES_NAMES', 'REQUEST_HEADERS', 'setsid', 'SecCookieFormat'],
  },

  REQUEST_COOKIES_NAMES: {
    summary: l(
      'The names of the cookies that were sent.',
      'Имена присланных cookie.',
    ),
    syntax: 'REQUEST_COOKIES_NAMES',
    seeAlso: ['REQUEST_COOKIES'],
  },

  REQUEST_BODY: {
    summary: l(
      'The raw request body as one value, available once buffering is on. Meant for bodies that have no parser — a JSON blob in an older setup, a custom format, a signature check over the whole payload.',
      'Сырое тело запроса одним значением, доступно при включённой буферизации. Предназначено для тел, у которых нет парсера: JSON в старой конфигурации, свой формат, проверка подписи по всей нагрузке.',
    ),
    syntax: 'REQUEST_BODY',
    tech: {
      scope: l(
        'Phase 2, with SecRequestBodyAccess On and within SecRequestBodyLimit.',
        'Фаза 2, при SecRequestBodyAccess On и в пределах SecRequestBodyLimit.',
      ),
    },
    gotchas: [
      l(
        'For a multipart upload it stays empty — the parts are in ARGS and FILES instead.',
        'Для multipart-загрузки она остаётся пустой: части лежат в ARGS и FILES.',
      ),
      l(
        'Scanning the whole body with a regex is far more expensive than scanning individual arguments.',
        'Сканировать регуляркой всё тело заметно дороже, чем отдельные аргументы.',
      ),
    ],
    seeAlso: ['ARGS_POST', 'REQUEST_BODY_LENGTH', 'FILES', 'SecRequestBodyAccess'],
  },

  REQUEST_BODY_LENGTH: {
    summary: l(
      'The number of bytes actually read from the body. A cheap sanity check that does not require reading the content itself.',
      'Число байтов, реально прочитанных из тела. Дешёвая проверка на вменяемость, не требующая чтения содержимого.',
    ),
    syntax: 'SecRule REQUEST_BODY_LENGTH "@gt 1048576" "id:1305,phase:2,deny"',
    gotchas: [
      l(
        'It is what was read, not what Content-Length claimed — the two disagreeing is itself worth a rule.',
        'Это то, что прочитано, а не то, что заявлено в Content-Length: расхождение этих двух значений само по себе достойно правила.',
      ),
    ],
    seeAlso: ['REQUEST_BODY', 'ARGS_COMBINED_SIZE', 'SecRequestBodyLimit'],
  },

  RESPONSE_BODY: {
    summary: l(
      'The response body, buffered for inspection. This is where data-leak rules live: stack traces, SQL errors, card numbers, internal paths.',
      'Тело ответа, забуферизованное для проверки. Здесь живут правила об утечке данных: трассировки стека, ошибки SQL, номера карт, внутренние пути.',
    ),
    syntax: 'RESPONSE_BODY',
    tech: {
      scope: l(
        'Phase 4, with SecResponseBodyAccess On and a content type listed in SecResponseBodyMimeType.',
        'Фаза 4, при SecResponseBodyAccess On и типе содержимого из SecResponseBodyMimeType.',
      ),
      cost: l(
        'Buffering responses costs memory and delays the first byte for every request, not just the suspicious ones.',
        'Буферизация ответов стоит памяти и задерживает первый байт для всех запросов, а не только подозрительных.',
      ),
    },
    seeAlso: ['RESPONSE_CONTENT_TYPE', 'RESPONSE_STATUS', 'verifyCC', 'SecResponseBodyAccess'],
  },

  RESPONSE_HEADERS: {
    summary: l(
      'Response headers as a collection, available from phase 3. Used both to detect leaks (a revealing X-Powered-By) and to verify that required security headers are present.',
      'Заголовки ответа как коллекция, доступны с фазы 3. Применяются и для поиска утечек (болтливый X-Powered-By), и для проверки, что нужные заголовки безопасности на месте.',
    ),
    syntax: 'RESPONSE_HEADERS:Server  |  &RESPONSE_HEADERS:Content-Security-Policy',
    seeAlso: ['RESPONSE_STATUS', 'RESPONSE_CONTENT_TYPE', 'SecServerSignature'],
  },

  RESPONSE_STATUS: {
    summary: l(
      'The status code the application returned. A stream of 401s or 500s from one address describes an attack better than any single request does.',
      'Код статуса, который вернуло приложение. Поток 401 или 500 с одного адреса описывает атаку лучше, чем любой отдельный запрос.',
    ),
    syntax: 'SecRule RESPONSE_STATUS "@rx ^5\\d{2}$" "id:1306,phase:3,pass,setvar:ip.errors=+1"',
    seeAlso: ['RESPONSE_HEADERS', 'setvar', 'initcol'],
  },

  RESPONSE_CONTENT_TYPE: {
    summary: l(
      'The Content-Type of the response. Check it before doing anything expensive or intrusive on the body — there is no point scanning an image, and injecting into JSON breaks it.',
      'Content-Type ответа. Проверяйте его прежде, чем делать с телом что-то дорогое или вмешивающееся: сканировать картинку бессмысленно, а внедрение в JSON его ломает.',
    ),
    syntax: 'RESPONSE_CONTENT_TYPE',
    seeAlso: ['RESPONSE_BODY', 'append', 'SecResponseBodyMimeType'],
  },

  FILES: {
    summary: l(
      'The original file names of the uploads, as the client sent them. The name is attacker-controlled, so it is a target in its own right — a double extension or a traversal sequence.',
      'Исходные имена загруженных файлов в том виде, как их прислал клиент. Имя контролируется атакующим, поэтому само по себе является целью: двойное расширение, последовательность обхода каталогов.',
    ),
    syntax: 'SecRule FILES "@rx \\.(?:php|jsp|exe)$" "id:1307,phase:2,t:none,t:lowercase,deny"',
    tech: {
      scope: l(
        'Phase 2, multipart bodies only; the content itself is reached through FILES_TMPNAMES and @inspectFile.',
        'Фаза 2, только multipart-тела; до самого содержимого добираются через FILES_TMPNAMES и @inspectFile.',
      ),
    },
    seeAlso: ['FILES_NAMES', 'FILES_SIZES', 'inspectFile', 'SecUploadDir'],
  },

  FILES_NAMES: {
    summary: l(
      'The names of the form fields used to upload files — not the file names. Useful for pinning uploads to the fields that are supposed to have them.',
      'Имена полей формы, через которые загружены файлы, — не имена файлов. Полезно, чтобы закрепить загрузки за теми полями, где они предусмотрены.',
    ),
    syntax: 'FILES_NAMES',
    seeAlso: ['FILES', 'FILES_SIZES'],
  },

  FILES_SIZES: {
    summary: l(
      'The size of each uploaded file. Enforcing a per-file limit here is cheaper and more precise than a limit on the whole body.',
      'Размер каждого загруженного файла. Ограничение на файл здесь дешевле и точнее, чем ограничение на всё тело.',
    ),
    syntax: 'SecRule FILES_SIZES "@gt 5242880" "id:1308,phase:2,deny,msg:\'File too large\'"',
    seeAlso: ['FILES', 'SecUploadFileLimit', 'REQUEST_BODY_LENGTH'],
  },

  REMOTE_ADDR: {
    summary: l(
      'The IP address of the peer that opened the connection. Trustworthy exactly because the client cannot forge it — unlike any header that claims to hold the real address.',
      'IP-адрес узла, открывшего соединение. Ему можно доверять именно потому, что клиент не может его подделать, — в отличие от любого заголовка, заявляющего настоящий адрес.',
    ),
    syntax: 'SecRule REMOTE_ADDR "@ipMatch 10.0.0.0/8" "id:1309,phase:1,pass,nolog,ctl:ruleEngine=DetectionOnly"',
    gotchas: [
      l(
        'Behind a proxy or a CDN this is the proxy address; every client then shares one identity and per-IP counters become meaningless.',
        'За прокси или CDN здесь адрес прокси: все клиенты получают одну личность, и счётчики по IP теряют смысл.',
      ),
    ],
    seeAlso: ['ipMatch', 'initcol', 'IP', 'REMOTE_HOST'],
  },

  REMOTE_HOST: {
    summary: l(
      'The client host name — but only when the server was configured to resolve it. Usually empty, and a reverse lookup inside a request is expensive anyway.',
      'Имя хоста клиента — но только если сервер настроен его разрешать. Обычно пусто, да и обратный DNS-запрос внутри обработки дорог.',
    ),
    syntax: 'REMOTE_HOST',
    seeAlso: ['REMOTE_ADDR', 'rbl'],
  },

  REMOTE_PORT: {
    summary: l(
      'The source port of the client connection. Rarely useful on its own; it mostly helps correlate a request with a network-level capture.',
      'Порт источника клиентского соединения. Сам по себе полезен редко: в основном помогает сопоставить запрос с сетевым дампом.',
    ),
    syntax: 'REMOTE_PORT',
    seeAlso: ['REMOTE_ADDR', 'UNIQUE_ID'],
  },

  REMOTE_USER: {
    summary: l(
      'The user name from HTTP authentication, when the server performed it. Empty for applications that handle login themselves, which is most of them.',
      'Имя пользователя из HTTP-аутентификации, если её выполнял сервер. Для приложений, которые сами обрабатывают вход, — а это большинство, — пусто.',
    ),
    syntax: 'REMOTE_USER',
    seeAlso: ['setuid', 'USER'],
  },

  SERVER_NAME: {
    summary: l(
      'The host name the server used to handle the request. Lets one rule set behave differently per virtual host without duplicating the configuration.',
      'Имя хоста, под которым сервер обработал запрос. Позволяет одному набору правил вести себя по-разному для разных виртуальных хостов без дублирования конфигурации.',
    ),
    syntax: 'SERVER_NAME',
    seeAlso: ['REQUEST_HEADERS', 'SERVER_ADDR', 'SERVER_PORT'],
  },

  SERVER_ADDR: {
    summary: l(
      'The IP address of the server that accepted the connection. Useful on multi-homed hosts to tell the public interface from the internal one.',
      'IP-адрес сервера, принявшего соединение. Полезен на многоинтерфейсных хостах, чтобы отличить публичный интерфейс от внутреннего.',
    ),
    syntax: 'SERVER_ADDR',
    seeAlso: ['SERVER_NAME', 'SERVER_PORT'],
  },

  SERVER_PORT: {
    summary: l(
      'The port the request arrived on. The usual way to tell HTTP from HTTPS traffic when no other marker is available.',
      'Порт, на который пришёл запрос. Обычный способ отличить HTTP-трафик от HTTPS, когда другого признака нет.',
    ),
    syntax: 'SERVER_PORT',
    seeAlso: ['SERVER_NAME', 'SERVER_ADDR'],
  },

  TX: {
    summary: l(
      'The scratch pad of the transaction: variables you create yourself with setvar, plus TX:0..TX:9 filled by capture. It is what lets several rules add up to one decision.',
      'Черновик транзакции: переменные, которые вы создаёте сами через setvar, плюс TX:0..TX:9, заполняемые capture. Именно на ней несколько правил складываются в одно решение.',
    ),
    syntax: 'TX:anomaly_score  |  setvar:tx.score=+5  |  %{TX.0}',
    tech: {
      scope: l(
        'Lives for one transaction and disappears with it; variable names are case-insensitive.',
        'Живёт одну транзакцию и исчезает вместе с ней; имена переменных регистронезависимы.',
      ),
    },
    gotchas: [
      l(
        'Nothing survives to the next request. Anything that must persist belongs in IP, SESSION or USER.',
        'До следующего запроса ничего не доживает. Всё, что должно сохраняться, живёт в IP, SESSION или USER.',
      ),
    ],
    seeAlso: ['setvar', 'capture', 'IP', 'SESSION'],
  },

  IP: {
    summary: l(
      'A persistent collection tied to a client address: counters, flags and bans that outlive the request. Created by initcol and stored on disk.',
      'Постоянная коллекция, привязанная к адресу клиента: счётчики, флаги и блокировки, переживающие запрос. Создаётся через initcol и хранится на диске.',
    ),
    syntax: 'initcol:ip=%{REMOTE_ADDR}  |  SecRule IP:score "@gt 20" ...',
    tech: {
      scope: l(
        'Requires SecDataDir and an initcol earlier in the same transaction.',
        'Требует SecDataDir и вызов initcol раньше в той же транзакции.',
      ),
    },
    gotchas: [
      l(
        'Reading IP:something without initcol always yields nothing, and the rule quietly never fires.',
        'Чтение IP:что-нибудь без initcol всегда даёт пустоту, и правило тихо не срабатывает никогда.',
      ),
    ],
    seeAlso: ['initcol', 'expirevar', 'deprecatevar', 'REMOTE_ADDR', 'SecDataDir'],
  },

  SESSION: {
    summary: l(
      'A persistent collection tied to a session identifier. More precise than IP when many users share an address, and it follows the user across addresses.',
      'Постоянная коллекция, привязанная к идентификатору сессии. Точнее, чем IP, когда за одним адресом много пользователей, и следует за пользователем при смене адреса.',
    ),
    syntax: 'setsid:%{REQUEST_COOKIES.PHPSESSID}  |  SESSION:score',
    gotchas: [
      l(
        'The identifier comes from the client, so an attacker can simply drop the cookie and start with a clean collection.',
        'Идентификатор приходит от клиента, поэтому атакующему достаточно выбросить cookie, чтобы начать с чистой коллекции.',
      ),
    ],
    seeAlso: ['setsid', 'IP', 'USER', 'REQUEST_COOKIES'],
  },

  USER: {
    summary: l(
      'A persistent collection tied to an authenticated user, set up with setuid. The right granularity for account-level protections such as password-spraying detection.',
      'Постоянная коллекция, привязанная к аутентифицированному пользователю, настраивается через setuid. Верная гранулярность для защит уровня учётной записи, например обнаружения перебора паролей.',
    ),
    syntax: 'setuid:%{REMOTE_USER}  |  USER:failed_logins',
    seeAlso: ['setuid', 'SESSION', 'IP', 'REMOTE_USER'],
  },

  GEO: {
    summary: l(
      'The result of the last @geoLookup: COUNTRY_CODE, COUNTRY_NAME, CITY, LATITUDE, LONGITUDE and friends. Empty until the lookup has run.',
      'Результат последнего @geoLookup: COUNTRY_CODE, COUNTRY_NAME, CITY, LATITUDE, LONGITUDE и соседние поля. Пуста, пока поиск не выполнен.',
    ),
    syntax: 'GEO:COUNTRY_CODE',
    gotchas: [
      l(
        'It holds one result at a time, so the rule that reads it must be chained directly to the lookup.',
        'В ней лежит один результат за раз, поэтому читающее правило должно быть прицеплено прямо к поиску.',
      ),
    ],
    seeAlso: ['geoLookup', 'chain', 'REMOTE_ADDR'],
  },

  MATCHED_VAR: {
    summary: l(
      'The value that caused the most recent match. The natural argument for logdata — it shows what the rule actually saw.',
      'Значение, вызвавшее последнее срабатывание. Естественный аргумент для logdata: показывает, что именно увидело правило.',
    ),
    syntax: "logdata:'%{MATCHED_VAR}'",
    gotchas: [
      l(
        'It is overwritten by every subsequent match, including matches inside a chain — read it immediately.',
        'Оно перезаписывается каждым следующим срабатыванием, в том числе внутри цепочки, — читайте сразу.',
      ),
    ],
    seeAlso: ['MATCHED_VAR_NAME', 'MATCHED_VARS', 'logdata', 'sanitiseMatched'],
  },

  MATCHED_VARS: {
    summary: l(
      'All values that matched, not just the last one. Meaningful with multiMatch or when a rule walks a whole collection.',
      'Все совпавшие значения, а не только последнее. Осмысленна при multiMatch или когда правило обходит целую коллекцию.',
    ),
    syntax: '%{MATCHED_VARS}',
    seeAlso: ['MATCHED_VAR', 'MATCHED_VARS_NAMES', 'multiMatch'],
  },

  MATCHED_VAR_NAME: {
    summary: l(
      'The name of the variable that matched, for example ARGS:comment. Usually more valuable in a log line than the value itself, and it is safe to write down.',
      'Имя совпавшей переменной, например ARGS:comment. В строке лога обычно ценнее самого значения, и его безопасно записывать.',
    ),
    syntax: "msg:'Attack in %{MATCHED_VAR_NAME}'",
    seeAlso: ['MATCHED_VAR', 'MATCHED_VARS_NAMES', 'msg'],
  },

  MATCHED_VARS_NAMES: {
    summary: l(
      'The names of every variable that matched, not just the last one. In a rule over a whole collection this is what tells you which fields were involved.',
      'Имена всех совпавших переменных, а не только последней. В правиле по целой коллекции именно они говорят, какие поля оказались задействованы.',
    ),
    syntax: '%{MATCHED_VARS_NAMES}',
    seeAlso: ['MATCHED_VAR_NAME', 'MATCHED_VARS'],
  },

  TIME: {
    summary: l(
      'The current local time as HH:MM:SS. ModSecurity also exposes the parts separately — TIME_HOUR, TIME_DAY, TIME_WDAY and so on — which is what time-window rules actually use.',
      'Текущее локальное время в формате ЧЧ:ММ:СС. ModSecurity отдаёт и части по отдельности — TIME_HOUR, TIME_DAY, TIME_WDAY и прочие, — именно ими и пользуются правила про временные окна.',
    ),
    syntax: 'SecRule TIME_HOUR "@lt 6" "id:1310,phase:1,pass,nolog,setvar:tx.night=1"',
    gotchas: [
      l(
        'The clock is the server local time — a rule written against office hours breaks the moment the server runs in UTC.',
        'Часы — локальное время сервера: правило, написанное под рабочие часы, ломается, как только сервер живёт в UTC.',
      ),
    ],
    seeAlso: ['TIME_EPOCH', 'DURATION'],
  },

  TIME_EPOCH: {
    summary: l(
      'The current time in seconds since 1970. Convenient for arithmetic: store it in a collection and compare later to measure an interval.',
      'Текущее время в секундах с 1970 года. Удобно для арифметики: сохранить в коллекции и позже сравнить, чтобы измерить интервал.',
    ),
    syntax: 'setvar:ip.last_seen=%{TIME_EPOCH}',
    seeAlso: ['TIME', 'DURATION', 'setvar'],
  },

  UNIQUE_ID: {
    summary: l(
      'The identifier assigned to this transaction. It appears in the error log, the audit log and, if you configure it, the access log — the thread that ties three files together during an investigation.',
      'Идентификатор, назначенный этой транзакции. Он есть в error-логе, журнале аудита и, если настроить, в журнале доступа — та нить, которая при разборе связывает три файла.',
    ),
    syntax: '%{UNIQUE_ID}',
    seeAlso: ['logdata', 'auditlog', 'SecAuditLog'],
  },

  DURATION: {
    summary: l(
      'Milliseconds elapsed since the transaction started. In phase 5 it measures the whole request, which makes it the basis for "slow endpoint" rules.',
      'Миллисекунды с начала транзакции. В фазе 5 измеряет весь запрос, поэтому служит основой для правил про «медленный эндпоинт».',
    ),
    syntax: 'SecRule DURATION "@gt 5000" "id:1311,phase:5,pass,log,msg:\'Slow request\'"',
    seeAlso: ['TIME_EPOCH', 'phase'],
  },

  HIGHEST_SEVERITY: {
    summary: l(
      'The severity of the most serious rule that has matched so far. Since the scale is inverted, "most serious" means the numerically smallest value; 255 means nothing has matched.',
      'Серьёзность самого серьёзного из сработавших правил. Шкала обратная, поэтому «самый серьёзный» — это численно наименьшее значение; 255 означает, что не сработало ничего.',
    ),
    syntax: 'SecRule HIGHEST_SEVERITY "@le 2" "id:1312,phase:5,pass,log,msg:\'Critical event seen\'"',
    seeAlso: ['severity', 'TX', 'phase'],
  },

  XML: {
    summary: l(
      'The parsed XML body, addressed with XPath. Only exists after the XML body processor has been switched on for the request.',
      'Разобранное XML-тело, адресуемое через XPath. Существует только после того, как для запроса включён XML-обработчик тела.',
    ),
    syntax: "XML:/*  |  XML://soap:Body/*",
    tech: {
      scope: l(
        'Enabled with ctl:requestBodyProcessor=XML in phase 1; namespaces are declared with the xmlns action.',
        'Включается через ctl:requestBodyProcessor=XML в фазе 1; пространства имён объявляются действием xmlns.',
      ),
    },
    seeAlso: ['ctl', 'xmlns', 'validateSchema', 'validateDTD'],
  },

  ENV: {
    summary: l(
      'Environment variables of the current request, including the ones set by setenv. The channel between rules and the rest of the web server.',
      'Переменные окружения текущего запроса, включая выставленные через setenv. Канал между правилами и остальным веб-сервером.',
    ),
    syntax: 'ENV:MODSEC_FLAG',
    seeAlso: ['setenv', 'exec'],
  },

  RULE: {
    summary: l(
      'The metadata of the rule that is currently running: RULE:id, RULE:msg, RULE:severity, RULE:logdata. Mostly used to write generic log messages that describe themselves.',
      'Метаданные выполняющегося сейчас правила: RULE:id, RULE:msg, RULE:severity, RULE:logdata. В основном используется, чтобы писать обобщённые сообщения лога, описывающие сами себя.',
    ),
    syntax: "logdata:'Rule %{RULE.id} matched'",
    seeAlso: ['id', 'msg', 'logdata', 'tag'],
  },

  MULTIPART_STRICT_ERROR: {
    summary: l(
      'Set to 1 when the multipart parser saw something that violates the strict rules — a broken boundary, a header where there should be none, data outside the parts. Classic smuggling territory.',
      'Выставляется в 1, когда multipart-парсер увидел нарушение строгих правил: сломанную границу, заголовок там, где его быть не должно, данные вне частей. Классическая территория протаскивания нагрузки.',
    ),
    syntax: 'SecRule MULTIPART_STRICT_ERROR "!@eq 0" "id:1313,phase:2,deny,msg:\'Multipart anomaly\'"',
    gotchas: [
      l(
        'Old or homegrown HTTP clients trip this legitimately — check the flag against real traffic before blocking on it.',
        'Старые или самописные HTTP-клиенты поднимают этот флаг законно — проверьте его на реальном трафике, прежде чем по нему блокировать.',
      ),
    ],
    seeAlso: ['REQBODY_ERROR', 'FILES', 'REQUEST_BODY'],
  },

  REQBODY_ERROR: {
    summary: l(
      'Set to 1 when body processing failed: unparsable content, a limit exceeded, a processor error. The accompanying REQBODY_ERROR_MSG explains what went wrong.',
      'Выставляется в 1, когда обработка тела не удалась: неразбираемое содержимое, превышенный лимит, ошибка обработчика. Соседняя REQBODY_ERROR_MSG объясняет, что именно случилось.',
    ),
    syntax: 'SecRule REQBODY_ERROR "!@eq 0" "id:1314,phase:2,deny,logdata:\'%{REQBODY_ERROR_MSG}\'"',
    gotchas: [
      l(
        'If the body could not be parsed, the rules over ARGS never ran. Letting such a request through means letting it through uninspected.',
        'Если тело не разобрано, правила по ARGS не выполнялись. Пропустить такой запрос — значит пропустить его без проверки.',
      ),
    ],
    seeAlso: ['MULTIPART_STRICT_ERROR', 'REQUEST_BODY', 'SecRequestBodyLimit'],
  },
};
