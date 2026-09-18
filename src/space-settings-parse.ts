import {
  isErrorLogLevel,
  parseAccessLogTail,
  parseErrorLogTail,
  type AccessLog,
  type AccessLogEntry,
  type ErrorLog,
} from "./model/log.ts";
import {
  isBuiltinVar,
  type NginxHttpSettings,
  type NginxLocationSettings,
  type NginxMainSettings,
  type NginxServerSettings,
  type ProxyHeaderPreset,
  type WafHttpSettings,
} from "./model/settings.ts";
import { NGINX_SHM_MIN_SIZE, parseNginxSize } from "./model/shm-fit.ts";
import type {
  BodyLimitPolicy,
  Cond,
  CookieDefaults,
  DenyMode,
  InspectorDecl,
  InspectorMode,
  InspectorRef,
  LocalCheck,
  LocalRate,
  ScoreDeny,
  WafRouteSettings,
} from "./model/waf-route.ts";
import type { SpaceHttpPatch } from "./spaces.ts";

export type ParseOk<T> = { ok: true; value: T };
export type ParseFail = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseFail;

function ok<T>(value: T): ParseOk<T> {
  return { ok: true, value };
}

function fail(error: string): ParseFail {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asBool(value: unknown, field: string): boolean | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  return typeof value === "boolean" ? value : fail(`invalid_${field}`);
}

function asInt(
  value: unknown,
  field: string,
  min = 0,
): number | undefined | ParseFail {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= min) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= min) {
      return n;
    }
  }
  return fail(`invalid_${field}`);
}

function asNum(
  value: unknown,
  field: string,
  min = 0,
): number | undefined | ParseFail {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= min) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= min) {
      return n;
    }
  }
  return fail(`invalid_${field}`);
}

function asStr(value: unknown, field: string): string | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return fail(`invalid_${field}`);
  }
  const text = value.trim();
  return text.length === 0 ? undefined : text;
}

function asSize(value: unknown, field: string): string | undefined | ParseFail {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  return asStr(value, field);
}

const TEMP_PATH_RE = /^\/[^\s;{}"']*$/;

function asTempPath(
  value: unknown,
  field: string,
): string | undefined | ParseFail {
  const text = asStr(value, field);
  if (typeof text !== "string") {
    return text;
  }
  return TEMP_PATH_RE.test(text) ? text : fail(`invalid_${field}`);
}

function asStrList(
  value: unknown,
  field: string,
): string[] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail(`invalid_${field}`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return fail(`invalid_${field}`);
    }
    const text = item.trim();
    if (text.length > 0) {
      items.push(text);
    }
  }
  return items;
}

function asIntList(
  value: unknown,
  field: string,
): number[] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail(`invalid_${field}`);
  }
  const items: number[] = [];
  for (const item of value) {
    const n = asInt(item, field, 1);
    if (n !== undefined && typeof n !== "number") {
      return n;
    }
    if (typeof n === "number") {
      items.push(n);
    }
  }
  return items;
}

function isFail(value: unknown): value is ParseFail {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    (value as ParseFail).ok === false
  );
}

function put<T extends object, K extends keyof T>(
  dest: T,
  key: K,
  value: T[K] | undefined | ParseFail,
): ParseFail | undefined {
  if (isFail(value)) {
    return value;
  }
  if (value !== undefined) {
    dest[key] = value;
  }
  return undefined;
}

const POLICIES = ["pass", "block"] as const;
const HOLD_MODES = ["gate", "monitor"] as const;
const INSPECTOR_RESUMES = ["off", "prefer", "require"] as const;
const BODY_LIMIT: readonly BodyLimitPolicy[] = ["block", "trim", "pass"];
const DENY_MODES = ["fast", "deterministic"] as const;
const FRAME_AUDIT = ["off", "deny", "all"] as const;
const FRAME_CACHE_STREAMS = ["both", "c2s", "s2c"] as const;
const INSPECTOR_MODES = ["active", "passive", "vote", "off", "ignore"] as const;
const LINGERING = ["on", "off", "always"] as const;
const PROXY_HEADERS = ["standard", "websocket", "none"] as const;
const PROXY_HEADERS_LOC = ["standard", "websocket", "none", "custom"] as const;
const SAME_SITE = ["Strict", "Lax", "None"] as const;
const SSL_VERIFY = ["on", "off", "optional"] as const;
const LOCATION_ROLES = [
  "none",
  "healthz",
  "challenge",
  "deny_page",
] as const;

function asEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | undefined | ParseFail {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return fail(`invalid_${field}`);
  }
  return value as T;
}

function parseBus(
  value: unknown,
): WafHttpSettings["bus"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_bus");
  }
  const bus: NonNullable<WafHttpSettings["bus"]> = {};
  const err =
    put(bus, "name", asStr(value.name, "bus_name")) ??
    put(bus, "connectTimeoutMs", asInt(value.connectTimeoutMs, "bus_connect_timeout_ms")) ??
    put(bus, "reconnectWaitMs", asInt(value.reconnectWaitMs, "bus_reconnect_wait_ms")) ??
    put(bus, "pingIntervalMs", asInt(value.pingIntervalMs, "bus_ping_interval_ms")) ??
    put(bus, "pendingMax", asStr(value.pendingMax, "bus_pending_max")) ??
    put(bus, "payloadMax", asStr(value.payloadMax, "bus_payload_max")) ??
    put(bus, "tls", asBool(value.tls, "bus_tls")) ??
    put(bus, "tlsCa", asStr(value.tlsCa, "bus_tls_ca")) ??
    put(bus, "tlsCert", asStr(value.tlsCert, "bus_tls_cert")) ??
    put(bus, "tlsKey", asStr(value.tlsKey, "bus_tls_key")) ??
    put(bus, "creds", asStr(value.creds, "bus_creds"));
  return err ?? bus;
}

function parseShm(
  value: unknown,
): WafHttpSettings["shmZone"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_shm_zone");
  }
  const name = asStr(value.name, "shm_zone_name");
  const size = asStr(value.size, "shm_zone_size");
  if (isFail(name)) {
    return name;
  }
  if (isFail(size)) {
    return size;
  }
  if (name === undefined || size === undefined) {
    return fail("invalid_shm_zone");
  }
  const bytes = parseNginxSize(size);
  if (bytes === null || bytes < NGINX_SHM_MIN_SIZE) {
    return fail("invalid_shm_zone_size");
  }
  return { name, size };
}

function parseVars(
  value: unknown,
): WafHttpSettings["vars"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail("invalid_waf_vars");
  }
  const items: NonNullable<WafHttpSettings["vars"]> = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return fail("invalid_waf_vars");
    }
    const name = asStr(item.name, "waf_var_name");
    const varValue = asStr(item.value, "waf_var_value");
    if (isFail(name) || isFail(varValue)) {
      return [name, varValue].find(isFail) as ParseFail;
    }
    if (name === undefined || varValue === undefined) {
      return fail("invalid_waf_vars");
    }
    if (!VAR_NAME_RE.test(name)) {
      return fail("invalid_waf_var_name");
    }
    if (isBuiltinVar(name)) {
      return fail("reserved_waf_var");
    }
    items.push({ name, value: varValue });
  }
  return items;
}

const VAR_NAME_RE = /^[A-Za-z0-9_.-]+$/;

function parseDeclVars(value: unknown): string[] | undefined | ParseFail {
  const list = asStrList(value, "inspector_vars");
  if (isFail(list) || list === undefined) {
    return list;
  }
  const out: string[] = [];
  for (const name of list) {
    if (name !== "all" && !VAR_NAME_RE.test(name)) {
      return fail("invalid_inspector_vars");
    }
    if (!out.includes(name)) {
      out.push(name);
    }
  }
  return out.length === 0 ? undefined : out;
}

export function parseWafHttp(value: unknown): ParseResult<WafHttpSettings> {
  if (!isRecord(value)) {
    return fail("invalid_waf_http");
  }
  const row: WafHttpSettings = {};
  const err =
    put(row, "bus", parseBus(value.bus)) ??
    put(row, "busFlushIntervalMs", asInt(value.busFlushIntervalMs, "bus_flush_interval_ms")) ??
    put(row, "protocolVersions", asIntList(value.protocolVersions, "protocol_versions")) ??
    put(row, "replyMax", asStr(value.replyMax, "reply_max")) ??
    put(row, "headerValueMax", asStr(value.headerValueMax, "header_value_max")) ??
    put(row, "maxInflight", asInt(value.maxInflight, "max_inflight", 1)) ??
    put(row, "shmZone", parseShm(value.shmZone)) ??
    put(row, "bodyMaxHolds", asInt(value.bodyMaxHolds, "body_max_holds")) ??
    put(
      row,
      "bodyRemoteMinDeadlineMs",
      asInt(value.bodyRemoteMinDeadlineMs, "body_remote_min_deadline_ms"),
    ) ??
    put(row, "agentSocket", asStr(value.agentSocket, "agent_socket")) ??
    put(row, "vars", parseVars(value.vars));
  return err ?? ok(row);
}

function parseEvents(
  value: unknown,
): NginxMainSettings["events"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_events");
  }
  const row: NonNullable<NginxMainSettings["events"]> = {};
  const err =
    put(row, "workerConnections", asInt(value.workerConnections, "worker_connections", 1)) ??
    put(row, "multiAccept", asBool(value.multiAccept, "multi_accept")) ??
    put(row, "use", asStr(value.use, "events_use"));
  return err ?? row;
}

function parseWorkerProcesses(
  value: unknown,
): NginxMainSettings["workerProcesses"] | undefined | ParseFail {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === "auto") {
    return "auto";
  }
  return asInt(value, "worker_processes", 1);
}

export function parseNginxMain(value: unknown): ParseResult<NginxMainSettings> {
  if (!isRecord(value)) {
    return fail("invalid_nginx_main");
  }
  const row: NginxMainSettings = {};
  const err =
    put(row, "loadModules", asStrList(value.loadModules, "load_modules")) ??
    put(row, "workerProcesses", parseWorkerProcesses(value.workerProcesses)) ??
    put(row, "workerRlimitNofile", asInt(value.workerRlimitNofile, "worker_rlimit_nofile", 1)) ??
    put(row, "user", asStr(value.user, "user")) ??
    put(row, "pid", asStr(value.pid, "pid")) ??
    put(row, "errorLog", asStr(value.errorLog, "error_log")) ??
    put(row, "errorLogShip", asBool(value.errorLogShip, "error_log_ship")) ??
    put(row, "events", parseEvents(value.events)) ??
    put(row, "includes", asStrList(value.includes, "includes"));
  return err ?? ok(row);
}

function parseScoreDeny(
  value: unknown,
  field: string,
): ScoreDeny | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail(`invalid_${field}`);
  }
  const threshold = asNum(value.threshold, `${field}_threshold`);
  if (isFail(threshold)) {
    return threshold;
  }
  if (threshold === undefined) {
    return fail(`invalid_${field}_threshold`);
  }
  const response = asStr(value.response, `${field}_response`);
  if (isFail(response)) {
    return response;
  }
  return response === undefined ? { threshold } : { threshold, response };
}

function parseCookie(
  value: unknown,
): CookieDefaults | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_cookie_defaults");
  }
  const row: CookieDefaults = {};
  const err =
    put(row, "secure", asBool(value.secure, "cookie_secure")) ??
    put(row, "httpOnly", asBool(value.httpOnly, "cookie_http_only")) ??
    put(
      row,
      "sameSite",
      asEnum(value.sameSite, "cookie_same_site", SAME_SITE),
    );
  return err ?? row;
}

const INSPECTOR_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const INSPECTOR_ROLES = ["mandatory", "advisory"] as const;
const INSPECTOR_PLACEMENTS = ["remote", "local"] as const;
const INSPECTOR_PHASES = ["request", "response", "frame"] as const;
const INSPECTOR_STREAMS = ["c2s", "s2c", "both"] as const;

function parseBodyLevel(value: unknown): string | undefined | ParseFail {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return fail("invalid_inspector_body");
  }
  if (
    value === "none" ||
    value === "meta" ||
    value === "full" ||
    value.startsWith("preview=")
  ) {
    return value;
  }
  return fail("invalid_inspector_body");
}

function parseBreaker(
  value: unknown,
): InspectorDecl["breaker"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_inspector_breaker");
  }
  const row: NonNullable<InspectorDecl["breaker"]> = {};
  const err =
    put(row, "enabled", asBool(value.enabled, "inspector_breaker_enabled")) ??
    put(row, "threshold", asNum(value.threshold, "inspector_breaker_threshold")) ??
    put(row, "windowMs", asInt(value.windowMs, "inspector_breaker_window_ms", 1)) ??
    put(row, "probeMs", asInt(value.probeMs, "inspector_breaker_probe_ms", 1));
  if (err) {
    return err;
  }
  if (row.threshold !== undefined && (row.threshold < 0 || row.threshold > 1)) {
    return fail("invalid_inspector_breaker_threshold");
  }
  return Object.keys(row).length === 0 ? undefined : row;
}

function parseInspectorDecl(value: unknown): InspectorDecl | ParseFail {
  if (!isRecord(value)) {
    return fail("invalid_inspector_decl");
  }
  const row: InspectorDecl = {};
  const sample = asNum(value.sample, "inspector_sample");
  if (isFail(sample)) {
    return sample;
  }
  if (sample !== undefined && sample > 1) {
    return fail("invalid_inspector_sample");
  }
  const err =
    put(row, "process", asStr(value.process, "inspector_process")) ??
    put(row, "profile", asStr(value.profile, "inspector_profile")) ??
    put(row, "after", asStrList(value.after, "inspector_after")) ??
    put(row, "timeoutMs", asInt(value.timeoutMs, "inspector_timeout_ms", 1)) ??
    put(row, "needs", asStr(value.needs, "inspector_needs")) ??
    put(row, "body", parseBodyLevel(value.body)) ??
    put(row, "role", asEnum(value.role, "inspector_role", INSPECTOR_ROLES)) ??
    put(
      row,
      "placement",
      asEnum(value.placement, "inspector_placement", INSPECTOR_PLACEMENTS),
    ) ??
    put(row, "audit", asStr(value.audit, "inspector_audit")) ??
    put(row, "breaker", parseBreaker(value.breaker)) ??
    put(row, "vars", parseDeclVars(value.vars)) ??
    put(row, "allowHeaders", asStrList(value.allowHeaders, "inspector_allow_headers")) ??
    put(row, "allowCookies", asStrList(value.allowCookies, "inspector_allow_cookies"));
  if (err) {
    return err;
  }
  if (row.process !== undefined && !INSPECTOR_NAME_RE.test(row.process)) {
    return fail("invalid_inspector_process");
  }
  if (sample !== undefined) {
    row.sample = sample;
  }
  return row;
}

function parseInspectorGraph(
  value: unknown,
): Record<string, InspectorDecl> | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_inspectors");
  }
  const row: Record<string, InspectorDecl> = {};
  for (const [name, decl] of Object.entries(value)) {
    if (!INSPECTOR_NAME_RE.test(name)) {
      return fail("invalid_inspector_name");
    }
    const parsed = parseInspectorDecl(decl);
    if (isFail(parsed)) {
      return parsed;
    }
    row[name] = parsed;
  }
  return row;
}

function parseConds(value: unknown): Cond[] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail("invalid_cond");
  }
  const items: Cond[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return fail("invalid_cond");
    }
    const text = asStr(item.value, "cond_value");
    const dataset = asStr(item.dataset, "cond_dataset");
    const negate = asBool(item.negate, "cond_negate");
    if (isFail(text)) {
      return text;
    }
    if (isFail(dataset)) {
      return dataset;
    }
    if (isFail(negate)) {
      return negate;
    }
    if (text === undefined || dataset === undefined) {
      return fail("invalid_cond");
    }
    const row: Cond = { value: text, dataset };
    if (negate === true) {
      row.negate = true;
    }
    items.push(row);
  }
  return items;
}

function parseInspectorRef(value: unknown): InspectorRef | ParseFail {
  if (!isRecord(value)) {
    return fail("invalid_inspector");
  }
  const name = asStr(value.name, "inspector_name");
  if (isFail(name) || name === undefined) {
    return isFail(name) ? name : fail("invalid_inspector_name");
  }
  const mode = asEnum(value.mode, "inspector_mode", INSPECTOR_MODES);
  if (isFail(mode)) {
    return mode;
  }
  const profile = asStr(value.profile, "inspector_profile");
  if (isFail(profile)) {
    return profile;
  }
  const phase = asEnum(value.phase, "inspector_phase", INSPECTOR_PHASES);
  if (isFail(phase)) {
    return phase;
  }
  const stream = asEnum(value.stream, "inspector_stream", INSPECTOR_STREAMS);
  if (isFail(stream)) {
    return stream;
  }
  const resume = asEnum(value.resume, "inspector_resume", INSPECTOR_RESUMES);
  if (isFail(resume)) {
    return resume;
  }
  const keep = asBool(value.keep, "inspector_keep");
  if (isFail(keep)) {
    return keep;
  }
  const wave = asInt(value.wave, "inspector_wave");
  if (isFail(wave)) {
    return wave;
  }
  if (wave !== undefined && wave > 64) {
    return fail("invalid_inspector_wave");
  }
  const timeoutMs = asInt(value.timeoutMs, "inspector_timeout_ms");
  if (isFail(timeoutMs)) {
    return timeoutMs;
  }
  const conds = parseConds(value.conds);
  if (isFail(conds)) {
    return conds;
  }
  const row: InspectorRef = { name };
  if (conds !== undefined && conds.length > 0) {
    row.conds = conds;
  }
  if (mode !== undefined) {
    row.mode = mode;
  }
  if (profile !== undefined) {
    row.profile = profile;
  }
  if (phase !== undefined) {
    row.phase = phase;
  }
  if (stream !== undefined) {
    row.stream = stream;
  }
  if (resume !== undefined) {
    row.resume = resume;
  }
  if (keep !== undefined) {
    row.keep = keep;
  }
  if (wave !== undefined) {
    row.wave = wave;
  }
  if (timeoutMs !== undefined) {
    row.timeoutMs = timeoutMs;
  }
  return row;
}

function parseInspectorList(
  value: unknown,
  field: string,
): InspectorRef[] | "none" | "all" | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "none" || value === "all") {
    return value;
  }
  if (!Array.isArray(value)) {
    return fail(`invalid_${field}`);
  }
  const items: InspectorRef[] = [];
  for (const item of value) {
    const row = parseInspectorRef(item);
    if (isFail(row)) {
      return row;
    }
    if (row.resume !== undefined && field === "request_inspectors") {
      return fail("resume_on_request");
    }
    if (row.resume !== undefined && field === "frame_inspectors") {
      return fail("resume_on_frame");
    }
    if (row.keep !== undefined && field !== "request_inspectors") {
      return fail("keep_on_consumer");
    }
    items.push(row);
  }
  return items;
}

function parseLocalChecks(
  value: unknown,
): LocalCheck[] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail("invalid_local_checks");
  }
  const items: LocalCheck[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return fail("invalid_local_checks");
    }
    const dataset = asStr(item.dataset, "local_check_dataset");
    const variable = asStr(item.variable, "local_check_variable");
    const action = asEnum(item.action, "local_check_action", [
      "block",
      "allow",
      "wave",
    ] as const);
    const response = asStr(item.response, "local_check_response");
    if (isFail(dataset)) {
      return dataset;
    }
    if (isFail(variable)) {
      return variable;
    }
    if (isFail(action)) {
      return action;
    }
    if (isFail(response)) {
      return response;
    }
    if (dataset === undefined || variable === undefined || action === undefined) {
      return fail("invalid_local_checks");
    }
    if (response !== undefined && action !== "block") {
      return fail("response_only_with_block");
    }
    const conds = parseConds(item.conds);
    if (isFail(conds)) {
      return conds;
    }
    const row: LocalCheck = { dataset, variable, action };
    if (response !== undefined) {
      row.response = response;
    }
    if (conds !== undefined && conds.length > 0) {
      row.conds = conds;
    }
    items.push(row);
  }
  return items;
}

function parseLocalRates(value: unknown): LocalRate[] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail("invalid_local_rates");
  }
  const items: LocalRate[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return fail("invalid_local_rates");
    }
    const key = asStr(item.key, "local_rate_key");
    const rate = asStr(item.rate, "local_rate_rate");
    const burst = asInt(item.burst, "local_rate_burst");
    const count = asEnum(item.count, "local_rate_count", [
      "requests",
      "waves",
      "frames",
    ] as const);
    const action = asEnum(item.action, "local_rate_action", [
      "block",
      "pass",
    ] as const);
    const response = asStr(item.response, "local_rate_response");
    const list = asStr(item.list, "local_rate_list");
    const ttl = asStr(item.ttl, "local_rate_ttl");
    const hash = asBool(item.hash, "local_rate_hash");
    if (
      isFail(key) ||
      isFail(rate) ||
      isFail(burst) ||
      isFail(count) ||
      isFail(action) ||
      isFail(response) ||
      isFail(list) ||
      isFail(ttl) ||
      isFail(hash)
    ) {
      return [key, rate, burst, count, action, response, list, ttl, hash].find(
        isFail,
      ) as ParseFail;
    }
    if (key === undefined || rate === undefined || burst === undefined) {
      return fail("invalid_local_rates");
    }
    const conds = parseConds(item.conds);
    if (isFail(conds)) {
      return conds;
    }
    const row: LocalRate = { key, rate, burst };
    if (conds !== undefined && conds.length > 0) {
      row.conds = conds;
    }
    if (count !== undefined) {
      row.count = count;
    }
    if (action !== undefined) {
      row.action = action;
    }
    if (response !== undefined) {
      row.response = response;
    }
    if (list !== undefined) {
      row.list = list;
    }
    if (ttl !== undefined) {
      row.ttl = ttl;
    }
    if (hash === true) {
      row.hash = true;
    }
    items.push(row);
  }
  return items;
}

function parseModeMap(
  value: unknown,
): Record<string, InspectorMode> | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_inspector_modes");
  }
  const row: Record<string, InspectorMode> = {};
  for (const [name, mode] of Object.entries(value)) {
    const parsed = asEnum(mode, "inspector_mode", INSPECTOR_MODES);
    if (isFail(parsed) || parsed === undefined) {
      return isFail(parsed) ? parsed : fail("invalid_inspector_modes");
    }
    row[name] = parsed;
  }
  return row;
}

function parseProfileMap(
  value: unknown,
): Record<string, string> | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_inspector_profiles");
  }
  const row: Record<string, string> = {};
  for (const [name, profile] of Object.entries(value)) {
    const parsed = asStr(profile, "inspector_profile");
    if (isFail(parsed) || parsed === undefined) {
      return isFail(parsed) ? parsed : fail("invalid_inspector_profiles");
    }
    row[name] = parsed;
  }
  return row;
}

export function parseWaf(value: unknown): ParseResult<WafRouteSettings> {
  if (!isRecord(value)) {
    return fail("invalid_waf");
  }
  const row: WafRouteSettings = {};
  const err =
    put(row, "enabled", asBool(value.enabled, "enabled")) ??
    put(row, "inspectors", parseInspectorGraph(value.inspectors)) ??
    put(row, "requestInspectors", parseInspectorList(value.requestInspectors, "request_inspectors")) ??
    put(row, "responseInspectors", parseInspectorList(value.responseInspectors, "response_inspectors")) ??
    put(row, "frameInspectors", parseInspectorList(value.frameInspectors, "frame_inspectors")) ??
    put(row, "inspectorModes", parseModeMap(value.inspectorModes)) ??
    put(row, "inspectorProfiles", parseProfileMap(value.inspectorProfiles)) ??
    put(row, "deadlineMs", asInt(value.deadlineMs, "deadline_ms", 1)) ??
    put(row, "responseDeadlineMs", asInt(value.responseDeadlineMs, "response_deadline_ms", 1)) ??
    put(row, "responseHold", asEnum(value.responseHold, "response_hold", HOLD_MODES)) ??
    put(row, "frameDeadlineMs", asInt(value.frameDeadlineMs, "frame_deadline_ms", 1)) ??
    put(row, "frameScoreDeny", parseScoreDeny(value.frameScoreDeny, "frame_score_deny")) ??
    put(row, "frameAudit", asEnum(value.frameAudit, "frame_audit", FRAME_AUDIT)) ??
    put(row, "frameAuditSample", asInt(value.frameAuditSample, "frame_audit_sample", 1)) ??
    put(row, "frameReassemble", asBool(value.frameReassemble, "frame_reassemble")) ??
    put(row, "frameControlRate", asStr(value.frameControlRate, "frame_control_rate")) ??
    put(row, "frameCacheTtl", asStr(value.frameCacheTtl, "frame_cache_ttl")) ??
    put(
      row,
      "frameCacheStream",
      asEnum(value.frameCacheStream, "frame_cache_stream", FRAME_CACHE_STREAMS),
    ) ??
    put(row, "requireUpgrade", asBool(value.requireUpgrade, "require_upgrade")) ??
    put(
      row,
      "requireUpgradeResponse",
      asStr(value.requireUpgradeResponse, "require_upgrade_response"),
    ) ??
    put(row, "wsStripExtensions", asStrList(value.wsStripExtensions, "ws_strip_extensions")) ??
    put(row, "exception", asStrList(value.exception, "exception")) ??
    put(row, "denyMode", asEnum(value.denyMode, "deny_mode", DENY_MODES)) ??
    put(row, "scoreDeny", parseScoreDeny(value.scoreDeny, "score_deny")) ??
    put(row, "responseScoreDeny", parseScoreDeny(value.responseScoreDeny, "response_score_deny")) ??
    put(row, "archive", asStrList(value.archive, "archive")) ??
    put(row, "bodyLimit", asStr(value.bodyLimit, "body_limit")) ??
    put(row, "bodyLimitPolicy", asEnum(value.bodyLimitPolicy, "body_limit_policy", BODY_LIMIT)) ??
    put(row, "denyResponseDefault", asStr(value.denyResponseDefault, "deny_response_default")) ??
    put(row, "redirectAllow", asStrList(value.redirectAllow, "redirect_allow")) ??
    put(row, "actionMax", asSize(value.actionMax, "action_max")) ??
    put(row, "actionsMax", asInt(value.actionsMax, "actions_max", 0)) ??
    put(row, "cookieDefaults", parseCookie(value.cookieDefaults)) ??
    put(row, "localChecks", parseLocalChecks(value.localChecks)) ??
    put(row, "localRates", parseLocalRates(value.localRates)) ??
    put(row, "debugHeader", asBool(value.debugHeader, "debug_header")) ??
    put(row, "capture", asStrList(value.capture, "capture")) ??
    put(row, "preview", asStrList(value.preview, "preview")) ??
    put(row, "send", asStrList(value.send, "send"));
  return err ?? ok(row);
}

function parseBuffers(
  value: unknown,
): NginxHttpSettings["largeClientHeaderBuffers"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("invalid_large_client_header_buffers");
  }
  const count = asInt(value.count, "large_header_count", 1);
  const size = asStr(value.size, "large_header_size");
  if (isFail(count)) {
    return count;
  }
  if (isFail(size)) {
    return size;
  }
  if (count === undefined || size === undefined) {
    return fail("invalid_large_client_header_buffers");
  }
  return { count, size };
}

function parseAddHeaders(
  value: unknown,
): NginxHttpSettings["addHeaders"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail("invalid_add_headers");
  }
  const items: NonNullable<NginxHttpSettings["addHeaders"]> = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return fail("invalid_add_headers");
    }
    const name = asStr(item.name, "add_header_name");
    const headerValue = asStr(item.value, "add_header_value");
    const always = asBool(item.always, "add_header_always");
    if (isFail(name) || isFail(headerValue) || isFail(always)) {
      return [name, headerValue, always].find(isFail) as ParseFail;
    }
    if (name === undefined || headerValue === undefined) {
      return fail("invalid_add_headers");
    }
    const row: { name: string; value: string; always?: boolean } = {
      name,
      value: headerValue,
    };
    if (always !== undefined) {
      row.always = always;
    }
    items.push(row);
  }
  return items;
}

export function parseNginx(value: unknown): ParseResult<NginxHttpSettings> {
  if (!isRecord(value)) {
    return fail("invalid_nginx");
  }
  const row: NginxHttpSettings = {};
  const err =
    put(row, "sendfile", asBool(value.sendfile, "sendfile")) ??
    put(row, "tcpNopush", asBool(value.tcpNopush, "tcp_nopush")) ??
    put(row, "tcpNodelay", asBool(value.tcpNodelay, "tcp_nodelay")) ??
    put(row, "keepaliveTimeoutS", asInt(value.keepaliveTimeoutS, "keepalive_timeout_s")) ??
    put(row, "keepaliveRequests", asInt(value.keepaliveRequests, "keepalive_requests", 1)) ??
    put(row, "keepaliveTimeS", asInt(value.keepaliveTimeS, "keepalive_time_s")) ??
    put(row, "clientMaxBodySize", asStr(value.clientMaxBodySize, "client_max_body_size")) ??
    put(row, "clientHeaderTimeoutMs", asInt(value.clientHeaderTimeoutMs, "client_header_timeout_ms")) ??
    put(row, "clientBodyTimeoutMs", asInt(value.clientBodyTimeoutMs, "client_body_timeout_ms")) ??
    put(row, "sendTimeoutMs", asInt(value.sendTimeoutMs, "send_timeout_ms")) ??
    put(row, "clientHeaderBufferSize", asStr(value.clientHeaderBufferSize, "client_header_buffer_size")) ??
    put(row, "clientBodyBufferSize", asStr(value.clientBodyBufferSize, "client_body_buffer_size")) ??
    put(row, "clientBodyTempPath", asTempPath(value.clientBodyTempPath, "client_body_temp_path")) ??
    put(row, "largeClientHeaderBuffers", parseBuffers(value.largeClientHeaderBuffers)) ??
    put(row, "defaultType", asStr(value.defaultType, "default_type")) ??
    put(row, "underscoresInHeaders", asBool(value.underscoresInHeaders, "underscores_in_headers")) ??
    put(row, "ignoreInvalidHeaders", asBool(value.ignoreInvalidHeaders, "ignore_invalid_headers")) ??
    put(row, "mergeSlashes", asBool(value.mergeSlashes, "merge_slashes")) ??
    put(row, "serverTokens", asBool(value.serverTokens, "server_tokens")) ??
    put(row, "serverNamesHashBucketSize", asStr(value.serverNamesHashBucketSize, "server_names_hash_bucket_size")) ??
    put(row, "serverNamesHashMaxSize", asStr(value.serverNamesHashMaxSize, "server_names_hash_max_size")) ??
    put(row, "typesHashBucketSize", asStr(value.typesHashBucketSize, "types_hash_bucket_size")) ??
    put(row, "typesHashMaxSize", asStr(value.typesHashMaxSize, "types_hash_max_size")) ??
    put(row, "resolver", asStrList(value.resolver, "resolver")) ??
    put(row, "resolverTimeoutMs", asInt(value.resolverTimeoutMs, "resolver_timeout_ms")) ??
    put(row, "realIpFrom", asStrList(value.realIpFrom, "real_ip_from")) ??
    put(row, "realIpHeader", asStr(value.realIpHeader, "real_ip_header")) ??
    put(row, "realIpRecursive", asBool(value.realIpRecursive, "real_ip_recursive")) ??
    put(row, "resetTimedoutConnection", asBool(value.resetTimedoutConnection, "reset_timedout_connection")) ??
    put(row, "lingeringClose", asEnum(value.lingeringClose, "lingering_close", LINGERING)) ??
    put(row, "lingeringTimeMs", asInt(value.lingeringTimeMs, "lingering_time_ms")) ??
    put(row, "lingeringTimeoutMs", asInt(value.lingeringTimeoutMs, "lingering_timeout_ms")) ??
    put(row, "gzip", asBool(value.gzip, "gzip")) ??
    put(row, "gzipTypes", asStrList(value.gzipTypes, "gzip_types")) ??
    put(row, "gzipCompLevel", asInt(value.gzipCompLevel, "gzip_comp_level", 1)) ??
    put(row, "gzipMinLength", asInt(value.gzipMinLength, "gzip_min_length")) ??
    put(row, "gzipVary", asBool(value.gzipVary, "gzip_vary")) ??
    put(row, "sslProtocols", asStrList(value.sslProtocols, "ssl_protocols")) ??
    put(row, "sslCiphers", asStr(value.sslCiphers, "ssl_ciphers")) ??
    put(row, "sslPreferServerCiphers", asBool(value.sslPreferServerCiphers, "ssl_prefer_server_ciphers")) ??
    put(row, "sslSessionCache", asStr(value.sslSessionCache, "ssl_session_cache")) ??
    put(row, "sslSessionTimeout", asStr(value.sslSessionTimeout, "ssl_session_timeout")) ??
    put(
      row,
      "proxyHttpVersion",
      asEnum(value.proxyHttpVersion, "proxy_http_version", ["1.0", "1.1"] as const),
    ) ??
    put(
      row,
      "proxyHeaders",
      asEnum(value.proxyHeaders, "proxy_headers", PROXY_HEADERS) as
        | ProxyHeaderPreset
        | undefined
        | ParseFail,
    ) ??
    put(row, "addHeaders", parseAddHeaders(value.addHeaders)) ??
    put(row, "accessLog", parseAccessLog(value.accessLog)) ??
    put(row, "errorLog", parseErrorLog(value.errorLog)) ??
    put(row, "includes", asStrList(value.includes, "includes"));
  return err ?? ok(row);
}


function parseAccessLog(value: unknown): AccessLog | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const tail = value.trim();
    if (tail === "") {
      return undefined;
    }
    const parsed = parseAccessLogTail(tail);
    if (parsed === undefined) {
      return fail("invalid_access_log");
    }
    return parsed === "off" ? "off" : [parsed];
  }
  if (!Array.isArray(value)) {
    return fail("invalid_access_log");
  }
  const rows: AccessLogEntry[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const parsed = parseAccessLogTail(item);
      if (parsed === undefined || parsed === "off") {
        return fail("invalid_access_log");
      }
      rows.push(parsed);
      continue;
    }
    if (!isRecord(item)) {
      return fail("invalid_access_log");
    }
    const path = asStr(item.path, "access_log_path");
    const format = asStr(item.format, "access_log_format");
    const condition = asStr(item.condition, "access_log_if");
    const buffer = asStr(item.buffer, "access_log_buffer");
    const flush = asStr(item.flush, "access_log_flush");
    const gzip = asInt(item.gzip, "access_log_gzip", 1);
    const bad = [path, format, condition, buffer, flush, gzip].find(isFail);
    if (bad !== undefined) {
      return bad as ParseFail;
    }
    if (path === undefined) {
      return fail("invalid_access_log");
    }
    const row: AccessLogEntry = { path: path as string };
    if (format !== undefined) row.format = format as string;
    if (condition !== undefined) row.condition = condition as string;
    if (buffer !== undefined) row.buffer = buffer as string;
    if (flush !== undefined) row.flush = flush as string;
    if (gzip !== undefined) row.gzip = gzip as number;
    rows.push(row);
  }
  return rows;
}

function parseErrorLog(value: unknown): ErrorLog | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const tail = value.trim();
    if (tail === "") {
      return undefined;
    }
    const parsed = parseErrorLogTail(tail);
    return parsed === undefined ? fail("invalid_error_log") : parsed;
  }
  if (!isRecord(value)) {
    return fail("invalid_error_log");
  }
  const path = asStr(value.path, "error_log_path");
  if (isFail(path)) {
    return path;
  }
  if (path === undefined) {
    return fail("invalid_error_log");
  }
  const level = asStr(value.level, "error_log_level");
  if (isFail(level)) {
    return level;
  }
  if (level === undefined) {
    return { path };
  }
  if (!isErrorLogLevel(level)) {
    return fail("invalid_error_log_level");
  }
  return { path, level };
}

function parseSetHeaders(
  value: unknown,
): NginxLocationSettings["proxySetHeaders"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail("invalid_proxy_set_headers");
  }
  const items: NonNullable<NginxLocationSettings["proxySetHeaders"]> = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return fail("invalid_proxy_set_headers");
    }
    const name = asStr(item.name, "proxy_set_header_name");
    const headerValue = asStr(item.value, "proxy_set_header_value");
    if (isFail(name) || isFail(headerValue)) {
      return [name, headerValue].find(isFail) as ParseFail;
    }
    if (name === undefined || headerValue === undefined) {
      return fail("invalid_proxy_set_headers");
    }
    items.push({ name, value: headerValue });
  }
  return items;
}

function parseErrorPages(
  value: unknown,
): NginxServerSettings["errorPages"] | undefined | ParseFail {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return fail("invalid_error_pages");
  }
  const items: NonNullable<NginxServerSettings["errorPages"]> = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return fail("invalid_error_pages");
    }
    const codes = asIntList(item.codes, "error_page_codes");
    const status = asInt(item.status, "error_page_status", 100);
    const target = asStr(item.target, "error_page_target");
    if (isFail(codes) || isFail(status) || isFail(target)) {
      return [codes, status, target].find(isFail) as ParseFail;
    }
    if (codes === undefined || codes.length === 0 || target === undefined) {
      return fail("invalid_error_pages");
    }
    const row: { codes: number[]; status?: number; target: string } = { codes, target };
    if (status !== undefined) {
      row.status = status;
    }
    items.push(row);
  }
  return items;
}

export function parseNginxServer(
  value: unknown,
): ParseResult<NginxServerSettings> {
  if (!isRecord(value)) {
    return fail("invalid_nginx");
  }
  const row: NginxServerSettings = {};
  const err =
    put(row, "clientMaxBodySize", asStr(value.clientMaxBodySize, "client_max_body_size")) ??
    put(row, "root", asStr(value.root, "root")) ??
    put(row, "charset", asStr(value.charset, "charset")) ??
    put(row, "httpsRedirect", asBool(value.httpsRedirect, "https_redirect")) ??
    put(row, "sslProtocols", asStrList(value.sslProtocols, "ssl_protocols")) ??
    put(row, "sslCiphers", asStr(value.sslCiphers, "ssl_ciphers")) ??
    put(
      row,
      "sslPreferServerCiphers",
      asBool(value.sslPreferServerCiphers, "ssl_prefer_server_ciphers"),
    ) ??
    put(row, "sslSessionCache", asStr(value.sslSessionCache, "ssl_session_cache")) ??
    put(row, "sslSessionTimeout", asStr(value.sslSessionTimeout, "ssl_session_timeout")) ??
    put(
      row,
      "sslVerifyClient",
      asEnum(value.sslVerifyClient, "ssl_verify_client", SSL_VERIFY),
    ) ??
    put(row, "sslVerifyDepth", asInt(value.sslVerifyDepth, "ssl_verify_depth", 1)) ??
    put(row, "realIpFrom", asStrList(value.realIpFrom, "real_ip_from")) ??
    put(row, "realIpHeader", asStr(value.realIpHeader, "real_ip_header")) ??
    put(row, "realIpRecursive", asBool(value.realIpRecursive, "real_ip_recursive")) ??
    put(row, "gzip", asBool(value.gzip, "gzip")) ??
    put(row, "gzipTypes", asStrList(value.gzipTypes, "gzip_types")) ??
    put(row, "gzipCompLevel", asInt(value.gzipCompLevel, "gzip_comp_level", 1)) ??
    put(row, "gzipMinLength", asInt(value.gzipMinLength, "gzip_min_length")) ??
    put(row, "gzipVary", asBool(value.gzipVary, "gzip_vary")) ??
    put(row, "accessLog", parseAccessLog(value.accessLog)) ??
    put(row, "errorLog", parseErrorLog(value.errorLog)) ??
    put(row, "addHeaders", parseAddHeaders(value.addHeaders)) ??
    put(row, "errorPages", parseErrorPages(value.errorPages));
  return err ?? ok(row);
}

export function parseNginxLocation(
  value: unknown,
): ParseResult<NginxLocationSettings> {
  if (!isRecord(value)) {
    return fail("invalid_nginx");
  }
  const row: NginxLocationSettings = {};
  const err =
    put(row, "clientMaxBodySize", asStr(value.clientMaxBodySize, "client_max_body_size")) ??
    put(row, "root", asStr(value.root, "root")) ??
    put(row, "alias", asStr(value.alias, "alias")) ??
    put(row, "index", asStrList(value.index, "index")) ??
    put(row, "tryFiles", asStrList(value.tryFiles, "try_files")) ??
    put(row, "allow", asStrList(value.allow, "allow")) ??
    put(row, "deny", asStrList(value.deny, "deny")) ??
    put(row, "internal", asBool(value.internal, "internal")) ??
    put(row, "ssi", asBool(value.ssi, "ssi")) ??
    put(row, "ssiTypes", asStrList(value.ssiTypes, "ssi_types")) ??
    put(row, "role", asEnum(value.role, "role", LOCATION_ROLES)) ??
    put(row, "addHeaders", parseAddHeaders(value.addHeaders)) ??
    put(
      row,
      "proxyConnectTimeoutMs",
      asInt(value.proxyConnectTimeoutMs, "proxy_connect_timeout_ms"),
    ) ??
    put(row, "proxyReadTimeoutMs", asInt(value.proxyReadTimeoutMs, "proxy_read_timeout_ms")) ??
    put(row, "proxySendTimeoutMs", asInt(value.proxySendTimeoutMs, "proxy_send_timeout_ms")) ??
    put(row, "proxyBuffering", asBool(value.proxyBuffering, "proxy_buffering")) ??
    put(
      row,
      "proxyRequestBuffering",
      asBool(value.proxyRequestBuffering, "proxy_request_buffering"),
    ) ??
    put(
      row,
      "proxyHttpVersion",
      asEnum(value.proxyHttpVersion, "proxy_http_version", ["1.0", "1.1"] as const),
    ) ??
    put(
      row,
      "proxyHeaders",
      asEnum(value.proxyHeaders, "proxy_headers", PROXY_HEADERS_LOC),
    ) ??
    put(row, "proxySetHeaders", parseSetHeaders(value.proxySetHeaders)) ??
    put(row, "realIpFrom", asStrList(value.realIpFrom, "real_ip_from")) ??
    put(row, "realIpHeader", asStr(value.realIpHeader, "real_ip_header")) ??
    put(row, "realIpRecursive", asBool(value.realIpRecursive, "real_ip_recursive")) ??
    put(row, "gzip", asBool(value.gzip, "gzip")) ??
    put(row, "gzipTypes", asStrList(value.gzipTypes, "gzip_types")) ??
    put(row, "gzipCompLevel", asInt(value.gzipCompLevel, "gzip_comp_level", 1)) ??
    put(row, "gzipMinLength", asInt(value.gzipMinLength, "gzip_min_length")) ??
    put(row, "gzipVary", asBool(value.gzipVary, "gzip_vary")) ??
    put(row, "accessLog", parseAccessLog(value.accessLog)) ??
    put(row, "errorLog", parseErrorLog(value.errorLog));
  return err ?? ok(row);
}

export function parseRawPair(
  raw: unknown,
  text: unknown,
): ParseResult<{ raw: boolean; rawNginx: string } | undefined> {
  if (raw === undefined && text === undefined) {
    return ok(undefined);
  }
  if (raw !== undefined && typeof raw !== "boolean") {
    return fail("invalid_raw");
  }
  if (text !== undefined && typeof text !== "string") {
    return fail("invalid_raw_nginx");
  }
  const rawNginx = typeof text === "string" ? text : "";
  if (/BEGIN ([A-Z]+ )?PRIVATE KEY/.test(rawNginx)) {
    return fail("raw_has_secret");
  }
  return ok({
    raw: typeof raw === "boolean" ? raw : false,
    rawNginx,
  });
}

export function parseSpaceHttpBody(body: unknown): ParseResult<SpaceHttpPatch> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  let nginxMain: NginxMainSettings | undefined;
  if (body.nginx_main !== undefined) {
    const parsed = parseNginxMain(body.nginx_main);
    if (!parsed.ok) {
      return parsed;
    }
    nginxMain = parsed.value;
  }
  const nginx = parseNginx(body.nginx);
  if (!nginx.ok) {
    return nginx;
  }
  const wafHttp = parseWafHttp(body.waf_http);
  if (!wafHttp.ok) {
    return wafHttp;
  }
  const waf = parseWaf(body.waf);
  if (!waf.ok) {
    return waf;
  }
  if (typeof body.raw !== "boolean") {
    return fail("invalid_raw");
  }
  if (typeof body.raw_nginx !== "string") {
    return fail("invalid_raw_nginx");
  }
  return ok({
    nginxMain,
    nginx: nginx.value,
    wafHttp: wafHttp.value,
    waf: waf.value,
    raw: body.raw,
    rawNginx: body.raw_nginx,
  });
}
