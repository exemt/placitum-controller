import { createConnection } from "node:net";

export class CompileRedis {
  private readonly host: string;
  private readonly port: number;

  constructor(url: string) {
    const parsed = new URL(url);
    this.host = parsed.hostname || "127.0.0.1";
    this.port = parsed.port === "" ? 6379 : Number(parsed.port);
  }

  async expireMany(
    keys: string[],
    ttlSec: number,
    timeoutMs = 10_000,
  ): Promise<string[]> {
    if (keys.length === 0) {
      return [];
    }

    const ttl = String(ttlSec);
    const replies = await this.pipeline(
      keys.map((key) => encode(["EXPIRE", key, ttl])),
      keys.length,
      timeoutMs,
    );

    const missing: string[] = [];

    for (let i = 0; i < replies.length; i++) {
      if (replies[i] === "0") {
        missing.push(keys[i]);
      }
    }

    return missing;
  }

  async setNxExpireMany(
    items: { key: string; value: Buffer }[],
    ttlSec: number,
    timeoutMs = 60_000,
  ): Promise<{ wrote: number; reused: number }> {
    if (items.length === 0) {
      return { wrote: 0, reused: 0 };
    }

    const ttl = String(ttlSec);
    const replies = await this.pipeline(
      items.map((item) =>
        encode(["SET", item.key, item.value, "NX", "EX", ttl]),
      ),
      items.length,
      timeoutMs,
    );

    const reusedKeys: string[] = [];
    let wrote = 0;

    for (let i = 0; i < replies.length; i++) {
      if (replies[i] === null) {
        reusedKeys.push(items[i].key);
      } else {
        wrote += 1;
      }
    }

    if (reusedKeys.length > 0) {
      await this.pipeline(
        reusedKeys.map((key) => encode(["EXPIRE", key, ttl])),
        reusedKeys.length,
        timeoutMs,
      );
    }

    return { wrote, reused: reusedKeys.length };
  }

  async commands(args: (string | Buffer)[][], timeoutMs = 10_000): Promise<Reply[]> {
    if (args.length === 0) {
      return [];
    }

    return this.pipeline(
      args.map((a) => encode(a)),
      args.length,
      timeoutMs,
    );
  }

  async liveSet(name: string, timeoutMs = 60_000): Promise<LiveEntry[]> {
    const out: LiveEntry[] = [];

    for (let start = 0; ; start += LIVE_PAGE) {
      const [members] = await this.commands(
        [["ZRANGE", `waf:set:${name}`, String(start), String(start + LIVE_PAGE - 1), "WITHSCORES"]],
        timeoutMs,
      );

      const list = Array.isArray(members) ? members : [];

      if (list.length === 0) {
        break;
      }

      const values: string[] = [];
      const scores: string[] = [];

      for (let i = 0; i + 1 < list.length; i += 2) {
        values.push(text(list[i]));
        scores.push(text(list[i + 1]));
      }

      const [whys] = await this.commands([["HMGET", `waf:set:${name}:why`, ...values]], timeoutMs);
      const why = Array.isArray(whys) ? whys : [];

      for (let j = 0; j < values.length; j++) {
        const w = why[j];
        out.push(liveEntry(values[j], scores[j], w === null || w === undefined ? undefined : text(w)));
      }

      if (values.length < LIVE_PAGE) {
        break;
      }
    }

    return out;
  }

  async liveLookup(name: string, values: string[]): Promise<Map<string, LiveEntry>> {
    const out = new Map<string, LiveEntry>();

    if (values.length === 0) {
      return out;
    }

    const replies = await this.commands([
      ...values.map((v) => ["ZSCORE", `waf:set:${name}`, v]),
      ...values.map((v) => ["HGET", `waf:set:${name}:why`, v]),
    ]);

    for (let i = 0; i < values.length; i++) {
      const score = replies[i];
      if (score === null || score === undefined) {
        continue;
      }

      const why = replies[values.length + i];
      out.set(values[i], liveEntry(values[i], text(score), why === null ? undefined : text(why)));
    }

    return out;
  }

  async liveSizes(names: string[]): Promise<number[]> {
    const replies = await this.commands(names.map((n) => ["ZCARD", `waf:set:${n}`]));
    return replies.map((r) => Number(text(r)) || 0);
  }

  private pipeline(
    payloads: Buffer[],
    expect: number,
    timeoutMs = 10_000,
  ): Promise<Reply[]> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let buf = Buffer.alloc(0);
      const out: Reply[] = [];
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("redis timeout"));
      }, timeoutMs);

      const finish = (err?: Error) => {
        clearTimeout(timer);
        socket.end();
        if (err !== undefined) {
          reject(err);
          return;
        }
        resolve(out);
      };

      socket.on("connect", () => {
        for (const payload of payloads) {
          socket.write(payload);
        }
      });
      socket.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (out.length < expect) {
          const parsed = decodeOne(buf);
          if (parsed === undefined) {
            return;
          }

          if (parsed.err !== undefined) {
            finish(new Error(parsed.err));
            return;
          }

          out.push(parsed.value ?? null);
          buf = buf.subarray(parsed.consumed);
        }

        finish();
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

export type Reply = string | Buffer | null | Reply[];

const LIVE_PAGE = 20_000;

export interface LiveEntry {
  value: string;
  expMs: number;
  origin: string;
  reason: string;
}

function text(r: Reply | undefined): string {
  if (r === null || r === undefined) {
    return "";
  }

  if (Array.isArray(r)) {
    return "";
  }

  return typeof r === "string" ? r : r.toString();
}

function pairs(r: Reply | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const list = Array.isArray(r) ? r : [];

  for (let i = 0; i + 1 < list.length; i += 2) {
    out.set(text(list[i]), text(list[i + 1]));
  }

  return out;
}

function liveEntry(value: string, score: string, why: string | undefined): LiveEntry {
  const sep = why === undefined ? -1 : why.indexOf("\x1f");
  const origin = why === undefined ? "" : sep < 0 ? why : why.slice(0, sep);
  const reason = why === undefined || sep < 0 ? "" : why.slice(sep + 1);

  return { value, expMs: Number(score) || 0, origin, reason };
}

export function encode(args: (string | Buffer)[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];

  for (const arg of args) {
    const raw = typeof arg === "string" ? Buffer.from(arg) : Buffer.from(arg);
    parts.push(Buffer.from(`$${raw.length}\r\n`), raw, Buffer.from("\r\n"));
  }

  return Buffer.concat(parts);
}

function decodeOne(
  buf: Buffer,
): { value?: Reply; consumed: number; err?: string } | undefined {
  if (buf.length < 3) {
    return undefined;
  }

  const kind = buf[0];
  const end = buf.indexOf("\r\n");

  if (end < 0) {
    return undefined;
  }

  if (kind === 0x2b || kind === 0x3a) {
    return { value: buf.subarray(1, end).toString(), consumed: end + 2 };
  }

  if (kind === 0x2d) {
    return { err: buf.subarray(1, end).toString(), consumed: end + 2 };
  }

  if (kind === 0x24) {
    const n = Number(buf.subarray(1, end).toString());
    if (n < 0) {
      return { value: null, consumed: end + 2 };
    }

    const start = end + 2;
    if (buf.length < start + n + 2) {
      return undefined;
    }

    return { value: buf.subarray(start, start + n), consumed: start + n + 2 };
  }

  if (kind === 0x2a) {
    const n = Number(buf.subarray(1, end).toString());
    if (n < 0) {
      return { value: null, consumed: end + 2 };
    }

    let pos = end + 2;
    const items: Reply[] = [];

    for (let i = 0; i < n; i++) {
      const one = decodeOne(buf.subarray(pos));
      if (one === undefined) {
        return undefined;
      }

      if (one.err !== undefined) {
        return { err: one.err, consumed: buf.length };
      }

      items.push(one.value ?? null);
      pos += one.consumed;
    }

    return { value: items, consumed: pos };
  }

  return { err: `unsupported redis reply 0x${kind.toString(16)}`, consumed: buf.length };
}
