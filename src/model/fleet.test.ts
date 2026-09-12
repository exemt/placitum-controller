import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PULSE_ERRORS_MAX,
  PULSE_ERROR_MSG_MAX,
  parseAgentPulse,
  parseRedisPulse,
  parseServicePulse,
} from "./fleet.ts";

const at = "2026-08-16T12:00:00Z";

const agentFrame = (errors: unknown) => ({
  v: 1,
  kind: "agent",
  id: "a1",
  node_id: "edge-01",
  hostname: "edge-01",
  at,
  host: {
    cpu: { cores: 8, usage: 0.2, load1: 0.4, load5: 0.4, load15: 0.4 },
    memory: { total: 100, used: 40, available: 60 },
    uptime_s: 10,
  },
  errors,
});

test("agent pulse carries the errors ring", () => {
  const pulse = parseAgentPulse(
    agentFrame([
      { at, msg: "s3: timeout", count: 3, source: "archive" },
      { at, msg: "solo" },
    ]),
  );
  assert.deepEqual(pulse?.errors, [
    { at, msg: "s3: timeout", count: 3, source: "archive" },
    { at, msg: "solo" },
  ]);
});

test("errors ring is capped and messages are trimmed", () => {
  const rows = Array.from({ length: PULSE_ERRORS_MAX + 3 }, (_, i) => ({
    at,
    msg: `err-${i}`.padEnd(PULSE_ERROR_MSG_MAX + 50, "x"),
  }));
  const pulse = parseAgentPulse(agentFrame(rows));
  assert.equal(pulse?.errors?.length, PULSE_ERRORS_MAX);
  assert.equal(pulse?.errors?.[0]?.msg.length, PULSE_ERROR_MSG_MAX);
});

test("broken error entries are dropped silently", () => {
  const pulse = parseAgentPulse(
    agentFrame([
      { at: "not-a-date", msg: "x" },
      { at },
      { at, msg: "ok", count: 1.5 },
      "garbage",
    ]),
  );
  // count=1.5 не целое — запись остаётся, счётчик отбрасывается.
  assert.deepEqual(pulse?.errors, [{ at, msg: "ok" }]);
});

test("agent pulse carries waf verdicts, disk and bus", () => {
  const frame = agentFrame(undefined) as Record<string, unknown>;
  frame.waf = {
    allow: 100.5,
    deny: 4.2,
    challenge: 1,
    deadline_hits: 0.4,
    fail_open: 0.1,
    fail_closed: 0.3,
  };
  (frame.host as Record<string, unknown>).disk = { total: 100, used: 40 };
  frame.bus = { reconnects: 3, rtt_ms: 0.8 };
  const pulse = parseAgentPulse(frame);
  assert.deepEqual(pulse?.waf, {
    allow: 100.5,
    deny: 4.2,
    challenge: 1,
    deadline_hits: 0.4,
    fail_open: 0.1,
    fail_closed: 0.3,
  });
  assert.deepEqual(pulse?.host.disk, { total: 100, used: 40 });
  assert.deepEqual(pulse?.bus, { reconnects: 3, rtt_ms: 0.8 });
});

test("waf without allow or deny is dropped, bus without reconnects too", () => {
  const frame = agentFrame(undefined) as Record<string, unknown>;
  frame.waf = { allow: 10 };
  frame.bus = { rtt_ms: 5 };
  const pulse = parseAgentPulse(frame);
  assert.equal(pulse?.waf, undefined);
  assert.equal(pulse?.bus, undefined);
});

test("service work carries jetstream lag", () => {
  const pulse = parseServicePulse({
    v: 1,
    kind: "service",
    id: "s1",
    name: "logger",
    hostname: "logger-01",
    at,
    work: { inserted: 10, lag: 84000 },
  });
  assert.equal(pulse?.work?.lag, 84000);
});

test("redis pulse keeps evicted for the controller delta", () => {
  const pulse = parseRedisPulse({
    v: 1,
    kind: "redis",
    id: "r1",
    name: "redis",
    hostname: "store-01",
    at,
    redis: { ok: true, evicted: 120 },
  });
  assert.equal(pulse?.redis.evicted, 120);
});

test("frame without errors parses as before", () => {
  const pulse = parseServicePulse({
    v: 1,
    kind: "service",
    id: "s1",
    name: "logger",
    hostname: "logger-01",
    at,
  });
  assert.notEqual(pulse, null);
  assert.equal(pulse?.errors, undefined);
});

test("parseAgentPulse keeps the agent conf revision", () => {
  const pulse = parseAgentPulse({
    v: 1,
    kind: "agent",
    id: "a1",
    node_id: "nginx-1",
    hostname: "nginx-1",
    at: "2026-08-21T12:00:00.000Z",
    host: {
      cpu: { cores: 8, usage: 0.2, load1: 0.4, load5: 0.4, load15: 0.4 },
      memory: { total: 100, used: 40, available: 60 },
      uptime_s: 10,
    },
    agent_conf: { rev: 4, sha256: "sha256:abc", apply: "ok" },
  });
  assert.ok(pulse);
  assert.deepEqual(pulse.agent_conf, {
    rev: 4,
    sha256: "sha256:abc",
    apply: "ok",
  });
});

test("parseAgentPulse drops an agent conf without a revision", () => {
  const pulse = parseAgentPulse({
    v: 1,
    kind: "agent",
    id: "a1",
    node_id: "nginx-1",
    hostname: "nginx-1",
    at: "2026-08-21T12:00:00.000Z",
    host: {
      cpu: { cores: 8, usage: 0.2, load1: 0.4, load5: 0.4, load15: 0.4 },
      memory: { total: 100, used: 40, available: 60 },
      uptime_s: 10,
    },
    agent_conf: { rev: 0, sha256: "", apply: "ok" },
  });
  assert.ok(pulse);
  assert.equal(pulse.agent_conf, undefined);
});

const routeFrame = (routes: unknown) => ({
  v: 1,
  kind: "agent",
  id: "a1",
  node_id: "edge-01",
  hostname: "edge-01",
  at,
  host: {
    cpu: { cores: 8, usage: 0.2, load1: 0.4, load5: 0.4, load15: 0.4 },
    memory: { total: 100, used: 40, available: 60 },
    uptime_s: 10,
  },
  rps: 3,
  codes: { "2xx": 2, "3xx": 0, "4xx": 1, "5xx": 0 },
  routes,
});

test("parseAgentPulse keeps the per-route breakdown", () => {
  const pulse = parseAgentPulse(
    routeFrame([
      {
        server: "shop.example.com",
        location: "/api/",
        rps: 2,
        codes: { "2xx": 2, "3xx": 0, "4xx": 0, "5xx": 0 },
      },
      { server: "_", location: "/", rps: 1 },
    ]),
  );
  assert.equal(pulse?.routes?.length, 2);
  assert.equal(pulse?.routes?.[0]?.server, "shop.example.com");
  assert.deepEqual(pulse?.routes?.[0]?.codes, {
    "2xx": 2,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
  });
  // Классы -- необязательная часть строки: без них остаётся сам темп.
  assert.equal(pulse?.routes?.[1]?.codes, undefined);
});

test("a route without a name or with a negative rate is dropped, not zeroed", () => {
  const pulse = parseAgentPulse(
    routeFrame([
      { location: "/api/", rps: 2 },
      { server: "shop.example.com", location: "/api/", rps: -1 },
      { server: "shop.example.com", rps: 2 },
      "garbage",
      { server: "ok.example.com", location: "/", rps: 0.5 },
    ]),
  );
  assert.deepEqual(pulse?.routes, [
    { server: "ok.example.com", location: "/", rps: 0.5 },
  ]);
});

test("a frame without routes parses as before", () => {
  assert.equal(parseAgentPulse(routeFrame(undefined))?.routes, undefined);
  assert.equal(parseAgentPulse(routeFrame([]))?.routes, undefined);
  assert.equal(parseAgentPulse(routeFrame("nope"))?.routes, undefined);
});

/*
 * Отпечаток боевого файла и поколение шаблона -- разные поля и разные суммы:
 * склеить их в одно значило бы сравнивать воркеров с sha256 пака, чего не
 * бывает. Кадр старой сборки поля не несёт -- и это не ошибка разбора.
 */
test("agent pulse carries the live conf fingerprint apart from the generation", () => {
  const frame = {
    ...agentFrame(undefined),
    config_hash: "sha256:2b1a",
    conf_fingerprint: "md5:a036c6f46669f91094849919a134583b",
    apply: "ok",
    rev: 43,
  };
  const pulse = parseAgentPulse(frame);

  assert.equal(pulse?.config_hash, "sha256:2b1a");
  assert.equal(
    pulse?.conf_fingerprint,
    "md5:a036c6f46669f91094849919a134583b",
  );

  const old = parseAgentPulse(agentFrame(undefined));
  assert.equal(old?.conf_fingerprint, undefined);
  assert.equal(parseAgentPulse({ ...frame, conf_fingerprint: "" })
    ?.conf_fingerprint, undefined);
});
