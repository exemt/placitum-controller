/**
 * Профиль инспектора куки: выдать куку, снять куку и рассказать об этом
 * соседям каналом docs/inspector-actions.md. Вердикта у процесса нет, он
 * всегда отвечает allow.
 *
 * Документ в два уровня, как у загрузчика. `cookies` -- объявления: что это
 * за кука, чем заполняется её значение и чем оно подписывается. `rules` --
 * когда её выдать или снять и о чём при этом рассказать. Условия, признаки
 * запроса и форма просьбы -- те же, что у инспектора действий, и берутся
 * оттуда же, а не переписываются рядом.
 *
 * Форма документа повторяет YAML загрузчика
 * (inspectors/cookie/internal/policy/policy.go, cookie.go): расхождение между
 * ними -- не стиль, а поколение, которое инспектор отвергнет как apply_failed.
 */

import type {
  ActionAsk,
  ActionClause,
  ActionCondition,
  ActionMatch,
  ActionWrite,
} from "./action-profile.ts";

export type { ActionAsk, ActionClause, ActionCondition, ActionMatch };

/**
 * Кого писать в набор. Четыре вида -- общие у всех отправителей; пятый есть
 * только здесь: `cookie` кладёт в набор значение самой куки, а не адрес, с
 * которого её предъявили. Ради него набор и заводят -- край сверяет значение
 * быстрым путём (`waf_local_check <набор> $waf_request_cookies.<имя>`).
 */
export type CookieWrite = ActionWrite | "cookie";

/** Положить в набор либо снять из него: у снятия срока нет. */
export type CookieListOp = "add" | "remove";

/**
 * Состояние куки на входе, с которым сверяется правило. `absent` вместе с
 * выдачей -- это «первое касание»: кука достаётся только тому, у кого её нет.
 * `invalid` и `expired` бывают лишь у подписанной: без подписи предъявленное
 * значение не с чем сверить, а времени выдачи в нём нет.
 */
export const COOKIE_STATES = ["absent", "present", "invalid", "expired"] as const;

export type CookieState = (typeof COOKIE_STATES)[number];

/** Чем подписывается значение. `none` снимает состояния invalid и expired. */
export const COOKIE_SIGNS = ["hmac", "none"] as const;

export type CookieSign = (typeof COOKIE_SIGNS)[number];

/** Фаза правила; пусто -- обе. */
export const COOKIE_PHASES = ["request", "response"] as const;

export type CookiePhase = (typeof COOKIE_PHASES)[number];

/** Чем заполнить значение при выдаче. */
export interface CookieValue {
  /** Откуда взять метку: операнд условий (`$arg_utm_source`); пусто -- нет. */
  from: string;
  /** Источника нет либо он пуст -- эта метка. */
  default: string;
  /** Случайный хвост, байт; 0 -- без него. */
  random: number;
  /** Предел метки до сборки значения. */
  maxLen: number;
}

/**
 * Объявление куки. Secure, HttpOnly и SameSite здесь не живут: их форсирует
 * `waf_cookie_defaults` маршрута, а присланное с провода модуль выбрасывает.
 * Домена нет по той же причине -- кука остаётся host-only.
 */
export interface CookieDecl {
  name: string;
  path: string;
  /** Срок в секундах; 0 -- кука сессии, Max-Age не едет. */
  maxAgeS: number;
  /** Возраст, после которого состояние -- expired; 0 -- состояния нет. */
  renewAfterS: number;
  sign: CookieSign;
  value: CookieValue;
}

/**
 * Строка правила: просьба соседу -- та же форма, что у инспектора действий --
 * либо запись в живой набор (непустой `list`). У записи добавились две вещи:
 * `op` (положить или снять) и `cookie` -- чьё значение писать при
 * `write: cookie`; пусто -- кука самого правила.
 */
export interface CookieAsk extends Omit<ActionAsk, "write"> {
  write: CookieWrite;
  op: CookieListOp;
  cookie: string;
}

export interface CookieRule {
  /** Имя живёт в логе и аудите, на провод не едет. */
  name: string;
  match: ActionMatch;
  /** Фаза правила; пусто -- обе. */
  phase: CookiePhase | "";
  /** Коды ответа апстрима; только фаза ответа, пусто -- любой. */
  status: number[];
  /** Состояние куки на входе; пусто -- любое. */
  on: CookieState | "overload" | "";
  /** Только у on: overload: порог заполнения очереди в процентах; пусто -- край. */
  at?: number | null;
  /** Чьё состояние смотреть; у правила с операцией -- она же. */
  cookie: string;
  /** Операция: имя объявленной куки. Одно из двух, не оба. */
  issue: string;
  drop: string;
  /** Имя условия профиля; пусто -- правило всегда. */
  cond: string;
  /** Действия едут, когда условие ложно (`unless:` у загрузчика). */
  negate: boolean;
  actions: CookieAsk[];
}

export interface CookieProfileDoc {
  description: string;
  cookies: CookieDecl[];
  conditions: ActionCondition[];
  rules: CookieRule[];
}

export interface CookieProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: CookieProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
