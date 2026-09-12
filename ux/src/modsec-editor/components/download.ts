import { ARCHIVE_NAME, packArchive } from './archive';
import type { ArchiveFile } from './archive';

/**
 * Выгрузка файла на диск.
 *
 * Единственный способ вынести работу из вкладки: черновик в хранилище браузера
 * переживает перезагрузку, но не переживает ни другую машину, ни очистку
 * данных. Поэтому выгрузка — осознанное действие, а не автосохранение.
 */
export function downloadFile(name: string, text: string): void {
  save(name, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}

/**
 * Выгрузка набора одним архивом.
 *
 * По файлу за раз браузер отдаёт набор пачкой запросов на скачивание, и часть
 * из них он же и отклоняет как непрошеные. Архив уходит одним файлом, и порядок
 * включения в нём сохранён именами.
 */
export function downloadSet(files: readonly ArchiveFile[]): void {
  // Копия в свой буфер: `Blob` не принимает представление над разделяемой
  // памятью, а упаковщик возвращает как раз такое.
  const data = new Uint8Array(packArchive(files));
  save(ARCHIVE_NAME, new Blob([data], { type: 'application/zip' }));
}

function save(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
