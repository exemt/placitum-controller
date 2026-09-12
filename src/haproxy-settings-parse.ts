/**
 * Разбор тела настроек haproxy.
 *
 * Проверки здесь -- те же, что `haproxy -c` сделал бы на ноде, только раньше и
 * дешевле: у агента кривое значение -- это apply_failed в пульсе одной ноды,
 * который заметят по жёлтой полосе, а здесь -- 400 прямо в форме.
 *
 * Отсутствующий ключ -- «печатай умолчание», а не ноль: пустой документ
 * компилируется в поставочный конфиг стенда (см. compile/haproxy.ts).
 */

import { isHaproxyBalance } from "./compile/haproxy.ts";
import type { HaproxyServer, HaproxySettings } from "./model/haproxy.ts";

export type ParseOk<T> = { ok: true; value: T };
export type ParseFail = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseFail;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Пусто, null и пустая строка -- «ключа нет», а не значение. */
function absent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

// Имя server в haproxy: без пробелов и кавычек; ограничиваем консервативно.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
// Хост: имя сервиса compose, DNS-имя или адрес. Underscore допустим у Docker.
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,253}$/;
const PATH_RE = /^\/[^\s"']*$/;

const MAX_SERVERS = 64;

function asInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined | ParseFail {
  if (absent(value)) {
    return undefined;
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `invalid_${field}` };
  }
  return n;
}

function failed<T>(value: T | undefined | ParseFail): value is ParseFail {
  return value !== undefined && typeof value === "object" && value !== null &&
    (value as ParseFail).ok === false;
}

function parseServer(raw: unknown, index: number): HaproxyServer | ParseFail {
  if (!isRecord(raw)) {
    return { ok: false, error: `invalid_server_${index}` };
  }

  const name = String(raw.name ?? "").trim();
  if (!NAME_RE.test(name)) {
    return { ok: false, error: `invalid_server_name_${index}` };
  }

  const host = String(raw.host ?? "").trim();
  if (!HOST_RE.test(host)) {
    return { ok: false, error: `invalid_server_host_${index}` };
  }

  const out: HaproxyServer = { name, host };

  const port = asInt(raw.port, `server_port_${index}`, 1, 65535);
  if (failed(port)) return port;
  if (port !== undefined) out.port = port;

  return out;
}

export function parseHaproxySettingsBody(
  body: unknown,
): ParseResult<HaproxySettings> {
  if (!isRecord(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const out: HaproxySettings = {};

  if (!absent(body.process)) {
    if (!isRecord(body.process)) {
      return { ok: false, error: "invalid_process" };
    }
    const process: HaproxySettings["process"] = {};

    const maxconn = asInt(body.process.maxconn, "maxconn", 1, 1000000);
    if (failed(maxconn)) return maxconn;
    if (maxconn !== undefined) process.maxconn = maxconn;

    const bufsize = asInt(body.process.bufsize, "bufsize", 16384, 16777216);
    if (failed(bufsize)) return bufsize;
    if (bufsize !== undefined) process.bufsize = bufsize;

    if (Object.keys(process).length > 0) {
      out.process = process;
    }
  }

  if (!absent(body.timeouts)) {
    if (!isRecord(body.timeouts)) {
      return { ok: false, error: "invalid_timeouts" };
    }
    const timeouts: HaproxySettings["timeouts"] = {};

    const rows = [
      ["connect_ms", "connectMs", 100, 600000],
      ["client_ms", "clientMs", 1000, 3600000],
      ["server_ms", "serverMs", 1000, 3600000],
      ["keepalive_ms", "keepaliveMs", 100, 600000],
      // Туннель живёт дольше остальных: websocket держат часами.
      ["tunnel_ms", "tunnelMs", 1000, 86400000],
    ] as const;

    for (const [wire, key, min, max] of rows) {
      const value = asInt(body.timeouts[wire], wire.replace("_ms", ""), min, max);
      if (failed(value)) return value;
      if (value !== undefined) timeouts[key] = value;
    }

    if (Object.keys(timeouts).length > 0) {
      out.timeouts = timeouts;
    }
  }

  if (!absent(body.frontend)) {
    if (!isRecord(body.frontend)) {
      return { ok: false, error: "invalid_frontend" };
    }
    const port = asInt(body.frontend.port, "frontend_port", 1, 65535);
    if (failed(port)) return port;
    if (port !== undefined) {
      out.frontend = { port };
    }
  }

  if (!absent(body.backend)) {
    if (!isRecord(body.backend)) {
      return { ok: false, error: "invalid_backend" };
    }
    const backend: NonNullable<HaproxySettings["backend"]> = {};

    if (!absent(body.backend.balance)) {
      if (!isHaproxyBalance(body.backend.balance)) {
        return { ok: false, error: "invalid_balance" };
      }
      backend.balance = body.backend.balance;
    }

    if (!absent(body.backend.check)) {
      if (!isRecord(body.backend.check)) {
        return { ok: false, error: "invalid_check" };
      }
      const check: NonNullable<
        NonNullable<HaproxySettings["backend"]>["check"]
      > = {};

      if (!absent(body.backend.check.path)) {
        const path = String(body.backend.check.path).trim();
        if (path.length > 200 || !PATH_RE.test(path)) {
          return { ok: false, error: "invalid_check_path" };
        }
        check.path = path;
      }

      const status = asInt(body.backend.check.status, "check_status", 100, 599);
      if (failed(status)) return status;
      if (status !== undefined) check.status = status;

      const inter = asInt(body.backend.check.inter_ms, "check_inter", 100, 600000);
      if (failed(inter)) return inter;
      if (inter !== undefined) check.interMs = inter;

      if (Object.keys(check).length > 0) {
        backend.check = check;
      }
    }

    if (!absent(body.backend.servers)) {
      if (!Array.isArray(body.backend.servers)) {
        return { ok: false, error: "invalid_servers" };
      }
      if (body.backend.servers.length > MAX_SERVERS) {
        return { ok: false, error: "too_many_servers" };
      }

      const servers: HaproxyServer[] = [];
      const names = new Set<string>();

      for (const [index, raw] of body.backend.servers.entries()) {
        const row = parseServer(raw, index);
        if ("ok" in row && row.ok === false) {
          return row;
        }
        const server = row as HaproxyServer;
        // Два server с одним именем haproxy склеит в один -- отказ честнее.
        if (names.has(server.name)) {
          return { ok: false, error: "duplicate_server_name" };
        }
        names.add(server.name);
        servers.push(server);
      }

      if (servers.length > 0) {
        backend.servers = servers;
      }
    }

    if (Object.keys(backend).length > 0) {
      out.backend = backend;
    }
  }

  if (!absent(body.stats)) {
    if (!isRecord(body.stats)) {
      return { ok: false, error: "invalid_stats" };
    }
    const stats: HaproxySettings["stats"] = {};

    if (!absent(body.stats.enabled)) {
      if (typeof body.stats.enabled !== "boolean") {
        return { ok: false, error: "invalid_stats_enabled" };
      }
      stats.enabled = body.stats.enabled;
    }

    const port = asInt(body.stats.port, "stats_port", 1, 65535);
    if (failed(port)) return port;
    if (port !== undefined) stats.port = port;

    if (Object.keys(stats).length > 0) {
      out.stats = stats;
    }
  }

  if (!absent(body.docker_dns)) {
    if (typeof body.docker_dns !== "boolean") {
      return { ok: false, error: "invalid_docker_dns" };
    }
    out.dockerDns = body.docker_dns;
  }

  return { ok: true, value: out };
}

/** Тело ответа: тот же вид, что принимает PUT. */
export function jsonHaproxySettings(
  settings: HaproxySettings,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (settings.process !== undefined) {
    out.process = { ...settings.process };
  }

  if (settings.timeouts !== undefined) {
    const timeouts: Record<string, unknown> = {};
    if (settings.timeouts.connectMs !== undefined) {
      timeouts.connect_ms = settings.timeouts.connectMs;
    }
    if (settings.timeouts.clientMs !== undefined) {
      timeouts.client_ms = settings.timeouts.clientMs;
    }
    if (settings.timeouts.serverMs !== undefined) {
      timeouts.server_ms = settings.timeouts.serverMs;
    }
    if (settings.timeouts.keepaliveMs !== undefined) {
      timeouts.keepalive_ms = settings.timeouts.keepaliveMs;
    }
    if (settings.timeouts.tunnelMs !== undefined) {
      timeouts.tunnel_ms = settings.timeouts.tunnelMs;
    }
    out.timeouts = timeouts;
  }

  if (settings.frontend !== undefined) {
    out.frontend = { ...settings.frontend };
  }

  if (settings.backend !== undefined) {
    const backend: Record<string, unknown> = {};
    if (settings.backend.balance !== undefined) {
      backend.balance = settings.backend.balance;
    }
    if (settings.backend.check !== undefined) {
      const check: Record<string, unknown> = {};
      if (settings.backend.check.path !== undefined) {
        check.path = settings.backend.check.path;
      }
      if (settings.backend.check.status !== undefined) {
        check.status = settings.backend.check.status;
      }
      if (settings.backend.check.interMs !== undefined) {
        check.inter_ms = settings.backend.check.interMs;
      }
      backend.check = check;
    }
    if (settings.backend.servers !== undefined) {
      backend.servers = settings.backend.servers.map((row) => ({ ...row }));
    }
    out.backend = backend;
  }

  if (settings.stats !== undefined) {
    out.stats = { ...settings.stats };
  }

  if (settings.dockerDns !== undefined) {
    out.docker_dns = settings.dockerDns;
  }

  return out;
}
