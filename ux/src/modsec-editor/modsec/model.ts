/**
 * Модель визуального конструктора.
 *
 * Это «второй этаж» над разобранным документом (`ParsedDocument`): там —
 * директивы как они написаны, здесь — условия так, как их видит человек.
 *
 * Ключевое отличие: одно логическое правило в ModSecurity может занимать
 * несколько директив `SecRule`, связанных действием `chain`. Для человека это
 * одно правило с несколькими условиями, объединёнными по И, поэтому
 * {@link VisualRule} собирает всю цепочку в один объект, а каждое звено
 * становится {@link VisualCondition}.
 *
 * Внутри звена список переменных — это ИЛИ, а термы одной переменной
 * собираются в одну область проверки: `VAR:a|VAR:b` становится перечнем
 * параметров, `VAR|!VAR:a` — той же коллекцией с вычитанием.
 */

import type { DirectiveForm } from './directives';
import type { RuleAction, RuleVariable } from './types';
import type { DisruptiveAction, TargetLike } from './semantics';

/** Область проверки: переменная и список её параметров. */
export interface VisualTarget extends TargetLike {}

/** Оператор сравнения с аргументом. */
export interface VisualOperator {
  name: string;
  negated: boolean;
  argument: string;
}

/**
 * Одно условие (одна директива `SecRule` цепочки):
 * несколько целей по ИЛИ → конвейер трансформаций → оператор со значением.
 */
export interface VisualCondition {
  /** Стабильный ключ для React (не зависит от порядка). */
  key: string;
  /** Индекс исходной директивы в `ParsedDocument.statements` (-1 для новых). */
  statementIndex: number;
  /** Комментарий, стоящий вплотную перед звеном цепочки. */
  comments: string[];
  targets: VisualTarget[];
  /** Упорядоченный конвейер `t:` — порядок значим. */
  transforms: string[];
  /**
   * Действия самого звена, кроме конвейера и `chain`: `ctl`, `setvar`, `capture`.
   *
   * У головы цепочки этот список пуст: её действия принадлежат правилу целиком
   * и лежат в {@link VisualRule.actions}. У остальных звеньев своих действий не
   * бывает «немного» — они бывают, и место в цепочке для них значимо:
   * `ctl:ruleRemoveTargetById`, написанный в голове, применится, едва совпала
   * голова, а в последнем звене — только когда совпала вся цепочка. Поэтому
   * они хранятся у звена, а не сводятся к действиям правила: перенести их
   * значило бы изменить смысл правила, не тронув ни одного поля.
   */
  extra: RuleAction[];
  operator: VisualOperator;
}

/** Действия правила — живут на первой директиве цепочки. */
export interface VisualActions {
  id: string;
  phase: string;
  disruptive: DisruptiveAction | '';
  /**
   * Аргумент реакции: адрес для `redirect` и `proxy`.
   *
   * У остальных реакций аргумента не бывает, и поле остаётся пустым. Хранить
   * его отдельно от имени приходится потому, что в тексте это одно действие
   * `redirect:/blocked.html`, а в форме — два разных вопроса: что сделать
   * и куда отправить.
   */
  disruptiveValue: string;
  status: string;
  msg: string;
  logdata: string;
  severity: string;
  /**
   * Паспорт правила: версия набора (`ver`), номер ревизии (`rev`) и
   * самооценка обкатанности и точности (`maturity`, `accuracy`).
   *
   * Движок на них не смотрит вовсе — они нужны разбору логов и сборке набора
   * под выбранный уровень паранойи. В форме стоят рядом с критичностью,
   * потому что заполняют их из одного соображения: насколько правилу можно
   * доверять и откуда оно взялось.
   */
  ver: string;
  rev: string;
  maturity: string;
  accuracy: string;
  tags: string[];
  capture: boolean;
  /** `log` / `nolog`; `null` — не задано явно. */
  log: boolean | null;
  /** `auditlog` / `noauditlog`; `null` — не задано явно. */
  auditlog: boolean | null;
  /** Значения `setvar:...` в порядке следования. */
  setvar: string[];
  /**
   * Действия, для которых в форме поля нет: `ctl`, `initcol`, `expirevar`,
   * `skipAfter`, `exec` и подобные.
   *
   * Каждое из них меняет поведение — молча их прятать нельзя, поэтому
   * конструктор показывает их строкой только для чтения, а сохраняет
   * дословно: правка соседнего поля не должна стоить правилу `ctl`.
   */
  extra: RuleAction[];
}

/** Логическое правило: цепочка условий по И плюс общие действия. */
export interface VisualRule {
  key: string;
  /**
   * Первая строка блока в документе — либо сама директива, либо первая
   * строка прижатого к ней комментария (описания правила).
   */
  startIndex: number;
  /** Индекс головной директивы `SecRule`. */
  headIndex: number;
  /** Индекс последней директивы цепочки. */
  tailIndex: number;
  /** Комментарий-описание, стоящий вплотную перед правилом. */
  comments: string[];
  /** Звенья цепочки — соединены логическим И. */
  conditions: VisualCondition[];
  actions: VisualActions;
}

/** Безусловное действие `SecAction`. */
export interface VisualActionBlock {
  kind: 'action';
  key: string;
  startIndex: number;
  statementIndex: number;
  comments: string[];
  actions: VisualActions;
}

/**
 * Строка файла, стоящая в списке отдельным блоком: метка или директива.
 *
 * Текст хранится здесь как написан и остаётся источником правды до первой
 * правки: пока строку не тронули, в файл уходит ровно она, со всеми
 * авторскими кавычками и переносами.
 */
interface VisualLineBlock {
  key: string;
  startIndex: number;
  statementIndex: number;
  comments: string[];
  /** Утверждение одной строкой, без переносов `\` и краевых пробелов. */
  text: string;
}

/**
 * Метка `SecMarker`.
 *
 * Единственный блок, который так и правится текстом: содержимого у метки
 * ровно одно — её имя, и поле с именем ничем не отличалось бы от поля со
 * строкой целиком.
 */
export interface VisualMarkerBlock extends VisualLineBlock {
  kind: 'marker';
  label: string;
}

/**
 * Любая другая директива конфигурации.
 *
 * Разобранная в форму ({@link VisualDirectiveBlock.form}) она правится
 * полями: у переключателя список значений, у числа — число, у семи
 * директив-исключений — та же решётка «что снимаем × как выбираем», по
 * которой они и различаются. Собрать такую директиву обратно можно потому,
 * что кавычки — свойство вида аргумента, а не памяти о том, как было
 * написано: снятые разбором, они расставляются заново.
 *
 * Формы нет — остаётся текстовое поле. Это не редкость и не сбой:
 * незнакомое имя, лишний аргумент, макрос в значении. Во всех трёх случаях
 * форма показала бы меньше, чем есть в строке, а сохранила бы ровно
 * столько, сколько показала.
 */
export interface VisualDirectiveBlock extends VisualLineBlock {
  kind: 'directive';
  name: string;
  args: string[];
  /** Разбор по полям; `null` — правится текстом, как раньше. */
  form: DirectiveForm | null;
}

export interface VisualRuleBlock {
  kind: 'rule';
  key: string;
  rule: VisualRule;
}

export type VisualBlock =
  | VisualRuleBlock
  | VisualActionBlock
  | VisualMarkerBlock
  | VisualDirectiveBlock;

export interface VisualModel {
  blocks: VisualBlock[];
}

/**
 * Диапазон утверждений, которые занимает блок, — от первой строки описания
 * до последней строки самой директивы.
 *
 * У правила это вся цепочка: переставлять или удалять её можно только целиком,
 * иначе `chain` останется без продолжения.
 */
export function blockRange(block: VisualBlock): [number, number] {
  return block.kind === 'rule'
    ? [block.rule.startIndex, block.rule.tailIndex]
    : [block.startIndex, block.statementIndex];
}

/** Правило модели по ключу — по нему диагностика находит, что чинить. */
export function findRule(model: VisualModel | null, key: string | undefined): VisualRule | null {
  if (model === null || key === undefined) return null;
  for (const block of model.blocks) {
    if (block.kind === 'rule' && block.key === key) return block.rule;
  }
  return null;
}

/** Пустой набор действий. */
export function emptyActions(): VisualActions {
  return {
    id: '',
    phase: '',
    disruptive: '',
    disruptiveValue: '',
    status: '',
    msg: '',
    logdata: '',
    severity: '',
    ver: '',
    rev: '',
    maturity: '',
    accuracy: '',
    tags: [],
    capture: false,
    log: null,
    auditlog: null,
    setvar: [],
    extra: [],
  };
}

let keyCounter = 0;

/** Генератор стабильных ключей для новых элементов модели. */
export function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

/** Пустая цель по умолчанию — вся коллекция без уточнений. */
export function makeTarget(name = 'ARGS'): VisualTarget {
  return { name, count: false, mode: 'only', params: [] };
}

/** Пустое условие по умолчанию. */
export function makeCondition(): VisualCondition {
  return {
    key: nextKey('cond'),
    statementIndex: -1,
    comments: [],
    targets: [makeTarget()],
    transforms: [],
    extra: [],
    operator: { name: 'rx', negated: false, argument: '' },
  };
}

/* ------------------------------------------------------------------ */
/* Термы ↔ цели                                                        */
/* ------------------------------------------------------------------ */

/*
 * Соответствие между плоским списком термов и целями формы двустороннее, и
 * обе половины лежат здесь, в модели. Ни та, ни другая не знают о тексте:
 * терм — это уже разобранная переменная, а не строка, — поэтому место им не
 * в компиляции и не в сборке текста, которые ими только пользуются. А
 * пользуются ими трое: цепочка правила, действие `ctl` со снимаемой целью и
 * выжимка свёрнутой карточки.
 */

/**
 * Превращает плоский список переменных в цели конструктора.
 *
 * Термы одной переменной собираются в одну область проверки, но только по
 * одному из двух способов сразу: `VAR:a|VAR:b` даёт перечень параметров, а
 * `VAR|!VAR:a` — ту же коллекцию с вычитанием. Смешивать нельзя, потому что
 * в ModSecurity это разные операции над одним набором: перечень задаёт
 * набор, а `!` вычитает из уже набранного.
 *
 * Поэтому голый терм (`VAR`) и терм с параметром (`VAR:a`) в одну цель не
 * сливаются: `VAR|VAR:a` — это по-прежнему вся коллекция, а не параметр `a`.
 * По той же причине не сливаются термы с разным подсчётом `&`.
 */
export function groupTargets(variables: RuleVariable[]): VisualTarget[] {
  const targets: VisualTarget[] = [];
  /** Цель переменной, в перечень которой ложится очередной параметр. */
  const listing = new Map<string, VisualTarget>();
  /** Цель переменной, из которой можно вычитать: её база — вся коллекция. */
  const subtractable = new Map<string, VisualTarget>();

  for (const v of variables) {
    if (v.exclusion) {
      const host = subtractable.get(v.name);
      if (host) {
        host.mode = 'except';
        host.params.push(v.selector ?? '');
        continue;
      }
      // Вычитать не из чего: положительной части у переменной нет. Такая
      // цель показывается отдельной строкой и помечается предупреждением.
      const orphan: VisualTarget = {
        name: v.name,
        count: v.count,
        mode: 'except',
        params: [v.selector ?? ''],
        excludeOnly: true,
      };
      targets.push(orphan);
      subtractable.set(v.name, orphan);
      continue;
    }

    if (v.selector === undefined) {
      const whole: VisualTarget = { name: v.name, count: v.count, mode: 'only', params: [] };
      targets.push(whole);
      subtractable.set(v.name, whole);
      // Дальнейшие параметры этой переменной относятся уже не к ней:
      // рядом с целой коллекцией перечень значит отдельную цель.
      listing.delete(v.name);
      continue;
    }

    const host = listing.get(v.name);
    if (host !== undefined && host.count === v.count) {
      host.params.push(v.selector);
      continue;
    }

    const listed: VisualTarget = {
      name: v.name,
      count: v.count,
      mode: 'only',
      params: [v.selector],
    };
    targets.push(listed);
    listing.set(v.name, listed);
  }

  return targets;
}

/**
 * Разворачивает цели обратно в плоский список термов.
 *
 * Формы ровно три: вся коллекция (`VAR`), перечень параметров
 * (`VAR:a|VAR:b`) и коллекция с вычитанием (`VAR|!VAR:a`). Вычитающие термы
 * идут после своей положительной части — иначе ModSecurity вычтет из ещё
 * не набранного, и правило будет значить не то, что показывает конструктор.
 */
export function targetsToVariables(targets: VisualTarget[]): RuleVariable[] {
  const variables: RuleVariable[] = [];

  for (const target of targets) {
    const listed = target.mode === 'only' ? target.params : [];
    const subtracted = target.mode === 'except' ? target.params : [];

    if (!target.excludeOnly) {
      const selectors = listed.length === 0 ? [undefined] : listed;
      for (const selector of selectors) {
        variables.push({
          raw: '',
          name: target.name,
          selector,
          count: target.count,
          exclusion: false,
        });
      }
    }

    for (const selector of subtracted) {
      variables.push({
        raw: '',
        name: target.name,
        selector: selector === '' ? undefined : selector,
        count: false,
        exclusion: true,
      });
    }
  }

  return variables;
}
