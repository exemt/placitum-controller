import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  moveFile as moveFileAction,
  removeFile as removeFileAction,
  replaceWorkspace as replaceWorkspaceAction,
  select as selectAction,
} from '../store/filesSlice';
import { compileDocument } from '../modsec/compile';
import { readExclusions, indexWorkspaceExclusions } from '../modsec/exclusions';
import { indexMarkersByLabel, indexRulesById, blockSnippet } from '../modsec/snippet';
import { indexWorkspaceMarkerRefs } from '../modsec/markers';
import { indexWorkspaceTags } from '../modsec/tags';
import { indexWorkspaceVariables } from '../modsec/variables';
import { fileOrder } from '../modsec/workspace';
import type { BlockSnippet, MarkerLocation, RuleLocation } from '../modsec/snippet';
import { RuleProvider } from './RuleProvider';
import { WorkspaceContext } from './workspaceContext';
import { useInspection } from './useInspection';
import type { CompileResult } from '../modsec/compile';
import type { Diagnostic } from '../modsec/diagnostics';
import type { ExclusionDirective } from '../modsec/exclusions';
import type { ParsedDocument, ParsedStatement } from '../modsec/types';
import type { WorkspaceUnit } from '../modsec/workspace';
import type { NewFile } from '../store/filesSlice';
import type { WorkspaceContextValue, WorkspaceFile } from './workspaceContext';

interface WorkspaceProviderProps {
  initialFiles: NewFile[];
  single?: boolean;
  children: ReactNode;
}

const NO_STATEMENTS: ParsedStatement[] = [];

interface Entry {
  parsed: ParsedDocument | null;
  name: string;
  order: number;
  compiled: CompileResult;
  unit: WorkspaceUnit;
  directives: ExclusionDirective[];
}

export function WorkspaceProvider({
  initialFiles,
  single = false,
  children,
}: WorkspaceProviderProps) {
  const dispatch = useAppDispatch();
  const files = useAppSelector((s) => s.files.files);
  const activeId = useAppSelector((s) => s.files.activeId);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (files.length > 0) return;
    dispatch(replaceWorkspaceAction({ files: initialFiles }));
  }, [dispatch, initialFiles, files]);

  const cache = useRef(new Map<string, Entry>());

  const built = useMemo(() => {
    const next = new Map<string, Entry>();
    const units: WorkspaceUnit[] = [];
    const structural: Diagnostic[] = [];
    const directives: ExclusionDirective[] = [];

    files.forEach((file, order) => {
      const old = cache.current.get(file.id);
      let entry = old;

      if (entry === undefined || entry.parsed !== file.parsed || entry.name !== file.name || entry.order !== order) {
        const statements = file.parsed?.statements ?? NO_STATEMENTS;
        const compiled =
          old !== undefined && old.parsed === file.parsed
            ? old.compiled
            : compileDocument(file.parsed, file.id);
        entry = {
          parsed: file.parsed,
          name: file.name,
          order,
          compiled,
          unit: { id: file.id, name: file.name, blocks: compiled.blocks, statements },
          directives: readExclusions(statements, file.id, order),
        };
      }

      next.set(file.id, entry);
      units.push(entry.unit);
      structural.push(...entry.compiled.diagnostics);
      directives.push(...entry.directives);
    });

    cache.current = next;
    return { entries: next, units, structural, directives };
  }, [files]);

  const { units, structural, directives } = built;

  const exclusions = useMemo(
    () => indexWorkspaceExclusions(units, directives),
    [units, directives],
  );
  const variables = useMemo(() => indexWorkspaceVariables(units), [units]);
  const markerRefs = useMemo(() => indexWorkspaceMarkerRefs(units), [units]);
  const tags = useMemo(() => indexWorkspaceTags(units, exclusions), [units, exclusions]);
  const order = useMemo(() => fileOrder(units), [units]);
  const analysis = useInspection(units, structural, exclusions, order);

  const activeCompiled = useMemo(
    () => built.entries.get(activeId)?.compiled ?? compileDocument(null, activeId),
    [built, activeId],
  );

  const view = useMemo<WorkspaceFile[]>(
    () =>
      files.map((file) => ({
        id: file.id,
        name: file.name,
        lines: file.source === '' ? 0 : file.source.split('\n').length,
        edited: file.source !== file.baseline,
        key: file.key,
      })),
    [files],
  );

  const names = useMemo(() => new Map(files.map((file) => [file.id, file.name])), [files]);
  const nameOf = useCallback((id: string) => names.get(id) ?? '', [names]);
  const textOf = useCallback(
    (id: string) => files.find((file) => file.id === id)?.source ?? '',
    [files],
  );
  const snippetOf = useCallback(
    (file: string, key: string): BlockSnippet | null => {
      const unit = built.entries.get(file)?.unit;
      if (unit === undefined) return null;
      return blockSnippet(unit.blocks, unit.statements, key);
    },
    [built],
  );
  const rulesById = useMemo(() => indexRulesById(units), [units]);
  const ruleOf = useCallback(
    (id: string): RuleLocation | null => rulesById.get(id) ?? null,
    [rulesById],
  );
  const markersByLabel = useMemo(() => indexMarkersByLabel(units), [units]);
  const markerOf = useCallback(
    (label: string): MarkerLocation | null => markersByLabel.get(label) ?? null,
    [markersByLabel],
  );

  const selectFile = useCallback((id: string) => dispatch(selectAction(id)), [dispatch]);
  const moveFile = useCallback(
    (id: string, to: number) => dispatch(moveFileAction({ id, to })),
    [dispatch],
  );

  const removeFile = useCallback(
    (id: string) => {
      if (files.length <= 1) return;
      dispatch(removeFileAction(id));
    },
    [dispatch, files],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      files: view,
      activeId,
      analysis,
      exclusions,
      variables,
      markerRefs,
      tags,
      activeCompiled,
      nameOf,
      textOf,
      snippetOf,
      ruleOf,
      markerOf,
      single,
      selectFile,
      removeFile,
      moveFile,
    }),
    [
      view,
      activeId,
      analysis,
      exclusions,
      variables,
      markerRefs,
      tags,
      activeCompiled,
      nameOf,
      textOf,
      snippetOf,
      ruleOf,
      markerOf,
      single,
      selectFile,
      removeFile,
      moveFile,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <RuleProvider>{children}</RuleProvider>
    </WorkspaceContext.Provider>
  );
}
