/**
 * Толерантный парсер конфигурации ModSecurity.
 *
 * Раскладывает текст правил в объектную модель из `types.ts`. Работает в
 * несколько проходов:
 *  1. Физические строки склеиваются в «логические» по завершающему `\`.
 *  2. Каждая логическая строка классифицируется (комментарий / пустая /
 *     директива) и разбирается на аргументы с учётом кавычек.
 *  3. Для `SecRule` / `SecAction` аргументы дополнительно раскладываются на
 *     переменные, оператор и действия.
 *
 * Парсер не бросает исключений на «плохом» вводе: неизвестные конструкции
 * сохраняются как обобщённые директивы, а отсутствующие части заполняются
 * разумными значениями по умолчанию.
 */

import { decodeQuoted } from './quoting';
import type {
  DirectiveStatement,
  ParsedDocument,
  ParsedStatement,
  RuleAction,
  RuleOperator,
  RuleVariable,
  SecActionStatement,
  SecMarkerStatement,
  SecRuleStatement,
  SourceSpan,
} from './types';

/** Логическая строка после склейки переносов `\`. */
interface LogicalLine {
  /** Текст для разбора: переносы заменены пробелом, `\` убраны. */
  text: string;
  /** Оригинальные физические строки, склеенные `\n`. */
  raw: string;
  span: SourceSpan;
}

/**
 * Снимает переносы `\`: физические строки утверждения — в одну.
 *
 * Нужна не только разбору. Директива в файле разложена переносами так, как
 * захотел автор, а править её в конструкторе приходится строкой — той самой,
 * которую читает ModSecurity. Правило склейки при этом обязано быть одно:
 * покажи мы строку иначе, чем разобрали, правка меняла бы не то, что видно.
 */
export function unfold(raw: string): string {
  return raw
    .split('\n')
    .map((line) => (hasTrailingBackslash(line) ? line.replace(/\\$/, ' ') : line))
    .join('');
}

/**
 * Склеивает физические строки в логические.
 * Строка, оканчивающаяся на нечётное число `\`, продолжается следующей.
 */
function toLogicalLines(source: string): LogicalLine[] {
  const physical = source.split('\n');
  const result: LogicalLine[] = [];

  let rawBuffer: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
    const raw = rawBuffer.join('\n');
    result.push({ text: unfold(raw), raw, span: { startLine, endLine } });
    rawBuffer = [];
  };

  physical.forEach((line, index) => {
    const lineNo = index + 1;
    if (rawBuffer.length === 0) startLine = lineNo;
    rawBuffer.push(line);

    if (!hasTrailingBackslash(line)) flush(lineNo);
  });

  // Хвост без закрывающей строки (файл закончился на `\`).
  if (rawBuffer.length > 0) flush(physical.length);

  return result;
}

/** true, если строку продолжает нечётное число завершающих обратных слэшей. */
function hasTrailingBackslash(line: string): boolean {
  const match = /\\+$/.exec(line);
  if (!match) return false;
  return match[0].length % 2 === 1;
}

/**
 * Разбивает строку директивы на аргументы.
 * Пробелы разделяют аргументы; двойные кавычки группируют (и снимаются),
 * поддерживается экранирование `\"` внутри кавычек.
 *
 * Пара `\\` проходит насквозь, но именно парой: иначе её второй слэш
 * съел бы следующую кавычку, и аргумент не закрылся бы там, где закрыт.
 * Разворачивать её в один слэш (как делает разбор конфигурации Apache)
 * нельзя: третья версия ModSecurity читает конфигурацию сама и оставляет
 * оба слэша, а текст правила в редакторе — источник правды, и показывать
 * в нём трактовку одной из версий значило бы менять чужой файл.
 */
function splitArgs(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let hasContent = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '\\' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '\\' && text[i + 1] === '\\') {
        current += '\\\\';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (/\s/.test(ch)) {
      if (hasContent) {
        args.push(current);
        current = '';
        hasContent = false;
      }
    } else {
      current += ch;
      hasContent = true;
    }
  }

  if (hasContent) args.push(current);
  return args;
}

/**
 * Делит строку по разделителю верхнего уровня, игнорируя разделители
 * внутри одинарных кавычек и внутри `%{...}` / `{...}`.
 */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let braceDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      current += ch;
      if (ch === '\\' && i + 1 < text.length) {
        current += text[i + 1];
        i++;
      } else if (ch === "'") {
        inQuotes = false;
      }
      continue;
    }

    if (ch === "'") {
      inQuotes = true;
      current += ch;
    } else if (ch === '{') {
      braceDepth++;
      current += ch;
    } else if (ch === '}') {
      if (braceDepth > 0) braceDepth--;
      current += ch;
    } else if (ch === separator && braceDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  parts.push(current);
  return parts;
}

/** Снимает обрамляющие одинарные кавычки вместе с экранированием. */
function unquote(raw: string): { value: string; quoted: boolean } {
  const value = decodeQuoted(raw);
  return { value, quoted: value !== raw };
}

/**
 * Разбирает список переменных `ARGS|!ARGS:token|&REQUEST_HEADERS:User-Agent`.
 *
 * Разделителей два: движок разбирает список тем же кодом, что и список
 * действий, поэтому терм обрывает и запятая. Значит `ARGS:a,b` — это две
 * цели, а не параметр с запятой внутри; параметр с запятой пишется только
 * в кавычках (`ARGS:'a,b'`), и их разбор обходит стороной.
 */
export function parseVariables(text: string): RuleVariable[] {
  return splitTopLevel(text, '|')
    .flatMap((chunk) => splitTopLevel(chunk, ','))
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((raw) => {
      let rest = raw;
      let exclusion = false;
      let count = false;

      if (rest.startsWith('!')) {
        exclusion = true;
        rest = rest.slice(1);
      }
      if (rest.startsWith('&')) {
        count = true;
        rest = rest.slice(1);
      }

      const colon = rest.indexOf(':');
      const name = colon === -1 ? rest : rest.slice(0, colon);
      const selector = colon === -1 ? undefined : decodeQuoted(rest.slice(colon + 1));

      return { raw, name, selector, count, exclusion };
    });
}

/** Разбирает содержимое кавычек оператора: `@rx foo`, `!@eq 0`, `bar`. */
export function parseOperator(text: string): RuleOperator {
  const raw = text;
  let rest = text.trim();
  let negated = false;

  if (rest.startsWith('!')) {
    negated = true;
    rest = rest.slice(1).trim();
  }

  if (rest.startsWith('@')) {
    const match = /^@(\S+)\s*([\s\S]*)$/.exec(rest);
    const name = match ? match[1] : rest.slice(1);
    const argument = match ? match[2] : '';
    return { raw, name, negated, argument, implicit: false };
  }

  // Оператор не указан — ModSecurity подразумевает @rx.
  return { raw, name: 'rx', negated, argument: rest, implicit: true };
}

/** Разбирает список действий `id:1,phase:2,deny,t:lowercase,msg:'hi'`. */
export function parseActions(text: string): RuleAction[] {
  return splitTopLevel(text, ',')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((raw) => {
      const colon = raw.indexOf(':');
      if (colon === -1) {
        return { raw, name: raw, quoted: false };
      }
      const name = raw.slice(0, colon).trim();
      const { value, quoted } = unquote(raw.slice(colon + 1).trim());
      return { raw, name, value, quoted };
    });
}

/** Возвращает значение первого действия с указанным именем. */
function actionValue(actions: RuleAction[], name: string): string | undefined {
  return actions.find((a) => a.name === name)?.value;
}

/** Разбирает `SecRule VARIABLES "OPERATOR" "ACTIONS"`. */
function parseSecRule(
  args: string[],
  base: { raw: string; span: SourceSpan },
): SecRuleStatement {
  const variables = parseVariables(args[1] ?? '');
  const operator = parseOperator(args[2] ?? '');
  const actions = args[3] !== undefined ? parseActions(args[3]) : [];

  return {
    kind: 'SecRule',
    ...base,
    variables,
    operator,
    actions,
    id: actionValue(actions, 'id'),
    phase: actionValue(actions, 'phase'),
    msg: actionValue(actions, 'msg'),
    chained: actions.some((a) => a.name === 'chain'),
  };
}

/** Разбирает `SecAction "ACTIONS"`. */
function parseSecAction(
  args: string[],
  base: { raw: string; span: SourceSpan },
): SecActionStatement {
  const actions = args[1] !== undefined ? parseActions(args[1]) : [];
  return {
    kind: 'SecAction',
    ...base,
    actions,
    id: actionValue(actions, 'id'),
    phase: actionValue(actions, 'phase'),
  };
}

/** Разбирает `SecMarker LABEL`. */
function parseSecMarker(
  args: string[],
  base: { raw: string; span: SourceSpan },
): SecMarkerStatement {
  return {
    kind: 'SecMarker',
    ...base,
    label: args[1] ?? '',
  };
}

/** Формирует обобщённую директиву из имени и оставшихся аргументов. */
function parseDirective(
  args: string[],
  base: { raw: string; span: SourceSpan },
): DirectiveStatement {
  return {
    kind: 'directive',
    ...base,
    name: args[0],
    args: args.slice(1),
  };
}

/** Разбирает одну логическую строку в утверждение модели. */
function parseLogicalLine(line: LogicalLine): ParsedStatement {
  const base = { raw: line.raw, span: line.span };
  const trimmed = line.text.trim();

  if (trimmed.length === 0) {
    return { kind: 'blank', ...base };
  }

  if (trimmed.startsWith('#')) {
    return {
      kind: 'comment',
      ...base,
      text: trimmed.replace(/^#\s?/, ''),
    };
  }

  const args = splitArgs(line.text);
  const directive = args[0];

  switch (directive) {
    case 'SecRule':
      return parseSecRule(args, base);
    case 'SecAction':
      return parseSecAction(args, base);
    case 'SecMarker':
      return parseSecMarker(args, base);
    default:
      return parseDirective(args, base);
  }
}

/**
 * Точка входа: разбирает исходный текст конфигурации ModSecurity
 * в {@link ParsedDocument}.
 */
export function parseModsec(source: string): ParsedDocument {
  const statements = toLogicalLines(source).map(parseLogicalLine);
  const rules = statements.filter(
    (s): s is SecRuleStatement => s.kind === 'SecRule',
  );
  return { statements, rules };
}
