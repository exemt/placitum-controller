import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { portsRouter } from "./ports-http.ts";
import type { Port } from "./model/listen.ts";
import type { PortBind } from "./ports.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const HTTP = "3f2a9c1e-4b2a-41c0-8f3a-0000000000a1";
const TLS = "3f2a9c1e-4b2a-41c0-8f3a-0000000000a2";
const SERVER = "3f2a9c1e-4b2a-41c0-8f3a-0000000000b1";
const BIND = "3f2a9c1e-4b2a-41c0-8f3a-0000000000c1";

const httpPort: Port = {
  id: HTTP,
  httpSpaceId: SCOPE,
  name: "http",
  address: "0.0.0.0",
  port: 80,
  ssl: false,
  http2: false,
  proxyProtocol: false,
};

const tlsPort: Port = {
  ...httpPort,
  id: TLS,
  name: "https",
  port: 443,
  ssl: true,
  http2: true,
};

const defaultBind: PortBind = {
  id: BIND,
  serverId: SERVER,
  portId: HTTP,
  defaultServer: true,
  port: httpPort,
};

function getState(): RootState {
  return {
    ports: {
      ports: {
        ids: [HTTP, TLS],
        entities: { [HTTP]: httpPort, [TLS]: tlsPort },
      },
      binds: {
        ids: [BIND],
        entities: { [BIND]: defaultBind },
      },
    },
  } as unknown as RootState;
}

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(
    "/api/:scopeUuid/ports",
    portsRouter((async () => {
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

test("GET ports returns default_server_id when a bind holds it", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/ports`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ports: {
        uuid: string;
        bind_count: number;
        default_server_id: string | null;
      }[];
    };
    const rows = new Map(body.ports.map((row) => [row.uuid, row]));
    assert.equal(rows.get(HTTP)?.bind_count, 1);
    assert.equal(rows.get(HTTP)?.default_server_id, SERVER);
    assert.equal(rows.get(TLS)?.bind_count, 0);
    assert.equal(rows.get(TLS)?.default_server_id, null);
  });
});

test("GET port returns default_server_id of the owning server", async () => {
  await withApp(async (base) => {
    const taken = await fetch(`${base}/api/${SCOPE}/ports/${HTTP}`);
    assert.equal(taken.status, 200);
    const http = (await taken.json()) as {
      uuid: string;
      default_server_id: string | null;
      bind_count: number;
    };
    assert.equal(http.uuid, HTTP);
    assert.equal(http.bind_count, 1);
    assert.equal(http.default_server_id, SERVER);

    const free = await fetch(`${base}/api/${SCOPE}/ports/${TLS}`);
    assert.equal(free.status, 200);
    const tls = (await free.json()) as { default_server_id: string | null };
    assert.equal(tls.default_server_id, null);
  });
});
