import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentPulse, RouteRates } from "../model/fleet.ts";
import { fleetAgentUp, fleetReducer, fleetTick } from "./slices/fleet.ts";
import { snapshotFleet } from "./fleet-view.ts";
import type { RootState } from "./types.ts";

const T0 = Date.parse("2026-08-26T12:00:00Z");

const pulse = (
  node: string,
  routes: RouteRates[],
  at = "2026-08-26T12:00:00Z",
): AgentPulse => ({
  v: 1,
  kind: "agent",
  id: node,
  node_id: node,
  hostname: node,
  at,
  host: {
    cpu: { cores: 8, usage: 0.2, load1: 0.4, load5: 0.4, load15: 0.4 },
    memory: { total: 100, used: 40, available: 60 },
    uptime_s: 5000,
  },
  routes,
});

const codes = (xx2: number, xx4 = 0, xx5 = 0) => ({
  "2xx": xx2,
  "3xx": 0,
  "4xx": xx4,
  "5xx": xx5,
});

function up(
  state: ReturnType<typeof fleetReducer> | undefined,
  payload: AgentPulse,
  recvAt: number,
) {
  return fleetReducer(
    state,
    { type: fleetAgentUp.type, payload, meta: { recvAt } } as ReturnType<
      typeof fleetAgentUp
    >,
  );
}

const view = (fleet: ReturnType<typeof fleetReducer>, now: number) =>
  snapshotFleet({ fleet } as RootState, now).routes;

test("uuid пути -- ключ свода: одно имя блока, два uuid -- две строки", () => {
  let state = up(
    undefined,
    pulse("edge-01", [
      { server: "_", location: "/", id: "aaaa", rps: 4, codes: codes(4) },
      { server: "_", location: "/", id: "bbbb", rps: 1, codes: codes(1) },
    ]),
    T0,
  );
  state = up(
    state,
    pulse("edge-02", [{ server: "_", location: "/", id: "aaaa", rps: 2, codes: codes(2) }]),
    T0,
  );

  const rows = view(state, T0 + 1000);
  assert.deepEqual(
    rows.map((row) => [row.id, row.rps, row.nodes]),
    [
      ["aaaa", 6, 2],
      ["bbbb", 1, 1],
    ],
  );
});

test("маршрут складывается по флоту, а не берётся с последней ноды", () => {
  let state = up(
    undefined,
    pulse("edge-01", [
      { server: "shop.example.com", location: "/api/", rps: 4, codes: codes(3, 1) },
      { server: "shop.example.com", location: "/", rps: 1, codes: codes(1) },
    ]),
    T0,
  );
  state = up(
    state,
    pulse("edge-02", [
      { server: "shop.example.com", location: "/api/", rps: 6, codes: codes(5, 0, 1) },
    ]),
    T0,
  );

  const rows = view(state, T0);
  assert.equal(rows.length, 2);

  // Порядок -- по серверу, затем по пути: "/" раньше "/api/".
  assert.deepEqual(
    rows.map((row) => row.location),
    ["/", "/api/"],
  );

  const api = rows[1];
  assert.equal(api.rps, 10);
  assert.equal(api.nodes, 2);
  assert.deepEqual(api.codes, { "2xx": 8, "3xx": 0, "4xx": 1, "5xx": 1 });

  // Ноду, которая видела маршрут одна, видно по nodes: перекос балансировщика
  // и неприменённое поколение конфига читаются здесь одинаково.
  assert.equal(rows[0].nodes, 1);
});

test("кадр degraded-ноды в сумму не идёт: его окно старше самого окна", () => {
  let state = up(
    undefined,
    pulse("edge-01", [
      { server: "shop.example.com", location: "/api/", rps: 4, codes: codes(4) },
    ]),
    T0,
  );
  state = up(
    state,
    pulse("edge-02", [
      { server: "shop.example.com", location: "/api/", rps: 6, codes: codes(6) },
    ]),
    T0,
  );

  // edge-01 замолчал: тик по возрасту переводит его в degraded. Возраст
  // считается по метке самого кадра, а не по времени приёма.
  state = up(
    state,
    pulse(
      "edge-02",
      [{ server: "shop.example.com", location: "/api/", rps: 6, codes: codes(6) }],
      "2026-08-26T12:00:20Z",
    ),
    T0 + 20_000,
  );
  state = fleetReducer(
    state,
    fleetTick({ now: T0 + 20_000, degradedMs: 15_000, expireMs: 60_000 }),
  );

  const rows = view(state, T0 + 20_000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rps, 6);
  assert.equal(rows[0].nodes, 1);
});

test("нода без секции routes сумму не обнуляет и строк не добавляет", () => {
  const state = up(undefined, pulse("edge-01", []), T0);
  assert.deepEqual(view(state, T0), []);
});
