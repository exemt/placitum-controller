/**
 * Регулярное выражение ModSecurity глазами JavaScript.
 *
 * Движок считает шаблоны через PCRE, редактор — через `RegExp` браузера.
 * Языки совпадают почти во всём, и ровно на этом «почти» ломалась проверка:
 * половина правил CRS начинается с `(?i)`, а `RegExp` такой записи флага не
 * знает и объявляет весь шаблон нерабочим. Сказать «некорректно» про
 * правило, которое в ModSecurity прекрасно работает, хуже, чем промолчать:
 * после пары таких приговоров человек перестаёт верить проверке вообще.
 *
 * Поэтому шаблон сначала переводится: записи, которые в PCRE выглядят иначе,
 * приводятся к виду, понятному браузеру, и только потом компилируются.
 * Перевод сознательно неполный — он покрывает то, что действительно
 * встречается в правилах: встроенные флаги, сверхжадные кванторы,
 * атомарные группы, POSIX-классы, якоря `\A`/`\z`/`\Z` и сокращения
 * `\h`/`\R`. Рекурсия и `\K` аналога не имеют; про них честно говорится,
 * что проверить такой шаблон нечем, — вместо выдуманной ошибки.
 *
 * Одно упрощение стоит помнить: встроенный флаг переносится на всё
 * выражение целиком. В PCRE `(?i)` действует с места, где написан, но в
 * правилах он стоит в начале, а иначе флага в JavaScript просто нет.
 */

/** Запись PCRE, переписанная при переводе шаблона. */
export type RegexRewrite =
  | 'inlineFlags'
  | 'extended'
  | 'comment'
  | 'possessive'
  | 'atomic'
  | 'namedGroup'
  | 'anchor'
  | 'shorthand'
  | 'posixClass'
  | 'quoted';

/** Шаблон PCRE, переписанный под `RegExp`. */
export interface RegexTranslation {
  source: string;
  flags: string;
  rewrites: RegexRewrite[];
  /** Запись, аналога которой в JavaScript нет; перевод на ней остановлен. */
  unsupported: string | null;
}

/** Итог проверки шаблона. */
export interface RegexReview {
  /** Готовое выражение или `null`, если собрать его не вышло. */
  regex: RegExp | null;
  /** Запись PCRE без аналога: шаблон рабочий, но проверить его нечем. */
  unsupported: string | null;
  /** Короткая причина отказа — одна строка, без самого шаблона. */
  reason: string | null;
  /** Полное сообщение движка: причина вместе с шаблоном целиком. */
  detail: string | null;
  /** Записи PCRE, переписанные при переводе. */
  rewrites: RegexRewrite[];
}

/** Содержимое POSIX-классов в виде, который понимает `RegExp`. */
const POSIX_CLASSES: Record<string, string> = {
  alnum: '0-9A-Za-z',
  alpha: 'A-Za-z',
  ascii: '\\x00-\\x7f',
  blank: ' \\t',
  cntrl: '\\x00-\\x1f\\x7f',
  digit: '0-9',
  graph: '\\x21-\\x7e',
  lower: 'a-z',
  print: '\\x20-\\x7e',
  punct: '!-\\/:-@\\[-`{-~',
  space: '\\s',
  upper: 'A-Z',
  word: '\\w',
  xdigit: '0-9A-Fa-f',
};

/** Односимвольные сокращения PCRE, которых в JavaScript нет. */
const SHORTHANDS: Record<string, string> = {
  h: '[ \\t]',
  H: '[^ \\t]',
  R: '(?:\\r\\n|[\\n\\x0b\\f\\r\\x85\\u2028\\u2029])',
};

/** Якоря PCRE через якоря JavaScript. */
const ANCHORS: Record<string, string> = {
  A: '^',
  z: '$',
  // `\Z` — конец строки, но перед завершающим переводом строки, если он есть.
  Z: '(?=\\n?$)',
};

/**
 * Записи, которые нельзя ни перевести, ни оставить как есть.
 *
 * Рекурсия, условные группы и `\K` меняют смысл шаблона так, что в
 * JavaScript их нечем заменить. Оставить их как есть тоже нельзя: `\K`
 * молча превратится в букву `K`, и проверка начнёт врать.
 */
const UNSUPPORTED_ESCAPES = new Set(['K', 'G', 'C', 'X']);

/** Длина окна, которого хватает разобрать заголовок группы. */
const HEAD = 80;

/** Литерал `\Q...\E` как обычная строка шаблона. */
function escapeLiteral(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

/**
 * Разбор класса символов.
 *
 * Внутри квадратных скобок действуют свои правила, и общий цикл здесь
 * только мешал бы: `(`, `*` и `?` тут обычные символы, зато появляются
 * POSIX-классы, которых снаружи не бывает. Возвращает `null`, если класс
 * не закрыт, — про это лучше скажет сам движок, его сообщение точнее.
 */
function readCharClass(
  pattern: string,
  start: number,
  rewrites: Set<RegexRewrite>,
): { text: string; next: number } | null {
  let out = '[';
  let i = start + 1;

  if (pattern[i] === '^') {
    out += '^';
    i += 1;
  }
  // `]` сразу после открывающей скобки в PCRE — обычный символ, в
  // JavaScript — конец пустого класса, поэтому его приходится экранировать.
  if (pattern[i] === ']') {
    out += '\\]';
    i += 1;
  }

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === ']') return { text: `${out}]`, next: i + 1 };

    if (char === '\\') {
      const next = pattern[i + 1];
      if (next === undefined) break;
      if (next === 'h') {
        out += ' \\t';
        rewrites.add('shorthand');
        i += 2;
        continue;
      }
      out += char + next;
      i += 2;
      continue;
    }

    if (char === '[' && pattern[i + 1] === ':') {
      const posix = /^\[:([a-z]+):\]/.exec(pattern.slice(i, i + 12));
      const body = posix === null ? undefined : POSIX_CLASSES[posix[1]];
      if (posix !== null && body !== undefined) {
        out += body;
        rewrites.add('posixClass');
        i += posix[0].length;
        continue;
      }
    }

    out += char;
    i += 1;
  }

  return null;
}

/** Шаблон PCRE в виде, который принимает `RegExp`. */
export function translateRegex(pattern: string): RegexTranslation {
  const rewrites = new Set<RegexRewrite>();
  let out = '';
  let flags = '';
  let extended = false;
  let i = 0;

  const setFlags = (letters: string, on: boolean) => {
    for (const letter of letters) {
      if (letter === 'x') {
        extended = on;
        if (on) rewrites.add('extended');
        continue;
      }
      // Остальные флаги PCRE (`U`, `X`, `J`, `A`, `D`, `S`) на разбор
      // шаблона не влияют — тихо опускаем, иначе `RegExp` их не примет.
      if (!'ims'.includes(letter)) continue;
      if (on) flags += flags.includes(letter) ? '' : letter;
      else flags = flags.replace(letter, '');
    }
  };

  /** Квантор разобран: `?` после него — ленивый, `+` — сверхжадный. */
  const readQuantifierSuffix = () => {
    if (pattern[i] === '?') {
      out += '?';
      i += 1;
      return;
    }
    // Сверхжадность запрещает возврат; для проверки шаблона это разница
    // в скорости, а не в том, что он ловит, — поэтому просто снимается.
    if (pattern[i] === '+') {
      i += 1;
      rewrites.add('possessive');
    }
  };

  while (i < pattern.length) {
    const char = pattern[i];

    // Флаг `x`: пробелы и всё после `#` до конца строки шаблон не читает.
    if (extended) {
      if (char === '#') {
        while (i < pattern.length && pattern[i] !== '\n') i += 1;
        continue;
      }
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }
    }

    if (char === '\\') {
      const next = pattern[i + 1];
      if (next === undefined) {
        out += char;
        break;
      }
      if (UNSUPPORTED_ESCAPES.has(next)) {
        return { source: out, flags, rewrites: [...rewrites], unsupported: `\\${next}` };
      }
      const anchor = ANCHORS[next];
      if (anchor !== undefined) {
        out += anchor;
        rewrites.add('anchor');
        i += 2;
        continue;
      }
      const shorthand = SHORTHANDS[next];
      if (shorthand !== undefined) {
        out += shorthand;
        rewrites.add('shorthand');
        i += 2;
        continue;
      }
      if (next === 'Q') {
        const end = pattern.indexOf('\\E', i + 2);
        out += escapeLiteral(end === -1 ? pattern.slice(i + 2) : pattern.slice(i + 2, end));
        rewrites.add('quoted');
        i = end === -1 ? pattern.length : end + 2;
        continue;
      }
      if (next === 'g') {
        const back = /^\\g\{?(\d+)\}?/.exec(pattern.slice(i, i + 8));
        if (back !== null) {
          out += `\\${back[1]}`;
          rewrites.add('shorthand');
          i += back[0].length;
          continue;
        }
      }
      out += char + next;
      i += 2;
      continue;
    }

    if (char === '[') {
      const parsed = readCharClass(pattern, i, rewrites);
      if (parsed === null) {
        out += pattern.slice(i);
        break;
      }
      out += parsed.text;
      i = parsed.next;
      continue;
    }

    if (char === '(') {
      const head = pattern.slice(i, i + HEAD);

      if (head.startsWith('(?#')) {
        const end = pattern.indexOf(')', i);
        rewrites.add('comment');
        i = end === -1 ? pattern.length : end + 1;
        continue;
      }
      // Атомарная группа лишь запрещает возврат внутрь себя; как и
      // сверхжадность, на набор подходящих строк она почти не влияет.
      if (head.startsWith('(?>')) {
        out += '(?:';
        rewrites.add('atomic');
        i += 3;
        continue;
      }
      if (head.startsWith('(?P<')) {
        out += '(?<';
        rewrites.add('namedGroup');
        i += 4;
        continue;
      }
      const namedBackref = /^\(\?P=([A-Za-z_]\w*)\)/.exec(head);
      if (namedBackref !== null) {
        out += `\\k<${namedBackref[1]}>`;
        rewrites.add('namedGroup');
        i += namedBackref[0].length;
        continue;
      }
      // Рекурсия, вызовы подшаблонов, условные группы и callout.
      const recursion = /^\(\?(?:R\)|\d|&|P>|\+\d|-\d|C|\()/.exec(head);
      if (recursion !== null) {
        return { source: out, flags, rewrites: [...rewrites], unsupported: recursion[0] };
      }
      const modifiers = /^\(\?([a-zA-Z]*)(?:-([a-zA-Z]+))?([:)])/.exec(head);
      if (modifiers !== null && (modifiers[1] !== '' || modifiers[2] !== undefined)) {
        setFlags(modifiers[1], true);
        if (modifiers[2] !== undefined) setFlags(modifiers[2], false);
        if (modifiers[3] === ':') out += '(?:';
        rewrites.add('inlineFlags');
        i += modifiers[0].length;
        continue;
      }
      // Всё прочее — обычные группы и просмотры: их JavaScript понимает
      // сам. `(?` уходит наружу целиком, чтобы следующий шаг цикла не
      // принял `?` за квантор.
      out += pattern[i + 1] === '?' ? '(?' : '(';
      i += pattern[i + 1] === '?' ? 2 : 1;
      continue;
    }

    if (char === '*' || char === '+' || char === '?') {
      out += char;
      i += 1;
      readQuantifierSuffix();
      continue;
    }

    if (char === '{') {
      const repeat = /^\{\d+(?:,\d*)?\}/.exec(pattern.slice(i, i + 24));
      if (repeat !== null) {
        out += repeat[0];
        i += repeat[0].length;
        readQuantifierSuffix();
        continue;
      }
    }

    out += char;
    i += 1;
  }

  return { source: out, flags, rewrites: [...rewrites], unsupported: null };
}

/** Сообщение движка без самого шаблона: `/.../: причина` → `причина`. */
const ENGINE_MESSAGE = /^Invalid regular expression: \/[\s\S]*\/[a-z]*: ([\s\S]+)$/;

/**
 * Короткая причина отказа.
 *
 * Движок вставляет в сообщение весь шаблон, а шаблон CRS — это экран
 * текста, в котором собственно причина теряется в самом конце. Здесь
 * остаётся только она.
 */
export function regexReason(message: string): string {
  const parsed = ENGINE_MESSAGE.exec(message);
  return parsed === null ? message : parsed[1];
}

/** Собирает шаблон правила и рассказывает, что помешало. */
export function reviewRegex(pattern: string): RegexReview {
  const translated = translateRegex(pattern);
  const rewrites = translated.rewrites;

  if (translated.unsupported !== null) {
    return {
      regex: null,
      unsupported: translated.unsupported,
      reason: null,
      detail: null,
      rewrites,
    };
  }

  try {
    const regex = new RegExp(translated.source, translated.flags);
    return { regex, unsupported: null, reason: null, detail: null, rewrites };
  } catch (error) {
    // Перевод мог и сам всё испортить. Если исходный шаблон движок
    // принимает как есть, виноват перевод, а не правило — тогда лучше
    // работать с исходным, чем показывать ошибку на ровном месте.
    try {
      const regex = new RegExp(pattern);
      return { regex, unsupported: null, reason: null, detail: null, rewrites: [] };
    } catch {
      const detail = error instanceof Error ? error.message : String(error);
      return { regex: null, unsupported: null, reason: regexReason(detail), detail, rewrites };
    }
  }
}
