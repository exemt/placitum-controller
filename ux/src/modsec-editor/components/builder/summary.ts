/**
 * Однострочные выжимки для свёрнутых блоков конструктора.
 *
 * Свёрнутый блок не должен превращаться в закрытую дверь: по строке заголовка
 * человек решает, разворачивать его или пролистнуть. Поэтому выжимка пишется
 * в том же виде, что и текст правила, — её сверяют с файлом глазами.
 */

import { actionsToList, emitOperator } from '../../modsec/emit';
import { targetsToVariables } from '../../modsec/model';
import { serializeActions, serializeVariables } from '../../modsec/serialize';
import type { RuleAction } from '../../modsec/types';
import type { VisualActions, VisualCondition } from '../../modsec/model';

/**
 * Предел длины аргумента оператора в выжимке.
 *
 * Регулярное выражение бывает длиннее всей строки заголовка, и без обрезки
 * первое же условие съело бы место, отведённое остальным.
 */
const ARGUMENT_LIMIT = 40;

/**
 * Предел длины всей выжимки.
 *
 * Строка всё равно обрезается по краю заголовка, но в файле на тысячу блоков
 * лишние символы — это лишние килобайты в DOM за то, чего не видно.
 */
const SUMMARY_LIMIT = 120;

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** Выжимка одного условия: где смотрим и что ищем. */
export function conditionSummary(condition: VisualCondition): string {
  const where = serializeVariables(targetsToVariables(condition.targets));
  const what = emitOperator({
    ...condition.operator,
    argument: clip(condition.operator.argument, ARGUMENT_LIMIT),
  });
  return `${where} ${what}`.trim();
}

/**
 * Выжимка безусловного действия: что оно делает с состоянием.
 *
 * Условий у `SecAction` нет, и узнают его по тому, что он выставляет: файл
 * инициализации CRS — это страницы подряд идущих `setvar`, и различить их
 * можно только по именам переменных.
 */
export function actionSummary(actions: VisualActions): string {
  const parts = actions.setvar.map((value) => `setvar:${value}`);
  if (parts.length === 0 && actions.msg !== '') parts.push(`msg:'${actions.msg}'`);
  return clip(parts.join(','), SUMMARY_LIMIT);
}

/**
 * Реакция правила списком, каким она уйдёт в текст, без номера.
 *
 * Номер стоит в шапке карточки: повторять его в строке о реакции значит
 * тратить на него место дважды.
 */
function ruleActionList(actions: VisualActions): RuleAction[] {
  return actionsToList(actions, [], false).filter((item) => item.name !== 'id');
}

/** Сколько действий у правила — число для свёрнутого блока. */
export function ruleActionCount(actions: VisualActions): number {
  return ruleActionList(actions).length;
}

/** Выжимка реакции: тот же список, что и в тексте правила. */
export function ruleActionSummary(actions: VisualActions): string {
  return clip(serializeActions(ruleActionList(actions)), SUMMARY_LIMIT);
}
