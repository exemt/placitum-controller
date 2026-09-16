export interface StatusRates {
  "2xx": number;
  "3xx": number;
  "4xx": number;
  "5xx": number;
}

export interface Flow {
  ops: number;
  in?: number;
  out?: number;
  err?: number;
  p50_ms?: number;
  p95_ms?: number;
  max_ms?: number;
  avg_ms?: number;
}

export type FlowMap = Record<string, Flow>;

export interface PulseError {
  at: string;
  msg: string;
  count?: number;
  source?: string;
}

export interface BusStats {
  reconnects: number;
  rtt_ms?: number;
}

export interface WafRates {
  allow: number;
  deny: number;
  challenge?: number;
  deadline_hits?: number;
  fail_open?: number;
  fail_closed?: number;
}

export interface MarksView {
  skew_ms?: number;
  restarts_1h?: number;
  bus_flaps_1h?: number;
}

export interface FleetMemberView extends MarksView {
  uuid: string;
  kind: "agent" | "worker";
  status: "up" | "degraded";
  seen_at: string;
  age_ms: number;
  apply?: string;
  agent_conf?: { rev: number; sha256: string; apply: string };
  rps?: number;
  codes?: StatusRates;
  waf?: WafRates;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  health: {
    node_id: string;
    hostname?: string;
    version?: string;
    revision?: string;
    config_hash?: string;
    conf_fingerprint?: string;
    pid?: number;
    nonce?: string;
  };
  host?: {
    cpu: {
      cores: number;
      usage: number;
      load1: number;
      load5: number;
      load15: number;
    };
    memory: { total: number; used: number; available: number };
    disk?: { total: number; used: number };
    uptime_s: number;
  };
}

export type InspectorDrift =
  | "ok"
  | "stale"
  | "pending"
  | "failed"
  | "foreign"
  | "silent"
  | "unmanaged"
  | "unknown";

export interface RulesDesired {
  config_hash: string;
  rev: number;
}

export interface InspectorView extends MarksView {
  uuid: string;
  kind: "inspector";
  status: "up" | "degraded";
  seen_at: string;
  age_ms: number;
  name: string;
  subject: string;
  queue: string;
  hostname: string;
  ready: boolean;
  version?: string;
  revision?: string;
  host?: FleetMemberView["host"];
  work?: {
    workers?: number;
    queue_depth?: number;
    queued?: number;
    accepted?: number;
    shed?: number;
    expired?: number;
    rules?: number;
  };
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  config_hash?: string;
  rev?: number;
  apply?: string;
  profiles?: string[];
  drift?: InspectorDrift;
}

export interface ServiceWork {
  inserted?: number;
  last_batch?: number;
  lag?: number;
  clickhouse_ok?: boolean;
  error?: string;
  countries?: number;
  asns?: number;
  skipped?: number;
  gen?: number;
  fingerprint?: string;
}

export interface ServiceView extends MarksView {
  uuid: string;
  kind: "service";
  status: "up" | "degraded";
  seen_at: string;
  age_ms: number;
  name: string;
  hostname: string;
  ready: boolean;
  version?: string;
  revision?: string;
  host?: FleetMemberView["host"];
  work?: ServiceWork;
  conf?: {
    rev: number;
    sha256: string;
    apply: string;
  };
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
}

export interface RedisView extends MarksView {
  uuid: string;
  kind: "redis";
  status: "up" | "degraded";
  seen_at: string;
  age_ms: number;
  name: string;
  hostname: string;
  ready: boolean;
  version?: string;
  revision?: string;
  host?: FleetMemberView["host"];
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  evicted_1h?: number;
  redis: {
    ok: boolean;
    error?: string;
    version?: string;
    role?: string;
    used_memory?: number;
    used_memory_rss?: number;
    used_memory_peak?: number;
    maxmemory?: number;
    maxmemory_policy?: string;
    keys?: number;
    expires?: number;
    evicted?: number;
    expired?: number;
    hits?: number;
    misses?: number;
    clients?: number;
    uptime_s?: number;
  };
}

export interface S3View extends MarksView {
  uuid: string;
  kind: "s3";
  status: "up" | "degraded";
  seen_at: string;
  age_ms: number;
  name: string;
  hostname: string;
  ready: boolean;
  version?: string;
  revision?: string;
  host?: FleetMemberView["host"];
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  s3: {
    ok: boolean;
    error?: string;
    version?: string;
    endpoint?: string;
    bucket?: string;
    region?: string;
    objects?: number;
    used_bytes?: number;
    capacity?: number;
    buckets?: number;
    uptime_s?: number;
  };
}

export type StoreView = RedisView | S3View;

export interface RouteTrafficView {
  server: string;
  location: string;
  id?: string;
  rps: number;
  codes: StatusRates;
  nodes: number;
}

export interface FleetSnapshot {
  v: 1;
  type: "snapshot";
  seq: number;
  at: string;
  agents: (FleetMemberView & { workers: FleetMemberView[] })[];
  orphans: FleetMemberView[];
  inspectors?: InspectorView[];
  stores?: StoreView[];
  services?: ServiceView[];
  routes?: RouteTrafficView[];
}

export type FleetLamp = "green" | "yellow" | "red";

function fleetMembers(snap: FleetSnapshot): { status: "up" | "degraded" }[] {
  return [
    ...snap.agents,
    ...snap.agents.flatMap((row) => row.workers),
    ...snap.orphans,
    ...(snap.inspectors ?? []),
    ...(snap.stores ?? []),
    ...(snap.services ?? []),
  ];
}

export function fleetLamp(
  connected: boolean,
  snap: FleetSnapshot | null,
): FleetLamp {
  if (!connected || snap === null) {
    return "red";
  }

  const members = fleetMembers(snap);

  if (members.length === 0) {
    return "yellow";
  }

  if (members.every((row) => row.status === "up")) {
    return "green";
  }

  if (members.every((row) => row.status === "degraded")) {
    return "red";
  }

  return "yellow";
}

export function agentDrifted(
  agent: FleetMemberView & { workers: FleetMemberView[] },
): boolean {
  if (agent.apply !== undefined && agent.apply !== "ok") {
    return true;
  }
  const conf = agent.health.conf_fingerprint;
  if (conf === undefined) {
    return false;
  }
  return agent.workers.some(
    (row) =>
      row.health.config_hash !== undefined && row.health.config_hash !== conf,
  );
}

export function fleetLiveness(snap: FleetSnapshot | null): {
  up: number;
  total: number;
} {
  if (snap === null) {
    return { up: 0, total: 0 };
  }
  const members = fleetMembers(snap);
  return {
    up: members.filter((row) => row.status === "up").length,
    total: members.length,
  };
}

export const cardKey = {
  agent: (uuid: string) => uuid,
  orphan: (nodeId: string) => `orphan:${nodeId}`,
  inspector: (name: string) => `inspector:${name}`,
  store: (uuid: string) => `store:${uuid}`,
  service: (name: string) => `service:${name}`,
} as const;

export function cardAnchor(key: string): string {
  return `card:${key}`;
}

export interface FleetErrors {
  entries: number;
  members: number;
  first?: string;
}

export function fleetErrors(snap: FleetSnapshot | null): FleetErrors {
  if (snap === null) {
    return { entries: 0, members: 0 };
  }

  const buckets: { key: string; errors?: PulseError[] }[] = [
    ...snap.agents.map((row) => ({
      key: cardKey.agent(row.uuid),
      errors: row.errors,
    })),
    ...snap.orphans.map((row) => ({
      key: cardKey.orphan(row.health.node_id),
      errors: row.errors,
    })),
    ...(snap.inspectors ?? []).map((row) => ({
      key: cardKey.inspector(row.name),
      errors: row.errors,
    })),
    ...(snap.stores ?? []).map((row) => ({
      key: cardKey.store(row.uuid),
      errors: row.errors,
    })),
    ...(snap.services ?? []).map((row) => ({
      key: cardKey.service(row.name),
      errors: row.errors,
    })),
  ];

  let entries = 0;
  let members = 0;
  let first: string | undefined;
  for (const row of buckets) {
    const list = row.errors ?? [];
    if (list.length === 0) {
      continue;
    }
    members += 1;
    entries += list.reduce((sum, error) => sum + (error.count ?? 1), 0);
    first ??= row.key;
  }

  return { entries, members, first };
}

export function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

export function shortHash(hash: string | undefined): string {
  if (hash === undefined || hash.length === 0) {
    return "—";
  }
  const body = hash.replace(/^sha256:/, "");
  return body.slice(0, 8);
}

export function formatBytes(n: number): string {
  if (n >= 1_073_741_824) {
    return `${(n / 1_073_741_824).toFixed(1)}G`;
  }
  if (n >= 1_048_576) {
    return `${Math.round(n / 1_048_576)}M`;
  }
  if (n >= 1024) {
    return `${Math.round(n / 1024)}K`;
  }
  return `${Math.round(n)}B`;
}

export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatCpu(usage: number): string {
  return `${Math.round(usage * 100)}%`;
}

export function formatRps(n: number): string {
  if (n >= 100) {
    return String(Math.round(n));
  }
  if (n >= 10) {
    return n.toFixed(0);
  }
  return n.toFixed(1);
}

export function formatBytesRate(n: number): string {
  return `${formatBytes(n)}/s`;
}

export function formatMs(ms: number): string {
  if (ms >= 100) {
    return String(Math.round(ms));
  }
  if (ms >= 10) {
    return ms.toFixed(0);
  }
  return ms.toFixed(1);
}

export function pickFlow(
  io: FlowMap | undefined,
  primary: string,
): [string, Flow] | null {
  if (io === undefined) {
    return null;
  }
  const named = io[primary];
  if (named !== undefined) {
    return [primary, named];
  }
  return Object.entries(io)[0] ?? null;
}

export function worstHost(
  rows: { host?: FleetMemberView["host"] }[],
): FleetMemberView["host"] | undefined {
  let picked: FleetMemberView["host"] | undefined;
  let worst = -1;
  for (const row of rows) {
    const host = row.host;
    if (host !== undefined && host.cpu.usage > worst) {
      worst = host.cpu.usage;
      picked = host;
    }
  }
  return picked;
}

export function sumFlows(rows: { io?: FlowMap }[]): FlowMap | undefined {
  const out: FlowMap = {};
  for (const row of rows) {
    for (const [name, flow] of Object.entries(row.io ?? {})) {
      const acc = out[name];
      if (acc === undefined) {
        out[name] = { ...flow };
        continue;
      }
      const prevOps = acc.ops;
      acc.ops += flow.ops;
      acc.in = add(acc.in, flow.in);
      acc.out = add(acc.out, flow.out);
      acc.err = add(acc.err, flow.err);
      acc.p50_ms = worst(acc.p50_ms, flow.p50_ms);
      acc.p95_ms = worst(acc.p95_ms, flow.p95_ms);
      acc.max_ms = worst(acc.max_ms, flow.max_ms);
      acc.avg_ms = mergeAvg(acc.avg_ms, prevOps, flow.avg_ms, flow.ops);
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function add(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

function worst(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  return a === undefined && b === undefined ? undefined : Math.max(a ?? 0, b ?? 0);
}

function mergeAvg(
  accAvg: number | undefined,
  accOps: number,
  nextAvg: number | undefined,
  nextOps: number,
): number | undefined {
  const a = accAvg !== undefined && accOps > 0 ? accOps : 0;
  const b = nextAvg !== undefined && nextOps > 0 ? nextOps : 0;
  if (a + b === 0) {
    return nextAvg ?? accAvg;
  }
  return ((accAvg ?? 0) * a + (nextAvg ?? 0) * b) / (a + b);
}

export function mergeErrors(
  rows: { errors?: PulseError[] }[],
): PulseError[] {
  const merged = new Map<string, PulseError>();
  for (const row of rows) {
    for (const error of row.errors ?? []) {
      const key = `${error.source ?? ""}\u0000${error.msg}`;
      const prev = merged.get(key);
      if (prev === undefined) {
        merged.set(key, { ...error });
        continue;
      }
      prev.count = (prev.count ?? 1) + (error.count ?? 1);
      if (Date.parse(error.at) > Date.parse(prev.at)) {
        prev.at = error.at;
      }
    }
  }
  return [...merged.values()].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
}

export function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m`;
  }
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
