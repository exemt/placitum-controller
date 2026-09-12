/*
 * Заливка GeoLite2 в каталог пространства.
 * Country → ip_countries / ip_country_addresses.
 * ASN     → ip_asns / ip_asn_addresses.
 *
 *   node src/load-geo.ts [GeoLite2-Country.mmdb] [GeoLite2-ASN.mmdb] [--space default] [--docker] [--dump]
 *
 * Тип берётся из метаданных MMDB. Без путей ищет Downloads и data/geo.
 * Без --docker база — CONTROLLER_DATABASE_URL.
 * С флагом — COPY через docker exec: на Windows :5432 часто занят другим Postgres.
 * --dump пишет schema/seed/ip_countries.sql и ip_asns.sql (UUID пространства нет).
 * Каталог пространства заменяется целиком, UUID уже известных ключей сохраняются.
 */

import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { finished } from "node:stream/promises";

import { load } from "./config.ts";
import { createPool } from "./db.ts";
import { loadSql, seedSql, targetOf, type GeoKind } from "./geo-sql.ts";
import { log } from "./log.ts";

const MARKER = Buffer.from("\xab\xcd\xefMaxMind.com", "binary");
const DATA_SEP = 16;
const IPV4_MAX = 2n ** 32n;
const CODE_RE = /^[a-z]{2}$/;
const SPACE_RE = /^[a-zA-Z0-9_-]+$/;
const BATCH = 5_000;

interface Meta {
  nodeCount: number;
  recordSize: number;
  ipVersion: number;
  databaseType: string;
  nodeByteSize: number;
  searchTreeSize: number;
}

interface GeoNet {
  code: string;
  type: "v4" | "v6";
  address: string;
  name: string;
}

interface GeoStats {
  networks: number;
  v4: number;
  v6: number;
  keys: Set<string>;
  sample: string | undefined;
}

type MmdbValue =
  | string
  | number
  | boolean
  | Uint8Array
  | MmdbValue[]
  | { [key: string]: MmdbValue };

class Mmdb {
  private readonly buf: Buffer;
  private readonly meta: Meta;
  private readonly kind: GeoKind;
  private readonly dataBase: number;
  private readonly ipv4Start: number;

  constructor(buf: Buffer) {
    this.buf = buf;
    const from = Math.max(0, buf.length - 128 * 1024);
    const mark = buf.subarray(from).lastIndexOf(MARKER);

    if (mark < 0) {
      throw new Error("not a MaxMind DB");
    }

    const metaStart = from + mark + MARKER.length;
    const raw = this.decode(metaStart, metaStart).value;

    const meta = asMap(raw);

    if (meta === undefined) {
      throw new Error("invalid MaxMind metadata");
    }

    const nodeCount = asInt(meta.node_count);
    const recordSize = asInt(meta.record_size);
    const ipVersion = asInt(meta.ip_version);
    const nodeByteSize = recordSize / 4;
    this.meta = {
      nodeCount,
      recordSize,
      ipVersion,
      databaseType: asString(meta.database_type),
      nodeByteSize,
      searchTreeSize: nodeCount * nodeByteSize,
    };
    this.kind = kindOf(this.meta.databaseType);
    this.dataBase = this.meta.searchTreeSize + DATA_SEP;

    let node = 0;
    if (ipVersion === 6) {
      for (let i = 0; i < 96 && node < nodeCount; i++) {
        node = this.readNode(node, 0);
      }
    }
    this.ipv4Start = node;
  }

  get databaseType(): string {
    return this.meta.databaseType;
  }

  get geoKind(): GeoKind {
    return this.kind;
  }

  async writeTsv(path: string): Promise<GeoStats> {
    const out = createWriteStream(path);
    const stats: GeoStats = { networks: 0, v4: 0, v6: 0, keys: new Set(), sample: undefined };
    const seen = new Set<string>();
    this.walk(0, 0, 0n, seen, stats, (row) => {
      out.write(`${row.code}\t${row.type}\t${escTsv(row.address)}\t${escTsv(row.name)}\n`);
    });
    out.end();
    await finished(out);
    return stats;
  }

  private walk(
    node: number,
    depth: number,
    ipAcc: bigint,
    seen: Set<string>,
    stats: GeoStats,
    emit: (row: GeoNet) => void,
  ): void {
    if (ipAcc !== 0n && node === this.ipv4Start) {
      return;
    }

    const { nodeCount, ipVersion } = this.meta;

    if (node > nodeCount) {
      const bits = ipVersion === 6 ? 128 : 32;
      const prefix = ipAcc << BigInt(bits - depth);
      let prefixLen = depth;
      let type: "v4" | "v6" = "v6";

      if (ipVersion === 6 && prefix < IPV4_MAX) {
        prefixLen -= 96;
        type = "v4";
      } else if (ipVersion === 4) {
        type = "v4";
      }

      const entity = entityOf(this.resolve(node), this.kind);

      if (entity === null || prefixLen < 0) {
        return;
      }

      const address = formatCidr(prefix, prefixLen, type);
      const key = `${entity.code}\0${type}\0${address}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      const row = { code: entity.code, type, address, name: entity.name };
      stats.networks += 1;
      stats.keys.add(row.code);
      if (type === "v4") {
        stats.v4 += 1;
      } else {
        stats.v6 += 1;
      }
      if (stats.sample === undefined && address.startsWith("8.8.8.")) {
        stats.sample = `${address} ${row.code}`;
      }
      emit(row);
      return;
    }

    if (node === nodeCount) {
      return;
    }

    const next = ipAcc << 1n;
    this.walk(this.readNode(node, 0), depth + 1, next, seen, stats, emit);
    this.walk(this.readNode(node, 1), depth + 1, next | 1n, seen, stats, emit);
  }

  private readNode(node: number, index: number): number {
    const base = node * this.meta.nodeByteSize;
    const size = this.meta.recordSize;

    if (size === 24) {
      return this.buf.readUIntBE(base + index * 3, 3);
    }

    if (size === 32) {
      return this.buf.readUInt32BE(base + index * 4);
    }

    if (size !== 28) {
      throw new Error(`unsupported record size ${size}`);
    }

    const shared = this.buf[base + 3];

    if (index === 0) {
      return (this.buf.readUIntBE(base, 3) << 4) | (shared >> 4);
    }

    return ((shared & 0x0f) << 24) | this.buf.readUIntBE(base + 4, 3);
  }

  private resolve(pointer: number): MmdbValue {
    const offset = pointer - this.meta.nodeCount + this.meta.searchTreeSize;
    return this.decode(offset, this.dataBase).value;
  }

  private decode(
    offset: number,
    pointerBase: number,
  ): { value: MmdbValue; next: number } {
    const ctrl = this.buf[offset];
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
      return {
        value: size === 0 ? 0 : this.buf.readUIntBE(next, size),
        next: next + size,
      };
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

    throw new Error(`unsupported MaxMind type ${type}`);
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

function asInt(value: MmdbValue | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("metadata field is not an integer");
  }

  return value;
}

function asString(value: MmdbValue | undefined): string {
  if (typeof value !== "string") {
    throw new Error("expected string");
  }

  return value;
}

function asMap(value: MmdbValue | undefined): { [key: string]: MmdbValue } | undefined {
  if (value === undefined || typeof value !== "object" || Array.isArray(value)) {
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

  throw new Error(`unsupported mmdb type "${databaseType}"`);
}

function entityOf(rec: MmdbValue, kind: GeoKind): { code: string; name: string } | null {
  return kind === "asn" ? asnOf(rec) : countryOf(rec);
}

function asnOf(rec: MmdbValue): { code: string; name: string } | null {
  const root = asMap(rec);

  if (root === undefined) {
    return null;
  }

  const num = root.autonomous_system_number;

  if (typeof num !== "number" || !Number.isInteger(num) || num <= 0) {
    return null;
  }

  const org =
    typeof root.autonomous_system_organization === "string" &&
    root.autonomous_system_organization.length > 0
      ? root.autonomous_system_organization
      : `AS${num}`;

  return { code: String(num), name: org };
}

function countryOf(rec: MmdbValue): { code: string; name: string } | null {
  const root = asMap(rec);

  if (root === undefined) {
    return null;
  }

  const country = asMap(root.country) ?? asMap(root.registered_country);

  if (country === undefined || typeof country.iso_code !== "string") {
    return null;
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

function escTsv(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n");
}

function here(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function discoverMmdbs(): string[] {
  const names = ["GeoLite2-Country.mmdb", "GeoLite2-ASN.mmdb"];
  const dirs = [
    process.env.GEO_MMDB_DIR,
    join(homedir(), "Downloads"),
    join(here(), "..", "data", "geo"),
  ].filter((dir): dir is string => dir !== undefined && dir.length > 0);
  const found: string[] = [];

  for (const name of names) {
    const hit = dirs.map((dir) => join(dir, name)).find((path) => existsSync(path));

    if (hit !== undefined) {
      found.push(hit);
    }
  }

  return found;
}

function parseArgs(argv: string[]): {
  mmdbs: string[];
  space: string;
  docker?: string;
  dump: boolean;
  dumpDir: string;
} {
  const mmdbs: string[] = [];
  let space = "default";
  let docker: string | undefined;
  let dump = false;
  let dumpDir = join(here(), "..", "schema", "seed");

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--space") {
      const value = argv[i + 1];

      if (value === undefined || value.startsWith("-")) {
        throw new Error("--space needs a name");
      }

      space = value;
      i += 1;
      continue;
    }

    if (arg === "--docker") {
      const value = argv[i + 1];
      docker = value !== undefined && !value.startsWith("-") ? value : "waf-postgres-1";

      if (value !== undefined && !value.startsWith("-")) {
        i += 1;
      }

      continue;
    }

    if (arg === "--dump") {
      dump = true;
      continue;
    }

    if (arg === "--dump-dir") {
      const value = argv[i + 1];

      if (value === undefined || value.startsWith("-")) {
        throw new Error("--dump-dir needs a path");
      }

      dumpDir = value;
      dump = true;
      i += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`unknown flag ${arg}`);
    }

    mmdbs.push(arg);
  }

  const files = mmdbs.length > 0 ? mmdbs : discoverMmdbs();

  if (files.length === 0) {
    throw new Error(
      "usage: node src/load-geo.ts [GeoLite2-Country.mmdb] [GeoLite2-ASN.mmdb] [--space default] [--docker [container]] [--dump]",
    );
  }

  if (!SPACE_RE.test(space)) {
    throw new Error(`invalid space name "${space}"`);
  }

  return { mmdbs: files, space, docker, dump, dumpDir };
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function applyDocker(
  kind: GeoKind,
  container: string,
  spaceName: string,
  tsvPath: string,
): Promise<void> {
  const remoteTsv = "/tmp/waf-geo.tsv";
  const remoteSql = "/tmp/waf-geo.sql";
  const dir = await mkdtemp(join(tmpdir(), "waf-geo-"));
  const sqlPath = join(dir, "load.sql");
  await writeFile(sqlPath, loadSql(kind, spaceName, remoteTsv), "utf8");
  await run("docker", ["cp", tsvPath, `${container}:${remoteTsv}`]);
  await run("docker", ["cp", sqlPath, `${container}:${remoteSql}`]);
  await run("docker", [
    "exec",
    "-u",
    "postgres",
    container,
    "psql",
    "-U",
    "waf",
    "-d",
    "waf",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    remoteSql,
  ]);
}

async function applyPg(
  kind: GeoKind,
  databaseUrl: string,
  spaceName: string,
  tsvPath: string,
): Promise<void> {
  const t = targetOf(kind);
  const text = await readFile(tsvPath, "utf8");
  const lines = text.split("\n").filter((line) => line.length > 0);
  const names = new Map<string, string>();
  const keys: { code: string; type: string }[] = [];
  const seen = new Set<string>();
  const rows: { code: string; type: string; address: string }[] = [];

  for (const line of lines) {
    const [code, type, address, name] = line.split("\t");

    if (code === undefined || type === undefined || address === undefined) {
      throw new Error("broken tsv line");
    }

    rows.push({ code, type, address });
    names.set(code, name ?? code.toUpperCase());
    const key = `${code}\0${type}`;

    if (!seen.has(key)) {
      seen.add(key);
      keys.push({ code, type });
    }
  }

  const pool = createPool(databaseUrl);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '10min'");

    const space = await client.query<{ id: string }>(
      "select id from http_spaces where name = $1",
      [spaceName],
    );

    if (space.rows.length === 0) {
      throw new Error(`http space "${spaceName}" not found`);
    }

    const spaceId = space.rows[0].id;
    const ids = new Map<string, string>();

    const keyParam = t.keyCast === "" ? "$2" : `$2${t.keyCast}`;

    for (const row of keys) {
      const { rows: upserted } = await client.query<{ id: string }>(
        `insert into ${t.catalog} (http_space_id, ${t.key}, type, description)
         values ($1, ${keyParam}, $3, $4)
         on conflict (http_space_id, ${t.key}, type)
         do update set description = excluded.description, updated_at = now()
         returning id`,
        [spaceId, row.code, row.type, names.get(row.code) ?? row.code.toUpperCase()],
      );
      ids.set(`${row.code}\0${row.type}`, upserted[0].id);
    }

    await client.query(
      `delete from ${t.catalog}
        where http_space_id = $1
          and not exists (
            select 1
              from unnest($2::text[], $3::text[]) as k(code, type)
             where k.code${t.keyCast} = ${t.catalog}.${t.key} and k.type = ${t.catalog}.type
          )`,
      [spaceId, keys.map((row) => row.code), keys.map((row) => row.type)],
    );

    await client.query(
      `delete from ${t.addresses} a
        using ${t.catalog} c
        where a.${t.fk} = c.id and c.http_space_id = $1`,
      [spaceId],
    );

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      await client.query(
        `insert into ${t.addresses} (${t.fk}, address)
         select * from unnest($1::uuid[], $2::text[])
         on conflict (${t.fk}, address) do nothing`,
        [
          chunk.map((row) => ids.get(`${row.code}\0${row.type}`)),
          chunk.map((row) => row.address),
        ],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function writeSeed(kind: GeoKind, space: string, tsvPath: string, dumpDir: string): Promise<string> {
  const tsv = await readFile(tsvPath, "utf8");
  const dest = join(dumpDir, targetOf(kind).seed);
  await mkdir(dumpDir, { recursive: true });
  await writeFile(dest, seedSql(kind, space, tsv), "utf8");
  return dest;
}

async function loadOne(
  path: string,
  space: string,
  docker: string | undefined,
  databaseUrl: string,
  dumpDir?: string,
): Promise<void> {
  const buf = await readFile(path);
  const db = new Mmdb(buf);
  const dir = await mkdtemp(join(tmpdir(), "waf-geo-"));
  const tsvPath = join(dir, "geo.tsv");
  const stats = await db.writeTsv(tsvPath);

  if (stats.networks === 0) {
    throw new Error(`${path}: mmdb produced no prefixes`);
  }

  log("info", "geo mmdb parsed", {
    path,
    type: db.databaseType,
    kind: db.geoKind,
    networks: stats.networks,
    v4: stats.v4,
    v6: stats.v6,
    keys: stats.keys.size,
    sample: stats.sample,
  });

  if (docker !== undefined) {
    await applyDocker(db.geoKind, docker, space, tsvPath);
  } else {
    await applyPg(db.geoKind, databaseUrl, space, tsvPath);
  }

  let seed: string | undefined;

  if (dumpDir !== undefined) {
    seed = await writeSeed(db.geoKind, space, tsvPath, dumpDir);
  }

  log("info", "geo loaded", {
    space,
    kind: db.geoKind,
    keys: stats.keys.size,
    addresses: stats.networks,
    via: docker ?? "postgres",
    seed,
  });
}

const args = parseArgs(process.argv.slice(2));
const cfg = load();

for (const path of args.mmdbs) {
  await loadOne(path, args.space, args.docker, cfg.databaseUrl, args.dump ? args.dumpDir : undefined);
}
