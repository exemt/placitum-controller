import { ARCHIVE_NAME, packArchive } from './archive';
import type { ArchiveFile } from './archive';

export function downloadFile(name: string, text: string): void {
  save(name, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}

export function downloadSet(files: readonly ArchiveFile[]): void {
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
