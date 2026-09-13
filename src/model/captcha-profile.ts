/*
 * Профиль капчи (inspectors/captcha).
 *
 * Документ повторяет форму profile.yaml инспектора один в один, кроме сроков:
 * в YAML они человеческие ("24h"), здесь -- секунды. Лимиты остаются строками
 * "30/m": у них свой разбор и в Go, и здесь, а число с единицей в двух полях
 * читалось бы хуже.
 *
 * Секретов здесь нет: секрет внешнего провайдера -- ссылка на store-объект,
 * зашифрованный в браузере ключом контура; контроллер его не открывает.
 */

import type { ArchiveWhen, RecordObject } from "./actions.ts";

export type CaptchaWhen = "always" | "buckets" | "never";
export type CaptchaMatch = "exact" | "prefix";
/** PoW умер: он доказывал вычисление, а не человечность; темп держат корзины.
 * В старых документах `pow` мигрирует в `image` при normalize. */
export type CaptchaProviderKind =
  | "image"
  | "turnstile"
  | "recaptcha"
  | "hcaptcha"
  | "smartcaptcha";
export type CaptchaOnError = "fallback" | "allow" | "deny";

/** Глаголы, которые капча умеет применять. `reauth` адресован не ей;
 * `threshold` умер вместе со счётом-триггером: масштабировать нечего. */
export type CaptchaVerb = "challenge" | "skip" | "note";
/** Пункт accept: глагол либо `*` -- все четыре. */
export type CaptchaAccept = CaptchaVerb | "*";

/**
 * Что профиль принимает от соседа. Единственное место, где чужое высказывание
 * что-то значит: без правила действие не применяется вовсе. Потолков и фильтра
 * осей больше нет: границы держат загрузчик отправителя и ёмкость корзины
 * (docs/buckets.md репозитория captcha).
 */
export interface CaptchaPriorRule {
  /** Имя отправителя; `*` -- любой (тогда только challenge). */
  from: string;
  accept: CaptchaAccept[];
  /** Ограничить правило поводами. Пусто -- любой повод. */
  codes: string[];
}

export interface CaptchaTrigger {
  when: CaptchaWhen;
  prior: CaptchaPriorRule[];
}

/** Корзина общего счёта: ёмкость, потери и свои пороги. max 0 -- выключена. */
export interface CaptchaBucketTier {
  max: number;
  /** Процентов ёмкости в секунду. */
  loss: number;
  /** % заполнения -- на виджет; 0 -- считает, но не гонит. */
  captchaAt: number;
  /** % заполнения -- правила on: bucket_ban; 0 -- не срабатывает. */
  banAt: number;
}

/**
 * Корзины (docs/buckets.md репозитория captcha): общий счёт субъектов на
 * контурном Redis. Наполняют соседи просьбами note, проценты — от ёмкости;
 * пороги у каждой корзины свои.
 */
export interface CaptchaBuckets {
  ip: CaptchaBucketTier;
  sess: CaptchaBucketTier;
  asnNet: CaptchaBucketTier;
  asnRouter: CaptchaBucketTier;
}

/**
 * События правил: провал и прохождение виджета живут в HTTP-процессе, пороги
 * корзин и клиренс -- на волне инспектора, и только им доступны просьбы
 * соседям. cleared -- запрос клиента с действующим клиренсом: человек
 * проверен, и это единственное положительное, что капча может сказать соседям.
 * uncleared -- обратное: действующего клиренса нет, что бы лестница ни решила
 * дальше; им включают соседей дальше по цепочке.
 */
export type CaptchaOn =
  | "fail"
  | "pass"
  | "bucket_captcha"
  | "bucket_ban"
  | "cleared"
  | "uncleared"
  | "overload";

/** Решение лестницы -- уточнение правил uncleared и порогов; пусто -- любое. */
export type CaptchaNext = "" | "allow" | "challenge";
/** Что писать в набор: адрес, анонс, номер системы либо кука сессии. */
/**
 * Что писать в набор. `net` -- лайт: только эффективный (самый узкий) анонс,
 * тот же, по которому считаются корзины; `net_all` -- хард: все анонсы,
 * накрывающие адрес, включая широкие чужие; `asn` -- состав системы
 * эффективного анонса целиком, все её анонсы. Анонсы и состав капча берёт у
 * кодера в момент записи (docs/README.md репозитория captcha, «Запись в
 * набор: кого именно»).
 */
export type CaptchaWrite = "addr" | "net" | "net_all" | "asn" | "cid";

/**
 * Правило по событию: та же форма, что строки профиля адреса -- «когда → что
 * сделать». Действие ровно одно: заряд своей корзины, запись в набор либо
 * просьба соседу (только у событий волны -- порогов корзин и клиренса: fail и
 * pass случаются в HTTP-процессе, он не на волне). Жёсткой петли попыток и
 * банов больше нет -- всё здесь.
 */
export interface CaptchaEventRule {
  on: CaptchaOn;
  /** Только у on: overload: порог заполнения очереди в процентах; пусто -- край. */
  at?: number | null;
  /** У порогов корзин: какая корзина; пусто -- любая. */
  bucket: string;
  /**
   * У uncleared и порогов корзин: что лестница решила с клиентом на этом
   * запросе -- пропустила (allow) или потребовала проверку (challenge);
   * пусто -- любое решение.
   */
  next: CaptchaNext;

  /* Просьба соседу -- форма канала действий, общая с остальными отправителями. */
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** mark: метка события на записи, обязательна. */
  marker: string;
  /** mutate: какую группу модификаторов получателя переключить; оба поля обязательны. */
  group: string;
  /** Только управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** У mutate -- куда переключить группу; у audit / archive -- писать или нет. */
  set: "on" | "off" | "";
  /** Объекты просьбы записи (audit / archive с set on). */
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /** Только archive с set on: исходы маршрута, на которых просьбу исполнять. */
  when: ArchiveWhen[];

  /* Запись в набор: имя активного набора, срок, что писать. */
  list: string;
  ttlS: number;
  write: CaptchaWrite;

  /* Заряд своей корзины: вид и ±% ёмкости. */
  charge: string;
  percent: number;

  code: string;
}

/*
 * Путей API здесь больше нет: отказ телом вместо редиректа -- решение
 * раскладки маршрутов, а не список путей в профиле. На путь API вешают
 * профиль без методов редиректа.
 */
export interface CaptchaGate {
  redirectMethods: string[];
  redirectStatus: number;
  denyResponse: string;
  htmlOnly: boolean;
  /*
   * Виджет телом ответа вместо редиректа на него. false -- прежнее поведение
   * (30x на path). true -- навигационный запрос получает deny с записью
   * denyResponse, а страницу виджета инспектор кладёт в обменник и называет
   * модулю секцией rewrite: тот отдаёт её телом ответа на том же URI. Адрес
   * не меняется, промах редиректа по порту исчезает, записи каталога и
   * прокси-локации для этого не нужно.
   */
  inline: boolean;
}

export interface CaptchaProviderRef {
  kind: CaptchaProviderKind;
  length: number;
  audio: boolean;
}

export interface CaptchaExternalConfig {
  version: string;
  sitekey: string;
  secretEnv: string;
  secretStore: string | null;
  minScore: number;
  remoteip: boolean;
  timeoutS: number;
  onError: CaptchaOnError;
}

export interface CaptchaProviderConfig {
  image: { alphabet: string; languages: string[]; audioDir: string };
  turnstile: CaptchaExternalConfig;
  recaptcha: CaptchaExternalConfig;
  hcaptcha: CaptchaExternalConfig;
  smartcaptcha: CaptchaExternalConfig;
}

export interface CaptchaClearance {
  cookie: string;
  idCookie: string;
  ttlS: number;
  bind: string[];
  subnet: { v4: number; v6: number };
  /**
   * Активный список живых клиренсов -- истина капчи: выдача кладёт jti в
   * набор, инспектор сверяет его со своим зеркалом, удаление записи гасит
   * клиренс. Пустое имя -- списка нет, клиренс живёт одной подписью.
   */
  list: string;
  /** Окно на доезд записи через секвенсор, секунды. 0 -- умолчание процесса. */
  graceS: number;
}

export interface CaptchaFingerprint {
  collect: boolean;
  canvas: boolean;
  farmAt: number;
  windowS: number;
}

export interface CaptchaLimits {
  issuePerSubnet: string;
  verifyPerSubnet: string;
  pendingMax: number;
  providerBudget: string;
}

export interface CaptchaRoster {
  store: "redis" | "memory";
  prefix: string;
  revokeRefreshMs: number;
}

export interface CaptchaProfileDoc {
  path: string;
  title: string;
  note: string;
  /*
   * Своя страница -- uuid объекта раздела «Страницы». В profile.yaml не
   * печатается: едет файлом captcha.html рядом с профилем.
   */
  page: string;
  trigger: CaptchaTrigger;
  buckets: CaptchaBuckets;
  rules: CaptchaEventRule[];
  gate: CaptchaGate;
  /* Основной виджет и запасной (на случай «не загрузился / нет JS / лёг»). */
  provider: CaptchaProviderRef;
  fallback: CaptchaProviderRef | null;
  providerConfig: CaptchaProviderConfig;
  challenge: { cookie: string; ttlS: number };
  clearance: CaptchaClearance;
  fingerprint: CaptchaFingerprint;
  limits: CaptchaLimits;
  upstream: { header: string };
  roster: CaptchaRoster;
  languages: string[];
}

export interface CaptchaProfileMeta {
  id: string;
  httpSpaceId: string;
  serverId: string | null;
  name: string;
  description: string;
  when: CaptchaWhen;
  provider: CaptchaProviderKind;
  fallback: CaptchaProviderKind | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaptchaProfile extends CaptchaProfileMeta {
  doc: CaptchaProfileDoc;
}
