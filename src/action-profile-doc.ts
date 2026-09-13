/*
 * Документ профиля действий: нормализация, проверка и печать в YAML.
 *
 * Правила повторяют Parse() инспектора
 * (inspectors/action/internal/policy/policy.go, cond.go) -- ту же отбраковку и
 * в том же порядке. Расхождение между ними не стиль, а поколение, которое
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
import { checkOverloadAt } from "./model/overload.ts";
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
import type {
  ActionAsk,
  ActionClause,
  ActionCondition,
  ActionMatch,
  ActionProfileDoc,
  ActionRule,
} from "./model/action-profile.ts";

const METHOD_RE = /^[A-Z]+$/;

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
export function normalizeDoc(input: unknown): ActionProfileDoc {
  const root = obj(input, "doc");

  return {
    description: str(root.description, "description"),
    conditions: arr(root.conditions, "conditions").map((raw, i) =>
      normalizeCondition(raw, `conditions[${i}]`),
    ),
    rules: arr(root.rules, "rules").map((raw, i) => normalizeRule(raw, `rules[${i}]`)),
  };
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

function normalizeRule(raw: unknown, path: string): ActionRule {
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
    cond,
    negate: cond === "" ? false : negate,
    actions: arr(row.actions, `${path}.actions`).map((ask, j) =>
      normalizeAsk(ask, `${path}.actions[${j}]`),
    ),
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

/* --- проверка -------------------------------------------------------------- */

/**
 * validateDoc проверяет форму, а с каталогом наборов -- и ссылки: набор у
 * `in` / `not in` обязан быть активным списком пространства, адресный набор
 * сравним только с адресом. Без каталога ссылки не проверяются: так читают
 * документ из базы, где набор мог быть снят позже записи.
 */
export function validateDoc(input: unknown, datasets?: ActionDatasetInfo[]): ActionProfileDoc {
  const doc = normalizeDoc(input);
  const names = new Set<string>();

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

  doc.rules.forEach((rule, i) => checkRule(rule, `rules[${i}]`, names, datasets));

  return doc;
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
  rule: ActionRule,
  at: string,
  conds: Set<string>,
  datasets: ActionDatasetInfo[] | undefined,
): void {
  /*
   * Строка перегрузки срабатывает по заполнению очереди инспектора, а не по
   * запросу: пути и условия у неё нет (model/overload.ts).
   */
  if ((rule.on ?? "") === "overload") {
    checkOverloadAt(rule.at, at, fail);

    if (
      rule.match.pathPrefix !== "" || rule.match.suffixes.length > 0 || rule.match.static ||
      rule.match.methods.length > 0 || rule.cond !== ""
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

  /*
   * Ссылка -- только на объявленное условие: опечатка в имени иначе
   * становилась бы правилом, которое не срабатывает никогда (если) либо
   * срабатывает всегда (если не), и ни то ни другое не видно.
   */
  if (rule.cond !== "" && !conds.has(rule.cond)) {
    fail(`${at}: condition ${JSON.stringify(rule.cond)} is not declared in conditions`);
  }

  if (rule.actions.length === 0) {
    fail(`${at}: no actions -- a rule that sends nothing is dead weight`);
  }

  rule.actions.forEach((ask, j) => checkRuleAsk(ask, `${at}.actions[${j}]`, datasets));
}

/*
 * Просьбу проверяет общий валидатор канала: форма у неё одна на всех
 * отправителей. Своё здесь -- только требование адресата: инспектор
 * действий пересылает чужие слова, и правило, писанное руками, обязано
 * называть, кому. Строка с набором -- не просьба, а запись.
 */
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

/*
 * Запись в набор -- то же, чем отвергает загрузчик (parseWrite): у записи нет
 * ни адресата, ни глагола, ни оси, пишет сам инспектор; кого писать -- те же
 * четыре охвата, что у остальных отправителей; срок обязателен. С каталогом --
 * ещё и набор: активный список пространства (в другой keeper не пишет), а
 * подсеть и систему -- только в набор адресов: префикс в наборе строк не
 * совпал бы ни с одним адресом.
 */
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

/** Наборы, которые читают условия документа, без повторов. */
export function docDatasets(doc: ActionProfileDoc): string[] {
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
  doc: ActionProfileDoc,
  datasets?: ActionDatasetInfo[],
): string {
  const out: string[] = [];

  out.push(`# Профиль действий ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица action_profiles, раздел /actions в UX.");
  out.push("");
  // Режима у профиля больше нет: включён ли инспектор и гейтит ли он, решает
  // вызов на маршруте (waf_inspect … mode=). mode: enforce печатается ради
  // загрузчика инспектора, у которого ключ пока обязателен.
  out.push("mode: enforce");
  out.push("");

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

    /* Условие -- словами загрузчика: if -- когда истинно, unless -- когда ложно. */
    if (rule.cond !== "") {
      lines.push(`${rule.negate ? "unless" : "if"}: ${q(rule.cond)}`);
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
