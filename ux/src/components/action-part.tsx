/**
 * Действие строки: «кому → что сделать → параметры → повод».
 *
 * Одна форма на всех отправителей канала действий — ip, капчу, контракт API и
 * правила. У каждого свой триггер («когда»): адрес в наборе, событие виджета,
 * вердикт фазы — он остаётся у вызывающей страницы. А действие у всех одно и
 * то же, и четыре копии этой формы разъезжались бы на первой правке словаря.
 *
 * Гибкость — пропсами, а не форками:
 *   - `broadcast` — пункт «всем»: просьба без адресата;
 *   - `askable` — просьбы вообще доступны (на deny их не бывает: отказ
 *     обрывает фазу, и доехать просьбе некуда);
 *   - `writes` — селектор субъекта записи (адрес / анонс / система / своё);
 *   - `extraTargets` + `renderExtra` — псевдоцели вызывающего, например
 *     «в корзину» у капчи: пункт в «Кому» общий, поля свои.
 *
 * Своего списка глаголов здесь нет — словарь приезжает с `GET /api/actions`
 * вместе с осями и слушателями. Новое действие форма подхватит вместе с
 * контроллером.
 */

import { useEffect, useState, type ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import {
  MARKER_MAX_BYTES,
  RECORD_OBJECTS,
  axesFor,
  fetchCounterShared,
  markerError,
  type ActionRegistry,
  type InspectorMeta,
  type RecordObject,
  type RecordObjectName,
} from "../api.ts";
import {
  ARCHIVE_OUTCOMES,
  sizeBytes,
  whenSummaryKey,
  type ArchiveOutcome,
} from "../config/directive-tail.ts";
import { formatSize } from "../pages/config-fields.tsx";
import {
  DialogAlert,
  DialogInput,
  DialogPick,
  DialogSection,
  DialogWhen,
} from "./dialog-kit.tsx";
import { Presets } from "./settings-table.tsx";
import { useAppSelector } from "../store/hooks.ts";
import { ACTION_CODE_RE, axisLabel, verbLabel } from "./action-select.tsx";

/** Имя группы модификаторов получателя: тот же алфавит, что у корзины. */
export const GROUP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
import { useT, type Translate } from "../i18n/index.ts";

/** Пункт «Кому», который не инспектор: запись в живой набор. */
export const TO_DATASET = "dataset";

/**
 * Адресат «всем»: просьба без имени доезжает до каждого, а применяет её тот,
 * у кого есть правило на этого отправителя. На проводе — отсутствие `to`.
 */
export const BROADCAST = "*";

/**
 * Псевдоадресат «журнал и архив маршрута»: глаголы записи (audit, archive)
 * исполняет модуль в адрес записи самого маршрута, и на проводе у них нет
 * `to`. Отдельный пункт «Кому», а не «всем»: у «всем» слушатели -- соседи, а
 * здесь слушатель один и он не инспектор. Разрешения не требуется: маршрут
 * принимает эти глаголы от любого спрошенного инспектора.
 */
export const TO_MODULE = "module";

/**
 * Псевдоадресат очков: «Очки на маршруте». Глагол `score` исполняет модуль в
 * адрес суммы фазы этого запроса -- поля `to` у него нет, как у записи, --
 * и в «Кому» он стоит своим пунктом, а не глаголом под адресатом: у строки
 * нет выбора, что сделать, есть только сколько и в какую сторону.
 */
export const TO_SCORE = "score";

/** Очки за одну просьбу: вклад одного инспектора не сильнее сотни. */
export const POINTS_MAX = 100;

/** Предел размера у объекта просьбы записи, байт: та же граница формы, что у модуля. */
export const ARCHIVE_LIMIT_MAX = 1073741824;

/** Подстановки размеров -- те же, что в окне объекта карточки пути. */
const SIZE_PRESETS = ["8k", "64k", "256k", "1m"] as const;

/** Сроки архива: те же единицы nginx, что и в окне объекта пути. */
const TTL_PRESETS = ["1h", "12h", "1d", "7d", "30d"] as const;

/** Глагол записи: адресат -- запись маршрута, а не сосед. */
export function isRouteVerb(verb: string): boolean {
  return isAuditVerb(verb) || verb === "mark";
}

/**
 * Глагол записи: переопределяет журнал или архив маршрута -- сторона, объекты,
 * срок. Маркер сюда не входит: он ничего не переопределяет, а добавляет метку,
 * и полей записи у него нет.
 */
export function isAuditVerb(verb: string): boolean {
  return verb === "audit" || verb === "archive";
}

/**
 * Управляющий глагол: режим вызова адресата, исполняет модуль. Те же четыре
 * слова, что у `waf_inspect … mode=`; признак `module` реестра без глаголов
 * записи -- панели он нужен до загрузки словаря.
 */
export function isControlVerb(verb: string): boolean {
  return verb === "active" || verb === "passive" || verb === "vote" || verb === "off";
}

/** Фазы вызова адресата у управляющих глаголов; пусто -- все вызовы имени. */
export const ASK_PHASES = ["request", "response", "frame"] as const;

/** Фаза вызова адресата словами для колонки «Параметры»; без фазы -- ничего. */
export function phaseSummary(t: Translate, ask: { phase?: string | null }): string[] {
  const phase = ask.phase ?? "";

  return phase === "" ? [] : [t(`actions.phase.${phase}`)];
}

/**
 * Объект просьбы записи в черновике -- ось «В запись» / «В архив» объекта, как
 * в окне объекта карточки пути: тумблер, размер, источник. Источник и размер
 * называются явно: «со снимка» или «оригинал», «весь» (пусто, только у
 * архива) или число. Ни «как на маршруте», ни «как у снимка» здесь нет.
 */
export interface RecordDraft {
  on: boolean;
  /** Размер; пусто значит «весь»: у архива объект целиком, у журнала до потолка датаграммы. */
  size: string;
  source: "store" | "original";
}

export type RecordDrafts = Record<RecordObjectName, RecordDraft>;

export function emptyRecordDrafts(): RecordDrafts {
  return {
    headers: { on: false, size: "", source: "store" },
    args: { on: false, size: "", source: "store" },
    body: { on: false, size: "", source: "store" },
  };
}

/** Просьба с провода -> черновики объектов. */
export function recordDraftsOf(ask: {
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
}): RecordDrafts {
  const out = emptyRecordDrafts();

  for (const name of RECORD_OBJECTS) {
    const spec = ask[name];

    if (spec === undefined || spec === null || spec.set === "off") {
      continue;
    }

    out[name] = {
      on: true,
      size: spec.limit !== null && spec.limit > 0 ? formatSize(spec.limit) : "",
      source: spec.source === "original" ? "original" : "store",
    };
  }

  return out;
}

/** Черновики объектов -> провод: названы только включённые, источник всегда явный. */
export function recordObjectsPayload(
  record: RecordDrafts,
): Record<RecordObjectName, RecordObject | null> {
  const out = {} as Record<RecordObjectName, RecordObject | null>;

  for (const name of RECORD_OBJECTS) {
    const d = record[name];

    out[name] = d.on
      ? { set: "", limit: sizeBytes(d.size) ?? null, source: d.source }
      : null;
  }

  return out;
}

/** Размер объекта читается; пусто значит «весь» у обоих глаголов. */
export function recordDraftsReady(_verb: string, record: RecordDrafts): boolean {
  for (const name of RECORD_OBJECTS) {
    const d = record[name];

    if (!d.on) {
      continue;
    }

    const bytes = sizeBytes(d.size);

    if (d.size.trim() !== "" && (bytes === undefined || bytes <= 0 || bytes > ARCHIVE_LIMIT_MAX)) {
      return false;
    }
  }

  return true;
}

/** Осмысленный диапазон коэффициента threshold: проценты, множитель 1+p/100. */
export const THRESHOLD_PERCENT_MIN = -100;
export const THRESHOLD_PERCENT_MAX = 900;

/**
 * Черновик действия. Направления — словами, величины — без знака: знак
 * проставляет сборка, и перепутать «строже» с «мягче» можно только текстом.
 */
export interface ActionDraft {
  /** Имя инспектора, BROADCAST, TO_DATASET либо псевдоцель вызывающего. */
  target: string;
  verb: string;
  axis: string;
  direction: "stricter" | "softer";
  percent: string;
  noteDir: "add" | "cut";
  notePercent: string;
  /**
   * Только note: имя корзины получателя — селектор поверх его правил приёма.
   * Пусто — корзину называет правило получателя.
   */
  counter: string;
  /**
   * Только mutate: какую группу модификаторов получателя переключить и куда.
   * Что именно — называет отправитель, как корзину у note; имена групп живут
   * у получателя, поэтому группа текстом.
   */
  group: string;
  /**
   * Только управляющие глаголы: вызову какой фазы адресата ставить режим.
   * Пусто -- всем вызовам имени, как и без поля на проводе.
   */
  phase: string;
  /** У mutate — куда переключить группу; у audit / archive — писать или нет. */
  set: "on" | "off";
  /**
   * Только mark: метка события на записи. Произвольная строка оператора —
   * алфавита у неё нет, её читает человек в журнале.
   */
  marker: string;
  /**
   * Только archive с set on: какие объекты оставить агенту, срок в архиве
   * человеческой записью и предел байтами. Пусто — как записано на маршруте.
   */
  /** Объекты просьбы записи -- оси «В запись» / «В архив», объект за объектом. */
  record: RecordDrafts;
  /** Срок в архиве человеческой записью; пусто — как на маршруте. */
  archiveTtl: string;
  /**
   * Только archive с set on: на каких исходах маршрута просьбу исполнять --
   * как when= директивы. Пусто — на любом, включая перенаправление: просьба
   * сильнее when= маршрута, о котором отправитель не знает.
   */
  archiveWhen: ArchiveOutcome[];

  /** Запись в набор: имя либо uuid — что удобно вызывающему. */
  list: string;
  /** Субъект записи; вне селектора `writes` не используется. */
  write: string;
  /** Срок человеческой записью: "90", "15m", "1h", "7d". */
  ttl: string;

  /** Очки на маршруте: направление словами и величина без знака, 1..100. */
  scoreDir: "add" | "cut";
  scorePoints: string;

  code: string;
}

export function emptyActionDraft(): ActionDraft {
  return {
    target: "",
    verb: "",
    axis: "",
    direction: "stricter",
    percent: "",
    noteDir: "add",
    notePercent: "",
    counter: "",
    group: "",
    phase: "",
    set: "on",
    marker: "",
    record: emptyRecordDrafts(),
    archiveTtl: "",
    archiveWhen: [],
    list: "",
    write: "addr",
    ttl: "",
    scoreDir: "add",
    scorePoints: "",
    code: "",
  };
}

/** Просьба с провода открывается тем же черновиком, каким её собрали. */
export function draftOfAsk(ask: {
  to?: string | null;
  do?: string | null;
  apply?: string | null;
  delta?: number | null;
  value?: number | null;
  counter?: string | null;
  group?: string | null;
  phase?: string | null;
  set?: string | null;
  marker?: string | null;
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  /** У просьбы archive это срок архива; у записи в набор -- срок записи. */
  ttlS?: number | null;
  /** Только archive: исходы, на которых просьбу исполнять. */
  when?: readonly string[] | null;
  code?: string | null;
}): ActionDraft {
  const out = emptyActionDraft();

  out.verb = ask.do ?? "";
  /* Глагол записи адресата не несёт: его пункт «Кому» -- сам маршрут. */
  out.target = isRouteVerb(out.verb)
    ? TO_MODULE
    : (ask.to ?? "") === "" ? BROADCAST : (ask.to as string);

  /* Очки -- свой пункт «Кому», глагола в черновике нет: он один. */
  if (out.verb === "score") {
    out.target = TO_SCORE;
    out.verb = "";
    out.scoreDir = (ask.value ?? 0) >= 0 ? "add" : "cut";
    out.scorePoints = String(Math.abs(ask.value ?? 0));
    out.code = ask.code ?? "";

    return out;
  }
  out.axis = ask.apply ?? "";
  out.counter = ask.counter ?? "";
  out.group = ask.group ?? "";
  out.phase = ask.phase ?? "";
  out.set = ask.set === "off" ? "off" : "on";
  out.marker = ask.marker ?? "";
  out.record = recordDraftsOf(ask);
  out.archiveTtl = (ask.ttlS ?? 0) > 0 ? humanTtl(ask.ttlS as number) : "";
  out.archiveWhen = ARCHIVE_OUTCOMES.filter((name) => (ask.when ?? []).includes(name));
  out.code = ask.code ?? "";

  if (ask.delta !== null && ask.delta !== undefined) {
    out.direction = ask.delta >= 0 ? "stricter" : "softer";
    out.percent = String(Math.abs(ask.delta));
  }

  if (ask.value !== null && ask.value !== undefined) {
    out.noteDir = ask.value >= 0 ? "add" : "cut";
    out.notePercent = String(Math.abs(ask.value));
  }

  return out;
}

/** Запись в набор открывается тем же черновиком. */
export function draftOfList(row: {
  list: string;
  write?: string;
  ttlS: number;
  code?: string | null;
}): ActionDraft {
  const out = emptyActionDraft();

  out.target = TO_DATASET;
  out.list = row.list;
  out.write = row.write === undefined || row.write === "" ? "addr" : row.write;
  out.ttl = row.ttlS === 0 ? "" : humanTtl(row.ttlS);
  out.code = row.code ?? "";

  return out;
}

/** Срок человеческой записью: секунды в форме читаются хуже, чем ошибаются. */
export function humanTtl(seconds: number): string {
  if (seconds % 86400 === 0) {
    return `${seconds / 86400}d`;
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
}

/** Срок принимается и человеческой записью, и голыми секундами. */
export function ttlSeconds(raw: string): number {
  const value = raw.trim().toLowerCase();

  if (value === "") {
    return 0;
  }

  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const mult = units[value.slice(-1)];
  const digits = mult === undefined ? value : value.slice(0, -1);
  const n = Number(digits);

  if (!Number.isInteger(n) || n <= 0) {
    return 0;
  }

  return n * (mult ?? 1);
}

function numberOk(raw: string, min: number, max: number): boolean {
  if (raw.trim() === "") {
    return false;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Слушатели словаря названы сервисами (modsec, captcha), а записи реестра —
 * экземплярами (modsec-strict, ip-ext) с общим subject вида waf.req.<сервис>.
 * Сервис и берётся из subject; голое имя проверяется тоже — на случай записи
 * с нестандартной темой.
 */
function serviceOf(row: InspectorMeta): string {
  return row.subject.split(".").pop() || row.name;
}

/**
 * Что умеет адресат. «Всем» — только глаголы, которые слушает больше одного
 * получателя: адресный глагол, отправленный всем, — тот же адресный глагол
 * плюс шум в чужих аудитах.
 */
export function verbsOf(
  registry: ActionRegistry | null,
  inspectors: InspectorMeta[],
  target: string,
  /*
   * Чем отправитель умеет пользоваться из глаголов записи. Пусто -- всеми:
   * реестр общий, а вот профиль конкретного отправителя переопределять журнал
   * и архив может не уметь вовсе (у правил адреса из записи маршрута есть
   * только маркер). Предложить мышью то, чего контроллер не сохранит, хуже,
   * чем не предложить.
   */
  only?: readonly string[],
): string[] {
  const all = registry?.verbs ?? [];

  // Глаголы записи (route) -- только псевдоадресату «запись маршрута»:
  // слушатель у них один, и он не инспектор. Очки -- тоже маршруту, но у
  // них свой пункт «Кому» (TO_SCORE): выбирать глагол там не из чего.
  if (target === TO_MODULE) {
    return all
      .filter(
        (row) =>
          row.route === true && row.do !== "score" && (only === undefined || only.includes(row.do)),
      )
      .map((row) => row.do);
  }

  // Управляющие глаголы (module) исполняет модуль в адрес вызова: любому
  // названному адресату они годятся, а «всем» -- нет: режим ставят
  // одному вызову.
  if (target === BROADCAST) {
    return all
      .filter(
        (row) => row.module !== true && (row.listeners.length === 0 || row.listeners.length > 1),
      )
      .map((row) => row.do);
  }

  const found = inspectors.find((row) => row.name === target);
  const service = found === undefined ? target : serviceOf(found);

  return all
    .filter(
      (row) =>
        row.route !== true &&
        (row.module === true ||
          row.listeners.length === 0 ||
          row.listeners.includes(service) ||
          row.listeners.includes(target)),
    )
    .map((row) => row.do);
}

/**
 * Пункты «Что сделать» двумя секциями: управляющие глаголы -- режим вызова
 * адресата, который исполняет модуль, -- сверху, просьбы соседу -- под чертой.
 * Заголовок над просьбами появляется только рядом с режимами: одной группе
 * подпись не нужна. Массив, а не компонент: Select читает детей сам, и
 * фрагмент ему не годится.
 *
 * `current` -- глагол, который уже стоит в правиле. Словарь у адресата мог
 * сузиться после того, как правило сохранили (так ушёл skip у всех, кроме
 * счётчика): такой глагол остаётся в меню, чтобы правило открывалось тем, что
 * в нём записано, а не пустым полем. Новому правилу его не предложат.
 */
export function verbMenuItems(
  t: Translate,
  registry: ActionRegistry | null,
  verbs: readonly string[],
  current = "",
): ReactNode[] {
  const shown = current !== "" && !verbs.includes(current) ? [...verbs, current] : verbs;
  const isRoute = (verb: string): boolean =>
    registry?.verbs.find((row) => row.do === verb)?.route === true;
  const isMode = (verb: string): boolean =>
    !isRoute(verb) && registry?.verbs.find((row) => row.do === verb)?.module === true;
  const routes = shown.filter(isRoute);
  const modes = shown.filter(isMode);
  const asks = shown.filter((verb) => !isMode(verb) && !isRoute(verb));
  const headSx = { fontSize: "0.68rem", lineHeight: 2 };
  const item = (verb: string) => (
    <MenuItem key={verb} value={verb}>
      {verbLabel(t, verb)}
    </MenuItem>
  );

  const out: ReactNode[] = [];

  /* Глаголы записи живут у своего псевдоадресата и ни с кем не смешиваются. */
  if (routes.length > 0) {
    out.push(
      <ListSubheader key="group-record" disableSticky sx={headSx}>
        {t("actions.group.record")}
      </ListSubheader>,
      ...routes.map(item),
    );
  }

  if (modes.length > 0) {
    out.push(
      <ListSubheader key="group-mode" disableSticky sx={headSx}>
        {t("actions.group.mode")}
      </ListSubheader>,
      ...modes.map(item),
    );
  }

  if (modes.length > 0 && asks.length > 0) {
    out.push(
      <ListSubheader
        key="group-ask"
        disableSticky
        sx={{ ...headSx, mt: 0.5, borderTop: 1, borderColor: "divider" }}
      >
        {t("actions.group.ask")}
      </ListSubheader>,
    );
  }

  out.push(...asks.map(item));

  return out;
}

export interface ActionReadyOptions {
  /** Просьбы доступны; false — годится только запись в набор. */
  askable: boolean;
  /** Запись в набор обязана нести срок (у ip срок необязателен). */
  ttlRequired?: boolean;
  /**
   * Псевдоцели вызывающего: их готовность он проверяет сам. undefined —
   * цель не его, решает общая проверка.
   */
  extraReady?: (target: string) => boolean | undefined;
}

/** Действие собрано: адресат, глагол и его величины либо набор со сроком. */
export function actionReady(draft: ActionDraft, opts: ActionReadyOptions): boolean {
  if (draft.code !== "" && !ACTION_CODE_RE.test(draft.code)) {
    return false;
  }

  if (draft.target === TO_DATASET) {
    if (draft.list === "") {
      return false;
    }

    if ((opts.ttlRequired ?? true) && ttlSeconds(draft.ttl) <= 0) {
      return false;
    }

    return draft.ttl.trim() === "" || ttlSeconds(draft.ttl) > 0;
  }

  /* Очки: величина 1..100, направление всегда выбрано. */
  if (draft.target === TO_SCORE) {
    return numberOk(draft.scorePoints, 1, POINTS_MAX);
  }

  /* Псевдоцель отвечает за себя сама: у капчи это заряд корзины. */
  if (opts.extraReady !== undefined) {
    const extra = opts.extraReady(draft.target);

    if (extra !== undefined) {
      return extra;
    }
  }

  if (!opts.askable || draft.target === "" || draft.verb === "") {
    return false;
  }

  /* Переключить группу: имя обязательно и по форме; сторона есть всегда. */
  if (draft.verb === "mutate" && !GROUP_NAME_RE.test(draft.group.trim())) {
    return false;
  }

  /* Пометить: без метки просьбы нет, и длиннее предела её не примет модуль. */
  if (draft.verb === "mark" && markerError(draft.marker) !== null) {
    return false;
  }

  /* Журнал и архив: срок и размеры объектов обязаны читаться. */
  if (isAuditVerb(draft.verb) && draft.set === "on") {
    if (draft.verb === "archive" && draft.archiveTtl.trim() !== "" && ttlSeconds(draft.archiveTtl) <= 0) {
      return false;
    }

    if (!recordDraftsReady(draft.verb, draft.record)) {
      return false;
    }
  }

  /*
   * Коэффициент: величина без знака, потолок зависит от направления —
   * скидка глубже нуля не бывает (100%), наценка дорожает до ×10 (900%).
   */
  if (draft.verb === "threshold") {
    const cap =
      draft.direction === "softer" ? -THRESHOLD_PERCENT_MIN : THRESHOLD_PERCENT_MAX;

    return numberOk(draft.percent, 1, cap);
  }

  /* Изменение счётчика без величины бессмысленно: 1..100% от шкалы. */
  if (draft.verb === "note") {
    return numberOk(draft.notePercent, 1, 100);
  }

  return true;
}

/** Просьба в форме провода; знак величин проставляется здесь. */
export function askPayload(
  draft: ActionDraft,
  registry: ActionRegistry | null,
): {
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  /** Только mark: метка события на записи. */
  marker: string;
  group: string;
  /** Только управляющие глаголы: фаза вызова адресата; пусто -- всем вызовам имени. */
  phase: string;
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /** Срок архива в секундах у archive с set on; 0 -- как на маршруте. */
  ttlS: number;
  /** Исходы архива; пусто -- любой, как отсутствие when= у директивы. */
  when: ArchiveOutcome[];
} {
  const axes = axesFor(registry, draft.verb === "" ? [] : [draft.verb]);
  const scoring = draft.target === TO_SCORE;
  /* Объекты -- у обоих глаголов записи при set on. */
  const recording = isAuditVerb(draft.verb) && draft.set === "on";
  const archiving = draft.verb === "archive" && draft.set === "on";
  const objects = recording
    ? recordObjectsPayload(draft.record)
    : { headers: null, args: null, body: null };

  /*
   * «Про кого»: где выбора нет, проставляет реестр. Пустым уехать не может —
   * действие без оси модуль отбраковывает вместе со всем ответом. У глаголов
   * записи первая ось словаря — запись запроса.
   */
  const apply = draft.axis !== "" ? draft.axis : (axes[0] ?? "");

  const out = {
    /* «Всем», «журнал и архив» и очки на проводе — отсутствие адресата. */
    to: draft.target === BROADCAST || draft.target === TO_MODULE || scoring ? "" : draft.target,
    /* Очки: глагол один, ось одна -- этот запрос. */
    do: scoring ? "score" : draft.verb,
    apply: scoring ? "request" : apply,
    delta: null as number | null,
    value: null as number | null,
    /* Корзина -- селектор note: у прочих глаголов её не бывает. */
    counter: draft.verb === "note" ? draft.counter.trim() : "",
    /* Группа -- только у mutate; сторона -- у mutate и глаголов записи. */
    group: draft.verb === "mutate" ? draft.group.trim() : "",
    /* Фаза вызова -- только у управляющих: у прочих адресат не вызов. */
    phase: isControlVerb(draft.verb) ? draft.phase : "",
    set: draft.verb === "mutate" || isAuditVerb(draft.verb) ? draft.set : ("" as const),
    /* Метка -- только у mark: у прочих глаголов ей нечего значить. */
    marker: draft.verb === "mark" ? draft.marker.trim() : "",
    /* Объекты -- у журнала и архива; срок -- только у архива. У записи ответа строки запроса нет. */
    headers: objects.headers,
    args: apply === "response" ? null : objects.args,
    body: objects.body,
    ttlS: archiving ? ttlSeconds(draft.archiveTtl) : 0,
    when: archiving ? [...draft.archiveWhen] : [],
  };

  if (draft.verb === "threshold") {
    const magnitude = Number(draft.percent);

    out.delta = draft.direction === "softer" ? -magnitude : magnitude;
  }

  if (draft.verb === "note") {
    const magnitude = Number(draft.notePercent);

    out.value = draft.noteDir === "cut" ? -magnitude : magnitude;
  }

  /* Очки со знаком: снять -- минус. */
  if (scoring) {
    const magnitude = Number(draft.scorePoints);

    out.value = draft.scoreDir === "cut" ? -magnitude : magnitude;
  }

  return out;
}

export interface TargetOption {
  value: string;
  label: string;
}

/**
 * Поля глаголов записи: сторона на весь журнал / архив, срок у архива и по
 * объектам -- те же оси «В запись» / «В архив», что в окне объекта карточки
 * пути (тумблер, размер с подстановками, источник), только без «как у
 * снимка» и «как на маршруте»: просьба называет источник и размер явно --
 * «весь» либо число.
 * Общие для ActionPart и формы правил (ActionProfiles): два набора одних и
 * тех же полей разъезжались бы на первой правке.
 */
export function AuditFields({
  verb,
  axis,
  set,
  record,
  ttl,
  when,
  frame = false,
  onChange,
}: {
  verb: string;
  /** Какую запись переопределить: request (запроса) либо response (ответа); пусто — запроса. */
  axis: string;
  set: "on" | "off";
  record: RecordDrafts;
  ttl: string;
  /** Только archive: исходы, на которых просьбу исполнять; пусто -- любой. */
  when: ArchiveOutcome[];
  /** Правило кадра: записи ответа у кадра нет, и выбор записи не показывается. */
  frame?: boolean;
  onChange: (patch: {
    axis?: string;
    set?: "on" | "off";
    record?: RecordDrafts;
    ttl?: string;
    when?: ArchiveOutcome[];
  }) => void;
}) {
  const t = useT();

  if (!isAuditVerb(verb)) {
    return null;
  }

  const audit = verb === "audit";
  const response = axis === "response";
  const onLabel = audit ? t("actions.audit.write") : t("actions.audit.keep");
  const offLabel = audit ? t("actions.audit.skip") : t("actions.audit.drop");
  const patchObject = (name: RecordObjectName, part: Partial<RecordDraft>) =>
    onChange({ record: { ...record, [name]: { ...record[name], ...part } } });

  const sourceOptions = [
    { value: "store" as const, label: t("tail.sourceCapture"), hint: t("tail.sourceCaptureHint") },
    { value: "original" as const, label: t("tail.sourceOriginal"), hint: t("tail.sourceOriginalHint") },
  ];

  /* Размер: пусто значит «весь» -- у журнала до потолка датаграммы. */
  const sizeRow = (name: RecordObjectName, d: RecordDraft) => (
    <DialogInput
      label={audit ? t("tail.budget") : t("tail.archiveSize")}
      hint={audit ? t("actions.audit.budgetHint") : t("actions.audit.sizeHint")}
      value={d.size}
      placeholder={t("tail.whole")}
      end={
        <Presets
          keep
          items={[
            { label: t("tail.whole"), value: "" },
            ...SIZE_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.size}
          onPick={(next) => patchObject(name, { size: next === d.size ? "" : next })}
        />
      }
      onChange={(size) => patchObject(name, { size })}
    />
  );

  const sourceRow = (name: RecordObjectName, d: RecordDraft) => (
    <>
      <DialogPick
        label={t("tail.source")}
        hint={t("actions.audit.sourceHint")}
        value={d.source}
        options={sourceOptions}
        onChange={(source) => patchObject(name, { source })}
      />
      <DialogAlert
        tone={d.source === "original" ? "warning" : "info"}
        text={t(
          d.source === "original"
            ? "tail.alert.sourceOriginal"
            : "actions.audit.alertSourceCapture",
        )}
      />
    </>
  );

  /*
   * Объект просьбы -- тот же сворачиваемый блок с тумблером, что и ось в окне
   * объекта пути: это и есть та же ось, только названная просьбой. Свёрнутая
   * шапка говорит, что с объектом будет, -- «как на маршруте» у выключенного.
   */
  const objectBlock = (name: RecordObjectName) => {
    const d = record[name];

    return (
      <DialogSection
        key={name}
        title={t(`tail.objects.${name}`)}
        hint={t("actions.audit.objectShort")}
        summary={
          d.on
            ? [
                d.size === "" ? t("tail.whole") : d.size,
                t(d.source === "original" ? "tail.sourceOriginal" : "tail.sourceCapture"),
              ].join(" · ")
            : t("actions.audit.objectAsRoute")
        }
        checked={d.on}
        onCheck={(on) => patchObject(name, { on })}
        defaultOpen={d.on}
      >
        {audit ? (
          <>
            {sizeRow(name, d)}
            {sourceRow(name, d)}
          </>
        ) : (
          <>
            {sourceRow(name, d)}
            {sizeRow(name, d)}
          </>
        )}
      </DialogSection>
    );
  };

  return (
    <>
      {/*
        Какую запись транзакции: запроса или ответа. У каждой своё
        переопределение, и назначить обе можно с любой фазы — двумя
        строками. У кадра записи ответа нет.
      */}
      {!frame && (
        <TextField
          select
          size="small"
          label={t("actions.audit.record")}
          value={response ? "response" : "request"}
          onChange={(e) =>
            onChange({
              axis: e.target.value,
              /* У записи ответа строки запроса нет: её черновик сбрасывается. */
              record:
                e.target.value === "response"
                  ? { ...record, args: emptyRecordDrafts().args }
                  : record,
            })
          }
          helperText={t("actions.audit.recordHint")}
        >
          <MenuItem value="request">{t("actions.audit.recordOf.request")}</MenuItem>
          <MenuItem value="response">{t("actions.audit.recordOf.response")}</MenuItem>
        </TextField>
      )}

      <TextField
        select
        size="small"
        label={t("actions.audit.set")}
        value={set}
        onChange={(e) => onChange({ set: e.target.value as "on" | "off" })}
      >
        <MenuItem value="on">{onLabel}</MenuItem>
        <MenuItem value="off">{offLabel}</MenuItem>
      </TextField>

      {/*
        Что просьба сделает с записью -- отдельным блоком, а не `helperText`-ом
        под селектором: у «писать» и «не писать» правило разное, и оба длиннее
        строки. Главное в нём -- что «писать» сильнее маршрута: сэмпл, ось
        записи и её объекты просьбу не отменяют.
      */}
      <DialogAlert
        tone={set === "on" ? "warning" : "info"}
        text={t(
          audit
            ? set === "on"
              ? "actions.audit.alertAuditOn"
              : "actions.audit.alertAuditOff"
            : set === "on"
              ? "actions.audit.alertArchiveOn"
              : "actions.audit.alertArchiveOff",
        )}
      />

      {set === "on" && (
        <>
          <DialogAlert
            text={audit ? t("actions.audit.objectsAuditHint") : t("actions.audit.objectsArchiveHint")}
          />
          <Stack spacing={1}>
            {RECORD_OBJECTS.filter((name) => !response || name !== "args").map(objectBlock)}
          </Stack>
          {!audit && (
            <>
              <DialogInput
                label={t("actions.audit.ttl")}
                hint={t("actions.audit.ttlHint")}
                value={ttl}
                placeholder="30d"
                end={
                  <Presets
                    keep
                    items={TTL_PRESETS.map((item) => ({ label: item, value: item }))}
                    current={ttl}
                    onPick={(next) => onChange({ ttl: next === ttl ? "" : next })}
                  />
                }
                onChange={(next) => onChange({ ttl: next })}
              />
              {/*
                Исход -- фильтр из четырёх названных состояний. Двумя кнопками
                он не читался: «любой исход» набирался тем, что не нажато
                ничего, и выглядел незаполненным полем -- при том, что просьба
                сильнее when= маршрута, и «сохрани что бы ни случилось» это
                именно он.
              */}
              <DialogWhen
                label={t("actions.audit.when")}
                hint={t("actions.audit.whenHint")}
                value={when}
                onChange={(next) =>
                  onChange({ when: ARCHIVE_OUTCOMES.filter((name) => next.includes(name)) })
                }
              />
            </>
          )}
        </>
      )}
    </>
  );
}

/** Параметры глагола записи одной фразой -- для колонки «Параметры». */
export function auditSummary(
  t: Translate,
  ask: {
    do: string;
    set?: string | null;
    headers?: RecordObject | null;
    args?: RecordObject | null;
    body?: RecordObject | null;
    ttlS?: number | null;
    when?: readonly string[] | null;
    apply?: string | null;
  },
): string[] {
  if (!isAuditVerb(ask.do)) {
    return [];
  }

  const on = ask.set !== "off";
  const parts = [
    /* Запись ответа называется; запись запроса — умолчание, и её не пишут. */
    ...(ask.apply === "response" ? [t("actions.audit.recordResponse")] : []),
    ask.do === "audit"
      ? t(on ? "actions.audit.write" : "actions.audit.skip")
      : t(on ? "actions.audit.keep" : "actions.audit.drop"),
  ];

  if (on) {
    /* Объект за объектом: имя, размер, источник -- как читается строка директивы. */
    for (const name of RECORD_OBJECTS) {
      const spec = ask[name];

      if (spec === undefined || spec === null) {
        continue;
      }

      if (spec.set === "off") {
        parts.push(`${t(`tail.objects.${name}`)}: ${t("actions.audit.objectOff")}`);
        continue;
      }

      const bits = [t(`tail.objects.${name}`)];

      bits.push(spec.limit !== null && spec.limit > 0 ? formatSize(spec.limit) : t("tail.whole"));

      if (spec.source === "store" || spec.source === "original") {
        bits.push(t(spec.source === "store" ? "tail.sourceCapture" : "tail.sourceOriginal"));
      }

      parts.push(bits.join(" "));
    }

    if (ask.do === "archive" && (ask.ttlS ?? 0) > 0) {
      parts.push(humanTtl(ask.ttlS as number));
    }

    /*
     * Исход -- в ту же фразу: «сохранить» и «сохранить, если откажем» -- разные
     * просьбы, и в таблице их надо различать не открывая форму.
     */
    if (ask.do === "archive") {
      const when = ARCHIVE_OUTCOMES.filter((name) => (ask.when ?? []).includes(name));

      if (when.length > 0) {
        parts.push(t(whenSummaryKey(when)));
      }
    }
  }

  return parts;
}

export function ActionPart({
  draft,
  onChange,
  registry,
  inspectors,
  datasets,
  askable,
  broadcast = false,
  writable = true,
  writes,
  writeHint,
  ttlRequired = true,
  extraTargets = [],
  renderExtra,
  toHint,
  showCode = true,
  codeHint,
  moduleTarget = false,
  moduleVerbs,
  routeOnly = false,
  frame = false,
}: {
  draft: ActionDraft;
  onChange: (patch: Partial<ActionDraft>) => void;
  registry: ActionRegistry | null;
  inspectors: InspectorMeta[];
  /**
   * Показывать пункт «журнал и архив маршрута» -- глаголы записи. Только у
   * отправителей, чей документ возит set/objects/limit: иначе правило
   * сохранится без них и загрузчик его отвергнет.
   */
  moduleTarget?: boolean;
  /**
   * Какие глаголы записи умеет этот отправитель. Пусто -- все, что в реестре;
   * список сужает выбор там, где профиль хранит не всё (у правил адреса из
   * записи маршрута есть только маркер).
   */
  moduleVerbs?: readonly string[];
  /**
   * Просьбы только маршруту: на отказе соседу ехать некуда, а журнал и архив
   * исполняет модуль, и отказ для них главный случай. Действует при
   * `askable` false вместе с `moduleTarget`.
   */
  routeOnly?: boolean;
  /** Правило кадра: у глаголов записи не предлагается запись ответа — у кадра её нет. */
  frame?: boolean;
  /** Куда можно писать; value — имя либо uuid, решает вызывающий. */
  datasets: TargetOption[];
  askable: boolean;
  broadcast?: boolean;
  /** Умеет ли отправитель писать в наборы. Ложь прячет цель «в набор». */
  writable?: boolean;
  /** Селектор субъекта записи; отсутствует — не показывается вовсе. */
  writes?: TargetOption[];
  /**
   * Подпись селектора «Кого». Умолчание рассказывает про кодер гео, а у
   * отправителя, за которого пишет модуль, кодера нет -- и обещать подсети
   * там нельзя.
   */
  writeHint?: string;
  ttlRequired?: boolean;
  /** Псевдоцели вызывающего в «Кому» — например «в корзину» у капчи. */
  extraTargets?: TargetOption[];
  /** Поля выбранной псевдоцели рендерит вызывающий. */
  renderExtra?: (target: string) => ReactNode;
  /** Подсказка «Кому»; без неё — общая, у аскабельных и нет разная. */
  toHint?: string;
  showCode?: boolean;
  codeHint?: string;
}) {
  const t = useT();
  const scope = useAppSelector((state) => state.session.scope);

  /*
   * Подсказки корзин для note в адрес счётчика: декларации fill: note его
   * общей секции. Список -- подсказка, а не словарь: профиль отправителя
   * может быть написан раньше декларации, поэтому ввод свободный.
   */
  const [noteBuckets, setNoteBuckets] = useState<string[]>([]);

  useEffect(() => {
    if (draft.target !== "counter" || scope === null) {
      return;
    }

    let alive = true;

    fetchCounterShared(scope)
      .then((shared) => {
        if (alive) {
          setNoteBuckets(
            Object.keys(shared.counters)
              .filter((name) => shared.counters[name]?.fill === "note")
              .sort(),
          );
        }
      })
      .catch(() => {
        /* Пустые подсказки -- осмысленное состояние: поле остаётся вводом. */
      });

    return () => {
      alive = false;
    };
  }, [draft.target, scope]);

  const set = onChange;
  const writing = draft.target === TO_DATASET;
  const scoring = draft.target === TO_SCORE;
  const extra = extraTargets.some((row) => row.value === draft.target);
  /* Псевдоадресат маршрута доступен и там, где соседям просьб не бывает. */
  const routeAsk =
    (askable || routeOnly)
    && moduleTarget
    && verbsOf(registry, inspectors, TO_MODULE, moduleVerbs).length > 0;
  const canAsk = askable || (routeOnly && draft.target === TO_MODULE);

  const verbs =
    writing || extra || draft.target === ""
      ? []
      : verbsOf(registry, inspectors, draft.target, moduleVerbs);
  const axes = axesFor(registry, draft.verb === "" ? [] : [draft.verb]);

  /* Адресаты-инспекторы: только те, кому есть что предложить. */
  const targets = inspectors.filter(
    (row) => verbsOf(registry, inspectors, row.name).length > 0,
  );

  return (
    <>
      <TextField
        select
        size="small"
        label={t("outcomes.outcomeTo")}
        value={draft.target}
        onChange={(e) => {
          const target = e.target.value;

          if (
            target === TO_DATASET ||
            target === TO_SCORE ||
            extraTargets.some((row) => row.value === target)
          ) {
            set({ target, verb: "", axis: "" });

            return;
          }

          /*
           * Сменили адресата — прежний глагол мог стать ему не адресованным.
           * Остаётся, только если новый его слушает.
           */
          const still = verbsOf(registry, inspectors, target).includes(draft.verb);

          set({ target, verb: still ? draft.verb : "", axis: still ? draft.axis : "" });
        }}
        helperText={
          toHint ??
          (askable
            ? t("outcomes.outcomeToHint")
            : routeAsk
              ? t("outcomes.outcomeToDenyRouteHint")
              : t("outcomes.outcomeToDenyHint"))
        }
      >
        {askable && broadcast && (
          <MenuItem value={BROADCAST}>
            {t("outcomes.toAll")} ({BROADCAST})
          </MenuItem>
        )}
        {askable &&
          targets.map((row) => (
            <MenuItem key={row.uuid} value={row.name}>
              {row.name}
            </MenuItem>
          ))}
        {routeAsk && (
          <MenuItem value={TO_MODULE}>{t("outcomes.toModule")}</MenuItem>
        )}
        {/* Очки: исполняет модуль, поэтому доступны и там, где соседу просьба не доедет. */}
        {(askable || routeOnly) && (
          <MenuItem value={TO_SCORE}>{t("outcomes.toScore")}</MenuItem>
        )}
        {extraTargets.map((row) => (
          <MenuItem key={row.value} value={row.value}>
            {row.label}
          </MenuItem>
        ))}
        {writable && (
          <MenuItem value={TO_DATASET}>{t("outcomes.toDataset")}</MenuItem>
        )}
      </TextField>

      {extra && renderExtra !== undefined && renderExtra(draft.target)}

      {/*
        Очки на маршруте: направление словами, величина без знака. Знак
        проставляет сборка -- «снять» уезжает минусом.
      */}
      {scoring && (
        <>
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label={t("actions.score.direction")}
              value={draft.scoreDir}
              onChange={(e) => set({ scoreDir: e.target.value as ActionDraft["scoreDir"] })}
              sx={{ flex: 1.2 }}
            >
              <MenuItem value="add">{t("actions.score.add")}</MenuItem>
              <MenuItem value="cut">{t("actions.score.cut")}</MenuItem>
            </TextField>
            <TextField
              size="small"
              label={t("actions.score.points")}
              value={draft.scorePoints}
              onChange={(e) => set({ scorePoints: e.target.value.trim() })}
              required
              error={draft.scorePoints !== "" && !numberOk(draft.scorePoints, 1, POINTS_MAX)}
              helperText={t("actions.score.pointsHint")}
              sx={{ flex: 1 }}
            />
          </Stack>
          <DialogAlert text={t("actions.verbs.score.hint")} />
        </>
      )}

      {writing && (
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label={t("outcomes.outcomeList")}
            value={draft.list}
            onChange={(e) => set({ list: e.target.value })}
            helperText={t("outcomes.outcomeListHint")}
            sx={{ flex: 1.4 }}
          >
            {datasets.map((row) => (
              <MenuItem key={row.value} value={row.value}>
                {row.label}
              </MenuItem>
            ))}
            {datasets.length === 0 && (
              <MenuItem disabled value="">
                {t("outcomes.listEmpty")}
              </MenuItem>
            )}
          </TextField>
          {writes !== undefined && (
            <TextField
              select
              size="small"
              label={t("outcomes.outcomeWriteLabel")}
              value={draft.write}
              onChange={(e) => set({ write: e.target.value })}
              helperText={writeHint ?? t("outcomes.outcomeWriteHint")}
              sx={{ flex: 1.2 }}
            >
              {writes.map((row) => (
                <MenuItem key={row.value} value={row.value}>
                  {row.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            size="small"
            label={t("outcomes.outcomeTtl")}
            value={draft.ttl}
            onChange={(e) => set({ ttl: e.target.value })}
            required={ttlRequired}
            helperText={t("outcomes.outcomeTtlHint")}
            sx={{ flex: 1 }}
          />
        </Stack>
      )}

      {canAsk && !writing && !scoring && !extra && draft.target !== "" && (
        <>
          <TextField
            select
            size="small"
            label={t("outcomes.outcomeWhat")}
            value={draft.verb}
            onChange={(e) =>
              set({
                verb: e.target.value,
                /*
                 * Баллы копятся в счётчиках субъектов — «этот запрос» у
                 * накинутых баллов мёртвая пара, и первым по словарю стоять
                 * она не должна.
                 */
                axis: e.target.value === "note" ? "ip" : "",
              })
            }
          >
            {verbMenuItems(t, registry, verbs, draft.verb)}
          </TextField>

          {/*
            Что глагол делает -- блоком, а не `helperText`-ом: у половины
            словаря это пять-шесть строк (кто исполняет, что сильнее чего, кого
            спрашивают), и серым кеглем 0.7 под полем они читались подписью к
            селектору, а не правилом.
          */}
          {draft.verb !== "" && <DialogAlert text={t(`actions.verbs.${draft.verb}.hint`)} />}

          {/*
            «Про кого» спрашивают только там, где выбор настоящий. У «изменить
            счётчик» это выбор счётчика, и запроса среди них нет: счётчик живёт
            у субъекта, а не у запроса.
          */}
          {axes.length > 1 && !isRouteVerb(draft.verb) && (
            <TextField
              select
              size="small"
              label={t("actions.counter.label")}
              /*
               * Пустая ось -- та, что подставит askPayload: у note адрес, у
               * управляющих и глаголов записи первая по словарю (request).
               * Иначе селектор показывал бы пустоту при сохранённом request.
               */
              value={draft.axis !== "" ? draft.axis : draft.verb === "note" ? "ip" : (axes[0] ?? "")}
              onChange={(e) => set({ axis: e.target.value })}
            >
              {axes
                .filter((axis) => draft.verb !== "note" || axis !== "request")
                .map((axis) => (
                  <MenuItem key={axis} value={axis}>
                    {axisLabel(t, axis)}
                  </MenuItem>
                ))}
            </TextField>
          )}

          {/*
            Фаза вызова адресата: у имени, стоящего на двух фазах, вызова два,
            и режим можно поставить одному. Пусто -- обоим, как без поля.
          */}
          {isControlVerb(draft.verb) && (
            <TextField
              select
              size="small"
              label={t("actions.phase.label")}
              value={draft.phase}
              onChange={(e) => set({ phase: e.target.value })}
              helperText={t("actions.phase.hint")}
              /* Пустое значение -- «на всех фазах», а не незаполненное поле: слово показывается. */
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
            >
              <MenuItem value="">{t("actions.phase.all")}</MenuItem>
              {ASK_PHASES.map((phase) => (
                <MenuItem key={phase} value={phase}>
                  {t(`actions.phase.${phase}`)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {/*
            Коэффициент без знака руками: направление словами, знак форма
            проставляет сама. «Строже» дорожает до ×10, «мягче» — скидка не
            глубже нуля.
          */}
          {draft.verb === "threshold" && (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label={t("actions.direction.label")}
                value={draft.direction}
                onChange={(e) =>
                  set({ direction: e.target.value as ActionDraft["direction"] })
                }
                sx={{ flex: 1.2 }}
              >
                <MenuItem value="stricter">{t("actions.direction.stricter")}</MenuItem>
                <MenuItem value="softer">{t("actions.direction.softer")}</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={t("actions.direction.percent")}
                value={draft.percent}
                onChange={(e) => set({ percent: e.target.value })}
                required
                helperText={t("actions.direction.percentHint")}
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {/*
            Изменение счётчика: пополнение — долей порога, снятие — долей
            накопленного; числа порога остаются у получателя.
          */}
          {/*
            Корзина: только для счётчика -- у него шкал несколько, и селектор
            поверх его правил приёма выбирает среди выданного. Капче поле не
            показывается: её корзину выбирает ось.
          */}
          {draft.verb === "note" && draft.target === "counter" && (
            <Autocomplete
              freeSolo
              autoSelect
              size="small"
              options={noteBuckets.filter((name) => name !== draft.counter)}
              value={draft.counter}
              onChange={(_e, next) => set({ counter: (next ?? "").trim() })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label={t("actions.counter.bucket")}
                  helperText={t("actions.counter.bucketHint")}
                />
              )}
            />
          )}

          {draft.verb === "note" && (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label={t("actions.counter.direction")}
                value={draft.noteDir}
                onChange={(e) => set({ noteDir: e.target.value as ActionDraft["noteDir"] })}
                sx={{ flex: 1.2 }}
              >
                <MenuItem value="add">{t("actions.counter.add")}</MenuItem>
                <MenuItem value="cut">{t("actions.counter.cut")}</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={t("actions.counter.percent")}
                value={draft.notePercent}
                onChange={(e) => set({ notePercent: e.target.value })}
                required
                helperText={t("actions.counter.percentHint")}
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {/*
            Переключить группу модификаторов: что и куда, называет отправитель,
            как корзину у note. Группа -- текстом: её имена живут у получателя.
          */}
          {draft.verb === "mutate" && (
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label={t("actions.mutate.group")}
                value={draft.group}
                onChange={(e) => set({ group: e.target.value.trim() })}
                required
                helperText={t("actions.mutate.groupHint")}
                sx={{ flex: 1.2 }}
              />
              <TextField
                select
                size="small"
                label={t("actions.mutate.set")}
                value={draft.set}
                onChange={(e) => set({ set: e.target.value as ActionDraft["set"] })}
                sx={{ flex: 1 }}
              >
                <MenuItem value="on">{t("actions.mutate.on")}</MenuItem>
                <MenuItem value="off">{t("actions.mutate.off")}</MenuItem>
              </TextField>
            </Stack>
          )}

          {/*
            Метка: свободная строка оператора, и подсказок ей взять неоткуда --
            метки живут в его голове и в журнале, а не в реестре. Проверяется
            только форма: пусто, длиннее предела и управляющие символы модуль
            отбраковывает вместе со всем ответом инспектора.
          */}
          {draft.verb === "mark" && (
            <TextField
              size="small"
              label={t("actions.mark.marker")}
              value={draft.marker}
              onChange={(e) => set({ marker: e.target.value })}
              required
              error={draft.marker !== "" && markerError(draft.marker) !== null}
              helperText={t("actions.mark.markerHint", { max: MARKER_MAX_BYTES })}
            />
          )}

          {/* Глаголы записи: сторона, у archive -- объекты, срок и предел. */}
          <AuditFields
            verb={draft.verb}
            axis={draft.axis}
            set={draft.set}
            record={draft.record}
            ttl={draft.archiveTtl}
            when={draft.archiveWhen}
            frame={frame}
            onChange={(patch) =>
              set({
                ...(patch.axis !== undefined ? { axis: patch.axis } : {}),
                ...(patch.set !== undefined ? { set: patch.set } : {}),
                ...(patch.record !== undefined ? { record: patch.record } : {}),
                ...(patch.ttl !== undefined ? { archiveTtl: patch.ttl } : {}),
                ...(patch.when !== undefined ? { archiveWhen: patch.when } : {}),
              })
            }
          />
        </>
      )}

      {showCode && (
        <TextField
          size="small"
          label={t("outcomes.outcomeCode")}
          value={draft.code}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          helperText={codeHint ?? t("outcomes.outcomeCodeHint")}
          /*
            Повод -- машинный код: истории браузера здесь нечего подставлять.
            Chrome заливал поле чужим значением формы (`__UNSET__`), и кнопка
            сохранения гасла без видимой причины.
          */
          autoComplete="off"
        />
      )}
    </>
  );
}
