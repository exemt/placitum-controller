/*
 * Журнал контроллера в waf.log: та же пачка kind=log в тот же поток WAF_LOG,
 * что у инспекторов, сервисов и строк nginx (docs/logger/logs.md).
 *
 * Порт inspectors/<имя>/internal/logsink: одна форма на проводе — один разбор
 * в logger/internal/model.FromLog. Границы пачки те же (500 строк, 256 КБ,
 * 200 мс), буфер при недоступной шине — 20 000 строк, при переполнении
 * выбрасывается голова: свежая строка объясняет, что происходит сейчас.
 *
 * Своё соединение, как у fleet-bus и desired: журнал не ждёт KV, а KV —
 * журнал. Приёмник поднимается раньше всего остального и шины не ждёт: строки
 * старта — ровно те, ради которых журнал собирают, и до подключения они
 * копятся.
 *
 * О своих потерях приёмник молчит: журнал, который пишет в журнал о том, что не
 * смог написать в журнал, — петля. Счётчики — dropped и failed.
 */

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

/** `waf.log.<писатель>`: разделители шины в имени ломали бы subject молча. */
export function logSubject(writer: string): string {
  return "waf.log." + (writer === "" ? "unknown" : writer).replace(/[>* \t]/g, "_");
}

/**
 * Пачка без шины: копит строки и режет их по границам. Отдельно от соединения
 * — ради тестов и ради того, чтобы строки старта жили до подключения.
 */
export class LogBatcher {
  private readonly service: string;
  private pending: ShipLine[] = [];
  private size = 0;
  dropped = 0;

  constructor(service: string) {
    this.service = service === "" ? "unknown" : service;
  }

  /** Истина — пачка набрана, пора отправлять, не дожидаясь таймера. */
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

  /** Следующая пачка, не длиннее MAX_LINES. Пусто — отправлять нечего. */
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
  /** Колонка writer: WAF_LOG_WRITER, иначе имя машины (config.ts). */
  writer: string;
  /** Колонка service и ключ в policy/log-levels. */
  service: string;
}

export interface LogShip {
  readonly batcher: LogBatcher;
  failed(): number;
  close(): Promise<void>;
}

/**
 * Поднимает приёмник и подключает его к log.ts сразу, а шину — в фоне:
 * контроллер не ждёт NATS на старте, как не ждал и раньше.
 */
export function startLogShip(opts: LogShipOptions): LogShip {
  const batcher = new LogBatcher(opts.service);
  const encoder = new TextEncoder();
  const subject = logSubject(opts.writer);

  let nc: NatsConnection | null = null;
  let failed = 0;
  let closed = false;
  let scheduled = false;

  const flush = (): void => {
    // Шины ещё нет — держим накопленное: потолок буфера и решает, сколько
    // ждать не жалко.
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
      // Шины нет совсем (адрес не разобрался): журнал остаётся в stdout.
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

/*
 * Поток заводит тот писатель, который пришёл первым: публикация в
 * несуществующий поток — тишина, а не ошибка. Конфиг совпадает с
 * nginx/agent/internal/nginxlog и core/bootstrap/streams.sh; расхождение в
 * мелочи (поток уже заведён с чуть другим конфигом) — отказ, и он молчит:
 * публикация уходит и так.
 */
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
    // См. выше.
  }
}
