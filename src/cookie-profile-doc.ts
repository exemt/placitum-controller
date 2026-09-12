/*
 * Документ профиля куки: нормализация, проверка и печать в YAML.
 *
 * Правила повторяют Parse() инспектора
 * (inspectors/cookie/internal/policy/policy.go, cookie.go, cond.go) -- ту же
 * отбраковку и в том же порядке. Расхождение между ними не стиль, а поколение, которое
 * инспектор отвергнет как apply_failed; поймать ошибку оператора надо в
 * панели, а не в пульсе через минуту после send.
 *
 * Условия -- то, чего у загрузчика нет своего: набор он знает только по
 * имени, а адресный ли он и хеширован ли -- печатает контроллер из каталога
 * наборов (`type: cidr`, `hash: md5`). Поэтому проверка и печать принимают
 * снимок каталога; без него проверяется только форма.
 */

import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import { checkAsk } from "./model/action-ask.ts";
import {
  ACTION_COND_NAME_RE,
  actionValueAddressable,
  isActionCondOp,
  isAddressDatasetType,
  opIsRef,
  opTakesDataset,
  parseActionValue,
  type ActionCondOp,
  type ActionDatasetInfo,
} from "./model/action-cond.ts";
import {
  COOKIE_PHASES,
  COOKIE_SIGNS,
  COOKIE_STATES,
  type ActionClause,
  type ActionCondition,
  type ActionMatch,
  type CookieAsk,
  type CookieDecl,
  type CookiePhase,
  type CookieProfileDoc,
  type CookieRule,
  type CookieSign,
  type CookieState,
} from "./model/cookie-profile.ts";

const METHOD_RE = /^[A-Z]+$/;
const COOKIE_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
/* Алфавит метки: тем же сводит значение инспектор (sanitizeTag). */
const TAG_RE = /^[A-Za-z0-9_-]*$/;
const RANDOM_MAX = 32;
const MAX_LEN_LIMIT = 128;

export class DocError extends Error {}

function fail(message: string): never {
  throw new DocError(message);
}

/* --- чтение недоверенного объекта ------------------------------------------ */

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


/** Объект просьбы записи: {set, limit, source}; отсутствие -- null. */
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

/** Целое либо null при отсутствии. */
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

function intOrNull(value: unknown, path: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`${path} must be an integer`);
  }

  return value;
}

function strings(value: unknown, path: string): string[] {
  return arr(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

/**
 * Исходы просьбы архива: те же два слова, что у `when=` директивы, в
 * каноническом порядке. Пусто -- любой исход, включая перенаправление:
 * просьба сильнее `when=` маршрута, о котором отправитель не знает.
 */
function archiveWhen(value: unknown, path: string): ArchiveWhen[] {
  const words = strings(value, path).map((word) => word.trim().toLowerCase());

  for (const word of words) {
    if (!(ARCHIVE_WHEN as readonly string[]).includes(word)) {
      fail(`${path}: outcome must be allow or deny, got ${word}`);
    }
  }

  return ARCHIVE_WHEN.filter((name) => words.includes(name));
}

/* --- нормализация ---------------------------------------------------------- */

/*
 * normalizeDoc читает документ любой давности и достраивает его до текущей
 * формы: строка, записанная до появления поля, обязана прочитаться с его
 * умолчанием, а не с undefined.
 */
export function normalizeDoc(input: unknown): CookieProfileDoc {
  const root = obj(input, "doc");

  return {
    description: str(root.description, "description"),
    cookies: arr(root.cookies, "cookies").map((raw, i) =>
      normalizeCookie(raw, `cookies[${i}]`),
    ),
    conditions: arr(root.conditions, "conditions").map((raw, i) =>
      normalizeCondition(raw, `conditions[${i}]`),
    ),
    rules: arr(root.rules, "rules").map((raw, i) => normalizeRule(raw, `rules[${i}]`)),
  };
}

/*
 * Объявление куки. Панель держит сроки секундами, загрузчик читает их словами
 * ("30d"); документ принимает и то и другое -- профиль, собранный по README
 * инспектора, читается тоже.
 */
function normalizeCookie(raw: unknown, path: string): CookieDecl {
  const row = obj(raw, path);
  const value = obj(row.value ?? {}, `${path}.value`);

  return {
    name: str(row.name, `${path}.name`).trim(),
    path: str(row.path, `${path}.path`, "/").trim() || "/",
    maxAgeS: seconds(row.maxAgeS ?? row.max_age, `${path}.max_age`),
    renewAfterS: seconds(row.renewAfterS ?? row.renew_after, `${path}.renew_after`),
    sign: (str(row.sign, `${path}.sign`, "hmac").trim() || "hmac") as CookieSign,
    value: {
      from: str(value.from, `${path}.value.from`).trim(),
      default: str(value.default, `${path}.value.default`).trim(),
      random: intOrNullOf(value.random, `${path}.value.random`) ?? 8,
      maxLen: intOrNullOf(value.maxLen ?? value.max_len, `${path}.value.max_len`) ?? 64,
    },
  };
}

/*
 * Срок: число -- секунды, строка -- запись загрузчика ("30d", "12h", "90m").
 * Пусто и ноль -- срока нет.
 */
function seconds(value: unknown, path: string): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      fail(`${path} must be a non-negative integer of seconds`);
    }

    return value;
  }

  if (typeof value !== "string") {
    fail(`${path} must be a number of seconds or a duration like "30d"`);
  }

  const m = /^([0-9]+)(s|m|h|d)$/.exec(value.trim());

  if (m === null) {
    fail(`${path}: bad duration ${JSON.stringify(value)}`);
  }

  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as "s" | "m" | "h" | "d"];

  return Number(m[1]) * mult;
}

/*
 * Условие -- панельной парой any/rows либо словами загрузчика: `all: [...]`
 * (по И) или `any: [...]` (по ИЛИ). Документ, собранный по README инспектора,
 * читается тоже.
 */
function normalizeCondition(raw: unknown, path: string): ActionCondition {
  const row = obj(raw, path);
  const anyRows = Array.isArray(row.any) ? row.any : undefined;

  if (anyRows !== undefined && row.all !== undefined) {
    fail(`${path}: all and any together -- pick one`);
  }

  const source = row.rows ?? row.all ?? anyRows;
  const any = anyRows !== undefined ? true : bool(row.any, `${path}.any`, false);

  return {
    name: str(row.name, `${path}.name`).trim(),
    any,
    rows: arr(source, `${path}.rows`).map((clause, j) =>
      normalizeClause(clause, `${path}.rows[${j}]`),
    ),
  };
}

const OP_WORDS: Record<string, ActionCondOp> = { "not in": "not_in", "is not": "is_not" };

function normalizeClause(raw: unknown, path: string): ActionClause {
  const row = obj(raw, path);
  const op = str(row.op, `${path}.op`).trim();

  return {
    value: str(row.value, `${path}.value`).trim(),
    /* Незнакомое сравнение доезжает до проверки как есть: там и упадёт словами. */
    op: OP_WORDS[op] ?? (op as ActionCondOp),
    dataset: str(row.dataset, `${path}.dataset`).trim(),
    text: str(row.text, `${path}.text`),
    cond: str(row.cond, `${path}.cond`).trim(),
  };
}

function normalizeRule(raw: unknown, path: string): CookieRule {
  const row = obj(raw, path);
  const match = obj(row.match, `${path}.match`);

  /*
   * Ссылка на условие -- парой cond/negate, как держит панель, либо словами
   * загрузчика if/unless: документ, собранный по его README, читается тоже.
   */
  const ifName = str(row.if, `${path}.if`).trim();
  const unlessName = str(row.unless, `${path}.unless`).trim();

  if (ifName !== "" && unlessName !== "") {
    fail(`${path}: if and unless together -- pick one`);
  }

  const cond = str(row.cond, `${path}.cond`).trim() || ifName || unlessName;
  const negate = bool(row.negate, `${path}.negate`, false) || (unlessName !== "" && ifName === "");

  return {
    name: str(row.name, `${path}.name`).trim(),
    match: {
      pathPrefix: str(match.pathPrefix ?? match.path_prefix, `${path}.match.path_prefix`).trim(),
      suffixes: strings(match.suffixes, `${path}.match.suffixes`).map((s) =>
        s.trim().toLowerCase(),
      ),
      static: bool(match.static, `${path}.match.static`, false),
      methods: strings(match.methods, `${path}.match.methods`).map((m) =>
        m.trim().toUpperCase(),
      ),
    } satisfies ActionMatch,
    phase: str(row.phase, `${path}.phase`).trim() as CookiePhase | "",
    status: arr(row.status, `${path}.status`).map((code, j) => {
      if (typeof code !== "number" || !Number.isInteger(code)) {
        fail(`${path}.status[${j}] must be an integer`);
      }

      return code;
    }),
    on: str(row.on, `${path}.on`).trim() as CookieState | "",
    cookie: str(row.cookie, `${path}.cookie`).trim(),
    issue: str(row.issue, `${path}.issue`).trim(),
    drop: str(row.drop, `${path}.drop`).trim(),
    cond,
    negate: cond === "" ? false : negate,
    actions: arr(row.actions, `${path}.actions`).map((ask, j) =>
      normalizeAsk(ask, `${path}.actions[${j}]`),
    ),
  };
}

function normalizeAsk(raw: unknown, path: string): CookieAsk {
  const row = obj(raw, path);

  return {
    to: str(row.to, `${path}.to`).trim(),
    do: str(row.do, `${path}.do`).trim(),
    apply: str(row.apply, `${path}.apply`).trim(),
    delta: intOrNull(row.delta, `${path}.delta`),
    value: intOrNull(row.value, `${path}.value`),
    counter: str(row.counter, `${path}.counter`).trim(),
    marker: str(row.marker, `${path}.marker`).trim(),
    group: str(row.group, `${path}.group`).trim(),
    phase: str(row.phase, `${path}.phase`).trim(),
    set: str(row.set, `${path}.set`).trim() as CookieAsk["set"],
    headers: recordObject(row.headers, `${path}.headers`),
    args: recordObject(row.args, `${path}.args`),
    body: recordObject(row.body, `${path}.body`),
    ttlS: intOrNullOf(row.ttlS ?? row.ttl_s, `${path}.ttl_s`) ?? 0,
    when: archiveWhen(row.when, `${path}.when`),
    list: str(row.list, `${path}.list`).trim(),
    write: str(row.write, `${path}.write`, "addr").trim() as CookieAsk["write"],
    op: (str(row.op, `${path}.op`, "add").trim() || "add") as CookieAsk["op"],
    cookie: str(row.cookie, `${path}.cookie`).trim(),
    code: str(row.code, `${path}.code`).trim(),
  };
}

/* --- проверка -------------------------------------------------------------- */

/**
 * validateDoc проверяет форму, а с каталогом наборов -- и ссылки: набор у
 * `in` / `not in` обязан быть активным списком пространства, адресный набор
 * сравним только с адресом. Без каталога ссылки не проверяются: так читают
 * документ из базы, где набор мог быть снят позже записи.
 */
export function validateDoc(input: unknown, datasets?: ActionDatasetInfo[]): CookieProfileDoc {
  const doc = normalizeDoc(input);
  const names = new Set<string>();
  const cookies = new Map<string, CookieDecl>();

  doc.cookies.forEach((cookie, i) => {
    const at = `cookies[${i}]`;

    checkCookie(cookie, at);

    if (cookies.has(cookie.name)) {
      fail(`${at}: cookie ${JSON.stringify(cookie.name)} is declared twice`);
    }

    cookies.set(cookie.name, cookie);
  });

  /* Сначала имена: ссылка вперёд законна, порядок объявления не значим. */
  doc.conditions.forEach((cond, i) => {
    const at = `conditions[${i}]`;

    if (!ACTION_COND_NAME_RE.test(cond.name)) {
      fail(`${at}: name ${JSON.stringify(cond.name)} is not [A-Za-z0-9_][A-Za-z0-9._-]{0,63}`);
    }

    if (names.has(cond.name)) {
      fail(`${at}: condition ${JSON.stringify(cond.name)} is declared twice`);
    }

    names.add(cond.name);
  });

  doc.conditions.forEach((cond, i) => {
    const at = `conditions[${i}]`;
    const key = cond.any ? "any" : "all";

    if (cond.rows.length === 0) {
      fail(`${at}: condition ${JSON.stringify(cond.name)} has no clauses`);
    }

    cond.rows.forEach((clause, j) =>
      checkClause(clause, `${at}.${key}[${j}]`, datasets, names, cond.name),
    );
  });

  /*
   * Циклы ссылок: условие, которое ждёт само себя через соседей, не считается
   * никогда, а вычислитель инспектора оборвал бы его молча ложью.
   */
  for (const cond of doc.conditions) {
    const cycle = findCycle(doc.conditions, cond.name, new Map());

    if (cycle !== "") {
      fail(`conditions refer to each other in a cycle: ${cycle}`);
    }
  }

  doc.rules.forEach((rule, i) => checkRule(rule, `rules[${i}]`, names, cookies, datasets));

  return doc;
}

/*
 * Объявление куки -- то же, чем отвергает загрузчик (parseCookie). Своё
 * здесь -- алфавит метки по умолчанию: инспектор сводит её к [A-Za-z0-9_-]
 * молча, и «direct!» превратилось бы в «direct_» без единого слова.
 */
function checkCookie(cookie: CookieDecl, at: string): void {
  if (!COOKIE_NAME_RE.test(cookie.name)) {
    fail(`${at}: name ${JSON.stringify(cookie.name)} is not a cookie name`);
  }

  if (!cookie.path.startsWith("/")) {
    fail(`${at}: path ${JSON.stringify(cookie.path)} does not start with /`);
  }

  if (!(COOKIE_SIGNS as readonly string[]).includes(cookie.sign)) {
    fail(`${at}: sign must be ${COOKIE_SIGNS.join(" or ")}`);
  }

  if (cookie.renewAfterS > 0) {
    if (cookie.sign !== "hmac") {
      fail(`${at}: renew_after needs sign: hmac -- without a signature the cookie carries no issue time`);
    }

    if (cookie.maxAgeS > 0 && cookie.renewAfterS >= cookie.maxAgeS) {
      fail(`${at}: renew_after is not shorter than max_age -- the browser drops the cookie before it is renewed`);
    }
  }

  const value = cookie.value;

  if (value.random < 0 || value.random > RANDOM_MAX) {
    fail(`${at}.value.random must be within 0..${RANDOM_MAX}`);
  }

  if (value.maxLen < 1 || value.maxLen > MAX_LEN_LIMIT) {
    fail(`${at}.value.max_len must be within 1..${MAX_LEN_LIMIT}`);
  }

  if (!TAG_RE.test(value.default)) {
    fail(`${at}.value.default: only [A-Za-z0-9_-] survives the cookie value`);
  }

  if (value.from !== "") {
    const parsed = parseActionValue(value.from);

    if ("error" in parsed) {
      fail(`${at}.value.from: ${parsed.error}`);
    }
  }

  if (value.from === "" && value.default === "" && value.random === 0) {
    fail(`${at}: value has no source: set from, default or random`);
  }
}

/** Обход по ссылкам; 1 -- в пути, 2 -- пройдено. Возвращает цепочку цикла. */
function findCycle(
  conds: ActionCondition[],
  name: string,
  state: Map<string, number>,
): string {
  const seen = state.get(name);

  if (seen === 1) {
    return name;
  }

  if (seen === 2) {
    return "";
  }

  state.set(name, 1);

  const cond = conds.find((row) => row.name === name);

  for (const clause of cond?.rows ?? []) {
    if (clause.cond === "") {
      continue;
    }

    const tail = findCycle(conds, clause.cond, state);

    if (tail !== "") {
      return `${name} -> ${tail}`;
    }
  }

  state.set(name, 2);

  return "";
}

function checkClause(
  clause: ActionClause,
  at: string,
  datasets: ActionDatasetInfo[] | undefined,
  names: Set<string>,
  self: string,
): void {
  /* Ссылка: только имя условия и is / is_not, ни значения, ни набора, ни текста. */
  if (clause.cond !== "" || opIsRef(clause.op)) {
    if (clause.cond === "") {
      fail(`${at}: ${clause.op} needs a cond`);
    }

    if (!opIsRef(clause.op)) {
      fail(`${at}: cond takes op is or is_not, got ${JSON.stringify(clause.op)}`);
    }

    if (clause.value !== "" || clause.dataset !== "" || clause.text !== "") {
      fail(`${at}: a cond row takes no value, dataset or text`);
    }

    if (clause.cond === self) {
      fail(`${at}: condition ${JSON.stringify(self)} refers to itself`);
    }

    if (!names.has(clause.cond)) {
      fail(`${at}: cond ${JSON.stringify(clause.cond)} is not declared in conditions`);
    }

    return;
  }

  const value = parseActionValue(clause.value);

  if ("error" in value) {
    fail(`${at}: ${value.error}`);
  }

  if (clause.op === ("" as string)) {
    fail(`${at}: op is empty (in, not_in, eq, ne; is, is_not with cond)`);
  }

  if (!isActionCondOp(clause.op)) {
    fail(`${at}: op must be in, not_in, eq or ne (is, is_not with cond), got ${JSON.stringify(clause.op)}`);
  }

  if (opTakesDataset(clause.op)) {
    if (clause.dataset === "") {
      fail(`${at}: ${clause.op} needs a dataset`);
    }

    if (clause.text.trim() !== "") {
      fail(`${at}: text is only for eq and ne`);
    }

    if (datasets === undefined) {
      return;
    }

    const ds = datasets.find((row) => row.name === clause.dataset);

    /*
     * Набор обязан быть активным списком: только такие держит keeper, и
     * только такие видит зеркало инспектора. Статический список едет в
     * nginx конфигурацией, а инспектору его взять неоткуда.
     */
    if (ds === undefined || ds.kind !== "list") {
      fail(`${at}: dataset ${JSON.stringify(clause.dataset)} is not a list of this space`);
    }

    if (!ds.active) {
      fail(`${at}: dataset ${JSON.stringify(clause.dataset)} is not active -- the inspector mirrors only active lists`);
    }

    if (isAddressDatasetType(ds.type) && !actionValueAddressable(value)) {
      fail(`${at}: dataset ${JSON.stringify(clause.dataset)} holds addresses and compares only with $remote_addr, a header or a var`);
    }

    return;
  }

  // Текст обязателен: сравнение с пустотой -- это «значения нет», и для
  // него есть `not in` с любым набором.
  if (clause.text === "") {
    fail(`${at}: ${clause.op} needs a text`);
  }

  if (clause.dataset !== "") {
    fail(`${at}: dataset is only for in and not_in`);
  }
}

function checkRule(
  rule: CookieRule,
  at: string,
  conds: Set<string>,
  cookies: Map<string, CookieDecl>,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  for (const s of rule.match.suffixes) {
    if (s === "") {
      fail(`${at}: empty suffix`);
    }
  }

  for (const m of rule.match.methods) {
    if (!METHOD_RE.test(m)) {
      fail(`${at}: ${m} is not a method`);
    }
  }

  /*
   * Ссылка -- только на объявленное условие: опечатка в имени иначе
   * становилась бы правилом, которое не срабатывает никогда (если) либо
   * срабатывает всегда (если не), и ни то ни другое не видно.
   */
  if (rule.cond !== "" && !conds.has(rule.cond)) {
    fail(`${at}: condition ${JSON.stringify(rule.cond)} is not declared in conditions`);
  }

  checkRuleCookie(rule, at, cookies);

  /*
   * Правило без операции и без действий не делает ничего. У инспектора
   * действий проверка была строже -- там правило без просьб бессмысленно
   * целиком; здесь правило вправе только выдать куку и промолчать.
   */
  if (rule.actions.length === 0 && rule.issue === "" && rule.drop === "") {
    fail(`${at}: the rule neither issues, drops nor sends anything`);
  }

  rule.actions.forEach((ask, j) =>
    checkRuleAsk(ask, `${at}.actions[${j}]`, rule, cookies, datasets),
  );
}

/*
 * Фаза, код ответа, состояние и операция. Правило, которое не срабатывает
 * никогда, -- это опечатка, и находиться она должна здесь: on: invalid у
 * неподписанной куки и status на фазе запроса молчат одинаково убедительно.
 */
function checkRuleCookie(rule: CookieRule, at: string, cookies: Map<string, CookieDecl>): void {
  if (rule.phase !== "" && !(COOKIE_PHASES as readonly string[]).includes(rule.phase)) {
    fail(`${at}: phase must be ${COOKIE_PHASES.join(" or ")}`);
  }

  for (const code of rule.status) {
    if (code < 100 || code > 599) {
      fail(`${at}: status ${code} is not an http status`);
    }
  }

  if (rule.status.length > 0 && rule.phase !== "response") {
    fail(`${at}: status needs phase: response`);
  }

  if (rule.issue !== "" && rule.drop !== "") {
    fail(`${at}: issue and drop together -- a rule does one thing`);
  }

  for (const name of [rule.issue, rule.drop, rule.cookie]) {
    if (name !== "" && !cookies.has(name)) {
      fail(`${at}: cookie ${JSON.stringify(name)} is not declared in cookies`);
    }
  }

  if (rule.on === "") {
    return;
  }

  if (!(COOKIE_STATES as readonly string[]).includes(rule.on)) {
    fail(`${at}: on must be one of ${COOKIE_STATES.join(", ")}`);
  }

  const named = ruleCookie(rule, cookies);

  if (named === "") {
    fail(`${at}: on ${rule.on} needs cookie: which one`);
  }

  const decl = cookies.get(named);

  if (decl === undefined) {
    return;
  }

  if (decl.sign !== "hmac" && (rule.on === "invalid" || rule.on === "expired")) {
    fail(`${at}: on ${rule.on} needs sign: hmac on cookie ${JSON.stringify(decl.name)}`);
  }

  if (rule.on === "expired" && decl.renewAfterS === 0) {
    fail(`${at}: on expired needs renew_after on cookie ${JSON.stringify(decl.name)}`);
  }
}

/*
 * О какой куке говорит правило: её называет операция, поле cookie -- либо,
 * когда объявлена одна, она же и подразумевается. То же умолчание, что у
 * загрузчика: писать имя в каждой строке профиля с одной кукой незачем.
 */
function ruleCookie(rule: CookieRule, cookies: Map<string, CookieDecl>): string {
  const named = rule.cookie || rule.issue || rule.drop;

  if (named !== "") {
    return named;
  }

  return cookies.size === 1 ? [...cookies.keys()][0] : "";
}

/*
 * Просьбу проверяет общий валидатор канала: форма у неё одна на всех
 * отправителей. Своё здесь -- только требование адресата: инспектор
 * действий пересылает чужие слова, и правило, писанное руками, обязано
 * называть, кому. Строка с набором -- не просьба, а запись.
 */
function checkRuleAsk(
  ask: CookieAsk,
  at: string,
  rule: CookieRule,
  cookies: Map<string, CookieDecl>,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  if (ask.list !== "") {
    checkListWrite(ask, at, rule, cookies, datasets);

    return;
  }

  if (ask.cookie !== "") {
    fail(`${at}: cookie is only for write: cookie`);
  }

  if (ask.op !== "add") {
    fail(`${at}: op is only for a list write`);
  }

  checkAsk(at, ask, { fail, requireTo: true });
}

const LIST_WRITES = new Set<CookieAsk["write"]>(["addr", "net", "net_all", "asn", "cookie"]);
const LIST_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

/*
 * Запись в набор -- то же, чем отвергает загрузчик (parseWrite): у записи нет
 * ни адресата, ни глагола, ни оси, пишет сам инспектор; кого писать -- те же
 * четыре охвата, что у остальных отправителей; срок обязателен. С каталогом --
 * ещё и набор: активный список пространства (в другой keeper не пишет), а
 * подсеть и систему -- только в набор адресов: префикс в наборе строк не
 * совпал бы ни с одним адресом.
 */
function checkListWrite(
  ask: CookieAsk,
  at: string,
  rule: CookieRule,
  cookies: Map<string, CookieDecl>,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  if (
    ask.do !== "" || ask.to !== "" || ask.apply !== "" || ask.delta !== null ||
    ask.value !== null || ask.counter !== "" || ask.marker !== "" || ask.group !== "" ||
    (ask.phase ?? "") !== "" || ask.set !== "" || ask.headers !== null ||
    ask.args !== null || ask.body !== null || ask.when.length > 0
  ) {
    fail(`${at}: a list write takes only list, write, op, cookie, ttl and code`);
  }

  if (!LIST_NAME_RE.test(ask.list)) {
    fail(`${at}: list ${JSON.stringify(ask.list)} is not a dataset name`);
  }

  if (!LIST_WRITES.has(ask.write)) {
    fail(`${at}.write must be addr, net, net_all, asn or cookie`);
  }

  if (ask.op !== "add" && ask.op !== "remove") {
    fail(`${at}.op must be add or remove`);
  }

  if (ask.write === "cookie") {
    const named = ask.cookie || ruleCookie(rule, cookies);

    if (named === "") {
      fail(`${at}: write cookie needs cookie: whose value to write`);
    }

    if (!cookies.has(named)) {
      fail(`${at}: cookie ${JSON.stringify(named)} is not declared in cookies`);
    }
  } else if (ask.cookie !== "") {
    fail(`${at}: cookie is only for write: cookie`);
  }

  /*
   * Снятие срока не имеет: запись либо есть, либо её больше нет. Срок у
   * remove читался бы как «снять на час», а это не то, что произойдёт.
   */
  if (ask.op === "remove") {
    if (ask.ttlS > 0) {
      fail(`${at}: op remove takes no ttl`);
    }
  } else if (ask.ttlS <= 0) {
    fail(`${at}: a list write needs ttl`);
  }

  if (ask.code !== "" && !CODE_RE.test(ask.code)) {
    fail(`${at}: code ${JSON.stringify(ask.code)} is not [A-Z][A-Z0-9_]{0,63}`);
  }

  if (datasets === undefined) {
    return;
  }

  const ds = datasets.find((row) => row.name === ask.list);

  if (ds === undefined || ds.kind !== "list") {
    fail(`${at}: dataset ${JSON.stringify(ask.list)} is not a list of this space`);
  }

  if (!ds.active) {
    fail(`${at}: dataset ${JSON.stringify(ask.list)} is not active -- keeper writes only active lists`);
  }

  if (ask.write === "cookie") {
    /*
     * Значение куки -- строка, и в набор адресов его не положить: там
     * запись обязана быть адресом или префиксом.
     */
    if (isAddressDatasetType(ds.type)) {
      fail(`${at}: write cookie puts a string, and dataset ${JSON.stringify(ask.list)} holds addresses`);
    }

    return;
  }

  if (ask.write !== "addr" && !isAddressDatasetType(ds.type)) {
    fail(`${at}: write ${ask.write} puts prefixes, and dataset ${JSON.stringify(ask.list)} holds no addresses`);
  }
}

/** Наборы, которые читают условия документа, без повторов. */
export function docDatasets(doc: CookieProfileDoc): string[] {
  const out: string[] = [];

  for (const cond of doc.conditions) {
    for (const clause of cond.rows) {
      if (opTakesDataset(clause.op) && clause.dataset !== "" && !out.includes(clause.dataset)) {
        out.push(clause.dataset);
      }
    }
  }

  return out;
}


/* --- печать в YAML ---------------------------------------------------------- */

/**
 * renderProfileYaml печатает ровно то, что читает загрузчик инспектора. С
 * каталогом наборов у строки условия печатаются `type: cidr` и `hash: md5`:
 * инспектор знает набор только по имени, а сравнивать адрес и хеш обязан так
 * же, как модуль.
 */
export function renderProfileYaml(
  name: string,
  doc: CookieProfileDoc,
  datasets?: ActionDatasetInfo[],
): string {
  const out: string[] = [];

  out.push(`# Профиль куки ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица cookie_profiles, раздел /cookie в UX.");
  out.push("");
  // Режима у профиля больше нет: включён ли инспектор и гейтит ли он, решает
  // вызов на маршруте (waf_inspect … mode=). mode: enforce печатается ради
  // загрузчика инспектора, у которого ключ пока обязателен.
  out.push("mode: enforce");
  out.push("");

  if (doc.cookies.length > 0) {
    out.push("cookies:");

    for (const cookie of doc.cookies) {
      out.push(`  - name: ${q(cookie.name)}`);
      out.push(`    path: ${q(cookie.path)}`);

      /* Срока нет -- кука сессии, и ключ не печатается вовсе. */
      if (cookie.maxAgeS > 0) {
        out.push(`    max_age: ${q(ttl(cookie.maxAgeS))}`);
      }

      if (cookie.renewAfterS > 0) {
        out.push(`    renew_after: ${q(ttl(cookie.renewAfterS))}`);
      }

      out.push(`    sign: ${cookie.sign}`);
      out.push("    value:");

      if (cookie.value.from !== "") {
        out.push(`      from: ${q(cookie.value.from)}`);
      }

      if (cookie.value.default !== "") {
        out.push(`      default: ${q(cookie.value.default)}`);
      }

      out.push(`      random: ${cookie.value.random}`);
      out.push(`      max_len: ${cookie.value.maxLen}`);
    }

    out.push("");
  }

  if (doc.conditions.length > 0) {
    out.push("conditions:");

    for (const cond of doc.conditions) {
      out.push(`  - name: ${q(cond.name)}`);
      out.push(`    ${cond.any ? "any" : "all"}:`);

      for (const clause of cond.rows) {
        /* Ссылка на условие: имя и is / is_not, больше ничего. */
        if (opIsRef(clause.op)) {
          out.push(`      - cond: ${q(clause.cond)}`);
          out.push(`        op: ${clause.op}`);

          continue;
        }

        out.push(`      - value: ${q(clause.value)}`);
        out.push(`        op: ${clause.op}`);

        if (opTakesDataset(clause.op)) {
          out.push(`        dataset: ${q(clause.dataset)}`);

          const ds = datasets?.find((row) => row.name === clause.dataset);

          if (ds !== undefined && isAddressDatasetType(ds.type)) {
            out.push("        type: cidr");
          }

          if (ds !== undefined && ds.hash) {
            out.push("        hash: md5");
          }
        } else {
          out.push(`        text: ${q(clause.text)}`);
        }
      }
    }

    out.push("");
  }

  if (doc.rules.length === 0) {
    out.push("rules: []");
    out.push("");

    return out.join("\n");
  }

  out.push("rules:");

  for (const rule of doc.rules) {
    /*
     * Имя не обязательно: пустое загрузчик заменит порядковым. Панель имён не
     * спрашивает вовсе -- профиль привязан к маршруту, и правило узнаётся по
     * адресату с глаголом, а не по прозвищу.
     */
    const lines: string[] = [];

    if (rule.name !== "") {
      lines.push(`name: ${q(rule.name)}`);
    }

    if (rule.phase !== "") {
      lines.push(`phase: ${rule.phase}`);
    }

    if (rule.status.length > 0) {
      lines.push(`status: [${rule.status.join(", ")}]`);
    }

    const match: string[] = [];

    if (rule.match.pathPrefix !== "") {
      match.push(`  path_prefix: ${q(rule.match.pathPrefix)}`);
    }

    if (rule.match.suffixes.length > 0) {
      match.push(`  suffixes: ${seq(rule.match.suffixes)}`);
    }

    if (rule.match.static) {
      match.push("  static: true");
    }

    if (rule.match.methods.length > 0) {
      match.push(`  methods: ${seq(rule.match.methods)}`);
    }

    if (match.length > 0) {
      lines.push("match:");
      lines.push(...match);
    }

    /* Условие -- словами загрузчика: if -- когда истинно, unless -- когда ложно. */
    if (rule.cond !== "") {
      lines.push(`${rule.negate ? "unless" : "if"}: ${q(rule.cond)}`);
    }

    /*
     * Состояние и операция. Имя куки при on: печатается всегда, даже когда
     * загрузчик вывел бы его сам: профиль читают глазами чаще, чем грузят.
     */
    if (rule.on !== "") {
      lines.push(`on: ${rule.on}`);

      const named = ruleCookie(rule, new Map(doc.cookies.map((c) => [c.name, c])));

      if (named !== "") {
        lines.push(`cookie: ${q(named)}`);
      }
    }

    if (rule.issue !== "") {
      lines.push(`issue: ${q(rule.issue)}`);
    }

    if (rule.drop !== "") {
      lines.push(`drop: ${q(rule.drop)}`);
    }

    if (rule.actions.length === 0) {
      lines.forEach((line, i) => {
        out.push(`${i === 0 ? "  - " : "    "}${line}`);
      });

      continue;
    }

    lines.push("actions:");

    for (const ask of rule.actions) {
      /*
       * Запись в набор: не просьба -- ни адресата, ни глагола, только куда,
       * кого и на сколько. Адрес -- умолчание загрузчика, его ключ не пишется.
       */
      if (ask.list !== "") {
        lines.push(`  - list: ${q(ask.list)}`);

        if (ask.write !== "addr") {
          lines.push(`    write: ${ask.write}`);
        }

        if (ask.write === "cookie" && ask.cookie !== "") {
          lines.push(`    cookie: ${q(ask.cookie)}`);
        }

        /* Снятию срок не нужен и запрещён: записи после него нет вовсе. */
        if (ask.op === "remove") {
          lines.push("    op: remove");
        } else {
          lines.push(`    ttl: ${q(ttl(ask.ttlS))}`);
        }

        if (ask.code !== "") {
          lines.push(`    code: ${q(ask.code)}`);
        }

        continue;
      }

      lines.push(`  - to: ${q(ask.to)}`);
      lines.push(`    do: ${ask.do}`);
      lines.push(`    apply: ${ask.apply}`);

      if (ask.delta !== null) {
        lines.push(`    delta: ${ask.delta}`);
      }

      if (ask.value !== null) {
        lines.push(`    value: ${ask.value}`);
      }

      if (ask.counter !== "") {
        lines.push(`    counter: ${q(ask.counter)}`);
      }

      if (ask.marker !== "") {
        lines.push(`    marker: ${q(ask.marker)}`);
      }

      if (ask.group !== "") {
        lines.push(`    group: ${q(ask.group)}`);
        lines.push(`    set: ${ask.set}`);
      }

      if ((ask.phase ?? "") !== "") {
        lines.push(`    phase: ${ask.phase}`);
      }

      if (ask.do === "audit" || ask.do === "archive") {
        lines.push(`    set: ${ask.set}`);

        if (ask.set === "on") {
          if (ask.do === "archive" && ask.ttlS > 0) {
            lines.push(`    ttl: ${q(ttl(ask.ttlS))}`);
          }

          /* Исход -- множеством: пустое пишется отсутствием ключа. */
          if (ask.do === "archive" && ask.when.length > 0) {
            lines.push(`    when: ${seq(ask.when)}`);
          }

          for (const name of RECORD_OBJECTS) {
            const spec = ask[name];

            if (spec !== null) {
              lines.push(`    ${name}: ${recordObjectYaml(spec)}`);
            }
          }
        }
      }

      if (ask.code !== "") {
        lines.push(`    code: ${q(ask.code)}`);
      }
    }

    // Первая строка пункта списка едет с «- », остальные -- с отступом.
    lines.forEach((line, i) => {
      out.push(`${i === 0 ? "  - " : "    "}${line}`);
    });
  }

  out.push("");

  return out.join("\n");
}

/**
 * Срок человеческой записью для загрузчика: он читает time.ParseDuration с
 * сутками, и "30d" ему понятнее, чем "2592000s".
 */
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


/** Объект просьбы записи одной строкой YAML: `{ set: off }`, `{ limit: 8192, source: original }`. */
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
