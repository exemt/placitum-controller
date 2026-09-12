/**
 * Условия профиля инспектора действий: значение, сравнение, набор либо
 * текст. Разбор значения повторяет загрузчик инспектора
 * (inspectors/action/internal/policy/cond.go, ParseOperand): запись, которую
 * не примет он, не должна пройти и здесь -- иначе поколение упадёт как
 * apply_failed через минуту после send.
 *
 * Запись значения -- как у условий вызова на маршруте (`if <значение> in
 * <набор>`), плюс поля сообщения инспектору: `$waf_var.<имя>` -- секция vars.
 */

export const ACTION_COND_OPS = ["in", "not_in", "eq", "ne", "is", "is_not"] as const;

export type ActionCondOp = (typeof ACTION_COND_OPS)[number];

export function isActionCondOp(value: string): value is ActionCondOp {
  return (ACTION_COND_OPS as readonly string[]).includes(value);
}

/** Сравнение с набором: набор обязателен, текста нет. */
export function opTakesDataset(op: ActionCondOp): boolean {
  return op === "in" || op === "not_in";
}

/** Ссылка на другое условие: истинно / ложно; ни значения, ни набора, ни текста. */
export function opIsRef(op: ActionCondOp): boolean {
  return op === "is" || op === "is_not";
}

/** Поля сообщения, которые инспектор читает как есть. */
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
  /** Имя пары или поля; пусто при `*`. */
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

/**
 * Разбор записи значения. Ошибка -- строкой по-английски, как остальные
 * detail контроллера; вызывающий решает, чем падать.
 */
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

/**
 * Значение, которое бывает адресом: адрес клиента, заголовки (X-Forwarded-For,
 * X-Real-IP) и поля vars (xff). С набором адресов сравнимо только оно.
 */
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

/** Имя условия: как имя корзины у note -- годится и в YAML, и в аудите. */
export const ACTION_COND_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;

/**
 * Что инспектору надо знать о наборе, чтобы условие считалось так же, как у
 * модуля: адресный набор сравнивается адресом, набор с hash=md5 -- хешем.
 * Снимок каталога наборов пространства в момент проверки и печати.
 */
export interface ActionDatasetInfo {
  name: string;
  /** string | numeric | ipv4 | ip. */
  type: string;
  /** list | content. */
  kind: string;
  active: boolean;
  hash: boolean;
}

export function isAddressDatasetType(type: string): boolean {
  return type === "ipv4" || type === "ip" || type === "cidr";
}
