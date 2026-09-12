import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { datasetsRouter } from "./datasets-http.ts";
import type { DatasetRepo } from "./datasets.ts";
import type { Dataset } from "./model/http-space.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const LIST = "3f2a9c1e-4b2a-41c0-8f3a-000000000030";
const OTHER = "3f2a9c1e-4b2a-41c0-8f3a-000000000031";
const SET = "3f2a9c1e-4b2a-41c0-8f3a-000000000040";
const PAGE = "3f2a9c1e-4b2a-41c0-8f3a-000000000050";
const NOW = new Date("2026-08-17T12:00:00.000Z");

const allowlist: Dataset = {
  id: LIST,
  httpSpaceId: SCOPE,
  name: "allowlist",
  description: "office nets",
  kind: "list",
  type: "ipv4",
  maxEntries: 1000,
  active: false,
  size: 2,
  createdAt: NOW,
  updatedAt: NOW,
};

const backup: Dataset = {
  ...allowlist,
  id: OTHER,
  name: "backup",
  size: 0,
};

/*
 * Страница отказа: у содержимого есть имена переменных, посчитанные из тела
 * (см. pageVars). Панель сверяет с ними перечень `params=` записи отказа.
 */
const page: Dataset = {
  ...allowlist,
  id: PAGE,
  name: "blocked",
  kind: "content",
  size: 4096,
  vars: ["waf_deny_ray", "waf_deny_scope", "waf_deny_subject"],
};

const link = {
  datasetId: LIST,
  setId: SET,
  name: "office",
  exclude: false,
};

function getState(): RootState {
  return {
    datasets: {
      ids: [LIST, OTHER, PAGE],
      entities: { [LIST]: allowlist, [OTHER]: backup, [PAGE]: page },
    },
  } as unknown as RootState;
}

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const repo = {
    withLiveSizes: async <T>(rows: T) => rows,
    listProfileLinks: async (spaceId: string) => {
      assert.equal(spaceId, SCOPE);
      return new Map([[LIST, [link]]]);
    },
    profileLinksOf: async (datasetId: string) => {
      return datasetId === LIST ? [link] : [];
    },
  } as unknown as DatasetRepo;

  const app = express();
  app.use(
    "/api/:scopeUuid/datasets",
    datasetsRouter(
      (async () => {
        throw new Error("dispatch unused");
      }) as unknown as AppDispatch,
      getState,
      repo,
      1024,
    ),
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

test("GET datasets returns set links", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      datasets: {
        uuid: string;
        description: string;
        linked: boolean;
        linked_sets: {
          uuid: string;
          name: string;
          exclude: boolean;
        }[];
      }[];
    };
    const rows = new Map(
      body.datasets.map((row) => [
        row.uuid,
        {
          uuid: row.uuid,
          description: row.description,
          linked: row.linked,
          linked_sets: row.linked_sets,
        },
      ]),
    );
    assert.deepEqual(rows.get(LIST), {
      uuid: LIST,
      description: "office nets",
      linked: true,
      linked_sets: [{ uuid: SET, name: "office", exclude: false }],
    });
    assert.deepEqual(rows.get(OTHER), {
      uuid: OTHER,
      description: "office nets",
      linked: false,
      linked_sets: [],
    });
  });
});

/*
 * Имена переменных выходят наружу вместе с набором: без них панель не знает,
 * что страница печатает, и перечень `params=` выбирается вслепую. У списка
 * поле пустое (null), а не пустой массив -- «нечего разбирать» и «разобрали,
 * ничего не нашли» отвечают на разные вопросы.
 */
test("GET datasets отдаёт переменные страницы", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      datasets: { uuid: string; vars: string[] | null }[];
    };
    const rows = new Map(body.datasets.map((row) => [row.uuid, row.vars]));
    assert.deepEqual(rows.get(PAGE), [
      "waf_deny_ray",
      "waf_deny_scope",
      "waf_deny_subject",
    ]);
    assert.equal(rows.get(LIST), null);
  });
});

test("GET dataset returns set links", async () => {
  await withApp(async (base) => {
    const linked = await fetch(`${base}/api/${SCOPE}/datasets/${LIST}`);
    assert.equal(linked.status, 200);
    const row = (await linked.json()) as {
      uuid: string;
      linked: boolean;
      linked_sets: { uuid: string; name: string }[];
    };
    assert.equal(row.uuid, LIST);
    assert.equal(row.linked, true);
    assert.equal(row.linked_sets[0]?.name, "office");

    const free = await fetch(`${base}/api/${SCOPE}/datasets/${OTHER}`);
    assert.equal(free.status, 200);
    const other = (await free.json()) as { linked: boolean };
    assert.equal(other.linked, false);
  });
});

function dispatchRow(row: Dataset): AppDispatch {
  return ((() => ({
    unwrap: async () => row,
  })) as unknown as AppDispatch);
}

async function withWriteApp(
  dispatch: AppDispatch,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const repo = {
    withLiveSizes: async <T>(rows: T) => rows,
    listProfileLinks: async () => new Map(),
    profileLinksOf: async () => [],
  } as unknown as DatasetRepo;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/:scopeUuid/datasets",
    datasetsRouter(dispatch, getState, repo, 1024),
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

test("POST dataset accepts description", async () => {
  const created = { ...allowlist, name: "office", description: "vpn" };
  await withWriteApp(dispatchRow(created), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "office",
        description: "vpn",
        mode: "internal",
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { description: string };
    assert.equal(body.description, "vpn");
  });
});

test("POST dataset rejects a non-string description", async () => {
  await withWriteApp(dispatchRow(allowlist), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "office",
        description: 1,
        mode: "internal",
      }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_description" });
  });
});

test("PUT dataset updates description", async () => {
  const updated = { ...allowlist, description: "updated" };
  await withWriteApp(dispatchRow(updated), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets/${LIST}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "updated" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { description: string };
    assert.equal(body.description, "updated");
  });
});

test("POST dataset requires mode", async () => {
  await withWriteApp(dispatchRow(allowlist), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "office" }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_mode" });
  });
});

test("POST dataset rejects ttl on internal", async () => {
  await withWriteApp(dispatchRow(allowlist), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "office",
        mode: "internal",
        ttl: "5m",
      }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "ttl_internal" });
  });
});

test("GET dataset includes list ttl", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets/${LIST}`);
    assert.equal(res.status, 200);
    const row = (await res.json()) as { ttl: string | null };
    assert.equal(row.ttl, null);
  });
});

/* --- удаление -------------------------------------------------------------
 * Занятость приходит из двух источников: SQL (link-таблицы и документы
 * профилей, здесь подделан referenceUses) и waf-документы трёх уровней
 * (datasetWafUses по стору). Свободный набор снимается, занятый называет
 * держателей.
 */

function deleteState(waf: unknown = {}): () => RootState {
  return () =>
    ({
      datasets: {
        ids: [LIST, OTHER],
        entities: { [LIST]: allowlist, [OTHER]: backup },
      },
      spaces: {
        ids: [SCOPE],
        entities: { [SCOPE]: { id: SCOPE, name: "default", waf } },
      },
      servers: { ids: [], entities: {} },
      locations: { ids: [], entities: {} },
    }) as unknown as RootState;
}

async function withDeleteApp(
  refs: { at: string; kind: string }[],
  state: () => RootState,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const repo = {
    withLiveSizes: async <T>(rows: T) => rows,
    listProfileLinks: async () => new Map(),
    profileLinksOf: async () => [],
    referenceUses: async () => refs,
  } as unknown as DatasetRepo;

  const app = express();
  app.use(
    "/api/:scopeUuid/datasets",
    datasetsRouter(dispatchRow(allowlist), state, repo, 1024),
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

test("DELETE снимает свободный набор", async () => {
  await withDeleteApp([], deleteState(), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets/${LIST}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { uuid: string; name: string };
    assert.equal(body.uuid, LIST);
    assert.equal(body.name, "allowlist");
  });
});

test("DELETE отказывает, пока набор держит база", async () => {
  await withDeleteApp(
    [{ at: "office", kind: "set" }],
    deleteState(),
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/datasets/${LIST}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 409);
      const body = (await res.json()) as {
        error: string;
        detail: string;
        uses: { at: string; kind: string }[];
      };
      assert.equal(body.error, "in_use");
      assert.equal(body.detail, "set office");
      assert.deepEqual(body.uses, [{ at: "office", kind: "set" }]);
    },
  );
});

test("DELETE отказывает, пока набор назван в локальном слое", async () => {
  await withDeleteApp(
    [],
    deleteState({
      localChecks: [
        { dataset: "allowlist", variable: "$remote_addr", action: "allow" },
      ],
    }),
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/datasets/${LIST}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 409);
      const body = (await res.json()) as { uses: unknown };
      assert.deepEqual(body.uses, [
        { at: "space", kind: "check", by: "$remote_addr" },
      ]);
    },
  );
});

test("DELETE неизвестного набора -- 404", async () => {
  await withDeleteApp([], deleteState(), async (base) => {
    const res = await fetch(
      `${base}/api/${SCOPE}/datasets/3f2a9c1e-4b2a-41c0-8f3a-0000000000ff`,
      { method: "DELETE" },
    );
    assert.equal(res.status, 404);
  });
});

test("POST dataset rejects entries on active", async () => {
  await withWriteApp(dispatchRow(allowlist), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "blocklist",
        mode: "active",
        entries: ["10.0.0.0/8"],
      }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "entries_active" });
  });
});
