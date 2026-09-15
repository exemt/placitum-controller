import type {
  Cond,
  InspectorRef,
  WafRouteSettings,
} from "./model/waf-route.ts";
import { selectInspectorsInSpace } from "./state/slices/inspectors.ts";
import { selectLocationsInSpace } from "./state/slices/locations.ts";
import { selectServersInSpace } from "./state/slices/servers.ts";
import { spaceSelectors } from "./state/slices/spaces.ts";
import type { RootState } from "./state/types.ts";

export interface Use {
  at: string;
  kind: string;
  by?: string;
}

interface UseScope {
  at: string;
  waf?: WafRouteSettings;
}

function scopesOf(state: RootState, scope: string): UseScope[] {
  const space = spaceSelectors.selectById(state, scope);
  const servers = selectServersInSpace(state, scope);
  const locations = selectLocationsInSpace(state, scope);

  return [
    { at: "space", waf: space?.waf },
    ...servers.map((row) => ({ at: `server ${row.name}`, waf: row.waf })),
    ...locations.map((row) => ({ at: `location ${row.path}`, waf: row.waf })),
  ];
}

export function profileUses(
  state: RootState,
  scope: string,
  service: string,
  profile: string,
): Use[] {
  const serviceByName = new Map(
    selectInspectorsInSpace(state, scope).map((row) => [
      row.name,
      row.subject.split(".").pop() ?? "",
    ]),
  );

  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const graph = level.waf?.inspectors ?? {};

    for (const [name, decl] of Object.entries(graph)) {
      const process = decl.process ?? name;

      if (serviceByName.get(process) !== service) {
        continue;
      }

      const named =
        decl.profile === undefined || decl.profile === ""
          ? "default"
          : decl.profile;

      if (named === profile) {
        out.push({ at: level.at, kind: "profile", by: name });
      }
    }
  }

  return out;
}

function condsHold(conds: Cond[] | undefined, dataset: string): boolean {
  return (conds ?? []).some((cond) => cond.dataset === dataset);
}

export function authFastPathUses(
  state: RootState,
  scope: string,
  profile: string,
): Use[] {
  const gates = new Set(
    profileUses(state, scope, "auth", profile).map((use) => use.by ?? ""),
  );

  if (gates.size === 0) {
    return [];
  }

  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const list = level.waf?.requestInspectors;

    if (!Array.isArray(list)) {
      continue;
    }

    for (const ref of list as InspectorRef[]) {
      if (gates.has(ref.name) && (ref.conds ?? []).length > 0) {
        out.push({ at: level.at, kind: "cond", by: ref.name });
      }
    }
  }

  return out;
}

export function datasetWafUses(
  state: RootState,
  scope: string,
  name: string,
): Use[] {
  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const waf = level.waf;

    if (waf === undefined) {
      continue;
    }

    for (const check of waf.localChecks ?? []) {
      if (check.dataset === name) {
        out.push({ at: level.at, kind: "check", by: check.variable });
      } else if (condsHold(check.conds, name)) {
        out.push({ at: level.at, kind: "cond", by: check.variable });
      }
    }

    for (const rate of waf.localRates ?? []) {
      if (rate.list === name) {
        out.push({ at: level.at, kind: "rate", by: rate.key });
      } else if (condsHold(rate.conds, name)) {
        out.push({ at: level.at, kind: "cond", by: rate.key });
      }
    }

    for (const list of [waf.requestInspectors, waf.responseInspectors, waf.frameInspectors]) {
      if (!Array.isArray(list)) {
        continue;
      }

      for (const ref of list as InspectorRef[]) {
        if (condsHold(ref.conds, name)) {
          out.push({ at: level.at, kind: "cond", by: ref.name });
        }
      }
    }
  }

  return out;
}

export function denyResponseUses(
  state: RootState,
  scope: string,
  name: string,
): Use[] {
  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const waf = level.waf;

    if (waf === undefined) {
      continue;
    }

    if (waf.denyResponseDefault === name) {
      out.push({ at: level.at, kind: "default" });
    }

    if (waf.scoreDeny?.response === name) {
      out.push({ at: level.at, kind: "score", by: "request" });
    }

    if (waf.responseScoreDeny?.response === name) {
      out.push({ at: level.at, kind: "score", by: "response" });
    }

    for (const check of waf.localChecks ?? []) {
      if (check.response === name) {
        out.push({ at: level.at, kind: "check", by: check.variable });
      }
    }

    for (const rate of waf.localRates ?? []) {
      if (rate.response === name) {
        out.push({ at: level.at, kind: "rate", by: rate.key });
      }
    }
  }

  return out;
}

export function usesDetail(uses: Use[]): string {
  const shown = uses.slice(0, 5).map((use) => {
    const place = use.by === undefined ? use.at : `${use.by} @ ${use.at}`;
    return `${use.kind} ${place}`;
  });

  const more = uses.length - shown.length;

  return more > 0 ? `${shown.join(", ")} +${more}` : shown.join(", ");
}
