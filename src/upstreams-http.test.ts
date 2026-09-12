import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import type { LocationView } from "./locations.ts";
import type { UpstreamTree } from "./model/upstream.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import { upstreamsRouter } from "./upstreams-http.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const UP = "3f2a9c1e-4b2a-41c0-8f3a-0000000000d1";
const PEER = "3f2a9c1e-4b2a-41c0-8f3a-0000000000d2";
const LOC = "3f2a9c1e-4b2a-41c0-8f3a-0000000000e1";
const OTHER = "3f2a9c1e-4b2a-41c0-8f3a-0000000000d3";

const backend: UpstreamTree = {
  id: UP,
  httpSpaceId: SCOPE,
  name: "backend",
  method: "round_robin",
  keepalive: 32,
  peers: [
    {
      id: PEER,
      upstreamId: UP,
      host: "backend",
      port: 8080,
      weight: 1,
      backup: false,
      down: false,
      position: 0,
    },
  ],
};

const unused: UpstreamTree = {
  id: OTHER,
  httpSpaceId: SCOPE,
  name: "spare",
  method: "least_conn",
  peers: [],
};

const location = {
  id: LOC,
  serverId: "3f2a9c1e-4b2a-41c0-8f3a-0000000000b1",
  httpSpaceId: SCOPE,
  serverName: "edge",
  match: "prefix",
  path: "/",
  position: 0,
  enabled: true,
  handler: "proxy",
  upstreamId: UP,
  nginx: {},
  waf: {},
  raw: false,
  rawNginx: "",
} as LocationView;

function getState(): RootState {
  return {
    upstreams: {
      ids: [UP, OTHER],
      entities: { [UP]: backend, [OTHER]: unused },
    },
    locations: {
      ids: [LOC],
      entities: { [LOC]: location },
    },
  } as unknown as RootState;
}

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(
    "/api/:scopeUuid/upstreams",
    upstreamsRouter((async () => {
      throw new Error("dispatch unused");
    }) as unknown as AppDispatch, getState),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");
  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("GET upstreams returns peers and path bind_count", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/upstreams`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      upstreams: {
        uuid: string;
        name: string;
        method: string;
        peer_count: number;
        bind_count: number;
        peers: { host: string; port: number }[];
      }[];
    };
    const rows = new Map(body.upstreams.map((row) => [row.uuid, row]));
    assert.equal(rows.get(UP)?.name, "backend");
    assert.equal(rows.get(UP)?.peer_count, 1);
    assert.equal(rows.get(UP)?.bind_count, 1);
    assert.equal(rows.get(UP)?.peers[0]?.host, "backend");
    assert.equal(rows.get(UP)?.peers[0]?.port, 8080);
    assert.equal(rows.get(OTHER)?.bind_count, 0);
    assert.equal(rows.get(OTHER)?.method, "least_conn");
  });
});

test("GET upstream returns the pool used by a path", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/upstreams/${UP}`);
    assert.equal(res.status, 200);
    const row = (await res.json()) as {
      uuid: string;
      bind_count: number;
      keepalive: number | null;
    };
    assert.equal(row.uuid, UP);
    assert.equal(row.bind_count, 1);
    assert.equal(row.keepalive, 32);
  });
});

test("GET unknown upstream is 404", async () => {
  await withApp(async (base) => {
    const missing = await fetch(
      `${base}/api/${SCOPE}/upstreams/3f2a9c1e-4b2a-41c0-8f3a-0000000000ff`,
    );
    assert.equal(missing.status, 404);
    const bad = await fetch(`${base}/api/${SCOPE}/upstreams/not-a-uuid`);
    assert.equal(bad.status, 400);
  });
});
