import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { mountServerCertificateRoutes } from "./certificates-http.ts";
import type { Certificate } from "./model/listen.ts";
import type { BoundCertificate } from "./model/server.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const SERVER = "3f2a9c1e-4b2a-41c0-8f3a-0000000000b1";
const OTHER = "3f2a9c1e-4b2a-41c0-8f3a-0000000000b2";
const CERT = "3f2a9c1e-4b2a-41c0-8f3a-0000000000d1";
const BIND = "3f2a9c1e-4b2a-41c0-8f3a-0000000000e1";

const shop: Certificate = {
  id: CERT,
  httpSpaceId: SCOPE,
  name: "shop",
  type: "server",
  certStoreId: "3f2a9c1e-4b2a-41c0-8f3a-0000000000f1",
  keyStoreId: "3f2a9c1e-4b2a-41c0-8f3a-0000000000f2",
  sans: ["shop.example"],
  fingerprint: "aa:bb",
  subject: "CN=shop.example",
  issuer: "CN=Test CA",
  serial: "1",
};

const bind: BoundCertificate = {
  id: BIND,
  serverId: SERVER,
  certificateId: CERT,
  kind: "server",
  certificate: shop,
};

function getState(): RootState {
  return {
    certificates: {
      certificates: {
        ids: [CERT],
        entities: { [CERT]: shop },
      },
      binds: {
        ids: [BIND],
        entities: { [BIND]: bind },
      },
    },
  } as unknown as RootState;
}

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  const router = express.Router({ mergeParams: true });
  mountServerCertificateRoutes(
    router,
    (async () => {
      throw new Error("dispatch unused");
    }) as unknown as AppDispatch,
    getState,
    (id, scope) => (scope === SCOPE && id === SERVER ? {} : undefined),
  );
  app.use("/api/:scopeUuid/servers", router);
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

test("GET server certificates returns bound rows", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/servers/${SERVER}/certificates`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      certificates: { uuid: string; certificate_id: string; kind: string; name: string }[];
    };
    assert.equal(body.certificates.length, 1);
    assert.equal(body.certificates[0]?.uuid, BIND);
    assert.equal(body.certificates[0]?.certificate_id, CERT);
    assert.equal(body.certificates[0]?.kind, "server");
    assert.equal(body.certificates[0]?.name, "shop");
  });
});

test("GET server certificates 404 when the server is out of scope", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/servers/${OTHER}/certificates`);
    assert.equal(res.status, 404);
  });
});
