import { BLOCK_ROW } from '../../theme';

/**
 * Геометрия списка блоков: из чего складывается высота и что видно в окне.
 *
 * Отдельно от самого списка, потому что это арифметика без DOM: её можно
 * проверить целиком, не рисуя ни одной карточки, и она же объясняет, почему
 * схема виртуализации не расходится с действительностью.
 */

/** Рамка карточки: свёрнутый блок выше своей полосы на две рамки. */
const CARD_BORDER = 1;

/** Просвет между блоками списка. */
export const BLOCK_GAP = 12;

/**
 * Шаг свёрнутой строки.
 *
 * Он не измеряется, а навязывается: обёртке строки задана ровно эта высота.
 * Измерение было бы источником расхождения — стоит настоящей строке оказаться
 * на пиксель выше расчётной, и серия из тысячи строк уедет на километр.
 */
export const COLLAPSED_STEP = BLOCK_ROW + CARD_BORDER * 2 + BLOCK_GAP;

/**
 * Запас над и под окном, в пикселях.
 *
 * Примерно экран в каждую сторону: прокрутка колесом успевает уйти дальше,
 * чем React успевает нарисовать, и без запаса за краем окна мелькала бы
 * пустота.
 */
const OVERSCAN = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Какие строки серии попадают в окно.
 *
 * `top` — смещение начала серии от верха окна прокрутки; отрицательное
 * значит, что серия началась выше видимого. Возвращается полуинтервал
 * `[first, last)`; пустой — серии на экране нет вовсе.
 */
export function visibleRange(
  top: number,
  viewHeight: number,
  step: number,
  count: number,
): [number, number] {
  const first = clamp(Math.floor((-top - OVERSCAN) / step), 0, count);
  const last = clamp(Math.ceil((viewHeight - top + OVERSCAN) / step), first, count);
  return [first, last];
}

/** Кусок списка: раскрытый блок сам по себе или серия свёрнутых подряд. */
export type Segment =
  | { open: true; index: number }
  | { open: false; from: number; to: number };

/** Разбивает список на раскрытые блоки и серии свёрнутых между ними. */
export function segmentsOf(count: number, isOpen: (index: number) => boolean): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < count; i++) {
    if (isOpen(i)) {
      segments.push({ open: true, index: i });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last !== undefined && !last.open) last.to = i + 1;
    else segments.push({ open: false, from: i, to: i + 1 });
  }
  return segments;
}
