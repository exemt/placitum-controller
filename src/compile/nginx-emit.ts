import { wavesFromAfter } from "../inspector-graph.ts";
import type { Inspector } from "../model/http-space.ts";
import { accessLogTails, errorLogTail } from "../model/log.ts";
import type {
  Cond,
  CookieDefaults,
  InspectorDecl,
  InspectorMode,
  InspectorPhase,
  InspectorRef,
  LocalCheck,
  LocalRate,
  ScoreDeny,
  WafRouteSettings,
} from "../model/waf-route.ts";

export interface ProxyHeader {
  name: string;
  value: string;
}

const STANDARD_HEADERS: readonly ProxyHeader[] = [
  { name: "Host", value: "$host" },
  { name: "X-Forwarded-For", value: "$proxy_add_x_forwarded_for" },
  { name: "X-Forwarded-Proto", value: "$scheme" },
];

export function presetProxyHeaders(preset: string | undefined): ProxyHeader[] {
  switch (preset) {
    case "standard":
      return [...STANDARD_HEADERS];
    case "websocket":
      return [
        ...STANDARD_HEADERS,
        { name: "Upgrade", value: "$http_upgrade" },
        { name: "Connection", value: "$connection_upgrade" },
      ];
    default:
      return [];
  }
}

export function putProxyHeader(rows: ProxyHeader[], header: ProxyHeader): void {
  const at = rows.findIndex(
    (row) => row.name.toLowerCase() === header.name.toLowerCase(),
  );
  if (at === -1) {
    rows.push(header);
  } else {
    rows[at] = header;
  }
}

export function proxyVersionFor(
  version: string | undefined,
  preset: string | undefined,
): string | undefined {
  return version ?? (preset === "websocket" ? "1.1" : undefined);
}

export interface NginxCompileResult {
  text: string;
  storeRefs: string[];
}

export class WafCompileError extends Error {
  readonly code: string;
  readonly params?: Record<string, string | number>;

  constructor(code: string, message: string, params?: Record<string, string | number>) {
    super(message);
    this.code = code;
    this.name = "WafCompileError";
    if (params !== undefined) {
      this.params = params;
    }
  }
}

export interface StoreRefs {
  path(uuid: string): string;
  scan(text: string): void;
}

export function createStoreRefs(storeRefs: string[]): StoreRefs {
  return {
    path(uuid: string): string {
      if (!storeRefs.includes(uuid)) {
        storeRefs.push(uuid);
      }
      return `store:${uuid}`;
    },
    scan(text: string): void {
      extractStoreRefs(text, storeRefs);
    },
  };
}

export function nestStore(local: string[], parent?: StoreRefs): StoreRefs {
  const own = createStoreRefs(local);
  if (!parent) return own;
  return {
    path(uuid: string): string {
      own.path(uuid);
      return parent.path(uuid);
    },
    scan(text: string): void {
      own.scan(text);
      parent.scan(text);
    },
  };
}

export function appendBlock(lines: string[], text: string): void {
  lines.push(text.endsWith("\n") ? text.slice(0, -1) : text);
}

export type NestedBlocks = "print" | "include";

export function includeStub(
  kind: "upstream" | "server" | "location",
  id: string,
  title: string,
  enabled = true,
): string {
  const line = `include ${kind}s/${id}.conf;  # ${title}`;
  return enabled ? line : `# ${line} (off)`;
}

export type RouteLevel = "http" | "server" | "location";

export const HTTP_WAF_KEYS = new Set(["inspectors", "inspectorProfiles"]);

export function routeKeysAtHttp(waf: WafRouteSettings | undefined): string[] {
  if (!waf) return [];
  return Object.keys(waf).filter(
    (key) => !HTTP_WAF_KEYS.has(key) && (waf as Record<string, unknown>)[key] !== undefined,
  );
}

export function emitWafRoute(
  lines: string[],
  waf: WafRouteSettings,
  inspectors: Inspector[],
  indent = 1,
  graph: Record<string, InspectorDecl> = {},
  level: RouteLevel = "http",
): void {
  if (!waf) return;

  if (level === "http") {
    return;
  }

  const p = "    ".repeat(indent);

  if (waf.enabled !== undefined) {
    lines.push(`${p}waf ${waf.enabled ? "on" : "off"};`);
  }
  emitDeadline(lines, p, "request", waf.deadlineMs);
  emitDeadline(lines, p, "response", waf.responseDeadlineMs);
  emitDeadline(lines, p, "frame", waf.frameDeadlineMs);
  if (waf.responseHold) {
    lines.push(`${p}waf_hold response ${waf.responseHold};`);
  }
  if (waf.denyMode) lines.push(`${p}waf_deny_mode request ${waf.denyMode};`);
  emitTails(lines, p, "waf_exception", waf.exception);

  emitScoreDeny(lines, "request", waf.scoreDeny, p);
  emitScoreDeny(lines, "response", waf.responseScoreDeny, p);
  emitScoreDeny(lines, "frame", waf.frameScoreDeny, p);
  emitSend(lines, p, waf.send);
  emitHandshake(lines, waf, p);
  emitFrameAudit(lines, waf, p);
  emitFrameExtras(lines, waf, p);

  if (waf.denyResponseDefault) {
    lines.push(`${p}waf_deny_response_default ${waf.denyResponseDefault};`);
  }

  if (waf.actionMax) lines.push(`${p}waf_action_max ${waf.actionMax};`);
  if (waf.actionsMax !== undefined) {
    lines.push(`${p}waf_actions_max ${waf.actionsMax};`);
  }
  if (waf.bodyLimit) {
    const policy = waf.bodyLimitPolicy ? ` ${waf.bodyLimitPolicy}` : "";
    const { phase, rest } = splitPhase(
      `${waf.bodyLimit}${policy}`,
      "waf_body_limit",
    );

    lines.push(`${p}waf_body_limit ${phase} ${rest};`);
  }
  emitTailsPhased(lines, p, "waf_archive", waf.archive);
  emitTailsPhased(lines, p, "waf_preview", waf.preview);

  if (waf.redirectAllow && waf.redirectAllow.length > 0) {
    lines.push(`${p}waf_redirect_allow ${waf.redirectAllow.join(" ")};`);
  }

  emitCookieDefaults(lines, waf.cookieDefaults, p);

  if (waf.debugHeader !== undefined) {
    lines.push(`${p}waf_debug_header ${waf.debugHeader ? "on" : "off"};`);
  }

  emitInspects(lines, waf, graph, inspectors, p);

  if (waf.capture !== undefined) {
    emitCapture(lines, waf.capture, p);
  }

  emitLocalChecks(lines, waf.localChecks, p);
  emitLocalRates(lines, waf.localRates, p);
}

function emitHandshake(lines: string[], waf: WafRouteSettings, p: string): void {
  if (waf.requireUpgrade !== undefined) {
    const resp =
      waf.requireUpgrade && waf.requireUpgradeResponse
        ? ` response=${waf.requireUpgradeResponse}`
        : "";
    lines.push(`${p}waf_require_upgrade ${waf.requireUpgrade ? "on" : "off"}${resp};`);
  }
  if (waf.wsStripExtensions !== undefined) {
    const words = waf.wsStripExtensions.length === 0 ? "off" : waf.wsStripExtensions.join(" ");
    lines.push(`${p}waf_ws_strip_extensions ${words};`);
  }
}

function emitFrameAudit(lines: string[], waf: WafRouteSettings, p: string): void {
  if (waf.frameAudit === undefined) {
    return;
  }
  const sample =
    waf.frameAudit === "all" && waf.frameAuditSample !== undefined && waf.frameAuditSample > 1
      ? ` sample=${waf.frameAuditSample}`
      : "";
  lines.push(`${p}waf_audit_frames ${waf.frameAudit}${sample};`);
}

function emitFrameExtras(lines: string[], waf: WafRouteSettings, p: string): void {
  if (waf.frameReassemble !== undefined) {
    lines.push(`${p}waf_frame_reassemble ${waf.frameReassemble ? "on" : "off"};`);
  }
  if (waf.frameControlRate !== undefined && waf.frameControlRate !== "") {
    lines.push(`${p}waf_frame_control_rate ${waf.frameControlRate};`);
  }
  if (waf.frameCacheTtl !== undefined && waf.frameCacheTtl !== "") {
    const stream = waf.frameCacheStream ?? "both";
    const phase = stream === "both" ? "frame" : `frame:${stream}`;
    lines.push(`${p}waf_frame_cache ${phase} ttl=${waf.frameCacheTtl};`);
  }
}

export type TailPhase = "request" | "response" | "frame:c2s" | "frame:s2c" | "frame";

const FRAME_TAIL_PHASES: readonly TailPhase[] = ["frame:c2s", "frame:s2c", "frame"];

export function splitPhase(tail: string, name: string): { phase: TailPhase; rest: string } {
  const t = tail.trim();
  const first = t.split(/\s+/, 1)[0] ?? "";
  if (first === "frame:c2s" || first === "frame:s2c" || first === "frame") {
    return { phase: first, rest: t.slice(first.length).trim() };
  }
  if (first.startsWith("frame")) {
    throw new WafCompileError(
      "phase_unknown",
      `${name} ${first}: write frame, frame:c2s or frame:s2c`,
    );
  }
  if (first === "request" || first === "response") {
    return { phase: first, rest: t.slice(first.length).trim() };
  }
  return { phase: "request", rest: t };
}

const TAIL_PHASES: readonly TailPhase[] = ["request", "response"];

function emitCapture(lines: string[], items: string[], p: string): void {
  if (items.length === 0) {
    for (const phase of TAIL_PHASES) {
      lines.push(`${p}waf_capture ${phase} none;`);
    }
    return;
  }

  for (const phase of [...TAIL_PHASES, ...FRAME_TAIL_PHASES]) {
    const objects: string[] = [];
    const lists: string[] = [];
    let off = false;

    for (const item of items) {
      const row = splitPhase(item, "waf_capture");
      if (row.phase !== phase || row.rest === "") continue;
      if (row.rest === "off" || row.rest === "none") {
        off = true;
      } else if (/^(headers|args)\s+(mask|deny)=/.test(row.rest)) {
        lists.push(row.rest);
      } else {
        objects.push(row.rest);
      }
    }

    if (off) {
      lines.push(`${p}waf_capture ${phase} none;`);
      continue;
    }
    if (objects.length > 0) {
      lines.push(`${p}waf_capture ${phase} ${objects.join(" ")};`);
    }
    for (const list of lists) {
      lines.push(`${p}waf_capture ${phase} ${list};`);
    }
  }
}

export function emitLogs(
  lines: string[],
  nginx: { accessLog?: unknown; errorLog?: unknown },
  p: string,
): void {
  for (const tail of accessLogTails(nginx.accessLog)) {
    lines.push(`${p}access_log ${tail};`);
  }
  const err = errorLogTail(nginx.errorLog);
  if (err !== undefined) {
    lines.push(`${p}error_log ${err};`);
  }
}

export function emitGzip(
  lines: string[],
  nginx: {
    gzip?: boolean;
    gzipTypes?: string[];
    gzipCompLevel?: number;
    gzipMinLength?: number;
    gzipVary?: boolean;
  },
  p: string,
): void {
  if (nginx.gzip !== undefined) {
    lines.push(`${p}gzip ${nginx.gzip ? "on" : "off"};`);
  }
  if (typeof nginx.gzipCompLevel === "number") {
    lines.push(`${p}gzip_comp_level ${nginx.gzipCompLevel};`);
  }
  if (typeof nginx.gzipMinLength === "number") {
    lines.push(`${p}gzip_min_length ${nginx.gzipMinLength};`);
  }
  if (nginx.gzipVary !== undefined) {
    lines.push(`${p}gzip_vary ${nginx.gzipVary ? "on" : "off"};`);
  }
  if (nginx.gzipTypes && nginx.gzipTypes.length > 0) {
    lines.push(`${p}gzip_types ${nginx.gzipTypes.join(" ")};`);
  }
}

export function emitRealIp(
  lines: string[],
  nginx: { realIpFrom?: string[]; realIpHeader?: string; realIpRecursive?: boolean },
  p: string,
): void {
  if (nginx.realIpFrom) {
    for (const net of nginx.realIpFrom) {
      lines.push(`${p}set_real_ip_from ${net};`);
    }
  }
  if (nginx.realIpHeader) {
    lines.push(`${p}real_ip_header ${nginx.realIpHeader};`);
  }
  if (nginx.realIpRecursive !== undefined) {
    lines.push(`${p}real_ip_recursive ${nginx.realIpRecursive ? "on" : "off"};`);
  }
}

export function durationMs(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

export function ind(lines: string[], text: string, level = 1): void {
  lines.push("    ".repeat(level) + text);
}

export function optStr(lines: string[], name: string, value: string | undefined | null): void {
  if (value) ind(lines, `${name} ${value};`);
}

export function emitDeadline(
  lines: string[],
  p: string,
  phase: InspectorPhase | "frame:c2s",
  ms: number | undefined,
): void {
  if (typeof ms !== "number") return;
  lines.push(`${p}waf_deadline ${phase} ${ms}ms;`);
}

export function emitTails(lines: string[], p: string, name: string, tails: string[] | undefined): void {
  for (const tail of tails ?? []) {
    if (tail) lines.push(`${p}${name} ${tail};`);
  }
}

function emitTailsPhased(
  lines: string[],
  p: string,
  name: string,
  tails: string[] | undefined,
): void {
  if (tails !== undefined && tails.length === 0) {
    for (const phase of TAIL_PHASES) {
      lines.push(`${p}${name} ${phase} none;`);
    }
    return;
  }
  for (const tail of tails ?? []) {
    if (!tail.trim()) continue;
    const { phase, rest } = splitPhase(tail, name);
    lines.push(`${p}${name} ${phase} ${rest};`);
  }
}

function emitSend(lines: string[], p: string, tails: string[] | undefined): void {
  for (const tail of tails ?? []) {
    if (!tail.trim()) continue;
    const { phase, rest } = splitPhase(tail, "waf_send");
    lines.push(`${p}waf_send ${phase} ${rest};`);
  }
}

export function optNum(
  lines: string[],
  name: string,
  value: number | undefined | null,
  suffix = "",
): void {
  if (typeof value === "number") ind(lines, `${name} ${value}${suffix};`);
}

export function optFlag(lines: string[], name: string, value: boolean | undefined | null): void {
  if (value === true) ind(lines, `${name} on;`);
  else if (value === false) ind(lines, `${name} off;`);
}

export function indentBlock(text: string, level: number): string {
  const p = "    ".repeat(level);
  return text
    .split("\n")
    .map(line => (line.trim() === "" ? "" : p + line))
    .join("\n");
}

const STORE_RE = /store:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

export function extractStoreRefs(text: string, refs: string[]): void {
  for (const m of text.matchAll(STORE_RE)) {
    const uuid = m[1].toLowerCase();
    if (!refs.includes(uuid)) {
      refs.push(uuid);
    }
  }
}

function emitScoreDeny(
  lines: string[],
  phase: InspectorPhase | "frame:c2s",
  score: ScoreDeny | undefined,
  p: string,
): void {
  if (!score || typeof score.threshold !== "number") return;
  const resp = score.response ? ` response=${score.response}` : "";
  lines.push(`${p}waf_score_deny ${phase} ${score.threshold}${resp};`);
}

function emitCookieDefaults(lines: string[], cookie: CookieDefaults | undefined, p: string): void {
  if (!cookie) return;
  const opts: string[] = [];
  if (cookie.secure === true) opts.push("secure=on");
  else if (cookie.secure === false) opts.push("secure=off");
  if (cookie.httpOnly === true) opts.push("http_only=on");
  else if (cookie.httpOnly === false) opts.push("http_only=off");
  if (cookie.sameSite) opts.push(`same_site=${cookie.sameSite}`);
  if (opts.length > 0) {
    lines.push(`${p}waf_cookie_defaults ${opts.join(" ")};`);
  }
}

type PhaseList = InspectorRef[] | "none" | "all" | undefined;

function expandInspects(
  list: PhaseList,
  phase: InspectorPhase,
  graph: Record<string, InspectorDecl>,
  inspectors: Inspector[],
): InspectorRef[] | "none" | undefined {
  if (list === undefined) {
    return undefined;
  }
  if (list === "none" || (Array.isArray(list) && list.length === 0)) {
    return "none";
  }
  if (list === "all") {
    const byName = new Map(inspectors.map((row) => [row.name, row]));
    return Object.keys(graph)
      .filter((name) => {
        const row = byName.get(graph[name]?.process ?? name);
        return (row?.phases ?? ["request"]).includes(phase);
      })
      .map((name) => ({ name, phase }));
  }
  return list.map((ref) => (ref.phase ? ref : { ...ref, phase }));
}

function emitInspects(
  lines: string[],
  waf: WafRouteSettings,
  graph: Record<string, InspectorDecl>,
  inspectors: Inspector[],
  p: string,
): void {
  const req = expandInspects(waf.requestInspectors, "request", graph, inspectors);
  const rsp = expandInspects(waf.responseInspectors, "response", graph, inspectors);
  const frm = expandInspects(waf.frameInspectors, "frame", graph, inspectors);

  if (req === undefined && rsp === undefined && frm === undefined) {
    return;
  }

  const rows: InspectorRef[] = [];
  if (Array.isArray(req)) {
    rows.push(...req);
  }
  if (Array.isArray(rsp)) {
    rows.push(...rsp);
  }
  if (Array.isArray(frm)) {
    rows.push(...frm);
  }

  const afterOf = (name: string) => graph[name]?.after ?? [];
  const wavesOf = (phase: InspectorPhase) =>
    wavesFromAfter(
      rows.filter((r) => (r.phase ?? "request") === phase).map((r) => r.name),
      afterOf,
    );
  const waves = {
    request: wavesOf("request"),
    response: wavesOf("response"),
    frame: wavesOf("frame"),
  };

  for (const ref of rows) {
    const decl = graph[ref.name] ?? {};
    const mode: InspectorMode | undefined =
      ref.mode ??
      waf.inspectorModes?.[ref.name] ??
      (decl.role === "advisory" ? "passive" : undefined);
    if (mode === "ignore") {
      continue;
    }

    const phase = ref.phase ?? "request";
    const wave = ref.wave ?? waves[phase].get(ref.name) ?? 0;
    const timeoutMs = ref.timeoutMs ?? decl.timeoutMs;

    const parts = [phase === "frame" ? frameWord(ref.stream) : phase, ref.name, `wave=${wave}`];
    if (typeof timeoutMs === "number") {
      parts.push(`timeout=${timeoutMs}ms`);
    }
    if (mode && mode !== "active") {
      parts.push(`mode=${mode}`);
    }
    if (ref.keep === true && phase === "request") {
      parts.push("keep=on");
    }
    if (ref.resume && ref.resume !== "off" && phase === "response") {
      parts.push(`resume=${ref.resume}`);
    }
    parts.push(...condTail(ref.conds));
    lines.push(`${p}waf_inspect ${parts.join(" ")};`);
  }

  if (req === "none" || (Array.isArray(req) && activeInspects(rows, "request", waf, graph) === 0)) {
    lines.push(`${p}waf_inspect request none;`);
  }
  if (rsp === "none" || (Array.isArray(rsp) && activeInspects(rows, "response", waf, graph) === 0)) {
    lines.push(`${p}waf_inspect response none;`);
  }
  if (frm === "none" || (Array.isArray(frm) && activeInspects(rows, "frame", waf, graph) === 0)) {
    lines.push(`${p}waf_inspect frame none;`);
  }
}

function frameWord(stream: InspectorRef["stream"]): string {
  switch (stream) {
    case "s2c":
      return "frame:s2c";
    case "both":
      return "frame";
    default:
      return "frame:c2s";
  }
}

function activeInspects(
  rows: InspectorRef[],
  phase: InspectorPhase,
  waf: WafRouteSettings,
  graph: Record<string, InspectorDecl>,
): number {
  let n = 0;
  for (const ref of rows) {
    if ((ref.phase ?? "request") !== phase) continue;
    const decl = graph[ref.name] ?? {};
    const mode: InspectorMode | undefined =
      ref.mode ??
      waf.inspectorModes?.[ref.name] ??
      (decl.role === "advisory" ? "passive" : undefined);
    if (mode !== "ignore") n += 1;
  }
  return n;
}

function condTail(conds: Cond[] | undefined): string[] {
  const parts: string[] = [];
  for (const cond of conds ?? []) {
    parts.push("if", cond.value, cond.negate === true ? "not in" : "in", cond.dataset);
  }
  return parts;
}

function emitLocalChecks(lines: string[], checks: LocalCheck[] | undefined, p: string): void {
  if (!checks) return;
  if (checks.length === 0) {
    lines.push(`${p}waf_local_check none;`);
    return;
  }
  for (const c of checks) {
    if (c.response && c.action !== "block") {
      throw new WafCompileError(
        "response_only_with_block",
        `waf_local_check ${c.dataset}: response= is only valid with action=block`,
      );
    }
    const parts = [c.dataset, c.variable, `action=${c.action}`];
    if (c.response) parts.push(`response=${c.response}`);
    parts.push(...condTail(c.conds));
    lines.push(`${p}waf_local_check ${parts.join(" ")};`);
  }
}

function emitLocalRates(lines: string[], rates: LocalRate[] | undefined, p: string): void {
  if (!rates) return;
  if (rates.length === 0) {
    lines.push(`${p}waf_local_rate none;`);
    return;
  }
  for (const r of rates) {
    const parts = [r.key, `rate=${r.rate}`, `burst=${r.burst}`];
    if (r.count) parts.push(`count=${r.count}`);
    if (r.action) parts.push(`action=${r.action}`);
    if (r.response) parts.push(`response=${r.response}`);
    if (r.hash) parts.push("hash=md5");
    if (r.list) parts.push(`list=${r.list}`);
    if (r.ttl) parts.push(`ttl=${r.ttl}`);
    parts.push(...condTail(r.conds));
    lines.push(`${p}waf_local_rate ${parts.join(" ")};`);
  }
}
