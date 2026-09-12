/**
 * Форматтер текста ModSecurity — «разложить правило по строкам».
 *
 * В одну строку правило помещается редко: список действий разрастается до
 * сотни символов, и понять, что там происходит, можно только вычитывая его
 * по запятым. Форматтер раскладывает правило в тот вид, в котором его пишут
 * в OWASP CRS: шапка `SecRule VARS "OP"`, перенос `\`, и дальше по одному
 * действию в строке.
 *
 * Ключевое отличие от `serialize.ts`: тот приводит правило к каноническому
 * однострочному виду для машины, этот — к читаемому для человека.
 *
 * Форматирование ничего не переставляет и не выкидывает: порядок действий
 * сохраняется как есть (для `t:` он вообще семантически значим), меняются
 * только переносы строк. Поэтому `parse(format(doc))` даёт ту же модель, а
 * повторное применение уже ничего не меняет.
 */

import { serializeAction, serializeOperator, serializeVariableList } from './serialize';
import type {
  ParsedDocument,
  ParsedStatement,
  RuleAction,
  SecActionStatement,
  SecRuleStatement,
  StatementKind,
} from './types';

/** Отступ строки продолжения — как в примерах OWASP CRS. */
const INDENT = '    ';

/**
 * Приводит в порядок утверждение, которое форматтер не перегенерирует.
 *
 * Директивы вроде `SecDefaultAction "phase:2,pass"` разобраны со снятыми
 * кавычками, и собрать их обратно из полей нельзя без потери смысла — такие
 * строки выводятся из исходника, у них лишь подчищаются отступы.
 */
function tidyRaw(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimStart();
}

/** Экранирует двойные кавычки: содержимое попадёт внутрь `"…"`. */
function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * Раскладывает действия по строкам — по одному на строку.
 *
 * Исключение — трансформации: `t:none,t:lowercase,t:urlDecodeUni` это один
 * конвейер, и читается он лучше одной строкой, чем тремя.
 */
function actionLines(actions: RuleAction[]): string[] {
  const lines: string[] = [];
  let previousWasTransform = false;

  for (const action of actions) {
    const text = escapeQuotes(serializeAction(action));
    const isTransform = action.name === 't';

    if (isTransform && previousWasTransform) {
      lines[lines.length - 1] += `,${text}`;
    } else {
      lines.push(text);
    }
    previousWasTransform = isTransform;
  }

  return lines;
}

/**
 * Собирает блок действий: строки в отступе, каждая кроме последней
 * заканчивается на `,\`, весь блок обёрнут в двойные кавычки.
 */
function actionBlock(actions: RuleAction[]): string[] {
  const lines = actionLines(actions);
  return lines.map((text, index) => {
    const open = index === 0 ? '"' : '';
    const close = index === lines.length - 1 ? '"' : ',\\';
    return `${INDENT}${open}${text}${close}`;
  });
}

function formatSecRule(statement: SecRuleStatement): string {
  // Правило без целей разобрано частично — перегенерировать его нечем.
  if (statement.variables.length === 0) return tidyRaw(statement.raw);

  const variables = serializeVariableList(statement.variables);
  const operator = escapeQuotes(serializeOperator(statement.operator));
  const head = `SecRule ${variables} "${operator}"`;

  if (statement.actions.length === 0) return head;
  return [`${head} \\`, ...actionBlock(statement.actions)].join('\n');
}

function formatSecAction(statement: SecActionStatement): string {
  if (statement.actions.length === 0) return tidyRaw(statement.raw);
  return ['SecAction \\', ...actionBlock(statement.actions)].join('\n');
}

/** Форматирует одно утверждение (может вернуть несколько строк). */
export function formatStatement(statement: ParsedStatement): string {
  switch (statement.kind) {
    case 'SecRule':
      return formatSecRule(statement);
    case 'SecAction':
      return formatSecAction(statement);
    default:
      return tidyRaw(statement.raw);
  }
}

/**
 * Нужна ли пустая строка перед очередным утверждением.
 *
 * Пустая строка отделяет один смысловой блок от другого, поэтому внутри
 * блока её быть не должно: комментарий-описание приклеен к своему правилу,
 * звенья цепочки (`chain`) — друг к другу, соседние директивы — между собой.
 */
function needsSeparator(
  previous: StatementKind | null,
  current: ParsedStatement,
  chainOpen: boolean,
): boolean {
  if (previous === null) return false;

  switch (current.kind) {
    case 'comment':
      return previous !== 'comment';
    case 'SecRule':
    case 'SecAction':
      return previous !== 'comment' && !chainOpen;
    default:
      return previous === 'SecRule' || previous === 'SecAction';
  }
}

/**
 * Форматирует весь документ.
 *
 * Пустые строки автора сохраняются (схлопываясь до одной), недостающие
 * разделители между блоками добавляются. Файл заканчивается переводом
 * строки — как принято в конфигах.
 */
export function formatDocument(doc: ParsedDocument): string {
  const blocks: string[] = [];
  let previousKind: StatementKind | null = null;
  let chainOpen = false;
  let blankPending = false;

  for (const statement of doc.statements) {
    if (statement.kind === 'blank') {
      // Пустые строки в начале файла отбрасываем, остальные запоминаем.
      blankPending = blocks.length > 0;
      continue;
    }

    if (blankPending || needsSeparator(previousKind, statement, chainOpen)) {
      if (blocks.length > 0) blocks.push('');
    }
    blankPending = false;

    blocks.push(formatStatement(statement));

    if (statement.kind === 'SecRule') chainOpen = statement.chained;
    else if (statement.kind !== 'comment') chainOpen = false;

    previousKind = statement.kind;
  }

  return blocks.length > 0 ? `${blocks.join('\n')}\n` : '';
}
