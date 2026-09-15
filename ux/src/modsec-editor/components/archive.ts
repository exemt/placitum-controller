import { strToU8, zipSync } from 'fflate';

export const ARCHIVE_NAME = 'modsec-rules.zip';

export interface ArchiveFile {
  name: string;
  text: string;
}

function base(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return at < 0 ? path : path.slice(at + 1);
}

function pad(count: number): number {
  return String(count).length;
}

export function archiveEntries(files: readonly ArchiveFile[]): Record<string, Uint8Array> {
  const width = pad(files.length);
  const entries: Record<string, Uint8Array> = {};
  files.forEach((file, index) => {
    const order = String(index + 1).padStart(width, '0');
    entries[`${order}-${base(file.name)}`] = strToU8(file.text);
  });
  return entries;
}

export function packArchive(files: readonly ArchiveFile[]): Uint8Array {
  return zipSync(archiveEntries(files), { level: 6 });
}
