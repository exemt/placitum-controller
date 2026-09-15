import { compileRules } from "./rules.ts";
import { packSource } from "./pack.ts";
import { createPool } from "../db.ts";
import { RuleFileRepo } from "../rule-files.ts";
import { RuleSetRepo } from "../rule-sets.ts";

function ms(from: number): number {
  return Math.round((performance.now() - from) * 10) / 10;
}

const space = process.argv[2];
if (space === undefined) {
  throw new Error("usage: bench <space-uuid>");
}

const dest = process.argv[3] ?? `/tmp/waf-compile-bench/${space}/rules`;
const pool = createPool(
  process.env.CONTROLLER_DATABASE_URL ?? "postgres://waf:waf@postgres:5432/waf",
);
const files = new RuleFileRepo(pool);
const sets = new RuleSetRepo(pool);

try {
  const t0 = performance.now();
  const source = await sets.exportCompile(space, files);
  const loadMs = ms(t0);

  const t1 = performance.now();
  const packed = packSource(source);
  const packMs = ms(t1);

  const t2 = performance.now();
  await compileRules(dest, source);
  const writeMs = ms(t2);

  process.stdout.write(
    JSON.stringify(
      {
        files: source.files.length,
        profiles: source.profiles.length,
        blobs: packed.blobs.size,
        bytes: packed.bytes,
        sha256: packed.sha256,
        load_ms: loadMs,
        pack_ms: packMs,
        write_ms: writeMs,
        total_ms: ms(t0),
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await pool.end();
}
