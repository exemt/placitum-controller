/**
 * Индекс переменных набора: где каждая выставляется и где читается.
 *
 * Переменная — вторая запись файла, чей смысл лежит не в ней самой. Строка
 * `setvar:tx.block_flag=1` не говорит ни того, что этот флаг кто-то читает, ни
 * того, что читающее правило стоит в первой фазе, а выставляющее — во второй,
 * и до чтения дело не дойдёт никогда. Ответ на оба вопроса — в других строках,
 * и в других файлах: коллекция транзакции общая на весь набор, и `tx.score` из
 * надстройки — то же самое `tx.score`.
 *
 * Поэтому индекс собирается по набору, как индекс исключений, и хранит не
 * признак «переменная известна», а места: файл, строку, правило и то, что
 * именно там сделано — положили, прибавили, удалили, прочитали. Признака
 * хватало бы диагностике («ничто не выставляет `tx.foo`»), но не подсказке: на
 * вопрос «где объявлена» отвечают строкой, а не словом «да».
 *
 * Чтением считается и цель правила (`SecRule TX:score`), и макрос в любом
 * значении (`%{tx.score}` в `msg`, в аргументе оператора, в другом `setvar`).
 * Разделять их незачем: и то и другое — место, из которого переменную видно, и
 * если таких мест нет вовсе, запись не значит ничего.
 */

import { readSetvarTarget, SETVAR_COLLECTIONS } from './setvar';
import { before } from './workspace';
import type { VisualActions, VisualTarget } from './model';
import type { RuleAction } from './types';
import type { WorkspacePlace, WorkspaceUnit } from './workspace';

/**
 * Что с переменной сделано в этом месте.
 *
 * Четыре записи из `setvar`, `expire` от `expirevar` с `deprecatevar` и
 * `read` на все виды чтения. `expire` стоит отдельно от `set` не ради
 * полноты: срок жизни задают переменной, которая уже есть, и запись,
 * назначающая срок несуществующему счётчику, — обычная опечатка, которую по
 * списку мест видно сразу.
 */
export type VariableUse = 'set' | 'add' | 'sub' | 'delete' | 'expire' | 'read';

/** Место, в котором переменную выставляют или читают. */
export interface VariableSite {
  /**
   * Файл записи.
   *
   * Ключ блока считается внутри файла, и без имени файла строка 12 ведёт
   * не туда: переменную выставляют как раз в соседнем файле-настройке.
   */
  file: string;
  /** Ключ блока модели — по нему конструктор находит карточку. */
  key: string;
  /** `id` правила или пустая строка, если его нет. */
  id: string;
  line: number;
  /** Фаза правила; при отсутствии `phase` — та, что берётся по умолчанию. */
  phase: number;
  /** Место в наборе: по нему сравнивается порядок исполнения. */
  place: WorkspacePlace;
  use: VariableUse;
  /** Сама запись: `setvar:tx.score=+5`, `TX:score`, `%{tx.score}`. */
  text: string;
}

/** Одна переменная и все её места в наборе. */
export interface VariableEntry {
  collection: string;
  /** Имя в нижнем регистре: ModSecurity различает переменные без учёта регистра. */
  name: string;
  writes: VariableSite[];
  reads: VariableSite[];
}

export interface VariableIndex {
  /** `tx.score` → её места. Ключ считает {@link variableKey}. */
  byName: Map<string, VariableEntry>;
  /**
   * Коллекция → места, в которых её открывают: `initcol`, `setsid`, `setuid`.
   *
   * У долгоживущей коллекции это условие работы, а не подробность: без
   * `initcol` запись в `ip.counter` теряется по концу запроса, и сказать об
   * этом можно только про коллекцию целиком, а не про переменную.
   */
  inits: Map<string, VariableSite[]>;
  /** Имена файлов набора: идентификатор → имя. */
  names: Map<string, string>;
}

export function emptyVariableIndex(): VariableIndex {
  return { byName: new Map(), inits: new Map(), names: new Map() };
}

/** Ключ переменной в индексе: коллекция и имя, оба в нижнем регистре. */
export function variableKey(collection: string, name: string): string {
  return `${collection.toLowerCase()}.${name.toLowerCase()}`;
}

/** Фаза, в которой правило работает, если она не написана явно. */
const DEFAULT_PHASE = 2;

/** Действия, назначающие срок жизни уже выставленной переменной. */
const EXPIRY_ACTIONS = new Set(['expirevar', 'deprecatevar']);

/** Действие, открывающее коллекцию, → коллекция, которую оно открывает. */
const INIT_ACTIONS: Record<string, string | null> = {
  // У `initcol` коллекция названа в самой записи: `initcol:ip=%{remote_addr}`.
  initcol: null,
  setsid: 'session',
  setuid: 'user',
  setrsc: 'resource',
};

/**
 * Имя, по которому переменную можно найти: без макросов и шаблонов.
 *
 * Цифра в начале отсечена нарочно: `TX:1` — это захваченная группа, её
 * выставляет `capture`, а не `setvar`, и искать её среди присвоений
 * бессмысленно.
 */
const PLAIN_NAME = /^[A-Za-z_][\w.-]*$/;

/** Ссылка на переменную внутри значения: `%{tx.score}`, `%{IP.dos_block}`. */
const MACRO = /%\{([A-Za-z_]\w*)[.:]([\w.-]+)\}/g;

function writable(collection: string): boolean {
  return (SETVAR_COLLECTIONS as readonly string[]).includes(collection);
}

/** Что известно о правиле всем его записям сразу. */
interface Host {
  file: string;
  order: number;
  key: string;
  id: string;
  phase: number;
}

/**
 * Собирает индекс по набору файлов.
 *
 * Порядок включения входит в места записей, поэтому считается по набору
 * целиком: сравнить «выставлено раньше, чем прочитано» внутри одного файла
 * можно и без набора, а между файлами — нельзя.
 */
export function indexWorkspaceVariables(units: readonly WorkspaceUnit[]): VariableIndex {
  const index = emptyVariableIndex();
  for (const unit of units) index.names.set(unit.id, unit.name);

  units.forEach((unit, order) => {
    for (const block of unit.blocks) {
      // `SecAction` попадает сюда наравне с правилом: ради `setvar` его и
      // пишут — в файлах-настройках CRS это самый частый блок.
      if (block.kind !== 'rule' && block.kind !== 'action') continue;

      const actions = block.kind === 'rule' ? block.rule.actions : block.actions;
      const host: Host = {
        file: unit.id,
        order,
        key: block.key,
        id: actions.id,
        phase: rulePhase(actions),
      };

      const head = block.kind === 'rule' ? block.rule.headIndex : block.statementIndex;
      const put = (statementIndex: number, use: VariableUse, text: string) =>
        siteAt(unit, host, statementIndex, use, text);

      readActions(index, actionList(actions), (use, text) => put(head, use, text));
      for (const text of macroCarriers(actions)) {
        readMacros(index, text, (use, found) => put(head, use, found));
      }

      if (block.kind !== 'rule') continue;

      for (const condition of block.rule.conditions) {
        const at = condition.statementIndex === -1 ? head : condition.statementIndex;
        readActions(index, condition.extra, (use, text) => put(at, use, text));
        for (const target of condition.targets) {
          readTarget(index, target, (text) => put(at, 'read', text));
        }
        readMacros(index, condition.operator.argument, (use, found) => put(at, use, found));
        for (const action of condition.extra) {
          readMacros(index, action.value ?? '', (use, found) => put(at, use, found));
        }
      }
    }
  });

  return index;
}

/** Фаза правила: порядок исполнения задаёт сначала она, а потом строка. */
function rulePhase(actions: VisualActions): number {
  const phase = Number.parseInt(actions.phase, 10);
  return Number.isNaN(phase) ? DEFAULT_PHASE : phase;
}

function siteAt(
  unit: WorkspaceUnit,
  host: Host,
  statementIndex: number,
  use: VariableUse,
  text: string,
): VariableSite {
  return {
    file: host.file,
    key: host.key,
    id: host.id,
    line: unit.statements[statementIndex]?.span.startLine ?? 0,
    phase: host.phase,
    place: { file: host.file, order: host.order, index: statementIndex },
    use,
    text,
  };
}

/**
 * Действия правила плоским списком.
 *
 * `setvar` в форме лежит своим полем, остальное — в `extra`, но индексу эта
 * разница не нужна: и то и другое одинаково пишет в коллекцию.
 */
function actionList(actions: VisualActions): RuleAction[] {
  return [
    ...actions.setvar.map((value) => ({ raw: '', name: 'setvar', value, quoted: false })),
    ...actions.extra,
  ];
}

/** Всё, в чём может встретиться макрос со ссылкой на переменную. */
function macroCarriers(actions: VisualActions): string[] {
  return [
    actions.msg,
    actions.logdata,
    actions.disruptiveValue,
    ...actions.tags,
    ...actions.setvar,
    ...actions.extra.map((action) => action.value ?? ''),
  ];
}

/** Куда `setvar` из этой записи пишет и что делает. */
function setvarUse(value: string): VariableUse {
  if (value.trimStart().startsWith('!')) return 'delete';
  const eq = value.indexOf('=');
  if (eq === -1) return 'set';
  const right = value.slice(eq + 1);
  if (right.startsWith('+')) return 'add';
  if (right.startsWith('-')) return 'sub';
  return 'set';
}

function readActions(
  index: VariableIndex,
  actions: readonly RuleAction[],
  place: (use: VariableUse, text: string) => VariableSite,
): void {
  for (const action of actions) {
    const value = action.value ?? '';
    const name = action.name.toLowerCase();

    if (name === 'setvar' || EXPIRY_ACTIONS.has(name)) {
      const target = readSetvarTarget(value);
      if (target === null || !writable(target.collection)) continue;
      const use = name === 'setvar' ? setvarUse(value) : 'expire';
      add(index, target.collection, target.name, place(use, `${name}:${value}`));
      continue;
    }

    if (!(name in INIT_ACTIONS)) continue;
    const fixed = INIT_ACTIONS[name];
    const collection = fixed ?? value.slice(0, Math.max(0, value.indexOf('='))).toLowerCase();
    if (collection === '') continue;
    const site = place('set', `${name}:${value}`);
    const known = index.inits.get(collection);
    if (known === undefined) index.inits.set(collection, [site]);
    else known.push(site);
  }
}

/**
 * Чтение переменной целью правила.
 *
 * Читают только перечисленные параметры: у `TX` без параметра нет значения
 * вовсе, а вычитающий терм (`!TX:foo`) не читает переменную, а убирает её из
 * набора целей. Захваченные группы (`TX:1`) и шаблоны (`TX:/^score_/`)
 * выставляет не `setvar`, и искать их среди присвоений бессмысленно.
 */
function readTarget(
  index: VariableIndex,
  target: VisualTarget,
  place: (text: string) => VariableSite,
): void {
  const collection = target.name.toLowerCase();
  if (!writable(collection) || target.mode !== 'only') return;

  for (const param of target.params) {
    if (!PLAIN_NAME.test(param)) continue;
    const prefix = target.count ? '&' : '';
    add(index, collection, param, place(`${prefix}${target.name}:${param}`));
  }
}

/** Чтение переменной макросом внутри значения. */
function readMacros(
  index: VariableIndex,
  text: string,
  place: (use: VariableUse, text: string) => VariableSite,
): void {
  if (text === '') return;

  for (const match of text.matchAll(MACRO)) {
    const collection = match[1].toLowerCase();
    if (!writable(collection) || !PLAIN_NAME.test(match[2])) continue;
    add(index, collection, match[2], place('read', match[0]));
  }
}

function add(index: VariableIndex, collection: string, name: string, site: VariableSite): void {
  const key = variableKey(collection, name);
  let entry = index.byName.get(key);
  if (entry === undefined) {
    entry = { collection, name: name.toLowerCase(), writes: [], reads: [] };
    index.byName.set(key, entry);
  }

  if (site.use === 'read') entry.reads.push(site);
  else entry.writes.push(site);
}

/** Что известно набору об этой переменной; `null` — она в нём не встречается. */
export function lookupVariable(
  index: VariableIndex,
  collection: string,
  name: string,
): VariableEntry | null {
  return index.byName.get(variableKey(collection, name)) ?? null;
}

/** Имена переменных коллекции, встречающиеся в наборе, по алфавиту. */
export function collectionVariables(index: VariableIndex, collection: string): string[] {
  const wanted = collection.toLowerCase();
  const names: string[] = [];
  for (const entry of index.byName.values()) {
    if (entry.collection === wanted) names.push(entry.name);
  }
  return names.sort();
}

/**
 * Запись `a` выполняется раньше записи `b`.
 *
 * Порядок исполнения — не порядок файла: ModSecurity сначала проходит фазу
 * целиком и только внутри неё идёт по строкам. `setvar` из пятой фазы,
 * написанный в начале файла, случится позже чтения во второй, и для
 * переменной это и есть разница между «значение есть» и «значения нет».
 */
export function siteRunsBefore(a: VariableSite, b: VariableSite): boolean {
  if (a.phase !== b.phase) return a.phase < b.phase;
  return before(a.place, b.place);
}

/**
 * Переменную читают раньше, чем ей что-нибудь присваивают.
 *
 * Считается по первому чтению и первой записи, а не по каждой паре: чтение
 * до первой записи означает пустое значение, а сравнение оператором с пустым
 * значением — это или всегда ложь, или всегда истина.
 *
 * Накопительный счёт этим не задевается: `setvar:tx.score=+1` — это запись,
 * и первая запись у неё стоит раньше порогового правила, которое её читает.
 */
export function readBeforeSet(entry: VariableEntry): boolean {
  if (entry.writes.length === 0 || entry.reads.length === 0) return false;

  const earliest = (sites: VariableSite[]) =>
    sites.reduce((first, site) => (siteRunsBefore(site, first) ? site : first));

  return siteRunsBefore(earliest(entry.reads), earliest(entry.writes));
}
