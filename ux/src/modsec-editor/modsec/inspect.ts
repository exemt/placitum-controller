import { isDisruptive } from './semantics';
import { Diagnostics } from './diagnostics';
import {
  checkCondition,
  checkDocument,
  checkExclusions,
  checkRule,
  conditionSignature,
  emptyDocumentContext,
} from './checks';
import { indexWorkspaceExclusions } from './exclusions';
import { fileMark, loneUnit } from './workspace';
import type { DocumentContext } from './checks';
import type { Diagnostic } from './diagnostics';
import type { ExclusionIndex } from './exclusions';
import type { VisualBlock } from './model';
import type { ParsedStatement } from './types';
import type { WorkspaceUnit } from './workspace';

function toggle(args: string[]): boolean | null {
  const value = args[0]?.toLowerCase();
  if (value === 'on') return true;
  if (value === 'off') return false;
  return null;
}

export function readWorkspaceContext(units: readonly WorkspaceUnit[]): DocumentContext {
  const context = emptyDocumentContext();

  for (const unit of units) {
    for (const statement of unit.statements) {
      if (statement.kind === 'SecMarker') {
        context.markers.add(statement.label);
        continue;
      }

      if (statement.kind === 'directive') {
        const name = statement.name.toLowerCase();
        if (name === 'include') {
          context.hasIncludes = true;
        }
        if (name === 'secruleengine') {
          context.engine = statement.args[0] ?? '';
          context.engineFile = unit.id;
          context.engineLine = statement.span.startLine;
        }
        if (name === 'secrequestbodyaccess') {
          context.requestBodyAccess = toggle(statement.args);
        }
        if (name === 'secresponsebodyaccess') {
          context.responseBodyAccess = toggle(statement.args);
        }
        continue;
      }

      if (statement.kind !== 'SecRule' && statement.kind !== 'SecAction') continue;

      for (const action of statement.actions) {
        if (action.name === 'setvar') {
          const assigned = /^!?tx[.:]([\w-]+)/i.exec(action.value ?? '');
          if (assigned) context.transactionVars.add(assigned[1].toLowerCase());
        }
        if (action.name === 'ctl' && /^requestBodyProcessor=XML$/i.test(action.value ?? '')) {
          context.xmlProcessor = true;
        }
      }
    }
  }

  return context;
}

export function readDocumentContext(statements: ParsedStatement[]): DocumentContext {
  return readWorkspaceContext([loneUnit([], statements)]);
}

export function* inspectSlices(
  units: readonly WorkspaceUnit[],
  exclusions?: ExclusionIndex,
): Generator<Diagnostic[], void, void> {
  const diag = new Diagnostics();
  const context = readWorkspaceContext(units);

  const executable = units.flatMap((unit) =>
    unit.blocks
      .filter((block) => block.kind === 'rule' || block.kind === 'action')
      .map((block) => ({ unit, block })),
  );
  const seenSignatures = new Map<string, string>();
  const seenIds = new Map<string, { file: string; name: string; line?: number }>();

  let published = 0;
  const fresh = () => {
    const slice = diag.items.slice(published);
    published = diag.items.length;
    return slice;
  };

  for (let index = 0; index < executable.length; index++) {
    const { unit, block } = executable[index];
    const lineOf = (at: number) => unit.statements[at]?.span.startLine;
    const rulesAfter = executable.length - index - 1;
    const actions = block.kind === 'rule' ? block.rule.actions : block.actions;
    const conditions = block.kind === 'rule' ? block.rule.conditions : [];
    const headLine =
      block.kind === 'rule' ? lineOf(block.rule.headIndex) : lineOf(block.statementIndex);

    diag.inFile(fileMark(unit.id));

    if (isDisruptive(actions.disruptive) && actions.disruptive !== 'pass') {
      context.hasBlockingRule = true;
    }

    const conditionContext = { document: context, capture: actions.capture };
    conditions.forEach((condition, position) => {
      const chained = conditions.length > 1 ? { condition: position + 1 } : {};
      diag.at(lineOf(condition.statementIndex) ?? headLine, {
        ruleKey: block.key,
        ...chained,
      });
      checkCondition(condition, conditionContext, diag);
    });

    const signature = conditions.map(conditionSignature).join('&&');
    const twinId = conditions.length > 0 ? seenSignatures.get(signature) : undefined;
    if (conditions.length > 0 && twinId === undefined && actions.id !== '') {
      seenSignatures.set(signature, actions.id);
    }

    diag.at(headLine, { ruleKey: block.key });

    const twin = actions.id === '' ? undefined : seenIds.get(actions.id);
    if (actions.id !== '' && twin === undefined) {
      seenIds.set(actions.id, { file: unit.id, name: unit.name, line: headLine });
    } else if (twin !== undefined && twin.file !== unit.id) {
      diag.report('duplicateIdCrossFile', {
        id: actions.id,
        file: twin.name,
        line: String(twin.line ?? ''),
      });
    }

    checkRule(actions, conditions, { document: context, rulesAfter, twinId }, diag);

    yield fresh();
  }

  checkDocument(context, diag);
  checkExclusions(exclusions ?? indexWorkspaceExclusions(units), diag);
  yield fresh();
}

export function inspectWorkspace(
  units: readonly WorkspaceUnit[],
  exclusions?: ExclusionIndex,
): Diagnostic[] {
  const all: Diagnostic[] = [];
  for (const slice of inspectSlices(units, exclusions)) all.push(...slice);
  return all;
}

export function inspectDocument(
  blocks: VisualBlock[],
  statements: ParsedStatement[],
  exclusions?: ExclusionIndex,
): Diagnostic[] {
  return inspectWorkspace([loneUnit(blocks, statements)], exclusions);
}
