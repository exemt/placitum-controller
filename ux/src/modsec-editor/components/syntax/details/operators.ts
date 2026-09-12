/**
 * Расширенные подсказки по операторам (`@...`).
 *
 * Оператор решает, сработает ли правило, поэтому упор здесь на две вещи:
 * что именно он сравнивает (значение целиком или подстроку, текст или число)
 * и чего рядом не хватает, чтобы сравнение вообще состоялось.
 */

import { l, type DetailsMap } from './types';

export const OPERATOR_DETAILS: DetailsMap = {
  rx: {
    summary: l(
      'Matches the target against a Perl-compatible regular expression. This is the default operator: a SecRule without an @ prefix is treated as @rx. Capturing groups end up in TX:1..TX:9 only when the rule also carries the capture action.',
      'Сопоставляет цель с Perl-совместимым регулярным выражением. Оператор по умолчанию: SecRule без префикса @ считается @rx. Группы захвата попадают в TX:1..TX:9 только если у правила есть действие capture.',
    ),
    syntax: '"@rx <pattern>"',
    tech: {
      argument: l(
        'PCRE pattern; case-sensitive unless (?i) is used. Macros are expanded before matching.',
        'Шаблон PCRE; регистрозависим, пока не указан (?i). Макросы раскрываются до сравнения.',
      ),
      scope: l(
        'Evaluated once per target value, after the whole transformation pipeline.',
        'Вычисляется для каждого значения цели, уже после всего конвейера трансформаций.',
      ),
      cost: l(
        'The most expensive operator. SecPcreMatchLimit and SecPcreMatchLimitRecursion cap backtracking; hitting the limit sets MSC_PCRE_LIMITS_EXCEEDED instead of matching.',
        'Самый дорогой оператор. SecPcreMatchLimit и SecPcreMatchLimitRecursion ограничивают бэктрекинг; при упоре в лимит вместо срабатывания выставляется MSC_PCRE_LIMITS_EXCEEDED.',
      ),
    },
    gotchas: [
      l(
        'The pattern is not anchored: /admin also matches /public/admin/. Use ^ and $ when you mean the whole value.',
        'Шаблон не заякорен: /admin поймает и /public/admin/. Если имелось в виду значение целиком — нужны ^ и $.',
      ),
      l(
        'Case-folding via t:lowercase makes an uppercase pattern unmatchable — the transformation runs first.',
        'Если в конвейере есть t:lowercase, шаблон с заглавными буквами не совпадёт никогда: трансформация выполняется раньше.',
      ),
    ],
    example: {
      code: 'SecRule ARGS "@rx (?i)\\bunion\\b.{1,100}?\\bselect\\b" \\\n    "id:1001,phase:2,t:none,t:urlDecodeUni,capture,logdata:\'%{TX.0}\',deny"',
      caption: l(
        'capture puts the matched text into TX:0 so logdata can show what exactly fired.',
        'capture кладёт совпавший текст в TX:0, и logdata показывает, что именно сработало.',
      ),
    },
    seeAlso: ['contains', 'pm', 'capture', 'multiMatch'],
  },

  contains: {
    summary: l(
      'True when the given string occurs anywhere inside the target. A plain substring search with no pattern syntax, so /, ., ? and * mean themselves. Several times cheaper than an equivalent @rx.',
      'Истина, когда заданная строка встречается где угодно внутри цели. Обычный поиск подстроки без синтаксиса шаблонов: /, ., ? и * значат сами себя. В разы дешевле эквивалентного @rx.',
    ),
    syntax: '"@contains <string>"',
    tech: {
      argument: l(
        'Literal string, case-sensitive; supports macro expansion such as %{TX.1}.',
        'Литеральная строка, регистрозависима; поддерживает раскрытие макросов вида %{TX.1}.',
      ),
      cost: l(
        'Linear in the length of the value, no backtracking.',
        'Линеен по длине значения, без бэктрекинга.',
      ),
    },
    gotchas: [
      l(
        'Case matters: pair it with t:lowercase and write the argument in lower case.',
        'Регистр важен: ставьте рядом t:lowercase, а сам аргумент пишите строчными.',
      ),
    ],
    seeAlso: ['containsWord', 'within', 'streq', 'strmatch', 'pm'],
  },

  containsWord: {
    summary: l(
      'Like @contains, but the match must sit on word boundaries: the characters around it may not be letters, digits or underscore. Keeps "cat" from firing on "concatenate".',
      'Как @contains, но совпадение должно стоять на границах слова: соседние символы не могут быть буквой, цифрой или подчёркиванием. Не даёт «cat» сработать на «concatenate».',
    ),
    syntax: '"@containsWord <word>"',
    tech: {
      argument: l(
        'Literal word, case-sensitive; macros are expanded.',
        'Литеральное слово, регистрозависимо; макросы раскрываются.',
      ),
    },
    gotchas: [
      l(
        'A word with punctuation inside (a.b, x-y) can never match on boundaries — use @contains there.',
        'Слово со знаками внутри (a.b, x-y) на границах не совпадёт никогда — для него нужен @contains.',
      ),
    ],
    seeAlso: ['contains', 'rx', 'pm'],
  },

  streq: {
    summary: l(
      'True only when the value is exactly equal to the argument — same length, same characters. The right operator for a closed set of allowed values: methods, statuses, flags.',
      'Истина, только когда значение в точности равно аргументу — та же длина, те же символы. Правильный оператор для закрытого набора допустимых значений: методов, статусов, флагов.',
    ),
    syntax: '"@streq <string>"',
    tech: {
      argument: l(
        'Literal string, case-sensitive; macros are expanded, which is what makes %{TX.expected} comparisons possible.',
        'Литеральная строка, регистрозависима; макросы раскрываются — на этом и держатся сравнения с %{TX.expected}.',
      ),
    },
    gotchas: [
      l(
        'Any trailing whitespace breaks equality; add t:trim if the value comes from a header or a form field.',
        'Любой хвостовой пробел ломает равенство; для значения из заголовка или поля формы добавьте t:trim.',
      ),
      l(
        'It compares one value, not a list. Checking three methods takes @rx ^(GET|POST|HEAD)$ or three chained rules.',
        'Сравнивается одно значение, а не список. Проверить три метода можно через @rx ^(GET|POST|HEAD)$ либо тремя правилами.',
      ),
    ],
    seeAlso: ['contains', 'within', 'rx', 'eq'],
  },

  strmatch: {
    summary: l(
      'Substring match implemented with Boyer-Moore-Horspool. Semantically the same as @contains; it exists for cases where the pattern is long and the value is large.',
      'Поиск подстроки на алгоритме Бойера—Мура—Хорспула. По смыслу то же, что @contains; существует для случаев, когда шаблон длинный, а значение большое.',
    ),
    syntax: '"@strmatch <string>"',
    tech: {
      argument: l(
        'Literal string, case-sensitive; macros are expanded.',
        'Литеральная строка, регистрозависима; макросы раскрываются.',
      ),
      cost: l(
        'Sublinear on long needles; on short ones the difference from @contains is noise.',
        'Сублинеен на длинных иглах; на коротких разница с @contains — шум.',
      ),
    },
    seeAlso: ['contains', 'pm', 'rx'],
  },

  beginsWith: {
    summary: l(
      'True when the value starts with the given string. Anchored to the start, so it is the cheap and honest way to check a URI prefix or a header prefix like "Bearer ".',
      'Истина, когда значение начинается с заданной строки. Заякорен в начало, поэтому это дешёвый и честный способ проверить префикс URI или заголовка вроде «Bearer ».',
    ),
    syntax: '"@beginsWith <string>"',
    tech: {
      argument: l(
        'Literal string, case-sensitive; macros are expanded.',
        'Литеральная строка, регистрозависима; макросы раскрываются.',
      ),
    },
    gotchas: [
      l(
        'On REQUEST_URI the value always starts with /, and with the query string still attached — for a path-only check use REQUEST_FILENAME.',
        'У REQUEST_URI значение всегда начинается с / и содержит строку запроса — для проверки только пути берите REQUEST_FILENAME.',
      ),
    ],
    example: {
      code: 'SecRule REQUEST_FILENAME "@beginsWith /admin/" \\\n    "id:1002,phase:1,t:none,t:lowercase,t:normalizePath,pass,nolog,setvar:tx.admin_area=1"',
      caption: l(
        'normalizePath first: /public/../admin/ must not slip past the prefix check.',
        'Сначала normalizePath: /public/../admin/ не должен проскочить мимо проверки префикса.',
      ),
    },
    seeAlso: ['endsWith', 'contains', 'rx', 'normalizePath'],
  },

  endsWith: {
    summary: l(
      'True when the value ends with the given string. Typical use is a file extension, but on a URI the query string is part of the value, so the extension is rarely at the end.',
      'Истина, когда значение заканчивается заданной строкой. Типичное применение — расширение файла, но у URI в значение входит и строка запроса, поэтому расширение редко оказывается в конце.',
    ),
    syntax: '"@endsWith <string>"',
    tech: {
      argument: l(
        'Literal string, case-sensitive; macros are expanded.',
        'Литеральная строка, регистрозависима; макросы раскрываются.',
      ),
    },
    gotchas: [
      l(
        'For an extension check use REQUEST_BASENAME or REQUEST_FILENAME: on REQUEST_URI the ?a=b tail breaks the match.',
        'Для проверки расширения берите REQUEST_BASENAME или REQUEST_FILENAME: у REQUEST_URI хвост ?a=b ломает совпадение.',
      ),
    ],
    seeAlso: ['beginsWith', 'contains', 'REQUEST_BASENAME'],
  },

  within: {
    summary: l(
      'The reverse of @contains: true when the whole value is found inside the argument. Used for allow-lists — the argument holds the permitted values and the value has to be one of them.',
      'Обратное к @contains: истина, когда всё значение целиком нашлось внутри аргумента. Применяется для белых списков: в аргументе перечислены разрешённые значения, а значение должно оказаться одним из них.',
    ),
    syntax: '"@within <value1 value2 ...>"',
    tech: {
      argument: l(
        'A single string that acts as the haystack, case-sensitive; macros are expanded.',
        'Одна строка, играющая роль стога сена, регистрозависима; макросы раскрываются.',
      ),
    },
    gotchas: [
      l(
        'There is no list syntax — it is still a substring check. "GET" is within "GETPOST" too, so keep separators around every item: " GET POST HEAD " and t:none,t:trim on the value.',
        'Синтаксиса списка тут нет — это по-прежнему поиск подстроки. «GET» найдётся и в «GETPOST», поэтому разделители нужны вокруг каждого элемента: « GET POST HEAD », а на значение — t:none,t:trim.',
      ),
    ],
    example: {
      code: 'SecRule REQUEST_METHOD "!@within GET POST HEAD" \\\n    "id:1003,phase:1,t:none,deny,status:405,msg:\'Method not allowed\'"',
      caption: l(
        'The negation ! turns an allow-list into a rule that fires on everything else.',
        'Отрицание ! превращает белый список в правило, срабатывающее на всё остальное.',
      ),
    },
    seeAlso: ['contains', 'streq', 'pm', 'rx'],
  },

  pm: {
    summary: l(
      'Searches for any of many phrases at once using Aho-Corasick: one pass over the value regardless of how many phrases there are. Matching is case-insensitive and unanchored.',
      'Ищет сразу любую из множества фраз алгоритмом Ахо—Корасик: один проход по значению независимо от числа фраз. Сравнение регистронезависимое и не заякоренное.',
    ),
    syntax: '"@pm phrase1 phrase2 phrase3"',
    tech: {
      argument: l(
        'Phrases separated by spaces; a phrase cannot contain a space and no pattern syntax is supported.',
        'Фразы через пробел; пробел внутри фразы невозможен, синтаксис шаблонов не поддерживается.',
      ),
      cost: l(
        'The cheapest way to test hundreds of strings; the automaton is built once at configuration time.',
        'Самый дешёвый способ проверить сотни строк; автомат строится один раз при загрузке конфигурации.',
      ),
    },
    gotchas: [
      l(
        'Being case-insensitive already, it does not need t:lowercase — and it will happily match inside a longer word, so short phrases produce false positives.',
        'Он и так регистронезависим, t:lowercase ему не нужен — зато совпадение внутри длинного слова его устраивает, поэтому короткие фразы дают ложные срабатывания.',
      ),
      l(
        'Usually a pre-filter: @pm narrows the traffic down and a chained @rx confirms the hit.',
        'Обычно это предфильтр: @pm сужает поток, а прицепленный по chain @rx подтверждает попадание.',
      ),
    ],
    example: {
      code: 'SecRule REQUEST_HEADERS:User-Agent "@pm nikto sqlmap nmap masscan" \\\n    "id:1004,phase:1,t:none,t:lowercase,deny,status:403,msg:\'Scanner detected\'"',
    },
    seeAlso: ['pmFromFile', 'pmf', 'contains', 'rx', 'chain'],
  },

  pmf: {
    summary: l(
      'Same phrase matching as @pm, with the phrase list read from a file — one phrase per line. Short alias of @pmFromFile.',
      'Тот же поиск фраз, что у @pm, только список читается из файла — по фразе на строку. Короткий псевдоним @pmFromFile.',
    ),
    syntax: '"@pmf <path>"',
    tech: {
      argument: l(
        'Path to the file; a relative path is resolved against the directory of the configuration file that contains the rule.',
        'Путь к файлу; относительный путь отсчитывается от каталога конфигурационного файла с этим правилом.',
      ),
      scope: l(
        'The file is read at configuration load — editing it takes effect only after a reload.',
        'Файл читается при загрузке конфигурации: правки вступают в силу только после перезапуска.',
      ),
    },
    gotchas: [
      l(
        'Lines starting with # are comments; a stray trailing space becomes part of the phrase.',
        'Строки с # — комментарии; случайный пробел в конце строки становится частью фразы.',
      ),
    ],
    seeAlso: ['pm', 'pmFromFile'],
  },

  pmFromFile: {
    summary: l(
      'Phrase matching against a list loaded from a file, the long spelling of @pmf. This is how CRS ships its scanner, LFI and RFI keyword lists.',
      'Поиск фраз по списку из файла, длинное написание @pmf. Именно так CRS поставляет свои списки сканеров, LFI- и RFI-ключей.',
    ),
    syntax: '"@pmFromFile <path>"',
    tech: {
      argument: l(
        'Path to the file, relative to the configuration file; one phrase per line.',
        'Путь к файлу относительно конфигурационного файла; по фразе на строку.',
      ),
    },
    seeAlso: ['pm', 'pmf'],
  },

  eq: {
    summary: l(
      'Numeric equality. Both sides are converted to integers first, so a non-numeric value quietly becomes 0. Mostly used with counting variables (&ARGS) and TX counters.',
      'Числовое равенство. Обе стороны сначала приводятся к целому, поэтому нечисловое значение молча становится 0. Чаще всего применяется со счётными переменными (&ARGS) и счётчиками в TX.',
    ),
    syntax: '"@eq <number>"',
    tech: {
      argument: l(
        'Integer or a macro that expands to one, e.g. %{tx.anomaly_score}.',
        'Целое число или макрос, раскрывающийся в него, например %{tx.anomaly_score}.',
      ),
    },
    gotchas: [
      l(
        'ARGS and &ARGS are different targets: without & you compare the argument text, which converts to 0 and matches @eq 0 on every request.',
        'ARGS и &ARGS — разные цели: без & сравнивается текст аргумента, он приводится к 0 и совпадает с @eq 0 на каждом запросе.',
      ),
    ],
    seeAlso: ['gt', 'lt', 'ge', 'le', 'streq'],
  },

  gt: {
    summary: l(
      'Numeric "greater than". The workhorse of anomaly scoring: the blocking rule of a CRS-style setup is a @gt against the accumulated score.',
      'Числовое «больше». Рабочая лошадь аномального скоринга: блокирующее правило в связке в стиле CRS — это @gt по накопленному счёту.',
    ),
    syntax: '"@gt <number>"',
    tech: {
      argument: l(
        'Integer or a macro; comparison is integer-only, fractions are truncated.',
        'Целое число или макрос; сравнение только целочисленное, дробная часть отбрасывается.',
      ),
    },
    example: {
      code: 'SecRule TX:ANOMALY_SCORE "@gt 5" \\\n    "id:1005,phase:2,deny,status:403,msg:\'Anomaly score %{tx.anomaly_score}\'"',
    },
    seeAlso: ['ge', 'lt', 'eq', 'setvar'],
  },

  ge: {
    summary: l(
      'Numeric "greater than or equal". Same conversion rules as @gt; the choice between them is usually about whether the threshold itself should trigger.',
      'Числовое «больше либо равно». Правила приведения те же, что у @gt; выбор между ними обычно про то, должен ли срабатывать сам порог.',
    ),
    syntax: '"@ge <number>"',
    seeAlso: ['gt', 'le', 'eq'],
  },

  lt: {
    summary: l(
      'Numeric "less than". Often used to catch things that are suspiciously small: a too-short User-Agent, too few arguments, a body shorter than expected.',
      'Числовое «меньше». Часто ловит подозрительно маленькое: слишком короткий User-Agent, слишком мало аргументов, тело короче ожидаемого.',
    ),
    syntax: '"@lt <number>"',
    gotchas: [
      l(
        'A missing variable produces no value at all, so the rule does not run — "shorter than N" does not cover "absent". Add a separate &VAR @eq 0 check.',
        'Отсутствующая переменная не даёт значения вовсе, и правило не выполняется: «короче N» не покрывает «нет вообще». Нужна отдельная проверка &VAR @eq 0.',
      ),
    ],
    seeAlso: ['le', 'gt', 'eq'],
  },

  le: {
    summary: l(
      'Numeric "less than or equal". Same semantics as @lt, boundary included.',
      'Числовое «меньше либо равно». Смысл тот же, что у @lt, но граница включена.',
    ),
    syntax: '"@le <number>"',
    seeAlso: ['lt', 'ge', 'eq'],
  },

  ipMatch: {
    summary: l(
      'Checks an IP address against a list of addresses and CIDR blocks. Parses the list into a tree at load time, so it is far faster and far safer than a regex over an address.',
      'Проверяет IP-адрес по списку адресов и CIDR-блоков. Список разбирается в дерево при загрузке, поэтому это гораздо быстрее и безопаснее, чем регулярка по адресу.',
    ),
    syntax: '"@ipMatch 10.0.0.0/8,192.168.1.1,2001:db8::/32"',
    tech: {
      argument: l(
        'Comma-separated IPv4/IPv6 addresses and CIDR blocks.',
        'Адреса и CIDR-блоки IPv4/IPv6 через запятую.',
      ),
      scope: l(
        'Expects a variable that holds an address: REMOTE_ADDR, or a header when you deliberately trust it.',
        'Ожидает переменную с адресом: REMOTE_ADDR либо заголовок, которому вы сознательно доверяете.',
      ),
    },
    gotchas: [
      l(
        'X-Forwarded-For is client-controlled and can hold a list — matching it without a trusted-proxy check hands the allow-list to the attacker.',
        'X-Forwarded-For управляется клиентом и может содержать список — проверка по нему без доверенного прокси отдаёт белый список атакующему.',
      ),
    ],
    example: {
      code: 'SecRule REMOTE_ADDR "!@ipMatch 10.0.0.0/8,192.168.0.0/16" \\\n    "id:1006,phase:1,deny,status:403,msg:\'Admin area is internal only\'"',
    },
    seeAlso: ['ipMatchFromFile', 'ipMatchF', 'rbl', 'REMOTE_ADDR'],
  },

  ipMatchF: {
    summary: l(
      'Same as @ipMatch with the list read from a file, one entry per line. Short alias of @ipMatchFromFile.',
      'То же, что @ipMatch, но список читается из файла, по записи на строку. Короткий псевдоним @ipMatchFromFile.',
    ),
    syntax: '"@ipMatchF <path>"',
    tech: {
      scope: l(
        'Read at configuration load; updating the file requires a reload.',
        'Читается при загрузке конфигурации; обновление файла требует перезапуска.',
      ),
    },
    seeAlso: ['ipMatch', 'ipMatchFromFile'],
  },

  ipMatchFromFile: {
    summary: l(
      'Matches an address against ranges loaded from a file — the usual way to keep large office or CDN lists outside the rule text.',
      'Сопоставляет адрес с диапазонами из файла — обычный способ держать большие списки офисов или CDN вне текста правил.',
    ),
    syntax: '"@ipMatchFromFile <path>"',
    tech: {
      argument: l(
        'Path relative to the configuration file; # starts a comment line.',
        'Путь относительно конфигурационного файла; строка с # — комментарий.',
      ),
    },
    seeAlso: ['ipMatch', 'ipMatchF'],
  },

  detectSQLi: {
    summary: l(
      'Runs libinjection over the value and matches when it looks like SQL injection. Instead of a pattern it builds a fingerprint of the SQL tokens, which is why it survives comment- and case-based evasion that regexes miss.',
      'Прогоняет значение через libinjection и срабатывает, когда оно похоже на SQL-инъекцию. Вместо шаблона строится отпечаток SQL-токенов, поэтому оператор переживает обход через комментарии и регистр, на котором ломаются регулярки.',
    ),
    syntax: '"@detectSQLi"',
    tech: {
      argument: l('None — the operator takes no parameter.', 'Нет — оператор не принимает параметра.'),
      scope: l(
        'Best on ARGS, ARGS_NAMES, REQUEST_COOKIES and XML content in phase 2.',
        'Лучше всего по ARGS, ARGS_NAMES, REQUEST_COOKIES и XML в фазе 2.',
      ),
      cost: l(
        'Cheaper than the equivalent set of SQLi regexes, but it is still a full parse of every value.',
        'Дешевле эквивалентного набора SQLi-регулярок, но это всё же полный разбор каждого значения.',
      ),
    },
    gotchas: [
      l(
        'It needs decoding, not case-folding: t:urlDecodeUni,t:removeNulls help, t:lowercase adds nothing since the analysis is case-insensitive.',
        'Ему нужно декодирование, а не приведение регистра: t:urlDecodeUni,t:removeNulls помогают, t:lowercase не даёт ничего — анализ и так регистронезависим.',
      ),
      l(
        'With capture the fingerprint lands in TX:0 — log it, it is the fastest way to judge a false positive.',
        'С capture отпечаток попадает в TX:0 — логируйте его, это быстрейший способ оценить ложное срабатывание.',
      ),
    ],
    example: {
      code: 'SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES "@detectSQLi" \\\n    "id:1007,phase:2,t:none,t:utf8toUnicode,t:urlDecodeUni,t:removeNulls,capture,\\\n    logdata:\'Fingerprint %{TX.0}\',deny,status:403"',
    },
    seeAlso: ['detectXSS', 'rx', 'capture', 'multiMatch'],
  },

  detectXSS: {
    summary: l(
      'The libinjection XSS detector: matches when the value contains something a browser would execute. Like @detectSQLi it takes no parameter and analyses structure rather than substrings.',
      'XSS-детектор libinjection: срабатывает, когда значение содержит то, что браузер выполнит. Как и @detectSQLi, не принимает параметра и анализирует структуру, а не подстроки.',
    ),
    syntax: '"@detectXSS"',
    tech: {
      argument: l('None.', 'Нет.'),
      scope: l(
        'Phase 2 over ARGS and cookies; response-side checks make sense only with SecResponseBodyAccess On.',
        'Фаза 2 по ARGS и cookie; проверка на стороне ответа имеет смысл только при SecResponseBodyAccess On.',
      ),
    },
    gotchas: [
      l(
        'It is tuned for HTML/JS context, so rich-text fields are its classic false-positive source. Exclude the specific argument, not the whole rule.',
        'Он настроен на HTML/JS-контекст, поэтому поля с форматированным текстом — его классический источник ложных срабатываний. Исключайте конкретный аргумент, а не правило целиком.',
      ),
      l(
        'Detecting XSS on input does not make the output safe: without escaping in the application it only raises the cost of an attack.',
        'Поймать XSS на входе не значит обезопасить вывод: без экранирования в приложении это лишь повышает стоимость атаки.',
      ),
    ],
    seeAlso: ['detectSQLi', 'rx', 'capture'],
  },

  validateByteRange: {
    summary: l(
      'Matches when the value contains bytes outside the allowed ranges. The classic way to spot binary payloads and control characters where only printable text is expected.',
      'Срабатывает, когда в значении есть байты вне разрешённых диапазонов. Классический способ заметить бинарную нагрузку и управляющие символы там, где ожидается только печатный текст.',
    ),
    syntax: '"@validateByteRange 32-126"',
    tech: {
      argument: l(
        'Comma-separated byte values and ranges, e.g. 9,10,13,32-126.',
        'Значения байтов и диапазоны через запятую, например 9,10,13,32-126.',
      ),
      scope: l(
        'Typically REQUEST_BODY or specific headers; on UTF-8 text most national alphabets fall outside 32-126.',
        'Обычно REQUEST_BODY или отдельные заголовки; в UTF-8-тексте большинство национальных алфавитов лежит вне 32-126.',
      ),
    },
    gotchas: [
      l(
        'The logic is inverted compared to its name: it fires when something is outside the range, not when everything is inside.',
        'Логика обратна названию: он срабатывает, когда что-то вышло за диапазон, а не когда всё внутри.',
      ),
    ],
    seeAlso: ['validateUtf8Encoding', 'validateUrlEncoding', 'removeNulls'],
  },

  validateUrlEncoding: {
    summary: l(
      'Matches when the value contains invalid percent-encoding: a % with fewer than two hex digits after it. Broken encoding is a common attempt to make the WAF and the application decode a string differently.',
      'Срабатывает, когда в значении испорчено процентное кодирование: за % идёт меньше двух шестнадцатеричных цифр. Сломанное кодирование — частая попытка заставить WAF и приложение раскодировать строку по-разному.',
    ),
    syntax: '"@validateUrlEncoding"',
    tech: {
      argument: l('None.', 'Нет.'),
      scope: l(
        'Meaningful on raw targets — QUERY_STRING, REQUEST_URI_RAW, REQUEST_BODY — before any decoding transformation.',
        'Осмысленен на сырых целях — QUERY_STRING, REQUEST_URI_RAW, REQUEST_BODY — до любой декодирующей трансформации.',
      ),
    },
    gotchas: [
      l(
        'Putting t:urlDecode in front of it makes the check meaningless: the broken sequence is gone by the time the operator runs.',
        'Поставить перед ним t:urlDecode — обессмыслить проверку: к моменту работы оператора сломанной последовательности уже нет.',
      ),
    ],
    seeAlso: ['validateUtf8Encoding', 'urlDecodeUni', 'QUERY_STRING'],
  },

  validateUtf8Encoding: {
    summary: l(
      'Matches on malformed UTF-8: overlong forms, truncated sequences, invalid continuation bytes. Overlong encodings are how a "/" can be smuggled past a path check.',
      'Срабатывает на некорректном UTF-8: избыточных формах, обрезанных последовательностях, неверных байтах продолжения. Именно избыточным кодированием «/» протаскивают мимо проверки пути.',
    ),
    syntax: '"@validateUtf8Encoding"',
    tech: {
      argument: l('None.', 'Нет.'),
      scope: l(
        'Only makes sense for applications that actually expect UTF-8; on single-byte encodings it is a false-positive generator.',
        'Имеет смысл только для приложений, которые действительно ожидают UTF-8; на однобайтовых кодировках это генератор ложных срабатываний.',
      ),
    },
    seeAlso: ['validateUrlEncoding', 'utf8toUnicode', 'validateByteRange'],
  },

  verifyCC: {
    summary: l(
      'Finds credit card numbers with a regex and confirms them with the Luhn checksum, so random digit strings do not trigger it. Used for data-leak rules on responses.',
      'Находит номера банковских карт регуляркой и подтверждает их контрольной суммой Луна, поэтому случайные цепочки цифр его не поднимают. Применяется в правилах об утечке данных на ответах.',
    ),
    syntax: '"@verifyCC <regex>"',
    tech: {
      argument: l(
        'A PCRE pattern describing the candidate digits; the Luhn check is applied to whatever it matched.',
        'Шаблон PCRE, описывающий кандидатов; проверка Луна применяется к тому, что он нашёл.',
      ),
      scope: l(
        'Typically RESPONSE_BODY in phase 4, which requires SecResponseBodyAccess On.',
        'Обычно RESPONSE_BODY в фазе 4, а для этого нужен SecResponseBodyAccess On.',
      ),
    },
    gotchas: [
      l(
        'Without sanitiseMatchedBytes the card number lands in the audit log — the rule then creates exactly the leak it was meant to catch.',
        'Без sanitiseMatchedBytes номер карты попадёт в журнал аудита — правило создаст ровно ту утечку, которую должно было ловить.',
      ),
    ],
    seeAlso: ['verifySSN', 'verifyCPF', 'sanitiseMatchedBytes', 'RESPONSE_BODY'],
  },

  verifySSN: {
    summary: l(
      'Finds and validates US Social Security Numbers: a regex plus the structural rules that rule out impossible values. Same data-leak use as @verifyCC.',
      'Находит и проверяет номера соцстрахования США: регулярка плюс структурные правила, отсекающие невозможные значения. Применение то же, что у @verifyCC, — утечки данных.',
    ),
    syntax: '"@verifySSN <regex>"',
    gotchas: [
      l(
        'Pair it with sanitiseMatchedBytes so the number itself never reaches the logs.',
        'Ставьте рядом sanitiseMatchedBytes, чтобы сам номер не оказался в логах.',
      ),
    ],
    seeAlso: ['verifyCC', 'verifyCPF', 'sanitiseMatchedBytes'],
  },

  verifyCPF: {
    summary: l(
      'Finds and validates Brazilian CPF taxpayer numbers, checksum included. The regional counterpart of @verifySSN.',
      'Находит и проверяет бразильские налоговые номера CPF вместе с контрольной суммой. Региональный аналог @verifySSN.',
    ),
    syntax: '"@verifyCPF <regex>"',
    seeAlso: ['verifyCC', 'verifySSN', 'sanitiseMatchedBytes'],
  },

  geoLookup: {
    summary: l(
      'Resolves an IP address through the geo database and fills the GEO collection: country, city, coordinates, ASN. It matches when the lookup succeeds — the actual decision is made by a chained rule over GEO:COUNTRY_CODE.',
      'Определяет IP по геобазе и заполняет коллекцию GEO: страна, город, координаты, ASN. Срабатывает при успешном поиске — решение принимает уже прицепленное правило по GEO:COUNTRY_CODE.',
    ),
    syntax: '"@geoLookup"',
    tech: {
      argument: l('None.', 'Нет.'),
      availability: l(
        'Requires a database configured with SecGeoLookupDb; without it the operator never matches.',
        'Требует базу, заданную через SecGeoLookupDb; без неё оператор не срабатывает никогда.',
      ),
    },
    gotchas: [
      l(
        'GEO holds the result of the last lookup only, so the chained rule must follow immediately.',
        'В GEO лежит результат только последнего поиска, поэтому прицепленное правило должно идти сразу следом.',
      ),
      l(
        'Geo-blocking is trivially bypassed by a VPN; it filters noise, it does not stop a targeted attacker.',
        'Геоблокировка тривиально обходится VPN: она снижает шум, но не останавливает целенаправленного атакующего.',
      ),
    ],
    example: {
      code: 'SecRule REMOTE_ADDR "@geoLookup" "id:1008,phase:1,pass,nolog,chain"\n    SecRule GEO:COUNTRY_CODE "@streq CN" "deny,status:403,msg:\'Blocked country\'"',
    },
    seeAlso: ['GEO', 'REMOTE_ADDR', 'chain', 'rbl'],
  },

  rbl: {
    summary: l(
      'Looks the address up in a DNS blocklist by querying reversed-octets.zone. Matches when the zone answers, and the reply text goes into TX:0 with capture.',
      'Проверяет адрес по DNS-блоклисту, запрашивая обратные октеты в зоне. Срабатывает, когда зона ответила; текст ответа попадает в TX:0 при наличии capture.',
    ),
    syntax: '"@rbl <zone>"',
    tech: {
      argument: l('The RBL zone name, e.g. sbl-xbl.spamhaus.org.', 'Имя RBL-зоны, например sbl-xbl.spamhaus.org.'),
      cost: l(
        'A network round trip inside request processing: a slow resolver directly becomes user-visible latency.',
        'Сетевой запрос внутри обработки: медленный резолвер напрямую превращается в задержку для пользователя.',
      ),
    },
    gotchas: [
      l(
        'Public RBLs rate-limit or block busy resolvers, and the answer for a legitimate NAT address can be a false positive. Cache the verdict in an IP collection instead of asking on every request.',
        'Публичные RBL ограничивают или блокируют нагруженные резолверы, а ответ по легитимному NAT-адресу может оказаться ложным. Кэшируйте вердикт в IP-коллекции вместо запроса на каждый запрос.',
      ),
    ],
    seeAlso: ['ipMatch', 'geoLookup', 'initcol', 'IP'],
  },

  gsbLookup: {
    summary: l(
      'Extracts URLs from the value and checks them against a local Google Safe Browsing database. Meant for response bodies: it catches a page that started linking to malware.',
      'Достаёт из значения URL и проверяет их по локальной базе Google Safe Browsing. Рассчитан на тела ответов: ловит страницу, которая начала ссылаться на вредонос.',
    ),
    syntax: '"@gsbLookup <regex>"',
    tech: {
      argument: l(
        'A regex that selects the URLs to check.',
        'Регулярка, отбирающая URL для проверки.',
      ),
      availability: l(
        'Needs SecGsbLookupDb and a regularly refreshed database; in libmodsecurity (v3) it is not available.',
        'Требует SecGsbLookupDb и регулярно обновляемую базу; в libmodsecurity (v3) недоступен.',
      ),
    },
    seeAlso: ['rbl', 'RESPONSE_BODY'],
  },

  inspectFile: {
    summary: l(
      'Hands an uploaded file to an external script or Lua handler and matches on its verdict. The standard hook for an antivirus scan of uploads.',
      'Передаёт загруженный файл внешнему скрипту или Lua-обработчику и срабатывает по его вердикту. Штатный крючок для антивирусной проверки загрузок.',
    ),
    syntax: '"@inspectFile /path/to/script.sh"',
    tech: {
      argument: l(
        'Path to an executable or a .lua file; the temporary file name is passed as the first argument.',
        'Путь к исполняемому файлу или .lua; имя временного файла передаётся первым аргументом.',
      ),
      scope: l(
        'Phase 2 over FILES_TMPNAMES; the script must return "1" on the first line to accept the file, anything else counts as a match.',
        'Фаза 2 по FILES_TMPNAMES; чтобы файл был принят, скрипт должен вернуть «1» в первой строке, любой другой ответ считается срабатыванием.',
      ),
      cost: l(
        'A process spawn per file inside the request — the slowest thing you can put in a rule.',
        'Запуск процесса на каждый файл внутри запроса — самое медленное, что можно поставить в правило.',
      ),
    },
    seeAlso: ['FILES', 'fuzzyHash', 'exec'],
  },

  fuzzyHash: {
    summary: l(
      'Compares the value against ssdeep fuzzy hashes and matches when similarity exceeds the threshold. Catches a known malicious file that was slightly modified.',
      'Сравнивает значение с нечёткими хешами ssdeep и срабатывает, когда сходство выше порога. Ловит известный вредоносный файл, который слегка изменили.',
    ),
    syntax: '"@fuzzyHash /path/to/hashes.txt 6"',
    tech: {
      argument: l(
        'Path to the hash file and a similarity threshold from 0 to 100.',
        'Путь к файлу хешей и порог сходства от 0 до 100.',
      ),
      availability: l(
        'Only in builds compiled with ssdeep support.',
        'Только в сборках, собранных с поддержкой ssdeep.',
      ),
    },
    seeAlso: ['inspectFile', 'FILES'],
  },

  validateDTD: {
    summary: l(
      'Validates the parsed XML body against a DTD and matches when validation fails. Requires the body to have been parsed as XML first.',
      'Проверяет разобранное XML-тело по DTD и срабатывает, когда проверка не прошла. Тело должно быть предварительно разобрано как XML.',
    ),
    syntax: '"@validateDTD /path/to/schema.dtd"',
    tech: {
      scope: l(
        'Phase 2 over the XML variable; the parser is switched on by ctl:requestBodyProcessor=XML.',
        'Фаза 2 по переменной XML; парсер включается через ctl:requestBodyProcessor=XML.',
      ),
    },
    gotchas: [
      l(
        'Without the XML body processor there is nothing to validate and the rule silently does nothing.',
        'Без XML-процессора тела проверять нечего, и правило молча ничего не делает.',
      ),
    ],
    seeAlso: ['validateSchema', 'XML', 'ctl', 'xmlns'],
  },

  validateSchema: {
    summary: l(
      'Validates the parsed XML body against an XML Schema and matches on failure. The stricter sibling of @validateDTD; namespaces are declared with the xmlns action.',
      'Проверяет разобранное XML-тело по XML Schema и срабатывает при неудаче. Более строгий родственник @validateDTD; пространства имён объявляются действием xmlns.',
    ),
    syntax: '"@validateSchema /path/to/schema.xsd"',
    tech: {
      scope: l(
        'Phase 2 over XML, after ctl:requestBodyProcessor=XML.',
        'Фаза 2 по XML, после ctl:requestBodyProcessor=XML.',
      ),
    },
    seeAlso: ['validateDTD', 'XML', 'xmlns', 'ctl'],
  },

  validateHash: {
    summary: l(
      'Checks that a link or form carries a valid anti-CSRF hash produced by the hash engine. Matches when the hash is missing or wrong.',
      'Проверяет, что ссылка или форма несёт корректный anti-CSRF-хеш, выданный движком хеширования. Срабатывает, когда хеш отсутствует или неверен.',
    ),
    syntax: '"@validateHash <regex>"',
    tech: {
      availability: l(
        'Part of the v2 hash engine (SecHashEngine and friends); not available in libmodsecurity (v3).',
        'Часть движка хеширования в v2 (SecHashEngine и соседние директивы); в libmodsecurity (v3) отсутствует.',
      ),
    },
    seeAlso: ['rx', 'REQUEST_URI'],
  },

  rsub: {
    summary: l(
      'Rewrites the stream variable in place with a regex substitution — the only operator that changes traffic instead of judging it. Used to strip a leaking header or patch a response body.',
      'Переписывает потоковую переменную regex-заменой — единственный оператор, который меняет трафик, а не оценивает его. Применяется, чтобы вырезать протекающий заголовок или подлатать тело ответа.',
    ),
    syntax: '"@rsub s/<regex>/<replacement>/<flags>"',
    tech: {
      scope: l(
        'Works on STREAM_INPUT_BODY / STREAM_OUTPUT_BODY, which require SecStreamInBodyInspection / SecStreamOutBodyInspection and SecContentInjection On.',
        'Работает по STREAM_INPUT_BODY / STREAM_OUTPUT_BODY, а для них нужны SecStreamInBodyInspection / SecStreamOutBodyInspection и SecContentInjection On.',
      ),
      availability: l(
        'ModSecurity v2 only — libmodsecurity (v3) has no stream variables.',
        'Только ModSecurity v2 — в libmodsecurity (v3) потоковых переменных нет.',
      ),
    },
    gotchas: [
      l(
        'Rewriting a body invalidates Content-Length and can break compressed or chunked responses.',
        'Переписывание тела делает недействительным Content-Length и может сломать сжатый или chunked-ответ.',
      ),
    ],
    seeAlso: ['append', 'prepend', 'SecContentInjection', 'SecStreamOutBodyInspection'],
  },

  noMatch: {
    summary: l(
      'Never matches, whatever the input. A placeholder: it lets a rule keep its structure while being effectively disabled, and it is handy for testing the surrounding configuration.',
      'Не срабатывает никогда, что бы ни пришло на вход. Заглушка: позволяет сохранить структуру правила, фактически его выключив, и удобен для проверки окружающей конфигурации.',
    ),
    syntax: '"@noMatch"',
    gotchas: [
      l(
        'A disabled rule that stays in the file eventually gets copied into a new one. Deleting it is usually more honest.',
        'Отключённое правило, оставшееся в файле, рано или поздно скопируют в новое. Удалить обычно честнее.',
      ),
    ],
    seeAlso: ['unconditionalMatch', 'SecAction'],
  },

  unconditionalMatch: {
    summary: l(
      'Always matches, regardless of the value — but unlike SecAction it still walks the target list, so the actions run once per matched variable.',
      'Срабатывает всегда, независимо от значения, — но, в отличие от SecAction, всё же обходит список целей, поэтому действия выполняются по разу на каждую переменную.',
    ),
    syntax: '"@unconditionalMatch"',
    tech: {
      scope: l(
        'Useful for counting or logging every value of a collection; for a single unconditional action SecAction is cheaper.',
        'Полезен, чтобы посчитать или залогировать каждое значение коллекции; для одного безусловного действия дешевле SecAction.',
      ),
    },
    seeAlso: ['noMatch', 'SecAction', 'setvar'],
  },
};
