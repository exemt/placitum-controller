/*
 * Документ профиля vlai: нормализация, проверка и печать в YAML.
 *
 * Правила повторяют загрузчик инспектора (inspectors/vlai/src/profiles.py) --
 * ту же отбраковку и в том же порядке. Расхождение между ними не стиль, а
 * поколение, которое инспектор отвергнет как apply_failed; поймать ошибку
 * оператора надо в панели, а не в пульсе через минуту после send.
 */

import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";
import type {
  VlaiOutcome,
  VlaiOverload,
  VlaiPriorRule,
  VlaiProfileDoc,
} from "./model/vlai-profile.ts";

const OVERLOADS = new Set<VlaiOverload>(["wait", "shed"]);
const ONS = new Set<VlaiOutcome["on"]>(["score", "overload"]);

/*
 * Старые `allow` и `deny` читаются как `shed`: документ мог быть записан до
 * 091, и ронять из-за этого весь профиль незачем. Всё остальное, кроме
 * словаря, остаётся как есть -- опечатку отвергает проверка ниже.
 */
function normalizeOverload(value: string): VlaiOverload {
  if (value === "allow" || value === "deny") return "shed";

  return value as VlaiOverload;
}
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const COUNTER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

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

function num(value: unknown, path: string, def: number): number {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`${path} must be an integer`);
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
export function normalizeDoc(input: unknown): VlaiProfileDoc {
  const root = obj(input, "doc");
  const trigger = obj(root.trigger, "trigger");

  return {
    description: str(root.description, "description"),
    /*
     * allow -- нынешнее поведение процесса (queue_full drop): скорer, который
     * под нагрузкой начинает отказывать всем, ломает контур надёжнее любой
     * атаки, поэтому fail-open стоит умолчанием, а deny выбирают руками.
     */
    /* allow/deny из старых документов читаются как shed: см. 091. */
    overload: normalizeOverload(str(root.overload, "overload", "shed")),
    trigger: {
      prior: arr(trigger.prior, "trigger.prior").map((raw, i) => {
        const row = obj(raw, `trigger.prior[${i}]`);

        return {
          from: str(row.from, `trigger.prior[${i}].from`).trim(),
          accept: strings(row.accept, `trigger.prior[${i}].accept`) as VlaiPriorRule["accept"],
          codes: strings(row.codes, `trigger.prior[${i}].codes`).map((code) =>
            code.trim().toUpperCase(),
          ),
          // maxPercent / max_percent старых строк -- мёртвый потолок: читается
          // и отбрасывается, правило решает «от кого, что и по какому поводу».
        } satisfies VlaiPriorRule;
      }),
    },
    outcomes: arr(root.outcomes, "outcomes").map((raw, i) =>
      normalizeOutcome(raw, `outcomes[${i}]`),
    ),
  };
}

function normalizeOutcome(raw: unknown, path: string): VlaiOutcome {
  const row = obj(raw, path);

  return {
    on: str(row.on, `${path}.on`, "score") as VlaiOutcome["on"],
    at: intOrNull(row.at, `${path}.at`),
    below: bool(row.below, `${path}.below`, false),
    eq: bool(row.eq, `${path}.eq`, false),
    to: str(row.to, `${path}.to`).trim(),
    do: str(row.do, `${path}.do`).trim(),
    apply: str(row.apply, `${path}.apply`).trim(),
    delta: intOrNull(row.delta, `${path}.delta`),
    value: intOrNull(row.value, `${path}.value`),
    counter: str(row.counter, `${path}.counter`).trim(),
    marker: str(row.marker, `${path}.marker`).trim(),
    group: str(row.group, `${path}.group`).trim(),
    phase: str(row.phase, `${path}.phase`).trim(),
    set: str(row.set, `${path}.set`).trim() as VlaiOutcome["set"],
    headers: recordObject(row.headers, `${path}.headers`),
    args: recordObject(row.args, `${path}.args`),
    body: recordObject(row.body, `${path}.body`),
    when: archiveWhen(row.when, `${path}.when`),
    list: str(row.list, `${path}.list`).trim(),
    write: str(row.write, `${path}.write`, "addr") as VlaiOutcome["write"],
    ttlS: num(row.ttlS ?? row.ttl_s, `${path}.ttl_s`, 0),
    code: str(row.code, `${path}.code`).trim(),
  };
}

/* --- проверка -------------------------------------------------------------- */

export function validateDoc(input: unknown): VlaiProfileDoc {
  const doc = normalizeDoc(input);

  if (!OVERLOADS.has(doc.overload)) {
    fail("overload must be allow, wait or deny");
  }

  // Правила приёма и инициаторы проверяются и у выключенного профиля:
  // опечатка обязана быть видна тогда, когда её сделали.
  doc.trigger.prior.forEach(checkPrior);
  doc.outcomes.forEach(checkOutcome);

  return doc;
}

/**
 * checkPrior повторяет ограничения загрузчика инспектора: оба глагола умеют
 * ослаблять -- skip всегда, у threshold знак (скидку) выбирает отправитель на
 * проводе, -- поэтому имя отправителя обязательно, а широковещательного
 * правила у этого инспектора не бывает вовсе.
 */
function checkPrior(rule: VlaiPriorRule, i: number): void {
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

  for (const code of rule.codes) {
    if (!CODE_RE.test(code)) {
      fail(`${at}: code "${code}" is not [A-Z][A-Z0-9_]{0,63}`);
    }
  }
}

/** Кого писать в набор: те же четыре охвата, что у остальных отправителей. */
const WRITES = new Set<VlaiOutcome["write"]>(["addr", "net", "net_all", "asn"]);

/*
 * Инициаторы: просьба соседу либо запись в живой набор -- адреса клиента, его
 * подсети или системы. Подсеть и систему vlai берёт у кодера гео по HTTP.
 */
function checkOutcome(outcome: VlaiOutcome, i: number): void {
  const where = `outcomes[${i}]`;

  if (!ONS.has(outcome.on)) {
    fail(`${where}.on must be score or overload`);
  }

  if (outcome.on === "score") {
    if (outcome.at === null) {
      fail(`${where}: on: score needs at`);
    } else if (outcome.at < 0 || outcome.at > 100) {
      fail(`${where}.at is out of 0..100`);
    }

    // Сравнение одно: «ровно at» и «ниже at» разом не бывают.
    if (outcome.below && outcome.eq) {
      fail(`${where}: below and eq are mutually exclusive`);
    }
  } else {
    // on: overload -- порог заполнения очереди в процентах, не назван -- край
    // (model/overload.ts).
    checkOverloadAt(outcome.at, where, fail);

    if (outcome.below || outcome.eq) {
      fail(`${where}: below and eq are only for on: score`);
    }
  }

  if (outcome.code !== "" && !CODE_RE.test(outcome.code)) {
    fail(`${where}.code is not a valid reason code`);
  }

  if (outcome.do !== "" && outcome.list !== "") {
    fail(`${where}: do and list are mutually exclusive`);
  }

  if (outcome.do === "" && outcome.list === "") {
    fail(`${where}: neither do nor list`);
  }

  if (outcome.list !== "") {
    if (!COUNTER_NAME_RE.test(outcome.list)) {
      fail(`${where}: bad dataset name "${outcome.list}"`);
    }

    if (!WRITES.has(outcome.write)) {
      fail(`${where}.write must be addr, net, net_all or asn`);
    }

    // Запись без срока пережила бы причину, по которой её сделали.
    if (outcome.ttlS <= 0) {
      fail(`${where}: list needs ttl`);
    }

    return;
  }

  checkAsk(where, outcome, {
    fail,
    /*
     * Адресат обязателен: круг слушателей -- решение отправителя, и у
     * правила, которое собирают мышью, он должен быть написан.
     */
    requireTo: true,
    /* Ось дописывается в документ: печать и хеш профиля читают её оттуда. */
    normalize: true,
  });
}


/* --- печать в profile.yaml -------------------------------------------------- */

/** renderProfileYaml печатает ровно то, что читает загрузчик инспектора. */
export function renderProfileYaml(name: string, doc: VlaiProfileDoc): string {
  const out: string[] = [];

  out.push(`# Профиль vlai ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица vlai_profiles, раздел /vlai в UX.");
  out.push("");
  // Режима у профиля больше нет: включён ли инспектор и гейтит ли он, решает
  // вызов на маршруте (waf_inspect … mode=). mode: enforce печатается ради
  // загрузчика инспектора, у которого ключ пока обязателен.
  out.push("mode: enforce");

  if (doc.description !== "") {
    out.push(`description: ${q(doc.description)}`);
  }

  out.push(`overload: ${doc.overload}`);

  /* Секции печатаются только с правилами: пустой trigger -- обычное
   * состояние (никого не слушает), а не незаполненная форма. */
  if (doc.trigger.prior.length > 0) {
    out.push("");
    out.push("trigger:");
    out.push("  prior:");

    for (const rule of doc.trigger.prior) {
      out.push(`    - from: ${q(rule.from)}`);
      out.push(`      accept: [${rule.accept.join(", ")}]`);

      if (rule.codes.length > 0) {
        out.push(`      codes: [${rule.codes.map(q).join(", ")}]`);
      }
    }
  }

  if (doc.outcomes.length > 0) {
    out.push("");
    out.push("outcomes:");

    for (const o of doc.outcomes) {
      out.push(`  - on: ${o.on}`);

      if (o.on === "overload" && o.at !== null) {
        out.push(`    at: ${o.at}`);
      }

      if (o.on === "score") {
        out.push(`    at: ${o.at ?? 0}`);

        if (o.below) {
          out.push("    below: true");
        }

        if (o.eq) {
          out.push("    eq: true");
        }
      }

      if (o.list !== "") {
        out.push(`    list: ${q(o.list)}`);
        out.push(`    write: ${o.write}`);
        out.push(`    ttl: ${q(ttl(o.ttlS))}`);
      } else {
        out.push(`    to: ${q(o.to)}`);
        out.push(`    do: ${o.do}`);
        out.push(`    apply: ${o.apply}`);

        if (o.delta !== null) {
          out.push(`    delta: ${o.delta}`);
        }

        if (o.value !== null) {
          out.push(`    value: ${o.value}`);
        }

        if (o.marker !== "") {
          out.push(`    marker: ${q(o.marker)}`);
        }

        if (o.counter !== "") {
          out.push(`    counter: ${q(o.counter)}`);
        }

        if (o.group !== "") {
          out.push(`    group: ${q(o.group)}`);
          out.push(`    set: ${o.set}`);
        }

        if ((o.phase ?? "") !== "") {
          out.push(`    phase: ${o.phase}`);
        }

        if (o.do === "audit" || o.do === "archive") {
          out.push(`    set: ${o.set}`);

          if (o.set === "on") {
            if (o.do === "archive" && o.ttlS > 0) {
              out.push(`    ttl: ${q(ttl(o.ttlS))}`);
            }

            /* Исход -- множеством: пустой пишется отсутствием ключа. */
            if (o.do === "archive" && o.when.length > 0) {
              out.push(`    when: ${seq(o.when)}`);
            }

            for (const name of RECORD_OBJECTS) {
              const spec = o[name];

              if (spec !== null) {
                out.push(`    ${name}: ${recordObjectYaml(spec)}`);
              }
            }
          }
        }
      }

      if (o.code !== "") {
        out.push(`    code: ${q(o.code)}`);
      }
    }
  }

  out.push("");

  return out.join("\n");
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

/** Список одной строкой YAML: `[allow, deny]`. */
function seq(values: readonly string[]): string {
  return `[${values.map(q).join(", ")}]`;
}

function q(value: string): string {
  return JSON.stringify(value);
}

/** Срок человеческой записью, как у политики modsec: секунды в файле, который
 * читают глазами, ошибаются реже, чем в "600". */
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
