import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";
import {
  isAddressDatasetType,
  parseActionValue,
  type ActionDatasetInfo,
} from "./model/action-cond.ts";
import {
  COOKIE_PHASES,
  COOKIE_SIGNS,
  COOKIE_STATES,
  type ActionMatch,
  type CookieAsk,
  type CookieDecl,
  type CookieListed,
  type CookiePhase,
  type CookieProfileDoc,
  type CookieRule,
  type CookieSign,
  type CookieState,
} from "./model/cookie-profile.ts";

const METHOD_RE = /^[A-Z]+$/;
const COOKIE_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const TAG_RE = /^[A-Za-z0-9_-]*$/;
const RULE_TAG_RE = /^[A-Za-z0-9_-]{1,128}$/;
const RANDOM_MAX = 32;
const MAX_LEN_LIMIT = 128;

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

function archiveWhen(value: unknown, path: string): ArchiveWhen[] {
  const words = strings(value, path).map((word) => word.trim().toLowerCase());

  for (const word of words) {
    if (!(ARCHIVE_WHEN as readonly string[]).includes(word)) {
      fail(`${path}: outcome must be allow or deny, got ${word}`);
    }
  }

  return ARCHIVE_WHEN.filter((name) => words.includes(name));
}

/*
 * A cookie profile has no conditions: a rule is narrowed by the cookie's state and label, the
 * phase, response codes, path and methods. A document that still carries conditions or a rule's
 * if / unless is refused from the API: dropping them quietly would widen the rules. A row saved
 * before is read with them dropped (`legacy: "drop"`), so the page opens and saving it again
 * writes the profile without them.
 */
export interface NormalizeOptions {
  legacy?: "reject" | "drop";
}

const LEGACY_HINT =
  "cookie profiles have no conditions -- narrow a rule by the cookie's state and label, phase, response codes, path and methods";

export function normalizeDoc(input: unknown, opts: NormalizeOptions = {}): CookieProfileDoc {
  const root = obj(input, "doc");
  const reject = (opts.legacy ?? "reject") === "reject";

  if (reject && arr(root.conditions, "conditions").length > 0) {
    fail(`conditions: ${LEGACY_HINT}`);
  }

  return {
    description: str(root.description, "description"),
    cookies: arr(root.cookies, "cookies").map((raw, i) =>
      normalizeCookie(raw, `cookies[${i}]`),
    ),
    rules: arr(root.rules, "rules").map((raw, i) => normalizeRule(raw, `rules[${i}]`, reject)),
  };
}

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

function normalizeRule(raw: unknown, path: string, reject: boolean): CookieRule {
  const row = obj(raw, path);
  const match = obj(row.match, `${path}.match`);

  if (
    reject &&
    (str(row.if, `${path}.if`).trim() !== "" ||
      str(row.unless, `${path}.unless`).trim() !== "" ||
      str(row.cond, `${path}.cond`).trim() !== "")
  ) {
    fail(`${path}: ${LEGACY_HINT}`);
  }

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
    on: str(row.on, `${path}.on`).trim() as CookieRule["on"],
    at: intOrNull(row.at, `${path}.at`),
    cookie: str(row.cookie, `${path}.cookie`).trim(),
    ...normalizeTags(row, path),
    listed: normalizeListed(row.listed, `${path}.listed`),
    issue: str(row.issue, `${path}.issue`).trim(),
    drop: str(row.drop, `${path}.drop`).trim(),
    actions: arr(row.actions, `${path}.actions`).map((ask, j) =>
      normalizeAsk(ask, `${path}.actions[${j}]`),
    ),
  };
}

/*
 * Tags narrow a rule by the label of the presented cookie: one of them (tags) or none of them
 * (tagsNot, not_tags in a hand-written file).
 */
function normalizeTags(row: Record<string, unknown>, path: string): { tags: string[]; tagsNot: boolean } {
  const tags = strings(row.tags, `${path}.tags`).map((tag) => tag.trim());
  const notTags = strings(row.not_tags, `${path}.not_tags`).map((tag) => tag.trim());

  if (tags.length > 0 && notTags.length > 0) {
    fail(`${path}: tags and not_tags together -- pick one`);
  }

  if (notTags.length > 0) {
    return { tags: notTags, tagsNot: true };
  }

  return { tags, tagsNot: tags.length > 0 && bool(row.tagsNot, `${path}.tagsNot`, false) };
}

function normalizeListed(value: unknown, path: string): CookieListed | null {
  if (value === undefined || value === null) {
    return null;
  }

  const row = obj(value, path);
  const op = str(row.op, `${path}.op`, "in").trim();

  return {
    list: str(row.list, `${path}.list`).trim(),
    op: (op === "not in" ? "not_in" : op || "in") as CookieListed["op"],
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

export function validateDoc(input: unknown, datasets?: ActionDatasetInfo[]): CookieProfileDoc {
  const doc = normalizeDoc(input);
  const cookies = new Map<string, CookieDecl>();

  doc.cookies.forEach((cookie, i) => {
    const at = `cookies[${i}]`;

    checkCookie(cookie, at);

    if (cookies.has(cookie.name)) {
      fail(`${at}: cookie ${JSON.stringify(cookie.name)} is declared twice`);
    }

    cookies.set(cookie.name, cookie);
  });

  doc.rules.forEach((rule, i) => checkRule(rule, `rules[${i}]`, cookies, datasets));

  return doc;
}

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

function checkRule(
  rule: CookieRule,
  at: string,
  cookies: Map<string, CookieDecl>,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  if (rule.on === "overload") {
    checkOverloadAt(rule.at, at, fail);

    if (
      rule.match.pathPrefix !== "" || rule.match.suffixes.length > 0 || rule.match.static ||
      rule.match.methods.length > 0 || rule.phase !== "" || rule.status.length > 0 ||
      rule.cookie !== "" || rule.tags.length > 0 || rule.listed !== null || rule.issue !== "" ||
      rule.drop !== ""
    ) {
      fail(`${at}: on: overload takes only at and actions`);
    }

    if (rule.actions.length === 0) {
      fail(`${at}: on: overload without actions does nothing`);
    }

    rule.actions.forEach((ask, j) =>
      checkRuleAsk(ask, `${at}.actions[${j}]`, rule, cookies, datasets),
    );

    return;
  }

  if ((rule.at ?? null) !== null) {
    fail(`${at}: at is only for on: overload`);
  }

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

  checkRuleCookie(rule, at, cookies, datasets);

  if (rule.actions.length === 0 && rule.issue === "" && rule.drop === "") {
    fail(`${at}: the rule neither issues, drops nor sends anything`);
  }

  rule.actions.forEach((ask, j) =>
    checkRuleAsk(ask, `${at}.actions[${j}]`, rule, cookies, datasets),
  );
}

function checkRuleCookie(
  rule: CookieRule,
  at: string,
  cookies: Map<string, CookieDecl>,
  datasets: ActionDatasetInfo[] | undefined,
): void {
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

  for (const tag of rule.tags) {
    if (!RULE_TAG_RE.test(tag)) {
      fail(`${at}: tag ${JSON.stringify(tag)} is not [A-Za-z0-9_-]{1,128}`);
    }
  }

  const tagsKey = rule.tagsNot ? "not_tags" : "tags";

  if (rule.tags.length > 0) {
    if (ruleCookie(rule, cookies) === "") {
      fail(`${at}: ${tagsKey} need cookie: which one`);
    }

    if (rule.on === "absent" || rule.on === "invalid") {
      fail(`${at}: ${tagsKey} never match on ${rule.on} -- such a cookie carries no tag`);
    }
  }

  if (rule.listed !== null) {
    if (rule.on === "absent" || rule.on === "invalid") {
      fail(`${at}: listed looks up nothing on ${rule.on} -- such a cookie has no value`);
    }

    checkListed(rule.listed, `${at}.listed`, ruleCookie(rule, cookies), datasets);
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

function ruleCookie(rule: CookieRule, cookies: Map<string, CookieDecl>): string {
  const named = rule.cookie || rule.issue || rule.drop;

  if (named !== "") {
    return named;
  }

  return cookies.size === 1 ? [...cookies.keys()][0] : "";
}

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
    fail(`${at}: cookie is only for write: value or cookie`);
  }

  if (ask.op !== "add") {
    fail(`${at}: op is only for a list write`);
  }

  checkAsk(at, ask, { fail, requireTo: true });

  if (ask.do === "mark") {
    const own = rule.on === "overload" ? "" : ruleCookie(rule, cookies);
    // On absent and invalid the rule's cookie has no value, unless the rule issues it itself.
    const valued = (rule.on !== "absent" && rule.on !== "invalid") || rule.issue === own;

    checkMarkerSlots(ask.marker, at, own, valued, cookies);
  }
}

/*
 * A marker is a string with slots filled from the cookies of the request: {value} the value of the
 * rule's cookie ({tag} is its old name), {cookie} its whole string, {name} its name, {<name>} the
 * value of any cookie of the profile. The inspector refuses a slot it cannot fill, and so does the
 * controller.
 */
const OWN_SLOTS = new Set(["value", "tag", "cookie", "name"]);

export function markerSlots(marker: string): { slots: string[]; unpaired: boolean } {
  const slots: string[] = [];
  let rest = marker;

  for (;;) {
    const open = rest.indexOf("{");
    const close = rest.indexOf("}");

    if (open < 0) {
      return { slots, unpaired: close >= 0 };
    }

    if (close >= 0 && close < open) {
      return { slots, unpaired: true };
    }

    const end = rest.indexOf("}", open);

    if (end < 0) {
      return { slots, unpaired: true };
    }

    slots.push(rest.slice(open + 1, end));
    rest = rest.slice(end + 1);
  }
}

function checkMarkerSlots(
  marker: string,
  at: string,
  own: string,
  valued: boolean,
  cookies: Map<string, CookieDecl>,
): void {
  const { slots, unpaired } = markerSlots(marker);

  if (unpaired) {
    fail(`${at}: marker ${JSON.stringify(marker)} has an unpaired brace`);
  }

  for (const slot of slots) {
    if (OWN_SLOTS.has(slot)) {
      if (own === "") {
        fail(`${at}: marker {${slot}} speaks of the rule's cookie, and the rule has none -- name the cookie: {<name>}`);
      }

      if (!valued && slot !== "name") {
        fail(`${at}: marker {${slot}} -- here the rule's cookie has no value; keep the marker a plain string or name another cookie`);
      }

      continue;
    }

    if (!cookies.has(slot)) {
      fail(`${at}: marker {${slot}} is not a cookie of the profile -- {value}, {cookie}, {name} or a cookie name`);
    }
  }
}

/*
 * A list check reads the value of the rule's cookie: a string, so the list holds strings. A dynamic
 * list is mirrored by the inspector; a static one travels with the generation (its body through
 * the internal Redis) and is only compared with -- nothing writes into it.
 */
function checkListed(
  listed: CookieListed,
  at: string,
  cookie: string,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  if (!LIST_NAME_RE.test(listed.list)) {
    fail(`${at}: list ${JSON.stringify(listed.list)} is not a dataset name`);
  }

  if (listed.op !== "in" && listed.op !== "not_in") {
    fail(`${at}.op must be in or not_in`);
  }

  if (cookie === "") {
    fail(`${at}: listed needs cookie: whose value to look up`);
  }

  if (datasets === undefined) {
    return;
  }

  const ds = datasets.find((row) => row.name === listed.list);

  if (ds === undefined || ds.kind !== "list") {
    fail(`${at}: dataset ${JSON.stringify(listed.list)} is not a list of this space`);
  }

  if (isAddressDatasetType(ds.type)) {
    fail(`${at}: dataset ${JSON.stringify(listed.list)} holds addresses, and a cookie value is a string`);
  }
}

/* The static lists the rules of a profile compare with: their bodies travel with the generation. */
export function staticLists(doc: CookieProfileDoc, datasets: ActionDatasetInfo[]): string[] {
  const out = new Set<string>();

  for (const rule of doc.rules) {
    if (rule.listed === null) {
      continue;
    }

    const ds = datasets.find((row) => row.name === rule.listed?.list);

    if (ds !== undefined && !ds.active) {
      out.add(ds.name);
    }
  }

  return [...out];
}

/*
 * value puts the value of the cookie (what a list check compares), cookie the whole string the
 * client carries (value, number, time and signature).
 */
const COOKIE_WRITES = new Set<CookieAsk["write"]>(["value", "cookie"]);
const LIST_WRITES = new Set<CookieAsk["write"]>(["addr", "net", "net_all", "asn", "value", "cookie"]);
const LIST_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

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
    fail(`${at}.write must be addr, net, net_all, asn, value or cookie`);
  }

  if (ask.op !== "add" && ask.op !== "remove") {
    fail(`${at}.op must be add or remove`);
  }

  if (COOKIE_WRITES.has(ask.write)) {
    const named = ask.cookie || ruleCookie(rule, cookies);

    if (named === "") {
      fail(`${at}: write ${ask.write} needs cookie: which one`);
    }

    if (!cookies.has(named)) {
      fail(`${at}: cookie ${JSON.stringify(named)} is not declared in cookies`);
    }
  } else if (ask.cookie !== "") {
    fail(`${at}: cookie is only for write: value or cookie`);
  }

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
    fail(`${at}: dataset ${JSON.stringify(ask.list)} is static -- only a dynamic list is written`);
  }

  if (COOKIE_WRITES.has(ask.write)) {
    if (isAddressDatasetType(ds.type)) {
      fail(`${at}: write ${ask.write} puts a string, and dataset ${JSON.stringify(ask.list)} holds addresses`);
    }

    return;
  }

  if (ask.write !== "addr" && !isAddressDatasetType(ds.type)) {
    fail(`${at}: write ${ask.write} puts prefixes, and dataset ${JSON.stringify(ask.list)} holds no addresses`);
  }
}

export function renderProfileYaml(
  name: string,
  doc: CookieProfileDoc,
  datasets?: ActionDatasetInfo[],
): string {
  const out: string[] = [];

  out.push(`# Профиль куки ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица cookie_profiles, раздел /cookie в UX.");
  out.push("");
  out.push("mode: enforce");
  out.push("");

  if (doc.cookies.length > 0) {
    out.push("cookies:");

    for (const cookie of doc.cookies) {
      out.push(`  - name: ${q(cookie.name)}`);
      out.push(`    path: ${q(cookie.path)}`);

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

  if (doc.rules.length === 0) {
    out.push("rules: []");
    out.push("");

    return out.join("\n");
  }

  out.push("rules:");

  for (const rule of doc.rules) {
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

    if (rule.on === "overload") {
      lines.push("on: overload");

      if (rule.at !== null && rule.at !== undefined) {
        lines.push(`at: ${rule.at}`);
      }
    } else if (
      rule.on !== "" ||
      rule.tags.length > 0 ||
      rule.listed !== null ||
      (rule.cookie !== "" && rule.issue === "" && rule.drop === "")
    ) {
      if (rule.on !== "") {
        lines.push(`on: ${rule.on}`);
      }

      const named = ruleCookie(rule, new Map(doc.cookies.map((c) => [c.name, c])));

      if (named !== "") {
        lines.push(`cookie: ${q(named)}`);
      }
    }

    if (rule.tags.length > 0) {
      lines.push(`${rule.tagsNot ? "not_tags" : "tags"}: ${seq(rule.tags)}`);
    }

    if (rule.listed !== null) {
      const ds = datasets?.find((row) => row.name === rule.listed?.list);
      const hash = ds !== undefined && ds.hash ? ", hash: md5" : "";
      const kind = ds !== undefined && !ds.active ? ", static: true" : "";

      lines.push(`listed: { list: ${q(rule.listed.list)}, op: ${rule.listed.op}${hash}${kind} }`);
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
      if (ask.list !== "") {
        lines.push(`  - list: ${q(ask.list)}`);

        if (ask.write !== "addr") {
          lines.push(`    write: ${ask.write}`);
        }

        if (COOKIE_WRITES.has(ask.write)) {
          // Named always: an overload rule has no cookie of its own for the inspector to take.
          const named = ask.cookie || ruleCookie(rule, new Map(doc.cookies.map((c) => [c.name, c])));

          if (named !== "") {
            lines.push(`    cookie: ${q(named)}`);
          }
        }

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

    lines.forEach((line, i) => {
      out.push(`${i === 0 ? "  - " : "    "}${line}`);
    });
  }

  out.push("");

  return out.join("\n");
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
