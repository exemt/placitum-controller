/**
 * Индекс тегов набора: у кого тег стоит и кто снимает правила по нему.
 *
 * Тег — вторая запись правила, чей смысл лежит не в нём самом.
 * `tag:'OWASP_CRS'` не говорит ни того, сколько правил носят тот же ярлык,
 * ни того, снимает ли их `SecRuleRemoveByTag`. Оба ответа — в других
 * строках и файлах, поэтому индекс собирается по набору, как у переменных
 * и меток.
 */

import { exclusionList, exclusionRecordText } from './exclusions';
import { reviewRegex } from './regex';
import { serializeAction } from './serialize';
import type { ExclusionIndex, ExclusionOp, ExclusionSource } from './exclusions';
import type { WorkspaceUnit } from './workspace';

/** Правило (или `SecAction`), на котором стоит тег. */
export interface TagRuleSite {
  file: string;
  key: string;
  id: string;
  line: number;
  /** Сама запись: `tag:'OWASP_CRS'`. */
  text: string;
}

/** Исключение, чья выборка по тегу задевает это имя. */
export interface TagExclusionSite {
  file: string;
  /** Ключ блока директивы или правила-носителя `ctl`. */
  key: string;
  /** `id` носителя у `ctl`, иначе пустая строка. */
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

/**
 * Собирает индекс по набору и уже посчитанным исключениям.
 *
 * Исключения берутся готовыми: выборка по тегу — то же регулярное выражение,
 * что у `SecRuleRemoveByTag`, и считать его второй раз значило бы расходиться
 * с отметками у самих исключений.
 */
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

/** Что набор знает об этом теге; `null` — такого тега ни у кого нет. */
export function lookupTag(index: TagIndex, tag: string): TagEntry | null {
  if (tag === '') return null;
  return index.byTag.get(tag) ?? null;
}

/** Имена тегов, встречающихся в наборе, по алфавиту. */
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

/** Ключ блока директивы по месту утверждения. */
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
