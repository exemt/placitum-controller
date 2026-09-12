/**
 * Набор файлов как одна конфигурация.
 *
 * ModSecurity читает конфигурацию файлами в том порядке, в каком их включили,
 * и для смысла это один документ: `SecRuleRemoveById` из второго файла снимает
 * правило из первого, метка для `skipAfter` бывает в третьем, а `SecRuleEngine`
 * стоит вообще в настроечном. Поэтому проверки получают не файл, а набор.
 *
 * Разбор при этом остаётся файловым: у каждого файла свой текст, свои номера
 * строк и свои ключи блоков — их считает компилятор, ничего не зная о соседях.
 * Склеивать тексты в один нельзя как раз из-за номеров: строка, названная в
 * замечании, должна открываться в том файле, где её правят.
 *
 * Отсюда две вещи в этом модуле. {@link WorkspaceUnit} — файл в том виде, в
 * котором его читает проход по набору, а {@link WorkspacePlace} — место записи
 * в наборе: номер файла в порядке включения и индекс утверждения внутри него.
 * Одного индекса утверждения больше не хватает: он одинаков у первых строк
 * всех файлов, а «раньше» и «ниже» теперь решаются между файлами.
 */

import type { VisualBlock } from './model';
import type { ParsedStatement } from './types';

/** Один файл набора: разбор и собранные по нему блоки. */
export interface WorkspaceUnit {
  /**
   * Идентификатор файла — им подписаны ссылки, отметки и замечания.
   *
   * Не имя: имена повторяются (два `rules.conf` из разных каталогов — обычное
   * дело), а ссылка на файл должна вести ровно в один.
   */
  id: string;
  /** Имя файла: его называют замечания, когда речь о чужом файле. */
  name: string;
  blocks: VisualBlock[];
  statements: ParsedStatement[];
}

/** Место записи в наборе. */
export interface WorkspacePlace {
  /** Идентификатор файла. */
  file: string;
  /** Номер файла в порядке включения: по нему сравнивают, что читается раньше. */
  order: number;
  /** Индекс утверждения внутри файла. */
  index: number;
}

/**
 * Набор из одного безымянного документа.
 *
 * Так выглядит место, когда о файлах речи нет вовсе: ядро умеет разбирать
 * одинокий текст, и заводить ему имя только ради ссылок было бы обманом.
 */
export const LONE_FILE = '';

/** Запись `a` читается раньше записи `b`. */
export function before(a: WorkspacePlace, b: WorkspacePlace): boolean {
  if (a.order !== b.order) return a.order < b.order;
  return a.index < b.index;
}

/**
 * Ссылка на блок или утверждение с указанием файла.
 *
 * Ключи блоков (`rule-3`) и индексы утверждений считаются внутри файла, и в
 * наборе они совпадают у разных записей — таблицы набора складывают их с
 * идентификатором файла. Разделитель `#` в идентификатор не попадёт: его
 * выдаёт редактор, а не человек.
 */
export function blockRef(file: string, key: string): string {
  return `${file}#${key}`;
}

/** Ссылка на утверждение файла: тот же ключ, что у {@link blockRef}. */
export function statementRef(file: string, index: number): string {
  return `${file}#${index}`;
}

/** Место утверждения этого файла. */
export function placeIn(unit: WorkspaceUnit, order: number, index: number): WorkspacePlace {
  return { file: unit.id, order, index };
}

/** Номера файлов в порядке включения: по ним сортируют замечания набора. */
export function fileOrder(units: readonly WorkspaceUnit[]): Map<string, number> {
  const order = new Map<string, number>();
  units.forEach((unit, index) => order.set(unit.id, index));
  return order;
}

/**
 * Файл записи так, как его называет замечание.
 *
 * У одинокого документа файла нет вовсе, и подписывать замечание пустым
 * именем значило бы обещать переход туда, где переходить некуда.
 */
export function fileMark(id: string): string | undefined {
  return id === LONE_FILE ? undefined : id;
}

/** Набор из одного файла — для тех, у кого на руках один разбор. */
export function loneUnit(blocks: VisualBlock[], statements: ParsedStatement[]): WorkspaceUnit {
  return { id: LONE_FILE, name: '', blocks, statements };
}
