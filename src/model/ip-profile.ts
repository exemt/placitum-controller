import type { RecordObject } from "./actions.ts";
import type { Uuid } from "./id.ts";

/** Объекты просьбы записи: каждый со своей стороной, пределом и источником. */
export interface AskObjects {
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
}

export const emptyAskObjects = (): AskObjects => ({
  headers: null,
  args: null,
  body: null,
});

export const IP_COUNTRY_TYPES = ["v4", "v6"] as const;

export type IpCountryType = (typeof IP_COUNTRY_TYPES)[number];

export function isIpCountryType(value: string): value is IpCountryType {
  return (IP_COUNTRY_TYPES as readonly string[]).includes(value);
}

/**
 * Набор гео: код страны + семейство + таблица префиксов.
 */
export interface IpCountry {
  id: Uuid;
  httpSpaceId: Uuid;
  code: string;
  type: IpCountryType;
  description: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpCountryAddress {
  id: Uuid;
  countryId: Uuid;
  address: string;
}

export const IP_ASN_TYPES = IP_COUNTRY_TYPES;

export type IpAsnType = IpCountryType;

export function isIpAsnType(value: string): value is IpAsnType {
  return isIpCountryType(value);
}

/**
 * Набор ASN: номер + семейство + таблица префиксов.
 */
export interface IpAsn {
  id: Uuid;
  httpSpaceId: Uuid;
  asn: number;
  type: IpAsnType;
  description: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpAsnAddress {
  id: Uuid;
  asnId: Uuid;
  address: string;
}

/**
 * Список внутри составного набора. Тип и признак active едут вместе с именем:
 * панель показывает "живой" на строке набора, а компилятор по нему решает,
 * класть в пак состав или ссылку.
 */
export interface IpSetList {
  datasetId: Uuid;
  name: string;
  type: string;
  active: boolean;
}

export interface IpSetMatch {
  lists: IpSetList[];
  countries: string[];
  asns: number[];
}

/**
 * Составной набор адреса: выражение над сырьём. Решения не выносит -- он
 * отвечает только на вопрос "кто это". `exclude` вычитается из объединения
 * блоков, `inverse` применяется после вычитания.
 */
export interface IpSet extends IpSetMatch {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  inverse: boolean;
  exclude: IpSetMatch;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpSetMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  lists: number;
  /** Хотя бы один включённый список active: состав такого набора едет шиной. */
  live: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const IP_RULE_ACTIONS = ["allow", "deny", "request", "list"] as const;

export type IpRuleAction = (typeof IP_RULE_ACTIONS)[number];

export function isIpRuleAction(value: string): value is IpRuleAction {
  return (IP_RULE_ACTIONS as readonly string[]).includes(value);
}

/**
 * Терминальные действия дают вердикт и заканчивают проход по правилам. Они же
 * отвечают, про что строка спрашивает: терминальная -- про составной набор
 * (выражение над сырьём), накопительная -- про сырой список (состав).
 * Третьего рода условия у правила нет.
 */
export function isTerminalAction(action: IpRuleAction): boolean {
  return action === "allow" || action === "deny";
}

/*
 * Своего словаря глаголов и осей здесь нет и быть не должно. Он один на канал
 * -- `ACTIONS` в model/actions.ts, -- а проверяет форму просьбы общий
 * валидатор `checkAsk` (model/action-ask.ts), тот же, что у остальных
 * отправителей. Копия, лежавшая тут раньше, отстала от реестра на пять
 * глаголов, и панель предлагала строку, которую этот же контроллер потом
 * отвергал.
 */

/**
 * Правило профиля: набор и что с ним делать. Порядок задаёт оператор, решение
 * выносит первое совпадение с терминальным действием.
 */
export interface IpRule {
  id: Uuid;
  position: number;
  /** Условие терминальной строки: составной набор. У накопительной null. */
  setId: Uuid | null;
  setName: string;
  /** Условие накопительной строки: сырой список. У терминальной null. */
  datasetId: Uuid | null;
  datasetName: string;
  /**
   * Условие наоборот: строка срабатывает, когда адрес в список не попал.
   * Только у накопительных действий (request, list): терминальному промаху
   * нечем объясниться -- ни находки, ни публичной причины у него нет.
   */
  not: boolean;
  action: IpRuleAction;

  /** deny: запись каталога отказов. */
  response: string;
  /** Повод: у deny едет в reason.code, у request -- в действие. */
  code: string;

  /** request: адресат, глагол, ось и параметры. */
  to: string;
  verb: string;
  axis: string;
  delta: number | null;
  value: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** mark: метка события на записи, обязательна. */
  marker: string;
  /** mutate: группа модификаторов получателя, обязательна; куда -- askSet. */
  askGroup: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  askPhase?: string;
  /**
   * Просьба записи (audit, archive): сторона -- писать или нет. Срок, исходы и
   * объекты -- только у archive с side on. Поля общие с остальными
   * отправителями канала, см. model/action-ask.ts.
   */
  askSet: string;
  askTtlS: number;
  askWhen: string[];
  askObjects: AskObjects;

  /** list: куда, кого и на сколько вносить. */
  listDatasetId: Uuid | null;
  listName: string;
  listTtlS: number;
  listWrite: IpWrite;

  enabled: boolean;
}

/**
 * Кого строка пишет в набор: адрес клиента; эффективный анонс, самый узкий
 * (net); все анонсы, накрывающие адрес (net_all); систему целиком (asn) --
 * те же слова, что у остальных отправителей канала. Подсеть и систему
 * инспектор берёт у кодера гео и пишет одной пачкой.
 */
export const IP_WRITES = ["addr", "net", "net_all", "asn"] as const;

export type IpWrite = (typeof IP_WRITES)[number];

export function isIpWrite(value: string): value is IpWrite {
  return (IP_WRITES as readonly string[]).includes(value);
}

/**
 * Где оказался адрес -- условие строки по исходу. Слова про списки, а не про
 * вердикт: `allow` бывает и белым списком, и строкой «иначе», а это разные
 * строки профиля. Чёрный список решает двумя действиями -- отказом и счётом,
 * -- и для строки по исходу это один случай: адрес нашёлся там, где ищут.
 *
 * `overload` из этого ряда выпадает: он про инспектора, а не про адрес. Порог
 * `at` -- заполнение очереди в процентах в тот миг, когда запрос в неё встал.
 * Ниже порога строка молчит; от порога и до края инспектор **проверяет как
 * обычно** и вдобавок высказывает просьбу -- запрос при этом живёт и получает
 * настоящий вердикт. На краю (очередь полна, запрос сброшен) вердикта нет
 * вовсе, и просьба уезжает рядом с `verdict: error`; что делать с самим
 * запросом, решает `waf_exception … overload` маршрута.
 */
export const IP_OUTCOME_ONS = ["white", "black", "none", "overload"] as const;

export type IpOutcomeOn = (typeof IP_OUTCOME_ONS)[number];

export function isIpOutcomeOn(value: string): value is IpOutcomeOn {
  return (IP_OUTCOME_ONS as readonly string[]).includes(value);
}

/**
 * Инициатор по исходу: то, где нашёлся адрес, вносит его в живой набор или
 * рассказывает соседям. Условие -- само место, а не набор: банить по чёрному
 * списку можно, не повторяя его предпосылки второй строкой. Строка «иначе»
 * дёргает только инициаторы с `on: none`.
 */
export interface IpOutcome {
  /** white | black | none | overload. */
  on: IpOutcomeOn;

  /**
   * Только у `overload`: с какого заполнения очереди строка срабатывает,
   * 25..100 процентов. Сотня -- только край (запрос сброшен), и это умолчание:
   * строка без порога ведёт себя как раньше. Ноль запрещён намеренно --
   * строка, срабатывающая на любой непустой очереди, срабатывает всегда, а
   * «всегда» это не триггер.
   */
  at: number;

  /**
   * Действие -- то же, что у строк по наборам: просьба соседу (verb непустой)
   * либо запись адреса в живой набор (list непустой). Ровно одно из двух.
   * У deny просьбы не бывает: отказ обрывает фазу, доехать ей некуда.
   */
  to: string;
  verb: string;
  axis: string;
  delta: number | null;
  value: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** mark: метка события на записи, обязательна. */
  marker: string;
  /** mutate: группа модификаторов получателя, обязательна; куда -- askSet. */
  askGroup: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  askPhase?: string;
  /**
   * Просьба записи (audit, archive): сторона -- писать или нет. Срок, исходы и
   * объекты -- только у archive с side on. Поля общие с остальными
   * отправителями канала, см. model/action-ask.ts.
   */
  askSet: string;
  askTtlS: number;
  askWhen: string[];
  askObjects: AskObjects;

  /** uuid живого набора (при действии-записи). */
  list: Uuid;
  listName?: string;
  ttlS: number;
  /** Кого писать; строка, записанная до поля, пишет адрес. */
  write?: IpWrite;

  /** Повод; пусто -- код решения. */
  code: string;
}

/**
 * Чем закрывается профиль, в котором не совпал ни один список. Счёта здесь
 * нет: вердикт у инспектора адреса один из двух, и оператор выбирает его явно.
 */
export const IP_DEFAULT_ACTIONS = ["allow", "deny"] as const;

export type IpDefaultAction = (typeof IP_DEFAULT_ACTIONS)[number];

export function isIpDefaultAction(value: string): value is IpDefaultAction {
  return (IP_DEFAULT_ACTIONS as readonly string[]).includes(value);
}

/**
 * Профиль инспектора адреса. Имя уходит в `waf_inspector … profile=`.
 * Своих адресов у профиля нет: он ссылается на составные наборы и говорит про
 * каждый, что тот значит.
 */
export interface IpProfile {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  rules: IpRule[];
  /**
   * Сырые списки, которые профиль просит упаковать. Логики не несут: их
   * только везут -- на ноду едет отобранное, а не всё пространство. Условие
   * накопительной строки выбирается из них.
   */
  datasets: IpProfileDataset[];
  outcomes: IpOutcome[];
  defaultAction: IpDefaultAction;
  defaultCode: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Объявленный список: сам датасет плюс то, что о нём нужно знать форме. */
export interface IpProfileDataset {
  id: Uuid;
  name: string;
  /** Активный: состав едет шиной от keeper, тела в паке нет. */
  active: boolean;
}

export interface IpProfileMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  rules: number;
  createdAt: Date;
  updatedAt: Date;
}
