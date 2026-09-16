import { createContext, useContext } from 'react';
import type { ParsedDocument } from '../modsec/types';
import type { CompileResult } from '../modsec/compile';
import type { Analysis } from './useInspection';
import type { VisualRule } from '../modsec/model';

export interface RuleContextValue {
  source: string;
  parsed: ParsedDocument | null;
  parseError: string | null;
  compiled: CompileResult;
  analysis: Analysis;

  setSource: (source: string) => void;
  replaceSource: (source: string) => void;
  updateRule: (rule: VisualRule) => void;
  replaceLines: (from: number, to: number, lines: string[]) => void;
  insertLines: (after: number, lines: string[]) => void;
  removeBlock: (from: number, to: number) => void;
  addRule: () => void;
  addAction: () => void;
  addMarker: () => void;
  addDirective: (line: string) => void;
  duplicateRule: (rule: VisualRule) => void;
  swapBlocks: (first: [number, number], second: [number, number]) => void;
  formatSource: () => void;
  canFormat: boolean;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const RuleContext = createContext<RuleContextValue | null>(null);

export function useRule(): RuleContextValue {
  const ctx = useContext(RuleContext);
  if (ctx === null) {
    throw new Error('useRule must be used within a <RuleProvider>');
  }
  return ctx;
}
