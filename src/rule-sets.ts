import {
  normalizePolicy,
  policyIsEmpty,
  renderPolicyYaml,
  validatePolicy,
  type ModsecPolicy,
} from "./modsec-policy-doc.ts";
import type { RuleCompileSource } from "./compile/rules.ts";
import type { Pool } from "./db.ts";
import { loadSenderCodes, type SenderCode } from "./sender-codes.ts";
import type { RuleFileRepo } from "./rule-files.ts";
import type {
  RuleSet,
  RuleSetDataFile,
  RuleSetMember,
  RuleSetMeta,
} from "./model/rule-set.ts";

interface RuleSetRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  files?: string | number;
  created_at: Date;
  updated_at: Date;
}

interface MemberRow {
  file_id: string;
  name: string;
}

function ofMeta(row: RuleSetRow): RuleSetMeta {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    files: Number(row.files ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofMember(row: MemberRow): RuleSetMember {
  return {
    fileId: row.file_id,
    name: row.name,
  };
}

export interface RuleSetInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  files: string[];
  /** Наборы вида content для операторов `*FromFile`. */
  dataFiles?: string[];
}

export interface RuleSetPatch {
  name?: string;
  description?: string;
  files?: string[];
  /** Наборы вида content для операторов `*FromFile`. */
  dataFiles?: string[];
  /** Политика профиля целиком: обе стороны канала действий. */
  policy?: ModsecPolicy;
}

export class RuleSetRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /*
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах prior. Список общий на пространство: собирает
   * его `sender-codes.ts`, здесь только вход в базу для роутера.
   */
  async senderCodes(httpSpaceId: string): Promise<SenderCode[]> {
    return loadSenderCodes(this.pool, httpSpaceId);
  }

  async list(httpSpaceId?: string): Promise<RuleSetMeta[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<RuleSetRow>(
            `select s.id, s.http_space_id, s.name, s.description,
                    (select count(*) from rule_set_files f where f.rule_set_id = s.id) as files,
                    s.created_at, s.updated_at
               from rule_sets s
              order by s.name`,
          )
        : await this.pool.query<RuleSetRow>(
            `select s.id, s.http_space_id, s.name, s.description,
                    (select count(*) from rule_set_files f where f.rule_set_id = s.id) as files,
                    s.created_at, s.updated_at
               from rule_sets s
              where s.http_space_id = $1
              order by s.name`,
            [httpSpaceId],
          );

    return rows.map(ofMeta);
  }

  async get(id: string): Promise<RuleSet | null> {
    const { rows } = await this.pool.query<RuleSetRow & { policy: unknown }>(
      `select id, http_space_id, name, description, policy, created_at, updated_at
         from rule_sets
        where id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    const files = await this.membersOf(id);
    const data = await dataOfClient(this.pool, id);

    return {
      ...ofMeta({ ...rows[0], files: files.length }),
      files,
      data,
      // Документ нормализуется на чтении: запись, сделанная до появления поля,
      // обязана читаться, а не ронять карточку.
      policy: normalizePolicy(rows[0].policy),
    };
  }

  async insert(
    input: RuleSetInsert,
  ): Promise<RuleSet | "unknown_file" | "unknown_data_file"> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const { rows } = await client.query<RuleSetRow>(
        `insert into rule_sets (http_space_id, name, description)
         values ($1, $2, $3)
         returning id, http_space_id, name, description, created_at, updated_at`,
        [input.httpSpaceId, input.name, input.description],
      );

      const row = rows[0];
      const files = await replaceMembers(
        client,
        row.id,
        input.httpSpaceId,
        input.files,
      );

      if (files === "unknown_file") {
        await client.query("rollback");
        return "unknown_file";
      }

      const data = await replaceData(
        client,
        row.id,
        input.httpSpaceId,
        input.dataFiles ?? [],
      );

      if (data === "unknown_data_file") {
        await client.query("rollback");
        return "unknown_data_file";
      }

      await client.query("commit");

      // Новый профиль политики ещё не имеет: пустая -- обычное состояние.
      return {
        ...ofMeta({ ...row, files: files.length }),
        files,
        data,
        policy: normalizePolicy(null),
      };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    patch: RuleSetPatch,
  ): Promise<RuleSet | "unknown_file" | "unknown_data_file" | null> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const { rows } = await client.query<RuleSetRow & { policy: unknown }>(
        `update rule_sets set
           name        = coalesce($2, name),
           description = coalesce($3, description),
           policy      = coalesce($4::jsonb, policy),
           updated_at  = now()
         where id = $1
         returning id, http_space_id, name, description, policy, created_at, updated_at`,
        [
          id,
          patch.name ?? null,
          patch.description ?? null,
          patch.policy === undefined ? null : JSON.stringify(patch.policy),
        ],
      );

      if (rows.length === 0) {
        await client.query("rollback");
        return null;
      }

      const row = rows[0];
      const files =
        patch.files === undefined
          ? await membersOfClient(client, id)
          : await replaceMembers(client, id, row.http_space_id, patch.files);

      if (files === "unknown_file") {
        await client.query("rollback");
        return "unknown_file";
      }

      const data =
        patch.dataFiles === undefined
          ? await dataOfClient(client, id)
          : await replaceData(client, id, row.http_space_id, patch.dataFiles);

      if (data === "unknown_data_file") {
        await client.query("rollback");
        return "unknown_data_file";
      }

      await client.query("commit");

      return {
        ...ofMeta({ ...row, files: files.length }),
        files,
        data,
        policy: normalizePolicy(row.policy),
      };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async membersOf(ruleSetId: string): Promise<RuleSetMember[]> {
    return membersOfClient(this.pool, ruleSetId);
  }

  /** Строки состава уходят каскадом; ссылки с маршрутов снимает вызывающий. */
  async delete(id: string): Promise<RuleSet | null> {
    const current = await this.get(id);

    if (current === null) {
      return null;
    }

    await this.pool.query(`delete from rule_sets where id = $1`, [id]);

    return current;
  }

  /** Каталог списков и профили как последовательности uuid — для compile. */
  async exportCompile(
    httpSpaceId: string,
    files: RuleFileRepo,
  ): Promise<RuleCompileSource> {
    const catalog = await files.listWithText(httpSpaceId);
    const { rows } = await this.pool.query<{
      set_name: string;
      file_id: string;
    }>(
      `select s.name as set_name, f.id as file_id
         from rule_sets s
         join rule_set_files m on m.rule_set_id = s.id
         join rule_files f on f.id = m.rule_file_id
        where s.http_space_id = $1
        order by s.name, m.position, f.name`,
      [httpSpaceId],
    );

    const { rows: sets } = await this.pool.query<{ name: string; policy: unknown }>(
      `select name, policy from rule_sets
        where http_space_id = $1
        order by name`,
      [httpSpaceId],
    );

    /*
     * Политика профиля печатается здесь, а не в паке: пак хеширует тексты, и
     * решать по документу, что положить в файл, -- дело того, кто документ
     * читает. Пустая политика файла не заводит.
     */
    const profiles = sets.map((row) => {
      const policy = validatePolicy(row.policy);

      return {
        name: row.name,
        files: [] as string[],
        data: [] as { name: string; text: string }[],
        policy: policyIsEmpty(policy) ? undefined : renderPolicyYaml(row.name, policy),
      };
    });
    const byName = new Map(profiles.map((row) => [row.name, row]));

    for (const row of rows) {
      byName.get(row.set_name)?.files.push(row.file_id);
    }

    /*
     * Файлы данных профиля: тела читаются здесь же, потому что пак хеширует
     * тексты. Пустое тело едет пустым файлом, а не пропуском: правило с
     * @pmFromFile на отсутствующий файл уронило бы загрузку у инспектора.
     */
    const { rows: dataRows } = await this.pool.query<{
      set_name: string;
      name: string;
      content_type: string;
      body: Buffer | null;
    }>(
      `select s.name as set_name, d.name, ct.name as content_type, c.body
         from rule_set_data m
         join rule_sets s on s.id = m.rule_set_id
         join datasets d on d.id = m.dataset_id
         join content_types ct on ct.id = d.content_type_id
         left join dataset_contents c on c.dataset_id = d.id
        where s.http_space_id = $1
        order by s.name, m.position, d.name`,
      [httpSpaceId],
    );

    for (const row of dataRows) {
      byName.get(row.set_name)?.data.push({
        name: dataFileName(row.name, row.content_type),
        text: row.body === null ? "" : row.body.toString("utf8"),
      });
    }

    return {
      files: catalog.map((row) => ({
        id: row.id,
        name: row.name,
        text: row.textRaw,
      })),
      profiles,
    };
  }

  /** Полный состав пространства для `send`: имя профиля и тексты файлов. */
  async exportSpace(
    httpSpaceId: string,
  ): Promise<{ name: string; files: { name: string; text: string }[] }[]> {
    const { rows } = await this.pool.query<{
      set_name: string;
      file_name: string;
      text_raw: string;
    }>(
      `select s.name as set_name, f.name as file_name, f.text_raw
         from rule_sets s
         join rule_set_files m on m.rule_set_id = s.id
         join rule_files f on f.id = m.rule_file_id
        where s.http_space_id = $1
        order by s.name, m.position, f.name`,
      [httpSpaceId],
    );

    const byName = new Map<
      string,
      { name: string; files: { name: string; text: string }[] }
    >();

    const { rows: sets } = await this.pool.query<{ name: string }>(
      `select name from rule_sets
        where http_space_id = $1
        order by name`,
      [httpSpaceId],
    );

    for (const row of sets) {
      byName.set(row.name, { name: row.name, files: [] });
    }

    for (const row of rows) {
      const set = byName.get(row.set_name);

      if (set === undefined) {
        continue;
      }

      set.files.push({ name: row.file_name, text: row.text_raw });
    }

    return [...byName.values()];
  }
}

type Queryable = {
  query: Pool["query"];
};

/*
 * Имя файла данных на диске инспектора: имя набора плюс расширение по типу
 * содержимого. Та же формула, что у страниц отказа на ноде (nginx-export):
 * оператор пишет в правиле `@pmFromFile sqli_keywords.txt` и видит то же имя
 * в разделе «Файлы».
 */
const DATA_EXTENSIONS: Record<string, string> = {
  html: ".html",
  json: ".json",
  xml: ".xml",
  text: ".txt",
};

function dataFileName(dataset: string, type: string): string {
  return `${dataset}${DATA_EXTENSIONS[type] ?? ""}`;
}

interface DataRow {
  dataset_id: string;
  name: string;
  content_type: string;
}

function ofDataFile(row: DataRow): RuleSetDataFile {
  return {
    datasetId: row.dataset_id,
    name: row.name,
    file: dataFileName(row.name, row.content_type),
  };
}

async function dataOfClient(
  db: Queryable,
  ruleSetId: string,
): Promise<RuleSetDataFile[]> {
  const { rows } = await db.query<DataRow>(
    `select d.id as dataset_id, d.name, ct.name as content_type
       from rule_set_data m
       join datasets d on d.id = m.dataset_id
       join content_types ct on ct.id = d.content_type_id
      where m.rule_set_id = $1
      order by m.position, d.name`,
    [ruleSetId],
  );

  return rows.map(ofDataFile);
}

/*
 * Замена привязок файлов данных. Принимаются только текстовые наборы вида
 * content: двоичному телу в SecLang-операторе делать нечего, а список фраз с
 * live-набора адресов сюда не привязывают -- у того другой транспорт.
 */
async function replaceData(
  db: Queryable,
  ruleSetId: string,
  httpSpaceId: string,
  datasetIds: string[],
): Promise<RuleSetDataFile[] | "unknown_data_file"> {
  if (datasetIds.length > 0) {
    const unique = new Set(datasetIds);

    if (unique.size !== datasetIds.length) {
      return "unknown_data_file";
    }

    const { rows } = await db.query<{ id: string }>(
      `select d.id
         from datasets d
         join content_types ct on ct.id = d.content_type_id
        where d.http_space_id = $1
          and d.id = any($2::uuid[])
          and d.kind = 'content'
          and ct.name in ('text', 'json', 'xml', 'html')`,
      [httpSpaceId, datasetIds],
    );

    if (rows.length !== unique.size) {
      return "unknown_data_file";
    }
  }

  await db.query(`delete from rule_set_data where rule_set_id = $1`, [
    ruleSetId,
  ]);

  if (datasetIds.length === 0) {
    return [];
  }

  await db.query(
    `insert into rule_set_data (rule_set_id, dataset_id, position)
     select $1, x.id, x.ord - 1
       from unnest($2::uuid[]) with ordinality as x(id, ord)`,
    [ruleSetId, datasetIds],
  );

  return dataOfClient(db, ruleSetId);
}

async function membersOfClient(
  db: Queryable,
  ruleSetId: string,
): Promise<RuleSetMember[]> {
  const { rows } = await db.query<MemberRow>(
    `select f.id as file_id, f.name
       from rule_set_files m
       join rule_files f on f.id = m.rule_file_id
      where m.rule_set_id = $1
      order by m.position, f.name`,
    [ruleSetId],
  );

  return rows.map(ofMember);
}

async function replaceMembers(
  db: Queryable,
  ruleSetId: string,
  httpSpaceId: string,
  fileIds: string[],
): Promise<RuleSetMember[] | "unknown_file"> {
  if (fileIds.length > 0) {
    const unique = new Set(fileIds);

    if (unique.size !== fileIds.length) {
      return "unknown_file";
    }

    const { rows } = await db.query<{ id: string }>(
      `select id from rule_files
        where http_space_id = $1 and id = any($2::uuid[])`,
      [httpSpaceId, fileIds],
    );

    if (rows.length !== unique.size) {
      return "unknown_file";
    }
  }

  await db.query(`delete from rule_set_files where rule_set_id = $1`, [
    ruleSetId,
  ]);

  if (fileIds.length === 0) {
    return [];
  }

  await db.query(
    `insert into rule_set_files (rule_set_id, rule_file_id, position)
     select $1, x.id, x.ord - 1
       from unnest($2::uuid[]) with ordinality as x(id, ord)`,
    [ruleSetId, fileIds],
  );

  return membersOfClient(db, ruleSetId);
}
