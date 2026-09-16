import {
  arr,
  bool,
  duration,
  fail,
  list,
  num,
  obj,
  q,
  seconds,
  seq,
  str,
} from "./auth-doc-util.ts";
import {
  AUTH_ONS,
  type AuthAxis,
  type AuthEventRule,
  type AuthPriorRule,
  type AuthProfileDoc,
} from "./model/auth-profile.ts";
import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";

export { DocError } from "./auth-doc-util.ts";

const REDIRECT_STATUS = new Set([302, 303, 307]);
const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const LIST_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function recordObject(value: unknown, path: string): RecordObject | null {
  if (value === undefined || value === null) {
    return null;
  }

  const row = obj(value, path);
  const limit = row.limit === undefined || row.limit === null || row.limit === ""
    ? null
    : Number(row.limit);

  if (limit !== null && !Number.isInteger(limit)) {
    fail(`${path}.limit must be an integer`);
  }

  return {
    set: str(row.set, `${path}.set`).trim() as RecordObject["set"],
    limit,
    source: str(row.source, `${path}.source`).trim() as RecordObject["source"],
  };
}

function archiveWhen(value: unknown, path: string): ArchiveWhen[] {
  const words = list(value, path).map((word) => word.trim().toLowerCase());

  for (const word of words) {
    if (!(ARCHIVE_WHEN as readonly string[]).includes(word)) {
      fail(`${path}: outcome must be allow or deny, got ${word}`);
    }
  }

  return ARCHIVE_WHEN.filter((name) => words.includes(name));
}

function eventRuleOf(raw: unknown, path: string): AuthEventRule {
  const r = obj(raw, path);

  return {
    on: str(r.on, `${path}.on`) as AuthEventRule["on"],
    at: r.at === undefined || r.at === null ? null : num(r.at, `${path}.at`, 0),
    to: str(r.to, `${path}.to`),
    do: str(r.do, `${path}.do`),
    apply: str(r.apply, `${path}.apply`),
    delta: r.delta === undefined || r.delta === null ? null : num(r.delta, `${path}.delta`, 0),
    value: r.value === undefined || r.value === null ? null : num(r.value, `${path}.value`, 0),
    counter: str(r.counter, `${path}.counter`),
    marker: str(r.marker, `${path}.marker`),
    group: str(r.group, `${path}.group`),
    phase: str(r.phase, `${path}.phase`),
    set: str(r.set, `${path}.set`) as AuthEventRule["set"],
    headers: recordObject(r.headers, `${path}.headers`),
    args: recordObject(r.args, `${path}.args`),
    body: recordObject(r.body, `${path}.body`),
    when: archiveWhen(r.when, `${path}.when`),
    list: str(r.list, `${path}.list`),
    write: str(r.write, `${path}.write`, "addr") as AuthEventRule["write"],
    ttlS: num(r.ttlS ?? r.ttl_s, `${path}.ttl_s`, 0),
    code: str(r.code, `${path}.code`),
  };
}

const WRITES = new Set<AuthEventRule["write"]>(["addr", "net", "net_all", "asn"]);

function checkEventRule(rule: AuthEventRule, i: number): void {
  const at = `rules[${i}]`;

  if (!(AUTH_ONS as readonly string[]).includes(rule.on)) {
    fail(`${at}: on must be authenticated, anonymous, invalid, forbidden or overload`);
  }

  if (rule.on === "overload") {
    checkOverloadAt(rule.at, at, fail);
  } else if ((rule.at ?? null) !== null) {
    fail(`${at}: at is only for on: overload`);
  }

  if ((rule.do === "") === (rule.list === "")) {
    fail(`${at}: exactly one of do or list`);
  }

  if (rule.do !== "") {
    if (rule.apply === "" && rule.do !== "note") {
      rule.apply = rule.do === "reauth" ? "session" : "request";
    }

    checkAsk(at, rule, {
      fail,
      onDeny: rule.on !== "authenticated" && rule.on !== "overload",
      normalize: true,
    });

    if (rule.apply === "response") {
      fail(`${at}: apply response is not for the gate: it stands on the request phase only`);
    }

    if (rule.ttlS !== 0 && rule.do !== "archive") {
      fail(`${at}: ttl is only for a list write or do: archive`);
    }

    if (rule.write !== "addr") {
      fail(`${at}: write is only for a list write`);
    }
  } else {
    if (!LIST_RE.test(rule.list)) {
      fail(`${at}: bad list name`);
    }

    if (!WRITES.has(rule.write)) {
      fail(`${at}.write must be addr, net, net_all or asn`);
    }

    if (rule.ttlS <= 0) {
      fail(`${at}: ttl is required for a list write`);
    }
  }

  if (rule.code !== "" && !/^[A-Z][A-Z0-9_]{0,63}$/.test(rule.code)) {
    fail(`${at}: code is not [A-Z][A-Z0-9_]*`);
  }
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

function priorOf(raw: unknown, path: string): AuthPriorRule {
  const r = obj(raw, path);

  return {
    from: str(r.from, `${path}.from`, "*"),
    accept: list(r.accept, `${path}.accept`) as AuthPriorRule["accept"],
    apply: list(r.apply, `${path}.apply`) as AuthPriorRule["apply"],
    codes: list(r.codes, `${path}.codes`),
  };
}

export function normalizeDoc(raw: unknown): AuthProfileDoc {
  const d = obj(raw, "doc");

  const trigger = obj(d.trigger, "trigger");
  const gate = obj(d.gate, "gate");

  return {
    source: str(d.source, "source"),
    gate: {
      redirectMethods: list(
        gate.redirect_methods ?? gate.redirectMethods,
        "gate.redirect_methods",
        ["GET", "HEAD"],
      ),
      redirectStatus: num(
        gate.redirect_status ?? gate.redirectStatus,
        "gate.redirect_status",
        303,
      ),
      denyResponse: str(
        gate.deny_response ?? gate.denyResponse,
        "gate.deny_response",
        "auth_required",
      ),
      htmlOnly: bool(gate.html_only ?? gate.htmlOnly, "gate.html_only", true),
      groups: list(gate.groups, "gate.groups", []),
      forbiddenResponse: str(
        gate.forbidden_response ?? gate.forbiddenResponse,
        "gate.forbidden_response",
        "auth_forbidden",
      ),
      inline: bool(gate.inline, "gate.inline", false),
    },
    trigger: {
      prior: arr(trigger.prior, "trigger.prior").map((item, i) =>
        priorOf(item, `trigger.prior[${i}]`),
      ),
      reauthAfterS: seconds(
        trigger.reauth_after_s ?? trigger.reauthAfterS,
        "trigger.reauth_after_s",
        300,
      ),
    },
    rules: arr(d.rules, "rules").map((item, i) => eventRuleOf(item, `rules[${i}]`)),
  };
}

const AXES_OF: Record<string, AuthAxis[]> = {
  reauth: ["session"],
  skip: ["request"],
};

const FOREIGN_VERBS = new Set(["challenge", "threshold", "note"]);

function checkPrior(rule: AuthPriorRule, i: number): void {
  const at = `trigger.prior[${i}]`;

  if (rule.from === "") {
    fail(`${at}: from is empty (use "*" for any)`);
  }

  if (rule.accept.length === 0) {
    fail(`${at}: accept is required`);
  }

  for (const verb of rule.accept as string[]) {
    if (FOREIGN_VERBS.has(verb)) {
      fail(`${at}: "${verb}" is not ours to apply`);
    }

    if (!(verb in AXES_OF)) {
      fail(`${at}: unknown verb "${verb}"`);
    }
  }

  const allowed = new Set(rule.accept.flatMap((v) => AXES_OF[v] ?? []));

  for (const axis of rule.apply as string[]) {
    if (axis !== "request" && axis !== "ip" && axis !== "asn" && axis !== "session") {
      fail(`${at}: unknown axis "${axis}"`);
    }

    if (!allowed.has(axis as AuthAxis)) {
      fail(`${at}: axis "${axis}" never occurs with ${rule.accept.join(", ")}`);
    }
  }

  if (rule.from === "*" && rule.accept.includes("skip")) {
    fail(`${at}: "skip" needs a named sender: it always weakens`);
  }
}

export function validateDoc(doc: AuthProfileDoc): void {

  if (doc.source !== "" && !NAME_RE.test(doc.source)) {
    fail("source must be a plain source name");
  }

  doc.trigger.prior.forEach(checkPrior);
  doc.rules.forEach(checkEventRule);

  if (!REDIRECT_STATUS.has(doc.gate.redirectStatus)) {
    fail("gate.redirect_status must be 302, 303 or 307");
  }

  if (doc.gate.denyResponse === "") {
    fail("gate.deny_response is empty: the module needs a catalog name");
  }

  for (const method of doc.gate.redirectMethods) {
    if (method !== method.toUpperCase() || method === "") {
      fail(`gate.redirect_methods: ${JSON.stringify(method)} must be upper case`);
    }
  }

  for (const group of doc.gate.groups) {
    if (group.trim() === "") {
      fail("gate.groups: an empty group name lets everyone through");
    }
  }

  if (doc.gate.groups.length > 0 && doc.gate.forbiddenResponse === "") {
    fail(
      "gate.forbidden_response is empty: a session without the group is denied, " +
        "and the module needs a catalog name for it",
    );
  }

}

export function renderProfileYaml(name: string, doc: AuthProfileDoc): string {
  const out: string[] = [];

  out.push(`# Профиль калитки ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица auth_profiles, раздел /auth в UX.");
  out.push("");
  out.push(doc.source === "" ? 'mode: "off"' : "mode: enforce");

  if (doc.source !== "") {
    out.push("");
    out.push(`source: ${q(doc.source)}`);
  }

  out.push("");

  out.push("gate:");
  out.push(`  redirect_methods: ${seq(doc.gate.redirectMethods)}`);
  out.push(`  redirect_status: ${doc.gate.redirectStatus}`);
  out.push(`  deny_response: ${q(doc.gate.denyResponse)}`);
  out.push(`  html_only: ${doc.gate.htmlOnly}`);

  if (doc.gate.groups.length > 0) {
    out.push(`  groups: ${seq(doc.gate.groups)}`);
    out.push(`  forbidden_response: ${q(doc.gate.forbiddenResponse)}`);
  }

  if (doc.gate.inline) {
    out.push("  inline: true");
  }

  if (doc.trigger.prior.length > 0) {
    out.push("");
    out.push("trigger:");
    out.push(`  reauth_after: ${q(duration(doc.trigger.reauthAfterS))}`);
    out.push("  prior:");

    for (const rule of doc.trigger.prior) {
      out.push(`    - from: ${q(rule.from)}`);
      out.push(`      accept: ${seq(rule.accept)}`);

      if (rule.apply.length > 0) {
        out.push(`      apply: ${seq(rule.apply)}`);
      }

      if (rule.codes.length > 0) {
        out.push(`      codes: ${seq(rule.codes)}`);
      }
    }
  }

  if (doc.rules.length > 0) {
    out.push("");
    out.push("rules:");

    for (const rule of doc.rules) {
      out.push(`  - on: ${rule.on}`);

      if (rule.on === "overload" && rule.at !== null && rule.at !== undefined) {
        out.push(`    at: ${rule.at}`);
      }

      if (rule.do !== "") {
        if (rule.to !== "") {
          out.push(`    to: ${q(rule.to)}`);
        }

        out.push(`    do: ${rule.do}`);

        if (rule.apply !== "") {
          out.push(`    apply: ${rule.apply}`);
        }

        if (rule.delta !== null) {
          out.push(`    delta: ${rule.delta}`);
        }

        if (rule.value !== null) {
          out.push(`    value: ${rule.value}`);
        }

        if (rule.counter !== "") {
          out.push(`    counter: ${q(rule.counter)}`);
        }

        if (rule.marker !== "") {
          out.push(`    marker: ${q(rule.marker)}`);
        }

        if (rule.group !== "") {
          out.push(`    group: ${q(rule.group)}`);
          out.push(`    set: ${rule.set}`);
        }

        if ((rule.phase ?? "") !== "") {
          out.push(`    phase: ${rule.phase}`);
        }

        if (rule.do === "audit" || rule.do === "archive") {
          out.push(`    set: ${rule.set}`);

          if (rule.set === "on") {
            if (rule.do === "archive" && rule.ttlS > 0) {
              out.push(`    ttl: ${q(duration(rule.ttlS))}`);
            }

            if (rule.do === "archive" && rule.when.length > 0) {
              out.push(`    when: ${seq(rule.when)}`);
            }

            for (const name of RECORD_OBJECTS) {
              const spec = rule[name];

              if (spec !== null) {
                out.push(`    ${name}: ${recordObjectYaml(spec)}`);
              }
            }
          }
        }
      } else {
        out.push(`    list: ${q(rule.list)}`);

        if (rule.write !== "addr") {
          out.push(`    write: ${rule.write}`);
        }

        out.push(`    ttl: ${q(duration(rule.ttlS))}`);
      }

      if (rule.code !== "") {
        out.push(`    code: ${q(rule.code)}`);
      }
    }
  }

  out.push("");

  return out.join("\n");
}
