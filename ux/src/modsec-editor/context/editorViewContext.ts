import { createContext, useContext } from 'react';

export type EditorTab = 'text' | 'visual';

/** Просьба показать строку: номер плюс счётчик, чтобы повтор тоже сработал. */
export interface RevealRequest {
  line: number;
  /**
   * Порядковый номер просьбы.
   *
   * Без него второй клик по той же строке не изменил бы состояние, и
   * редактор не отреагировал бы — а человек ждёт, что подсветка мигнёт снова.
   */
  seq: number;
}

/**
 * Что показано на экране и куда нужно перевести взгляд.
 *
 * Диагностика знает номер строки, но живёт в другой части дерева, чем
 * текстовый редактор. Общий контекст избавляет от того, чтобы протаскивать
 * обработчик через все панели между ними.
 */
export interface EditorViewValue {
  tab: EditorTab;
  setTab: (tab: EditorTab) => void;
  /**
   * Открыть текстовую вкладку и подвести к строке.
   *
   * Файл называют, когда строка не в открытом файле: номера строк считаются
   * внутри файла, и без перехода просьба привела бы к чужой строке с тем же
   * номером.
   */
  revealLine: (line: number, file?: string) => void;
  /** Последняя просьба; `null`, пока никто ни о чём не просил. */
  reveal: RevealRequest | null;
}

export const EditorViewContext = createContext<EditorViewValue | null>(null);

/** Доступ к состоянию вкладок. Бросает, если вызван вне провайдера. */
export function useEditorView(): EditorViewValue {
  const ctx = useContext(EditorViewContext);
  if (ctx === null) {
    throw new Error('useEditorView must be used within an <EditorViewProvider>');
  }
  return ctx;
}
