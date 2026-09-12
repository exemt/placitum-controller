/**
 * Расширенные подсказки по трансформациям (`t:...`).
 *
 * Трансформация опаснее оператора тем, что она невидима в результате: правило
 * сравнивает не то значение, которое видно в запросе, а то, что осталось после
 * конвейера. Поэтому здесь всюду важен порядок и то, во что превращается вход.
 */

import { l, type DetailsMap } from './types';

export const TRANSFORM_DETAILS: DetailsMap = {
  none: {
    summary: l(
      'Clears the transformation pipeline built so far, including everything inherited from SecDefaultAction. Anything listed after it applies as usual — that is why almost every explicit rule starts with t:none.',
      'Очищает собранный к этому месту конвейер трансформаций, включая всё унаследованное от SecDefaultAction. Всё, что перечислено после, применяется как обычно — поэтому почти любое явное правило начинается с t:none.',
    ),
    syntax: 't:none',
    tech: {
      scope: l(
        'Acts at the position where it stands, not on the whole rule.',
        'Действует в той позиции, где стоит, а не на правило целиком.',
      ),
    },
    gotchas: [
      l(
        'In the middle of a list it silently discards the transformations before it: t:lowercase,t:none,t:trim means only t:trim.',
        'В середине списка молча выбрасывает всё, что стояло раньше: t:lowercase,t:none,t:trim означает только t:trim.',
      ),
    ],
    example: {
      code: 'SecRule ARGS "@contains ../" "id:1101,phase:2,t:none,t:urlDecodeUni,t:normalizePath,deny"',
      caption: l(
        't:none first, then exactly the transformations this rule needs.',
        'Сначала t:none, затем ровно те трансформации, которые нужны этому правилу.',
      ),
    },
    seeAlso: ['SecDefaultAction', 'multiMatch'],
  },

  lowercase: {
    summary: l(
      'Converts the value to lower case, byte by byte. The usual first step of any text check, because it removes the difference between SELECT and sElEcT.',
      'Приводит значение к нижнему регистру побайтово. Обычный первый шаг любой текстовой проверки: снимает разницу между SELECT и sElEcT.',
    ),
    syntax: 't:lowercase',
    tech: {
      scope: l(
        'ASCII case folding; national alphabets in UTF-8 are left as they are.',
        'Приводит регистр в ASCII; национальные алфавиты в UTF-8 остаются как есть.',
      ),
    },
    gotchas: [
      l(
        'The operator argument must then be lower case as well — @contains ADMIN after t:lowercase can never match.',
        'Аргумент оператора после этого тоже должен быть строчным: @contains ADMIN после t:lowercase не совпадёт никогда.',
      ),
      l(
        'Case-insensitive operators (@pm, @detectSQLi, @detectXSS) do not need it.',
        'Регистронезависимым операторам (@pm, @detectSQLi, @detectXSS) она не нужна.',
      ),
    ],
    seeAlso: ['uppercase', 'rx', 'contains', 'pm'],
  },

  uppercase: {
    summary: l(
      'Converts the value to upper case. Rare in practice: comparisons are conventionally normalised downwards, so mixing it into a rule set usually means one half of the rules will not match.',
      'Приводит значение к верхнему регистру. На практике редка: сравнения принято нормализовать вниз, поэтому в общем наборе правил она обычно означает, что половина правил перестанет совпадать.',
    ),
    syntax: 't:uppercase',
    seeAlso: ['lowercase'],
  },

  trim: {
    summary: l(
      'Removes whitespace from both ends of the value. Necessary before any exact comparison: a header value often arrives with a leading space after the colon.',
      'Убирает пробелы с обоих концов значения. Необходима перед любым точным сравнением: значение заголовка нередко приходит с пробелом после двоеточия.',
    ),
    syntax: 't:trim',
    seeAlso: ['trimLeft', 'trimRight', 'streq', 'compressWhitespace'],
  },

  trimLeft: {
    summary: l(
      'Removes whitespace from the start of the value only. Use it when trailing whitespace is meaningful and must be preserved.',
      'Убирает пробелы только в начале значения. Нужна, когда хвостовые пробелы значимы и их нельзя терять.',
    ),
    syntax: 't:trimLeft',
    seeAlso: ['trim', 'trimRight'],
  },

  trimRight: {
    summary: l(
      'Removes whitespace from the end of the value only.',
      'Убирает пробелы только в конце значения.',
    ),
    syntax: 't:trimRight',
    seeAlso: ['trim', 'trimLeft'],
  },

  compressWhitespace: {
    summary: l(
      'Turns every whitespace character into a plain space and collapses runs of them into one. Defeats the classic trick of padding SQL and shell payloads with tabs and newlines.',
      'Превращает любой пробельный символ в обычный пробел и схлопывает их последовательности в один. Ломает классический приём с набивкой SQL- и shell-нагрузок табуляциями и переводами строк.',
    ),
    syntax: 't:compressWhitespace',
    tech: {
      scope: l(
        'Covers space, tab, CR, LF, VT and FF.',
        'Охватывает пробел, табуляцию, CR, LF, VT и FF.',
      ),
    },
    gotchas: [
      l(
        'The pattern must then expect exactly one space: "union  select" will not match a compressed value.',
        'Шаблон после этого должен ожидать ровно один пробел: «union  select» по сжатому значению не совпадёт.',
      ),
    ],
    seeAlso: ['removeWhitespace', 'replaceComments', 'trim'],
  },

  removeWhitespace: {
    summary: l(
      'Deletes all whitespace instead of collapsing it. Stronger than compressWhitespace and more dangerous: separate words glue together, so "or 1=1" becomes "or1=1".',
      'Удаляет все пробельные символы, а не схлопывает их. Сильнее compressWhitespace и опаснее: отдельные слова слипаются, «or 1=1» превращается в «or1=1».',
    ),
    syntax: 't:removeWhitespace',
    gotchas: [
      l(
        'Patterns written with spaces stop matching. Either write the pattern without spaces or use compressWhitespace.',
        'Шаблоны, написанные с пробелами, перестают совпадать. Либо пишите шаблон без пробелов, либо берите compressWhitespace.',
      ),
    ],
    seeAlso: ['compressWhitespace', 'cmdLine'],
  },

  urlDecode: {
    summary: l(
      'Decodes percent-encoding: %41 becomes A, and + becomes a space. ARGS are already decoded once by the parser, so this is for values that were encoded twice or arrived from a raw target.',
      'Декодирует процентное кодирование: %41 становится A, а + — пробелом. ARGS уже раскодированы парсером один раз, поэтому эта трансформация нужна для дважды закодированных значений или сырых целей.',
    ),
    syntax: 't:urlDecode',
    gotchas: [
      l(
        'Decoding twice can invent a payload that was never sent — %2541 turns into A only if the application decodes twice as well.',
        'Двойное декодирование может выдумать нагрузку, которой не было: %2541 станет A, только если приложение тоже декодирует дважды.',
      ),
    ],
    seeAlso: ['urlDecodeUni', 'urlEncode', 'validateUrlEncoding'],
  },

  urlDecodeUni: {
    summary: l(
      'Percent-decoding plus the Microsoft %uXXXX form. The default choice in CRS: IIS and several proxies accept %u sequences, so a check that only understands %XX can be walked around.',
      'Процентное декодирование плюс майкрософтовская форма %uXXXX. Выбор по умолчанию в CRS: IIS и ряд прокси понимают последовательности %u, поэтому проверку, знающую только %XX, можно обойти.',
    ),
    syntax: 't:urlDecodeUni',
    tech: {
      scope: l(
        'The code page for %u mapping comes from SecUnicodeMapFile.',
        'Кодовая страница для отображения %u берётся из SecUnicodeMapFile.',
      ),
    },
    seeAlso: ['urlDecode', 'utf8toUnicode', 'detectSQLi'],
  },

  urlEncode: {
    summary: l(
      'Percent-encodes the value. Not a normalisation step but a preparation one: it is used when the result is written into a variable, a log line or a redirect URL.',
      'Кодирует значение в процентную форму. Это не нормализация, а подготовка: применяется, когда результат попадает в переменную, строку лога или URL редиректа.',
    ),
    syntax: 't:urlEncode',
    seeAlso: ['urlDecode', 'hexEncode', 'setvar'],
  },

  htmlEntityDecode: {
    summary: l(
      'Decodes HTML entities: &lt;, &#60; and &#x3c; all become <. Without it an XSS payload written in entities passes a check that looks for angle brackets.',
      'Декодирует HTML-сущности: &lt;, &#60; и &#x3c; превращаются в <. Без неё XSS-нагрузка, записанная сущностями, проходит мимо проверки на угловые скобки.',
    ),
    syntax: 't:htmlEntityDecode',
    tech: {
      scope: l(
        'Handles named, decimal and hexadecimal entities; the trailing semicolon is optional, exactly as browsers accept it.',
        'Понимает именованные, десятичные и шестнадцатеричные сущности; завершающая точка с запятой необязательна — ровно как это принимают браузеры.',
      ),
    },
    seeAlso: ['jsDecode', 'cssDecode', 'detectXSS', 'urlDecodeUni'],
  },

  jsDecode: {
    summary: l(
      'Decodes JavaScript escape sequences: \\x3c, \\u003c, \\074 and \\n. Needed when the payload arrives already prepared for a JS context.',
      'Декодирует escape-последовательности JavaScript: \\x3c, \\u003c, \\074 и \\n. Нужна, когда нагрузка приходит уже подготовленной под JS-контекст.',
    ),
    syntax: 't:jsDecode',
    seeAlso: ['htmlEntityDecode', 'cssDecode', 'escapeSeqDecode', 'detectXSS'],
  },

  cssDecode: {
    summary: l(
      'Decodes CSS escapes of the \\3c form, including the space that terminates them. The evasion path through style attributes and CSS expressions.',
      'Декодирует CSS-escape вида \\3c вместе с завершающим их пробелом. Это путь обхода через атрибуты style и CSS-выражения.',
    ),
    syntax: 't:cssDecode',
    seeAlso: ['htmlEntityDecode', 'jsDecode', 'detectXSS'],
  },

  escapeSeqDecode: {
    summary: l(
      'Decodes ANSI C escape sequences: \\n, \\t, \\v, \\xHH, \\0OOO. Relevant for payloads aimed at shells and C-like parsers.',
      'Декодирует escape-последовательности ANSI C: \\n, \\t, \\v, \\xHH, \\0OOO. Актуальна для нагрузок, нацеленных на шеллы и C-подобные парсеры.',
    ),
    syntax: 't:escapeSeqDecode',
    seeAlso: ['jsDecode', 'cmdLine', 'hexDecode'],
  },

  cmdLine: {
    summary: l(
      'Normalises the tricks used to disguise shell and cmd.exe commands: it drops backslashes, carets and quotes, removes spaces before / and (, turns commas and semicolons into spaces, collapses repeats and lower-cases the result.',
      'Нормализует приёмы маскировки команд shell и cmd.exe: убирает обратные слэши, карет-символы и кавычки, удаляет пробелы перед / и (, превращает запятые и точки с запятой в пробелы, схлопывает повторы и приводит к нижнему регистру.',
    ),
    syntax: 't:cmdLine',
    tech: {
      scope: l(
        'Includes lower-casing, so an extra t:lowercase changes nothing.',
        'Включает приведение к нижнему регистру, поэтому дополнительный t:lowercase ничего не меняет.',
      ),
    },
    gotchas: [
      l(
        'It mangles ordinary text badly — apply it to command-injection rules only, never to a generic text check.',
        'Обычный текст она калечит — применяйте только в правилах про инъекцию команд, но не в общей текстовой проверке.',
      ),
    ],
    example: {
      code: 'SecRule ARGS "@rx (?:/bin/(?:ba)?sh|cmd\\.exe)" "id:1102,phase:2,t:none,t:cmdLine,deny"',
    },
    seeAlso: ['removeWhitespace', 'escapeSeqDecode', 'removeNulls'],
  },

  normalizePath: {
    summary: l(
      'Collapses a path: removes duplicate slashes, drops ./ and resolves ../. Without it /public/../admin walks straight past a prefix check on /admin.',
      'Свёртывает путь: убирает повторяющиеся слэши, отбрасывает ./ и разрешает ../. Без неё /public/../admin спокойно проходит мимо проверки префикса /admin.',
    ),
    syntax: 't:normalizePath',
    tech: {
      scope: l(
        'Purely textual — it does not touch the file system and knows nothing about symlinks.',
        'Работает чисто текстово — файловую систему не трогает и о симлинках не знает.',
      ),
    },
    gotchas: [
      l(
        'Decode first: %2e%2e%2f is not recognised as ../ until t:urlDecodeUni has run.',
        'Сначала декодирование: %2e%2e%2f не распознаётся как ../, пока не отработала t:urlDecodeUni.',
      ),
    ],
    seeAlso: ['normalizePathWin', 'normalisePath', 'urlDecodeUni', 'REQUEST_FILENAME'],
  },

  normalizePathWin: {
    summary: l(
      'Path normalisation that also converts backslashes to forward slashes — the Windows variant, where ..\\ is as valid as ../.',
      'Нормализация пути, дополнительно превращающая обратные слэши в прямые, — вариант для Windows, где ..\\ ничем не хуже ../.',
    ),
    syntax: 't:normalizePathWin',
    gotchas: [
      l(
        'On a Unix backend a backslash is a legitimate filename character, so this transformation can create a path that never existed.',
        'На Unix-бэкенде обратный слэш — законный символ имени файла, поэтому эта трансформация может создать путь, которого не было.',
      ),
    ],
    seeAlso: ['normalizePath', 'normalisePathWin'],
  },

  normalisePath: {
    summary: l(
      'British spelling of normalizePath, identical in behaviour. Keep one spelling across a rule set so that grep over the configuration stays honest.',
      'Британское написание normalizePath, поведение идентично. Держитесь одного написания в наборе правил, иначе поиск по конфигурации перестанет быть честным.',
    ),
    syntax: 't:normalisePath',
    seeAlso: ['normalizePath', 'normalisePathWin'],
  },

  normalisePathWin: {
    summary: l(
      'British spelling of normalizePathWin, identical in behaviour: path folding plus backslash conversion. Pick one spelling for the whole rule set and stay with it.',
      'Британское написание normalizePathWin, поведение идентично: свёртка пути плюс превращение обратных слэшей. Выберите одно написание на весь набор правил и держитесь его.',
    ),
    syntax: 't:normalisePathWin',
    seeAlso: ['normalizePathWin', 'normalisePath'],
  },

  removeNulls: {
    summary: l(
      'Deletes NUL bytes from the value. A NUL is the standard way to cut a string short in C-based back ends, so removing it exposes what comes after.',
      'Удаляет NUL-байты из значения. NUL — стандартный способ оборвать строку в C-подобных бэкендах, поэтому его удаление обнажает то, что идёт следом.',
    ),
    syntax: 't:removeNulls',
    seeAlso: ['replaceNulls', 'validateByteRange', 'detectSQLi'],
  },

  replaceNulls: {
    summary: l(
      'Replaces NUL bytes with spaces instead of deleting them. Preserves the length and keeps neighbouring tokens apart — sometimes exactly what a word-boundary check needs.',
      'Заменяет NUL-байты пробелами, а не удаляет их. Сохраняет длину и не даёт соседним токенам слипнуться — иногда это ровно то, что нужно проверке по границам слова.',
    ),
    syntax: 't:replaceNulls',
    seeAlso: ['removeNulls', 'compressWhitespace'],
  },

  removeComments: {
    summary: l(
      'Strips C-style, shell and SQL comments together with their content. Kills the classic /*!50000union*/ and sel/**/ect evasions.',
      'Вырезает комментарии в стиле C, shell и SQL вместе с содержимым. Убивает классические обходы вида /*!50000union*/ и sel/**/ect.',
    ),
    syntax: 't:removeComments',
    gotchas: [
      l(
        'Removing a comment glues its neighbours together: sel/**/ect becomes select, which is the point — but so does a legitimate value containing /* */.',
        'Удаление комментария склеивает соседей: sel/**/ect становится select — в этом и смысл, но то же произойдёт с легитимным значением, содержащим /* */.',
      ),
    ],
    seeAlso: ['replaceComments', 'removeCommentsChar', 'detectSQLi'],
  },

  replaceComments: {
    summary: l(
      'Replaces each comment with a single space instead of deleting it. Safer than removeComments where words must not be glued together.',
      'Заменяет каждый комментарий одним пробелом вместо удаления. Безопаснее removeComments там, где слова нельзя склеивать.',
    ),
    syntax: 't:replaceComments',
    seeAlso: ['removeComments', 'compressWhitespace'],
  },

  removeCommentsChar: {
    summary: l(
      'Removes only the comment markers (/*, */, --, #) and keeps the text between them. Reveals what the attacker tried to hide inside a comment.',
      'Удаляет только маркеры комментариев (/*, */, --, #), сохраняя текст между ними. Показывает то, что атакующий пытался спрятать внутри комментария.',
    ),
    syntax: 't:removeCommentsChar',
    seeAlso: ['removeComments', 'replaceComments'],
  },

  base64Decode: {
    summary: l(
      'Strictly decodes Base64. Anything outside the alphabet aborts decoding, so a value that is only partly Base64 comes out mangled.',
      'Строго декодирует Base64. Любой символ вне алфавита прерывает декодирование, поэтому значение, лишь частично закодированное в Base64, получается искажённым.',
    ),
    syntax: 't:base64Decode',
    gotchas: [
      l(
        'Applying it to a value that is not Base64 produces garbage, and the rule then checks that garbage. Chain it after a rule that confirms the format.',
        'Применение к не-Base64 значению даёт мусор, и правило проверяет уже мусор. Цепляйте её после правила, подтверждающего формат.',
      ),
    ],
    seeAlso: ['base64DecodeExt', 'base64Encode'],
  },

  base64DecodeExt: {
    summary: l(
      'Forgiving Base64 decoding: characters outside the alphabet are skipped rather than treated as an error. Matches how many application libraries behave, which is exactly where the evasion lives.',
      'Снисходительное декодирование Base64: символы вне алфавита пропускаются, а не считаются ошибкой. Так ведут себя многие библиотеки в приложениях — именно там и живёт обход.',
    ),
    syntax: 't:base64DecodeExt',
    seeAlso: ['base64Decode', 'base64Encode'],
  },

  base64Encode: {
    summary: l(
      'Encodes the value into Base64. Used to compare against a stored encoded form or to keep a binary value readable in the log.',
      'Кодирует значение в Base64. Применяется, чтобы сравнить с сохранённой закодированной формой или чтобы бинарное значение читалось в логе.',
    ),
    syntax: 't:base64Encode',
    seeAlso: ['base64Decode', 'hexEncode'],
  },

  hexDecode: {
    summary: l(
      'Decodes a plain hex string: every pair of digits becomes a byte, so 414243 turns into ABC. Common for payloads hidden as a hex blob in an argument.',
      'Декодирует обычную шестнадцатеричную строку: каждая пара цифр превращается в байт, 414243 становится ABC. Часто встречается для нагрузок, спрятанных в аргументе как hex-блок.',
    ),
    syntax: 't:hexDecode',
    seeAlso: ['hexEncode', 'escapeSeqDecode'],
  },

  hexEncode: {
    summary: l(
      'Encodes the value as hexadecimal. Its main job is to make binary output printable — a hash from t:md5 or t:sha1 is unusable without it.',
      'Кодирует значение в шестнадцатеричный вид. Главная задача — сделать бинарный вывод печатным: хеш от t:md5 или t:sha1 без неё непригоден.',
    ),
    syntax: 't:hexEncode',
    seeAlso: ['hexDecode', 'md5', 'sha1'],
  },

  md5: {
    summary: l(
      'Replaces the value with its MD5 hash in raw binary form. Used to compare a value against a known hash, not for security guarantees.',
      'Заменяет значение его MD5-хешем в сыром бинарном виде. Применяется для сравнения с известным хешем, а не ради гарантий безопасности.',
    ),
    syntax: 't:md5',
    gotchas: [
      l(
        'The output is binary: without a following t:hexEncode it cannot be compared with a hex string or logged sensibly.',
        'Вывод бинарный: без следующей за ней t:hexEncode его не сравнить с hex-строкой и не залогировать по-человечески.',
      ),
    ],
    seeAlso: ['sha1', 'hexEncode'],
  },

  sha1: {
    summary: l(
      'Replaces the value with its SHA-1 hash in raw binary form. Same usage and the same hexEncode caveat as t:md5.',
      'Заменяет значение его SHA-1-хешем в сыром бинарном виде. Применение то же, что у t:md5, и та же оговорка про hexEncode.',
    ),
    syntax: 't:sha1',
    seeAlso: ['md5', 'hexEncode'],
  },

  length: {
    summary: l(
      'Replaces the value with its length in bytes, as a decimal string. Turns a text target into a numeric one, so the operator after it must be numeric.',
      'Заменяет значение его длиной в байтах в виде десятичной строки. Превращает текстовую цель в числовую, поэтому оператор после неё должен быть числовым.',
    ),
    syntax: 't:length',
    tech: {
      scope: l(
        'Counts bytes, not characters: one Cyrillic letter in UTF-8 is two.',
        'Считает байты, а не символы: одна кириллическая буква в UTF-8 — это два.',
      ),
    },
    gotchas: [
      l(
        'It applies per value, so &ARGS-style counting is a different thing entirely.',
        'Применяется к каждому значению по отдельности, поэтому подсчёт вида &ARGS — это совсем другое.',
      ),
    ],
    example: {
      code: 'SecRule ARGS:comment "@gt 4096" "id:1103,phase:2,t:none,t:length,deny,msg:\'Comment too long\'"',
    },
    seeAlso: ['gt', 'lt', 'ARGS_COMBINED_SIZE'],
  },

  utf8toUnicode: {
    summary: l(
      'Converts UTF-8 sequences into the %uXXXX notation. In CRS it stands in front of t:urlDecodeUni so that multibyte overlong forms are unfolded before anything else looks at the value.',
      'Преобразует UTF-8-последовательности в запись %uXXXX. В CRS ставится перед t:urlDecodeUni, чтобы многобайтовые избыточные формы развернулись раньше, чем на значение посмотрит что-то ещё.',
    ),
    syntax: 't:utf8toUnicode',
    seeAlso: ['urlDecodeUni', 'validateUtf8Encoding'],
  },

  parityEven7bit: {
    summary: l(
      'Recalculates the value as 7-bit data with even parity, clearing the eighth bit. A legacy transformation for protocols that used parity bits; it has no place in modern HTTP rules.',
      'Пересчитывает значение как 7-битные данные с чётной чётностью, обнуляя восьмой бит. Наследие протоколов с битами чётности; в современных HTTP-правилах ей делать нечего.',
    ),
    syntax: 't:parityEven7bit',
    seeAlso: ['parityOdd7bit', 'parityZero7bit'],
  },

  parityOdd7bit: {
    summary: l(
      'The odd-parity counterpart of parityEven7bit, equally legacy.',
      'Аналог parityEven7bit с нечётной чётностью, столь же архаичный.',
    ),
    syntax: 't:parityOdd7bit',
    seeAlso: ['parityEven7bit', 'parityZero7bit'],
  },

  parityZero7bit: {
    summary: l(
      'Zeroes the parity bit of every byte. In practice this simply strips the high bit, which mutilates UTF-8 text.',
      'Обнуляет бит чётности каждого байта. На практике это просто снятие старшего бита, которое калечит UTF-8-текст.',
    ),
    syntax: 't:parityZero7bit',
    seeAlso: ['parityEven7bit', 'parityOdd7bit'],
  },
};
