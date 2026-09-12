import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import {
  DraftCell,
  FilterCell,
  FilterSelect,
  TableIconButton,
  TableNoticeRow,
  type FilterOption,
} from "../components/data-table/index.ts";
import {
  BLEED,
  flushTableSx,
  HeadCell,
  headCellSx,
  TableBlock,
} from "../components/table-block.tsx";
import { dragSx, GripCell, useRowDrag, type DragApi } from "../components/row-drag.tsx";
import { DialogAlert, DialogLines, DialogSection } from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  CONDS_HELP,
  CondTable,
  asConds,
  condTail,
  condsDraft,
  readyConds,
  withConds,
  type Cond,
} from "../config/CondDialog.tsx";
import { formatTime, parseTime } from "../config/InspectorRegistry.tsx";
import { Picker } from "../config/Picker.tsx";
import {
  WaveBudget,
  type BudgetEdit,
  type BudgetFrom,
  type WaveRow,
} from "../config/Waves.tsx";
import type { Translate } from "../i18n/index.ts";
import {
  fetchDeclaredInspectors,
  fetchSpaceHttp,
  type DeclaredInspector,
  type InspectorPhase,
} from "../api.ts";
import {
  asRecord,
  asString,
  setKey,
  type Doc,
} from "./config-fields.tsx";

export type InspectorMode = "active" | "passive" | "vote" | "off" | "ignore";
export type InspectorResume = "off" | "prefer" | "require";

/**
 * Строка `waf_inspect <фаза> <name> wave=<n> [timeout=] [mode=]
 * [resume=]`. Других опций у вызова нет: `profile=` -- реестр, `phase=` --
 * первое слово, `weight=` снят, и всё это на строке роняет `nginx -t`.
 * `resume=` -- только потребляющие фазы, на запросе колонки нет.
 * См. docs/directives/list/inspect.md.
 */
/** Сторона кадров у вызова фазы frame; без ключа -- от клиента. */
export type InspectorStream = "c2s" | "s2c" | "both";

export const STREAMS: readonly InspectorStream[] = ["c2s", "s2c", "both"];

export function isStream(value: unknown): value is InspectorStream {
  return value === "c2s" || value === "s2c" || value === "both";
}

export type InspectorRef = {
  name: string;
  wave?: number;
  timeoutMs?: number;
  mode?: InspectorMode;
  resume?: InspectorResume;
  /**
   * Только у фазы frame: какую сторону спрашивать -- от клиента
   * (`frame:c2s`, умолчание), от приложения (`frame:s2c`) или обе (`frame`).
   */
  stream?: InspectorStream;
  /**
   * `keep=on`: держать состояние после ответа -- за ним вернётся фаза ответа
   * того же инспектора с `resume=`. Только фаза запроса; парность двух строк
   * проверяет контроллер до рассылки и `nginx -t` на ноде.
   */
  keep?: boolean;
  /**
   * `if <значение> in|not in <набор>`: звать инспектора не на всяком запросе.
   * Условие не сошлось -- строка пропускается, волна идёт дальше без неё.
   */
  conds?: Cond[];
};

/**
 * Что стоит у строки за шестерёнкой -- её условия вызова. Пусто -- за
 * шестерёнкой ничего не задано, и кнопка стоит обычным цветом.
 */
function callTail(row: InspectorRef): string {
  return condTail(row.conds).trim();
}

/**
 * Режимы вызова -- ровно те, что принимает директива:
 * `mode=active|passive|vote|off`, умолчание `active`
 * (docs/directives/list/inspect.md). `vote` -- совещательный голос: очки в
 * сумму, deny как 100, сам не решает. `off` -- записан, но не публикуется,
 * пока сосед не включит. `ignore` -- снятое значение старых документов:
 * генератор такую строку просто не печатает.
 */
const MODES = ["active", "passive", "vote", "off"] as const;
const RESUMES: InspectorResume[] = ["off", "prefer", "require"];

/**
 * Что предлагать на пути: наследование там настоящее -- «нет строки фазы на
 * location -- берёт сервер этой фазы» (docs/directives/list/inspect.md).
 */
const KINDS = ["inherit", "none", "override"] as const;

/**
 * Что предлагать на сервере. Наследовать нечего: `http {}` инспекторов только
 * объявляет, никакого `waf_inspect` там нет, и отсутствие строки значит не
 * «взять сверху», а «фаза не бежит» -- то же самое, что `none`. Поэтому выбор
 * из двух: никого или свой список.
 */
const SERVER_KINDS = ["none", "override"] as const;

/**
 * `all` из списка снят: он разворачивался в весь реестр, а директива такого
 * значения не знает -- набор либо перечислен, либо `none`. В типе он остаётся,
 * чтобы уже сохранённый документ читался и был заменяем.
 */
type ListKind = "inherit" | "all" | "none" | "override";
type ListKey = "requestInspectors" | "responseInspectors" | "frameInspectors";

/** Фаза набора: запрос, ответ и кадры клиента (waf_inspect frame:c2s). */
type RoutePhase = "request" | "response" | "frame";

/**
 * Что не так с именем строки набора. `unknown` -- каталог такого процесса не
 * знает: компилятор такой документ не собирает (`unknown_inspector`).
 * `phase` -- знает, но этой фазы он не заявляет: строка напечатается, вызов
 * уйдёт, отвечать будет некому, и фаза досидит до дедлайна.
 *
 * Строку из-за этого не отнимают и имя не прячут: процесс могли объявить
 * позже, а нередактируемый набор -- худшая беда, чем неверная строка.
 */
type NameIssue = "unknown" | "phase" | undefined;

/*
 * Ширины колонок -- одна константа на колонку: их повторяют шапка и обе
 * разновидности строки (правится / показывается), и разойдись они, колонки
 * поехали бы относительно подписей.
 *
 * Подобраны под ящик карточки (768) с колонкой продолжения: колонки туда
 * влезают только целиком, а горизонтальный скролл внутри карточки -- дефект.
 * `pair` -- держание на запросе и продолжение на ответе: колонка одна на фазу,
 * и у обеих таблиц по шесть колонок, поэтому ширина у них общая.
 */
const W = {
  order: 78,
  name: 116,
  timeout: 92,
  mode: 128,
  pair: 116,
  stream: 124,
  actions: 72,
} as const;

/**
 * Волна -- группа соседних строк, а не число, которое набирают.
 *
 * Директиве нужен `wave=`, но сами номера ей безразличны: пустая волна
 * пропускается, значит `0,1,5` и `0,1,2` бегут одинаково
 * (docs/directives/list/inspect.md). Значимы только порядок волн и то, кто с
 * кем в одной. Поэтому номер выводится из порядка строк, а не правится полем:
 * поле рядом с перетаскиванием означало бы, что порядок задают двумя разными
 * способами, и видимый порядок расходился бы с настоящим -- строка `wave=0`
 * под строкой `wave=1` была здесь обычным делом.
 *
 * Ключ -- дробное число, чтобы переезд и слияние выражались одинаково:
 * одинаковый ключ -- одна волна, порядок ключей -- порядок волн. После правки
 * ключи сжимаются обратно в 0, 1, 2 ([renumber]).
 */
type Keyed = { ref: InspectorRef; key: number };

/** Строки в порядке исполнения. Внутри волны -- как лежат в документе. */
function ordered(refs: InspectorRef[]): Keyed[] {
  return refs
    .map((ref, index) => ({ ref, key: ref.wave ?? 0, index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ ref, key }) => ({ ref, key }));
}

/** Ключи обратно в номера волн: 0, 1, 2 -- без дыр и дробей. */
function renumber(rows: Keyed[]): InspectorRef[] {
  let wave = -1;
  let prev: number | undefined;
  return rows.map(({ ref, key }) => {
    if (prev === undefined || key !== prev) {
      wave += 1;
      prev = key;
    }
    return { ...ref, wave };
  });
}

/**
 * Переезд строки.
 *
 * Куда она попала -- решают соседи: между двумя строками одной волны она
 * входит в эту волну, на границе волн встаёт своей. Иначе перетаскивание
 * внутрь параллельной группы означало бы «разорвать её», чего никто не просил.
 */
function moveRef(refs: InspectorRef[], from: number, to: number): InspectorRef[] {
  const rows = ordered(refs);
  const moved = rows[from];
  if (moved === undefined || to < 0 || to >= rows.length || from === to) {
    return refs;
  }
  const next = [...rows];
  next.splice(from, 1);
  next.splice(to, 0, moved);
  const prev = next[to - 1];
  const after = next[to + 1];
  const key =
    prev !== undefined && after !== undefined && prev.key === after.key
      ? prev.key
      : prev === undefined
        ? (after?.key ?? 0) - 1
        : after === undefined
          ? prev.key + 1
          : (prev.key + after.key) / 2;
  return renumber(next.map((row) => (row === moved ? { ref: row.ref, key } : row)));
}

/**
 * Граница между строкой и предыдущей.
 *
 * Слить -- строка и её хвост уходят в предыдущую волну; разорвать -- строка и
 * её хвост становятся новой волной. Хвост едет вместе с ней: иначе снятие
 * галочки у средней строки группы уводило бы её вниз, под тех, кто и так шёл
 * следом.
 */
function joinWave(refs: InspectorRef[], index: number, joined: boolean): InspectorRef[] {
  const rows = ordered(refs);
  const prev = rows[index - 1];
  const row = rows[index];
  if (prev === undefined || row === undefined) {
    return refs;
  }
  const from = row.key;
  const key = joined ? prev.key : prev.key + 0.5;
  return renumber(
    rows.map((item, i) => (i >= index && item.key === from ? { ref: item.ref, key } : item)),
  );
}

function isMode(value: unknown): value is InspectorMode {
  return (
    value === "active" ||
    value === "passive" ||
    value === "vote" ||
    value === "off" ||
    value === "ignore"
  );
}

function isResume(value: unknown): value is InspectorResume {
  return value === "off" || value === "prefer" || value === "require";
}

function listKind(value: unknown): ListKind {
  if (value === "all" || value === "none") {
    return value;
  }
  if (Array.isArray(value)) {
    return "override";
  }
  return "inherit";
}

function asRefs(value: unknown): InspectorRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: InspectorRef[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Doc;
    const row: InspectorRef = { name: asString(rec.name) };
    if (typeof rec.wave === "number" && Number.isInteger(rec.wave) && rec.wave >= 0) {
      row.wave = rec.wave;
    }
    if (typeof rec.timeoutMs === "number" && rec.timeoutMs > 0) {
      row.timeoutMs = rec.timeoutMs;
    }
    // `weight` старых документов не читается: множителя у модуля больше нет.
    if (isMode(rec.mode)) {
      row.mode = rec.mode;
    }
    if (isResume(rec.resume)) {
      row.resume = rec.resume;
    }
    if (isStream(rec.stream)) {
      row.stream = rec.stream;
    }
    if (rec.keep === true) {
      row.keep = true;
    }
    const conds = asConds(rec.conds);
    if (conds.length > 0) {
      row.conds = conds;
    }
    rows.push(row);
  }
  return rows;
}

function uniqueNames(items: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const name = item.trim();
    if (name === "" || seen.has(name)) {
      continue;
    }
    seen.add(name);
    next.push(name);
  }
  return next;
}

/**
 * Режим, унаследованный картой `inspectorModes`. Профиль сюда не входит:
 * `profile=` -- опция реестра `waf_inspector`, а не вызова, и на строке
 * `waf_inspect` роняет `nginx -t`.
 */
function applyMaps(ref: InspectorRef, chain: Doc[]): InspectorRef {
  let mode = ref.mode;
  for (const doc of chain) {
    const inheritedMode = asRecord(doc.inspectorModes)[ref.name];
    if (mode === undefined && isMode(inheritedMode)) {
      mode = inheritedMode;
    }
  }
  const next: InspectorRef = { ...ref };
  if (mode !== undefined) {
    next.mode = mode;
  }
  return next;
}

function inheritedRefs(chain: Doc[], field: ListKey, known: string[]): InspectorRef[] {
  for (const doc of chain) {
    const kind = listKind(doc[field]);
    if (kind === "inherit") {
      continue;
    }
    if (kind === "none") {
      return [];
    }
    if (kind === "override") {
      return asRefs(doc[field]).map((row) => applyMaps(row, chain));
    }
    return known.map((name) => applyMaps({ name }, chain));
  }
  return known.map((name) => applyMaps({ name }, chain));
}

/** Что из набора реально побежит: строку `ignore` генератор не печатает. */
function toWaveRows(refs: InspectorRef[]): WaveRow[] {
  return refs
    .filter((ref) => ref.mode !== "ignore")
    .map((ref) => ({
      name: ref.name,
      wave: ref.wave ?? 0,
      timeoutMs: ref.timeoutMs,
      passive: ref.mode === "passive",
    }));
}

/**
 * Ключ бюджета фазы в документе маршрута: `waf_deadline <фаза>`. Фаза ответа
 * и кадры без своего ключа берут бюджет запроса -- это семантика самой
 * директивы (docs/directives/list/deadline.md), а не подстановка формы.
 */
const DEADLINE_KEY: Record<RoutePhase, string> = {
  request: "deadlineMs",
  response: "responseDeadlineMs",
  frame: "frameDeadlineMs",
};

/** Умолчание модуля, когда ключа нет ни на одном уровне: `50ms`. */
const MODULE_DEADLINE_MS = 50;

/** Действующий бюджет фазы и тот, чей это ключ. */
interface PhaseBudget {
  ms: number;
  /** Ключ фазы записан на этом уровне: значение своё. */
  own: boolean;
  from?: BudgetFrom;
}

/**
 * Секция инспекторов маршрута.
 *
 * Мемоизована: состояние карточки лежит одной кучей в форме уровня
 * (`pages/Paths.tsx`), поэтому набранный символ в поле пути перерисовывал и
 * обе таблицы фаз -- под три десятка строк, которых правка пути не касается.
 * Пропсы для этого ссылочно постоянны: `t` -- `useCallback` по локали,
 * документ и его родитель приезжают объектами из состояния и Redux.
 */
export const WafProtect = memo(function WafProtect({
  t,
  scope,
  value,
  onChange,
  parent,
  root,
  level = "location",
  phases = ["request", "response", "frame"],
}: {
  t: Translate;
  scope: string;
  value: Doc;
  onChange: (next: Doc) => void;
  parent?: Doc;
  root?: boolean;
  /** Сервер задаёт набор, путь его переопределяет. */
  level?: "server" | "location";
  /** Фазы уровня: у http-пути запрос и ответ, у websocket -- запрос и кадры. */
  phases?: RoutePhase[];
}) {
  const [httpWaf, setHttpWaf] = useState<Doc | null>(null);
  /*
   * Объявленные имена контура: узлы `*.waf.inspectors`, развёрнутые через
   * свой процесс из каталога. Набор маршрута предлагает ровно их: каталог
   * перечисляет процессы, а звать можно только объявленное имя -- вызов мимо
   * объявлений компилятор отвергает (`undeclared_inspector`), и раньше он
   * молча дообъявлял такое имя из каталога с дефолтным профилем.
   */
  const [declared, setDeclared] = useState<DeclaredInspector[]>([]);
  // Пустой список объявлений -- законное состояние, а не «ещё не загрузилось»:
  // пометки строк молчат только до ответа, а не при пустом реестре.
  const [declaredReady, setDeclaredReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchDeclaredInspectors(scope)
      .then((rows) => {
        if (alive) {
          setDeclared(rows);
          setDeclaredReady(true);
        }
      })
      .catch(() => {
        if (alive) {
          setDeclared([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    if (root === true) {
      return;
    }
    let alive = true;
    void fetchSpaceHttp(scope)
      .then((doc) => {
        if (alive) {
          setHttpWaf(doc.waf);
        }
      })
      .catch(() => {
        if (alive) {
          setHttpWaf(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [root, scope]);

  const inspectorNames = useMemo(
    () => uniqueNames(declared.map((row) => row.name)),
    [declared],
  );

  /*
   * Какие фазы умеет процесс за объявлением. Набор маршрута предлагает на
   * фазе только тех, кто её умеет: инспектор запроса в наборе фазы ответа --
   * это вызов, на который никто не ответит. Объявление без процесса
   * (`known=false`) фаз не заявляет -- из списков оно не прячется, чтобы
   * набор не стал нередактируемым, но помечается как поломанное.
   */
  const phasesOf = useMemo(
    () =>
      Object.fromEntries(
        declared.filter((row) => row.known).map((row) => [row.name, row.phases]),
      ) as Record<string, InspectorPhase[]>,
    [declared],
  );
  const broken = useMemo(
    () => new Set(declared.filter((row) => !row.known).map((row) => row.name)),
    [declared],
  );

  /*
   * Что показать под именем в момент выбора: профиль и тема процесса.
   * Привязка -- это выбор набора правил, и увидеть его надо здесь, а не
   * после сборки.
   */
  const hintOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of declared) {
      map.set(row.name, `${row.profile} · ${row.subject ?? "—"}`);
    }
    return (name: string) => map.get(name);
  }, [declared]);

  /*
   * Процесс за именем: по нему строка меняет имя только на другой профиль
   * того же процесса. Сменить вид -- значит завести другую строку: таймаут,
   * вес, условия и держание старой относились к прежнему виду.
   */
  const processOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of declared) {
      if (row.known) {
        map.set(row.name, row.process);
      }
    }
    return (name: string) => map.get(name);
  }, [declared]);

  /*
   * Кому есть что держать: пара keep/resume существует только у имени, чей
   * процесс ведёт обе фазы. Инспектору одной фазы ячейка держания не
   * предлагается -- вторая половина пары не бежит, и селектор предлагал бы
   * бессмыслицу. До ответа объявлений не прячем, чтобы не мигать.
   */
  /*
   * Пара keep/resume связывает фазу запроса с ответом. Кадры транзакцию
   * рукопожатия не продолжают -- каждый инспектируется сам по себе, -- так
   * что у фазы кадров пары нет вовсе.
   */
  // Без фазы ответа на узле (websocket-путь) держать не для кого: `keep=on`
  // там -- keep_without_resume на сборке.
  const withResponsePhase = phases.includes("response");
  const pairableFor = useMemo(
    () => (phase: RoutePhase) => (name: string) => {
      if (phase === "frame" || !withResponsePhase) {
        return false;
      }
      if (!declaredReady) {
        return true;
      }
      const list = phasesOf[name];
      return list !== undefined && list.includes("request") && list.includes("response");
    },
    [declaredReady, phasesOf, withResponsePhase],
  );

  const namesFor = useMemo(
    () => (phase: InspectorPhase) =>
      inspectorNames.filter((name) => {
        const list = phasesOf[name];
        return list === undefined || list.includes(phase);
      }),
    [inspectorNames, phasesOf],
  );
  const requestNames = useMemo(() => namesFor("request"), [namesFor]);
  const responseNames = useMemo(() => namesFor("response"), [namesFor]);
  const frameNames = useMemo(() => namesFor("frame"), [namesFor]);

  /*
   * Чем обернётся имя на этой фазе. Пока объявления не ответили, молчим:
   * иначе «не объявлен» получили бы все строки разом.
   */
  const issueOf = useMemo(
    () =>
      (phase: InspectorPhase) =>
      (name: string): NameIssue => {
        if (name === "" || !declaredReady) {
          return undefined;
        }
        // Не объявлен -- или объявлен, но процесса за объявлением нет:
        // исход одинаковый, сборка на этом имени падает.
        if (!inspectorNames.includes(name) || broken.has(name)) {
          return "unknown";
        }
        const list = phasesOf[name];
        return list !== undefined && !list.includes(phase) ? "phase" : undefined;
      },
    [broken, declaredReady, inspectorNames, phasesOf],
  );

  /*
   * Родительская цепочка с именем уровня. Набор берётся по документам, а
   * бюджет фазы ещё и показывает, откуда приехал, -- поэтому цепочка хранится
   * с пометками, а не двумя списками. `parent` есть только у пути: это
   * документ его сервера.
   */
  const chain = useMemo(() => {
    if (root === true) {
      return [] as { doc: Doc; from: "server" | "http" }[];
    }
    const out: { doc: Doc; from: "server" | "http" }[] = [];
    if (parent !== undefined) {
      out.push({ doc: parent, from: "server" });
    }
    if (httpWaf !== null) {
      out.push({ doc: httpWaf, from: "http" });
    }
    return out;
  }, [httpWaf, parent, root]);

  const parents = useMemo(() => chain.map((item) => item.doc), [chain]);

  // На сервере «нет ключа» и `none` -- одно и то же: фаза не бежит.
  const shownKind = (kind: ListKind): ListKind =>
    level === "server" && kind === "inherit" ? "none" : kind;

  const requestKind = listKind(value.requestInspectors);
  const responseKind = listKind(value.responseInspectors);
  const frameKind = listKind(value.frameInspectors);
  const requestShown = shownKind(requestKind);
  const responseShown = shownKind(responseKind);
  const frameShown = shownKind(frameKind);

  /*
   * Что показывает таблица. Свой набор редактируется, чужой показывается тем
   * же строем и запертым: «что здесь побежит» -- один вопрос, и отвечать на
   * него двумя разными видами значит заставлять читать заново.
   *
   * «Все» -- это все, кто умеет фазу, а не весь реестр: так разворачивает
   * набор компилятор (nginx-emit.ts, expandInspects).
   */
  const shownRefs = useCallback(
    (
      kind: ListKind,
      own: unknown,
      field: ListKey,
      names: string[],
    ): InspectorRef[] => {
      if (kind === "none" || (kind === "inherit" && level === "server")) {
        return [];
      }
      if (kind === "all") {
        return names.map((name) => ({ name, wave: 0 }));
      }
      if (kind === "override") {
        return asRefs(own);
      }
      return inheritedRefs(parents, field, names);
    },
    [level, parents],
  );

  /*
   * Набор пересчитывается от своего ключа, а не от документа целиком.
   *
   * `asRefs` разбирает документ в новые объекты, и строки, мемоизованные по
   * ним ([InspectRow]), считали бы их изменившимися. А документ здесь общий:
   * в него же пишет локальный слой и снимок, -- так что от `value` целиком обе
   * таблицы перебирались бы на каждую правку соседней секции, хотя наборов
   * та не касается.
   */
  const requestRefs = useMemo(
    () =>
      shownRefs(requestShown, value.requestInspectors, "requestInspectors", requestNames),
    [requestNames, requestShown, shownRefs, value.requestInspectors],
  );
  const responseRefs = useMemo(
    () =>
      shownRefs(
        responseShown,
        value.responseInspectors,
        "responseInspectors",
        responseNames,
      ),
    [responseNames, responseShown, shownRefs, value.responseInspectors],
  );
  const frameRefs = useMemo(
    () => shownRefs(frameShown, value.frameInspectors, "frameInspectors", frameNames),
    [frameNames, frameShown, shownRefs, value.frameInspectors],
  );

  /*
   * Действующий бюджет фазы и тот, кто его задал: строка цены под таблицей
   * показывает и правит его на месте, а править его надо, зная, чьё сейчас
   * значение, -- своё или приехавшее сверху.
   */
  const budgetOf = useCallback(
    (key: string): PhaseBudget | undefined => {
      const own = value[key];
      if (typeof own === "number") {
        return { ms: own, own: true };
      }
      for (const item of chain) {
        const ms = item.doc[key];
        if (typeof ms === "number") {
          return { ms, own: false, from: item.from };
        }
      }
      return undefined;
    },
    [chain, value],
  );

  const requestBudget = useMemo(
    (): PhaseBudget =>
      budgetOf(DEADLINE_KEY.request) ?? {
        ms: MODULE_DEADLINE_MS,
        own: false,
        from: "module",
      },
    [budgetOf],
  );

  // Свой бюджет у фазы ответа появляется своим ключом; нет ключа -- как у
  // запроса (docs/directives/list/deadline.md).
  const responseBudget = useMemo(
    (): PhaseBudget =>
      budgetOf(DEADLINE_KEY.response) ?? {
        ms: requestBudget.ms,
        own: false,
        from: "request",
      },
    [budgetOf, requestBudget],
  );

  const frameBudget = useMemo(
    (): PhaseBudget =>
      budgetOf(DEADLINE_KEY.frame) ?? {
        ms: requestBudget.ms,
        own: false,
        from: "request",
      },
    [budgetOf, requestBudget],
  );

  const setKind = (field: ListKey, next: ListKind) => {
    if (next === "inherit") {
      onChange(setKey(value, field, undefined));
      return;
    }
    if (next === "none" || next === "all") {
      onChange(setKey(value, field, next));
      return;
    }
    /*
     * «Задать» открывает свой набор, а не копию чужого: раньше пустое место
     * заполнялось списком родителя, а когда наследовать было нечего -- всем
     * реестром, и маршрут молча получал строки, которых никто не выбирал.
     * Уже набранные строки остаются -- это возврат из `none` к своему списку.
     */
    onChange(setKey(value, field, asRefs(value[field])));
  };

  /**
   * Пункты селекта. `all` не предлагается, но остаётся видимым там, где уже
   * лежит в документе: иначе селект показывал бы пустую строку, а документ
   * продолжал бы разворачивать весь реестр.
   */
  const kindOptions = (kind: ListKind): FilterOption<ListKind>[] => {
    const offered: ListKind[] = [...(level === "server" ? SERVER_KINDS : KINDS)];
    const shown = kind === "all" ? [...offered, "all" as ListKind] : offered;
    return shown.map((item) => ({ value: item, label: t(`routeSettings.kind.${item}`) }));
  };

  // Блоки идут вплотную: свои поля и разделяющую линию каждый несёт сам.
  return (
    <Stack spacing={0}>
      {phases.includes("request") && (
        <PhaseBlock
          t={t}
          phase="request"
          last={!phases.includes("response") && !phases.includes("frame")}
          title={t("routeSettings.request")}
          hint={t("routeSettings.requestHint")}
          kind={requestShown}
          options={kindOptions(requestKind)}
          refs={requestRefs}
          budget={requestBudget}
          field="requestInspectors"
          value={value}
          names={requestNames}
          hintOf={hintOf}
          processOf={processOf}
          pairable={pairableFor("request")}
          issue={issueOf("request")}
          level={level}
          onChange={onChange}
          onKind={(next) => setKind("requestInspectors", next)}
        />
      )}
      {/*
        Фаза ответа бежит: ответ удерживается до вердикта (`waf_hold`), отказ
        отдаёт страницу каталога. Снимка тела этой фазы ещё нет -- инспектор
        видит статус, заголовки и request_store, -- но это оговорка в подписи,
        а не причина глушить секцию.
      */}
      {phases.includes("response") && (
        <PhaseBlock
          t={t}
          phase="response"
          last={!phases.includes("frame")}
          title={t("routeSettings.response")}
          hint={t("routeSettings.responseHint")}
          kind={responseShown}
          options={kindOptions(responseKind)}
          refs={responseRefs}
          budget={responseBudget}
          field="responseInspectors"
          value={value}
          names={responseNames}
          hintOf={hintOf}
          processOf={processOf}
          pairable={pairableFor("response")}
          issue={issueOf("response")}
          level={level}
          onChange={onChange}
          onKind={(next) => setKind("responseInspectors", next)}
        />
      )}
      {/*
        Кадры WebSocket от клиента: после 101 каждый кадр держится до вердикта,
        отказ закрывает соединение кадром Close из записи каталога. Выдачу
        приложения модуль пока не разбирает, и блока под неё нет.
      */}
      {phases.includes("frame") && (
        <PhaseBlock
          t={t}
          phase="frame"
          title={t("routeSettings.frame")}
          hint={t("routeSettings.frameHint")}
          kind={frameShown}
          options={kindOptions(frameKind)}
          refs={frameRefs}
          budget={frameBudget}
          field="frameInspectors"
          value={value}
          names={frameNames}
          hintOf={hintOf}
          processOf={processOf}
          pairable={pairableFor("frame")}
          issue={issueOf("frame")}
          level={level}
          last
          onChange={onChange}
          onKind={(next) => setKind("frameInspectors", next)}
        />
      )}
    </Stack>
  );
});

/**
 * Имена для ячейки: другие профили того же процесса, плюс уже выбранное.
 * Смена имени в строке -- смена профиля, а не вида: таймаут, вес, условия и
 * держание набирались под этот вид, и «ip вместо modsec» их бы молча
 * переосмыслил. Другой вид добавляется своей строкой через диалог. Имя без
 * процесса (не объявлено) чинится любым объявленным именем фазы. Под именем
 * -- профиль и тема процесса: что именно привязывается, видно в момент
 * выбора.
 */
function nameOptions(
  names: string[],
  current: string,
  hintOf?: (name: string) => string | undefined,
  processOf?: (name: string) => string | undefined,
): FilterOption[] {
  const proc = processOf?.(current);
  const pool =
    proc === undefined ? names : names.filter((name) => processOf?.(name) === proc);
  const all = pool.includes(current) || current === "" ? pool : [current, ...pool];

  return all.map((name) => ({ value: name, label: name, hint: hintOf?.(name) }));
}

/**
 * Фаза одним блоком: заголовок с селектором «чем задан набор» и сразу под ним
 * таблица вызовов.
 *
 * Набор показывается одной и той же таблицей во всех трёх состояниях: свой --
 * редактируется, чужой (наследуется) и `none` -- заперты. Картинки волн рядом
 * нет: имена уже перечислены в таблице, и повторять их фишками значило бы
 * показывать один список дважды. От неё остаётся цена фазы строкой под
 * таблицей.
 */
function PhaseBlock({
  t,
  phase,
  title,
  hint,
  kind,
  options,
  refs,
  budget,
  field,
  value,
  names,
  hintOf,
  processOf,
  pairable,
  issue,
  level,
  last,
  onChange,
  onKind,
}: {
  t: Translate;
  phase: RoutePhase;
  title: string;
  hint: string;
  kind: ListKind;
  options: FilterOption<ListKind>[];
  /** Что показывает таблица: свой набор, унаследованный или пустота `none`. */
  refs: InspectorRef[];
  /** Действующий бюджет фазы: он же правится строкой цены под таблицей. */
  budget: PhaseBudget;
  field: ListKey;
  value: Doc;
  names: string[];
  /** Подстрочник имени в селекторе: профиль и тема процесса за объявлением. */
  hintOf?: (name: string) => string | undefined;
  /** Процесс за именем: строка меняет имя только внутри своего процесса. */
  processOf?: (name: string) => string | undefined;
  /** Умеет ли процесс имени обе фазы: только таким предлагается keep/resume. */
  pairable?: (name: string) => boolean;
  issue: (name: string) => NameIssue;
  level: "server" | "location";
  /** Последний блок секции: закрывающей линии у него нет. */
  last?: boolean;
  onChange: (next: Doc) => void;
  onKind: (next: ListKind) => void;
}) {
  const own = kind === "override";

  /*
   * Чем объяснить пустую таблицу. У своего набора это разные беды (нечего
   * добавить / список опустел), у чужого -- просто состояние: набора нет
   * ни здесь, ни выше.
   */
  const empty = own
    ? t(
        names.length === 0
          ? "routeSettings.emptyNoNames"
          : level === "server"
            ? "routeSettings.emptyListServer"
            : "routeSettings.emptyList",
      )
    : kind === "none"
      ? t("routeSettings.noneList")
      : t("routeSettings.inheritedEmpty");

  return (
    <TableBlock
      title={title}
      label={hint}
      kindLabel={t("routeSettings.listKind")}
      kind={kind}
      options={options}
      onKind={onKind}
      scroll
      last={last}
    >
      <InspectTable
        t={t}
        phase={phase}
        refs={refs}
        empty={empty}
        names={names}
        hintOf={hintOf}
        processOf={processOf}
        pairable={pairable}
        issue={issue}
        deadlineMs={budget.ms}
        /*
          Бюджет фазы правится строкой цены под таблицей: `waf_deadline`
          отдельный ключ и от набора не зависит -- переопределить его здесь
          можно и там, где сам набор наследуется.
        */
        budget={{
          own: budget.own,
          from: budget.from,
          set: (ms) => onChange(setKey(value, DEADLINE_KEY[phase], ms)),
          drop: () => onChange(setKey(value, DEADLINE_KEY[phase], undefined)),
        }}
        onChange={own ? (next) => onChange(setKey(value, field, next)) : undefined}
      />
    </TableBlock>
  );
}

/**
 * Режимы строки. Пустой ключ и есть `active` -- умолчание директивы, поэтому
 * отдельного пункта «по умолчанию» нет: он назывался бы тем же самым. Снятый
 * `ignore` показывается только у строки, где он уже записан.
 */
function modeOptions(
  t: Translate,
  mode: InspectorMode | undefined,
): FilterOption<InspectorMode>[] {
  const shown: InspectorMode[] = mode === "ignore" ? [...MODES, "ignore"] : [...MODES];
  return shown.map((item) => ({ value: item, label: t(`routeSettings.modeValue.${item}`) }));
}

/**
 * Что делать с продолжением фазы запроса. Слова директивы (`off`, `prefer`,
 * `require`) остаются в подсказке колонки: в ячейке нужен ответ на «что
 * произойдёт», а не имя ключа.
 */
function resumeOptions(t: Translate): FilterOption<InspectorResume>[] {
  return RESUMES.map((item) => ({
    value: item,
    label: t(`routeSettings.resumeValue.${item}`),
  }));
}

/**
 * Держать ли состояние после ответа. Селектор, а не галочка: в ячейке нужен
 * ответ на «что будет», и тот же вид, что у соседней колонки продолжения.
 */
function keepOptions(t: Translate): FilterOption<"off" | "on">[] {
  return [
    { value: "off", label: t("routeSettings.keepValue.off") },
    { value: "on", label: t("routeSettings.keepValue.on") },
  ];
}

/**
 * Номер волны -- он же граница между волнами.
 *
 * Число показывает группу: одинаковое у соседей -- идут параллельно. Оно же
 * кнопка, потому что сливать и разрывать волну больше нечем: поля номера
 * нет, а отдельная колонка-галочка «параллельно» стоила бы места, которого в
 * ящике 768 нет. Первая строка кнопкой не является -- сливать её не с чем.
 */
function WaveMark({
  t,
  wave,
  joined,
  first,
  onJoin,
}: {
  t: Translate;
  wave: number;
  joined: boolean;
  first: boolean;
  onJoin?: (joined: boolean) => void;
}) {
  const label = String(wave);
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 20,
    px: 0.5,
    borderRadius: "3px",
    fontSize: "0.7rem",
    fontWeight: 700,
    lineHeight: 1,
    border: 1,
  } as const;

  if (onJoin === undefined || first) {
    return (
      <Tooltip arrow title={first ? t("routeSettings.waveFirst") : ""}>
        <Box
          component="span"
          sx={{ ...base, borderColor: "divider", color: "text.secondary" }}
        >
          {label}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      arrow
      title={t(joined ? "routeSettings.waveSplit" : "routeSettings.waveJoin", {
        n: label,
      })}
    >
      <Box
        component="span"
        role="button"
        tabIndex={0}
        aria-label={t("routeSettings.order")}
        onClick={() => onJoin(!joined)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onJoin(!joined);
          }
        }}
        sx={{
          ...base,
          cursor: "pointer",
          borderColor: joined ? "primary.main" : "divider",
          color: joined ? "primary.main" : "text.secondary",
          bgcolor: (theme) =>
            joined ? alpha(theme.palette.primary.main, 0.1) : "transparent",
          "&:hover": { borderColor: "primary.main", color: "primary.main" },
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );
}

/**
 * Строка вызова целиком -- то, что окажется в файле. Нужна диалогу условий:
 * условие читается только рядом с правилом, к которому оно приписано.
 * Печатает её компилятор (`compile/nginx-emit.ts`), здесь -- тот же порядок
 * слов.
 */
/** Первое слово вызова кадров по стороне: без ключа -- от клиента. */
function frameWord(stream: InspectorStream | undefined): string {
  switch (stream) {
    case "s2c":
      return "frame:s2c";
    case "both":
      return "frame";
    default:
      return "frame:c2s";
  }
}

function streamOptions(t: Translate): FilterOption<InspectorStream>[] {
  return STREAMS.map((item) => ({
    value: item,
    label: t(`routeSettings.streamValue.${item}`),
  }));
}

function inspectLine(phase: RoutePhase, row: InspectorRef, conds: Cond[]): string {
  // Кадры печатаются стороной клиента -- как у компилятора.
  const parts = [phase === "frame" ? frameWord(row.stream) : phase, row.name, `wave=${String(row.wave ?? 0)}`];
  if (typeof row.timeoutMs === "number") {
    parts.push(`timeout=${String(row.timeoutMs)}ms`);
  }
  if (row.mode !== undefined && row.mode !== "active") {
    parts.push(`mode=${row.mode}`);
  }
  if (row.keep === true && phase === "request") {
    parts.push("keep=on");
  }
  if (row.resume !== undefined && row.resume !== "off" && phase === "response") {
    parts.push(`resume=${row.resume}`);
  }
  return `waf_inspect ${parts.join(" ")}${condTail(conds)};`;
}

/** Пустая ячейка колонки: колонка остаётся на месте, когда ей нечего дать. */
function EmptyCell({ width }: { width: number }) {
  return <TableCell sx={{ ...headCellSx, width, minWidth: width }} />;
}

/** Кнопка добавления прижата к правому краю -- как и кнопки строк под ней. */
const headActionSx = { display: "flex", justifyContent: "flex-end", width: "100%" } as const;

/** Кнопки строки не слипаются: между ними тот же 4px, что у стрелок. */
const rowActionsSx = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 0.5,
  width: "100%",
} as const;

/*
 * Тон запертого значения -- тот же, каким MUI гасит запрещённое поле, так что
 * замена селектов текстом ничего в таблице не перекрашивает. Незаданное
 * значение приглушено ещё раз: на его месте стоит подстановка -- умолчание
 * директивы, -- и раньше её показывал placeholder с той же прозрачностью.
 */
const lockedTextSx = {
  width: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: "text.disabled",
} as const;

const lockedUnsetSx = { ...lockedTextSx, opacity: 0.55 } as const;

/**
 * Значение запертой строки -- текстом.
 *
 * Свой набор правится ячейками, чужой только показывается, и держать ради
 * показа полтора десятка запрещённых селектов незачем: на карточке маршрута их
 * набиралось семь десятков, и все они строились со своим меню и полем ввода,
 * чтобы тут же погаснуть. Читается при этом ровно то же самое.
 */
function LockedCell({
  text,
  unset,
  width,
}: {
  text: string;
  /** Значения нет: показана подстановка -- умолчание директивы. */
  unset?: boolean;
  width: number;
}) {
  return (
    <FilterCell width={width}>
      <Box sx={unset === true ? lockedUnsetSx : lockedTextSx}>{text}</Box>
    </FilterCell>
  );
}

/**
 * Строка чужого набора: унаследованного или пустого `none`.
 *
 * Колонки те же, что у своей строки, -- «что здесь побежит» один вопрос, и
 * отвечать на него двумя разными видами значит заставлять читать заново. Но
 * править нечего, поэтому вместо полей стоит текст, а из кнопок остаётся одна
 * шестерёнка, и то лишь когда за ней что-то стоит: условия вызова и
 * управление режимом -- часть ответа на тот же вопрос.
 */
const LockedRow = memo(function LockedRow({
  t,
  row,
  first,
  pairable,
  withKeep,
  withResume,
  withStream,
}: {
  t: Translate;
  row: InspectorRef;
  first: boolean;
  pairable?: (name: string) => boolean;
  withKeep: boolean;
  withResume: boolean;
  withStream: boolean;
}) {
  const paired = pairable?.(row.name) ?? true;
  const tail = callTail(row);

  return (
    <TableRow data-rule="">
      <FilterCell width={W.order}>
        <WaveMark t={t} wave={row.wave ?? 0} joined={false} first={first} />
      </FilterCell>
      <LockedCell text={row.name} width={W.name} />
      <LockedCell
        text={
          row.timeoutMs === undefined
            ? t("routeSettings.timeoutInherit")
            : formatTime(row.timeoutMs)
        }
        unset={row.timeoutMs === undefined}
        width={W.timeout}
      />
      <LockedCell
        text={t(`routeSettings.modeValue.${row.mode ?? "active"}`)}
        width={W.mode}
      />
      {withKeep &&
        (paired || row.keep === true ? (
          <LockedCell
            text={t(`routeSettings.keepValue.${row.keep === true ? "on" : "off"}`)}
            width={W.pair}
          />
        ) : (
          <PairlessCell hint={t("routeSettings.keepNone")} />
        ))}
      {withResume &&
        (paired || (row.resume !== undefined && row.resume !== "off") ? (
          <LockedCell
            text={t(`routeSettings.resumeValue.${row.resume ?? "off"}`)}
            width={W.pair}
          />
        ) : (
          <PairlessCell hint={t("routeSettings.resumeNone")} />
        ))}
      {withStream && (
        <LockedCell
          text={t(`routeSettings.streamValue.${row.stream ?? "c2s"}`)}
          unset={row.stream === undefined}
          width={W.stream}
        />
      )}
      <FilterCell width={W.actions}>
        <Box sx={rowActionsSx}>
          {tail !== "" && (
            <TableIconButton
              color="info"
              icon={<SettingsOutlinedIcon />}
              disabled
              tooltip={tail}
              aria-label={t("routeSettings.call")}
            />
          )}
        </Box>
      </FilterCell>
    </TableRow>
  );
});

/**
 * Строка своего набора: ячейки правятся.
 *
 * Мемоизована по строке и по ручкам таблицы -- ручки для этого созданы один
 * раз ([InspectTable]). Иначе правка одной ячейки перерисовывала бы весь
 * набор, а набранный символ в соседнем поле карточки -- оба набора сразу.
 */
const InspectRow = memo(function InspectRow({
  t,
  row,
  index,
  first,
  joined,
  names,
  hintOf,
  processOf,
  pairable,
  withKeep,
  withResume,
  withStream,
  drag,
  onJoin,
  onRename,
  onPatch,
  onCall,
  onDelete,
}: {
  t: Translate;
  row: InspectorRef;
  index: number;
  first: boolean;
  /** Строка идёт в одной волне с предыдущей: номер тот же. */
  joined: boolean;
  names: string[];
  hintOf?: (name: string) => string | undefined;
  processOf?: (name: string) => string | undefined;
  pairable?: (name: string) => boolean;
  withKeep: boolean;
  withResume: boolean;
  withStream: boolean;
  drag: DragApi;
  onJoin: (index: number, joined: boolean) => void;
  onRename: (index: number, name: string) => void;
  onPatch: (index: number, edit: (row: InspectorRef) => void) => void;
  onCall: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const options = useMemo(
    () => nameOptions(names, row.name, hintOf, processOf),
    [hintOf, names, processOf, row.name],
  );
  const paired = pairable?.(row.name) ?? true;
  const tail = callTail(row);

  return (
    <TableRow data-rule="" sx={dragSx(drag, index)}>
      <GripCell index={index} drag={drag} width={W.order} title={t("routeSettings.drag")}>
        <WaveMark
          t={t}
          wave={row.wave ?? 0}
          joined={joined}
          first={first}
          onJoin={(on) => onJoin(index, on)}
        />
      </GripCell>
      {/*
        Выбор, а не ввод: предлагаются объявленные имена, умеющие эту фазу, с
        профилем и темой под именем -- что привязывается, видно в момент
        выбора, а не по молчанию вызова. Уже вписанное имя из списка не
        пропадает, даже если объявления о нём молчат: набор маршрута не должен
        становиться нередактируемым из-за того, что имя объявили позже.
      */}
      <FilterSelect
        value={row.name}
        width={W.name}
        options={options}
        onChange={(name) => onRename(index, name)}
      />
      <DraftCell
        value={formatTime(row.timeoutMs)}
        placeholder={t("routeSettings.timeoutInherit")}
        width={W.timeout}
        onChange={(raw) =>
          onPatch(index, (next) => {
            const ms = parseTime(raw);
            if (ms === undefined) {
              delete next.timeoutMs;
            } else {
              next.timeoutMs = ms;
            }
          })
        }
      />
      <FilterSelect
        value={row.mode ?? "active"}
        width={W.mode}
        options={modeOptions(t, row.mode)}
        unset="active"
        onChange={(mode) =>
          onPatch(index, (next) => {
            // `active` -- умолчание директивы, ключом его не пишем.
            if (mode === "active") {
              delete next.mode;
            } else {
              next.mode = mode;
            }
          })
        }
      />
      {/*
        Держать/продолжать есть только у имени, чей процесс ведёт обе фазы:
        второй половине пары иначе неоткуда взяться, и селектор предлагал бы
        бессмыслицу. Уже записанное значение показывается и у непарного имени
        -- чтобы его можно было снять, а не чтобы оно казалось рабочим.
      */}
      {withKeep &&
        (paired || row.keep === true ? (
          <FilterSelect
            value={row.keep === true ? "on" : "off"}
            width={W.pair}
            options={keepOptions(t)}
            unset="off"
            onChange={(keep) =>
              onPatch(index, (next) => {
                // `off` -- умолчание директивы, ключом его не пишем.
                if (keep === "on") {
                  next.keep = true;
                } else {
                  delete next.keep;
                }
              })
            }
          />
        ) : (
          <PairlessCell hint={t("routeSettings.keepNone")} />
        ))}
      {withResume &&
        (paired || (row.resume !== undefined && row.resume !== "off") ? (
          <FilterSelect
            value={row.resume ?? "off"}
            width={W.pair}
            options={resumeOptions(t)}
            unset="off"
            onChange={(resume) =>
              onPatch(index, (next) => {
                // `off` -- умолчание директивы, ключом его не пишем.
                if (resume === "off") {
                  delete next.resume;
                } else {
                  next.resume = resume;
                }
              })
            }
          />
        ) : (
          <PairlessCell hint={t("routeSettings.resumeNone")} />
        ))}
      {withStream && (
        <FilterSelect
          value={row.stream ?? "c2s"}
          width={W.stream}
          options={streamOptions(t)}
          unset="c2s"
          onChange={(stream) =>
            onPatch(index, (next) => {
              // `c2s` -- умолчание вызова, ключом его не пишем.
              if (stream === "c2s") {
                delete next.stream;
              } else {
                next.stream = stream;
              }
            })
          }
        />
      )}
      <FilterCell width={W.actions}>
        <Box sx={rowActionsSx}>
          {/*
            Шестерёнка на то, чего в колонках нет: когда звать (условия).
            Заданное видно по цвету кнопки и целиком в подсказке -- иначе
            строка выглядела бы работающей на всяком запросе.
          */}
          <TableIconButton
            color={tail !== "" ? "info" : "primary"}
            icon={<SettingsOutlinedIcon />}
            tooltip={tail !== "" ? tail : t("routeSettings.call")}
            aria-label={t("routeSettings.call")}
            onClick={() => onCall(index)}
          />
          <TableIconButton
            color="error"
            icon={<DeleteIcon />}
            tooltip={t("common.delete")}
            onClick={() => onDelete(index)}
          />
        </Box>
      </FilterCell>
    </TableRow>
  );
});

/**
 * Таблица вызовов фазы.
 *
 * Одна на все состояния набора: `onChange` есть -- строки правятся, нет --
 * поля заперты, а кнопки не рисуются вовсе. Колонки при этом те же, и
 * переключение «наследовать / задать» не перекладывает таблицу заново.
 */
function InspectTable({
  t,
  phase,
  refs: input,
  empty,
  names,
  hintOf,
  processOf,
  pairable,
  issue,
  deadlineMs,
  budget,
  onChange,
}: {
  t: Translate;
  phase: RoutePhase;
  refs: InspectorRef[];
  empty: string;
  names: string[];
  hintOf?: (name: string) => string | undefined;
  processOf?: (name: string) => string | undefined;
  pairable?: (name: string) => boolean;
  issue: (name: string) => NameIssue;
  deadlineMs: number;
  /** Правка бюджета фазы: строка цены под таблицей ведёт свой ключ. */
  budget: BudgetEdit;
  /** Нет обработчика -- набор чужой: показываем, но не даём править. */
  onChange?: (next: InspectorRef[]) => void;
}) {
  const editable = onChange !== undefined;
  /*
   * Порядок строк = порядок исполнения. Документ мог прийти в любом порядке
   * (номер волны там всегда был сам по себе), а таблица, где `wave=0` стоит
   * под `wave=1`, врёт про то, что побежит первым.
   */
  const refs = useMemo(() => ordered(input).map((row) => row.ref), [input]);
  const unused = names.filter((name) => !refs.some((row) => row.name === name));
  // `resume=` есть только у ответа: на запросе и на кадрах колонку не рисуем,
  // а не блокируем -- директива там непредставима, выбирать нечего. Кадры
  // инспектируются каждый сам по себе и транзакцию рукопожатия не продолжают.
  const withResume = phase === "response";
  // `keep=` -- зеркало `resume=`: только на запросе. Колонка одна на фазу:
  // у запроса и ответа по семь колонок, у кадров седьмая -- сторона.
  const withKeep = phase === "request";
  // Сторона -- только у кадров: у запроса и ответа направление одно.
  const withStream = phase === "frame";
  const span = 6;
  // Строки, которые фазу не переживут: чужая фаза -- вызов без ответа,
  // неизвестное имя -- `unknown_inspector` на сборке.
  const wrongPhase = uniqueNames(
    refs.filter((row) => issue(row.name) === "phase").map((row) => row.name),
  );
  const unknown = uniqueNames(
    refs.filter((row) => issue(row.name) === "unknown").map((row) => row.name),
  );

  // Какую строку правим за шестерёнкой (условия и управление режимом).
  // Индекс, а не сама строка: окно пишет обратно в тот же массив, и копия
  // успела бы разойтись с ним.
  const [callRow, setCallRow] = useState<number | null>(null);
  // Добавление -- через диалог: вид инспектора выбирается один раз, глядя на
  // профиль и тему, а не подставляется первым попавшимся именем.
  const [addOpen, setAddOpen] = useState(false);

  /*
   * Ручки строк создаются один раз, а меняющееся -- сам набор и обработчик --
   * лежит в `live`. Строки мемоизованы ([InspectRow]), и новая пачка
   * обработчиков на каждый рендер сводила бы мемоизацию на нет: правка одной
   * ячейки перерисовывала бы все два-три десятка строк набора.
   */
  const live = useRef<{
    refs: InspectorRef[];
    onChange?: (next: InspectorRef[]) => void;
  }>({ refs, onChange });
  live.current.refs = refs;
  live.current.onChange = onChange;

  const setRefs = useCallback((next: InspectorRef[]) => {
    live.current.onChange?.(next);
  }, []);

  const drag = useRowDrag(refs.length, (from, to) =>
    setRefs(moveRef(live.current.refs, from, to)),
  );

  const addRow = (ref: InspectorRef) => {
    // Новая строка -- своей волной в конце: без ключа она легла бы в нулевую
    // и уехала бы наверх списка.
    const rows = ordered(refs);
    const last = rows[rows.length - 1];
    setRefs(renumber([...rows, { ref, key: (last?.key ?? -1) + 1 }]));
  };

  const patch = useCallback(
    (index: number, edit: (row: InspectorRef) => void) => {
      setRefs(
        live.current.refs.map((item, i) => {
          if (i !== index) {
            return item;
          }
          const next = { ...item };
          edit(next);
          return next;
        }),
      );
    },
    [setRefs],
  );

  const rename = useCallback(
    (index: number, name: string) => {
      setRefs(
        live.current.refs.map((item, i) => (i === index ? { ...item, name } : item)),
      );
    },
    [setRefs],
  );

  const join = useCallback(
    (index: number, joined: boolean) => {
      setRefs(joinWave(live.current.refs, index, joined));
    },
    [setRefs],
  );

  const remove = useCallback(
    (index: number) => {
      // Волны сжимаются: строка могла быть последней в своей, и дыра в
      // номерах пережила бы её.
      setRefs(renumber(ordered(live.current.refs).filter((_, i) => i !== index)));
    },
    [setRefs],
  );

  const openCall = useCallback((index: number) => {
    setCallRow(index);
  }, []);

  return (
    <>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            {/*
              У колонки порядка своя подпись: в ней стоит номер волны, а не
              одна безымянная ручка, -- объединять её с соседней (как в
              локальном слое) значило бы спрятать то, что она показывает.
            */}
            <HeadCell
              label={t("routeSettings.order")}
              help={t("routeSettings.orderHint")}
              width={W.order}
            />
            <HeadCell
              label={t("routeSettings.inspector")}
              help={t("routeSettings.inspectorHint")}
              width={W.name}
            />
            <HeadCell
              label={t("routeSettings.timeout")}
              help={t("routeSettings.timeoutHint")}
              width={W.timeout}
            />
            <HeadCell
              label={t("routeSettings.mode")}
              help={t("routeSettings.modeHint")}
              width={W.mode}
            />
            {withKeep && (
              <HeadCell
                label={t("routeSettings.keep")}
                help={t("routeSettings.keepHint")}
                width={W.pair}
              />
            )}
            {withResume && (
              <HeadCell
                label={t("routeSettings.resume")}
                help={t("routeSettings.resumeHint")}
                width={W.pair}
              />
            )}
            {withStream && (
              <HeadCell
                label={t("routeSettings.stream")}
                help={t("routeSettings.streamHint")}
                width={W.stream}
              />
            )}
            {editable ? (
              <FilterCell width={W.actions}>
                <Box sx={headActionSx}>
                  {/*
                    Строку добавляют именем, которое на этой фазе бежит: имена
                    уже отобраны фазой, и когда брать нечего -- кнопка молчит.
                    Пустая строка была бы хуже: сохранение её выбрасывает.
                    Имя и параметры вызова -- в диалоге, с профилем и темой
                    перед глазами.
                  */}
                  <TableIconButton
                    color="success"
                    icon={<AddIcon />}
                    disabled={unused.length === 0}
                    tooltip={
                      names.length === 0
                        ? t("routeSettings.addNoNames")
                        : unused.length === 0
                          ? t("routeSettings.addAllUsed")
                          : t("routeSettings.addInspector")
                    }
                    onClick={() => setAddOpen(true)}
                  />
                </Box>
              </FilterCell>
            ) : (
              <EmptyCell width={W.actions} />
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {refs.length === 0 && (
            <TableNoticeRow colSpan={span} kind="empty" message={empty} />
          )}
          {refs.map((row, index) =>
            editable ? (
              <InspectRow
                key={`${row.name}-${index}`}
                t={t}
                row={row}
                index={index}
                first={index === 0}
                joined={index > 0 && (row.wave ?? 0) === (refs[index - 1]?.wave ?? 0)}
                names={names}
                hintOf={hintOf}
                processOf={processOf}
                pairable={pairable}
                withKeep={withKeep}
                withResume={withResume}
                withStream={withStream}
                drag={drag}
                onJoin={join}
                onRename={rename}
                onPatch={patch}
                onCall={openCall}
                onDelete={remove}
              />
            ) : (
              <LockedRow
                key={`${row.name}-${index}`}
                t={t}
                row={row}
                first={index === 0}
                pairable={pairable}
                withKeep={withKeep}
                withResume={withResume}
                withStream={withStream}
              />
            ),
          )}
          {wrongPhase.length > 0 && (
            <TableNoticeRow
              colSpan={span}
              severity="warning"
              title={t("routeSettings.wrongPhaseTitle")}
              message={t("routeSettings.wrongPhase", { names: wrongPhase.join(", ") })}
            />
          )}
          {unknown.length > 0 && (
            <TableNoticeRow
              colSpan={span}
              severity="warning"
              title={t("routeSettings.unknownNameTitle")}
              message={t("routeSettings.unknownName", { names: unknown.join(", ") })}
            />
          )}
        </TableBody>
      </Table>
      {refs.length > 0 && (
        <Box sx={{ px: BLEED, py: 1.25, borderTop: 1, borderColor: "divider" }}>
          <WaveBudget rows={toWaveRows(refs)} deadlineMs={deadlineMs} edit={budget} />
        </Box>
      )}
      {editable && callRow !== null && refs[callRow] !== undefined && (
        <CallDialog
          t={t}
          phase={phase}
          row={refs[callRow] as InspectorRef}
          onClose={() => setCallRow(null)}
          onApply={(conds) => {
            setRefs(refs.map((item, i) => (i === callRow ? withConds(item, conds) : item)));
            setCallRow(null);
          }}
        />
      )}
      {editable && (
        <AddInspectorDialog
          t={t}
          open={addOpen}
          phase={phase}
          names={unused}
          hintOf={hintOf}
          pairable={pairable}
          onClose={() => setAddOpen(false)}
          onAdd={(ref) => {
            setAddOpen(false);
            addRow(ref);
          }}
        />
      )}
    </>
  );
}

/**
 * Окно вызова: всё, чего нет в колонках таблицы, -- одним окном за
 * шестерёнкой строки. Вопрос там один: когда звать (`if <значение> in|not in
 * <набор>`). Второй -- кто вправе менять режим -- снят вместе с `control=`:
 * управляющие глаголы принимает любой вызов от любого спрошенного соседа.
 */
function CallDialog({
  t,
  phase,
  row,
  onClose,
  onApply,
}: {
  t: Translate;
  phase: RoutePhase;
  row: InspectorRef;
  onClose: () => void;
  onApply: (conds: Cond[]) => void;
}) {
  const [conds, setConds] = useState<Cond[]>(condsDraft(row.conds ?? []));

  const done = readyConds(conds);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("routeSettings.callTitle", { name: row.name })}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(done)}>{t("common.apply")}</Modal.Submit>
        </>
      }
    >
      {/*
        Свёрнутый блок говорит словами, что в нём стоит: «на каждом запросе» --
        это состояние, а не пустое поле, и по нему видно, зачем разворачивать.
      */}
      <DialogSection
        title={t("routeSettings.condsBlock")}
        summary={
          done.length === 0
            ? t("routeSettings.condsSummaryAny")
            : t("routeSettings.condsSummary", { count: done.length })
        }
      >
        <DialogAlert text={t("routeSettings.condsAlert")} help={CONDS_HELP} />
        <CondTable t={t} conds={conds} onChange={setConds} />
      </DialogSection>
      <DialogLines title={t("cond.lineTitle")} lines={[inspectLine(phase, row, done)]} />
    </Modal>
  );
}

/**
 * Пустая ячейка держания/продолжения: процесс имени ведёт одну фазу, второй
 * половине пары взяться неоткуда. Причина -- в подсказке, а не в запертом
 * селекторе с бессмысленными пунктами.
 */
function PairlessCell({ hint }: { hint: string }) {
  return (
    <FilterCell width={W.pair}>
      <Tooltip arrow title={hint}>
        <Box sx={{ color: "text.disabled", fontSize: "0.75rem", width: "100%" }}>—</Box>
      </Tooltip>
    </FilterCell>
  );
}

/**
 * Новая строка набора: имя с поиском и сразу параметры вызова.
 *
 * Вид выбирается один раз, глядя на профиль и тему; дальше строка меняет имя
 * только внутри своего процесса -- таймаут, вес, условия и держание набираются
 * под вид и молча переехать на другой не должны. Имя -- селектор с поиском
 * (Picker), а не список: объявленных имён до 64, и оператор знает, что ищет,
 * но не помнит, где оно. Параметры -- те же, что колонки таблицы: заполнять их
 * вторым заходом по ячейкам незачем, а пустые поля -- умолчания директивы, как
 * и пустые ячейки. Держание/продолжение появляется только у парного имени.
 * Условия вызова сюда не переезжают: у них своя таблица, и они остаются окном
 * за шестерёнкой строки ([CallDialog]).
 */
function AddInspectorDialog({
  t,
  open,
  phase,
  names,
  hintOf,
  pairable,
  onClose,
  onAdd,
}: {
  t: Translate;
  open: boolean;
  phase: RoutePhase;
  names: string[];
  hintOf?: (name: string) => string | undefined;
  pairable?: (name: string) => boolean;
  onClose: () => void;
  onAdd: (ref: InspectorRef) => void;
}) {
  const [name, setName] = useState("");
  const [timeoutRaw, setTimeoutRaw] = useState("");
  const [mode, setMode] = useState<InspectorMode>("active");
  const [keep, setKeep] = useState<"off" | "on">("off");
  const [resume, setResume] = useState<InspectorResume>("off");
  const [stream, setStream] = useState<InspectorStream>("c2s");

  useEffect(() => {
    if (open) {
      setName("");
      setTimeoutRaw("");
      setMode("active");
      setKeep("off");
      setResume("off");
      setStream("c2s");
    }
  }, [open]);

  const timeoutOk = timeoutRaw.trim() === "" || parseTime(timeoutRaw) !== undefined;
  // Держать/продолжение -- только у имени, чей процесс ведёт обе фазы: у
  // непарного поля просто нет, а не заперто с бессмысленными пунктами.
  const paired = name !== "" && (pairable?.(name) ?? true);
  const ok = name !== "" && timeoutOk;

  const build = (): InspectorRef => {
    const ref: InspectorRef = { name };
    const ms = parseTime(timeoutRaw);
    if (ms !== undefined) {
      ref.timeoutMs = ms;
    }
    // Умолчания директивы ключами не пишутся -- как и в ячейках таблицы.
    if (mode !== "active") {
      ref.mode = mode;
    }
    if (phase === "request" && paired && keep === "on") {
      ref.keep = true;
    }
    if (phase === "response" && paired && resume !== "off") {
      ref.resume = resume;
    }
    if (phase === "frame" && stream !== "c2s") {
      ref.stream = stream;
    }
    return ref;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("routeSettings.addInspector")}
      hint={t("routeSettings.addDialogHint")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ok} onClick={() => onAdd(build())}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("routeSettings.inspector")}
            </Typography>
            <Picker
              value={name}
              onChange={setName}
              placeholder={t("routeSettings.addPick")}
              options={names.map((item) => ({ value: item, hint: hintOf?.(item) }))}
            />
          </Box>
          {/* Лейблы подняты всегда: placeholder -- умолчание директивы, и
              видно его должно быть до фокуса, а не после. */}
          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small"
              label={t("routeSettings.timeout")}
              value={timeoutRaw}
              placeholder={t("routeSettings.timeoutInherit")}
              error={!timeoutOk}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => setTimeoutRaw(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              select
              label={t("routeSettings.mode")}
              value={mode}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) =>
                setMode(isMode(e.target.value) && e.target.value !== "ignore" ? e.target.value : "active")
              }
              sx={{ flex: 1 }}
            >
              {modeOptions(t, undefined).map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
            {phase === "request" && paired && (
              <TextField
                size="small"
                select
                label={t("routeSettings.keep")}
                value={keep}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setKeep(e.target.value === "on" ? "on" : "off")}
                sx={{ flex: 1 }}
              >
                {keepOptions(t).map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {phase === "response" && paired && (
              <TextField
                size="small"
                select
                label={t("routeSettings.resume")}
                value={resume}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) =>
                  setResume(isResume(e.target.value) ? e.target.value : "off")
                }
                sx={{ flex: 1 }}
              >
                {resumeOptions(t).map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {phase === "frame" && (
              <TextField
                size="small"
                select
                label={t("routeSettings.stream")}
                value={stream}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setStream(isStream(e.target.value) ? e.target.value : "c2s")}
                sx={{ flex: 1 }}
              >
                {streamOptions(t).map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </Stack>
    </Modal>
  );
}
