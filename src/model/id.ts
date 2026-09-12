/**
 * Идентификатор сущности контроллера. Всегда UUID RFC 4122: в API, в FK,
 * в `store:<uuid>` и в шаблоне nginx это одна и та же строка. Автоинкремент
 * сюда не пойдёт -- два контура тогда не смогут обменяться объектом.
 */
export type Uuid = string;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): value is Uuid {
  return UUID_RE.test(value);
}

export function asUuid(value: unknown): Uuid | undefined {
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}
