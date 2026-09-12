/**
 * Проверка оператора на конкретном значении.
 *
 * Продолжение `transform.ts`: конвейер показывает, во что превратился вход,
 * а здесь видно, что из этого следует — сработает правило на таком значении
 * или нет. Именно этот ответ человек и держит в голове, когда пишет правило,
 * и именно в нём чаще всего ошибается.
 *
 * Отвечаем не за все операторы. `@ipMatch`, `@rbl`, `@geoLookup` и прочие
 * зависят от сети, файлов и баз, которых у редактора нет; для них ответ —
 * «не знаем». Догадка здесь была бы хуже молчания: увидев зелёное
 * «совпадает» там, где движок скажет обратное, человек перестанет
 * проверять вообще.
 */

import { translateRegex } from './regex';
import { operatorMeta, splitOperatorArgument } from './semantics';
import { toBytes, toLatin1 } from './transform';
import type { VisualOperator } from './model';

/** Результат проверки; `unknown` — этот оператор мы здесь не считаем. */
export type MatchVerdict = 'match' | 'noMatch' | 'unknown';

/** Значение содержит макрос — что в нём окажется, известно только движку. */
function hasMacro(value: string): boolean {
  return /%\{[^}]*\}/.test(value);
}

/**
 * Число, которое ModSecurity увидит в значении.
 *
 * Нечисловой вход для числового оператора — не ошибка: движок читает
 * ведущие цифры, а если их нет, сравнивает ноль. Правило `@gt 5` на слове
 * «abc» не сработает, и предпросмотр должен показывать именно это.
 */
function asNumber(text: string): number {
  const digits = /^\s*[+-]?\d+/.exec(text);
  return digits === null ? 0 : Number(digits[0]);
}

/** Слово целиком: по краям совпадения нет ни буквы, ни цифры, ни `_`. */
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

/** Числовые сравнения — по одному предикату на оператор. */
const COMPARISONS: Record<string, (left: number, right: number) => boolean> = {
  eq: (left, right) => left === right,
  ge: (left, right) => left >= right,
  gt: (left, right) => left > right,
  le: (left, right) => left <= right,
  lt: (left, right) => left < right,
};

/**
 * Регулярное выражение правила как выражение JavaScript.
 *
 * Сравнение идёт по байтам, поэтому и шаблон переводится в байты: PCRE в
 * ModSecurity работает так же, и `\w` там тоже про байты, а не про буквы
 * Unicode. Разницу между PCRE и `RegExp` — встроенные флаги, сверхжадные
 * кванторы и прочее — снимает `translateRegex`.
 */
function toRegExp(pattern: string): RegExp | null {
  const translated = translateRegex(pattern);
  if (translated.unsupported !== null) return null;
  try {
    return new RegExp(toLatin1(toBytes(translated.source)), translated.flags);
  } catch {
    return null;
  }
}

/** Сравнение без учёта отрицания. */
function verdictOf(operator: VisualOperator, value: Uint8Array): MatchVerdict {
  const { name } = operator;
  const argument = operator.argument.trim();

  if (hasMacro(operator.argument)) return 'unknown';

  // Пустое поле значения — это «ещё не заполнено», а не «сравнить с
  // пустотой». Формально пустой шаблон подходит ко всему, но показывать
  // «совпадает» недописанному условию значит поздравлять с несделанным.
  if (argument === '' && operatorMeta(name)?.arg !== 'none') return 'unknown';

  const input = toLatin1(value);
  // Аргумент приходит из текста правила: чтобы сравнивать его со значением
  // байт в байт, он проходит ту же дорогу — текст, байты UTF-8, байты.
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
    // Здесь наоборот: проверяется, что значение целиком входит в список.
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

/** Сработает ли проверка на этом значении. */
export function matchValue(operator: VisualOperator, value: Uint8Array): MatchVerdict {
  const verdict = verdictOf(operator, value);
  if (verdict === 'unknown' || !operator.negated) return verdict;
  return verdict === 'match' ? 'noMatch' : 'match';
}
