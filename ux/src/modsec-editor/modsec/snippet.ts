/**
 * Фрагмент исходника блока: то, что показывают превью правила, метки, директивы.
 *
 * Ключ блока (`rule-3`, `marker-2`) считается внутри файла, а текст и номера
 * строк лежат в утверждениях того же файла. Здесь они собираются вместе —
 * без React и без активного файла: превью читает любой файл набора.
 */

import { blockRange } from './model';
import type { VisualBlock } from './model';
import type { ParsedStatement } from './types';

/** Кусок файла, который занимает блок: текст и его место. */
export interface BlockSnippet {
  /** Физические строки исходника, склеенные `\n` — как в файле. */
  text: string;
  /** Первая строка фрагмента в файле (1-based). */
  startLine: number;
  /** Последняя строка фрагмента в файле (1-based). */
  endLine: number;
}

/** @deprecated Имя эпохи правил: то же, что {@link BlockSnippet}. */
export type RuleSnippet = BlockSnippet;

/**
 * Где в наборе лежит правило с этим `id`.
 *
 * Номер правила общий на набор: по нему исключение находит цель, и по нему же
 * превью открывает исходник, не таская за собой структуру исключения.
 * Строки лежат здесь же — свёрнутому списку текст правила не нужен, а адрес
 * в шапке нужен, и собирать исходник ради двух чисел незачем.
 */
export interface RuleLocation {
  file: string;
  key: string;
  id: string;
  startLine: number;
  endLine: number;
}

/**
 * Где в наборе лежит метка с этим именем.
 *
 * Имя общее на набор: `skipAfter` ищет его так же, как исключение — номер
 * правила. Дубликат — первый по порядку включения, как у ModSecurity.
 */
export interface MarkerLocation {
  file: string;
  key: string;
  label: string;
  startLine: number;
  endLine: number;
}

/** Файл набора настолько, насколько нужно, чтобы найти блок по смыслу. */
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

/**
 * Первое правило (или `SecAction`) с этим `id`.
 *
 * Пустой номер не ищем: незаданные `id` не различаются, и «найти первое
 * безымянное» притворилось бы адресом, которого у поля нет.
 */
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

/**
 * Индекс правил набора по `id`.
 *
 * Первый выигрывает: повторяющийся номер — ошибка конфигурации, и превью
 * показывает то правило, которое ModSecurity увидел раньше.
 */
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

/**
 * Первая метка с этим именем.
 *
 * Пустое имя не ищем: безымянной метки в файле нет, а «найти первую пустую»
 * притворилось бы адресом, которого у `skipAfter` нет.
 */
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

/**
 * Индекс меток набора по имени.
 *
 * Первый выигрывает: ModSecurity останавливается на первой метке с этим
 * именем после прыжка, и превью показывает ту же — раннюю по порядку набора.
 */
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

/**
 * Исходник блока по ключу.
 *
 * У правила это вся цепочка вместе с прижатым сверху описанием: превью
 * показывает то же, что займёт карточка, а не одну головную директиву.
 * У метки и директивы — ровно их строки.
 */
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

/** @deprecated Имя эпохи правил: то же, что {@link blockSnippet}. */
export const ruleSnippet = blockSnippet;
