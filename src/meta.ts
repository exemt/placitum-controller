import { hostname } from "node:os";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Config } from "./config.ts";

export interface Meta {
  service: string;
  version: string;
  mode: "debug";
  hostname: string;
  pid: number;
  uptime_s: number;
}

const version = readPackageVersion();

export function buildMeta(cfg: Config): Meta {
  return {
    service: cfg.name,
    version,
    mode: "debug",
    hostname: hostname(),
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
  };
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
