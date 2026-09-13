/*
 * Документы счётчика: нормализация, проверка и печать в YAML.
 *
 * Два документа: профиль (profile.yaml) и общая секция (counters.yaml).
 * Умолчания и правила повторяют загрузчик инспектора
 * (inspectors/counter/internal/config/{profile,counters}.go). Расхождение
 * между ними -- не стиль, а поколение, которое инспектор отвергнет как
 * apply_failed; поэтому проверка здесь ровно та же и в том же порядке.
 *
 * Связность (ссылки профиля на счётчики и оси) проверяется отдельно --
 * checkReferences: ей нужны обе стороны, и зовут её роутер при сохранении и
 * манифест при send.
 */

import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import {
  COUNTER_AXES,
  COUNTER_DIRECTIONS,
  COUNTER_OPCODES,
  DEFAULT_SESS_COOKIE,
  type CounterAxis,
  type CounterAxisTier,
  type CounterDecl,
  type CounterJudgeAction,
  type CounterJudgeRule,
  type CounterMeasureRule,
  type CounterOn,
  type CounterOutcome,
  type CounterPriorRule,
  type CounterProfileDoc,
  type CounterSharedDoc,
  type CounterSource,
} from "./model/counter-profile.ts";

import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";

const JUDGE_ACTIONS = new Set<CounterJudgeAction>(["deny", "score"]);
const SOURCES = new Set<CounterSource>(["const", "regex_count", "size_kb", "bytes"]);
const AXES = new Set<string>(COUNTER_AXES);
const DIRECTIONS = new Set<string>(COUNTER_DIRECTIONS);
const OPCODES = new Set<string>(COUNTER_OPCODES);
const ON = new Set<CounterOn>(["deny", "allow", "score", "level", "overload"]);

const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const METHOD_RE = /^[A-Z]+$/;
const COUNTER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DATASET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const DEFAULT_DENY_RESPONSE = "counter_limit";
/** Запись type=websocket для отказа на кадре (миграция 077). */
const DEFAULT_FRAME_DENY_RESPONSE = "ws_policy";

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

function num(value: unknown, path: string, def: number): number {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a number`);
  }

  return value;
}

function strings(value: unknown, path: string, def: string[]): string[] {
  if (value === undefined || value === null) {
    return [...def];
  }

  return arr(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

function numbers(value: unknown, path: string): number[] {
  return arr(value, path).map((item, i) => num(item, `${path}[${i}]`, NaN));
}

/**
 * Исходы просьбы архива: те же два слова, что у `when=` директивы, в
 * каноническом порядке. Пусто -- любой исход, включая перенаправление:
 * просьба сильнее `when=` маршрута, о котором отправитель не знает.
 */
function archiveWhen(value: unknown, path: string): ArchiveWhen[] {
  const words = strings(value, path, []).map((word) => word.trim().toLowerCase());

  for (const word of words) {
    if (!(ARCHIVE_WHEN as readonly string[]).includes(word)) {
      fail(`${path}: outcome must be allow or deny, got ${word}`);
    }
  }

  return ARCHIVE_WHEN.filter((name) => words.includes(name));
}

/* --- нормализация профиля --------------------------------------------------- */

/*
 * normalizeDoc читает документ любой давности и достраивает его до текущей
 * формы: строка, записанная до появления поля, обязана прочитаться с его
 * умолчанием, а не с undefined.
 */
export function normalizeDoc(input: unknown): CounterProfileDoc {
  const root = obj(input, "doc");
  const trigger = obj(root.trigger, "trigger");
  const request = obj(root.request, "request");
  const response = obj(root.response, "response");
  const frame = obj(root.frame, "frame");

  return {
    description: str(root.description, "description"),

    trigger: {
      prior: arr(trigger.prior, "trigger.prior").map((raw, i) => {
        const row = obj(raw, `trigger.prior[${i}]`);

        return {
          from: str(row.from, `trigger.prior[${i}].from`),
          accept: strings(
            row.accept,
            `trigger.prior[${i}].accept`,
            [],
          ) as CounterPriorRule["accept"],
          apply: strings(row.apply, `trigger.prior[${i}].apply`, []),
          codes: strings(row.codes, `trigger.prior[${i}].codes`, []),
          // maxPercent старых строк -- мёртвый потолок: читается и
          // отбрасывается, правило решает «от кого, что и по какому поводу».
          counter: str(row.counter, `trigger.prior[${i}].counter`),
        } satisfies CounterPriorRule;
      }),
    },

    request: {
      enabled: bool(request.enabled, "request.enabled", true),
      judge: judgeOf(request.judge, "request"),
      denyResponse: str(
        request.denyResponse ?? request.deny_response,
        "request.deny_response",
        DEFAULT_DENY_RESPONSE,
      ),
      outcomes: outcomesOf(request.outcomes, "request"),
    },

    response: {
      enabled: bool(response.enabled, "response.enabled", true),
      measure: measureOf(response.measure, "response"),
    },

    /*
     * Секция кадров достраивается у любой записи: профиль, заведённый до
     * фазы, читается с пустыми правилами -- на кадрах он ничего не меряет и
     * не судит, и печать его не меняет (см. renderProfileYaml).
     */
    frame: {
      enabled: bool(frame.enabled, "frame.enabled", true),
      measure: measureOf(frame.measure, "frame"),
      judge: judgeOf(frame.judge, "frame"),
      denyResponse: str(
        frame.denyResponse ?? frame.deny_response,
        "frame.deny_response",
        DEFAULT_FRAME_DENY_RESPONSE,
      ),
      outcomes: outcomesOf(frame.outcomes, "frame"),
    },
  };
}

function judgeOf(raw: unknown, section: string): CounterJudgeRule[] {
  return arr(raw, `${section}.judge`).map((item, i) => {
    const row = obj(item, `${section}.judge[${i}]`);
    const where = `${section}.judge[${i}]`;

    return {
      counter: str(row.counter, `${where}.counter`),
      axis: str(row.axis, `${where}.axis`) as CounterAxis,
      at: num(row.at, `${where}.at`, 0),
      action: str(row.action, `${where}.action`, "score") as CounterJudgeAction,
      score: num(row.score, `${where}.score`, 0),
      code: str(row.code, `${where}.code`),
    } satisfies CounterJudgeRule;
  });
}

function measureOf(raw: unknown, section: string): CounterMeasureRule[] {
  return arr(raw, `${section}.measure`).map((item, i) => {
    const row = obj(item, `${section}.measure[${i}]`);
    const where = `${section}.measure[${i}]`;
    const cond = obj(row.if, `${where}.if`);
    const per = row.per === undefined || row.per === null ? null : num(row.per, `${where}.per`, 1);

    return {
      if: {
        status: numbers(cond.status, `${where}.if.status`),
        contentType: strings(
          cond.contentType ?? cond.content_type,
          `${where}.if.content_type`,
          [],
        ),
        // path/match из старых записей отбрасываются: предикат пути снят,
        // поведение по путям задаётся профилем на маршруте.
        methods: strings(cond.methods, `${where}.if.methods`, []).map((m) =>
          m.trim().toUpperCase(),
        ),
        direction: strings(cond.direction, `${where}.if.direction`, []),
        opcode: strings(cond.opcode, `${where}.if.opcode`, []),
      },
      source: str(row.source, `${where}.source`) as CounterSource,
      regex: str(row.regex, `${where}.regex`),
      per,
      counter: str(row.counter, `${where}.counter`),
      axes: strings(row.axes, `${where}.axes`, []) as CounterAxis[],
    } satisfies CounterMeasureRule;
  });
}

function outcomesOf(raw: unknown, section: string): CounterOutcome[] {
  return arr(raw, `${section}.outcomes`).map((item, i) => {
    const row = obj(item, `${section}.outcomes[${i}]`);
    const where = `${section}.outcomes[${i}]`;

    const at = row.at === undefined || row.at === null ? null : num(row.at, `${where}.at`, 0);
    const delta =
      row.delta === undefined || row.delta === null ? null : num(row.delta, `${where}.delta`, 0);
    const value =
      row.value === undefined || row.value === null ? null : num(row.value, `${where}.value`, 0);

    const cond = row.if === undefined || row.if === null ? null : obj(row.if, `${where}.if`);

    return {
      on: str(row.on, `${where}.on`, "score") as CounterOn,
      at,
      below: bool(row.below, `${where}.below`, false),
      eq: bool(row.eq, `${where}.eq`, false),
      if:
        cond === null
          ? null
          : {
              counter: str(cond.counter, `${where}.if.counter`),
              axis: str(cond.axis, `${where}.if.axis`) as CounterAxis,
            },
      to: str(row.to, `${where}.to`),
      do: str(row.do, `${where}.do`),
      apply: str(row.apply, `${where}.apply`),
      delta,
      value,
      counter: str(row.counter, `${where}.counter`),
      marker: str(row.marker, `${where}.marker`),
      group: str(row.group, `${where}.group`),
      phase: str(row.phase, `${where}.phase`),
      set: str(row.set, `${where}.set`) as CounterOutcome["set"],
      headers: recordObject(row.headers, `${where}.headers`),
      args: recordObject(row.args, `${where}.args`),
      body: recordObject(row.body, `${where}.body`),
      when: archiveWhen(row.when, `${where}.when`),
      list: str(row.list, `${where}.list`),
      write: str(row.write, `${where}.write`),
      ttlS: num(row.ttlS ?? row.ttl_s, `${where}.ttl_s`, 0),
      code: str(row.code, `${where}.code`),
    } satisfies CounterOutcome;
  });
}

/* --- проверка профиля ------------------------------------------------------- */

export function validateDoc(input: unknown): CounterProfileDoc {
  const doc = normalizeDoc(input);

  doc.trigger.prior.forEach(checkPrior);
  doc.request.outcomes.forEach((outcome, i) => checkOutcome(outcome, i, false));
  doc.frame.outcomes.forEach((outcome, i) => checkOutcome(outcome, i, true));

  if (!doc.request.enabled && !doc.response.enabled && !doc.frame.enabled) {
    fail("all phases are disabled: the profile would do nothing");
  }

  checkJudges("request", doc.request.judge, doc.request.denyResponse, false);
  checkJudges("frame", doc.frame.judge, doc.frame.denyResponse, true);

  doc.response.measure.forEach((rule, i) => checkMeasure("response", rule, i, false));
  doc.frame.measure.forEach((rule, i) => checkMeasure("frame", rule, i, true));

  return doc;
}

/*
 * Отказ без записи каталога модуль применить не сможет: код и страницу (у
 * кадров -- кадр Close) отдаёт nginx по символьному имени.
 */
function checkJudges(
  section: string,
  rules: CounterJudgeRule[],
  denyResponse: string,
  frame: boolean,
): void {
  let denies = false;

  rules.forEach((rule, i) => {
    checkJudge(section, rule, i, frame);
    denies = denies || rule.action === "deny";
  });

  if (denies && denyResponse === "") {
    fail(`${section}.deny_response is required when a judge rule is deny`);
  }
}

function checkJudge(section: string, rule: CounterJudgeRule, i: number, frame: boolean): void {
  const where = `${section}.judge[${i}]`;

  if (rule.counter === "") {
    fail(`${where}.counter is required`);
  }

  if (!AXES.has(rule.axis)) {
    fail(`${where}.axis must be one of ${COUNTER_AXES.join(", ")}`);
  }

  // Соединение есть только у кадров: у запроса субъекта по этой оси нет.
  if (rule.axis === "conn" && !frame) {
    fail(`${where}.axis conn is only for the frame phase`);
  }

  if (rule.at < 0 || rule.at > 100) {
    fail(`${where}.at is out of 0..100 percent`);
  }

  if (!JUDGE_ACTIONS.has(rule.action)) {
    fail(`${where}.action must be score or deny`);
  }

  if (rule.action === "deny" && rule.score !== 0) {
    fail(`${where}.score is only for action: score`);
  }

  if (rule.action === "score" && (rule.score < 1 || rule.score > 100)) {
    fail(`${where}.score must be within 1..100`);
  }

  if (rule.code !== "" && !CODE_RE.test(rule.code)) {
    fail(`${where}.code is not a valid reason code`);
  }
}

function checkMeasure(
  section: string,
  rule: CounterMeasureRule,
  i: number,
  frame: boolean,
): void {
  const where = `${section}.measure[${i}]`;

  if (rule.counter === "") {
    fail(`${where}.counter is required`);
  }

  if (!SOURCES.has(rule.source)) {
    fail(`${where}.source must be const, regex_count, size_kb or bytes`);
  }

  if (rule.source === "regex_count") {
    if (rule.regex === "") {
      fail(`${where}: source regex_count needs regex`);
    }

    /*
     * Синтаксис здесь проверяется JS-движком, а исполняет выражение Go (RE2).
     * Общее подмножество совпадает; конструкции, которых нет у RE2
     * (backreferences, lookaround), поколение уронит как apply_failed --
     * ловить их точнее нечем, а пропустить очевидно битое выражение хуже.
     */
    try {
      new RegExp(rule.regex);
    } catch {
      fail(`${where}.regex does not compile`);
    }
  } else if (rule.regex !== "") {
    fail(`${where}.regex is only for source: regex_count`);
  }

  if (rule.per !== null && rule.per === 0) {
    fail(`${where}.per must not be zero: a rule that adds nothing is written by not writing it`);
  }

  for (const axis of rule.axes) {
    if (!AXES.has(axis)) {
      fail(`${where}.axes must be of ${COUNTER_AXES.join(", ")}`);
    }

    if (axis === "conn" && !frame) {
      fail(`${where}.axes: conn is only for the frame phase`);
    }
  }

  if (frame) {
    // У кадра нет ни статуса, ни типа, ни метода: селекторы -- другие.
    if (rule.if.status.length + rule.if.contentType.length + rule.if.methods.length > 0) {
      fail(`${where}.if: status, content_type and methods are not frame selectors`);
    }

    for (const direction of rule.if.direction) {
      if (!DIRECTIONS.has(direction)) {
        fail(`${where}.if.direction must be of ${COUNTER_DIRECTIONS.join(", ")}`);
      }
    }

    for (const opcode of rule.if.opcode) {
      if (!OPCODES.has(opcode)) {
        fail(`${where}.if.opcode must be of ${COUNTER_OPCODES.join(", ")}`);
      }
    }

    return;
  }

  if (rule.if.direction.length + rule.if.opcode.length > 0) {
    fail(`${where}.if: direction and opcode are frame selectors`);
  }

  for (const method of rule.if.methods) {
    if (!METHOD_RE.test(method)) {
      fail(`${where}.if.methods: ${method} is not a method`);
    }
  }

  for (const status of rule.if.status) {
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      fail(`${where}.if.status: ${status} is not an HTTP status`);
    }
  }
}

/**
 * checkPrior повторяет ограничения загрузчика инспектора: все три глагола
 * умеют ослаблять, поэтому имя отправителя обязательно, а широковещательного
 * правила не бывает вовсе.
 */
function checkPrior(rule: CounterPriorRule, i: number): void {
  const at = `trigger.prior[${i}]`;

  if (rule.from === "" || rule.from === "*") {
    fail(`${at}: from needs a named sender: every verb here can weaken`);
  }

  if (rule.accept.length === 0) {
    fail(`${at}: accept is required`);
  }

  for (const verb of rule.accept as string[]) {
    if (verb !== "threshold" && verb !== "skip" && verb !== "note") {
      fail(`${at}: "${verb}" is not ours to apply`);
    }
  }

  /*
   * Оси фильтра -- только те, с которыми выбранные глаголы бывают на проводе
   * и которые могут во что-то попасть: request у note корзины не имеет.
   */
  for (const axis of rule.apply) {
    if (axis === "request") {
      if (!rule.accept.includes("threshold") && !rule.accept.includes("skip")) {
        fail(`${at}: axis "${axis}" never hits a bucket of [${rule.accept.join(", ")}]`);
      }
    } else if (axis === "ip" || axis === "asn" || axis === "session") {
      if (!rule.accept.includes("note")) {
        fail(`${at}: axis "${axis}" never occurs with [${rule.accept.join(", ")}]`);
      }
    } else {
      fail(`${at}: unknown axis "${axis}"`);
    }
  }

  // Корзина -- адресат принятых note, и только их: молча висящее поле
  // скрывало бы опечатку в accept.
  if (rule.accept.includes("note")) {
    if (rule.counter === "") {
      fail(`${at}: counter is required for "note"`);
    }

    if (!COUNTER_NAME_RE.test(rule.counter)) {
      fail(`${at}: bad counter name "${rule.counter}"`);
    }
  } else if (rule.counter !== "") {
    fail(`${at}: counter is only for "note"`);
  }
}

function checkOutcome(outcome: CounterOutcome, i: number, frame: boolean): void {
  const where = `${frame ? "frame" : "request"}.outcomes[${i}]`;

  if (!ON.has(outcome.on)) {
    fail(`${where}.on must be deny, allow, score, level or overload`);
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
  } else if (outcome.on === "level") {
    if (outcome.if === null || outcome.if.counter === "") {
      fail(`${where}: on: level needs if.counter`);
    } else if (!AXES.has(outcome.if.axis)) {
      fail(`${where}.if.axis must be one of ${COUNTER_AXES.join(", ")}`);
    }

    if (outcome.at === null) {
      fail(`${where}: on: level needs at`);
    } else if (outcome.at < 0 || outcome.at > 100) {
      fail(`${where}.at is out of 0..100 percent`);
    }

    /*
     * Уровень корзины -- непрерывная величина: «ровно 40%» на ней не
     * случается, и строка с eq молчала бы всегда.
     */
    if (outcome.eq) {
      fail(`${where}: eq is only for on: score: a bucket level is continuous`);
    }
  } else if (outcome.on === "overload") {
    // Порог -- заполнение очереди в процентах, не назван -- край; строка
    // перегрузки -- только в секции запроса (model/overload.ts).
    if (frame) {
      fail(`${where}: on: overload is only for the request section`);
    }

    checkOverloadAt(outcome.at, where, fail);

    if (outcome.below || outcome.eq) {
      fail(`${where}: below and eq are only for on: score or level`);
    }
  } else if (outcome.at !== null || outcome.below || outcome.eq) {
    fail(`${where}: at, below and eq are only for on: score or level`);
  }

  if (outcome.if !== null && outcome.on !== "level") {
    fail(`${where}: if is only for on: level`);
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

    if (!DATASET_RE.test(outcome.list)) {
      fail(`${where}.list is not a dataset name`);
    }

    if (!["", "addr", "net", "net_all", "asn"].includes(outcome.write)) {
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
    /* Исход счётчика бывает отказом: там просьба соседу уже не доедет. */
    onDeny: outcome.on === "deny",
    /* Кадр: ось conn законна, записи ответа нет. */
    frame,
  });
}


/* --- общая секция ----------------------------------------------------------- */

export function normalizeShared(input: unknown): CounterSharedDoc {
  const root = obj(input, "shared");
  const counters = obj(root.counters, "counters");
  const subjects = obj(root.subjects, "subjects");
  const sess = obj(subjects.sess, "subjects.sess");
  const user = obj(subjects.user, "subjects.user");

  const out: CounterSharedDoc = {
    counters: {},
    subjects: {
      sess: { cookie: str(sess.cookie, "subjects.sess.cookie", DEFAULT_SESS_COOKIE) },
      user: { from: str(user.from, "subjects.user.from") },
    },
  };

  for (const [name, raw] of Object.entries(counters)) {
    const decl = obj(raw, `counters.${name}`);
    const axesRaw = obj(decl.axes, `counters.${name}.axes`);
    const axes: Partial<Record<CounterAxis, CounterAxisTier>> = {};

    for (const [axis, tier] of Object.entries(axesRaw)) {
      const row = obj(tier, `counters.${name}.axes.${axis}`);

      axes[axis as CounterAxis] = {
        max: num(row.max, `counters.${name}.axes.${axis}.max`, 0),
        loss: num(row.loss, `counters.${name}.axes.${axis}.loss`, 0),
      };
    }

    /*
     * Свои источники ключей: поле опциональное, и пустой объект равен его
     * отсутствию -- иначе панель, сохранившая {}, навсегда включила бы
     * счётчику «свои» пустые источники.
     */
    const declSubjects = obj(decl.subjects, `counters.${name}.subjects`);
    const declSess = obj(declSubjects.sess, `counters.${name}.subjects.sess`);
    const declUser = obj(declSubjects.user, `counters.${name}.subjects.user`);
    const sessCookie = str(declSess.cookie, `counters.${name}.subjects.sess.cookie`);
    const userFrom = str(declUser.from, `counters.${name}.subjects.user.from`);

    out.counters[name] = {
      unit: str(decl.unit, `counters.${name}.unit`),
      // Пустой fill -- measure: декларации, записанные до появления поля,
      // читаются без правки.
      fill: str(decl.fill, `counters.${name}.fill`, "measure") as CounterDecl["fill"],
      axes,
      subjects:
        sessCookie === "" && userFrom === ""
          ? null
          : { sess: { cookie: sessCookie }, user: { from: userFrom } },
    };
  }

  return out;
}

/*
 * validateShared повторяет ParseCounters инспектора: пустая секция, чужая ось,
 * неположительные числа и ось user без источника не грузятся и там.
 */
export function validateShared(input: unknown): CounterSharedDoc {
  const doc = normalizeShared(input);

  if (Object.keys(doc.counters).length === 0) {
    fail("no counters declared: an inspector without counters counts nothing");
  }

  for (const [name, decl] of Object.entries(doc.counters)) {
    if (!COUNTER_NAME_RE.test(name)) {
      fail(`bad counter name "${name}"`);
    }

    if (decl.fill !== "measure" && decl.fill !== "note") {
      fail(`counter ${name}: fill must be measure or note`);
    }

    const axes = Object.entries(decl.axes);

    if (axes.length === 0) {
      fail(`counter ${name}: no axes: a counter without axes counts nobody`);
    }

    for (const [axis, tier] of axes) {
      if (!AXES.has(axis)) {
        fail(`counter ${name}: unknown axis "${axis}"`);
      }

      if (tier === undefined || tier.max <= 0) {
        fail(`counter ${name}: axis ${axis}: max must be positive`);
      }

      if (tier.loss <= 0 || tier.loss > 100) {
        fail(`counter ${name}: axis ${axis}: loss must be within (0..100] percent per second`);
      }

      /* Свой источник в объявлении оживляет ось и при пустом общем. */
      if (
        axis === "user" &&
        doc.subjects.user.from === "" &&
        (decl.subjects === null || decl.subjects.user.from === "")
      ) {
        fail(`counter ${name}: axis user needs subjects.user.from`);
      }
    }

    if (decl.subjects !== null && !userFromOk(decl.subjects.user.from)) {
      fail(`counter ${name}: subjects.user.from must be ${USER_FROM_FORMS}`);
    }
  }

  if (doc.subjects.user.from !== "" && !userFromOk(doc.subjects.user.from)) {
    fail(`subjects.user.from must be ${USER_FROM_FORMS}`);
  }

  return doc;
}

const USER_FROM_FORMS = "cookie:<name>, header:<name>, session:user or session:sid";

/**
 * Источник ключа оси user. cookie и header читают присланное клиентом, session
 * -- личность, названную калиткой (секция sessions сообщения модуля): `user`
 * ключует корзину логином, `sid` -- сессией. Пусто -- источника нет, и это
 * проверяется отдельно: у объявления пустое поле законно, у оси -- нет.
 */
export function userFromOk(from: string): boolean {
  if (from === "") {
    return true;
  }

  const [kind, name] = splitOnce(from, ":");

  if (kind === "cookie" || kind === "header") {
    return name !== "";
  }

  return kind === "session" && (name === "user" || name === "sid");
}

function splitOnce(value: string, sep: string): [string, string] {
  const i = value.indexOf(sep);

  return i < 0 ? [value, ""] : [value.slice(0, i), value.slice(i + 1)];
}

/* --- связность -------------------------------------------------------------- */

/*
 * checkReferences -- ссылки профиля против общей секции. Ей нужны обе стороны,
 * поэтому она не внутри validateDoc: роутер зовёт её при сохранении профиля и
 * при правке общей секции (все профили), манифест -- при send.
 */
export function checkReferences(doc: CounterProfileDoc, shared: CounterSharedDoc): void {
  checkJudgeRefs("request", doc.request.judge, shared);
  checkJudgeRefs("frame", doc.frame.judge, shared);
  checkMeasureRefs("response", doc.response.measure, shared);
  checkMeasureRefs("frame", doc.frame.measure, shared);
  checkOutcomeRefs("request", doc.request.outcomes, shared);
  checkOutcomeRefs("frame", doc.frame.outcomes, shared);

  doc.trigger.prior.forEach((rule, i) => {
    if (!rule.accept.includes("note")) {
      return;
    }

    const decl = shared.counters[rule.counter];

    if (decl === undefined) {
      fail(`trigger.prior[${i}]: counter "${rule.counter}" is not declared`);
    }

    if (decl.fill !== "note") {
      fail(
        `trigger.prior[${i}]: counter "${rule.counter}" is fill: measure: ` +
          `measure fills it, notes would be a second owner`,
      );
    }

    /*
     * Хотя бы одна ось корзины обязана быть достижима с провода: ip, обе ASN
     * и sess. Корзина из одной оси user словам соседей недоступна.
     */
    const reachable = (["ip", "asn_net", "asn_router", "sess"] as CounterAxis[]).some(
      (axis) => decl.axes[axis] !== undefined,
    );

    if (!reachable) {
      fail(
        `trigger.prior[${i}]: counter "${rule.counter}" has no axis the channel ` +
          `can reach (ip, asn_net, asn_router, sess)`,
      );
    }
  });
}

function checkJudgeRefs(
  section: string,
  rules: CounterJudgeRule[],
  shared: CounterSharedDoc,
): void {
  rules.forEach((rule, i) => {
    const decl = shared.counters[rule.counter];

    if (decl === undefined) {
      fail(`${section}.judge[${i}]: counter "${rule.counter}" is not declared`);
    }

    if (decl.axes[rule.axis] === undefined) {
      fail(`${section}.judge[${i}]: counter "${rule.counter}" has no axis "${rule.axis}"`);
    }
  });
}

function checkMeasureRefs(
  section: string,
  rules: CounterMeasureRule[],
  shared: CounterSharedDoc,
): void {
  rules.forEach((rule, i) => {
    const decl = shared.counters[rule.counter];

    if (decl === undefined) {
      fail(`${section}.measure[${i}]: counter "${rule.counter}" is not declared`);
    }

    // Владелец у шкалы один: мерная корзина не принимает note, сигнальную
    // не меряют. Уровень обязан объясняться одним входом.
    if (decl.fill !== "measure") {
      fail(
        `${section}.measure[${i}]: counter "${rule.counter}" is fill: note: ` +
          `neighbours fill it, measure would be a second owner`,
      );
    }

    for (const axis of rule.axes) {
      if (decl.axes[axis] === undefined) {
        fail(`${section}.measure[${i}]: counter "${rule.counter}" has no axis "${axis}"`);
      }
    }
  });
}

// Инициатор по уровню смотрит названную корзину: ссылка на необъявленную
// молчала бы навсегда, а выглядела бы рабочим правилом.
function checkOutcomeRefs(
  section: string,
  outcomes: CounterOutcome[],
  shared: CounterSharedDoc,
): void {
  outcomes.forEach((outcome, i) => {
    if (outcome.on !== "level" || outcome.if === null) {
      return;
    }

    const decl = shared.counters[outcome.if.counter];

    if (decl === undefined) {
      fail(`${section}.outcomes[${i}]: counter "${outcome.if.counter}" is not declared`);
    }

    if (decl.axes[outcome.if.axis] === undefined) {
      fail(
        `${section}.outcomes[${i}]: counter "${outcome.if.counter}" has no axis ` +
          `"${outcome.if.axis}"`,
      );
    }
  });
}

/* --- печать в YAML ---------------------------------------------------------- */

/** renderCountersYaml печатает общую секцию -- файл counters.yaml. */
export function renderCountersYaml(shared: CounterSharedDoc): string {
  const out: string[] = [];

  out.push("# Счётчики: общая секция инспектора. Собрана контроллером, править");
  out.push("# здесь нечего: источник -- таблица counter_shared, раздел /counter в UX.");
  out.push("");
  out.push("counters:");

  for (const name of Object.keys(shared.counters).sort()) {
    const decl = shared.counters[name];

    out.push(`  ${name}:`);

    if (decl.unit !== "") {
      out.push(`    unit: ${q(decl.unit)}`);
    }

    // fill печатается только не-умолчанием: старые инспекторы читают
    // counters.yaml с KnownFields, и лишний ключ уронил бы их поколение.
    if (decl.fill !== "measure") {
      out.push(`    fill: ${decl.fill}`);
    }

    // Свои источники -- по той же причине только когда объявлены: оператор,
    // назвавший счётчику куку, сознательно требует пересобранный инспектор.
    if (decl.subjects !== null) {
      out.push("    subjects:");

      if (decl.subjects.sess.cookie !== "") {
        out.push(`      sess: { cookie: ${q(decl.subjects.sess.cookie)} }`);
      }

      if (decl.subjects.user.from !== "") {
        out.push(`      user: { from: ${q(decl.subjects.user.from)} }`);
      }
    }

    out.push("    axes:");

    for (const axis of COUNTER_AXES) {
      const tier = decl.axes[axis];

      if (tier !== undefined) {
        out.push(`      ${axis}: { max: ${tier.max}, loss: ${tier.loss} }`);
      }
    }
  }

  out.push("");
  out.push("subjects:");
  out.push(`  sess: { cookie: ${q(shared.subjects.sess.cookie)} }`);
  out.push(`  user: { from: ${q(shared.subjects.user.from)} }`);
  out.push("");

  return out.join("\n");
}

/** renderProfileYaml печатает ровно то, что читает загрузчик инспектора. */
export function renderProfileYaml(name: string, doc: CounterProfileDoc): string {
  const out: string[] = [];

  out.push(`# Профиль счётчика ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица counter_profiles, раздел /counter в UX.");
  out.push("");
  // Режима у профиля больше нет: включён ли инспектор и гейтит ли он, решает
  // вызов на маршруте (waf_inspect … mode=). mode: enforce печатается ради
  // загрузчика инспектора, у которого ключ пока обязателен.
  out.push("mode: enforce");
  out.push(`description: ${q(doc.description)}`);
  out.push("");

  if (doc.trigger.prior.length > 0) {
    out.push("trigger:");
    out.push("  prior:");

    for (const rule of doc.trigger.prior) {
      out.push(`    - from: ${q(rule.from)}`);
      out.push(`      accept: ${seq(rule.accept)}`);

      if (rule.apply.length > 0) {
        out.push(`      apply: ${seqPlain(rule.apply)}`);
      }

      if (rule.codes.length > 0) {
        out.push(`      codes: ${seq(rule.codes)}`);
      }

      if (rule.counter !== "") {
        out.push(`      counter: ${q(rule.counter)}`);
      }
    }

    out.push("");
  }

  out.push("request:");
  out.push(`  enabled: ${doc.request.enabled}`);
  pushJudge(out, doc.request.judge);
  out.push(`  deny_response: ${q(doc.request.denyResponse)}`);
  pushOutcomes(out, doc.request.outcomes);
  out.push("");

  out.push("response:");
  out.push(`  enabled: ${doc.response.enabled}`);
  pushMeasure(out, doc.response.measure);

  /*
   * Секция кадров печатается только заполненной: у профиля, который на
   * кадрах ничего не делает, файл остаётся прежним -- и его читает и
   * счётчик, собранный до фазы кадров (KnownFields отверг бы новый ключ).
   */
  const frame = doc.frame;
  const frameDefault =
    frame.enabled &&
    frame.measure.length === 0 &&
    frame.judge.length === 0 &&
    frame.outcomes.length === 0 &&
    frame.denyResponse === DEFAULT_FRAME_DENY_RESPONSE;

  if (!frameDefault) {
    out.push("");
    out.push("frame:");
    out.push(`  enabled: ${frame.enabled}`);
    pushMeasure(out, frame.measure);
    pushJudge(out, frame.judge);
    out.push(`  deny_response: ${q(frame.denyResponse)}`);
    pushOutcomes(out, frame.outcomes);
  }

  out.push("");

  return out.join("\n");
}

function pushJudge(out: string[], rules: readonly CounterJudgeRule[]): void {
  if (rules.length === 0) {
    return;
  }

  out.push("  judge:");

  for (const rule of rules) {
    out.push(`    - counter: ${q(rule.counter)}`);
    out.push(`      axis: ${rule.axis}`);
    out.push(`      at: ${rule.at}`);
    out.push(`      action: ${rule.action}`);

    if (rule.action === "score") {
      out.push(`      score: ${rule.score}`);
    }

    if (rule.code !== "") {
      out.push(`      code: ${q(rule.code)}`);
    }
  }
}

function pushMeasure(out: string[], rules: readonly CounterMeasureRule[]): void {
  if (rules.length === 0) {
    return;
  }

  out.push("  measure:");

  for (const rule of rules) {
    const cond = renderIf(rule);

    out.push(`    - ${cond === "" ? "" : `if: ${cond}\n      `}source: ${rule.source}`);

    if (rule.regex !== "") {
      out.push(`      regex: ${q(rule.regex)}`);
    }

    if (rule.per !== null && rule.per !== 1) {
      out.push(`      per: ${rule.per}`);
    }

    out.push(`      counter: ${q(rule.counter)}`);

    if (rule.axes.length > 0) {
      out.push(`      axes: ${seqPlain(rule.axes)}`);
    }
  }
}

/* Предикат печатается потоковой картой: пустые поля не печатаются вовсе. */
function renderIf(rule: CounterMeasureRule): string {
  const parts: string[] = [];

  if (rule.if.status.length > 0) {
    parts.push(`status: [${rule.if.status.join(", ")}]`);
  }

  if (rule.if.contentType.length > 0) {
    parts.push(`content_type: ${seq(rule.if.contentType)}`);
  }

  if (rule.if.methods.length > 0) {
    parts.push(`methods: ${seqPlain(rule.if.methods)}`);
  }

  if (rule.if.direction.length > 0) {
    parts.push(`direction: ${seqPlain(rule.if.direction)}`);
  }

  if (rule.if.opcode.length > 0) {
    parts.push(`opcode: ${seqPlain(rule.if.opcode)}`);
  }

  return parts.length === 0 ? "" : `{ ${parts.join(", ")} }`;
}

function pushOutcomes(out: string[], outcomes: readonly CounterOutcome[]): void {
  if (outcomes.length === 0) {
    return;
  }

  out.push("  outcomes:");

  for (const o of outcomes) {
    out.push(`    - on: ${o.on}`);

    if (o.on === "level" && o.if !== null) {
      out.push(`      if: { counter: ${q(o.if.counter)}, axis: ${o.if.axis} }`);
    }

    if (o.on === "overload" && o.at !== null) {
      out.push(`      at: ${o.at}`);
    }

    if ((o.on === "score" || o.on === "level") && o.at !== null) {
      out.push(`      at: ${o.at}`);

      if (o.below) {
        out.push("      below: true");
      }

      if (o.eq) {
        out.push("      eq: true");
      }
    }

    if (o.do !== "") {
      if (o.to !== "") {
        out.push(`      to: ${q(o.to)}`);
      }

      out.push(`      do: ${o.do}`);

      if (o.apply !== "") {
        out.push(`      apply: ${o.apply}`);
      }

      if (o.delta !== null) {
        out.push(`      delta: ${o.delta}`);
      }

      if (o.value !== null) {
        out.push(`      value: ${o.value}`);
      }

      if (o.counter !== "") {
        out.push(`      counter: ${q(o.counter)}`);
      }

      if (o.marker !== "") {
        out.push(`      marker: ${q(o.marker)}`);
      }

      if (o.group !== "") {
        out.push(`      group: ${q(o.group)}`);
        out.push(`      set: ${o.set}`);
      }

      if ((o.phase ?? "") !== "") {
        out.push(`      phase: ${o.phase}`);
      }

      if (o.do === "audit" || o.do === "archive") {
        out.push(`      set: ${o.set}`);

        if (o.set === "on") {
          if (o.do === "archive" && o.ttlS > 0) {
            out.push(`      ttl: ${q(ttl(o.ttlS))}`);
          }

          /* Исход -- множеством: пустой пишется отсутствием ключа. */
          if (o.do === "archive" && o.when.length > 0) {
            out.push(`      when: ${seq(o.when)}`);
          }

          for (const name of RECORD_OBJECTS) {
            const spec = o[name];

            if (spec !== null) {
              out.push(`      ${name}: ${recordObjectYaml(spec)}`);
            }
          }
        }
      }
    } else {
      out.push(`      list: ${q(o.list)}`);

      if (o.write !== "" && o.write !== "addr") {
        out.push(`      write: ${o.write}`);
      }

      out.push(`      ttl: ${q(ttl(o.ttlS))}`);
    }

    if (o.code !== "") {
      out.push(`      code: ${q(o.code)}`);
    }
  }
}

/* Срок человеческой записью: секунды в профиле читаются хуже, чем ошибаются. */
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

function seq(values: readonly string[]): string {
  return `[${values.map(q).join(", ")}]`;
}

function seqPlain(values: readonly string[]): string {
  return `[${values.join(", ")}]`;
}
