import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseAgentPulse,
  parseInspectorPulse,
  parseRedisPulse,
  parseServicePulse,
} from "./fleet.ts";

const host = {
  cpu: { cores: 8, usage: 0.2, load1: 0.4, load5: 0.3, load15: 0.3 },
  memory: { total: 1000, used: 400, available: 600 },
  uptime_s: 3600,
};

test("parseAgentPulse keeps every channel of io", () => {
  const pulse = parseAgentPulse({
    v: 1,
    kind: "agent",
    id: "abc",
    node_id: "edge-01",
    hostname: "edge-01",
    at: "2026-08-16T12:00:00.000Z",
    host,
    window_s: 10,
    io: {
      audit: { ops: 128.5, in: 262144 },
      archive: {
        ops: 3.2,
        in: 4194304,
        out: 4194304,
        err: 0.1,
        p50_ms: 12.4,
        p95_ms: 44,
        max_ms: 118.2,
      },
    },
  });
  assert.ok(pulse);
  assert.equal(pulse.window_s, 10);
  assert.equal(pulse.io?.audit.ops, 128.5);
  assert.equal(pulse.io?.archive.p95_ms, 44);
  assert.equal(pulse.io?.archive.out, 4194304);
});

test("parseInspectorPulse keeps work.queued and queue_depth", () => {
  const pulse = parseInspectorPulse({
    v: 1,
    kind: "inspector",
    id: "abc",
    name: "vlai",
    subject: "waf.req.vlai",
    queue: "vlai",
    hostname: "vlai-1",
    ready: true,
    at: "2026-08-16T12:00:00.000Z",
    work: { workers: 1, queue_depth: 8, queued: 5, accepted: 12 },
  });
  assert.ok(pulse);
  assert.equal(pulse.work?.workers, 1);
  assert.equal(pulse.work?.queue_depth, 8);
  assert.equal(pulse.work?.queued, 5);
  assert.equal(pulse.work?.accepted, 12);
});

test("parseInspectorPulse takes io without work", () => {
  const pulse = parseInspectorPulse({
    v: 1,
    kind: "inspector",
    id: "abc",
    name: "modsec",
    subject: "waf.req.modsec",
    queue: "modsec",
    hostname: "modsec-1",
    ready: true,
    at: "2026-08-16T12:00:00.000Z",
    window_s: 10,
    io: { inspect: { ops: 940.2, p50_ms: 1.1, p95_ms: 6.8, avg_ms: 2.4 } },
  });
  assert.ok(pulse);
  assert.equal(pulse.work, undefined);
  assert.equal(pulse.io?.inspect.ops, 940.2);
  assert.equal(pulse.io?.inspect.p50_ms, 1.1);
  assert.equal(pulse.io?.inspect.avg_ms, 2.4);
});

// Кадр разбирается из текста, как на шине: только так в объекте окажется
// собственное свойство `__proto__`, литералом такое не записать. Имя канала
// произвольное, и это тоже имя — важно, что прототип карты оно не трогает.
test("parseRedisPulse drops the nameless channel and the one without ops", () => {
  const pulse = parseRedisPulse(
    JSON.parse(`{
      "v": 1,
      "kind": "redis",
      "id": "abc",
      "name": "redis",
      "hostname": "redis-1",
      "ready": true,
      "at": "2026-08-16T12:00:00.000Z",
      "redis": { "ok": true },
      "window_s": 10,
      "io": {
        "cmd": { "ops": 5120, "in": 8388608, "out": 16777216 },
        "bogus": { "in": 1 },
        "": { "ops": 1 },
        "__proto__": { "ops": 1 }
      }
    }`),
  );
  assert.ok(pulse);
  assert.deepEqual(Object.keys(pulse.io ?? {}), ["cmd", "__proto__"]);
  assert.equal(pulse.io?.cmd.in, 8388608);
  assert.equal(Object.getPrototypeOf(pulse.io), Object.prototype);
});

test("parseServicePulse ignores io that is not an object", () => {
  const pulse = parseServicePulse({
    v: 1,
    kind: "service",
    id: "abc",
    name: "logger",
    hostname: "logger",
    ready: true,
    at: "2026-08-16T12:00:00.000Z",
    work: { inserted: 12, clickhouse_ok: true },
    window_s: 10,
    io: "insert",
  });
  assert.ok(pulse);
  assert.equal(pulse.io, undefined);
  assert.equal(pulse.window_s, undefined);
  assert.equal(pulse.work?.inserted, 12);
});

test("parseServicePulse rejects negative rates but keeps the channel", () => {
  const pulse = parseServicePulse({
    v: 1,
    kind: "service",
    id: "abc",
    name: "logger",
    hostname: "logger",
    ready: true,
    at: "2026-08-16T12:00:00.000Z",
    io: { insert: { ops: 4, err: -1, p95_ms: 30 } },
  });
  assert.ok(pulse);
  assert.equal(pulse.io?.insert.err, undefined);
  assert.equal(pulse.io?.insert.p95_ms, 30);
  assert.equal(pulse.window_s, undefined);
});
