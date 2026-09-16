export const OVERLOAD_AT_MIN = 25;

export const OVERLOAD_AT_MAX = 100;

export function overloadAtOk(raw: string): boolean {
  if (raw.trim() === "") {
    return true;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= OVERLOAD_AT_MIN && n <= OVERLOAD_AT_MAX;
}

export function overloadAtOf(raw: string): number | null {
  return raw.trim() === "" ? null : Number(raw);
}

export function overloadAtLabel(at: number | null | undefined): string {
  return `≥ ${at ?? OVERLOAD_AT_MAX}%`;
}

export const OVERLOAD_WHEN = "overload";
