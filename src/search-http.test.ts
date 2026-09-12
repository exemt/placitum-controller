/*
 * Прокси к waf-search: что доезжает до поиска и что с ним бывает, когда
 * клиент ушёл. Поиск поддельный -- ClickHouse проверяется на стенде.
 */

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { test } from "node:test";

import express from "express";

import { searchRouter } from "./search-http.ts";

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
      // fetch держит соединения живыми: без этого close ждал бы их вечно.
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

/** Контроллер с одним прокси перед заданным поиском. */
async function front(searchUrl: string): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use("/api/search", searchRouter(searchUrl));
  return listen(createServer(app));
}

/**
 * Поиск, который не отвечает вовсе -- так выглядит долгий скан окна -- и
 * отмечает, пришёл ли запрос и бросили ли его.
 */
async function stallingSearch(): Promise<{
  url: string;
  arrived: Promise<void>;
  dropped: Promise<void>;
  close: () => Promise<void>;
}> {
  let arrive = () => {};
  let drop = () => {};
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const dropped = new Promise<void>((resolve) => {
    drop = resolve;
  });

  const server = createServer((_req, res) => {
    arrive();
    res.on("close", () => drop());
  });

  return { ...(await listen(server)), arrived, dropped };
}

async function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(what)), ms);
  });

  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

test("ответ поиска доезжает как есть, с фильтром в строке запроса", async () => {
  const search = express();
  search.get("/api/logs", (req, res) => {
    res.json({ items: [], total: 0, url: req.url });
  });
  const upstream = await listen(createServer(search));
  const api = await front(upstream.url);

  try {
    const res = await fetch(`${api.url}/api/search/logs?writer=edge-01&limit=32`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      items: [],
      total: 0,
      url: "/api/logs?writer=edge-01&limit=32",
    });
  } finally {
    await api.close();
    await upstream.close();
  }
});

test("клиент ушёл -- запрос к поиску снят, а не дочитывает окно", async () => {
  const search = await stallingSearch();
  const api = await front(search.url);

  try {
    const ac = new AbortController();
    const pending = fetch(`${api.url}/api/search/logs?limit=32`, {
      signal: ac.signal,
    }).catch(() => undefined);

    await within(search.arrived, 2_000, "запрос до поиска не дошёл");
    ac.abort();
    await pending;

    // Без отмены поиск держал бы запрос до таймаута прокси -- 15 секунд.
    await within(search.dropped, 2_000, "поиск не узнал, что клиент ушёл");
  } finally {
    await api.close();
    await search.close();
  }
});

test("поиск не отвечает: 503 search_unreachable", async () => {
  const dead = await listen(createServer(express()));
  await dead.close();
  const api = await front(dead.url);

  try {
    const res = await fetch(`${api.url}/api/search/logs`);

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "search_unreachable" });
  } finally {
    await api.close();
  }
});

test("поиск не настроен: 503 search_disabled", async () => {
  const api = await front("");

  try {
    const res = await fetch(`${api.url}/api/search/logs`);

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "search_disabled" });
  } finally {
    await api.close();
  }
});
