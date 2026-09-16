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
