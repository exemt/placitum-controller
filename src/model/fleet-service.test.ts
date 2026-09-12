import assert from "node:assert/strict";
import { test } from "node:test";

import { parseServicePulse } from "./fleet.ts";

test("parseServicePulse accepts logger frame", () => {
  const pulse = parseServicePulse({
    v: 1,
    kind: "service",
    id: "abc",
    name: "logger",
    hostname: "logger",
    ready: true,
    at: "2026-08-15T12:00:00.000Z",
    work: { inserted: 12, last_batch: 3, clickhouse_ok: true },
  });
  assert.ok(pulse);
  assert.equal(pulse.name, "logger");
  assert.equal(pulse.work?.inserted, 12);
  assert.equal(pulse.work?.clickhouse_ok, true);
});

test("parseServicePulse accepts geo frame", () => {
  const pulse = parseServicePulse({
    v: 1,
    kind: "service",
    id: "def",
    name: "geo",
    hostname: "geo",
    ready: true,
    at: "2026-08-15T12:00:00.000Z",
    work: { countries: 2, asns: 2, skipped: 0, gen: 1, fingerprint: "aa" },
  });
  assert.ok(pulse);
  assert.equal(pulse.work?.countries, 2);
  assert.equal(pulse.work?.asns, 2);
});

test("parseServicePulse rejects inspector frame", () => {
  assert.equal(
    parseServicePulse({
      v: 1,
      kind: "inspector",
      id: "x",
      name: "modsec",
      hostname: "edge",
      ready: true,
      at: "2026-08-15T12:00:00.000Z",
    }),
    null,
  );
});
