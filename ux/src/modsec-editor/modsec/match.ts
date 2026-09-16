import { translateRegex } from './regex';
import { operatorMeta, splitOperatorArgument } from './semantics';
import { toBytes, toLatin1 } from './transform';
import type { VisualOperator } from './model';

export type MatchVerdict = 'match' | 'noMatch' | 'unknown';

function hasMacro(value: string): boolean {
  return /%\{[^}]*\}/.test(value);
}

function asNumber(text: string): number {
  const digits = /^\s*[+-]?\d+/.exec(text);
  return digits === null ? 0 : Number(digits[0]);
}

function containsWord(haystack: string, needle: string): boolean {
  if (needle === '') return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const after = haystack[at + needle.length] ?? '';
    if (!/\w/.test(before) && !/\w/.test(after)) return true;
    from = at + 1;
  }
}

const COMPARISONS: Record<string, (left: number, right: number) => boolean> = {
  eq: (left, right) => left === right,
  ge: (left, right) => left >= right,
  gt: (left, right) => left > right,
  le: (left, right) => left <= right,
  lt: (left, right) => left < right,
};

function toRegExp(pattern: string): RegExp | null {
  const translated = translateRegex(pattern);
  if (translated.unsupported !== null) return null;
  try {
    return new RegExp(toLatin1(toBytes(translated.source)), translated.flags);
  } catch {
    return null;
  }
}

function verdictOf(operator: VisualOperator, value: Uint8Array): MatchVerdict {
  const { name } = operator;
  const argument = operator.argument.trim();

  if (hasMacro(operator.argument)) return 'unknown';

  if (argument === '' && operatorMeta(name)?.arg !== 'none') return 'unknown';

  const input = toLatin1(value);
  const expected = toLatin1(toBytes(argument));

  switch (name) {
    case 'streq':
      return input === expected ? 'match' : 'noMatch';
    case 'contains':
    case 'strmatch':
      return input.includes(expected) ? 'match' : 'noMatch';
    case 'beginsWith':
      return input.startsWith(expected) ? 'match' : 'noMatch';
    case 'endsWith':
      return input.endsWith(expected) ? 'match' : 'noMatch';
    case 'containsWord':
      return containsWord(input, expected) ? 'match' : 'noMatch';
    case 'within':
      return expected.includes(input) ? 'match' : 'noMatch';

    case 'pm': {
      const phrases = splitOperatorArgument(expected, ' ').map((p) => p.toLowerCase());
      const lower = input.toLowerCase();
      return phrases.some((phrase) => lower.includes(phrase)) ? 'match' : 'noMatch';
    }

    case 'rx': {
      const regex = toRegExp(operator.argument);
      if (regex === null) return 'unknown';
      return regex.test(input) ? 'match' : 'noMatch';
    }

    case 'eq':
    case 'ge':
    case 'gt':
    case 'le':
    case 'lt': {
      if (!/^[+-]?\d+(\.\d+)?$/.test(argument)) return 'unknown';
      return COMPARISONS[name](asNumber(input), Number(argument)) ? 'match' : 'noMatch';
    }

    case 'unconditionalMatch':
      return 'match';
    case 'noMatch':
      return 'noMatch';

    default:
      return 'unknown';
  }
}

export function matchValue(operator: VisualOperator, value: Uint8Array): MatchVerdict {
  const verdict = verdictOf(operator, value);
  if (verdict === 'unknown' || !operator.negated) return verdict;
  return verdict === 'match' ? 'noMatch' : 'match';
}
