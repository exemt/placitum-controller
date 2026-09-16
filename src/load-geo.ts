import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { load } from "./config.ts";
import { createPool } from "./db.ts";
import { importCatalog, type CatalogDiff } from "./geo-import.ts";
import { Mmdb } from "./geo-mmdb.ts";
import { loadSql, type GeoKind } from "./geo-sql.ts";
import { log } from "./log.ts";

const SPACE_RE = /^[a-zA-Z0-9_-]+$/;

interface TsvStats {
  networks: number;
  v4: number;
  v6: number;
  keys: Set<string>;
  sample: string | undefined;
}

async function writeTsv(db: Mmdb, path: string): Promise<TsvStats> {
  const out = createWriteStream(path);
  const stats: TsvStats = { networks: 0, v4: 0, v6: 0, keys: new Set(), sample: undefined };

  for (const row of db.networks()) {
    stats.networks += 1;
    stats.keys.add(row.code);

    if (row.type === "v4") {
      stats.v4 += 1;
    } else {
      stats.v6 += 1;
    }

    if (stats.sample === undefined && row.address.startsWith("8.8.8.")) {
      stats.sample = `${row.address} ${row.code}`;
    }

    if (!out.write(`${row.code}\t${row.type}\t${escTsv(row.address)}\t${escTsv(row.name)}\n`)) {
      await once(out, "drain");
    }
  }

  out.end();
  await finished(out);
  return stats;
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
} {
  const mmdbs: string[] = [];
  let space = "default";
  let docker: string | undefined;

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

    if (arg.startsWith("-")) {
      throw new Error(`unknown flag ${arg}`);
    }

    mmdbs.push(arg);
  }

  const files = mmdbs.length > 0 ? mmdbs : discoverMmdbs();

  if (files.length === 0) {
    throw new Error(
      "usage: node src/load-geo.ts [GeoLite2-Country.mmdb] [GeoLite2-ASN.mmdb] [--space default] [--docker [container]]",
    );
  }

  if (!SPACE_RE.test(space)) {
    throw new Error(`invalid space name "${space}"`);
  }

  return { mmdbs: files, space, docker };
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

async function applyPg(db: Mmdb, databaseUrl: string, spaceName: string): Promise<CatalogDiff> {
  const pool = createPool(databaseUrl);

  try {
    const space = await pool.query<{ id: string }>(
      "select id from http_spaces where name = $1",
      [spaceName],
    );

    if (space.rows.length === 0) {
      throw new Error(`http space "${spaceName}" not found`);
    }

    return await importCatalog(pool, { kind: db.kind, spaceId: space.rows[0].id, db });
  } finally {
    await pool.end();
  }
}

async function loadOne(
  path: string,
  space: string,
  docker: string | undefined,
  databaseUrl: string,
): Promise<void> {
  const db = new Mmdb(await readFile(path));
  const dir = await mkdtemp(join(tmpdir(), "waf-geo-"));
  const tsvPath = join(dir, "geo.tsv");
  const stats = await writeTsv(db, tsvPath);

  if (stats.networks === 0) {
    throw new Error(`${path}: mmdb produced no prefixes`);
  }

  log("info", "geo mmdb parsed", {
    path,
    type: db.meta.databaseType,
    kind: db.kind,
    networks: stats.networks,
    v4: stats.v4,
    v6: stats.v6,
    keys: stats.keys.size,
    sample: stats.sample,
  });

  let diff: CatalogDiff | undefined;

  if (docker !== undefined) {
    await applyDocker(db.kind, docker, space, tsvPath);
  } else {
    diff = await applyPg(db, databaseUrl, space);
  }

  log("info", "geo loaded", {
    space,
    kind: db.kind,
    keys: stats.keys.size,
    addresses: stats.networks,
    ...(diff === undefined ? {} : { added: diff.added, removed: diff.removed }),
    via: docker ?? "postgres",
  });
}

const args = parseArgs(process.argv.slice(2));
const cfg = load();

for (const path of args.mmdbs) {
  await loadOne(path, args.space, args.docker, cfg.databaseUrl);
}
