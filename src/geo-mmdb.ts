/*
 * Разбор MaxMind DB: сети стран и автономных систем.
 *
 * Читатель один на два входа: заливка из командной строки (load-geo.ts) и
 * файл из панели (geo-import.ts). Вид базы берётся из метаданных, а не из
 * имени файла: GeoLite2-Country, GeoIP2-Country и DB-IP Country Lite
 * разложены одинаково, а называть файл оператор волен как угодно.
 *
 * Формат -- https://maxmind.github.io/MaxMind-DB/: дерево поиска по битам
 * адреса, секция данных за разделителем, метаданные в хвосте за маркером.
 */

import type { GeoKind } from "./geo-sql.ts";

const MARKER = Buffer.from("\xab\xcd\xefMaxMind.com", "binary");
/* Метаданные лежат в последних 128 КБ файла: так велит формат. */
const META_TAIL = 128 * 1024;
const DATA_SEP = 16;
const IPV4_MAX = 2n ** 32n;
const CODE_RE = /^[a-z]{2}$/;

export type MmdbErrorCode = "mmdb_invalid" | "mmdb_unsupported";

/** Отказ разбора. Код уходит оператору ответом API, текст -- в журнал. */
export class MmdbError extends Error {
  readonly code: MmdbErrorCode;

  constructor(code: MmdbErrorCode, message: string) {
    super(message);
    this.name = "MmdbError";
    this.code = code;
  }
}

export interface MmdbMeta {
  databaseType: string;
  /** Сборка выгрузки, секунды Unix: по ней свежую неделю отличают от прошлой. */
  buildEpoch: number;
  ipVersion: number;
  nodeCount: number;
  recordSize: number;
}

/** Сеть выгрузки в форме каталога пространства. */
export interface GeoNet {
  code: string;
  type: "v4" | "v6";
  address: string;
  name: string;
}

type MmdbValue =
  | string
  | number
  | boolean
  | Uint8Array
  | MmdbValue[]
  | { [key: string]: MmdbValue };

type Entity = { code: string; name: string } | null;

export class Mmdb {
  readonly meta: MmdbMeta;
  readonly kind: GeoKind;
  private readonly buf: Buffer;
  private readonly nodeByteSize: number;
  private readonly searchTreeSize: number;
  private readonly dataBase: number;
  private readonly ipv4Start: number;

  /** Проверяет метаданные и вид базы; сами сети читает `networks()`. */
  constructor(buf: Buffer) {
    this.buf = buf;

    const from = Math.max(0, buf.length - META_TAIL);
    const mark = buf.subarray(from).lastIndexOf(MARKER);

    if (mark < 0) {
      throw new MmdbError("mmdb_invalid", "not a MaxMind DB: no metadata marker");
    }

    const metaStart = from + mark + MARKER.length;
    const meta = asMap(guard(() => this.decode(metaStart, metaStart).value));

    if (meta === undefined) {
      throw new MmdbError("mmdb_invalid", "metadata is not a map");
    }

    const nodeCount = metaInt(meta, "node_count");
    const recordSize = metaInt(meta, "record_size");
    const ipVersion = metaInt(meta, "ip_version");

    if (recordSize !== 24 && recordSize !== 28 && recordSize !== 32) {
      throw new MmdbError("mmdb_invalid", `unsupported record size ${recordSize}`);
    }

    if (ipVersion !== 4 && ipVersion !== 6) {
      throw new MmdbError("mmdb_invalid", `unsupported ip version ${ipVersion}`);
    }

    this.nodeByteSize = recordSize / 4;
    this.searchTreeSize = nodeCount * this.nodeByteSize;
    this.dataBase = this.searchTreeSize + DATA_SEP;

    if (this.dataBase > from + mark) {
      throw new MmdbError("mmdb_invalid", "search tree runs into metadata");
    }

    const databaseType =
      typeof meta.database_type === "string" ? meta.database_type : "";

    this.meta = {
      databaseType,
      buildEpoch: typeof meta.build_epoch === "number" ? meta.build_epoch : 0,
      ipVersion,
      nodeCount,
      recordSize,
    };
    this.kind = kindOf(databaseType);

    let node = 0;
    if (ipVersion === 6) {
      for (let i = 0; i < 96 && node < nodeCount; i++) {
        node = guard(() => this.readNode(node, 0));
      }
    }
    this.ipv4Start = node;
  }

  /**
   * Сети выгрузки по возрастанию адреса: сначала IPv4, потом IPv6.
   *
   * Обход -- стеком и генератором, а не рекурсией с обратным вызовом:
   * заливка забирает сети пачками и между пачками отдаёт цикл событий, а
   * миллион строк в памяти разом ей не нужен. Повторов нет: IPv4 в
   * IPv6-базе обходится один раз, по ::/96, а псевдонимы (::ffff:0:0/96,
   * 2002::/16) ведут в тот же узел и пропускаются.
   */
  *networks(): Generator<GeoNet> {
    const { nodeCount, ipVersion } = this.meta;
    const bits = ipVersion === 6 ? 128 : 32;
    /* Запись данных одна на тысячи сетей: у всех префиксов страны она общая. */
    const entities = new Map<number, Entity>();
    const nodes: number[] = [0];
    const depths: number[] = [0];
    const accs: bigint[] = [0n];

    try {
      while (nodes.length > 0) {
        const node = nodes.pop()!;
        const depth = depths.pop()!;
        const acc = accs.pop()!;

        if (acc !== 0n && node === this.ipv4Start) {
          continue;
        }

        if (node > nodeCount) {
          const net = this.leaf(node, depth, acc, bits, entities);
          if (net !== null) {
            yield net;
          }
          continue;
        }

        if (node === nodeCount) {
          continue;
        }

        if (depth >= bits) {
          throw new MmdbError("mmdb_invalid", "search tree is deeper than an address");
        }

        const next = acc << 1n;
        nodes.push(this.readNode(node, 1), this.readNode(node, 0));
        depths.push(depth + 1, depth + 1);
        accs.push(next | 1n, next);
      }
    } catch (err) {
      throw err instanceof MmdbError ? err : new MmdbError("mmdb_invalid", String(err));
    }
  }

  private leaf(
    node: number,
    depth: number,
    acc: bigint,
    bits: number,
    entities: Map<number, Entity>,
  ): GeoNet | null {
    const prefix = acc << BigInt(bits - depth);
    let prefixLen = depth;
    let type: "v4" | "v6" = bits === 32 ? "v4" : "v6";

    if (bits === 128 && prefix < IPV4_MAX) {
      prefixLen -= 96;
      type = "v4";
    }

    if (prefixLen < 0) {
      return null;
    }

    let entity = entities.get(node);

    if (entity === undefined) {
      entity = entityOf(this.resolve(node), this.kind);
      entities.set(node, entity);
    }

    if (entity === null) {
      return null;
    }

    return {
      code: entity.code,
      type,
      address: formatCidr(prefix, prefixLen, type),
      name: entity.name,
    };
  }

  private readNode(node: number, index: number): number {
    const base = node * this.nodeByteSize;
    const size = this.meta.recordSize;

    if (size === 24) {
      return this.buf.readUIntBE(base + index * 3, 3);
    }

    if (size === 32) {
      return this.buf.readUInt32BE(base + index * 4);
    }

    const shared = this.buf[base + 3];

    if (index === 0) {
      return (this.buf.readUIntBE(base, 3) << 4) | (shared >> 4);
    }

    return ((shared & 0x0f) << 24) | this.buf.readUIntBE(base + 4, 3);
  }

  private resolve(pointer: number): MmdbValue {
    const offset = pointer - this.meta.nodeCount + this.searchTreeSize;
    return this.decode(offset, this.dataBase).value;
  }

  private decode(
    offset: number,
    pointerBase: number,
  ): { value: MmdbValue; next: number } {
    const ctrl = this.buf[offset];

    if (ctrl === undefined) {
      throw new MmdbError("mmdb_invalid", `data offset ${offset} is past the end`);
    }

    let type = ctrl >> 5;
    let next = offset + 1;

    if (type === 0) {
      type = this.buf[next] + 7;
      next += 1;
    }

    const sized = this.sizeOf(ctrl, next, type);
    next = sized.next;
    const size = sized.size;

    if (type === 1) {
      const pointer = this.pointerOf(size, next, pointerBase);
      return { value: this.decode(pointer.at, pointerBase).value, next: pointer.after };
    }

    if (type === 2) {
      return {
        value: this.buf.subarray(next, next + size).toString("utf8"),
        next: next + size,
      };
    }

    if (type === 4) {
      return { value: this.buf.subarray(next, next + size), next: next + size };
    }

    if (type === 3) {
      return { value: this.buf.readDoubleBE(next), next: next + 8 };
    }

    if (type === 15) {
      return { value: this.buf.readFloatBE(next), next: next + 4 };
    }

    if (type === 5 || type === 6 || type === 9 || type === 10) {
      return { value: readUint(this.buf, next, size), next: next + size };
    }

    if (type === 8) {
      if (size === 0) {
        return { value: 0, next };
      }

      const pad = Buffer.alloc(4);
      this.buf.copy(pad, 4 - size, next, next + size);
      return { value: pad.readInt32BE(0), next: next + size };
    }

    if (type === 14) {
      return { value: size !== 0, next };
    }

    if (type === 7) {
      const map: { [key: string]: MmdbValue } = {};
      let at = next;

      for (let i = 0; i < size; i++) {
        const key = this.decode(at, pointerBase);
        const val = this.decode(key.next, pointerBase);
        map[asString(key.value)] = val.value;
        at = val.next;
      }

      return { value: map, next: at };
    }

    if (type === 11) {
      const arr: MmdbValue[] = [];
      let at = next;

      for (let i = 0; i < size; i++) {
        const item = this.decode(at, pointerBase);
        arr.push(item.value);
        at = item.next;
      }

      return { value: arr, next: at };
    }

    throw new MmdbError("mmdb_invalid", `unsupported MaxMind type ${type}`);
  }

  private sizeOf(
    ctrl: number,
    offset: number,
    type: number,
  ): { size: number; next: number } {
    const size = ctrl & 0x1f;

    if (type === 1 || size < 29) {
      return { size, next: offset };
    }

    if (size === 29) {
      return { size: 29 + this.buf[offset], next: offset + 1 };
    }

    if (size === 30) {
      return { size: 285 + this.buf.readUInt16BE(offset), next: offset + 2 };
    }

    return { size: 65821 + this.buf.readUIntBE(offset, 3), next: offset + 3 };
  }

  private pointerOf(
    size: number,
    offset: number,
    pointerBase: number,
  ): { at: number; after: number } {
    const bytes = (size >> 3) + 1;

    if (bytes === 1) {
      return {
        at: ((size & 7) << 8) + this.buf[offset] + pointerBase,
        after: offset + 1,
      };
    }

    if (bytes === 2) {
      return {
        at: ((size & 7) << 16) + this.buf.readUInt16BE(offset) + 2048 + pointerBase,
        after: offset + 2,
      };
    }

    if (bytes === 3) {
      return {
        at: ((size & 7) << 24) + this.buf.readUIntBE(offset, 3) + 526336 + pointerBase,
        after: offset + 3,
      };
    }

    return { at: this.buf.readUInt32BE(offset) + pointerBase, after: offset + 4 };
  }
}

/** Ошибка чтения буфера (выход за край, мусор вместо ключа) -- битый файл. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw err instanceof MmdbError ? err : new MmdbError("mmdb_invalid", String(err));
  }
}

/**
 * Беззнаковое целое. Больше шести байт `readUIntBE` не читает, а uint64 в
 * записи законен: `build_epoch` иной сборщик кладёт восемью байтами.
 */
function readUint(buf: Buffer, at: number, size: number): number {
  if (size === 0) {
    return 0;
  }

  if (size <= 6) {
    return buf.readUIntBE(at, size);
  }

  let n = 0n;

  for (let i = 0; i < size; i++) {
    const byte = buf[at + i];

    if (byte === undefined) {
      throw new MmdbError("mmdb_invalid", "integer runs past the end");
    }

    n = (n << 8n) | BigInt(byte);
  }

  return Number(n);
}

function metaInt(meta: { [key: string]: MmdbValue }, key: string): number {
  const value = meta[key];

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new MmdbError("mmdb_invalid", `metadata ${key} is not an integer`);
  }

  return value;
}

function asString(value: MmdbValue | undefined): string {
  if (typeof value !== "string") {
    throw new MmdbError("mmdb_invalid", "map key is not a string");
  }

  return value;
}

function asMap(value: MmdbValue | undefined): { [key: string]: MmdbValue } | undefined {
  if (
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    return undefined;
  }

  return value as { [key: string]: MmdbValue };
}

function kindOf(databaseType: string): GeoKind {
  if (/asn/i.test(databaseType)) {
    return "asn";
  }

  if (/country/i.test(databaseType)) {
    return "country";
  }

  throw new MmdbError(
    "mmdb_unsupported",
    `database type "${databaseType}" is neither country nor asn`,
  );
}

function entityOf(rec: MmdbValue, kind: GeoKind): Entity {
  return kind === "asn" ? asnOf(rec) : countryOf(rec);
}

function asnOf(rec: MmdbValue): Entity {
  const root = asMap(rec);

  if (root === undefined) {
    return null;
  }

  const num = root.autonomous_system_number;

  if (typeof num !== "number" || !Number.isInteger(num) || num <= 0 || num > 0xffffffff) {
    return null;
  }

  const org =
    typeof root.autonomous_system_organization === "string" &&
    root.autonomous_system_organization.length > 0
      ? root.autonomous_system_organization
      : `AS${num}`;

  return { code: String(num), name: org };
}

/**
 * Страна сети: `country`, а без её кода -- `registered_country` (анонс без
 * страны пользователя, например спутниковый). Так же решает и читатель
 * кодера (geo/internal/load): панель и кодер обязаны называть сеть одинаково.
 */
function countryOf(rec: MmdbValue): Entity {
  const root = asMap(rec);

  if (root === undefined) {
    return null;
  }

  for (const key of ["country", "registered_country"]) {
    const country = asMap(root[key]);

    if (country === undefined || typeof country.iso_code !== "string") {
      continue;
    }

    const code = country.iso_code.toLowerCase();

    if (!CODE_RE.test(code)) {
      return null;
    }

    const names = asMap(country.names);
    const ru = names !== undefined && typeof names.ru === "string" ? names.ru : undefined;
    const en = names !== undefined && typeof names.en === "string" ? names.en : undefined;

    return { code, name: ru ?? en ?? code.toUpperCase() };
  }

  return null;
}

function formatCidr(addr: bigint, prefixLen: number, type: "v4" | "v6"): string {
  if (type === "v4") {
    const n = Number(addr);
    return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}/${prefixLen}`;
  }

  const hextets: number[] = [];

  for (let i = 0; i < 8; i++) {
    hextets.push(Number((addr >> BigInt(112 - i * 16)) & 0xffffn));
  }

  return `${compressV6(hextets)}/${prefixLen}`;
}

function compressV6(hextets: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  let runLen = 0;

  for (let i = 0; i <= 8; i++) {
    if (i < 8 && hextets[i] === 0) {
      if (runStart < 0) {
        runStart = i;
      }

      runLen += 1;
      continue;
    }

    if (runLen > bestLen) {
      bestStart = runStart;
      bestLen = runLen;
    }

    runStart = -1;
    runLen = 0;
  }

  if (bestLen < 2) {
    return hextets.map((part) => part.toString(16)).join(":");
  }

  const head = hextets.slice(0, bestStart).map((part) => part.toString(16)).join(":");
  const tail = hextets
    .slice(bestStart + bestLen)
    .map((part) => part.toString(16))
    .join(":");

  return `${head}::${tail}`;
}
