import { DIRECTIVES } from '../components/syntax/modsecKeywords';
import { isDisruptive, isHeadOnlyAction } from './semantics';
import { Diagnostics } from './diagnostics';
import { checkConditionStructure, checkDirective } from './checks';
import { readDirective } from './directives';
import { readExclusions } from './exclusions';
import { inspectDocument } from './inspect';
import { emptyActions, groupTargets } from './model';
import { unfold } from './parser';
import { LONE_FILE, fileMark } from './workspace';
import type { Diagnostic } from './diagnostics';
import type {
  VisualActions,
  VisualBlock,
  VisualCondition,
  VisualModel,
  VisualRule,
} from './model';
import type {
  ParsedDocument,
  ParsedStatement,
  RuleAction,
  SecRuleStatement,
} from './types';

export type {
  Diagnostic,
  DiagnosticAnchor,
  DiagnosticCode,
  DiagnosticSeverity,
  DiagnosticTopic,
} from './diagnostics';

export interface CompileResult {
  ok: boolean;
  model: VisualModel | null;
  blocks: VisualBlock[];
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
  adviceCount: number;
}

function hasUnbalancedQuotes(raw: string): boolean {
  let count = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\') {
      i++;
      continue;
    }
    if (raw[i] === '"') count++;
  }
  return count % 2 === 1;
}

const KNOWN_DIRECTIVES = new Set(DIRECTIVES.map((name) => name.toLowerCase()));

export function toVisualActions(actions: RuleAction[]): VisualActions {
  const out = emptyActions();

  for (const a of actions) {
    switch (a.name) {
      case 'id':
        out.id = a.value ?? '';
        break;
      case 'phase':
        out.phase = a.value ?? '';
        break;
      case 'status':
        out.status = a.value ?? '';
        break;
      case 'msg':
        out.msg = a.value ?? '';
        break;
      case 'logdata':
        out.logdata = a.value ?? '';
        break;
      case 'severity':
        out.severity = a.value ?? '';
        break;
      case 'ver':
        out.ver = a.value ?? '';
        break;
      case 'rev':
        out.rev = a.value ?? '';
        break;
      case 'maturity':
        out.maturity = a.value ?? '';
        break;
      case 'accuracy':
        out.accuracy = a.value ?? '';
        break;
      case 'tag':
        if (a.value) out.tags.push(a.value);
        break;
      case 'setvar':
        if (a.value) out.setvar.push(a.value);
        break;
      case 'capture':
        out.capture = true;
        break;
      case 'log':
        out.log = true;
        break;
      case 'nolog':
        out.log = false;
        break;
      case 'auditlog':
        out.auditlog = true;
        break;
      case 'noauditlog':
        out.auditlog = false;
        break;
      case 't':
      case 'chain':
        break;
      default:
        if (isDisruptive(a.name)) {
          out.disruptive = a.name;
          out.disruptiveValue = a.value ?? '';
        } else out.extra.push(a);
    }
  }

  return out;
}

function transformsOf(actions: RuleAction[]): string[] {
  return actions
    .filter((a) => a.name === 't' && a.value !== undefined)
    .map((a) => a.value as string);
}

function leadingComments(
  statements: ParsedStatement[],
  index: number,
): { startIndex: number; comments: string[] } {
  let start = index;
  const comments: string[] = [];
  for (let i = index - 1; i >= 0 && statements[i].kind === 'comment'; i--) {
    comments.unshift((statements[i] as { text: string }).text);
    start = i;
  }
  return { startIndex: start, comments };
}

function toCondition(
  rule: SecRuleStatement,
  statementIndex: number,
  comments: string[] = [],
  own = false,
): VisualCondition {
  return {
    key: `cond-${statementIndex}`,
    statementIndex,
    comments,
    targets: groupTargets(rule.variables),
    transforms: transformsOf(rule.actions),
    extra: own ? rule.actions.filter((a) => a.name !== 't' && a.name !== 'chain') : [],
    operator: {
      name: rule.operator.name,
      negated: rule.operator.negated,
      argument: rule.operator.argument,
    },
  };
}

export function compileDocument(doc: ParsedDocument | null, file = LONE_FILE): CompileResult {
  const diag = new Diagnostics().inFile(fileMark(file));

  if (doc === null) {
    diag.report('notParsed');
    return {
      ok: false,
      model: null,
      blocks: [],
      diagnostics: diag.items,
      errorCount: 1,
      warningCount: 0,
      adviceCount: 0,
    };
  }

  const { statements } = doc;
  const blocks: VisualBlock[] = [];
  const seenIds = new Map<string, number>();

  let i = 0;
  while (i < statements.length) {
    const statement = statements[i];

    if (statement.kind === 'comment' || statement.kind === 'blank') {
      i++;
      continue;
    }

    const line = statement.span.startLine;
    diag.at(line);
    if (hasUnbalancedQuotes(statement.raw)) diag.report('unbalancedQuotes');

    const { startIndex, comments } = leadingComments(statements, i);

    if (statement.kind === 'SecRule') {
      const conditions: VisualCondition[] = [toCondition(statement, i)];
      const headIndex = i;
      let tailIndex = i;
      let current: SecRuleStatement = statement;

      while (current.chained) {
        let next = tailIndex + 1;
        while (
          next < statements.length &&
          (statements[next].kind === 'comment' || statements[next].kind === 'blank')
        ) {
          next++;
        }
        const link = statements[next];
        if (link === undefined || link.kind !== 'SecRule') {
          diag.at(current.span.startLine).report('danglingChain');
          break;
        }
        conditions.push(
          toCondition(link, next, leadingComments(statements, next).comments, true),
        );

        for (const a of link.actions) {
          if (a.name !== 't' && a.name !== 'chain' && isHeadOnlyAction(a.name)) {
            diag.at(link.span.startLine).report('chainLinkHeadAction', { name: a.name });
          }
        }

        tailIndex = next;
        current = link;
      }

      const actions = toVisualActions(statement.actions);

      diag.at(line);
      if (actions.id === '') {
        diag.report('missingId');
      } else {
        if (seenIds.has(actions.id)) diag.report('duplicateId', { id: actions.id });
        seenIds.set(actions.id, line);
      }

      const rule: VisualRule = {
        key: `rule-${headIndex}`,
        startIndex,
        headIndex,
        tailIndex,
        comments,
        conditions,
        actions,
      };
      blocks.push({ kind: 'rule', key: rule.key, rule });

      conditions.forEach((condition, position) => {
        const chained = conditions.length > 1 ? { condition: position + 1 } : {};
        diag.at(statements[condition.statementIndex]?.span.startLine ?? line, {
          ruleKey: rule.key,
          ...chained,
        });
        checkConditionStructure(condition, diag);
      });

      i = tailIndex + 1;
      continue;
    }

    if (statement.kind === 'SecAction') {
      const actions = toVisualActions(statement.actions);
      if (actions.id === '') {
        diag.report('missingId');
      } else if (seenIds.has(actions.id)) {
        diag.report('duplicateId', { id: actions.id });
      } else {
        seenIds.set(actions.id, line);
      }
      blocks.push({
        kind: 'action',
        key: `action-${i}`,
        startIndex,
        statementIndex: i,
        comments,
        actions,
      });
      i++;
      continue;
    }

    if (statement.kind === 'SecMarker') {
      blocks.push({
        kind: 'marker',
        key: `marker-${i}`,
        startIndex,
        statementIndex: i,
        comments,
        text: unfold(statement.raw).trim(),
        label: statement.label,
      });
      i++;
      continue;
    }

    if (!KNOWN_DIRECTIVES.has(statement.name.toLowerCase())) {
      diag.report('unknownDirective', { name: statement.name });
    }
    checkDirective(statement, diag);
    blocks.push({
      kind: 'directive',
      key: `directive-${i}`,
      startIndex,
      statementIndex: i,
      comments,
      text: unfold(statement.raw).trim(),
      name: statement.name,
      args: statement.args,
      form: readDirective(statement),
    });
    i++;
  }

  for (const directive of readExclusions(statements)) {
    if (directive.source !== 'directive') continue;
    diag.at(directive.line);
    if (directive.incomplete) diag.report('exclusionNoTarget', { name: directive.name });
    for (const bad of directive.badIds) {
      diag.report('exclusionBadId', { name: directive.name, value: bad });
    }
  }

  const errorCount = diag.count('error');
  const ok = errorCount === 0;

  return {
    ok,
    model: ok ? { blocks } : null,
    blocks,
    diagnostics: byLine(diag.items),
    errorCount,
    warningCount: diag.count('warning'),
    adviceCount: diag.count('advice'),
  };
}

export function byLine(
  diagnostics: readonly Diagnostic[],
  order?: ReadonlyMap<string, number>,
): Diagnostic[] {
  const place = (file?: string) => (order === undefined ? 0 : (order.get(file ?? '') ?? 0));
  return [...diagnostics].sort(
    (a, b) => place(a.file) - place(b.file) || (a.line ?? 0) - (b.line ?? 0),
  );
}

export function analyzeDocument(doc: ParsedDocument | null): CompileResult {
  const compiled = compileDocument(doc);
  if (doc === null) return compiled;

  const semantic = inspectDocument(compiled.blocks, doc.statements);
  const diagnostics = byLine([...compiled.diagnostics, ...semantic]);
  const count = (severity: Diagnostic['severity']) =>
    diagnostics.filter((d) => d.severity === severity).length;

  return {
    ...compiled,
    diagnostics,
    errorCount: count('error'),
    warningCount: count('warning'),
    adviceCount: count('advice'),
  };
}
