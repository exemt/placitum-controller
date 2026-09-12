import type { Pool } from "./db.ts";
import {
  DEFAULT_INSPECTOR_SETTINGS,
  isLogLevel,
  type InspectorSettings,
  type InspectorSettingsSource,
  type LogLevel,
} from "./inspector-settings.ts";
import type {
  Inspector,
  InspectorMeta,
  InspectorPhase,
} from "./model/http-space.ts";

interface InspectorRow {
  id: string;
  http_space_id: string;
  name: string;
  subject: string;
  phases: InspectorPhase[];
  description?: string;
  docs_url?: string;
  log_level?: string;
  conf?: string;
  position?: number;
  created_at?: Date;
  updated_at?: Date;
}

const META_COLS = `
  id, http_space_id, name, subject, phases, description, docs_url, log_level,
  position, created_at, updated_at
`;

// Словарь прибит ограничением в базе; чужое слово здесь -- снимок из
// старой базы без колонки, и это умолчание, а не ошибка.
function levelOf(raw: string | undefined): LogLevel {
  return isLogLevel(raw) ? raw : DEFAULT_INSPECTOR_SETTINGS.log_level;
}

function ofMeta(row: InspectorRow): InspectorMeta {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    subject: row.subject,
    // Пустого набора в базе не бывает (check), но строка могла приехать из
    // старого снимка: инспектор без фазы -- это инспектор запроса.
    phases: row.phases?.length ? row.phases : ["request"],
    description: row.description ?? "",
    docsUrl: row.docs_url ?? "",
    logLevel: levelOf(row.log_level),
    position: row.position ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofRow(row: InspectorRow): Inspector {
  return { ...ofMeta(row), conf: row.conf ?? "" };
}

export interface InspectorInsert {
  httpSpaceId: string;
  name: string;
  subject: string;
  phases?: InspectorPhase[];
  description?: string;
  docsUrl?: string;
  logLevel?: LogLevel;
  conf?: string;
}

export interface InspectorPatch {
  name?: string;
  subject?: string;
  phases?: InspectorPhase[];
  description?: string;
  docsUrl?: string;
  logLevel?: LogLevel;
  conf?: string;
}

export class InspectorRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<InspectorMeta[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<InspectorRow>(
            `select ${META_COLS} from inspectors order by position, name`,
          )
        : await this.pool.query<InspectorRow>(
            `select ${META_COLS} from inspectors
              where http_space_id = $1
              order by position, name`,
            [httpSpaceId],
          );

    return rows.map(ofMeta);
  }

  async get(id: string): Promise<Inspector | null> {
    const { rows } = await this.pool.query<InspectorRow>(
      `select ${META_COLS}, conf
         from inspectors where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofRow(rows[0]);
  }

  /*
   * Настройки процесса для сборщика поколения: по имени процесса, которое у
   * канала называется `consumer.name`. Записи нет -- умолчание: канал без
   * строки каталога всё равно собирается, а уровень у процесса тогда тот,
   * что задан окружением.
   *
   * Читается из базы, а не из снимка Redux, как и профили у остальных
   * сборщиков: планировщик сходимости честно читает Postgres.
   */
  async settingsOf(httpSpaceId: string, process: string): Promise<InspectorSettings> {
    const { rows } = await this.pool.query<{ log_level?: string }>(
      `select log_level from inspectors
        where http_space_id = $1 and name = $2`,
      [httpSpaceId, process],
    );

    return rows.length === 0
      ? DEFAULT_INSPECTOR_SETTINGS
      : { log_level: levelOf(rows[0].log_level) };
  }

  /** Тот же метод в форме источника для сборщиков и планировщика. */
  settingsSource(): InspectorSettingsSource {
    return (spaceId, process) => this.settingsOf(spaceId, process);
  }

  async insert(input: InspectorInsert): Promise<Inspector> {
    const { rows } = await this.pool.query<InspectorRow>(
      `insert into inspectors
         (http_space_id, name, subject, phases, description, docs_url, log_level,
          conf, position)
       values (
         $1, $2, $3, $4, $5, $6, $7, $8,
         coalesce(
           (select max(position) + 10 from inspectors where http_space_id = $1),
           10
         )
       )
       returning ${META_COLS}, conf`,
      [
        input.httpSpaceId,
        input.name,
        input.subject,
        input.phases?.length ? input.phases : ["request"],
        input.description ?? "",
        input.docsUrl ?? "",
        input.logLevel ?? DEFAULT_INSPECTOR_SETTINGS.log_level,
        input.conf ?? "",
      ],
    );

    return ofRow(rows[0]);
  }

  async update(id: string, patch: InspectorPatch): Promise<Inspector | null> {
    const { rows } = await this.pool.query<InspectorRow>(
      `update inspectors set
         name        = coalesce($2, name),
         subject     = coalesce($3, subject),
         phases      = coalesce($4, phases),
         conf        = coalesce($5, conf),
         description = coalesce($6, description),
         docs_url    = coalesce($7, docs_url),
         log_level   = coalesce($8, log_level),
         updated_at  = now()
       where id = $1
       returning ${META_COLS}, conf`,
      [
        id,
        patch.name ?? null,
        patch.subject ?? null,
        patch.phases?.length ? patch.phases : null,
        patch.conf ?? null,
        patch.description ?? null,
        patch.docsUrl ?? null,
        patch.logLevel ?? null,
      ],
    );

    return rows.length === 0 ? null : ofRow(rows[0]);
  }

  /*
   * Снятие записи каталога. Узел реестра и вызовы на маршрутах живут в
   * `*.waf`, не здесь: их проверяет HTTP-слой до вызова, иначе в реестре
   * остался бы узел с именем, которого больше нет в каталоге.
   */
  async delete(id: string): Promise<Inspector | null> {
    const current = await this.get(id);

    if (current === null) {
      return null;
    }

    await this.pool.query(`delete from inspectors where id = $1`, [id]);

    return current;
  }
}
