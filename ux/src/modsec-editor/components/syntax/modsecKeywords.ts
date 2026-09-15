import { KEYWORD_DETAILS } from './details';

export type KeywordCategory =
  | 'directive'
  | 'action'
  | 'transform'
  | 'operator'
  | 'variable';

export interface LocalizedText {
  en: string;
  ru: string;
}

export interface KeywordTech {
  argument?: LocalizedText;
  fallback?: LocalizedText;
  scope?: LocalizedText;
  cost?: LocalizedText;
  availability?: LocalizedText;
}

export interface KeywordExample {
  code: string;
  caption?: LocalizedText;
}

export interface KeywordDetails {
  summary: LocalizedText;
  syntax?: string;
  tech?: KeywordTech;
  gotchas?: LocalizedText[];
  example?: KeywordExample;
  seeAlso?: string[];
}

export interface KeywordDoc {
  category: KeywordCategory;
  keyword: string;
  desc: LocalizedText;
  details?: KeywordDetails;
}

type DocsInput = Record<string, LocalizedText>;

function buildDocs(
  category: KeywordCategory,
  input: DocsInput,
): Record<string, KeywordDoc> {
  const out: Record<string, KeywordDoc> = {};
  for (const [keyword, desc] of Object.entries(input)) {
    const details = KEYWORD_DETAILS[keyword];
    out[keyword] = details
      ? { category, keyword, desc, details }
      : { category, keyword, desc };
  }
  return out;
}

const DIRECTIVE_DOCS = buildDocs('directive', {
  Include: {
    en: 'Reads another configuration file right here: the set is assembled out of files rather than written as one.',
    ru: 'Читает на этом месте другой файл конфигурации: набор собирается из файлов, а не пишется одним.',
  },
  SecRuleEngine: {
    en: 'Controls the rules engine: On, Off or DetectionOnly.',
    ru: 'Управляет движком правил: On, Off или DetectionOnly.',
  },
  SecRule: {
    en: 'Core directive: creates a rule that matches a variable against an operator.',
    ru: 'Основная директива: создаёт правило, сопоставляющее переменную с оператором.',
  },
  SecAction: {
    en: 'Unconditionally executes the given actions (a rule that always matches).',
    ru: 'Безусловно выполняет указанные действия (правило, срабатывающее всегда).',
  },
  SecMarker: {
    en: 'Adds a named marker used as a target for skipAfter.',
    ru: 'Добавляет именованную метку — цель для skipAfter.',
  },
  SecDefaultAction: {
    en: 'Sets the default action list applied to rules in the same phase.',
    ru: 'Задаёт список действий по умолчанию для правил той же фазы.',
  },
  SecRuleRemoveById: {
    en: 'Removes rules matching the given id (or id range) at configure time.',
    ru: 'Удаляет правила по указанному id (или диапазону) на этапе загрузки.',
  },
  SecRuleRemoveByMsg: {
    en: 'Removes rules whose msg matches the given regular expression.',
    ru: 'Удаляет правила, у которых msg совпадает с регулярным выражением.',
  },
  SecRuleRemoveByTag: {
    en: 'Removes rules whose tag matches the given regular expression.',
    ru: 'Удаляет правила, у которых tag совпадает с регулярным выражением.',
  },
  SecRuleUpdateTargetById: {
    en: 'Appends or replaces the variable list (targets) of a rule by id.',
    ru: 'Дополняет или заменяет список переменных (целей) правила по id.',
  },
  SecRuleUpdateTargetByMsg: {
    en: 'Updates the target list of rules selected by their msg.',
    ru: 'Обновляет список целей правил, выбранных по msg.',
  },
  SecRuleUpdateTargetByTag: {
    en: 'Updates the target list of rules selected by their tag.',
    ru: 'Обновляет список целей правил, выбранных по tag.',
  },
  SecRuleUpdateActionById: {
    en: 'Merges a new action list into an existing rule identified by id.',
    ru: 'Добавляет новые действия к существующему правилу по id.',
  },
  SecRuleScript: {
    en: 'Defines a rule implemented by an external Lua script.',
    ru: 'Определяет правило, реализованное внешним Lua-скриптом.',
  },
  SecRuleInheritance: {
    en: 'Controls whether rules are inherited by child configuration contexts.',
    ru: 'Управляет наследованием правил дочерними контекстами конфигурации.',
  },
  SecRequestBodyAccess: {
    en: 'Enables (On) or disables (Off) buffering and inspection of request bodies.',
    ru: 'Включает (On) или выключает (Off) буферизацию и проверку тела запроса.',
  },
  SecRequestBodyLimit: {
    en: 'Maximum request body size ModSecurity will accept, in bytes.',
    ru: 'Максимальный размер тела запроса, который принимает ModSecurity (в байтах).',
  },
  SecRequestBodyNoFilesLimit: {
    en: 'Maximum request body size when the body contains no file uploads.',
    ru: 'Максимальный размер тела запроса, когда в нём нет загрузок файлов.',
  },
  SecRequestBodyInMemoryLimit: {
    en: 'How much of the request body is kept in memory before spooling to disk.',
    ru: 'Сколько тела запроса держать в памяти до сброса на диск.',
  },
  SecRequestBodyLimitAction: {
    en: 'What to do when the body limit is reached: Reject or ProcessPartial.',
    ru: 'Что делать при достижении лимита тела: Reject или ProcessPartial.',
  },
  SecResponseBodyAccess: {
    en: 'Enables buffering and inspection of response bodies.',
    ru: 'Включает буферизацию и проверку тела ответа.',
  },
  SecResponseBodyLimit: {
    en: 'Maximum response body size to buffer for inspection, in bytes.',
    ru: 'Максимальный размер тела ответа для буферизации (в байтах).',
  },
  SecResponseBodyLimitAction: {
    en: 'Action when the response body limit is reached: Reject or ProcessPartial.',
    ru: 'Действие при достижении лимита тела ответа: Reject или ProcessPartial.',
  },
  SecResponseBodyMimeType: {
    en: 'MIME types whose response bodies will be buffered for inspection.',
    ru: 'MIME-типы, тела ответов которых будут буферизоваться для проверки.',
  },
  SecResponseBodyMimeTypesClear: {
    en: 'Clears the list of response MIME types configured for inspection.',
    ru: 'Очищает список MIME-типов ответа, настроенных для проверки.',
  },
  SecAuditEngine: {
    en: 'Controls the audit log engine: On, Off or RelevantOnly.',
    ru: 'Управляет журналом аудита: On, Off или RelevantOnly.',
  },
  SecAuditLog: {
    en: 'Path to the main audit log file.',
    ru: 'Путь к основному файлу журнала аудита.',
  },
  SecAuditLog2: {
    en: 'Path to a secondary audit log used with concurrent logging.',
    ru: 'Путь к вторичному журналу аудита при параллельном логировании.',
  },
  SecAuditLogParts: {
    en: 'Which parts (A-K, Z) of a transaction are recorded in the audit log.',
    ru: 'Какие части (A-K, Z) транзакции записываются в журнал аудита.',
  },
  SecAuditLogType: {
    en: 'Audit log storage format: Serial or Concurrent.',
    ru: 'Формат хранения журнала аудита: Serial или Concurrent.',
  },
  SecAuditLogStorageDir: {
    en: 'Directory for concurrent audit log entries.',
    ru: 'Каталог для записей журнала аудита в режиме Concurrent.',
  },
  SecAuditLogFormat: {
    en: 'Audit log output format: Native or JSON.',
    ru: 'Формат вывода журнала аудита: Native или JSON.',
  },
  SecAuditLogRelevantStatus: {
    en: 'Regex of HTTP status codes considered relevant for audit logging.',
    ru: 'Регулярка HTTP-статусов, считающихся значимыми для аудита.',
  },
  SecDebugLog: {
    en: 'Path to the debug log file.',
    ru: 'Путь к файлу отладочного журнала.',
  },
  SecDebugLogLevel: {
    en: 'Verbosity of the debug log, from 0 (none) to 9 (most verbose).',
    ru: 'Уровень детализации отладочного журнала: от 0 (нет) до 9 (максимум).',
  },
  SecComponentSignature: {
    en: 'Appends a component signature (e.g. rule set version) to ModSecurity.',
    ru: 'Добавляет сигнатуру компонента (например, версию набора правил).',
  },
  SecContentInjection: {
    en: 'Enables content injection via append and prepend actions.',
    ru: 'Включает внедрение контента через действия append и prepend.',
  },
  SecServerSignature: {
    en: 'Overrides the Server response header signature.',
    ru: 'Переопределяет сигнатуру заголовка ответа Server.',
  },
  SecTmpDir: {
    en: 'Directory for temporary files (e.g. spooled request bodies).',
    ru: 'Каталог для временных файлов (например, сброшенных тел запросов).',
  },
  SecDataDir: {
    en: 'Directory where persistent collections are stored.',
    ru: 'Каталог, где хранятся постоянные коллекции.',
  },
  SecUploadDir: {
    en: 'Directory where intercepted uploaded files are stored.',
    ru: 'Каталог, где сохраняются перехваченные загруженные файлы.',
  },
  SecUploadKeepFiles: {
    en: 'Whether to keep uploaded files: On, Off or RelevantOnly.',
    ru: 'Сохранять ли загруженные файлы: On, Off или RelevantOnly.',
  },
  SecUploadFileMode: {
    en: 'Filesystem permissions applied to stored uploaded files.',
    ru: 'Права доступа, назначаемые сохранённым загруженным файлам.',
  },
  SecUploadFileLimit: {
    en: 'Maximum number of file uploads processed per request.',
    ru: 'Максимальное число загрузок файлов, обрабатываемых на запрос.',
  },
  SecPcreMatchLimit: {
    en: 'PCRE match limit that guards against catastrophic backtracking.',
    ru: 'Лимит совпадений PCRE, защищающий от катастрофического бэктрекинга.',
  },
  SecPcreMatchLimitRecursion: {
    en: 'PCRE recursion match limit for regular expression evaluation.',
    ru: 'Лимит рекурсии PCRE при вычислении регулярных выражений.',
  },
  SecStatusEngine: {
    en: 'Controls sending anonymous usage/status information to the project.',
    ru: 'Управляет отправкой анонимной статистики использования проекту.',
  },
  SecArgumentSeparator: {
    en: 'Character used to separate application/x-www-form-urlencoded arguments.',
    ru: 'Символ-разделитель аргументов application/x-www-form-urlencoded.',
  },
  SecCookieFormat: {
    en: 'Cookie parsing format: 0 (Netscape) or 1 (RFC 2965).',
    ru: 'Формат разбора cookie: 0 (Netscape) или 1 (RFC 2965).',
  },
  SecCollectionTimeout: {
    en: 'Time in seconds before persistent collection records expire.',
    ru: 'Время в секундах до истечения записей постоянных коллекций.',
  },
  SecUnicodeMapFile: {
    en: 'File and code page used by the urlDecodeUni transformation.',
    ru: 'Файл и кодовая страница для трансформации urlDecodeUni.',
  },
  SecStreamInBodyInspection: {
    en: 'Exposes the raw inbound body as a stream for inspection.',
    ru: 'Открывает сырое входящее тело как поток для проверки.',
  },
  SecStreamOutBodyInspection: {
    en: 'Exposes the raw outbound body as a stream for inspection.',
    ru: 'Открывает сырое исходящее тело как поток для проверки.',
  },
  SecInterceptOnError: {
    en: 'Whether processing errors abort the transaction.',
    ru: 'Прерывать ли транзакцию при ошибках обработки.',
  },
});

const ACTION_DOCS = buildDocs('action', {
  allow: {
    en: 'Disruptive: stops rule processing and lets the transaction through.',
    ru: 'Разрушающее: останавливает обработку правил и пропускает транзакцию.',
  },
  block: {
    en: 'Disruptive: performs the default disruptive action from SecDefaultAction.',
    ru: 'Разрушающее: выполняет действие по умолчанию из SecDefaultAction.',
  },
  deny: {
    en: 'Disruptive: stops processing and blocks the transaction.',
    ru: 'Разрушающее: останавливает обработку и блокирует транзакцию.',
  },
  drop: {
    en: 'Disruptive: immediately closes the connection without a response.',
    ru: 'Разрушающее: мгновенно закрывает соединение без ответа.',
  },
  pass: {
    en: 'Non-disruptive: continues to the next rule (does not block).',
    ru: 'Неразрушающее: переходит к следующему правилу (не блокирует).',
  },
  proxy: {
    en: 'Disruptive: transparently forwards the request to another server.',
    ru: 'Разрушающее: прозрачно перенаправляет запрос на другой сервер.',
  },
  redirect: {
    en: 'Disruptive: redirects the client to the given URL.',
    ru: 'Разрушающее: перенаправляет клиента на указанный URL.',
  },
  pause: {
    en: 'Disruptive: pauses the transaction for the given number of milliseconds.',
    ru: 'Разрушающее: приостанавливает транзакцию на заданное число миллисекунд.',
  },
  chain: {
    en: 'Flow: chains this rule with the following one (logical AND).',
    ru: 'Поток: связывает это правило со следующим (логическое И).',
  },
  skip: {
    en: 'Flow: skips the given number of rules that follow.',
    ru: 'Поток: пропускает указанное число следующих правил.',
  },
  skipAfter: {
    en: 'Flow: skips rules until the SecMarker with the given label.',
    ru: 'Поток: пропускает правила до метки SecMarker с указанным именем.',
  },
  id: {
    en: 'Meta-data: unique numeric identifier of the rule.',
    ru: 'Метаданные: уникальный числовой идентификатор правила.',
  },
  phase: {
    en: 'Meta-data: processing phase (1-5) in which the rule runs.',
    ru: 'Метаданные: фаза обработки (1-5), в которой выполняется правило.',
  },
  msg: {
    en: 'Meta-data: human-readable message stored in the logs.',
    ru: 'Метаданные: понятное человеку сообщение, записываемое в логи.',
  },
  rev: {
    en: 'Meta-data: revision number of the rule.',
    ru: 'Метаданные: номер ревизии правила.',
  },
  severity: {
    en: 'Meta-data: severity level (0-7 or EMERGENCY..DEBUG).',
    ru: 'Метаданные: уровень серьёзности (0-7 или EMERGENCY..DEBUG).',
  },
  tag: {
    en: 'Meta-data: assigns a classification tag to the rule (repeatable).',
    ru: 'Метаданные: присваивает правилу классификационный тег (можно несколько).',
  },
  ver: {
    en: 'Meta-data: rule set version string.',
    ru: 'Метаданные: строка версии набора правил.',
  },
  accuracy: {
    en: 'Meta-data: accuracy rating of the rule (1-9).',
    ru: 'Метаданные: оценка точности правила (1-9).',
  },
  maturity: {
    en: 'Meta-data: maturity rating of the rule (1-9).',
    ru: 'Метаданные: оценка зрелости правила (1-9).',
  },
  logdata: {
    en: 'Non-disruptive: logs a custom data fragment (supports macros).',
    ru: 'Неразрушающее: логирует произвольный фрагмент данных (поддерживает макросы).',
  },
  append: {
    en: 'Non-disruptive: appends text to the response body.',
    ru: 'Неразрушающее: добавляет текст в конец тела ответа.',
  },
  prepend: {
    en: 'Non-disruptive: prepends text to the response body.',
    ru: 'Неразрушающее: добавляет текст в начало тела ответа.',
  },
  capture: {
    en: 'Non-disruptive: captures regex groups into TX:0..TX:9.',
    ru: 'Неразрушающее: сохраняет группы regex в TX:0..TX:9.',
  },
  ctl: {
    en: 'Non-disruptive: changes engine configuration for the current transaction.',
    ru: 'Неразрушающее: меняет настройки движка для текущей транзакции.',
  },
  deprecatevar: {
    en: 'Non-disruptive: decreases a collection variable over time.',
    ru: 'Неразрушающее: уменьшает переменную коллекции со временем.',
  },
  exec: {
    en: 'Non-disruptive: executes an external script or Lua file.',
    ru: 'Неразрушающее: выполняет внешний скрипт или Lua-файл.',
  },
  expirevar: {
    en: 'Non-disruptive: expires a collection variable after N seconds.',
    ru: 'Неразрушающее: удаляет переменную коллекции через N секунд.',
  },
  initcol: {
    en: 'Non-disruptive: creates/initializes a persistent collection.',
    ru: 'Неразрушающее: создаёт/инициализирует постоянную коллекцию.',
  },
  log: {
    en: 'Non-disruptive: forces the rule match to be logged.',
    ru: 'Неразрушающее: принудительно логирует срабатывание правила.',
  },
  nolog: {
    en: 'Non-disruptive: suppresses error and audit logging for the rule.',
    ru: 'Неразрушающее: подавляет запись правила в error- и audit-логи.',
  },
  auditlog: {
    en: 'Non-disruptive: forces the transaction into the audit log.',
    ru: 'Неразрушающее: принудительно пишет транзакцию в журнал аудита.',
  },
  noauditlog: {
    en: 'Non-disruptive: excludes the match from the audit log.',
    ru: 'Неразрушающее: исключает срабатывание из журнала аудита.',
  },
  multiMatch: {
    en: 'Non-disruptive: re-evaluates the rule after each transformation.',
    ru: 'Неразрушающее: перепроверяет правило после каждой трансформации.',
  },
  sanitiseArg: {
    en: 'Non-disruptive: masks the named argument in the audit log.',
    ru: 'Неразрушающее: маскирует указанный аргумент в журнале аудита.',
  },
  sanitiseMatched: {
    en: 'Non-disruptive: masks the variable that triggered the match in logs.',
    ru: 'Неразрушающее: маскирует переменную, вызвавшую срабатывание, в логах.',
  },
  sanitiseMatchedBytes: {
    en: 'Non-disruptive: masks the exact matched bytes in the audit log.',
    ru: 'Неразрушающее: маскирует именно совпавшие байты в журнале аудита.',
  },
  sanitiseRequestHeader: {
    en: 'Non-disruptive: masks a named request header in the audit log.',
    ru: 'Неразрушающее: маскирует указанный заголовок запроса в журнале аудита.',
  },
  sanitiseResponseHeader: {
    en: 'Non-disruptive: masks a named response header in the audit log.',
    ru: 'Неразрушающее: маскирует указанный заголовок ответа в журнале аудита.',
  },
  setuid: {
    en: 'Non-disruptive: binds the transaction to a user collection.',
    ru: 'Неразрушающее: привязывает транзакцию к коллекции пользователя.',
  },
  setrsc: {
    en: 'Non-disruptive: sets the resource collection key.',
    ru: 'Неразрушающее: задаёт ключ коллекции ресурса.',
  },
  setsid: {
    en: 'Non-disruptive: binds the transaction to a session collection.',
    ru: 'Неразрушающее: привязывает транзакцию к коллекции сессии.',
  },
  setenv: {
    en: 'Non-disruptive: sets an environment variable.',
    ru: 'Неразрушающее: устанавливает переменную окружения.',
  },
  setvar: {
    en: 'Non-disruptive: creates, sets or removes a variable (e.g. TX).',
    ru: 'Неразрушающее: создаёт, задаёт или удаляет переменную (например, TX).',
  },
  status: {
    en: 'Data: HTTP status code returned by deny/redirect actions.',
    ru: 'Данные: HTTP-код, возвращаемый действиями deny/redirect.',
  },
  xmlns: {
    en: 'Data: declares an XML namespace for use with XPath in @validateSchema.',
    ru: 'Данные: объявляет XML-пространство имён для XPath в @validateSchema.',
  },
});

const TRANSFORM_DOCS = buildDocs('transform', {
  none: {
    en: 'Removes all previously configured transformations.',
    ru: 'Убирает все ранее заданные трансформации.',
  },
  base64Decode: {
    en: 'Decodes a Base64-encoded string.',
    ru: 'Декодирует строку из Base64.',
  },
  base64DecodeExt: {
    en: 'Decodes Base64, tolerating non-alphabet characters.',
    ru: 'Декодирует Base64, игнорируя символы вне алфавита.',
  },
  base64Encode: {
    en: 'Encodes the value using Base64.',
    ru: 'Кодирует значение в Base64.',
  },
  cmdLine: {
    en: 'Normalizes common command-line evasion tricks.',
    ru: 'Нормализует типовые приёмы обхода в командной строке.',
  },
  compressWhitespace: {
    en: 'Collapses runs of whitespace into a single space.',
    ru: 'Схлопывает последовательности пробелов в один пробел.',
  },
  cssDecode: {
    en: 'Decodes CSS escape sequences.',
    ru: 'Декодирует CSS-escape-последовательности.',
  },
  escapeSeqDecode: {
    en: 'Decodes ANSI C escape sequences (\\n, \\t, \\xHH...).',
    ru: 'Декодирует escape-последовательности ANSI C (\\n, \\t, \\xHH...).',
  },
  hexDecode: {
    en: 'Decodes a hex-encoded string.',
    ru: 'Декодирует строку из шестнадцатеричного вида.',
  },
  hexEncode: {
    en: 'Encodes the value as hexadecimal.',
    ru: 'Кодирует значение в шестнадцатеричный вид.',
  },
  htmlEntityDecode: {
    en: 'Decodes HTML entities such as &lt; and &#x3c;.',
    ru: 'Декодирует HTML-сущности вроде &lt; и &#x3c;.',
  },
  jsDecode: {
    en: 'Decodes JavaScript escape sequences.',
    ru: 'Декодирует escape-последовательности JavaScript.',
  },
  length: {
    en: 'Replaces the value with its length in bytes.',
    ru: 'Заменяет значение его длиной в байтах.',
  },
  lowercase: {
    en: 'Converts all characters to lowercase.',
    ru: 'Приводит все символы к нижнему регистру.',
  },
  md5: {
    en: 'Replaces the value with its raw MD5 hash.',
    ru: 'Заменяет значение его MD5-хешем (в сыром виде).',
  },
  normalisePath: {
    en: 'Removes ./, ../ and duplicate slashes from a path.',
    ru: 'Убирает ./, ../ и повторяющиеся слэши из пути.',
  },
  normalisePathWin: {
    en: 'Like normalisePath, but also converts backslashes to slashes.',
    ru: 'Как normalisePath, но ещё превращает обратные слэши в прямые.',
  },
  normalizePath: {
    en: 'Removes ./, ../ and duplicate slashes from a path (US spelling).',
    ru: 'Убирает ./, ../ и повторяющиеся слэши из пути (амер. написание).',
  },
  normalizePathWin: {
    en: 'Like normalizePath, but also converts backslashes to slashes.',
    ru: 'Как normalizePath, но ещё превращает обратные слэши в прямые.',
  },
  parityEven7bit: {
    en: 'Calculates even parity of 7-bit data.',
    ru: 'Вычисляет чётную чётность 7-битных данных.',
  },
  parityOdd7bit: {
    en: 'Calculates odd parity of 7-bit data.',
    ru: 'Вычисляет нечётную чётность 7-битных данных.',
  },
  parityZero7bit: {
    en: 'Calculates zero parity of 7-bit data.',
    ru: 'Вычисляет нулевую чётность 7-битных данных.',
  },
  removeNulls: {
    en: 'Removes NUL bytes from the value.',
    ru: 'Удаляет NUL-байты из значения.',
  },
  removeWhitespace: {
    en: 'Removes all whitespace characters.',
    ru: 'Удаляет все пробельные символы.',
  },
  removeComments: {
    en: 'Removes C-style, shell and SQL comments.',
    ru: 'Удаляет комментарии в стиле C, shell и SQL.',
  },
  removeCommentsChar: {
    en: 'Removes only comment characters, keeping the content.',
    ru: 'Удаляет только символы комментариев, сохраняя содержимое.',
  },
  replaceComments: {
    en: 'Replaces each comment with a single space.',
    ru: 'Заменяет каждый комментарий одним пробелом.',
  },
  replaceNulls: {
    en: 'Replaces NUL bytes with spaces.',
    ru: 'Заменяет NUL-байты пробелами.',
  },
  sha1: {
    en: 'Replaces the value with its raw SHA-1 hash.',
    ru: 'Заменяет значение его SHA-1-хешем (в сыром виде).',
  },
  trim: {
    en: 'Removes whitespace from both ends of the value.',
    ru: 'Убирает пробелы с обоих концов значения.',
  },
  trimLeft: {
    en: 'Removes whitespace from the start of the value.',
    ru: 'Убирает пробелы в начале значения.',
  },
  trimRight: {
    en: 'Removes whitespace from the end of the value.',
    ru: 'Убирает пробелы в конце значения.',
  },
  uppercase: {
    en: 'Converts all characters to uppercase.',
    ru: 'Приводит все символы к верхнему регистру.',
  },
  urlDecode: {
    en: 'Decodes a URL-encoded string.',
    ru: 'Декодирует URL-кодированную строку.',
  },
  urlDecodeUni: {
    en: 'Decodes a URL-encoded string, including %uXXXX sequences.',
    ru: 'Декодирует URL-строку, включая последовательности %uXXXX.',
  },
  urlEncode: {
    en: 'URL-encodes the value.',
    ru: 'Кодирует значение в URL-формат.',
  },
  utf8toUnicode: {
    en: 'Converts UTF-8 characters to Unicode code points.',
    ru: 'Преобразует символы UTF-8 в кодовые точки Unicode.',
  },
});

const OPERATOR_DOCS = buildDocs('operator', {
  beginsWith: {
    en: 'True if the input begins with the given string.',
    ru: 'Истина, если вход начинается с заданной строки.',
  },
  contains: {
    en: 'True if the input contains the given string.',
    ru: 'Истина, если вход содержит заданную строку.',
  },
  containsWord: {
    en: 'True if the input contains the given word (with boundaries).',
    ru: 'Истина, если вход содержит заданное слово (с границами).',
  },
  detectSQLi: {
    en: 'Detects SQL injection using libinjection.',
    ru: 'Обнаруживает SQL-инъекции с помощью libinjection.',
  },
  detectXSS: {
    en: 'Detects cross-site scripting using libinjection.',
    ru: 'Обнаруживает XSS с помощью libinjection.',
  },
  endsWith: {
    en: 'True if the input ends with the given string.',
    ru: 'Истина, если вход заканчивается заданной строкой.',
  },
  eq: {
    en: 'Numeric equality: true if input equals the given number.',
    ru: 'Числовое равенство: истина, если вход равен заданному числу.',
  },
  ge: {
    en: 'Numeric: true if input is greater than or equal to the value.',
    ru: 'Число: истина, если вход больше либо равен значению.',
  },
  geoLookup: {
    en: 'Performs a geolocation lookup and fills the GEO collection.',
    ru: 'Выполняет геолокацию и заполняет коллекцию GEO.',
  },
  gsbLookup: {
    en: 'Checks the input against the Google Safe Browsing database.',
    ru: 'Проверяет вход по базе Google Safe Browsing.',
  },
  gt: {
    en: 'Numeric: true if input is greater than the value.',
    ru: 'Число: истина, если вход больше значения.',
  },
  inspectFile: {
    en: 'Runs an external script to inspect an uploaded file.',
    ru: 'Запускает внешний скрипт для проверки загруженного файла.',
  },
  ipMatch: {
    en: 'True if the IP matches any address/CIDR in the list.',
    ru: 'Истина, если IP входит в один из адресов/CIDR списка.',
  },
  ipMatchF: {
    en: 'Like ipMatch, reading the list from a file.',
    ru: 'Как ipMatch, но список читается из файла.',
  },
  ipMatchFromFile: {
    en: 'Matches the IP against address ranges loaded from a file.',
    ru: 'Сопоставляет IP с диапазонами, загруженными из файла.',
  },
  le: {
    en: 'Numeric: true if input is less than or equal to the value.',
    ru: 'Число: истина, если вход меньше либо равен значению.',
  },
  lt: {
    en: 'Numeric: true if input is less than the value.',
    ru: 'Число: истина, если вход меньше значения.',
  },
  noMatch: {
    en: 'Never matches; useful as a placeholder.',
    ru: 'Никогда не срабатывает; удобен как заглушка.',
  },
  pm: {
    en: 'Fast phrase match against a set of keywords (Aho-Corasick).',
    ru: 'Быстрый поиск фраз по набору ключевых слов (Aho-Corasick).',
  },
  pmf: {
    en: 'Like pm, reading phrases from a file.',
    ru: 'Как pm, но фразы читаются из файла.',
  },
  pmFromFile: {
    en: 'Phrase match against keywords loaded from a file.',
    ru: 'Поиск фраз по ключевым словам, загруженным из файла.',
  },
  rbl: {
    en: 'Looks the input up against an RBL (DNS blocklist) server.',
    ru: 'Проверяет вход по RBL-серверу (DNS-блоклист).',
  },
  rsub: {
    en: 'Performs a regex search-and-replace on the stream variable.',
    ru: 'Выполняет regex-замену в потоковой переменной.',
  },
  rx: {
    en: 'Matches the input against a Perl-compatible regular expression.',
    ru: 'Сопоставляет вход с Perl-совместимым регулярным выражением.',
  },
  streq: {
    en: 'True if the input is exactly equal to the given string.',
    ru: 'Истина, если вход в точности равен заданной строке.',
  },
  strmatch: {
    en: 'Simple substring match (no regex overhead).',
    ru: 'Простой поиск подстроки (без накладных расходов regex).',
  },
  unconditionalMatch: {
    en: 'Always matches, regardless of the input.',
    ru: 'Срабатывает всегда, независимо от входа.',
  },
  validateByteRange: {
    en: 'True if all bytes fall within the allowed range(s).',
    ru: 'Истина, если все байты попадают в разрешённые диапазоны.',
  },
  validateDTD: {
    en: 'Validates an XML document against a DTD.',
    ru: 'Проверяет XML-документ по DTD.',
  },
  validateHash: {
    en: 'Validates request data against an anti-CSRF hash.',
    ru: 'Проверяет данные запроса по anti-CSRF-хешу.',
  },
  validateSchema: {
    en: 'Validates an XML document against an XML Schema.',
    ru: 'Проверяет XML-документ по XML Schema.',
  },
  validateUrlEncoding: {
    en: 'True if the input is validly URL-encoded.',
    ru: 'Истина, если вход корректно URL-кодирован.',
  },
  validateUtf8Encoding: {
    en: 'True if the input is validly UTF-8 encoded.',
    ru: 'Истина, если вход корректно закодирован в UTF-8.',
  },
  verifyCC: {
    en: 'Detects and validates credit card numbers (Luhn check).',
    ru: 'Находит и проверяет номера банковских карт (алгоритм Луна).',
  },
  verifyCPF: {
    en: 'Detects and validates Brazilian CPF numbers.',
    ru: 'Находит и проверяет бразильские номера CPF.',
  },
  verifySSN: {
    en: 'Detects and validates US Social Security Numbers.',
    ru: 'Находит и проверяет номера соцстрахования США (SSN).',
  },
  within: {
    en: 'True if the input is contained within the given string.',
    ru: 'Истина, если вход содержится в заданной строке.',
  },
  fuzzyHash: {
    en: 'Compares the input against fuzzy hashes (ssdeep).',
    ru: 'Сравнивает вход с нечёткими хешами (ssdeep).',
  },
});

const VARIABLE_DOCS = buildDocs('variable', {
  ARGS: {
    en: 'Collection of all request arguments (GET and POST).',
    ru: 'Коллекция всех аргументов запроса (GET и POST).',
  },
  ARGS_NAMES: {
    en: 'Names of all request arguments.',
    ru: 'Имена всех аргументов запроса.',
  },
  ARGS_GET: {
    en: 'Arguments from the query string only.',
    ru: 'Аргументы только из строки запроса (query string).',
  },
  ARGS_GET_NAMES: {
    en: 'Names of query-string arguments.',
    ru: 'Имена аргументов из строки запроса.',
  },
  ARGS_POST: {
    en: 'Arguments from the request body only.',
    ru: 'Аргументы только из тела запроса.',
  },
  ARGS_POST_NAMES: {
    en: 'Names of request-body arguments.',
    ru: 'Имена аргументов из тела запроса.',
  },
  ARGS_COMBINED_SIZE: {
    en: 'Combined size of all request arguments.',
    ru: 'Суммарный размер всех аргументов запроса.',
  },
  QUERY_STRING: {
    en: 'The raw query string (part after ? in the URI).',
    ru: 'Сырая строка запроса (часть URI после ?).',
  },
  REQUEST_URI: {
    en: 'The request URI, normalized and without the hostname.',
    ru: 'URI запроса, нормализованный и без имени хоста.',
  },
  REQUEST_URI_RAW: {
    en: 'The request URI exactly as received.',
    ru: 'URI запроса ровно в том виде, как он получен.',
  },
  REQUEST_LINE: {
    en: 'The complete request line (method, URI, protocol).',
    ru: 'Полная строка запроса (метод, URI, протокол).',
  },
  REQUEST_METHOD: {
    en: 'The HTTP request method (GET, POST, ...).',
    ru: 'HTTP-метод запроса (GET, POST, ...).',
  },
  REQUEST_PROTOCOL: {
    en: 'The request protocol version (e.g. HTTP/1.1).',
    ru: 'Версия протокола запроса (например, HTTP/1.1).',
  },
  REQUEST_FILENAME: {
    en: 'The URI path without the query string.',
    ru: 'Путь URI без строки запроса.',
  },
  REQUEST_BASENAME: {
    en: 'The last path segment of REQUEST_FILENAME.',
    ru: 'Последний сегмент пути из REQUEST_FILENAME.',
  },
  REQUEST_HEADERS: {
    en: 'Collection of all request headers.',
    ru: 'Коллекция всех заголовков запроса.',
  },
  REQUEST_HEADERS_NAMES: {
    en: 'Names of all request headers.',
    ru: 'Имена всех заголовков запроса.',
  },
  REQUEST_COOKIES: {
    en: 'Collection of request cookies.',
    ru: 'Коллекция cookie запроса.',
  },
  REQUEST_COOKIES_NAMES: {
    en: 'Names of request cookies.',
    ru: 'Имена cookie запроса.',
  },
  REQUEST_BODY: {
    en: 'The raw request body (when buffered).',
    ru: 'Сырое тело запроса (при буферизации).',
  },
  REQUEST_BODY_LENGTH: {
    en: 'The length of the request body in bytes.',
    ru: 'Длина тела запроса в байтах.',
  },
  RESPONSE_BODY: {
    en: 'The response body (when inspection is enabled).',
    ru: 'Тело ответа (когда включена проверка).',
  },
  RESPONSE_HEADERS: {
    en: 'Collection of response headers.',
    ru: 'Коллекция заголовков ответа.',
  },
  RESPONSE_STATUS: {
    en: 'The HTTP response status code.',
    ru: 'HTTP-код статуса ответа.',
  },
  RESPONSE_CONTENT_TYPE: {
    en: 'The response Content-Type.',
    ru: 'Content-Type ответа.',
  },
  FILES: {
    en: 'Collection of original names of uploaded files.',
    ru: 'Коллекция исходных имён загруженных файлов.',
  },
  FILES_NAMES: {
    en: 'Form field names used to upload files.',
    ru: 'Имена полей формы, через которые загружены файлы.',
  },
  FILES_SIZES: {
    en: 'Sizes of individual uploaded files.',
    ru: 'Размеры отдельных загруженных файлов.',
  },
  REMOTE_ADDR: {
    en: 'The client IP address.',
    ru: 'IP-адрес клиента.',
  },
  REMOTE_HOST: {
    en: 'The client hostname (if resolved).',
    ru: 'Имя хоста клиента (если разрешено).',
  },
  REMOTE_PORT: {
    en: 'The source port of the client connection.',
    ru: 'Порт источника соединения клиента.',
  },
  REMOTE_USER: {
    en: 'The authenticated username, if any.',
    ru: 'Имя аутентифицированного пользователя, если есть.',
  },
  SERVER_NAME: {
    en: 'The server hostname handling the request.',
    ru: 'Имя хоста сервера, обрабатывающего запрос.',
  },
  SERVER_ADDR: {
    en: 'The IP address of the server.',
    ru: 'IP-адрес сервера.',
  },
  SERVER_PORT: {
    en: 'The port on which the request was received.',
    ru: 'Порт, на котором получен запрос.',
  },
  TX: {
    en: 'Per-transaction collection for user-defined variables.',
    ru: 'Транзакционная коллекция для пользовательских переменных.',
  },
  IP: {
    en: 'Persistent per-IP collection (created via initcol).',
    ru: 'Постоянная коллекция по IP (создаётся через initcol).',
  },
  SESSION: {
    en: 'Persistent per-session collection (requires setsid).',
    ru: 'Постоянная коллекция по сессии (нужен setsid).',
  },
  USER: {
    en: 'Persistent per-user collection (requires setuid).',
    ru: 'Постоянная коллекция по пользователю (нужен setuid).',
  },
  GEO: {
    en: 'Collection filled by the @geoLookup operator.',
    ru: 'Коллекция, заполняемая оператором @geoLookup.',
  },
  MATCHED_VAR: {
    en: 'The value of the variable that triggered the last match.',
    ru: 'Значение переменной, вызвавшей последнее срабатывание.',
  },
  MATCHED_VARS: {
    en: 'Values of all variables that matched.',
    ru: 'Значения всех совпавших переменных.',
  },
  MATCHED_VAR_NAME: {
    en: 'The name of the variable that triggered the last match.',
    ru: 'Имя переменной, вызвавшей последнее срабатывание.',
  },
  MATCHED_VARS_NAMES: {
    en: 'Names of all variables that matched.',
    ru: 'Имена всех совпавших переменных.',
  },
  TIME: {
    en: 'Current local time as HH:MM:SS.',
    ru: 'Текущее локальное время в формате ЧЧ:ММ:СС.',
  },
  TIME_EPOCH: {
    en: 'Current time as seconds since the Unix epoch.',
    ru: 'Текущее время в секундах от эпохи Unix.',
  },
  UNIQUE_ID: {
    en: 'The unique identifier assigned to the transaction.',
    ru: 'Уникальный идентификатор, назначенный транзакции.',
  },
  DURATION: {
    en: 'Milliseconds elapsed since the transaction began.',
    ru: 'Миллисекунды, прошедшие с начала транзакции.',
  },
  HIGHEST_SEVERITY: {
    en: 'The highest severity of any rule matched so far.',
    ru: 'Наибольшая серьёзность среди сработавших правил.',
  },
  XML: {
    en: 'The parsed XML request body (used with XPath).',
    ru: 'Разобранное XML-тело запроса (используется с XPath).',
  },
  ENV: {
    en: 'Collection of environment variables.',
    ru: 'Коллекция переменных окружения.',
  },
  RULE: {
    en: 'Collection exposing the current rule metadata (id, msg, ...).',
    ru: 'Коллекция с метаданными текущего правила (id, msg, ...).',
  },
  MULTIPART_STRICT_ERROR: {
    en: 'Set when multipart parsing hits a strictness problem.',
    ru: 'Устанавливается при проблеме строгого разбора multipart.',
  },
  REQBODY_ERROR: {
    en: 'Set when request body processing produced an error.',
    ru: 'Устанавливается при ошибке обработки тела запроса.',
  },
});

export const KEYWORD_DOCS: Record<string, KeywordDoc> = {
  ...DIRECTIVE_DOCS,
  ...ACTION_DOCS,
  ...TRANSFORM_DOCS,
  ...OPERATOR_DOCS,
  ...VARIABLE_DOCS,
};

const keysOf = (docs: Record<string, KeywordDoc>) => Object.keys(docs);

export const DIRECTIVES = keysOf(DIRECTIVE_DOCS);
export const ACTIONS = keysOf(ACTION_DOCS);
export const TRANSFORMS = keysOf(TRANSFORM_DOCS);
export const OPERATORS = keysOf(OPERATOR_DOCS);
export const VARIABLES = keysOf(VARIABLE_DOCS);

export function lookupKeyword(raw: string): KeywordDoc | null {
  if (!raw) return null;
  let value = raw.trim();

  if (value.startsWith('!')) value = value.slice(1);
  if (value.startsWith('@')) {
    return KEYWORD_DOCS[value.slice(1)] ?? null;
  }

  if (value.startsWith('t:')) {
    return KEYWORD_DOCS[value.slice(2)] ?? null;
  }

  if (value.startsWith('&')) value = value.slice(1);
  const base = value.split(':')[0];

  return KEYWORD_DOCS[value] ?? KEYWORD_DOCS[base] ?? null;
}
