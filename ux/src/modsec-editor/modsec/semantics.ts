/**
 * База знаний о семантике ModSecurity.
 *
 * Парсер (`parser.ts`) отвечает только за форму текста. Здесь описано, что
 * конструкции ЗНАЧАТ и как они ограничивают друг друга — то, без чего
 * визуальный конструктор не может подсказывать корректные варианты:
 *
 *  - какие переменные являются коллекциями (можно `&` и селектор);
 *  - какой тип значения приходит на вход оператору (строка / число / бинарь);
 *  - какие операторы применимы к этому типу и какой аргумент им нужен;
 *  - какие проверки исключают другие (подсчёт `&` отменяет трансформации,
 *    `t:length` переводит вход в число и т.д.);
 *  - в какой фазе переменная вообще заполнена.
 *
 * Модуль не зависит от React и от UI-словарей: подписи хранятся здесь же,
 * чтобы конструктор мог показывать «человеческие» названия вместо `ARGS_GET`.
 */

/** Двуязычная подпись для UI. */
export interface Label {
  en: string;
  ru: string;
}

/** Фаза обработки запроса/ответа. */
export type Phase = 1 | 2 | 3 | 4 | 5;

/** Тип значения, который получает оператор. */
export type ValueKind = 'string' | 'number' | 'binary';

/** Поддержка уточнения после `:` у переменной. */
export type SelectorSupport = 'none' | 'optional' | 'required';

/* ------------------------------------------------------------------ */
/* Переменные (области проверки)                                       */
/* ------------------------------------------------------------------ */

export interface VariableMeta {
  /** Коллекция — раскрывается в несколько значений, допускает `&` и селектор. */
  collection: boolean;
  /** Допустимо ли уточнение `:selector` и обязательно ли оно. */
  selector: SelectorSupport;
  /** Тип значения одного элемента. */
  value: ValueKind;
  /** Минимальная фаза, начиная с которой переменная заполнена. */
  minPhase: Phase;
  label: Label;
}

/** Компактная запись строки таблицы переменных. */
function v(
  collection: boolean,
  selector: SelectorSupport,
  value: ValueKind,
  minPhase: Phase,
  en: string,
  ru: string,
): VariableMeta {
  return { collection, selector, value, minPhase, label: { en, ru } };
}

export const VARIABLE_META: Record<string, VariableMeta> = {
  ARGS: v(true, 'optional', 'string', 2, 'Request parameters', 'Параметры запроса'),
  ARGS_NAMES: v(true, 'optional', 'string', 2, 'Parameter names', 'Названия параметров'),
  ARGS_GET: v(true, 'optional', 'string', 1, 'GET parameters', 'Параметры GET'),
  ARGS_GET_NAMES: v(true, 'optional', 'string', 1, 'GET parameter names', 'Названия параметров GET'),
  ARGS_POST: v(true, 'optional', 'string', 2, 'POST parameters', 'Параметры POST'),
  ARGS_POST_NAMES: v(true, 'optional', 'string', 2, 'POST parameter names', 'Названия параметров POST'),
  ARGS_COMBINED_SIZE: v(false, 'none', 'number', 2, 'Total parameters size', 'Суммарный размер параметров'),

  QUERY_STRING: v(false, 'none', 'string', 1, 'Query string', 'Строка запроса'),
  REQUEST_URI: v(false, 'none', 'string', 1, 'Path with query', 'Путь с параметрами'),
  REQUEST_URI_RAW: v(false, 'none', 'string', 1, 'Raw URI', 'Сырой URI'),
  REQUEST_LINE: v(false, 'none', 'string', 1, 'Request line', 'Строка запроса HTTP'),
  REQUEST_METHOD: v(false, 'none', 'string', 1, 'Method', 'Метод'),
  REQUEST_PROTOCOL: v(false, 'none', 'string', 1, 'Protocol', 'Протокол'),
  REQUEST_FILENAME: v(false, 'none', 'string', 1, 'Path', 'Путь'),
  REQUEST_BASENAME: v(false, 'none', 'string', 1, 'File name', 'Имя файла'),

  REQUEST_HEADERS: v(true, 'optional', 'string', 1, 'Request headers', 'Заголовки запроса'),
  REQUEST_HEADERS_NAMES: v(true, 'optional', 'string', 1, 'Request header names', 'Названия заголовков запроса'),
  REQUEST_COOKIES: v(true, 'optional', 'string', 1, 'Cookies', 'Cookie'),
  REQUEST_COOKIES_NAMES: v(true, 'optional', 'string', 1, 'Cookie names', 'Названия Cookie'),

  REQUEST_BODY: v(false, 'none', 'string', 2, 'Request body', 'Тело запроса'),
  REQUEST_BODY_LENGTH: v(false, 'none', 'number', 2, 'Request body length', 'Длина тела запроса'),

  RESPONSE_BODY: v(false, 'none', 'string', 4, 'Response body', 'Тело ответа'),
  RESPONSE_HEADERS: v(true, 'optional', 'string', 3, 'Response headers', 'Заголовки ответа'),
  RESPONSE_STATUS: v(false, 'none', 'number', 3, 'Response status', 'Код ответа'),
  RESPONSE_CONTENT_TYPE: v(false, 'none', 'string', 3, 'Response content type', 'Тип содержимого ответа'),

  FILES: v(true, 'optional', 'string', 2, 'Uploaded file names', 'Имена загруженных файлов'),
  FILES_NAMES: v(true, 'optional', 'string', 2, 'File field names', 'Названия полей файлов'),
  FILES_SIZES: v(true, 'optional', 'number', 2, 'File sizes', 'Размеры файлов'),

  REMOTE_ADDR: v(false, 'none', 'string', 1, 'Client IP', 'IP клиента'),
  REMOTE_HOST: v(false, 'none', 'string', 1, 'Client host', 'Хост клиента'),
  REMOTE_PORT: v(false, 'none', 'number', 1, 'Client port', 'Порт клиента'),
  REMOTE_USER: v(false, 'none', 'string', 1, 'Authenticated user', 'Пользователь'),
  SERVER_NAME: v(false, 'none', 'string', 1, 'Server name', 'Имя сервера'),
  SERVER_ADDR: v(false, 'none', 'string', 1, 'Server IP', 'IP сервера'),
  SERVER_PORT: v(false, 'none', 'number', 1, 'Server port', 'Порт сервера'),

  TX: v(true, 'required', 'string', 1, 'Transaction variable', 'Переменная транзакции'),
  IP: v(true, 'required', 'string', 1, 'IP collection', 'Коллекция IP'),
  SESSION: v(true, 'required', 'string', 1, 'Session collection', 'Коллекция сессии'),
  USER: v(true, 'required', 'string', 1, 'User collection', 'Коллекция пользователя'),
  GEO: v(true, 'required', 'string', 1, 'Geo data', 'Геоданные'),
  ENV: v(true, 'required', 'string', 1, 'Environment variable', 'Переменная окружения'),
  RULE: v(true, 'required', 'string', 1, 'Current rule metadata', 'Метаданные правила'),
  XML: v(true, 'required', 'string', 2, 'XML (XPath)', 'XML (XPath)'),

  MATCHED_VAR: v(false, 'none', 'string', 1, 'Matched value', 'Совпавшее значение'),
  MATCHED_VARS: v(true, 'optional', 'string', 1, 'Matched values', 'Совпавшие значения'),
  MATCHED_VAR_NAME: v(false, 'none', 'string', 1, 'Matched variable name', 'Имя совпавшей переменной'),
  MATCHED_VARS_NAMES: v(true, 'optional', 'string', 1, 'Matched variable names', 'Имена совпавших переменных'),

  TIME: v(false, 'none', 'string', 1, 'Time', 'Время'),
  TIME_EPOCH: v(false, 'none', 'number', 1, 'Unix time', 'Время Unix'),
  UNIQUE_ID: v(false, 'none', 'string', 1, 'Request id', 'Идентификатор запроса'),
  DURATION: v(false, 'none', 'number', 1, 'Elapsed time', 'Прошедшее время'),
  HIGHEST_SEVERITY: v(false, 'none', 'number', 1, 'Highest severity', 'Наивысшая критичность'),
  MULTIPART_STRICT_ERROR: v(false, 'none', 'number', 2, 'Multipart strict error', 'Ошибка разбора multipart'),
  REQBODY_ERROR: v(false, 'none', 'number', 2, 'Body parse error', 'Ошибка разбора тела'),
};

/** Все известные имена переменных. */
export const VARIABLE_NAMES = Object.keys(VARIABLE_META);

/** Метаданные переменной или `null`, если имя незнакомо. */
export function variableMeta(name: string): VariableMeta | null {
  return VARIABLE_META[name] ?? null;
}

/* ------------------------------------------------------------------ */
/* Операторы                                                           */
/* ------------------------------------------------------------------ */

/** Вид аргумента, который ожидает оператор. */
export type OperatorArg =
  | 'none'
  | 'string'
  | 'regex'
  | 'number'
  | 'ipList'
  | 'phrases'
  | 'file'
  | 'byteRange';

export interface OperatorMeta {
  arg: OperatorArg;
  /** Типы входа, для которых оператор осмыслен. */
  inputs: ValueKind[];
  /**
   * Оператор встречается в правилах постоянно.
   *
   * Их всего пара десятков на весь ModSecurity, но пишут почти всегда одни
   * и те же восемь. Признак нужен списку: краткий вид показывает только их,
   * а остальные прячет за «показать все» — иначе полсотни строк выглядят
   * равнозначными, и выбрать среди них не проще, чем вспомнить наизусть.
   */
  common: boolean;
  /** Раздел, которым оператор стоит в списке. */
  group: Label;
  label: Label;
  /** Чем оператор отличается от соседей по разделу. */
  note: Label;
  /** Короткий символ для компактной кнопки (как «=» в референсе). */
  symbol?: string;
}

const ANY_TEXT: ValueKind[] = ['string', 'binary'];
const ANY: ValueKind[] = ['string', 'number', 'binary'];
const NUM: ValueKind[] = ['number'];

/** Строка таблицы операторов до того, как раздел проставит общие поля. */
interface OperatorEntry {
  arg: OperatorArg;
  common: boolean;
  label: Label;
  note: Label;
  symbol?: string;
  /** Переопределение типов входа, если оператор выбивается из раздела. */
  inputs?: ValueKind[];
}

function o(
  arg: OperatorArg,
  en: string,
  ru: string,
  noteEn: string,
  noteRu: string,
  symbol?: string,
): OperatorEntry {
  return { arg, common: false, label: { en, ru }, note: { en: noteEn, ru: noteRu }, symbol };
}

/** То же, но оператор попадает в краткий список. */
function oc(
  arg: OperatorArg,
  en: string,
  ru: string,
  noteEn: string,
  noteRu: string,
  symbol?: string,
): OperatorEntry {
  return { ...o(arg, en, ru, noteEn, noteRu, symbol), common: true };
}

/** Раздел списка: тип входа задаётся один раз на всю группу. */
function operatorGroup(
  en: string,
  ru: string,
  inputs: ValueKind[],
  items: Record<string, OperatorEntry>,
): Record<string, OperatorMeta> {
  const group: Label = { en, ru };
  return Object.fromEntries(
    Object.entries(items).map(([name, entry]) => [
      name,
      { ...entry, group, inputs: entry.inputs ?? inputs },
    ]),
  );
}

export const OPERATOR_META: Record<string, OperatorMeta> = {
  ...operatorGroup('Text', 'Текст', ANY_TEXT, {
    rx: oc(
      'regex',
      'matches regex',
      'соответствует regex',
      'Full PCRE regular expression — the most flexible check and the most expensive one',
      'Полноценное регулярное выражение PCRE — самый гибкий и самый дорогой способ проверки',
      '~',
    ),
    // Подпись называет тип сравнения, а не просто «равно»: числовой `eq`
    // стоит в том же списке, и по одному слову их не различить.
    streq: oc(
      'string',
      'equals the string',
      'равно строке',
      'Exact match of the whole value, without substrings or patterns',
      'Точное совпадение значения целиком, без подстрок и шаблонов',
      '=',
    ),
    contains: oc(
      'string',
      'contains',
      'содержит',
      'Plain substring search — cheaper than a regular expression',
      'Простой поиск подстроки — дешевле регулярного выражения',
      '⊃',
    ),
    beginsWith: oc(
      'string',
      'begins with',
      'начинается с',
      'Useful for paths: one check for the whole /admin section',
      'Удобно для путей: одна проверка на весь раздел /admin',
    ),
    endsWith: oc(
      'string',
      'ends with',
      'заканчивается на',
      'Useful for extensions: .php, .bak and the like',
      'Удобно для расширений: .php, .bak и подобных',
    ),
    containsWord: o(
      'string',
      'contains word',
      'содержит слово',
      'Substring surrounded by word boundaries — "select" will not match "selection"',
      'Подстрока, отделённая границами слова: «select» не найдётся в «selection»',
    ),
    within: o(
      'string',
      'is one of',
      'входит в список',
      'The other way round: the checked value must occur inside the listed text',
      'Наоборот: проверяемое значение должно встретиться внутри перечисленного текста',
    ),
    strmatch: o(
      'string',
      'matches pattern',
      'совпадает с образцом',
      'Substring search by the Boyer–Moore algorithm; faster than contains on long values',
      'Поиск подстроки по алгоритму Бойера—Мура; быстрее contains на длинных значениях',
    ),
  }),

  ...operatorGroup('Numbers', 'Числа', NUM, {
    eq: oc(
      'number',
      'equals the number',
      'равно числу',
      'Exactly the given number',
      'Ровно указанное число',
      '=',
    ),
    gt: oc(
      'number',
      'greater than',
      'больше',
      'Strictly greater — the usual way to write a limit',
      'Строго больше — обычная запись ограничения',
      '>',
    ),
    ge: o('number', 'greater or equal', 'больше или равно', 'Greater or the same', 'Больше или столько же', '≥'),
    lt: o('number', 'less than', 'меньше', 'Strictly less', 'Строго меньше', '<'),
    le: o('number', 'less or equal', 'меньше или равно', 'Less or the same', 'Меньше или столько же', '≤'),
  }),

  ...operatorGroup('Phrase lists', 'Списки фраз', ANY_TEXT, {
    pm: oc(
      'phrases',
      'matches any phrase',
      'совпадает с любой из фраз',
      'Searches for all phrases in a single pass — cheaper than a dozen separate checks',
      'Ищет все фразы за один проход — дешевле десятка отдельных проверок',
    ),
    pmFromFile: oc(
      'file',
      'matches a phrase from file',
      'совпадает с фразой из файла',
      'The same search with the list kept in a .data file; this is the spelling CRS uses',
      'Тот же поиск, список лежит в файле .data; это написание принято в CRS',
    ),
    pmf: o(
      'file',
      'matches a phrase from file (alias)',
      'совпадает с фразой из файла (синоним)',
      'Short alias of pmFromFile',
      'Короткий синоним pmFromFile',
    ),
  }),

  ...operatorGroup('Addresses', 'Адреса', ANY_TEXT, {
    ipMatch: oc(
      'ipList',
      'IP is in the list',
      'IP входит в список',
      'Compares against CIDR ranges, so a whole network fits in one value',
      'Сравнивает с диапазонами CIDR — целая сеть укладывается в одно значение',
    ),
    ipMatchFromFile: o(
      'file',
      'IP is in the file',
      'IP есть в файле',
      'The same, with the list of ranges kept in a file',
      'То же самое, но список диапазонов лежит в файле',
    ),
    ipMatchF: o(
      'file',
      'IP is in the file (alias)',
      'IP есть в файле (синоним)',
      'Short alias of ipMatchFromFile',
      'Короткий синоним ipMatchFromFile',
    ),
  }),

  ...operatorGroup('Attack detectors', 'Детекторы атак', ANY_TEXT, {
    detectSQLi: oc(
      'none',
      'looks like SQL injection',
      'похоже на SQL-инъекцию',
      'Built-in libinjection analyser: finds injections without a regular expression and without a value',
      'Встроенный анализатор libinjection: находит инъекции без регулярного выражения и без значения',
    ),
    detectXSS: oc(
      'none',
      'looks like XSS',
      'похоже на XSS',
      'The same analyser for cross-site scripting',
      'Тот же анализатор для межсайтового скриптинга',
    ),
  }),

  ...operatorGroup('Format validation', 'Проверка формата', ANY_TEXT, {
    validateUrlEncoding: o(
      'none',
      'URL encoding is valid',
      'URL-кодирование корректно',
      'Catches broken percent sequences — a classic way to confuse the parser',
      'Ловит битые процентные последовательности — классический способ запутать разбор',
    ),
    validateUtf8Encoding: o(
      'none',
      'UTF-8 is valid',
      'UTF-8 корректен',
      'Catches overlong sequences used to smuggle characters past filters',
      'Ловит переудлинённые последовательности, которыми протаскивают символы мимо фильтров',
    ),
    validateByteRange: o(
      'byteRange',
      'bytes are within the range',
      'байты в диапазоне',
      'Every byte of the value must fall into the listed range',
      'Каждый байт значения должен попадать в перечисленный диапазон',
    ),
    validateDTD: o(
      'file',
      'valid against a DTD',
      'соответствует DTD',
      'Checks the parsed XML body; requires the XML parser to be enabled',
      'Проверяет разобранное тело XML; нужен включённый разбор XML',
    ),
    validateSchema: o(
      'file',
      'valid against a schema',
      'соответствует схеме',
      'The same for an XSD schema',
      'То же самое для схемы XSD',
    ),
    validateHash: o(
      'regex',
      'link signature is valid',
      'подпись ссылки верна',
      'Part of link hardening: verifies the signature ModSecurity itself added',
      'Часть защиты ссылок: проверяет подпись, которую сам ModSecurity и проставил',
    ),
  }),

  ...operatorGroup('Number validation', 'Проверка номеров', ANY_TEXT, {
    verifyCC: o(
      'regex',
      'valid card number',
      'корректный номер карты',
      'Luhn check on top of the pattern — used to catch leaks of payment data',
      'Проверка Луна поверх шаблона — ищут утечки платёжных данных',
    ),
    verifyCPF: o(
      'regex',
      'valid CPF',
      'корректный CPF',
      'Brazilian taxpayer number',
      'Бразильский идентификационный номер',
    ),
    verifySSN: o(
      'regex',
      'valid SSN',
      'корректный SSN',
      'US social security number',
      'Номер социального страхования США',
    ),
  }),

  ...operatorGroup('External lookups', 'Внешние источники', ANY_TEXT, {
    rbl: o(
      'string',
      'listed in an RBL',
      'числится в RBL',
      'Asks a DNS blocklist — a network round trip on every call',
      'Спрашивает DNS-список блокировок — сетевой запрос на каждый вызов',
    ),
    gsbLookup: o(
      'regex',
      'listed in Safe Browsing',
      'числится в Safe Browsing',
      'Checks links found by the pattern against the Google Safe Browsing database',
      'Сверяет найденные шаблоном ссылки с базой Google Safe Browsing',
    ),
    geoLookup: o(
      'none',
      'geo lookup',
      'геолокация',
      'Does not check anything by itself: it fills the GEO collection for the next condition',
      'Сам ничего не проверяет: заполняет коллекцию GEO для следующего условия',
    ),
    inspectFile: o(
      'file',
      'passed the external script',
      'прошёл проверку скриптом',
      'Hands the uploaded file to an external program — an antivirus, for instance',
      'Отдаёт загруженный файл внешней программе — например, антивирусу',
    ),
    fuzzyHash: o(
      'file',
      'fuzzy hash matches',
      'совпадает нечёткий хеш',
      'Compares the file against known samples allowing for small changes',
      'Сравнивает файл с известными образцами, допуская небольшие отличия',
    ),
  }),

  ...operatorGroup('Special', 'Особые', ANY, {
    rsub: {
      ...o(
        'string',
        'substitute',
        'заменить',
        'Edits the value by an s/…/…/ pattern instead of checking it — for rewriting the response',
        'Правит значение по образцу s/…/…/ вместо проверки — для переписывания ответа',
      ),
      inputs: ANY_TEXT,
    },
    unconditionalMatch: o(
      'none',
      'always matches',
      'срабатывает всегда',
      'A rule that only sets variables or counters and checks nothing',
      'Правило, которое ничего не проверяет, а только выставляет переменные или счётчики',
    ),
    noMatch: o(
      'none',
      'never matches',
      'никогда не срабатывает',
      'A placeholder: keeps the rule in place while switching it off',
      'Заглушка: оставляет правило на месте, но выключает его',
    ),
  }),
};

export const OPERATOR_NAMES = Object.keys(OPERATOR_META);

export function operatorMeta(name: string): OperatorMeta | null {
  return OPERATOR_META[name] ?? null;
}

/** Операторы, осмысленные для указанного типа входа. */
export function operatorsForInput(kind: ValueKind): string[] {
  return OPERATOR_NAMES.filter((name) => OPERATOR_META[name].inputs.includes(kind));
}

/**
 * Как называется то, что кладут в поле значения.
 *
 * Поле у всех операторов одно и то же, а ждут они разное: `@rx` — выражение,
 * `@gt` — число, `@ipMatch` — сети, `@pmFromFile` — имя файла. Название типа
 * стоит в подписи поля, чтобы это не приходилось выводить из оператора.
 * Слова короткие: подпись стоит в узкой колонке и длинную обрежет.
 */
export const OPERATOR_ARG_LABELS: Record<OperatorArg, Label | null> = {
  none: null,
  string: { en: 'string', ru: 'строка' },
  regex: { en: 'regex', ru: 'regex' },
  number: { en: 'number', ru: 'число' },
  ipList: { en: 'IP ranges', ru: 'IP-сети' },
  phrases: { en: 'phrases', ru: 'фразы' },
  file: { en: 'file', ru: 'файл' },
  byteRange: { en: 'bytes', ru: 'байты' },
};

/**
 * Название типа значения оператора; `null` — значения нет либо оператор
 * незнаком и обещать что-либо о его аргументе нельзя.
 */
export function operatorArgLabel(name: string): Label | null {
  const meta = operatorMeta(name);
  return meta === null ? null : OPERATOR_ARG_LABELS[meta.arg];
}

/**
 * Разделитель списка внутри аргумента оператора; `null` — аргумент цельный.
 *
 * ModSecurity держит такие списки одной строкой: `@ipMatch` перечисляет сети
 * через запятую, `@pm` — фразы через пробел. Конструктору это нужно, чтобы
 * показать список набором значений, а не строкой с разделителями.
 */
export function operatorListSeparator(name: string): string | null {
  const meta = operatorMeta(name);
  if (meta === null) return null;
  if (meta.arg === 'ipList') return ',';
  if (meta.arg === 'phrases') return ' ';
  return null;
}

/** Разбирает аргумент-список на отдельные значения. */
export function splitOperatorArgument(argument: string, separator: string): string[] {
  const parts = separator === ' ' ? argument.split(/\s+/) : argument.split(separator);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/* ------------------------------------------------------------------ */
/* Трансформации                                                       */
/* ------------------------------------------------------------------ */

export interface TransformMeta {
  /** Тип значения на выходе трансформации. */
  produces: ValueKind;
  /** `t:none` — сбрасывает весь конвейер, накопленный ранее. */
  resets: boolean;
  /**
   * Типы входа, на которых преобразование осмысленно.
   *
   * Отсюда берётся ответ на «подходит ли это к тому, что я проверяю»:
   * после `t:length` или у `&ARGS` в руках уже число, и приводить его к
   * нижнему регистру нечему; после `t:md5` — двоичный хеш, и обрезать у
   * него пробелы тоже незачем.
   */
  accepts: ValueKind[];
  /** Встречается в реальных правилах постоянно — попадает в краткий список. */
  common: boolean;
  /** Раздел, которым преобразование стоит в списке. */
  group: Label;
  label: Label;
  /** Что именно оно делает и зачем его обычно ставят. */
  note: Label;
}

const TEXT: ValueKind[] = ['string'];

/** Строка таблицы преобразований до того, как раздел проставит общие поля. */
interface TransformEntry {
  common: boolean;
  label: Label;
  note: Label;
  /** Переопределение выхода, если преобразование выбивается из раздела. */
  produces?: ValueKind;
}

function tf(en: string, ru: string, noteEn: string, noteRu: string): TransformEntry {
  return { common: false, label: { en, ru }, note: { en: noteEn, ru: noteRu } };
}

/** То же, но преобразование попадает в краткий список. */
function tfc(en: string, ru: string, noteEn: string, noteRu: string): TransformEntry {
  return { ...tf(en, ru, noteEn, noteRu), common: true };
}

/** Раздел списка: типы входа и выхода задаются один раз на всю группу. */
function transformGroup(
  en: string,
  ru: string,
  accepts: ValueKind[],
  produces: ValueKind,
  items: Record<string, TransformEntry>,
  resets = false,
): Record<string, TransformMeta> {
  const group: Label = { en, ru };
  return Object.fromEntries(
    Object.entries(items).map(([name, entry]) => [
      name,
      { ...entry, group, accepts, resets, produces: entry.produces ?? produces },
    ]),
  );
}

export const TRANSFORM_META: Record<string, TransformMeta> = {
  ...transformGroup(
    'Reset',
    'Сброс',
    ANY,
    'string',
    {
      none: tfc(
        'Reset transformations',
        'Сбросить преобразования',
        'Drops everything set earlier, including what came from SecDefaultAction — must stand first',
        'Отменяет всё заданное раньше, в том числе унаследованное от SecDefaultAction — ставится первым',
      ),
    },
    true,
  ),

  ...transformGroup('Case and whitespace', 'Регистр и пробелы', TEXT, 'string', {
    lowercase: tfc(
      'To lower case',
      'Привести к нижнему регистру',
      'Removes the difference between SELECT and sElEcT — almost every text check starts here',
      'Снимает разницу между SELECT и sElEcT — почти любая проверка текста начинается с него',
    ),
    compressWhitespace: tfc(
      'Collapse whitespace',
      'Схлопнуть пробелы',
      'Several spaces become one, so "union      select" stops slipping through',
      'Несколько пробелов становятся одним, и «union      select» перестаёт проскакивать',
    ),
    trim: tfc(
      'Trim whitespace',
      'Убрать пробелы по краям',
      'Removes leading and trailing spaces, so a padded value still equals the expected one',
      'Убирает пробелы по краям, чтобы значение с отступами всё-таки совпало с ожидаемым',
    ),
    uppercase: tf(
      'To upper case',
      'Привести к верхнему регистру',
      'The mirror of lowercase; make sure the value you compare with is upper case too',
      'Зеркало нижнего регистра; следите, чтобы значение для сравнения тоже было прописным',
    ),
    trimLeft: tf('Trim left', 'Убрать пробелы слева', 'Only the leading spaces', 'Только пробелы в начале'),
    trimRight: tf('Trim right', 'Убрать пробелы справа', 'Only the trailing spaces', 'Только пробелы в конце'),
    removeWhitespace: tf(
      'Remove whitespace',
      'Удалить пробелы',
      'Removes spaces completely — breaks checks where the space itself matters',
      'Удаляет пробелы совсем — ломает проверки, где сам пробел значим',
    ),
  }),

  ...transformGroup('Decoding', 'Декодирование', TEXT, 'string', {
    urlDecodeUni: tfc(
      'URL decode (Unicode)',
      'Декодировать URL (с %uXXXX)',
      'URL decoding plus the IIS-style %u0041 — the safer default of the two',
      'URL-декодирование вместе с %u0041 в стиле IIS — из двух вариантов безопаснее этот',
    ),
    htmlEntityDecode: tfc(
      'Decode HTML entities',
      'Раскрыть HTML-сущности',
      'Turns &lt; and &#60; back into < — the standard way XSS is disguised',
      'Возвращает &lt; и &#60; к виду < — стандартная маскировка XSS',
    ),
    urlDecode: tf(
      'URL decode',
      'Декодировать URL',
      'Turns %41 and + back into plain characters, but ignores %uXXXX',
      'Возвращает %41 и + к обычным символам, но не понимает %uXXXX',
    ),
    utf8toUnicode: tf(
      'UTF-8 to Unicode',
      'UTF-8 в %uXXXX',
      'Exposes overlong UTF-8 sequences so that double encoding cannot hide a character',
      'Раскрывает переудлинённые последовательности UTF-8, чтобы двойное кодирование не спрятало символ',
    ),
    jsDecode: tf(
      'Decode JavaScript escapes',
      'Раскрыть escape JavaScript',
      'Expands \\x3c and \\u003c — needed when the payload travels inside a script',
      'Раскрывает \\x3c и \\u003c — нужно, когда полезная нагрузка едет внутри скрипта',
    ),
    cssDecode: tf(
      'Decode CSS escapes',
      'Раскрыть escape CSS',
      'Expands \\3c — the way expressions are hidden in style attributes',
      'Раскрывает \\3c — так прячут выражения в атрибутах стиля',
    ),
    escapeSeqDecode: tf(
      'Decode escape sequences',
      'Раскрыть escape-последовательности',
      'Expands the C-style \\n, \\t and \\xHH',
      'Раскрывает \\n, \\t и \\xHH в стиле C',
    ),
    base64Decode: tf(
      'Decode Base64',
      'Декодировать Base64',
      'Stops at the first character outside the alphabet',
      'Останавливается на первом символе не из алфавита',
    ),
    base64DecodeExt: tf(
      'Decode Base64 (lenient)',
      'Декодировать Base64 (мягко)',
      'Skips junk characters the way PHP does — decodes what strict Base64 refuses',
      'Пропускает мусорные символы, как это делает PHP, — разбирает то, на чём строгий Base64 сдаётся',
    ),
    hexDecode: tf(
      'Decode hex',
      'Декодировать шестнадцатеричное',
      'Reads the value as a hex string and turns it back into bytes',
      'Читает значение как шестнадцатеричную строку и превращает обратно в байты',
    ),
  }),

  ...transformGroup('Sanitising', 'Очистка', TEXT, 'string', {
    removeNulls: tfc(
      'Remove null bytes',
      'Удалить нулевые байты',
      'Null bytes are used to cut a string short before the dangerous part',
      'Нулевым байтом обрывают строку перед опасной частью',
    ),
    replaceComments: tfc(
      'Replace comments with a space',
      'Заменить комментарии пробелом',
      'Turns un/**/ion into "un ion" instead of gluing it into a new word',
      'Превращает un/**/ion в «un ion», а не склеивает в новое слово',
    ),
    cmdLine: tfc(
      'Normalise a command line',
      'Нормализовать командную строку',
      'Strips the ^, quotes and stray spaces that Windows shells accept inside a command',
      'Убирает ^, кавычки и лишние пробелы, которые оболочки Windows допускают внутри команды',
    ),
    removeComments: tf(
      'Remove comments',
      'Вырезать комментарии',
      'Cuts out /* */, -- and # completely — may glue the neighbouring words together',
      'Вырезает /* */, -- и # целиком — соседние слова могут склеиться',
    ),
    removeCommentsChar: tf(
      'Remove comment characters',
      'Удалить символы комментария',
      'Removes only the markers, leaving what was commented out in place',
      'Убирает только сами метки, оставляя закомментированное на месте',
    ),
    replaceNulls: tf(
      'Replace null bytes',
      'Заменить нулевые байты',
      'Replaces them with a space, keeping the length of the value',
      'Заменяет их пробелом, сохраняя длину значения',
    ),
  }),

  ...transformGroup('Paths', 'Пути', TEXT, 'string', {
    normalizePath: tfc(
      'Normalise a path',
      'Нормализовать путь',
      'Folds ./ and ../ so that directory traversal becomes visible',
      'Свёртывает ./ и ../, и обход каталогов становится виден',
    ),
    normalizePathWin: tf(
      'Normalise a Windows path',
      'Нормализовать путь Windows',
      'The same, but a backslash counts as a separator too',
      'То же самое, но разделителем считается и обратная косая черта',
    ),
    // Британские написания — точные синонимы, и подпись обязана это
    // показывать: одинаковое название на двух строках выглядит как
    // повтор, а выбранное потом не отличить в закрытом поле.
    normalisePath: tf(
      'Normalise a path (alias)',
      'Нормализовать путь (синоним)',
      'British spelling of normalizePath — the same transformation',
      'Британское написание normalizePath — то же самое преобразование',
    ),
    normalisePathWin: tf(
      'Normalise a Windows path (alias)',
      'Нормализовать путь Windows (синоним)',
      'British spelling of normalizePathWin',
      'Британское написание normalizePathWin',
    ),
  }),

  ...transformGroup('Encoding and hashes', 'Кодирование и хеши', ANY_TEXT, 'binary', {
    urlEncode: {
      ...tf(
        'URL encode',
        'Кодировать URL',
        'The reverse step: needed to compare against an already encoded string',
        'Обратный шаг: нужен, чтобы сравнить с уже закодированной строкой',
      ),
      produces: 'string',
    },
    hexEncode: tf(
      'Encode as hex',
      'Кодировать в шестнадцатеричное',
      'Makes non-printable bytes visible and comparable',
      'Делает непечатаемые байты видимыми и сравнимыми',
    ),
    base64Encode: tf('Encode as Base64', 'Кодировать в Base64', 'The reverse of decoding', 'Обратное декодированию'),
    md5: tf(
      'MD5 hash',
      'Хеш MD5',
      'The result is raw bytes: compare it after hexEncode, not as text',
      'На выходе сырые байты: сравнивать после hexEncode, а не как текст',
    ),
    sha1: tf(
      'SHA-1 hash',
      'Хеш SHA-1',
      'The result is raw bytes: compare it after hexEncode, not as text',
      'На выходе сырые байты: сравнивать после hexEncode, а не как текст',
    ),
  }),

  ...transformGroup('Parity', 'Чётность', TEXT, 'binary', {
    parityEven7bit: tf(
      'Even parity (7 bit)',
      'Дополнить до чётности (7 бит)',
      'Sets the high bit of every byte to even parity — from the world of legacy protocols',
      'Выставляет старший бит каждого байта до чётности — из мира устаревших протоколов',
    ),
    parityOdd7bit: tf(
      'Odd parity (7 bit)',
      'Дополнить до нечётности (7 бит)',
      'The same, to odd parity',
      'То же самое, но до нечётности',
    ),
    parityZero7bit: tf(
      'Zero parity (7 bit)',
      'Обнулить старший бит (7 бит)',
      'Clears the high bit of every byte',
      'Обнуляет старший бит каждого байта',
    ),
  }),

  ...transformGroup('Number', 'Число', ANY_TEXT, 'number', {
    length: tfc(
      'Value length',
      'Длина значения',
      'Replaces the value with its length in bytes — after it only numeric operators are left',
      'Заменяет значение его длиной в байтах — дальше остаются только числовые операторы',
    ),
  }),
};

export const TRANSFORM_NAMES = Object.keys(TRANSFORM_META);

export function transformMeta(name: string): TransformMeta | null {
  return TRANSFORM_META[name] ?? null;
}

/* ------------------------------------------------------------------ */
/* Взаимные ограничения проверок                                       */
/* ------------------------------------------------------------------ */

/**
 * Как читать список параметров цели.
 *
 * `only` — проверяются перечисленные параметры (`VAR:a|VAR:b`), `except` —
 * вся коллекция без них (`VAR|!VAR:a`). Промежуточного состояния нет: в
 * ModSecurity положительный терм добавляет элементы, а `!` вычитает, и
 * смешивать два способа в одной цели незачем.
 */
export type TargetMode = 'only' | 'except';

/** Цель проверки в терминах конструктора: переменная + её параметры. */
export interface TargetLike {
  name: string;
  count: boolean;
  mode: TargetMode;
  /** Параметры (`VAR:name`) либо исключения (`!VAR:name`) — смотря по режиму. */
  params: string[];
  /** Цель состоит только из вычитания (положительной части нет). */
  excludeOnly?: boolean;
}

/**
 * Положительная часть цели — вся коллекция, а не перечень параметров.
 *
 * Только к такой цели можно прижать исключения: вычитать из перечня
 * бессмысленно, там уже сказано, что именно проверяется.
 */
export function hasWholeBase(target: TargetLike): boolean {
  if (target.excludeOnly) return false;
  return target.mode === 'except' || target.params.length === 0;
}

/**
 * Что доступно в текущей строке условия и почему.
 *
 * Именно здесь живёт правило «одни проверки исключают другие»: подсчёт `&`
 * превращает вход в число, из-за чего трансформации теряют смысл, а список
 * операторов сжимается до числовых сравнений.
 */
export interface ConditionConstraints {
  /** Тип значения целей до конвейера — с него конвейер начинается. */
  baseKind: ValueKind;
  /** Тип значения, который в итоге получит оператор. */
  inputKind: ValueKind;
  /** Можно ли редактировать конвейер трансформаций. */
  transformsAllowed: boolean;
  /** Почему трансформации запрещены (ключ перевода), если запрещены. */
  transformsBlockedBy: 'count' | null;
  /** Операторы, применимые к `inputKind`. */
  operators: string[];
  /** Минимальная фаза, в которой все цели уже заполнены. */
  minPhase: Phase;
}

/**
 * Тип значения на входе каждого шага конвейера и на выходе последнего.
 *
 * Длина результата — на единицу больше числа трансформаций: нулевой элемент
 * это то, что пришло от целей, последний — то, что получит оператор. Список
 * нужен целиком, а не только итог: выбирать очередную трансформацию нужно
 * по тому, что лежит в руках именно перед ней, а не после всего конвейера.
 */
export function pipelineKinds(base: ValueKind, transforms: string[]): ValueKind[] {
  const kinds: ValueKind[] = [base];
  let kind = base;
  for (const name of transforms) {
    const meta = transformMeta(name);
    if (meta) kind = meta.resets ? base : meta.produces;
    kinds.push(kind);
  }
  return kinds;
}

/** Итоговый тип значения после применения конвейера трансформаций. */
export function pipelineOutput(base: ValueKind, transforms: string[]): ValueKind {
  const kinds = pipelineKinds(base, transforms);
  return kinds[kinds.length - 1];
}

/** Осмысленна ли трансформация над значением такого типа. */
export function transformFits(name: string, kind: ValueKind): boolean {
  return transformMeta(name)?.accepts.includes(kind) ?? true;
}

/** Осмыслен ли оператор над значением такого типа. */
export function operatorFits(name: string, kind: ValueKind): boolean {
  return operatorMeta(name)?.inputs.includes(kind) ?? true;
}

/** Базовый тип значения набора целей (число, только если все цели числовые). */
export function targetsValueKind(targets: TargetLike[]): ValueKind {
  const positive = targets.filter((t) => !t.excludeOnly);
  if (positive.length === 0) return 'string';
  if (positive.some((t) => t.count)) return 'number';
  return positive.every((t) => variableMeta(t.name)?.value === 'number')
    ? 'number'
    : 'string';
}

/** Минимальная фаза, в которой заполнены все цели строки условия. */
export function targetsMinPhase(targets: TargetLike[]): Phase {
  let phase: Phase = 1;
  for (const t of targets) {
    const meta = variableMeta(t.name);
    if (meta && meta.minPhase > phase) phase = meta.minPhase;
  }
  return phase;
}

/**
 * Считает ограничения строки условия по её целям и трансформациям.
 * Результат используется UI, чтобы гасить недоступные поля, и компилятором,
 * чтобы выдавать предупреждения.
 */
export function conditionConstraints(
  targets: TargetLike[],
  transforms: string[],
): ConditionConstraints {
  const counting = targets.some((t) => !t.excludeOnly && t.count);
  const base = targetsValueKind(targets);
  const inputKind = counting ? 'number' : pipelineOutput(base, transforms);

  return {
    baseKind: base,
    inputKind,
    transformsAllowed: !counting,
    transformsBlockedBy: counting ? 'count' : null,
    operators: operatorsForInput(inputKind),
    minPhase: targetsMinPhase(targets),
  };
}

/** Допустим ли селектор у переменной. */
export function selectorSupport(name: string): SelectorSupport {
  return variableMeta(name)?.selector ?? 'optional';
}

/** Можно ли к переменной применить подсчёт `&`. */
export function countSupported(name: string): boolean {
  return variableMeta(name)?.collection ?? true;
}

/** Нужен ли оператору аргумент. */
export function operatorNeedsArgument(name: string): boolean {
  return (operatorMeta(name)?.arg ?? 'string') !== 'none';
}

/** Действия, которые могут стоять только на первом правиле цепочки. */
export const HEAD_ONLY_ACTIONS = [
  'id',
  'phase',
  'severity',
  'msg',
  'logdata',
  'tag',
  'rev',
  'ver',
  'maturity',
  'accuracy',
  'skip',
  'skipAfter',
] as const;

/**
 * Разрушающие действия — взаимоисключающие и допустимые только в голове
 * цепочки.
 *
 * Порядок здесь же и порядок в списке выбора: реакции идут разделами от
 * самой жёсткой к пропуску, и внутри раздела рядом стоит то, что человек
 * обычно и сравнивает между собой — `deny` с `drop`, `redirect` с `proxy`.
 */
export const DISRUPTIVE_ACTIONS = [
  'deny',
  'block',
  'drop',
  'redirect',
  'proxy',
  'pass',
  'allow',
] as const;

export type DisruptiveAction = (typeof DISRUPTIVE_ACTIONS)[number];

export function isDisruptive(name: string): name is DisruptiveAction {
  return (DISRUPTIVE_ACTIONS as readonly string[]).includes(name);
}

/**
 * Справка о действии правила для списка выбора.
 *
 * Одна и та же на реакцию, фазу, критичность и запись в журнал: у всех
 * четырёх список закрытый, а выбирают в них по одним и тем же вопросам —
 * в каком это разделе, как называется по-человечески и чем отличается от
 * соседей.
 */
export interface ActionMeta {
  /** Раздел, которым действие стоит в списке. */
  group: Label;
  label: Label;
  /** Чем действие отличается от соседей по разделу. */
  note: Label;
}

/** Раздел списка действий: название группы задаётся один раз на всех. */
function actionGroup(
  en: string,
  ru: string,
  items: Record<string, Omit<ActionMeta, 'group'>>,
): Record<string, ActionMeta> {
  const group: Label = { en, ru };
  return Object.fromEntries(
    Object.entries(items).map(([name, entry]) => [name, { ...entry, group }]),
  );
}

/**
 * Что каждая реакция делает, когда все условия совпали.
 *
 * Названия реакций в интерфейсе ничего не объясняют: «Запретить»,
 * «Блокировать» и «Разорвать соединение» звучат как три слова об одном и
 * том же, а различия между ними — код ответа, чужая настройка
 * `SecDefaultAction` и молчащий обрыв — решают, что увидит клиент и что
 * останется в журнале. Поэтому у каждой реакции есть пояснение, и список
 * разбит на разделы: сначала блокирующие, затем уводящие запрос в другое
 * место, в конце пропускающие.
 */
export const DISRUPTIVE_META: Record<string, ActionMeta> = {
  ...actionGroup('Blocking', 'Блокировка', {
    deny: {
      label: { en: 'Deny', ru: 'Запретить' },
      note: {
        en: 'Stops the transaction and returns an error to the client — the code comes from HTTP status, 403 by default',
        ru: 'Останавливает обработку и возвращает клиенту ошибку — код берётся из HTTP-статуса, по умолчанию 403',
      },
    },
    block: {
      label: { en: 'Block', ru: 'Блокировать' },
      note: {
        en: 'Blocks the way SecDefaultAction prescribes — the rule itself does not choose how, so the whole set can be retuned at once',
        ru: 'Блокирует так, как предписано в SecDefaultAction: правило не выбирает способ само, поэтому весь набор перенастраивается разом',
      },
    },
    drop: {
      label: { en: 'Drop connection', ru: 'Разорвать соединение' },
      note: {
        en: 'Closes the connection with no response at all — the client sees a break, not an error page; used against brute force and floods',
        ru: 'Закрывает соединение вообще без ответа — клиент видит обрыв, а не страницу ошибки; применяется против перебора и флуда',
      },
    },
  }),

  ...actionGroup('Sending elsewhere', 'В другое место', {
    redirect: {
      label: { en: 'Redirect', ru: 'Перенаправить' },
      note: {
        en: 'Sends the client to another address: a captcha, a warning page, a login form. Needs the address',
        ru: 'Уводит клиента на другой адрес: капчу, страницу предупреждения, форму входа. Нужен адрес',
      },
    },
    proxy: {
      label: { en: 'Proxy', ru: 'Проксировать' },
      note: {
        en: 'Passes the request to another server unnoticed by the client — a honeypot or a sandbox. ModSecurity v2 with mod_proxy only',
        ru: 'Передаёт запрос на другой сервер незаметно для клиента — на ханипот или в песочницу. Только ModSecurity v2 с mod_proxy',
      },
    },
  }),

  ...actionGroup('Letting through', 'Пропуск', {
    pass: {
      label: { en: 'Pass', ru: 'Пропустить' },
      note: {
        en: 'Moves on to the next rule, having visited the remaining values — this is what counters and scoring rely on',
        ru: 'Идёт к следующему правилу, дообойдя остальные значения — на этом держатся правила-счётчики и скоринг',
      },
    },
    allow: {
      label: { en: 'Allow', ru: 'Разрешить' },
      note: {
        en: 'Stops the checks and lets the request through past the remaining rules — a hole in the rule set if the condition is loose',
        ru: 'Прекращает проверки и пропускает запрос мимо остальных правил — при нестрогом условии это дыра в наборе',
      },
    },
  }),
};

export function disruptiveMeta(name: string): ActionMeta | null {
  return DISRUPTIVE_META[name] ?? null;
}

/**
 * Реакция, которой нужен адрес: `redirect:/blocked.html`, `proxy:http://...`.
 *
 * Остальные реакции пишутся одним именем, и приписанное к ним значение
 * ModSecurity считает ошибкой конфигурации.
 */
export function takesDestination(name: string): boolean {
  return name === 'redirect' || name === 'proxy';
}

/** Действие относится к «шапке» правила и не должно дублироваться в звеньях. */
export function isHeadOnlyAction(name: string): boolean {
  return (HEAD_ONLY_ACTIONS as readonly string[]).includes(name) || isDisruptive(name);
}

/**
 * Фазы обработки — по сути список того, что к этому моменту уже прочитано.
 *
 * Номер фазы сам за себя не говорит, а выбран он неверно — правило просто
 * не срабатывает: в первой фазе тела запроса ещё нет, в пятой блокировать
 * уже нечего. Пояснение называет именно это, потому что «фаза 2» и «фаза 4»
 * различаются не порядком, а тем, что в них есть в руках.
 */
export const PHASE_META: Record<string, ActionMeta> = {
  ...actionGroup('Request', 'Запрос', {
    // Номер входит в само название: о фазах говорят номерами, и в закрытом
    // поле должно стоять «2 — Тело запроса», иначе выбранное не сверить с
    // текстовой вкладкой.
    1: {
      label: { en: '1 — Request headers', ru: '1 — Заголовки запроса' },
      note: {
        en: 'Headers are read, the body is not: ARGS_POST, REQUEST_BODY and FILES are empty, so a body check placed here never fires',
        ru: 'Заголовки прочитаны, тела ещё нет: ARGS_POST, REQUEST_BODY и FILES пусты, и проверка тела здесь не сработает никогда',
      },
    },
    2: {
      label: { en: '2 — Request body', ru: '2 — Тело запроса' },
      note: {
        en: 'The body is parsed, ARGS and FILES are filled — almost every check goes here, and this is the phase a typical SecDefaultAction implies',
        ru: 'Тело разобрано, ARGS и FILES заполнены — сюда ставят почти все проверки, и эту же фазу подразумевает типовой SecDefaultAction',
      },
    },
  }),

  ...actionGroup('Response', 'Ответ', {
    3: {
      label: { en: '3 — Response headers', ru: '3 — Заголовки ответа' },
      note: {
        en: 'The response is formed but not sent yet: its status and headers are visible, the body is not',
        ru: 'Ответ сформирован, но ещё не отправлен: видны его код и заголовки, тела пока нет',
      },
    },
    4: {
      label: { en: '4 — Response body', ru: '4 — Тело ответа' },
      note: {
        en: 'The response body is available in full — this is where data leaks and error traces are caught',
        ru: 'Тело ответа доступно целиком — здесь ловят утечки данных и трассировки ошибок',
      },
    },
  }),

  ...actionGroup('After the response', 'После ответа', {
    5: {
      label: { en: '5 — Logging', ru: '5 — Логирование' },
      note: {
        en: 'The response has already left the server: there is nothing left to block, only to write down',
        ru: 'Ответ уже ушёл клиенту: блокировать нечего, остаётся только записать',
      },
    },
  }),
};

/** Номера фаз в порядке обработки. */
export const PHASE_NAMES = Object.keys(PHASE_META);

export function phaseMeta(name: string): ActionMeta | null {
  return PHASE_META[name] ?? null;
}

/**
 * Критичность — шкала syslog, обратная интуиции: меньше значит хуже.
 *
 * Восемь слов от `EMERGENCY` до `DEBUG` ничего не говорят о том, куда
 * ставить своё правило, поэтому пояснение называет номер уровня и то, чем
 * этот уровень помечают на практике: `CRITICAL` — атаку, `NOTICE` —
 * нарушение политики, `DEBUG` — отладку набора.
 */
export const SEVERITY_META: Record<string, ActionMeta> = {
  ...actionGroup('System failure', 'Сбой системы', {
    EMERGENCY: {
      label: { en: 'Emergency', ru: 'Авария' },
      note: {
        en: 'Level 0, the worst on the scale: the site is unusable. Practically never written in rules',
        ru: 'Уровень 0, худший по шкале: сайт неработоспособен. В правилах почти не встречается',
      },
    },
    ALERT: {
      label: { en: 'Alert', ru: 'Тревога' },
      note: {
        en: 'Level 1: someone has to step in right now',
        ru: 'Уровень 1: вмешаться нужно немедленно',
      },
    },
  }),

  ...actionGroup('Attacks and errors', 'Атаки и ошибки', {
    CRITICAL: {
      label: { en: 'Critical', ru: 'Критично' },
      note: {
        en: 'Level 2: an attack. This is what blocking rules are marked with in CRS-style sets',
        ru: 'Уровень 2: атака. Так помечают блокирующие правила в наборах в стиле CRS',
      },
    },
    ERROR: {
      label: { en: 'Error', ru: 'Ошибка' },
      note: {
        en: 'Level 3: the application misbehaved — a data leak or a stack trace in the response',
        ru: 'Уровень 3: приложение повело себя не так — утечка данных или трассировка в ответе',
      },
    },
  }),

  ...actionGroup('Under watch', 'Под наблюдением', {
    WARNING: {
      label: { en: 'Warning', ru: 'Предупреждение' },
      note: {
        en: 'Level 4: suspicious, but on its own not enough to block',
        ru: 'Уровень 4: подозрительно, но само по себе на блокировку не тянет',
      },
    },
    NOTICE: {
      label: { en: 'Notice', ru: 'Замечание' },
      note: {
        en: 'Level 5: a policy violation worth noting — a wrong method, an unexpected header',
        ru: 'Уровень 5: нарушение политики, которое стоит отметить — не тот метод, неожиданный заголовок',
      },
    },
  }),

  ...actionGroup('For the record', 'Для сведения', {
    INFO: {
      label: { en: 'Info', ru: 'Сведения' },
      note: {
        en: 'Level 6: a line for the log without any verdict',
        ru: 'Уровень 6: запись в журнал без всякого вердикта',
      },
    },
    DEBUG: {
      label: { en: 'Debug', ru: 'Отладка' },
      note: {
        en: 'Level 7, the mildest one: only while the rule set is being debugged',
        ru: 'Уровень 7, самый мягкий: только пока отлаживают набор правил',
      },
    },
  }),
};

/** Названия уровней критичности от худшего к мягкому. */
export const SEVERITY_NAMES = Object.keys(SEVERITY_META);

export function severityMeta(name: string): ActionMeta | null {
  return SEVERITY_META[name] ?? null;
}

/**
 * Шесть значений `ctl`, которыми одно правило снимает другие.
 *
 * Выбор здесь двойной, и оба раза неочевидный. Первое — что снимать: правило
 * целиком или одну его цель. Целиком снимают редко и почти всегда зря: правило
 * ловит десяток видов атаки, а мешает обычно одно поле, и вместе с ложным
 * срабатыванием уходит вся остальная защита. Второе — как выбрать правила:
 * номер попадает точно в одно, метка — сразу в семейство (и в те его правила,
 * которые появятся в наборе позже), сообщение — во всё, что подошло под
 * шаблон, то есть тоже неизвестно во что.
 */
export const CTL_EXCLUSION_META: Record<string, ActionMeta> = {
  ...actionGroup('Remove one target', 'Снять одну цель', {
    ruleRemoveTargetById: {
      label: { en: 'target, rule by id', ru: 'цель, правило по номеру' },
      note: {
        en: 'The usual fix for a false positive: the rule keeps working and only stops looking into the named target',
        ru: 'Обычная починка ложного срабатывания: правило продолжает работать и лишь перестаёт смотреть в названную цель',
      },
    },
    ruleRemoveTargetByTag: {
      label: { en: 'target, rules by tag', ru: 'цель, правила по метке' },
      note: {
        en: 'Takes the target away from a whole family at once — and from its rules added to the set later',
        ru: 'Снимает цель сразу у семейства правил — и у тех его правил, что появятся в наборе позже',
      },
    },
    ruleRemoveTargetByMsg: {
      label: { en: 'target, rules by message', ru: 'цель, правила по сообщению' },
      note: {
        en: 'Picks by the msg pattern: the wording of a message is not a contract and changes with a set update',
        ru: 'Выбор по шаблону `msg`: текст сообщения ничем не закреплён и меняется с обновлением набора',
      },
    },
  }),

  ...actionGroup('Remove the rule', 'Снять правило целиком', {
    ruleRemoveById: {
      label: { en: 'rule by id', ru: 'правило по номеру' },
      note: {
        en: 'The rule does not run for this request at all — together with everything else it was catching',
        ru: 'Правило не сработает на этом запросе вовсе — вместе со всем остальным, что оно ловило',
      },
    },
    ruleRemoveByTag: {
      label: { en: 'rules by tag', ru: 'правила по метке' },
      note: {
        en: 'Removes the whole family: for tags like attack-sqli that is dozens of rules at once',
        ru: 'Снимает всё семейство: для метки вида `attack-sqli` это десятки правил разом',
      },
    },
    ruleRemoveByMsg: {
      label: { en: 'rules by message', ru: 'правила по сообщению' },
      note: {
        en: 'Removes everything matching the msg pattern — the least predictable of the six',
        ru: 'Снимает всё, что подошло под шаблон `msg`, — самый непредсказуемый из шести',
      },
    },
  }),
};

export function ctlExclusionMeta(name: string): ActionMeta | null {
  return CTL_EXCLUSION_META[name] ?? null;
}

/**
 * Запись о срабатывании: `log`/`nolog` и `auditlog`/`noauditlog`.
 *
 * Пары выглядят как простые «да/нет», но стоят за ними разные журналы:
 * строка в error-логе говорит, что правило сработало, а запись аудита
 * хранит запрос целиком, по которому инцидент потом и разбирают. Отдельно
 * названо и то, чем `nolog` опасен на блокирующем правиле.
 */
export const LOG_FLAG_META: Record<string, ActionMeta> = {
  ...actionGroup('Error log', 'Журнал ошибок', {
    log: {
      label: { en: 'Write', ru: 'Писать' },
      note: {
        en: 'Writes the match to the error log and the audit log — a block nobody can see is indistinguishable from an application bug',
        ru: 'Записывает срабатывание в error-лог и в аудит: блокировку, которой не видно, не отличить от бага приложения',
      },
    },
    nolog: {
      label: { en: 'Do not write', ru: 'Не писать' },
      note: {
        en: 'Silences the match together with its audit entry — meant for frequent bookkeeping rules; on a blocking rule it is almost always a mistake',
        ru: 'Гасит запись о срабатывании, а с ней и запись аудита — для частых служебных правил; на блокирующем правиле это почти всегда ошибка',
      },
    },
  }),

  ...actionGroup('Audit log', 'Журнал аудита', {
    auditlog: {
      label: { en: 'Write', ru: 'Писать' },
      note: {
        en: 'Puts the whole transaction into the audit log even when it would not qualify — the full request is what makes an incident reconstructable',
        ru: 'Помещает транзакцию в журнал аудита, даже если та иначе туда не попала бы: по полному запросу инцидент можно восстановить',
      },
    },
    noauditlog: {
      label: { en: 'Do not write', ru: 'Не писать' },
      note: {
        en: 'Keeps the transaction out of the audit log but leaves the error-log line — for noisy rules on busy endpoints',
        ru: 'Не пускает транзакцию в аудит, но оставляет строку в error-логе — для шумных правил на нагруженных эндпоинтах',
      },
    },
  }),
};

/** Имена пары «писать / не писать» — по одной на каждый журнал. */
export const LOG_FLAGS = ['log', 'nolog'] as const;
export const AUDIT_FLAGS = ['auditlog', 'noauditlog'] as const;

export function logFlagMeta(name: string): ActionMeta | null {
  return LOG_FLAG_META[name] ?? null;
}

/**
 * Коллекции, в которые пишет `setvar`, — по тому, сколько живёт запись.
 *
 * Разделены они не по назначению, а по этому: `tx.score` и `ip.counter`
 * заполняются одинаковой строкой, но первое умирает вместе с запросом, а
 * второе переживает его — и только если для коллекции открыто хранилище.
 * Забытый `initcol` не ошибка конфигурации: правило загрузится, счётчик
 * будет считать, а между запросами каждый раз начинать с нуля.
 */
export const SETVAR_COLLECTION_META: Record<string, ActionMeta> = {
  ...actionGroup('Lives for one request', 'Живёт один запрос', {
    tx: {
      label: { en: 'TX — transaction', ru: 'TX — транзакция' },
      note: {
        en: 'The scratch pad of the rule set: what rules pass to each other between phases and links. Needs no storage and disappears with the request',
        ru: 'Черновик набора правил: то, что правила передают друг другу между фазами и звеньями. Хранилища не требует и исчезает вместе с запросом',
      },
    },
    env: {
      label: { en: 'ENV — environment', ru: 'ENV — окружение' },
      note: {
        en: 'An environment variable of the process: unlike TX it is visible to the application behind the WAF, not only to the rules',
        ru: 'Переменная окружения процесса: в отличие от TX её видит приложение за WAF, а не только правила',
      },
    },
  }),

  ...actionGroup('Lives between requests', 'Живёт между запросами', {
    ip: {
      label: { en: 'IP — by client address', ru: 'IP — по адресу клиента' },
      note: {
        en: 'Keyed by the client address; needs initcol:ip and SecDataDir — without them the counter starts from zero on every request',
        ru: 'Ключ — адрес клиента; нужны initcol:ip и SecDataDir — без них счётчик на каждом запросе начинается с нуля',
      },
    },
    session: {
      label: { en: 'SESSION — by session', ru: 'SESSION — по сессии' },
      note: {
        en: 'Keyed by whatever setsid was given — usually the session cookie; without setsid the collection is empty',
        ru: 'Ключ — то, что передали в setsid, обычно cookie сессии; без setsid коллекция пуста',
      },
    },
    user: {
      label: { en: 'USER — by user', ru: 'USER — по пользователю' },
      note: {
        en: 'Keyed by setuid: survives a change of session and of address, so this is where per-account counters live',
        ru: 'Ключ задаёт setuid: переживает смену сессии и адреса, поэтому здесь держат счётчики на учётную запись',
      },
    },
    global: {
      label: { en: 'GLOBAL — one for everybody', ru: 'GLOBAL — одна на всех' },
      note: {
        en: 'Shared by every request and every address: fits a set-wide switch, not a per-client counter',
        ru: 'Общая на все запросы и все адреса: годится для переключателя на весь набор, а не для счётчика по клиенту',
      },
    },
    resource: {
      label: { en: 'RESOURCE — by resource', ru: 'RESOURCE — по ресурсу' },
      note: {
        en: 'Keyed by setrsc, usually the requested path: counts hits on one page rather than by one client',
        ru: 'Ключ задаёт setrsc, обычно путь запроса: считает обращения к одной странице, а не по одному клиенту',
      },
    },
  }),
};

export function setvarCollectionMeta(name: string): ActionMeta | null {
  return SETVAR_COLLECTION_META[name] ?? null;
}

/**
 * Что запись делает с переменной: задаёт, прибавляет, вычитает, удаляет.
 *
 * Название варианта начинается с того, как это пишется, — `=`, `=+`, `=-`,
 * `!`, — потому что различаются четыре записи одним символом, а стоит он не
 * в одном месте: знак прибавления пишется в начале значения, а удаление —
 * перед именем, в другом конце строки. Разница между `tx.score=1` и
 * `tx.score=+1` при этом не в оттенке: первое затирает накопленный счёт.
 */
export const SETVAR_OP_META: Record<string, ActionMeta> = {
  ...actionGroup('Assignment', 'Присваивание', {
    set: {
      label: { en: '= set', ru: '= задать' },
      note: {
        en: 'Puts the value over the previous one — an accumulated score is wiped by this, not added to',
        ru: 'Кладёт значение поверх прежнего — накопленный счёт этим затирается, а не увеличивается',
      },
    },
    add: {
      label: { en: '=+ add', ru: '=+ прибавить' },
      note: {
        en: 'Adds to what has been accumulated; a variable that does not exist yet counts as zero — this is how the CRS anomaly score works',
        ru: 'Прибавляет к накопленному; ещё не существующая переменная считается нулём — так работает счёт аномалий CRS',
      },
    },
    sub: {
      label: { en: '=- subtract', ru: '=- вычесть' },
      note: {
        en: 'Subtracts from what has been accumulated: written where an exception gives back the weight of a hit',
        ru: 'Вычитает из накопленного: так пишут там, где исключение возвращает вес срабатывания',
      },
    },
  }),

  ...actionGroup('Removal', 'Удаление', {
    delete: {
      label: { en: '! delete', ru: '! удалить' },
      note: {
        en: 'Takes the variable out of the collection — that is not the same as writing a zero: in a persistent collection the record stops taking up storage',
        ru: 'Убирает переменную из коллекции — это не то же, что записать нуль: в долгоживущей коллекции запись перестаёт занимать место в хранилище',
      },
    },
  }),
};

/** Виды записи в порядке от частого к редкому. */
export const SETVAR_OPS = Object.keys(SETVAR_OP_META);

export function setvarOpMeta(name: string): ActionMeta | null {
  return SETVAR_OP_META[name] ?? null;
}
