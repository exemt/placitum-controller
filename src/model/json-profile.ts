/*
 * Профиль контракта API (inspectors/json).
 *
 * Документ повторяет форму profile.yaml инспектора один в один, кроме двух
 * мест. Первое: ссылка на спецификацию здесь -- uuid объекта содержимого, а в
 * YAML -- его имя; манифест переводит одно в другое, потому что на ноде файл
 * называется по имени, а переименование объекта не должно ломать профиль.
 * Второе: размеры здесь числом байт, в YAML -- человеческой записью ("1m").
 *
 * Фазы описаны двумя секциями и независимы: у каждой свой набор проверок и
 * свои политики. Разные типы, а не один общий -- ровно затем, чтобы `status` в
 * секции запроса нельзя было записать; см. docs/README.md репозитория json.
 */

export type JsonSchemaKind = "openapi" | "jsonschema";
export type JsonAction = "deny" | "score" | "allow";
export type JsonMatch = "exact" | "prefix";
export type JsonAuditValues = "off" | "hash";

export interface JsonSchemaRef {
  kind: JsonSchemaKind;
  /** uuid файла со спецификацией; пусто -- схема выбирается только привязками. */
  source: string;
  /**
   * Префикс маршрута, срезаемый с URI перед сопоставлением со спекой. Префиксы
   * из `servers[]` самого документа срезаются всегда и настройки не требуют.
   */
  basePath: string;
}

export interface JsonRequestChecks {
  body: boolean;
  query: boolean;
  pathParams: boolean;
  headers: boolean;
}

export interface JsonResponseChecks {
  body: boolean;
  status: boolean;
  contentType: boolean;
}

/**
 * Правило исхода: что делать и сколько добавить.
 *
 * Действие и счёт живут парой намеренно. Один счёт на фазу означал, что
 * «ответ не по спеке» и «код ответа не описан» весят одинаково, даже когда
 * оператор считает иначе. Счёт читается только при `score`.
 */
export interface JsonRule {
  action: JsonAction;
  score: number;
}

/** Исходы, у которых есть строка политики. Порядок -- порядок показа. */
export const JSON_REQUEST_OUTCOMES = [
  "invalid",
  "unparsable",
  "truncated",
  "unknown_operation",
  "content_type",
  "unavailable",
] as const;

export const JSON_RESPONSE_OUTCOMES = [
  ...JSON_REQUEST_OUTCOMES,
  "status",
] as const;

export type JsonRequestOutcome = (typeof JSON_REQUEST_OUTCOMES)[number];
export type JsonResponseOutcome = (typeof JSON_RESPONSE_OUTCOMES)[number];

export type JsonRequestPolicy = Record<JsonRequestOutcome, JsonRule>;
export type JsonResponsePolicy = Record<JsonResponseOutcome, JsonRule>;

export interface JsonRequestPhase {
  enabled: boolean;
  checks: JsonRequestChecks;
  policy: JsonRequestPolicy;
  /** Одна запись каталога на фазу: клиент видит код, а не исход. */
  denyResponse: string;
  /** Инициаторы по исходу этой фазы. */
  outcomes: JsonOutcome[];
}

export interface JsonResponsePhase {
  enabled: boolean;
  checks: JsonResponseChecks;
  policy: JsonResponsePolicy;
  /** Типы тела, которые вообще разбираются. Суффикс "+json" -- подстрока. */
  onlyTypes: string[];
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonBinding {
  methods: string[];
  path: string;
  match: JsonMatch;
  /** uuid объекта содержимого со схемой тела. */
  schema: string;
}

/*
 * Кадры WebSocket: третья независимая проверка (docs/README.md репозитория json,
 * «Кадры WebSocket»). У сообщения сокета нет ни метода, ни операции, поэтому
 * схема выбирается по направлению и по типу сообщения -- дискриминатору в
 * теле. Политики свои у каждого направления: отказ на c2s -- Close до
 * приложения, отказ на s2c рвёт живую сессию.
 */
export type JsonDirection = "c2s" | "s2c" | "any";

export interface JsonDiscriminator {
  /** JSON pointer до поля: /type. */
  pointer: string;
  /** Значение строкой: числа и булевы -- своей записью. */
  value: string;
}

export interface JsonFrameBinding {
  /** URI рукопожатия. */
  path: string;
  match: JsonMatch;
  direction: JsonDirection;
  /** Пусто -- любой подпротокол. */
  subprotocol: string;
  /** null -- одна схема на всё направление. */
  discriminator: JsonDiscriminator | null;
  /** uuid объекта содержимого со схемой сообщения. */
  schema: string;
}

/** Исходы направления: как у запроса, только вместо типа тела -- опкод. */
export const JSON_FRAME_OUTCOMES = [
  "invalid",
  "unparsable",
  "truncated",
  "unknown_operation",
  "opcode",
  "unavailable",
] as const;

export type JsonFrameOutcome = (typeof JSON_FRAME_OUTCOMES)[number];
export type JsonFramePolicy = Record<JsonFrameOutcome, JsonRule>;

export interface JsonFrameChecks {
  body: boolean;
}

export interface JsonFrameDirection {
  checks: JsonFrameChecks;
  policy: JsonFramePolicy;
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonFramePhase {
  enabled: boolean;
  bindings: JsonFrameBinding[];
  c2s: JsonFrameDirection;
  s2c: JsonFrameDirection;
}

export interface JsonLimits {
  /** Байты: тело крупнее не разбирается, исход -- как у усечённого. */
  maxBody: number;
  maxDepth: number;
  maxErrors: number;
  cache: number;
}

export interface JsonAudit {
  values: JsonAuditValues;
  paths: boolean;
}

/**
 * Глаголы, которые инспектор контракта умеет применять: коэффициент к
 * отдаваемому счёту и пропуск запроса. Остальной словарь ему не адресован.
 */
export type JsonVerb = "threshold" | "skip";

/**
 * Что профиль принимает от соседа. Единственное место, где чужое высказывание
 * что-то значит: без правила действие не применяется вовсе.
 * Форма и ограничения -- docs/inspector-actions.md.
 */
export interface JsonPriorRule {
  /** Имя отправителя. `*` не принимается: оба глагола умеют ослаблять. */
  from: string;
  accept: JsonVerb[];
  /** Ограничить правило поводами. Пусто -- любой повод. */
  codes: string[];
}

export interface JsonTrigger {
  prior: JsonPriorRule[];
}

/** Триггер инициатора: собственный решённый вердикт фазы. */
export type JsonOn = "deny" | "allow" | "score";

/**
 * Инициатор по исходу: «когда → что сделать». Условие -- само решение фазы, а
 * не его предпосылки: повторённые второй строкой, они разъехались бы с
 * политикой на первой правке.
 *
 * Действие ровно одно: просьба соседу (непустой `do`) либо запись адреса
 * клиента в живой набор (непустой `list`). На `deny` просьб не бывает --
 * отказ обрывает фазу, доехать ей некуда.
 */
import type { ArchiveWhen, RecordObject } from "./actions.ts";

/**
 * Кого писать в набор: адрес; эффективный анонс, самый узкий (net); все
 * анонсы, накрывающие адрес, включая чужие широкие (net_all); систему целиком,
 * все её анонсы (asn). Подсеть и систему разворачивает инспектор у кодера гео.
 */
export type JsonWrite = "addr" | "net" | "net_all" | "asn";

export interface JsonOutcome {
  on: JsonOn;
  /** Порог сравнения счёта; только при `on: score`, и там обязателен. */
  at: number | null;
  /** Сравнивать вниз: score < at вместо score >= at. */
  below: boolean;
  /** Точное сравнение: score == at. С below взаимоисключимы. */
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
  write: JsonWrite;
  ttlS: number;

  /** Повод; пусто -- код решения (JSON_*). */
  code: string;
}

export interface JsonProfileDoc {
  trigger: JsonTrigger;
  description: string;
  schema: JsonSchemaRef;
  request: JsonRequestPhase;
  response: JsonResponsePhase;
  frame: JsonFramePhase;
  bindings: JsonBinding[];
  limits: JsonLimits;
  audit: JsonAudit;
}

export interface JsonProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  kind: JsonSchemaKind;
  source: string;
  doc: JsonProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
