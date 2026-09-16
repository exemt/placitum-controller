import { blockRange } from './model';
import type { VisualBlock } from './model';
import type { ParsedStatement } from './types';

export interface BlockSnippet {
  text: string;
  startLine: number;
  endLine: number;
}

export interface RuleLocation {
  file: string;
  key: string;
  id: string;
  startLine: number;
  endLine: number;
}

export interface MarkerLocation {
  file: string;
  key: string;
  label: string;
  startLine: number;
  endLine: number;
}

export interface RuleIndexUnit {
  id: string;
  blocks: readonly VisualBlock[];
  statements: readonly ParsedStatement[];
}

function spanOf(
  unit: RuleIndexUnit,
  block: VisualBlock,
): { startLine: number; endLine: number } | null {
  const [from, to] = blockRange(block);
  const first = unit.statements[from];
  const last = unit.statements[to];
  if (first === undefined || last === undefined) return null;
  return { startLine: first.span.startLine, endLine: last.span.endLine };
}

function ruleLocationOf(
  unit: RuleIndexUnit,
  block: VisualBlock,
  id: string,
): RuleLocation | null {
  const span = spanOf(unit, block);
  if (span === null) return null;
  return { file: unit.id, key: block.key, id, ...span };
}

function markerLocationOf(
  unit: RuleIndexUnit,
  block: VisualBlock,
  label: string,
): MarkerLocation | null {
  const span = spanOf(unit, block);
  if (span === null) return null;
  return { file: unit.id, key: block.key, label, ...span };
}

function idOf(block: VisualBlock): string | null {
  if (block.kind === 'rule') return block.rule.actions.id;
  if (block.kind === 'action') return block.actions.id;
  return null;
}

export function locateRule(
  units: readonly RuleIndexUnit[],
  id: string,
): RuleLocation | null {
  if (id === '') return null;

  for (const unit of units) {
    for (const block of unit.blocks) {
      const own = idOf(block);
      if (own !== id) continue;
      const found = ruleLocationOf(unit, block, id);
      if (found !== null) return found;
    }
  }
  return null;
}

export function indexRulesById(
  units: readonly RuleIndexUnit[],
): Map<string, RuleLocation> {
  const map = new Map<string, RuleLocation>();
  for (const unit of units) {
    for (const block of unit.blocks) {
      const id = idOf(block);
      if (id === null || id === '' || map.has(id)) continue;
      const found = ruleLocationOf(unit, block, id);
      if (found !== null) map.set(id, found);
    }
  }
  return map;
}

export function locateMarker(
  units: readonly RuleIndexUnit[],
  label: string,
): MarkerLocation | null {
  if (label === '') return null;

  for (const unit of units) {
    for (const block of unit.blocks) {
      if (block.kind !== 'marker' || block.label !== label) continue;
      const found = markerLocationOf(unit, block, label);
      if (found !== null) return found;
    }
  }
  return null;
}

export function indexMarkersByLabel(
  units: readonly RuleIndexUnit[],
): Map<string, MarkerLocation> {
  const map = new Map<string, MarkerLocation>();
  for (const unit of units) {
    for (const block of unit.blocks) {
      if (block.kind !== 'marker') continue;
      if (block.label === '' || map.has(block.label)) continue;
      const found = markerLocationOf(unit, block, block.label);
      if (found !== null) map.set(block.label, found);
    }
  }
  return map;
}

export function blockSnippet(
  blocks: readonly VisualBlock[],
  statements: readonly ParsedStatement[],
  key: string,
): BlockSnippet | null {
  const block = blocks.find((item) => item.key === key);
  if (block === undefined) return null;

  const [from, to] = blockRange(block);
  const slice = statements.slice(from, to + 1);
  if (slice.length === 0) return null;

  return {
    text: slice.map((statement) => statement.raw).join('\n'),
    startLine: slice[0].span.startLine,
    endLine: slice[slice.length - 1].span.endLine,
  };
}

