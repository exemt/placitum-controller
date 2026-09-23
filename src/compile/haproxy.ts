import { sha256 } from "./zip.ts";
import {
  HAPROXY_BALANCE,
  HAPROXY_MODES,
  type HaproxyBalance,
  type HaproxyMode,
  type HaproxyServer,
  type HaproxySettings,
} from "../model/haproxy.ts";
import type { Port } from "../model/listen.ts";

export const HAPROXY_CONF_KEY = "policy/haproxy-conf";
export const HAPROXY_CONF_SUBJECT = "waf.desired.haproxy";

// The panel port is published from the first node by Docker and never goes through the balancer.
export const PANEL_PORT_NAME = "panel";

export const HAPROXY_DEFAULTS = {
  maxconn: 4096,
  bufsize: 1048576,
  connectMs: 2000,
  clientMs: 30000,
  serverMs: 30000,
  keepaliveMs: 5000,
  tunnelMs: 3600000,
  balance: "roundrobin" as HaproxyBalance,
  checkStatus: 200,
  checkInterMs: 2000,
  servers: [
    { name: "edge-01", host: "edge-01" },
    { name: "edge-02", host: "edge-02" },
    { name: "edge-03", host: "edge-03" },
  ] as HaproxyServer[],
  statsEnabled: true,
  statsPort: 8404,
  dockerDns: true,
} as const;

// One entry point of the balancer: the ports of the space with one node port share it. port is
// where haproxy listens, serverPort where the nodes do; the two differ only through entry.ports.
// taken: the entry port belongs to another entry, the one entry.ports put there, and this one is
// not printed -- 80 in front of 8080 wins over a panel port 80 of its own.
export interface HaproxyEntryPoint {
  name: string;
  port: number;
  serverPort: number;
  mode: HaproxyMode;
  sendProxy: boolean;
  ssl: boolean;
  addresses: string[];
  ports: string[];
  taken?: string;
}

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

const LOOPBACK_RE = /^(127(\.\d{1,3}){3}|::1|\[::1\]|localhost)$/i;

// A port the nodes serve to the network. The panel port stays with the first node, and a port on
// the loopback of the node is out of reach for the balancer anyway.
export function isTrafficPort(port: Pick<Port, "name" | "address">): boolean {
  return port.name !== PANEL_PORT_NAME && !LOOPBACK_RE.test(port.address.trim());
}

// haproxy proxy names: letters, digits, dash, underscore, dot and colon.
function proxyName(name: string): string {
  const clean = name.trim().replace(/[^A-Za-z0-9_.:-]/g, "_");
  return clean === "" ? "port" : clean;
}

function byPort(a: Port, b: Port): number {
  return a.port - b.port || a.address.localeCompare(b.address) || a.name.localeCompare(b.name);
}

export function haproxyEntries(
  settings: HaproxySettings,
  ports: readonly Port[],
): HaproxyEntryPoint[] {
  const map = settings.entry?.ports ?? {};
  const addresses = settings.entry?.addresses ?? [];
  const groups = new Map<number, Port[]>();

  for (const row of [...ports].filter(isTrafficPort).sort(byPort)) {
    const rows = groups.get(row.port);
    if (rows === undefined) {
      groups.set(row.port, [row]);
    } else {
      rows.push(row);
    }
  }

  const out: HaproxyEntryPoint[] = [];
  const names = new Set<string>();

  for (const [serverPort, rows] of groups) {
    let name = proxyName(rows[0].name);
    if (names.has(name)) {
      name = `${name}_${serverPort}`;
    }
    for (let n = 2; names.has(name); n += 1) {
      name = `${proxyName(rows[0].name)}_${serverPort}_${n}`;
    }
    names.add(name);

    // TLS passes through, and PROXY protocol needs a raw connection; a plain port is spoken to
    // in HTTP, so the balancer adds X-Forwarded-For.
    const ssl = rows.some((row) => row.ssl);
    const sendProxy = rows.some((row) => row.proxyProtocol);

    out.push({
      name,
      port: map[String(serverPort)] ?? serverPort,
      serverPort,
      mode: ssl || sendProxy ? "tcp" : "http",
      sendProxy,
      ssl,
      addresses: [...addresses],
      ports: rows.map((row) => row.name),
    });
  }

  // An entry port put in front of a node port by entry.ports beats a node port of the same number.
  const holder = new Map<number, string>();
  for (const row of out) {
    if (row.port !== row.serverPort) {
      holder.set(row.port, row.name);
    }
  }
  for (const row of out) {
    const owner = holder.get(row.port);
    if (row.port === row.serverPort && owner !== undefined) {
      row.taken = owner;
    }
  }

  return out;
}

export function renderHaproxyCfg(settings: HaproxySettings, ports: readonly Port[]): string {
  const maxconn = settings.process?.maxconn ?? HAPROXY_DEFAULTS.maxconn;
  const bufsize = settings.process?.bufsize ?? HAPROXY_DEFAULTS.bufsize;
  const connect = settings.timeouts?.connectMs ?? HAPROXY_DEFAULTS.connectMs;
  const client = settings.timeouts?.clientMs ?? HAPROXY_DEFAULTS.clientMs;
  const server = settings.timeouts?.serverMs ?? HAPROXY_DEFAULTS.serverMs;
  const keepalive = settings.timeouts?.keepaliveMs ?? HAPROXY_DEFAULTS.keepaliveMs;
  const tunnel = settings.timeouts?.tunnelMs ?? HAPROXY_DEFAULTS.tunnelMs;
  const balance = settings.backend?.balance ?? HAPROXY_DEFAULTS.balance;
  // Without a path the check is a TCP connect: a node counts as healthy once it listens. A path
  // turns it into an HTTP check on the plain ports; the product ships no health route of its own.
  const checkPath = settings.backend?.check?.path;
  const checkStatus =
    settings.backend?.check?.status ?? HAPROXY_DEFAULTS.checkStatus;
  const inter = settings.backend?.check?.interMs ?? HAPROXY_DEFAULTS.checkInterMs;
  const servers = haproxyServers(settings);
  const statsOn = settings.stats?.enabled ?? HAPROXY_DEFAULTS.statsEnabled;
  const statsPort = settings.stats?.port ?? HAPROXY_DEFAULTS.statsPort;
  const dockerDns = settings.dockerDns ?? HAPROXY_DEFAULTS.dockerDns;
  const entries = haproxyEntries(settings, ports);

  const out: string[] = [];

  out.push(
    "# Rendered by the controller -- do not edit on the node: the next send overwrites it.",
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
      "# Docker DNS: after a recreate the old IP of a node would otherwise stay DOWN forever.",
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

  out.push(
    "defaults",
    "    log                     global",
    "    option                  dontlognull",
    `    timeout connect         ${fmtMs(connect)}`,
    `    timeout client          ${fmtMs(client)}`,
    `    timeout server          ${fmtMs(server)}`,
    `    timeout tunnel          ${fmtMs(tunnel)}`,
  );

  if (entries.every((row) => row.taken !== undefined)) {
    out.push("", "# No traffic ports in the space: nothing to listen on.");
  }

  for (const fe of entries) {
    const http = fe.mode === "http";
    const label = `${fe.ports.length === 1 ? "port" : "ports"} ${fe.ports.join(", ")}`;

    if (fe.taken !== undefined) {
      out.push("", `# ${label}: entry port ${fe.port} is taken by ${fe.taken}`);
      continue;
    }

    out.push(
      "",
      `# ${label}`,
      `frontend fe_${fe.name}`,
      `    mode ${fe.mode}`,
    );
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
    for (const address of fe.addresses.length === 0 ? ["*"] : fe.addresses) {
      out.push(`    bind ${address}:${fe.port}`);
    }
    out.push(
      `    default_backend be_${fe.name}`,
      "",
      `backend be_${fe.name}`,
      `    mode ${fe.mode}`,
      `    balance ${balance}`,
    );
    if (http && checkPath !== undefined) {
      out.push(`    option httpchk GET ${checkPath}`, `    http-check expect status ${checkStatus}`);
    }

    const proxy = fe.sendProxy ? " send-proxy-v2 check-send-proxy" : "";
    for (const row of servers) {
      out.push(
        `    server ${row.name} ${row.host}:${fe.serverPort} check inter ${fmtMs(inter)}${proxy}${tail}`,
      );
    }
  }

  if (statsOn) {
    out.push(
      "",
      "# Distribution over the backends and their health without entering the container.",
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

export interface HaproxyConfPointer {
  v: 1;
  kind: "haproxy-conf";
  rev: number;
  sha256: string;
  cfg: string;
}

export function hashHaproxyConf(settings: HaproxySettings, ports: readonly Port[]): string {
  return sha256(Buffer.from(renderHaproxyCfg(settings, ports), "utf8"));
}

export function buildHaproxyConf(
  settings: HaproxySettings,
  ports: readonly Port[],
  rev: number,
): HaproxyConfPointer {
  const cfg = renderHaproxyCfg(settings, ports);
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

export function jsonHaproxyEntry(row: HaproxyEntryPoint): Record<string, unknown> {
  return {
    name: row.name,
    port: row.port,
    server_port: row.serverPort,
    mode: row.mode,
    send_proxy: row.sendProxy,
    ssl: row.ssl,
    addresses: [...row.addresses],
    ports: [...row.ports],
    taken: row.taken ?? null,
  };
}

export function isHaproxyMode(value: unknown): value is HaproxyMode {
  return typeof value === "string" && (HAPROXY_MODES as readonly string[]).includes(value);
}

export function isHaproxyBalance(value: unknown): value is HaproxyBalance {
  return (HAPROXY_BALANCE as readonly unknown[]).includes(value);
}
