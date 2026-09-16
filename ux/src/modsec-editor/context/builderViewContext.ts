import { createContext, useContext } from 'react';
import { isPanelArg } from '../modsec/directives';
import type { VisualBlock, VisualModel } from '../modsec/model';

export const INITIALLY_EXPANDED = 1;

export function blockExpansionKey(block: VisualBlock): string | null {
  if (block.kind === 'rule') return block.rule.actions.id || block.key;
  if (block.kind === 'action') return block.actions.id || block.key;
  if (block.kind === 'directive' && block.form !== null && isPanelArg(block.form.arg)) {
    return block.key;
  }
  return null;
}

export function collapsibleKeys(model: VisualModel | null): string[] {
  if (model === null) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const block of model.blocks) {
    const key = blockExpansionKey(block);
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export interface RevealBlockRequest {
  blockKey: string;
  seq: number;
}

export interface BuilderViewValue {
  isExpanded: (key: string) => boolean;
  toggleExpanded: (key: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  expandNext: () => void;
  resetExpanded: () => void;
  revealRule: (ruleKey: string, file?: string) => void;
  reveal: RevealBlockRequest | null;
  expandedCount: number;
  collapsibleCount: number;
}

export const BuilderViewContext = createContext<BuilderViewValue | null>(null);

export function useBuilderView(): BuilderViewValue {
  const ctx = useContext(BuilderViewContext);
  if (ctx === null) {
    throw new Error('useBuilderView must be used within a <BuilderViewProvider>');
  }
  return ctx;
}
