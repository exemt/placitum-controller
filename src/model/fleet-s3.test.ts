import assert from "node:assert/strict";
import { test } from "node:test";

import { parseS3Pulse } from "./fleet.ts";

test("parseS3Pulse accepts minio frame", () => {
  const pulse = parseS3Pulse({
    v: 1,
    kind: "s3",
    id: "abc",
    name: "s3",
    hostname: "s3-agent",
    ready: true,
    at: "2026-08-16T12:00:00.000Z",
    s3: {
      ok: true,
      version: "2025-04-22T22-12-26Z",
      endpoint: "minio:9000",
      bucket: "waf-bodies",
      region: "us-east-1",
      objects: 12,
      used_bytes: 1048576,
      capacity: 10737418240,
      buckets: 1,
      uptime_s: 3600,
    },
  });
  assert.ok(pulse);
  assert.equal(pulse.kind, "s3");
  assert.equal(pulse.s3.ok, true);
  assert.equal(pulse.s3.objects, 12);
  assert.equal(pulse.s3.bucket, "waf-bodies");
});

test("parseS3Pulse keeps a down store", () => {
  const pulse = parseS3Pulse({
    v: 1,
    kind: "s3",
    id: "abc",
    name: "s3",
    hostname: "s3-agent",
    ready: false,
    at: "2026-08-16T12:00:00.000Z",
    s3: { ok: false, error: "bucket not found" },
  });
  assert.ok(pulse);
  assert.equal(pulse.ready, false);
  assert.equal(pulse.s3.ok, false);
  assert.equal(pulse.s3.error, "bucket not found");
});

test("parseS3Pulse rejects redis frame", () => {
  assert.equal(
    parseS3Pulse({
      v: 1,
      kind: "redis",
      id: "x",
      name: "redis",
      hostname: "redis",
      ready: true,
      at: "2026-08-16T12:00:00.000Z",
      redis: { ok: true },
    }),
    null,
  );
});
