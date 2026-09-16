import { dquote, serializeActions, serializeVariableList } from './serialize';
import { emptyActions, makeCondition, nextKey, targetsToVariables } from './model';
import type { VisualActions, VisualCondition, VisualRule } from './model';
import type { ParsedDocument, RuleAction } from './types';

const CONTINUATION_INDENT = '    ';

function action(name: string, value?: string): RuleAction {
  return { raw: '', name, value, quoted: false };
}

function quotedAction(name: string, value: string): RuleAction {
  return { raw: '', name, value, quoted: true };
}

export function emitOperator(operator: VisualCondition['operator']): string {
  const negation = operator.negated ? '!' : '';
  const argument = operator.argument === '' ? '' : ` ${operator.argument}`;
  return `${negation}@${operator.name}${argument}`;
}

export function actionsToList(
  actions: VisualActions,
  transforms: string[],
  chain: boolean,
): RuleAction[] {
  const list: RuleAction[] = [];

  if (actions.id !== '') list.push(action('id', actions.id));
  if (actions.phase !== '') list.push(action('phase', actions.phase));
  if (actions.disruptive !== '') {
    const target = actions.disruptiveValue;
    list.push(action(actions.disruptive, target === '' ? undefined : target));
  }
  if (actions.status !== '') list.push(action('status', actions.status));
  if (actions.capture) list.push(action('capture'));

  for (const t of transforms) list.push(action('t', t));

  if (actions.log === true) list.push(action('log'));
  if (actions.log === false) list.push(action('nolog'));
  if (actions.auditlog === true) list.push(action('auditlog'));
  if (actions.auditlog === false) list.push(action('noauditlog'));

  if (actions.msg !== '') list.push(quotedAction('msg', actions.msg));
  if (actions.logdata !== '') list.push(quotedAction('logdata', actions.logdata));
  if (actions.severity !== '') list.push(action('severity', actions.severity));
  if (actions.ver !== '') list.push(quotedAction('ver', actions.ver));
  if (actions.rev !== '') list.push(quotedAction('rev', actions.rev));
  if (actions.maturity !== '') list.push(quotedAction('maturity', actions.maturity));
  if (actions.accuracy !== '') list.push(quotedAction('accuracy', actions.accuracy));
  for (const tag of actions.tags) list.push(quotedAction('tag', tag));
  for (const setvar of actions.setvar) list.push(action('setvar', setvar));

  list.push(...actions.extra);

  if (chain) list.push(action('chain'));

  return list;
}

function emitSecRule(variables: string, operator: string, actions: string): string {
  const head = `SecRule ${variables} ${dquote(operator)}`;
  if (actions === '') return head;
  return `${head} \\\n${CONTINUATION_INDENT}${dquote(actions)}`;
}

export function emitCondition(
  condition: VisualCondition,
  headActions: VisualActions | null,
  chain: boolean,
): string {
  const variables = serializeVariableList(targetsToVariables(condition.targets));
  const operator = emitOperator(condition.operator);

  const list = headActions
    ? actionsToList(headActions, condition.transforms, chain)
    : [
        ...condition.transforms.map((t) => action('t', t)),
        ...condition.extra,
        ...(chain ? [action('chain')] : []),
      ];

  const comments = condition.comments.map((c) => (c === '' ? '#' : `# ${c}`));
  const directive = emitSecRule(variables, operator, serializeActions(list));
  return [...comments, directive].join('\n');
}

export function emitRule(rule: VisualRule): string[] {
  const lines: string[] = rule.comments.map((c) => (c === '' ? '#' : `# ${c}`));

  rule.conditions.forEach((condition, index) => {
    const isHead = index === 0;
    const isLast = index === rule.conditions.length - 1;
    lines.push(emitCondition(condition, isHead ? rule.actions : null, !isLast));
  });

  return lines;
}

export function emitActionBlock(actions: VisualActions, comments: string[]): string[] {
  const lines = comments.map((c) => (c === '' ? '#' : `# ${c}`));
  const list = actionsToList(actions, [], false);
  lines.push(`SecAction \\\n${CONTINUATION_INDENT}${dquote(serializeActions(list))}`);
  return lines;
}

export function replaceRange(
  doc: ParsedDocument,
  from: number,
  to: number,
  lines: string[],
): string {
  const out: string[] = [];

  doc.statements.forEach((statement, index) => {
    if (index === from) out.push(...lines);
    if (index >= from && index <= to) return;
    out.push(statement.raw);
  });

  if (from >= doc.statements.length) out.push(...lines);
  return out.join('\n');
}

export function insertAfter(doc: ParsedDocument, index: number, lines: string[]): string {
  const raw = doc.statements.map((s) => s.raw);
  return [...raw.slice(0, index + 1), ...lines, ...raw.slice(index + 1)].join('\n');
}

export function applyRule(doc: ParsedDocument, rule: VisualRule): string {
  return replaceRange(doc, rule.startIndex, rule.tailIndex, emitRule(rule));
}

export function removeRange(doc: ParsedDocument, from: number, to: number): string {
  return replaceRange(doc, from, to, []);
}

export function duplicateRule(doc: ParsedDocument, rule: VisualRule): string {
  const copy: VisualRule = {
    ...rule,
    key: nextKey('rule'),
    actions: { ...rule.actions, id: nextFreeId(doc) },
  };
  const lines = doc.statements.map((s) => s.raw);
  const tail = rule.tailIndex;

  return [
    ...lines.slice(0, tail + 1),
    '',
    ...emitRule(copy),
    ...lines.slice(tail + 1),
  ].join('\n');
}

export function swapRanges(
  doc: ParsedDocument,
  first: [number, number],
  second: [number, number],
): string {
  const [aFrom, aTo] = first;
  const [bFrom, bTo] = second;
  if (aFrom > bFrom) return swapRanges(doc, second, first);

  const lines = doc.statements.map((s) => s.raw);
  return [
    ...lines.slice(0, aFrom),
    ...lines.slice(bFrom, bTo + 1),
    ...lines.slice(aTo + 1, bFrom),
    ...lines.slice(aFrom, aTo + 1),
    ...lines.slice(bTo + 1),
  ].join('\n');
}

export function nextFreeId(doc: ParsedDocument): string {
  let max = 999;
  for (const statement of doc.statements) {
    if (statement.kind !== 'SecRule' && statement.kind !== 'SecAction') continue;
    const value = statement.actions.find((a) => a.name === 'id')?.value;
    const parsed = value !== undefined ? Number.parseInt(value, 10) : Number.NaN;
    if (!Number.isNaN(parsed) && parsed > max) max = parsed;
  }
  return String(max + 1);
}

export function makeRule(id: string): VisualRule {
  return {
    key: nextKey('rule'),
    startIndex: -1,
    headIndex: -1,
    tailIndex: -1,
    comments: [],
    conditions: [makeCondition()],
    actions: { ...emptyActions(), id, phase: '2', disruptive: 'deny', status: '403' },
  };
}

export function makeAction(id: string): VisualActions {
  return { ...emptyActions(), id, phase: '1', disruptive: 'pass', log: false };
}

function appendBlock(doc: ParsedDocument, lines: string[]): string {
  const raw = doc.statements.map((s) => s.raw);
  while (raw.length > 0 && raw[raw.length - 1].trim() === '') raw.pop();

  if (raw.length > 0) raw.push('');
  raw.push(...lines, '');
  return raw.join('\n');
}

export function appendRule(doc: ParsedDocument): string {
  return appendBlock(doc, emitRule(makeRule(nextFreeId(doc))));
}

export function appendAction(doc: ParsedDocument): string {
  return appendBlock(doc, emitActionBlock(makeAction(nextFreeId(doc)), []));
}

const NEW_MARKER_LABEL = 'MARKER';

export function nextFreeLabel(doc: ParsedDocument): string {
  const used = new Set<string>();
  for (const statement of doc.statements) {
    if (statement.kind === 'SecMarker') used.add(statement.label);
  }

  if (!used.has(NEW_MARKER_LABEL)) return NEW_MARKER_LABEL;
  let n = 2;
  while (used.has(`${NEW_MARKER_LABEL}-${n}`)) n += 1;
  return `${NEW_MARKER_LABEL}-${n}`;
}

export function appendMarker(doc: ParsedDocument): string {
  return appendBlock(doc, [`SecMarker ${nextFreeLabel(doc)}`]);
}

export function appendDirective(doc: ParsedDocument, line: string): string {
  return appendBlock(doc, [line]);
}
