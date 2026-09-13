import assert from "node:assert/strict";
import { test } from "node:test";

import { parseUpstreamCreate, parseUpstreamPatch } from "./upstreams-parse.ts";

const SPACE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";

test("accepts a named pool with one peer", () => {
  const parsed = parseUpstreamCreate(
    {
      name: "backend",
      peers: [{ host: "app", port: 8080 }],
    },
    SPACE,
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, {
      httpSpaceId: SPACE,
      name: "backend",
      method: "round_robin",
      peers: [
        {
          host: "app",
          port: 8080,
          weight: 1,
          backup: false,
          down: false,
          resolve: false,
        },
      ],
    });
  }
});

test("requires hash_key when method is hash", () => {
  const missing = parseUpstreamCreate(
    { name: "api", method: "hash", peers: [{ host: "app", port: 80 }] },
    SPACE,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error, "invalid_hash_key");
  }

  const ok = parseUpstreamCreate(
    {
      name: "api",
      method: "hash",
      hash_key: "$request_uri",
      peers: [{ host: "app", port: 80 }],
    },
    SPACE,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.method, "hash");
    assert.equal(ok.value.hashKey, "$request_uri");
  }
});

test("rejects a blank name and a bad method", () => {
  assert.equal(parseUpstreamCreate({ name: "  " }, SPACE).ok, false);
  assert.equal(
    parseUpstreamCreate({ name: "app", method: "random" }, SPACE).ok,
    false,
  );
});

test("rejects a peer without a valid port", () => {
  const parsed = parseUpstreamCreate(
    { name: "app", peers: [{ host: "app", port: 0 }] },
    SPACE,
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.error, "invalid_peers");
  }
});

test("resolve is a boolean flag of the peer", () => {
  const parsed = parseUpstreamCreate(
    { name: "panel", peers: [{ host: "controller", port: 8080, resolve: true }] },
    SPACE,
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.peers[0].resolve, true);
  }

  const bad = parseUpstreamCreate(
    { name: "panel", peers: [{ host: "controller", port: 8080, resolve: "yes" }] },
    SPACE,
  );
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.error, "invalid_peers");
  }
});

test("patch replaces peers and clears keepalive", () => {
  const parsed = parseUpstreamPatch({
    keepalive: null,
    peers: [{ host: "b", port: 9000, weight: 2, backup: true }],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.keepalive, null);
    assert.deepEqual(parsed.value.peers, [
      {
        host: "b",
        port: 9000,
        weight: 2,
        backup: true,
        down: false,
        resolve: false,
      },
    ]);
  }
});

test("patch to hash without a key is rejected", () => {
  const parsed = parseUpstreamPatch({ method: "hash" });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.error, "invalid_hash_key");
  }
});
