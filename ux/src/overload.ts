/**
 * Строки перегрузки профилей: порог -- заполнение очереди инспектора в
 * процентах в миг, когда запрос в неё встал. Ниже порога строка молчит; от
 * порога до края запрос получает настоящий вердикт, а действие строки едет
 * рядом; на краю -- очередь полна, запрос сброшен -- действие едет рядом с
 * error. Смысл один у всех инспекторов и у контроллера (model/overload.ts).
 */

/** Ниже строка срабатывала бы на любой рабочей очереди, то есть всегда. */
export const OVERLOAD_AT_MIN = 25;

/** Край: запрос сброшен. Пустой порог -- это он. */
export const OVERLOAD_AT_MAX = 100;

/** Порог черновика годен: пусто (край) либо целое в пределах шкалы. */
export function overloadAtOk(raw: string): boolean {
  if (raw.trim() === "") {
    return true;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= OVERLOAD_AT_MIN && n <= OVERLOAD_AT_MAX;
}

/** Порог черновика в документ: пусто -- null, это край. */
export function overloadAtOf(raw: string): number | null {
  return raw.trim() === "" ? null : Number(raw);
}

/** Порог строки словами для таблицы: «≥ 60%», без порога -- край. */
export function overloadAtLabel(at: number | null | undefined): string {
  return `≥ ${at ?? OVERLOAD_AT_MAX}%`;
}

/** Ключ пункта «Когда» у правил по совпадению: условие так не называется. */
export const OVERLOAD_WHEN = "overload";
