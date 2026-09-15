import { createContext, useContext } from 'react';

export type EditorTab = 'text' | 'visual';

export interface RevealRequest {
  line: number;
  seq: number;
}

export interface EditorViewValue {
  tab: EditorTab;
  setTab: (tab: EditorTab) => void;
  revealLine: (line: number, file?: string) => void;
  reveal: RevealRequest | null;
}

export const EditorViewContext = createContext<EditorViewValue | null>(null);

export function useEditorView(): EditorViewValue {
  const ctx = useContext(EditorViewContext);
  if (ctx === null) {
    throw new Error('useEditorView must be used within an <EditorViewProvider>');
  }
  return ctx;
}
