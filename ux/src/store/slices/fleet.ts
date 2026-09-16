import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { FleetSnapshot, FlowMap, StatusRates } from "../../fleet.ts";
import { reuseList } from "../reuse.ts";

export const RPS_HISTORY = 30;

export interface RpsSample {
  seq: number;
  total: number;
  "2xx": number;
  "3xx": number;
  "4xx": number;
  "5xx": number;
}

export const EMPTY_RPS: RpsSample[] = [];

export interface IoSample {
  seq: number;
  ops: number;
}

interface FleetState {
  snapshot: FleetSnapshot | null;
  connected: boolean;
  rpsHistory: Record<string, RpsSample[]>;
  ioHistory: Record<string, IoSample[]>;
}

const initialState: FleetState = {
  snapshot: null,
  connected: false,
  rpsHistory: {},
  ioHistory: {},
};

const fleetSlice = createSlice({
  name: "fleet",
  initialState,
  reducers: {
    setConnected(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },
    setSnapshot(state, action: PayloadAction<FleetSnapshot>) {
      const snap = action.payload;
      if (state.snapshot !== null && snap.seq <= state.snapshot.seq) {
        return;
      }
      pushRpsHistory(state, snap);
      pushIoHistory(state, snap);
      state.snapshot = reuseSnapshot(state.snapshot, snap);
    },
  },
});

const ZERO_CODES: StatusRates = {
  "2xx": 0,
  "3xx": 0,
  "4xx": 0,
  "5xx": 0,
};

function reuseSnapshot(
  prev: FleetSnapshot | null,
  next: FleetSnapshot,
): FleetSnapshot {
  if (prev === null) {
    return next;
  }
  return {
    ...next,
    agents: reuseList(prev.agents, next.agents, (row) => row.uuid),
    orphans: reuseList(prev.orphans, next.orphans, (row) => row.uuid),
    inspectors: reuseList(
      prev.inspectors,
      next.inspectors ?? [],
      (row) => row.uuid,
    ),
    stores: reuseList(prev.stores, next.stores ?? [], (row) => row.uuid),
    services: reuseList(prev.services, next.services ?? [], (row) => row.uuid),
  };
}

function pushRpsHistory(state: FleetState, snap: FleetSnapshot): void {
  const seen = new Set<string>();
  for (const agent of snap.agents) {
    const node = agent.health.node_id;
    seen.add(node);
    const series = state.rpsHistory[node];
    if (series?.at(-1)?.seq === snap.seq) {
      continue;
    }
    const codes = agent.codes ?? ZERO_CODES;
    state.rpsHistory[node] = [
      ...(series ?? []),
      {
        seq: snap.seq,
        total: agent.rps ?? 0,
        "2xx": codes["2xx"],
        "3xx": codes["3xx"],
        "4xx": codes["4xx"],
        "5xx": codes["5xx"],
      },
    ].slice(-RPS_HISTORY);
  }
  for (const node of Object.keys(state.rpsHistory)) {
    if (!seen.has(node)) {
      delete state.rpsHistory[node];
    }
  }
}

function pushIoHistory(state: FleetState, snap: FleetSnapshot): void {
  const seen = new Set<string>();

  const push = (key: string, ops: number): void => {
    seen.add(key);
    const series = state.ioHistory[key];
    if (series?.at(-1)?.seq === snap.seq) {
      return;
    }
    state.ioHistory[key] = [...(series ?? []), { seq: snap.seq, ops }].slice(
      -RPS_HISTORY,
    );
  };

  const take = (id: string, io: FlowMap | undefined): void => {
    for (const [name, flow] of Object.entries(io ?? {})) {
      push(`${id}:${name}`, flow.ops);
    }
  };

  for (const agent of snap.agents) {
    take(agent.uuid, agent.io);
  }
  for (const store of snap.stores ?? []) {
    take(store.uuid, store.io);
  }

  const grouped = (
    kind: string,
    rows: { name: string; io?: FlowMap }[],
  ): void => {
    const groups = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const acc = groups.get(row.name) ?? new Map<string, number>();
      for (const [name, flow] of Object.entries(row.io ?? {})) {
        acc.set(name, (acc.get(name) ?? 0) + flow.ops);
      }
      groups.set(row.name, acc);
    }
    for (const [name, acc] of groups) {
      for (const [channel, ops] of acc) {
        push(`${kind}:${name}:${channel}`, ops);
      }
    }
  };

  grouped("inspector", snap.inspectors ?? []);
  grouped("service", snap.services ?? []);

  for (const key of Object.keys(state.ioHistory)) {
    if (!seen.has(key)) {
      delete state.ioHistory[key];
    }
  }
}

export const { setConnected, setSnapshot } = fleetSlice.actions;
export default fleetSlice.reducer;
