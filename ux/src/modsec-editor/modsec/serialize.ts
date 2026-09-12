/**
 * Сериализатор объектной модели обратно в текст ModSecurity.
 *
 * Это «обратная сторона» парсера: нужна для no-code редактора, где
 * изменения нод должны отражаться в тексте правила. Сериализация
 * каноническая (без переносов `\`, единый стиль кавычек), но
 * семантически эквивалентна исходнику — `parseModsec(serialize(x))`
 * даёт ту же модель.
 *
 * На уровне документа неизменённые утверждения по умолчанию выводятся
 * из их исходного `raw` (чтобы сохранить форматирование комментариев и
 * не тронутых правил), а перечисленные в `regenerate` — перегенерируются
 * из полей.
 */

import { encodeQuoted } from './quoting';
import type {
  ParsedDocument,
  ParsedStatement,
  RuleAction,
  RuleOperator,
  RuleVariable,
} from './types';

/** Оборачивает строку в двойные кавычки, экранируя внутренние. */
export function dquote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Аргумент директивы, готовый к подстановке в строку.
 *
 * Строка директивы режется по пробелам, поэтому аргумент с пробелом внутри
 * без кавычек распался бы на два — и правило значило бы не то, что модель.
 */
export function dquoteArgument(value: string): string {
  return /[\s"]/.test(value) || value === '' ? dquote(value) : value;
}

export function serializeVariable(v: RuleVariable): string {
  const prefix = `${v.exclusion ? '!' : ''}${v.count ? '&' : ''}`;
  const selector = v.selector !== undefined ? `:${encodeQuoted(v.selector)}` : '';
  return `${prefix}${v.name}${selector}`;
}

export function serializeVariables(vars: RuleVariable[]): string {
  return vars.map(serializeVariable).join('|');
}

/** Список переменных как аргумент директивы — с кавычками, если нужны. */
export function serializeVariableList(vars: RuleVariable[]): string {
  return dquoteArgument(serializeVariables(vars));
}

/** Сериализует внутреннее содержимое кавычек оператора (без обёртки). */
export function serializeOperator(op: RuleOperator): string {
  const neg = op.negated ? '!' : '';
  if (op.implicit) return `${neg}${op.argument}`;
  const arg = op.argument ? ` ${op.argument}` : '';
  return `${neg}@${op.name}${arg}`;
}

export function serializeAction(a: RuleAction): string {
  if (a.value === undefined) return a.name;
  const encoded = encodeQuoted(a.value);
  // Кавычки, поставленные автором, сохраняются: без них `msg:текст` тоже
  // разберётся, но набор правил принято писать со значениями в кавычках.
  const value = a.quoted && encoded === a.value ? `'${a.value}'` : encoded;
  return `${a.name}:${value}`;
}

export function serializeActions(actions: RuleAction[]): string {
  return actions.map(serializeAction).join(',');
}

/** Сериализует одно утверждение в строку (канонический вид). */
export function serializeStatement(statement: ParsedStatement): string {
  switch (statement.kind) {
    case 'SecRule': {
      const vars = serializeVariableList(statement.variables);
      const op = dquote(serializeOperator(statement.operator));
      const acts =
        statement.actions.length > 0
          ? ` ${dquote(serializeActions(statement.actions))}`
          : '';
      return `SecRule ${vars} ${op}${acts}`;
    }
    case 'SecAction':
      return `SecAction ${dquote(serializeActions(statement.actions))}`;
    case 'SecMarker':
      return `SecMarker ${dquoteArgument(statement.label)}`;
    case 'directive':
      return [statement.name, ...statement.args.map(dquoteArgument)].join(' ');
    case 'comment':
      return statement.text.length > 0 ? `# ${statement.text}` : '#';
    case 'blank':
      return '';
  }
}

/**
 * Сериализует документ. Утверждения, чьи индексы попали в `regenerate`,
 * перегенерируются из модели; остальные выводятся из `raw`.
 * Если `regenerate` не передан — перегенерируются все.
 */
export function serializeDocument(
  doc: ParsedDocument,
  regenerate?: Set<number>,
): string {
  return doc.statements
    .map((s, i) =>
      regenerate === undefined || regenerate.has(i) ? serializeStatement(s) : s.raw,
    )
    .join('\n');
}

/**
 * Возвращает новый текст документа после замены одного утверждения.
 * Заменённое утверждение перегенерируется, остальные сохраняют `raw`.
 */
export function replaceStatementInSource(
  doc: ParsedDocument,
  index: number,
  next: ParsedStatement,
): string {
  const statements = doc.statements.map((s, i) => (i === index ? next : s));
  return serializeDocument({ ...doc, statements }, new Set([index]));
}
