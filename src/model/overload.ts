/**
 * Строки перегрузки профилей: «когда инспектор перегружен -> что сделать».
 *
 * Порог -- заполнение очереди инспектора в процентах в миг, когда запрос в
 * неё встал. Ниже порога строка молчит. От порога до края запрос получает
 * настоящий вердикт, а действие строки едет рядом с ним: смысл порога в том,
 * чтобы разгрузиться до того, как очередь переполнится. На краю -- очередь
 * полна, запрос сброшен -- действие едет рядом с verdict: error, и модуль
 * исполнит только свои глаголы; что делать с самим запросом, решает
 * waf_exception ... overload маршрута.
 *
 * Действие у строки то же, что у остальных строк профиля, и выбирает его
 * администратор. Смысл порога один у всех инспекторов: internal/overload у
 * Go-инспекторов, OVERLOAD_AT_* у vlai.
 */

export const OVERLOAD_ON = "overload";

/** Ниже строка срабатывала бы на любой рабочей очереди, то есть всегда. */
export const OVERLOAD_AT_MIN = 25;

/** Край: запрос сброшен. Не назван порог -- это он. */
export const OVERLOAD_AT_MAX = 100;

/** Порог в пределах шкалы; не назван -- законно: это край. */
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
