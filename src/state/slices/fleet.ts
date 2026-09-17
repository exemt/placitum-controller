import {
  createEntityAdapter,
  createSlice,
  type EntityState,
  type PayloadAction,
} from "@reduxjs/toolkit";

import {
  parseAgentPulse,
  parseInspectorPulse,
  parseRedisPulse,
  parseS3Pulse,
  parseServicePulse,
  parseWorkerPulse,
  workerKey,
  type AgentPulse,
  type AgentRecord,
  type DerivedMarks,
  type FleetStatus,
  type InspectorPulse,
  type InspectorRecord,
  type RedisPulse,
  type RedisRecord,
  type S3Pulse,
  type ServicePulse,
  type ServiceRecord,
  type StoreRecord,
  type WorkerPulse,
  type WorkerRecord,
} from "../../model/fleet.ts";

export type FleetState = {
  workers: EntityState<WorkerRecord, string>;
  agents: EntityState<AgentRecord, string>;
  inspectors: EntityState<InspectorRecord, string>;
  stores: EntityState<StoreRecord, string>;
  services: EntityState<ServiceRecord, string>;
  seq: number;
};

const workersAdapter = createEntityAdapter<WorkerRecord, string>({
  selectId: (row) => workerKey(row),
});

const agentsAdapter = createEntityAdapter<AgentRecord, string>({
  selectId: (row) => row.node_id,
});

const inspectorsAdapter = createEntityAdapter<InspectorRecord, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) =>
    a.name.localeCompare(b.name) || a.hostname.localeCompare(b.hostname),
});

const storesAdapter = createEntityAdapter<StoreRecord, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) =>
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name) ||
    a.hostname.localeCompare(b.hostname),
});

const servicesAdapter = createEntityAdapter<ServiceRecord, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) =>
    a.name.localeCompare(b.name) || a.hostname.localeCompare(b.hostname),
});

const initialState: FleetState = {
  workers: workersAdapter.getInitialState(),
  agents: agentsAdapter.getInitialState(),
  inspectors: inspectorsAdapter.getInitialState(),
  stores: storesAdapter.getInitialState(),
  services: servicesAdapter.getInitialState(),
  seq: 0,
};

const HOUR_MS = 3_600_000;

function deriveMarks(
  prev:
    | (DerivedMarks & {
        host?: { uptime_s: number };
        bus?: { reconnects: number };
      })
    | undefined,
  next: { at: string; host?: { uptime_s: number }; bus?: { reconnects: number } },
  recvAt: number,
): DerivedMarks {
  const restarts = keepHour(prev?.restartsAt, recvAt);
  const prevUp = prev?.host?.uptime_s;
  const nextUp = next.host?.uptime_s;
  if (prevUp !== undefined && nextUp !== undefined && nextUp + 30 < prevUp) {
    restarts.push(recvAt);
  }

  const flaps = keepHour(prev?.busFlapAt, recvAt);
  const prevRe = prev?.bus?.reconnects;
  const nextRe = next.bus?.reconnects;
  if (prevRe !== undefined && nextRe !== undefined && nextRe > prevRe) {
    flaps.push(recvAt);
  }

  return {
    skewMs: recvAt - Date.parse(next.at),
    restartsAt: restarts.length > 0 ? restarts : undefined,
    busFlapAt: flaps.length > 0 ? flaps : undefined,
  };
}

function keepHour(list: number[] | undefined, now: number): number[] {
  return (list ?? []).filter((ts) => now - ts < HOUR_MS).slice(-60);
}

function deriveEvicted(
  prev: StoreRecord | undefined,
  pulse: RedisPulse,
  recvAt: number,
): RedisRecord["evictedHits"] {
  const carried = prev?.kind === "redis" ? prev.evictedHits : undefined;
  const hits = (carried ?? [])
    .filter((hit) => recvAt - hit.ts < HOUR_MS)
    .slice(-120);
  const a = prev?.kind === "redis" ? prev.redis.evicted : undefined;
  const b = pulse.redis.evicted;
  if (a !== undefined && b !== undefined && b > a) {
    hits.push({ ts: recvAt, n: b - a });
  }
  return hits.length > 0 ? hits : undefined;
}

function withRecv<T>(pulse: T): { payload: T; meta: { recvAt: number } } {
  return { payload: pulse, meta: { recvAt: Date.now() } };
}

type PulseAction<T> = PayloadAction<T, string, { recvAt: number }>;

// Ids of the members named by the installer: a node by its node id, any other member by the hostname
// of its container.
function namedIds<T>(
  ids: string[],
  entities: Record<string, T | undefined>,
  named: (row: T) => boolean,
): string[] {
  return ids.filter((id) => {
    const row = entities[id];
    return row !== undefined && named(row);
  });
}

export function membersNamed(state: FleetState, names: ReadonlySet<string>): {
  workers: string[];
  agents: string[];
  inspectors: string[];
  stores: string[];
  services: string[];
} {
  return {
    workers: namedIds(state.workers.ids as string[], state.workers.entities, (row) => names.has(row.node_id)),
    agents: namedIds(
      state.agents.ids as string[],
      state.agents.entities,
      (row) => names.has(row.node_id) || names.has(row.hostname),
    ),
    inspectors: namedIds(state.inspectors.ids as string[], state.inspectors.entities, (row) => names.has(row.hostname)),
    stores: namedIds(state.stores.ids as string[], state.stores.entities, (row) => names.has(row.hostname)),
    services: namedIds(state.services.ids as string[], state.services.entities, (row) => names.has(row.hostname)),
  };
}

function tickBucket<T extends { seenAt: number; status: FleetStatus }>(
  ids: string[],
  entities: Record<string, T | undefined>,
  now: number,
  degradedMs: number,
  expireMs: number,
): { drop: string[]; changed: boolean } {
  const drop: string[] = [];
  let changed = false;

  for (const id of ids) {
    const row = entities[id];
    if (row === undefined) {
      continue;
    }
    const age = now - row.seenAt;
    if (age >= expireMs) {
      drop.push(id);
      changed = true;
    } else if (age >= degradedMs && row.status !== "degraded") {
      row.status = "degraded";
      changed = true;
    }
  }

  return { drop, changed };
}

const fleetSlice = createSlice({
  name: "fleet",
  initialState,
  reducers: {
    workerUp: {
      prepare: withRecv<WorkerPulse>,
      reducer(state, action: PulseAction<WorkerPulse>) {
        const pulse = action.payload;
        const seenAt = Date.parse(pulse.at);
        workersAdapter.setOne(state.workers, {
          ...pulse,
          status: "up",
          seenAt,
          skewMs: action.meta.recvAt - seenAt,
        });
        state.seq += 1;
      },
    },
    agentUp: {
      prepare: withRecv<AgentPulse>,
      reducer(state, action: PulseAction<AgentPulse>) {
        const pulse = action.payload;
        const seenAt = Date.parse(pulse.at);
        const prev = state.agents.entities[pulse.node_id];
        agentsAdapter.setOne(state.agents, {
          ...pulse,
          status: "up",
          seenAt,
          ...deriveMarks(prev, pulse, action.meta.recvAt),
        });
        state.seq += 1;
      },
    },
    inspectorUp: {
      prepare: withRecv<InspectorPulse>,
      reducer(state, action: PulseAction<InspectorPulse>) {
        const pulse = action.payload;
        const seenAt = Date.parse(pulse.at);
        const prev = state.inspectors.entities[pulse.id];
        inspectorsAdapter.setOne(state.inspectors, {
          ...pulse,
          status: "up",
          seenAt,
          ...deriveMarks(prev, pulse, action.meta.recvAt),
        });
        state.seq += 1;
      },
    },
    redisUp: {
      prepare: withRecv<RedisPulse>,
      reducer(state, action: PulseAction<RedisPulse>) {
        const pulse = action.payload;
        const seenAt = Date.parse(pulse.at);
        const prev = state.stores.entities[pulse.id];
        storesAdapter.setOne(state.stores, {
          ...pulse,
          status: "up",
          seenAt,
          ...deriveMarks(prev, pulse, action.meta.recvAt),
          evictedHits: deriveEvicted(prev, pulse, action.meta.recvAt),
        });
        state.seq += 1;
      },
    },
    s3Up: {
      prepare: withRecv<S3Pulse>,
      reducer(state, action: PulseAction<S3Pulse>) {
        const pulse = action.payload;
        const seenAt = Date.parse(pulse.at);
        const prev = state.stores.entities[pulse.id];
        storesAdapter.setOne(state.stores, {
          ...pulse,
          status: "up",
          seenAt,
          ...deriveMarks(prev, pulse, action.meta.recvAt),
        });
        state.seq += 1;
      },
    },
    serviceUp: {
      prepare: withRecv<ServicePulse>,
      reducer(state, action: PulseAction<ServicePulse>) {
        const pulse = action.payload;
        const seenAt = Date.parse(pulse.at);
        const prev = state.services.entities[pulse.id];
        servicesAdapter.setOne(state.services, {
          ...pulse,
          status: "up",
          seenAt,
          ...deriveMarks(prev, pulse, action.meta.recvAt),
        });
        state.seq += 1;
      },
    },
    tick(
      state,
      action: PayloadAction<{
        now: number;
        degradedMs: number;
        expireMs: number;
      }>,
    ) {
      const { now, degradedMs, expireMs } = action.payload;
      const workers = tickBucket(
        state.workers.ids as string[],
        state.workers.entities,
        now,
        degradedMs,
        expireMs,
      );
      workersAdapter.removeMany(state.workers, workers.drop);

      const agents = tickBucket(
        state.agents.ids as string[],
        state.agents.entities,
        now,
        degradedMs,
        expireMs,
      );
      agentsAdapter.removeMany(state.agents, agents.drop);

      const inspectors = tickBucket(
        state.inspectors.ids as string[],
        state.inspectors.entities,
        now,
        degradedMs,
        expireMs,
      );
      inspectorsAdapter.removeMany(state.inspectors, inspectors.drop);

      const stores = tickBucket(
        state.stores.ids as string[],
        state.stores.entities,
        now,
        degradedMs,
        expireMs,
      );
      storesAdapter.removeMany(state.stores, stores.drop);

      const services = tickBucket(
        state.services.ids as string[],
        state.services.entities,
        now,
        degradedMs,
        expireMs,
      );
      servicesAdapter.removeMany(state.services, services.drop);

      if (
        workers.changed ||
        agents.changed ||
        inspectors.changed ||
        stores.changed ||
        services.changed
      ) {
        state.seq += 1;
      }
    },
    // The installer removed these containers: their members leave at once instead of turning silent
    // for a minute. A member that is still alive comes back with its next heartbeat.
    forget(state, action: PayloadAction<{ names: string[] }>) {
      const named = membersNamed(state as FleetState, new Set(action.payload.names));

      workersAdapter.removeMany(state.workers, named.workers);
      agentsAdapter.removeMany(state.agents, named.agents);
      inspectorsAdapter.removeMany(state.inspectors, named.inspectors);
      storesAdapter.removeMany(state.stores, named.stores);
      servicesAdapter.removeMany(state.services, named.services);

      if (Object.values(named).some((ids) => ids.length > 0)) {
        state.seq += 1;
      }
    },
  },
});

export const fleetReducer = fleetSlice.reducer;
export const fleetWorkerUp = fleetSlice.actions.workerUp;
export const fleetAgentUp = fleetSlice.actions.agentUp;
export const fleetInspectorUp = fleetSlice.actions.inspectorUp;
export const fleetRedisUp = fleetSlice.actions.redisUp;
export const fleetS3Up = fleetSlice.actions.s3Up;
export const fleetServiceUp = fleetSlice.actions.serviceUp;
export const fleetTick = fleetSlice.actions.tick;
export const fleetForget = fleetSlice.actions.forget;

export function ingestWorkerPulse(
  dispatch: (action: ReturnType<typeof fleetWorkerUp>) => void,
  input: unknown,
): boolean {
  const pulse = parseWorkerPulse(input);
  if (pulse === null) {
    return false;
  }
  dispatch(fleetWorkerUp(pulse));
  return true;
}

export function ingestAgentPulse(
  dispatch: (action: ReturnType<typeof fleetAgentUp>) => void,
  input: unknown,
): boolean {
  const pulse = parseAgentPulse(input);
  if (pulse === null) {
    return false;
  }
  dispatch(fleetAgentUp(pulse));
  return true;
}

export function ingestInspectorPulse(
  dispatch: (action: ReturnType<typeof fleetInspectorUp>) => void,
  input: unknown,
): boolean {
  const pulse = parseInspectorPulse(input);
  if (pulse === null) {
    return false;
  }
  dispatch(fleetInspectorUp(pulse));
  return true;
}

export function ingestRedisPulse(
  dispatch: (action: ReturnType<typeof fleetRedisUp>) => void,
  input: unknown,
): boolean {
  const pulse = parseRedisPulse(input);
  if (pulse === null) {
    return false;
  }
  dispatch(fleetRedisUp(pulse));
  return true;
}

export function ingestS3Pulse(
  dispatch: (action: ReturnType<typeof fleetS3Up>) => void,
  input: unknown,
): boolean {
  const pulse = parseS3Pulse(input);
  if (pulse === null) {
    return false;
  }
  dispatch(fleetS3Up(pulse));
  return true;
}

export function ingestServicePulse(
  dispatch: (action: ReturnType<typeof fleetServiceUp>) => void,
  input: unknown,
): boolean {
  const pulse = parseServicePulse(input);
  if (pulse === null) {
    return false;
  }
  dispatch(fleetServiceUp(pulse));
  return true;
}

export const workerSelectors = workersAdapter.getSelectors(
  (state: { fleet: FleetState }) => state.fleet.workers,
);

export const agentSelectors = agentsAdapter.getSelectors(
  (state: { fleet: FleetState }) => state.fleet.agents,
);

export const inspectorSelectors = inspectorsAdapter.getSelectors(
  (state: { fleet: FleetState }) => state.fleet.inspectors,
);

export const storeSelectors = storesAdapter.getSelectors(
  (state: { fleet: FleetState }) => state.fleet.stores,
);

export const serviceSelectors = servicesAdapter.getSelectors(
  (state: { fleet: FleetState }) => state.fleet.services,
);
