/**
 * Профиль инспектора действий: чистый отправитель канала
 * docs/inspector-actions.md. Правило -- признак запроса плюс список просьб:
 * соседям либо модулю (запись маршрута, очки в сумму фазы); вердикта у
 * процесса нет, он всегда отвечает allow.
 *
 * Форма документа повторяет YAML загрузчика
 * (inspectors/action/internal/policy/policy.go): расхождение между ними -- не
 * стиль, а поколение, которое инспектор отвергнет как apply_failed.
 */


import type { ArchiveWhen, RecordObject } from "./actions.ts";
import type { ActionCondOp } from "./action-cond.ts";

/**
 * Кого писать в набор: адрес клиента; эффективный анонс, самый узкий (net);
 * все анонсы, накрывающие адрес, включая чужие широкие (net_all); систему
 * целиком, все её анонсы (asn). Подсеть и систему разворачивает инспектор у
 * кодера гео и пишет одной пачкой.
 */
export type ActionWrite = "addr" | "net" | "net_all" | "asn";

/**
 * Строка правила: просьба соседу -- та же форма, что на проводе канала, --
 * либо запись в живой набор (непустой `list`). У записи нет ни адресата, ни
 * глагола, ни оси: пишет сам инспектор, срок -- тот же `ttlS`.
 */
export interface ActionAsk {
  /** Адресат обязателен: широковещательных правил у этого инспектора нет. */
  to: string;
  do: string;
  apply: string;
  /** Только threshold: проценты коэффициента, −100..900. */
  delta: number | null;
  /** Только note: проценты шкалы счётчика получателя, −100..100. */
  value: number | null;
  /** Только note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /**
   * Только mark, обязательно: метка события. Произвольная строка оператора;
   * модуль кладёт её в маркеры записи, по которым события ищут и группируют.
   */
  marker: string;
  /** Только mutate, оба обязательны: какую группу модификаторов получателя переключить и куда. */
  group: string;
  /** Только управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** У mutate -- куда переключить группу; у audit / archive -- писать или нет. */
  set: "on" | "off" | "";
  /**
   * Глаголы записи (audit, archive): set -- писать или нет; objects и limit --
   * только у archive с set on: какие объекты оставить агенту и сколько байт.
   * Срок архива -- тот же ttlS, что у записи в набор: у строки либо просьба,
   * либо запись.
   */
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /**
   * Только archive с set on: на каких исходах маршрута просьбу исполнять --
   * как when= директивы. Пусто -- на любом, включая перенаправление: просьба
   * сильнее when= маршрута, о котором отправитель не знает.
   */
  when: ArchiveWhen[];
  /**
   * Срок в секундах: у archive с set on -- срок архива (0 -- как на
   * маршруте), у записи в набор -- срок записи, обязателен.
   */
  ttlS: number;
  /** Запись в набор: имя активного списка; пусто -- строка это просьба. */
  list: string;
  /** Кого писать; у просьбы не значит ничего. */
  write: ActionWrite;
  code: string;
}

/** Признаки запроса. Все заданные блоки обязаны совпасть (И); пустой match
 * совпадает со всяким запросом: профиль и так выбран маршрутом. */
export interface ActionMatch {
  pathPrefix: string;
  suffixes: string[];
  /** Плюс встроенный список расширений статики. */
  static: boolean;
  methods: string[];
}

/**
 * Строка условия: значение из запроса против набора либо текста. Строки
 * условия складываются по И. Запись значения -- как у условий вызова на
 * маршруте, разбор в model/action-cond.ts.
 */
export interface ActionClause {
  value: string;
  op: ActionCondOp;
  /** Только in / not_in: имя активного набора пространства. */
  dataset: string;
  /** Только eq / ne: образец, побайтно. */
  text: string;
  /**
   * Только is / is_not: имя другого условия профиля -- строка истинна, когда
   * то условие истинно (ложно). Так И внутри ИЛИ и любая глубина набираются
   * плоскими именованными условиями. Циклы не проходят проверку.
   */
  cond: string;
}

/** Именованное условие профиля; правила ссылаются на него по имени. */
export interface ActionCondition {
  name: string;
  /** Строки по ИЛИ (`any` у загрузчика); false -- по И (`all`). */
  any: boolean;
  rows: ActionClause[];
}

export interface ActionRule {
  /** Имя живёт в логе и аудите, на провод не едет. */
  name: string;
  /**
   * Строка перегрузки: on: overload и порог заполнения очереди в процентах.
   * Пусто -- правило по совпадению запроса.
   */
  on?: "" | "overload";
  at?: number | null;
  match: ActionMatch;
  /** Имя условия профиля; пусто -- правило всегда. */
  cond: string;
  /** Действия едут, когда условие ложно (`unless:` у загрузчика). */
  negate: boolean;
  actions: ActionAsk[];
}

export interface ActionProfileDoc {
  description: string;
  conditions: ActionCondition[];
  rules: ActionRule[];
}

export interface ActionProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: ActionProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
