import {
  connect,
  DiscardPolicy,
  nanos,
  RetentionPolicy,
  StorageType,
  type NatsConnection,
} from "nats";

import { attachSink, type Level } from "./log.ts";

export const LOG_STREAM = "WAF_LOG";

const MAX_TEXT = 8 * 1024;
const MAX_LINES = 500;
const MAX_SIZE = 256 * 1024;
const FLUSH_EVERY_MS = 200;
const MAX_PENDING = 20_000;

export interface ShipLine {
  ts: string;
  service: string;
  severity: string;
  text: string;
}

export function logSubject(writer: string): string {
  return "waf.log." + (writer === "" ? "unknown" : writer).replace(/[>* \t]/g, "_");
}

export class LogBatcher {
  private readonly service: string;
  private pending: ShipLine[] = [];
  private size = 0;
  dropped = 0;

  constructor(service: string) {
    this.service = service === "" ? "unknown" : service;
  }

  add(level: Level, text: string): boolean {
    const body = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
    if (body === "") {
      return false;
    }

    this.pending.push({
      ts: new Date().toISOString(),
      service: this.service,
      severity: level,
      text: body,
    });
    this.size += body.length + 64;

    if (this.pending.length > MAX_PENDING) {
      const cut = this.pending.length - MAX_PENDING;
      this.pending.splice(0, cut);
      this.dropped += cut;
      this.size = weigh(this.pending);
    }

    return this.pending.length >= MAX_LINES || this.size >= MAX_SIZE;
  }

  take(): ShipLine[] {
    const lines = this.pending.splice(0, MAX_LINES);
    this.size = weigh(this.pending);
    return lines;
  }

  get length(): number {
    return this.pending.length;
  }
}

function weigh(lines: ShipLine[]): number {
  return lines.reduce((sum, row) => sum + row.text.length + 64, 0);
}

export interface LogShipOptions {
  url: string;
  writer: string;
  service: string;
}

export interface LogShip {
  readonly batcher: LogBatcher;
  failed(): number;
  close(): Promise<void>;
}

export function startLogShip(opts: LogShipOptions): LogShip {
  const batcher = new LogBatcher(opts.service);
  const encoder = new TextEncoder();
  const subject = logSubject(opts.writer);

  let nc: NatsConnection | null = null;
  let failed = 0;
  let closed = false;
  let scheduled = false;

  const flush = (): void => {
    if (nc === null || nc.isClosed()) {
      return;
    }

    for (let lines = batcher.take(); lines.length > 0; lines = batcher.take()) {
      try {
        nc.publish(
          subject,
          encoder.encode(JSON.stringify({ v: 1, kind: "log", writer: opts.writer, lines })),
        );
      } catch {
        failed += lines.length;
      }
    }
  };

  attachSink({
    add(level, line) {
      if (batcher.add(level, line) && !scheduled) {
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          flush();
        });
      }
    },
  });

  const timer = setInterval(flush, FLUSH_EVERY_MS);
  timer.unref();

  void (async () => {
    try {
      const conn = await connect({
        servers: opts.url,
        name: "waf-controller-log",
        maxReconnectAttempts: -1,
        reconnectTimeWait: 500,
        waitOnFirstConnect: true,
      });

      if (closed) {
        await conn.close();
        return;
      }

      nc = conn;
      await ensureStream(conn);
      flush();
    } catch {
    }
  })();

  return {
    batcher,
    failed: () => failed,
    async close() {
      closed = true;
      clearInterval(timer);
      flush();
      attachSink(null);
      await nc?.drain().catch(() => {});
    },
  };
}

async function ensureStream(nc: NatsConnection): Promise<void> {
  try {
    const jsm = await nc.jetstreamManager();
    await jsm.streams.add({
      name: LOG_STREAM,
      subjects: ["waf.log.>"],
      storage: StorageType.File,
      retention: RetentionPolicy.Limits,
      max_age: nanos(24 * 3600 * 1000),
      max_bytes: 128 * 1024 * 1024,
      discard: DiscardPolicy.Old,
    });
  } catch {
  }
}
