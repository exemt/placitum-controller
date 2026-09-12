import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentPulse, RedisPulse } from "../../model/fleet.ts";
import { fleetAgentUp, fleetReducer, fleetRedisUp } from "./fleet.ts";

const T0 = Date.parse("2026-08-21T12:00:00Z");

const agentPulse = (uptime: number, reconnects?: number): AgentPulse => ({
  v: 1,
  kind: "agent",
  id: "a1",
  node_id: "edge-01",
  hostname: "edge-01",
  at: "2026-08-21T12:00:00Z",
  host: {
    cpu: { cores: 8, usage: 0.2, load1: 0.4, load5: 0.4, load15: 0.4 },
    memory: { total: 100, used: 40, available: 60 },
    uptime_s: uptime,
  },
  ...(reconnects === undefined ? {} : { bus: { reconnects } }),
});

const redisPulse = (evicted: number): RedisPulse => ({
  v: 1,
  kind: "redis",
  id: "r1",
  name: "redis",
  hostname: "store-01",
  ready: true,
  at: "2026-08-21T12:00:00Z",
  redis: { ok: true, evicted },
});

function up(
  state: ReturnType<typeof fleetReducer> | undefined,
  type: string,
  payload: unknown,
  recvAt: number,
) {
  return fleetReducer(
    state,
    { type, payload, meta: { recvAt } } as ReturnType<typeof fleetAgentUp>,
  );
}

test("uptime reset is counted as a restart, and marks expire after an hour", () => {
  let state = up(undefined, fleetAgentUp.type, agentPulse(5000), T0);
  state = up(state, fleetAgentUp.type, agentPulse(10), T0 + 4000);
  let row = state.agents.entities["edge-01"];
  assert.equal(row?.restartsAt?.length, 1);
  assert.equal(row?.skewMs, T0 + 4000 - T0);

  // небольшое дрожание uptime назад — не рестарт
  state = up(state, fleetAgentUp.type, agentPulse(20), T0 + 8000);
  row = state.agents.entities["edge-01"];
  assert.equal(row?.restartsAt?.length, 1);

  // через час пометка уходит
  state = up(state, fleetAgentUp.type, agentPulse(30), T0 + 3_700_000);
  row = state.agents.entities["edge-01"];
  assert.equal(row?.restartsAt, undefined);
});

test("bus reconnect growth is a flap", () => {
  let state = up(undefined, fleetAgentUp.type, agentPulse(100, 1), T0);
  state = up(state, fleetAgentUp.type, agentPulse(104, 1), T0 + 4000);
  assert.equal(state.agents.entities["edge-01"]?.busFlapAt, undefined);
  state = up(state, fleetAgentUp.type, agentPulse(108, 3), T0 + 8000);
  assert.equal(state.agents.entities["edge-01"]?.busFlapAt?.length, 1);
});

test("redis evicted growth is accumulated as data loss", () => {
  let state = up(undefined, fleetRedisUp.type, redisPulse(100), T0);
  state = up(state, fleetRedisUp.type, redisPulse(150), T0 + 4000);
  state = up(state, fleetRedisUp.type, redisPulse(170), T0 + 8000);
  const row = state.stores.entities["r1"];
  assert.equal(row?.kind, "redis");
  const hits = row?.kind === "redis" ? row.evictedHits : undefined;
  assert.deepEqual(
    hits?.map((hit) => hit.n),
    [50, 20],
  );
});

test("a section the producer stopped sending does not stick", () => {
  let state = up(undefined, fleetAgentUp.type, agentPulse(100, 5), T0);
  assert.notEqual(state.agents.entities["edge-01"]?.bus, undefined);
  state = up(state, fleetAgentUp.type, agentPulse(104), T0 + 4000);
  assert.equal(state.agents.entities["edge-01"]?.bus, undefined);
});
