import { current, isDraft } from "@reduxjs/toolkit";

export function reuseIfEqual<T>(prev: T | undefined, next: T): T {
  if (prev === undefined) {
    return next;
  }
  return structEqual(plain(prev), next) ? prev : next;
}

function plain(value: unknown): unknown {
  return isDraft(value) ? current(value as object) : value;
}

export function reuseList<T>(
  prev: T[] | undefined,
  next: T[],
  key: (row: T) => string,
): T[] {
  if (prev === undefined) {
    return next;
  }
  const prevByKey = new Map(prev.map((row) => [key(row), row]));
  let changed = prev.length !== next.length;
  const out = next.map((row, i) => {
    const kept = reuseIfEqual(prevByKey.get(key(row)), row);
    if (kept !== prev[i]) {
      changed = true;
    }
    return kept;
  });
  return changed ? out : prev;
}

export function sameRefs<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function structEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  if (typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i++) {
      if (!structEqual(left[i], right[i])) {
        return false;
      }
    }
    return true;
  }
  if (Array.isArray(right)) {
    return false;
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  const rightKeys = Object.keys(b);
  if (keys.length !== rightKeys.length) {
    return false;
  }
  for (const key of keys) {
    if (key === "age_ms") {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
    if (!structEqual(a[key], b[key])) {
      return false;
    }
  }
  for (const key of rightKeys) {
    if (key === "age_ms") {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(a, key)) {
      return false;
    }
  }
  return true;
}
