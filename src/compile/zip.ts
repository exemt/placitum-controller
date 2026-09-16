import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const CRC_TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[i] = crc >>> 0;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

export function zipEntries(entries: ZipEntry[]): Buffer {
  const files = [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = file.data;
    const deflated = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(deflated.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
      deflated,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(deflated.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locals, central, eocd]);
}

export function sha256(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export async function zipDirectory(root: string): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    const names = (await readdir(dir)).sort();

    for (const name of names) {
      const path = join(dir, name);
      const info = await stat(path);
      const rel = prefix === "" ? name : `${prefix}/${name}`;

      if (info.isDirectory()) {
        await walk(path, rel);
        continue;
      }

      if (!info.isFile()) {
        continue;
      }

      out.push({ name: rel, data: await readFile(path) });
    }
  }

  await walk(root, "");
  return out;
}
