import { formatMs, type InspectorDrift, type InspectorView } from "./fleet.ts";

export type InspectorEngine = "modsec" | "test" | "ip" | "vlai";
export type InspectorPhase = "request" | "response" | "frame" | "unknown";

/** Старые алиасы волн: тот же процесс, другое имя ради after=. */
const INSPECTOR_ALIAS: Record<string, string> = {
  crs: "modsec",
  ai: "vlai",
  model: "vlai",
  "model-ip": "vlai",
};

export function inspectorName(name: string): string {
  return INSPECTOR_ALIAS[name] ?? name;
}

export interface InspectorGroup {
  name: string;
  engine: InspectorEngine;
  phase: InspectorPhase;
  subject: string;
  queue: string;
  status: "up" | "degraded";
  drift: InspectorDrift;
  replicas: InspectorView[];
}

export function inspectorEngine(row: InspectorView): InspectorEngine {
  if (row.name === "ip" || row.name === "vlai") {
    return row.name;
  }
  if (
    row.name === "modsec" ||
    row.work?.accepted !== undefined ||
    row.work?.queue_depth !== undefined
  ) {
    return "modsec";
  }
  return "test";
}

export function inspectorPhase(subject: string): InspectorPhase {
  if (subject.includes(".req.")) {
    return "request";
  }
  if (subject.includes(".res.") || subject.includes(".resp.")) {
    return "response";
  }
  if (subject.includes(".frame.")) {
    return "frame";
  }
  return "unknown";
}

export function groupInspectors(rows: InspectorView[]): InspectorGroup[] {
  const map = new Map<string, InspectorView[]>();
  for (const row of rows) {
    const list = map.get(row.name) ?? [];
    list.push(row);
    map.set(row.name, list);
  }
  return [...map.entries()].map(([name, replicas]) => {
    const head = replicas[0];
    return {
      name,
      engine: inspectorEngine(head),
      phase: inspectorPhase(head.subject),
      subject: head.subject,
      queue: head.queue,
      status: replicas.every((row) => row.status === "up") ? "up" : "degraded",
      drift: groupDrift(replicas),
      replicas,
    };
  });
}

/** Длина очереди реплики из пульса `work`. Нет полей — метрика ещё не пишется. */
export interface InspectorQueue {
  queued: number;
  depth?: number;
  known: boolean;
}

export function replicaQueue(row: InspectorView): InspectorQueue {
  const work = row.work;
  if (
    work === undefined ||
    (work.queued === undefined && work.queue_depth === undefined)
  ) {
    return { queued: 0, known: false };
  }
  return {
    queued: Math.max(0, work.queued ?? 0),
    depth: work.queue_depth,
    known: true,
  };
}

export function groupQueue(replicas: InspectorView[]): InspectorQueue {
  let queued = 0;
  let depth = 0;
  let known = false;
  let hasDepth = false;
  for (const row of replicas) {
    const part = replicaQueue(row);
    if (!part.known) {
      continue;
    }
    known = true;
    queued += part.queued;
    if (part.depth !== undefined) {
      hasDepth = true;
      depth += part.depth;
    }
  }
  return {
    queued,
    depth: hasDepth ? depth : undefined,
    known,
  };
}

export function queueCaption(queue: InspectorQueue): string {
  return String(queue.known ? queue.queued : 0);
}

/** Полоса только рисует «много / мало». Подписи ёмкости нет — у vlai буфер не режется. */
const QUEUE_BAR_SOFT = 8;

export function queueFill(queue: InspectorQueue): number {
  const queued = queue.known ? queue.queued : 0;
  return queued / QUEUE_BAR_SOFT;
}

export function queueTone(
  queue: InspectorQueue,
): "primary" | "warning" | "error" {
  const queued = queue.known ? queue.queued : 0;
  if (queued >= 8) {
    return "error";
  }
  if (queued > 0) {
    return "warning";
  }
  return "primary";
}

/** Пороги health-бара средней задержки одного inspect. */
export const LATENCY_GREEN_MS = 100;
export const LATENCY_YELLOW_MS = 500;

export interface InspectorLatency {
  avgMs: number;
  known: boolean;
}

export function replicaLatency(row: InspectorView): InspectorLatency {
  const avg = row.io?.inspect?.avg_ms;
  if (avg === undefined) {
    return { avgMs: 0, known: false };
  }
  return { avgMs: Math.max(0, avg), known: true };
}

export function groupLatency(replicas: InspectorView[]): InspectorLatency {
  let sum = 0;
  let weight = 0;
  let known = false;
  for (const row of replicas) {
    const part = replicaLatency(row);
    if (!part.known) {
      continue;
    }
    known = true;
    const ops = row.io?.inspect?.ops ?? 0;
    const w = ops > 0 ? ops : 1;
    sum += part.avgMs * w;
    weight += w;
  }
  return { avgMs: weight > 0 ? sum / weight : 0, known };
}

export function latencyCaption(latency: InspectorLatency, msLabel: string): string {
  return `${formatMs(latency.known ? latency.avgMs : 0)} ${msLabel}`;
}

export function latencyFill(latency: InspectorLatency): number {
  if (!latency.known) {
    return 0;
  }
  return latency.avgMs / LATENCY_YELLOW_MS;
}

export function latencyTone(
  latency: InspectorLatency,
): "success" | "warning" | "error" {
  if (!latency.known || latency.avgMs <= LATENCY_GREEN_MS) {
    return "success";
  }
  if (latency.avgMs <= LATENCY_YELLOW_MS) {
    return "warning";
  }
  return "error";
}


/**
 * Худшее из реплик -- для чипа группы. Порядок тот же, что у канала в
 * контроллере: отказ применения и чужой конфиг выше ожидания, потому что
 * первые два надо чинить, а третье пройдёт само.
 */
const DRIFT_ORDER: InspectorDrift[] = [
  "failed",
  "foreign",
  "silent",
  "stale",
  "pending",
  "unmanaged",
  "ok",
  "unknown",
];

/**
 * Состояния, в которых на реплике стоит не то поколение, что издано.
 *
 * `unmanaged` и `unknown` сюда не входят: это каналы, которых у инспектора
 * нет вовсе. Список один на флаг `dr` карточки и на счёт расхождений в
 * подписи группы -- иначе этаж и карточка под ним начинают спорить.
 */
const DRIFTED = new Set<InspectorDrift>([
  "stale",
  "pending",
  "silent",
  "failed",
  "foreign",
]);

export function isDrifted(drift: InspectorDrift): boolean {
  return DRIFTED.has(drift);
}

function groupDrift(replicas: InspectorView[]): InspectorDrift {
  const marks = replicas.map((row) => row.drift ?? "unknown");

  for (const state of DRIFT_ORDER) {
    if (marks.includes(state)) {
      return state;
    }
  }

  return "unknown";
}
