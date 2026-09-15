import { serializeAction, serializeOperator, serializeVariableList } from './serialize';
import type {
  ParsedDocument,
  ParsedStatement,
  RuleAction,
  SecActionStatement,
  SecRuleStatement,
  StatementKind,
} from './types';

const INDENT = '    ';

function tidyRaw(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimStart();
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

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

function actionBlock(actions: RuleAction[]): string[] {
  const lines = actionLines(actions);
  return lines.map((text, index) => {
    const open = index === 0 ? '"' : '';
    const close = index === lines.length - 1 ? '"' : ',\\';
    return `${INDENT}${open}${text}${close}`;
  });
}

function formatSecRule(statement: SecRuleStatement): string {
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

export function formatDocument(doc: ParsedDocument): string {
  const blocks: string[] = [];
  let previousKind: StatementKind | null = null;
  let chainOpen = false;
  let blankPending = false;

  for (const statement of doc.statements) {
    if (statement.kind === 'blank') {
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
