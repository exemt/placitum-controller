import type { NginxExport } from "./compile/nginx-source.ts";
import type { Pool } from "./db.ts";
import type { InspectorRef, WafRouteSettings } from "./model/waf-route.ts";

export interface GatedFastPathHit {
  at: string;
  inspector: string;
  profile: string;
}

export async function loadGatedAuthProfiles(
  pool: Pool,
  httpSpaceId: string,
): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ name: string }>(
    `select name from auth_profiles
      where http_space_id = $1
        and jsonb_array_length(coalesce(doc #> '{gate,groups}', '[]'::jsonb)) > 0`,
    [httpSpaceId],
  );

  return new Map(rows.map((row) => [row.name, row.name]));
}

export function gatedFastPathHits(
  source: NginxExport,
  gated: Map<string, string>,
): GatedFastPathHit[] {
  if (gated.size === 0) {
    return [];
  }

  const serviceByProcess = new Map(
    source.inspectors.map((row) => [row.name, row.subject.split(".").pop() ?? ""]),
  );

  const levels: { at: string; waf?: WafRouteSettings }[] = [
    { at: "space", waf: source.space.waf },
    ...source.servers.flatMap((srv) => [
      { at: `server ${srv.server.name}`, waf: srv.server.waf },
      ...srv.locations.map((loc) => ({
        at: `${srv.server.name} ${loc.match} ${loc.path}`,
        waf: loc.waf,
      })),
    ]),
  ];

  const gatedDecls = new Map<string, string>();

  for (const level of levels) {
    for (const [name, decl] of Object.entries(level.waf?.inspectors ?? {})) {
      const process = decl.process ?? name;

      if (serviceByProcess.get(process) !== "auth") {
        continue;
      }

      const profile =
        decl.profile === undefined || decl.profile === "" ? "default" : decl.profile;

      if (gated.has(profile)) {
        gatedDecls.set(name, profile);
      }
    }
  }

  if (gatedDecls.size === 0) {
    return [];
  }

  const hits: GatedFastPathHit[] = [];

  for (const level of levels) {
    const list = level.waf?.requestInspectors;

    if (!Array.isArray(list)) {
      continue;
    }

    for (const ref of list as InspectorRef[]) {
      const profile = gatedDecls.get(ref.name);

      if (profile !== undefined && (ref.conds ?? []).length > 0) {
        hits.push({ at: level.at, inspector: ref.name, profile });
      }
    }
  }

  return hits;
}
