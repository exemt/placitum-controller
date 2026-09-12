import { strToU8, zipSync } from 'fflate';

/**
 * Файлы профиля одним архивом.
 *
 * Конфигурация ModSecurity — это набор файлов, а не файл, и выносить её из
 * панели по одному файлу значит собирать порядок заново руками. Архив уносит
 * всё сразу.
 *
 * Порядок в архиве не хранится: zip держит имена, а не последовательность, и
 * читатели сортируют записи как им удобнее. Поэтому имена получают числовой
 * префикс — `01-rules.conf`, — и выгруженное читается в том же порядке
 * включения, в каком лежало в профиле.
 *
 * Обратной дороги здесь нет намеренно: файлы правил заводит каталог наборов,
 * и распакованный архив создавал бы их вторым способом, мимо каталога.
 */

/** Имя архива по умолчанию: в него уходят все файлы. */
export const ARCHIVE_NAME = 'modsec-rules.zip';

/** Файл в том виде, в котором его упаковывают. */
export interface ArchiveFile {
  name: string;
  text: string;
}

/** Имя файла без каталогов: в наборе путей нет, есть имена. */
function base(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return at < 0 ? path : path.slice(at + 1);
}

/** Ширина префикса: у десяти файлов номера двузначные. */
function pad(count: number): number {
  return String(count).length;
}

/** Файлы как содержимое архива: имена с номером порядка. */
export function archiveEntries(files: readonly ArchiveFile[]): Record<string, Uint8Array> {
  const width = pad(files.length);
  const entries: Record<string, Uint8Array> = {};
  files.forEach((file, index) => {
    const order = String(index + 1).padStart(width, '0');
    entries[`${order}-${base(file.name)}`] = strToU8(file.text);
  });
  return entries;
}

/** Архив: то, что уходит на диск. */
export function packArchive(files: readonly ArchiveFile[]): Uint8Array {
  // Шестой уровень — обычный компромисс zip: правила сжимаются в разы, а время
  // упаковки на файлах такого размера всё равно неразличимо.
  return zipSync(archiveEntries(files), { level: 6 });
}
