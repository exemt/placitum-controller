/**
 * Хранение настроек haproxy: одна строка на пространство.
 *
 * Строки может не быть вовсе -- это нормальное состояние контура, который
 * живёт на поставочном конфиге. Тогда `get` возвращает пустой документ, а не
 * 404: страница должна открыться и показать умолчания, а не ошибку.
 */

import type { Pool } from "./db.ts";
import type { HaproxySettings } from "./model/haproxy.ts";

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

function ofRow(row: HaproxyRow): HaproxySettingsRow {
  return {
    httpSpaceId: row.http_space_id,
    settings: row.settings ?? {},
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
