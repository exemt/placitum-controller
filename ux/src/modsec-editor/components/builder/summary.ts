import { actionsToList, emitOperator } from '../../modsec/emit';
import { targetsToVariables } from '../../modsec/model';
import { serializeActions, serializeVariables } from '../../modsec/serialize';
import type { RuleAction } from '../../modsec/types';
import type { VisualActions, VisualCondition } from '../../modsec/model';

const ARGUMENT_LIMIT = 40;

const SUMMARY_LIMIT = 120;

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

export function conditionSummary(condition: VisualCondition): string {
  const where = serializeVariables(targetsToVariables(condition.targets));
  const what = emitOperator({
    ...condition.operator,
    argument: clip(condition.operator.argument, ARGUMENT_LIMIT),
  });
  return `${where} ${what}`.trim();
}

export function actionSummary(actions: VisualActions): string {
  const parts = actions.setvar.map((value) => `setvar:${value}`);
  if (parts.length === 0 && actions.msg !== '') parts.push(`msg:'${actions.msg}'`);
  return clip(parts.join(','), SUMMARY_LIMIT);
}

function ruleActionList(actions: VisualActions): RuleAction[] {
  return actionsToList(actions, [], false).filter((item) => item.name !== 'id');
}

export function ruleActionCount(actions: VisualActions): number {
  return ruleActionList(actions).length;
}

export function ruleActionSummary(actions: VisualActions): string {
  return clip(serializeActions(ruleActionList(actions)), SUMMARY_LIMIT);
}
