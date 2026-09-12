/**
 * Профили инспектора адреса: упорядоченные правила «набор -> действие».
 *
 * Своих адресов у профиля нет -- он ссылается на составные наборы (ip-sets.ts)
 * и говорит про каждый, что тот значит. Первое совпадение с терминальным
 * действием закрывает решение; накопительные -- просьба соседу и запись в
 * живой набор -- совпадение не заканчивают.
 *
 * docs/ip-profiles.md
 */

import type {
  IpCompileOutcome,
  IpCompileProfile,
  IpCompileRule,
  IpCompileSet,
  IpCompileSource,
} from "./compile/ip.ts";
import { emptyIpMatch } from "./compile/ip.ts";
import type { Pool } from "./db.ts";
import type { RecordObject } from "./model/actions.ts";
import type {
  AskObjects,
  IpDefaultAction,
  IpOutcome,
  IpProfile,
  IpProfileDataset,
  IpProfileMeta,
  IpRule,
  IpRuleAction,
} from "./model/ip-profile.ts";
import {
  emptyAskObjects,
  isIpOutcomeOn,
  isIpWrite,
  isTerminalAction,
  type IpOutcomeOn,
  type IpWrite,
} from "./model/ip-profile.ts";

interface ProfileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  outcomes: unknown;
  default_action: IpDefaultAction;
  default_code: string;
  rules?: string | number;
  created_at: Date;
  updated_at: Date;
}

interface RuleRow {
  id: string;
  ip_profile_id: string;
  position: number;
  ip_set_id: string | null;
  set_name: string | null;
  dataset_id: string | null;
  dataset_name: string | null;
  set_not: boolean;
  action: IpRuleAction;
  response: string;
  code: string;
  to_inspector: string;
  do_verb: string;
  apply_axis: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  ask_group: string;
  ask_phase: string;
  ask_set: string;
  ask_ttl_s: number;
  ask_when: string[] | null;
  ask_objects: unknown;
  list_dataset_id: string | null;
  list_name: string | null;
  list_ttl_s: number;
  list_write: string;
  enabled: boolean;
}

export interface IpRuleInput {
  /** Условие терминальной строки. У накопительной пусто. */
  setId?: string | null;
  /** Условие накопительной строки: сырой список. У терминальной пусто. */
  datasetId?: string | null;
  /** Условие наоборот: строка срабатывает на промахе. Только у request и list. */
  not?: boolean;
  action: IpRuleAction;
  response?: string;
  code?: string;
  to?: string;
  verb?: string;
  axis?: string;
  delta?: number | null;
  value?: number | null;
  counter?: string;
  marker?: string;
  /** mutate: группа модификаторов получателя; куда переключить -- askSet. */
  askGroup?: string;
  askPhase?: string;
  /** Просьба записи: сторона, срок архива, исходы и объекты. */
  askSet?: string;
  askTtlS?: number;
  askWhen?: string[];
  askObjects?: AskObjects;
  listDatasetId?: string | null;
  listTtlS?: number;
  /** list: кого писать -- addr, net, net_all, asn; пусто -- адрес. */
  listWrite?: IpRule["listWrite"];
  enabled?: boolean;
}

export interface IpProfileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  rules: IpRuleInput[];
  /** uuid сырых списков, которые профиль просит упаковать. */
  datasets: string[];
  outcomes: IpOutcomeInput[];
  defaultAction: IpDefaultAction;
  defaultCode?: string;
}

export interface IpProfilePatch {
  name?: string;
  description?: string;
  rules?: IpRuleInput[];
  datasets?: string[];
  outcomes?: IpOutcomeInput[];
  defaultAction?: IpDefaultAction;
  defaultCode?: string;
}

/** Инициатор по исходу, как он приходит из API. Хранится в jsonb как есть. */
export interface IpOutcomeInput {
  on: IpOutcomeOn;
  /** Только у overload: порог заполнения очереди, 25..100. */
  at: number;
  to: string;
  verb: string;
  axis: string;
  delta: number | null;
  value: number | null;
  counter: string;
  /** mark: метка события на записи. */
  marker: string;
  /** mutate: группа модификаторов получателя; куда переключить -- askSet. */
  askGroup: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  askPhase?: string;
  /** Просьба записи: сторона, срок архива, исходы и объекты. */
  askSet: string;
  askTtlS: number;
  askWhen: string[];
  askObjects: AskObjects;
  list: string;
  ttlS: number;
  /** Кого писать: addr, net, net_all, asn; строка до поля -- адрес. */
  write?: IpWrite;
  code: string;
}

export type IpProfileError =
  | "unknown_set"
  | "unknown_list"
  | "list_not_active"
  /* Условие ссылается на список, которого профиль не объявил, -- значит, он и
     не поедет на ноду, и строка не совпадёт никогда. */
  | "undeclared_list";

function ofMeta(row: ProfileRow): IpProfileMeta {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    rules: Number(row.rules ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/*
 * Объекты просьбы записи из недоверенного места -- jsonb базы либо документа.
 * Нет объекта -- null: «не назван» и «назван пустым» это разные просьбы.
 */
function askObjectsOf(raw: unknown): AskObjects {
  const out = emptyAskObjects();

  if (typeof raw !== "object" || raw === null) {
    return out;
  }

  for (const name of ["headers", "args", "body"] as const) {
    const item = (raw as Record<string, unknown>)[name];

    if (typeof item !== "object" || item === null) {
      continue;
    }

    const o = item as Record<string, unknown>;

    out[name] = {
      set: (o.set === "on" || o.set === "off" ? o.set : "") as RecordObject["set"],
      limit: typeof o.limit === "number" ? o.limit : null,
      source: (o.source === "store" || o.source === "original"
        ? o.source
        : "") as RecordObject["source"],
    };
  }

  return out;
}

function ofRule(row: RuleRow): IpRule {
  return {
    id: row.id,
    position: row.position,
    setId: row.ip_set_id,
    setName: row.set_name ?? "",
    datasetId: row.dataset_id,
    datasetName: row.dataset_name ?? "",
    not: row.set_not,
    action: row.action,
    response: row.response,
    code: row.code,
    to: row.to_inspector,
    verb: row.do_verb,
    axis: row.apply_axis,
    delta: row.delta,
    value: row.value,
    counter: row.counter,
    marker: row.marker,
    askGroup: row.ask_group,
    askPhase: row.ask_phase,
    askSet: row.ask_set,
    askTtlS: row.ask_ttl_s,
    askWhen: row.ask_when ?? [],
    askObjects: askObjectsOf(row.ask_objects),
    listDatasetId: row.list_dataset_id,
    listName: row.list_name ?? "",
    listTtlS: row.list_ttl_s,
    /* Слово держит ограничение колонки; строка до поля -- адрес. */
    listWrite: (row.list_write ?? "addr") as IpRule["listWrite"],
    enabled: row.enabled,
  };
}

function ofProfile(
  row: ProfileRow,
  rules: RuleRow[],
  datasets: IpProfileDataset[],
): IpProfile {
  return {
    ...ofMeta({ ...row, rules: rules.length }),
    rules: rules.map(ofRule),
    datasets,
    outcomes: outcomesOf(row.outcomes),
    defaultAction: row.default_action,
    defaultCode: row.default_code,
  };
}

/*
 * Документ из jsonb нормализуется на чтении: строка, записанная до появления
 * поля, обязана прочитаться пустым списком, а не undefined.
 */
function outcomesOf(raw: unknown): IpOutcome[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: IpOutcome[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const row = item as Record<string, unknown>;

    if (!isIpOutcomeOn(String(row.on ?? ""))) {
      continue;
    }

    out.push({
      on: row.on as IpOutcomeOn,
      /*
       * Порог перегрузки. Строка, записанная до поля, -- это край: сотня.
       * Так же читает её и инспектор, если пак приехал без порога.
       */
      at: typeof row.at === "number" ? row.at : OVERLOAD_AT_MAX,
      to: String(row.to ?? ""),
      verb: String(row.verb ?? ""),
      axis: String(row.axis ?? ""),
      delta: typeof row.delta === "number" ? row.delta : null,
      value: typeof row.value === "number" ? row.value : null,
      counter: String(row.counter ?? ""),
      marker: String(row.marker ?? ""),
      askGroup: String(row.askGroup ?? ""),
      askPhase: String(row.askPhase ?? ""),
      askSet: String(row.askSet ?? ""),
      askTtlS: typeof row.askTtlS === "number" ? row.askTtlS : 0,
      askWhen: Array.isArray(row.askWhen) ? row.askWhen.map(String) : [],
      askObjects: askObjectsOf(row.askObjects),
      list: String(row.list ?? ""),
      ttlS: typeof row.ttlS === "number" ? row.ttlS : 0,
      /* Строка, записанная до поля, пишет адрес -- как и прежде. */
      write: isIpWrite(String(row.write ?? "")) ? (row.write as IpWrite) : "addr",
      code: String(row.code ?? ""),
    });
  }

  return out;
}

/* Край шкалы порога: очередь полна, запрос сброшен. Он же умолчание. */
const OVERLOAD_AT_MAX = 100;

const SELECT = `select p.id, p.http_space_id, p.name, p.description,
                       p.default_action, p.default_code,
                       p.outcomes,
                       p.created_at, p.updated_at`;

export class IpProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<IpProfileMeta[]> {
    const counts = `(select count(*) from ip_profile_rules r
                      where r.ip_profile_id = p.id) as rules`;

    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `${SELECT}, ${counts} from ip_profiles p order by p.name`,
          )
        : await this.pool.query<ProfileRow>(
            `${SELECT}, ${counts} from ip_profiles p
              where p.http_space_id = $1 order by p.name`,
            [httpSpaceId],
          );

    return rows.map(ofMeta);
  }

  async get(id: string): Promise<IpProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `${SELECT} from ip_profiles p where p.id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    return ofProfile(
      rows[0],
      await rulesOf(this.pool, id),
      await datasetsOf(this.pool, id),
    );
  }

  /** Правила и привязки списков уходят каскадом; `profile=` снимает оператор. */
  async delete(id: string): Promise<IpProfile | null> {
    const current = await this.get(id);

    if (current === null) {
      return null;
    }

    await this.pool.query(`delete from ip_profiles where id = $1`, [id]);

    return current;
  }

  async insert(input: IpProfileInsert): Promise<IpProfile | IpProfileError> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const { rows } = await client.query<ProfileRow>(
        `insert into ip_profiles (
           http_space_id, name, description,
           default_action, default_code, outcomes
         ) values ($1, $2, $3, $4, $5, $6)
         returning id, http_space_id, name, description,
                   default_action, default_code, outcomes,
                   created_at, updated_at`,
        [
          input.httpSpaceId,
          input.name,
          input.description,
          input.defaultAction,
          input.defaultCode ?? "",
          JSON.stringify(input.outcomes ?? []),
        ],
      );

      const row = rows[0];
      /*
       * Списки объявляются первыми: условие накопительной строки обязано
       * ссылаться на объявленный, и проверить это можно только после записи.
       */
      const declared = await replaceDatasets(
        client,
        row.id,
        row.http_space_id,
        input.datasets ?? [],
      );

      if (typeof declared === "string") {
        await client.query("rollback");
        return declared;
      }

      const wrote = await replaceRules(client, row.id, row.http_space_id, input.rules);

      if (typeof wrote === "string") {
        await client.query("rollback");
        return wrote;
      }

      await client.query("commit");

      return ofProfile(row, wrote, declared);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    patch: IpProfilePatch,
  ): Promise<IpProfile | IpProfileError | null> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const current = await this.get(id);

      if (current === null) {
        await client.query("rollback");
        return null;
      }

      const { rows } = await client.query<ProfileRow>(
        `update ip_profiles set
           name           = coalesce($2, name),
           description    = coalesce($3, description),
           default_action = $4,
           default_code   = $5,
           outcomes       = $6,
           updated_at     = now()
         where id = $1
         returning id, http_space_id, name, description,
                   default_action, default_code, outcomes,
                   created_at, updated_at`,
        [
          id,
          patch.name ?? null,
          patch.description ?? null,
          patch.defaultAction ?? current.defaultAction,
          patch.defaultCode ?? current.defaultCode,
          JSON.stringify(
            patch.outcomes ??
              current.outcomes.map((o) => ({
                on: o.on,
                to: o.to, verb: o.verb, axis: o.axis,
                delta: o.delta, value: o.value, counter: o.counter,
                marker: o.marker, askGroup: o.askGroup, askPhase: o.askPhase ?? "",
                askSet: o.askSet, askTtlS: o.askTtlS,
                askWhen: o.askWhen, askObjects: o.askObjects,
                list: o.list, ttlS: o.ttlS, write: o.write ?? "addr", code: o.code,
              })),
          ),
        ],
      );

      const declared = await replaceDatasets(
        client,
        id,
        rows[0].http_space_id,
        patch.datasets ?? current.datasets.map((row) => row.id),
      );

      if (typeof declared === "string") {
        await client.query("rollback");
        return declared;
      }

      const rules =
        patch.rules ??
        current.rules.map((rule): IpRuleInput => ({
          setId: rule.setId,
          datasetId: rule.datasetId,
          not: rule.not,
          action: rule.action,
          response: rule.response,
          code: rule.code,
          to: rule.to,
          verb: rule.verb,
          axis: rule.axis,
          delta: rule.delta,
          value: rule.value,
          counter: rule.counter,
          marker: rule.marker,
          askGroup: rule.askGroup,
          askPhase: rule.askPhase ?? "",
          askSet: rule.askSet,
          askTtlS: rule.askTtlS,
          askWhen: rule.askWhen,
          askObjects: rule.askObjects,
          listDatasetId: rule.listDatasetId,
          listTtlS: rule.listTtlS,
          listWrite: rule.listWrite,
          enabled: rule.enabled,
        }));

      const wrote = await replaceRules(
        client,
        id,
        rows[0].http_space_id,
        rules,
      );

      if (typeof wrote === "string") {
        await client.query("rollback");
        return wrote;
      }

      await client.query("commit");

      return ofProfile(rows[0], wrote, declared);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  /** Наборы, правила и тела списков — для compile. */
  async exportCompile(httpSpaceId: string): Promise<IpCompileSource> {
    const { rows: profiles } = await this.pool.query<ProfileRow>(
      `${SELECT} from ip_profiles p where p.http_space_id = $1 order by p.name`,
      [httpSpaceId],
    );

    const { rows: rules } = await this.pool.query<
      RuleRow & { profile_name: string }
    >(
      `select p.name as profile_name, r.id, r.ip_profile_id, r.position,
              r.ip_set_id, s.name as set_name,
              r.dataset_id, c.name as dataset_name,
              r.set_not, r.action, r.response, r.code,
              r.to_inspector, r.do_verb, r.apply_axis,
              r.delta, r.value, r.counter, r.marker, r.ask_group, r.ask_phase,
              r.ask_set, r.ask_ttl_s, r.ask_when, r.ask_objects,
              r.list_dataset_id, d.name as list_name, r.list_ttl_s, r.list_write, r.enabled
         from ip_profile_rules r
         join ip_profiles p on p.id = r.ip_profile_id
         left join ip_sets s on s.id = r.ip_set_id
         left join datasets c on c.id = r.dataset_id
         left join datasets d on d.id = r.list_dataset_id
        where p.http_space_id = $1 and r.enabled
        order by p.name, r.position`,
      [httpSpaceId],
    );

    /*
     * Списки, объявленные профилями: их везут без всякой логики, просто
     * потому, что о них попросили. Только они и наборы, названные белым или
     * чёрным, попадают в пак -- пространство целиком на ноду не едет, а
     * тела наборов там самое тяжёлое.
     */
    const { rows: declared } = await this.pool.query<{
      id: string;
      name: string;
      active: boolean;
    }>(
      `select distinct d.id, d.name, d.active
         from ip_profile_datasets pd
         join ip_profiles p on p.id = pd.ip_profile_id
         join datasets d on d.id = pd.dataset_id
        where p.http_space_id = $1
        order by d.name`,
      [httpSpaceId],
    );

    const { rows: sets } = await this.pool.query<{
      id: string;
      name: string;
      inverse: boolean;
      countries: string[];
      asns: string[] | number[];
      exclude_countries: string[];
      exclude_asns: string[] | number[];
    }>(
      `select id, name, inverse, countries, asns,
              exclude_countries, exclude_asns
         from ip_sets
        where http_space_id = $1
        order by name`,
      [httpSpaceId],
    );

    const { rows: members } = await this.pool.query<{
      set_name: string;
      dataset_id: string;
      exclude: boolean;
      active: boolean;
    }>(
      `select s.name as set_name, l.dataset_id, l.exclude, d.active
         from ip_set_lists l
         join ip_sets s on s.id = l.ip_set_id
         join datasets d on d.id = l.dataset_id
        where s.http_space_id = $1
        order by s.name, l.exclude, l.position, d.name`,
      [httpSpaceId],
    );

    /*
     * Набор нужен только терминальной строке: она выносит вердикт, и ей нужно
     * выражение над сырьём. Никем не названный набор на ноде -- это тела всех
     * его списков за то, что никогда не спросят.
     */
    const usedSets = new Set(
      rules
        .filter((row) => isTerminalAction(row.action) && row.set_name !== null)
        .map((row) => row.set_name as string),
    );

    const out: IpCompileSet[] = sets
      .filter((row) => usedSets.has(row.name))
      .map((row) => ({
      name: row.name,
      ...emptyIpMatch(),
      countries: row.countries ?? [],
      asns: numbers(row.asns),
      inverse: row.inverse,
      exclude: {
        ...emptyIpMatch(),
        countries: row.exclude_countries ?? [],
        asns: numbers(row.exclude_asns),
      },
    }));

    const bySet = new Map(out.map((row) => [row.name, row]));
    const live = new Map<string, string>();
    const staticIds = new Set<string>();

    for (const row of members) {
      const set = bySet.get(row.set_name);

      if (set === undefined) {
        continue;
      }

      const target = row.exclude ? set.exclude : set;

      /*
       * Состав активного набора в пак не кладут вовсе -- он приезжает шиной.
       * Копия разъехалась бы с шиной на первом же автобане, и разъехалась бы
       * молча: два источника одного состава, которые друг о друге не знают.
       */
      if (row.active) {
        target.live.push(row.dataset_id);
        live.set(row.dataset_id, "");
      } else {
        target.lists.push(row.dataset_id);
        staticIds.add(row.dataset_id);
      }
    }

    /*
     * Объявленные списки: активный едет ссылкой (состав держит шина), обычный
     * -- телом. Ровно то же правило, что у списков внутри набора: копия
     * активного разъехалась бы с шиной на первом же автобане.
     */
    for (const row of declared) {
      if (row.active) {
        live.set(row.id, row.name);
      } else {
        staticIds.add(row.id);
      }
    }

    /*
     * Живой набор, который называет действие «внести в список», тоже обязан
     * попасть в реестр: иначе инспектор не узнает темы, в которую писать.
     */
    for (const rule of rules) {
      if (rule.action === "list" && rule.list_dataset_id !== null) {
        live.set(rule.list_dataset_id, "");
      }
    }

    /*
     * Строки по исходу, пишущие в набор, регистрируют его в живых -- иначе
     * инспектор не узнает темы. У просьб соседям набора нет.
     *
     * Перегрузка -- исключение: её запись исполняет модуль (глагол `ban`), и
     * зеркалить набор инспектору незачем. Имя оттуда всё равно нужно -- на
     * проводе у просьбы стоит имя, а не uuid, -- поэтому такие наборы едут
     * отдельным списком и в реестр живых не попадают.
     */
    const banLists = new Set<string>();

    for (const row of profiles) {
      for (const outcome of outcomesOf(row.outcomes)) {
        if (outcome.verb !== "" || outcome.list === "") {
          continue;
        }

        if (outcome.on === "overload") {
          banLists.add(outcome.list);
          continue;
        }

        if (!live.has(outcome.list)) {
          live.set(outcome.list, "");
        }
      }
    }

    const banNames = new Map(await namesOf(this.pool, [...banLists]));

    for (const [id, name] of await namesOf(this.pool, [...live.keys()])) {
      live.set(id, name);
    }

    const compiled: IpCompileProfile[] = profiles.map((row) => ({
      name: row.name,
      rules: [],
      outcomes: outcomesOf(row.outcomes).map((o) => {
        const out: IpCompileOutcome = { on: o.on };

        /* Порог есть только у перегрузки: у остальных ему нечего значить. */
        if (o.on === "overload") {
          out.at = o.at;
        }

        /*
         * Перегрузка + запись в набор: на проводе это просьба модулю, а не
         * запись самого инспектора. Оператор в панели говорит «внести в
         * список», а кто пишет, решает здесь компилятор -- и решает в пользу
         * модуля: инспектор на перегрузке не может ни сходить к кодеру, ни
         * дождаться keeper, а модулю адрес клиента уже известен. Поэтому же у
         * такой строки нет охватов net/net_all/asn -- край их не резолвит.
         */
        if (o.on === "overload" && o.verb === "" && o.list !== "") {
          out.do = "ban";
          out.apply = "ip";
          out.list = banNames.get(o.list) ?? "";

          if (o.ttlS > 0) {
            out.ttl = `${o.ttlS}s`;
          }

          if (o.code !== "") {
            out.code = o.code;
          }

          return out;
        }

        if (o.verb !== "") {
          if (o.to !== "") {
            out.to = o.to;
          }

          out.do = o.verb;
          out.apply = o.axis;

          if (o.delta !== null) {
            out.delta = o.delta;
          }

          if (o.value !== null) {
            out.value = o.value;
          }

          if (o.counter !== "") {
            out.counter = o.counter;
          }

          if (o.marker !== "") {
            out.marker = o.marker;
          }

          if (o.askGroup !== "") {
            out.group = o.askGroup;
          }

          if ((o.askPhase ?? "") !== "") {
            out.phase = o.askPhase;
          }

          /* Сторона mutate и просьбы записи: у инициатора ключ set свободен -- набора у него нет. */
          if (o.askSet !== "") {
            out.set = o.askSet;
          }

          for (const name of ["headers", "args", "body"] as const) {
            const item = o.askObjects[name];

            if (item !== null) {
              out[name] = item;
            }
          }

          if (o.askWhen.length !== 0) {
            out.when = [...o.askWhen];
          }

          if (o.askTtlS > 0) {
            out.ttl = `${o.askTtlS}s`;
          }
        } else {
          out.list = o.list;

          /* Адрес -- умолчание загрузчика: охват пишется только шире адреса. */
          if (o.write !== undefined && o.write !== "addr") {
            out.write = o.write;
          }

          if (o.ttlS > 0) {
            out.ttl = `${o.ttlS}s`;
          }
        }

        if (o.code !== "") {
          out.code = o.code;
        }

        return out;
      }),
      default: row.default_action,
      defaultCode: row.default_code === "" ? undefined : row.default_code,
    }));

    const byProfile = new Map(compiled.map((row) => [row.name, row]));

    for (const row of rules) {
      const profile = byProfile.get(row.profile_name);

      if (profile === undefined) {
        continue;
      }

      profile.rules.push(compileRule(row));
    }

    const [files, countries, asns] = await Promise.all([
      dumpListText(this.pool, httpSpaceId, [...staticIds]),
      dumpCountryText(this.pool, httpSpaceId, codesOf(out)),
      dumpAsnText(this.pool, httpSpaceId, asnsOf(out)),
    ]);

    return {
      files,
      countries,
      asns,
      live: [...live.entries()].map(([id, name]) => ({ id, name })),
      sets: out,
      profiles: compiled,
    };
  }
}

function compileRule(row: RuleRow): IpCompileRule {
  /*
   * Порядок ключей -- часть канона хеша (canonRule в compile/ip-pack.ts и
   * структура Rule в инспекторе): условие, отрицание, действие. Пустое не
   * пишется вовсе.
   */
  const rule: IpCompileRule = {
    ...(isTerminalAction(row.action)
      ? { set: row.set_name ?? "" }
      : { dataset: row.dataset_id ?? "" }),
    ...(row.set_not ? { not: true } : {}),
    action: row.action,
  };

  if (row.response !== "") {
    rule.response = row.response;
  }

  if (row.code !== "") {
    rule.code = row.code;
  }

  if (row.action === "request") {
    if (row.to_inspector !== "") {
      rule.to = row.to_inspector;
    }

    rule.do = row.do_verb;
    rule.apply = row.apply_axis;

    if (row.delta !== null) {
      rule.delta = row.delta;
    }

    if (row.value !== null) {
      rule.value = row.value;
    }

    if (row.counter !== "") {
      rule.counter = row.counter;
    }

    if (row.marker !== "") {
      rule.marker = row.marker;
    }

    if (row.ask_group !== "") {
      rule.group = row.ask_group;
    }

    if (row.ask_phase !== "") {
      rule.phase = row.ask_phase;
    }

    /*
     * Сторона mutate и просьбы записи. У строки она называется side: ключ set
     * занят самим набором -- так её и читает загрузчик инспектора.
     */
    if (row.ask_set !== "") {
      rule.side = row.ask_set;
    }

    if (row.ask_ttl_s > 0) {
      rule.ttl = `${row.ask_ttl_s}s`;
    }

    if ((row.ask_when ?? []).length !== 0) {
      rule.when = [...(row.ask_when as string[])];
    }

    const objects = askObjectsOf(row.ask_objects);

    for (const name of ["headers", "args", "body"] as const) {
      const item = objects[name];

      if (item !== null) {
        rule[name] = item;
      }
    }
  }

  if (row.action === "list" && row.list_dataset_id !== null) {
    rule.list = row.list_dataset_id;

    /* Адрес -- умолчание загрузчика: охват пишется только шире адреса. */
    if (row.list_write !== "" && row.list_write !== "addr") {
      rule.write = row.list_write;
    }

    if (row.list_ttl_s > 0) {
      rule.ttl = `${row.list_ttl_s}s`;
    }
  }

  return rule;
}

function codesOf(sets: IpCompileSet[]): string[] {
  const out = new Set<string>();

  for (const set of sets) {
    for (const code of [...set.countries, ...set.exclude.countries]) {
      out.add(code);
    }
  }

  return [...out];
}

function asnsOf(sets: IpCompileSet[]): number[] {
  const out = new Set<number>();

  for (const set of sets) {
    for (const asn of [...set.asns, ...set.exclude.asns]) {
      out.add(asn);
    }
  }

  return [...out];
}

function numbers(value: string[] | number[] | null | undefined): number[] {
  if (value === undefined || value === null) {
    return [];
  }

  return value.map((item) => {
    const n = typeof item === "number" ? item : Number(item);

    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`invalid asn "${item}"`);
    }

    return n;
  });
}

type Queryable = { query: Pool["query"] };

async function rulesOf(db: Queryable, profileId: string): Promise<RuleRow[]> {
  /*
   * Оба условия слева: набор есть только у терминальной строки, список --
   * только у накопительной, и join обязан быть внешним, иначе строка одного
   * рода вычёркивала бы строки другого.
   */
  const { rows } = await db.query<RuleRow>(
    `select r.id, r.ip_profile_id, r.position,
            r.ip_set_id, s.name as set_name,
            r.dataset_id, c.name as dataset_name,
            r.set_not,
            r.action, r.response, r.code, r.to_inspector, r.do_verb,
            r.apply_axis, r.delta, r.value, r.counter, r.marker, r.ask_group, r.ask_phase,
            r.ask_set, r.ask_ttl_s, r.ask_when, r.ask_objects,
            r.list_dataset_id, d.name as list_name,
            r.list_ttl_s, r.list_write, r.enabled
       from ip_profile_rules r
       left join ip_sets s on s.id = r.ip_set_id
       left join datasets c on c.id = r.dataset_id
       left join datasets d on d.id = r.list_dataset_id
      where r.ip_profile_id = $1
      order by r.position`,
    [profileId],
  );

  return rows;
}

/** Объявленные списки профиля: то, что он просит упаковать. */
async function datasetsOf(
  db: Queryable,
  profileId: string,
): Promise<IpProfileDataset[]> {
  const { rows } = await db.query<{ id: string; name: string; active: boolean }>(
    `select d.id, d.name, d.active
       from ip_profile_datasets p
       join datasets d on d.id = p.dataset_id
      where p.ip_profile_id = $1
      order by p.position, d.name`,
    [profileId],
  );

  return rows;
}

/*
 * Объявленные списки профиля: плоский перечень без логики. Порядок здесь
 * ничего не решает -- это перечисление, а не проход, -- но он сохраняется,
 * чтобы форма открывалась тем же списком, каким её закрыли.
 */
async function replaceDatasets(
  db: Queryable,
  profileId: string,
  httpSpaceId: string,
  ids: string[],
): Promise<IpProfileDataset[] | IpProfileError> {
  const want = [...new Set(ids)];

  if (want.length !== 0) {
    const { rows } = await db.query<{ id: string }>(
      `select id from datasets
        where http_space_id = $1
          and id = any($2::uuid[])
          and kind = 'list'
          and type in ('ipv4', 'ip')`,
      [httpSpaceId, want],
    );

    if (rows.length !== want.length) {
      return "unknown_list";
    }
  }

  await db.query(`delete from ip_profile_datasets where ip_profile_id = $1`, [
    profileId,
  ]);

  let position = 0;

  for (const id of want) {
    await db.query(
      `insert into ip_profile_datasets (ip_profile_id, dataset_id, position)
       values ($1, $2, $3)`,
      [profileId, id, position],
    );

    position += 1;
  }

  return datasetsOf(db, profileId);
}

async function replaceRules(
  db: Queryable,
  profileId: string,
  httpSpaceId: string,
  rules: IpRuleInput[],
): Promise<RuleRow[] | IpProfileError> {
  const setIds = [
    ...new Set(rules.map((rule) => rule.setId ?? "").filter((id) => id !== "")),
  ];

  if (setIds.length !== 0) {
    const { rows } = await db.query<{ id: string }>(
      `select id from ip_sets where http_space_id = $1 and id = any($2::uuid[])`,
      [httpSpaceId, setIds],
    );

    if (rows.length !== setIds.length) {
      return "unknown_set";
    }
  }

  /*
   * Условие накопительной строки обязано быть объявлено профилем: иначе
   * список не поедет на ноду и строка не совпадёт никогда -- молча, без
   * единой записи в логе.
   */
  const declared = new Set(
    (
      await db.query<{ dataset_id: string }>(
        `select dataset_id from ip_profile_datasets where ip_profile_id = $1`,
        [profileId],
      )
    ).rows.map((row) => row.dataset_id),
  );

  for (const rule of rules) {
    if (isTerminalAction(rule.action)) {
      continue;
    }

    if (rule.datasetId == null || !declared.has(rule.datasetId)) {
      return "undeclared_list";
    }
  }

  const listIds = [
    ...new Set(
      rules
        .filter((rule) => rule.action === "list")
        .map((rule) => rule.listDatasetId ?? ""),
    ),
  ].filter((id) => id !== "");

  if (listIds.length !== 0) {
    const { rows } = await db.query<{ id: string; active: boolean }>(
      `select id, active from datasets
        where http_space_id = $1
          and id = any($2::uuid[])
          and kind = 'list'
          and type in ('ipv4', 'ip')`,
      [httpSpaceId, listIds],
    );

    if (rows.length !== listIds.length) {
      return "unknown_list";
    }

    /*
     * Писать в набор без active значит писать в тему, которую никто не
     * обслуживает: запись потерялась бы молча.
     */
    if (rows.some((row) => !row.active)) {
      return "list_not_active";
    }
  }

  await db.query(`delete from ip_profile_rules where ip_profile_id = $1`, [
    profileId,
  ]);

  let position = 0;

  for (const rule of rules) {
    await db.query(
      `insert into ip_profile_rules (
         ip_profile_id, position, ip_set_id, dataset_id, set_not, action,
         response, code, to_inspector, do_verb, apply_axis, delta, value,
         counter, marker, ask_group, ask_phase, ask_set, ask_ttl_s, ask_when,
         ask_objects, list_dataset_id, list_ttl_s, list_write, enabled
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
      [
        profileId,
        position,
        /*
         * Условие ровно одно, и какое -- решает действие. Терминальная строка
         * выносит вердикт: ей нужно выражение над сырьём, то есть набор.
         * Накопительная вердикта не выносит: ей нужен состав, то есть список.
         */
        isTerminalAction(rule.action) ? rule.setId : null,
        isTerminalAction(rule.action) ? null : rule.datasetId,
        /*
         * «Не в списке» -- только у накопительных строк: терминальному
         * промаху нечем объясниться, ни находки, ни публичной причины у него
         * нет. Разбор запроса это уже отверг; здесь страховка от чужого
         * вызова репозитория.
         */
        !isTerminalAction(rule.action) && rule.not === true,
        rule.action,
        rule.response ?? "",
        rule.code ?? "",
        rule.action === "request" ? (rule.to ?? "") : "",
        rule.action === "request" ? (rule.verb ?? "") : "",
        rule.action === "request" ? (rule.axis ?? "") : "",
        rule.action === "request" ? (rule.delta ?? null) : null,
        rule.action === "request" ? (rule.value ?? null) : null,
        rule.action === "request" ? (rule.counter ?? "") : "",
        rule.action === "request" ? (rule.marker ?? "") : "",
        rule.action === "request" ? (rule.askGroup ?? "") : "",
        rule.action === "request" ? (rule.askPhase ?? "") : "",
        /* Поля просьбы записи есть только у просьбы: у записи в набор их нет. */
        rule.action === "request" ? (rule.askSet ?? "") : "",
        rule.action === "request" ? (rule.askTtlS ?? 0) : 0,
        rule.action === "request" ? (rule.askWhen ?? []) : [],
        JSON.stringify(
          rule.action === "request" ? (rule.askObjects ?? emptyAskObjects()) : {},
        ),
        rule.action === "list" ? (rule.listDatasetId ?? null) : null,
        rule.action === "list" ? (rule.listTtlS ?? 0) : 0,
        /* Кого писать -- только у записи: у остальных действий адрес без смысла. */
        rule.action === "list" ? (rule.listWrite ?? "addr") : "addr",
        rule.enabled ?? true,
      ],
    );

    position += 1;
  }

  return rulesOf(db, profileId);
}

async function dumpListText(
  db: Queryable,
  httpSpaceId: string,
  ids: string[],
): Promise<{ id: string; name?: string; text: string }[]> {
  if (ids.length === 0) {
    return [];
  }

  const { rows } = await db.query<{
    id: string;
    name: string;
    text: string | null;
  }>(
    `select d.id, d.name,
            case
              when count(a.address) = 0 then ''
              else string_agg(a.address, E'\n' order by a.address) || E'\n'
            end as text
       from datasets d
       left join dataset_addresses a on a.dataset_id = d.id
      where d.http_space_id = $1
        and d.id = any($2::uuid[])
      group by d.id, d.name
      order by d.name`,
    [httpSpaceId, ids],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    text: row.text ?? "",
  }));
}

/* Имена живых наборов: keeper адресует их именем (docs/keeper.md). */
async function namesOf(
  db: Queryable,
  ids: string[],
): Promise<[string, string][]> {
  if (ids.length === 0) {
    return [];
  }

  const { rows } = await db.query<{ id: string; name: string }>(
    `select id, name from datasets where id = any($1::uuid[])`,
    [ids],
  );

  return rows.map((row) => [row.id, row.name]);
}

async function dumpCountryText(
  db: Queryable,
  httpSpaceId: string,
  codes: string[],
): Promise<{ code: string; text: string }[]> {
  if (codes.length === 0) {
    return [];
  }

  const { rows } = await db.query<{ code: string; text: string | null }>(
    `select c.code,
            case
              when count(a.address) = 0 then ''
              else string_agg(a.address, E'\n') || E'\n'
            end as text
       from ip_countries c
       left join ip_country_addresses a on a.country_id = c.id
      where c.http_space_id = $1
        and c.code = any($2::text[])
      group by c.code`,
    [httpSpaceId, codes],
  );

  return fillDump(
    codes,
    rows.map((row) => [row.code, row.text ?? ""]),
  ).map(([code, text]) => ({ code, text }));
}

async function dumpAsnText(
  db: Queryable,
  httpSpaceId: string,
  asns: number[],
): Promise<{ asn: number; text: string }[]> {
  if (asns.length === 0) {
    return [];
  }

  const { rows } = await db.query<{ asn: string | number; text: string | null }>(
    `select c.asn,
            case
              when count(a.address) = 0 then ''
              else string_agg(a.address, E'\n') || E'\n'
            end as text
       from ip_asns c
       left join ip_asn_addresses a on a.asn_id = c.id
      where c.http_space_id = $1
        and c.asn = any($2::bigint[])
      group by c.asn`,
    [httpSpaceId, asns],
  );

  return fillDump(
    asns.map(String),
    rows.map((row) => [String(row.asn), row.text ?? ""]),
  ).map(([asn, text]) => ({ asn: Number(asn), text }));
}

function fillDump(keys: string[], rows: [string, string][]): [string, string][] {
  const text = new Map(rows);

  return keys.map((key) => [key, text.get(key) ?? ""]);
}

export { isTerminalAction };
