/*
 * Дамп каталога GeoLite2 из Postgres в schema/seed/*.sql.
 * UUID пространства нет: заливка ищет http_spaces по имени.
 *
 *   node src/dump-geo.ts [--space default] [--docker waf-postgres-1] [--dump-dir schema/seed]
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dumpSelect, seedSql, targetOf, type GeoKind } from "./geo-sql.ts";
import { log } from "./log.ts";

const SPACE_RE = /^[a-zA-Z0-9_-]+$/;
const KINDS: GeoKind[] = ["country", "asn"];

function here(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function parseArgs(argv: string[]): { space: string; docker: string; dumpDir: string } {
  let space = "default";
  let docker = "waf-postgres-1";
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

    if (arg === "--dump-dir") {
      const value = argv[i + 1];

      if (value === undefined || value.startsWith("-")) {
        throw new Error("--dump-dir needs a path");
      }

      dumpDir = value;
      i += 1;
      continue;
    }

    throw new Error(
      "usage: node src/dump-geo.ts [--space default] [--docker [container]] [--dump-dir schema/seed]",
    );
  }

  if (!SPACE_RE.test(space)) {
    throw new Error(`invalid space name "${space}"`);
  }

  return { space, docker, dumpDir };
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
        return;
      }

      reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function dumpKind(kind: GeoKind, container: string, space: string, dumpDir: string): Promise<void> {
  const tsv = await runCapture("docker", [
    "exec",
    "-u",
    "postgres",
    container,
    "psql",
    "-U",
    "waf",
    "-d",
    "waf",
    "-Atq",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `copy (${dumpSelect(kind, space)}) to stdout`,
  ]);

  if (tsv.trim().length === 0) {
    throw new Error(`${kind}: catalog is empty`);
  }

  const dest = join(dumpDir, targetOf(kind).seed);
  await mkdir(dumpDir, { recursive: true });
  await writeFile(dest, seedSql(kind, space, tsv), "utf8");
  const lines = tsv.split("\n").filter((line) => line.length > 0).length;
  log("info", "geo dumped", { kind, space, rows: lines, path: dest });
}

const args = parseArgs(process.argv.slice(2));

for (const kind of KINDS) {
  await dumpKind(kind, args.docker, args.space, args.dumpDir);
}
