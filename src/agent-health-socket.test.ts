/*
 * Сокет живого флота: снимок на коннект, дальше не чаще интервала и всегда
 * последним seq; отставшему -- последний снимок, когда очередь разойдётся;
 * молчащий на пинг обрывается.
 */

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { configureStore } from "@reduxjs/toolkit";
import { WebSocket, type ClientOptions } from "ws";

import {
  attachAgentHealthSocket,
  type HealthSocketOptions,
} from "./agent-health-socket.ts";
import { rootReducer } from "./state/root.ts";
import { fleetWorkerUp } from "./state/slices/fleet.ts";
import { routeUpgrades } from "./ws-upgrade.ts";

interface Client {
  ws: WebSocket;
  seqs: number[];
}

async function stand(options: HealthSocketOptions) {
  const store = configureStore({ reducer: rootReducer });
  const socket = attachAgentHealthSocket(store.getState, store.subscribe, options);
  const server = createServer();
  const stop = routeUpgrades(server, [socket]);
  const clients: Client[] = [];

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");
  const url = `ws://127.0.0.1:${addr.port}/agent_health_socket`;

  return {
    socket,
    /** Клиент, который складывает seq пришедших снимков. */
    connect: async (opts?: ClientOptions): Promise<Client> => {
      const ws = new WebSocket(url, opts);
      const client: Client = { ws, seqs: [] };
      ws.on("message", (data) => {
        client.seqs.push((JSON.parse(String(data)) as { seq: number }).seq);
      });
      clients.push(client);
      await once(ws, "open");
      return client;
    },
    /** Пульсы одного воркера подряд, в одном тике. Возвращает seq после них. */
    pulse: (n: number): number => {
      for (let i = 0; i < n; i += 1) {
        store.dispatch(
          fleetWorkerUp({
            v: 1,
            kind: "worker",
            node_id: "edge-01",
            pid: 1,
            nonce: "n",
            config_hash: "h",
            at: new Date().toISOString(),
          }),
        );
      }
      return store.getState().fleet.seq;
    },
    close: async () => {
      for (const client of clients) {
        client.ws.terminate();
      }
      socket.close();
      stop();
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

async function waitFor(check: () => boolean, ms = 2_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) {
      throw new Error("не дождались");
    }
    await sleep(5);
  }
}

test("пачка пульсов уходит одним снимком, следующий ждёт интервал", async () => {
  const s = await stand({ pushMs: 300 });
  try {
    const client = await s.connect();
    await waitFor(() => client.seqs.length === 1);
    assert.deepEqual(client.seqs, [0]);

    // первая перемена после тишины уходит сразу: весь тик одним снимком
    const burst = s.pulse(20);
    await waitFor(() => client.seqs.length === 2);
    assert.deepEqual(client.seqs, [0, burst]);

    // перемена сразу за снимком ждёт конца интервала
    const started = Date.now();
    const next = s.pulse(5);
    await waitFor(() => client.seqs.length === 3);
    assert.ok(Date.now() - started >= 200, "снимок раньше интервала");
    assert.equal(client.seqs[2], next);

    await sleep(400);
    assert.equal(client.seqs.length, 3, "без перемен снимок не повторяется");
  } finally {
    await s.close();
  }
});

test("забитой очереди снимок не шлётся; разошлась — приходит последний", async () => {
  const s = await stand({ pushMs: 50, backlogBytes: 1024 });
  let backlog = 0;
  s.socket.wss.on("connection", (ws: WebSocket) => {
    Object.defineProperty(ws, "bufferedAmount", { get: () => backlog });
  });
  try {
    const client = await s.connect();
    await waitFor(() => client.seqs.length === 1);

    backlog = 1 << 20;
    const last = s.pulse(3);
    await sleep(200);
    assert.equal(client.seqs.length, 1, "снимок ушёл в забитую очередь");

    // очередь разошлась, флот молчит: снимок всё равно догоняет
    backlog = 0;
    await waitFor(() => client.seqs.length === 2);
    assert.equal(client.seqs[1], last);
  } finally {
    await s.close();
  }
});

test("молчащий на пинг обрывается, отвечающий живёт", async () => {
  const s = await stand({ pingMs: 50 });
  try {
    const deaf = await s.connect({ autoPong: false });
    const live = await s.connect();

    const [code] = (await once(deaf.ws, "close")) as [number];
    assert.equal(code, 1006);
    assert.equal(live.ws.readyState, WebSocket.OPEN);
  } finally {
    await s.close();
  }
});
