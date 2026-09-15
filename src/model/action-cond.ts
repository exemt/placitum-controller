export const ACTION_COND_OPS = ["in", "not_in", "eq", "ne", "is", "is_not"] as const;

export type ActionCondOp = (typeof ACTION_COND_OPS)[number];

export function isActionCondOp(value: string): value is ActionCondOp {
  return (ACTION_COND_OPS as readonly string[]).includes(value);
}

export function opTakesDataset(op: ActionCondOp): boolean {
  return op === "in" || op === "not_in";
}

export function opIsRef(op: ActionCondOp): boolean {
  return op === "is" || op === "is_not";
}

export const ACTION_VALUE_FIELDS = [
  "uri",
  "request_uri",
  "host",
  "request_method",
  "scheme",
  "remote_addr",
] as const;

export type ActionValueKind =
  | "field"
  | "header"
  | "cookie"
  | "arg"
  | "headers"
  | "cookies"
  | "args"
  | "var";

export interface ActionValue {
  kind: ActionValueKind;
  name: string;
  all: boolean;
}

const SELECTORS: { prefix: string; kind: ActionValueKind; all: boolean }[] = [
  { prefix: "$waf_request_headers.", kind: "headers", all: true },
  { prefix: "$waf_request_cookies.", kind: "cookies", all: true },
  { prefix: "$waf_request_args.", kind: "args", all: true },
  { prefix: "$waf_var.", kind: "var", all: false },
];

const PARSERS: { prefix: string; kind: ActionValueKind }[] = [
  { prefix: "http_", kind: "header" },
  { prefix: "cookie_", kind: "cookie" },
  { prefix: "arg_", kind: "arg" },
];

const VAR_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const NGINX_NAME_RE = /^[A-Za-z0-9_]{1,128}$/;

export function parseActionValue(raw: string): ActionValue | { error: string } {
  const value = raw.trim();

  if (value === "") {
    return { error: "value is empty" };
  }

  if (!value.startsWith("$")) {
    return { error: `value ${JSON.stringify(value)} must start with $` };
  }

  for (const sel of SELECTORS) {
    if (!value.startsWith(sel.prefix)) {
      continue;
    }

    const name = value.slice(sel.prefix.length);

    if (name === "") {
      return { error: `value ${JSON.stringify(value)} has no name after the dot` };
    }

    if (name === "*") {
      return sel.all
        ? { kind: sel.kind, name: "", all: true }
        : { error: `value ${JSON.stringify(value)}: * is only for headers, cookies and args` };
    }

    if (sel.kind === "var" && !VAR_NAME_RE.test(name)) {
      return { error: `value ${JSON.stringify(value)}: field name is not [A-Za-z0-9_.-]` };
    }

    return { kind: sel.kind, name: sel.kind === "headers" ? name.toLowerCase() : name, all: false };
  }

  const bare = value.slice(1);

  if ((ACTION_VALUE_FIELDS as readonly string[]).includes(bare)) {
    return { kind: "field", name: bare, all: false };
  }

  for (const p of PARSERS) {
    if (!bare.startsWith(p.prefix)) {
      continue;
    }

    const tail = bare.slice(p.prefix.length);

    if (!NGINX_NAME_RE.test(tail)) {
      return {
        error: `value ${JSON.stringify(value)}: name after ${p.prefix} is not [A-Za-z0-9_]`,
      };
    }

    return { kind: p.kind, name: p.kind === "header" ? tail.toLowerCase() : tail, all: false };
  }

  return {
    error:
      `unknown value ${JSON.stringify(value)}: expected a field ($uri, $host, ` +
      "$request_method, $request_uri, $scheme, $remote_addr), $http_/$cookie_/$arg_<name>, " +
      "$waf_request_headers|cookies|args.<name|*> or $waf_var.<name>",
  };
}

export function actionValueAddressable(value: ActionValue): boolean {
  switch (value.kind) {
    case "field":
      return value.name === "remote_addr";
    case "header":
    case "headers":
    case "var":
      return true;
    default:
      return false;
  }
}

export const ACTION_COND_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;

export interface ActionDatasetInfo {
  name: string;
  type: string;
  kind: string;
  active: boolean;
  hash: boolean;
}

export function isAddressDatasetType(type: string): boolean {
  return type === "ipv4" || type === "ip" || type === "cidr";
}
