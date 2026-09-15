import { encodeQuoted } from './quoting';
import type {
  ParsedDocument,
  ParsedStatement,
  RuleAction,
  RuleOperator,
  RuleVariable,
} from './types';

export function dquote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

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

export function serializeVariableList(vars: RuleVariable[]): string {
  return dquoteArgument(serializeVariables(vars));
}

export function serializeOperator(op: RuleOperator): string {
  const neg = op.negated ? '!' : '';
  if (op.implicit) return `${neg}${op.argument}`;
  const arg = op.argument ? ` ${op.argument}` : '';
  return `${neg}@${op.name}${arg}`;
}

export function serializeAction(a: RuleAction): string {
  if (a.value === undefined) return a.name;
  const encoded = encodeQuoted(a.value);
  const value = a.quoted && encoded === a.value ? `'${a.value}'` : encoded;
  return `${a.name}:${value}`;
}

export function serializeActions(actions: RuleAction[]): string {
  return actions.map(serializeAction).join(',');
}

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

export function replaceStatementInSource(
  doc: ParsedDocument,
  index: number,
  next: ParsedStatement,
): string {
  const statements = doc.statements.map((s, i) => (i === index ? next : s));
  return serializeDocument({ ...doc, statements }, new Set([index]));
}
