import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EditorViewContext } from './editorViewContext';
import { useWorkspace } from './workspaceContext';
import type { EditorTab, EditorViewValue, RevealRequest } from './editorViewContext';

/** Хранит выбранную вкладку и просьбы перевести взгляд на строку. */
export function EditorViewProvider({ children }: { children: ReactNode }) {
  const { activeId, selectFile } = useWorkspace();
  const [tab, setTab] = useState<EditorTab>('text');
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const seq = useRef(0);

  const revealLine = useCallback(
    (line: number, file?: string) => {
      // Смена файла и просьба уходят одной перерисовкой: редактор рисуется
      // сразу новым текстом, и подводить к строке в старом не приходится.
      if (file !== undefined && file !== activeId) selectFile(file);
      seq.current += 1;
      setTab('text');
      setReveal({ line, seq: seq.current });
    },
    [activeId, selectFile],
  );

  const value = useMemo<EditorViewValue>(
    () => ({ tab, setTab, revealLine, reveal }),
    [tab, revealLine, reveal],
  );

  return <EditorViewContext.Provider value={value}>{children}</EditorViewContext.Provider>;
}
