/**
 * Профиль инспектора rewrite: модификация ответов. Профиль отвечает на четыре
 * вопроса политики:
 *
 *   - режим: править, наблюдать или молчать (`mode`);
 *   - что менять: группы модификаторов -- regex по телу и операции над
 *     заголовками, с условиями по коду ответа и типу содержимого (`groups`);
 *   - кого слушать: правила приёма просьб `mutate` / `skip` канала действий,
 *     тумблеры групп на запрос (`prior`);
 *   - какой записью каталога отказывать, когда подмена решена, но состояться
 *     не может (`denyResponse`): сам отказ безусловен -- отдать оригинал молча
 *     значит слить ровно то, что маскировали. Сбоем на стороне модуля
 *     (подъёмом объекта) распоряжается исключение фазы waf_exception ... body,
 *     и профиль его не переопределяет.
 *
 * Форма документа повторяет YAML загрузчика
 * (inspectors/rewrite/internal/config/profile.go): расхождение между ними --
 * не стиль, а поколение, которое инспектор отвергнет как apply_failed.
 * Выражения исполняет только Go-процесс (RE2); до nginx не доезжает ни одно.
 */


export type RewriteBodyOpKind =
  | "remove"
  | "replace"
  | "insert_before"
  | "insert_after";

export interface RewriteBodyOp {
  op: RewriteBodyOpKind;
  pattern: string;
  /** Шаблон замены у replace, $1..$9 по правилам regexp.Expand. */
  to: string;
  /** Литеральная вставка у insert_before / insert_after. */
  text: string;
  /** Потолок совпадений; null -- умолчание загрузчика (256). */
  maxMatches: number | null;
}

export interface RewriteHeaderOp {
  op: "set" | "unset";
  name: string;
  value: string;
}

/** Где применяется группа: тело ответа приложения или полезная нагрузка
 * кадра WebSocket (в любую сторону). */
export type RewriteGroupOn = "response" | "frame";

export const REWRITE_DIRECTIONS = ["c2s", "s2c"] as const;
export const REWRITE_OPCODES = ["text", "binary", "continuation"] as const;

export interface RewriteGroup {
  name: string;
  /** Применяется ли без просьб соседей; выключенную включает mutate. */
  default: boolean;
  on: RewriteGroupOn;
  /** Условия ответной группы. Пустой список -- любой код / любой тип; "+json"
   * ловит суффикс. */
  status: number[];
  contentType: string[];
  /** Условия кадровой группы: направление (пусто -- оба) и опкод (пусто --
   * text: регулярное выражение по двоичному кадру пишут явно). */
  direction: string[];
  opcode: string[];
  body: RewriteBodyOp[];
  /** Только у ответной группы: заголовков у кадра нет. */
  headers: RewriteHeaderOp[];
}

/** Правило приёма чужих просьб. Оба глагола умеют ослаблять, поэтому
 * широковещательного правила у этого инспектора не бывает. */
export interface RewritePriorRule {
  from: string;
  accept: ("mutate" | "skip")[];
  /** Ограничить правило поводами отправителя. Пусто -- любой повод. */
  codes: string[];
}

export interface RewriteProfileDoc {
  description: string;
  /** Запись каталога waf_deny_response для отказа по несостоявшейся подмене. */
  denyResponse: string;
  groups: RewriteGroup[];
  prior: RewritePriorRule[];
}

export interface RewriteProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: RewriteProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
