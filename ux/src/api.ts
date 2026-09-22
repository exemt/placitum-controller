import type { ArchiveOutcome } from "./config/directive-tail.ts";
import type { FleetSnapshot } from "./fleet.ts";

export interface Health {
  ok: boolean;
  db?: boolean;
}

export interface Meta {
  service: string;
  version: string;
  mode: "debug";
  hostname: string;
  pid: number;
  uptime_s: number;
}

export interface Space {
  uuid: string;
  name: string;
  raw: boolean;
  created_at: string;
  updated_at: string;
}

export const DATASET_KINDS = ["list", "content"] as const;

export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DATASET_TYPES = ["string", "numeric", "ipv4", "ip"] as const;

export type DatasetType = (typeof DATASET_TYPES)[number];

export const TEXT_CONTENT_TYPES = ["text", "html", "json", "xml"] as const;

export function isTextContentType(name: string): boolean {
  return (TEXT_CONTENT_TYPES as readonly string[]).includes(name);
}

export interface ContentType {
  uuid: string;
  name: string;
  mime: string;
  description: string;
}

export interface DatasetSetLink {
  uuid: string;
  name: string;
  exclude: boolean;
}

export type DatasetMode = "active" | "internal";

export interface Dataset {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  kind: DatasetKind;
  type: DatasetType;
  content_type_id: string | null;
  max_entries: number;
  limit?: number;
  active: boolean;
  in_nginx?: boolean;
  builtin?: boolean;
  mode?: DatasetMode;
  ttl?: string | null;
  hash?: boolean;
  size: number;
  vars: string[] | null;
  linked: boolean;
  linked_sets: DatasetSetLink[];
  created_at: string;
  updated_at: string;
}

export interface DatasetContent {
  dataset_id: string;
  name: string;
  size: number;
  blob: string;
  updated_at: string;
}

export interface Address {
  uuid: string;
  dataset_id: string;
  address: string;
  ttl_s: number;
  expires_at: string | null;
  origin: string;
  reason: string;
}

export interface RuleFileMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface RuleFile extends RuleFileMeta {
  text_raw: string;
}

export interface RuleSetMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface RuleSetMember {
  uuid: string;
  name: string;
}

export interface RuleSet extends RuleSetMeta {
  files: RuleSetMember[];
  data_files: { uuid: string; name: string; file: string }[];
  policy?: ModsecPolicy;
  sender_codes?: SenderCode[];
  modified?: boolean;
}

const RELOGIN_KEY = "placitum.relogin";

function sessionLost(res: Response): void {
  if (res.status !== 401) {
    return;
  }

  try {
    const last = Number(window.sessionStorage.getItem(RELOGIN_KEY) ?? "0");
    if (Date.now() - last < 60_000) {
      return;
    }
    window.sessionStorage.setItem(RELOGIN_KEY, String(Date.now()));
  } catch {
  }

  window.location.reload();
}

async function parseJson<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    sessionLost(res);
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: string;
        detail?: unknown;
        invalid?: unknown;
        errors?: unknown;
      };
      if (typeof body.error === "string") {
        detail = body.error;
        if (typeof body.detail === "string" && body.detail !== "") {
          detail = `${body.error}: ${body.detail}`;
        }
        if (Array.isArray(body.invalid) && body.invalid.length > 0) {
          const sample = body.invalid
            .filter((item): item is string => typeof item === "string")
            .slice(0, 5);
          if (sample.length > 0) {
            detail = `${body.error}: ${sample.join(", ")}`;
          }
        }
        if (Array.isArray(body.errors) && body.errors.length > 0) {
          const reasons = body.errors
            .map((row: unknown) =>
              row !== null && typeof row === "object" && "message" in row
                ? String((row as { message: unknown }).message)
                : "",
            )
            .filter((text) => text !== "")
            .slice(0, 5);
          if (reasons.length > 0) {
            detail = `${body.error}: ${reasons.join("; ")}`;
          }
        }
      }
    } catch {
    }
    throw new Error(`${path} → ${detail}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  return parseJson<T>(await fetch(path), path);
}

async function getText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) {
    await parseJson<never>(res, path);
  }
  return res.text();
}

type MutationListener = (path: string, method: string) => void;

let mutationListener: MutationListener | null = null;

export function onMutation(listener: MutationListener | null): void {
  mutationListener = listener;
}

async function sendJson<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = parseJson<T>(res, path);

  if (res.ok) {
    mutationListener?.(path, method);
  }

  return out;
}

async function sendNoContent(
  path: string,
  method: "POST" | "PUT" | "DELETE",
): Promise<void> {
  const res = await fetch(path, { method });

  if (!res.ok) {
    sessionLost(res);
    let detail = `${res.status}`;

    try {
      const body = (await res.json()) as { error?: string };

      if (typeof body.error === "string") {
        detail = body.error;
      }
    } catch {
    }

    throw new Error(`${method} ${path}: ${detail}`);
  }

  mutationListener?.(path, method);
}

export function fetchHealth(): Promise<Health> {
  return getJson<Health>("/api/health");
}

export function fetchMeta(): Promise<Meta> {
  return getJson<Meta>("/api/meta");
}

export async function fetchSpaces(): Promise<Space[]> {
  const row = await getJson<{ spaces: Space[] }>("/api/spaces");
  return row.spaces;
}

export function fetchFleet(): Promise<FleetSnapshot> {
  return getJson("/api/fleet");
}

export interface ContourCrypto {
  alg: string;
  public_key: string;
  fingerprint: string;
}

export function fetchCrypto(scope: string): Promise<ContourCrypto> {
  return getJson<ContourCrypto>(`/api/${scope}/crypto`);
}

export async function fetchDatasets(scope: string): Promise<Dataset[]> {
  const row = await getJson<{ datasets: Dataset[] }>(
    `/api/${scope}/datasets`,
  );
  return row.datasets;
}

export function createDataset(
  scope: string,
  input: {
    name: string;
    description?: string;
    subject?: string;
    kind: DatasetKind;
    type?: DatasetType;
    content_type_id?: string;
    mode: DatasetMode;
    limit?: number;
    ttl?: string;
    hash?: boolean;
    in_nginx?: boolean;
    copy_from?: string;
  },
): Promise<Dataset> {
  return sendJson<Dataset>(`/api/${scope}/datasets`, "POST", input);
}

export async function fetchContentTypes(scope: string): Promise<ContentType[]> {
  const row = await getJson<{ content_types: ContentType[] }>(
    `/api/${scope}/content-types`,
  );
  return row.content_types;
}

export function fetchDatasetContent(
  scope: string,
  datasetId: string,
): Promise<DatasetContent> {
  return getJson<DatasetContent>(`/api/${scope}/datasets/${datasetId}/content`);
}

export function putDatasetContent(
  scope: string,
  datasetId: string,
  input: { name: string; blob: string },
): Promise<DatasetContent> {
  return sendJson<DatasetContent>(
    `/api/${scope}/datasets/${datasetId}/content`,
    "PUT",
    input,
  );
}

export function updateDataset(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    subject?: string;
    mode?: DatasetMode;
    limit?: number;
    ttl?: string;
    in_nginx?: boolean;
    hash?: boolean;
  },
): Promise<Dataset> {
  return sendJson<Dataset>(`/api/${scope}/datasets/${id}`, "PUT", input);
}

export function deleteDataset(scope: string, id: string): Promise<Dataset> {
  return sendJson<Dataset>(`/api/${scope}/datasets/${id}`, "DELETE");
}

export async function fetchAddresses(
  scope: string,
  datasetId: string,
): Promise<Address[]> {
  const row = await getJson<{ addresses: Address[] }>(
    `/api/${scope}/datasets/${datasetId}/addresses`,
  );
  return row.addresses;
}

export async function addAddress(
  scope: string,
  datasetId: string,
  address: string,
): Promise<Address[]> {
  return addAddresses(scope, datasetId, { address });
}

export async function addAddresses(
  scope: string,
  datasetId: string,
  body: {
    address?: string;
    addresses?: string[];
    text?: string;
    ttl_s?: number;
  },
): Promise<Address[]> {
  const row = await sendJson<{ addresses: Address[] }>(
    `/api/${scope}/datasets/${datasetId}/addresses`,
    "POST",
    body,
  );
  return row.addresses;
}

export function deleteAddress(scope: string, addressId: string): Promise<Address> {
  return sendJson<Address>(`/api/${scope}/addresses/${addressId}`, "DELETE");
}

export type AuditSearchVerdict = "allow" | "deny" | "redirect";

export interface AuditSession {
  by?: string;
  source: string;
  kind: string;
  user: string;
  id: string;
  verified: boolean;
  issued?: number;
  expires?: number;
  groups?: string;
  passive?: boolean;
}

export function sessionIdentity(s: AuditSession): string {
  if (s.user === "") {
    return "";
  }

  return s.source !== "" ? `${s.source}:${s.user}` : s.user;
}

export interface AuditSearchEvent {
  ts: string;
  node: string;
  ray: string;
  phase: string;

  client_ip?: string;
  client_port?: number;
  server_ip?: string;
  server_port?: number;
  tls_version?: string;
  tls_sni?: string;

  method: string;
  scheme?: string;
  host: string;
  uri: string;
  http_version?: string;
  args_size: number;
  headers_size: number;
  headers_count: number;
  body_size: number;
  content_type?: string;
  status: number;
  upstream_status?: number;

  server_name?: string;
  location?: string;
  location_id?: string;

  verdict: string;
  code?: string;
  by: string;

  score: number;
  deny_at?: number;
  shadow?: number;

  waf_latency_us: number;

  inspectors: string[];
  inspectors_verdict: Record<string, string>;
  inspectors_state?: Record<string, string>;
  inspectors_score: Record<string, number>;
  inspectors_latency_ms?: Record<string, number>;
  inspectors_role?: Record<string, string>;
  inspectors_profile?: Record<string, string>;
  inspectors_view: string;

  vars?: Record<string, string>;

  sessions?: AuditSession[];

  markers?: string[];

  headers_preview?: Record<string, string>;
  args_preview?: Record<string, string>;
  body_preview?: string;
  body_preview_source?: "sent";

  headers_preview_truncated?: string[];
  args_preview_truncated?: string[];
  headers_preview_dropped?: number;
  args_preview_dropped?: number;

  store?: {
    headers?: AuditStoreLocator;
    args?: AuditStoreLocator;
    body?: AuditStoreLocator;
  };

  frame?: AuditFrameInfo;
  session?: AuditSessionInfo;
}

export function frameAddr(row: { phase: string; frame?: AuditFrameInfo }): string {
  return row.phase === "frame" && row.frame !== undefined
    ? `${row.frame.direction}:${row.frame.seq}`
    : "";
}

export interface AuditFrameInfo {
  seq: number;
  direction: "c2s" | "s2c" | string;
  opcode: string;
  fin: boolean;
  size: number;
  rewritten: boolean;
  payload_preview?: string;
  payload_truncated?: boolean;
}

export interface AuditSessionInfo {
  frames_c2s: number;
  frames_s2c: number;
  bytes_c2s: number;
  bytes_s2c: number;
  frames_denied: number;
  frames_rewritten: number;
  close_code: number;
  close_reason: string;
  duration_ms: number;
}

export interface AuditStoreLocator {
  unavailable?: string;
  size: number;
  declared_size?: number;
  sha256?: string;
  complete?: boolean;
  truncated?: boolean;
  encoding?: string;
  store?: string;
  driver?: string;
  key?: string;
  expires_at?: number;
}

export interface AuditFinding {
  ts: string;
  node: string;
  ray: string;
  phase: string;
  inspector: string;
  profile?: string;
  verdict: string;
  score?: number;
  engine_ms?: number;
  index: number;
  code?: string;
  severity?: string;
  target?: string;
  rule?: string;
  offset?: number;
  length?: number;
  confidence?: number;
  evidence?: string;
  message?: string;
  tags?: string[];
  engine?: unknown;
  clean?: boolean;
}

export interface AuditParticipant {
  name: string;
  self?: boolean;
  decisive?: boolean;
  verdict?: string;
  state?: string;
  score?: number;
  latency_ms?: number;
  engine_ms?: number;
  role?: string;
  profile?: string;
  clean?: boolean;
  orphan?: boolean;
  findings?: AuditFinding[];
  rewrite?: { applied: boolean; size?: number; groups?: string[] };
}

export interface ActionParam {
  name: string;
  type: "int" | "bool" | "string";
  required: boolean;
  min?: number;
  max?: number;
  signed?: boolean;
}

export interface ActionSpec {
  do: string;
  axes: string[];
  params: ActionParam[];
  listeners: string[];
  weakens: boolean;
  module?: boolean;
  route?: boolean;
  fromPassive?: boolean;
}

export interface ActionRegistry {
  v: number;
  axes: string[];
  verbs: ActionSpec[];
  common: ActionParam[];
}

export const MARKER_MAX_BYTES = 128;

export function markerError(marker: string): "empty" | "long" | "bad" | null {
  if (marker.trim() === "") {
    return "empty";
  }

  if (new TextEncoder().encode(marker).length > MARKER_MAX_BYTES) {
    return "long";
  }

  for (const ch of marker) {
    const code = ch.codePointAt(0) ?? 0;

    if (code < 0x20 || code === 0x7f) {
      return "bad";
    }
  }

  return null;
}

export const RECORD_OBJECTS = ["headers", "args", "body"] as const;

export type RecordObjectName = (typeof RECORD_OBJECTS)[number];

export interface RecordObject {
  set: "" | "on" | "off";
  limit: number | null;
  source: "" | "store" | "original";
}

export interface SenderCode {
  code: string;
  by: { inspector: string; profile: string }[];
}

export function fetchActions(): Promise<ActionRegistry> {
  return getJson<ActionRegistry>("/api/actions");
}

export function axesFor(reg: ActionRegistry | null, verbs: readonly string[]): string[] {
  if (reg === null) {
    return [];
  }

  const ok = new Set<string>();

  for (const spec of reg.verbs) {
    if (!verbs.includes(spec.do)) {
      continue;
    }

    for (const axis of spec.axes) {
      ok.add(axis);
    }
  }

  return reg.axes.filter((axis) => ok.has(axis));
}

export function weakeningVerbs(reg: ActionRegistry | null): string[] {
  return (reg?.verbs ?? []).filter((spec) => spec.weakens).map((spec) => spec.do);
}

export function verbsFor(reg: ActionRegistry | null, inspector: string): string[] {
  if (reg === null) {
    return [];
  }

  return reg.verbs
    .filter(
      (spec) =>
        spec.module !== true &&
        (spec.listeners.length === 0 || spec.listeners.includes(inspector)),
    )
    .map((spec) => spec.do);
}

export interface AuditActionOutcome {
  inspector: string;
  outcome: string;
  took?: number;
}

export interface AuditAction {
  from?: string;
  to?: string;
  do: string;
  apply?: string;
  code?: string;
  delta?: number;
  value?: number;
  phase?: string;
  passive?: boolean;
  outcomes?: AuditActionOutcome[];
}

export interface AuditCard {
  ts: string;
  node: string;
  ray: string;
  phase: string;
  verdict: string;
  code?: string;
  by: string;
  score: number;
  deny_at?: number;
  shadow?: number;
  items: AuditParticipant[];
  count: number;
  actions?: AuditAction[];
  frame?: AuditFrameInfo;
  session?: AuditSessionInfo;
}

export const AUDIT_CONTENT_KINDS = ["headers", "args", "body"] as const;

export type AuditContentKind = (typeof AUDIT_CONTENT_KINDS)[number];

export interface AuditContentPair {
  name: string;
  value: string;
}

export interface AuditContent {
  node: string;
  ray: string;
  phase: string;
  kind: AuditContentKind;

  size: number;
  declared_size?: number;
  sha256?: string;
  complete?: boolean;
  truncated?: boolean;
  encoding?: string;
  content_type?: string;

  store?: string;
  driver?: string;
  key?: string;
  expires_at?: number;

  available: boolean;
  reason?: string;

  returned: number;
  clipped?: boolean;

  offset?: number;
  continuation?: boolean;

  headers?: AuditContentPair[];
  params?: AuditContentPair[];
  count?: number;
  raw?: string;
  text?: string;
  base64?: string;
  binary?: boolean;
}

export interface AuditSearchPage {
  items: AuditSearchEvent[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export type AuditGroupDim =
  | "ip"
  | "host"
  | "server"
  | "uri"
  | "route"
  | "method"
  | "status"
  | "verdict"
  | "phase"
  | "marker"
  | "country"
  | "asn"
  | "user";

export interface AuditGroupRow {
  keys: Partial<Record<AuditGroupDim, string>>;
  hits: number;
  allowed?: number;
  redirected?: number;
  denied: number;
  last: string;
}

export interface AuditGroupPage {
  items: AuditGroupRow[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export type AuditSearchQuery = {
  verdict?: "" | AuditSearchVerdict;
  code?: string;
  phase?: string;
  method?: string;
  host?: string;
  server?: string;
  uri?: string;
  route?: string;
  status?: string;
  inspector?: string;
  user?: string;
  session?: string;
  marker?: string;
  country?: string;
  asn?: string;
  ray?: string;
  ip?: string;
  node?: string;
  header?: string;
  param?: string;
  body?: string;
  from?: string;
  to?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export interface LogLine {
  ts: string;
  writer: string;
  service: string;
  severity?: string;
  text: string;
}

export interface LogSearchPage {
  items: LogLine[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface LogFacet {
  writer: string;
  service: string;
  count: number;
}

export type LogSearchQuery = {
  writer?: string;
  service?: string;
  severity?: string;
  text?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

async function search<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (res.status === 503) {
    throw new Error("search_unreachable");
  }
  return parseJson<T>(res, path);
}

function record(node: string, ray: string): string {
  return `/api/search/audit/${encodeURIComponent(node)}/${encodeURIComponent(ray)}`;
}

export function fetchAuditSearch(q: AuditSearchQuery): Promise<AuditSearchPage> {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === "") {
      continue;
    }
    p.set(key, String(value));
  }
  const qs = p.toString();

  return search<AuditSearchPage>(
    `/api/search/audit${qs !== "" ? `?${qs}` : ""}`,
  );
}

export type AuditGroupSort = {
  key: "hits" | "denied" | "last" | AuditGroupDim;
  dir: "asc" | "desc";
};

export function fetchAuditGroups(
  q: AuditSearchQuery,
  by: readonly AuditGroupDim[],
  sort: AuditGroupSort,
): Promise<AuditGroupPage> {
  return search<AuditGroupPage>(
    `/api/search/audit/groups${params({ ...q, by: by.join(","), sort: sort.key, dir: sort.dir })}`,
  );
}

function params(q: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === "") {
      continue;
    }
    p.set(key, String(value));
  }
  const qs = p.toString();

  return qs !== "" ? `?${qs}` : "";
}

export function fetchLogSearch(q: LogSearchQuery): Promise<LogSearchPage> {
  return search<LogSearchPage>(`/api/search/logs${params(q)}`);
}

export function fetchLogFacets(window: {
  from?: string;
  to?: string;
}): Promise<{ items: LogFacet[]; count: number }> {
  return search<{ items: LogFacet[]; count: number }>(
    `/api/search/logs/facets${params(window)}`,
  );
}

export interface LogLevelsService {
  name: string;
  env: string;
}

export interface LogLevels {
  rev: number;
  levels: Record<string, InspectorLogLevel>;
  services: LogLevelsService[];
}

export function fetchLogLevels(): Promise<LogLevels> {
  return getJson<LogLevels>("/api/log-levels");
}

export function saveLogLevels(
  levels: Record<string, InspectorLogLevel | null>,
): Promise<LogLevels> {
  return sendJson<LogLevels>("/api/log-levels", "PUT", { levels });
}

export function fetchAuditEvent(
  node: string,
  ray: string,
  phase?: string,
  frame?: string,
): Promise<AuditSearchEvent> {
  return search<AuditSearchEvent>(`${record(node, ray)}${params({ phase, frame })}`);
}

export function fetchAuditInspectors(
  node: string,
  ray: string,
  phase?: string,
  frame?: string,
): Promise<AuditCard> {
  return search<AuditCard>(`${record(node, ray)}/inspectors${params({ phase, frame })}`);
}

export function fetchAuditContent(
  node: string,
  ray: string,
  kind: AuditContentKind,
  window?: { offset: number; limit: number },
  phase?: string,
  frame?: string,
): Promise<AuditContent> {
  const p = new URLSearchParams();
  if (phase !== undefined && phase !== "") {
    p.set("phase", phase);
  }
  if (frame !== undefined && frame !== "") {
    p.set("frame", frame);
  }
  if (window !== undefined) {
    p.set("offset", String(window.offset));
    p.set("limit", String(window.limit));
  }
  const qs = p.toString();

  return search<AuditContent>(
    `${record(node, ray)}/${kind}${qs !== "" ? `?${qs}` : ""}`,
  );
}

export async function fetchRuleFiles(scope: string): Promise<RuleFileMeta[]> {
  const row = await getJson<{ rule_files: RuleFileMeta[] }>(
    `/api/${scope}/rule-files`,
  );
  return row.rule_files;
}

export function fetchRuleFile(scope: string, id: string): Promise<RuleFile> {
  return getJson<RuleFile>(`/api/${scope}/rule-files/${id}`);
}

export function createRuleFile(
  scope: string,
  input: { name: string; description: string; text_raw: string },
): Promise<RuleFile> {
  return sendJson<RuleFile>(`/api/${scope}/rule-files`, "POST", input);
}

export function updateRuleFile(
  scope: string,
  id: string,
  input: { name?: string; description?: string; text_raw?: string },
): Promise<RuleFile> {
  return sendJson<RuleFile>(`/api/${scope}/rule-files/${id}`, "PUT", input);
}

export function deleteRuleFile(scope: string, id: string): Promise<RuleFile> {
  return sendJson<RuleFile>(`/api/${scope}/rule-files/${id}`, "DELETE");
}

export async function fetchRuleSets(scope: string): Promise<RuleSetMeta[]> {
  const row = await getJson<{ rule_sets: RuleSetMeta[] }>(
    `/api/${scope}/rule-sets`,
  );
  return row.rule_sets;
}

export function fetchRuleSet(scope: string, id: string): Promise<RuleSet> {
  return getJson<RuleSet>(`/api/${scope}/rule-sets/${id}`);
}

export function createRuleSet(
  scope: string,
  input: {
    name: string;
    description: string;
    files: string[];
    data_files?: string[];
  },
): Promise<RuleSet> {
  return sendJson<RuleSet>(`/api/${scope}/rule-sets`, "POST", input);
}

export function updateRuleSet(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    files?: string[];
    data_files?: string[];
    policy?: ModsecPolicy;
  },
): Promise<RuleSet> {
  return sendJson<RuleSet>(`/api/${scope}/rule-sets/${id}`, "PUT", input);
}

export function deleteRuleSet(scope: string, id: string): Promise<RuleSet> {
  return sendJson<RuleSet>(`/api/${scope}/rule-sets/${id}`, "DELETE");
}

export function restoreRuleSet(
  scope: string,
  id: string,
): Promise<RuleSet & { missing_files: string[] }> {
  return sendJson<RuleSet & { missing_files: string[] }>(
    `/api/${scope}/rule-sets/${id}/restore`,
    "POST",
  );
}

export interface RulesSendResult {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: string[];
}

export function sendRules(scope: string): Promise<RulesSendResult> {
  return sendJson<RulesSendResult>(`/api/${scope}/rules/send`, "POST");
}

export type InspectorPhase = "request" | "response" | "frame";

export const INSPECTOR_LOG_LEVELS = [
  "debug",
  "info",
  "notice",
  "warn",
  "error",
  "crit",
  "alert",
] as const;

export type InspectorLogLevel = (typeof INSPECTOR_LOG_LEVELS)[number];

export interface InspectorMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  subject: string;
  phases: InspectorPhase[];
  description: string;
  docs_url: string;
  log_level: InspectorLogLevel;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface Inspector extends InspectorMeta {
  conf: string;
}

export function serviceOfSubject(subject: string): string {
  return subject.split(".").pop() ?? "";
}

export async function fetchInspectors(scope: string): Promise<InspectorMeta[]> {
  const row = await getJson<{ inspectors: InspectorMeta[] }>(
    `/api/${scope}/inspectors`,
  );
  return row.inspectors;
}

export interface DeclaredInspector {
  name: string;
  process: string;
  subject: string | null;
  phases: InspectorPhase[];
  profile: string;
  known: boolean;
}

export async function fetchDeclaredInspectors(
  scope: string,
): Promise<DeclaredInspector[]> {
  const row = await getJson<{ declared: DeclaredInspector[] }>(
    `/api/${scope}/inspectors/declared`,
  );
  return row.declared;
}

export function fetchInspector(scope: string, id: string): Promise<Inspector> {
  return getJson<Inspector>(`/api/${scope}/inspectors/${id}`);
}

export function updateInspector(
  scope: string,
  id: string,
  input: {
    description?: string;
    docs_url?: string;
    log_level?: InspectorLogLevel;
    conf?: string;
  },
): Promise<Inspector> {
  return sendJson<Inspector>(`/api/${scope}/inspectors/${id}`, "PUT", input);
}

export const STORE_TYPES = [
  "certificate",
  "private_key",
  "chain",
  "ca",
  "crl",
  "creds",
  "dhparam",
  "deny_page",
  "other",
] as const;

export type StoreType = (typeof STORE_TYPES)[number];

export interface StoreObjectMeta {
  uuid: string;
  type: StoreType;
  metadata: Record<string, unknown>;
  size: number;
  created_at: string;
}

export function createStoreObject(
  scope: string,
  input: { type: StoreType; blob: string; metadata?: Record<string, unknown> },
): Promise<StoreObjectMeta> {
  return sendJson<StoreObjectMeta>(`/api/${scope}/store`, "POST", input);
}

export const CERTIFICATE_TYPES = ["server", "client_ca"] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export interface CertificateCrl {
  store_id: string;
  issuer: string;
  this_update: string | null;
  next_update: string | null;
  revoked: number | null;
}

export interface Certificate {
  uuid: string;
  http_space_id: string;
  name: string;
  type: CertificateType;
  cert_store_id: string;
  key_store_id: string | null;
  chain_store_id: string | null;
  sans: string[];
  not_before: string | null;
  not_after: string | null;
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
  crl: CertificateCrl | null;
}

export async function fetchCertificates(scope: string): Promise<Certificate[]> {
  const row = await getJson<{ certificates: Certificate[] }>(
    `/api/${scope}/certificates`,
  );
  return row.certificates;
}

export function createCertificateRecord(
  scope: string,
  input: {
    name: string;
    type: CertificateType;
    cert_store_id: string;
    key_store_id?: string;
    chain_store_id?: string;
  },
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates`, "POST", input);
}

export function setCertificateCrl(
  scope: string,
  id: string,
  crlStoreId: string,
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates/${id}/crl`, "PUT", {
    crl_store_id: crlStoreId,
  });
}

export function deleteCertificateCrl(
  scope: string,
  id: string,
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates/${id}/crl`, "DELETE");
}

export function deleteCertificateRecord(
  scope: string,
  id: string,
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates/${id}`, "DELETE");
}

export const IP_COUNTRY_TYPES = ["v4", "v6"] as const;

export type IpCountryType = (typeof IP_COUNTRY_TYPES)[number];

export interface IpCountry {
  uuid: string;
  http_space_id: string;
  code: string;
  type: IpCountryType;
  description: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface IpCountryAddress {
  uuid: string;
  country_id: string;
  address: string;
}

export const IP_ASN_TYPES = IP_COUNTRY_TYPES;

export type IpAsnType = IpCountryType;

export interface IpAsn {
  uuid: string;
  http_space_id: string;
  asn: number;
  type: IpAsnType;
  description: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface IpAsnAddress {
  uuid: string;
  asn_id: string;
  address: string;
}

export interface IpSetList {
  uuid: string;
  name: string;
  type: string;
  active: boolean;
}

export interface IpSetMatch {
  lists: IpSetList[];
  countries: string[];
  asns: number[];
}

export interface IpSetMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  list_count: number;
  live: boolean;
  created_at: string;
  updated_at: string;
}

export interface IpSet extends IpSetMeta, IpSetMatch {
  inverse: boolean;
  exclude: IpSetMatch;
}

export type IpSetMatchInput = {
  lists: string[];
  countries: string[];
  asns: number[];
};

export const IP_RULE_ACTIONS = ["allow", "deny", "request", "list"] as const;

export type IpRuleAction = (typeof IP_RULE_ACTIONS)[number];

export const IP_DEFAULT_ACTIONS = ["allow", "deny"] as const;

export type IpDefaultAction = (typeof IP_DEFAULT_ACTIONS)[number];

export const IP_OUTCOME_ONS = ["white", "black", "none", "overload"] as const;

export type IpOutcomeOn = (typeof IP_OUTCOME_ONS)[number];

export interface IpRule {
  uuid: string;
  position: number;
  set: string | null;
  set_name: string;
  dataset: string | null;
  dataset_name: string;
  not: boolean;
  action: IpRuleAction;
  response: string;
  code: string;
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  group: string;
  phase?: string;
  side: string;
  when: string[];
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  force: boolean;
  list: string | null;
  list_name: string;
  ttl: number;
  enabled: boolean;
}

export type IpRuleInput = {
  set?: string | null;
  dataset?: string | null;
  not?: boolean;
  action: IpRuleAction;
  response?: string;
  code?: string;
  to?: string;
  do?: string;
  apply?: string;
  delta?: number | null;
  value?: number | null;
  counter?: string;
  marker?: string;
  group?: string;
  phase?: string;
  side?: string;
  when?: string[];
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  force?: boolean;
  list?: string | null;
  write?: "addr" | "net" | "net_all" | "asn";
  ttl?: number;
  enabled?: boolean;
};

export interface IpOutcomeInput {
  on: IpOutcomeOn;
  at?: number;
  to?: string;
  do?: string;
  apply?: string;
  delta?: number | null;
  value?: number | null;
  counter?: string;
  marker?: string;
  group?: string;
  phase?: string;
  set?: string;
  when?: string[];
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  list: string;
  write?: "addr" | "net" | "net_all" | "asn";
  ttl: number;
  code: string;
}

export interface IpProfileMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  rule_count: number;
  created_at: string;
  updated_at: string;
}

export interface IpProfileDataset {
  uuid: string;
  name: string;
  active: boolean;
}

export interface IpProfile extends IpProfileMeta {
  rules: IpRule[];
  datasets: IpProfileDataset[];
  outcomes: IpOutcomeInput[];
  default: IpDefaultAction;
  default_code: string;
  modified?: boolean;
}

export async function fetchIpCountries(scope: string): Promise<IpCountry[]> {
  const row = await getJson<{ ip_countries: IpCountry[] }>(
    `/api/${scope}/ip-countries`,
  );
  return row.ip_countries;
}

export interface IpSetAddressPage<T> {
  addresses: T[];
  total: number;
  count: number;
  page: number;
  page_size: number;
  page_count: number;
}

export async function fetchIpCountryAddresses(
  scope: string,
  id: string,
  page = 0,
  pageSize = 10,
  q = "",
): Promise<IpSetAddressPage<IpCountryAddress>> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q.trim() !== "") {
    query.set("q", q);
  }
  return getJson<IpSetAddressPage<IpCountryAddress>>(
    `/api/${scope}/ip-countries/${id}/addresses?${query}`,
  );
}

export function exportIpCountryAddresses(
  scope: string,
  id: string,
): Promise<string> {
  return getText(`/api/${scope}/ip-countries/${id}/addresses/export`);
}

export async function fetchIpAsns(scope: string): Promise<IpAsn[]> {
  const row = await getJson<{ ip_asns: IpAsn[] }>(`/api/${scope}/ip-asns`);
  return row.ip_asns;
}

export async function fetchIpAsnAddresses(
  scope: string,
  id: string,
  page = 0,
  pageSize = 10,
  q = "",
): Promise<IpSetAddressPage<IpAsnAddress>> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q.trim() !== "") {
    query.set("q", q);
  }
  return getJson<IpSetAddressPage<IpAsnAddress>>(
    `/api/${scope}/ip-asns/${id}/addresses?${query}`,
  );
}

export function exportIpAsnAddresses(scope: string, id: string): Promise<string> {
  return getText(`/api/${scope}/ip-asns/${id}/addresses/export`);
}

export type GeoKind = "country" | "asn";

export interface GeoImportJob {
  kind: GeoKind;
  space_id: string;
  state: "running" | "done" | "failed";
  phase: "catalog" | "publish";
  sha256: string;
  size: number;
  database_type: string;
  build_epoch: number;
  networks: number;
  keys: number;
  added: number;
  removed: number;
  started_at: string;
  finished_at?: string;
  took_ms?: number;
  error?: string;
  detail?: string;
}

export interface GeoFileInfo {
  sha256: string;
  size: number;
  database_type: string;
  build_epoch: number;
  uploaded_at: string;
  published: boolean;
  coders: number;
}

export interface GeoImportView {
  jobs: Record<GeoKind, GeoImportJob | null>;
  files: Record<GeoKind, GeoFileInfo | null>;
  coder: { replicas: number; rev: number };
}

export class GeoUploadError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "GeoUploadError";
    this.code = code;
    this.detail = detail;
  }
}

export function fetchGeoImports(scope: string): Promise<GeoImportView> {
  return getJson<GeoImportView>(`/api/${scope}/geo/import`);
}

export async function uploadGeoFile(
  scope: string,
  kind: GeoKind,
  file: File,
): Promise<GeoImportJob> {
  const path = `/api/${scope}/geo/import/${kind}`;
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: file,
  });

  let body: { job?: GeoImportJob; error?: string; detail?: string } = {};

  try {
    body = (await res.json()) as typeof body;
  } catch {
  }

  if (!res.ok || body.job === undefined) {
    sessionLost(res);
    throw new GeoUploadError(body.error ?? `http_${res.status}`, body.detail);
  }

  mutationListener?.(path, "POST");
  return body.job;
}

export async function fetchIpSets(scope: string): Promise<IpSetMeta[]> {
  const row = await getJson<{ ip_sets: IpSetMeta[] }>(`/api/${scope}/ip-sets`);
  return row.ip_sets;
}

export function fetchIpSet(scope: string, id: string): Promise<IpSet> {
  return getJson<IpSet>(`/api/${scope}/ip-sets/${id}`);
}

export function createIpSet(
  scope: string,
  input: {
    name: string;
    description: string;
    inverse: boolean;
    lists: string[];
    countries: string[];
    asns: number[];
    exclude: IpSetMatchInput;
  },
): Promise<IpSet> {
  return sendJson<IpSet>(`/api/${scope}/ip-sets`, "POST", input);
}

export function updateIpSet(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    inverse?: boolean;
    lists?: string[];
    countries?: string[];
    asns?: number[];
    exclude?: IpSetMatchInput;
  },
): Promise<IpSet> {
  return sendJson<IpSet>(`/api/${scope}/ip-sets/${id}`, "PUT", input);
}

export function deleteIpSet(scope: string, id: string): Promise<void> {
  return sendNoContent(`/api/${scope}/ip-sets/${id}`, "DELETE");
}

export async function fetchIpProfiles(scope: string): Promise<IpProfileMeta[]> {
  const row = await getJson<{ ip_profiles: IpProfileMeta[] }>(
    `/api/${scope}/ip-profiles`,
  );
  return row.ip_profiles;
}

export function fetchIpProfile(scope: string, id: string): Promise<IpProfile> {
  return getJson<IpProfile>(`/api/${scope}/ip-profiles/${id}`);
}

export function createIpProfile(
  scope: string,
  input: {
    name: string;
    description: string;
    rules: IpRuleInput[];
    datasets: string[];
    outcomes: IpOutcomeInput[];
    default: IpDefaultAction;
    default_code?: string;
  },
): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles`, "POST", input);
}

export function updateIpProfile(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    rules?: IpRuleInput[];
    datasets?: string[];
    outcomes?: IpOutcomeInput[];
    default?: IpDefaultAction;
    default_code?: string;
  },
): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles/${id}`, "PUT", input);
}

export function deleteIpProfile(scope: string, id: string): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles/${id}`, "DELETE");
}

export function restoreIpProfile(scope: string, id: string): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles/${id}/restore`, "POST");
}

export interface GeoCountryHit {
  code: string;
  name?: string;
}

export interface GeoAsnHit {
  asn: number;
  name?: string;
}

export interface GeoLookupResult {
  addr: string;
  countries: GeoCountryHit[];
  asns: GeoAsnHit[];
  error?: string;
}

export async function fetchGeoLookupBatch(
  scope: string,
  addrs: string[],
): Promise<GeoLookupResult[]> {
  const row = await sendJson<{ results: GeoLookupResult[] }>(
    `/api/${scope}/geo/lookup/batch`,
    "POST",
    { addrs },
  );
  return row.results;
}

export type SpaceHttp = {
  uuid: string;
  name: string;
  raw: boolean;
  raw_nginx: string;
  nginx_main: Record<string, unknown>;
  nginx: Record<string, unknown>;
  waf_http: Record<string, unknown>;
  waf: Record<string, unknown>;
  infra: {
    nats_url: string;
    redis_url?: string;
    redis_internal_url?: string;
  };
  created_at: string;
  updated_at: string;
};

export function fetchSpaceHttp(scope: string): Promise<SpaceHttp> {
  return getJson<SpaceHttp>(`/api/${scope}/http`);
}

export function saveSpaceHttp(
  scope: string,
  input: Pick<
    SpaceHttp,
    "nginx_main" | "nginx" | "waf_http" | "waf" | "raw" | "raw_nginx"
  >,
): Promise<SpaceHttp> {
  return sendJson<SpaceHttp>(`/api/${scope}/http`, "PUT", input);
}

export type RouteServer = {
  uuid: string;
  http_space_id: string;
  name: string;
  server_names: string[];
  enabled: boolean;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
  location_count: number;
  listen_count: number;
  listens: ServerListen[];
};

export type RouteLocation = {
  uuid: string;
  server_id: string;
  server_name: string;
  http_space_id: string;
  match: string;
  path: string;
  position: number;
  enabled: boolean;
  handler: string;
  protocol: string;
  upstream_id: string | null;
  upstream_uri: string | null;
  return_status: number | null;
  return_page: string | null;
  return_url: string | null;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
  builtin: boolean;
};

export type ServerInput = {
  name: string;
  server_names: string[];
  enabled: boolean;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
};

export type LocationInput = {
  match: string;
  path: string;
  enabled: boolean;
  handler: string;
  protocol: string;
  upstream_id: string | null;
  upstream_uri: string | null;
  return_status: number | null;
  return_page: string | null;
  return_url: string | null;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
};

export async function fetchServers(scope: string): Promise<RouteServer[]> {
  const row = await getJson<{ servers: RouteServer[] }>(`/api/${scope}/servers`);
  return row.servers;
}

export function createServer(
  scope: string,
  input: ServerInput,
): Promise<RouteServer> {
  return sendJson<RouteServer>(`/api/${scope}/servers`, "POST", input);
}

export function updateServer(
  scope: string,
  id: string,
  input: ServerInput,
): Promise<RouteServer> {
  return sendJson<RouteServer>(`/api/${scope}/servers/${id}`, "PUT", input);
}

export function deleteServer(scope: string, id: string): Promise<RouteServer> {
  return sendJson<RouteServer>(`/api/${scope}/servers/${id}`, "DELETE");
}

export async function fetchLocations(
  scope: string,
  serverId?: string,
): Promise<RouteLocation[]> {
  const q = serverId === undefined ? "" : `?server=${serverId}`;
  const row = await getJson<{ locations: RouteLocation[] }>(
    `/api/${scope}/locations${q}`,
  );
  return row.locations;
}

export function createLocation(
  scope: string,
  serverId: string,
  input: LocationInput,
): Promise<RouteLocation> {
  return sendJson<RouteLocation>(
    `/api/${scope}/servers/${serverId}/locations`,
    "POST",
    input,
  );
}

export function updateLocation(
  scope: string,
  id: string,
  input: LocationInput,
): Promise<RouteLocation> {
  return sendJson<RouteLocation>(`/api/${scope}/locations/${id}`, "PUT", input);
}

export async function reorderLocations(
  scope: string,
  serverId: string,
  order: string[],
): Promise<RouteLocation[]> {
  const row = await sendJson<{ locations: RouteLocation[] }>(
    `/api/${scope}/servers/${serverId}/locations/order`,
    "PUT",
    { order },
  );
  return row.locations;
}

export function deleteLocation(
  scope: string,
  id: string,
): Promise<RouteLocation> {
  return sendJson<RouteLocation>(`/api/${scope}/locations/${id}`, "DELETE");
}

export const UPSTREAM_METHODS = [
  "round_robin",
  "least_conn",
  "ip_hash",
  "hash",
] as const;

export type UpstreamMethod = (typeof UPSTREAM_METHODS)[number];

export type UpstreamPeer = {
  uuid: string;
  host: string;
  port: number;
  weight: number;
  max_fails: number | null;
  fail_timeout_ms: number | null;
  backup: boolean;
  down: boolean;
  resolve: boolean;
  position: number;
};

export type UpstreamPool = {
  uuid: string;
  http_space_id: string;
  name: string;
  method: UpstreamMethod;
  hash_key: string | null;
  keepalive: number | null;
  keepalive_requests: number | null;
  keepalive_timeout_ms: number | null;
  tls: boolean;
  tls_name: string | null;
  host_header: string | null;
  peer_count: number;
  bind_count: number;
  peers: UpstreamPeer[];
};

export type UpstreamPeerInput = {
  host: string;
  port: number;
  weight: number;
  max_fails?: number | null;
  fail_timeout_ms?: number | null;
  backup: boolean;
  down: boolean;
  resolve?: boolean;
};

export type UpstreamInput = {
  name: string;
  method: UpstreamMethod;
  hash_key: string | null;
  keepalive: number | null;
  keepalive_requests: number | null;
  keepalive_timeout_ms: number | null;
  tls: boolean;
  tls_name: string | null;
  host_header: string | null;
  peers: UpstreamPeerInput[];
};

export async function fetchUpstreams(scope: string): Promise<UpstreamPool[]> {
  const row = await getJson<{ upstreams: UpstreamPool[] }>(
    `/api/${scope}/upstreams`,
  );
  return row.upstreams;
}

export function createUpstream(
  scope: string,
  input: UpstreamInput,
): Promise<UpstreamPool> {
  return sendJson<UpstreamPool>(`/api/${scope}/upstreams`, "POST", input);
}

export function updateUpstream(
  scope: string,
  id: string,
  input: UpstreamInput,
): Promise<UpstreamPool> {
  return sendJson<UpstreamPool>(`/api/${scope}/upstreams/${id}`, "PUT", input);
}

export function deleteUpstream(
  scope: string,
  id: string,
): Promise<UpstreamPool> {
  return sendJson<UpstreamPool>(`/api/${scope}/upstreams/${id}`, "DELETE");
}

export type ListenPort = {
  uuid: string;
  http_space_id: string;
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxy_protocol: boolean;
  bind_count: number;
  default_server_id: string | null;
};

export type PortInput = {
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxy_protocol: boolean;
};

export type ServerListen = {
  uuid: string;
  server_id: string;
  port_id: string;
  default_server: boolean;
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxy_protocol: boolean;
};

export async function fetchPorts(scope: string): Promise<ListenPort[]> {
  const row = await getJson<{ ports: ListenPort[] }>(`/api/${scope}/ports`);
  return row.ports;
}

export function createPort(scope: string, input: PortInput): Promise<ListenPort> {
  return sendJson<ListenPort>(`/api/${scope}/ports`, "POST", input);
}

export function updatePort(
  scope: string,
  id: string,
  input: PortInput,
): Promise<ListenPort> {
  return sendJson<ListenPort>(`/api/${scope}/ports/${id}`, "PUT", input);
}

export function deletePort(scope: string, id: string): Promise<ListenPort> {
  return sendJson<ListenPort>(`/api/${scope}/ports/${id}`, "DELETE");
}

export async function fetchServerListens(
  scope: string,
  serverId: string,
): Promise<ServerListen[]> {
  const row = await getJson<{ listens: ServerListen[] }>(
    `/api/${scope}/servers/${serverId}/ports`,
  );
  return row.listens;
}

export function bindServerPort(
  scope: string,
  serverId: string,
  input: { port_id: string; default_server: boolean },
): Promise<ServerListen> {
  return sendJson<ServerListen>(
    `/api/${scope}/servers/${serverId}/ports`,
    "POST",
    input,
  );
}

export function updateServerListen(
  scope: string,
  serverId: string,
  bindId: string,
  input: { default_server: boolean },
): Promise<ServerListen> {
  return sendJson<ServerListen>(
    `/api/${scope}/servers/${serverId}/ports/${bindId}`,
    "PUT",
    input,
  );
}

export function unbindServerPort(
  scope: string,
  serverId: string,
  bindId: string,
): Promise<ServerListen> {
  return sendJson<ServerListen>(
    `/api/${scope}/servers/${serverId}/ports/${bindId}`,
    "DELETE",
  );
}

export const CERTIFICATE_KINDS = ["server", "client_ca", "trusted"] as const;

export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];

export type ServerCertificateBind = {
  uuid: string;
  server_id: string;
  certificate_id: string;
  kind: CertificateKind;
  type: CertificateType;
  name: string;
  sans: string[];
  not_before: string | null;
  not_after: string | null;
  fingerprint: string;
  subject: string;
  has_crl: boolean;
};

export async function fetchServerCertificates(
  scope: string,
  serverId: string,
): Promise<ServerCertificateBind[]> {
  const row = await getJson<{ certificates: ServerCertificateBind[] }>(
    `/api/${scope}/servers/${serverId}/certificates`,
  );
  return row.certificates;
}

export function bindServerCertificate(
  scope: string,
  serverId: string,
  input: { certificate_id: string; kind: CertificateKind },
): Promise<ServerCertificateBind> {
  return sendJson<ServerCertificateBind>(
    `/api/${scope}/servers/${serverId}/certificates`,
    "POST",
    input,
  );
}

export function unbindServerCertificate(
  scope: string,
  serverId: string,
  bindId: string,
): Promise<ServerCertificateBind> {
  return sendJson<ServerCertificateBind>(
    `/api/${scope}/servers/${serverId}/certificates/${bindId}`,
    "DELETE",
  );
}

export type ChannelId =
  | "nginx"
  | "agent"
  | "haproxy"
  | "rules"
  | "ip"
  | "auth"
  | "captcha"
  | "json"
  | "action"
  | "counter"
  | "vlai"
  | "rewrite";

export type ChannelState =
  | "ok"
  | "empty"
  | "dirty"
  | "no_effect"
  | "broken"
  | "never"
  | "converging"
  | "failed"
  | "foreign"
  | "silent"
  | "nobody"
  | "unmanaged";

export type ConsumerState =
  | "ok"
  | "stale"
  | "pending"
  | "failed"
  | "foreign"
  | "silent";

export interface ChannelPlanError {
  code: string;
  message: string;
  params?: Record<string, string | number>;
}

export interface ChannelBlocked {
  code: string;
  message: string;
  before?: ChannelId;
}

export interface ChannelConsumer {
  uuid: string;
  label: string;
  state: ConsumerState;
  hash?: string;
  rev?: number;
  apply?: string;
}

export interface ChannelView {
  id: ChannelId;
  state: ChannelState;
  dirty: boolean;
  sourceChanged: boolean;
  delivered: boolean;
  draft: {
    hash: string;
    sourceHash: string;
    ok: boolean;
    empty: boolean;
    errors: ChannelPlanError[];
    at: string;
  } | null;
  desired: { hash: string; rev: number; at?: string } | null;
  consumers: ChannelConsumer[];
  counts: Record<ConsumerState, number>;
  blocked: ChannelBlocked[];
  key: string;
  send: string;
  page: string;
  inspector: string | null;
}

export interface ConvergenceSnapshot {
  v: 1;
  at: string;
  seq: number;
  scope: string;
  lamp: "red" | "yellow" | "green";
  worst: ChannelState;
  channels: ChannelView[];
}

export function fetchConvergence(scope: string): Promise<ConvergenceSnapshot> {
  return getJson<ConvergenceSnapshot>(`/api/${scope}/convergence`);
}

export function refreshConvergence(
  scope: string,
  channel?: ChannelId,
): Promise<ConvergenceSnapshot> {
  const tail = channel === undefined ? "" : `?channel=${channel}`;
  return sendJson<ConvergenceSnapshot>(
    `/api/${scope}/convergence/refresh${tail}`,
    "POST",
  );
}

export function sendChannel(scope: string, channel: ChannelView): Promise<unknown> {
  return sendJson(`/api/${scope}/${channel.send}`, "POST");
}

export interface NginxConfigSendResult {
  sha256: string;
  v: 1;
  rev: number;
  config_hash: string;
  store_refs: number;
}

export function sendNginxConfig(scope: string): Promise<NginxConfigSendResult> {
  return sendJson<NginxConfigSendResult>(`/api/${scope}/config/send`, "POST");
}

export function fetchNginxPreview(scope: string): Promise<string> {
  return getText(`/api/${scope}/config/preview`);
}

export type AgentArchiveKind = "headers" | "args" | "body";

export interface AgentBatchWire {
  size?: number;
  timeout_ms?: number;
}

export interface AgentSettingsWire {
  s3?: {
    endpoint?: string;
    region?: string;
    buckets?: Partial<Record<AgentArchiveKind, string>>;
  };
  archive?: {
    workers?: number;
    queue?: number;
    timeout_ms?: number;
    batch?: Partial<Record<AgentArchiveKind, AgentBatchWire>>;
  };
}

export interface AgentSettingsDoc {
  settings: AgentSettingsWire;
  updated_at: string | null;
  sha256: string;
}

export interface AgentConfDesired {
  rev: number | null;
  sha256: string | null;
}

export function fetchAgentSettings(scope: string): Promise<AgentSettingsDoc> {
  return getJson<AgentSettingsDoc>(`/api/${scope}/agent`);
}

export function saveAgentSettings(
  scope: string,
  settings: AgentSettingsWire,
): Promise<AgentSettingsDoc> {
  return sendJson<AgentSettingsDoc>(`/api/${scope}/agent`, "PUT", settings);
}

export function sendAgentSettings(scope: string): Promise<AgentConfDesired> {
  return sendJson<AgentConfDesired>(`/api/${scope}/agent/send`, "POST");
}

export function fetchAgentDesired(scope: string): Promise<AgentConfDesired> {
  return getJson<AgentConfDesired>(`/api/${scope}/agent/desired`);
}

export type HaproxyBalance = "roundrobin" | "leastconn" | "source";

export interface HaproxyServerWire {
  name: string;
  host: string;
  port?: number;
}

export interface HaproxyFrontendWire {
  name: string;
  port: number;
  mode: "http" | "tcp";
  server_port?: number;
  send_proxy?: boolean;
  addresses?: string[];
}

export interface HaproxySettingsWire {
  process?: {
    maxconn?: number;
    bufsize?: number;
  };
  timeouts?: {
    connect_ms?: number;
    client_ms?: number;
    server_ms?: number;
    keepalive_ms?: number;
    tunnel_ms?: number;
  };
  frontend?: {
    port?: number;
  };
  frontends?: HaproxyFrontendWire[];
  backend?: {
    balance?: HaproxyBalance;
    check?: {
      path?: string;
      status?: number;
      inter_ms?: number;
    };
    servers?: HaproxyServerWire[];
  };
  stats?: {
    enabled?: boolean;
    port?: number;
  };
  docker_dns?: boolean;
}

export interface HaproxySettingsDoc {
  settings: HaproxySettingsWire;
  updated_at: string | null;
  sha256: string;
}

export interface HaproxyConfDesired {
  rev: number | null;
  sha256: string | null;
}

export function fetchHaproxySettings(scope: string): Promise<HaproxySettingsDoc> {
  return getJson<HaproxySettingsDoc>(`/api/${scope}/haproxy`);
}

export function saveHaproxySettings(
  scope: string,
  settings: HaproxySettingsWire,
): Promise<HaproxySettingsDoc> {
  return sendJson<HaproxySettingsDoc>(`/api/${scope}/haproxy`, "PUT", settings);
}

export function sendHaproxySettings(scope: string): Promise<HaproxyConfDesired> {
  return sendJson<HaproxyConfDesired>(`/api/${scope}/haproxy/send`, "POST");
}

export function fetchHaproxyDesired(scope: string): Promise<HaproxyConfDesired> {
  return getJson<HaproxyConfDesired>(`/api/${scope}/haproxy/desired`);
}

export type InheritFrom = "http" | "server";
export type InheritSection = "waf" | "nginx";

export interface InheritedField {
  section: InheritSection;
  key: string;
  from: InheritFrom;
  value: unknown;
}

export interface InheritanceLayer {
  uuid: string;
  name: string;
  waf: Record<string, unknown>;
  nginx: Record<string, unknown>;
}

export interface HttpInheritance {
  http: InheritanceLayer;
  inherited: InheritedField[];
}

export interface RouteInheritance extends HttpInheritance {
  server: InheritanceLayer;
}

export function fetchHttpInheritance(scope: string): Promise<HttpInheritance> {
  return getJson<HttpInheritance>(`/api/${scope}/http/inheritance`);
}

export function fetchServerInheritance(
  scope: string,
  uuid: string,
): Promise<HttpInheritance> {
  return getJson<HttpInheritance>(`/api/${scope}/servers/${uuid}/inheritance`);
}

export function fetchLocationInheritance(
  scope: string,
  uuid: string,
): Promise<RouteInheritance> {
  return getJson<RouteInheritance>(`/api/${scope}/locations/${uuid}/inheritance`);
}

export interface CatalogBundle {
  deny_responses: { name: string; type: string; status?: number; page?: string }[];
  log_formats: { name: string; kind: "nginx"; summary: string }[];
  datasets: {
    name: string;
    kind: string;
    type: string;
    active: boolean;
    in_nginx: boolean;
    ttl?: string;
    hash?: boolean;
  }[];
  inspectors: { name: string; subject: string; phases: string[] }[];
  subjects: string[];
  profiles: { name: string; kind: string }[];
  response_pages: { name: string }[];
  body_stores: { name: string; driver: string }[];
  upstreams: { uuid: string; name: string }[];
}

export function fetchCatalog(scope: string): Promise<CatalogBundle> {
  return getJson<CatalogBundle>(`/api/${scope}/catalog`);
}

export type PreviewNode =
  | { kind: "http" }
  | { kind: "server"; uuid: string }
  | { kind: "location"; uuid: string }
  | { kind: "upstream"; uuid: string };

export type PreviewDraft = {
  http?: {
    nginx?: Record<string, unknown>;
    nginx_main?: Record<string, unknown>;
    waf_http?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    raw?: boolean;
    raw_nginx?: string;
  };
  server?: {
    uuid: string;
    nginx?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    server_names?: string[];
    enabled?: boolean;
    raw?: boolean;
    raw_nginx?: string;
    listens?: { port_id: string; default_server?: boolean }[];
    certificates?: { certificate_id: string; kind: string }[];
  };
  upstream?: UpstreamInput & { uuid: string };
  location?: {
    uuid: string;
    server_id?: string;
    nginx?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    match?: string;
    path?: string;
    position?: number;
    enabled?: boolean;
    handler?: string;
    protocol?: string;
    upstream_id?: string | null;
    upstream_uri?: string | null;
    return_status?: number | null;
    return_page?: string | null;
    return_url?: string | null;
    raw?: boolean;
    raw_nginx?: string;
  };
};

export interface PreviewResult {
  text: string;
  errors: ChannelPlanError[];
  warnings?: { code: string; message: string }[];
}

export function previewConfig(
  scope: string,
  draft: PreviewDraft,
  node?: PreviewNode,
): Promise<PreviewResult> {
  return sendJson<PreviewResult>(`/api/${scope}/config/preview`, "POST", {
    draft,
    node,
  });
}

export type DenyResponseType = "http" | "grpc" | "websocket";

export interface DenyResponseUse {
  at: string;
  kind: "default" | "score" | "check" | "rate" | "ip_profile" | "auth" | "captcha" | "json" | "counter";
  by?: string;
}

export interface DenyResponseRow {
  uuid: string;
  name: string;
  type: DenyResponseType;
  spec: {
    status?: number;
    page?: string;
    message?: string;
    code?: number;
    reason?: string;
    params?: string[];
  };
  uses?: DenyResponseUse[];
}

export type StoreDriver = "redis";

export interface BodyStoreRow {
  uuid: string;
  name: string;
  driver: StoreDriver;
  url: string;
  spec: Record<string, string | number | boolean>;
}

export interface LogFormatRow {
  uuid: string;
  name: string;
  kind: "nginx";
  fields: string[];
  format: string;
}

export async function fetchDenyResponses(scope: string): Promise<DenyResponseRow[]> {
  const row = await getJson<{ deny_responses: DenyResponseRow[] }>(
    `/api/${scope}/deny-responses`,
  );
  return row.deny_responses;
}

export function saveDenyResponse(
  scope: string,
  id: string | null,
  input: Omit<DenyResponseRow, "uuid" | "uses">,
): Promise<DenyResponseRow> {
  return id === null
    ? sendJson(`/api/${scope}/deny-responses`, "POST", input)
    : sendJson(`/api/${scope}/deny-responses/${id}`, "PUT", input);
}

export function deleteDenyResponse(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/deny-responses/${id}`, "DELETE");
}

export async function fetchBodyStores(scope: string): Promise<BodyStoreRow[]> {
  const row = await getJson<{ body_stores: BodyStoreRow[] }>(`/api/${scope}/body-stores`);
  return row.body_stores;
}

export function saveBodyStore(
  scope: string,
  id: string | null,
  input: Pick<BodyStoreRow, "name" | "spec">,
): Promise<BodyStoreRow> {
  return id === null
    ? sendJson(`/api/${scope}/body-stores`, "POST", input)
    : sendJson(`/api/${scope}/body-stores/${id}`, "PUT", input);
}

export async function fetchLogFormats(scope: string): Promise<LogFormatRow[]> {
  const row = await getJson<{ log_formats: LogFormatRow[] }>(`/api/${scope}/log-formats`);
  return row.log_formats;
}

export function saveLogFormat(
  scope: string,
  id: string | null,
  input: Omit<LogFormatRow, "uuid">,
): Promise<LogFormatRow> {
  return id === null
    ? sendJson(`/api/${scope}/log-formats`, "POST", input)
    : sendJson(`/api/${scope}/log-formats/${id}`, "PUT", input);
}

export function deleteLogFormat(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/log-formats/${id}`, "DELETE");
}

export type AuthVerb = "reauth" | "skip";
export type AuthAxis = "request" | "session";

export type AuthOn = "authenticated" | "anonymous" | "invalid" | "forbidden" | "overload";

export interface AuthEventRule {
  on: AuthOn;
  at?: number | null;
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  group: string;
  phase?: string;
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  when: ArchiveOutcome[];
  list: string;
  write?: "addr" | "net" | "net_all" | "asn";
  ttlS: number;
  code: string;
}

export interface AuthPriorRule {
  from: string;
  accept: AuthVerb[];
  apply: AuthAxis[];
  codes: string[];
}

export interface AuthSourceDoc {
  login: { uri: string; title: string; note: string; page: string };
  session: {
    cookie: string;
    ttlS: number;
    renewAfterS: number;
    maxTtlS?: number;
    bind: string[];
    subnet: { v4: number; v6: number };
  };
  ticket: { cookie: string; ttlS: number };
  list: {
    sessions: string;
    cookie: string;
    ttlS: number;
    origin: string;
    graceS: number;
  };
  upstream: {
    user: string;
    groups: string;
    method: string;
    cookie: string;
    ttlS: number;
  };
  provider: string;
  identity: { from: string };
  providers: {
    local: { users: string } | null;
    code: {
      kind: "totp" | "static";
      digits: number;
      periodS: number;
      skew: number;
      codes: string[];
      users: string;
    } | null;
    ldap: {
      url: string;
      startTls: boolean;
      bind: "upn" | "dn_template" | "search";
      upnSuffix: string;
      dnTemplate: string;
      timeoutS: number;
      groups: string[];
      search: {
        base: string;
        filter: string;
        bindDn: string;
        passwordEnv: string;
        passwordStore: string | null;
      };
      tls: { caFile: string; insecureSkipVerify: boolean };
    } | null;
    ntlm: {
      url: string;
      domain: string;
      timeoutS: number;
      startTls: boolean;
      groups: string[];
      search: {
        base: string;
        filter: string;
        bindDn: string;
        passwordEnv: string;
        passwordStore: string | null;
      };
      tls: { caFile: string; insecureSkipVerify: boolean };
    } | null;
    jwt: AuthJwtProvider | null;
    app: AuthAppProvider | null;
  };
  lockout: { attempts: number; windowS: number; lockS: number };
  roster: { store: "redis" | "memory"; prefix: string };
}

export const AUTH_JWT_ALGS = [
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "none",
] as const;

export type AuthJwtAlg = (typeof AUTH_JWT_ALGS)[number];

export interface AuthJwtProvider {
  cookie: string;
  header: string;
  prefix: string;
  verify: {
    alg: AuthJwtAlg;
    key: string;
    secretEnv: string;
    issuer: string;
    audience: string;
    leewayS: number;
  };
  claims: { user: string; session: string; groups: string; issued: string; expiry: string };
}

export const AUTH_APP_FIELD_SOURCES = ["body.form", "body.json", "args", "header"] as const;

export type AuthAppFieldSource = (typeof AUTH_APP_FIELD_SOURCES)[number];

export interface AuthAppProvider {
  cookie: string;
  learn: {
    login: { uri: string; method: string };
    logout: { uri: string; method: string };
    success: {
      status: number[];
      cookieNew: boolean;
      json: { path: string; equals: string } | null;
    };
    user: { from: AuthAppFieldSource; field: string };
  };
}

export interface AuthSource {
  uuid: string;
  http_space_id: string;
  server_id: string | null;
  name: string;
  description: string;
  provider: string;
  doc: AuthSourceDoc;
  created_at: string;
  updated_at: string;
  uses?: { at: string; kind: string }[];
}

export interface AuthProfileDoc {
  source: string;
  gate: {
    redirectMethods: string[];
    redirectStatus: number;
    denyResponse: string;
    htmlOnly: boolean;
    groups: string[];
    forbiddenResponse: string;
    inline: boolean;
  };
  trigger: {
    prior: AuthPriorRule[];
    reauthAfterS: number;
  };
  rules: AuthEventRule[];
}

export interface AuthProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  source: string;
  doc: AuthProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_senders?: string[];
  sender_codes?: SenderCode[];
  modified?: boolean;
}

export async function fetchAuthProfiles(scope: string): Promise<AuthProfile[]> {
  const row = await getJson<{ profiles: AuthProfile[] }>(
    `/api/${scope}/auth/profiles`,
  );

  return row.profiles;
}

export function fetchAuthProfile(scope: string, id: string): Promise<AuthProfile> {
  return getJson<AuthProfile>(`/api/${scope}/auth/profiles/${id}`);
}

export function saveAuthProfile(
  scope: string,
  id: string | null,
  input: {
    name: string;
    description: string;
    doc: AuthProfileDoc;
  },
): Promise<AuthProfile> {
  return id === null
    ? sendJson<AuthProfile>(`/api/${scope}/auth/profiles`, "POST", input)
    : sendJson<AuthProfile>(`/api/${scope}/auth/profiles/${id}`, "PUT", input);
}

export async function fetchAuthSources(scope: string): Promise<AuthSource[]> {
  const row = await getJson<{ sources: AuthSource[] }>(`/api/${scope}/auth/sources`);

  return row.sources;
}

export function fetchAuthSource(scope: string, id: string): Promise<AuthSource> {
  return getJson<AuthSource>(`/api/${scope}/auth/sources/${id}`);
}

export function saveAuthSource(
  scope: string,
  id: string | null,
  input: {
    name: string;
    description: string;
    server_id: string | null;
    doc: AuthSourceDoc;
  },
): Promise<AuthSource> {
  return id === null
    ? sendJson<AuthSource>(`/api/${scope}/auth/sources`, "POST", input)
    : sendJson<AuthSource>(`/api/${scope}/auth/sources/${id}`, "PUT", input);
}

export function deleteAuthSource(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/auth/sources/${id}`, "DELETE");
}

export function deleteAuthProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/auth/profiles/${id}`, "DELETE");
}

export function restoreAuthProfile(scope: string, id: string): Promise<AuthProfile> {
  return sendJson<AuthProfile>(`/api/${scope}/auth/profiles/${id}/restore`, "POST");
}

export async function buildAuthUserLine(
  scope: string,
  input: { login: string; password: string; groups?: string[]; totp_store?: string },
): Promise<string> {
  const row = await sendJson<{ line: string }>(
    `/api/${scope}/auth/user-line`,
    "POST",
    input,
  );

  return row.line;
}

export interface AuthManifestFile {
  name: string;
  text: string;
}

export interface AuthManifest {
  v: number;
  rev: number;
  config_hash: string;
  sources: Record<string, { files: AuthManifestFile[] }>;
  profiles: Record<string, { files: AuthManifestFile[] }>;
}

export function sendAuthProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/auth/send`, "POST");
}

export function fetchAuthDesired(scope: string): Promise<AuthManifest> {
  return getJson(`/api/${scope}/auth/desired`);
}

export type CaptchaVerb = "challenge" | "skip" | "note";
export type CaptchaAccept = CaptchaVerb | "*";

export interface CaptchaPriorRule {
  from: string;
  accept: CaptchaAccept[];
  codes: string[];
}

export interface CaptchaBucketTier {
  max: number;
  loss: number;
  captchaAt: number;
  banAt: number;
}

export interface CaptchaBuckets {
  ip: CaptchaBucketTier;
  sess: CaptchaBucketTier;
  asnNet: CaptchaBucketTier;
  asnRouter: CaptchaBucketTier;
}

export type CaptchaOn =
  | "fail"
  | "pass"
  | "bucket_captcha"
  | "bucket_ban"
  | "cleared"
  | "uncleared"
  | "overload";

export interface CaptchaEventRule {
  on: CaptchaOn;
  at?: number | null;
  bucket: string;
  next: "" | "allow" | "challenge";
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  group: string;
  phase?: string;
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  when: ArchiveOutcome[];
  list: string;
  ttlS: number;
  write: "addr" | "net" | "net_all" | "asn" | "cid";
  charge: string;
  percent: number;
  code: string;
}

export interface CaptchaProviderRef {
  kind: string;
  length: number;
  audio: boolean;
}

export interface CaptchaExternalConfig {
  version: string;
  sitekey: string;
  secretEnv: string;
  secretStore: string | null;
  minScore: number;
  remoteip: boolean;
  timeoutS: number;
  onError: "fallback" | "allow" | "deny";
}

export interface CaptchaProfileDoc {
  path: string;
  title: string;
  note: string;
  page: string;
  trigger: {
    when: "always" | "buckets" | "never";
    prior: CaptchaPriorRule[];
  };
  buckets: CaptchaBuckets;
  rules: CaptchaEventRule[];
  gate: {
    redirectMethods: string[];
    redirectStatus: number;
    denyResponse: string;
    htmlOnly: boolean;
    inline: boolean;
  };
  provider: CaptchaProviderRef;
  fallback: CaptchaProviderRef | null;
  providerConfig: {
    image: { alphabet: string; languages: string[]; audioDir: string };
    turnstile: CaptchaExternalConfig;
    recaptcha: CaptchaExternalConfig;
    hcaptcha: CaptchaExternalConfig;
    smartcaptcha: CaptchaExternalConfig;
  };
  challenge: { cookie: string; ttlS: number };
  clearance: {
    cookie: string;
    idCookie: string;
    ttlS: number;
    bind: string[];
    subnet: { v4: number; v6: number };
    list: string;
    graceS: number;
  };
  fingerprint: { collect: boolean; canvas: boolean; farmAt: number; windowS: number };
  limits: {
    issuePerSubnet: string;
    verifyPerSubnet: string;
    pendingMax: number;
    providerBudget: string;
  };
  upstream: { header: string };
  roster: { store: "redis" | "memory"; prefix: string; revokeRefreshMs: number };
  languages: string[];
}

export interface CaptchaProfile {
  uuid: string;
  http_space_id: string;
  server_id: string | null;
  name: string;
  description: string;
  when: string;
  provider: string;
  fallback: string | null;
  doc: CaptchaProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_senders?: string[];
  sender_codes?: SenderCode[];
  modified?: boolean;
}

export async function fetchCaptchaProfiles(scope: string): Promise<CaptchaProfile[]> {
  const row = await getJson<{ profiles: CaptchaProfile[] }>(
    `/api/${scope}/captcha/profiles`,
  );

  return row.profiles;
}

export function fetchCaptchaProfile(scope: string, id: string): Promise<CaptchaProfile> {
  return getJson<CaptchaProfile>(`/api/${scope}/captcha/profiles/${id}`);
}

export function saveCaptchaProfile(
  scope: string,
  id: string | null,
  input: {
    name: string;
    description: string;
    server_id: string | null;
    doc: CaptchaProfileDoc;
  },
): Promise<CaptchaProfile> {
  return id === null
    ? sendJson<CaptchaProfile>(`/api/${scope}/captcha/profiles`, "POST", input)
    : sendJson<CaptchaProfile>(`/api/${scope}/captcha/profiles/${id}`, "PUT", input);
}

export function deleteCaptchaProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/captcha/profiles/${id}`, "DELETE");
}

export function restoreCaptchaProfile(
  scope: string,
  id: string,
): Promise<CaptchaProfile> {
  return sendJson<CaptchaProfile>(
    `/api/${scope}/captcha/profiles/${id}/restore`,
    "POST",
  );
}

export function sendCaptchaProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/captcha/send`, "POST");
}

export function fetchCaptchaDesired(scope: string): Promise<AuthManifest> {
  return getJson(`/api/${scope}/captcha/desired`);
}

export type JsonAction = "deny" | "score" | "allow";

export interface JsonRule {
  action: JsonAction;
  score: number;
}

export interface JsonRequestPhase {
  enabled: boolean;
  checks: { body: boolean; query: boolean; pathParams: boolean; headers: boolean };
  policy: Record<string, JsonRule>;
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonResponsePhase {
  enabled: boolean;
  checks: { body: boolean; status: boolean; contentType: boolean };
  policy: Record<string, JsonRule>;
  onlyTypes: string[];
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export type JsonDirection = "c2s" | "s2c" | "any";

export interface JsonFrameBinding {
  path: string;
  match: "exact" | "prefix";
  direction: JsonDirection;
  subprotocol: string;
  discriminator: { pointer: string; value: string } | null;
  schema: string;
}

export interface JsonFrameDirection {
  checks: { body: boolean };
  policy: Record<string, JsonRule>;
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonFramePhase {
  enabled: boolean;
  bindings: JsonFrameBinding[];
  c2s: JsonFrameDirection;
  s2c: JsonFrameDirection;
}

export interface JsonBinding {
  methods: string[];
  path: string;
  match: "exact" | "prefix";
  schema: string;
}

export type JsonVerb = "threshold" | "skip";

export interface JsonPriorRule {
  from: string;
  accept: JsonVerb[];
  codes: string[];
}

export type JsonOn = "deny" | "allow" | "score" | "level" | "overload" | "rule";

export interface OutcomeIf {
  counter: string;
  axis: string;
}

export interface JsonOutcome {
  section?: string;
  on: JsonOn;
  at: number | null;
  below: boolean;
  if?: OutcomeIf | null;
  eq: boolean;
  rules?: string[];
  tags?: string[];
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker?: string;
  group?: string;
  phase?: string;
  set?: "on" | "off" | "";
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  when?: ArchiveOutcome[];
  list: string;
  write: "addr" | "net" | "net_all" | "asn";
  ttlS: number;
  code: string;
}

export type OutcomeRule = JsonOutcome;

export interface ModsecPriorRule {
  from: string;
  accept: string[];
  codes: string[];
}

export interface ModsecPolicy {
  prior: ModsecPriorRule[];
  outcomes: OutcomeRule[];
}

export interface JsonProfileDoc {
  trigger: { prior: JsonPriorRule[] };
  description: string;
  schema: {
    kind: "openapi" | "jsonschema";
    source: string;
    basePath: string;
  };
  request: JsonRequestPhase;
  response: JsonResponsePhase;
  frame: JsonFramePhase;
  bindings: JsonBinding[];
  limits: { maxBody: number; maxDepth: number; maxErrors: number; cache: number };
  audit: { values: "off" | "hash"; paths: boolean };
}

export interface JsonProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  kind: string;
  source: string;
  doc: JsonProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_senders?: string[];
  sender_codes?: SenderCode[];
  modified?: boolean;
}

export async function fetchJsonProfiles(scope: string): Promise<JsonProfile[]> {
  const row = await getJson<{ profiles: JsonProfile[] }>(`/api/${scope}/json/profiles`);

  return row.profiles;
}

export function fetchJsonProfile(scope: string, id: string): Promise<JsonProfile> {
  return getJson<JsonProfile>(`/api/${scope}/json/profiles/${id}`);
}

export function saveJsonProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: JsonProfileDoc },
): Promise<JsonProfile> {
  return id === null
    ? sendJson<JsonProfile>(`/api/${scope}/json/profiles`, "POST", input)
    : sendJson<JsonProfile>(`/api/${scope}/json/profiles/${id}`, "PUT", input);
}

export function deleteJsonProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/json/profiles/${id}`, "DELETE");
}

export function restoreJsonProfile(scope: string, id: string): Promise<JsonProfile> {
  return sendJson<JsonProfile>(`/api/${scope}/json/profiles/${id}/restore`, "POST");
}

export function sendJsonProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/json/send`, "POST");
}

export function fetchJsonDesired(scope: string): Promise<AuthManifest> {
  return getJson(`/api/${scope}/json/desired`);
}

export const COUNTER_AXES = ["ip", "asn_net", "asn_router", "sess", "user", "conn"] as const;

export const COUNTER_DIRECTIONS = ["c2s", "s2c"] as const;
export const COUNTER_OPCODES = ["text", "binary", "continuation"] as const;

export type CounterAxis = (typeof COUNTER_AXES)[number];

export interface CounterAxisTier {
  max: number;
  loss: number;
}

export type CounterFill = "measure" | "note";

export interface CounterDeclSubjects {
  sess: { cookie: string };
  user: { from: string };
}

export interface CounterDecl {
  unit: string;
  fill: CounterFill;
  axes: Partial<Record<CounterAxis, CounterAxisTier>>;
  subjects: CounterDeclSubjects | null;
}

export interface CounterSharedDoc {
  counters: Record<string, CounterDecl>;
  subjects: { sess: { cookie: string }; user: { from: string } };
}

export interface CounterJudgeRule {
  counter: string;
  axis: CounterAxis;
  at: number;
  action: "score" | "deny";
  score: number;
  code: string;
}

export interface CounterMeasureIf {
  status: number[];
  contentType: string[];
  methods: string[];
  direction: string[];
  opcode: string[];
}

export type CounterSource = "const" | "regex_count" | "size_kb" | "bytes";

export interface CounterMeasureRule {
  if: CounterMeasureIf;
  source: CounterSource;
  regex: string;
  per: number | null;
  counter: string;
  axes: CounterAxis[];
}

export type CounterVerb = "threshold" | "skip" | "note";

export interface CounterPriorRule {
  from: string;
  accept: CounterVerb[];
  apply: string[];
  codes: string[];
  counter: string;
}

export interface CounterProfileDoc {
  description: string;
  trigger: { prior: CounterPriorRule[] };
  request: {
    enabled: boolean;
    judge: CounterJudgeRule[];
    denyResponse: string;
    outcomes: OutcomeRule[];
  };
  response: { enabled: boolean; measure: CounterMeasureRule[] };
  frame: CounterFramePhase;
}

export interface CounterFramePhase {
  enabled: boolean;
  measure: CounterMeasureRule[];
  judge: CounterJudgeRule[];
  denyResponse: string;
  outcomes: OutcomeRule[];
}

export interface CounterProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: CounterProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_senders?: string[];
  sender_codes?: SenderCode[];
  modified?: boolean;
}

export async function fetchCounterProfiles(scope: string): Promise<CounterProfile[]> {
  const row = await getJson<{ profiles: CounterProfile[] }>(
    `/api/${scope}/counter/profiles`,
  );

  return row.profiles;
}

export function fetchCounterProfile(scope: string, id: string): Promise<CounterProfile> {
  return getJson<CounterProfile>(`/api/${scope}/counter/profiles/${id}`);
}

export function saveCounterProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: CounterProfileDoc },
): Promise<CounterProfile> {
  return id === null
    ? sendJson<CounterProfile>(`/api/${scope}/counter/profiles`, "POST", input)
    : sendJson<CounterProfile>(`/api/${scope}/counter/profiles/${id}`, "PUT", input);
}

export function deleteCounterProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/counter/profiles/${id}`, "DELETE");
}

export function restoreCounterProfile(
  scope: string,
  id: string,
): Promise<CounterProfile> {
  return sendJson<CounterProfile>(
    `/api/${scope}/counter/profiles/${id}/restore`,
    "POST",
  );
}

export async function fetchCounterShared(scope: string): Promise<CounterSharedDoc> {
  const row = await getJson<{ shared: CounterSharedDoc }>(`/api/${scope}/counter/shared`);

  return row.shared;
}

export async function saveCounterShared(
  scope: string,
  shared: CounterSharedDoc,
): Promise<CounterSharedDoc> {
  const row = await sendJson<{ shared: CounterSharedDoc }>(
    `/api/${scope}/counter/shared`,
    "PUT",
    { shared },
  );

  return row.shared;
}

export function sendCounterProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/counter/send`, "POST");
}

export interface ActionProfileAsk {
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  group: string;
  phase?: string;
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  ttlS: number;
  when: ArchiveOutcome[];
  list?: string;
  write?: "addr" | "net" | "net_all" | "asn";
  code: string;
}

export interface ActionProfileMatch {
  pathPrefix: string;
  suffixes: string[];
  static: boolean;
  methods: string[];
}

export const ACTION_COND_OPS = ["in", "not_in", "eq", "ne"] as const;

export type ActionCondOp = (typeof ACTION_COND_OPS)[number];

export interface ActionCondition {
  name: string;
  value: string;
  op: ActionCondOp;
  dataset: string;
  text: string;
}

export interface ActionWhenItem {
  cond: string;
  not: boolean;
}

export type ActionWhenGroup = ActionWhenItem[];

export interface ActionProfileRule {
  name: string;
  on?: "" | "overload";
  at?: number | null;
  match: ActionProfileMatch;
  when?: ActionWhenGroup[];
  actions: ActionProfileAsk[];
}

export interface ActionProfileDoc {
  description: string;
  conditions?: ActionCondition[];
  rules: ActionProfileRule[];
}

export interface ActionProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: ActionProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_targets?: string[];
  modified?: boolean;
}

export async function fetchActionProfiles(scope: string): Promise<ActionProfile[]> {
  const row = await getJson<{ profiles: ActionProfile[] }>(
    `/api/${scope}/action/profiles`,
  );

  return row.profiles;
}

export function fetchActionProfile(scope: string, id: string): Promise<ActionProfile> {
  return getJson<ActionProfile>(`/api/${scope}/action/profiles/${id}`);
}

export function saveActionProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: ActionProfileDoc },
): Promise<ActionProfile> {
  return id === null
    ? sendJson<ActionProfile>(`/api/${scope}/action/profiles`, "POST", input)
    : sendJson<ActionProfile>(`/api/${scope}/action/profiles/${id}`, "PUT", input);
}

export function deleteActionProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/action/profiles/${id}`, "DELETE");
}

export function restoreActionProfile(
  scope: string,
  id: string,
): Promise<ActionProfile> {
  return sendJson<ActionProfile>(
    `/api/${scope}/action/profiles/${id}/restore`,
    "POST",
  );
}

export function sendActionProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/action/send`, "POST");
}

export const COOKIE_STATES = ["absent", "present", "invalid", "expired"] as const;

export type CookieState = (typeof COOKIE_STATES)[number];

export const COOKIE_SIGNS = ["hmac", "none"] as const;

export type CookieSign = (typeof COOKIE_SIGNS)[number];

export const COOKIE_PHASES = ["request", "response"] as const;

export type CookiePhase = (typeof COOKIE_PHASES)[number];

export const COOKIE_WRITES = ["addr", "net", "net_all", "asn", "cookie"] as const;

export type CookieWrite = (typeof COOKIE_WRITES)[number];

export interface CookieValue {
  from: string;
  default: string;
  random: number;
  maxLen: number;
}

export interface CookieDecl {
  name: string;
  path: string;
  maxAgeS: number;
  renewAfterS: number;
  sign: CookieSign;
  value: CookieValue;
}

export interface CookieProfileAsk extends Omit<ActionProfileAsk, "write"> {
  write?: CookieWrite;
  op?: "add" | "remove";
  cookie?: string;
}

export interface CookieProfileRule {
  name: string;
  match: ActionProfileMatch;
  phase?: CookiePhase | "";
  status?: number[];
  on?: CookieState | "overload" | "";
  at?: number | null;
  cookie?: string;
  tags?: string[];
  issue?: string;
  drop?: string;
  actions: CookieProfileAsk[];
}

export interface CookieProfileDoc {
  description: string;
  cookies?: CookieDecl[];
  rules: CookieProfileRule[];
}

export interface CookieProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: CookieProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_targets?: string[];
  modified?: boolean;
}

export async function fetchCookieProfiles(scope: string): Promise<CookieProfile[]> {
  const row = await getJson<{ profiles: CookieProfile[] }>(
    `/api/${scope}/cookie/profiles`,
  );

  return row.profiles;
}

export function fetchCookieProfile(scope: string, id: string): Promise<CookieProfile> {
  return getJson<CookieProfile>(`/api/${scope}/cookie/profiles/${id}`);
}

export function saveCookieProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: CookieProfileDoc },
): Promise<CookieProfile> {
  return id === null
    ? sendJson<CookieProfile>(`/api/${scope}/cookie/profiles`, "POST", input)
    : sendJson<CookieProfile>(`/api/${scope}/cookie/profiles/${id}`, "PUT", input);
}

export function deleteCookieProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/cookie/profiles/${id}`, "DELETE");
}

export function restoreCookieProfile(
  scope: string,
  id: string,
): Promise<CookieProfile> {
  return sendJson<CookieProfile>(
    `/api/${scope}/cookie/profiles/${id}/restore`,
    "POST",
  );
}

export function sendCookieProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/cookie/send`, "POST");
}

export type VlaiVerb = "threshold" | "skip";

export interface VlaiPriorRule {
  from: string;
  accept: VlaiVerb[];
  codes: string[];
}

export interface VlaiProfileDoc {
  description: string;
  overload: "allow" | "wait" | "deny";
  trigger: { prior: VlaiPriorRule[] };
  outcomes: OutcomeRule[];
}

export interface VlaiProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: VlaiProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_targets?: string[];
  unknown_senders?: string[];
  sender_codes?: SenderCode[];
  modified?: boolean;
}

export async function fetchVlaiProfiles(scope: string): Promise<VlaiProfile[]> {
  const row = await getJson<{ profiles: VlaiProfile[] }>(
    `/api/${scope}/vlai/profiles`,
  );

  return row.profiles;
}

export function fetchVlaiProfile(scope: string, id: string): Promise<VlaiProfile> {
  return getJson<VlaiProfile>(`/api/${scope}/vlai/profiles/${id}`);
}

export function saveVlaiProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: VlaiProfileDoc },
): Promise<VlaiProfile> {
  return id === null
    ? sendJson<VlaiProfile>(`/api/${scope}/vlai/profiles`, "POST", input)
    : sendJson<VlaiProfile>(`/api/${scope}/vlai/profiles/${id}`, "PUT", input);
}

export function deleteVlaiProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/vlai/profiles/${id}`, "DELETE");
}

export function restoreVlaiProfile(scope: string, id: string): Promise<VlaiProfile> {
  return sendJson<VlaiProfile>(`/api/${scope}/vlai/profiles/${id}/restore`, "POST");
}

export function sendVlaiProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/vlai/send`, "POST");
}

export type RewriteBodyOpKind =
  | "remove"
  | "replace"
  | "insert_before"
  | "insert_after";

export interface RewriteBodyOp {
  op: RewriteBodyOpKind;
  pattern: string;
  to: string;
  text: string;
  maxMatches: number | null;
}

export interface RewriteHeaderOp {
  op: "set" | "unset";
  name: string;
  value: string;
}

export type RewriteGroupOn = "response" | "frame";

export interface RewriteGroup {
  name: string;
  default: boolean;
  on: RewriteGroupOn;
  status: number[];
  contentType: string[];
  direction: string[];
  opcode: string[];
  body: RewriteBodyOp[];
  headers: RewriteHeaderOp[];
}

export interface RewritePriorRule {
  from: string;
  accept: ("mutate" | "skip")[];
  codes: string[];
}

export interface RewriteProfileDoc {
  description: string;
  denyResponse: string;
  groups: RewriteGroup[];
  prior: RewritePriorRule[];
}

export interface RewriteProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: RewriteProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_senders?: string[];
  sender_codes?: SenderCode[];
  modified?: boolean;
}

export async function fetchRewriteProfiles(scope: string): Promise<RewriteProfile[]> {
  const row = await getJson<{ profiles: RewriteProfile[] }>(
    `/api/${scope}/rewrite/profiles`,
  );

  return row.profiles;
}

export function fetchRewriteProfile(scope: string, id: string): Promise<RewriteProfile> {
  return getJson<RewriteProfile>(`/api/${scope}/rewrite/profiles/${id}`);
}

export function saveRewriteProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: RewriteProfileDoc },
): Promise<RewriteProfile> {
  return id === null
    ? sendJson<RewriteProfile>(`/api/${scope}/rewrite/profiles`, "POST", input)
    : sendJson<RewriteProfile>(`/api/${scope}/rewrite/profiles/${id}`, "PUT", input);
}

export function deleteRewriteProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/rewrite/profiles/${id}`, "DELETE");
}

export function restoreRewriteProfile(
  scope: string,
  id: string,
): Promise<RewriteProfile> {
  return sendJson<RewriteProfile>(`/api/${scope}/rewrite/profiles/${id}/restore`, "POST");
}

export function sendRewriteProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/rewrite/send`, "POST");
}
