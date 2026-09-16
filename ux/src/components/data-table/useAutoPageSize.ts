import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export const FALLBACK_ROW_H = 33;

const SETTLE_TRIES = 4;

export type AutoTarget =
  | string
  | HTMLElement
  | { current: HTMLElement | null }
  | null;

export const TableViewportCtx = createContext<HTMLElement | null>(null);

export function useTableViewport(): HTMLElement | null {
  return useContext(TableViewportCtx);
}

export type AutoPageSizeOptions = {
  target?: AutoTarget;
  enabled?: boolean;
  rowHeight?: number;
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

function footerHeight(root: HTMLElement): number {
  const next = root.nextElementSibling;
  if (next === null) {
    return 0;
  }
  const rect = next.getBoundingClientRect();
  return rect.top >= root.getBoundingClientRect().bottom - 1 ? rect.height : 0;
}

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

export function useAutoPageSize(options: AutoPageSizeOptions = {}): number | null {
  const { target, enabled = true, rowHeight, reserve = 0, min = 1, max } = options;
  const viewport = useTableViewport();
  const [fit, setFit] = useState<number | null>(null);
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
      return;
    }
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
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
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
