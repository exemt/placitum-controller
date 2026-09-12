import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { ipAsnsRouter } from "./ip-asns-http.ts";
import type { IpAsnRepo } from "./ip-asns.ts";
import { ipCountriesRouter } from "./ip-countries-http.ts";
import type { IpCountryRepo } from "./ip-countries.ts";
import type { IpAsn, IpAsnAddress, IpCountry, IpCountryAddress } from "./model/ip-profile.ts";
import type { RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const COUNTRY = "3f2a9c1e-4b2a-41c0-8f3a-000000000010";
const ASN = "3f2a9c1e-4b2a-41c0-8f3a-000000000020";
const NOW = new Date("2026-08-17T12:00:00.000Z");

const country: IpCountry = {
  id: COUNTRY,
  httpSpaceId: SCOPE,
  code: "ru",
  type: "v4",
  description: "test",
  size: 25,
  createdAt: NOW,
  updatedAt: NOW,
};

const asn: IpAsn = {
  id: ASN,
  httpSpaceId: SCOPE,
  asn: 15169,
  type: "v4",
  description: "test",
  size: 25,
  createdAt: NOW,
  updatedAt: NOW,
};

function countryRows(count: number, start = 0): IpCountryAddress[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `3f2a9c1e-4b2a-41c0-8f3a-0000000001${String(start + i).padStart(2, "0")}`,
    countryId: COUNTRY,
    address: `10.0.${start + i}.0/24`,
  }));
}

function asnRows(count: number, start = 0): IpAsnAddress[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `3f2a9c1e-4b2a-41c0-8f3a-0000000002${String(start + i).padStart(2, "0")}`,
    asnId: ASN,
    address: `8.8.${start + i}.0/24`,
  }));
}

async function withApp(
  mount: (app: express.Express) => void,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const app = express();
  mount(app);
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

test("GET country addresses returns page counters", async () => {
  const calls: unknown[] = [];
  const repo = {
    addressesPage: async (
      id: string,
      limit: number,
      offset: number,
      search: unknown,
    ) => {
      calls.push({ id, limit, offset, search });
      return { rows: countryRows(10), total: 25 };
    },
  } as unknown as IpCountryRepo;

  await withApp(
    (app) => {
      app.use(
        "/api/:scopeUuid/ip-countries",
        ipCountriesRouter(
          () =>
            ({
              ipCountries: { ids: [COUNTRY], entities: { [COUNTRY]: country } },
            }) as unknown as RootState,
          repo,
        ),
      );
    },
    async (base) => {
      const res = await fetch(
        `${base}/api/${SCOPE}/ip-countries/${COUNTRY}/addresses?page=0&page_size=10`,
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        addresses: { address: string }[];
        total: number;
        count: number;
        page: number;
        page_size: number;
        page_count: number;
      };
      assert.equal(body.addresses.length, 10);
      assert.equal(body.addresses[0]?.address, "10.0.0.0/24");
      assert.deepEqual(
        {
          total: body.total,
          count: body.count,
          page: body.page,
          page_size: body.page_size,
          page_count: body.page_count,
        },
        { total: 25, count: 10, page: 0, page_size: 10, page_count: 3 },
      );
      assert.deepEqual(calls[0], {
        id: COUNTRY,
        limit: 10,
        offset: 0,
        search: { kind: "none" },
      });
    },
  );
});

test("GET country addresses last page and host search", async () => {
  const calls: unknown[] = [];
  const repo = {
    addressesPage: async (
      id: string,
      limit: number,
      offset: number,
      search: unknown,
    ) => {
      calls.push({ id, limit, offset, search });
      return { rows: countryRows(5, 20), total: 25 };
    },
  } as unknown as IpCountryRepo;

  await withApp(
    (app) => {
      app.use(
        "/api/:scopeUuid/ip-countries",
        ipCountriesRouter(
          () =>
            ({
              ipCountries: { ids: [COUNTRY], entities: { [COUNTRY]: country } },
            }) as unknown as RootState,
          repo,
        ),
      );
    },
    async (base) => {
      const res = await fetch(
        `${base}/api/${SCOPE}/ip-countries/${COUNTRY}/addresses?page=2&page_size=10&q=192.168.18.21`,
      );
      const body = (await res.json()) as {
        count: number;
        page: number;
        page_count: number;
        addresses: { address: string }[];
      };
      assert.equal(res.status, 200);
      assert.equal(body.count, 5);
      assert.equal(body.page, 2);
      assert.equal(body.page_count, 3);
      assert.equal(body.addresses[0]?.address, "10.0.20.0/24");
      assert.deepEqual(calls[0], {
        id: COUNTRY,
        limit: 10,
        offset: 20,
        search: { kind: "host", value: "192.168.18.21" },
      });
    },
  );
});

test("GET country addresses export dumps the full list", async () => {
  const repo = {
    addressTexts: async () => ["10.0.0.0/8", "10.1.0.0/16", "10.2.0.0/16"],
  } as unknown as IpCountryRepo;

  await withApp(
    (app) => {
      app.use(
        "/api/:scopeUuid/ip-countries",
        ipCountriesRouter(
          () =>
            ({
              ipCountries: { ids: [COUNTRY], entities: { [COUNTRY]: country } },
            }) as unknown as RootState,
          repo,
        ),
      );
    },
    async (base) => {
      const res = await fetch(
        `${base}/api/${SCOPE}/ip-countries/${COUNTRY}/addresses/export`,
      );
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
      assert.match(res.headers.get("content-disposition") ?? "", /ru-v4\.txt/);
      assert.equal(await res.text(), "10.0.0.0/8\n10.1.0.0/16\n10.2.0.0/16");
    },
  );
});

test("GET asn addresses returns the same page envelope", async () => {
  const repo = {
    get: async () => asn,
    addressesPage: async () => ({ rows: asnRows(10), total: 25 }),
  } as unknown as IpAsnRepo;

  await withApp(
    (app) => {
      app.use("/api/:scopeUuid/ip-asns", ipAsnsRouter(repo));
    },
    async (base) => {
      const res = await fetch(
        `${base}/api/${SCOPE}/ip-asns/${ASN}/addresses?page=0&page_size=10`,
      );
      const body = (await res.json()) as {
        addresses: { address: string }[];
        total: number;
        count: number;
        page_count: number;
      };
      assert.equal(res.status, 200);
      assert.equal(body.addresses.length, 10);
      assert.equal(body.total, 25);
      assert.equal(body.count, 10);
      assert.equal(body.page_count, 3);
    },
  );
});
