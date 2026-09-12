import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { datasetsRouter } from "./datasets-http.ts";
import type { DatasetRepo } from "./datasets.ts";
import type { Dataset } from "./model/http-space.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

/*
 * Встроенная страница отказа: приехала с поставкой
 * (062_default_deny_pages.sql), правится, но не удаляется и не
 * переименовывается. Имя набора -- это имя записи каталога
 * waf_deny_response, по которому страницу ищет try_files.
 */

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const PAGE = "3f2a9c1e-4b2a-41c0-8f3a-000000000050";
const MINE = "3f2a9c1e-4b2a-41c0-8f3a-000000000051";
const PRESET = "3f2a9c1e-4b2a-41c0-8f3a-000000000052";
const NOW = new Date("2026-08-28T12:00:00.000Z");

const blocked: Dataset = {
  id: PAGE,
  httpSpaceId: SCOPE,
  name: "blocked",
  description: "Отказ по политике",
  kind: "content",
  type: "string",
  contentTypeId: "c1000000-0000-4000-8000-000000000002",
  maxEntries: 1000000,
  active: false,
  builtin: true,
  size: 7328,
  createdAt: NOW,
  updatedAt: NOW,
};

const mine: Dataset = {
  ...blocked,
  id: MINE,
  name: "my_page",
  builtin: false,
};

/* Встроенный список: заперт именем, состав и режим правятся. */
const preset: Dataset = {
  ...blocked,
  id: PRESET,
  name: "office_nets",
  kind: "list",
  type: "ipv4",
  contentTypeId: undefined,
  builtin: true,
};

function getState(): RootState {
  return {
    datasets: {
      ids: [PAGE, MINE, PRESET],
      entities: { [PAGE]: blocked, [MINE]: mine, [PRESET]: preset },
    },
  } as unknown as RootState;
}

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const repo = {
    withLiveSizes: async <T>(rows: T) => rows,
    listProfileLinks: async () => new Map(),
    profileLinksOf: async () => [],
    referenceUses: async () => [],
  } as unknown as DatasetRepo;

  /*
   * Запись подменена заглушкой: проверяется, доходит ли запрос до неё, а не
   * что она делает. Отказ до записи -- это 400 с кодом, прошедший запрос --
   * 200. Одна заглушка на обе ручки, поэтому в ответе и строка набора, и
   * содержимое: какую половину прочтёт ручка, решает она сама.
   */
  const written = {
    ...blocked,
    content: {
      datasetId: PAGE,
      name: "blocked.html",
      body: Buffer.from("<!doctype html>"),
      size: 15,
      updatedAt: NOW,
    },
  };

  const dispatch = (() => ({
    unwrap: async () => written,
  })) as unknown as AppDispatch;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/:scopeUuid/datasets",
    datasetsRouter(dispatch, getState, repo, 1024 * 1024),
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

test("встроенная страница видна флагом builtin", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets/${PAGE}`);
    assert.equal(res.status, 200);
    const row = (await res.json()) as { builtin: boolean };
    assert.equal(row.builtin, true);

    const own = await fetch(`${base}/api/${SCOPE}/datasets/${MINE}`);
    const ownRow = (await own.json()) as { builtin: boolean };
    assert.equal(ownRow.builtin, false);
  });
});

test("встроенную страницу не удалить", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets/${PAGE}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "builtin_locked" });
  });
});

/*
 * Страница заперта целиком: это образец, свой вариант получают копией.
 * Даже неизменившееся имя с новым описанием -- отказ: у образца нет
 * состояния, которое стоило бы сохранять.
 */
test("встроенную страницу не изменить вовсе", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets/${PAGE}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "blocked", description: "своё описание" }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "builtin_locked" });
  });
});

test("тело встроенной страницы не перезаписать", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/datasets/${PAGE}/content`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "blocked.html", blob: "PGgxPg==" }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "builtin_locked" });
  });
});

/*
 * Встроенный список -- другой запрет: имя заперто (на него ссылаются
 * пресеты), а состав и режим -- рабочее состояние, и правка проходит.
 */
test("встроенный список: имя заперто, режим правится", async () => {
  await withApp(async (base) => {
    const renamed = await fetch(`${base}/api/${SCOPE}/datasets/${PRESET}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "other_nets" }),
    });
    assert.equal(renamed.status, 400);
    assert.deepEqual(await renamed.json(), { error: "builtin_name_locked" });

    const limit = await fetch(`${base}/api/${SCOPE}/datasets/${PRESET}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "office_nets", limit: 500 }),
    });
    assert.equal(limit.status, 200);
  });
});
