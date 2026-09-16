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

export type ExclusionOp = 'remove' | 'removeTarget' | 'updateTarget' | 'updateAction';

export type ExclusionSelector = 'id' | 'msg' | 'tag';

export type ExclusionSource = 'directive' | 'ctl';

export interface IdRange {
  from: number;
  to: number;
}

export interface ExclusionDirective {
  source: ExclusionSource;
  place: WorkspacePlace;
  line: number;
  name: string;
  op: ExclusionOp;
  selector: ExclusionSelector;
  ids: IdRange[];
  pattern?: string;
  targets: RuleVariable[];
  replaced?: string;
  actions: RuleAction[];
  badIds: string[];
  incomplete: boolean;
}

export interface ExclusionMatch {
  file: string;
  key: string;
  id: string;
  applies: boolean;
}

export interface ExclusionCarrier {
  file: string;
  key: string;
  id: string;
  phase: number;
  conditional: boolean;
  stops: string;
}

export interface ExclusionEntry {
  directive: ExclusionDirective;
  matches: ExclusionMatch[];
  carrier?: ExclusionCarrier;
}

export interface ExclusionRef {
  file: string;
  key: string;
  line: number;
  name: string;
  text: string;
  source: ExclusionSource;
}

export interface RuleEffect {
  removedBy: ExclusionRef[];
  targetEdits: ExclusionRef[];
  actionEdits: ExclusionRef[];
}

export interface ExclusionIndex {
  byStatement: Map<string, ExclusionEntry[]>;
  byRule: Map<string, RuleEffect>;
  names: Map<string, string>;
  hasIds: boolean;
}

export function emptyExclusionIndex(): ExclusionIndex {
  return { byStatement: new Map(), byRule: new Map(), names: new Map(), hasIds: false };
}

export interface ExclusionKind {
  op: ExclusionOp;
  selector: ExclusionSelector;
}

const KINDS: Record<string, ExclusionKind> = {
  secruleremovebyid: { op: 'remove', selector: 'id' },
  secruleremovebymsg: { op: 'remove', selector: 'msg' },
  secruleremovebytag: { op: 'remove', selector: 'tag' },
  secruleupdatetargetbyid: { op: 'updateTarget', selector: 'id' },
  secruleupdatetargetbymsg: { op: 'updateTarget', selector: 'msg' },
  secruleupdatetargetbytag: { op: 'updateTarget', selector: 'tag' },
  secruleupdateactionbyid: { op: 'updateAction', selector: 'id' },
};

export function exclusionDirectiveKind(name: string): ExclusionKind | null {
  return KINDS[name.toLowerCase()] ?? null;
}

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

export interface CtlExclusion {
  op: 'remove' | 'removeTarget';
  selector: ExclusionSelector;
  pick: string;
  targets: VisualTarget[];
}

export function ctlOption(op: CtlExclusion['op'], selector: ExclusionSelector): string {
  const found = CTL_EXCLUSION_OPTIONS.find((option) => {
    const kind = CTL_KINDS[option.toLowerCase()];
    return kind.op === op && kind.selector === selector;
  });
  return found ?? '';
}

export interface CtlExclusionKind {
  option: string;
  op: CtlExclusion['op'];
  selector: ExclusionSelector;
}

export const CTL_EXCLUSION_KINDS: CtlExclusionKind[] = CTL_EXCLUSION_OPTIONS.map((option) => {
  const kind = CTL_KINDS[option.toLowerCase()];
  return { option, op: kind.op === 'remove' ? 'remove' : 'removeTarget', selector: kind.selector };
});

interface CtlParts {
  op: CtlExclusion['op'];
  selector: ExclusionSelector;
  pick: string;
  target: string;
}

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

export function readCtlExclusion(action: RuleAction): CtlExclusion | null {
  const parts = splitCtl(action);
  if (parts === null) return null;

  const { op, selector, pick } = parts;
  return { op, selector, pick, targets: groupTargets(parseVariables(parts.target)) };
}

export interface CtlExclusionRun {
  at: number[];
  value: CtlExclusion;
}

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

export function ctlExclusionActions(exclusion: CtlExclusion): RuleAction[] {
  const option = ctlOption(exclusion.op, exclusion.selector);
  const ctl = (value: string): RuleAction => ({ raw: '', name: 'ctl', value, quoted: false });

  const terms =
    exclusion.op === 'removeTarget'
      ? targetsToVariables(exclusion.targets).filter((term) => term.name !== '')
      : [];

  if (terms.length === 0) return [ctl(`${option}=${exclusion.pick}`)];
  return terms.map((term) => ctl(`${option}=${exclusion.pick};${serializeVariable(term)}`));
}

export interface ExclusionTarget {
  remove: boolean;
  name: string;
  params: string[];
  count: boolean;
}

export function makeExclusionTarget(name = 'ARGS'): ExclusionTarget {
  return { remove: true, name, params: [], count: false };
}

export function readExclusionTargets(payload: string): ExclusionTarget[] {
  const targets: ExclusionTarget[] = [];
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

export function writeExclusionTargets(targets: ExclusionTarget[]): string {
  return targets
    .filter((target) => target.name !== '')
    .flatMap((target) => targetTerms(target, true))
    .join('|');
}

export function exclusionTargetText(targets: ExclusionTarget[]): string {
  return targets.flatMap((target) => targetTerms(target, false)).join(', ');
}

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

const DEFAULT_PHASE = 2;

const TERMINAL_ACTIONS = new Set(['deny', 'drop', 'redirect', 'proxy']);

interface RuleRef {
  file: string;
  key: string;
  id: string;
  num: number;
  msg: string;
  tags: string[];
  place: WorkspacePlace;
  lastIndex: number;
  phase: number;
  conditional: boolean;
  stops: string;
}

function toRuleRefs(blocks: VisualBlock[], file: string, order: number): RuleRef[] {
  const refs: RuleRef[] = [];

  for (const block of blocks) {
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

function runsBefore(a: RuleRef, b: RuleRef): boolean {
  if (a.phase !== b.phase) return a.phase < b.phase;
  return before(a.place, b.place);
}

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
      for (const rule of rules) {
        if (!Number.isNaN(rule.num) && rule.num >= range.from && rule.num <= range.to) {
          picked.push(rule);
        }
      }
    }
    return picked;
  }

  const { regex } = reviewRegex(directive.pattern ?? '');
  if (regex === null) return [];

  return rules.filter((rule) =>
    directive.selector === 'msg'
      ? rule.msg !== '' && regex.test(rule.msg)
      : rule.tags.some((tag) => regex.test(tag)),
  );
}

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

  const byStatement = new Map<string, ExclusionEntry[]>();
  const hostOf = new Map<string, RuleRef>();
  if (directives.some((directive) => directive.source === 'ctl')) {
    for (const rule of rules) {
      for (let index = rule.place.index; index <= rule.lastIndex; index++) {
        hostOf.set(statementRef(rule.file, index), rule);
      }
    }
  }

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

export function indexExclusions(
  blocks: VisualBlock[],
  directives: ExclusionDirective[],
): ExclusionIndex {
  return indexUnits([loneUnit(blocks, [])], directives);
}

export function indexWorkspaceExclusions(
  units: readonly WorkspaceUnit[],
  directives?: ExclusionDirective[],
): ExclusionIndex {
  return indexUnits(
    units,
    directives ?? units.flatMap((unit, order) => readExclusions(unit.statements, unit.id, order)),
  );
}

export function exclusionList(index: ExclusionIndex): ExclusionEntry[] {
  return [...index.byStatement.values()].flat();
}

export function collectExclusions(
  blocks: VisualBlock[],
  statements: ParsedStatement[],
): ExclusionIndex {
  return indexWorkspaceExclusions([loneUnit(blocks, statements)]);
}

export function exclusionSelectorText(directive: ExclusionDirective): string {
  if (directive.selector !== 'id') return directive.pattern ?? '';

  const parts = directive.ids.map((range) =>
    range.from === range.to ? String(range.from) : `${range.from}-${range.to}`,
  );
  return [...parts, ...directive.badIds].join(' ');
}

export function exclusionRecordText(directive: ExclusionDirective): string {
  const selector = exclusionSelectorText(directive);
  const payload =
    directive.op === 'updateAction'
      ? serializeActions(directive.actions)
      : serializeVariables(directive.targets);

  if (directive.source === 'ctl') {
    return payload === ''
      ? `${directive.name}=${selector}`
      : `${directive.name}=${selector};${payload}`;
  }

  const parts = [directive.name, directive.selector === 'id' ? selector : dquote(selector)];
  if (payload !== '') parts.push(dquote(payload));
  if (directive.replaced !== undefined) parts.push(dquote(directive.replaced));
  return parts.join(' ');
}

export function isExclusionCtl(action: RuleAction): boolean {
  return splitCtl(action) !== null;
}

export function excludeRuleLine(id: string): string {
  return `SecRuleRemoveById ${id}`;
}

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

export function isRemoved(effect: RuleEffect | undefined): boolean {
  return effect !== undefined && effect.removedBy.length > 0;
}
