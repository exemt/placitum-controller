import { useSyncExternalStore } from 'react';

/**
 * Режим полного списка: показывать все варианты или только частые.
 *
 * Настройка одна на весь конструктор, а не на поле. Тот, кто развернул
 * список операторов, почти наверняка хочет видеть целиком и преобразования:
 * это не свойство конкретного выпадающего списка, а ответ на вопрос
 * «показывать мне отобранное или всё, что бывает».
 *
 * Отсюда и общее хранилище вместо состояния компонента: полей на экране
 * десятки, и переключение в одном из них должно менять все остальные сразу,
 * а не только те, которые откроют после.
 */

const STORAGE_KEY = 'exeditor.fullList';

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // localStorage может быть недоступен (приватный режим) — не падаем.
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
    // Не сохранилось — режим всё равно работает до конца сессии.
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
