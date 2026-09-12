/**
 * Смысловой проход по собранной модели.
 *
 * Отделён от компиляции по двум причинам. Первая — порядок: каждой проверке
 * здесь нужно то, чего в момент чтения очередной строки ещё нет, — контекст
 * всего набора, готовые условия правила и то, какие правила уже встречались
 * выше. Вторая — цена: проход стоит примерно как сама компиляция, но, в
 * отличие от неё, ни на что не влияет немедленно. Ошибок он не выдаёт вовсе,
 * поэтому ни доступность визуальной вкладки, ни модель конструктора его
 * результата не ждут — а значит, его можно вести по частям и в паузах.
 *
 * Идёт он по набору файлов, а не по одному: метка для `skipAfter` бывает в
 * соседнем файле, `SecRuleEngine` — в настроечном, а номер правила занят
 * ровно один раз на всю конфигурацию. Считать это по одному файлу значило бы
 * ругаться на то, что в наборе как раз в порядке.
 *
 * Отсюда две формы одного и того же: {@link inspectDocument} для тех, кому
 * нужен готовый список, и {@link inspectSlices} для того, кто отдаёт проходу
 * по несколько миллисекунд за раз. Вторая — источник, первая — вычерпывание
 * второй, так что разойтись им негде.
 */

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

/** Значение директивы-переключателя: `On` — да, `Off` — нет. */
function toggle(args: string[]): boolean | null {
  const value = args[0]?.toLowerCase();
  if (value === 'on') return true;
  if (value === 'off') return false;
  return null;
}

/**
 * Собирает то, что о правилах известно только по остальному набору.
 *
 * Проход дешёвый и делается до основного: проверкам нужны и метки ниже по
 * файлу, и директивы выше, поэтому откладывать сбор до места использования
 * нельзя. Файлы читаются в порядке включения, и у переключателя побеждает
 * последний — так его читает и ModSecurity.
 */
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

/** Контекст одинокого документа — набор из одного файла. */
export function readDocumentContext(statements: ParsedStatement[]): DocumentContext {
  return readWorkspaceContext([loneUnit([], statements)]);
}

/**
 * Смысловой проход по частям: каждая выдача — замечания об одном правиле.
 *
 * Шаг — правило, а не заранее отмеренный кусок работы: проверки правила
 * делят между собой его контекст, и разрезать их посередине значило бы
 * собирать этот контекст дважды. Правил в наборе тысячи, так что дробить
 * мельче незачем — тот, кто ведёт проход, набирает столько шагов, сколько
 * влезает в его бюджет.
 *
 * Правила идут в порядке включения файлов: `skip:N` отсчитывает свои N по
 * конфигурации, а не по файлу, и одинаковый номер в двух файлах — та же
 * занятая цифра, что и дважды в одном.
 *
 * Последняя выдача — замечания об уровне набора: они опираются на то, что
 * стало известно по ходу прохода, и раньше конца появиться не могут.
 */
export function* inspectSlices(
  units: readonly WorkspaceUnit[],
  exclusions?: ExclusionIndex,
): Generator<Diagnostic[], void, void> {
  const diag = new Diagnostics();
  const context = readWorkspaceContext(units);

  /** Правила набора, считая `SecAction`: по ним отсчитывает `skip:N`. */
  const executable = units.flatMap((unit) =>
    unit.blocks
      .filter((block) => block.kind === 'rule' || block.kind === 'action')
      .map((block) => ({ unit, block })),
  );
  /** Первое правило с такой же проверкой — чтобы поймать копию. */
  const seenSignatures = new Map<string, string>();
  /** Номер правила → где он уже занят: по нему видно повтор через файлы. */
  const seenIds = new Map<string, { file: string; name: string; line?: number }>();

  /** Сколько замечаний уже отдано: остальное — новое с прошлой выдачи. */
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
      // «Условие 1» у правила без цепочки — лишнее уточнение.
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

    // Повтор номера внутри файла ловит компиляция — там он ошибка и гасит
    // конструктор. Через файлы её видно только здесь, и сказать о ней всё
    // равно надо: ModSecurity не загрузит конфигурацию, в которой номер
    // занят дважды, — а какой из двух файлов править, выбирает человек.
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
  // Индекс исключений собирает тот, кто ведёт проход: он же показывает по нему
  // отметку «выключено исключением» на карточке правила. Считать его заново
  // здесь пришлось бы только ради того, чтобы вызвать проверку.
  checkExclusions(exclusions ?? indexWorkspaceExclusions(units), diag);
  yield fresh();
}

/** Смысловой проход целиком — для тех, кому результат нужен сразу. */
export function inspectWorkspace(
  units: readonly WorkspaceUnit[],
  exclusions?: ExclusionIndex,
): Diagnostic[] {
  const all: Diagnostic[] = [];
  for (const slice of inspectSlices(units, exclusions)) all.push(...slice);
  return all;
}

/** Смысловой проход по одинокому документу. */
export function inspectDocument(
  blocks: VisualBlock[],
  statements: ParsedStatement[],
  exclusions?: ExclusionIndex,
): Diagnostic[] {
  return inspectWorkspace([loneUnit(blocks, statements)], exclusions);
}
