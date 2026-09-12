/**
 * `/ip-profiles`: правила профиля адреса и рассылка поколения.
 *
 * Профиль -- таблица правил «набор -> действие». Своих адресов у него нет,
 * см. docs/profiles.md репозитория ip.
 */

import { Router } from "express";
import type { Request, Response } from "express";

import type { IpCompiler } from "./compile.ts";
import { jsonSendIpPack } from "./compile/ip-pack.ts";
import {
  DEFAULT_IP_BASELINE,
  DEFAULT_PROFILE_NAME,
  ipDiffersFromBaseline,
  isDefaultRename,
} from "./default-profile.ts";
import type { DesiredStore } from "./desired.ts";
import { sendWriteError } from "./http-error.ts";
import { parseCode, parseName, parseText } from "./ip-parse.ts";
import type { IpOutcomeInput, IpProfileRepo, IpRuleInput } from "./ip-profiles.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import { markerError } from "./model/actions.ts";
import type {
  IpDefaultAction,
  IpProfile,
  IpProfileMeta,
  IpRule,
  IpWrite,
} from "./model/ip-profile.ts";
import {
  emptyAskObjects,
  isIpDefaultAction,
  isIpOutcomeOn,
  isIpRuleAction,
  isIpWrite,
  isTerminalAction,
} from "./model/ip-profile.ts";
import { checkAsk, type Ask } from "./model/action-ask.ts";
import type { RecordObject } from "./model/actions.ts";
import type { AskObjects } from "./model/ip-profile.ts";

/** Просьба в том виде, в каком её кладут строка правила и инициатор. */
interface ParsedAsk {
  to: string;
  verb: string;
  axis: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  askGroup: string;
  askPhase: string;
  askSet: string;
  askTtlS: number;
  askWhen: string[];
  askObjects: AskObjects;
}
import { scopeOf } from "./scope.ts";
import {
  ipProfileSelectors,
  selectIpProfilesInSpace,
} from "./state/slices/ip-profiles.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import {
  createIpProfile,
  deleteIpProfile,
  updateIpProfile,
} from "./state/thunks/ip-profiles.ts";
import { profileUses, usesDetail } from "./usage.ts";

const SCORE_MAX = 100;
/*
 * delta -- проценты коэффициента к измерению получателя (множитель
 * 1 + delta/100): минус -- скидка, плюс -- строже; -100 -- измерение в ноль,
 * +900 -- вдесятеро. Провод как форма несёт +-1000, но отправителю собирать
 * там нечего -- осмысленный диапазон держит эта проверка.
 */
const DELTA_MIN = -100;
const DELTA_MAX = 900;
/* value -- проценты изменения счётчика получателя: -100..+100. */
const VALUE_MAX = 100;
/* Имя корзины у note: алфавит имён счётчиков получателя. */
const COUNTER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TTL_MAX = 31 * 24 * 3600;

/* Порог перегрузки: край шкалы -- сброшенный запрос, он же умолчание. */
const OVERLOAD_AT_MIN = 25;
const OVERLOAD_AT_MAX = 100;

function jsonMeta(meta: IpProfileMeta) {
  return {
    uuid: meta.id,
    http_space_id: meta.httpSpaceId,
    name: meta.name,
    description: meta.description,
    rule_count: meta.rules,
    created_at: meta.createdAt.toISOString(),
    updated_at: meta.updatedAt.toISOString(),
  };
}

function jsonRule(rule: IpRule) {
  return {
    uuid: rule.id,
    position: rule.position,
    set: rule.setId,
    set_name: rule.setName,
    dataset: rule.datasetId,
    dataset_name: rule.datasetName,
    not: rule.not,
    action: rule.action,
    response: rule.response,
    code: rule.code,
    to: rule.to,
    do: rule.verb,
    apply: rule.axis,
    delta: rule.delta,
    value: rule.value,
    counter: rule.counter,
    marker: rule.marker,
    group: rule.askGroup,
    phase: rule.askPhase ?? "",
    /*
     * Сторона mutate и просьбы записи у строки зовётся side: ключ set занят
     * набором-условием. У инициатора набора нет, и там она просто set.
     */
    side: rule.askSet,
    when: rule.askWhen,
    headers: rule.askObjects.headers,
    args: rule.askObjects.args,
    body: rule.askObjects.body,
    list: rule.listDatasetId,
    list_name: rule.listName,
    write: rule.listWrite,
    /* Срок строки: у просьбы archive -- срок архива, у записи -- срок записи. */
    ttl: rule.action === "request" ? rule.askTtlS : rule.listTtlS,
    enabled: rule.enabled,
  };
}

function jsonProfile(row: IpProfile) {
  return {
    ...jsonMeta({ ...row, rules: row.rules.length }),
    rules: row.rules.map(jsonRule),
    datasets: row.datasets.map((item) => ({
      uuid: item.id,
      name: item.name,
      active: item.active,
    })),
    outcomes: row.outcomes.map((o) => ({
      on: o.on,
      /* Порог есть только у перегрузки; у остальных он не значит ничего. */
      ...(o.on === "overload" ? { at: o.at } : {}),
      to: o.to,
      do: o.verb,
      apply: o.axis,
      delta: o.delta,
      value: o.value,
      counter: o.counter,
      marker: o.marker,
      group: o.askGroup,
      phase: o.askPhase ?? "",
      set: o.askSet,
      when: o.askWhen,
      headers: o.askObjects.headers,
      args: o.askObjects.args,
      body: o.askObjects.body,
      list: o.list,
      write: o.write ?? "addr",
      /* Тот же срок: у просьбы archive -- архива, у записи в набор -- записи. */
      ttl: o.verb === "" ? o.ttlS : o.askTtlS,
      code: o.code,
    })),
    default: row.defaultAction,
    default_code: row.defaultCode,
    modified: row.name === DEFAULT_PROFILE_NAME && ipDiffersFromBaseline(row),
  };
}

function parseInt0(value: unknown, max: number, min = 0): number | null | "bad" {
  if (value === undefined || value === null) {
    return null;
  }

  const n = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(n) || n < min || n > max) {
    return "bad";
  }

  return n;
}

/**
 * Просьба строки: разбор недоверенного объекта и общая проверка канала.
 *
 * Своего словаря глаголов и осей у фильтра нет -- он один на канал, и форму
 * просьбы проверяет `checkAsk`, тот же, что у остальных отправителей
 * (model/action-ask.ts). Ошибку валидатора этот разбор переводит в свою форму
 * ответа: здесь отвечают "bad", а не бросают.
 */
function parseAsk(
  row: Record<string, unknown>,
  code: string,
  opts: { onDeny?: boolean; sideKey?: "set" | "side" } = {},
): ParsedAsk | "bad" {
  /* У строки ключ set занят набором-условием, поэтому сторона там -- side. */
  const sideKey = opts.sideKey ?? "set";
  const to = parseText(row.to);
  const delta = parseInt0(row.delta, DELTA_MAX, DELTA_MIN);
  const value = parseInt0(row.value, VALUE_MAX, -VALUE_MAX);
  const ttl = parseInt0(row.ttl, TTL_MAX);

  if (to === "bad" || delta === "bad" || value === "bad" || ttl === "bad") {
    return "bad";
  }

  const ask: Ask & ParsedAsk = {
    to: to ?? "",
    verb: typeof row.do === "string" ? row.do.trim() : "",
    axis: "",
    do: typeof row.do === "string" ? row.do.trim() : "",
    apply: typeof row.apply === "string" ? row.apply.trim() : "",
    code,
    delta,
    value,
    counter: typeof row.counter === "string" ? row.counter.trim() : "",
    marker: typeof row.marker === "string" ? row.marker.trim() : "",
    /* Группа у mutate: раз поле есть, валидатор требует его у mutate и запрещает остальным. */
    group: typeof row.group === "string" ? row.group.trim() : "",
    /* Фаза вызова адресата у управляющих глаголов; валидатор пускает её только им. */
    phase: typeof row.phase === "string" ? row.phase.trim() : "",
    set: typeof row[sideKey] === "string" ? (row[sideKey] as string).trim() : "",
    ttlS: ttl ?? 0,
    when: Array.isArray(row.when) ? row.when.map((item) => String(item)) : [],
    headers: recordObjectOf(row.headers),
    args: recordObjectOf(row.args),
    body: recordObjectOf(row.body),
    askGroup: "",
    askPhase: "",
    askSet: "",
    askTtlS: 0,
    askWhen: [],
    askObjects: emptyAskObjects(),
  };

  try {
    checkAsk("ask", ask, {
      fail: (message) => {
        throw new Error(message);
      },
      onDeny: opts.onDeny,
      /* Ось дописывается: в базу и на провод она уезжает уже разрешённой. */
      normalize: true,
    });
  } catch {
    return "bad";
  }

  ask.axis = ask.apply;
  ask.askGroup = ask.group ?? "";
  ask.askPhase = ask.phase ?? "";
  ask.askSet = ask.set;
  ask.askTtlS = ask.ttlS;
  ask.askWhen = [...(ask.when ?? [])];
  ask.askObjects = {
    headers: ask.headers ?? null,
    args: ask.args ?? null,
    body: ask.body ?? null,
  };

  return ask;
}

/** Объект просьбы записи из недоверенного JSON; не назван -- null. */
function recordObjectOf(raw: unknown): RecordObject | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const o = raw as Record<string, unknown>;

  return {
    set: (typeof o.set === "string" ? o.set.trim() : "") as RecordObject["set"],
    limit: typeof o.limit === "number" ? o.limit : null,
    source: (typeof o.source === "string"
      ? o.source.trim()
      : "") as RecordObject["source"],
  };
}

/**
 * Одно правило. Проверки здесь -- не вкусовщина: профиль, у которого
 * threshold без delta или list без активного набора, модуль отбракует вместе
 * со всем ответом или потеряет запись молча.
 */
function parseRule(value: unknown): IpRuleInput | "bad" {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "bad";
  }

  const row = value as Record<string, unknown>;
  const action = typeof row.action === "string" ? row.action.trim() : "";

  if (!isIpRuleAction(action)) {
    return "bad";
  }

  const code = parseCode(row.code);

  if (code === "bad") {
    return "bad";
  }

  /*
   * Условие спрашивают одним из двух ключей, и каким -- решает действие.
   * Терминальная строка выносит вердикт: ей нужно выражение над сырьём, то
   * есть составной набор. Накопительная вердикта не выносит: ей нужен состав,
   * то есть сырой список из объявленных профилем. Второй ключ при этом
   * запрещён -- строка с двумя условиями читалась бы двумя способами.
   */
  const terminal = isTerminalAction(action);
  const setId = asUuid(row.set);
  const datasetId = asUuid(row.dataset);

  if (terminal ? setId === undefined || datasetId !== undefined
                : datasetId === undefined || setId !== undefined) {
    return "bad";
  }

  /*
   * «Не в списке» -- только у накопительных строк. У терминальной промах
   * нечем объяснить: находка, публичная причина и код решения называют набор,
   * в котором адрес нашёлся, -- а его тут нет. Загрузчик инспектора отвергает
   * такую строку тем же правилом.
   */
  const not = row.not === true;

  if (not && terminal) {
    return "bad";
  }

  const rule: IpRuleInput = {
    setId: terminal ? setId : null,
    datasetId: terminal ? null : datasetId,
    not,
    action,
    code,
    enabled: row.enabled === undefined ? true : row.enabled === true,
  };

  if (action === "deny") {
    const response = parseText(row.response);

    if (response === "bad") {
      return "bad";
    }

    rule.response = response ?? "";
  }

  if (action === "request") {
    const ask = parseAsk(row, code, { sideKey: "side" });

    if (ask === "bad") {
      return "bad";
    }

    rule.verb = ask.verb;
    rule.axis = ask.axis;
    rule.to = ask.to;
    rule.delta = ask.delta;
    rule.value = ask.value;
    rule.counter = ask.counter;
    rule.marker = ask.marker;
    rule.askGroup = ask.askGroup;
    rule.askSet = ask.askSet;
    rule.askTtlS = ask.askTtlS;
    rule.askWhen = ask.askWhen;
    rule.askObjects = ask.askObjects;
  }

  if (action === "list") {
    const list = asUuid(row.list);

    if (list === undefined) {
      return "bad";
    }

    const ttl = parseInt0(row.ttl, TTL_MAX);

    if (ttl === "bad") {
      return "bad";
    }

    const write = parseWrite(row.write);

    if (write === "bad") {
      return "bad";
    }

    rule.listDatasetId = list;
    rule.listTtlS = ttl ?? 0;
    rule.listWrite = write;
  }

  return rule;
}

/**
 * Кого писать в набор: адрес, подсеть (net, net_all) или систему (asn) --
 * те же слова, что у остальных отправителей. Пусто -- адрес; чужое слово --
 * битая строка, иначе она уехала бы на ноду и молча писала бы не то.
 */
/**
 * Порог перегрузки: 25..100 процентов заполнения очереди инспектора. У
 * остальных исходов поля нет вовсе -- прислали, значит форма собрана не про
 * то, и молча выбрасывать его нельзя.
 */
function parseOverloadAt(value: unknown, on: string): number | "bad" {
  if (on !== "overload") {
    return value === undefined ? OVERLOAD_AT_MAX : "bad";
  }

  if (value === undefined || value === null) {
    return OVERLOAD_AT_MAX;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "bad";
  }

  return value < OVERLOAD_AT_MIN || value > OVERLOAD_AT_MAX ? "bad" : value;
}

function parseWrite(value: unknown): IpWrite | "bad" {
  if (value === undefined || value === null || value === "") {
    return "addr";
  }

  const word = typeof value === "string" ? value.trim() : "";

  return isIpWrite(word) ? word : "bad";
}

/**
 * Списки, которые профиль просит упаковать. Логики в перечислении нет -- есть
 * только требование быть списком адресов: чем он окажется на ноде, телом или
 * темой, решает признак active, а не оператор.
 */
function parseDatasets(value: unknown): string[] | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return "bad";
  }

  const out: string[] = [];

  for (const item of value) {
    const id = asUuid(item);

    if (id === undefined) {
      return "bad";
    }

    out.push(id);
  }

  return out;
}

/**
 * Инициаторы по исходу. Проверки те же, что у загрузчика инспектора: on --
 * место из словаря (white | black | none), набор -- uuid живого набора, повод
 * -- как у остальных кодов. Инициатор, который инспектор отвергнет, не должен
 * уезжать на край.
 */
function parseOutcomes(value: unknown): IpOutcomeInput[] | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return "bad";
  }

  const out: IpOutcomeInput[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      return "bad";
    }

    const row = item as Record<string, unknown>;
    const on = typeof row.on === "string" ? row.on.trim() : "";

    if (!isIpOutcomeOn(on)) {
      return "bad";
    }

    const code = parseCode(row.code);

    if (code === "bad") {
      return "bad";
    }

    /*
     * Порог перегрузки. Только у `overload` и только 25..100: ниже двадцати
     * пяти строка срабатывала бы на любой рабочей очереди, то есть всегда, а
     * «всегда» -- это не триггер. Не прислан -- край шкалы: так строка ведёт
     * себя ровно как до появления порога.
     */
    const at = parseOverloadAt(row.at, on);

    if (at === "bad") {
      return "bad";
    }

    const verb = typeof row.do === "string" ? row.do.trim() : "";

    if (verb !== "") {
      /*
       * Просьба соседу по исходу -- та же форма, что у строк-правил, и
       * проверяет её тот же общий валидатор канала. Чёрный список здесь не
       * запрещён: решает он одним действием -- отказом, -- и просьба соседу с
       * него не доедет, но глаголы записи исполняет модуль. Оператору это
       * сказано подписью поля, а не отказом сохранить строку.
       */
      const ask = parseAsk(row, code);

      if (ask === "bad") {
        return "bad";
      }

      out.push({
        on,
        at,
        to: ask.to,
        verb: ask.verb,
        axis: ask.axis,
        delta: ask.delta,
        value: ask.value,
        counter: ask.counter,
        marker: ask.marker,
        askGroup: ask.askGroup,
        askSet: ask.askSet,
        askTtlS: ask.askTtlS,
        askWhen: ask.askWhen,
        askObjects: ask.askObjects,
        list: "",
        ttlS: 0,
        code,
      });

      continue;
    }

    const list = asUuid(row.list);

    if (list === undefined) {
      return "bad";
    }

    const ttl = parseInt0(row.ttl, TTL_MAX);

    if (ttl === "bad") {
      return "bad";
    }

    const write = parseWrite(row.write);

    if (write === "bad") {
      return "bad";
    }

    out.push({
      on,
      at,
      to: "", verb: "", axis: "", delta: null, value: null, counter: "",
      marker: "",
      askGroup: "",
      askSet: "", askTtlS: 0, askWhen: [], askObjects: emptyAskObjects(),
      list, ttlS: ttl ?? 0, write, code,
    });
  }

  return out;
}

function parseRules(value: unknown): IpRuleInput[] | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return "bad";
  }

  const out: IpRuleInput[] = [];

  for (const item of value) {
    const rule = parseRule(item);

    if (rule === "bad") {
      return "bad";
    }

    out.push(rule);
  }

  return out;
}

function parseDefault(value: unknown): IpDefaultAction | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !isIpDefaultAction(value)) {
    return "bad";
  }

  return value;
}

export function ipProfilesRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  repo: IpProfileRepo,
  compiler: IpCompiler,
  desired: DesiredStore,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/desired", async (req: Request, res: Response, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await desired.getIpPack();

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonSendIpPack(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/pack", async (req: Request, res: Response, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await desired.getIpPack();

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(row);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.post("/send", async (req: Request, res: Response, next) => {
    try {
      const spaceId = scopeOf(req);

      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const out = await compiler.compile(spaceId);

      if (out.pointer === null) {
        res.status(503).json({ error: "kv_unavailable" });
        return;
      }

      log("info", "ip sent", {
        space: spaceId,
        rev: out.pointer.rev,
        hash: out.pointer.sha256,
        blobs: out.pointer.blobs,
        wrote: out.pointer.wrote,
        reused: out.pointer.reused,
        bytes: out.pointer.bytes,
        ...out.took,
      });

      res.json(jsonSendIpPack(out.pointer, out.took));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    res.json({
      ip_profiles: selectIpProfilesInSpace(getState(), scope).map(jsonMeta),
    });
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const name = parseName(body.name);

      if (name === undefined || name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const spaceId = scopeOf(req);

      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const rules = parseRules(body.rules);
      const datasets = parseDatasets(body.datasets);
      const outcomes = parseOutcomes(body.outcomes);
      const fallback = parseDefault(body.default);
      const description = parseText(body.description) ?? "";
      const defaultCode = parseCode(body.default_code);

      if (datasets === "bad") {
        res.status(400).json({ error: "invalid_dataset" });
        return;
      }

      if (rules === "bad") {
        res.status(400).json({ error: "invalid_rule" });
        return;
      }

      if (outcomes === "bad") {
        res.status(400).json({ error: "invalid_outcome" });
        return;
      }

      if (fallback === "bad" || defaultCode === "bad") {
        res.status(400).json({ error: "invalid_default" });
        return;
      }

      if (description === "bad") {
        res.status(400).json({ error: "invalid_description" });
        return;
      }

      const row = await dispatch(
        createIpProfile({
          httpSpaceId: spaceId,
          name,
          description,
          rules: rules ?? [],
          datasets: datasets ?? [],
          outcomes: outcomes ?? [],
          defaultAction: fallback ?? "allow",
          defaultCode,
        }),
      ).unwrap();

      log("info", "ip profile created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonProfile(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/:uuid", async (req, res, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const meta = ipProfileSelectors.selectById(getState(), id);

      if (meta === undefined || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await repo.get(id);

      if (row === null || row.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonProfile(row));
    } catch (err) {
      next(err);
    }
  });

  router.put("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const existing = ipProfileSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const name = parseName(body.name);
      const description = parseText(body.description);
      const rules = parseRules(body.rules);
      const datasets = parseDatasets(body.datasets);
      const outcomes = parseOutcomes(body.outcomes);
      const fallback = parseDefault(body.default);
      const defaultCode =
        body.default_code === undefined ? undefined : parseCode(body.default_code);

      if (name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      /*
       * Переименовать default нельзя: объявление без `profile=` ищет профиль
       * по этому имени, и переименование оставило бы поколение без точки
       * опоры -- ровно то же, что удаление. Само содержимое правится: default
       * -- рабочая политика пространства, а не запертый образец. Чем он
       * поставлен и как вернуть его назад -- `default-profile.ts`.
       */
      if (isDefaultRename(existing.name, name)) {
        res.status(400).json({ error: "default_name_locked" });
        return;
      }

      if (description === "bad") {
        res.status(400).json({ error: "invalid_description" });
        return;
      }

      if (rules === "bad") {
        res.status(400).json({ error: "invalid_rule" });
        return;
      }

      if (outcomes === "bad") {
        res.status(400).json({ error: "invalid_outcome" });
        return;
      }

      if (datasets === "bad") {
        res.status(400).json({ error: "invalid_dataset" });
        return;
      }

      if (fallback === "bad" || defaultCode === "bad") {
        res.status(400).json({ error: "invalid_default" });
        return;
      }

      const row = await dispatch(
        updateIpProfile({
          id,
          patch: {
            name,
            description,
            rules,
            datasets,
            outcomes,
            defaultAction: fallback,
            defaultCode,
          },
        }),
      ).unwrap();

      log("info", "ip profile updated", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /*
   * Вернуть default к поставке -- к тому, чем он пришёл из сида
   * 060_default_profiles.sql: без правил и инициаторов, «иначе allow».
   */
  router.post("/:uuid/restore", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const existing = ipProfileSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      /*
       * Возвращать к поставке нечего у своего профиля: он не приходил из
       * сида, и «как было» у него нет.
       */
      if (existing.name !== DEFAULT_PROFILE_NAME) {
        res.status(400).json({ error: "not_default" });
        return;
      }

      const row = await dispatch(
        updateIpProfile({
          id,
          patch: {
            description: DEFAULT_IP_BASELINE.description,
            rules: [],
            datasets: [],
            outcomes: [],
            defaultAction: DEFAULT_IP_BASELINE.defaultAction,
            defaultCode: DEFAULT_IP_BASELINE.defaultCode,
          },
        }),
      ).unwrap();

      log("info", "ip profile restored", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /*
   * Профиль, названный с маршрута (`profile=` объявления, включая неявный
   * default у объявления без него), не удаляется: снять ссылку -- решение
   * оператора о политике маршрута, а не уборка.
   */
  router.delete("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const existing = ipProfileSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      /*
       * default -- то, что читает объявление без profile=, и точка опоры
       * канала: пустой источник оставляет его в broken без пути назад.
       */
      if (existing.name === "default") {
        res.status(409).json({ error: "default_required" });
        return;
      }

      const uses = profileUses(getState(), scope, "ip", existing.name);

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      const row = await dispatch(deleteIpProfile({ id })).unwrap();

      log("info", "ip profile deleted", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
