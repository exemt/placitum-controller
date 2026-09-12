import { IpCompiler } from "../compile.ts";
import { CompileRedis } from "./redis.ts";
import { createPool } from "../db.ts";
import { startDesiredStore } from "../desired.ts";
import { InspectorRepo } from "../inspectors.ts";
import { IpProfileRepo } from "../ip-profiles.ts";
import type { AppDispatch } from "../state/types.ts";

const space = process.argv[2];
if (space === undefined) {
  throw new Error("usage: ip-bench <space-uuid>");
}

const pool = createPool(
  process.env.CONTROLLER_DATABASE_URL ?? "postgres://waf:waf@127.0.0.1:5432/waf",
);
// Блобы -- во внутренний Redis контура, как у самого контроллера (main.ts).
const redisUrl =
  process.env.CONTROLLER_REDIS_INTERNAL_URL ??
  process.env.CONTROLLER_REDIS_URL ??
  "redis://127.0.0.1:6380";
const natsUrl = process.env.CONTROLLER_NATS_URL ?? "nats://127.0.0.1:4222";
const dest = process.env.CONTROLLER_COMPILE_DIR ?? "/tmp/waf-ip-compile";

const profiles = new IpProfileRepo(pool);
const redis = new CompileRedis(redisUrl);
const desired = await startDesiredStore(natsUrl, (() => {}) as AppDispatch);
// Настройки процесса -- из того же каталога, что у контроллера: иначе хеш
// замера разошёлся бы с боевым.
const compiler = new IpCompiler(
  dest,
  profiles,
  new InspectorRepo(pool).settingsSource(),
  redis,
  desired,
);

try {
  const out = await compiler.compile(space);
  process.stdout.write(
    JSON.stringify(
      {
        files: out.files,
        sets: out.sets,
        profiles: out.profiles,
        sha256: out.sha256,
        pointer: out.pointer === null
          ? null
          : {
              rev: out.pointer.rev,
              blobs: out.pointer.blobs,
              wrote: out.pointer.wrote,
              reused: out.pointer.reused,
              bytes: out.pointer.bytes,
              ttl: out.pointer.ttl,
              lists: Object.keys(out.pointer.lists).length,
              live: Object.keys(out.pointer.live).length,
              countries: Object.keys(out.pointer.countries),
              asns: Object.keys(out.pointer.asns),
              sets: Object.keys(out.pointer.sets).length,
              profiles: Object.keys(out.pointer.profiles).length,
            },
        ...out.took,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  desired.close();
  await pool.end();
}
