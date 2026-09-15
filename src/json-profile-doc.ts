import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import {
  JSON_FRAME_OUTCOMES,
  JSON_REQUEST_OUTCOMES,
  JSON_RESPONSE_OUTCOMES,
  type JsonAction,
  type JsonAuditValues,
  type JsonBinding,
  type JsonDirection,
  type JsonFrameBinding,
  type JsonFrameDirection,
  type JsonFramePolicy,
  type JsonMatch,
  type JsonOutcome,
  type JsonPriorRule,
  type JsonProfileDoc,
  type JsonRequestPolicy,
  type JsonResponsePolicy,
  type JsonRule,
  type JsonSchemaKind,
} from "./model/json-profile.ts";

import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";

const KINDS = new Set<JsonSchemaKind>(["openapi", "jsonschema"]);
const ACTIONS = new Set<JsonAction>(["deny", "score", "allow"]);
const MATCHES = new Set<JsonMatch>(["exact", "prefix"]);
const DIRECTIONS = new Set<JsonDirection>(["c2s", "s2c", "any"]);
const AUDIT_VALUES = new Set<JsonAuditValues>(["off", "hash"]);

const JSON_ON = new Set<JsonOutcome["on"]>(["deny", "allow", "score", "overload"]);
const JSON_WRITES = new Set<JsonOutcome["write"]>(["addr", "net", "net_all", "asn"]);
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

const METHOD_RE = /^[A-Z]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MB = 1024 * 1024;

export class DocError extends Error {}

function fail(message: string): never {
  throw new DocError(message);
}

function obj(value: unknown, path: string): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }

  return value as Record<string, unknown>;
}

function arr(value: unknown, path: string): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }

  return value;
}

function str(value: unknown, path: string, def = ""): string {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "string") {
    fail(`${path} must be a string`);
  }

  return value;
}

function bool(value: unknown, path: string, def: boolean): boolean {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }

  return value;
}


function recordObject(value: unknown, path: string): RecordObject | null {
  if (value === undefined || value === null) {
    return null;
  }

  const row = obj(value, path);

  return {
    set: str(row.set, `${path}.set`).trim() as RecordObject["set"],
    limit: intOrNullOf(row.limit, `${path}.limit`),
    source: str(row.source, `${path}.source`).trim() as RecordObject["source"],
  };
}

function intOrNullOf(value: unknown, path: string): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const n = Number(value);

  if (!Number.isInteger(n)) {
    fail(`${path} must be an integer`);
  }

  return n;
}

function num(value: unknown, path: string, def: number): number {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a number`);
  }

  return value;
}

function action(value: unknown, path: string, def: JsonAction): JsonAction {
  const raw = str(value, path, def) as JsonAction;

  if (!ACTIONS.has(raw)) {
    fail(`${path} must be deny, score or allow`);
  }

  return raw;
}

function strings(value: unknown, path: string, def: string[]): string[] {
  if (value === undefined || value === null) {
    return [...def];
  }

  return arr(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

const REQUEST_DEFAULTS: Record<string, JsonRule> = {
  invalid: { action: "deny", score: 70 },
  unparsable: { action: "deny", score: 70 },
  truncated: { action: "deny", score: 70 },
  unknown_operation: { action: "allow", score: 70 },
  content_type: { action: "allow", score: 70 },
  unavailable: { action: "allow", score: 70 },
};

const RESPONSE_DEFAULTS: Record<string, JsonRule> = {
  invalid: { action: "score", score: 40 },
  unparsable: { action: "allow", score: 40 },
  truncated: { action: "allow", score: 40 },
  unknown_operation: { action: "allow", score: 40 },
  content_type: { action: "allow", score: 40 },
  unavailable: { action: "allow", score: 40 },
  status: { action: "score", score: 40 },
};

const FRAME_C2S_DEFAULTS: Record<string, JsonRule> = {
  invalid: { action: "deny", score: 70 },
  unparsable: { action: "deny", score: 70 },
  truncated: { action: "deny", score: 70 },
  unknown_operation: { action: "deny", score: 70 },
  opcode: { action: "deny", score: 70 },
  unavailable: { action: "allow", score: 70 },
};

const FRAME_S2C_DEFAULTS: Record<string, JsonRule> = {
  invalid: { action: "score", score: 40 },
  unparsable: { action: "allow", score: 40 },
  truncated: { action: "allow", score: 40 },
  unknown_operation: { action: "allow", score: 40 },
  opcode: { action: "allow", score: 40 },
  unavailable: { action: "allow", score: 40 },
};

const FRAME_DENY_RESPONSE = "ws_policy";

function rules(
  phase: Record<string, unknown>,
  outcomes: readonly string[],
  defaults: Record<string, JsonRule>,
): Record<string, JsonRule> {
  const table = obj(phase.policy, "policy");
  const legacyScore = num(phase.score, "score", NaN);

  const out: Record<string, JsonRule> = {};

  for (const outcome of outcomes) {
    const def = defaults[outcome];
    const raw = table[outcome];

    if (raw !== undefined && raw !== null) {
      const row = obj(raw, `policy.${outcome}`);

      out[outcome] = {
        action: action(row.action, `policy.${outcome}.action`, def.action),
        score: num(row.score, `policy.${outcome}.score`, def.score),
      };

      continue;
    }

    const legacy = phase[legacyKey(outcome)] ?? phase[legacyCamel(outcome)];

    out[outcome] = {
      action: action(legacy, `on_${outcome}`, def.action),
      score: Number.isNaN(legacyScore) ? def.score : legacyScore,
    };
  }

  return out;
}

function legacyKey(outcome: string): string {
  return `on_${outcome}`;
}

function legacyCamel(outcome: string): string {
  const camel = outcome.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

  return `on${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

function archiveWhen(value: unknown, path: string): ArchiveWhen[] {
  const words = strings(value, path, []).map((word) => word.trim().toLowerCase());

  for (const word of words) {
    if (!(ARCHIVE_WHEN as readonly string[]).includes(word)) {
      fail(`${path}: outcome must be allow or deny, got ${word}`);
    }
  }

  return ARCHIVE_WHEN.filter((name) => words.includes(name));
}

export function normalizeDoc(input: unknown): JsonProfileDoc {
  const root = obj(input, "doc");
  const schema = obj(root.schema, "schema");
  const request = obj(root.request, "request");
  const response = obj(root.response, "response");
  const frame = obj(root.frame, "frame");
  const limits = obj(root.limits, "limits");
  const audit = obj(root.audit, "audit");

  const requestChecks = obj(request.checks, "request.checks");
  const responseChecks = obj(response.checks, "response.checks");

  const trigger = obj(root.trigger, "trigger");

  const doc: JsonProfileDoc = {
    trigger: {
      prior: arr(trigger.prior, "trigger.prior").map((raw, i) => {
        const row = obj(raw, `trigger.prior[${i}]`);

        return {
          from: str(row.from, `trigger.prior[${i}].from`),
          accept: strings(row.accept, `trigger.prior[${i}].accept`, []) as JsonPriorRule["accept"],
          codes: strings(row.codes, `trigger.prior[${i}].codes`, []),
        } satisfies JsonPriorRule;
      }),
    },
    description: str(root.description, "description"),

    schema: {
      kind: str(schema.kind, "schema.kind", "openapi") as JsonSchemaKind,
      source: str(schema.source, "schema.source"),
      basePath: str(schema.basePath ?? schema.base_path, "schema.base_path"),
    },

    request: {
      enabled: bool(request.enabled, "request.enabled", true),
      checks: {
        body: bool(requestChecks.body, "request.checks.body", true),
        query: bool(requestChecks.query, "request.checks.query", true),
        pathParams: bool(
          requestChecks.pathParams ?? requestChecks.path_params,
          "request.checks.path_params",
          true,
        ),
        headers: bool(requestChecks.headers, "request.checks.headers", false),
      },
      policy: rules(request, JSON_REQUEST_OUTCOMES, REQUEST_DEFAULTS) as JsonRequestPolicy,
      denyResponse: str(
        request.denyResponse ?? request.deny_response,
        "request.deny_response",
        "json_invalid",
      ),
      outcomes: outcomesOf(request.outcomes, "request"),
    },

    response: {
      enabled: bool(response.enabled, "response.enabled", true),
      checks: {
        body: bool(responseChecks.body, "response.checks.body", true),
        status: bool(responseChecks.status, "response.checks.status", true),
        contentType: bool(
          responseChecks.contentType ?? responseChecks.content_type,
          "response.checks.content_type",
          true,
        ),
      },
      policy: rules(response, JSON_RESPONSE_OUTCOMES, RESPONSE_DEFAULTS) as JsonResponsePolicy,
      onlyTypes: strings(response.onlyTypes ?? response.only_types, "response.only_types", [
        "application/json",
        "+json",
      ]),
      denyResponse: str(
        response.denyResponse ?? response.deny_response,
        "response.deny_response",
        "json_response_invalid",
      ),
      outcomes: outcomesOf(response.outcomes, "response"),
    },

    frame: {
      enabled: bool(frame.enabled, "frame.enabled", false),
      bindings: arr(frame.bindings, "frame.bindings").map((raw, i) => {
        const row = obj(raw, `frame.bindings[${i}]`);
        const where = `frame.bindings[${i}]`;
        const disc = row.discriminator;

        return {
          path: str(row.path, `${where}.path`),
          match: str(row.match, `${where}.match`, "prefix") as JsonMatch,
          direction: str(row.direction, `${where}.direction`, "any") as JsonDirection,
          subprotocol: str(row.subprotocol, `${where}.subprotocol`),
          discriminator:
            disc === undefined || disc === null
              ? null
              : {
                  pointer: str(obj(disc, `${where}.discriminator`).pointer, `${where}.discriminator.pointer`),
                  value: str(obj(disc, `${where}.discriminator`).value, `${where}.discriminator.value`),
                },
          schema: str(row.schema, `${where}.schema`),
        } satisfies JsonFrameBinding;
      }),
      c2s: directionOf(obj(frame.c2s, "frame.c2s"), "frame.c2s", FRAME_C2S_DEFAULTS),
      s2c: directionOf(obj(frame.s2c, "frame.s2c"), "frame.s2c", FRAME_S2C_DEFAULTS),
    },

    bindings: arr(root.bindings, "bindings").map((raw, i) => {
      const row = obj(raw, `bindings[${i}]`);

      return {
        methods: strings(row.methods, `bindings[${i}].methods`, []).map((m) =>
          m.trim().toUpperCase(),
        ),
        path: str(row.path, `bindings[${i}].path`),
        match: str(row.match, `bindings[${i}].match`, "prefix") as JsonMatch,
        schema: str(row.schema, `bindings[${i}].schema`),
      } satisfies JsonBinding;
    }),

    limits: {
      maxBody: num(limits.maxBody ?? limits.max_body, "limits.max_body", MB),
      maxDepth: num(limits.maxDepth ?? limits.max_depth, "limits.max_depth", 64),
      maxErrors: num(limits.maxErrors ?? limits.max_errors, "limits.max_errors", 20),
      cache: num(limits.cache, "limits.cache", 4096),
    },

    audit: {
      values: str(audit.values, "audit.values", "off") as JsonAuditValues,
      paths: bool(audit.paths, "audit.paths", true),
    },
  };

  return doc;
}

function directionOf(
  raw: Record<string, unknown>,
  where: string,
  defaults: Record<string, JsonRule>,
): JsonFrameDirection {
  const checks = obj(raw.checks, `${where}.checks`);

  return {
    checks: { body: bool(checks.body, `${where}.checks.body`, true) },
    policy: rules(raw, JSON_FRAME_OUTCOMES, defaults) as JsonFramePolicy,
    denyResponse: str(
      raw.denyResponse ?? raw.deny_response,
      `${where}.deny_response`,
      FRAME_DENY_RESPONSE,
    ),
    outcomes: outcomesOf(raw.outcomes, where),
  };
}

function outcomesOf(raw: unknown, phase: string): JsonOutcome[] {
  return arr(raw, `${phase}.outcomes`).map((item, i) => {
    const row = obj(item, `${phase}.outcomes[${i}]`);
    const where = `${phase}.outcomes[${i}]`;

    const at = row.at === undefined || row.at === null ? null : num(row.at, `${where}.at`, 0);
    const delta =
      row.delta === undefined || row.delta === null ? null : num(row.delta, `${where}.delta`, 0);
    const value =
      row.value === undefined || row.value === null ? null : num(row.value, `${where}.value`, 0);

    return {
      on: str(row.on, `${where}.on`, "score") as JsonOutcome["on"],
      at,
      below: bool(row.below, `${where}.below`, false),
      eq: bool(row.eq, `${where}.eq`, false),
      to: str(row.to, `${where}.to`),
      do: str(row.do, `${where}.do`),
      apply: str(row.apply, `${where}.apply`),
      delta,
      value,
      counter: str(row.counter, `${where}.counter`),
      marker: str(row.marker, `${where}.marker`),
      group: str(row.group, `${where}.group`),
      phase: str(row.phase, `${where}.phase`),
      set: str(row.set, `${where}.set`) as JsonOutcome["set"],
      headers: recordObject(row.headers, `${where}.headers`),
      args: recordObject(row.args, `${where}.args`),
      body: recordObject(row.body, `${where}.body`),
      when: archiveWhen(row.when, `${where}.when`),
      list: str(row.list, `${where}.list`),
      write: str(row.write, `${where}.write`, "addr") as JsonOutcome["write"],
      ttlS: num(row.ttlS ?? row.ttl_s, `${where}.ttl_s`, 0),
      code: str(row.code, `${where}.code`),
    } satisfies JsonOutcome;
  });
}

function checkOutcome(outcome: JsonOutcome, i: number, phase: string): void {
  const where = `${phase}.outcomes[${i}]`;

  if (!JSON_ON.has(outcome.on)) {
    fail(`${where}.on must be deny, allow, score or overload`);
  }

  if (outcome.on === "score") {
    if (outcome.at === null) {
      fail(`${where}: on: score needs at`);
    } else if (outcome.at < 0 || outcome.at > 100) {
      fail(`${where}.at is out of 0..100`);
    }

    if (outcome.below && outcome.eq) {
      fail(`${where}: below and eq are mutually exclusive`);
    }
  } else if (outcome.on === "overload") {
    if (phase !== "request") {
      fail(`${where}: on: overload is only for the request section`);
    }

    checkOverloadAt(outcome.at, where, fail);

    if (outcome.below || outcome.eq) {
      fail(`${where}: below and eq are only for on: score`);
    }
  } else if (outcome.at !== null || outcome.below || outcome.eq) {
    fail(`${where}: at, below and eq are only for on: score`);
  }

  if (outcome.code !== "" && !CODE_RE.test(outcome.code)) {
    fail(`${where}.code is not a valid reason code`);
  }

  const asks = outcome.do !== "";

  if (asks && outcome.list !== "") {
    fail(`${where}: do and list are mutually exclusive`);
  }

  if (!asks) {
    if (outcome.list === "") {
      fail(`${where}: neither do nor list`);
    }

    if (!JSON_WRITES.has(outcome.write)) {
      fail(`${where}.write must be addr, net, net_all or asn`);
    }

    if (outcome.ttlS <= 0) {
      fail(`${where}: list needs ttl`);
    }

    return;
  }

  checkAsk(where, outcome, {
    fail,
    onDeny: outcome.on === "deny",
    frame: phase.startsWith("frame"),
  });
}


export function validateDoc(input: unknown): JsonProfileDoc {
  const doc = normalizeDoc(input);

  if (!AUDIT_VALUES.has(doc.audit.values)) {
    fail("audit.values must be off or hash");
  }

  doc.trigger.prior.forEach(checkPrior);

  doc.request.outcomes.forEach((o, i) => checkOutcome(o, i, "request"));
  doc.response.outcomes.forEach((o, i) => checkOutcome(o, i, "response"));
  doc.frame.c2s.outcomes.forEach((o, i) => checkOutcome(o, i, "frame.c2s"));
  doc.frame.s2c.outcomes.forEach((o, i) => checkOutcome(o, i, "frame.s2c"));

  if (!KINDS.has(doc.schema.kind)) {
    fail("schema.kind must be openapi or jsonschema");
  }

  if (doc.schema.source !== "" && !UUID_RE.test(doc.schema.source)) {
    fail("schema.source must be an object uuid");
  }

  if (doc.schema.basePath !== "" && !doc.schema.basePath.startsWith("/")) {
    fail("schema.base_path must start with /");
  }

  if (!doc.request.enabled && !doc.response.enabled && !doc.frame.enabled) {
    fail("all phases are disabled: the profile would do nothing");
  }

  validatePolicy("request", doc.request.policy, doc.request.enabled, doc.request.denyResponse);
  validatePolicy("response", doc.response.policy, doc.response.enabled, doc.response.denyResponse);
  validatePolicy("frame.c2s", doc.frame.c2s.policy, doc.frame.enabled, doc.frame.c2s.denyResponse);
  validatePolicy("frame.s2c", doc.frame.s2c.policy, doc.frame.enabled, doc.frame.s2c.denyResponse);

  if (doc.frame.enabled) {
    if (doc.schema.kind !== "jsonschema") {
      fail("frame is only valid with schema.kind jsonschema");
    }

    if (doc.frame.bindings.length === 0 && doc.schema.source === "") {
      fail("frame.bindings is required without a main schema");
    }

    doc.frame.bindings.forEach((binding, i) => {
      const where = `frame.bindings[${i}]`;

      if (!UUID_RE.test(binding.schema)) {
        fail(`${where}.schema must be an object uuid`);
      }

      if (!binding.path.startsWith("/")) {
        fail(`${where}.path must start with /`);
      }

      if (!MATCHES.has(binding.match)) {
        fail(`${where}.match must be exact or prefix`);
      }

      if (!DIRECTIONS.has(binding.direction)) {
        fail(`${where}.direction must be c2s, s2c or any`);
      }

      if (binding.discriminator !== null) {
        if (!binding.discriminator.pointer.startsWith("/")) {
          fail(`${where}.discriminator.pointer must be a JSON pointer starting with /`);
        }

        if (binding.discriminator.value === "") {
          fail(`${where}.discriminator.value is required`);
        }
      }
    });
  }

  if (doc.bindings.length > 0 && doc.schema.kind === "openapi") {
    fail("bindings are only valid with schema.kind jsonschema");
  }

  doc.bindings.forEach((binding, i) => {
    const where = `bindings[${i}]`;

    if (!UUID_RE.test(binding.schema)) {
      fail(`${where}.schema must be an object uuid`);
    }

    if (!binding.path.startsWith("/")) {
      fail(`${where}.path must start with /`);
    }

    if (!MATCHES.has(binding.match)) {
      fail(`${where}.match must be exact or prefix`);
    }

    for (const method of binding.methods) {
      if (!METHOD_RE.test(method)) {
        fail(`${where}.methods: ${method} is not a method`);
      }
    }
  });

  if (doc.limits.maxBody <= 0) {
    fail("limits.max_body must be positive");
  }

  if (doc.limits.maxDepth < 1) {
    fail("limits.max_depth must be positive");
  }

  if (doc.limits.maxErrors < 0) {
    fail("limits.max_errors must not be negative");
  }

  if (doc.limits.cache < 0) {
    fail("limits.cache must not be negative");
  }

  return doc;
}

function checkPrior(rule: JsonPriorRule, i: number): void {
  const at = `trigger.prior[${i}]`;

  if (rule.from === "" || rule.from === "*") {
    fail(`${at}: from needs a named sender: both verbs can weaken`);
  }

  if (rule.accept.length === 0) {
    fail(`${at}: accept is required`);
  }

  for (const verb of rule.accept as string[]) {
    if (verb !== "threshold" && verb !== "skip") {
      fail(`${at}: "${verb}" is not ours to apply`);
    }
  }
}

function validatePolicy(
  phase: string,
  policy: Record<string, JsonRule>,
  enabled: boolean,
  denyResponse: string,
): void {
  if (!enabled) {
    return;
  }

  let denies = false;

  for (const [outcome, rule] of Object.entries(policy)) {
    if (!ACTIONS.has(rule.action)) {
      fail(`${phase}.policy.${outcome}.action must be deny, score or allow`);
    }

    if (rule.score < 0 || rule.score > 100) {
      fail(`${phase}.policy.${outcome}.score must be within 0..100`);
    }

    denies = denies || rule.action === "deny";
  }

  if (denies && denyResponse === "") {
    fail(`${phase}.deny_response is required when a policy is deny`);
  }
}

export function renderProfileYaml(
  name: string,
  doc: JsonProfileDoc,
  sources: Map<string, string>,
): string {
  const out: string[] = [];

  const sourceName = (id: string): string => {
    const found = sources.get(id);

    if (found === undefined) {
      fail(`schema ${id} is not resolved`);
    }

    return found;
  };

  out.push(`# Профиль контракта ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица json_profiles, раздел /json в UX.");
  out.push("");
  const idle =
    doc.schema.source === "" && doc.bindings.length === 0 && doc.frame.bindings.length === 0;
  out.push(`mode: ${idle ? "off" : "enforce"}`);
  out.push(`description: ${q(doc.description)}`);
  out.push("");

  if (doc.trigger.prior.length > 0) {
    out.push("trigger:");
    out.push("  prior:");

    for (const rule of doc.trigger.prior) {
      out.push(`    - from: ${q(rule.from)}`);
      out.push(`      accept: ${seq(rule.accept)}`);

      if (rule.codes.length > 0) {
        out.push(`      codes: ${seq(rule.codes)}`);
      }
    }

    out.push("");
  }

  out.push("schema:");
  out.push(`  kind: ${doc.schema.kind}`);
  out.push(`  source: ${q(doc.schema.source === "" ? "" : sourceName(doc.schema.source))}`);
  out.push(`  base_path: ${q(doc.schema.basePath)}`);
  out.push("");

  out.push("request:");
  out.push(`  enabled: ${doc.request.enabled}`);
  out.push("  checks:");
  out.push(`    body: ${doc.request.checks.body}`);
  out.push(`    query: ${doc.request.checks.query}`);
  out.push(`    path_params: ${doc.request.checks.pathParams}`);
  out.push(`    headers: ${doc.request.checks.headers}`);
  pushPolicy(out, JSON_REQUEST_OUTCOMES, doc.request.policy);
  out.push(`  deny_response: ${q(doc.request.denyResponse)}`);
  pushOutcomes(out, doc.request.outcomes);
  out.push("");

  out.push("response:");
  out.push(`  enabled: ${doc.response.enabled}`);
  out.push("  checks:");
  out.push(`    body: ${doc.response.checks.body}`);
  out.push(`    status: ${doc.response.checks.status}`);
  out.push(`    content_type: ${doc.response.checks.contentType}`);
  pushPolicy(out, JSON_RESPONSE_OUTCOMES, doc.response.policy);
  out.push(`  only_types: ${seq(doc.response.onlyTypes)}`);
  out.push(`  deny_response: ${q(doc.response.denyResponse)}`);
  pushOutcomes(out, doc.response.outcomes);
  out.push("");

  if (doc.frame.enabled) {
    out.push("frame:");
    out.push("  enabled: true");

    if (doc.frame.bindings.length > 0) {
      out.push("  bindings:");

      for (const binding of doc.frame.bindings) {
        out.push(`    - path: ${q(binding.path)}`);
        out.push(`      match: ${binding.match}`);
        out.push(`      direction: ${binding.direction}`);

        if (binding.subprotocol !== "") {
          out.push(`      subprotocol: ${q(binding.subprotocol)}`);
        }

        if (binding.discriminator !== null) {
          out.push(
            `      discriminator: { pointer: ${q(binding.discriminator.pointer)}, ` +
              `value: ${q(binding.discriminator.value)} }`,
          );
        }

        out.push(`      schema: ${q(sourceName(binding.schema))}`);
      }
    }

    for (const [name, dir] of [
      ["c2s", doc.frame.c2s],
      ["s2c", doc.frame.s2c],
    ] as const) {
      out.push(`  ${name}:`);
      out.push("    checks:");
      out.push(`      body: ${dir.checks.body}`);
      pushPolicy(out, JSON_FRAME_OUTCOMES, dir.policy, "    ");
      out.push(`    deny_response: ${q(dir.denyResponse)}`);
      pushOutcomes(out, dir.outcomes, "    ");
    }

    out.push("");
  }

  if (doc.bindings.length > 0) {
    out.push("bindings:");

    for (const binding of doc.bindings) {
      out.push(`  - path: ${q(binding.path)}`);
      out.push(`    match: ${binding.match}`);

      if (binding.methods.length > 0) {
        out.push(`    methods: ${seq(binding.methods)}`);
      }

      out.push(`    schema: ${q(sourceName(binding.schema))}`);
    }

    out.push("");
  }

  out.push("limits:");
  out.push(`  max_body: ${q(size(doc.limits.maxBody))}`);
  out.push(`  max_depth: ${doc.limits.maxDepth}`);
  out.push(`  max_errors: ${doc.limits.maxErrors}`);
  out.push(`  cache: ${doc.limits.cache}`);
  out.push("");

  out.push("audit:");
  out.push(`  values: ${q(doc.audit.values)}`);
  out.push(`  paths: ${doc.audit.paths}`);
  out.push("");

  return out.join("\n");
}

function pushOutcomes(out: string[], outcomes: readonly JsonOutcome[], indent = "  "): void {
  if (outcomes.length === 0) {
    return;
  }

  const i1 = indent;
  const i2 = indent + "  ";
  const i3 = indent + "    ";

  out.push(`${i1}outcomes:`);

  for (const o of outcomes) {
    out.push(`${i2}- on: ${o.on}`);

    if (o.on === "overload" && o.at !== null) {
      out.push(`${i3}at: ${o.at}`);
    }

    if (o.on === "score" && o.at !== null) {
      out.push(`${i3}at: ${o.at}`);

      if (o.below) {
        out.push(`${i3}below: true`);
      }

      if (o.eq) {
        out.push(`${i3}eq: true`);
      }
    }

    if (o.do !== "") {
      if (o.to !== "") {
        out.push(`${i3}to: ${q(o.to)}`);
      }

      out.push(`${i3}do: ${o.do}`);

      if (o.apply !== "") {
        out.push(`${i3}apply: ${o.apply}`);
      }

      if (o.delta !== null) {
        out.push(`${i3}delta: ${o.delta}`);
      }

      if (o.value !== null) {
        out.push(`${i3}value: ${o.value}`);
      }

      if (o.counter !== "") {
        out.push(`${i3}counter: ${q(o.counter)}`);
      }

      if (o.marker !== "") {
        out.push(`${i3}marker: ${q(o.marker)}`);
      }

      if (o.group !== "") {
        out.push(`${i3}group: ${q(o.group)}`);
        out.push(`${i3}set: ${o.set}`);
      }

      if ((o.phase ?? "") !== "") {
        out.push(`${i3}phase: ${o.phase}`);
      }

      if (o.do === "audit" || o.do === "archive") {
        out.push(`${i3}set: ${o.set}`);

        if (o.set === "on") {
          if (o.do === "archive" && o.ttlS > 0) {
            out.push(`${i3}ttl: ${q(ttl(o.ttlS))}`);
          }

          if (o.do === "archive" && o.when.length > 0) {
            out.push(`${i3}when: ${seq(o.when)}`);
          }

          for (const name of RECORD_OBJECTS) {
            const spec = o[name];

            if (spec !== null) {
              out.push(`${i3}${name}: ${recordObjectYaml(spec)}`);
            }
          }
        }
      }
    } else {
      out.push(`${i3}list: ${q(o.list)}`);

      if (o.write !== "addr") {
        out.push(`${i3}write: ${o.write}`);
      }

      out.push(`${i3}ttl: ${q(ttl(o.ttlS))}`);
    }

    if (o.code !== "") {
      out.push(`${i3}code: ${q(o.code)}`);
    }
  }
}

function ttl(seconds: number): string {
  if (seconds % 86400 === 0) {
    return `${seconds / 86400}d`;
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
}

function pushPolicy(
  out: string[],
  outcomes: readonly string[],
  policy: Record<string, JsonRule>,
  indent = "  ",
): void {
  out.push(`${indent}policy:`);

  const width = Math.max(...outcomes.map((name) => name.length)) + 1;

  for (const outcome of outcomes) {
    const rule = policy[outcome];
    const pad = " ".repeat(width - outcome.length);

    out.push(
      rule.action === "score"
        ? `${indent}  ${outcome}:${pad}{ action: score, score: ${rule.score} }`
        : `${indent}  ${outcome}:${pad}{ action: ${rule.action} }`,
    );
  }
}

function size(bytes: number): string {
  const units: [number, string][] = [
    [1024 * 1024 * 1024, "g"],
    [1024 * 1024, "m"],
    [1024, "k"],
  ];

  for (const [unit, suffix] of units) {
    if (bytes >= unit && bytes % unit === 0) {
      return `${bytes / unit}${suffix}`;
    }
  }

  return String(bytes);
}


function recordObjectYaml(spec: RecordObject): string {
  const parts: string[] = [];

  if (spec.set !== "") {
    parts.push(`set: ${spec.set}`);
  }

  if (spec.limit !== null && spec.limit > 0) {
    parts.push(`limit: ${spec.limit}`);
  }

  if (spec.source !== "") {
    parts.push(`source: ${spec.source}`);
  }

  return `{ ${parts.join(", ")} }`;
}

function q(value: string): string {
  return JSON.stringify(value);
}

function seq(values: string[]): string {
  return `[${values.map(q).join(", ")}]`;
}
