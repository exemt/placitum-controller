import type { Pool } from "./db.ts";
import type { HaproxyEntry, HaproxySettings } from "./model/haproxy.ts";

interface HaproxyRow {
  http_space_id: string;
  settings: HaproxySettings;
  updated_at: Date;
}

export interface HaproxySettingsRow {
  httpSpaceId: string;
  settings: HaproxySettings;
  updatedAt: Date | null;
}

// Settings saved before the entry points came from the ports: frontends written by the installer
// carried the addresses of the machine and the entry port in front of every node port. They become
// entry, and the per-server port goes -- the node port is the port of the panel now.
export function ofStoredHaproxy(raw: unknown): HaproxySettings {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const stored = { ...(raw as Record<string, unknown>) };
  const frontends = stored.frontends;

  if (stored.entry === undefined && Array.isArray(frontends)) {
    const entry: HaproxyEntry = {};
    const ports: Record<string, number> = {};

    for (const row of frontends as Record<string, unknown>[]) {
      if (entry.addresses === undefined && Array.isArray(row.addresses)) {
        entry.addresses = row.addresses.filter((a): a is string => typeof a === "string");
      }
      if (
        typeof row.serverPort === "number" &&
        typeof row.port === "number" &&
        row.serverPort !== row.port
      ) {
        ports[String(row.serverPort)] = row.port;
      }
    }

    if (Object.keys(ports).length > 0) entry.ports = ports;
    if (Object.keys(entry).length > 0) stored.entry = entry;
  }

  delete stored.frontends;
  delete stored.frontend;

  const backend = stored.backend;
  if (backend !== null && typeof backend === "object" && Array.isArray((backend as Record<string, unknown>).servers)) {
    const rows = (backend as Record<string, unknown>).servers as Record<string, unknown>[];
    stored.backend = {
      ...(backend as Record<string, unknown>),
      servers: rows.map((row) => ({ name: row.name, host: row.host })),
    };
  }

  return stored as HaproxySettings;
}

function ofRow(row: HaproxyRow): HaproxySettingsRow {
  return {
    httpSpaceId: row.http_space_id,
    settings: ofStoredHaproxy(row.settings),
    updatedAt: row.updated_at,
  };
}

export class HaproxySettingsRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async get(httpSpaceId: string): Promise<HaproxySettingsRow> {
    const { rows } = await this.pool.query<HaproxyRow>(
      `select http_space_id, settings, updated_at
         from haproxy_settings
        where http_space_id = $1`,
      [httpSpaceId],
    );

    return rows.length === 0
      ? { httpSpaceId, settings: {}, updatedAt: null }
      : ofRow(rows[0]);
  }

  async save(
    httpSpaceId: string,
    settings: HaproxySettings,
  ): Promise<HaproxySettingsRow> {
    const { rows } = await this.pool.query<HaproxyRow>(
      `insert into haproxy_settings (http_space_id, settings)
       values ($1, $2)
       on conflict (http_space_id) do update
          set settings = excluded.settings, updated_at = now()
       returning http_space_id, settings, updated_at`,
      [httpSpaceId, JSON.stringify(settings)],
    );

    return ofRow(rows[0]);
  }
}
