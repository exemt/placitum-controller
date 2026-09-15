import { useMemo } from 'react';
import { useWorkspace } from '../../context/workspaceContext';
import { blockRef, statementRef } from '../../modsec/workspace';
import type { Diagnostic } from '../../modsec/diagnostics';
import type { ExclusionEntry, RuleEffect } from '../../modsec/exclusions';

const NONE: Diagnostic[] = [];
const NO_EXCLUSIONS: ExclusionEntry[] = [];

export function useRuleDiagnostics(ruleKey: string): Diagnostic[] {
  const { analysis, activeId } = useWorkspace();
  return analysis.byRule.get(blockRef(activeId, ruleKey)) ?? NONE;
}

export function useRuleEffect(ruleKey: string): RuleEffect | undefined {
  const { exclusions, activeId } = useWorkspace();
  return exclusions.byRule.get(blockRef(activeId, ruleKey));
}

export function useRuleExclusions(from: number, to: number): ExclusionEntry[] {
  const { exclusions, activeId } = useWorkspace();
  const { byStatement } = exclusions;

  return useMemo(() => {
    if (byStatement.size === 0) return NO_EXCLUSIONS;

    const written: ExclusionEntry[] = [];
    for (let index = from; index <= to; index++) {
      const here = byStatement.get(statementRef(activeId, index));
      if (here !== undefined) written.push(...here);
    }
    return written.length === 0 ? NO_EXCLUSIONS : written;
  }, [byStatement, activeId, from, to]);
}

export function conditionDiagnostics(all: Diagnostic[], position: number): Diagnostic[] {
  return all.filter((d) => {
    const slot = d.anchor?.slot;
    if (slot === undefined || slot === 'actions') return false;
    return (d.anchor?.condition ?? 1) - 1 === position;
  });
}

export function ruleLevelDiagnostics(all: Diagnostic[]): Diagnostic[] {
  return all.filter((d) => {
    const slot = d.anchor?.slot;
    return slot === undefined || slot === 'actions';
  });
}

export function worstSeverity(all: Diagnostic[]): Diagnostic['severity'] {
  if (all.some((d) => d.severity === 'error')) return 'error';
  if (all.some((d) => d.severity === 'warning')) return 'warning';
  return 'advice';
}
