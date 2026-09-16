import type { DirectiveForm } from './directives';
import type { RuleAction, RuleVariable } from './types';
import type { DisruptiveAction, TargetLike } from './semantics';

export interface VisualTarget extends TargetLike {}

export interface VisualOperator {
  name: string;
  negated: boolean;
  argument: string;
}

export interface VisualCondition {
  key: string;
  statementIndex: number;
  comments: string[];
  targets: VisualTarget[];
  transforms: string[];
  extra: RuleAction[];
  operator: VisualOperator;
}

export interface VisualActions {
  id: string;
  phase: string;
  disruptive: DisruptiveAction | '';
  disruptiveValue: string;
  status: string;
  msg: string;
  logdata: string;
  severity: string;
  ver: string;
  rev: string;
  maturity: string;
  accuracy: string;
  tags: string[];
  capture: boolean;
  log: boolean | null;
  auditlog: boolean | null;
  setvar: string[];
  extra: RuleAction[];
}

export interface VisualRule {
  key: string;
  startIndex: number;
  headIndex: number;
  tailIndex: number;
  comments: string[];
  conditions: VisualCondition[];
  actions: VisualActions;
}

export interface VisualActionBlock {
  kind: 'action';
  key: string;
  startIndex: number;
  statementIndex: number;
  comments: string[];
  actions: VisualActions;
}

interface VisualLineBlock {
  key: string;
  startIndex: number;
  statementIndex: number;
  comments: string[];
  text: string;
}

export interface VisualMarkerBlock extends VisualLineBlock {
  kind: 'marker';
  label: string;
}

export interface VisualDirectiveBlock extends VisualLineBlock {
  kind: 'directive';
  name: string;
  args: string[];
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

export function blockRange(block: VisualBlock): [number, number] {
  return block.kind === 'rule'
    ? [block.rule.startIndex, block.rule.tailIndex]
    : [block.startIndex, block.statementIndex];
}

export function findRule(model: VisualModel | null, key: string | undefined): VisualRule | null {
  if (model === null || key === undefined) return null;
  for (const block of model.blocks) {
    if (block.kind === 'rule' && block.key === key) return block.rule;
  }
  return null;
}

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

export function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

export function makeTarget(name = 'ARGS'): VisualTarget {
  return { name, count: false, mode: 'only', params: [] };
}

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

export function groupTargets(variables: RuleVariable[]): VisualTarget[] {
  const targets: VisualTarget[] = [];
  const listing = new Map<string, VisualTarget>();
  const subtractable = new Map<string, VisualTarget>();

  for (const v of variables) {
    if (v.exclusion) {
      const host = subtractable.get(v.name);
      if (host) {
        host.mode = 'except';
        host.params.push(v.selector ?? '');
        continue;
      }
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
