/**
 * Исключения: какая директива файла правит какое правило.
 *
 * Это первое знание редактора о связях между директивами. Всё остальное
 * можно сказать о правиле, глядя на него одно; `SecRuleRemoveById 942100`
 * сама по себе не значит ничего — её смысл целиком в том, есть ли правило
 * с таким номером и где оно стоит. ModSecurity применяет такую директиву в
 * момент чтения конфигурации, поэтому правило, объявленное ниже, она не
 * увидит вовсе: то же самое исключение работает или не работает в
 * зависимости от порядка строк.
 *
 * Отсюда две функции. {@link readExclusions} разбирает директивы, ничего не
 * зная о правилах; {@link indexWorkspaceExclusions} сводит их с правилами всего
 * набора файлов и отвечает на два разных вопроса — какие правила подходят под
 * выборку и для каких из них директива стоит достаточно низко, чтобы
 * подействовать. Набор, а не файл, потому что включённые файлы для ModSecurity
 * одна конфигурация: «ниже» бывает и в соседнем файле.
 *
 * Директивы разложены на две оси — что делают и как выбирают, — потому
 * что различаются они только этим: `SecRuleRemoveByTag` и
 * `SecRuleUpdateTargetById` не два случая, а две точки в одной таблице.
 *
 * По той же таблице читаются исключения времени запроса — шесть значений
 * `ctl`, от `ruleRemoveById` до `ruleRemoveTargetByTag`. Выборка у них та же,
 * поэтому третьей осью идёт не она, а происхождение ({@link ExclusionSource}):
 * от него зависит, что вообще значит «работает».
 *
 * Директива применяется при чтении конфигурации, поэтому обязана стоять
 * *ниже* своей цели. `ctl` применяется в момент срабатывания правила, в
 * действиях которого написан, поэтому обязан отработать *раньше* цели — а
 * порядок исполнения задаёт сначала фаза и только потом строка. Одно и то же
 * исключение здесь ломается от противоположных причин, и именно поэтому
 * `applies` считается по-разному, а не одним общим сравнением.
 *
 * Второе отличие — условность. Директива снимает правило для всех запросов;
 * `ctl` живёт одну транзакцию и только ту, в которой правило-носитель
 * сработало. Поэтому у записи `ctl` есть {@link ExclusionCarrier}: без
 * носителя о таком исключении нельзя сказать ни когда оно случится, ни при
 * каком условии.
 */

import { parseActions, parseVariables } from './parser';
import { groupTargets, targetsToVariables } from './model';
import { reviewRegex } from './regex';
import { dquote, serializeActions, serializeVariable, serializeVariables } from './serialize';
import { LONE_FILE, before, blockRef, loneUnit, statementRef } from './workspace';
import type { VisualBlock, VisualTarget } from './model';
import type { WorkspacePlace, WorkspaceUnit } from './workspace';
import type {
  DirectiveStatement,
  ParsedStatement,
  RuleAction,
  RuleVariable,
  SecActionStatement,
  SecRuleStatement,
} from './types';

/** Что исключение делает с правилами, которые выбрало. */
export type ExclusionOp = 'remove' | 'removeTarget' | 'updateTarget' | 'updateAction';

/** По какому признаку исключение выбирает правила. */
export type ExclusionSelector = 'id' | 'msg' | 'tag';

/**
 * Откуда исключение взялось — и, следовательно, когда оно применяется.
 *
 * `directive` — отдельная строка файла, применяется при чтении конфигурации
 * и навсегда. `ctl` — действие внутри правила, применяется в момент его
 * срабатывания и только к текущей транзакции.
 */
export type ExclusionSource = 'directive' | 'ctl';

/** Диапазон идентификаторов. Одиночный `id` — это `from === to`. */
export interface IdRange {
  from: number;
  to: number;
}

/** Разобранное исключение: директива файла или `ctl` внутри правила. */
export interface ExclusionDirective {
  source: ExclusionSource;
  /**
   * Место записи в наборе: файл и индекс утверждения внутри него.
   *
   * У `ctl` это утверждение, в действиях которого он написан, — то есть
   * звено цепочки, а не обязательно её голова.
   */
  place: WorkspacePlace;
  line: number;
  /**
   * Имя исключения: `SecRuleRemoveById` у директивы, `ctl:ruleRemoveById` у
   * действия. У директивы регистр сохранён как в файле — по нему видно, что
   * именно править; у `ctl` он приведён к тому написанию, которого ждёт
   * ModSecurity, потому что эту запись редактор не только читает, но и
   * собирает обратно.
   */
  name: string;
  op: ExclusionOp;
  selector: ExclusionSelector;
  /** Выборка по `id`: отдельные номера и диапазоны. */
  ids: IdRange[];
  /** Выборка по `msg` или `tag`: регулярное выражение. */
  pattern?: string;
  /**
   * Цели: новый список для `updateTarget`, снимаемая цель для `removeTarget`.
   * Разбирается так же, как цели правила.
   */
  targets: RuleVariable[];
  /** Третий аргумент `SecRuleUpdateTargetById`: какую цель заменяет новая. */
  replaced?: string;
  /** Действия, дописываемые правилу при `updateAction`. */
  actions: RuleAction[];
  /** Аргументы выборки, которые не читаются ни как номер, ни как диапазон. */
  badIds: string[];
  /** Обязательного аргумента нет, и директива не сделает ничего. */
  incomplete: boolean;
}

/** Правило, попавшее под выборку исключения. */
export interface ExclusionMatch {
  /**
   * Файл, в котором стоит правило.
   *
   * Ключ блока считается внутри файла, и без этого поля отправить к правилу
   * можно было бы только в том файле, который открыт.
   */
  file: string;
  /** Ключ блока модели — по нему конструктор находит карточку. */
  key: string;
  /** Значение `id` правила: то, чем правило названо в файле. */
  id: string;
  /**
   * Исключение доживает до этого правила и действительно его правит.
   *
   * У директивы это значит «написана ниже правила»; у `ctl` — «носитель
   * выполняется раньше»: сначала по фазе, при равных фазах — по строке.
   * И «ниже», и «раньше» считаются по набору: файл, включённый позже,
   * целиком ниже включённого раньше.
   */
  applies: boolean;
}

/**
 * Правило, в действиях которого написан `ctl`.
 *
 * Само действие не говорит ни когда сработает, ни при каком условии: и то и
 * другое — свойства носителя. Поэтому у записи `ctl` он есть всегда, а у
 * директивы его нет вовсе.
 */
export interface ExclusionCarrier {
  /** Файл носителя. У `ctl` он тот же, что у самой записи: она внутри правила. */
  file: string;
  /** Ключ блока-носителя: по нему конструктор находит карточку. */
  key: string;
  id: string;
  /** Фаза носителя; при отсутствии `phase` — та, что берётся по умолчанию. */
  phase: number;
  /**
   * Носитель — `SecRule` с условием, а не безусловный `SecAction`: исключение
   * случится не на каждом запросе.
   */
  conditional: boolean;
  /** Реакция носителя, обрывающая транзакцию, или пустая строка. */
  stops: string;
}

/** Исключение вместе с тем, что оно нашло. */
export interface ExclusionEntry {
  directive: ExclusionDirective;
  matches: ExclusionMatch[];
  /** Правило-носитель — только у `ctl`. */
  carrier?: ExclusionCarrier;
}

/** Ссылка на исключение — то, чем правило может назвать своего правщика. */
export interface ExclusionRef {
  /**
   * Файл, в котором исключение написано.
   *
   * Правит правило и файл, включённый позже, — и это тот случай, когда отметка
   * обязана называть файл: строка 12 без него ведёт не туда.
   */
  file: string;
  /**
   * Ключ блока, в котором исключение написано: самой директивы или
   * правила-носителя `ctl`. По нему карточка правила отправляет к правщику.
   */
  key: string;
  line: number;
  name: string;
  /**
   * Исключение целиком: `SecRuleUpdateTargetById 942100 !ARGS:comment`.
   *
   * Одного имени мало ровно там, где отметка и нужна: «цели изменены» без
   * самих целей — это приглашение искать директиву глазами по файлу.
   */
  text: string;
  /**
   * Отсюда видно, безусловна ли правка: `ctl` снимает правило только для
   * тех запросов, на которых сработал его носитель.
   */
  source: ExclusionSource;
}

/** Что с правилом сделали исключения набора. */
export interface RuleEffect {
  /** Директивы, снимающие правило целиком. */
  removedBy: ExclusionRef[];
  targetEdits: ExclusionRef[];
  actionEdits: ExclusionRef[];
}

export interface ExclusionIndex {
  /**
   * Утверждение набора → исключения, написанные в этом утверждении.
   *
   * Ключ — {@link statementRef}, то есть файл вместе с номером утверждения:
   * спрашивают отсюда двое и по-разному. Проверки идут по всем исключениям в
   * порядке включения (его хранит сам `Map`), а строка списка блоков
   * спрашивает только про себя — и про себя в своём файле.
   *
   * Значение — список, а не одна запись: у директивы исключение в строке одно,
   * а правило носит их сколько угодно — `ctl:ruleRemoveById=1,ctl:ruleRemoveById=2`
   * в одном списке действий совершенно обычная запись.
   */
  byStatement: Map<string, ExclusionEntry[]>;
  /** {@link blockRef} правила → что с ним сделали. Только действующие исключения. */
  byRule: Map<string, RuleEffect>;
  /**
   * Имена файлов набора: идентификатор → имя.
   *
   * Держит их индекс, а не тот, кто его показывает: чужой файл называют и
   * замечания, а у ядра других сведений о наборе нет.
   */
  names: Map<string, string>;
  /**
   * В наборе есть хотя бы одно правило с `id`.
   *
   * По этому признаку отличается набор правил от одинокой надстройки: во
   * второй исключения ссылаются на чужие правила, и промах выборки там —
   * норма, а не опечатка. Считается по набору: правило, лежащее в соседнем
   * файле, — это уже не чужой набор.
   */
  hasIds: boolean;
}

export function emptyExclusionIndex(): ExclusionIndex {
  return { byStatement: new Map(), byRule: new Map(), names: new Map(), hasIds: false };
}

/** Место в таблице «что делает × как выбирает». */
export interface ExclusionKind {
  op: ExclusionOp;
  selector: ExclusionSelector;
}

/** Имя директивы (в нижнем регистре) → её место в таблице «что × как». */
const KINDS: Record<string, ExclusionKind> = {
  secruleremovebyid: { op: 'remove', selector: 'id' },
  secruleremovebymsg: { op: 'remove', selector: 'msg' },
  secruleremovebytag: { op: 'remove', selector: 'tag' },
  secruleupdatetargetbyid: { op: 'updateTarget', selector: 'id' },
  secruleupdatetargetbymsg: { op: 'updateTarget', selector: 'msg' },
  secruleupdatetargetbytag: { op: 'updateTarget', selector: 'tag' },
  secruleupdateactionbyid: { op: 'updateAction', selector: 'id' },
};

/**
 * Что директива с таким именем делает и как выбирает правила.
 *
 * `null` — это не исключение, а обычная директива конфигурации. Отсюда же
 * видно, сколько у неё аргументов и что стоит на каждом месте: у `remove`
 * выборка занимает их все, у `update*` — только первый.
 */
export function exclusionDirectiveKind(name: string): ExclusionKind | null {
  return KINDS[name.toLowerCase()] ?? null;
}

/**
 * Значения `ctl`, которыми снимают правила, — все шесть.
 *
 * Правку действий здесь не найти: менять чужие действия на время одной
 * транзакции ModSecurity не умеет — для этого пришлось бы решать, что делать
 * с уже посчитанным. Снять правило или одну его цель — умеет, и этих шести
 * значений хватает на все реальные исключения.
 *
 * Таблица держит написание значения, а не только его разбор: `ctl` не только
 * читают, но и собирают обратно, а ModSecurity ждёт `ruleRemoveTargetById`
 * ровно в таком виде.
 *
 * Порядок — тот, в котором эти шесть предлагают выбрать, и он же порядок базы
 * знаний: сначала снятие одной цели, обычная починка ложного срабатывания, и
 * только потом снятие правила целиком; внутри — от точной выборки по номеру к
 * самой размашистой, по шаблону сообщения. Разбору порядок безразличен, а
 * выбирающему нет: первым в списке стоит то, что чаще всего и нужно.
 */
export const CTL_EXCLUSION_OPTIONS = [
  'ruleRemoveTargetById',
  'ruleRemoveTargetByTag',
  'ruleRemoveTargetByMsg',
  'ruleRemoveById',
  'ruleRemoveByTag',
  'ruleRemoveByMsg',
] as const;

const CTL_KINDS: Record<string, ExclusionKind & { option: string }> = {};
for (const option of CTL_EXCLUSION_OPTIONS) {
  const target = option.includes('Target');
  const by = option.slice(option.lastIndexOf('By') + 2).toLowerCase();
  CTL_KINDS[option.toLowerCase()] = {
    option,
    op: target ? 'removeTarget' : 'remove',
    selector: by as ExclusionSelector,
  };
}

/**
 * Разобранное `ctl`-исключение — то, что правится полями формы.
 *
 * Отдельно от {@link ExclusionDirective}, потому что отвечает на другой
 * вопрос. Директива описана так, как её видит проверка: до кого дотянулась,
 * что не дописано, чем плоха. Здесь — так, как её правит человек: четыре
 * значения, из которых собирается ровно одна запись `ctl`.
 */
export interface CtlExclusion {
  /** Что делаем: снимаем правило целиком или одну его цель. */
  op: 'remove' | 'removeTarget';
  /** Как выбираем правила: по номеру, сообщению или метке. */
  selector: ExclusionSelector;
  /** Сама выборка: номер правила, шаблон сообщения, метка. */
  pick: string;
  /**
   * Снимаемые цели — только у `removeTarget`.
   *
   * Список, хотя в самой записи цель ровно одна: всё после `;` ModSecurity
   * читает одним именем с параметром, и `ARGS:a|ARGS:b` для него — параметр
   * `a|ARGS:b`, которого ни у одного правила нет. Двух целей поэтому не
   * бывает без двух записей — а решение снять их пришло одно, и правится
   * одной строкой формы, которую редактор разворачивает в записи сам
   * ({@link ctlExclusionActions}).
   *
   * Цели те же, что у правила: `!` и `&` в них ModSecurity не сравнит ни с
   * чем, но прочитанное из файла модель держит как написано — форма, молча
   * потерявшая знак, соврала бы о записи.
   */
  targets: VisualTarget[];
}

/** Имя настройки `ctl` для пары «что делаем × как выбираем». */
export function ctlOption(op: CtlExclusion['op'], selector: ExclusionSelector): string {
  const found = CTL_EXCLUSION_OPTIONS.find((option) => {
    const kind = CTL_KINDS[option.toLowerCase()];
    return kind.op === op && kind.selector === selector;
  });
  // Пар всего шесть, и таблица покрывает их все; пустая строка здесь
  // означала бы, что таблицу порезали.
  return found ?? '';
}

/** Вид `ctl`-исключения: что снимает, как выбирает и как пишется в правиле. */
export interface CtlExclusionKind {
  option: string;
  op: CtlExclusion['op'];
  selector: ExclusionSelector;
}

/**
 * Все шесть видов подряд — для того, кто исключение только заводит.
 *
 * Стоящая запись о своём виде рассказывает сама, а новую надо с чего-то
 * начать, и начинают именно с вида: от него зависит и что делает исключение,
 * и какие поля у него есть вовсе. Порядок тот же, что в списке поля: один и
 * тот же вид, стоящий в меню и в списке на разных местах, читался бы как два
 * разных.
 */
export const CTL_EXCLUSION_KINDS: CtlExclusionKind[] = CTL_EXCLUSION_OPTIONS.map((option) => {
  const kind = CTL_KINDS[option.toLowerCase()];
  return { option, op: kind.op === 'remove' ? 'remove' : 'removeTarget', selector: kind.selector };
});

/** Запись `ctl` по частям: место в таблице «что × как», выборка и текст цели. */
interface CtlParts {
  op: CtlExclusion['op'];
  selector: ExclusionSelector;
  pick: string;
  /** Всё после `;` — так, как написано, ещё не разобранное на переменные. */
  target: string;
}

/**
 * Режет запись `ctl` по границам; `null` — это не исключение, а настройка.
 *
 * Границ в записи две: `=` отделяет имя настройки от аргумента, `;` — выборку
 * от снимаемой цели. Точка с запятой берётся первая: в цели бывают и `:`, и
 * `/`, а точки с запятой не бывает.
 */
function splitCtl(action: RuleAction): CtlParts | null {
  if (action.name.toLowerCase() !== 'ctl') return null;

  const value = action.value ?? '';
  const equals = value.indexOf('=');
  if (equals === -1) return null;

  const kind = CTL_KINDS[value.slice(0, equals).trim().toLowerCase()];
  if (kind === undefined) return null;

  const argument = value.slice(equals + 1);
  const semicolon = argument.indexOf(';');

  return {
    op: kind.op === 'remove' ? 'remove' : 'removeTarget',
    selector: kind.selector,
    pick: (semicolon === -1 ? argument : argument.slice(0, semicolon)).trim(),
    target: semicolon === -1 ? '' : argument.slice(semicolon + 1).trim(),
  };
}

/** Одна запись `ctl` в виде формы; `null` — это настройка движка, а не исключение. */
export function readCtlExclusion(action: RuleAction): CtlExclusion | null {
  const parts = splitCtl(action);
  if (parts === null) return null;

  const { op, selector, pick } = parts;
  return { op, selector, pick, targets: groupTargets(parseVariables(parts.target)) };
}

/** Строка формы: подряд идущие записи одного исключения и их места в списке. */
export interface CtlExclusionRun {
  /**
   * Места записей в списке действий, подряд.
   *
   * Подряд — потому что строка формы уходит в файл одним отрезком: собранная
   * из записей, разнесённых чужими действиями, она переставила бы то, что
   * стоит между ними.
   */
  at: number[];
  value: CtlExclusion;
}

/**
 * Читает действия как строки формы: соседние записи об одной цели — одна строка.
 *
 * Сливаются только записи `removeTarget` с одинаковой выборкой: у них
 * различается ровно то, что в форме и стоит списком, — снимаемая цель. Два
 * одинаковых `ruleRemoveById` рядом не повтор формы, а повтор в файле, и
 * слить их значило бы потерять вторую запись на первой же правке.
 */
export function readCtlExclusionRuns(actions: RuleAction[]): CtlExclusionRun[] {
  const runs: { at: number[]; parts: CtlParts; variables: RuleVariable[] }[] = [];
  let open: (typeof runs)[number] | null = null;

  for (let at = 0; at < actions.length; at++) {
    const parts = splitCtl(actions[at]);
    if (parts === null) {
      open = null;
      continue;
    }

    const joins =
      open !== null &&
      parts.op === 'removeTarget' &&
      open.parts.op === 'removeTarget' &&
      open.parts.selector === parts.selector &&
      open.parts.pick === parts.pick;

    if (open !== null && joins) {
      open.at.push(at);
      open.variables.push(...parseVariables(parts.target));
      continue;
    }

    open = { at: [at], parts, variables: parseVariables(parts.target) };
    runs.push(open);
  }

  return runs.map(({ at, parts, variables }) => ({
    at,
    value: {
      op: parts.op,
      selector: parts.selector,
      pick: parts.pick,
      targets: groupTargets(variables),
    },
  }));
}

/**
 * Записи `ctl` для модели правила — по одной на снимаемую цель.
 *
 * Цель пишется только там, где она значит хоть что-то: `ctl:ruleRemoveById`
 * с точкой с запятой ModSecurity прочитает как номер правила с мусором на
 * конце и не найдёт по нему ничего. Безымянная цель — тот же случай, поэтому
 * недописанная строка формы уходит в файл без `;`, а не с пустым хвостом.
 *
 * Без кавычек: значение — одно слово с `=` и `;`, и кавычки в нём ModSecurity
 * прочитал бы частью имени цели.
 */
export function ctlExclusionActions(exclusion: CtlExclusion): RuleAction[] {
  const option = ctlOption(exclusion.op, exclusion.selector);
  const ctl = (value: string): RuleAction => ({ raw: '', name: 'ctl', value, quoted: false });

  // Снятое правило целями не сужают: цель у такой записи ModSecurity
  // прочитает как мусор в номере.
  const terms =
    exclusion.op === 'removeTarget'
      ? targetsToVariables(exclusion.targets).filter((term) => term.name !== '')
      : [];

  if (terms.length === 0) return [ctl(`${option}=${exclusion.pick}`)];
  return terms.map((term) => ctl(`${option}=${exclusion.pick};${serializeVariable(term)}`));
}

/* ------------------------------------------------------------------ */
/* Цели директивы                                                      */
/* ------------------------------------------------------------------ */

/**
 * Цель директивы `SecRuleUpdateTarget*` — так, как её правит человек.
 *
 * Второй аргумент этих директив — список термов, и знак перед термом решает
 * всё: `!ARGS:q` вычитает цель у правила, `ARGS:q` приписывает ему ещё одну.
 * Это две противоположные правки, отличающиеся одним символом, и набранный
 * руками он и есть самая дорогая опечатка такой строки: `ARGS:q` вместо
 * `!ARGS:q` не снимает ложное срабатывание, а расширяет проверку — и ничем
 * себя не выдаёт, потому что строка остаётся правильной. Поэтому в форме
 * знак не набирают, а выбирают ({@link ExclusionTarget.remove}).
 *
 * Термы одной переменной сведены в одну цель: `!ARGS:a|!ARGS:b` — не два
 * решения, а одно, со списком параметров. Пустой перечень — вся коллекция.
 */
export interface ExclusionTarget {
  /** `!` перед именем: цель у правила вычитают, а не приписывают ему. */
  remove: boolean;
  name: string;
  /** Параметры цели; пустой перечень — вся коллекция. */
  params: string[];
  /**
   * Подсчёт `&`.
   *
   * Бывает только у приписываемой цели: вычитаемую ModSecurity сравнивает с
   * целями правила по имени и параметру, и считающий терм не совпадёт ни с
   * одной из них. Прочитанное из файла модель при этом держит как написано —
   * о мёртвом терме говорит диагностика, а не молча потерянный знак.
   */
  count: boolean;
}

/**
 * Пустая цель директивы.
 *
 * Вычитающая: за этим к `SecRuleUpdateTarget*` и приходят — правило смотрит
 * туда, куда не надо. Приписать цель ею тоже можно, но это решение редкое и
 * принимается отдельно, переключателем.
 */
export function makeExclusionTarget(name = 'ARGS'): ExclusionTarget {
  return { remove: true, name, params: [], count: false };
}

/**
 * Читает второй аргумент директивы как список целей формы.
 *
 * Голый терм в перечень не ложится: `ARGS|ARGS:a` — это по-прежнему вся
 * коллекция и отдельно взятый параметр, ровно как в списке целей правила.
 * Не сливаются и термы с разным знаком: `!ARGS:a|ARGS:b` — две правки в
 * разные стороны, и одной строкой формы их не показать.
 */
export function readExclusionTargets(payload: string): ExclusionTarget[] {
  const targets: ExclusionTarget[] = [];
  /** Цель, в перечень которой ложится очередной параметр. */
  const listing = new Map<string, ExclusionTarget>();

  for (const term of parseVariables(payload)) {
    const key = `${term.exclusion ? '!' : ''}${term.count ? '&' : ''}${term.name}`;

    if (term.selector === undefined) {
      targets.push({ remove: term.exclusion, name: term.name, params: [], count: term.count });
      listing.delete(key);
      continue;
    }

    const host = listing.get(key);
    if (host !== undefined) {
      host.params.push(term.selector);
      continue;
    }

    const listed: ExclusionTarget = {
      remove: term.exclusion,
      name: term.name,
      params: [term.selector],
      count: term.count,
    };
    targets.push(listed);
    listing.set(key, listed);
  }

  return targets;
}

/** Термы одной цели: `!ARGS:a`, `!ARGS:b` — то, чем она уходит в файл. */
function targetTerms(target: ExclusionTarget, signed: boolean): string[] {
  const selectors = target.params.length === 0 ? [undefined] : target.params;
  return selectors.map((selector) =>
    serializeVariable({
      raw: '',
      name: target.name,
      selector: selector === '' ? undefined : selector,
      count: target.count,
      exclusion: signed && target.remove,
    }),
  );
}

/**
 * Собирает цели обратно во второй аргумент директивы.
 *
 * Безымянная цель не пишется вовсе: `!` без имени ModSecurity прочитал бы
 * вычитанием переменной с пустым именем и не нашёл бы по нему ничего. Пустая
 * строка формы — это ещё не набранная цель, и в файле ей соответствует
 * недописанная директива, а не мусорный терм.
 */
export function writeExclusionTargets(targets: ExclusionTarget[]): string {
  return targets
    .filter((target) => target.name !== '')
    .flatMap((target) => targetTerms(target, true))
    .join('|');
}

/**
 * Цель словами — без знака, потому что знак сказан словом.
 *
 * Фраза над полями читается «не проверять `ARGS:q`», и `!` в ней стоял бы
 * вторым отрицанием: тем же самым, но на языке файла.
 */
export function exclusionTargetText(targets: ExclusionTarget[]): string {
  return targets.flatMap((target) => targetTerms(target, false)).join(', ');
}

/** `942100` или `942190-942200`; всё остальное — не выборка по номеру. */
function toRange(arg: string): IdRange | null {
  const single = /^\d+$/.exec(arg);
  if (single !== null) {
    const value = Number.parseInt(arg, 10);
    return { from: value, to: value };
  }

  const range = /^(\d+)-(\d+)$/.exec(arg);
  if (range === null) return null;
  return { from: Number.parseInt(range[1], 10), to: Number.parseInt(range[2], 10) };
}

/**
 * Разбирает одну директиву.
 *
 * Выборка по номеру у `remove` занимает все аргументы, а у `update` —
 * только первый: за ним идёт то, что правилу приписывают.
 */
function readOne(
  statement: DirectiveStatement,
  place: WorkspacePlace,
  kind: ExclusionKind,
): ExclusionDirective {
  const ids: IdRange[] = [];
  const badIds: string[] = [];
  let pattern: string | undefined;
  let rest: string[];

  if (kind.selector === 'id') {
    const selectorArgs = kind.op === 'remove' ? statement.args : statement.args.slice(0, 1);
    for (const arg of selectorArgs) {
      const range = toRange(arg);
      if (range === null) badIds.push(arg);
      else ids.push(range);
    }
    rest = kind.op === 'remove' ? [] : statement.args.slice(1);
  } else {
    pattern = statement.args[0];
    rest = statement.args.slice(1);
  }

  const targets = kind.op === 'updateTarget' ? parseVariables(rest[0] ?? '') : [];
  const actions = kind.op === 'updateAction' ? parseActions(rest[0] ?? '') : [];

  const selectorGiven =
    kind.selector === 'id' ? ids.length > 0 || badIds.length > 0 : (pattern ?? '') !== '';
  const payloadGiven =
    kind.op === 'remove'
      ? true
      : kind.op === 'updateTarget'
        ? targets.length > 0
        : actions.length > 0;

  return {
    source: 'directive',
    place,
    line: statement.span.startLine,
    name: statement.name,
    op: kind.op,
    selector: kind.selector,
    ids,
    pattern,
    targets,
    replaced: kind.op === 'updateTarget' ? rest[1] : undefined,
    actions,
    badIds,
    incomplete: !selectorGiven || !payloadGiven,
  };
}

/**
 * Раскладывает `ctl`-исключение так, как его видят проверки.
 *
 * Выборка по номеру здесь — ровно одна: ни списка, ни второго аргумента.
 * `ctl:ruleRemoveById=1,2` ModSecurity прочитает как один диапазон с именем
 * «1,2» и не найдёт по нему ничего, поэтому всё, что не читается номером или
 * диапазоном, кладётся в `badIds` целиком, а не разбивается на части.
 */
function readCtl(
  statement: SecRuleStatement | SecActionStatement,
  place: WorkspacePlace,
  action: RuleAction,
): ExclusionDirective | null {
  const ctl = splitCtl(action);
  if (ctl === null) return null;

  const ids: IdRange[] = [];
  const badIds: string[] = [];
  if (ctl.selector === 'id') {
    const range = toRange(ctl.pick);
    if (range !== null) ids.push(range);
    else if (ctl.pick !== '') badIds.push(ctl.pick);
  }

  const targets = ctl.op === 'removeTarget' ? parseVariables(ctl.target) : [];
  const selectorGiven = ctl.selector === 'id' ? ids.length > 0 || badIds.length > 0 : ctl.pick !== '';
  const payloadGiven = ctl.op === 'remove' || targets.length > 0;

  return {
    source: 'ctl',
    place,
    line: statement.span.startLine,
    name: `ctl:${ctlOption(ctl.op, ctl.selector)}`,
    op: ctl.op,
    selector: ctl.selector,
    ids,
    pattern: ctl.selector === 'id' ? undefined : ctl.pick,
    targets,
    actions: [],
    badIds,
    incomplete: !selectorGiven || !payloadGiven,
  };
}

/**
 * Исключения файла в порядке следования — и директивы, и `ctl`.
 *
 * Порядок один на всех: он и есть то, по чему потом видно, кто до кого
 * дотянулся. `ctl` берётся из любого утверждения правила, а не только из
 * головы цепочки: в звене он тоже работает, а в модель конструктора
 * действия звеньев не попадают, и заметить его больше нечем.
 *
 * Файл и его номер в порядке включения приходят снаружи: разбор одного файла
 * не знает, каким по счёту его включили, а без этого «ниже» между файлами не
 * сравнить. У одинокого документа они и не нужны.
 */
export function readExclusions(
  statements: ParsedStatement[],
  file: string = LONE_FILE,
  order = 0,
): ExclusionDirective[] {
  const found: ExclusionDirective[] = [];

  statements.forEach((statement, index) => {
    const place: WorkspacePlace = { file, order, index };

    if (statement.kind === 'directive') {
      const kind = KINDS[statement.name.toLowerCase()];
      if (kind !== undefined) found.push(readOne(statement, place, kind));
      return;
    }

    if (statement.kind !== 'SecRule' && statement.kind !== 'SecAction') return;
    for (const action of statement.actions) {
      if (action.name.toLowerCase() !== 'ctl') continue;
      const ctl = readCtl(statement, place, action);
      if (ctl !== null) found.push(ctl);
    }
  });

  return found;
}

/**
 * Фаза, в которой правило работает, когда `phase` не задан.
 *
 * ModSecurity берёт её из `SecDefaultAction`, где по умолчанию стоит
 * `phase:2`. Сравнить порядок исполнения без какого-нибудь числа нельзя, и
 * это единственное, которое можно назвать, не заглядывая в чужой файл.
 */
const DEFAULT_PHASE = 2;

/**
 * Реакции, после которых до остальных правил дело точно не дойдёт.
 *
 * `block` и `allow` сюда не входят намеренно: первый значит то, что назначено
 * в `SecDefaultAction`, у второго область задаётся аргументом. В обоих
 * случаях «дальше ничего не будет» — догадка, а не факт.
 */
const TERMINAL_ACTIONS = new Set(['deny', 'drop', 'redirect', 'proxy']);

/** Правило набора в том виде, в котором его выбирают исключения. */
interface RuleRef {
  /** Файл правила: ключ блока сам по себе в наборе не единственный. */
  file: string;
  key: string;
  id: string;
  /** Номер правила; `NaN`, если `id` не задан или не число. */
  num: number;
  msg: string;
  tags: string[];
  /** Место головной директивы: по нему сравнивается порядок. */
  place: WorkspacePlace;
  /** Последнее утверждение блока: `ctl` может стоять в любом звене цепочки. */
  lastIndex: number;
  /** Фаза правила: порядок исполнения задаёт сначала она, а потом строка. */
  phase: number;
  /** Это `SecRule` с условием, а не безусловный `SecAction`. */
  conditional: boolean;
  /** Реакция правила, обрывающая транзакцию, или пустая строка. */
  stops: string;
}

function toRuleRefs(blocks: VisualBlock[], file: string, order: number): RuleRef[] {
  const refs: RuleRef[] = [];

  for (const block of blocks) {
    // `SecAction` попадает сюда наравне с правилом: у него тоже есть `id`,
    // и снимается он тем же `SecRuleRemoveById`.
    if (block.kind !== 'rule' && block.kind !== 'action') continue;
    const own = block.kind === 'rule' ? block.rule.actions : block.actions;
    const phase = Number.parseInt(own.phase, 10);
    const head = block.kind === 'rule' ? block.rule.headIndex : block.statementIndex;

    refs.push({
      file,
      key: block.key,
      id: own.id,
      num: Number.parseInt(own.id, 10),
      msg: own.msg,
      tags: own.tags,
      place: { file, order, index: head },
      lastIndex: block.kind === 'rule' ? block.rule.tailIndex : block.statementIndex,
      phase: Number.isNaN(phase) ? DEFAULT_PHASE : phase,
      conditional: block.kind === 'rule',
      stops: TERMINAL_ACTIONS.has(own.disruptive) ? own.disruptive : '',
    });
  }

  return refs;
}

/**
 * Правило `a` выполняется раньше правила `b`.
 *
 * Порядок исполнения — не порядок файла: ModSecurity сначала проходит фазу
 * целиком и только внутри неё идёт по строкам. Правило первой фазы,
 * написанное в конце файла, отработает раньше всей второй фазы, и для `ctl`
 * это и есть разница между «исключение есть» и «исключения нет». Строки при
 * равных фазах считаются по набору: файл, включённый раньше, весь раньше.
 */
function runsBefore(a: RuleRef, b: RuleRef): boolean {
  if (a.phase !== b.phase) return a.phase < b.phase;
  return before(a.place, b.place);
}

/** Правила, подходящие под выборку директивы, без учёта порядка строк. */
function selectRules(
  directive: ExclusionDirective,
  rules: RuleRef[],
  byNum: Map<number, RuleRef[]>,
): RuleRef[] {
  if (directive.selector === 'id') {
    const picked: RuleRef[] = [];
    for (const range of directive.ids) {
      if (range.from === range.to) {
        picked.push(...(byNum.get(range.from) ?? []));
        continue;
      }
      // Диапазоны редки, а держать под них ещё один индекс — дороже,
      // чем один раз пройти по правилам.
      for (const rule of rules) {
        if (!Number.isNaN(rule.num) && rule.num >= range.from && rule.num <= range.to) {
          picked.push(rule);
        }
      }
    }
    return picked;
  }

  const { regex } = reviewRegex(directive.pattern ?? '');
  // Шаблон, которого не собрать, не выбирает ничего — сказать, какие правила
  // он имел в виду, всё равно нельзя.
  if (regex === null) return [];

  return rules.filter((rule) =>
    directive.selector === 'msg'
      ? rule.msg !== '' && regex.test(rule.msg)
      : rule.tags.some((tag) => regex.test(tag)),
  );
}

/**
 * Сводит исключения с правилами всего набора.
 *
 * Внутри одна и та же работа для одного файла и для десяти: правила собраны из
 * всех файлов сразу, а различает их место — номер файла в порядке включения и
 * индекс утверждения. Разделять эти два случая было бы разделением того, что
 * ModSecurity не разделяет: включённые файлы для него одна конфигурация.
 */
function indexUnits(units: readonly WorkspaceUnit[], directives: ExclusionDirective[]): ExclusionIndex {
  const names = new Map<string, string>();
  for (const unit of units) names.set(unit.id, unit.name);
  if (directives.length === 0) return { ...emptyExclusionIndex(), names };

  const rules = units.flatMap((unit, order) => toRuleRefs(unit.blocks, unit.id, order));
  const byNum = new Map<number, RuleRef[]>();
  for (const rule of rules) {
    if (Number.isNaN(rule.num)) continue;
    const same = byNum.get(rule.num);
    if (same === undefined) byNum.set(rule.num, [rule]);
    else same.push(rule);
  }

  // Носителя ищут по любому утверждению блока: `ctl` из звена цепочки
  // принадлежит правилу целиком, а фаза и реакция записаны в её голове.
  const byStatement = new Map<string, ExclusionEntry[]>();
  const hostOf = new Map<string, RuleRef>();
  if (directives.some((directive) => directive.source === 'ctl')) {
    for (const rule of rules) {
      for (let index = rule.place.index; index <= rule.lastIndex; index++) {
        hostOf.set(statementRef(rule.file, index), rule);
      }
    }
  }

  // Где живёт сама директива: отсюда правило узнаёт, куда отправить за своим
  // правщиком. Правила пропущены намеренно — `ctl` находит носителя выше, и
  // это единственный случай, когда исключение живёт внутри правила.
  const blockOf = new Map<string, string>();
  for (const unit of units) {
    for (const block of unit.blocks) {
      if (block.kind !== 'rule') {
        blockOf.set(statementRef(unit.id, block.statementIndex), block.key);
      }
    }
  }

  const byRule = new Map<string, RuleEffect>();

  for (const directive of directives) {
    const written = statementRef(directive.place.file, directive.place.index);
    const seen = new Set<string>();
    const matches: ExclusionMatch[] = [];
    const host = directive.source === 'ctl' ? hostOf.get(written) : undefined;

    for (const rule of selectRules(directive, rules, byNum)) {
      const ruleRef = blockRef(rule.file, rule.key);
      if (seen.has(ruleRef)) continue;
      seen.add(ruleRef);

      // Директива применяется при чтении конфигурации, поэтому правило,
      // объявленное ниже, для неё ещё не существует. У `ctl` наоборот: он
      // правит то, до чего движок ещё не дошёл, — а «дошёл» считается по
      // порядку исполнения, где первое слово за фазой.
      const applies =
        directive.source === 'directive'
          ? before(rule.place, directive.place)
          : host !== undefined && runsBefore(host, rule);
      matches.push({ file: rule.file, key: rule.key, id: rule.id, applies });

      if (!applies) continue;

      let effect = byRule.get(ruleRef);
      if (effect === undefined) {
        effect = { removedBy: [], targetEdits: [], actionEdits: [] };
        byRule.set(ruleRef, effect);
      }
      const ref: ExclusionRef = {
        file: directive.place.file,
        key: (directive.source === 'ctl' ? host?.key : blockOf.get(written)) ?? '',
        line: directive.line,
        name: directive.name,
        text: exclusionRecordText(directive),
        source: directive.source,
      };
      if (directive.op === 'remove') effect.removedBy.push(ref);
      else if (directive.op === 'updateAction') effect.actionEdits.push(ref);
      else effect.targetEdits.push(ref);
    }

    const entry: ExclusionEntry = {
      directive,
      matches,
      carrier:
        host === undefined
          ? undefined
          : {
              file: host.file,
              key: host.key,
              id: host.id,
              phase: host.phase,
              conditional: host.conditional,
              stops: host.stops,
            },
    };
    const already = byStatement.get(written);
    if (already === undefined) byStatement.set(written, [entry]);
    else already.push(entry);
  }

  return { byStatement, byRule, names, hasIds: rules.some((rule) => rule.id !== '') };
}

/** Сводит исключения одного файла с его правилами. */
export function indexExclusions(
  blocks: VisualBlock[],
  directives: ExclusionDirective[],
): ExclusionIndex {
  return indexUnits([loneUnit(blocks, [])], directives);
}

/**
 * Разбор и сведение по всему набору.
 *
 * Читается каждый файл своим проходом — номера строк и индексы утверждений у
 * него свои, — а сводятся все сразу: исключение из одного файла снимает
 * правило из другого, и разделить эти два шага значило бы потерять ровно то,
 * ради чего набор держат открытым.
 *
 * Уже прочитанные директивы можно передать готовыми: правка одного файла не
 * меняет разбора остальных, и перечитывать весь набор на каждое нажатие
 * незачем. Порядок в списке при этом обязан быть порядком включения — по нему
 * идут проверки.
 */
export function indexWorkspaceExclusions(
  units: readonly WorkspaceUnit[],
  directives?: ExclusionDirective[],
): ExclusionIndex {
  return indexUnits(
    units,
    directives ?? units.flatMap((unit, order) => readExclusions(unit.statements, unit.id, order)),
  );
}

/**
 * Все исключения набора в порядке следования.
 *
 * `Map` держит порядок вставки, а вставляют в него по порядку включения, — так
 * что это тот же обход, каким исключения читались. Отдельная функция здесь
 * потому, что порядок для исключений значим, и разворачивать индекс на месте
 * каждый раз значило бы каждый раз про это помнить.
 */
export function exclusionList(index: ExclusionIndex): ExclusionEntry[] {
  return [...index.byStatement.values()].flat();
}

/** Разбор и сведение одинокого документа — набор из одного файла. */
export function collectExclusions(
  blocks: VisualBlock[],
  statements: ParsedStatement[],
): ExclusionIndex {
  return indexWorkspaceExclusions([loneUnit(blocks, statements)]);
}

/**
 * Выборка директивы одной строкой: `942100`, `942190-942200`, `attack-xss`.
 *
 * Формат один и тот же для сводки в конструкторе и для подстановки в текст
 * замечания: два разных вида одной и той же выборки читались бы как две
 * разные директивы.
 */
export function exclusionSelectorText(directive: ExclusionDirective): string {
  if (directive.selector !== 'id') return directive.pattern ?? '';

  const parts = directive.ids.map((range) =>
    range.from === range.to ? String(range.from) : `${range.from}-${range.to}`,
  );
  return [...parts, ...directive.badIds].join(' ');
}

/**
 * Исключение одной строкой — так, как оно записывается в файле.
 *
 * Собирается из разобранных частей, а не берётся из исходника, и именно
 * поэтому годится обоим видам исключений: у директивы запись занимает строку
 * целиком, а `ctl` живёт в списке действий, где строка принадлежит правилу и
 * взять её целиком нельзя. Показать разобранное — заодно проверка себя: если
 * редактор прочитал директиву не так, как её написали, это видно сразу.
 */
export function exclusionRecordText(directive: ExclusionDirective): string {
  const selector = exclusionSelectorText(directive);
  const payload =
    directive.op === 'updateAction'
      ? serializeActions(directive.actions)
      : serializeVariables(directive.targets);

  // Точка с запятой — граница внутри одного значения `ctl`, пробел —
  // граница аргументов директивы. Разделители тут и есть вся разница записей.
  if (directive.source === 'ctl') {
    return payload === ''
      ? `${directive.name}=${selector}`
      : `${directive.name}=${selector};${payload}`;
  }

  // Номера кавычек не берут: `SecRuleRemoveById 1 2 3` — это три аргумента, и
  // в кавычках они превратились бы в одно нечитаемое имя. Всё остальное в
  // кавычках всегда — так эти директивы и пишут, а запись, отличающаяся от
  // файла хотя бы кавычками, заставляет сверять её с текстом дважды.
  const parts = [directive.name, directive.selector === 'id' ? selector : dquote(selector)];
  if (payload !== '') parts.push(dquote(payload));
  if (directive.replaced !== undefined) parts.push(dquote(directive.replaced));
  return parts.join(' ');
}

/**
 * Это действие `ctl` — исключение, а не настройка движка.
 *
 * Нужно тому, кто показывает действия правила: `ctl:requestBodyAccess=Off`
 * остаётся в общем списке, а `ctl:ruleRemoveTargetById=942100;ARGS:comment`
 * уходит к исключениям, где о нём есть что сказать. Дважды одну запись
 * показывать нельзя — читающий станет искать между ними разницу.
 */
export function isExclusionCtl(action: RuleAction): boolean {
  return splitCtl(action) !== null;
}

/**
 * Строка, снимающая правило целиком.
 *
 * Выборка по номеру, а не по метке или сообщению: правило называют номером и
 * в журнале, и в разговоре, а `SecRuleRemoveByTag` снял бы вместе с ним
 * половину набора.
 */
export function excludeRuleLine(id: string): string {
  return `SecRuleRemoveById ${id}`;
}

/**
 * Строка, вычитающая у правила цель.
 *
 * `SecRuleUpdateTargetById` с `!` — не «выключить правило для этого поля», а
 * «перестать смотреть в это поле»: правило остаётся в работе и продолжает
 * проверять всё остальное. Это и есть обычное исключение ложного
 * срабатывания, и потому оно предлагается рядом с полным снятием.
 *
 * Параметров бывает несколько, а строка остаётся одна: ModSecurity дописывает
 * к целям правила весь список второго аргумента, и `!ARGS:a|!ARGS:b` вычитает
 * оба. Разделитель — вертикальная черта, как в списке целей правила: она же
 * стоит в панели самой директивы, и записанное здесь читается обратно тем же
 * разбором переменных.
 *
 * Пустой перечень — вся коллекция: `!ARGS` снимает у правила `ARGS` целиком, и
 * так же снимают `!REQUEST_COOKIES`, когда ложное срабатывание приходит не из
 * одного поля.
 */
export function excludeTargetLine(id: string, name: string, selectors: string[] = []): string {
  const targets: RuleVariable[] = (selectors.length === 0 ? [''] : selectors).map((selector) => ({
    raw: '',
    name,
    selector: selector === '' ? undefined : selector,
    count: false,
    exclusion: true,
  }));
  return `SecRuleUpdateTargetById ${id} ${dquote(serializeVariables(targets))}`;
}

/**
 * Отпечаток исключения: по нему видно, что второе делает то же самое.
 *
 * Происхождение входит в отпечаток, потому что директива и `ctl` с одной и той
 * же выборкой — не повтор: первая снимает правило навсегда, второй — на один
 * запрос, и одно другого не заменяет.
 */
export function exclusionSignature(directive: ExclusionDirective): string {
  const payload =
    directive.op === 'updateAction'
      ? directive.actions.map((action) => action.raw).join(',')
      : directive.targets.map((target) => target.raw).join('|');

  return [
    directive.source,
    directive.op,
    directive.selector,
    exclusionSelectorText(directive),
    payload,
    directive.replaced ?? '',
  ].join(':');
}

/** Правило снято исключением целиком. */
export function isRemoved(effect: RuleEffect | undefined): boolean {
  return effect !== undefined && effect.removedBy.length > 0;
}
