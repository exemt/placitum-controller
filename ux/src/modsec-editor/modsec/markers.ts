import { serializeAction } from './serialize';
import type { VisualBlock } from './model';
import type { RuleAction } from './types';
import type { WorkspaceUnit } from './workspace';

export interface MarkerRefSite {
  file: string;
  key: string;
  id: string;
  line: number;
  text: string;
}

export interface MarkerRefIndex {
  byLabel: Map<string, MarkerRefSite[]>;
}

export function emptyMarkerRefIndex(): MarkerRefIndex {
  return { byLabel: new Map() };
}

export function indexWorkspaceMarkerRefs(units: readonly WorkspaceUnit[]): MarkerRefIndex {
  const index = emptyMarkerRefIndex();

  for (const unit of units) {
    for (const block of unit.blocks) {
      if (block.kind !== 'rule' && block.kind !== 'action') continue;

      const actions = block.kind === 'rule' ? block.rule.actions : block.actions;
      const head = block.kind === 'rule' ? block.rule.headIndex : block.statementIndex;

      collectSkipAfter(index, unit, block, actions.extra, head);

      if (block.kind !== 'rule') continue;
      for (const condition of block.rule.conditions) {
        const at = condition.statementIndex === -1 ? head : condition.statementIndex;
        collectSkipAfter(index, unit, block, condition.extra, at);
      }
    }
  }

  return index;
}

function collectSkipAfter(
  index: MarkerRefIndex,
  unit: WorkspaceUnit,
  block: VisualBlock,
  actions: readonly RuleAction[],
  statementIndex: number,
): void {
  const id =
    block.kind === 'rule'
      ? block.rule.actions.id
      : block.kind === 'action'
        ? block.actions.id
        : '';

  for (const action of actions) {
    if (action.name.toLowerCase() !== 'skipafter') continue;
    const label = action.value ?? '';
    if (label === '') continue;

    const site: MarkerRefSite = {
      file: unit.id,
      key: block.key,
      id,
      line: unit.statements[statementIndex]?.span.startLine ?? 0,
      text: serializeAction(action),
    };

    const list = index.byLabel.get(label);
    if (list === undefined) index.byLabel.set(label, [site]);
    else list.push(site);
  }
}

export function lookupMarkerRefs(index: MarkerRefIndex, label: string): MarkerRefSite[] {
  if (label === '') return [];
  return index.byLabel.get(label) ?? [];
}
