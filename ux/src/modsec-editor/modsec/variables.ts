import { readSetvarTarget, SETVAR_COLLECTIONS } from './setvar';
import { before } from './workspace';
import type { VisualActions, VisualTarget } from './model';
import type { RuleAction } from './types';
import type { WorkspacePlace, WorkspaceUnit } from './workspace';

export type VariableUse = 'set' | 'add' | 'sub' | 'delete' | 'expire' | 'read';

export interface VariableSite {
  file: string;
  key: string;
  id: string;
  line: number;
  phase: number;
  place: WorkspacePlace;
  use: VariableUse;
  text: string;
}

export interface VariableEntry {
  collection: string;
  name: string;
  writes: VariableSite[];
  reads: VariableSite[];
}

export interface VariableIndex {
  byName: Map<string, VariableEntry>;
  inits: Map<string, VariableSite[]>;
  names: Map<string, string>;
}

export function emptyVariableIndex(): VariableIndex {
  return { byName: new Map(), inits: new Map(), names: new Map() };
}

export function variableKey(collection: string, name: string): string {
  return `${collection.toLowerCase()}.${name.toLowerCase()}`;
}

const DEFAULT_PHASE = 2;

const EXPIRY_ACTIONS = new Set(['expirevar', 'deprecatevar']);

const INIT_ACTIONS: Record<string, string | null> = {
  initcol: null,
  setsid: 'session',
  setuid: 'user',
  setrsc: 'resource',
};

const PLAIN_NAME = /^[A-Za-z_][\w.-]*$/;

const MACRO = /%\{([A-Za-z_]\w*)[.:]([\w.-]+)\}/g;

function writable(collection: string): boolean {
  return (SETVAR_COLLECTIONS as readonly string[]).includes(collection);
}

interface Host {
  file: string;
  order: number;
  key: string;
  id: string;
  phase: number;
}

export function indexWorkspaceVariables(units: readonly WorkspaceUnit[]): VariableIndex {
  const index = emptyVariableIndex();
  for (const unit of units) index.names.set(unit.id, unit.name);

  units.forEach((unit, order) => {
    for (const block of unit.blocks) {
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

function actionList(actions: VisualActions): RuleAction[] {
  return [
    ...actions.setvar.map((value) => ({ raw: '', name: 'setvar', value, quoted: false })),
    ...actions.extra,
  ];
}

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

export function lookupVariable(
  index: VariableIndex,
  collection: string,
  name: string,
): VariableEntry | null {
  return index.byName.get(variableKey(collection, name)) ?? null;
}

export function collectionVariables(index: VariableIndex, collection: string): string[] {
  const wanted = collection.toLowerCase();
  const names: string[] = [];
  for (const entry of index.byName.values()) {
    if (entry.collection === wanted) names.push(entry.name);
  }
  return names.sort();
}

export function siteRunsBefore(a: VariableSite, b: VariableSite): boolean {
  if (a.phase !== b.phase) return a.phase < b.phase;
  return before(a.place, b.place);
}

export function readBeforeSet(entry: VariableEntry): boolean {
  if (entry.writes.length === 0 || entry.reads.length === 0) return false;

  const earliest = (sites: VariableSite[]) =>
    sites.reduce((first, site) => (siteRunsBefore(site, first) ? site : first));

  return siteRunsBefore(earliest(entry.reads), earliest(entry.writes));
}
