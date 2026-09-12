/**
 * Готовые варианты для полей свободного ввода.
 *
 * `semantics.ts` описывает, что конструкции ЗНАЧАТ, и этого хватает, чтобы
 * гасить несовместимые поля. Но там, где ModSecurity ждёт произвольную
 * строку — имя заголовка, значение оператора, метку, `setvar` — знание
 * семантики не помогает: человек должен помнить наизусть и `User-Agent`, и
 * `tx.anomaly_score`, и синтаксис `%{MATCHED_VAR}`.
 *
 * Здесь собрано то, что обычно пишут в этих полях: значение плюс короткое
 * пояснение, зачем оно нужно. Списки подсказывают, а не ограничивают —
 * поля остаются свободными, любой свой вариант вводится как раньше.
 *
 * Модуль не зависит от React: подписи хранятся двуязычными, как и в
 * `semantics.ts`, а переводит их уже UI.
 */

import { operatorMeta, variableMeta, VARIABLE_NAMES } from './semantics';
import { lookupTag, workspaceTags, type TagIndex } from './tags';
import {
  collectionVariables,
  lookupVariable,
  type VariableIndex,
} from './variables';
import type { Label, TargetLike, ValueKind } from './semantics';

/** Один вариант выпадающего списка: что подставится и что это значит. */
export interface Suggestion {
  /** Значение, которое попадёт в поле. */
  value: string;
  /** Пояснение под значением. */
  hint: Label;
  /** Заголовок группы; варианты одной группы идут в списке подряд. */
  group?: Label;
  /**
   * Сколько раз переменная встречается в наборе (записи + чтения).
   *
   * Число справа в меню выбора: по нему видно, своё ли это имя или чужое,
   * к которому присваивание, скорее всего, и относится.
   */
  badge?: number;
}

/** Компактная запись одного варианта. */
function s(value: string, en: string, ru: string): Suggestion {
  return { value, hint: { en, ru } };
}

/** Приписывает вариантам общую группу — UI рисует её заголовком списка. */
function group(en: string, ru: string, items: Suggestion[]): Suggestion[] {
  const label: Label = { en, ru };
  return items.map((item) => ({ ...item, group: label }));
}

/* ------------------------------------------------------------------ */
/* Области проверки                                                    */
/* ------------------------------------------------------------------ */

/**
 * Порядок и состав групп списка переменных.
 *
 * Переменных полсотни, и плоским списком они не читаются. Группы идут от
 * запроса к ответу и дальше к служебным коллекциям — в том же порядке, в
 * котором ModSecurity их заполняет.
 */
const VARIABLE_GROUPS: Array<{ label: Label; names: string[] }> = [
  {
    label: { en: 'Request', ru: 'Запрос' },
    names: [
      'ARGS',
      'ARGS_NAMES',
      'ARGS_GET',
      'ARGS_GET_NAMES',
      'ARGS_POST',
      'ARGS_POST_NAMES',
      'ARGS_COMBINED_SIZE',
      'QUERY_STRING',
      'REQUEST_URI',
      'REQUEST_URI_RAW',
      'REQUEST_LINE',
      'REQUEST_METHOD',
      'REQUEST_PROTOCOL',
      'REQUEST_FILENAME',
      'REQUEST_BASENAME',
      'REQUEST_HEADERS',
      'REQUEST_HEADERS_NAMES',
      'REQUEST_COOKIES',
      'REQUEST_COOKIES_NAMES',
      'REQUEST_BODY',
      'REQUEST_BODY_LENGTH',
      'FILES',
      'FILES_NAMES',
      'FILES_SIZES',
    ],
  },
  {
    label: { en: 'Response', ru: 'Ответ' },
    names: ['RESPONSE_STATUS', 'RESPONSE_HEADERS', 'RESPONSE_CONTENT_TYPE', 'RESPONSE_BODY'],
  },
  {
    label: { en: 'Client and server', ru: 'Клиент и сервер' },
    names: [
      'REMOTE_ADDR',
      'REMOTE_HOST',
      'REMOTE_PORT',
      'REMOTE_USER',
      'SERVER_NAME',
      'SERVER_ADDR',
      'SERVER_PORT',
    ],
  },
  {
    label: { en: 'Collections', ru: 'Коллекции' },
    names: ['TX', 'IP', 'SESSION', 'USER', 'GEO', 'ENV', 'RULE', 'XML'],
  },
  {
    label: { en: 'Match', ru: 'Совпадение' },
    names: ['MATCHED_VAR', 'MATCHED_VARS', 'MATCHED_VAR_NAME', 'MATCHED_VARS_NAMES'],
  },
];

/**
 * Переменные списком с пояснениями и группами.
 *
 * Собирается из `VARIABLE_META`, чтобы список не разъезжался с базой
 * знаний: всё, что не попало ни в одну группу, оказывается в «Прочем», а
 * не пропадает из подсказок.
 */
export const VARIABLE_SUGGESTIONS: Suggestion[] = (() => {
  const grouped = new Set(VARIABLE_GROUPS.flatMap((entry) => entry.names));
  const rest = VARIABLE_NAMES.filter((name) => !grouped.has(name));

  const toSuggestion = (label: Label) => (name: string): Suggestion => ({
    value: name,
    hint: variableMeta(name)?.label ?? { en: name, ru: name },
    group: label,
  });

  return [
    ...VARIABLE_GROUPS.flatMap((entry) =>
      entry.names.filter((name) => variableMeta(name) !== null).map(toSuggestion(entry.label)),
    ),
    ...rest.map(toSuggestion({ en: 'Other', ru: 'Прочее' })),
  ];
})();

/* ------------------------------------------------------------------ */
/* Параметры областей проверки                                         */
/* ------------------------------------------------------------------ */

const REQUEST_HEADER_NAMES = group('Request headers', 'Заголовки запроса', [
  s('User-Agent', 'Client application — the usual bot giveaway', 'Клиентское приложение — обычная примета ботов'),
  s('Host', 'Requested host name', 'Запрошенное имя хоста'),
  s('Referer', 'Page the request came from', 'Страница, с которой пришёл запрос'),
  s('Cookie', 'Whole cookie header as one string', 'Весь заголовок Cookie одной строкой'),
  s('Content-Type', 'Body format', 'Формат тела запроса'),
  s('Content-Length', 'Declared body size', 'Заявленный размер тела'),
  s('Authorization', 'Credentials', 'Учётные данные'),
  s('Accept', 'Formats the client accepts', 'Форматы, которые принимает клиент'),
  s('Accept-Encoding', 'Compression the client accepts', 'Сжатие, которое принимает клиент'),
  s('Accept-Language', 'Client languages', 'Языки клиента'),
  s('Origin', 'Source of a cross-origin request', 'Источник кросс-доменного запроса'),
  s('X-Forwarded-For', 'Client address behind a proxy — easy to forge', 'Адрес клиента за прокси — легко подделать'),
  s('X-Real-IP', 'Client address set by the proxy', 'Адрес клиента, проставленный прокси'),
  s('X-Requested-With', 'Marker of an AJAX request', 'Признак AJAX-запроса'),
  s('Range', 'Requested byte range', 'Запрошенный диапазон байтов'),
  s('Transfer-Encoding', 'Chunked transfer — used for smuggling', 'Порционная передача — используется в smuggling'),
  s('Connection', 'Connection management', 'Управление соединением'),
]);

const RESPONSE_HEADER_NAMES = group('Response headers', 'Заголовки ответа', [
  s('Content-Type', 'Response format', 'Формат ответа'),
  s('Content-Length', 'Response size', 'Размер ответа'),
  s('Content-Disposition', 'File download', 'Отдача файла'),
  s('Location', 'Redirect target', 'Адрес перенаправления'),
  s('Set-Cookie', 'Cookie being set', 'Устанавливаемая Cookie'),
  s('Server', 'Server software — discloses the version', 'Серверное ПО — раскрывает версию'),
  s('X-Powered-By', 'Platform — discloses the stack', 'Платформа — раскрывает стек'),
  s('Cache-Control', 'Caching rules', 'Правила кеширования'),
  s('Access-Control-Allow-Origin', 'CORS policy', 'Политика CORS'),
]);

const COOKIE_NAMES = group('Common cookies', 'Частые Cookie', [
  s('PHPSESSID', 'PHP session', 'Сессия PHP'),
  s('JSESSIONID', 'Java session', 'Сессия Java'),
  s('ASP.NET_SessionId', 'ASP.NET session', 'Сессия ASP.NET'),
  s('sessionid', 'Session id (Django and friends)', 'Идентификатор сессии (Django и подобные)'),
  s('session', 'Session id', 'Идентификатор сессии'),
  s('csrftoken', 'CSRF token', 'Токен CSRF'),
  s('XSRF-TOKEN', 'CSRF token (Angular, Laravel)', 'Токен CSRF (Angular, Laravel)'),
  s('auth_token', 'Authentication token', 'Токен аутентификации'),
  s('remember_token', 'Persistent login', 'Долгий вход'),
  s('lang', 'Interface language', 'Язык интерфейса'),
]);

const ARG_NAMES = [
  ...group('Frequent targets', 'Частые цели', [
    s('id', 'Record id — classic SQL injection target', 'Идентификатор записи — классическая цель SQL-инъекции'),
    s('q', 'Search query — classic XSS target', 'Поисковый запрос — классическая цель XSS'),
    s('search', 'Search query', 'Поисковый запрос'),
    s('url', 'Address — open redirect and SSRF', 'Адрес — открытое перенаправление и SSRF'),
    s('redirect', 'Redirect target', 'Адрес перенаправления'),
    s('next', 'Where to go after the action', 'Куда перейти после действия'),
    s('return_url', 'Return address', 'Адрес возврата'),
    s('callback', 'JSONP callback — XSS', 'Функция JSONP — XSS'),
  ]),
  ...group('Files and paths', 'Файлы и пути', [
    s('file', 'File name — path traversal', 'Имя файла — обход каталогов'),
    s('filename', 'File name', 'Имя файла'),
    s('path', 'Path — path traversal', 'Путь — обход каталогов'),
    s('dir', 'Directory', 'Каталог'),
    s('page', 'Page or template — file inclusion', 'Страница или шаблон — включение файлов'),
    s('template', 'Template — file inclusion', 'Шаблон — включение файлов'),
    s('include', 'Included file', 'Подключаемый файл'),
    s('cmd', 'Command — command injection', 'Команда — внедрение команд'),
  ]),
  ...group('Accounts', 'Учётные данные', [
    s('user', 'User name', 'Имя пользователя'),
    s('username', 'User name', 'Имя пользователя'),
    s('login', 'Login', 'Логин'),
    s('email', 'Email address', 'Адрес почты'),
    s('password', 'Password — never log it', 'Пароль — не логировать'),
    s('token', 'Token', 'Токен'),
    s('csrf_token', 'CSRF token', 'Токен CSRF'),
  ]),
  ...group('Listings', 'Списки и выборки', [
    s('sort', 'Sort field — SQL injection in ORDER BY', 'Поле сортировки — SQL-инъекция в ORDER BY'),
    s('order', 'Sort direction', 'Направление сортировки'),
    s('limit', 'Number of records', 'Количество записей'),
    s('offset', 'Offset', 'Смещение'),
    s('format', 'Response format', 'Формат ответа'),
    s('lang', 'Language', 'Язык'),
  ]),
];

const FILE_FIELD_NAMES = group('Upload fields', 'Поля загрузки', [
  s('file', 'Generic upload field', 'Обычное поле загрузки'),
  s('upload', 'Upload field', 'Поле загрузки'),
  s('avatar', 'Profile picture', 'Аватар пользователя'),
  s('attachment', 'Attachment', 'Вложение'),
  s('document', 'Document', 'Документ'),
  s('image', 'Image', 'Изображение'),
  s('photo', 'Photo', 'Фотография'),
]);

const TX_NAMES = [
  ...group('Anomaly score (CRS)', 'Счёт аномалий (CRS)', [
    s('anomaly_score', 'Running anomaly score of the request', 'Накопленный счёт аномалий запроса'),
    s('inbound_anomaly_score', 'Inbound total', 'Итог по входящему запросу'),
    s('outbound_anomaly_score', 'Outbound total', 'Итог по ответу'),
    s('inbound_anomaly_score_threshold', 'Blocking threshold for the request', 'Порог блокировки запроса'),
    s('outbound_anomaly_score_threshold', 'Blocking threshold for the response', 'Порог блокировки ответа'),
    s('critical_anomaly_score', 'Weight of a critical hit (5)', 'Вес критического срабатывания (5)'),
    s('error_anomaly_score', 'Weight of an error hit (4)', 'Вес срабатывания уровня «ошибка» (4)'),
    s('warning_anomaly_score', 'Weight of a warning hit (3)', 'Вес предупреждения (3)'),
    s('notice_anomaly_score', 'Weight of a notice hit (2)', 'Вес замечания (2)'),
  ]),
  ...group('Paranoia level (CRS)', 'Уровень паранойи (CRS)', [
    s('paranoia_level', 'Level the current rule belongs to', 'Уровень, к которому относится правило'),
    s('detection_paranoia_level', 'Level up to which rules run', 'Уровень, до которого правила выполняются'),
    s('blocking_paranoia_level', 'Level up to which rules block', 'Уровень, до которого правила блокируют'),
    s('executing_paranoia_level', 'Level being executed right now', 'Уровень, который выполняется сейчас'),
  ]),
  ...group('Limits (CRS)', 'Ограничения (CRS)', [
    s('allowed_methods', 'Allowed HTTP methods', 'Разрешённые методы HTTP'),
    s('allowed_request_content_type', 'Allowed body formats', 'Разрешённые форматы тела'),
    s('max_num_args', 'Maximum number of parameters', 'Максимум параметров'),
    s('arg_name_length', 'Maximum parameter name length', 'Максимальная длина имени параметра'),
    s('arg_length', 'Maximum parameter value length', 'Максимальная длина значения параметра'),
    s('total_arg_length', 'Maximum total parameters length', 'Максимальная суммарная длина параметров'),
    s('combined_file_sizes', 'Maximum total upload size', 'Максимальный суммарный размер загрузок'),
    s('restricted_extensions', 'Forbidden file extensions', 'Запрещённые расширения файлов'),
  ]),
  ...group('Capture groups', 'Захваченные группы', [
    s('0', 'Whole match — needs the "capture" action', 'Весь текст совпадения — нужен «capture»'),
    s('1', 'First capture group', 'Первая скобочная группа'),
    s('2', 'Second capture group', 'Вторая скобочная группа'),
  ]),
];

const IP_NAMES = group('Per-address counters', 'Счётчики по адресу', [
  s('dos_counter', 'Requests within the window', 'Запросы за окно наблюдения'),
  s('dos_burst_counter', 'Bursts detected', 'Замеченные всплески'),
  s('dos_block', 'Address is under a rate-limit block', 'Адрес заблокирован лимитом'),
  s('dos_block_counter', 'How many times it was blocked', 'Сколько раз блокировался'),
  s('reput_block_flag', 'Address has a bad reputation', 'Адрес с плохой репутацией'),
  s('reput_block_reason', 'Why the reputation is bad', 'Причина плохой репутации'),
  s('previous_rbl_check', 'Time of the last RBL check', 'Время последней проверки в RBL'),
  s('blocked', 'Custom block flag', 'Свой признак блокировки'),
]);

const SESSION_NAMES = group('Session', 'Сессия', [
  s('score', 'Accumulated session score', 'Накопленный счёт сессии'),
  s('blocked', 'Session is blocked', 'Сессия заблокирована'),
  s('username', 'User of the session', 'Пользователь сессии'),
  s('last_update_time', 'Last activity', 'Последняя активность'),
]);

const USER_NAMES = group('User', 'Пользователь', [
  s('score', 'Accumulated user score', 'Накопленный счёт пользователя'),
  s('blocked', 'User is blocked', 'Пользователь заблокирован'),
  s('username', 'User name', 'Имя пользователя'),
]);

const GEO_NAMES = group('Geo data', 'Геоданные', [
  s('COUNTRY_CODE', 'Two-letter country code', 'Двухбуквенный код страны'),
  s('COUNTRY_CODE3', 'Three-letter country code', 'Трёхбуквенный код страны'),
  s('COUNTRY_NAME', 'Country name', 'Название страны'),
  s('COUNTRY_CONTINENT', 'Continent', 'Континент'),
  s('REGION', 'Region', 'Регион'),
  s('CITY', 'City', 'Город'),
  s('POSTAL_CODE', 'Postal code', 'Почтовый индекс'),
  s('LATITUDE', 'Latitude', 'Широта'),
  s('LONGITUDE', 'Longitude', 'Долгота'),
]);

const ENV_NAMES = group('Environment', 'Окружение', [
  s('DOCUMENT_ROOT', 'Site root directory', 'Корневой каталог сайта'),
  s('SERVER_SOFTWARE', 'Server software', 'Серверное ПО'),
  s('HTTPS', 'Connection is encrypted', 'Соединение зашифровано'),
  s('PATH', 'Executable search path', 'Пути поиска программ'),
  s('UNIQUE_ID', 'Request id set by the server', 'Идентификатор запроса от сервера'),
]);

const RULE_NAMES = group('Current rule', 'Текущее правило', [
  s('id', 'Rule id', 'Идентификатор правила'),
  s('rev', 'Rule revision', 'Ревизия правила'),
  s('severity', 'Rule severity', 'Критичность правила'),
  s('msg', 'Rule message', 'Сообщение правила'),
  s('logdata', 'Rule log data', 'Данные правила для лога'),
]);

const XML_PATHS = group('XPath', 'XPath', [
  s('/*', 'Root element', 'Корневой элемент'),
  s('//@*', 'All attributes', 'Все атрибуты'),
  s('//text()', 'All text nodes', 'Весь текст'),
  s('count(//*)', 'Number of nodes', 'Количество узлов'),
]);

const SELECTOR_SUGGESTIONS: Record<string, Suggestion[]> = {
  ARGS: ARG_NAMES,
  ARGS_NAMES: ARG_NAMES,
  ARGS_GET: ARG_NAMES,
  ARGS_GET_NAMES: ARG_NAMES,
  ARGS_POST: ARG_NAMES,
  ARGS_POST_NAMES: ARG_NAMES,

  REQUEST_HEADERS: REQUEST_HEADER_NAMES,
  REQUEST_HEADERS_NAMES: REQUEST_HEADER_NAMES,
  RESPONSE_HEADERS: RESPONSE_HEADER_NAMES,

  REQUEST_COOKIES: COOKIE_NAMES,
  REQUEST_COOKIES_NAMES: COOKIE_NAMES,

  FILES: FILE_FIELD_NAMES,
  FILES_NAMES: FILE_FIELD_NAMES,
  FILES_SIZES: FILE_FIELD_NAMES,

  TX: TX_NAMES,
  IP: IP_NAMES,
  SESSION: SESSION_NAMES,
  USER: USER_NAMES,
  GEO: GEO_NAMES,
  ENV: ENV_NAMES,
  RULE: RULE_NAMES,
  XML: XML_PATHS,
};

/**
 * Варианты параметра (`VAR:selector`) для конкретной переменной.
 *
 * Пусто там, где параметра нет вовсе или он ничем не ограничен: подсказка
 * наугад хуже её отсутствия — она выглядит как список допустимого.
 */
export function selectorSuggestions(variable: string): Suggestion[] {
  if (variableMeta(variable)?.selector === 'none') return [];
  return SELECTOR_SUGGESTIONS[variable] ?? [];
}

/* ------------------------------------------------------------------ */
/* Значения операторов                                                 */
/* ------------------------------------------------------------------ */

const HTTP_METHODS = group('HTTP methods', 'Методы HTTP', [
  s('GET', 'Fetch a resource', 'Получение ресурса'),
  s('POST', 'Send data', 'Отправка данных'),
  s('HEAD', 'Headers only', 'Только заголовки'),
  s('PUT', 'Replace a resource', 'Замена ресурса'),
  s('PATCH', 'Partial update', 'Частичное изменение'),
  s('DELETE', 'Delete a resource', 'Удаление ресурса'),
  s('OPTIONS', 'Supported methods', 'Список поддерживаемых методов'),
  s('TRACE', 'Echo of the request — usually disabled', 'Эхо запроса — обычно запрещают'),
  s('CONNECT', 'Tunnel — usually disabled', 'Туннель — обычно запрещают'),
  s('PROPFIND', 'WebDAV — usually disabled', 'WebDAV — обычно запрещают'),
]);

const HTTP_PROTOCOLS = group('Protocol versions', 'Версии протокола', [
  s('HTTP/1.1', 'Current version of HTTP/1', 'Текущая версия HTTP/1'),
  s('HTTP/1.0', 'Obsolete version — a bot marker', 'Устаревшая версия — признак бота'),
  s('HTTP/2', 'HTTP/2', 'HTTP/2'),
  s('HTTP/2.0', 'HTTP/2 as some clients spell it', 'HTTP/2 в написании части клиентов'),
]);

const CONTENT_TYPES = group('Content types', 'Типы содержимого', [
  s('application/x-www-form-urlencoded', 'HTML form', 'Обычная HTML-форма'),
  s('multipart/form-data', 'Form with file uploads', 'Форма с загрузкой файлов'),
  s('application/json', 'JSON', 'JSON'),
  s('application/xml', 'XML', 'XML'),
  s('text/xml', 'XML (legacy spelling)', 'XML (старое написание)'),
  s('application/soap+xml', 'SOAP', 'SOAP'),
  s('text/plain', 'Plain text', 'Простой текст'),
  s('text/html', 'HTML', 'HTML'),
  s('application/octet-stream', 'Binary stream', 'Двоичный поток'),
]);

const USER_AGENTS = [
  ...group('Scanners and tools', 'Сканеры и утилиты', [
    s('sqlmap', 'SQL injection scanner', 'Сканер SQL-инъекций'),
    s('nikto', 'Web vulnerability scanner', 'Сканер веб-уязвимостей'),
    s('nmap', 'Port and service scanner', 'Сканер портов и сервисов'),
    s('masscan', 'Fast network scanner', 'Быстрый сканер сети'),
    s('wpscan', 'WordPress scanner', 'Сканер WordPress'),
    s('acunetix', 'Commercial vulnerability scanner', 'Коммерческий сканер уязвимостей'),
    s('nessus', 'Commercial vulnerability scanner', 'Коммерческий сканер уязвимостей'),
    s('gobuster', 'Directory brute forcer', 'Перебор каталогов'),
    s('dirbuster', 'Directory brute forcer', 'Перебор каталогов'),
  ]),
  ...group('HTTP clients', 'HTTP-клиенты', [
    s('curl', 'Command line client', 'Клиент командной строки'),
    s('wget', 'Command line downloader', 'Загрузчик командной строки'),
    s('python-requests', 'Python script', 'Скрипт на Python'),
    s('Go-http-client', 'Go program', 'Программа на Go'),
    s('libwww-perl', 'Perl script', 'Скрипт на Perl'),
    s('Java/', 'Java program', 'Программа на Java'),
  ]),
  ...group('Crawlers', 'Поисковые роботы', [
    s('Googlebot', 'Google crawler', 'Робот Google'),
    s('bingbot', 'Bing crawler', 'Робот Bing'),
    s('YandexBot', 'Yandex crawler', 'Робот Яндекса'),
    s('AhrefsBot', 'SEO crawler', 'SEO-робот'),
    s('SemrushBot', 'SEO crawler', 'SEO-робот'),
  ]),
];

const SENSITIVE_PATHS = group('Frequently probed paths', 'Частые цели сканирования', [
  s('/.env', 'Application secrets', 'Секреты приложения'),
  s('/.git', 'Repository — leaks the source code', 'Репозиторий — утечка исходников'),
  s('/wp-login.php', 'WordPress login', 'Вход в WordPress'),
  s('/wp-admin', 'WordPress admin area', 'Админка WordPress'),
  s('/xmlrpc.php', 'WordPress XML-RPC — brute force target', 'XML-RPC WordPress — цель перебора'),
  s('/phpmyadmin', 'Database admin panel', 'Панель управления базой'),
  s('/server-status', 'Apache status page', 'Страница состояния Apache'),
  s('/actuator', 'Spring Boot endpoints', 'Служебные точки Spring Boot'),
  s('/cgi-bin/', 'CGI scripts', 'CGI-скрипты'),
  s('/admin', 'Admin area', 'Административный раздел'),
]);

const COUNTRY_CODES = group('Country codes', 'Коды стран', [
  s('RU', 'Russia', 'Россия'),
  s('US', 'United States', 'США'),
  s('CN', 'China', 'Китай'),
  s('DE', 'Germany', 'Германия'),
  s('NL', 'Netherlands', 'Нидерланды'),
  s('FR', 'France', 'Франция'),
  s('GB', 'United Kingdom', 'Великобритания'),
  s('UA', 'Ukraine', 'Украина'),
  s('BR', 'Brazil', 'Бразилия'),
  s('IN', 'India', 'Индия'),
]);

const REGEX_PATTERNS = group('Common patterns', 'Частые шаблоны', [
  s('(?i)', 'Prefix that makes the rest case-insensitive', 'Префикс: дальше регистр не важен'),
  s('^$', 'Empty value', 'Пустое значение'),
  s('^\\d+$', 'Digits only', 'Только цифры'),
  s('^[\\w.-]+$', 'Letters, digits, dot and hyphen only', 'Только буквы, цифры, точка и дефис'),
  s('(?i)(?:union[\\s\\S]*?select|select[\\s\\S]*?from)', 'SQL injection giveaway', 'Признак SQL-инъекции'),
  s('(?i)<\\s*script', 'Start of a script tag', 'Начало тега script'),
  s('(?i)(?:javascript|vbscript|data):', 'Dangerous URI schemes', 'Опасные схемы URI'),
  s('(?:\\.\\./|\\.\\.\\\\)', 'Path traversal', 'Обход каталогов'),
  s('(?i)(?:/etc/passwd|boot\\.ini|win\\.ini)', 'Reading system files', 'Чтение системных файлов'),
  s('(?i)\\b(?:curl|wget|nc|bash|sh|python)\\b', 'Shell commands', 'Команды оболочки'),
]);

const IP_RANGES = group('Networks and addresses', 'Сети и адреса', [
  s('127.0.0.1', 'Loopback', 'Локальная петля'),
  s('::1', 'Loopback (IPv6)', 'Локальная петля (IPv6)'),
  s('10.0.0.0/8', 'Private network', 'Частная сеть'),
  s('172.16.0.0/12', 'Private network', 'Частная сеть'),
  s('192.168.0.0/16', 'Private network', 'Частная сеть'),
  s('169.254.0.0/16', 'Link-local addresses', 'Адреса link-local'),
  s('100.64.0.0/10', 'Carrier-grade NAT', 'Адреса провайдерского NAT'),
  s('0.0.0.0/0', 'Any address', 'Любой адрес'),
]);

const BYTE_RANGES = group('Byte ranges', 'Диапазоны байтов', [
  s('1-255', 'Anything but a null byte', 'Что угодно, кроме нулевого байта'),
  s('9,10,13,32-126', 'Printable ASCII plus tab and newline', 'Печатный ASCII плюс табуляция и перевод строки'),
  s('32-126', 'Printable ASCII only', 'Только печатный ASCII'),
  s('38,44-46,48-58,61,65-90,95,97-122', 'Characters safe for a URL', 'Символы, безопасные для URL'),
]);

const DATA_FILES = group('CRS data files', 'Файлы данных CRS', [
  s('scanners-user-agents.data', 'Scanner user agents', 'User-Agent сканеров'),
  s('crawlers-user-agents.data', 'Crawler user agents', 'User-Agent поисковых роботов'),
  s('scripting-user-agents.data', 'Script user agents', 'User-Agent скриптов'),
  s('scanners-headers.data', 'Headers left by scanners', 'Заголовки, которые оставляют сканеры'),
  s('scanners-urls.data', 'Paths that scanners probe', 'Пути, которые щупают сканеры'),
  s('unix-shell.data', 'Unix shell commands', 'Команды оболочки Unix'),
  s('windows-powershell-commands.data', 'PowerShell commands', 'Команды PowerShell'),
  s('sql-errors.data', 'Database error texts', 'Тексты ошибок баз данных'),
  s('sql-function-names.data', 'SQL function names', 'Имена функций SQL'),
  s('php-function-names-933150.data', 'PHP function names', 'Имена функций PHP'),
  s('java-classes.data', 'Java class names', 'Имена классов Java'),
  s('lfi-os-files.data', 'System files worth reading', 'Системные файлы, интересные атакующему'),
  s('restricted-files.data', 'Files that must not be served', 'Файлы, которые нельзя отдавать'),
  s('restricted-upload.data', 'Extensions forbidden for upload', 'Расширения, запрещённые к загрузке'),
]);

const ATTACK_PHRASES = group('Attack fragments', 'Фрагменты атак', [
  s('union select', 'SQL injection', 'SQL-инъекция'),
  s('information_schema', 'Reading the database structure', 'Чтение структуры базы'),
  s('<script', 'XSS', 'XSS'),
  s('onerror=', 'XSS through an event handler', 'XSS через обработчик события'),
  s('../', 'Path traversal', 'Обход каталогов'),
  s('/etc/passwd', 'Reading a system file', 'Чтение системного файла'),
  s('cmd.exe', 'Running a Windows shell', 'Запуск оболочки Windows'),
  s('/bin/sh', 'Running a Unix shell', 'Запуск оболочки Unix'),
]);

const HTTP_STATUS_VALUES = group('Response codes', 'Коды ответа', [
  s('200', 'OK', 'Успешно'),
  s('301', 'Moved permanently', 'Постоянное перенаправление'),
  s('302', 'Found', 'Временное перенаправление'),
  s('400', 'Bad request', 'Некорректный запрос'),
  s('401', 'Unauthorized', 'Требуется аутентификация'),
  s('403', 'Forbidden', 'Доступ запрещён'),
  s('404', 'Not found', 'Не найдено'),
  s('405', 'Method not allowed', 'Метод не поддерживается'),
  s('429', 'Too many requests', 'Слишком много запросов'),
  s('500', 'Internal server error', 'Внутренняя ошибка сервера'),
  s('502', 'Bad gateway', 'Ошибка шлюза'),
  s('503', 'Service unavailable', 'Сервис недоступен'),
]);

const SIZE_VALUES = group('Sizes in bytes', 'Размеры в байтах', [
  s('1024', '1 KB', '1 КБ'),
  s('8192', '8 KB', '8 КБ'),
  s('65536', '64 KB', '64 КБ'),
  s('1048576', '1 MB', '1 МБ'),
  s('10485760', '10 MB', '10 МБ'),
]);

const SCORE_VALUES = group('CRS thresholds', 'Пороги CRS', [
  s('5', 'Default inbound blocking threshold', 'Стандартный порог блокировки запроса'),
  s('4', 'Default outbound blocking threshold', 'Стандартный порог блокировки ответа'),
  s('7', 'Stricter threshold', 'Более строгий порог'),
  s('10', 'Two critical hits', 'Два критических срабатывания'),
]);

const DURATION_VALUES = group('Milliseconds', 'Миллисекунды', [
  s('1000', '1 second', '1 секунда'),
  s('5000', '5 seconds', '5 секунд'),
  s('30000', '30 seconds', '30 секунд'),
]);

const PORT_VALUES = group('Ports', 'Порты', [
  s('80', 'HTTP', 'HTTP'),
  s('443', 'HTTPS', 'HTTPS'),
  s('8080', 'Alternative HTTP', 'Альтернативный HTTP'),
  s('8443', 'Alternative HTTPS', 'Альтернативный HTTPS'),
]);

/**
 * Ключ области проверки для поиска подсказок: `ПЕРЕМЕННАЯ` либо
 * `ПЕРЕМЕННАЯ:параметр`. Параметр приводится к нижнему регистру —
 * `User-Agent` и `user-agent` для HTTP одно и то же.
 *
 * Уточнение берётся только у единственного параметра: список вроде
 * `REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer` проверяет разные
 * вещи сразу, и подсказки по первой из них уводили бы в сторону.
 */
function subjectKeys(targets: TargetLike[]): string[] {
  const target = targets.find((item) => !item.excludeOnly) ?? targets[0];
  if (target === undefined) return [];
  const sole =
    target.mode === 'only' && target.params.length === 1
      ? target.params[0].trim().toLowerCase()
      : '';
  return sole === '' ? [target.name] : [`${target.name}:${sole}`, target.name];
}

/** Варианты значения, зависящие от того, что именно проверяется. */
const SUBJECT_VALUES: Record<string, Suggestion[]> = {
  REQUEST_METHOD: HTTP_METHODS,
  REQUEST_PROTOCOL: HTTP_PROTOCOLS,
  REQUEST_LINE: HTTP_METHODS,
  REQUEST_URI: SENSITIVE_PATHS,
  REQUEST_URI_RAW: SENSITIVE_PATHS,
  REQUEST_FILENAME: SENSITIVE_PATHS,
  RESPONSE_CONTENT_TYPE: CONTENT_TYPES,
  REMOTE_ADDR: IP_RANGES,
  SERVER_ADDR: IP_RANGES,
  'REQUEST_HEADERS:user-agent': USER_AGENTS,
  'REQUEST_HEADERS:content-type': CONTENT_TYPES,
  'REQUEST_HEADERS:accept': CONTENT_TYPES,
  'REQUEST_HEADERS:x-forwarded-for': IP_RANGES,
  'REQUEST_HEADERS:x-real-ip': IP_RANGES,
  'RESPONSE_HEADERS:content-type': CONTENT_TYPES,
  'GEO:country_code': COUNTRY_CODES,
};

/** Варианты числового значения, зависящие от области проверки. */
const SUBJECT_NUMBERS: Record<string, Suggestion[]> = {
  RESPONSE_STATUS: HTTP_STATUS_VALUES,
  REMOTE_PORT: PORT_VALUES,
  SERVER_PORT: PORT_VALUES,
  DURATION: DURATION_VALUES,
  REQUEST_BODY_LENGTH: SIZE_VALUES,
  ARGS_COMBINED_SIZE: SIZE_VALUES,
  FILES_SIZES: SIZE_VALUES,
  'TX:anomaly_score': SCORE_VALUES,
  'TX:inbound_anomaly_score': SCORE_VALUES,
  'TX:outbound_anomaly_score': SCORE_VALUES,
};

/** Первый непустой список из таблицы по ключам области проверки. */
function bySubject<T>(table: Record<string, T[]>, targets: TargetLike[]): T[] | null {
  for (const key of subjectKeys(targets)) {
    const found = table[key];
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Варианты значения оператора.
 *
 * Считается по трём вещам сразу: что оператор ждёт (`@ipMatch` — сети,
 * `@pmFromFile` — файл), что проверяется (`REQUEST_METHOD` — методы,
 * `User-Agent` — сканеры) и какой тип значения приходит на вход (подсчёт
 * `&` превращает любую проверку в числовую).
 */
export function operatorValueSuggestions(
  operator: string,
  targets: TargetLike[],
  inputKind: ValueKind,
): Suggestion[] {
  const arg = operatorMeta(operator)?.arg ?? 'string';

  if (arg === 'none') return [];
  if (arg === 'file') return DATA_FILES;
  if (arg === 'ipList') return IP_RANGES;
  if (arg === 'byteRange') return BYTE_RANGES;
  if (arg === 'phrases') return [...(bySubject(SUBJECT_VALUES, targets) ?? []), ...ATTACK_PHRASES];

  // Числу подсказывают только там, где известно, что именно считается: у
  // кода ответа это коды, у размера тела — размеры. Просто «числу»
  // подсказать нечего, а список из круглых значений с пояснением «десять»
  // отвечает на вопрос, которого не было, и обещает варианты там, где их
  // нет. Подсчёт `&` молчит и на знакомой области: у `&FILES_SIZES`
  // считаются файлы, а размеры из таблицы — про их содержимое.
  if (arg === 'number' || inputKind === 'number') {
    const counting = targets.some((target) => !target.excludeOnly && target.count);
    if (counting) return [];
    return bySubject(SUBJECT_NUMBERS, targets) ?? [];
  }

  const subject = bySubject(SUBJECT_VALUES, targets) ?? [];
  return arg === 'regex' ? [...subject, ...REGEX_PATTERNS] : subject;
}

/**
 * Значение, которое могло бы прийти в такую проверку.
 *
 * Подсказка примеру — не то же, что подсказка аргументу оператора. Аргумент
 * бывает значением только у сравнений с текстом и числом: `@streq POST`
 * действительно проверяют на `POST`, и такая подсказка отвечает на самый
 * частый вопрос — доедет ли до оператора то, с чем он сравнивает. Шаблон
 * `@rx`, имя файла `@pmFromFile` или диапазон байтов на вход проверки не
 * приходят никогда, и предложить проверить регулярку самой собой значит
 * предложить бессмыслицу: конвейер прогонит её как текст, а сравнение с
 * собственным шаблоном не расскажет о правиле ничего.
 *
 * Таким операторам пример подсказывает область проверки: у `REQUEST_METHOD`
 * это методы, у `User-Agent` — сканеры. Не знаем ни того, ни другого — поле
 * остаётся пустым: пример придумывает человек, и подсказка наугад ему
 * только мешает.
 */
export function sampleValueHint(
  operator: { name: string; argument: string },
  targets: TargetLike[],
): string {
  const arg = operatorMeta(operator.name)?.arg ?? 'string';
  const argument = operator.argument.trim();
  // Макрос — тоже не значение: что в нём окажется, знает только движок.
  const literal = (arg === 'string' || arg === 'number') && !/%\{/.test(argument);
  if (literal && argument !== '') return argument;

  // Таблицы значений не пересекаются: числовые области проверки стоят в
  // одной, текстовые в другой, — поэтому тип входа тут спрашивать не нужно.
  const subject = bySubject(SUBJECT_VALUES, targets) ?? bySubject(SUBJECT_NUMBERS, targets);
  return subject?.[0]?.value ?? '';
}

/* ------------------------------------------------------------------ */
/* Что обычно ставят на этой области проверки                          */
/* ------------------------------------------------------------------ */

/**
 * Преобразования, которые пишут на этой области проверки чаще всего.
 *
 * `semantics.ts` отвечает на вопрос «применимо ли это вообще» — по типу
 * значения. Здесь ответ на другой вопрос, который база знаний дать не
 * может: из применимого выбрать то, что осмысленно именно здесь. Путь
 * нормализуют, у заголовка снимают регистр, параметр запроса сначала
 * раскодируют — и всё это одинаково «применимо» к строке.
 *
 * Список не ограничивает: остальное лежит в полном списке рядом.
 */
const SUBJECT_TRANSFORMS: Record<string, string[]> = {
  ARGS: ['urlDecodeUni', 'htmlEntityDecode', 'lowercase', 'removeNulls', 'replaceComments'],
  ARGS_GET: ['urlDecodeUni', 'htmlEntityDecode', 'lowercase', 'removeNulls', 'replaceComments'],
  ARGS_POST: ['urlDecodeUni', 'htmlEntityDecode', 'lowercase', 'removeNulls', 'replaceComments'],
  ARGS_NAMES: ['urlDecodeUni', 'lowercase', 'removeNulls'],
  ARGS_GET_NAMES: ['urlDecodeUni', 'lowercase', 'removeNulls'],
  ARGS_POST_NAMES: ['urlDecodeUni', 'lowercase', 'removeNulls'],
  QUERY_STRING: ['urlDecodeUni', 'lowercase', 'removeNulls', 'compressWhitespace'],

  REQUEST_URI: ['urlDecodeUni', 'normalizePath', 'lowercase', 'removeNulls'],
  REQUEST_URI_RAW: ['urlDecodeUni', 'normalizePath', 'lowercase', 'removeNulls'],
  REQUEST_FILENAME: ['urlDecodeUni', 'normalizePath', 'lowercase'],
  REQUEST_BASENAME: ['urlDecodeUni', 'normalizePath', 'lowercase'],
  REQUEST_LINE: ['urlDecodeUni', 'lowercase', 'compressWhitespace'],
  REQUEST_METHOD: ['trim', 'uppercase'],
  REQUEST_PROTOCOL: ['trim', 'uppercase'],

  REQUEST_HEADERS: ['lowercase', 'removeNulls', 'compressWhitespace', 'trim'],
  REQUEST_HEADERS_NAMES: ['lowercase', 'trim'],
  'REQUEST_HEADERS:user-agent': ['lowercase', 'removeNulls', 'urlDecodeUni'],
  'REQUEST_HEADERS:referer': ['urlDecodeUni', 'lowercase', 'normalizePath'],
  'REQUEST_HEADERS:cookie': ['urlDecodeUni', 'lowercase', 'removeNulls'],
  'REQUEST_HEADERS:content-type': ['lowercase', 'trim'],
  REQUEST_COOKIES: ['urlDecodeUni', 'lowercase', 'removeNulls'],
  REQUEST_COOKIES_NAMES: ['urlDecodeUni', 'lowercase'],

  REQUEST_BODY: ['urlDecodeUni', 'htmlEntityDecode', 'lowercase', 'removeNulls', 'replaceComments'],
  RESPONSE_BODY: ['lowercase', 'compressWhitespace'],
  RESPONSE_HEADERS: ['lowercase', 'trim'],

  FILES: ['lowercase', 'urlDecodeUni', 'normalizePath'],
  FILES_NAMES: ['lowercase', 'urlDecodeUni'],
};

/** Преобразования, уместные почти везде, — когда об области сказать нечего. */
const DEFAULT_TRANSFORMS = ['lowercase', 'urlDecodeUni', 'removeNulls', 'trim'];

/**
 * Операторы, которыми проверяют эту область чаще всего.
 *
 * Адрес сравнивают с сетью, а не с подстрокой; путь — началом, а не
 * равенством; `User-Agent` — списком фраз из файла CRS. Всё это одинаково
 * допустимо по типу значения, и без подсказки выбор упирается в опыт.
 */
const SUBJECT_OPERATORS: Record<string, string[]> = {
  ARGS: ['rx', 'detectSQLi', 'detectXSS', 'pm', 'contains'],
  ARGS_GET: ['rx', 'detectSQLi', 'detectXSS', 'pm'],
  ARGS_POST: ['rx', 'detectSQLi', 'detectXSS', 'pm'],
  ARGS_NAMES: ['rx', 'pm', 'streq'],
  QUERY_STRING: ['rx', 'detectSQLi', 'detectXSS', 'contains'],

  REQUEST_METHOD: ['streq', 'pm', 'rx'],
  REQUEST_PROTOCOL: ['streq', 'rx'],
  REQUEST_URI: ['beginsWith', 'contains', 'rx', 'pmFromFile'],
  REQUEST_URI_RAW: ['beginsWith', 'contains', 'rx', 'pmFromFile'],
  REQUEST_FILENAME: ['beginsWith', 'endsWith', 'rx', 'pmFromFile'],
  REQUEST_BASENAME: ['endsWith', 'rx', 'pmFromFile'],

  REQUEST_HEADERS: ['rx', 'contains', 'streq', 'pmFromFile'],
  REQUEST_HEADERS_NAMES: ['rx', 'pm', 'streq'],
  'REQUEST_HEADERS:user-agent': ['pmFromFile', 'pm', 'contains', 'rx'],
  'REQUEST_HEADERS:x-forwarded-for': ['ipMatch', 'rx'],
  'REQUEST_HEADERS:x-real-ip': ['ipMatch', 'rx'],
  'REQUEST_HEADERS:content-type': ['streq', 'beginsWith', 'pm'],
  REQUEST_COOKIES: ['rx', 'detectSQLi', 'contains'],

  REQUEST_BODY: ['rx', 'detectSQLi', 'detectXSS', 'pm'],
  RESPONSE_BODY: ['rx', 'contains', 'pmFromFile'],
  RESPONSE_HEADERS: ['rx', 'contains', 'streq'],

  REMOTE_ADDR: ['ipMatch', 'ipMatchFromFile', 'rx'],
  SERVER_ADDR: ['ipMatch', 'rx'],
  REMOTE_HOST: ['endsWith', 'rx', 'rbl'],

  FILES: ['rx', 'endsWith', 'pmFromFile'],
  FILES_NAMES: ['rx', 'pmFromFile'],
  XML: ['rx', 'validateSchema', 'validateDTD'],
  'GEO:country_code': ['pm', 'streq', 'within'],
};

/** Операторы, которыми сравнивают текст, когда об области сказать нечего. */
const DEFAULT_TEXT_OPERATORS = ['rx', 'streq', 'contains', 'pm'];

/** Числовое сравнение везде одинаково — выбирать приходится только знак. */
const DEFAULT_NUMBER_OPERATORS = ['eq', 'gt', 'ge', 'lt', 'le'];

/** Преобразования, уместные на этой области проверки. */
export function recommendedTransforms(targets: TargetLike[]): string[] {
  return bySubject(SUBJECT_TRANSFORMS, targets) ?? DEFAULT_TRANSFORMS;
}

/**
 * Операторы, уместные на этой области проверки.
 *
 * Числовой вход отменяет знание об области: у `&ARGS` и у `RESPONSE_STATUS`
 * выбор одинаковый, и подсказывать `@contains` здесь было бы вредно.
 */
export function recommendedOperators(
  targets: TargetLike[],
  inputKind: ValueKind,
): string[] {
  if (inputKind === 'number') return DEFAULT_NUMBER_OPERATORS;
  return bySubject(SUBJECT_OPERATORS, targets) ?? DEFAULT_TEXT_OPERATORS;
}

/* ------------------------------------------------------------------ */
/* Действия правила                                                    */
/* ------------------------------------------------------------------ */

/** Коды ответа для действия `status`. */
export const STATUS_SUGGESTIONS = group('Blocking codes', 'Коды блокировки', [
  s('403', 'Forbidden — the usual answer to an attack', 'Доступ запрещён — обычный ответ на атаку'),
  s('400', 'Bad request', 'Некорректный запрос'),
  s('401', 'Authentication required', 'Требуется аутентификация'),
  s('404', 'Not found — hides the resource', 'Не найдено — скрывает наличие ресурса'),
  s('405', 'Method not allowed', 'Метод не поддерживается'),
  s('406', 'Not acceptable', 'Неприемлемо'),
  s('429', 'Too many requests — for rate limits', 'Слишком много запросов — для лимитов'),
  s('451', 'Unavailable for legal reasons', 'Недоступно по юридическим причинам'),
  s('500', 'Internal server error', 'Внутренняя ошибка сервера'),
  s('503', 'Service unavailable', 'Сервис недоступен'),
]);

/**
 * Подстановки `%{...}`, доступные в сообщении и в данных для лога.
 *
 * ModSecurity раскрывает их в момент срабатывания правила, поэтому именно
 * они превращают одинаковую строку в лог с подробностями совпадения.
 */
export const MACRO_SUGGESTIONS = [
  ...group('Ready-made log data', 'Готовые строки для лога', [
    s(
      'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',
      'Standard CRS log data',
      'Стандартная строка CRS',
    ),
  ]),
  ...group('Match', 'Совпадение', [
    s('%{MATCHED_VAR}', 'Value that matched', 'Значение, которое совпало'),
    s('%{MATCHED_VAR_NAME}', 'Name of the variable that matched', 'Имя совпавшей переменной'),
    s('%{TX.0}', 'Whole match — needs the "capture" action', 'Весь текст совпадения — нужен «capture»'),
    s('%{TX.1}', 'First capture group', 'Первая скобочная группа'),
  ]),
  ...group('Request', 'Запрос', [
    s('%{REMOTE_ADDR}', 'Client address', 'Адрес клиента'),
    s('%{REQUEST_URI}', 'Path with the query string', 'Путь с параметрами'),
    s('%{REQUEST_METHOD}', 'HTTP method', 'Метод HTTP'),
    s('%{REQUEST_HEADERS.User-Agent}', 'Client application', 'Клиентское приложение'),
    s('%{UNIQUE_ID}', 'Request id — ties the log to the access log', 'Идентификатор запроса — связь с журналом доступа'),
  ]),
  ...group('Rule', 'Правило', [
    s('%{RULE.id}', 'Id of the current rule', 'Идентификатор текущего правила'),
    s('%{TX.anomaly_score}', 'Anomaly score so far', 'Накопленный счёт аномалий'),
  ]),
];

/** Значения `setvar:` — счётчики CRS и собственные флаги. */
export const SETVAR_SUGGESTIONS = [
  ...group('Anomaly score (CRS)', 'Счёт аномалий (CRS)', [
    s(
      'tx.anomaly_score=+%{tx.critical_anomaly_score}',
      'Add the weight of a critical hit',
      'Добавить вес критического срабатывания',
    ),
    s(
      'tx.anomaly_score=+%{tx.error_anomaly_score}',
      'Add the weight of an error hit',
      'Добавить вес срабатывания уровня «ошибка»',
    ),
    s(
      'tx.anomaly_score=+%{tx.warning_anomaly_score}',
      'Add the weight of a warning',
      'Добавить вес предупреждения',
    ),
    s(
      'tx.anomaly_score=+%{tx.notice_anomaly_score}',
      'Add the weight of a notice',
      'Добавить вес замечания',
    ),
    s('tx.inbound_anomaly_score_threshold=5', 'Set the blocking threshold', 'Задать порог блокировки'),
  ]),
  ...group('Counters', 'Счётчики', [
    s('ip.dos_counter=+1', 'Count one request from this address', 'Учесть запрос с этого адреса'),
    s('ip.dos_block=1', 'Block the address', 'Заблокировать адрес'),
    s('session.score=+10', 'Add to the session score', 'Добавить к счёту сессии'),
    s('tx.counter=+1', 'Own counter', 'Собственный счётчик'),
  ]),
  ...group('Lifetime', 'Время жизни', [
    s('ip.dos_counter=0', 'Reset the counter', 'Обнулить счётчик'),
    s('!ip.dos_counter', 'Delete the variable', 'Удалить переменную'),
    s('tx.msg=%{rule.msg}', 'Carry the message into the chain', 'Передать сообщение дальше по цепочке'),
  ]),
];

/**
 * Имена переменных, которые в наборах уже что-то значат.
 *
 * Своё имя автор придумает сам, а вот попасть в чужое надо точно: правило,
 * прибавляющее к `tx.anomaly_scores` вместо `tx.anomaly_score`, работает,
 * ничего не ломает и не блокирует — просто накопленное им никто не читает.
 * Опечатку такого рода не видно ни в диагностике движка, ни в логах.
 */
const COLLECTION_VAR_NAMES: Record<string, Suggestion[]> = {
  tx: [
    ...group('Anomaly score (CRS)', 'Счёт аномалий (CRS)', [
      s('anomaly_score', 'Score accumulated by inbound rules', 'Счёт, накопленный входящими правилами'),
      s('inbound_anomaly_score', 'Total for the request', 'Итог по запросу'),
      s('outbound_anomaly_score', 'Total for the response', 'Итог по ответу'),
      s(
        'inbound_anomaly_score_threshold',
        'Blocking threshold — set it in the setup file',
        'Порог блокировки — задают в файле настройки',
      ),
      s('critical_anomaly_score', 'Weight of a critical hit', 'Вес критического срабатывания'),
      s('error_anomaly_score', 'Weight of an error-level hit', 'Вес срабатывания уровня «ошибка»'),
      s('warning_anomaly_score', 'Weight of a warning', 'Вес предупреждения'),
      s('notice_anomaly_score', 'Weight of a notice', 'Вес замечания'),
    ]),
    ...group('Set-wide settings', 'Настройки набора', [
      s('paranoia_level', 'Which rule families are on', 'Какие семейства правил включены'),
      s('crs_setup_version', 'Marks the setup file as loaded', 'Признак того, что файл настройки прочитан'),
      s('blocking_paranoia_level', 'Level at which rules block', 'Уровень, на котором правила блокируют'),
    ]),
    ...group('Carried between rules', 'Передача между правилами', [
      s('msg', 'Message for the rule downstream', 'Сообщение для правила ниже'),
      s('matched_var', 'Value the previous link matched', 'Значение, совпавшее в предыдущем звене'),
    ]),
  ],
  ip: group('Counters', 'Счётчики', [
    s('dos_counter', 'Requests from this address', 'Запросы с этого адреса'),
    s('dos_block', 'The address is blocked', 'Адрес заблокирован'),
    s('dos_block_counter', 'How many times it was blocked', 'Сколько раз блокировали'),
    s('reput_block_flag', 'Reputation block', 'Блокировка по репутации'),
  ]),
  session: group('Session', 'Сессия', [
    s('score', 'Score of the session', 'Счёт сессии'),
    s('block', 'The session is blocked', 'Сессия заблокирована'),
  ]),
  user: group('User', 'Пользователь', [
    s('score', 'Score of the account', 'Счёт учётной записи'),
    s('block', 'The account is blocked', 'Учётная запись заблокирована'),
  ]),
};

const USED_GROUP: Label = { en: 'Already in the set', ru: 'Уже есть в наборе' };

/**
 * Сколько раз переменную пишут и читают — словами, для своего имени в наборе.
 *
 * У известного CRS-имени пояснение другое: что оно значит. У своего имени
 * смысла в документации нет, и единственный осмысленный ответ — кто его
 * уже трогает и как часто. Отдельно названы «никто не читает» и «никто не
 * пишет»: это как раз то, чего в общей фразе «уже есть в наборе» не видно.
 */
function usageHint(writes: number, reads: number): Label {
  if (writes > 0 && reads === 0) {
    return {
      en: `Written ${writes}×, never read`,
      ru: `Пишет ${writes}, никто не читает`,
    };
  }
  if (reads > 0 && writes === 0) {
    return {
      en: `Read ${reads}×, never written`,
      ru: `Читает ${reads}, никто не пишет`,
    };
  }
  return {
    en: `Written ${writes} · read ${reads}`,
    ru: `Пишет ${writes} · читает ${reads}`,
  };
}

/**
 * Имя, которое форма setvar умеет держать в поле.
 *
 * То же ограничение, что у {@link readSetvar}: цифра в начале — это
 * захваченная группа (`tx.1`) или служебная запись CRS вроде
 * `tx.942130_matched_var_name`, а макрос в имени формой не собрать.
 * Такие имена индекс переменных знает, но предлагать их в меню выбора
 * нечего: выбранное всё равно не встало бы в поля.
 */
const SUGGESTIBLE_NAME = /^[A-Za-z_][\w.-]*$/;

/**
 * Имена переменных коллекции: сначала занятые в наборе, потом известные.
 *
 * Порядок здесь и есть подсказка. Имя в наборе — не пример из документации,
 * а то самое, к чему присваивание, скорее всего, и относится: счётчик
 * заводят там же, где его потом читают. Известные имена CRS, которых в
 * наборе ещё нет, идут ниже — они нужны тому, кто дописывает своё правило
 * к чужому набору.
 *
 * У занятого имени справа стоит число мест. У известного занятого остаётся
 * пояснение из документации; у своего — сколько раз его пишут и читают.
 * Служебные `942130_matched_var_name` и прочие имена с цифры в начале в
 * список не входят: формой их не набрать.
 */
export function setvarNameSuggestions(
  collection: string,
  index: VariableIndex,
): Suggestion[] {
  const known = COLLECTION_VAR_NAMES[collection.toLowerCase()] ?? [];
  const knownByName = new Map(known.map((item) => [item.value.toLowerCase(), item]));
  const used = collectionVariables(index, collection).filter((name) =>
    SUGGESTIBLE_NAME.test(name),
  );
  const usedSet = new Set(used.map((name) => name.toLowerCase()));

  const own = used.map((name): Suggestion => {
    const entry = lookupVariable(index, collection, name);
    const writes = entry?.writes.length ?? 0;
    const reads = entry?.reads.length ?? 0;
    const knownItem = knownByName.get(name.toLowerCase());
    return {
      value: name,
      hint: knownItem?.hint ?? usageHint(writes, reads),
      group: USED_GROUP,
      badge: writes + reads,
    };
  });

  const rest = known.filter((item) => !usedSet.has(item.value.toLowerCase()));
  return [...own, ...rest];
}

/** Метки правила — то, по чему потом ищут срабатывания в логах. */
export const TAG_SUGGESTIONS = [
  ...group('Attack type', 'Тип атаки', [
    s('attack-sqli', 'SQL injection', 'SQL-инъекция'),
    s('attack-xss', 'Cross-site scripting', 'Межсайтовый скриптинг'),
    s('attack-rce', 'Remote code execution', 'Выполнение кода'),
    s('attack-lfi', 'Local file inclusion', 'Чтение локальных файлов'),
    s('attack-rfi', 'Remote file inclusion', 'Подключение внешних файлов'),
    s('attack-injection-generic', 'Generic injection', 'Инъекция общего вида'),
    s('attack-protocol', 'Protocol violation', 'Нарушение протокола'),
    s('attack-disclosure', 'Information disclosure', 'Утечка информации'),
    s('attack-reputation-scanner', 'Scanner traffic', 'Трафик сканера'),
    s('attack-dos', 'Denial of service', 'Отказ в обслуживании'),
  ]),
  ...group('Scope', 'Область применения', [
    s('application-multi', 'Not tied to one application', 'Не привязано к одному приложению'),
    s('language-multi', 'Not tied to one language', 'Не привязано к одному языку'),
    s('platform-multi', 'Not tied to one platform', 'Не привязано к одной платформе'),
    s('platform-apache', 'Apache only', 'Только Apache'),
    s('platform-windows', 'Windows only', 'Только Windows'),
  ]),
  ...group('CRS', 'CRS', [
    s('OWASP_CRS', 'Belongs to the Core Rule Set', 'Относится к Core Rule Set'),
    s('paranoia-level/1', 'Runs at paranoia level 1', 'Работает с уровня паранойи 1'),
    s('paranoia-level/2', 'Runs at paranoia level 2', 'Работает с уровня паранойи 2'),
    s('paranoia-level/3', 'Runs at paranoia level 3', 'Работает с уровня паранойи 3'),
    s('paranoia-level/4', 'Runs at paranoia level 4', 'Работает с уровня паранойи 4'),
  ]),
  ...group('Classifiers', 'Классификаторы', [
    s('OWASP_TOP_10/A03', 'OWASP Top 10: injection', 'OWASP Top 10: инъекции'),
    s('OWASP_TOP_10/A01', 'OWASP Top 10: broken access control', 'OWASP Top 10: контроль доступа'),
    s('capec/1000/152/248/66', 'CAPEC: SQL injection', 'CAPEC: SQL-инъекция'),
    s('capec/1000/152/242/63', 'CAPEC: cross-site scripting', 'CAPEC: межсайтовый скриптинг'),
    s('PCI/6.5.1', 'PCI DSS: injection', 'PCI DSS: инъекции'),
  ]),
];

/**
 * Сколько правил носят тег и снимают ли его — для своего ярлыка в наборе.
 *
 * У известного тега из каталога пояснение другое: что он значит. У своего
 * ярлыка смысла в документации нет, и единственный осмысленный ответ —
 * у скольких правил он уже стоит и снимает ли кто-то правила по нему.
 */
function tagUsageHint(rules: number, exclusions: number): Label {
  const onRules =
    rules === 1
      ? { en: 'On 1 rule', ru: 'У 1 правила' }
      : { en: `On ${rules} rules`, ru: `У ${rules} правил` };
  if (exclusions === 0) return onRules;
  return {
    en: `${onRules.en} · excluded by ${exclusions}`,
    ru: `${onRules.ru} · снимают ${exclusions}`,
  };
}

/**
 * Теги: сначала занятые в наборе, потом известные из каталога.
 *
 * Порядок — та же подсказка, что у имён переменных. Ярлык, который уже
 * носят правила набора, — не пример из документации, а то, к чему новое
 * правило, скорее всего, и относится. У занятого справа число правил;
 * у известного занятого остаётся пояснение из каталога.
 */
export function tagSuggestions(index: TagIndex): Suggestion[] {
  const knownByName = new Map(
    TAG_SUGGESTIONS.map((item) => [item.value.toLowerCase(), item]),
  );
  const used = workspaceTags(index);
  const usedSet = new Set(used.map((tag) => tag.toLowerCase()));

  const own = used.map((tag): Suggestion => {
    const entry = lookupTag(index, tag);
    const rules = entry?.rules.length ?? 0;
    const exclusions = entry?.exclusions.length ?? 0;
    const knownItem = knownByName.get(tag.toLowerCase());
    return {
      value: tag,
      hint: knownItem?.hint ?? tagUsageHint(rules, exclusions),
      group: USED_GROUP,
      badge: rules,
    };
  });

  const rest = TAG_SUGGESTIONS.filter(
    (item) => !usedSet.has(item.value.toLowerCase()),
  );
  return [...own, ...rest];
}
