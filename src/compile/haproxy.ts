import { sha256 } from "./zip.ts";
import {
  HAPROXY_BALANCE,
  HAPROXY_MODES,
  type HaproxyBalance,
  type HaproxyMode,
  type HaproxyServer,
  type HaproxySettings,
} from "../model/haproxy.ts";

export const HAPROXY_CONF_KEY = "policy/haproxy-conf";
export const HAPROXY_CONF_SUBJECT = "waf.desired.haproxy";

export const HAPROXY_DEFAULTS = {
  maxconn: 4096,
  bufsize: 1048576,
  connectMs: 2000,
  clientMs: 30000,
  serverMs: 30000,
  keepaliveMs: 5000,
  tunnelMs: 3600000,
  frontendPort: 8080,
  balance: "roundrobin" as HaproxyBalance,
  checkPath: "/healthz",
  checkStatus: 200,
  checkInterMs: 2000,
  servers: [
    { name: "edge-01", host: "edge-01", port: 8080 },
    { name: "edge-02", host: "edge-02", port: 8080 },
    { name: "edge-03", host: "edge-03", port: 8080 },
  ] as HaproxyServer[],
  statsEnabled: true,
  statsPort: 8404,
  dockerDns: true,
} as const;

export function fmtMs(ms: number): string {
  if (ms > 0 && ms % 3600000 === 0) {
    return `${ms / 3600000}h`;
  }
  if (ms > 0 && ms % 60000 === 0) {
    return `${ms / 60000}m`;
  }
  if (ms > 0 && ms % 1000 === 0) {
    return `${ms / 1000}s`;
  }
  return `${ms}ms`;
}

export function haproxyServers(settings: HaproxySettings): HaproxyServer[] {
  const rows = settings.backend?.servers;
  return rows === undefined || rows.length === 0 ? HAPROXY_DEFAULTS.servers : rows;
}

export function renderHaproxyCfg(settings: HaproxySettings): string {
  const maxconn = settings.process?.maxconn ?? HAPROXY_DEFAULTS.maxconn;
  const bufsize = settings.process?.bufsize ?? HAPROXY_DEFAULTS.bufsize;
  const connect = settings.timeouts?.connectMs ?? HAPROXY_DEFAULTS.connectMs;
  const client = settings.timeouts?.clientMs ?? HAPROXY_DEFAULTS.clientMs;
  const server = settings.timeouts?.serverMs ?? HAPROXY_DEFAULTS.serverMs;
  const keepalive = settings.timeouts?.keepaliveMs ?? HAPROXY_DEFAULTS.keepaliveMs;
  const tunnel = settings.timeouts?.tunnelMs ?? HAPROXY_DEFAULTS.tunnelMs;
  const port = settings.frontend?.port ?? HAPROXY_DEFAULTS.frontendPort;
  const balance = settings.backend?.balance ?? HAPROXY_DEFAULTS.balance;
  const checkPath = settings.backend?.check?.path ?? HAPROXY_DEFAULTS.checkPath;
  const checkStatus =
    settings.backend?.check?.status ?? HAPROXY_DEFAULTS.checkStatus;
  const inter = settings.backend?.check?.interMs ?? HAPROXY_DEFAULTS.checkInterMs;
  const servers = haproxyServers(settings);
  const statsOn = settings.stats?.enabled ?? HAPROXY_DEFAULTS.statsEnabled;
  const statsPort = settings.stats?.port ?? HAPROXY_DEFAULTS.statsPort;
  const dockerDns = settings.dockerDns ?? HAPROXY_DEFAULTS.dockerDns;

  const out: string[] = [];

  out.push(
    "# Собран контроллером -- не править на ноде: следующая рассылка перезапишет.",
    "",
    "global",
    `    maxconn     ${maxconn}`,
    "    log         stdout format raw local0",
    "    log         /var/run/waf/log.sock len 8192 local0",
    `    tune.bufsize ${bufsize}`,
    "",
  );

  if (dockerDns) {
    out.push(
      "# Docker DNS: после recreate ноды старый IP иначе остаётся DOWN навсегда.",
      "resolvers docker",
      "    nameserver dns 127.0.0.11:53",
      "    resolve_retries 3",
      "    timeout resolve 1s",
      "    timeout retry   1s",
      "    hold valid      10s",
      "",
    );
  }

  const tail = dockerDns ? " resolvers docker init-addr last,libc,none" : "";
  const frontends = settings.frontends ?? [];

  if (frontends.length > 0) {
    out.push(
      "defaults",
      "    log                     global",
      "    option                  dontlognull",
      `    timeout connect         ${fmtMs(connect)}`,
      `    timeout client          ${fmtMs(client)}`,
      `    timeout server          ${fmtMs(server)}`,
      `    timeout tunnel          ${fmtMs(tunnel)}`,
    );

    for (const fe of frontends) {
      const http = fe.mode === "http";

      out.push("", `frontend fe_${fe.name}`, `    mode ${fe.mode}`);
      if (http) {
        out.push(
          "    option                  httplog",
          "    option                  http-keep-alive",
          "    option                  forwardfor",
          `    timeout http-keep-alive ${fmtMs(keepalive)}`,
        );
      } else {
        out.push("    option                  tcplog");
      }
      for (const address of fe.addresses ?? ["*"]) {
        out.push(`    bind ${address}:${fe.port}`);
      }
      out.push(
        `    default_backend be_${fe.name}`,
        "",
        `backend be_${fe.name}`,
        `    mode ${fe.mode}`,
        `    balance ${balance}`,
      );
      if (http) {
        out.push(`    option httpchk GET ${checkPath}`, `    http-check expect status ${checkStatus}`);
      }

      const proxy = !http && fe.sendProxy === true ? " send-proxy-v2 check-send-proxy" : "";
      for (const row of servers) {
        const addr = `${row.host}:${fe.serverPort ?? row.port ?? fe.port}`;
        out.push(`    server ${row.name} ${addr} check inter ${fmtMs(inter)}${proxy}${tail}`);
      }
    }

    if (statsOn) {
      out.push(
        "",
        "listen stats",
        "    mode http",
        `    bind *:${statsPort}`,
        "    stats enable",
        "    stats uri /",
        "    stats refresh 5s",
      );
    }

    out.push("");
    return out.join("\n");
  }

  out.push(
    "defaults",
    "    mode                    http",
    "    log                     global",
    "    option                  httplog",
    "    option                  dontlognull",
    "    option                  http-keep-alive",
    "    option                  forwardfor",
    `    timeout connect         ${fmtMs(connect)}`,
    `    timeout client          ${fmtMs(client)}`,
    `    timeout server          ${fmtMs(server)}`,
    `    timeout http-keep-alive ${fmtMs(keepalive)}`,
    `    timeout tunnel          ${fmtMs(tunnel)}`,
    "",
    "frontend fe_waf",
    `    bind *:${port}`,
    "    default_backend be_nginx",
    "",
    "backend be_nginx",
    `    balance ${balance}`,
    `    option httpchk GET ${checkPath}`,
    `    http-check expect status ${checkStatus}`,
  );

  for (const row of servers) {
    const addr = `${row.host}:${row.port ?? HAPROXY_DEFAULTS.frontendPort}`;
    out.push(`    server ${row.name} ${addr} check inter ${fmtMs(inter)}${tail}`);
  }

  if (statsOn) {
    out.push(
      "",
      "# Распределение по backend'у и его health без захода в контейнер.",
      "listen stats",
      `    bind *:${statsPort}`,
      "    stats enable",
      "    stats uri /",
      "    stats refresh 5s",
    );
  }

  out.push("");
  return out.join("\n");
}

export interface HaproxyConfPointer {
  v: 1;
  kind: "haproxy-conf";
  rev: number;
  sha256: string;
  cfg: string;
}

export function hashHaproxyConf(settings: HaproxySettings): string {
  return sha256(Buffer.from(renderHaproxyCfg(settings), "utf8"));
}

export function buildHaproxyConf(
  settings: HaproxySettings,
  rev: number,
): HaproxyConfPointer {
  const cfg = renderHaproxyCfg(settings);
  return {
    v: 1,
    kind: "haproxy-conf",
    rev,
    sha256: sha256(Buffer.from(cfg, "utf8")),
    cfg,
  };
}

export function parseHaproxyConfPointer(
  input: unknown,
): HaproxyConfPointer | null {
  if (typeof input !== "object" || input === null) return null;

  const row = input as Record<string, unknown>;

  if (
    row.v !== 1 ||
    row.kind !== "haproxy-conf" ||
    typeof row.rev !== "number" ||
    !Number.isInteger(row.rev) ||
    row.rev < 1 ||
    typeof row.sha256 !== "string" ||
    typeof row.cfg !== "string"
  ) {
    return null;
  }

  return input as HaproxyConfPointer;
}

export function jsonHaproxyConf(
  pointer: HaproxyConfPointer,
): Record<string, unknown> {
  return { rev: pointer.rev, sha256: pointer.sha256 };
}

export function isHaproxyMode(value: unknown): value is HaproxyMode {
  return typeof value === "string" && (HAPROXY_MODES as readonly string[]).includes(value);
}

export function isHaproxyBalance(value: unknown): value is HaproxyBalance {
  return (HAPROXY_BALANCE as readonly unknown[]).includes(value);
}
