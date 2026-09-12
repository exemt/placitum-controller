import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRule } from './ruleContext';
import { useEditorView } from './editorViewContext';
import { useWorkspace } from './workspaceContext';
import {
  BuilderViewContext,
  INITIALLY_EXPANDED,
  blockExpansionKey,
  collapsibleKeys,
} from './builderViewContext';
import type { BuilderViewValue, RevealBlockRequest } from './builderViewContext';

/**
 * Хранит, что в конструкторе раскрыто.
 *
 * Стоит выше вкладок: переключиться в текст и вернуться — не повод забыть,
 * какие правила человек открыл. Пока он ничего не открывал и не закрывал,
 * состояния нет вовсе (`chosen === null`) и работает умолчание — первые
 * несколько правил файла. Так политика не «прилипает» к документу в момент
 * загрузки: пример, открытый следом, снова показывает своё начало.
 */
export function BuilderViewProvider({ children }: { children: ReactNode }) {
  const { compiled } = useRule();
  const { setTab } = useEditorView();
  const { activeId, selectFile } = useWorkspace();
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);
  const [reveal, setReveal] = useState<RevealBlockRequest | null>(null);

  const model = compiled.model;
  const modelRef = useRef(model);
  modelRef.current = model;

  const keys = useMemo(() => collapsibleKeys(model), [model]);
  const initial = useMemo(
    () => new Set(keys.slice(0, INITIALLY_EXPANDED)),
    [keys],
  );

  // Колбэки не должны пересоздаваться на каждую правку текста: иначе значение
  // контекста меняется, а с ним перерисовывается весь список.
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const expanded = chosen ?? initial;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  /**
   * Просьба показать раскрытым правило, которого ещё нет.
   *
   * «Добавить» и «дублировать» правят текст, а номер новому правилу выдаёт
   * тот же проход; узнать ключ заранее неоткуда, поэтому запоминается само
   * намерение, а сработает оно на первом же блоке, которого раньше не было.
   */
  const pendingNew = useRef(false);
  const known = useRef<ReadonlySet<string>>(new Set(keys));

  useEffect(() => {
    const fresh = keys.filter((key) => !known.current.has(key));
    known.current = new Set(keys);
    if (!pendingNew.current || fresh.length === 0) return;
    pendingNew.current = false;
    setChosen(new Set([...expandedRef.current, ...fresh]));
  }, [keys]);

  const isExpanded = useCallback((key: string) => expandedRef.current.has(key), []);

  const toggleExpanded = useCallback((key: string) => {
    setChosen((prev) => {
      const next = new Set(prev ?? initialRef.current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setChosen(new Set(keysRef.current)), []);
  const collapseAll = useCallback(() => setChosen(new Set()), []);
  const expandNext = useCallback(() => {
    pendingNew.current = true;
  }, []);
  const resetExpanded = useCallback(() => setChosen(null), []);

  const revealSeq = useRef(0);
  const show = useCallback(
    (ruleKey: string) => {
      const block = modelRef.current?.blocks.find((b) => b.key === ruleKey);
      const key = block === undefined ? null : blockExpansionKey(block);
      if (key !== null) {
        setChosen((prev) => new Set([...(prev ?? initialRef.current), key]));
      }
      // Просьба публикуется даже для блока, которого в модели нет: список
      // просто никого не найдёт. Молча не переключить вкладку было бы хуже —
      // человек щёлкнул и вправе увидеть ответ.
      revealSeq.current += 1;
      setReveal({ blockKey: ruleKey, seq: revealSeq.current });
      setTab('visual');
    },
    [setTab],
  );

  /** Просьба, ждущая своего файла: ключ правила, которого в этой модели нет. */
  const awaited = useRef<{ file: string; ruleKey: string } | null>(null);

  const revealRule = useCallback(
    (ruleKey: string, file?: string) => {
      if (file === undefined || file === activeId) {
        show(ruleKey);
        return;
      }
      awaited.current = { file, ruleKey };
      selectFile(file);
      setTab('visual');
    },
    [activeId, selectFile, setTab, show],
  );

  // Файл сменился: раскрытия прежнего — про другие правила, и держать их
  // значило бы раскрыть в новом файле правила с теми же номерами. Ждущая
  // просьба выполняется здесь же: модель уже от нужного файла.
  const shown = useRef(activeId);
  useEffect(() => {
    if (shown.current === activeId) return;
    shown.current = activeId;
    setChosen(null);
    known.current = new Set(keys);

    const waiting = awaited.current;
    if (waiting === null || waiting.file !== activeId) return;
    awaited.current = null;
    show(waiting.ruleKey);
  }, [activeId, keys, show]);

  const value = useMemo<BuilderViewValue>(
    () => ({
      isExpanded,
      toggleExpanded,
      expandAll,
      collapseAll,
      expandNext,
      resetExpanded,
      revealRule,
      reveal,
      expandedCount: keys.reduce((sum, key) => sum + (expanded.has(key) ? 1 : 0), 0),
      collapsibleCount: keys.length,
    }),
    [
      isExpanded,
      toggleExpanded,
      expandAll,
      collapseAll,
      expandNext,
      resetExpanded,
      revealRule,
      reveal,
      keys,
      expanded,
    ],
  );

  return <BuilderViewContext.Provider value={value}>{children}</BuilderViewContext.Provider>;
}
