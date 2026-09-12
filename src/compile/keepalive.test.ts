import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ipBlobKeys,
  keepaliveTick,
  nginxBlobKeys,
  rulesBlobKeys,
  type KeepaliveChannel,
  type KeepaliveRedis,
} from "./keepalive.ts";
import type { IpPackPointer } from "./ip-pack.ts";
import type { NginxPackPointer } from "./nginx-pack.ts";
import type { RulesPackPointer } from "./pointer.ts";

const H1 = "sha256:" + "a".repeat(64);
const H2 = "sha256:" + "b".repeat(64);
const H3 = "sha256:" + "c".repeat(64);
const K1 = "waf.blob." + "a".repeat(64);
const K2 = "waf.blob." + "b".repeat(64);
const K3 = "waf.blob." + "c".repeat(64);

function fakeRedis(missing: string[]) {
  const calls: { expire: string[][]; put: { keys: string[]; ttl: number }[] } = {
    expire: [],
    put: [],
  };
  const redis: KeepaliveRedis = {
    async expireMany(keys) {
      calls.expire.push(keys);
      return keys.filter((k) => missing.includes(k));
    },
    async setNxExpireMany(items, ttl) {
      calls.put.push({ keys: items.map((i) => i.key), ttl });
      return { wrote: items.length, reused: 0 };
    },
  };
  return { redis, calls };
}

function channel(
  published: { rev: number; sha256: string; keys: string[] } | null,
  plans: Record<string, { sha256: string; items: { key: string; value: Buffer }[] } | null>,
): KeepaliveChannel & { planned: string[] } {
  const planned: string[] = [];
  return {
    id: "rules",
    planned,
    async published() {
      return published;
    },
    async blobs(space) {
      planned.push(space);
      return plans[space] ?? null;
    },
  };
}

const quiet = () => {};

test("keep-alive: живым блобам продлевается срок, план не зовётся", async () => {
  const { redis, calls } = fakeRedis([]);
  const ch = channel({ rev: 7, sha256: H1, keys: [K1, K2] }, {});

  const out = await keepaliveTick({ redis, channels: [ch], spaces: async () => ["s1"], ttlSec: 300, log: quiet });

  assert.deepEqual(calls.expire, [[K1, K2]]);
  assert.deepEqual(calls.put, []);
  assert.deepEqual(ch.planned, []);
  assert.deepEqual(out, [{ channel: "rules", rev: 7, kept: 2, missing: 0, restored: null }]);
});

test("keep-alive: пропавший блоб возвращается из плана с тем же хешем", async () => {
  const { redis, calls } = fakeRedis([K2]);
  const items = [
    { key: K1, value: Buffer.from("1") },
    { key: K2, value: Buffer.from("2") },
  ];
  const ch = channel(
    { rev: 7, sha256: H1, keys: [K1, K2] },
    { other: { sha256: H2, items: [] }, s1: { sha256: H1, items } },
  );
  const logged: string[] = [];

  const out = await keepaliveTick({
    redis,
    channels: [ch],
    spaces: async () => ["other", "s1"],
    ttlSec: 300,
    log: (_level, msg) => logged.push(msg),
  });

  // Чужое пространство пропущено по хешу, своё -- положено целиком со сроком.
  assert.deepEqual(ch.planned, ["other", "s1"]);
  assert.deepEqual(calls.put, [{ keys: [K1, K2], ttl: 300 }]);
  assert.deepEqual(out, [{ channel: "rules", rev: 7, kept: 1, missing: 1, restored: true }]);
  assert.deepEqual(logged, ["desired blobs restored"]);
});

test("keep-alive: хеш ни у одного пространства не совпал -- предупреждение, записи нет", async () => {
  const { redis, calls } = fakeRedis([K1]);
  const ch = channel({ rev: 7, sha256: H1, keys: [K1] }, { s1: { sha256: H2, items: [] } });
  const logged: string[] = [];

  const out = await keepaliveTick({
    redis,
    channels: [ch],
    spaces: async () => ["s1"],
    ttlSec: 300,
    log: (_level, msg) => logged.push(msg),
  });

  assert.deepEqual(calls.put, []);
  assert.deepEqual(out, [{ channel: "rules", rev: 7, kept: 0, missing: 1, restored: false }]);
  assert.deepEqual(logged, ["desired blobs expired and cannot be restored"]);
});

test("keep-alive: неизданный канал и упавший канал не мешают соседям", async () => {
  const { redis, calls } = fakeRedis([]);
  const idle = channel(null, {});
  const broken: KeepaliveChannel = {
    id: "nginx",
    async published() {
      throw new Error("kv down");
    },
    async blobs() {
      return null;
    },
  };
  const live = channel({ rev: 1, sha256: H1, keys: [K1] }, {});
  const warned: string[] = [];

  const out = await keepaliveTick({
    redis,
    channels: [idle, broken, live],
    spaces: async () => [],
    ttlSec: 300,
    log: (level, msg) => {
      if (level === "warn") warned.push(msg);
    },
  });

  assert.deepEqual(calls.expire, [[K1]]);
  assert.deepEqual(out, [{ channel: "rules", rev: 1, kept: 1, missing: 0, restored: null }]);
  assert.deepEqual(warned, ["desired blobs keep-alive failed"]);
});

test("ключи указателя: один хеш под разными именами -- один ключ; live у ip не блоб", () => {
  const rules = {
    v: 1,
    kind: "rules-pack",
    rev: 1,
    sha256: H3,
    prefix: "waf.blob.",
    files: { "a.conf": H1, "b.conf": H1 },
    profiles: { default: H2 },
    data: {},
    policies: { default: H3 },
    blobs: 3,
    wrote: 0,
    reused: 0,
    bytes: 0,
  } satisfies RulesPackPointer;
  assert.deepEqual(rulesBlobKeys(rules), [K1, K2, K3]);

  const nginx = {
    v: 1,
    kind: "nginx-pack",
    rev: 1,
    sha256: H3,
    prefix: "waf.blob.",
    config: H1,
    store: { cert: { hash: H2, type: "pem" } },
    pages: { "blocked.html": H3 },
    blobs: 3,
    wrote: 0,
    reused: 0,
    bytes: 0,
  } satisfies NginxPackPointer;
  assert.deepEqual(nginxBlobKeys(nginx), [K1, K3, K2]);

  const ip = {
    v: 1,
    kind: "ip-pack",
    rev: 1,
    sha256: H3,
    prefix: "waf.blob.",
    lists: { l: H1 },
    countries: { c: H2 },
    asns: {},
    live: { "set-uuid": "live-name" },
    sets: {},
    profiles: {},
    blobs: 2,
    wrote: 0,
    reused: 0,
    bytes: 0,
    ttl: 300,
  } satisfies IpPackPointer;
  assert.deepEqual(ipBlobKeys(ip), [K1, K2]);
});
