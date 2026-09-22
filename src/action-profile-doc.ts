import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";
import {
  ACTION_COND_NAME_RE,
  ACTION_WHEN_NAME_RE,
  actionValueAddressable,
  isActionCondOp,
  isAddressDatasetType,
  opTakesDataset,
  parseActionValue,
  type ActionCondOp,
  type ActionDatasetInfo,
} from "./model/action-cond.ts";
import type {
  ActionAsk,
  ActionCondition,
  ActionMatch,
  ActionProfileDoc,
  ActionRule,
  ActionWhenGroup,
  ActionWhenItem,
} from "./model/action-profile.ts";

const METHOD_RE = /^[A-Z]+$/;

/*
 * Limits of a rule's When: groups joined by OR, conditions inside a group joined by AND. A
 * hand-written document of the old form is converted into the same groups and obeys them too.
 */
export const WHEN_GROUPS_MAX = 32;
export const WHEN_ITEMS_MAX = 32;

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
 * The document has two forms. The panel's form: a condition is one check (value, comparison,
 * dataset or text), and a rule's `when` lists groups -- OR between groups, AND inside one, each
 * condition with its own `not`. The old form, still accepted from the API and from rows saved
 * before: a condition joins rows with `all` or `any`, a row may point to another condition
 * (`cond` + `is` / `is_not`), and a rule names one condition with `if` or `unless`. The old form
 * is converted on read: every value row becomes a condition of its own, and a rule's `if` or
 * `unless` becomes the equivalent groups.
 */
export function normalizeDoc(input: unknown): ActionProfileDoc {
  const root = obj(input, "doc");
  const description = str(root.description, "description");
  const conditions: ActionCondition[] = [];
  const legacy: LegacyCondition[] = [];

  arr(root.conditions, "conditions").forEach((raw, i) => {
    const path = `conditions[${i}]`;
    const row = obj(raw, path);

    if (row.rows !== undefined || row.all !== undefined || row.any !== undefined) {
      legacy.push(normalizeLegacyCondition(row, path));
    } else {
      conditions.push(normalizeCondition(row, path));
    }
  });

  const rules = arr(root.rules, "rules").map((raw, i) => normalizeRule(raw, `rules[${i}]`));

  if (legacy.length === 0 && rules.every((row) => row.legacy === null)) {
    return { description, conditions, rules: rules.map((row) => row.rule) };
  }

  return upgradeDoc(description, conditions, legacy, rules);
}

const OP_WORDS: Record<string, string> = { "not in": "not_in", "is not": "is_not" };

function normalizeCondition(row: Record<string, unknown>, path: string): ActionCondition {
  const op = str(row.op, `${path}.op`).trim();

  return {
    name: str(row.name, `${path}.name`).trim(),
    value: str(row.value, `${path}.value`).trim(),
    op: (OP_WORDS[op] ?? op) as ActionCondOp,
    dataset: str(row.dataset, `${path}.dataset`).trim(),
    text: str(row.text, `${path}.text`),
  };
}

interface LegacyValueRow {
  check: ActionCondition;
}

interface LegacyRefRow {
  ref: string;
  not: boolean;
}

type LegacyRow = LegacyValueRow | LegacyRefRow;

interface LegacyCondition {
  name: string;
  any: boolean;
  rows: LegacyRow[];
}

function normalizeLegacyCondition(row: Record<string, unknown>, path: string): LegacyCondition {
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
      normalizeLegacyRow(clause, `${path}.rows[${j}]`),
    ),
  };
}

function normalizeLegacyRow(raw: unknown, path: string): LegacyRow {
  const row = obj(raw, path);
  const said = str(row.op, `${path}.op`).trim();
  const op = OP_WORDS[said] ?? said;
  const cond = str(row.cond, `${path}.cond`).trim();

  if (cond === "" && op !== "is" && op !== "is_not") {
    return { check: normalizeCondition(row, path) };
  }

  if (cond === "") {
    fail(`${path}: ${op} needs a cond`);
  }

  if (op !== "is" && op !== "is_not") {
    fail(`${path}: cond takes op is or is_not, got ${JSON.stringify(said)}`);
  }

  if (
    str(row.value, `${path}.value`).trim() !== "" ||
    str(row.dataset, `${path}.dataset`).trim() !== "" ||
    str(row.text, `${path}.text`) !== ""
  ) {
    fail(`${path}: a cond row takes no value, dataset or text`);
  }

  return { ref: cond, not: op === "is_not" };
}

interface NormalizedRule {
  rule: ActionRule;
  legacy: { cond: string; negate: boolean } | null;
}

function normalizeRule(raw: unknown, path: string): NormalizedRule {
  const row = obj(raw, path);
  const match = obj(row.match, `${path}.match`);

  const ifName = str(row.if, `${path}.if`).trim();
  const unlessName = str(row.unless, `${path}.unless`).trim();

  if (ifName !== "" && unlessName !== "") {
    fail(`${path}: if and unless together -- pick one`);
  }

  const cond = str(row.cond, `${path}.cond`).trim() || ifName || unlessName;
  const negate = bool(row.negate, `${path}.negate`, false) || (unlessName !== "" && ifName === "");
  const when = normalizeWhen(row.when, `${path}.when`);

  if (cond !== "" && when.length > 0) {
    fail(`${path}: when and if/unless together -- pick one`);
  }

  return {
    rule: {
      name: str(row.name, `${path}.name`).trim(),
      on: str(row.on, `${path}.on`).trim() as "" | "overload",
      at: intOrNull(row.at, `${path}.at`),
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
      when,
      actions: arr(row.actions, `${path}.actions`).map((ask, j) =>
        normalizeAsk(ask, `${path}.actions[${j}]`),
      ),
    },
    legacy: cond === "" ? null : { cond, negate },
  };
}

function normalizeWhen(value: unknown, path: string): ActionWhenGroup[] {
  return arr(value, path).map((group, i) =>
    arr(group, `${path}[${i}]`).map((item, j) => {
      const at = `${path}[${i}][${j}]`;
      const row = obj(item, at);

      return {
        cond: str(row.cond, `${at}.cond`).trim(),
        not: bool(row.not, `${at}.not`, false),
      };
    }),
  );
}

type Expr = { lit: string; not: boolean } | { and: Expr[] } | { or: Expr[] };

function negated(expr: Expr): Expr {
  if ("lit" in expr) {
    return { lit: expr.lit, not: !expr.not };
  }

  if ("and" in expr) {
    return { or: expr.and.map(negated) };
  }

  return { and: expr.or.map(negated) };
}

function groupsOf(expr: Expr, path: string): ActionWhenItem[][] {
  if ("lit" in expr) {
    return [[{ cond: expr.lit, not: expr.not }]];
  }

  if ("or" in expr) {
    return expr.or.flatMap((part) => groupsOf(part, path));
  }

  let acc: ActionWhenItem[][] = [[]];

  for (const part of expr.and) {
    const next = groupsOf(part, path);

    acc = acc.flatMap((head) => next.map((tail) => [...head, ...tail]));

    if (acc.length > WHEN_GROUPS_MAX * 8) {
      fail(`${path}: the condition expands into more than ${WHEN_GROUPS_MAX} groups -- rewrite it as groups`);
    }
  }

  return acc;
}

/*
 * Groups of a converted expression: repeats inside a group and repeated groups go, a group that
 * asks for a condition and its negation at once never holds and goes too.
 */
function tidyGroups(groups: ActionWhenItem[][], path: string): ActionWhenGroup[] {
  const seen = new Set<string>();
  const out: ActionWhenGroup[] = [];

  for (const group of groups) {
    const items: ActionWhenItem[] = [];
    const sign = new Map<string, boolean>();
    let never = false;

    for (const item of group) {
      const prev = sign.get(item.cond);

      if (prev === undefined) {
        sign.set(item.cond, item.not);
        items.push(item);
      } else if (prev !== item.not) {
        never = true;
        break;
      }
    }

    if (never) {
      continue;
    }

    const key = items
      .map((item) => `${item.not ? "!" : ""}${item.cond}`)
      .sort()
      .join("&");

    if (!seen.has(key)) {
      seen.add(key);
      out.push(items);
    }
  }

  if (out.length === 0) {
    fail(`${path}: the condition can never hold`);
  }

  return out;
}

function uniqueName(base: string, taken: Set<string>): string {
  const head = base.slice(0, 60);
  let name = head;

  for (let n = 2; taken.has(name); n += 1) {
    name = `${head}_${n}`;
  }

  taken.add(name);

  return name;
}

function upgradeDoc(
  description: string,
  checks: ActionCondition[],
  legacy: LegacyCondition[],
  rules: NormalizedRule[],
): ActionProfileDoc {
  const taken = new Set([...checks.map((row) => row.name), ...legacy.map((row) => row.name)]);
  const conditions = [...checks];
  const rowNames = new Map<LegacyCondition, (string | null)[]>();

  for (const cond of legacy) {
    const single = cond.rows.length === 1 && "check" in cond.rows[0];

    rowNames.set(
      cond,
      cond.rows.map((row, k) => {
        if (!("check" in row)) {
          return null;
        }

        const name = single ? cond.name : uniqueName(`${cond.name}_${k + 1}`, taken);

        conditions.push({ ...row.check, name });

        return name;
      }),
    );
  }

  const byName = new Map(legacy.map((cond) => [cond.name, cond]));
  const resolved = new Map<string, Expr>();
  const resolving: string[] = [];

  const resolve = (name: string, path: string): Expr => {
    const known = resolved.get(name);

    if (known !== undefined) {
      return known;
    }

    const cond = byName.get(name);

    if (cond === undefined) {
      if (!checks.some((row) => row.name === name)) {
        fail(`${path}: condition ${JSON.stringify(name)} is not declared in conditions`);
      }

      return { lit: name, not: false };
    }

    if (resolving.includes(name)) {
      fail(`conditions refer to each other in a cycle: ${[...resolving, name].join(" -> ")}`);
    }

    if (cond.rows.length === 0) {
      fail(`${path}: condition ${JSON.stringify(name)} has no clauses`);
    }

    resolving.push(name);

    const names = rowNames.get(cond) ?? [];
    const parts = cond.rows.map((row, k): Expr => {
      if ("check" in row) {
        return { lit: names[k] ?? "", not: false };
      }

      const part = resolve(row.ref, path);

      return row.not ? negated(part) : part;
    });

    resolving.pop();

    const expr: Expr = cond.any ? { or: parts } : { and: parts };

    resolved.set(name, expr);

    return expr;
  };

  return {
    description,
    conditions,
    rules: rules.map(({ rule, legacy: ref }, i) => {
      if (ref === null) {
        return rule;
      }

      const path = `rules[${i}]`;
      const expr = resolve(ref.cond, path);

      return {
        ...rule,
        when: tidyGroups(groupsOf(ref.negate ? negated(expr) : expr, path), path),
      };
    }),
  };
}

function normalizeAsk(raw: unknown, path: string): ActionAsk {
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
    set: str(row.set, `${path}.set`).trim() as ActionAsk["set"],
    headers: recordObject(row.headers, `${path}.headers`),
    args: recordObject(row.args, `${path}.args`),
    body: recordObject(row.body, `${path}.body`),
    ttlS: intOrNullOf(row.ttlS ?? row.ttl_s, `${path}.ttl_s`) ?? 0,
    when: archiveWhen(row.when, `${path}.when`),
    list: str(row.list, `${path}.list`).trim(),
    write: str(row.write, `${path}.write`, "addr").trim() as ActionAsk["write"],
    code: str(row.code, `${path}.code`).trim(),
  };
}

export function validateDoc(input: unknown, datasets?: ActionDatasetInfo[]): ActionProfileDoc {
  const doc = normalizeDoc(input);
  const names = new Set<string>();

  doc.conditions.forEach((cond, i) => {
    const at = `conditions[${i}]`;

    if (!ACTION_COND_NAME_RE.test(cond.name)) {
      fail(`${at}: name ${JSON.stringify(cond.name)} is not [A-Za-z0-9_][A-Za-z0-9._-]{0,63}`);
    }

    if (ACTION_WHEN_NAME_RE.test(cond.name)) {
      fail(`${at}: name ${JSON.stringify(cond.name)} is reserved -- rule-N names the When of a rule in the printed profile`);
    }

    if (names.has(cond.name)) {
      fail(`${at}: condition ${JSON.stringify(cond.name)} is declared twice`);
    }

    names.add(cond.name);
    checkCondition(cond, at, datasets);
  });

  doc.rules.forEach((rule, i) => checkRule(rule, `rules[${i}]`, names, datasets));

  return doc;
}

function checkCondition(
  cond: ActionCondition,
  at: string,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  const value = parseActionValue(cond.value);

  if ("error" in value) {
    fail(`${at}: ${value.error}`);
  }

  if (cond.op === ("" as string)) {
    fail(`${at}: op is empty (in, not_in, eq, ne)`);
  }

  if (!isActionCondOp(cond.op)) {
    fail(`${at}: op must be in, not_in, eq or ne, got ${JSON.stringify(cond.op)}`);
  }

  if (opTakesDataset(cond.op)) {
    if (cond.dataset === "") {
      fail(`${at}: ${cond.op} needs a dataset`);
    }

    if (cond.text.trim() !== "") {
      fail(`${at}: text is only for eq and ne`);
    }

    if (datasets === undefined) {
      return;
    }

    const ds = datasets.find((row) => row.name === cond.dataset);

    if (ds === undefined || ds.kind !== "list") {
      fail(`${at}: dataset ${JSON.stringify(cond.dataset)} is not a list of this space`);
    }

    if (!ds.active) {
      fail(`${at}: dataset ${JSON.stringify(cond.dataset)} is not active -- the inspector mirrors only active lists`);
    }

    if (isAddressDatasetType(ds.type) && !actionValueAddressable(value)) {
      fail(`${at}: dataset ${JSON.stringify(cond.dataset)} holds addresses and compares only with $remote_addr, a header or a var`);
    }

    return;
  }

  if (cond.text === "") {
    fail(`${at}: ${cond.op} needs a text`);
  }

  if (cond.dataset !== "") {
    fail(`${at}: dataset is only for in and not_in`);
  }
}

function checkWhen(when: ActionWhenGroup[], at: string, conds: Set<string>): void {
  if (when.length > WHEN_GROUPS_MAX) {
    fail(`${at}: ${when.length} groups -- at most ${WHEN_GROUPS_MAX}`);
  }

  when.forEach((group, i) => {
    if (group.length === 0) {
      fail(`${at}[${i}]: the group is empty -- add a condition or drop the group`);
    }

    if (group.length > WHEN_ITEMS_MAX) {
      fail(`${at}[${i}]: ${group.length} conditions in a group -- at most ${WHEN_ITEMS_MAX}`);
    }

    group.forEach((item, j) => {
      if (item.cond === "") {
        fail(`${at}[${i}][${j}]: no condition chosen`);
      }

      if (!conds.has(item.cond)) {
        fail(`${at}[${i}][${j}]: condition ${JSON.stringify(item.cond)} is not declared in conditions`);
      }
    });
  });
}

function checkRule(
  rule: ActionRule,
  at: string,
  conds: Set<string>,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  if ((rule.on ?? "") === "overload") {
    checkOverloadAt(rule.at, at, fail);

    if (
      rule.match.pathPrefix !== "" || rule.match.suffixes.length > 0 || rule.match.static ||
      rule.match.methods.length > 0 || rule.when.length > 0
    ) {
      fail(`${at}: on: overload takes no match and no condition`);
    }
  } else if ((rule.on ?? "") !== "") {
    fail(`${at}: on must be overload or empty`);
  } else if ((rule.at ?? null) !== null) {
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

  checkWhen(rule.when, `${at}.when`, conds);

  if (rule.actions.length === 0) {
    fail(`${at}: no actions -- a rule that sends nothing is dead weight`);
  }

  rule.actions.forEach((ask, j) => checkRuleAsk(ask, `${at}.actions[${j}]`, datasets));
}

function checkRuleAsk(ask: ActionAsk, at: string, datasets: ActionDatasetInfo[] | undefined): void {
  if (ask.list !== "") {
    checkListWrite(ask, at, datasets);

    return;
  }

  checkAsk(at, ask, { fail, requireTo: true });
}

const LIST_WRITES = new Set<ActionAsk["write"]>(["addr", "net", "net_all", "asn"]);
const LIST_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

function checkListWrite(ask: ActionAsk, at: string, datasets: ActionDatasetInfo[] | undefined): void {
  if (
    ask.do !== "" || ask.to !== "" || ask.apply !== "" || ask.delta !== null ||
    ask.value !== null || ask.counter !== "" || ask.marker !== "" || ask.group !== "" ||
    (ask.phase ?? "") !== "" || ask.set !== "" || ask.headers !== null ||
    ask.args !== null || ask.body !== null || ask.when.length > 0
  ) {
    fail(`${at}: a list write takes only list, write, ttl and code`);
  }

  if (!LIST_NAME_RE.test(ask.list)) {
    fail(`${at}: list ${JSON.stringify(ask.list)} is not a dataset name`);
  }

  if (!LIST_WRITES.has(ask.write)) {
    fail(`${at}.write must be addr, net, net_all or asn`);
  }

  if (ask.ttlS <= 0) {
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

  if (ask.write !== "addr" && !isAddressDatasetType(ds.type)) {
    fail(`${at}: write ${ask.write} puts prefixes, and dataset ${JSON.stringify(ask.list)} holds no addresses`);
  }
}

export function docDatasets(doc: ActionProfileDoc): string[] {
  const out: string[] = [];

  for (const cond of doc.conditions) {
    if (opTakesDataset(cond.op) && cond.dataset !== "" && !out.includes(cond.dataset)) {
      out.push(cond.dataset);
    }
  }

  return out;
}

interface PrintedRef {
  name: string;
  negate: boolean;
}

interface PrintedGroup {
  name: string;
  any: boolean;
  refs: PrintedRef[];
}

/*
 * The inspector reads a rule's When as one condition: `if` or `unless` by name, where a condition
 * joins its rows with all or any and a row may point to another condition. A single condition
 * goes to `if` / `unless` as is; one group becomes rule-N with all; several groups become rule-N
 * with any over the groups, and a group of more than one condition is rule-N.M with all. N is the
 * rule's place, the same number the inspector gives a rule without a name.
 */
function printedWhen(rules: ActionRule[]): { groups: PrintedGroup[]; refs: (PrintedRef | null)[] } {
  const groups: PrintedGroup[] = [];
  const refOf = (item: ActionWhenItem): PrintedRef => ({ name: item.cond, negate: item.not });

  const refs = rules.map((rule, i): PrintedRef | null => {
    const when = rule.when;
    const head = `rule-${i + 1}`;

    if (when.length === 0) {
      return null;
    }

    if (when.length === 1 && when[0].length === 1) {
      return refOf(when[0][0]);
    }

    if (when.length === 1) {
      groups.push({ name: head, any: false, refs: when[0].map(refOf) });

      return { name: head, negate: false };
    }

    const members = when.map((group, j): PrintedRef => {
      if (group.length === 1) {
        return refOf(group[0]);
      }

      const name = `${head}.${j + 1}`;

      groups.push({ name, any: false, refs: group.map(refOf) });

      return { name, negate: false };
    });

    groups.push({ name: head, any: true, refs: members });

    return { name: head, negate: false };
  });

  return { groups, refs };
}


export function renderProfileYaml(
  name: string,
  doc: ActionProfileDoc,
  datasets?: ActionDatasetInfo[],
): string {
  const out: string[] = [];

  out.push(`# Профиль действий ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица action_profiles, раздел /actions в UX.");
  out.push("");
  out.push("mode: enforce");
  out.push("");

  const printed = printedWhen(doc.rules);

  if (doc.conditions.length > 0 || printed.groups.length > 0) {
    out.push("conditions:");

    for (const cond of doc.conditions) {
      out.push(`  - name: ${q(cond.name)}`);
      out.push("    all:");
      out.push(`      - value: ${q(cond.value)}`);
      out.push(`        op: ${cond.op}`);

      if (opTakesDataset(cond.op)) {
        out.push(`        dataset: ${q(cond.dataset)}`);

        const ds = datasets?.find((row) => row.name === cond.dataset);

        if (ds !== undefined && isAddressDatasetType(ds.type)) {
          out.push("        type: cidr");
        }

        if (ds !== undefined && ds.hash) {
          out.push("        hash: md5");
        }
      } else {
        out.push(`        text: ${q(cond.text)}`);
      }
    }

    for (const group of printed.groups) {
      out.push(`  - name: ${q(group.name)}`);
      out.push(`    ${group.any ? "any" : "all"}:`);

      for (const ref of group.refs) {
        out.push(`      - cond: ${q(ref.name)}`);
        out.push(`        op: ${ref.negate ? "is_not" : "is"}`);
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

  doc.rules.forEach((rule, index) => {
    const lines: string[] = [];

    if (rule.name !== "") {
      lines.push(`name: ${q(rule.name)}`);
    }

    if (rule.on === "overload") {
      lines.push("on: overload");

      if (rule.at !== null && rule.at !== undefined) {
        lines.push(`at: ${rule.at}`);
      }
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

    const ref = printed.refs[index];

    if (ref !== null) {
      lines.push(`${ref.negate ? "unless" : "if"}: ${q(ref.name)}`);
    }

    lines.push("actions:");

    for (const ask of rule.actions) {
      if (ask.list !== "") {
        lines.push(`  - list: ${q(ask.list)}`);

        if (ask.write !== "addr") {
          lines.push(`    write: ${ask.write}`);
        }

        lines.push(`    ttl: ${q(ttl(ask.ttlS))}`);

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
  });

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
