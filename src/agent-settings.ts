import type { Pool } from "./db.ts";
import type { AgentSettings } from "./model/agent.ts";

interface AgentRow {
  http_space_id: string;
  settings: AgentSettings;
  updated_at: Date;
}

export interface AgentSettingsRow {
  httpSpaceId: string;
  settings: AgentSettings;
  updatedAt: Date | null;
}

function ofRow(row: AgentRow): AgentSettingsRow {
  return {
    httpSpaceId: row.http_space_id,
    settings: row.settings ?? {},
    updatedAt: row.updated_at,
  };
}

export class AgentSettingsRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async get(httpSpaceId: string): Promise<AgentSettingsRow> {
    const { rows } = await this.pool.query<AgentRow>(
      `select http_space_id, settings, updated_at
         from agent_settings
        where http_space_id = $1`,
      [httpSpaceId],
    );

    return rows.length === 0
      ? { httpSpaceId, settings: {}, updatedAt: null }
      : ofRow(rows[0]);
  }

  async save(
    httpSpaceId: string,
    settings: AgentSettings,
  ): Promise<AgentSettingsRow> {
    const { rows } = await this.pool.query<AgentRow>(
      `insert into agent_settings (http_space_id, settings)
       values ($1, $2)
       on conflict (http_space_id) do update
          set settings = excluded.settings, updated_at = now()
       returning http_space_id, settings, updated_at`,
      [httpSpaceId, JSON.stringify(settings)],
    );

    return ofRow(rows[0]);
  }
}
