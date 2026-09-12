import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { locationsRouter } from "./locations-http.ts";
import type { HttpSpace } from "./model/http-space.ts";
import type { LocationView } from "./locations.ts";
import type { Server } from "./model/server.ts";
import { serversRouter } from "./servers-http.ts";
import { spaceSettingsRouter } from "./space-settings-http.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const OTHER = "3f2a9c1e-4b2a-41c0-8f3a-000000000002";
const SERVER = "3f2a9c1e-4b2a-41c0-8f3a-0000000000b1";
const LOCATION = "3f2a9c1e-4b2a-41c0-8f3a-0000000000c1";
const NOW = new Date("2026-08-18T08:00:00.000Z");

const space: HttpSpace = {
  id: SCOPE,
  name: "default",
  nginxMain: {},
  nginx: {
    sendfile: true,
    clientMaxBodySize: "10m",
    addHeaders: [{ name: "X-Frame-Options", value: "DENY" }],
    realIpHeader: "X-Real-IP",
  },
  wafHttp: { shmZone: { name: "waf", size: "32m" } },
  waf: {
    enabled: true,
    deadlineMs: 50,
    localChecks: [
      { dataset: "allow", variable: "$binary_remote_addr", action: "allow" },
    ],
  },
  raw: false,
  rawNginx: "",
  createdAt: NOW,
  updatedAt: NOW,
};

const server: Server = {
  id: SERVER,
  httpSpaceId: SCOPE,
  name: "api",
  serverNames: ["api.example"],
  enabled: true,
  nginx: { root: "/var/www", clientMaxBodySize: "2m" },
  waf: { deadlineMs: 30, localChecks: [] },
  raw: false,
  rawNginx: "",
};

const location: LocationView = {
  id: LOCATION,
  serverId: SERVER,
  httpSpaceId: SCOPE,
  serverName: "api",
  match: "prefix",
  path: "/app/",
  position: 0,
  enabled: true,
  handler: "proxy",
  protocol: "http",
  nginx: {},
  waf: { enabled: false },
  raw: false,
  rawNginx: "",
  builtin: false,
};

function getState(): RootState {
  return {
    spaces: { ids: [SCOPE], entities: { [SCOPE]: space } },
    servers: { ids: [SERVER], entities: { [SERVER]: server } },
    locations: { ids: [LOCATION], entities: { [LOCATION]: location } },
  } as unknown as RootState;
}

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  const unused = (async () => {
    throw new Error("dispatch unused");
  }) as unknown as AppDispatch;
  app.use("/api/:scopeUuid/http", spaceSettingsRouter(unused, getState));
  app.use("/api/:scopeUuid/servers", serversRouter(unused, getState));
  app.use("/api/:scopeUuid/locations", locationsRouter(unused, getState));
  const http = createServer(app);
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const addr = http.address();
  assert.ok(addr !== null && typeof addr === "object");
  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    http.close();
    await once(http, "close");
  }
}

test("GET http inheritance is the parent for a server editor", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/http/inheritance`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      http: { uuid: string; name: string; waf: { enabled?: boolean } };
      inherited: { section: string; key: string; from: string; value: unknown }[];
    };
    assert.equal(body.http.uuid, SCOPE);
    assert.equal(body.http.name, "default");
    assert.equal(body.http.waf.enabled, true);
    assert.deepEqual(
      body.inherited.filter((row) => row.section === "waf"),
      [
        { section: "waf", key: "deadlineMs", from: "http", value: 50 },
        { section: "waf", key: "enabled", from: "http", value: true },
        {
          section: "waf",
          key: "localChecks",
          from: "http",
          value: [
            {
              dataset: "allow",
              variable: "$binary_remote_addr",
              action: "allow",
            },
          ],
        },
      ],
    );
    assert.deepEqual(
      body.inherited.filter((row) => row.section === "nginx"),
      [
        { section: "nginx", key: "clientMaxBodySize", from: "http", value: "10m" },
        { section: "nginx", key: "realIpHeader", from: "http", value: "X-Real-IP" },
      ],
    );
    assert.equal(
      body.inherited.some((row) => row.key === "sendfile"),
      false,
    );
  });
});

test("GET server inheritance is http → server and what a path inherits", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/servers/${SERVER}/inheritance`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      http: { uuid: string };
      server: { uuid: string; name: string; waf: { deadlineMs?: number } };
      inherited: { section: string; key: string; from: string; value: unknown }[];
    };
    assert.equal(body.http.uuid, SCOPE);
    assert.equal(body.server.uuid, SERVER);
    assert.equal(body.server.name, "api");
    assert.equal(body.server.waf.deadlineMs, 30);
    assert.deepEqual(
      body.inherited.find((row) => row.key === "deadlineMs"),
      { section: "waf", key: "deadlineMs", from: "server", value: 30 },
    );
    assert.deepEqual(
      body.inherited.find((row) => row.key === "enabled"),
      { section: "waf", key: "enabled", from: "http", value: true },
    );
    assert.deepEqual(
      body.inherited.find((row) => row.key === "localChecks"),
      { section: "waf", key: "localChecks", from: "server", value: [] },
    );
    assert.deepEqual(
      body.inherited.find((row) => row.key === "clientMaxBodySize"),
      { section: "nginx", key: "clientMaxBodySize", from: "server", value: "2m" },
    );
    assert.deepEqual(
      body.inherited.find((row) => row.key === "addHeaders"),
      {
        section: "nginx",
        key: "addHeaders",
        from: "http",
        value: [{ name: "X-Frame-Options", value: "DENY" }],
      },
    );
    assert.deepEqual(
      body.inherited.find((row) => row.key === "root"),
      { section: "nginx", key: "root", from: "server", value: "/var/www" },
    );
  });
});

test("GET location inheritance matches the server parent chain", async () => {
  await withApp(async (base) => {
    const serverRes = await fetch(
      `${base}/api/${SCOPE}/servers/${SERVER}/inheritance`,
    );
    const locRes = await fetch(
      `${base}/api/${SCOPE}/locations/${LOCATION}/inheritance`,
    );
    assert.equal(locRes.status, 200);
    assert.deepEqual(await locRes.json(), await serverRes.json());
  });
});

test("GET inheritance rejects a bad uuid and a foreign scope", async () => {
  await withApp(async (base) => {
    const bad = await fetch(`${base}/api/${SCOPE}/servers/not-a-uuid/inheritance`);
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: "invalid_uuid" });

    const missing = await fetch(
      `${base}/api/${OTHER}/servers/${SERVER}/inheritance`,
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "not_found" });

    const loc = await fetch(
      `${base}/api/${OTHER}/locations/${LOCATION}/inheritance`,
    );
    assert.equal(loc.status, 404);
  });
});
