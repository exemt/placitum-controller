/*
 * Документ профиля капчи: нормализация, проверка и печать в profile.yaml.
 *
 * Умолчания и правила повторяют defaults() и Validate() инспектора
 * (inspectors/captcha/internal/config/profile.go). Расхождение между ними --
 * не стиль, а поколение, которое инспектор отвергнет как apply_failed;
 * поэтому проверка здесь ровно та же и в том же порядке.
 */

import type {
  CaptchaBuckets,
  CaptchaEventRule,
  CaptchaExternalConfig,
  CaptchaPriorRule,
  CaptchaProfileDoc,
  CaptchaProviderKind,
  CaptchaProviderRef,
} from "./model/captcha-profile.ts";
import { ARCHIVE_WHEN, RECORD_OBJECTS, type ArchiveWhen, type RecordObject } from "./model/actions.ts";
import { checkAsk } from "./model/action-ask.ts";
import { checkOverloadAt } from "./model/overload.ts";

/** Имя корзины у note: алфавит имён счётчиков получателя. */
const COUNTER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const WHENS = new Set(["always", "buckets", "never"]);
const MATCHES = new Set(["exact", "prefix"]);
const PROVIDERS = new Set<CaptchaProviderKind>([
  "image",
  "turnstile",
  "recaptcha",
  "hcaptcha",
  "smartcaptcha",
]);
const EXTERNAL = new Set<CaptchaProviderKind>([
  "turnstile",
  "recaptcha",
  "hcaptcha",
  "smartcaptcha",
]);
const ON_ERROR = new Set(["fallback", "allow", "deny"]);
const EXHAUSTED = new Set(["deny", "page"]);
const BINDS = new Set(["subnet", "ip", "ua"]);
const REDIRECT_STATUS = new Set([302, 303, 307]);
const RATE_RE = /^(\d+)\/(s|m|h)$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOUR = 3600;
const DAY = 24 * HOUR;

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

  return value.trim();
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

function list(value: unknown, path: string, def: string[] = []): string[] {
  if (value === undefined || value === null) {
    return [...def];
  }

  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }

  return value.map((item, i) => {
    if (typeof item !== "string") {
      fail(`${path}[${i}] must be a string`);
    }

    return item.trim();
  });
}

/** Объект просьбы записи: не назван -- null. Форму проверяет checkAsk. */
function recordObject(value: unknown, path: string): RecordObject | null {
  if (value === undefined || value === null) {
    return null;
  }

  const row = obj(value, path);
  const limit = row.limit === undefined || row.limit === null || row.limit === ""
    ? null
    : Number(row.limit);

  if (limit !== null && !Number.isInteger(limit)) {
    fail(`${path}.limit must be an integer`);
  }

  return {
    set: str(row.set, `${path}.set`).trim() as RecordObject["set"],
    limit,
    source: str(row.source, `${path}.source`).trim() as RecordObject["source"],
  };
}

/**
 * Исходы просьбы архива: те же два слова, что у `when=` директивы, в
 * каноническом порядке. Пусто -- любой исход, включая перенаправление.
 */
function archiveWhen(value: unknown, path: string): ArchiveWhen[] {
  const words = list(value, path).map((word) => word.trim().toLowerCase());

  for (const word of words) {
    if (!(ARCHIVE_WHEN as readonly string[]).includes(word)) {
      fail(`${path}: outcome must be allow or deny, got ${word}`);
    }
  }

  return ARCHIVE_WHEN.filter((name) => words.includes(name));
}

function seconds(value: unknown, path: string, def: number): number {
  const v = num(value, path, def);

  if (!Number.isInteger(v) || v < 0) {
    fail(`${path} must be a non-negative whole number of seconds`);
  }

  return v;
}

function storeRef(value: unknown, path: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !UUID_RE.test(value)) {
    fail(`${path} must be a store object uuid`);
  }

  return value.toLowerCase();
}

function externalOf(raw: unknown, path: string, version: string): CaptchaExternalConfig {
  const e = obj(raw, path);

  return {
    version: str(e.version, `${path}.version`, version),
    sitekey: str(e.sitekey, `${path}.sitekey`),
    secretEnv: str(e.secretEnv, `${path}.secretEnv`),
    secretStore: storeRef(e.secretStore, `${path}.secretStore`),
    minScore: num(e.minScore, `${path}.minScore`, 0.5),
    remoteip: bool(e.remoteip, `${path}.remoteip`, false),
    timeoutS: seconds(e.timeoutS, `${path}.timeoutS`, 3),
    onError: str(e.onError, `${path}.onError`, "fallback") as CaptchaExternalConfig["onError"],
  };
}

/* Ручки PoW старых строк (difficulty и родня) читаются и отбрасываются. */
function providerOf(raw: unknown, path: string): CaptchaProviderRef {
  const p = obj(raw, path);
  const kind = str(p.kind, `${path}.kind`) as CaptchaProviderKind;

  return {
    kind,
    length: num(p.length, `${path}.length`, 5),
    audio: bool(p.audio, `${path}.audio`, true),
  };
}

/*
 * Строка старой формы несёт inspector + reasons: коды причины были
 * единственным каналом, которым сосед просил капчу, и все они означали
 * "покажи проверку". Новая форма -- from + accept с глаголом, а повод стал
 * необязательным уточнением. Перевод однозначный: reasons переезжают в codes,
 * глагол один -- challenge.
 *
 * scoreAt из старой строки не переносится никуда: правило по чужому числу
 * больше не существует -- score это внутренняя шкала соседа без обещания
 * стабильности, и такое правило меняло бы смысл от правки в чужом файле.
 */
function priorOf(raw: unknown, path: string): CaptchaPriorRule {
  const r = obj(raw, path);
  const legacy = r.from === undefined && r.inspector !== undefined;

  /*
   * apply и потолки (maxPercent/maxDelta/maxValue) -- мёртвые поля старых
   * строк: читаются и отбрасываются, границы держат загрузчик отправителя и
   * ёмкость корзины.
   */
  return {
    from: legacy
      ? str(r.inspector, `${path}.inspector`, "*")
      : str(r.from, `${path}.from`, "*"),
    /* threshold умер вместе со счётом-триггером: читается и отбрасывается. */
    accept: (legacy
      ? ["challenge"]
      : list(r.accept, `${path}.accept`).filter((v) => v !== "threshold")
    ) as CaptchaPriorRule["accept"],
    codes: legacy
      ? list(r.reasons, `${path}.reasons`)
      : list(r.codes, `${path}.codes`),
  };
}

/**
 * Корзина: ёмкость, потери и свои пороги. Общие пороги старых строк
 * (buckets.captchaAt/banAt) переливаются в корзины без своих.
 */
function tierOf(raw: unknown, path: string, shared: { captchaAt: number; banAt: number }): CaptchaBuckets["ip"] {
  const r = obj(raw, path);
  const max = num(r.max, `${path}.max`, 0);

  let captchaAt = num(r.captchaAt, `${path}.captchaAt`, 0);
  let banAt = num(r.banAt, `${path}.banAt`, 0);

  if (max > 0 && captchaAt === 0) {
    captchaAt = shared.captchaAt;
  }

  if (max > 0 && banAt === 0) {
    banAt = shared.banAt;
  }

  return {
    max,
    loss: num(r.loss, `${path}.loss`, 0),
    captchaAt,
    banAt,
  };
}

/**
 * withLegacyCleared переносит прежний list.cleared в правило: строка,
 * сохранённая до перемены, обязана публиковать прошедших так же, как раньше.
 */
function withLegacyCleared(
  rules: CaptchaEventRule[],
  legacy: Record<string, unknown>,
): CaptchaEventRule[] {
  const cleared = str(legacy.cleared, "list.cleared");

  if (cleared === "") {
    return rules;
  }

  const already = rules.some(
    (r) => r.on === "pass" && r.list === cleared && r.write === "cid",
  );

  if (already) {
    return rules;
  }

  return [
    ...rules,
    {
      on: "pass",
      bucket: "",
      next: "",
      to: "",
      do: "",
      apply: "",
      delta: null,
      value: null,
      counter: "",
      marker: "",
      group: "",
      phase: "",
      set: "",
      headers: null,
      args: null,
      body: null,
      when: [],
      list: cleared,
      ttlS: num(legacy.ttlS, "list.ttlS", 24 * 3600),
      write: "cid",
      charge: "",
      percent: 0,
      code: "",
    },
  ];
}

function bucketsOf(bkt: Record<string, unknown>): CaptchaBuckets {
  // Общие пороги -- мёртвые поля старых строк: читаются и переливаются.
  const shared = {
    captchaAt: num(bkt.captchaAt, "buckets.captchaAt", 0),
    banAt: num(bkt.banAt, "buckets.banAt", 0),
  };

  return {
    ip: tierOf(bkt.ip, "buckets.ip", shared),
    sess: tierOf(bkt.sess, "buckets.sess", shared),
    asnNet: tierOf(bkt.asnNet, "buckets.asnNet", shared),
    asnRouter: tierOf(bkt.asnRouter, "buckets.asnRouter", shared),
  };
}

function eventRuleOf(raw: unknown, path: string): CaptchaEventRule {
  const r = obj(raw, path);

  // Прежнее имя порогового события: bucket_full было единственным и значило
  // порог бана.
  const on = str(r.on, `${path}.on`);

  return {
    on: (on === "bucket_full" ? "bucket_ban" : on) as CaptchaEventRule["on"],
    at: r.at === undefined || r.at === null ? null : num(r.at, `${path}.at`, 0),
    bucket: str(r.bucket, `${path}.bucket`),
    next: str(r.next, `${path}.next`) as CaptchaEventRule["next"],
    to: str(r.to, `${path}.to`),
    do: str(r.do, `${path}.do`),
    apply: str(r.apply, `${path}.apply`),
    delta: r.delta === undefined || r.delta === null ? null : num(r.delta, `${path}.delta`, 0),
    value: r.value === undefined || r.value === null ? null : num(r.value, `${path}.value`, 0),
    counter: str(r.counter, `${path}.counter`),
    marker: str(r.marker, `${path}.marker`),
    group: str(r.group, `${path}.group`),
    phase: str(r.phase, `${path}.phase`),
    set: str(r.set, `${path}.set`) as CaptchaEventRule["set"],
    headers: recordObject(r.headers, `${path}.headers`),
    args: recordObject(r.args, `${path}.args`),
    body: recordObject(r.body, `${path}.body`),
    when: archiveWhen(r.when, `${path}.when`),
    list: str(r.list, `${path}.list`),
    /* Срок: у записи в набор -- срок записи, у archive с set on -- срок архива. */
    ttlS: num(r.ttlS, `${path}.ttlS`, 0),
    write: str(r.write, `${path}.write`, "addr") as CaptchaEventRule["write"],
    charge: str(r.charge, `${path}.charge`),
    percent: num(r.percent, `${path}.percent`, 0),
    code: str(r.code, `${path}.code`),
  };
}

/**
 * normalizeDoc приводит произвольный объект к полной форме документа с
 * умолчаниями инспектора. Не проверяет смысл -- только типы; смысл в
 * validateDoc, чтобы строка, записанная до появления поля, читалась.
 */
export function normalizeDoc(raw: unknown): CaptchaProfileDoc {
  const d = obj(raw, "doc");
  const trigger = obj(d.trigger, "trigger");
  const bkt = obj(d.buckets, "buckets");
  const gate = obj(d.gate, "gate");
  const pc = obj(d.providerConfig, "providerConfig");
  const image = obj(pc.image, "providerConfig.image");
  const challenge = obj(d.challenge, "challenge");
  const clearance = obj(d.clearance, "clearance");
  const subnet = obj(clearance.subnet, "clearance.subnet");
  const fp = obj(d.fingerprint, "fingerprint");
  const loop = obj(d.loop, "loop");
  const limits = obj(d.limits, "limits");
  const upstream = obj(d.upstream, "upstream");
  const roster = obj(d.roster, "roster");

  /*
   * Строки старой формы несут providers[]: первый -- основной, второй --
   * запасной. Новая форма -- provider и fallback.
   */
  const legacy = arr(d.providers, "providers");
  let provider = providerOf(
    d.provider ?? legacy[0] ?? { kind: "image" },
    "provider",
  );
  const fallbackRaw = d.fallback ?? legacy[1] ?? null;
  let fallback = fallbackRaw === null ? null : providerOf(fallbackRaw, "fallback");

  /*
   * PoW умер: он доказывал вычисление, а не человечность; темп держат
   * корзины. Старые строки читаются: на месте pow встаёт свой запасной
   * (или картинка), запасной pow отбрасывается.
   */
  if ((provider.kind as string) === "pow") {
    provider = fallback ?? providerOf({ kind: "image" }, "provider");
    fallback = null;
  }

  if (fallback !== null && (fallback.kind as string) === "pow") {
    fallback = null;
  }

  return {
    path: str(d.path, "path"),
    title: str(d.title, "title", "Подтвердите, что вы не робот"),
    note: str(d.note, "note"),
    page: str(d.page, "page"),
    trigger: {
      /* when: score старых строк читается как "по корзинам"; счёт фазы
       * триггером быть перестал, его порог отбрасывается. */
      when: whenOf(str(trigger.when, "trigger.when", "buckets")),
      prior: arr(trigger.prior, "trigger.prior").map((item, i) =>
        priorOf(item, `trigger.prior[${i}]`),
      ),
    },
    buckets: bucketsOf(bkt),
    /* pages, loop и list -- мёртвые секции старых строк. Пути решает маршрут
     * (profile=), петлю попыток и публикации в наборы -- правила по событиям;
     * прежний list.cleared переезжает правилом «прошёл → кука в набор». */
    rules: withLegacyCleared(
      arr(d.rules, "rules").map((item, i) => eventRuleOf(item, `rules[${i}]`)),
      obj(d.list, "list"),
    ),
    gate: {
      redirectMethods: list(gate.redirectMethods, "gate.redirectMethods", ["GET", "HEAD"]),
      redirectStatus: num(gate.redirectStatus, "gate.redirectStatus", 303),
      denyResponse: str(gate.denyResponse, "gate.denyResponse", "captcha_required"),
      htmlOnly: bool(gate.htmlOnly, "gate.htmlOnly", true),
      /*
       * Прежний рычаг того же режима -- имя записи каталога form_response --
       * читается как inline: true одно поколение.
       */
      inline:
        bool(gate.inline, "gate.inline", false) ||
        str(gate.form_response ?? gate.formResponse, "gate.form_response", "") !== "",
    },
    provider,
    fallback,
    providerConfig: {
      image: {
        alphabet: str(
          image.alphabet,
          "providerConfig.image.alphabet",
          "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
        ),
        languages: list(image.languages, "providerConfig.image.languages"),
        audioDir: str(image.audioDir, "providerConfig.image.audioDir"),
      },
      turnstile: externalOf(pc.turnstile, "providerConfig.turnstile", ""),
      recaptcha: externalOf(pc.recaptcha, "providerConfig.recaptcha", "v2"),
      hcaptcha: externalOf(pc.hcaptcha, "providerConfig.hcaptcha", ""),
      smartcaptcha: externalOf(pc.smartcaptcha, "providerConfig.smartcaptcha", ""),
    },
    challenge: {
      cookie: str(challenge.cookie, "challenge.cookie", "waf_cap"),
      ttlS: seconds(challenge.ttlS, "challenge.ttlS", 300),
    },
    clearance: {
      cookie: str(clearance.cookie, "clearance.cookie", "waf_clr"),
      idCookie: str(clearance.idCookie, "clearance.idCookie", "waf_cid"),
      ttlS: seconds(clearance.ttlS, "clearance.ttlS", DAY),
      bind: list(clearance.bind, "clearance.bind", ["subnet", "ua"]),
      subnet: {
        v4: num(subnet.v4, "clearance.subnet.v4", 24),
        v6: num(subnet.v6, "clearance.subnet.v6", 64),
      },
      list: str(clearance.list, "clearance.list", ""),
      graceS: seconds(clearance.graceS, "clearance.graceS", 0),
    },
    fingerprint: {
      collect: bool(fp.collect, "fingerprint.collect", true),
      canvas: bool(fp.canvas, "fingerprint.canvas", false),
      farmAt: num(fp.farmAt, "fingerprint.farmAt", 50),
      windowS: seconds(fp.windowS, "fingerprint.windowS", HOUR),
    },
    limits: {
      issuePerSubnet: str(limits.issuePerSubnet, "limits.issuePerSubnet", "30/m"),
      verifyPerSubnet: str(limits.verifyPerSubnet, "limits.verifyPerSubnet", "60/m"),
      pendingMax: num(limits.pendingMax, "limits.pendingMax", 200000),
      providerBudget: str(limits.providerBudget, "limits.providerBudget", "50/s"),
    },
    upstream: { header: str(upstream.header, "upstream.header", "X-WAF-Captcha") },
    roster: {
      store: str(roster.store, "roster.store", "redis") as CaptchaProfileDoc["roster"]["store"],
      prefix: str(roster.prefix, "roster.prefix", "cap:"),
      revokeRefreshMs: num(roster.revokeRefreshMs, "roster.revokeRefreshMs", 2000),
    },
    languages: list(d.languages, "languages", ["ru", "en"]),
  };
}

/* --- проверка -------------------------------------------------------------- */

const PATH_RE = /^\/[\x21-\x7e]*$/;

function checkPath(value: string, field: string, required: boolean): void {
  if (value === "") {
    if (required) {
      fail(`${field} is empty`);
    }

    return;
  }

  if (!PATH_RE.test(value) || value.startsWith("//")) {
    fail(`${field} must be an absolute path, got "${value}"`);
  }

  if (value.includes("?") || value.includes("#")) {
    fail(`${field} must not carry a query or fragment`);
  }
}

function whenOf(when: string): CaptchaProfileDoc["trigger"]["when"] {
  return (when === "score" ? "buckets" : when) as CaptchaProfileDoc["trigger"]["when"];
}

function checkWhen(field: string, when: string): void {
  if (!WHENS.has(when)) {
    fail(`${field} must be always, buckets or never, got "${when}"`);
  }
}

/*
 * Словарь глаголов accept. Осей в правилах больше нет -- куда падает заряд,
 * называет сама просьба; таблица осталась перечнем известных глаголов.
 */
const AXES_OF: Record<string, string[]> = {
  challenge: ["request"],
  skip: ["request"],
  note: ["request", "ip", "asn", "session"],
};

/**
 * checkPrior повторяет ограничения загрузчика инспектора
 * ([profile.go](../../inspectors/captcha/internal/config/profile.go)) -- не
 * ради красоты, а чтобы правило, которое инспектор не примет, не уезжало на
 * край: там оно означает процесс, который не поднялся.
 *
 * Модель угрозы у широковещательных правил одна: один инспектор скомпрометирован
 * или сломан. Тихий адресный обход защиты хуже громкой общей аварии -- первый
 * живёт незамеченным месяцами, вторая видна в первую минуту. Отсюда: послабление
 * требует имени, ужесточение -- нет.
 */
function checkPrior(rule: CaptchaPriorRule, i: number): void {
  const at = `trigger.prior[${i}]`;

  if (rule.from === "") {
    fail(`${at}: from is empty (use "*" for any)`);
  }

  if (rule.accept.length === 0) {
    fail(`${at}: accept is required`);
  }

  // Разбор кладёт в accept то, что пришло строкой, поэтому проверять надо
  // широкий тип: словарь глаголов не сужается на входе, он проверяется здесь.
  for (const verb of rule.accept as string[]) {
    if (verb === "reauth") {
      fail(`${at}: "reauth" is not ours to apply`);
    }

    if (verb !== "*" && !(verb in AXES_OF)) {
      fail(`${at}: unknown verb "${verb}"`);
    }
  }

  if (rule.from !== "*") {
    return;
  }

  /*
   * Широковещательное правило годится только для challenge: послабление
   * (skip, знак threshold, знак note), доступное любому инспектору контура, --
   * способ для одного скомпрометированного отменить находки всех остальных.
   */
  const weakening = (rule.accept as string[]).filter((v) => v !== "challenge");

  if (weakening.length > 0) {
    fail(`${at}: only "challenge" may come from "*": everything else can weaken`);
  }
}

/** Корзины: то же, чем отвергает загрузчик (validateBuckets инспектора). */
function checkBuckets(doc: { buckets: CaptchaBuckets }): void {
  const b = doc.buckets;

  for (const [name, tier] of [
    ["buckets.ip", b.ip],
    ["buckets.sess", b.sess],
    ["buckets.asnNet", b.asnNet],
    ["buckets.asnRouter", b.asnRouter],
  ] as const) {
    if (tier.max === 0 && tier.loss === 0 && tier.captchaAt === 0 && tier.banAt === 0) {
      continue;
    }

    if (tier.max < 0) {
      fail(`${name}.max must not be negative`);
    }

    if (tier.max > 0 && (tier.loss <= 0 || tier.loss > 100)) {
      fail(`${name}.loss must be within (0..100] percent per second`);
    }

    if (tier.captchaAt < 0 || tier.captchaAt > 100) {
      fail(`${name}.captchaAt must be 0..100 percent`);
    }

    if (
      tier.banAt !== 0 &&
      (tier.banAt > 100 || (tier.captchaAt > 0 && tier.banAt < tier.captchaAt))
    ) {
      fail(`${name}.banAt must be 0 or captchaAt..100`);
    }
  }
}

const ONS = new Set(["fail", "pass", "bucket_captcha", "bucket_ban", "cleared", "uncleared", "overload"]);

/** Событие волны инспектора: просьбы соседям доедут. */
function onWave(on: string): boolean {
  return (
    on === "bucket_captcha" || on === "bucket_ban" || on === "cleared" || on === "uncleared" ||
    on === "overload"
  );
}

/** Событие порога корзины: селектор корзины имеет смысл. */
function bucketEvent(on: string): boolean {
  return on === "bucket_captcha" || on === "bucket_ban";
}
const WRITES = new Set(["addr", "net", "net_all", "asn", "cid"]);
const BUCKET_KINDS = new Set(["ip", "sess", "asn_net", "asn_router"]);
/** Правила по событиям: то же, чем отвергает загрузчик (validateEventRule). */
function checkEventRule(rule: CaptchaEventRule, i: number): void {
  const at = `rules[${i}]`;

  if (!ONS.has(rule.on)) {
    fail(`${at}: on must be fail, pass, bucket_captcha, bucket_ban, cleared, uncleared or overload`);
  }

  // Порог -- только у перегрузки: заполнение очереди в процентах, не назван -- край.
  if (rule.on === "overload") {
    checkOverloadAt(rule.at, at, fail);
  } else if ((rule.at ?? null) !== null) {
    fail(`${at}: at is only for on: overload`);
  }

  if (rule.bucket !== "") {
    if (!bucketEvent(rule.on)) {
      fail(`${at}: bucket picks a bucket for threshold events only`);
    }

    if (!BUCKET_KINDS.has(rule.bucket)) {
      fail(`${at}: unknown bucket "${rule.bucket}"`);
    }
  }

  if (rule.next !== "") {
    if (rule.next !== "allow" && rule.next !== "challenge") {
      fail(`${at}: next must be allow or challenge`);
    }

    // Решение лестницы бывает любым только у uncleared и порогов корзин.
    if (rule.on !== "uncleared" && !bucketEvent(rule.on)) {
      fail(`${at}: next is for uncleared and bucket thresholds only`);
    }
  }

  const kinds = [rule.do, rule.list, rule.charge].filter((v) => v !== "").length;

  if (kinds !== 1) {
    fail(`${at}: exactly one of do, list or charge`);
  }

  if (rule.do !== "") {
    if (!onWave(rule.on)) {
      fail(`${at}: an ask needs the wave: ${rule.on} happens in the HTTP process`);
    }

    /*
     * Форма просьбы -- общая с остальными отправителями, проверяет её тот же
     * валидатор канала. Капча стоит только на фазе запроса: осей conn и
     * response у неё не бывает, поэтому там, где словарь даёт выбор (режимы:
     * request либо conn), ось дописывается заранее -- как в загрузчике
     * инспектора; response отбраковывается ниже.
     */
    if (rule.apply === "" && rule.do !== "note") {
      rule.apply = rule.do === "reauth" ? "session" : "request";
    }

    checkAsk(at, rule, { fail, normalize: true });

    if (rule.apply === "response") {
      fail(`${at}: apply response is not for the captcha: it stands on the request phase only`);
    }

    // Срок у просьбы -- только срок архива: у прочих глаголов ему нечего значить.
    if (rule.ttlS !== 0 && rule.do !== "archive") {
      fail(`${at}: ttl is only for a list write or do: archive`);
    }
  } else if (rule.ttlS !== 0 && rule.list === "") {
    fail(`${at}: ttl is only for a list write or do: archive`);
  }

  if (rule.list !== "") {
    if (!WRITES.has(rule.write)) {
      fail(`${at}: write must be addr, net, asn or cid`);
    }

    // Кука известна там, где её выдали (pass) и где предъявили (cleared).
    if (rule.write === "cid" && rule.on !== "pass" && rule.on !== "cleared") {
      fail(`${at}: write cid lives on pass and cleared only`);
    }

    if (rule.ttlS <= 0) {
      fail(`${at}: ttl is required for a list write`);
    }
  }

  if (rule.charge !== "") {
    if (!BUCKET_KINDS.has(rule.charge)) {
      fail(`${at}: unknown bucket "${rule.charge}"`);
    }

    if (rule.percent < -100 || rule.percent > 100 || rule.percent === 0) {
      fail(`${at}: percent must be within -100..100 and not zero`);
    }
  }

  if (rule.code !== "" && !/^[A-Z][A-Z0-9_]{0,63}$/.test(rule.code)) {
    fail(`${at}: code is not [A-Z][A-Z0-9_]*`);
  }
}

function checkRate(field: string, value: string): void {
  if (value === "" || value === "0") {
    return;
  }

  if (!RATE_RE.test(value)) {
    fail(`${field} must look like 30/m, got "${value}"`);
  }
}

/**
 * Страница капчи -- шаблон html/template инспектора. Минимум, без которого
 * она молча никого не пропустит: форма POST, поле csrf с nonce, список
 * виджетов.
 */
export function validatePage(text: string): void {
  if (!/<form[^>]*method\s*=\s*["']?post/i.test(text)) {
    fail('page has no <form method="post">');
  }

  if (!/name\s*=\s*["']csrf["'][^>]*value\s*=\s*["']\{\{\s*\.Nonce\s*\}\}["']/i.test(text) &&
      !/value\s*=\s*["']\{\{\s*\.Nonce\s*\}\}["'][^>]*name\s*=\s*["']csrf["']/i.test(text)) {
    fail('page has no csrf field with {{.Nonce}}');
  }

  if (!/\{\{\s*range\s+\.Widgets\s*\}\}/.test(text)) {
    fail("page does not iterate {{range .Widgets}}");
  }
}

export function validateDoc(doc: CaptchaProfileDoc): void {
  // Путь обязателен всегда: режим у профиля снят, а без пути капче некуда
  // отправить клиента.
  checkPath(doc.path, "path", true);

  if (doc.page !== "" && !UUID_RE.test(doc.page)) {
    fail("page must be a content object uuid");
  }

  checkWhen("trigger.when", doc.trigger.when);

  doc.trigger.prior.forEach(checkPrior);
  checkBuckets(doc);

  doc.rules.forEach(checkEventRule);

  if (!REDIRECT_STATUS.has(doc.gate.redirectStatus)) {
    fail("gate.redirectStatus must be 302, 303 or 307");
  }

  if (doc.gate.denyResponse === "") {
    fail("gate.denyResponse is empty");
  }

  for (const m of doc.gate.redirectMethods) {
    if (m !== m.toUpperCase()) {
      fail(`gate.redirectMethods: method must be upper case, got "${m}"`);
    }
  }

  validateProviders(doc);

  const { challenge, clearance } = doc;

  if (challenge.cookie === "" || clearance.cookie === "" || clearance.idCookie === "") {
    fail("challenge.cookie, clearance.cookie and clearance.idCookie must not be empty");
  }

  if (
    challenge.cookie === clearance.cookie ||
    clearance.cookie === clearance.idCookie ||
    challenge.cookie === clearance.idCookie
  ) {
    fail("challenge.cookie, clearance.cookie and clearance.idCookie must differ");
  }

  if (challenge.ttlS === 0 || clearance.ttlS === 0) {
    fail("challenge.ttlS and clearance.ttlS must be positive");
  }

  for (const b of clearance.bind) {
    if (!BINDS.has(b)) {
      fail(`clearance.bind: expected subnet, ip or ua, got "${b}"`);
    }
  }

  // Подсеть и адрес пишут одно поле токена -- вместе они противоречат друг
  // другу; выбор строгости остаётся за владельцем профиля.
  if (clearance.bind.includes("subnet") && clearance.bind.includes("ip")) {
    fail("clearance.bind: subnet and ip are mutually exclusive");
  }

  if (
    clearance.subnet.v4 < 0 || clearance.subnet.v4 > 32 ||
    clearance.subnet.v6 < 0 || clearance.subnet.v6 > 128
  ) {
    fail("clearance.subnet is out of range");
  }

  if (clearance.list !== "" && !COUNTER_NAME_RE.test(clearance.list)) {
    fail("clearance.list must be a plain dataset name");
  }

  // Грейс -- окно на доезд записи через секвенсор, а не второй срок жизни.
  if (clearance.graceS < 0 || clearance.graceS > 300) {
    fail("clearance.graceS must be within 0..300");
  }

  checkRate("limits.issuePerSubnet", doc.limits.issuePerSubnet);
  checkRate("limits.verifyPerSubnet", doc.limits.verifyPerSubnet);
  checkRate("limits.providerBudget", doc.limits.providerBudget);

  if (doc.limits.pendingMax < 0) {
    fail("limits.pendingMax must not be negative");
  }

  if (doc.upstream.header === "") {
    fail("upstream.header is empty");
  }

  if (doc.roster.store !== "redis" && doc.roster.store !== "memory") {
    fail("roster.store must be redis or memory");
  }

  if (doc.roster.prefix === "") {
    fail("roster.prefix is empty");
  }

}

/* refsOf -- основной и запасной в порядке показа. */
function refsOf(doc: CaptchaProfileDoc): CaptchaProviderRef[] {
  return doc.fallback === null ? [doc.provider] : [doc.provider, doc.fallback];
}

function validateProviders(doc: CaptchaProfileDoc): void {
  if ((doc.provider.kind as string) === "") {
    fail("provider is empty: a widget is required");
  }

  if (doc.fallback !== null && doc.fallback.kind === doc.provider.kind) {
    fail("fallback must differ from provider");
  }

  refsOf(doc).forEach((ref, i) => {
    if (!PROVIDERS.has(ref.kind)) {
      fail(`providers[${i}]: unknown kind "${ref.kind}"`);
    }

    if (ref.kind === "image") {
      if (ref.length < 3 || ref.length > 10) {
        fail(`providers[${i}]: image length must be 3..10`);
      }

      if (doc.providerConfig.image.alphabet.length < 8) {
        fail("providerConfig.image.alphabet is too short");
      }
    }

    if (EXTERNAL.has(ref.kind)) {
      const cfg = doc.providerConfig[ref.kind as keyof CaptchaProfileDoc["providerConfig"]] as CaptchaExternalConfig;

      if (cfg.sitekey === "") {
        fail(`providerConfig.${ref.kind}.sitekey is empty`);
      }

      if (cfg.secretEnv === "" && cfg.secretStore === null) {
        fail(`providerConfig.${ref.kind}: secretEnv or secretStore is required`);
      }

      if (cfg.secretEnv !== "" && cfg.secretStore !== null) {
        fail(`providerConfig.${ref.kind}: secretEnv and secretStore are mutually exclusive`);
      }

      if (!ON_ERROR.has(cfg.onError)) {
        fail(`providerConfig.${ref.kind}.onError must be fallback, allow or deny`);
      }

      if (cfg.timeoutS === 0) {
        fail(`providerConfig.${ref.kind}.timeoutS must be positive`);
      }

      if (ref.kind === "recaptcha" && cfg.version !== "v2" && cfg.version !== "v3") {
        fail("providerConfig.recaptcha.version must be v2 or v3");
      }
    }
  });
}

/* --- печать ---------------------------------------------------------------- */

function duration(s: number): string {
  if (s === 0) {
    return "0";
  }

  // Суток у time.ParseDuration нет: сутки печатаются часами.
  if (s % HOUR === 0) {
    return `${s / HOUR}h`;
  }

  if (s % 60 === 0) {
    return `${s / 60}m`;
  }

  return `${s}s`;
}

/* Кавычки ставятся всегда: YAML без них угадывает тип. */
function q(value: string): string {
  return JSON.stringify(value);
}

/** Объект просьбы записи одной строкой: только названные поля. */
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

function seq(values: string[]): string {
  return `[${values.map(q).join(", ")}]`;
}

function externalBlock(out: string[], kind: string, cfg: CaptchaExternalConfig): void {
  out.push(`  ${kind}:`);

  if (kind === "recaptcha") {
    out.push(`    version: ${q(cfg.version)}`);
    out.push(`    min_score: ${cfg.minScore}`);
  }

  out.push(`    sitekey: ${q(cfg.sitekey)}`);

  if (cfg.secretStore !== null) {
    out.push(`    secret_store: ${q(cfg.secretStore)}`);
  } else if (cfg.secretEnv !== "") {
    out.push(`    secret_env: ${q(cfg.secretEnv)}`);
  }

  out.push(`    remoteip: ${cfg.remoteip}`);
  out.push(`    timeout: ${q(duration(cfg.timeoutS))}`);
  out.push(`    on_error: ${cfg.onError}`);
}

export function renderProfileYaml(name: string, doc: CaptchaProfileDoc): string {
  const out: string[] = [];

  out.push(`# Профиль капчи ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица captcha_profiles, раздел /captcha в UX.");
  out.push("");
  // Режима у профиля больше нет: включён ли инспектор и гейтит ли он, решает
  // вызов на маршруте (waf_inspect … mode=). mode: enforce печатается ради
  // загрузчика инспектора, у которого ключ пока обязателен.
  out.push("mode: enforce");
  out.push(`path: ${q(doc.path)}`);
  out.push(`title: ${q(doc.title)}`);
  out.push(`note: ${q(doc.note)}`);
  out.push("");

  out.push("trigger:");
  out.push(`  when: ${doc.trigger.when}`);

  if (doc.trigger.prior.length > 0) {
    out.push("  prior:");

    for (const rule of doc.trigger.prior) {
      out.push(`    - from: ${q(rule.from)}`);
      out.push(`      accept: ${seq(rule.accept)}`);

      if (rule.codes.length > 0) {
        out.push(`      codes: ${seq(rule.codes)}`);
      }
    }
  }

  out.push("");

  /* Секция печатается только с включёнными корзинами: пустая -- обычное
   * состояние, профиль без общего счёта. */
  const tiers = [
    ["ip", doc.buckets.ip],
    ["sess", doc.buckets.sess],
    ["asn_net", doc.buckets.asnNet],
    ["asn_router", doc.buckets.asnRouter],
  ] as const;

  if (tiers.some(([, tier]) => tier.max > 0)) {
    out.push("buckets:");

    for (const [name, tier] of tiers) {
      if (tier.max === 0) {
        continue;
      }

      let row = `  ${name}: { max: ${tier.max}, loss: ${tier.loss}`;

      if (tier.captchaAt > 0) {
        row += `, captcha_at: ${tier.captchaAt}`;
      }

      if (tier.banAt > 0) {
        row += `, ban_at: ${tier.banAt}`;
      }

      out.push(row + " }");
    }

    out.push("");
  }

  if (doc.rules.length > 0) {
    out.push("rules:");

    for (const rule of doc.rules) {
      out.push(`  - on: ${rule.on}`);

      if (rule.on === "overload" && rule.at !== null && rule.at !== undefined) {
        out.push(`    at: ${rule.at}`);
      }

      if (rule.bucket !== "") {
        out.push(`    bucket: ${rule.bucket}`);
      }

      if (rule.next !== "") {
        out.push(`    next: ${rule.next}`);
      }

      if (rule.do !== "") {
        if (rule.to !== "") {
          out.push(`    to: ${q(rule.to)}`);
        }

        out.push(`    do: ${rule.do}`);

        if (rule.apply !== "") {
          out.push(`    apply: ${rule.apply}`);
        }

        if (rule.delta !== null) {
          out.push(`    delta: ${rule.delta}`);
        }

        if (rule.value !== null) {
          out.push(`    value: ${rule.value}`);
        }

        if (rule.counter !== "") {
          out.push(`    counter: ${q(rule.counter)}`);
        }

        if (rule.marker !== "") {
          out.push(`    marker: ${q(rule.marker)}`);
        }

        if (rule.group !== "") {
          out.push(`    group: ${q(rule.group)}`);
          out.push(`    set: ${rule.set}`);
        }

        if ((rule.phase ?? "") !== "") {
          out.push(`    phase: ${rule.phase}`);
        }

        if (rule.do === "audit" || rule.do === "archive") {
          out.push(`    set: ${rule.set}`);

          if (rule.set === "on") {
            if (rule.do === "archive" && rule.ttlS > 0) {
              out.push(`    ttl: ${q(duration(rule.ttlS))}`);
            }

            /* Исход -- множеством: пустой пишется отсутствием ключа. */
            if (rule.do === "archive" && rule.when.length > 0) {
              out.push(`    when: ${seq(rule.when)}`);
            }

            for (const name of RECORD_OBJECTS) {
              const spec = rule[name];

              if (spec !== null) {
                out.push(`    ${name}: ${recordObjectYaml(spec)}`);
              }
            }
          }
        }
      }

      if (rule.list !== "") {
        out.push(`    list: ${q(rule.list)}`);
        out.push(`    write: ${rule.write}`);
        out.push(`    ttl: ${q(duration(rule.ttlS))}`);
      }

      if (rule.charge !== "") {
        out.push(`    charge: ${rule.charge}`);
        out.push(`    percent: ${rule.percent}`);
      }

      if (rule.code !== "") {
        out.push(`    code: ${q(rule.code)}`);
      }
    }

    out.push("");
  }

  out.push("gate:");
  out.push(`  redirect_methods: ${seq(doc.gate.redirectMethods)}`);
  out.push(`  redirect_status: ${doc.gate.redirectStatus}`);
  out.push(`  deny_response: ${q(doc.gate.denyResponse)}`);
  out.push(`  html_only: ${doc.gate.htmlOnly}`);

  // Виджет на месте печатается только когда его просили: выключенный режим --
  // обычный профиль с редиректом.
  if (doc.gate.inline) {
    out.push("  inline: true");
  }

  out.push("");

  const refBlock = (key: string, ref: CaptchaProviderRef): void => {
    out.push(`${key}:`);
    out.push(`  kind: ${ref.kind}`);

    if (ref.kind === "image") {
      out.push(`  length: ${ref.length}`);
      out.push(`  audio: ${ref.audio}`);
    }

    out.push("");
  };

  refBlock("provider", doc.provider);

  if (doc.fallback !== null) {
    refBlock("fallback", doc.fallback);
  }

  const used = new Set(refsOf(doc).map((p) => p.kind));

  out.push("provider_config:");
  out.push("  image:");
  out.push(`    alphabet: ${q(doc.providerConfig.image.alphabet)}`);

  if (doc.providerConfig.image.languages.length > 0) {
    out.push(`    languages: ${seq(doc.providerConfig.image.languages)}`);
  }

  if (doc.providerConfig.image.audioDir !== "") {
    out.push(`    audio_dir: ${q(doc.providerConfig.image.audioDir)}`);
  }

  /* Внешний провайдер печатается только когда он в списке: секция без
   * sitekey иначе не прошла бы проверку инспектора. */
  for (const kind of ["turnstile", "recaptcha", "hcaptcha", "smartcaptcha"] as const) {
    if (used.has(kind)) {
      externalBlock(out, kind, doc.providerConfig[kind]);
    }
  }

  out.push("");

  out.push("challenge:");
  out.push(`  cookie: ${q(doc.challenge.cookie)}`);
  out.push(`  ttl: ${q(duration(doc.challenge.ttlS))}`);
  out.push("");

  out.push("clearance:");
  out.push(`  cookie: ${q(doc.clearance.cookie)}`);
  out.push(`  id_cookie: ${q(doc.clearance.idCookie)}`);
  out.push(`  ttl: ${q(duration(doc.clearance.ttlS))}`);
  out.push(`  bind: ${seq(doc.clearance.bind)}`);
  out.push(`  subnet: { v4: ${doc.clearance.subnet.v4}, v6: ${doc.clearance.subnet.v6} }`);

  // Список живых клиренсов -- истина капчи; без списка строки не печатаются,
  // и процесс живёт по одной подписи.
  if (doc.clearance.list !== "") {
    out.push(`  list: ${q(doc.clearance.list)}`);

    if (doc.clearance.graceS > 0) {
      out.push(`  grace: ${q(duration(doc.clearance.graceS))}`);
    }
  }

  out.push("");

  out.push("fingerprint:");
  out.push(`  collect: ${doc.fingerprint.collect}`);
  out.push(`  canvas: ${doc.fingerprint.canvas}`);
  out.push(`  farm_at: ${doc.fingerprint.farmAt}`);
  out.push(`  window: ${q(duration(doc.fingerprint.windowS))}`);
  out.push("");

  out.push("limits:");
  out.push(`  issue_per_subnet: ${q(doc.limits.issuePerSubnet || "0")}`);
  out.push(`  verify_per_subnet: ${q(doc.limits.verifyPerSubnet || "0")}`);
  out.push(`  pending_max: ${doc.limits.pendingMax}`);
  out.push(`  provider_budget: ${q(doc.limits.providerBudget || "0")}`);
  out.push("");

  out.push("upstream:");
  out.push(`  header: ${q(doc.upstream.header)}`);
  out.push("");

  out.push("roster:");
  out.push(`  store: ${doc.roster.store}`);
  out.push(`  prefix: ${q(doc.roster.prefix)}`);
  out.push(`  revoke_refresh: ${q(`${doc.roster.revokeRefreshMs}ms`)}`);
  out.push("");

  out.push(`languages: ${seq(doc.languages)}`);
  out.push("");

  return out.join("\n");
}
