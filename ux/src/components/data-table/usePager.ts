import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Ручные размеры страницы в селекторе, рядом с пунктом «Авто». */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Значение «Авто» в селекторе размера страницы.
 *
 * Ноль, а не отдельное поле: селектор отдаёт число, и один канал
 * `setPageSize` покрывает и ручной выбор, и возврат к расчёту по высоте.
 */
export const AUTO_PAGE_SIZE = 0;

export type PageSizeState = {
  pageSize: number;
  /** Размер считает пагинатор по высоте блока. */
  auto: boolean;
  /**
   * Размер окончателен: выбран руками или уже измерен.
   *
   * Серверные списки ждут этого признака перед первым запросом -- иначе
   * первая страница уезжает с запасным размером и тут же перезапрашивается.
   */
  ready: boolean;
  /** `AUTO_PAGE_SIZE` -- вернуться к расчёту по высоте. */
  setPageSize: (size: number) => void;
  /** Расчёт пагинатора; ручной выбор его не слушает. */
  setAutoSize: (size: number) => void;
};

export type PagerState = PageSizeState & {
  page: number;
  total: number;
  pageCount: number;
  pageSizes: readonly number[];
  setPage: (page: number) => void;
};

export type PageSizeOptions = {
  /** Число -- ручной размер с самого начала, `"auto"` -- расчёт по высоте. */
  pageSize?: number | "auto";
  /** Разрешён ли расчёт по высоте вообще. */
  auto?: boolean;
  /** Размер, пока расчёт не пришёл. */
  fallback?: number;
};

/** Сколько ждать первое измерение, прежде чем идти с запасным размером. */
const READY_TIMEOUT_MS = 400;

/**
 * Размер страницы: ручной или посчитанный по высоте блока.
 *
 * Живёт отдельно от `usePager`, потому что серверные списки (журнал,
 * инциденты, адреса набора) страницу режут сами -- им нужен только размер.
 */
export function usePageSize(options?: PageSizeOptions): PageSizeState {
  const fallback = options?.fallback ?? PAGE_SIZES[0];
  const autoAllowed = options?.auto ?? true;
  const initial =
    options?.pageSize === undefined || options.pageSize === "auto"
      ? autoAllowed
        ? null
        : fallback
      : options.pageSize;

  /* `null` -- размер отдан расчёту. */
  const [manual, setManual] = useState<number | null>(initial);
  const [autoSize, setAutoSizeState] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);

  const auto = manual === null;
  const pageSize = (auto ? autoSize : manual) ?? fallback;
  const ready = !auto || autoSize !== null || expired;

  useEffect(() => {
    if (!auto || autoSize !== null) {
      return;
    }
    /*
     * Страховка на случай, когда мерить нечего: блока с заданной высотой нет,
     * панель скрыта, пагинатор не смонтирован. Без неё серверный список ждал
     * бы измерения вечно.
     */
    const timer = window.setTimeout(() => setExpired(true), READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [auto, autoSize]);

  return {
    pageSize,
    auto,
    ready,
    setPageSize: useCallback(
      (size: number) => {
        setManual(size === AUTO_PAGE_SIZE && autoAllowed ? null : size);
      },
      [autoAllowed],
    ),
    setAutoSize: useCallback((size: number) => {
      if (size > 0) {
        setAutoSizeState(size);
      }
    }, []),
  };
}

export type ServerPagerState = PageSizeState & {
  page: number;
  setPage: (page: number) => void;
};

/**
 * Страница и её размер, когда список режет сервер.
 *
 * Ресайз окна меняет размер страницы, и оператора нельзя уносить в другое
 * место списка: страница пересчитывается по первой видимой строке. Ручной
 * выбор размера -- осознанное действие, он возвращает в начало.
 */
export function useServerPager(options?: PageSizeOptions): ServerPagerState {
  const size = usePageSize(options);
  const [page, setPage] = useState(0);
  const { pageSize } = size;
  const prevSize = useRef(pageSize);

  useEffect(() => {
    if (prevSize.current === pageSize) {
      return;
    }
    const first = prevSize.current;
    prevSize.current = pageSize;
    setPage((cur) => Math.floor((cur * first) / pageSize));
  }, [pageSize]);

  return {
    ...size,
    page,
    setPage,
    setPageSize: (next: number) => {
      size.setPageSize(next);
      prevSize.current = next > 0 ? next : prevSize.current;
      setPage(0);
    },
  };
}

export function usePager<T>(
  items: readonly T[],
  options?: PageSizeOptions & { pageSizes?: readonly number[] },
): PagerState & { rows: T[] } {
  const pageSizes = options?.pageSizes ?? PAGE_SIZES;
  const pager = useServerPager({
    ...options,
    fallback: options?.fallback ?? pageSizes[0],
  });
  const { page, pageSize } = pager;

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const rows = useMemo(
    () => items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [items, safePage, pageSize],
  );

  return {
    ...pager,
    page: safePage,
    total,
    pageCount,
    rows,
    pageSizes,
  };
}
