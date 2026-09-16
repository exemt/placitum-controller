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

export interface RegexTranslation {
  source: string;
  flags: string;
  rewrites: RegexRewrite[];
  unsupported: string | null;
}

export interface RegexReview {
  regex: RegExp | null;
  unsupported: string | null;
  reason: string | null;
  detail: string | null;
  rewrites: RegexRewrite[];
}

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

const SHORTHANDS: Record<string, string> = {
  h: '[ \\t]',
  H: '[^ \\t]',
  R: '(?:\\r\\n|[\\n\\x0b\\f\\r\\x85\\u2028\\u2029])',
};

const ANCHORS: Record<string, string> = {
  A: '^',
  z: '$',
  Z: '(?=\\n?$)',
};

const UNSUPPORTED_ESCAPES = new Set(['K', 'G', 'C', 'X']);

const HEAD = 80;

function escapeLiteral(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

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
      if (!'ims'.includes(letter)) continue;
      if (on) flags += flags.includes(letter) ? '' : letter;
      else flags = flags.replace(letter, '');
    }
  };

  const readQuantifierSuffix = () => {
    if (pattern[i] === '?') {
      out += '?';
      i += 1;
      return;
    }
    if (pattern[i] === '+') {
      i += 1;
      rewrites.add('possessive');
    }
  };

  while (i < pattern.length) {
    const char = pattern[i];

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

const ENGINE_MESSAGE = /^Invalid regular expression: \/[\s\S]*\/[a-z]*: ([\s\S]+)$/;

export function regexReason(message: string): string {
  const parsed = ENGINE_MESSAGE.exec(message);
  return parsed === null ? message : parsed[1];
}

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
    try {
      const regex = new RegExp(pattern);
      return { regex, unsupported: null, reason: null, detail: null, rewrites: [] };
    } catch {
      const detail = error instanceof Error ? error.message : String(error);
      return { regex: null, unsupported: null, reason: regexReason(detail), detail, rewrites };
    }
  }
}
