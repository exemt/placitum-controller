/**
 * Применение преобразований `t:` к конкретному значению.
 *
 * `semantics.ts` описывает словами, что преобразование делает. Здесь оно
 * делается: конструктору нужно показать, во что превратится значение к
 * моменту сравнения. Увидеть, что `POST` доехало до оператора как `post`,
 * надёжнее, чем прочитать об этом предупреждение.
 *
 * Работаем с байтами, а не со строкой JavaScript: ModSecurity преобразует
 * буфер байтов. Поэтому `t:length` от «привет» — двенадцать, а `%C3%A9`
 * после `t:urlDecode` — два байта, которые вместе показываются как «é».
 * На строке из символов оба ответа были бы неправильными.
 *
 * Воспроизведены не все преобразования: хеши зависят от сборки движка, а
 * `t:cssDecode` и `t:utf8toUnicode` разбирают пограничные случаи так, как
 * это описано только в исходниках ModSecurity. Показать «примерно то же
 * самое» здесь хуже, чем честно не показать: предпросмотр стоит ровно
 * столько, насколько ему можно верить.
 */

/* ------------------------------------------------------------------ */
/* Байты и их показ                                                    */
/* ------------------------------------------------------------------ */

/** Текст в байты UTF-8 — так значение приходит к правилу из запроса. */
export function toBytes(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * Байты как строка, в которой один символ — ровно один байт.
 *
 * В этом виде подстрока и регулярное выражение работают побайтово, то есть
 * так же, как в ModSecurity: PCRE там тоже смотрит на байты, а не на
 * символы. Для показа человеку это не годится — только для сравнения.
 */
export function toLatin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/** Строгое чтение UTF-8; `null` — последовательность испорчена. */
function decodeUtf8(bytes: Uint8Array): string | null {
  let out = '';
  let i = 0;

  while (i < bytes.length) {
    const lead = bytes[i];
    let code: number;
    let extra: number;

    if (lead < 0x80) {
      code = lead;
      extra = 0;
    } else if (lead >= 0xc2 && lead <= 0xdf) {
      code = lead & 0x1f;
      extra = 1;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      code = lead & 0x0f;
      extra = 2;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      code = lead & 0x07;
      extra = 3;
    } else {
      return null;
    }

    if (i + extra >= bytes.length) return null;
    for (let k = 1; k <= extra; k++) {
      const next = bytes[i + k];
      if ((next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    // Переудлинённая запись и суррогаты — тоже испорченный UTF-8: показать
    // их как текст значило бы скрыть то, ради чего ставят `t:urlDecodeUni`.
    if (extra === 2 && code < 0x800) return null;
    if (extra === 3 && (code < 0x10000 || code > 0x10ffff)) return null;
    if (code >= 0xd800 && code <= 0xdfff) return null;

    out += String.fromCodePoint(code);
    i += extra + 1;
  }

  return out;
}

function hexByte(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/**
 * Значение так, как его стоит показать человеку.
 *
 * Печатаемый текст остаётся текстом, всё остальное — управляющие символы,
 * сырые байты после `t:hexDecode` — записывается как `\xNN`. Иначе половина
 * предпросмотра оказывалась бы пустыми клетками и переносами строк.
 */
export function showBytes(bytes: Uint8Array): string {
  const text = decodeUtf8(bytes);
  if (text === null) {
    return [...bytes]
      .map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : `\\x${hexByte(byte)}`))
      .join('');
  }

  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    out += code < 0x20 || code === 0x7f ? `\\x${hexByte(code)}` : char;
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((byte, index) => byte === b[index]);
}

/* ------------------------------------------------------------------ */
/* Разбор отдельных байтов                                             */
/* ------------------------------------------------------------------ */

const SPACE = 0x20;

/** Пробельный байт в понимании `isspace()`: пробел и \t \n \v \f \r. */
function isSpace(byte: number): boolean {
  return byte === SPACE || (byte >= 0x09 && byte <= 0x0d);
}

/** Значение шестнадцатеричной цифры или `-1`. */
function hexValue(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return -1;
}

/** Несколько шестнадцатеричных цифр подряд как одно число или `-1`. */
function hexRun(input: Uint8Array, at: number, count: number): number {
  let value = 0;
  for (let i = 0; i < count; i++) {
    const digit = hexValue(input[at + i] ?? -1);
    if (digit === -1) return -1;
    value = value * 16 + digit;
  }
  return value;
}

/**
 * Код символа в один или два байта — так это делает ModSecurity.
 *
 * Полноширинные формы (`＜`) переводятся в обычные ASCII: именно ими
 * подменяют скобки, чтобы проверка не узнала разметку. Всё, что шире
 * байта, разбирается по байтам, а не заменяется одним символом.
 */
function pushUnicode(out: number[], code: number): void {
  const folded = code >= 0xff01 && code <= 0xff5e ? code - 0xfee0 : code;
  if (folded > 0xff) out.push((folded >> 8) & 0xff);
  out.push(folded & 0xff);
}

/* ------------------------------------------------------------------ */
/* Сами преобразования                                                 */
/* ------------------------------------------------------------------ */

type ByteFn = (input: Uint8Array) => Uint8Array;

function mapBytes(input: Uint8Array, fn: (byte: number) => number): Uint8Array {
  return Uint8Array.from(input, fn);
}

function keepBytes(input: Uint8Array, keep: (byte: number) => boolean): Uint8Array {
  return Uint8Array.from([...input].filter(keep));
}

const lowercase: ByteFn = (input) =>
  mapBytes(input, (byte) => (byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte));

const uppercase: ByteFn = (input) =>
  mapBytes(input, (byte) => (byte >= 0x61 && byte <= 0x7a ? byte - 0x20 : byte));

function trimLeft(input: Uint8Array): Uint8Array {
  let start = 0;
  while (start < input.length && isSpace(input[start])) start++;
  return input.subarray(start);
}

function trimRight(input: Uint8Array): Uint8Array {
  let end = input.length;
  while (end > 0 && isSpace(input[end - 1])) end--;
  return input.subarray(0, end);
}

const compressWhitespace: ByteFn = (input) => {
  const out: number[] = [];
  let inRun = false;
  for (const byte of input) {
    if (isSpace(byte)) {
      if (!inRun) out.push(SPACE);
      inRun = true;
    } else {
      out.push(byte);
      inRun = false;
    }
  }
  return Uint8Array.from(out);
};

// Неразрывный пробел удаляется наравне с обычным: им и подменяют пробел,
// чтобы разорвать искомую фразу.
const removeWhitespace: ByteFn = (input) =>
  keepBytes(input, (byte) => !isSpace(byte) && byte !== 0xa0);

const urlEncode: ByteFn = (input) => {
  const out: number[] = [];
  for (const byte of input) {
    const safe =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      byte === 0x2d ||
      byte === 0x5f ||
      byte === 0x2e;
    if (safe) out.push(byte);
    else out.push(0x25, ...toBytes(hexByte(byte).toUpperCase()));
  }
  return Uint8Array.from(out);
};

/**
 * URL-декодирование. `unicode` включает разбор `%uXXXX` в стиле IIS.
 *
 * Незавершённая последовательность (`%zz`, `%4`) остаётся как есть:
 * ModSecurity её не трогает, и предпросмотр не должен «дочинять» вход за
 * движок — иначе проверка выглядела бы работающей там, где она не работает.
 */
function urlDecode(unicode: boolean): ByteFn {
  return (input) => {
    const out: number[] = [];
    let i = 0;

    while (i < input.length) {
      const byte = input[i];

      if (byte === 0x2b) {
        out.push(SPACE);
        i++;
        continue;
      }

      if (byte !== 0x25) {
        out.push(byte);
        i++;
        continue;
      }

      const next = input[i + 1];
      if (unicode && (next === 0x75 || next === 0x55)) {
        const code = hexRun(input, i + 2, 4);
        if (code !== -1) {
          pushUnicode(out, code);
          i += 6;
          continue;
        }
      }

      const pair = hexRun(input, i + 1, 2);
      if (pair !== -1) {
        out.push(pair);
        i += 3;
        continue;
      }

      out.push(byte);
      i++;
    }

    return Uint8Array.from(out);
  };
}

const NAMED_ENTITIES: Record<string, number> = {
  quot: 0x22,
  amp: 0x26,
  lt: 0x3c,
  gt: 0x3e,
  nbsp: 0xa0,
};

/** Раскрытие `&lt;`, `&#60;` и `&#x3c;` — точка с запятой необязательна. */
const htmlEntityDecode: ByteFn = (input) => {
  const out: number[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] !== 0x26) {
      out.push(input[i]);
      i++;
      continue;
    }

    let code = -1;
    let end = i;

    if (input[i + 1] === 0x23) {
      const hex = input[i + 2] === 0x78 || input[i + 2] === 0x58;
      let at = i + (hex ? 3 : 2);
      let value = 0;
      let digits = 0;
      for (; at < input.length; at++, digits++) {
        const digit = hex ? hexValue(input[at]) : input[at] - 0x30;
        if (digit < 0 || (!hex && digit > 9)) break;
        value = value * (hex ? 16 : 10) + digit;
      }
      if (digits > 0) {
        code = value & 0xff;
        end = at;
      }
    } else {
      const rest = toLatin1(input.subarray(i + 1, i + 9)).toLowerCase();
      for (const [name, value] of Object.entries(NAMED_ENTITIES)) {
        if (rest.startsWith(name)) {
          code = value;
          end = i + 1 + name.length;
          break;
        }
      }
    }

    if (code === -1) {
      out.push(input[i]);
      i++;
      continue;
    }

    out.push(code);
    i = input[end] === 0x3b ? end + 1 : end;
  }

  return Uint8Array.from(out);
};

const SINGLE_ESCAPES: Record<number, number> = {
  0x61: 0x07,
  0x62: 0x08,
  0x66: 0x0c,
  0x6e: 0x0a,
  0x72: 0x0d,
  0x74: 0x09,
  0x76: 0x0b,
  0x5c: 0x5c,
  0x3f: 0x3f,
  0x27: 0x27,
  0x22: 0x22,
};

/**
 * Раскрытие escape-последовательностей.
 *
 * `js` добавляет к общему набору `\uXXXX` — форму, в которой полезная
 * нагрузка едет внутри скрипта.
 */
function escapeDecode(js: boolean): ByteFn {
  return (input) => {
    const out: number[] = [];
    let i = 0;

    while (i < input.length) {
      if (input[i] !== 0x5c || i + 1 >= input.length) {
        out.push(input[i]);
        i++;
        continue;
      }

      const marker = input[i + 1];

      if (marker === 0x78 || marker === 0x58) {
        const pair = hexRun(input, i + 2, 2);
        if (pair !== -1) {
          out.push(pair);
          i += 4;
          continue;
        }
      }

      if (js && (marker === 0x75 || marker === 0x55)) {
        const code = hexRun(input, i + 2, 4);
        if (code !== -1) {
          pushUnicode(out, code);
          i += 6;
          continue;
        }
      }

      if (marker >= 0x30 && marker <= 0x37) {
        let value = 0;
        let digits = 0;
        while (digits < 3 && input[i + 1 + digits] >= 0x30 && input[i + 1 + digits] <= 0x37) {
          value = value * 8 + (input[i + 1 + digits] - 0x30);
          digits++;
        }
        out.push(value & 0xff);
        i += 1 + digits;
        continue;
      }

      const single = SINGLE_ESCAPES[marker];
      // Незнакомая последовательность теряет только косую черту: так
      // ведёт себя и разбор в JavaScript, и нестрогий разбор ModSecurity.
      out.push(single ?? marker);
      i += 2;
    }

    return Uint8Array.from(out);
  };
}

/** Последовательность байтов стоит ровно на этом месте. */
function matchesAt(input: Uint8Array, seq: number[], at: number): boolean {
  return seq.every((byte, offset) => input[at + offset] === byte);
}

/** Индекс последовательности байтов начиная с позиции; `-1` — её нет. */
function indexOfSeq(input: Uint8Array, seq: number[], from: number): number {
  for (let i = from; i + seq.length <= input.length; i++) {
    if (matchesAt(input, seq, i)) return i;
  }
  return -1;
}

const OPEN_C = [0x2f, 0x2a];
const CLOSE_C = [0x2a, 0x2f];
const OPEN_HTML = [0x3c, 0x21, 0x2d, 0x2d];
const CLOSE_HTML = [0x2d, 0x2d, 0x3e];
const DASHES = [0x2d, 0x2d];

/**
 * Комментарии заменяются пробелом.
 *
 * Пробел, а не пустота: `un/**​/ion` должно превратиться в `un ion`, а не
 * склеиться в новое слово, которое проверка уже не узнает.
 */
const replaceComments: ByteFn = (input) => {
  const out: number[] = [];
  let i = 0;

  while (i < input.length) {
    if (matchesAt(input, OPEN_C, i)) {
      const close = indexOfSeq(input, CLOSE_C, i + 2);
      out.push(SPACE);
      // Незакрытый комментарий съедает остаток значения — на этом и
      // строится обход, когда проверка ждёт закрывающую пару.
      if (close === -1) break;
      i = close + 2;
      continue;
    }
    out.push(input[i]);
    i++;
  }

  return Uint8Array.from(out);
};

/** Комментарии вырезаются целиком, вместе с тем, что закомментировано. */
const removeComments: ByteFn = (input) => {
  const out: number[] = [];
  let i = 0;

  while (i < input.length) {
    if (matchesAt(input, OPEN_C, i)) {
      const close = indexOfSeq(input, CLOSE_C, i + 2);
      if (close === -1) break;
      i = close + 2;
      continue;
    }
    if (matchesAt(input, OPEN_HTML, i)) {
      const close = indexOfSeq(input, CLOSE_HTML, i + 4);
      if (close === -1) break;
      i = close + 3;
      continue;
    }
    // Однострочный комментарий SQL обрывает значение до конца: строк
    // внутри одного значения ModSecurity не различает.
    if (input[i] === 0x23 || matchesAt(input, DASHES, i)) break;

    out.push(input[i]);
    i++;
  }

  return Uint8Array.from(out);
};

/** Убираются только метки комментария; их содержимое остаётся. */
const removeCommentsChar: ByteFn = (input) => {
  const out: number[] = [];
  let i = 0;

  while (i < input.length) {
    const marker = [OPEN_HTML, CLOSE_HTML, OPEN_C, CLOSE_C, DASHES].find((seq) =>
      matchesAt(input, seq, i),
    );
    if (marker !== undefined) {
      i += marker.length;
      continue;
    }
    if (input[i] === 0x23) {
      i++;
      continue;
    }
    out.push(input[i]);
    i++;
  }

  return Uint8Array.from(out);
};

/**
 * Свёртывание пути: `//` в `/`, `/./` в `/`, `/../` вместе с предыдущим
 * шагом. После него обход каталога виден как обход, а не как длинный путь.
 */
function normalizePath(windows: boolean): ByteFn {
  return (input) => {
    const source = windows
      ? mapBytes(input, (byte) => (byte === 0x5c ? 0x2f : byte))
      : input;
    const text = toLatin1(source);
    const absolute = text.startsWith('/');
    const trailing = text.endsWith('/') || text.endsWith('/.') || text.endsWith('/..');

    const kept: string[] = [];
    for (const part of text.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        const last = kept[kept.length - 1];
        if (kept.length > 0 && last !== '..') kept.pop();
        else if (!absolute) kept.push('..');
        continue;
      }
      kept.push(part);
    }

    let out = kept.join('/');
    if (absolute) out = `/${out}`;
    if (trailing && out !== '' && !out.endsWith('/')) out += '/';
    return Uint8Array.from(out, (char) => char.charCodeAt(0));
  };
}

/**
 * Нормализация командной строки Windows.
 *
 * Оболочка принимает `c^m^d /c "d""ir"` как обычный `cmd /c dir`, и без
 * этого шага проверка ищет команду, которой в тексте буквально нет.
 */
const cmdLine: ByteFn = (input) => {
  const out: number[] = [];

  for (const byte of input) {
    if (byte === 0x5c || byte === 0x22 || byte === 0x27 || byte === 0x5e) continue;

    // Запятая и точка с запятой разделяют аргументы наравне с пробелом.
    const asSpace = isSpace(byte) || byte === 0x2c || byte === 0x3b;
    if (asSpace) {
      if (out[out.length - 1] !== SPACE) out.push(SPACE);
      continue;
    }

    // Пробел перед `/` и `(` тоже ничего не разделяет: `dir /w` и `dir/w`
    // для оболочки одно и то же.
    if ((byte === 0x2f || byte === 0x28) && out[out.length - 1] === SPACE) out.pop();

    out.push(byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte);
  }

  return Uint8Array.from(out);
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const base64Encode: ByteFn = (input) => {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input[i];
    const b = input[i + 1];
    const c = input[i + 2];
    out += BASE64_ALPHABET[a >> 2];
    out += BASE64_ALPHABET[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : BASE64_ALPHABET[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : BASE64_ALPHABET[c & 0x3f];
  }
  return toBytes(out);
};

/**
 * Разбор Base64. `lenient` пропускает посторонние символы, как это делает
 * PHP; строгий вариант на первом же из них останавливается.
 */
function base64Decode(lenient: boolean): ByteFn {
  return (input) => {
    const out: number[] = [];
    let acc = 0;
    let bits = 0;

    for (const byte of input) {
      const value = BASE64_ALPHABET.indexOf(String.fromCharCode(byte));
      if (value === -1) {
        if (lenient) continue;
        break;
      }
      acc = (acc << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 0xff);
      }
    }

    return Uint8Array.from(out);
  };
}

const hexEncode: ByteFn = (input) => toBytes([...input].map(hexByte).join(''));

const hexDecode: ByteFn = (input) => {
  const out: number[] = [];
  for (let i = 0; i + 1 < input.length; i += 2) {
    const pair = hexRun(input, i, 2);
    if (pair === -1) break;
    out.push(pair);
  }
  return Uint8Array.from(out);
};

/** Старший бит каждого байта — до чётности, до нечётности или в ноль. */
function parity(mode: 'even' | 'odd' | 'zero'): ByteFn {
  return (input) =>
    mapBytes(input, (byte) => {
      const seven = byte & 0x7f;
      if (mode === 'zero') return seven;
      let ones = 0;
      for (let bit = 0; bit < 7; bit++) ones += (seven >> bit) & 1;
      const even = ones % 2 === 0;
      const high = mode === 'even' ? !even : even;
      return high ? seven | 0x80 : seven;
    });
}

const TRANSFORMS: Record<string, ByteFn> = {
  lowercase,
  uppercase,
  trim: (input) => trimRight(trimLeft(input)),
  trimLeft,
  trimRight,
  compressWhitespace,
  removeWhitespace,
  removeNulls: (input) => keepBytes(input, (byte) => byte !== 0),
  replaceNulls: (input) => mapBytes(input, (byte) => (byte === 0 ? SPACE : byte)),

  urlDecode: urlDecode(false),
  urlDecodeUni: urlDecode(true),
  urlEncode,
  htmlEntityDecode,
  escapeSeqDecode: escapeDecode(false),
  jsDecode: escapeDecode(true),

  base64Encode,
  base64Decode: base64Decode(false),
  base64DecodeExt: base64Decode(true),
  hexEncode,
  hexDecode,

  replaceComments,
  removeComments,
  removeCommentsChar,
  cmdLine,

  normalizePath: normalizePath(false),
  normalisePath: normalizePath(false),
  normalizePathWin: normalizePath(true),
  normalisePathWin: normalizePath(true),

  parityEven7bit: parity('even'),
  parityOdd7bit: parity('odd'),
  parityZero7bit: parity('zero'),

  length: (input) => toBytes(String(input.length)),
};

/**
 * Преобразования, результат которых мы намеренно не показываем.
 *
 * У хешей он зависит от сборки движка, а `cssDecode` и `utf8toUnicode`
 * определены только своими исходниками. Пустая клетка честнее похожего
 * значения: по ней видно, что здесь предпросмотру верить нельзя.
 */
export const OPAQUE_TRANSFORMS = new Set(['md5', 'sha1', 'cssDecode', 'utf8toUnicode']);

/* ------------------------------------------------------------------ */
/* Конвейер                                                            */
/* ------------------------------------------------------------------ */

export interface PipelineStep {
  /** Имя преобразования, как оно записано в правиле. */
  name: string;
  /** Значение после шага; `null` — показывать нечего. */
  value: Uint8Array | null;
  /** Само преобразование воспроизводится. */
  reproducible: boolean;
  /** Шаг ничего не изменил — обычно значит, что он здесь лишний. */
  unchanged: boolean;
}

/**
 * Прогоняет значение через конвейер, возвращая по шагу на каждое `t:`.
 *
 * `t:none` возвращает исходное значение, а не «ничего не делает»: он
 * сбрасывает всё, что накопилось до него, — ровно поэтому он и обязан
 * стоять первым.
 */
export function runPipeline(input: Uint8Array, transforms: string[]): PipelineStep[] {
  const steps: PipelineStep[] = [];
  let current: Uint8Array | null = input;

  for (const name of transforms) {
    const apply = TRANSFORMS[name];
    const reproducible = name === 'none' || apply !== undefined;

    if (!reproducible || current === null) {
      steps.push({ name, value: null, reproducible, unchanged: false });
      current = null;
      continue;
    }

    const next: Uint8Array = name === 'none' ? input : apply(current);
    steps.push({
      name,
      value: next,
      reproducible: true,
      unchanged: sameBytes(current, next),
    });
    current = next;
  }

  return steps;
}

/** Значение на выходе всего конвейера; `null` — какой-то шаг не показан. */
export function pipelineResult(input: Uint8Array, transforms: string[]): Uint8Array | null {
  const steps = runPipeline(input, transforms);
  if (steps.length === 0) return input;
  return steps[steps.length - 1].value;
}
