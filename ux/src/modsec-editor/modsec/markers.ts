/**
 * Индекс ссылок на метки: кто прыгает на `SecMarker` через `skipAfter`.
 *
 * Метка — вторая запись файла, чей смысл лежит не в ней самой.
 * `SecMarker END_STRICT` не говорит ни того, прыгает ли на неё кто-нибудь,
 * ни того, из какого файла. Ответ — в действиях правил и `SecAction`, часто
 * в другом файле набора. Поэтому индекс собирается по набору, как индекс
 * переменных, и хранит места: файл, строку, правило и саму запись
 * `skipAfter:LABEL`.
 */

import { serializeAction } from './serialize';
import type { VisualBlock } from './model';
import type { RuleAction } from './types';
import type { WorkspaceUnit } from './workspace';

/** Место, из которого прыгают на метку. */
export interface MarkerRefSite {
  file: string;
  /** Ключ блока модели — по нему конструктор находит карточку. */
  key: string;
  /** `id` правила или пустая строка, если его нет. */
  id: string;
  line: number;
  /** Сама запись: `skipAfter:END_STRICT`. */
  text: string;
}

export interface MarkerRefIndex {
  /** Имя метки → места, из которых на неё прыгают. */
  byLabel: Map<string, MarkerRefSite[]>;
}

export function emptyMarkerRefIndex(): MarkerRefIndex {
  return { byLabel: new Map() };
}

/**
 * Собирает индекс ссылок по набору файлов.
 *
 * Имя сравнивается как есть: ModSecurity ищет метку без приведения регистра,
 * и `END` с `end` — это две разные метки.
 */
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

/** Места, из которых прыгают на эту метку. */
export function lookupMarkerRefs(index: MarkerRefIndex, label: string): MarkerRefSite[] {
  if (label === '') return [];
  return index.byLabel.get(label) ?? [];
}
