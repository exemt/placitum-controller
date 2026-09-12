/**
 * Быстрые правки к диагностикам.
 *
 * Половина сообщений из `checks.ts` описывает механическую ошибку: аргумент
 * написан не в том регистре, шаг конвейера стоит не на своём месте, `@rx`
 * взят там, где хватило бы `@contains`. Читать такое сообщение и руками
 * повторять то, что в нём и так сказано, — работа, которую редактор должен
 * делать сам.
 *
 * Правка описана как чистое преобразование модели правила, а не как правка
 * текста: текст соберётся заново из модели, и правка не зависит ни от
 * форматирования исходника, ни от того, из какой вкладки её нажали.
 *
 * Правки здесь только однозначные. Там, где вариантов несколько — какую из
 * двух несовместимых проверок цепочки убрать, чем заменить `deny` — кнопки
 * нет: угадывать намерение автора правила дороже, чем не угадывать.
 */

import { targetsMinPhase } from './semantics';
import { targetSignature } from './checks';
import { selectorPattern } from './quoting';
import type { Diagnostic } from './diagnostics';
import type { VisualCondition, VisualRule } from './model';

/**
 * Что именно сделает кнопка. Ключ перевода — `fix.<kind>`.
 *
 * Вид правки не совпадает с кодом диагностики: разные замечания чинятся
 * одинаково («заменить на @contains» годится и шаблону без спецсимволов,
 * и списку из одной фразы), и подпись у кнопки должна быть одна.
 */
export type FixKind =
  | 'lowercaseValue'
  | 'uppercaseValue'
  | 'useContains'
  | 'useStreq'
  | 'dropLeadingWildcard'
  | 'escapeDots'
  | 'moveNoneFirst'
  | 'removeTransform'
  | 'reorderPipeline'
  | 'clearTransforms'
  | 'addHexEncode'
  | 'addNormalisation'
  | 'removeTarget'
  | 'usePatternSelector'
  | 'setPhase'
  | 'clearStatus'
  | 'restoreLog'
  | 'enableCapture'
  | 'disableCapture';

export interface QuickFix {
  kind: FixKind;
  /** Подстановки в подпись кнопки. */
  params?: Record<string, string>;
  apply: (rule: VisualRule) => VisualRule;
}

/* ------------------------------------------------------------------ */
/* Точечные изменения модели                                           */
/* ------------------------------------------------------------------ */

/** Номер звена, к которому относится диагностика (0-based). */
function conditionIndex(diagnostic: Diagnostic): number {
  return (diagnostic.anchor?.condition ?? 1) - 1;
}

/** Меняет одно звено цепочки, оставляя остальное правило нетронутым. */
function editCondition(
  rule: VisualRule,
  index: number,
  edit: (condition: VisualCondition) => VisualCondition,
): VisualRule {
  const conditions = rule.conditions.map((c, i) => (i === index ? edit(c) : c));
  return { ...rule, conditions };
}

/** Правка звена: переписывает оператор. */
function editOperator(
  diagnostic: Diagnostic,
  edit: (operator: VisualCondition['operator']) => Partial<VisualCondition['operator']>,
) {
  return (rule: VisualRule) =>
    editCondition(rule, conditionIndex(diagnostic), (condition) => ({
      ...condition,
      operator: { ...condition.operator, ...edit(condition.operator) },
    }));
}

/** Правка звена: переписывает конвейер преобразований. */
function editTransforms(diagnostic: Diagnostic, edit: (transforms: string[]) => string[]) {
  return (rule: VisualRule) =>
    editCondition(rule, conditionIndex(diagnostic), (condition) => ({
      ...condition,
      transforms: edit(condition.transforms),
    }));
}

/** Правка действий правила. */
function editActions(edit: (rule: VisualRule) => Partial<VisualRule['actions']>) {
  return (rule: VisualRule): VisualRule => ({
    ...rule,
    actions: { ...rule.actions, ...edit(rule) },
  });
}

/** Переставляет шаг конвейера так, чтобы он оказался перед другим. */
function moveBefore(transforms: string[], moved: string, anchor: string): string[] {
  const without = transforms.filter((name) => name !== moved);
  const at = without.indexOf(anchor);
  if (at === -1) return transforms;
  return [...without.slice(0, at), moved, ...without.slice(at)];
}

/** Добавляет шаги в начало конвейера, не трогая ведущий `t:none`. */
function prependTransforms(transforms: string[], added: string[]): string[] {
  const head = transforms[0] === 'none' ? ['none'] : [];
  const rest = transforms.slice(head.length).filter((name) => !added.includes(name));
  return [...head, ...added, ...rest];
}

/* ------------------------------------------------------------------ */
/* Каталог правок                                                      */
/* ------------------------------------------------------------------ */

/**
 * Правка для диагностики или `null`, если однозначной правки нет.
 *
 * Вызывающему остаётся найти правило по `anchor.ruleKey` и применить
 * результат — модель пересоберётся в текст обычным путём.
 */
export function quickFixFor(diagnostic: Diagnostic): QuickFix | null {
  const params = diagnostic.params ?? {};

  switch (diagnostic.code) {
    case 'caseNeverMatches': {
      const toUpper = params.name === 'uppercase';
      return {
        kind: toUpper ? 'uppercaseValue' : 'lowercaseValue',
        apply: editOperator(diagnostic, (operator) => ({
          argument: toUpper
            ? operator.argument.toUpperCase()
            : operator.argument.toLowerCase(),
        })),
      };
    }

    case 'regexIsPlainText':
      return {
        kind: 'useContains',
        apply: editOperator(diagnostic, () => ({ name: 'contains' })),
      };

    case 'singlePhraseList':
      return {
        kind: 'useContains',
        apply: editOperator(diagnostic, () => ({ name: 'contains' })),
      };

    case 'anchoredLiteralRegex':
      return {
        kind: 'useStreq',
        apply: editOperator(diagnostic, (operator) => ({
          name: 'streq',
          argument: operator.argument.replace(/^\^/, '').replace(/\$$/, ''),
        })),
      };

    case 'redundantLeadingWildcard':
      return {
        kind: 'dropLeadingWildcard',
        apply: editOperator(diagnostic, (operator) => ({
          argument: operator.argument.replace(/^\^?\.\*\??/, ''),
        })),
      };

    case 'unescapedDot':
      return {
        kind: 'escapeDots',
        apply: editOperator(diagnostic, (operator) => ({
          argument: operator.argument.replace(/\./g, '\\.'),
        })),
      };

    case 'transformNoneNotFirst':
      return {
        kind: 'moveNoneFirst',
        apply: editTransforms(diagnostic, (transforms) => [
          'none',
          ...transforms.filter((name) => name !== 'none'),
        ]),
      };

    case 'duplicateTransform':
      return {
        kind: 'removeTransform',
        params: { name: params.name },
        apply: editTransforms(diagnostic, (transforms) => [...new Set(transforms)]),
      };

    case 'redundantTransform':
      return {
        kind: 'removeTransform',
        params: { name: params.name },
        apply: editTransforms(diagnostic, (transforms) =>
          transforms.filter((name) => name !== params.name),
        ),
      };

    case 'decodeAfterNormalise':
      return {
        kind: 'reorderPipeline',
        apply: editTransforms(diagnostic, (transforms) =>
          moveBefore(transforms, params.decode, params.normalise),
        ),
      };

    case 'countWithTransforms':
      return { kind: 'clearTransforms', apply: editTransforms(diagnostic, () => []) };

    case 'hashWithoutHexEncode':
      return {
        kind: 'addHexEncode',
        apply: editTransforms(diagnostic, (transforms) => [...transforms, 'hexEncode']),
      };

    // Одной нормализации мало: если оставить аргумент как есть, `t:lowercase`
    // тут же сделает проверку невыполнимой. Правка чинит обе половины сразу.
    case 'noNormalisation':
      return {
        kind: 'addNormalisation',
        apply: (rule) =>
          editCondition(rule, conditionIndex(diagnostic), (condition) => ({
            ...condition,
            transforms: prependTransforms(condition.transforms, [
              'urlDecodeUni',
              'lowercase',
            ]),
            operator: {
              ...condition.operator,
              argument: condition.operator.argument.toLowerCase(),
            },
          })),
      };

    case 'duplicateTarget':
      return {
        kind: 'removeTarget',
        params: { name: params.name },
        apply: (rule) =>
          editCondition(rule, conditionIndex(diagnostic), (condition) => {
            const seen = new Set<string>();
            return {
              ...condition,
              targets: condition.targets.filter((target) => {
                const signature = targetSignature(target);
                if (seen.has(signature)) return false;
                seen.add(signature);
                return true;
              }),
            };
          }),
      };

    // Имя с пробелом ищется по совпадению замены, а не по тексту из
    // сообщения: там оно обрезано до читаемой длины.
    case 'selectorNeedsQuotes':
      return {
        kind: 'usePatternSelector',
        apply: (rule) =>
          editCondition(rule, conditionIndex(diagnostic), (condition) => ({
            ...condition,
            targets: condition.targets.map((target) => ({
              ...target,
              params: target.params.map((param) =>
                selectorPattern(param) === params.pattern ? params.pattern : param,
              ),
            })),
          })),
      };

    case 'overlappingTargets':
      return {
        kind: 'removeTarget',
        params: { name: params.inner },
        apply: (rule) =>
          editCondition(rule, conditionIndex(diagnostic), (condition) => ({
            ...condition,
            targets: condition.targets.filter(
              (target) => target.name !== params.inner || target.params.length > 0,
            ),
          })),
      };

    // Фазу не нужно угадывать: она однозначно следует из того, когда
    // заполняются области проверки.
    case 'missingPhase':
    case 'phaseTooEarly':
      return {
        kind: 'setPhase',
        apply: editActions((rule) => ({
          phase: String(
            Math.max(...rule.conditions.map((c) => targetsMinPhase(c.targets)), 1),
          ),
        })),
      };

    case 'statusWithoutBlock':
      return { kind: 'clearStatus', apply: editActions(() => ({ status: '' })) };

    case 'blockWithoutLog':
    case 'logdataWithoutLog':
      return { kind: 'restoreLog', apply: editActions(() => ({ log: null })) };

    case 'captureMissing':
      return { kind: 'enableCapture', apply: editActions(() => ({ capture: true })) };

    case 'captureUnused':
    case 'captureWithoutRegex':
      return { kind: 'disableCapture', apply: editActions(() => ({ capture: false })) };

    default:
      return null;
  }
}
