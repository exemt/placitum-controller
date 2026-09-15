import { createContext, useContext } from 'react';
import type { CompileResult } from '../modsec/compile';
import type { ExclusionIndex } from '../modsec/exclusions';
import type { BlockSnippet, MarkerLocation, RuleLocation } from '../modsec/snippet';
import type { MarkerRefIndex } from '../modsec/markers';
import type { TagIndex } from '../modsec/tags';
import type { VariableIndex } from '../modsec/variables';
import type { Analysis } from './useInspection';

export interface WorkspaceFile {
  id: string;
  name: string;
  lines: number;
  edited: boolean;
  key?: string;
}

export interface WorkspaceContextValue {
  files: WorkspaceFile[];
  activeId: string;
  analysis: Analysis;
  exclusions: ExclusionIndex;
  variables: VariableIndex;
  markerRefs: MarkerRefIndex;
  tags: TagIndex;
  activeCompiled: CompileResult;
  nameOf: (id: string) => string;
  textOf: (id: string) => string;
  snippetOf: (file: string, key: string) => BlockSnippet | null;
  ruleOf: (id: string) => RuleLocation | null;
  markerOf: (label: string) => MarkerLocation | null;

  single: boolean;

  selectFile: (id: string) => void;
  removeFile: (id: string) => void;
  moveFile: (id: string, to: number) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (ctx === null) {
    throw new Error('useWorkspace must be used within a <WorkspaceProvider>');
  }
  return ctx;
}
