import { useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { applyRuleSource, undo as undoAction, redo as redoAction } from '../store/filesSlice';
import {
  applyRule,
  appendAction,
  appendDirective,
  appendMarker,
  appendRule,
  duplicateRule as duplicateRuleIn,
  insertAfter,
  removeRange,
  replaceRange,
  swapRanges,
} from '../modsec/emit';
import { formatDocument } from '../modsec/format';
import type { ParsedDocument } from '../modsec/types';
import type { VisualRule } from '../modsec/model';
import { RuleContext } from './ruleContext';
import { useWorkspace } from './workspaceContext';
import { selectActive } from '../store/filesSlice';
import type { RuleContextValue } from './ruleContext';

interface RuleProviderProps {
  children: ReactNode;
}

export function RuleProvider({ children }: RuleProviderProps) {
  const dispatch = useAppDispatch();
  const { activeCompiled: compiled, analysis } = useWorkspace();
  const file = useAppSelector((s) => selectActive(s.files));

  const source = file?.source ?? '';
  const parsed = file?.parsed ?? null;
  const parseError = file?.parseError ?? null;
  const canUndo = (file?.past.length ?? 0) > 0;
  const canRedo = (file?.future.length ?? 0) > 0;

  const parsedRef = useRef<ParsedDocument | null>(parsed);
  parsedRef.current = parsed;

  const setSource = useCallback(
    (next: string) => {
      dispatch(applyRuleSource(next));
    },
    [dispatch],
  );
  const replaceSource = useCallback(
    (next: string) => {
      dispatch(applyRuleSource(next, 'push'));
    },
    [dispatch],
  );

  const runDocOp = useCallback(
    (op: (doc: ParsedDocument) => string) => {
      const doc = parsedRef.current;
      if (!doc) return;
      dispatch(applyRuleSource(op(doc), 'push'));
    },
    [dispatch],
  );

  const updateRule = useCallback(
    (rule: VisualRule) => runDocOp((doc) => applyRule(doc, rule)),
    [runDocOp],
  );
  const replaceLines = useCallback(
    (from: number, to: number, lines: string[]) =>
      runDocOp((doc) => replaceRange(doc, from, to, lines)),
    [runDocOp],
  );
  const insertLines = useCallback(
    (after: number, lines: string[]) => runDocOp((doc) => insertAfter(doc, after, lines)),
    [runDocOp],
  );
  const removeBlock = useCallback(
    (from: number, to: number) => runDocOp((doc) => removeRange(doc, from, to)),
    [runDocOp],
  );
  const addRule = useCallback(() => runDocOp(appendRule), [runDocOp]);
  const addAction = useCallback(() => runDocOp(appendAction), [runDocOp]);
  const addMarker = useCallback(() => runDocOp(appendMarker), [runDocOp]);
  const addDirective = useCallback(
    (line: string) => runDocOp((doc) => appendDirective(doc, line)),
    [runDocOp],
  );
  const duplicateRule = useCallback(
    (rule: VisualRule) => runDocOp((doc) => duplicateRuleIn(doc, rule)),
    [runDocOp],
  );
  const swapBlocks = useCallback(
    (first: [number, number], second: [number, number]) =>
      runDocOp((doc) => swapRanges(doc, first, second)),
    [runDocOp],
  );

  const formatted = useMemo(() => (parsed ? formatDocument(parsed) : null), [parsed]);
  const canFormat = formatted !== null && formatted !== source;
  const formatSource = useCallback(() => {
    if (formatted === null || formatted === source) return;
    dispatch(applyRuleSource(formatted, 'push'));
  }, [dispatch, formatted, source]);

  const undo = useCallback(() => dispatch(undoAction()), [dispatch]);
  const redo = useCallback(() => dispatch(redoAction()), [dispatch]);

  const value = useMemo<RuleContextValue>(
    () => ({
      source,
      parsed,
      parseError,
      compiled,
      analysis,
      setSource,
      replaceSource,
      updateRule,
      replaceLines,
      insertLines,
      removeBlock,
      addRule,
      addAction,
      addMarker,
      addDirective,
      duplicateRule,
      swapBlocks,
      formatSource,
      canFormat,
      undo,
      redo,
      canUndo,
      canRedo,
    }),
    [
      source,
      parsed,
      parseError,
      compiled,
      analysis,
      setSource,
      replaceSource,
      updateRule,
      replaceLines,
      insertLines,
      removeBlock,
      addRule,
      addAction,
      addMarker,
      addDirective,
      duplicateRule,
      swapBlocks,
      formatSource,
      canFormat,
      undo,
      redo,
      canUndo,
      canRedo,
    ],
  );

  return <RuleContext.Provider value={value}>{children}</RuleContext.Provider>;
}
