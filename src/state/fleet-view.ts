import {
  workerKey,
  type BusStats,
  type DerivedMarks,
  type FlowMap,
  type PulseError,
  type RouteRates,
  type StatusRates,
  type WafRates,
  type AgentRecord,
  type InspectorRecord,
  type RedisRecord,
  type S3Record,
  type ServiceRecord,
  type StoreRecord,
  type WorkerRecord,
} from "../model/fleet.ts";
import {
  agentSelectors,
  inspectorSelectors,
  serviceSelectors,
  storeSelectors,
  workerSelectors,
} from "./slices/fleet.ts";
import { selectDesired, selectLedger } from "./slices/convergence.ts";
import { CHANNELS, channelOfInspector } from "../convergence/channels.ts";
import { consumerState } from "../convergence/state.ts";
import type { RootState } from "./types.ts";

/**
 * Состояние реплики относительно её канала.
 *
 * `unknown` -- у инспектора канала нет вовсе (`challenge` и `vlai`
 * конфигурацию с шины не возят). `unmanaged` -- канал есть, но читателя у него
 * нет: манифест издаётся и ждёт. Ни то, ни другое не расхождение, и красить их
 * как расхождение значит приучить оператора не смотреть на цвет.
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

/** Пометки контроллера в снапшоте: перекос часов и счётчики за час. */
export interface MarksView {
  skew_ms?: number;
  restarts_1h?: number;
  bus_flaps_1h?: number;
}

/** Пометки записи в форму снапшота: списки моментов — в счётчики. */
function jsonMarks(row: DerivedMarks): MarksView {
  const out: MarksView = {};
  if (row.skewMs !== undefined) {
    out.skew_ms = row.skewMs;
  }
  if (row.restartsAt !== undefined && row.restartsAt.length > 0) {
    out.restarts_1h = row.restartsAt.length;
  }
  if (row.busFlapAt !== undefined && row.busFlapAt.length > 0) {
    out.bus_flaps_1h = row.busFlapAt.length;
  }
  return out;
}

export interface FleetMemberView extends MarksView {
  uuid: string;
  kind: "agent" | "worker";
  status: "up" | "degraded";
  seen_at: string;
  age_ms: number;
  health: {
    node_id: string;
    hostname?: string;
    /** Сборка агента: версия и ревизия образа, если он их знает. */
    version?: string;
    revision?: string;
    config_hash?: string;
    /**
     * Только у агента: отпечаток боевого nginx.conf, который он положил на
     * ноду. С ним и сравнивают `config_hash` воркеров -- это один и тот же
     * документ и одна и та же сумма, в отличие от поколения шаблона.
     */
    conf_fingerprint?: string;
    pid?: number;
    nonce?: string;
  };
  host?: AgentRecord["host"];
  apply?: string;
  /** Применённая нодой ревизия настроек агента, если контроллер их присылал. */
  agent_conf?: AgentRecord["agent_conf"];
  rps?: number;
  codes?: AgentRecord["codes"];
  waf?: WafRates;
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
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
  /** Сборка процесса: версия и ревизия образа, если бинарь их знает. */
  version?: string;
  revision?: string;
  host?: AgentRecord["host"];
  work?: InspectorRecord["work"];
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  config_hash?: string;
  rev?: number;
  apply?: string;
  profiles?: string[];
  /** Живые наборы зеркала, как в пульсе: по ним видно, доехал ли состав. */
  live?: InspectorRecord["live"];
  drift: InspectorDrift;
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
  /** Сборка процесса: версия и ревизия образа, если бинарь их знает. */
  version?: string;
  revision?: string;
  host?: AgentRecord["host"];
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  redis: RedisRecord["redis"];
  /** Сколько ключей вытеснено за последний час: eviction — потеря данных. */
  evicted_1h?: number;
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
  /** Сборка процесса: версия и ревизия образа, если бинарь их знает. */
  version?: string;
  revision?: string;
  host?: AgentRecord["host"];
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
  s3: S3Record["s3"];
}

export type StoreView = RedisView | S3View;

export interface ServiceView extends MarksView {
  uuid: string;
  kind: "service";
  status: "up" | "degraded";
  seen_at: string;
  age_ms: number;
  name: string;
  hostname: string;
  ready: boolean;
  /** Сборка процесса: версия и ревизия образа, если бинарь их знает. */
  version?: string;
  revision?: string;
  host?: AgentRecord["host"];
  work?: ServiceRecord["work"];
  /** Поколение своего канала (агент haproxy); у logger и geo секции нет. */
  conf?: ServiceRecord["conf"];
  window_s?: number;
  io?: FlowMap;
  bus?: BusStats;
  errors?: PulseError[];
}

/**
 * Темп маршрута по всему контуру: строки всех нод, сложенные по паре
 * «сервер + путь».
 *
 * Складывать их обязан контроллер, а не страница: маршрут живёт на каждой
 * ноде, и «сколько запросов идёт на этот сервер» -- это сумма по флоту, а не
 * число с той ноды, которая ответила последней. `nodes` -- сколько нод видели
 * маршрут в своём окне: одна из трёх означает либо перекос балансировщика,
 * либо что две другие ещё не применили поколение конфига.
 */
export interface RouteTrafficView {
  server: string;
  location: string;
  /** Uuid пути: страница путей находит свою строку по нему, а не по именам. */
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
  inspectors: InspectorView[];
  stores: StoreView[];
  services: ServiceView[];
  /**
   * Маршруты контура. Секция плоская -- по строке на пару «сервер + путь»;
   * страница серверов складывает строки одного сервера сама, странице путей
   * строка нужна как есть. Хранить обе развёртки в снимке значило бы возить
   * одно и то же дважды каждые четыре секунды.
   */
  routes: RouteTrafficView[];
}

const ZERO_CODES: StatusRates = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };

/**
 * Сложение маршрутов по флоту.
 *
 * Кадры degraded-ноды не берутся: degraded -- это молчание дольше 15 секунд,
 * а окно счётчика 10, то есть числа в таком кадре заведомо описывают то, чего
 * уже нет. Пусть маршрут исчезнет из таблицы вместе с нодой, чем висит с
 * темпом, которого никто не выдаёт.
 */
function foldRoutes(agents: AgentRecord[]): RouteTrafficView[] {
  const acc = new Map<string, RouteTrafficView>();

  for (const agent of agents) {
    if (agent.status !== "up" || agent.routes === undefined) {
      continue;
    }

    for (const row of agent.routes) {
      addRoute(acc, row);
    }
  }

  return [...acc.values()].sort(
    (a, b) =>
      a.server.localeCompare(b.server) || a.location.localeCompare(b.location),
  );
}

function addRoute(acc: Map<string, RouteTrafficView>, row: RouteRates): void {
  // Ключ -- uuid пути, когда он есть: одно имя блока на двух перехватчиках
  // без server_name -- два маршрута панели. Без uuid -- пара имён;
  // разделитель -- перевод строки: в имени сервера и в имени location его
  // быть не может, а двоеточие и пробел в них встречаются.
  const key =
    row.id !== undefined
      ? `id:${row.id}`
      : `${row.server}
${row.location}`;
  const codes = row.codes ?? ZERO_CODES;
  const was = acc.get(key);

  if (was === undefined) {
    acc.set(key, {
      server: row.server,
      location: row.location,
      ...(row.id !== undefined ? { id: row.id } : {}),
      rps: row.rps,
      codes: { ...codes },
      nodes: 1,
    });
    return;
  }

  was.rps += row.rps;
  was.nodes += 1;
  for (const cls of ["2xx", "3xx", "4xx", "5xx"] as const) {
    was.codes[cls] += codes[cls];
  }
}

function jsonWorker(row: WorkerRecord, now: number): FleetMemberView {
  return {
    uuid: workerKey(row),
    kind: "worker",
    status: row.status,
    seen_at: row.at,
    age_ms: Math.max(0, now - row.seenAt),
    ...jsonMarks(row),
    health: {
      node_id: row.node_id,
      config_hash: row.config_hash,
      pid: row.pid,
      nonce: row.nonce,
    },
  };
}

/**
 * Логический merge двух секций: воркеры вешаются на агента той же `node_id`.
 * Пока секция агентов пустая — все воркеры в orphans. Когда контроллер
 * начнёт ingest агента с шины, воркеры той же node_id встанут под него.
 */
function inspectorDrift(row: InspectorRecord, state: RootState): InspectorDrift {
  const channel = channelOfInspector(row.name);

  if (channel === null) {
    return "unknown";
  }

  if (!CHANNELS[channel].delivered) {
    return "unmanaged";
  }

  return consumerState(
    {
      uuid: row.id,
      label: row.hostname,
      hash: row.config_hash,
      rev: row.rev,
      apply: row.apply,
      degraded: row.status === "degraded",
    },
    selectDesired(state, channel),
    selectLedger(state, channel),
  );
}

function jsonInspector(
  row: InspectorRecord,
  now: number,
  state: RootState,
): InspectorView {
  return {
    uuid: row.id,
    kind: "inspector",
    status: row.status,
    seen_at: row.at,
    age_ms: Math.max(0, now - row.seenAt),
    name: row.name,
    subject: row.subject,
    queue: row.queue,
    hostname: row.hostname,
    ready: row.ready,
    version: row.version,
    revision: row.revision,
    host: row.host,
    work: row.work,
    window_s: row.window_s,
    io: row.io,
    bus: row.bus,
    errors: row.errors,
    ...jsonMarks(row),
    config_hash: row.config_hash,
    rev: row.rev,
    apply: row.apply,
    profiles: row.profiles,
    live: row.live,
    drift: inspectorDrift(row, state),
  };
}

function jsonStore(row: StoreRecord, now: number): StoreView {
  const base = {
    uuid: row.id,
    status: row.status,
    seen_at: row.at,
    age_ms: Math.max(0, now - row.seenAt),
    name: row.name,
    hostname: row.hostname,
    ready: row.ready,
    version: row.version,
    revision: row.revision,
    host: row.host,
    window_s: row.window_s,
    io: row.io,
    bus: row.bus,
    errors: row.errors,
    ...jsonMarks(row),
  };
  if (row.kind === "s3") {
    return { ...base, kind: "s3", s3: row.s3 };
  }
  return {
    ...base,
    kind: "redis",
    redis: row.redis,
    evicted_1h: sumEvicted(row.evictedHits),
  };
}

function sumEvicted(hits: RedisRecord["evictedHits"]): number | undefined {
  if (hits === undefined || hits.length === 0) {
    return undefined;
  }
  return hits.reduce((sum, hit) => sum + hit.n, 0);
}

function jsonService(row: ServiceRecord, now: number): ServiceView {
  return {
    uuid: row.id,
    kind: "service",
    status: row.status,
    seen_at: row.at,
    age_ms: Math.max(0, now - row.seenAt),
    name: row.name,
    hostname: row.hostname,
    ready: row.ready,
    version: row.version,
    revision: row.revision,
    host: row.host,
    work: row.work,
    conf: row.conf,
    window_s: row.window_s,
    io: row.io,
    bus: row.bus,
    errors: row.errors,
    ...jsonMarks(row),
  };
}

export function snapshotFleet(state: RootState, now = Date.now()): FleetSnapshot {
  const agents = agentSelectors.selectAll(state);
  const workers = workerSelectors.selectAll(state);
  const inspectors = inspectorSelectors.selectAll(state);
  const stores = storeSelectors.selectAll(state);
  const services = serviceSelectors.selectAll(state);
  const byNode = new Map(agents.map((row) => [row.node_id, row]));

  return {
    v: 1,
    type: "snapshot",
    seq: state.fleet.seq,
    at: new Date(now).toISOString(),
    agents: agents.map((agent) => ({
      uuid: agent.id,
      kind: "agent" as const,
      status: agent.status,
      seen_at: agent.at,
      age_ms: Math.max(0, now - agent.seenAt),
      apply: agent.apply,
      agent_conf: agent.agent_conf,
      host: agent.host,
      rps: agent.rps,
      codes: agent.codes,
      waf: agent.waf,
      window_s: agent.window_s,
      io: agent.io,
      bus: agent.bus,
      errors: agent.errors,
      ...jsonMarks(agent),
      health: {
        node_id: agent.node_id,
        hostname: agent.hostname,
        version: agent.version,
        revision: agent.revision,
        config_hash: agent.config_hash,
        conf_fingerprint: agent.conf_fingerprint,
      },
      workers: workers
        .filter((row) => row.node_id === agent.node_id)
        .map((row) => jsonWorker(row, now)),
    })),
    orphans: workers
      .filter((row) => !byNode.has(row.node_id))
      .map((row) => jsonWorker(row, now)),
    inspectors: inspectors.map((row) => jsonInspector(row, now, state)),
    stores: stores.map((row) => jsonStore(row, now)),
    services: services.map((row) => jsonService(row, now)),
    routes: foldRoutes(agents),
  };
}
