/*
 * Политика профиля правил: обе стороны канала действий одним документом.
 *
 * `prior` -- что профиль принимает от соседей, `outcomes` -- что он говорит и
 * делает сам. Живут вместе, потому что это две стороны одного канала: разнести
 * их по двум документам значит дать им разъехаться.
 *
 * Проверки здесь -- зеркало загрузчика инспектора
 * (inspectors/modsec/internal/prior). Расхождение между ними не стиль, а
 * поколение, которое инспектор отвергнет целиком: файл с опечаткой роняет
 * загрузку набора так же, как опечатка в SecLang.
 */

import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";

export class PolicyError extends Error {}

function fail(message: string): never {
  throw new PolicyError(message);
}

/** Глаголы, которые modsec умеет применять к себе. Остальное ему не адресовано. */
export const MODSEC_ACCEPT = ["threshold", "skip"] as const;

/**
 * Триггер инициатора: собственный решённый вердикт запроса либо `overload` --
 * запрос снят на входе из-за полной очереди (MODSEC_QUEUE_LIMIT), оценка не
 * начиналась. Протухший дедлайн инициаторов не дёргает: он бывает и у короткой
 * волны, и банить за латентность контура нельзя.
 */
export type ModsecOn = "deny" | "allow" | "score" | "overload";

/**
 * Кого писать в набор: адрес; эффективный анонс, самый узкий (net); все
 * анонсы, накрывающие адрес, включая чужие широкие (net_all); систему целиком,
 * все её анонсы (asn). Подсеть и систему разворачивает инспектор у кодера гео.
 */
export type ModsecWrite = "addr" | "net" | "net_all" | "asn";

const ONS = new Set<ModsecOn>(["deny", "allow", "score", "overload"]);
const WRITES = new Set<ModsecWrite>(["addr", "net", "net_all", "asn"]);
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Правило приёма: без него чужая просьба не значит ничего. */
export interface ModsecPriorRule {
  /** Имя отправителя. `*` не принимается: оба глагола умеют ослаблять. */
  from: string;
  accept: string[];
  /** Ограничить правило поводами. Пусто -- любой повод. */
  codes: string[];
}

/**
 * Инициатор по исходу: «когда → что сделать». Действие ровно одно -- просьба
 * соседу (непустой `do`) либо запись субъекта в живой набор (`list`).
 */
export interface ModsecOutcome {
  on: ModsecOn;
  /** Порог сравнения счёта; только при `on: score`, и там обязателен. */
  at: number | null;
  /** Сравнивать вниз: счёт < at вместо счёт >= at. */
  below: boolean;
  /** Точное сравнение: счёт == at. С below взаимоисключимы. */
  eq: boolean;

  /* Просьба соседу -- форма канала действий. */
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  /** Имя корзины получателя при do: note — селектор поверх его правил приёма. */
  counter: string;
  /**
   * Метка события при `do: mark`, обязательна: произвольная строка оператора.
   * Модуль кладёт её в маркеры записи, по которым события ищут и группируют.
   */
  marker: string;
  /** Только mutate, оба обязательны: какую группу модификаторов получателя переключить и куда. */
  group: string;
  /** Только управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /**
   * У mutate -- куда переключить группу; у глаголов записи (audit, archive)
   * -- писать или нет; objects и limit -- только у archive с set on: какие
   * объекты оставить агенту и сколько байт. Срок архива -- тот же ttlS, что у
   * записи в набор: у строки либо просьба, либо запись.
   */
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /**
   * Только archive с set on: на каких исходах маршрута просьбу исполнять --
   * как when= директивы. Пусто -- на любом, включая перенаправление: просьба
   * сильнее when= маршрута, о котором отправитель не знает.
   */
  when: ArchiveWhen[];

  /* Запись в живой набор. */
  list: string;
  write: ModsecWrite;
  ttlS: number;

  /** Повод; пусто -- код решения (MODSEC_*). */
  code: string;
}

export interface ModsecPolicy {
  prior: ModsecPriorRule[];
  outcomes: ModsecOutcome[];
}

/* --- чтение недоверенного документа ---------------------------------------- */

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

  return value.trim();
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

function num(value: unknown, path: string, def: number): number {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a number`);
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

/**
 * normalizePolicy приводит произвольный объект к полной форме. Смысл не
 * проверяет -- только типы; смысл в validatePolicy, чтобы документ, записанный
 * до появления поля, читался.
 */
export function normalizePolicy(raw: unknown): ModsecPolicy {
  const doc = obj(raw, "policy");

  return {
    prior: arr(doc.prior, "prior").map((item, i) => {
      const row = obj(item, `prior[${i}]`);

      return {
        from: str(row.from, `prior[${i}].from`),
        accept: strings(row.accept, `prior[${i}].accept`),
        codes: strings(row.codes, `prior[${i}].codes`),
        // Потолки старых строк (maxPercent / max_percent / maxDelta /
        // max_delta) -- мёртвые поля: читаются и отбрасываются, правило
        // решает «от кого, что и по какому поводу».
      } satisfies ModsecPriorRule;
    }),

    outcomes: arr(doc.outcomes, "outcomes").map((item, i) => {
      const row = obj(item, `outcomes[${i}]`);
      const where = `outcomes[${i}]`;

      const at = row.at === undefined || row.at === null ? null : num(row.at, `${where}.at`, 0);
      const delta =
        row.delta === undefined || row.delta === null ? null : num(row.delta, `${where}.delta`, 0);
      const value =
        row.value === undefined || row.value === null ? null : num(row.value, `${where}.value`, 0);

      return {
        on: str(row.on, `${where}.on`, "score") as ModsecOn,
        at,
        below: bool(row.below, `${where}.below`, false),
        eq: bool(row.eq, `${where}.eq`, false),
        to: str(row.to, `${where}.to`),
        do: str(row.do, `${where}.do`),
        apply: str(row.apply, `${where}.apply`),
        delta,
        value,
        counter: str(row.counter, `${where}.counter`),
        marker: str(row.marker, `${where}.marker`),
        group: str(row.group, `${where}.group`),
        phase: str(row.phase, `${where}.phase`),
        set: str(row.set, `${where}.set`) as ModsecOutcome["set"],
        headers: recordObject(row.headers, `${where}.headers`),
        args: recordObject(row.args, `${where}.args`),
        body: recordObject(row.body, `${where}.body`),
        when: archiveWhen(row.when, `${where}.when`),
        list: str(row.list, `${where}.list`),
        write: str(row.write, `${where}.write`, "addr") as ModsecWrite,
        ttlS: num(row.ttlS ?? row.ttl_s, `${where}.ttl_s`, 0),
        code: str(row.code, `${where}.code`),
      } satisfies ModsecOutcome;
    }),
  };
}

export function validatePolicy(raw: unknown): ModsecPolicy {
  const policy = normalizePolicy(raw);

  policy.prior.forEach(checkPrior);
  policy.outcomes.forEach(checkOutcome);

  return policy;
}

/*
 * Правило приёма. Оба глагола умеют ослаблять -- skip всегда, у threshold знак
 * выбирает отправитель, -- поэтому послабление требует имени отправителя, и
 * широковещательного правила у этого инспектора не бывает вовсе.
 */
function checkPrior(rule: ModsecPriorRule, i: number): void {
  const where = `prior[${i}]`;

  if (rule.from === "") {
    fail(`${where}.from is empty`);
  }

  if (rule.from === "*") {
    fail(`${where}: both verbs can weaken, so the sender must be named`);
  }

  if (rule.accept.length === 0) {
    fail(`${where}.accept is required`);
  }

  for (const verb of rule.accept) {
    if (!(MODSEC_ACCEPT as readonly string[]).includes(verb)) {
      fail(`${where}: ${verb} is not ours to apply`);
    }
  }

  for (const code of rule.codes) {
    if (!CODE_RE.test(code)) {
      fail(`${where}: ${code} is not a valid reason code`);
    }
  }
}

function checkOutcome(outcome: ModsecOutcome, i: number): void {
  const where = `outcomes[${i}]`;

  if (!ONS.has(outcome.on)) {
    fail(`${where}.on must be deny, allow, score or overload`);
  }

  if (outcome.on === "score") {
    if (outcome.at === null) {
      fail(`${where}: on: score needs at`);
    } else if (outcome.at < 0) {
      fail(`${where}.at must not be negative`);
    }

    // Сравнение одно: «ровно at» и «ниже at» разом не бывают.
    if (outcome.below && outcome.eq) {
      fail(`${where}: below and eq are mutually exclusive`);
    }
  } else if (outcome.on === "overload") {
    // Порог -- заполнение очереди в процентах, не назван -- край (model/overload.ts).
    checkOverloadAt(outcome.at, where, fail);

    if (outcome.below || outcome.eq) {
      fail(`${where}: below and eq are only for on: score`);
    }
  } else if (outcome.at !== null || outcome.below || outcome.eq) {
    fail(`${where}: at, below and eq are only for on: score`);
  }

  if (outcome.code !== "" && !CODE_RE.test(outcome.code)) {
    fail(`${where}.code is not a valid reason code`);
  }

  const asks = outcome.do !== "";

  if (asks && outcome.list !== "") {
    fail(`${where}: do and list are mutually exclusive`);
  }

  if (!asks) {
    if (outcome.list === "") {
      fail(`${where}: neither do nor list`);
    }

    if (!NAME_RE.test(outcome.list)) {
      fail(`${where}.list is not a valid dataset name`);
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
    /* Исход modsec бывает отказом: там просьба соседу уже не доедет. */
    onDeny: outcome.on === "deny",
  });
}


/** Политика ничего не говорит и никого не слушает -- файл ей не нужен. */
export function policyIsEmpty(policy: ModsecPolicy): boolean {
  return policy.prior.length === 0 && policy.outcomes.length === 0;
}

/* --- печать ----------------------------------------------------------------- */


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

/** Срок человеческой записью: секунды в файле читаются хуже, чем ошибаются. */
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

/**
 * renderPolicyYaml печатает policy.yaml, который читает загрузчик инспектора.
 * Пустые поля не печатаются вовсе: файл читают глазами, и `delta: 0` рядом с
 * записью в набор объяснял бы то, чего в ней нет.
 */
export function renderPolicyYaml(name: string, policy: ModsecPolicy): string {
  const out: string[] = [
    `# Политика профиля ${name}. Собрана контроллером, править здесь нечего:`,
    "# источник -- таблица rule_sets, раздел /rules/profiles в UX.",
    "",
  ];

  if (policy.prior.length > 0) {
    out.push("prior:");

    for (const rule of policy.prior) {
      out.push(`  - from: ${q(rule.from)}`);
      out.push(`    accept: ${seq(rule.accept)}`);

      if (rule.codes.length > 0) {
        out.push(`    codes: ${seq(rule.codes)}`);
      }
    }

    out.push("");
  }

  if (policy.outcomes.length > 0) {
    out.push("outcomes:");

    for (const o of policy.outcomes) {
      out.push(`  - on: ${o.on}`);

      if (o.on === "overload" && o.at !== null) {
        out.push(`    at: ${o.at}`);
      }

      if (o.on === "score" && o.at !== null) {
        out.push(`    at: ${o.at}`);

        if (o.below) {
          out.push("    below: true");
        }

        if (o.eq) {
          out.push("    eq: true");
        }
      }

      if (o.do !== "") {
        if (o.to !== "") {
          out.push(`    to: ${q(o.to)}`);
        }

        out.push(`    do: ${o.do}`);

        if (o.apply !== "") {
          out.push(`    apply: ${o.apply}`);
        }

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
      } else {
        out.push(`    list: ${q(o.list)}`);
        out.push(`    write: ${o.write}`);
        out.push(`    ttl: ${q(ttl(o.ttlS))}`);
      }

      if (o.code !== "") {
        out.push(`    code: ${q(o.code)}`);
      }
    }

    out.push("");
  }

  return out.join("\n");
}
