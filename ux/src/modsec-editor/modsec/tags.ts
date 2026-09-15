import { exclusionList, exclusionRecordText } from './exclusions';
import { reviewRegex } from './regex';
import { serializeAction } from './serialize';
import type { ExclusionIndex, ExclusionOp, ExclusionSource } from './exclusions';
import type { WorkspaceUnit } from './workspace';

export interface TagRuleSite {
  file: string;
  key: string;
  id: string;
  line: number;
  text: string;
}

export interface TagExclusionSite {
  file: string;
  key: string;
  id: string;
  line: number;
  name: string;
  text: string;
  op: ExclusionOp;
  source: ExclusionSource;
}

export interface TagEntry {
  tag: string;
  rules: TagRuleSite[];
  exclusions: TagExclusionSite[];
}

export interface TagIndex {
  byTag: Map<string, TagEntry>;
}

export function emptyTagIndex(): TagIndex {
  return { byTag: new Map() };
}

export function indexWorkspaceTags(
  units: readonly WorkspaceUnit[],
  exclusions: ExclusionIndex,
): TagIndex {
  const index = emptyTagIndex();

  for (const unit of units) {
    for (const block of unit.blocks) {
      if (block.kind !== 'rule' && block.kind !== 'action') continue;

      const actions = block.kind === 'rule' ? block.rule.actions : block.actions;
      const head = block.kind === 'rule' ? block.rule.headIndex : block.statementIndex;
      const line = unit.statements[head]?.span.startLine ?? 0;

      for (const tag of actions.tags) {
        if (tag === '') continue;
        const entry = ensure(index, tag);
        entry.rules.push({
          file: unit.id,
          key: block.key,
          id: actions.id,
          line,
          text: serializeAction({ raw: '', name: 'tag', value: tag, quoted: true }),
        });
      }
    }
  }

  for (const exclusion of exclusionList(exclusions)) {
    const { directive } = exclusion;
    if (directive.selector !== 'tag') continue;
    const pattern = directive.pattern ?? '';
    if (pattern === '') continue;

    const reviewed = reviewRegex(pattern);
    if (reviewed.regex === null) continue;

    const key =
      exclusion.carrier?.key ?? blockKeyAt(units, directive.place.file, directive.place.index);
    const site: TagExclusionSite = {
      file: directive.place.file,
      key,
      id: exclusion.carrier?.id ?? '',
      line: directive.line,
      name: directive.name,
      text: exclusionRecordText(directive),
      op: directive.op,
      source: directive.source,
    };

    for (const [tag, entry] of index.byTag) {
      if (!reviewed.regex.test(tag)) continue;
      entry.exclusions.push(site);
    }
  }

  return index;
}

export function lookupTag(index: TagIndex, tag: string): TagEntry | null {
  if (tag === '') return null;
  return index.byTag.get(tag) ?? null;
}

export function workspaceTags(index: TagIndex): string[] {
  return [...index.byTag.keys()].sort((a, b) => a.localeCompare(b));
}

function ensure(index: TagIndex, tag: string): TagEntry {
  let entry = index.byTag.get(tag);
  if (entry === undefined) {
    entry = { tag, rules: [], exclusions: [] };
    index.byTag.set(tag, entry);
  }
  return entry;
}

function blockKeyAt(
  units: readonly WorkspaceUnit[],
  file: string,
  statementIndex: number,
): string {
  const unit = units.find((item) => item.id === file);
  if (unit === undefined) return '';
  for (const block of unit.blocks) {
    if (block.kind === 'directive' && block.statementIndex === statementIndex) {
      return block.key;
    }
  }
  return '';
}
