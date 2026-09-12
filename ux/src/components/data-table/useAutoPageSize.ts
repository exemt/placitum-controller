import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Высота строки `size="small"`, пока мерить нечего.
 *
 * Пустая таблица не даёт ни одной строки, а размер страницы запрашивают уже
 * при первой загрузке: 6+6 полей ячейки, ~20px строки текста и линейка.
 */
export const FALLBACK_ROW_H = 33;

/**
 * Сколько раз размер правится под одну и ту же высоту блока.
 *
 * Строки бывают разной высоты (журнал переносит текст), и подобранный размер
 * меняет набор строк, а тот -- среднюю высоту: расчёт может ходить по кругу
 * 24 -> 19 -> 24. После нескольких правок на одной высоте блока значение
 * залипает на наименьшем из предложенных -- меньшее всегда влезает.
 */
const SETTLE_TRIES = 4;

/** Блок, по которому считают: id, узел, ref или контекст таблицы. */
export type AutoTarget =
  | string
  | HTMLElement
  | { current: HTMLElement | null }
  | null;

/**
 * Скроллер таблицы для пагинатора.
 *
 * `DataTable` кладёт сюда свой блок с прокруткой, и пагинатор в подвале
 * считает по нему сам -- странице не нужно ни ref, ни id. Пусто (`null`) --
 * авто-размер выключен: считать не по чему.
 */
export const TableViewportCtx = createContext<HTMLElement | null>(null);

export function useTableViewport(): HTMLElement | null {
  return useContext(TableViewportCtx);
}

export type AutoPageSizeOptions = {
  target?: AutoTarget;
  enabled?: boolean;
  /** Своя высота строки: задают, когда строки одинаковы, но их ещё нет. */
  rowHeight?: number;
  /** Что вычесть сверх шапки: подсказка под таблицей, полоса итогов. */
  reserve?: number;
  min?: number;
  max?: number;
};

function resolveTarget(
  target: AutoTarget | undefined,
  fallback: HTMLElement | null,
): HTMLElement | null {
  if (target === undefined || target === null) {
    return fallback;
  }
  if (typeof target === "string") {
    return document.getElementById(target);
  }
  if (target instanceof HTMLElement) {
    return target;
  }
  return target.current;
}

/**
 * Подвал под блоком: полоса пагинатора.
 *
 * Учитывается, только когда стоит прямо под блоком -- страница, растущая по
 * содержимому, иначе набрала бы строк ровно на экран и увела полосу за нижний
 * край окна.
 */
function footerHeight(root: HTMLElement): number {
  const next = root.nextElementSibling;
  if (next === null) {
    return 0;
  }
  const rect = next.getBoundingClientRect();
  return rect.top >= root.getBoundingClientRect().bottom - 1 ? rect.height : 0;
}

/**
 * Строки тела без строк состояния.
 *
 * «Нет данных», «загрузка» и раскрытая карточка инцидента идут ячейкой с
 * `colspan` -- их высота к строке списка отношения не имеет.
 */
function rowHeightOf(root: HTMLElement): number | null {
  const rows = root.querySelectorAll("tbody > tr");
  let sum = 0;
  let seen = 0;
  rows.forEach((row) => {
    if (row.querySelector("[colspan]") !== null) {
      return;
    }
    const h = row.getBoundingClientRect().height;
    if (h > 0) {
      sum += h;
      seen += 1;
    }
  });
  return seen === 0 ? null : sum / seen;
}

/**
 * Сколько строк влезает в блок.
 *
 * Считает по живой разметке: высота блока с прокруткой минус шапка, делить на
 * среднюю строку. Пересчитывается на ресайз блока (`ResizeObserver`) и на
 * каждый рендер вызывающего -- строки приезжают позже пустой таблицы, и
 * первое измерение идёт по запасной высоте.
 *
 * Возвращает `null`, пока считать не по чему: вызывающий остаётся на своём
 * размере страницы.
 */
export function useAutoPageSize(options: AutoPageSizeOptions = {}): number | null {
  const { target, enabled = true, rowHeight, reserve = 0, min = 1, max } = options;
  const viewport = useTableViewport();
  const [fit, setFit] = useState<number | null>(null);
  /* Последняя измеренная строка: пустая страница не должна ронять расчёт. */
  const lastRow = useRef<number | null>(null);
  const settle = useRef({ height: -1, tries: 0, best: 0 });
  const applied = useRef<number | null>(null);

  const measure = useCallback(() => {
    if (!enabled) {
      return;
    }
    const root = resolveTarget(target, viewport);
    if (root === null) {
      return;
    }
    const height = root.clientHeight;
    if (height <= 0) {
      // Скрытая панель: замеры врут, размер оставляем прежним.
      return;
    }
    /*
     * Место считается по меньшему из двух: высота самого блока и остаток окна
     * под ним. Оболочка панели держит `min-height: 100vh`, а не `height`:
     * список растягивает страницу, и один `clientHeight` рос бы вслед за
     * подобранным размером -- расчёт разгонялся бы сам от себя. Остаток окна
     * от содержимого не зависит.
     */
    const rect = root.getBoundingClientRect();
    const inWindow =
      window.innerHeight - Math.max(rect.top, 0) - footerHeight(root);
    const room = Math.min(height, inWindow);
    if (room <= 0) {
      return;
    }
    const head = root.querySelector("thead");
    const headH = head === null ? 0 : head.getBoundingClientRect().height;
    const measured = rowHeightOf(root);
    if (measured !== null) {
      lastRow.current = measured;
    }
    const row = rowHeight ?? measured ?? lastRow.current ?? FALLBACK_ROW_H;
    if (row <= 0) {
      return;
    }
    const raw = Math.floor((room - headH - reserve) / row);
    const next = Math.max(min, max === undefined ? raw : Math.min(raw, max));

    const state = settle.current;
    if (Math.abs(room - state.height) > 1) {
      state.height = room;
      state.tries = 0;
      state.best = next;
    }
    state.best = Math.min(state.best, next);
    const value = state.tries >= SETTLE_TRIES ? state.best : next;
    if (applied.current !== value) {
      applied.current = value;
      state.tries += 1;
      setFit(value);
    }
  }, [enabled, target, viewport, rowHeight, reserve, min, max]);

  /* Строки приезжают после первого рендера -- меряем на каждый. */
  useLayoutEffect(measure);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    const root = resolveTarget(target, viewport);
    if (root === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    /*
     * Окно наблюдается отдельно от блока: страница растёт по содержимому, и
     * при смене высоты окна сам блок не меняется -- меняется только остаток
     * окна под ним, а по нему и считают.
     */
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    /*
     * Таблица наблюдается отдельно: высота блока с прокруткой при смене
     * содержимого не меняется, а высота строк -- меняется (перенос текста,
     * шрифт, раскрытая карточка).
     */
    const table = root.querySelector("table");
    if (table !== null) {
      observer.observe(table);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [enabled, target, viewport, measure]);

  return enabled ? fit : null;
}
