import type { AuditFilter } from "../audit.ts";
import type { DateRange } from "../components/data-table/index.ts";

export type AuditFields = {
  ray: string;
  ip: string;
  method: string;
  host: string;
  server: string;
  uri: string;
  route: string;
  status: string;
  phase: string;
  inspector: string;
  user: string;
  marker: string;
  country: string;
  asn: string;
  header: string;
  param: string;
  body: string;
};

export const emptyFields: AuditFields = {
  ray: "",
  ip: "",
  method: "",
  host: "",
  server: "",
  uri: "",
  route: "",
  status: "",
  phase: "",
  inspector: "",
  user: "",
  marker: "",
  country: "",
  asn: "",
  header: "",
  param: "",
  body: "",
};

export type QueryOp = "=" | "~" | "in" | "exists";

export type QueryTerm = {
  field: string;
  op: QueryOp;
  values: string[];
};

export type QueryState = {
  range: DateRange;
  verdict: AuditFilter;
  fields: AuditFields;
};

export type QueryRoute = { id: string; name: string };

export type QueryCtx = {
  presets: readonly string[];
  snapshot: (preset: string) => DateRange;
  routes: readonly QueryRoute[];
};

export type QueryError = {
  start: number;
  end: number;
  code: string;
  vars?: Record<string, string>;
};

export const QUERY_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;
export const QUERY_PHASES = ["request", "response", "frame", "session"] as const;
export const QUERY_VERDICTS = ["deny", "allow", "redirect"] as const;
export const DEFAULT_PRESET = "24h";
export const DEFAULT_QUERY = `time = ${DEFAULT_PRESET}`;

const PAIR_KINDS = ["header", "param"] as const;
type PairKind = (typeof PAIR_KINDS)[number];

type FieldSpec = { ops: readonly QueryOp[] };

export const QUERY_FIELDS: Record<string, FieldSpec> = {
  time: { ops: ["=", "in"] },
  verdict: { ops: ["="] },
  ip: { ops: ["=", "in"] },
  host: { ops: ["="] },
  uri: { ops: ["~"] },
  status: { ops: ["="] },
  method: { ops: ["="] },
  phase: { ops: ["="] },
  server: { ops: ["=", "in"] },
  route: { ops: ["=", "in"] },
  inspector: { ops: ["="] },
  user: { ops: ["="] },
  marker: { ops: ["="] },
  country: { ops: ["="] },
  asn: { ops: ["="] },
  ray: { ops: ["="] },
  body: { ops: ["~"] },
};

const PAIR_OPS: readonly QueryOp[] = ["=", "exists"];

function pairKind(field: string): PairKind | null {
  for (const kind of PAIR_KINDS) {
    if (field === kind || field.startsWith(`${kind}.`)) {
      return kind;
    }
  }
  return null;
}

export function fieldOps(field: string): readonly QueryOp[] | null {
  if (pairKind(field) !== null) {
    return PAIR_OPS;
  }
  return QUERY_FIELDS[field]?.ops ?? null;
}

type TokKind = "word" | "string" | "op" | "open" | "close" | "comma";

export type TokRole = "field" | "op" | "value" | "join" | "punct" | "bad";

export type Tok = {
  kind: TokKind;
  value: string;
  start: number;
  end: number;
  closed: boolean;
  role: TokRole;
};

const OPS = ["!=", "!~", ">=", "<=", "=", "~", ">", "<", "(", ")"] as const;
const WORD_STOP = /[\s"[\],=~!<>()]/;

export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const start = i;
    if (ch === '"') {
      let value = "";
      let closed = false;
      i += 1;
      while (i < text.length) {
        const cur = text[i] ?? "";
        if (cur === "\\" && i + 1 < text.length) {
          value += text[i + 1];
          i += 2;
          continue;
        }
        i += 1;
        if (cur === '"') {
          closed = true;
          break;
        }
        value += cur;
      }
      out.push({ kind: "string", value, start, end: i, closed, role: "value" });
      continue;
    }
    if (ch === "[" || ch === "]" || ch === ",") {
      i += 1;
      out.push({
        kind: ch === "[" ? "open" : ch === "]" ? "close" : "comma",
        value: ch,
        start,
        end: i,
        closed: true,
        role: "punct",
      });
      continue;
    }
    const op = OPS.find((row) => text.startsWith(row, i));
    if (op !== undefined) {
      i += op.length;
      out.push({ kind: "op", value: op, start, end: i, closed: true, role: "op" });
      continue;
    }
    while (i < text.length && !WORD_STOP.test(text[i] ?? "")) {
      i += 1;
    }
    out.push({ kind: "word", value: text.slice(start, i), start, end: i, closed: true, role: "value" });
  }
  return out;
}

function isWord(tok: Tok | undefined, word: string): boolean {
  return tok !== undefined && tok.kind === "word" && tok.value.toLowerCase() === word;
}

function textual(tok: Tok): boolean {
  return tok.kind === "word" || tok.kind === "string";
}

function isText(tok: Tok | undefined): tok is Tok {
  return tok !== undefined && textual(tok);
}

function fieldName(tok: Tok): string {
  const raw = tok.value;
  const dot = raw.indexOf(".");
  const head = (dot < 0 ? raw : raw.slice(0, dot)).toLowerCase();
  if (dot < 0) {
    return head;
  }
  const tail = raw.slice(dot + 1);
  return `${head}.${head === "header" ? tail.toLowerCase() : tail}`;
}

export type ParsedTerm = QueryTerm & {
  start: number;
  end: number;
  fieldAt: [number, number];
  valuesAt: [number, number][];
};

export type ParsedQuery = {
  tokens: Tok[];
  terms: ParsedTerm[];
  errors: QueryError[];
};

export function parseQuery(text: string): ParsedQuery {
  const tokens = tokenize(text);
  const terms: ParsedTerm[] = [];
  const errors: QueryError[] = [];
  const fail = (tok: Tok | [number, number], code: string, vars?: Record<string, string>) => {
    const [start, end] = Array.isArray(tok) ? tok : [tok.start, tok.end];
    errors.push({ start, end, code, vars });
  };
  const tail = (): [number, number] => [text.length, text.length];

  let i = 0;
  let joined = true;
  while (i < tokens.length) {
    const tok = tokens[i] as Tok;

    if (isWord(tok, "and") || isWord(tok, "or")) {
      tok.role = "join";
      if (isWord(tok, "or")) {
        tok.role = "bad";
        fail(tok, "orUnsupported");
      } else if (joined) {
        tok.role = "bad";
        fail(tok, "extraAnd");
      }
      joined = true;
      i += 1;
      if (i >= tokens.length) {
        fail(tok, "danglingAnd");
      }
      continue;
    }

    if (isWord(tok, "not")) {
      tok.role = "bad";
      fail(tok, "notUnsupported");
      i += 1;
      continue;
    }

    if (tok.kind === "op" && (tok.value === "(" || tok.value === ")")) {
      tok.role = "bad";
      fail(tok, "parensUnsupported");
      i += 1;
      continue;
    }

    if (!textual(tok)) {
      tok.role = "bad";
      fail(tok, "expectedField");
      i += 1;
      continue;
    }

    if (!joined) {
      fail(tok, "missingAnd");
    }
    joined = false;

    if (tok.kind === "string" && !tok.closed) {
      fail(tok, "unclosedString");
    }
    tok.role = "field";
    const field = fieldName(tok);
    const term: ParsedTerm = {
      field,
      op: "exists",
      values: [],
      start: tok.start,
      end: tok.end,
      fieldAt: [tok.start, tok.end],
      valuesAt: [],
    };
    terms.push(term);
    i += 1;

    const take = (value: Tok) => {
      value.role = "value";
      if (value.kind === "string" && !value.closed) {
        fail(value, "unclosedString");
      }
      term.values.push(value.value);
      term.valuesAt.push([value.start, value.end]);
      term.end = value.end;
    };

    const list = (at: number): number => {
      let j = at + 1;
      let closed = false;
      let wantValue = true;
      term.end = (tokens[at] as Tok).end;
      while (j < tokens.length) {
        const cur = tokens[j] as Tok;
        if (cur.kind === "close") {
          closed = true;
          term.end = cur.end;
          j += 1;
          break;
        }
        if (cur.kind === "comma") {
          if (wantValue) {
            cur.role = "bad";
            fail(cur, "expectedValue", { field });
          }
          wantValue = true;
          term.end = cur.end;
          j += 1;
          continue;
        }
        if (isText(cur)) {
          if (!wantValue) {
            fail(cur, "missingComma");
          }
          take(cur);
          wantValue = false;
          j += 1;
          continue;
        }
        break;
      }
      if (!closed) {
        fail([(tokens[at] as Tok).start, term.end], "unclosedList");
      } else if (term.values.length === 0) {
        fail([(tokens[at] as Tok).start, term.end], "emptyList", { field });
      }
      return j;
    };

    const next = tokens[i];
    if (next === undefined) {
      continue;
    }

    if (next.kind === "op") {
      i += 1;
      term.end = next.end;
      if (next.value === "=" || next.value === "~") {
        term.op = next.value;
      } else {
        next.role = "bad";
        term.op = "=";
        fail(next, next.value === "(" || next.value === ")" ? "parensUnsupported" : "opUnsupported", {
          op: next.value,
        });
      }
      const value = tokens[i];
      if (isText(value) && !isWord(value, "and") && !isWord(value, "or")) {
        take(value);
        i += 1;
      } else if (value !== undefined && value.kind === "open") {
        fail(value, "listNeedsIn", { field });
        term.op = "in";
        i = list(i);
      } else {
        fail(value === undefined ? tail() : [next.start, next.end], "expectedValue", { field });
      }
      continue;
    }

    if (isWord(next, "in")) {
      next.role = "op";
      term.op = "in";
      term.end = next.end;
      i += 1;
      const open = tokens[i];
      if (open === undefined || open.kind !== "open") {
        fail(open === undefined ? [next.start, next.end] : open, "expectedList", { field });
        continue;
      }
      i = list(i);
      continue;
    }

    if (pairKind(field) === null && isText(next) && !isWord(next, "and") && !isWord(next, "or")) {
      fail(next, "expectedOp", { field, ops: opsText(field) });
      term.op = "=";
      take(next);
      i += 1;
    }
  }

  return { tokens, terms, errors };
}

function opsText(field: string): string {
  const ops = fieldOps(field);
  return ops === null ? "=" : ops.filter((op) => op !== "exists").join(", ");
}

function validIp(raw: string): boolean {
  const parts = raw.split("/");
  if (parts.length > 2) {
    return false;
  }
  const addr = parts[0] ?? "";
  const bits = parts[1];
  if (bits !== undefined && !/^(0|[1-9]\d{0,2})$/.test(bits)) {
    return false;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (v4 !== null) {
    const ok = v4.slice(1).every((part) => Number(part) <= 255 && (part === "0" || !part.startsWith("0")));
    return ok && (bits === undefined || Number(bits) <= 32);
  }
  if (!addr.includes(":") || !/^[0-9a-f:]+$/i.test(addr)) {
    return false;
  }
  const halves = addr.split("::");
  if (halves.length > 2) {
    return false;
  }
  const groups = halves.flatMap((half) => (half === "" ? [] : half.split(":")));
  if (groups.some((group) => group.length === 0 || group.length > 4)) {
    return false;
  }
  if (halves.length === 1 ? groups.length !== 8 : groups.length > 7) {
    return false;
  }
  return bits === undefined || Number(bits) <= 128;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseStamp(raw: string, endOfDay: boolean): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(raw.trim());
  if (m === null) {
    return null;
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = m[4] === undefined ? (endOfDay ? 23 : 0) : Number(m[4]);
  const mi = m[5] === undefined ? (endOfDay ? 59 : 0) : Number(m[5]);
  const date = new Date(y, mo - 1, d, h, mi);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    h > 23 ||
    mi > 59
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}T${pad(h)}:${pad(mi)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function routeId(raw: string, routes: readonly QueryRoute[]): string | null {
  const byName = routes.filter((row) => row.name === raw);
  if (byName.length === 1) {
    return (byName[0] as QueryRoute).id;
  }
  if (routes.some((row) => row.id === raw) || UUID.test(raw)) {
    return raw;
  }
  return null;
}

function routeLabel(id: string, routes: readonly QueryRoute[]): string {
  const row = routes.find((item) => item.id === id);
  if (row === undefined) {
    return id;
  }
  return routes.filter((item) => item.name === row.name).length === 1 ? row.name : id;
}

function nearest(field: string, all: readonly string[]): string {
  let best = "";
  let bestScore = 3;
  for (const name of all) {
    const score = distance(field, name);
    if (score < bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0] as number;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const keep = row[j] as number;
      row[j] = Math.min(
        keep + 1,
        (row[j - 1] as number) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = keep;
    }
  }
  return row[b.length] as number;
}

export type ResolvedQuery = {
  state: QueryState;
  errors: QueryError[];
};

export function resolveQuery(parsed: ParsedQuery, ctx: QueryCtx): ResolvedQuery {
  const errors = [...parsed.errors];
  const fields: AuditFields = { ...emptyFields };
  let verdict: AuditFilter = "all";
  let range: DateRange | null = null;
  const seen = new Set<string>();

  for (const term of parsed.terms) {
    const fail = (at: [number, number], code: string, vars?: Record<string, string>) => {
      errors.push({ start: at[0], end: at[1], code, vars });
    };
    const whole: [number, number] = [term.start, term.end];
    const kind = pairKind(term.field);
    const ops = fieldOps(term.field);

    if (ops === null) {
      const hint = nearest(term.field, [...Object.keys(QUERY_FIELDS), ...PAIR_KINDS]);
      fail(term.fieldAt, hint === "" ? "unknownField" : "unknownFieldHint", {
        field: term.field,
        hint,
      });
      continue;
    }

    const slot = kind ?? term.field;
    if (seen.has(slot)) {
      fail(whole, kind === null ? "duplicate" : "onePair", { field: slot });
      continue;
    }
    seen.add(slot);

    if (!ops.includes(term.op)) {
      fail(whole, term.op === "exists" ? "expectedOp" : "opWrong", {
        field: term.field,
        ops: opsText(term.field),
      });
      continue;
    }

    if (term.op !== "exists" && term.values.length === 0) {
      continue;
    }

    let bad = false;
    term.values.forEach((value, n) => {
      if (value.trim() === "") {
        fail(term.valuesAt[n] ?? whole, "emptyValue", { field: term.field });
        bad = true;
      }
    });
    if (bad) {
      continue;
    }

    const first = (term.values[0] ?? "").trim();
    const firstAt = term.valuesAt[0] ?? whole;

    if (kind !== null) {
      const name = term.field.slice(kind.length + 1);
      if (name === "") {
        fail(term.fieldAt, "pairName", { field: kind });
        continue;
      }
      fields[kind] = term.op === "exists" ? name : `${name}=${term.values[0] ?? ""}`;
      continue;
    }

    switch (term.field) {
      case "time": {
        if (term.op === "=") {
          if (!ctx.presets.includes(first)) {
            fail(firstAt, "badPreset", { value: first, values: ctx.presets.join(", ") });
            break;
          }
          range = ctx.snapshot(first);
          break;
        }
        if (term.values.length !== 2) {
          fail(whole, "timePair");
          break;
        }
        const from = parseStamp(term.values[0] ?? "", false);
        const to = parseStamp(term.values[1] ?? "", true);
        if (from === null) {
          fail(firstAt, "badStamp", { value: term.values[0] ?? "" });
        }
        if (to === null) {
          fail(term.valuesAt[1] ?? whole, "badStamp", { value: term.values[1] ?? "" });
        }
        if (from !== null && to !== null) {
          range = from <= to ? { preset: "", from, to } : { preset: "", from: to, to: from };
        }
        break;
      }
      case "verdict": {
        const value = first.toLowerCase();
        if (!(QUERY_VERDICTS as readonly string[]).includes(value)) {
          fail(firstAt, "badEnum", { field: term.field, value: first, values: QUERY_VERDICTS.join(", ") });
          break;
        }
        verdict = value as AuditFilter;
        break;
      }
      case "method": {
        const value = first.toUpperCase();
        if (!(QUERY_METHODS as readonly string[]).includes(value)) {
          fail(firstAt, "badEnum", { field: term.field, value: first, values: QUERY_METHODS.join(", ") });
          break;
        }
        fields.method = value;
        break;
      }
      case "phase": {
        const value = first.toLowerCase();
        if (!(QUERY_PHASES as readonly string[]).includes(value)) {
          fail(firstAt, "badEnum", { field: term.field, value: first, values: QUERY_PHASES.join(", ") });
          break;
        }
        fields.phase = value;
        break;
      }
      case "ip": {
        const list = term.values.map((value) => value.trim());
        list.forEach((value, n) => {
          if (!validIp(value)) {
            fail(term.valuesAt[n] ?? whole, "badIp", { value });
            bad = true;
          }
        });
        if (!bad) {
          fields.ip = list.join(", ");
        }
        break;
      }
      case "server": {
        const list = term.values.map((value) => value.trim());
        list.forEach((value, n) => {
          if (/[\s,;]/.test(value)) {
            fail(term.valuesAt[n] ?? whole, "badServer", { value });
            bad = true;
          }
        });
        if (!bad) {
          fields.server = list.join(",");
        }
        break;
      }
      case "route": {
        const ids: string[] = [];
        term.values.forEach((value, n) => {
          const id = routeId(value.trim(), ctx.routes);
          if (id === null) {
            fail(term.valuesAt[n] ?? whole, "badRoute", { value });
            bad = true;
          } else if (!ids.includes(id)) {
            ids.push(id);
          }
        });
        if (!bad) {
          fields.route = ids.join(",");
        }
        break;
      }
      case "status": {
        if (!/^[1-9]\d{2}$/.test(first)) {
          fail(firstAt, "badStatus", { value: first });
          break;
        }
        fields.status = first;
        break;
      }
      case "country": {
        if (!/^[a-z]{2}$/i.test(first)) {
          fail(firstAt, "badCountry", { value: first });
          break;
        }
        fields.country = first.toLowerCase();
        break;
      }
      case "asn": {
        const m = /^(?:as)?([1-9]\d{0,9})$/i.exec(first);
        if (m === null || Number(m[1]) > 4294967295) {
          fail(firstAt, "badAsn", { value: first });
          break;
        }
        fields.asn = m[1] as string;
        break;
      }
      case "user":
      case "marker": {
        if (first.length > 256) {
          fail(firstAt, "tooLong", { field: term.field });
          break;
        }
        fields[term.field] = first;
        break;
      }
      case "host":
      case "uri":
      case "inspector":
      case "ray":
      case "body":
        fields[term.field] = first;
        break;
      default:
        break;
    }
  }

  errors.sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    state: { range: range ?? ctx.snapshot(DEFAULT_PRESET), verdict, fields },
    errors,
  };
}

function splitList(raw: string, by: RegExp): string[] {
  return raw
    .split(by)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function oneOrMany(field: string, values: string[]): QueryTerm | null {
  if (values.length === 0) {
    return null;
  }
  return values.length === 1 ? { field, op: "=", values } : { field, op: "in", values };
}

function pair(prefix: string, raw: string): QueryTerm | null {
  if (raw === "") {
    return null;
  }
  const at = raw.indexOf("=");
  const name = (at < 0 ? raw : raw.slice(0, at)).trim();
  if (name === "") {
    return null;
  }
  const value = at < 0 ? "" : raw.slice(at + 1);
  return value === ""
    ? { field: `${prefix}.${name}`, op: "exists", values: [] }
    : { field: `${prefix}.${name}`, op: "=", values: [value] };
}

export function queryTerms(state: QueryState, routes: readonly QueryRoute[]): QueryTerm[] {
  const { range, verdict, fields } = state;
  const out: QueryTerm[] = [];
  const push = (term: QueryTerm | null) => {
    if (term !== null) {
      out.push(term);
    }
  };
  const eq = (field: string, value: string): QueryTerm | null =>
    value === "" ? null : { field, op: "=", values: [value] };
  const like = (field: string, value: string): QueryTerm | null =>
    value === "" ? null : { field, op: "~", values: [value] };

  if (range.preset !== "") {
    push({ field: "time", op: "=", values: [range.preset] });
  } else if (range.from !== "" || range.to !== "") {
    push({
      field: "time",
      op: "in",
      values: [range.from.replace("T", " "), range.to.replace("T", " ")],
    });
  }
  push(eq("verdict", verdict === "all" ? "" : verdict));
  push(oneOrMany("ip", splitList(fields.ip, /[,;\s]+/)));
  push(eq("host", fields.host));
  push(like("uri", fields.uri));
  push(eq("status", fields.status));
  push(eq("method", fields.method));
  push(eq("phase", fields.phase));
  push(oneOrMany("server", splitList(fields.server, /,/)));
  push(oneOrMany("route", splitList(fields.route, /,/).map((id) => routeLabel(id, routes))));
  push(eq("inspector", fields.inspector));
  push(eq("user", fields.user));
  push(eq("marker", fields.marker));
  push(eq("country", fields.country));
  push(eq("asn", fields.asn === "" ? "" : `AS${fields.asn}`));
  push(eq("ray", fields.ray));
  push(pair("header", fields.header));
  push(pair("param", fields.param));
  push(like("body", fields.body));
  return out;
}

const RESERVED = ["and", "or", "in", "not"];

export function quoteValue(value: string, always = false): string {
  return always ||
    value === "" ||
    WORD_STOP.test(value) ||
    RESERVED.includes(value.toLowerCase())
    ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : value;
}

export function formatQuery(terms: readonly QueryTerm[]): string {
  return terms
    .map((term) => {
      const field = quoteValue(term.field);
      if (term.op === "exists") {
        return field;
      }
      if (term.op === "in") {
        return `${field} in [${term.values.map((value) => quoteValue(value)).join(", ")}]`;
      }
      return `${field} ${term.op} ${quoteValue(term.values[0] ?? "", term.op === "~")}`;
    })
    .join(" and ");
}

export function formatState(state: QueryState, routes: readonly QueryRoute[]): string {
  return formatQuery(queryTerms(state, routes));
}

export type Segment = {
  text: string;
  role: TokRole | "space";
  field?: string;
  error: boolean;
};

export function segments(text: string, parsed: ParsedQuery, errors: readonly QueryError[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  let field = "";
  for (const tok of parsed.tokens) {
    if (tok.start > at) {
      out.push({ text: text.slice(at, tok.start), role: "space", error: false });
    }
    if (tok.role === "field") {
      field = fieldName(tok);
    }
    out.push({
      text: text.slice(tok.start, tok.end),
      role: tok.role,
      field: tok.role === "value" ? field : undefined,
      error: errors.some((err) => err.start < tok.end && err.end > tok.start),
    });
    at = tok.end;
  }
  if (at < text.length) {
    out.push({ text: text.slice(at), role: "space", error: false });
  }
  return out;
}

export type Suggestion = {
  value: string;
  insert: string;
  detail?: string;
  count?: number;
};

export type SuggestStage = "field" | "op" | "value" | "join" | "list";

export type SuggestContext = {
  stage: SuggestStage;
  field: string;
  prefix: string;
  from: number;
  to: number;
  inList: boolean;
  used: string[];
  taken: string[];
};

export function suggestContext(text: string, caret: number): SuggestContext {
  const tokens = tokenize(text);
  const cur = tokens.find(
    (tok) =>
      tok.start < caret &&
      caret <= tok.end &&
      (tok.kind === "word" || tok.kind === "op" || (tok.kind === "string" && !(tok.closed && caret === tok.end))),
  );
  const from = cur?.start ?? caret;
  const to = cur?.end ?? caret;
  const before = tokens.filter((tok) => tok.end <= from);

  let stage: SuggestStage | "open" | "sep" = "field";
  let field = "";
  let inList = false;
  let taken: string[] = [];
  const used: string[] = [];

  for (const tok of before) {
    switch (stage) {
      case "field":
        if (isText(tok) && !isWord(tok, "not") && !isWord(tok, "and") && !isWord(tok, "or")) {
          field = fieldName(tok);
          stage = "op";
        }
        break;
      case "op":
        if (tok.kind === "op") {
          stage = "value";
        } else if (isWord(tok, "in")) {
          stage = "open";
        } else if (isWord(tok, "and") || isWord(tok, "or")) {
          used.push(field);
          stage = "field";
        } else {
          used.push(field);
          stage = "join";
        }
        break;
      case "open":
        if (tok.kind === "open") {
          inList = true;
          taken = [];
          stage = "value";
        } else {
          stage = "join";
        }
        break;
      case "value":
        if (textual(tok)) {
          if (inList) {
            taken.push(tok.value);
            stage = "sep";
          } else {
            used.push(field);
            stage = "join";
          }
        } else if (tok.kind === "open") {
          inList = true;
          taken = [];
        } else if (tok.kind === "close") {
          inList = false;
          used.push(field);
          stage = "join";
        }
        break;
      case "sep":
        if (tok.kind === "comma") {
          stage = "value";
        } else if (tok.kind === "close") {
          inList = false;
          used.push(field);
          stage = "join";
        } else if (isText(tok)) {
          taken.push(tok.value);
        }
        break;
      case "join":
        if (isWord(tok, "and") || isWord(tok, "or")) {
          stage = "field";
        } else if (isText(tok)) {
          field = fieldName(tok);
          stage = "op";
        }
        break;
      default:
        break;
    }
  }

  let prefix = cur === undefined ? "" : text.slice(cur.start, caret);
  if (cur?.kind === "string") {
    prefix = prefix.slice(1).replace(/\\(.)/g, "$1");
  }

  return {
    stage: stage === "open" ? "op" : stage === "sep" ? "list" : stage,
    field,
    prefix,
    from,
    to,
    inList,
    used: used.map((name) => pairKind(name) ?? name),
    taken,
  };
}

export type SavedQuery = { name: string; query: string; at: number };

const SAVED_KEY = "waf.incidents.savedQueries";
const RECENT_KEY = "waf.incidents.recentQueries";
const SAVED_MAX = 50;
const RECENT_MAX = 8;

function storeKey(base: string, scope: string | null): string {
  return scope === null || scope === "" ? base : `${base}.${scope}`;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

export function readSavedQueries(scope: string | null): SavedQuery[] {
  const raw = readJson(storeKey(SAVED_KEY, scope));
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: SavedQuery[] = [];
  for (const row of raw as unknown[]) {
    if (typeof row !== "object" || row === null) {
      continue;
    }
    const { name, query, at } = row as Record<string, unknown>;
    if (typeof name === "string" && name !== "" && typeof query === "string") {
      out.push({ name, query, at: typeof at === "number" ? at : 0 });
    }
  }
  return out.slice(0, SAVED_MAX);
}

export function writeSavedQueries(scope: string | null, list: readonly SavedQuery[]) {
  writeJson(storeKey(SAVED_KEY, scope), list.slice(0, SAVED_MAX));
}

export function readRecentQueries(scope: string | null): string[] {
  const raw = readJson(storeKey(RECENT_KEY, scope));
  return Array.isArray(raw)
    ? raw.filter((row): row is string => typeof row === "string" && row !== "").slice(0, RECENT_MAX)
    : [];
}

export function pushRecentQuery(scope: string | null, query: string): string[] {
  const next = [query, ...readRecentQueries(scope).filter((row) => row !== query)].slice(0, RECENT_MAX);
  writeJson(storeKey(RECENT_KEY, scope), next);
  return next;
}
