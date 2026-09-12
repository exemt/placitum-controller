import { createHash } from "node:crypto";

import type { CompileRedis, LiveEntry } from "./compile/redis.ts";
import type { Pool } from "./db.ts";
import {
  isDatasetKind,
  isDatasetType,
  type ContentType,
  type Dataset,
  type DatasetAddress,
  type DatasetContent,
  type DatasetKind,
  type DatasetType,
} from "./model/http-space.ts";
import { pageVars } from "./page-vars.ts";

interface DatasetRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  kind: string;
  type: string;
  content_type_id: string | null;
  max_entries: number;
  active: boolean;
  builtin?: boolean;
  in_nginx?: boolean;
  ttl?: string | null;
  hash?: boolean;
  size?: string | number;
  page_body?: Buffer | null;
  created_at: Date;
  updated_at: Date;
}

interface ContentTypeRow {
  id: string;
  name: string;
  mime: string;
  description: string;
}

interface ContentRow {
  dataset_id: string;
  name: string;
  body: Buffer;
  size?: string | number;
  updated_at: Date;
}

interface AddressRow {
  id: string;
  dataset_id: string;
  address: string;
  ttl_s: number;
  expires_at: Date | null;
  origin: string;
  reason: string;
}

interface ProfileLinkRow {
  dataset_id: string;
  set_id: string;
  name: string;
  exclude: boolean;
}

/**
 * Кто включает этот список. Составной набор, а не профиль: сторон у профиля
 * больше нет, а «кто меня включает» -- вопрос про наборы.
 */
export interface DatasetSetLink {
  datasetId: string;
  setId: string;
  name: string;
  exclude: boolean;
}

function ofDataset(row: DatasetRow): Dataset {
  if (!isDatasetKind(row.kind)) {
    throw new Error(`unknown dataset kind "${row.kind}"`);
  }

  if (!isDatasetType(row.type)) {
    throw new Error(`unknown dataset type "${row.type}"`);
  }

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    type: row.type,
    contentTypeId: row.content_type_id ?? undefined,
    maxEntries: row.max_entries,
    active: row.active,
    builtin: row.builtin === true,
    inNginx: row.in_nginx ?? false,
    ttl: row.ttl ?? undefined,
    hash: row.hash === true,
    size: Number(row.size ?? 0),
    vars:
      row.page_body === undefined || row.page_body === null
        ? undefined
        : pageVars(row.page_body.toString("utf8")),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofContentType(row: ContentTypeRow): ContentType {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    description: row.description,
  };
}

function ofContent(row: ContentRow): DatasetContent {
  return {
    datasetId: row.dataset_id,
    name: row.name,
    body: row.body,
    size: Number(row.size ?? row.body.length),
    updatedAt: row.updated_at,
  };
}

function ofAddress(row: AddressRow): DatasetAddress {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    address: row.address,
    ttlS: row.ttl_s,
    expiresAt: row.expires_at ?? undefined,
    origin: row.origin,
    reason: row.reason,
  };
}

/* Потолок обратной карты идентификаторов записей активных наборов. */
const LIVE_IDS_MAX = 200_000;

/*
 * Идентификатор записи активного набора: у keeper записи адресуются
 * значением, у панели -- uuid. Детерминированный uuid от (набор, значение) в
 * форме v4, чтобы проходить те же проверки, что и строки Postgres.
 */
function liveAddressId(datasetId: string, value: string): string {
  const h = createHash("md5").update(`${datasetId}\0${value}`).digest("hex");

  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function ofProfileLink(row: ProfileLinkRow): DatasetSetLink {
  return {
    datasetId: row.dataset_id,
    setId: row.set_id,
    name: row.name,
    exclude: row.exclude,
  };
}

function groupProfileLinks(
  rows: ProfileLinkRow[],
): Map<string, DatasetSetLink[]> {
  const links = new Map<string, DatasetSetLink[]>();

  for (const row of rows) {
    const item = ofProfileLink(row);
    const list = links.get(item.datasetId) ?? [];
    list.push(item);
    links.set(item.datasetId, list);
  }

  return links;
}

const SIZE_EXPR = `case
                     when d.kind = 'content' then coalesce(
                       (select length(c.body) from dataset_contents c where c.dataset_id = d.id),
                       0)
                     else (select count(*) from dataset_addresses a
                            where a.dataset_id = d.id
                              and (a.expires_at is null or a.expires_at > now()))
                   end`;

/*
 * Тело содержимого едет рядом с мета-строкой: из него считаются имена
 * переменных страницы (pageVars). Только текстовые типы и только вменяемый
 * размер -- картинку разбирать нечем, а таскать её в каждом списке наборов
 * незачем.
 */
const PAGE_BODY_EXPR = `case
                          when d.kind = 'content' then
                            (select c.body from dataset_contents c
                              where c.dataset_id = d.id
                                and length(c.body) <= 262144
                                and exists (select 1 from content_types t
                                             where t.id = d.content_type_id
                                               and t.name in ('html', 'json', 'xml', 'text')))
                        end`;

const META_COLS = `d.id, d.http_space_id, d.name, d.description, d.kind, d.type,
                   d.content_type_id, d.max_entries, d.active, d.ttl,
                   coalesce(d.in_nginx, false) as in_nginx,
                   coalesce(d.builtin, false) as builtin,
                   coalesce(d.hash, false) as hash,
                   ${SIZE_EXPR} as size, ${PAGE_BODY_EXPR} as page_body,
                   d.created_at, d.updated_at`;

const ADDR_COLS = `id, dataset_id, address, ttl_s, expires_at, origin, reason`;

export interface DatasetInsert {
  httpSpaceId: string;
  name: string;
  description?: string;
  kind: DatasetKind;
  type: DatasetType;
  contentTypeId?: string;
  maxEntries: number;
  active?: boolean;
  ttl?: string;
  /**
   * Слот `waf_local_dataset` в шаблоне. Разделяет наборы локального слоя и
   * наборы ip-компилятора, которые слотом не бывают и живут в той же таблице.
   * Наружу не выходит: список локального слоя заводят там, где он локальный.
   */
  inNginx?: boolean;
  /** `hash=md5`: состав -- md5 значений. Только у списка строк. */
  hash?: boolean;
}

export interface DatasetPatch {
  name?: string;
  description?: string;
  maxEntries?: number;
  active?: boolean;
  ttl?: string | null;
  /**
   * Объявлен ли набор слотом `waf_local_dataset` в шаблоне.
   *
   * Компилятор печатает только те, у кого флаг стоит: набор существует в
   * контроллере всегда, а в конфиг попадает по решению оператора. Задать флаг
   * было нельзя ничем -- список заводился, но объявить его в nginx можно было
   * только правкой базы.
   */
  inNginx?: boolean;
  /**
   * `hash=md5`. Меняется только у пустого набора: записи, положенные сырыми,
   * после смены флага не совпали бы ни разу, а положенные хешами -- стали бы
   * нечитаемым мусором. Проверяет HTTP-слой.
   */
  hash?: boolean;
}

export interface AddressWrite {
  address: string;
  ttlS?: number;
  origin?: string;
  reason?: string;
}

export class DatasetRepo {
  private readonly pool: Pool;

  /*
   * Состав активных наборов живёт у keeper во внутреннем Redis, не в
   * Postgres (docs/spec.md репозитория keeper): записи, размер и поиск по ним читаются оттуда.
   * null -- внутренний Redis не назван, и активные наборы читаются пустыми.
   */
  private readonly live: CompileRedis | null;

  /*
   * Идентификаторы записей активного набора: у keeper их нет, панели они
   * нужны, чтобы удалить строку, которую она только что показала. Синтетика
   * от (набор, значение), и обратная карта -- в памяти процесса: удалять
   * можно то, что перечислено или внесено этим же контроллером.
   */
  private readonly liveIds = new Map<string, { datasetId: string; value: string }>();

  constructor(pool: Pool, live: CompileRedis | null = null) {
    this.pool = pool;
    this.live = live;
  }

  private liveAddress(dataset: Dataset, e: LiveEntry, remember = true): DatasetAddress {
    const id = liveAddressId(dataset.id, e.value);

    if (remember) {
      if (this.liveIds.size >= LIVE_IDS_MAX) {
        this.liveIds.clear();
      }

      this.liveIds.set(id, { datasetId: dataset.id, value: e.value });
    }

    const left = e.expMs === 0 ? 0 : Math.max(0, Math.ceil((e.expMs - Date.now()) / 1000));

    return {
      id,
      datasetId: dataset.id,
      address: e.value,
      ttlS: left,
      expiresAt: e.expMs === 0 ? undefined : new Date(e.expMs),
      origin: e.origin,
      reason: e.reason,
    };
  }

  private isLive(dataset: Dataset): boolean {
    return this.live !== null && dataset.kind === "list" && dataset.active === true;
  }

  /*
   * Размер активного набора -- у keeper; SQL-выражение над dataset_addresses
   * у него давало бы ноль. Redis недоступен -- размер остаётся нулём, панель
   * это переживает. Открыт наружу: списки из модели в памяти держат размер
   * с гидрации, а живой набор растёт без участия контроллера.
   */
  async withLiveSizes(rows: Dataset[]): Promise<Dataset[]> {
    const alive = rows.filter((d) => this.isLive(d));

    if (alive.length === 0 || this.live === null) {
      return rows;
    }

    try {
      const sizes = await this.live.liveSizes(alive.map((d) => d.name));

      for (let i = 0; i < alive.length; i++) {
        alive[i].size = sizes[i];
      }
    } catch {
      /* внутренний Redis не отвечает: размеры остаются из SQL */
    }

    return rows;
  }

  async list(httpSpaceId?: string): Promise<Dataset[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<DatasetRow>(
            `select ${META_COLS} from datasets d order by d.name`,
          )
        : await this.pool.query<DatasetRow>(
            `select ${META_COLS} from datasets d
              where d.http_space_id = $1
              order by d.name`,
            [httpSpaceId],
          );

    return this.withLiveSizes(rows.map(ofDataset));
  }

  async listProfileLinks(
    httpSpaceId: string,
  ): Promise<Map<string, DatasetSetLink[]>> {
    const { rows } = await this.pool.query<ProfileLinkRow>(
      `select l.dataset_id, s.id as set_id, s.name, l.exclude
         from ip_set_lists l
         join ip_sets s on s.id = l.ip_set_id
        where s.http_space_id = $1
        order by s.name, l.exclude, l.position`,
      [httpSpaceId],
    );

    return groupProfileLinks(rows);
  }

  async profileLinksOf(datasetId: string): Promise<DatasetSetLink[]> {
    const { rows } = await this.pool.query<ProfileLinkRow>(
      `select l.dataset_id, s.id as set_id, s.name, l.exclude
         from ip_set_lists l
         join ip_sets s on s.id = l.ip_set_id
        where l.dataset_id = $1
        order by s.name, l.exclude, l.position`,
      [datasetId],
    );

    return rows.map(ofProfileLink);
  }

  async get(id: string): Promise<Dataset | null> {
    const { rows } = await this.pool.query<DatasetRow>(
      `select ${META_COLS} from datasets d where d.id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    const [dataset] = await this.withLiveSizes([ofDataset(rows[0])]);

    return dataset;
  }

  /*
   * Кто держит набор по базе: link-таблицы адресного слоя (FK restrict) и
   * документы профилей подсистем -- там ссылка лежит строкой jsonb, по имени
   * либо по uuid, и FK её не видит. Ссылки waf-документов трёх уровней
   * считаются не здесь, а обходом стора (`datasetWafUses`): их источник --
   * живая модель, не база.
   */
  async referenceUses(
    id: string,
    name: string,
    httpSpaceId: string,
  ): Promise<{ at: string; kind: string }[]> {
    const { rows } = await this.pool.query<{ kind: string; at: string }>(
      `select 'set' as kind, s.name as at
         from ip_set_lists l
         join ip_sets s on s.id = l.ip_set_id
        where l.dataset_id = $1
       union
       select 'ip_profile', p.name
         from ip_profile_rules r
         join ip_profiles p on p.id = r.ip_profile_id
        where r.list_dataset_id = $1
       union
       select 'auth', s.name
         from auth_sources s
        where s.http_space_id = $2
          and (s.doc #>> '{list,sessions}' = $3
            or s.doc #>> '{providers,local,users}' = $3
            or s.doc #>> '{providers,code,users}' = $3
            or lower(s.doc #>> '{login,page}') = lower($1::text))
       union
       select 'captcha', c.name
         from captcha_profiles c
        where c.http_space_id = $2 and lower(c.doc ->> 'page') = lower($1::text)
       union
       select 'json', j.name
         from json_profiles j
        where j.http_space_id = $2
          and (lower(j.doc #>> '{schema,source}') = lower($1::text)
            or exists (
                 select 1
                   from jsonb_array_elements(
                          coalesce(j.doc -> 'bindings', '[]'::jsonb)) b
                  where lower(b ->> 'schema') = lower($1::text)))
       union
       select 'counter', c.name
         from counter_profiles c
        where c.http_space_id = $2
          and exists (
                select 1
                  from jsonb_array_elements(
                         coalesce(c.doc #> '{request,outcomes}', '[]'::jsonb)) o
                 where o ->> 'list' = $3)
       union
       select 'deny', d.name
         from deny_responses d
        where d.http_space_id = $2 and d.spec ->> 'page' = $3
       union
       select 'modsec_profile', s.name
         from rule_set_data m
         join rule_sets s on s.id = m.rule_set_id
        where m.dataset_id = $1
       union
       select 'action', a.name
         from action_profiles a
        where a.http_space_id = $2
          and (exists (
                select 1
                  from jsonb_array_elements(
                         coalesce(a.doc -> 'conditions', '[]'::jsonb)) c,
                       jsonb_array_elements(
                         coalesce(c -> 'rows', c -> 'all', '[]'::jsonb)) cl
                 where cl ->> 'dataset' = $3)
            -- Правило, которое пишет в набор: снятый набор оно писало бы в
            -- пустоту, keeper отвечал бы unknown_set на каждой записи.
            or exists (
                select 1
                  from jsonb_array_elements(
                         coalesce(a.doc -> 'rules', '[]'::jsonb)) r,
                       jsonb_array_elements(
                         coalesce(r -> 'actions', '[]'::jsonb)) x
                 where x ->> 'list' = $3))
       order by kind, at`,
      [id, httpSpaceId, name],
    );

    return rows.map((row) => ({ at: row.at, kind: row.kind }));
  }

  /** Адреса и содержимое уходят каскадом; ссылки обязан снять вызывающий. */
  async delete(id: string): Promise<Dataset | null> {
    const current = await this.get(id);

    if (current === null) {
      return null;
    }

    await this.pool.query(`delete from datasets where id = $1`, [id]);

    return current;
  }

  async insert(input: DatasetInsert): Promise<Dataset> {
    const { rows } = await this.pool.query<DatasetRow>(
      `insert into datasets (http_space_id, name, description, kind, type,
                             content_type_id, max_entries, active, ttl, in_nginx,
                             hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id, http_space_id, name, description, kind, type,
                 content_type_id, max_entries, active, ttl, in_nginx, hash,
                 0 as size, created_at, updated_at`,
      [
        input.httpSpaceId,
        input.name,
        input.description ?? "",
        input.kind,
        input.type,
        input.contentTypeId ?? null,
        input.maxEntries,
        input.kind === "list" ? (input.active ?? false) : false,
        input.kind === "list" && input.active ? (input.ttl ?? null) : null,
        input.kind === "list" && (input.inNginx ?? false),
        input.kind === "list" && input.type === "string" && (input.hash ?? false),
      ],
    );

    return ofDataset(rows[0]);
  }

  async listContentTypes(): Promise<ContentType[]> {
    const { rows } = await this.pool.query<ContentTypeRow>(
      `select id, name, mime, description from content_types order by name`,
    );

    return rows.map(ofContentType);
  }

  async getContentType(id: string): Promise<ContentType | null> {
    const { rows } = await this.pool.query<ContentTypeRow>(
      `select id, name, mime, description from content_types where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofContentType(rows[0]);
  }

  async getContent(datasetId: string): Promise<DatasetContent | null | "wrong_kind"> {
    const dataset = await this.get(datasetId);

    if (dataset === null) {
      return null;
    }

    if (dataset.kind !== "content") {
      return "wrong_kind";
    }

    const { rows } = await this.pool.query<ContentRow>(
      `select dataset_id, name, body, length(body) as size, updated_at
         from dataset_contents
        where dataset_id = $1`,
      [datasetId],
    );

    return rows.length === 0 ? null : ofContent(rows[0]);
  }

  async putContent(
    datasetId: string,
    name: string,
    body: Buffer,
  ): Promise<DatasetContent | null | "wrong_kind"> {
    const dataset = await this.get(datasetId);

    if (dataset === null) {
      return null;
    }

    if (dataset.kind !== "content") {
      return "wrong_kind";
    }

    const { rows } = await this.pool.query<ContentRow>(
      `insert into dataset_contents (dataset_id, name, body)
       values ($1, $2, $3)
       on conflict (dataset_id) do update
         set name = excluded.name,
             body = excluded.body,
             updated_at = now()
       returning dataset_id, name, body, length(body) as size, updated_at`,
      [datasetId, name, body],
    );

    await this.pool.query(
      `update datasets set updated_at = now() where id = $1`,
      [datasetId],
    );

    return ofContent(rows[0]);
  }

  async update(id: string, patch: DatasetPatch): Promise<Dataset | null> {
    const { rows } = await this.pool.query<DatasetRow>(
      `update datasets d set
         name        = coalesce($2, name),
         description = coalesce($3, description),
         max_entries = coalesce($4, max_entries),
         active      = coalesce($5, active),
         ttl         = case
                         when coalesce($5, d.active) = false then null
                         when $6::text is not null then $6::text
                         else d.ttl
                       end,
         in_nginx    = coalesce($7::boolean, d.in_nginx),
         hash        = coalesce($8::boolean, d.hash),
         updated_at  = now()
       where id = $1
       returning ${META_COLS}`,
      [
        id,
        patch.name ?? null,
        patch.description ?? null,
        patch.maxEntries ?? null,
        patch.active ?? null,
        patch.ttl ?? null,
        patch.inNginx ?? null,
        patch.hash ?? null,
      ],
    );

    return rows.length === 0 ? null : ofDataset(rows[0]);
  }

  async listAddresses(
    datasetId: string,
    q?: string,
  ): Promise<DatasetAddress[] | null | "wrong_kind"> {
    const dataset = await this.get(datasetId);

    if (dataset === null) {
      return null;
    }

    if (dataset.kind !== "list") {
      return "wrong_kind";
    }

    if (this.isLive(dataset) && this.live !== null) {
      const now = Date.now();
      const entries = (await this.live.liveSet(dataset.name))
        .filter((e) => (e.expMs === 0 || e.expMs > now) && (q === undefined || q === "" || e.value.includes(q)))
        .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));

      /*
       * Идентификаторы запоминаются только у обозримого списка: миллион
       * строк горячего списка никто не удаляет по одной из панели, а карта
       * на миллион записей -- это сотня мегабайт у контроллера.
       */
      const remember = entries.length <= LIVE_IDS_MAX / 4;

      return entries.map((e) => this.liveAddress(dataset, e, remember));
    }

    const { rows } =
      q === undefined || q === ""
        ? await this.pool.query<AddressRow>(
            `select ${ADDR_COLS}
               from dataset_addresses
              where dataset_id = $1
                and (expires_at is null or expires_at > now())
              order by address`,
            [datasetId],
          )
        : await this.pool.query<AddressRow>(
            `select ${ADDR_COLS}
               from dataset_addresses
              where dataset_id = $1
                and (expires_at is null or expires_at > now())
                and address like $2
              order by address`,
            [datasetId, `%${q}%`],
          );

    return rows.map(ofAddress);
  }

  async getAddress(id: string): Promise<DatasetAddress | null> {
    const live = this.liveIds.get(id);

    if (live !== undefined && this.live !== null) {
      const dataset = await this.get(live.datasetId);

      if (dataset === null) {
        return null;
      }

      const found = await this.live.liveLookup(dataset.name, [live.value]);
      const entry = found.get(live.value);

      return entry === undefined ? null : this.liveAddress(dataset, entry);
    }

    const { rows } = await this.pool.query<AddressRow>(
      `select ${ADDR_COLS} from dataset_addresses where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofAddress(rows[0]);
  }

  async findAddresses(
    address: string,
    httpSpaceId: string,
  ): Promise<DatasetAddress[]> {
    const { rows } = await this.pool.query<AddressRow>(
      `select a.id, a.dataset_id, a.address, a.ttl_s, a.expires_at,
              a.origin, a.reason
         from dataset_addresses a
         join datasets d on d.id = a.dataset_id
        where a.address = $1
          and d.http_space_id = $2
          and (a.expires_at is null or a.expires_at > now())
        order by a.dataset_id`,
      [address, httpSpaceId],
    );

    const out = rows.map(ofAddress);

    /* Активные наборы пространства -- у keeper: по одному ZSCORE на набор. */
    if (this.live !== null) {
      const now = Date.now();

      for (const dataset of await this.list(httpSpaceId)) {
        if (!this.isLive(dataset)) {
          continue;
        }

        const found = await this.live.liveLookup(dataset.name, [address]);
        const entry = found.get(address);

        if (entry !== undefined && (entry.expMs === 0 || entry.expMs > now)) {
          out.push(this.liveAddress(dataset, entry));
        }
      }
    }

    return out;
  }

  /**
   * Скопировать состав другого набора в этот.
   *
   * Новый список редко начинают с чистого листа: чаще берут готовый -- офисные
   * подсети, прежний блок-лист -- и правят. Заводить его пустым и потом
   * переливать руками значит терять время на том, что база делает одним
   * запросом.
   *
   * Копируются только живые записи: истёкшие в исходном наборе -- уже не его
   * состав. `limit` целевого набора при этом соблюдается.
   */
  async copyAddresses(fromId: string, toId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: string | number }>(
      `with room as (
         select max_entries - (
                  select count(*) from dataset_addresses a
                   where a.dataset_id = $2
                     and (a.expires_at is null or a.expires_at > now())
                ) as free
           from datasets where id = $2
       ),
       picked as (
         select a.address
           from dataset_addresses a, room
          where a.dataset_id = $1
            and (a.expires_at is null or a.expires_at > now())
          limit greatest((select free from room), 0)
       )
       insert into dataset_addresses (dataset_id, address, ttl_s, origin, reason)
       select $2, address, 0, 'copy', $1 from picked
       on conflict do nothing
       returning 1 as n`,
      [fromId, toId],
    );
    return rows.length;
  }

  async insertAddresses(
    datasetId: string,
    addresses: string[],
    opts?: { ttlS?: number; origin?: string; reason?: string },
  ): Promise<DatasetAddress[] | "missing" | "full" | "wrong_kind"> {
    const { rows: cap } = await this.pool.query<{
      kind: string;
      max_entries: number;
      n: string | number;
    }>(
      `select d.kind, d.max_entries,
              (select count(*) from dataset_addresses a
                where a.dataset_id = d.id
                  and (a.expires_at is null or a.expires_at > now())) as n
         from datasets d
        where d.id = $1`,
      [datasetId],
    );

    if (cap.length === 0) {
      return "missing";
    }

    if (cap[0].kind !== "list") {
      return "wrong_kind";
    }

    const unique = [...new Set(addresses)];
    const ttlS = opts?.ttlS ?? 0;
    const origin = opts?.origin ?? "";
    const reason = opts?.reason ?? "";

    const { rows: have } = await this.pool.query<{ address: string }>(
      `select address
         from dataset_addresses
        where dataset_id = $1
          and address = any($2::text[])
          and (expires_at is null or expires_at > now())`,
      [datasetId, unique],
    );
    const known = new Set(have.map((row) => row.address));
    const fresh = unique.filter((address) => !known.has(address));

    if (fresh.length === 0 && ttlS === 0) {
      return [];
    }

    if (Number(cap[0].n) + fresh.length > cap[0].max_entries) {
      return "full";
    }

    const { rows } = await this.pool.query<AddressRow>(
      `insert into dataset_addresses
         (dataset_id, address, ttl_s, expires_at, origin, reason)
       select $1, x, $3,
              case when $3 > 0 then now() + ($3 || ' seconds')::interval end,
              $4, $5
         from unnest($2::text[]) as x
       on conflict (dataset_id, address) do update
         set ttl_s = excluded.ttl_s,
             expires_at = excluded.expires_at,
             origin = excluded.origin,
             reason = excluded.reason
       returning ${ADDR_COLS}`,
      [datasetId, unique, ttlS, origin, reason],
    );

    await this.pool.query(
      `update datasets set updated_at = now() where id = $1`,
      [datasetId],
    );

    return rows.map(ofAddress);
  }

  /* Записи по значениям: перечитать то, что записал keeper. */
  async addressesByValue(datasetId: string, values: string[]): Promise<DatasetAddress[]> {
    if (values.length === 0) {
      return [];
    }

    const dataset = await this.get(datasetId);

    if (dataset !== null && this.isLive(dataset) && this.live !== null) {
      const found = await this.live.liveLookup(dataset.name, values);

      return [...found.values()]
        .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
        .map((e) => this.liveAddress(dataset, e));
    }

    const { rows } = await this.pool.query<AddressRow>(
      `select ${ADDR_COLS}
         from dataset_addresses
        where dataset_id = $1 and address = any($2::text[])
        order by address`,
      [datasetId, values],
    );

    return rows.map(ofAddress);
  }

  async deleteAddress(id: string): Promise<DatasetAddress | null> {
    const { rows } = await this.pool.query<AddressRow>(
      `delete from dataset_addresses
        where id = $1
    returning ${ADDR_COLS}`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    await this.pool.query(
      `update datasets set updated_at = now() where id = $1`,
      [rows[0].dataset_id],
    );

    return ofAddress(rows[0]);
  }
}
