export type FleetStatus = "up" | "degraded";

export interface WorkerPulse {
  v: 1;
  kind: "worker";
  node_id: string;
  pid: number;
  nonce: string;
  config_hash: string;
  at: string;
}

export interface DerivedMarks {
  skewMs?: number;
  restartsAt?: number[];
  busFlapAt?: number[];
}

export interface WorkerRecord extends WorkerPulse, DerivedMarks {
  status: FleetStatus;
  seenAt: number;
}

export interface HostCPU {
  cores: number;
  usage: number;
  load1: number;
  load5: number;
  load15: number;
}

export interface HostMemory {
  total: number;
  used: number;
  available: number;
}

export interface HostDisk {
  total: number;
  used: number;
}

export interface HostSnapshot {
  cpu: HostCPU;
  memory: HostMemory;
  disk?: HostDisk;
  uptime_s: number;
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

export const PULSE_ERRORS_MAX = 5;

export const PULSE_ERROR_MSG_MAX = 200;

export interface AgentPulse {
  v: 1;
  kind: "agent";
  id: string;
  node_id: string;
  hostname: string;
  version?: string;
  revision?: string;
  config_hash?: string;
  rev?: number;
  apply?: string;
  conf_fingerprint?: string;
  nginx_manage?: boolean;
  agent_conf?: AgentConfState;
  at: string;
  rps?: number;
  codes?: StatusRates;
  routes?: RouteRates[];
  waf?: WafRates;
  host: HostSnapshot;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
}

export interface AgentConfState {
  rev: number;
  sha256: string;
  apply: string;
}

export interface RouteRates {
  server: string;
  location: string;
  id?: string;
  rps: number;
  codes?: StatusRates;
}

export interface StatusRates {
  "2xx": number;
  "3xx": number;
  "4xx": number;
  "5xx": number;
}

export interface AgentRecord extends AgentPulse, DerivedMarks {
  status: FleetStatus;
  seenAt: number;
}

export interface InspectorWork {
  workers?: number;
  queue_depth?: number;
  queued?: number;
  accepted?: number;
  shed?: number;
  expired?: number;
  rules?: number;
}

export interface InspectorLiveSet {
  uuid: string;
  seq: number;
  base: number;
  live: number;
  ready: boolean;
}

export interface InspectorPulse {
  v: 1;
  kind: "inspector";
  id: string;
  name: string;
  subject: string;
  queue: string;
  hostname: string;
  version?: string;
  revision?: string;
  ready: boolean;
  at: string;
  host?: HostSnapshot;
  work?: InspectorWork;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  config_hash?: string;
  rev?: number;
  apply?: string;
  profiles?: string[];
  live?: InspectorLiveSet[];
}

export interface InspectorRecord extends InspectorPulse, DerivedMarks {
  status: FleetStatus;
  seenAt: number;
}

export interface RedisStore {
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
}

export interface RedisPulse {
  v: 1;
  kind: "redis";
  id: string;
  name: string;
  hostname: string;
  version?: string;
  revision?: string;
  ready: boolean;
  at: string;
  host?: HostSnapshot;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  redis: RedisStore;
}

export interface RedisRecord extends RedisPulse, DerivedMarks {
  status: FleetStatus;
  seenAt: number;
  evictedHits?: { ts: number; n: number }[];
}

export interface S3Store {
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
}

export interface S3Pulse {
  v: 1;
  kind: "s3";
  id: string;
  name: string;
  hostname: string;
  version?: string;
  revision?: string;
  ready: boolean;
  at: string;
  host?: HostSnapshot;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  s3: S3Store;
}

export interface S3Record extends S3Pulse, DerivedMarks {
  status: FleetStatus;
  seenAt: number;
}

export type StoreRecord = RedisRecord | S3Record;

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
  country_sha256?: string;
  asn_sha256?: string;
}

export interface ServicePulse {
  v: 1;
  kind: "service";
  id: string;
  name: string;
  hostname: string;
  version?: string;
  revision?: string;
  ready: boolean;
  at: string;
  host?: HostSnapshot;
  work?: ServiceWork;
  conf?: AgentConfState;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
}

export interface ServiceRecord extends ServicePulse, DerivedMarks {
  status: FleetStatus;
  seenAt: number;
}

export function workerKey(row: {
  node_id: string;
  pid: number;
  nonce: string;
}): string {
  return `${row.node_id}:${row.pid}:${row.nonce}`;
}

function asObject(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  return input as Record<string, unknown>;
}

function asFinite(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}

function asString(input: unknown): string | null {
  return typeof input === "string" && input.length > 0 ? input : null;
}

export function parseWorkerPulse(input: unknown): WorkerPulse | null {
  const row = asObject(input);
  if (row === null || row.v !== 1 || row.kind !== "worker") {
    return null;
  }
  const nodeId = asString(row.node_id);
  const nonce = asString(row.nonce);
  const hash = asString(row.config_hash);
  const at = asString(row.at);
  const pid = asFinite(row.pid);
  if (
    nodeId === null ||
    nonce === null ||
    hash === null ||
    at === null ||
    pid === null ||
    !Number.isInteger(pid) ||
    pid < 0 ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  return {
    v: 1,
    kind: "worker",
    node_id: nodeId,
    pid,
    nonce,
    config_hash: hash,
    at,
  };
}

function parseHost(input: unknown): HostSnapshot | null {
  const row = asObject(input);
  if (row === null) {
    return null;
  }
  const cpu = asObject(row.cpu);
  const memory = asObject(row.memory);
  if (cpu === null || memory === null) {
    return null;
  }
  const cores = asFinite(cpu.cores);
  const usage = asFinite(cpu.usage);
  const load1 = asFinite(cpu.load1);
  const load5 = asFinite(cpu.load5);
  const load15 = asFinite(cpu.load15);
  const total = asFinite(memory.total);
  const used = asFinite(memory.used);
  const available = asFinite(memory.available);
  const uptime = asFinite(row.uptime_s);
  if (
    cores === null ||
    usage === null ||
    load1 === null ||
    load5 === null ||
    load15 === null ||
    total === null ||
    used === null ||
    available === null ||
    uptime === null
  ) {
    return null;
  }
  const host: HostSnapshot = {
    cpu: { cores, usage, load1, load5, load15 },
    memory: { total, used, available },
    uptime_s: uptime,
  };
  const disk = asObject(row.disk);
  if (disk !== null) {
    const diskTotal = asFinite(disk.total);
    const diskUsed = asFinite(disk.used);
    if (diskTotal !== null && diskUsed !== null && diskTotal > 0) {
      host.disk = { total: diskTotal, used: diskUsed };
    }
  }
  return host;
}

function fillBus(
  pulse: { bus?: BusStats },
  row: Record<string, unknown>,
): void {
  const bus = asObject(row.bus);
  if (bus === null) {
    return;
  }
  const reconnects = asFinite(bus.reconnects);
  if (reconnects === null || reconnects < 0) {
    return;
  }
  const stats: BusStats = { reconnects };
  const rtt = asFinite(bus.rtt_ms);
  if (rtt !== null && rtt >= 0) {
    stats.rtt_ms = rtt;
  }
  pulse.bus = stats;
}

function parseWaf(input: unknown): WafRates | undefined {
  const row = asObject(input);
  if (row === null) {
    return undefined;
  }
  const allow = asFinite(row.allow);
  const deny = asFinite(row.deny);
  if (allow === null || deny === null || allow < 0 || deny < 0) {
    return undefined;
  }
  const waf: WafRates = { allow, deny };
  const keys = ["challenge", "deadline_hits", "fail_open", "fail_closed"] as const;
  for (const key of keys) {
    const n = asFinite(row[key]);
    if (n !== null && n >= 0) {
      waf[key] = n;
    }
  }
  return waf;
}

function parseFlow(input: unknown): Flow | null {
  const row = asObject(input);
  if (row === null) {
    return null;
  }
  const ops = asFinite(row.ops);
  if (ops === null || ops < 0) {
    return null;
  }
  const flow: Flow = { ops };
  const keys = ["in", "out", "err", "p50_ms", "p95_ms", "max_ms", "avg_ms"] as const;
  for (const key of keys) {
    const n = asFinite(row[key]);
    if (n !== null && n >= 0) {
      flow[key] = n;
    }
  }
  return flow;
}

function parseIO(input: unknown): FlowMap | undefined {
  const row = asObject(input);
  if (row === null) {
    return undefined;
  }
  const named: [string, Flow][] = [];
  for (const [name, value] of Object.entries(row)) {
    const flow = parseFlow(value);
    if (name.length > 0 && flow !== null) {
      named.push([name, flow]);
    }
  }
  return named.length === 0 ? undefined : Object.fromEntries(named);
}

function fillBuild(pulse: { version?: string; revision?: string }, row: Record<string, unknown>): void {
  const version = asString(row.version);
  if (version !== null) {
    pulse.version = version;
  }
  const revision = asString(row.revision);
  if (revision !== null) {
    pulse.revision = revision;
  }
}

function fillFlow(
  pulse: { window_s?: number; io?: FlowMap },
  row: Record<string, unknown>,
): void {
  const io = parseIO(row.io);
  if (io === undefined) {
    return;
  }
  pulse.io = io;
  const window = asFinite(row.window_s);
  if (window !== null && window > 0) {
    pulse.window_s = window;
  }
}

function parsePulseError(input: unknown): PulseError | null {
  const row = asObject(input);
  if (row === null) {
    return null;
  }
  const at = asString(row.at);
  const msg = asString(row.msg);
  if (at === null || msg === null || Number.isNaN(Date.parse(at))) {
    return null;
  }
  const error: PulseError = { at, msg: msg.slice(0, PULSE_ERROR_MSG_MAX) };
  const count = asFinite(row.count);
  if (count !== null && Number.isInteger(count) && count > 1) {
    error.count = count;
  }
  const source = asString(row.source);
  if (source !== null) {
    error.source = source;
  }
  return error;
}

function fillErrors(
  pulse: { errors?: PulseError[] },
  row: Record<string, unknown>,
): void {
  if (!Array.isArray(row.errors)) {
    return;
  }
  const rows: PulseError[] = [];
  for (const item of row.errors) {
    const error = parsePulseError(item);
    if (error !== null) {
      rows.push(error);
    }
    if (rows.length >= PULSE_ERRORS_MAX) {
      break;
    }
  }
  if (rows.length > 0) {
    pulse.errors = rows;
  }
}

export function parseAgentPulse(input: unknown): AgentPulse | null {
  const row = asObject(input);
  if (row === null || row.v !== 1 || row.kind !== "agent") {
    return null;
  }
  const id = asString(row.id);
  const nodeId = asString(row.node_id);
  const hostname = asString(row.hostname);
  const at = asString(row.at);
  const host = parseHost(row.host);
  if (
    id === null ||
    nodeId === null ||
    hostname === null ||
    at === null ||
    host === null ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  const pulse: AgentPulse = {
    v: 1,
    kind: "agent",
    id,
    node_id: nodeId,
    hostname,
    at,
    host,
  };
  const hash = asString(row.config_hash);
  if (hash !== null) {
    pulse.config_hash = hash;
  }
  const rev = asFinite(row.rev);
  if (rev !== null && Number.isInteger(rev)) {
    pulse.rev = rev;
  }
  const apply = asString(row.apply);
  if (apply !== null) {
    pulse.apply = apply;
  }
  const fingerprint = asString(row.conf_fingerprint);
  if (fingerprint !== null) {
    pulse.conf_fingerprint = fingerprint;
  }
  if (typeof row.nginx_manage === "boolean") {
    pulse.nginx_manage = row.nginx_manage;
  }
  const conf = parseAgentConfState(row.agent_conf);
  if (conf !== undefined) {
    pulse.agent_conf = conf;
  }
  const rps = asFinite(row.rps);
  if (rps !== null && rps >= 0) {
    pulse.rps = rps;
  }
  const codes = parseStatusRates(row.codes);
  if (codes !== undefined) {
    pulse.codes = codes;
  }
  const routes = parseRoutes(row.routes);
  if (routes !== undefined) {
    pulse.routes = routes;
  }
  const waf = parseWaf(row.waf);
  if (waf !== undefined) {
    pulse.waf = waf;
  }
  fillBuild(pulse, row);
  fillFlow(pulse, row);
  fillBus(pulse, row);
  fillErrors(pulse, row);
  return pulse;
}

function parseAgentConfState(input: unknown): AgentConfState | undefined {
  const row = asObject(input);
  if (row === null) {
    return undefined;
  }
  const rev = asFinite(row.rev);
  const sha256 = asString(row.sha256);
  if (rev === null || !Number.isInteger(rev) || rev < 1 || sha256 === null) {
    return undefined;
  }
  return { rev, sha256, apply: asString(row.apply) ?? "" };
}

const MAX_ROUTES = 512;

function parseRoutes(input: unknown): RouteRates[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const out: RouteRates[] = [];
  for (const item of input) {
    if (out.length >= MAX_ROUTES) {
      break;
    }
    const row = asObject(item);
    if (row === null) {
      continue;
    }
    const server = asString(row.server);
    const location = asString(row.location);
    const rps = asFinite(row.rps);
    if (server === null || location === null || rps === null || rps < 0) {
      continue;
    }
    const route: RouteRates = { server, location, rps };
    const id = asString(row.id);
    if (id !== null && id !== "") {
      route.id = id;
    }
    const codes = parseStatusRates(row.codes);
    if (codes !== undefined) {
      route.codes = codes;
    }
    out.push(route);
  }
  return out.length === 0 ? undefined : out;
}

function parseStatusRates(input: unknown): StatusRates | undefined {
  const row = asObject(input);
  if (row === null) {
    return undefined;
  }
  const xx2 = asFinite(row["2xx"]);
  const xx3 = asFinite(row["3xx"]);
  const xx4 = asFinite(row["4xx"]);
  const xx5 = asFinite(row["5xx"]);
  if (xx2 === null && xx3 === null && xx4 === null && xx5 === null) {
    return undefined;
  }
  const clamp = (n: number | null): number =>
    n !== null && n >= 0 ? n : 0;
  return {
    "2xx": clamp(xx2),
    "3xx": clamp(xx3),
    "4xx": clamp(xx4),
    "5xx": clamp(xx5),
  };
}

function parseWork(input: unknown): InspectorWork | undefined {
  const row = asObject(input);
  if (row === null) {
    return undefined;
  }
  const work: InspectorWork = {};
  const keys = [
    "workers",
    "queue_depth",
    "queued",
    "accepted",
    "shed",
    "expired",
    "rules",
  ] as const;
  for (const key of keys) {
    const n = asFinite(row[key]);
    if (n !== null) {
      work[key] = n;
    }
  }
  return Object.keys(work).length === 0 ? undefined : work;
}

export function parseInspectorPulse(input: unknown): InspectorPulse | null {
  const row = asObject(input);
  if (row === null || row.v !== 1 || row.kind !== "inspector") {
    return null;
  }
  const id = asString(row.id);
  const name = asString(row.name);
  const subject = asString(row.subject);
  const queue = asString(row.queue);
  const hostname = asString(row.hostname);
  const at = asString(row.at);
  if (
    id === null ||
    name === null ||
    subject === null ||
    queue === null ||
    hostname === null ||
    at === null ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  const pulse: InspectorPulse = {
    v: 1,
    kind: "inspector",
    id,
    name,
    subject,
    queue,
    hostname,
    ready: row.ready !== false,
    at,
  };
  const host = parseHost(row.host);
  if (host !== null) {
    pulse.host = host;
  }
  const work = parseWork(row.work);
  if (work !== undefined) {
    pulse.work = work;
  }
  fillBuild(pulse, row);
  fillFlow(pulse, row);
  fillBus(pulse, row);
  fillErrors(pulse, row);
  const hash = asString(row.config_hash);
  if (hash !== null) {
    pulse.config_hash = hash;
  }
  const rev = asFinite(row.rev);
  if (rev !== null && Number.isInteger(rev)) {
    pulse.rev = rev;
  }
  const apply = asString(row.apply);
  if (apply !== null) {
    pulse.apply = apply;
  }
  if (Array.isArray(row.profiles)) {
    const names = row.profiles.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    if (names.length > 0) {
      pulse.profiles = names;
    }
  }
  const live = parseLiveSets(row.live);
  if (live.length > 0) {
    pulse.live = live;
  }
  return pulse;
}

function parseLiveSets(input: unknown): InspectorLiveSet[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: InspectorLiveSet[] = [];
  for (const item of input) {
    const row = asObject(item);
    if (row === null) {
      continue;
    }
    const uuid = asString(row.uuid);
    const seq = asFinite(row.seq);
    const base = asFinite(row.base);
    const live = asFinite(row.live);
    if (uuid === null || seq === null || base === null || live === null) {
      continue;
    }
    out.push({ uuid, seq, base, live, ready: row.ready === true });
  }
  return out;
}

function parseRedisStore(input: unknown): RedisStore | null {
  const row = asObject(input);
  if (row === null || typeof row.ok !== "boolean") {
    return null;
  }
  const store: RedisStore = { ok: row.ok };
  const error = asString(row.error);
  if (error !== null) {
    store.error = error;
  }
  const version = asString(row.version);
  if (version !== null) {
    store.version = version;
  }
  const role = asString(row.role);
  if (role !== null) {
    store.role = role;
  }
  const policy = asString(row.maxmemory_policy);
  if (policy !== null) {
    store.maxmemory_policy = policy;
  }
  const nums = [
    "used_memory",
    "used_memory_rss",
    "used_memory_peak",
    "maxmemory",
    "keys",
    "expires",
    "evicted",
    "expired",
    "hits",
    "misses",
    "clients",
    "uptime_s",
  ] as const;
  for (const key of nums) {
    const n = asFinite(row[key]);
    if (n !== null) {
      store[key] = n;
    }
  }
  return store;
}

export function parseRedisPulse(input: unknown): RedisPulse | null {
  const row = asObject(input);
  if (row === null || row.v !== 1 || row.kind !== "redis") {
    return null;
  }
  const id = asString(row.id);
  const name = asString(row.name);
  const hostname = asString(row.hostname);
  const at = asString(row.at);
  const redis = parseRedisStore(row.redis);
  if (
    id === null ||
    name === null ||
    hostname === null ||
    at === null ||
    redis === null ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  const pulse: RedisPulse = {
    v: 1,
    kind: "redis",
    id,
    name,
    hostname,
    ready: row.ready !== false,
    at,
    redis,
  };
  const host = parseHost(row.host);
  if (host !== null) {
    pulse.host = host;
  }
  fillBuild(pulse, row);
  fillFlow(pulse, row);
  fillBus(pulse, row);
  fillErrors(pulse, row);
  return pulse;
}

function parseS3Store(input: unknown): S3Store | null {
  const row = asObject(input);
  if (row === null || typeof row.ok !== "boolean") {
    return null;
  }
  const store: S3Store = { ok: row.ok };
  const strs = ["error", "version", "endpoint", "bucket", "region"] as const;
  for (const key of strs) {
    const v = asString(row[key]);
    if (v !== null) {
      store[key] = v;
    }
  }
  const nums = [
    "objects",
    "used_bytes",
    "capacity",
    "buckets",
    "uptime_s",
  ] as const;
  for (const key of nums) {
    const n = asFinite(row[key]);
    if (n !== null) {
      store[key] = n;
    }
  }
  return store;
}

export function parseS3Pulse(input: unknown): S3Pulse | null {
  const row = asObject(input);
  if (row === null || row.v !== 1 || row.kind !== "s3") {
    return null;
  }
  const id = asString(row.id);
  const name = asString(row.name);
  const hostname = asString(row.hostname);
  const at = asString(row.at);
  const s3 = parseS3Store(row.s3);
  if (
    id === null ||
    name === null ||
    hostname === null ||
    at === null ||
    s3 === null ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  const pulse: S3Pulse = {
    v: 1,
    kind: "s3",
    id,
    name,
    hostname,
    ready: row.ready !== false,
    at,
    s3,
  };
  const host = parseHost(row.host);
  if (host !== null) {
    pulse.host = host;
  }
  fillBuild(pulse, row);
  fillFlow(pulse, row);
  fillBus(pulse, row);
  fillErrors(pulse, row);
  return pulse;
}

function parseServiceWork(input: unknown): ServiceWork | undefined {
  const row = asObject(input);
  if (row === null) {
    return undefined;
  }
  const work: ServiceWork = {};
  const nums = [
    "inserted",
    "last_batch",
    "lag",
    "countries",
    "asns",
    "skipped",
    "gen",
  ] as const;
  for (const key of nums) {
    const n = asFinite(row[key]);
    if (n !== null) {
      work[key] = n;
    }
  }
  if (typeof row.clickhouse_ok === "boolean") {
    work.clickhouse_ok = row.clickhouse_ok;
  }
  const error = asString(row.error);
  if (error !== null) {
    work.error = error;
  }
  const fingerprint = asString(row.fingerprint);
  if (fingerprint !== null) {
    work.fingerprint = fingerprint;
  }
  for (const key of ["country_sha256", "asn_sha256"] as const) {
    const sha = asString(row[key]);
    if (sha !== null) {
      work[key] = sha;
    }
  }
  return Object.keys(work).length === 0 ? undefined : work;
}

export function parseServicePulse(input: unknown): ServicePulse | null {
  const row = asObject(input);
  if (row === null || row.v !== 1 || row.kind !== "service") {
    return null;
  }
  const id = asString(row.id);
  const name = asString(row.name);
  const hostname = asString(row.hostname);
  const at = asString(row.at);
  if (
    id === null ||
    name === null ||
    hostname === null ||
    at === null ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  const pulse: ServicePulse = {
    v: 1,
    kind: "service",
    id,
    name,
    hostname,
    ready: row.ready !== false,
    at,
  };
  const host = parseHost(row.host);
  if (host !== null) {
    pulse.host = host;
  }
  const work = parseServiceWork(row.work);
  if (work !== undefined) {
    pulse.work = work;
  }
  const conf = parseAgentConfState(row.conf);
  if (conf !== undefined) {
    pulse.conf = conf;
  }
  fillBuild(pulse, row);
  fillFlow(pulse, row);
  fillBus(pulse, row);
  fillErrors(pulse, row);
  return pulse;
}
