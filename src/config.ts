import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function defaultUxDir(): string | undefined {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "ux", "dist");
  return existsSync(join(dir, "index.html")) ? dir : undefined;
}

export interface Config {
  port: number;
  name: string;
  logLevel: string;
  logShip: boolean;
  logWriter: string;
  corsOrigin: string;
  databaseUrl: string;
  schemaDir: string;
  version: string;
  revision: string;
  storeMaxBytes: number;
  uxDir?: string;
  fleetDegradedMs: number;
  fleetExpireMs: number;
  fleetTickMs: number;
  fleetDemo: boolean;
  natsUrl: string;
  searchUrl: string;
  geoUrl: string;
  cryptoPublicKey: string;
  cryptoServiceUrl: string;
  compileDir: string;
  redisUrl: string;
  redisInternalUrl: string;
}

export function load(env: NodeJS.ProcessEnv = process.env): Config {
  const fromEnv = env.CONTROLLER_UX_DIR;
  const uxDir =
    fromEnv !== undefined && fromEnv !== ""
      ? fromEnv
      : defaultUxDir();

  return {
    port: Number(env.CONTROLLER_PORT ?? env.PORT ?? 8080),
    name: env.CONTROLLER_NAME ?? "controller",
    logLevel: env.CONTROLLER_LOG ?? "info",
    logShip: !["off", "0", "no", "false"].includes(
      (env.WAF_LOG_SHIP ?? "").trim().toLowerCase(),
    ),
    logWriter: (env.WAF_LOG_WRITER ?? "").trim() || hostname(),
    corsOrigin: env.CONTROLLER_CORS_ORIGIN ?? "http://127.0.0.1:5173",
    databaseUrl:
      env.CONTROLLER_DATABASE_URL ??
      "postgres://waf:waf@127.0.0.1:5432/waf",
    schemaDir: env.CONTROLLER_SCHEMA_DIR ?? join(process.cwd(), "schema"),
    version: env.CONTROLLER_VERSION ?? "dev",
    revision: env.CONTROLLER_REVISION ?? "unknown",
    storeMaxBytes: Number(env.CONTROLLER_STORE_MAX_BYTES ?? 2 * 1024 * 1024),
    uxDir:
      uxDir !== undefined && existsSync(join(uxDir, "index.html"))
        ? uxDir
        : undefined,
    fleetDegradedMs: Number(env.CONTROLLER_FLEET_DEGRADED_MS ?? 15_000),
    fleetExpireMs: Number(env.CONTROLLER_FLEET_EXPIRE_MS ?? 60_000),
    fleetTickMs: Number(env.CONTROLLER_FLEET_TICK_MS ?? 1_000),
    fleetDemo: env.CONTROLLER_FLEET_DEMO !== "0",
    natsUrl: env.CONTROLLER_NATS_URL ?? env.NATS_URL ?? "nats://127.0.0.1:4222",
    searchUrl: env.CONTROLLER_SEARCH_URL ?? "",
    geoUrl: env.CONTROLLER_GEO_URL ?? "",
    cryptoPublicKey: env.CONTROLLER_CRYPTO_PUBLIC_KEY ?? "",
    cryptoServiceUrl: env.CONTROLLER_CRYPTO_SERVICE_URL ?? "",
    compileDir: env.CONTROLLER_COMPILE_DIR ?? join(process.cwd(), "data", "compile"),
    redisUrl: env.CONTROLLER_REDIS_URL ?? "",
    redisInternalUrl:
      env.CONTROLLER_REDIS_INTERNAL_URL ?? env.CONTROLLER_REDIS_URL ?? "",
  };
}
