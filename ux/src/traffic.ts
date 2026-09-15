import { useMemo } from "react";

import type { RouteTrafficView, StatusRates } from "./fleet.ts";
import { useAppSelector } from "./store/hooks.ts";

export const ZERO_CODES: StatusRates = {
  "2xx": 0,
  "3xx": 0,
  "4xx": 0,
  "5xx": 0,
};

export interface Traffic {
  rps: number;
  codes: StatusRates;
  nodes: number;
}

export function nginxServerName(row: { server_names: string[] }): string {
  return row.server_names[0] ?? "_";
}

export function nginxLocationName(row: { match: string; path: string }): string {
  return row.match === "named" ? `@${row.path.replace(/^@/, "")}` : row.path;
}

export function routeKey(server: string, location: string): string {
  return `${server}\n${location}`;
}

export function useTrafficLive(): boolean {
  return useAppSelector((s) => s.fleet.snapshot !== null);
}

const EMPTY: RouteTrafficView[] = [];

function useRoutes(): RouteTrafficView[] {
  return useAppSelector((s) => s.fleet.snapshot?.routes) ?? EMPTY;
}

export function useRouteTraffic(): Map<string, Traffic> {
  const routes = useRoutes();

  return useMemo(() => {
    const out = new Map<string, Traffic>();
    for (const row of routes) {
      const traffic = {
        rps: row.rps,
        codes: row.codes,
        nodes: row.nodes,
      };
      out.set(row.id ?? routeKey(row.server, row.location), traffic);
    }
    return out;
  }, [routes]);
}

export function useServerTraffic(): Map<string, Traffic> {
  const routes = useRoutes();

  return useMemo(() => {
    const out = new Map<string, Traffic>();
    for (const row of routes) {
      const was = out.get(row.server);
      if (was === undefined) {
        out.set(row.server, {
          rps: row.rps,
          codes: { ...row.codes },
          nodes: row.nodes,
        });
        continue;
      }
      was.rps += row.rps;
      was.nodes = Math.max(was.nodes, row.nodes);
      for (const cls of ["2xx", "3xx", "4xx", "5xx"] as const) {
        was.codes[cls] += row.codes[cls];
      }
    }
    return out;
  }, [routes]);
}
