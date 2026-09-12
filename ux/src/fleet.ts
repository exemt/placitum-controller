export interface StatusRates {
  "2xx": number;
  "3xx": number;
  "4xx": number;
  "5xx": number;
}

/**
 * Темп канала работы за окно `window_s` кадра: одна форма на все kind, поэтому
 * и рисуется одним компонентом. `ops`, `in`, `out`, `err` — в секунду.
 */
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

/**
 * Запись из кольца последних ошибок производителя — секция `errors` пульса.
 * `at` — время последнего повторения, `count` — сколько раз повторилась.
 */
export interface PulseError {
  at: string;
  msg: string;
  count?: number;
  source?: string;
}

/** Здоровье клиента шины у производителя — секция `bus` пульса. */
export interface BusStats {
  reconnects: number;
  rtt_ms?: number;
}

/** Вердикты агента за окно — секция `waf` пульса. Всё в 1/с. */
export interface WafRates {
  allow: number;
  deny: number;
  challenge?: number;
  deadline_hits?: number;
  fail_open?: number;
  fail_closed?: number;
}

/** Пометки контроллера: перекос часов производителя и счётчики за час. */
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
  /** Ревизия настроек агента, которую нода применила. */
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
    config_hash?: string;
    /**
     * Только у агента: отпечаток боевого nginx.conf, который он положил на
     * ноду (`md5:<hex>`). С ним сравнивают `config_hash` воркеров -- это тот
     * же файл и та же сумма. С поколением (`config_hash` агента, sha256 пака)
     * воркер не сойдётся никогда: там шаблон до подстановки путей.
     */
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

/**
 * Состояние реплики относительно её канала раскатки. `unknown` -- канала у
 * инспектора нет вовсе (challenge и vlai конфигурацию с шины не возят),
 * `unmanaged` -- канал есть, но читателя у него пока нет. Ни то, ни другое не
 * расхождение: красить их как расхождение значит приучить оператора не
 * смотреть на цвет.
 */
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
  /** Отставание от JetStream: pending у consumer-а. */
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
  host?: FleetMemberView["host"];
  work?: ServiceWork;
  /** Поколение своего канала (агент haproxy); у logger и geo секции нет. */
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
  host?: FleetMemberView["host"];
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  /** Вытеснено за час — потеря данных на сторе, считает контроллер. */
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

/**
 * Темп одного маршрута по всему контуру: строки всех нод, сложенные
 * контроллером по паре «сервер + путь».
 *
 * `server` -- имя блока `server {}` в конфигурации nginx (первое имя
 * `server_name`, либо `_` у перехватчика по умолчанию), `location` -- имя
 * блока пути (либо `/`, если блока нет). Это конфигурация, а не заголовок
 * Host и не URI запроса: страница сопоставляет строку со своей карточкой по
 * имени, а не наоборот.
 *
 * `nodes` -- сколько нод видели маршрут в своём окне.
 */
export interface RouteTrafficView {
  server: string;
  location: string;
  /** Uuid пути из `waf_route_id`; нет у модуля без директивы. */
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
  /**
   * Секции нет у контроллера, который её ещё не отдаёт, и у контура, где ни
   * одна нода не видела запросов. Пустой список и отсутствие -- одно и то же.
   */
  routes?: RouteTrafficView[];
}

export type FleetLamp = "green" | "yellow" | "red";

/**
 * Все, кого страница считает участником: агенты со своими воркерами, ноды без
 * агента, инспекторы, хранилища, сервисы. Список один на лампу в шапке и на
 * счёт живости рядом с ней -- иначе цвет и число начинают спорить друг с
 * другом, а спорят они как раз в аварию.
 */
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

/**
 * Разошёлся ли конфиг на ноде: агент не применил поколение, либо воркер
 * держит не тот файл, что положил агент.
 *
 * Предикат один на плашку `dr` карточки и на отметку этажа: если подпись
 * группы говорит «dr 3», под ней должны стоять ровно три карточки в DR, иначе
 * счёт отправляет искать то, чего не видно. Вторая половина условия -- та же,
 * по которой таблица воркеров пишет «отстал».
 *
 * Сравнивать с поколением (`config_hash` агента) нельзя: там sha256 пака, а
 * воркер приносит md5 боевого файла. Пока агент не слал `conf_fingerprint`
 * (старая сборка), воркеров не с чем сравнивать -- и молчание здесь честнее
 * вечного «отстал» на исправной ноде.
 */
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

/** Живость флота числом — то же множество, что красит лампу. */
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

/**
 * Ключ карточки: он же ключ развёрнутости в состоянии страницы, он же якорь
 * для перехода из полосы. Один список на всё, чтобы «что раскрыто» и «куда
 * прыгнуть» не разъехались, когда добавится ещё один вид участника.
 */
export const cardKey = {
  agent: (uuid: string) => uuid,
  orphan: (nodeId: string) => `orphan:${nodeId}`,
  inspector: (name: string) => `inspector:${name}`,
  store: (uuid: string) => `store:${uuid}`,
  service: (name: string) => `service:${name}`,
} as const;

/** Якорь карточки в DOM — по нему полоса прыгает к участнику с ошибками. */
export function cardAnchor(key: string): string {
  return `card:${key}`;
}

export interface FleetErrors {
  /** Сумма счётчиков во всех кольцах. */
  entries: number;
  /** У скольких участников кольцо непустое. */
  members: number;
  /** Ключ первого по порядку страницы — куда прыгать. */
  first?: string;
}

/**
 * Ошибки по всему флоту. Порядок обхода — порядок страницы (ноды, инспекторы,
 * хранилища, сервисы), поэтому первый найденный и есть первый сверху.
 *
 * Реплики инспектора и воркеры без агента считаются поштучно, а ключ у них
 * общий: карточка на странице одна на имя и на ноду, и прыгать надо к ней, а
 * не к процессу, которого в разметке нет.
 */
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

/** Разряды по три: счётчики карточек читают глазами, а не в отладчике. */
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

/**
 * Головной канал карточки — тот, что выносится в свёрнутую шапку. Названного
 * может не оказаться: имена каналов задаёт производитель, и карточка не вправе
 * решать, что его работы не видно. Тогда берётся первый.
 */
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

/** Хост пачки — самый нагруженный: в шапке важен худший, а не средний. */
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

/**
 * Каналы реплик, сведённые в один набор: карточка инспектора показывает его
 * целиком, а не по процессам. Темп и байты складываются. Перцентили и max —
 * худшая реплика (сумма перцентилей ничего не значит). Среднее — взвешенное
 * по ops.
 */
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

/**
 * Кольца ошибок реплик, сведённые в одно: карточка пачки показывает участника
 * целиком. Дедупликация та же, что у производителя, — по (source, msg);
 * побеждает свежее `at`, счётчики складываются. Свежие сверху.
 */
export function mergeErrors(
  rows: { errors?: PulseError[] }[],
): PulseError[] {
  const merged = new Map<string, PulseError>();
  for (const row of rows) {
    for (const error of row.errors ?? []) {
      const key = `${error.source ?? ""} ${error.msg}`;
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
