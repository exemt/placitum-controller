import { connect, type NatsConnection } from "nats";

import { log } from "./log.ts";
import type { KeeperReply, ModelBus } from "./state/extra.ts";

const REQUEST_TIMEOUT_MS = 5000;

function encode(v: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(v));
}

export async function startDataBus(url: string): Promise<ModelBus & { close(): void }> {
  if (url === "") {
    return {
      ...logStub(),
      close() {},
    };
  }

  let nc: NatsConnection | null = null;
  let stopped = false;

  const open = async (): Promise<NatsConnection> => {
    if (nc !== null && !nc.isClosed()) {
      return nc;
    }

    nc = await connect({
      servers: url,
      name: "waf-controller-data",
      maxReconnectAttempts: -1,
      reconnectTimeWait: 500,
    });

    log("info", "keeper bus connected", { url });
    return nc;
  };

  const request = async (subject: string, body: unknown): Promise<KeeperReply> => {
    const conn = await open();
    const msg = await conn.request(subject, encode(body), { timeout: REQUEST_TIMEOUT_MS });
    return JSON.parse(new TextDecoder().decode(msg.data)) as KeeperReply;
  };

  const define = async (name: string): Promise<void> => {
    try {
      const reply = await request("waf.keeper.define", { name });
      if (!reply.ok) {
        log("warn", "keeper define rejected", { dataset: name, error: reply.error });
        return;
      }
      log("debug", "keeper define", { dataset: name, epoch: reply.epoch });
    } catch (err) {
      log("error", "keeper define failed", { dataset: name, error: String(err) });
    }
  };

  const write = async (
    name: string,
    op: "add" | "remove",
    value: string,
    ttlS: number | undefined,
    meta: { origin?: string; reason?: string; hashed?: boolean },
  ): Promise<KeeperReply> => {
    const body = {
      v: 3,
      set: name,
      op,
      value,
      ttl: op === "add" && ttlS !== undefined && ttlS > 0 ? Math.floor(ttlS) : undefined,
      origin: meta.origin !== undefined && meta.origin !== "" ? meta.origin : "panel",
      reason: meta.reason ?? "",
      hashed: meta.hashed === true ? true : undefined,
    };

    try {
      const reply = await request(`waf.sets.${name}.event`, body);
      if (!reply.ok) {
        log("warn", "keeper event rejected", { dataset: name, op, value, error: reply.error });
      }
      return reply;
    } catch (err) {
      log("error", "keeper event failed", { dataset: name, op, value, error: String(err) });
      return { ok: false, error: "keeper_unreachable" };
    }
  };

  const tail = new Map<string, Promise<void>>();

  const enqueue = (name: string, work: () => Promise<void>): void => {
    const prev = tail.get(name) ?? Promise.resolve();
    const next = prev.then(work, work);
    tail.set(name, next);
    void next.finally(() => {
      if (tail.get(name) === next) {
        tail.delete(name);
      }
    });
  };

  return {
    hydrated() {
      log("info", "model hydrated");
    },
    datasetChanged(ev) {
      if (ev.dataset.kind !== "list" || stopped) {
        return;
      }

      const name = ev.dataset.name;

      enqueue(name, () => define(name));
    },
    datasetWrite(name, op, value, ttlS, meta) {
      if (stopped) {
        return Promise.resolve({ ok: false, error: "keeper_unreachable" });
      }
      return write(name, op, value, ttlS, meta);
    },
    draftChanged(ev) {
      log("debug", "draft changed", {
        space: ev.spaceId,
        reason: ev.reason,
      });
    },
    close() {
      stopped = true;
      if (nc !== null && !nc.isClosed()) {
        void nc.close();
      }
    },
  };
}

function logStub(): ModelBus {
  return {
    hydrated() {
      log("info", "model hydrated");
    },
    datasetChanged(event) {
      log("debug", "dataset changed", {
        op: event.op,
        space: event.spaceId,
        dataset: event.dataset.id,
      });
    },
    datasetWrite(name, op, value) {
      log("debug", "dataset write", { dataset: name, op, value });
      return Promise.resolve({ ok: true });
    },
    draftChanged(event) {
      log("debug", "draft changed", {
        space: event.spaceId,
        reason: event.reason,
      });
    },
  };
}
