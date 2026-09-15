import { wavesFromAfter } from "../inspector-graph.ts";
import type { InspectorDecl, InspectorRef } from "../model/waf-route.ts";
import type { NginxExport } from "./nginx-source.ts";

export interface ActionWarning {
  code: string;
  message: string;
}

export type ActionTargets = ReadonlyMap<string, readonly string[]>;

type Waf = NginxExport["servers"][number]["server"]["waf"];
type List = Waf["requestInspectors"];
type Phase = "request" | "response";

const PHASES: readonly Phase[] = ["request", "response"];

interface PhaseRows {
  rows: InspectorRef[];
  waves: Map<string, number>;
}

interface PairStat {
  sender: string;
  target: string;
  dead: string[];
  alive: number;
}

function effective(own: List, parent: List): List {
  return own === undefined || (Array.isArray(own) && own.length === 0) ? parent : own;
}

function refs(list: List): InspectorRef[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((ref) => ref.mode !== "ignore");
}

function wavesOf(
  rows: InspectorRef[],
  graph: Record<string, InspectorDecl>,
): Map<string, number> {
  const computed = wavesFromAfter(
    rows.map((row) => row.name),
    (name) => graph[name]?.after ?? [],
  );
  const out = new Map<string, number>();

  for (const row of rows) {
    out.set(row.name, row.wave ?? computed.get(row.name) ?? 0);
  }

  return out;
}

function deliverableFrom(
  target: string,
  sender: string,
  phase: Phase,
  byPhase: Record<Phase, PhaseRows>,
): boolean {
  const here = byPhase[phase];

  if (here.rows.some((row) => row.name === target)) {
    const to = here.waves.get(target);
    const from = here.waves.get(sender);

    if (to !== undefined && from !== undefined && to > from) {
      return true;
    }
  }

  return PHASES.slice(PHASES.indexOf(phase) + 1).some((later) =>
    byPhase[later].rows.some((row) => row.name === target),
  );
}

function deliverableOnRoute(
  target: string,
  sender: string,
  byPhase: Record<Phase, PhaseRows>,
): boolean {
  return PHASES.some(
    (phase) =>
      byPhase[phase].rows.some((row) => row.name === sender) &&
      deliverableFrom(target, sender, phase, byPhase),
  );
}

function enabled(own: Waf, parent: Waf): boolean {
  return (own.enabled ?? parent.enabled ?? true) !== false;
}

export function actionReceiverWarnings(
  source: NginxExport,
  targets: ActionTargets,
): ActionWarning[] {
  if (targets.size === 0) {
    return [];
  }

  const graph = (source.space.waf?.inspectors ?? {}) as Record<string, InspectorDecl>;
  const stats = new Map<string, PairStat>();

  const checkLeaf = (where: string, request: List, response: List) => {
    const byPhase: Record<Phase, PhaseRows> = {
      request: { rows: refs(request), waves: new Map() },
      response: { rows: refs(response), waves: new Map() },
    };
    byPhase.request.waves = wavesOf(byPhase.request.rows, graph);
    byPhase.response.waves = wavesOf(byPhase.response.rows, graph);

    const senders = new Set(PHASES.flatMap((p) => byPhase[p].rows.map((r) => r.name)));

    for (const sender of senders) {
      for (const target of targets.get(sender) ?? []) {
        if (target === "") {
          continue;
        }

        const key = `${sender}\n${target}`;
        let stat = stats.get(key);

        if (stat === undefined) {
          stat = { sender, target, dead: [], alive: 0 };
          stats.set(key, stat);
        }

        if (deliverableOnRoute(target, sender, byPhase)) {
          stat.alive += 1;
        } else {
          stat.dead.push(where);
        }
      }
    }
  };

  const pick = (waf: Waf, phase: Phase) =>
    phase === "request" ? waf.requestInspectors : waf.responseInspectors;

  for (const srv of source.servers) {
    if (!srv.server.enabled || srv.server.raw) continue;

    const leaves = srv.locations.filter((loc) => loc.enabled && !loc.raw);

    if (leaves.length === 0) {
      if (enabled(srv.server.waf, {})) {
        checkLeaf(
          `server "${srv.server.name}"`,
          pick(srv.server.waf, "request"),
          pick(srv.server.waf, "response"),
        );
      }
      continue;
    }

    for (const loc of leaves) {
      if (!enabled(loc.waf, srv.server.waf)) continue;

      checkLeaf(
        `location "${loc.path}" of server "${srv.server.name}"`,
        effective(pick(loc.waf, "request"), pick(srv.server.waf, "request")),
        effective(pick(loc.waf, "response"), pick(srv.server.waf, "response")),
      );
    }
  }

  const warnings: ActionWarning[] = [];

  for (const stat of stats.values()) {
    if (stat.dead.length === 0) {
      continue;
    }

    const known = Object.prototype.hasOwnProperty.call(graph, stat.target);
    const where =
      stat.dead.length === 1
        ? stat.dead[0]
        : `${stat.dead[0]} and ${stat.dead.length - 1} more route(s)`;

    warnings.push({
      code: "action_no_receiver",
      message:
        `inspector "${stat.sender}" addresses its actions to "${stat.target}", ` +
        (stat.alive > 0
          ? `which is not asked after it in ${where} ` +
            `(it is reachable on ${stat.alive} other route(s), so this may be intended)`
          : known
            ? `but "${stat.target}" is never asked after it on any route ` +
              `(${where})`
            : `and "${stat.target}" is not a declared inspector name at all ` +
              `(${where}). The action channel is addressed by declared names, ` +
              `not by process names`),
    });
  }

  return warnings;
}
