import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'exeditor.fullList';

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let full = typeof window === 'undefined' ? false : read();
const listeners = new Set<() => void>();

export function setFullList(next: boolean): void {
  if (next === full) return;
  full = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFullList(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => full,
    () => false,
  );
}
