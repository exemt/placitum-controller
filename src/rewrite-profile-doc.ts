import type {
  RewriteBodyOp,
  RewriteGroup,
  RewriteGroupOn,
  RewriteHeaderOp,
  RewritePriorRule,
  RewriteProfileDoc,
} from "./model/rewrite-profile.ts";
import { REWRITE_DIRECTIONS, REWRITE_OPCODES } from "./model/rewrite-profile.ts";

const BODY_OPS = new Set<RewriteBodyOp["op"]>([
  "remove",
  "replace",
  "insert_before",
  "insert_after",
]);

const GROUP_ON = new Set<RewriteGroupOn>(["response", "frame"]);
const DIRECTIONS = new Set<string>(REWRITE_DIRECTIONS);
const OPCODES = new Set<string>(REWRITE_OPCODES);

const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const HEADER_NAME_RE = /^[A-Za-z0-9._~-]{1,128}$/;
const RESPONSE_NAME_RE = /^[A-Za-z0-9._~-]{1,128}$/;

export const MAX_GROUPS = 16;
export const MAX_OPS_PER_GROUP = 32;
export const MAX_MATCHES_PER_OP = 4096;
export const MAX_PATTERN_LENGTH = 512;

const FORBIDDEN_HEADERS = new Set([
  "host",
  "authorization",
  "cookie",
  "content-length",
  "transfer-encoding",
  "content-encoding",
  "connection",
  "upgrade",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "location",
  "date",
]);

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

function intOrNull(value: unknown, path: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`${path} must be an integer`);
  }

  return value;
}

function ints(value: unknown, path: string): number[] {
  return arr(value, path).map((item, i) => {
    if (typeof item !== "number" || !Number.isInteger(item)) {
      fail(`${path}[${i}] must be an integer`);
    }

    return item;
  });
}

function strings(value: unknown, path: string): string[] {
  return arr(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

export function normalizeDoc(input: unknown): RewriteProfileDoc {
  const root = obj(input, "doc");

  return {
    description: str(root.description, "description"),
    denyResponse: str(
      root.denyResponse ?? root.deny_response,
      "deny_response",
      "rewrite_failed",
    ).trim(),
    groups: arr(root.groups, "groups").map((raw, i) =>
      normalizeGroup(raw, `groups[${i}]`),
    ),
    prior: arr(root.prior, "prior").map((raw, i) => {
      const row = obj(raw, `prior[${i}]`);

      return {
        from: str(row.from, `prior[${i}].from`).trim(),
        accept: strings(row.accept, `prior[${i}].accept`) as RewritePriorRule["accept"],
        codes: strings(row.codes, `prior[${i}].codes`).map((code) =>
          code.trim().toUpperCase(),
        ),
      } satisfies RewritePriorRule;
    }),
  };
}

function normalizeGroup(raw: unknown, path: string): RewriteGroup {
  const row = obj(raw, path);

  return {
    name: str(row.name, `${path}.name`).trim(),
    default: bool(row.default, `${path}.default`, false),
    on: str(row.on, `${path}.on`, "response") as RewriteGroupOn,
    status: ints(row.status, `${path}.status`),
    contentType: strings(row.contentType ?? row.content_type, `${path}.content_type`)
      .map((s) => s.trim())
      .filter((s) => s !== ""),
    direction: strings(row.direction, `${path}.direction`).map((s) => s.trim()),
    opcode: strings(row.opcode, `${path}.opcode`).map((s) => s.trim()),
    body: arr(row.body, `${path}.body`).map((op, i) => {
      const item = obj(op, `${path}.body[${i}]`);

      return {
        op: str(item.op, `${path}.body[${i}].op`) as RewriteBodyOp["op"],
        pattern: str(item.pattern, `${path}.body[${i}].pattern`),
        to: str(item.to, `${path}.body[${i}].to`),
        text: str(item.text, `${path}.body[${i}].text`),
        maxMatches: intOrNull(
          item.maxMatches ?? item.max_matches,
          `${path}.body[${i}].max_matches`,
        ),
      } satisfies RewriteBodyOp;
    }),
    headers: arr(row.headers, `${path}.headers`).map((op, i) => {
      const item = obj(op, `${path}.headers[${i}]`);

      return {
        op: str(item.op, `${path}.headers[${i}].op`) as RewriteHeaderOp["op"],
        name: str(item.name, `${path}.headers[${i}].name`).trim(),
        value: str(item.value, `${path}.headers[${i}].value`),
      } satisfies RewriteHeaderOp;
    }),
  };
}

export function validateDoc(input: unknown): RewriteProfileDoc {
  const doc = normalizeDoc(input);

  if (doc.denyResponse === "" || !RESPONSE_NAME_RE.test(doc.denyResponse)) {
    fail("deny_response must be a catalog entry name");
  }

  if (doc.groups.length > MAX_GROUPS) {
    fail(`groups: ${doc.groups.length} is above the ${MAX_GROUPS} limit`);
  }

  const seen = new Set<string>();

  doc.groups.forEach((group, i) => {
    if (!NAME_RE.test(group.name)) {
      fail(`groups[${i}]: bad name "${group.name}"`);
    }

    if (seen.has(group.name)) {
      fail(`groups[${i}]: duplicate name "${group.name}"`);
    }

    seen.add(group.name);
    checkGroup(group, `groups[${i}]`);
  });

  doc.prior.forEach((rule, i) => checkPrior(rule, i));

  return doc;
}

function checkGroup(group: RewriteGroup, at: string): void {
  if (group.body.length + group.headers.length === 0) {
    fail(`${at}: no operations: a group must change something`);
  }

  if (group.body.length + group.headers.length > MAX_OPS_PER_GROUP) {
    fail(`${at}: above the ${MAX_OPS_PER_GROUP} operations limit`);
  }

  if (!GROUP_ON.has(group.on)) {
    fail(`${at}.on must be response or frame`);
  }

  if (group.on === "frame") {
    if (group.headers.length > 0) {
      fail(`${at}: a frame has no headers to change`);
    }

    if (group.status.length + group.contentType.length > 0) {
      fail(`${at}: status and content_type are response selectors`);
    }

    for (const direction of group.direction) {
      if (!DIRECTIONS.has(direction)) {
        fail(`${at}.direction must be of ${REWRITE_DIRECTIONS.join(", ")}`);
      }
    }

    for (const opcode of group.opcode) {
      if (!OPCODES.has(opcode)) {
        fail(`${at}.opcode must be of ${REWRITE_OPCODES.join(", ")}`);
      }
    }
  } else if (group.direction.length + group.opcode.length > 0) {
    fail(`${at}: direction and opcode are frame selectors; set on: frame`);
  }

  for (const status of group.status) {
    if (status < 100 || status > 599) {
      fail(`${at}: status ${status} is not an http status`);
    }
  }

  group.body.forEach((op, i) => checkBodyOp(op, `${at}.body[${i}]`));
  group.headers.forEach((op, i) => checkHeaderOp(op, `${at}.headers[${i}]`));
}

function checkBodyOp(op: RewriteBodyOp, at: string): void {
  if (!BODY_OPS.has(op.op)) {
    fail(`${at}.op must be remove, replace, insert_before or insert_after`);
  }

  if (op.pattern === "") {
    fail(`${at}.pattern is empty`);
  }

  if (op.pattern.length > MAX_PATTERN_LENGTH) {
    fail(`${at}.pattern is longer than ${MAX_PATTERN_LENGTH} bytes`);
  }

  try {
    new RegExp(op.pattern);
  } catch (err) {
    fail(`${at}.pattern: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (op.op === "replace") {
    if (op.text !== "") {
      fail(`${at}: text is only for insert_*; replace uses to`);
    }
  } else if (op.to !== "") {
    fail(`${at}: to is only for replace`);
  }

  if ((op.op === "insert_before" || op.op === "insert_after") && op.text === "") {
    fail(`${at}: text is empty`);
  }

  if (
    op.maxMatches !== null &&
    (op.maxMatches < 1 || op.maxMatches > MAX_MATCHES_PER_OP)
  ) {
    fail(`${at}.max_matches is out of 1..${MAX_MATCHES_PER_OP}`);
  }
}

function checkHeaderOp(op: RewriteHeaderOp, at: string): void {
  if (op.op !== "set" && op.op !== "unset") {
    fail(`${at}.op must be set or unset`);
  }

  if (!HEADER_NAME_RE.test(op.name)) {
    fail(`${at}: bad header name "${op.name}"`);
  }

  const lower = op.name.toLowerCase();

  if (FORBIDDEN_HEADERS.has(lower)) {
    fail(`${at}: header "${op.name}" is not ours to change`);
  }

  if (op.op === "set" && lower === "set-cookie") {
    fail(`${at}: set-cookie is set by the cookie channel only`);
  }

  if (op.op === "unset" && lower === "content-type") {
    fail(`${at}: a response without a content type is not a thing`);
  }

  if (op.op === "set") {
    if (/[\r\n\0]/.test(op.value)) {
      fail(`${at}: header "${op.name}" value has CR, LF or NUL`);
    }
  } else if (op.value !== "") {
    fail(`${at}: value is only for set`);
  }
}

function checkPrior(rule: RewritePriorRule, i: number): void {
  const at = `prior[${i}]`;

  if (rule.from === "" || rule.from === "*") {
    fail(`${at}: from needs a named sender: both verbs can weaken`);
  }

  if (rule.accept.length === 0) {
    fail(`${at}: accept is required`);
  }

  for (const verb of rule.accept as string[]) {
    if (verb !== "mutate" && verb !== "skip") {
      fail(`${at}: "${verb}" is not ours to apply`);
    }
  }

  for (const code of rule.codes) {
    if (!CODE_RE.test(code)) {
      fail(`${at}: code "${code}" is not [A-Z][A-Z0-9_]{0,63}`);
    }
  }
}

export function renderProfileYaml(name: string, doc: RewriteProfileDoc): string {
  const out: string[] = [];

  out.push(`# Профиль rewrite ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица rewrite_profiles, раздел «Инспекторы» в UX.");
  out.push("");
  out.push('mode: "enforce"');

  if (doc.description !== "") {
    out.push(`description: ${q(doc.description)}`);
  }

  out.push(`deny_response: ${q(doc.denyResponse)}`);

  if (doc.groups.length > 0) {
    out.push("");
    out.push("groups:");

    for (const group of doc.groups) {
      out.push(`  - name: ${group.name}`);
      out.push(`    default: ${group.default ? "true" : "false"}`);

      if (group.on === "frame") {
        out.push("    on: frame");

        if (group.direction.length > 0) {
          out.push(`    direction: [${group.direction.join(", ")}]`);
        }

        if (group.opcode.length > 0) {
          out.push(`    opcode: [${group.opcode.join(", ")}]`);
        }
      }

      if (group.status.length > 0) {
        out.push(`    status: [${group.status.join(", ")}]`);
      }

      if (group.contentType.length > 0) {
        out.push(`    content_type: [${group.contentType.map(q).join(", ")}]`);
      }

      if (group.body.length > 0) {
        out.push("    body:");

        for (const op of group.body) {
          out.push(`      - op: ${op.op}`);
          out.push(`        pattern: ${q(op.pattern)}`);

          if (op.op === "replace") {
            out.push(`        to: ${q(op.to)}`);
          }

          if (op.op === "insert_before" || op.op === "insert_after") {
            out.push(`        text: ${q(op.text)}`);
          }

          if (op.maxMatches !== null) {
            out.push(`        max_matches: ${op.maxMatches}`);
          }
        }
      }

      if (group.headers.length > 0) {
        out.push("    headers:");

        for (const op of group.headers) {
          if (op.op === "set") {
            out.push(`      - { op: set, name: ${q(op.name)}, value: ${q(op.value)} }`);
          } else {
            out.push(`      - { op: unset, name: ${q(op.name)} }`);
          }
        }
      }
    }
  }

  if (doc.prior.length > 0) {
    out.push("");
    out.push("trigger:");
    out.push("  prior:");

    for (const rule of doc.prior) {
      out.push(`    - from: ${q(rule.from)}`);
      out.push(`      accept: [${rule.accept.join(", ")}]`);

      if (rule.codes.length > 0) {
        out.push(`      codes: [${rule.codes.map(q).join(", ")}]`);
      }
    }
  }

  out.push("");

  return out.join("\n");
}

function q(value: string): string {
  return JSON.stringify(value);
}
