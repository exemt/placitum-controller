export const OVERLOAD_ON = "overload";

export const OVERLOAD_AT_MIN = 25;

export const OVERLOAD_AT_MAX = 100;

export function checkOverloadAt(
  at: number | null | undefined,
  where: string,
  fail: (message: string) => never,
): void {
  if (at === null || at === undefined) {
    return;
  }

  if (!Number.isInteger(at) || at < OVERLOAD_AT_MIN || at > OVERLOAD_AT_MAX) {
    fail(`${where}.at is out of ${OVERLOAD_AT_MIN}..${OVERLOAD_AT_MAX} percent of the queue`);
  }
}
