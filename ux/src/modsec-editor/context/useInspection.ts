import { useEffect, useMemo, useState } from 'react';
import { byLine } from '../modsec/compile';
import { inspectSlices, inspectWorkspace } from '../modsec/inspect';
import { LONE_FILE, blockRef } from '../modsec/workspace';
import type { Diagnostic } from '../modsec/diagnostics';
import type { ExclusionIndex } from '../modsec/exclusions';
import type { VisualBlock } from '../modsec/model';
import type { WorkspaceUnit } from '../modsec/workspace';

const SYNC_LIMIT = 200;

const IDLE_DELAY_MS = 120;

const SLICE_BUDGET_MS = 6;

export interface Analysis {
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
  adviceCount: number;
  inspecting: boolean;
  byRule: Map<string, Diagnostic[]>;
}

const NO_DIAGNOSTICS: Diagnostic[] = [];

function isExecutable(block: VisualBlock): boolean {
  return block.kind === 'rule' || block.kind === 'action';
}

function schedule(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(task, { timeout: 200 });
    return () => cancelIdleCallback(id);
  }

  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => task();
    channel.port2.postMessage(null);
    return () => {
      channel.port1.onmessage = null;
    };
  }

  const id = window.setTimeout(task, 0);
  return () => window.clearTimeout(id);
}

interface Progress {
  source: readonly WorkspaceUnit[];
  diagnostics: Diagnostic[];
  done: boolean;
}

export function useInspection(
  units: readonly WorkspaceUnit[],
  structural: readonly Diagnostic[],
  exclusions: ExclusionIndex,
  order: ReadonlyMap<string, number>,
): Analysis {
  const deferred = useMemo(
    () => units.reduce((sum, unit) => sum + unit.blocks.filter(isExecutable).length, 0) > SYNC_LIMIT,
    [units],
  );

  const immediate = useMemo(
    () => (deferred ? null : inspectWorkspace(units, exclusions)),
    [deferred, units, exclusions],
  );

  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    if (!deferred) return;

    let cancelled = false;
    let cancelSlice: (() => void) | null = null;

    const start = window.setTimeout(() => {
      const slices = inspectSlices(units, exclusions);
      const found: Diagnostic[] = [];

      const step = () => {
        cancelSlice = null;
        if (cancelled) return;

        const until = performance.now() + SLICE_BUDGET_MS;
        let done = false;
        do {
          const next = slices.next();
          if (next.done === true) {
            done = true;
            break;
          }
          found.push(...next.value);
        } while (performance.now() < until);

        setProgress({ source: units, diagnostics: [...found], done });
        if (!done) cancelSlice = schedule(step);
      };

      cancelSlice = schedule(step);
    }, IDLE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
      cancelSlice?.();
    };
  }, [deferred, units, exclusions]);

  const current = progress !== null && progress.source === units ? progress : null;
  const semantic = immediate ?? current?.diagnostics ?? NO_DIAGNOSTICS;
  const inspecting = deferred && !(current?.done ?? false);

  return useMemo(() => {
    const diagnostics = byLine([...structural, ...semantic], order);

    const byRule = new Map<string, Diagnostic[]>();
    let errorCount = 0;
    let warningCount = 0;
    let adviceCount = 0;

    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === 'error') errorCount++;
      else if (diagnostic.severity === 'warning') warningCount++;
      else adviceCount++;

      const key = diagnostic.anchor?.ruleKey;
      if (key === undefined) continue;
      const ref = blockRef(diagnostic.file ?? LONE_FILE, key);
      const list = byRule.get(ref);
      if (list === undefined) byRule.set(ref, [diagnostic]);
      else list.push(diagnostic);
    }

    return { diagnostics, errorCount, warningCount, adviceCount, inspecting, byRule };
  }, [structural, semantic, inspecting, order]);
}
