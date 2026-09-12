/*
 * Страна и ASN адреса для карточек: кто отвечает.
 *
 * Проверяется развилка источников -- каталог пространства против кодера --
 * и то, что битый адрес портит только свой элемент пачки. Сам SQL проверяется
 * на стенде: здесь репозитории поддельные.
 */

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { test } from "node:test";

import express from "express";

import { geoRouter } from "./geo-http.ts";
import type { IpAsnRepo } from "./ip-asns.ts";
import type { IpCountryRepo } from "./ip-countries.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";

interface Catalog {
  countries?: Record<string, { code: string; name: string }>;
  asns?: Record<string, { asn: number; name: string }>;
}

function fakeCountries(catalog: Catalog): IpCountryRepo {
  return {
    filled: async () => catalog.countries !== undefined,
    lookup: async (_space: string, addrs: string[]) =>
      addrs
        .map((addr) => ({ addr, hit: catalog.countries?.[addr] }))
        .filter((row) => row.hit !== undefined)
        .map((row) => ({ addr: row.addr, ...row.hit! })),
  } as unknown as IpCountryRepo;
}

function fakeAsns(catalog: Catalog): IpAsnRepo {
  return {
    filled: async () => catalog.asns !== undefined,
    lookup: async (_space: string, addrs: string[]) =>
      addrs
        .map((addr) => ({ addr, hit: catalog.asns?.[addr] }))
        .filter((row) => row.hit !== undefined)
        .map((row) => ({ addr: row.addr, ...row.hit! })),
  } as unknown as IpAsnRepo;
}

/** Кодер: отвечает всем одно и то же и считает, сколько раз его звали. */
async function fakeCoder(): Promise<{
  url: string;
  calls: () => number;
  close: () => Promise<void>;
}> {
  let calls = 0;
  const app = express();
  app.use(express.json());
  app.post("/lookup/batch", (req, res) => {
    calls += 1;
    const addrs = (req.body as { addrs: string[] }).addrs;
    res.json({
      results: addrs.map((addr) => ({
        addr,
        countries: [{ code: "jp", name: "Japan" }],
        asns: [{ asn: 2516, name: "KDDI" }],
      })),
    });
  });

  const server = createServer(app);
  return {
    ...(await listen(server)),
    calls: () => calls,
  };
}

async function listen(
  server: Server,
): Promise<{ url: string; close: () => Promise<void> }> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");

  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

interface Result {
  addr: string;
  countries: { code: string }[];
  asns: { asn: number }[];
  error?: string;
}

async function ask(
  catalog: Catalog,
  geoUrl: string,
  addrs: string[],
): Promise<{ status: number; results: Result[]; error?: string }> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/:scopeUuid/geo",
    geoRouter(fakeCountries(catalog), fakeAsns(catalog), geoUrl),
  );

  const { url, close } = await listen(createServer(app));

  try {
    const res = await fetch(`${url}/api/${SCOPE}/geo/lookup/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addrs }),
    });
    const body = (await res.json()) as { results?: Result[]; error?: string };

    return { status: res.status, results: body.results ?? [], error: body.error };
  } finally {
    await close();
  }
}

const CATALOG: Catalog = {
  countries: { "8.8.8.8": { code: "us", name: "США" } },
  asns: { "8.8.8.8": { asn: 15169, name: "GOOGLE" } },
};

test("каталог залит: отвечает он, кодера не зовут", async () => {
  const coder = await fakeCoder();

  try {
    const out = await ask(CATALOG, coder.url, ["8.8.8.8"]);

    assert.equal(out.status, 200);
    assert.deepEqual(out.results[0].countries, [{ code: "us", name: "США" }]);
    assert.deepEqual(out.results[0].asns, [{ asn: 15169, name: "GOOGLE" }]);
    assert.equal(coder.calls(), 0);
  } finally {
    await coder.close();
  }
});

test("адрес не в каталоге: пустые списки, а не отказ", async () => {
  const out = await ask(CATALOG, "", ["1.2.3.4"]);

  assert.equal(out.status, 200);
  assert.deepEqual(out.results, [{ addr: "1.2.3.4", countries: [], asns: [] }]);
});

test("каталога нет: отвечает кодер", async () => {
  const coder = await fakeCoder();

  try {
    const out = await ask({}, coder.url, ["8.8.8.8"]);

    assert.equal(out.status, 200);
    assert.deepEqual(out.results[0].countries, [{ code: "jp", name: "Japan" }]);
    assert.deepEqual(out.results[0].asns, [{ asn: 2516, name: "KDDI" }]);
    assert.equal(coder.calls(), 1);
  } finally {
    await coder.close();
  }
});

test("залит только ASN: страну берёт кодер, ASN -- каталог", async () => {
  const coder = await fakeCoder();

  try {
    const out = await ask({ asns: CATALOG.asns }, coder.url, ["8.8.8.8"]);

    assert.equal(out.status, 200);
    assert.deepEqual(out.results[0].countries, [{ code: "jp", name: "Japan" }]);
    assert.deepEqual(out.results[0].asns, [{ asn: 15169, name: "GOOGLE" }]);
  } finally {
    await coder.close();
  }
});

test("ни каталога, ни кодера: 503 с кодом, а не пустой ответ", async () => {
  const out = await ask({}, "", ["8.8.8.8"]);

  assert.equal(out.status, 503);
  assert.equal(out.error, "geo_disabled");
});

test("кодер не ответил, каталога нет: 503 geo_unreachable", async () => {
  const dead = await listen(createServer(express()));
  await dead.close();

  const out = await ask({}, dead.url, ["8.8.8.8"]);

  assert.equal(out.status, 503);
  assert.equal(out.error, "geo_unreachable");
});

test("битый адрес метит только свой элемент, порядок сохраняется", async () => {
  const out = await ask(CATALOG, "", ["8.8.8.8", "не адрес", "1.2.3.4"]);

  assert.equal(out.status, 200);
  assert.deepEqual(
    out.results.map((row) => row.addr),
    ["8.8.8.8", "не адрес", "1.2.3.4"],
  );
  assert.equal(out.results[0].error, undefined);
  assert.equal(out.results[1].error, "bad_addr");
  assert.deepEqual(out.results[2], { addr: "1.2.3.4", countries: [], asns: [] });
});

test("сеть -- такой же вход, как адрес", async () => {
  const out = await ask(
    { countries: { "10.0.0.0/8": { code: "ru", name: "Россия" } } },
    "",
    ["10.0.0.0/8", "10.0.0.0/64"],
  );

  assert.deepEqual(out.results[0].countries, [{ code: "ru", name: "Россия" }]);
  assert.equal(out.results[1].error, "bad_addr");
});
