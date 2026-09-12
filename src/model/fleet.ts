/**
 * Присутствие на шине. В Redux — последний кадр; статус `degraded` и удаление
 * считает тик по возрасту. В Postgres это не пишется.
 *
 * Секции стора: воркеры, агенты, инспекторы, store (Redis/S3), сервисы.
 * Склейка агент↔воркер для API — по `node_id`, не в одной таблице.
 * Redis и S3 — общие хранилища, не ноды. Logger и geo — `kind=service`.
 */

export type FleetStatus = "up" | "degraded";

/** Кадр воркера, как на шине. Ключ записи — node_id + pid + nonce. */
export interface WorkerPulse {
  v: 1;
  kind: "worker";
  node_id: string;
  pid: number;
  nonce: string;
  config_hash: string;
  at: string;
}

/**
 * Служебные пометки контроллера поверх кадра — то, чего производитель о себе
 * не знает: перекос его часов относительно контроллера, замеченные сбросы
 * uptime (рестарты) и рост reconnects шины. Живут в записи и переносятся
 * через upsert; в кадре их нет.
 */
export interface DerivedMarks {
  /** recvAt − Date.parse(at): плюс — часы производителя отстают. */
  skewMs?: number;
  /** Моменты (по часам контроллера) замеченных сбросов uptime за час. */
  restartsAt?: number[];
  /** Моменты роста reconnects шины за час. */
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

/** Диск с данными сервиса. Место кончается чаще, чем CPU. */
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

/**
 * Здоровье клиента шины у производителя: сколько раз переподключался с
 * рождения процесса и последний RTT до сервера. Флап reconnects — ранний
 * сигнал сетевой беды; сам ли участник моргает, считает контроллер.
 */
export interface BusStats {
  reconnects: number;
  rtt_ms?: number;
}

/**
 * Вердикты агента за окно `window_s`, всё в 1/с. `deadline_hits` — запросы,
 * не дождавшиеся вердикта к waf_deadline; `fail_open` — из них пропущенные
 * (policy pass), `fail_closed` — заблокированные (policy block). Нода может
 * быть зелёной и слать 200-е, пропуская всё без инспекции, — это видно
 * только здесь.
 */
export interface WafRates {
  allow: number;
  deny: number;
  challenge?: number;
  deadline_hits?: number;
  fail_open?: number;
  fail_closed?: number;
}

/**
 * Темп работы за окно `window_s`: одна форма на все kind, как локатор обменника
 * на все сообщения контура. `ops`, `in`, `out`, `err` — в секунду, время — в
 * миллисекундах. Что считается операцией, знает только имя канала.
 *
 * Темп считает производитель. Контроллер вычесть его из накопительных
 * счётчиков не может: запись живёт до первой минуты тишины, а рестарт
 * сервиса обнуляет счётчик без следа в кадре.
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

/** Каналы работы сервиса по именам: `archive`, `inspect`, `insert`, … */
export type FlowMap = Record<string, Flow>;

/**
 * Запись из кольца последних ошибок производителя: текст, время последнего
 * повторения и счётчик. Не журнал — «почему мне жёлтый», видимое с карточки.
 */
export interface PulseError {
  at: string;
  msg: string;
  count?: number;
  source?: string;
}

/** Кольцо у производителя — 5 записей; лишнее контроллер отбрасывает. */
export const PULSE_ERRORS_MAX = 5;

/** Длиннее производитель слать не должен; контроллер дорезает молча. */
export const PULSE_ERROR_MSG_MAX = 200;

/** Кадр агента, как на шине. Ключ записи — node_id. */
export interface AgentPulse {
  v: 1;
  kind: "agent";
  id: string;
  node_id: string;
  hostname: string;
  config_hash?: string;
  rev?: number;
  apply?: string;
  /**
   * Отпечаток боевого nginx.conf, который агент положил на ноду: `md5:<hex>`,
   * та же сумма и тот же вид, что воркер кладёт в своё присутствие.
   *
   * Отдельно от `config_hash`: там sha256 пака, то есть шаблон до подстановки
   * путей ноды, и с присутствием воркера он не сходится никогда. Сравнивать
   * воркеров можно только с этим полем -- сравнение с поколением показывало бы
   * расхождение на исправном флоте.
   */
  conf_fingerprint?: string;
  /**
   * Ведёт ли эта нода конфигурацию nginx (`nginx { manage on }`). Сайдкар
   * рядом с чужим nginx возит аудит и архив, но поколение шаблона не применяет
   * и применить не может -- у него нет ни бинаря, ни дерева. Без явного поля
   * контроллер не отличил бы такую ноду от управляемой, которая просто ещё
   * ничего не применила, и вечно ждал бы от неё сходимости.
   */
  nginx_manage?: boolean;
  /**
   * Какую настройку агента нода применила. Отдельно от config_hash: там
   * поколение nginx, здесь документ агента, и отстать они могут порознь.
   */
  agent_conf?: AgentConfState;
  at: string;
  rps?: number;
  codes?: StatusRates;
  /**
   * Тот же темп, разложенный по маршрутам конфигурации. Сумма строк равна
   * `rps` кадра: считает их один и тот же счётчик по одним и тем же
   * датаграммам. Молчащего маршрута в списке нет вовсе -- окно его опустошает,
   * и ноль здесь означал бы «маршрут есть и на нём тихо», чего кадр не знает.
   */
  routes?: RouteRates[];
  waf?: WafRates;
  host: HostSnapshot;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
}

/** Применённая нодой ревизия настроек агента: `policy/agent-conf`. */
export interface AgentConfState {
  rev: number;
  sha256: string;
  apply: string;
}

/**
 * Темп одного маршрута ноды. `server` -- имя блока `server {}` (первое имя
 * `server_name`, либо `_` у перехватчика по умолчанию), `location` -- имя
 * блока пути (либо `/` там, где блока нет и настройки взяты с сервера).
 * Ни то, ни другое не приходит из запроса: это конфигурация, а не Host и URI.
 */
export interface RouteRates {
  server: string;
  location: string;
  /** Uuid пути из `waf_route_id`; нет у модуля без директивы. */
  id?: string;
  rps: number;
  codes?: StatusRates;
}

/** Скользящее окно 10 с по классу HTTP-ответа. */
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

/** Кадр инспектора. Ключ записи — id процесса, не имя: реплик несколько. */
export interface InspectorWork {
  workers?: number;
  queue_depth?: number;
  queued?: number;
  accepted?: number;
  shed?: number;
  expired?: number;
  rules?: number;
}

/** Живой набор в зеркале инспектора: uuid набора, seq, база и точечные записи, прогрет ли. */
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
  /*
   * Живые наборы зеркала: seq, размер (база + точечные записи) и прогретость
   * каждого. Печатает инспектор адреса; без них «почему пропустили» на
   * активном списке не разобрать -- поколение сошлось, а состав мог не
   * доехать.
   */
  live?: InspectorLiveSet[];
}

export interface InspectorRecord extends InspectorPulse, DerivedMarks {
  status: FleetStatus;
  seenAt: number;
}

/** INFO Redis в кадре агента store. used_memory — размер хранилища. */
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

/** Кадр агента Redis. Ключ записи — id процесса, не имя. */
export interface RedisPulse {
  v: 1;
  kind: "redis";
  id: string;
  name: string;
  hostname: string;
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
  /** Приросты evicted между кадрами за час: eviction на сторе — потеря данных. */
  evictedHits?: { ts: number; n: number }[];
}

/** Состояние S3 в кадре агента store. used_bytes — размер хранилища. */
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

/** Кадр агента S3. Ключ записи — id процесса, не имя. */
export interface S3Pulse {
  v: 1;
  kind: "s3";
  id: string;
  name: string;
  hostname: string;
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

/** Работа сервиса в кадре. Поля зависят от имени: logger / geo. */
export interface ServiceWork {
  inserted?: number;
  last_batch?: number;
  /** Отставание от JetStream: pending у consumer-а. Успевает ли — здесь. */
  lag?: number;
  clickhouse_ok?: boolean;
  error?: string;
  countries?: number;
  asns?: number;
  skipped?: number;
  gen?: number;
  fingerprint?: string;
}

/** Кадр сервиса (logger, geo). Ключ записи — id процесса. */
export interface ServicePulse {
  v: 1;
  kind: "service";
  id: string;
  name: string;
  hostname: string;
  ready: boolean;
  at: string;
  host?: HostSnapshot;
  work?: ServiceWork;
  /**
   * Какое поколение своего канала сервис применил: ревизия, хеш и исход.
   * Шлёт его агент haproxy; у logger и geo своего канала нет, и секция
   * отсутствует. Форма та же, что `agent_conf` у ноды.
   */
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

/** Клиент шины: без reconnects секция пуста, RTT сам по себе не нужен. */
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

/** Вердикты: без allow и deny секции нет, остальное — по желанию. */
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

/** Канал без `ops` — не поток: темп и есть то единственное, за чем сюда идут. */
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

/** Имена каналов не перечислены: их знает производитель, UX рисует по форме. */
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
  // Сборка через fromEntries, а не присваиванием: имя канала пришло с шины, и
  // `io["__proto__"] = flow` подменило бы прототип вместо ключа.
  return named.length === 0 ? undefined : Object.fromEntries(named);
}

/** Секция темпа целиком: окно и каналы едут вместе, порознь смысла не имеют. */
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

/** Кольцо ошибок: сверх лимита отбрасывается, битые записи — молча. */
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
  fillFlow(pulse, row);
  fillBus(pulse, row);
  fillErrors(pulse, row);
  return pulse;
}

/**
 * Ревизия без хеша или с нулём -- это «настройки не приезжало», а не
 * применённый пустой документ: показывать такую строку в панели значит врать,
 * что нода что-то приняла.
 */
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

/**
 * Разбор секции `routes`. Строка без имени сервера или с отрицательным темпом
 * отбрасывается целиком, а не чинится нулём: непонятную строку лучше не
 * показывать, чем показать как «маршрут, на котором ничего не происходит».
 *
 * Потолок здесь свой, ниже агентского: контроллер держит последний кадр
 * каждой ноды в памяти, и патологический конфиг на одной ноде не должен
 * распухать в снимке, который уходит каждому открытому браузеру.
 */
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

/** Живые наборы зеркала из пульса; кривая запись отбрасывается, а не валит кадр. */
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
  fillFlow(pulse, row);
  fillBus(pulse, row);
  fillErrors(pulse, row);
  return pulse;
}
