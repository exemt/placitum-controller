import { type MouseEvent, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { FilterCell, HEAD_H, TableIconButton, TableNoticeRow } from "../components/data-table/index.ts";
import {
  BLEED,
  BlockSelect,
  flushTableSx,
  HeadCell,
  headCellSx,
} from "../components/table-block.tsx";
import { HintMarkup } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { Presets, SectionBleed } from "../components/settings-table.tsx";
import {
  DialogAlert,
  DialogCode,
  DialogEmitted,
  DialogFrame,
  DialogInput,
  DialogPick,
  DialogSection,
  DialogWhen,
  dialogLabelSx,
  type DialogLine as Line,
  type DialogOption,
} from "../components/dialog-kit.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import {
  ARCHIVE_OUTCOMES,
  checkStoreCross,
  checkTail,
  emptyTail,
  formatTails,
  listNames,
  mergeTail,
  overrideTail,
  parseTail,
  NONE_PHASES,
  PHASE_OBJECTS,
  splitPhaseLine,
  TAIL_PHASES,
  whenSummaryKey,
  type ArchiveOutcome,
  type ListName,
  type ListTarget,
  type ObjectName,
  type ObjectSpec,
  type SendSource,
  type TailKind,
  type TailModel,
  type TailPhase,
  type TailProblem,
} from "./directive-tail.ts";
import {
  MODULE_DEFAULTS,
  resolve,
  type Doc,
  type FieldState,
  type ParentChain,
} from "./inherit.ts";
import type { InheritFrom } from "../api.ts";

/**
 * Снимок, архив, превью и отдача одной таблицей: строка -- объект, колонка -- ось.
 *
 * Четыре директивы описывают один и тот же запрос с четырёх сторон, и по
 * отдельности они не читаются: `waf_archive request reload headers` понятно
 * только рядом с тем, что снимает `waf_capture`, а `waf_send request
 * body=store` -- только рядом с тем, целиком ли тело снято. Управляют же
 * здесь ровно тремя объектами. Колонки идут по пути данных:
 *
 *   снимать    что кладётся в обменник и видят инспекторы; `mask=` / `deny=`
 *              применяются до них
 *   в запись   срез в самой записи аудита, ищется в ClickHouse
 *   в архив    что агент увезёт в S3 после вердикта
 *   отдать     что получит получатель -- апстрим на запросе, клиент на
 *              ответе, вторая сторона на кадрах: как пришёл или версию
 *              инспектора из обменника. Неполный снимок отдаёт оригинал сам
 *
 * Таблица показывает, а не правит: в ячейке -- состояние словами («весь»,
 * «первые 30k», «как снимок»), скобка уровня и пометки, а правится объект
 * целиком -- окном, которое открывает клик по строке. Микрополя в ячейках
 * («30k / 2k» без подписей, галочка при слове «весь») были главным источником
 * вопросов: две величины записи, три состояния галочки и placeholder,
 * читавшийся значением.
 *
 * «Оригинал» -- свойство объекта, не оси. В модуле `reload` -- отдельная
 * строка со своим списком объектов и размеров (`reload headers=capture`,
 * `reload body=128k`; бит на объект): у одного объекта в архив едет оригинал
 * до масок, у соседнего -- то, что видели инспекторы. Тумблер на всю ось,
 * который тут стоял, эту грамматику выразить не мог и жил не там -- источник
 * выбирается в окне объекта, рядом с величинами, а в ячейке его видно меткой.
 *
 * Ось целиком -- диалог за шестерёнкой шапки: чем задан набор (наследовать /
 * задать / none) и у архива `ttl=` / `when=` по фазам. Это всё, что осталось
 * осевого.
 *
 * Объект добавляется тем же окном у «+» своей фазы. Объект готовой строки не
 * меняется: строка -- это объект, не тот объект убирают корзиной и заводят
 * заново.
 *
 * Наследование видно в самой ячейке: пока значение приходит сверху, следом
 * стоит скобка с уровнем -- `(http)`, `(server)`, `(умолчание)`, -- та же, что
 * у запертых полей ядра ([InheritedRow]). Уровень у каждой ячейки свой: сервер
 * наследует у http, путь -- у server или у http, смотря где ключ задан.
 *
 * Строки идут группами по фазам -- запрос и ответ, у websocket-пути кадры
 * клиента и приложения: у каждой фазы свой словарь объектов и своё
 * наследование в модуле, а оси у них общие. Группа стоит всегда, даже пустая:
 * подсказка о фазе должна быть там, где оператор ищет её объекты. Фаза без
 * инспекторов пишет журнал -- сверок со снимком у неё нет (checkTail), а у
 * кадров рядом стоит «Запись кадров»: без неё срез и архив кадра не уходят.
 *
 * На сервере и пути каждая ось -- свой ключ документа с тремя состояниями.
 * Таблица показывает действующий набор -- своё поверх родительского, как его
 * сольёт модуль. Запись из окна переводит тронутые оси в «своё» и пишет полную
 * строку: объект родителя, снятый здесь, получает `=none`, иначе модуль дольёт
 * его обратно при слиянии. Нетронутые оси остаются как были -- окно не
 * материализует наследование той оси, которую оператор не трогал.
 */

/*
 * Четыре оси по пути данных: снимать → в запись → в архив → отдать. Четвёртая
 * (`waf_send`) отвечает, откуда получатель получит объект -- как пришёл или
 * версию инспектора из обменника; строки таблицы она не заводит, только
 * показывает своё значение у объектов, которые снимает хоть кто-то.
 */
const KINDS: readonly TailKind[] = ["capture", "preview", "archive", "send"];
/** Оси, по которым объект попадает в таблицу строкой. */
const ROW_KINDS: readonly TailKind[] = ["capture", "preview", "archive"];

/*
 * Ширины колонок под ящик карточки (908, `PANEL_WIDTH` пути и сервера).
 * Колонка объекта узкая: в ней стоит слово (`headers`); в колонках осей --
 * значение словами, метка оригинала и скобка уровня, у записи значение самое
 * длинное (`30k / 2k`). Сумма держится ниже ширины секции: горизонтальный
 * скролл внутри ящика -- дефект.
 */
const OBJECT_W = 96;
const CAPTURE_W = 150;
const PREVIEW_W = 170;
const ARCHIVE_W = 170;
const SEND_W = 200;
const ACTIONS_W = 72;

/** Ярлык уровня следом за значением: `(http)`, как у запертых полей ядра. */
const FROM_SX = {
  fontSize: "0.65rem",
  color: "text.secondary",
  whiteSpace: "nowrap",
  flexShrink: 0,
  lineHeight: 1,
} as const;

/** Значение ячейки: словами, тем же кеглем, что значения таблиц данных. */
const CELL_VALUE_SX = {
  fontSize: "0.75rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
} as const;

/**
 * Метка в ячейке («ориг.», «имена») -- цветным текстом без рамки, тем же
 * кеглем, что скобка уровня: чип с обводкой рядом со значением читался второй
 * рамкой и спорил с подстановками.
 */
const MARK_SX = {
  fontSize: "0.65rem",
  whiteSpace: "nowrap",
  flexShrink: 0,
  lineHeight: 1,
  cursor: "help",
} as const;


/**
 * Сроки хранения чипами: клик подставляет `ttl=`, повторный по выбранному
 * возвращает «вечно». Единицы nginx (`h`, `d`) руками не набираются -- о них
 * приходится помнить, а чип их и есть.
 */
const TTL_PRESETS = ["1h", "12h", "1d", "7d", "30d"] as const;

/** Величины среза: столько же, сколько у полей размера в таблице настроек. */
const SIZE_PRESETS = ["8k", "64k", "256k", "1m"] as const;
/** Потолок одной пары headers/args: сотни байт -- единицы килобайт. */
const PAIR_PRESETS = ["256", "512", "1k", "2k"] as const;

/** Модели хвоста по фазам: у каждой фазы своя строка директивы. */
type PhaseModels = Record<TailPhase, TailModel>;

/** Собрать значение на каждую фазу одной функцией -- форма у них общая. */
function byPhase<T>(make: (phase: TailPhase) => T): Record<TailPhase, T> {
  return Object.fromEntries(TAIL_PHASES.map((phase) => [phase, make(phase)])) as Record<
    TailPhase,
    T
  >;
}

/**
 * Откуда приехало действующее значение: уровень конфигурации выше либо
 * умолчание самого модуля, у которого уровня нет.
 */
type FromLevel = InheritFrom | "module";

/**
 * Ось таблицы: одна директива на всех фазах сразу.
 *
 * `parent` -- что действует сверху, `mine` -- что записано на этом уровне,
 * `effective` -- их слияние по правилу оси. Пара `from` / `parentFrom`
 * отвечает на вопрос «чьё это значение»: первый заполнен только у
 * унаследованной оси, второй -- у уровня, с которого пришли родительские
 * строки.
 */
interface Axis {
  kind: TailKind;
  state: FieldState;
  from?: FromLevel;
  parentFrom?: FromLevel;
  parent: PhaseModels;
  effective: PhaseModels;
  mine: PhaseModels;
  own: string[] | undefined;
}

function ownLines(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((x): x is string => typeof x === "string");
}

/**
 * Умолчание отдачи объекта по правилу модуля (`ngx_http_waf_send_of`):
 * `store` у всех объектов на всех фазах -- сделанная инспектором подмена
 * обязана доехать до получателя. Оригинал отдаётся, только когда его назвал
 * оператор.
 *
 * Прежде тело зависело от снимка (срез значил `original`), и подмена молча
 * пропадала даже на объекте, уложившемся в срез. Проверка «кусок вместо
 * целого не отдаём» осталась в модуле, но она рантаймовая и по факту --
 * локатор помечен `truncated`, -- а не догадка по конфигурации.
 */
function moduleSendDefault(_capture: TailModel, _name: ObjectName): SendSource {
  return "store";
}

/** Умолчание `waf_send` модуля строками грамматики -- по снимку этого уровня. */
function moduleSendDefaults(capture: PhaseModels): string[] {
  const body = (phase: TailPhase) => `body=${moduleSendDefault(capture[phase], "body")}`;
  return [
    `request headers=store args=store ${body("request")}`,
    `response headers=store ${body("response")}`,
    `frame:c2s ${body("frame:c2s")}`,
    `frame:s2c ${body("frame:s2c")}`,
  ];
}

function axisOf(kind: TailKind, waf: Doc, parents: ParentChain, capture?: PhaseModels): Axis {
  const resolved = resolve(waf, kind, parents);
  const above =
    parents[kind]?.value ??
    (kind === "send" && capture !== undefined ? moduleSendDefaults(capture) : MODULE_DEFAULTS[kind]);
  const parent = byPhase((phase) => parseTail(above, phase));
  const own = ownLines(waf[kind]);
  const mine = byPhase((phase) => (own === undefined ? emptyTail() : parseTail(own, phase)));

  let effective: PhaseModels;
  if (resolved.state === "off") {
    effective = byPhase(() => ({ ...emptyTail(), off: true }));
  } else if (resolved.state === "inherit") {
    effective = parent;
  } else {
    effective = byPhase((phase) => mergeTail(parent[phase], mine[phase]));
  }

  return {
    kind,
    state: resolved.state,
    from: resolved.state === "inherit" ? resolved.from : undefined,
    parentFrom:
      parents[kind]?.from ?? (MODULE_DEFAULTS[kind] === undefined ? undefined : "module"),
    parent,
    effective,
    mine,
    own,
  };
}

/**
 * Уровень, с которого приехало значение ячейки, или `undefined` -- если его
 * задали здесь.
 *
 * Ось целиком унаследована -- отвечает родитель. Ось задана здесь, но объект
 * в её строках не назван -- модуль дольёт объект от родителя, и ячейка тоже
 * чужая. Снятая ось (`none`) -- решение этого уровня, и уровня у неё нет.
 */
function cellFrom(axis: Axis, phase: TailPhase, name: ObjectName): FromLevel | undefined {
  if (axis.state === "off") return undefined;
  if (axis.state === "set") {
    const spec = axis.mine[phase].objects[name];
    if (spec.on || spec.none === true) return undefined;
  }
  return axis.parentFrom;
}

function axisWidth(kind: TailKind): number {
  if (kind === "send") return SEND_W;
  return kind === "capture" ? CAPTURE_W : kind === "preview" ? PREVIEW_W : ARCHIVE_W;
}

/*
 * Фаза в строке печатается всегда, и у запроса тоже: в документе она может
 * быть опущена, но в файле стоит, и оператор должен видеть именно файл.
 * Пустой ключ -- `none` обеим фазам, так его понимает модуль; у отдачи
 * `none` нет, пустой ключ ничего не печатает.
 */
function printedLines(kind: TailKind, own: string[]): string[] {
  const name = `waf_${kind}`;
  if (own.length === 0) {
    return kind === "send" ? [] : NONE_PHASES.map((phase) => `${name} ${phase} none;`);
  }
  return own.flatMap((tail) => {
    const row = splitPhaseLine(tail);
    return row === null ? [] : [`${name} ${row.phase} ${row.rest};`];
  });
}

/**
 * Что действует сверху, комментарием.
 *
 * «Действует то, что выше» -- ответ на вопрос строкой, которая сама вопрос:
 * выше — это где и что именно? Родительский набор печатается теми же
 * директивами, что и свои, но закомментированными и с пометкой уровня: в
 * файле этого уровня их нет, а действуют они как написаны.
 */
function inheritedBlock(t: Translate, axis: Axis): Line[] {
  const tails = formatTails(axis.parent, axis.kind);
  const head = `# ${
    axis.parentFrom === undefined ? t("tail.fromAbove") : t(`inherit.from.${axis.parentFrom}`)
  }:`;
  const body =
    tails.length === 0
      ? [`#   waf_${axis.kind} — ${t("tail.nothingAbove")}`]
      : printedLines(axis.kind, tails).map((line) => `#   ${line}`);
  return [head, ...body].map((text) => ({ text, muted: true }));
}

/**
 * Подпись с подсказкой по наведению: пунктирное подчёркивание вместо ⓘ.
 *
 * Тот же приём, что у заголовков колонок ([HeadCell]): иконка рядом с
 * подписью делила один смысл на два объекта и занимала место в строке, где
 * его нет. Что за подписью есть пояснение, говорит пунктир и курсор `help`.
 */
function HintLabel({
  text,
  hint,
  sx,
}: {
  text: string;
  hint?: string;
  sx?: Record<string, unknown>;
}) {
  const body = (
    <Box
      component="span"
      tabIndex={hint === undefined ? undefined : 0}
      sx={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        ...(hint === undefined
          ? {}
          : {
              cursor: "help",
              textDecoration: "underline dotted",
              textUnderlineOffset: "3px",
              textDecorationColor: "currentColor",
              opacity: 0.85,
              "&:hover, &:focus-visible": { opacity: 1 },
            }),
        ...sx,
      }}
    >
      {text}
    </Box>
  );
  if (hint === undefined) {
    return body;
  }
  return (
    <Tooltip arrow placement="top-start" enterDelay={200} title={<HintMarkup text={hint} />}>
      {body}
    </Tooltip>
  );
}

/** Сообщение проверки: код -> текст, ось в подстановке -- подписью. */
function problemText(t: Translate, p: TailProblem): string {
  const params =
    p.params === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(p.params).map(([key, value]) => [
            key,
            key === "axis" ? t(`tail.${value}`) : value,
          ]),
        );
  return t(`tail.problem.${p.code}`, params);
}

/** Свои списки имён объекта на этой оси -- для метки и её подсказки. */
function ownListsHint(
  t: Translate,
  model: TailModel,
  kind: TailKind,
  name: ObjectName,
): string | undefined {
  if (name === "body") return undefined;
  const target = name as ListTarget;
  const parts = listNames(kind)
    .map((list) => {
      const names = model[list][target];
      return names && names.length > 0 ? `${t(`tail.${list}`)}: ${names.join(", ")}` : null;
    })
    .filter((x): x is string => x !== null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

type CellProblem = TailProblem & { kind: TailKind; phase: TailPhase };

export function CaptureTable({
  waf,
  parents,
  onChange,
  clientMaxBody,
  phases = TAIL_PHASES,
}: {
  waf: Doc;
  parents: ParentChain;
  onChange: (next: Doc) => void;
  clientMaxBody?: string;
  /** Какие фазы показывать: у websocket-пути нет ответа, у http -- кадров. */
  phases?: readonly TailPhase[];
}) {
  const t = useT();

  const axes = useMemo(() => {
    /* Снимок первым: умолчание отдачи тела считается по нему. */
    const capture = axisOf("capture", waf, parents);
    const rest = KINDS.filter((kind) => kind !== "capture").map((kind) => [
      kind,
      axisOf(kind, waf, parents, capture.effective),
    ]);
    return { capture, ...Object.fromEntries(rest) } as Record<TailKind, Axis>;
  }, [waf, parents]);

  const bodyLimit = resolve(waf, "bodyLimit", parents).value;
  const bodyLimitText = typeof bodyLimit === "string" ? bodyLimit : undefined;

  /*
   * Спрашивают ли на фазе. Без инспекторов фаза пишет журнал (archive.md, «без
   * инспекторов»): снимка у неё нет, и сверок архива и записи со снимком тоже
   * -- объект берётся из трафика в своём размере.
   */
  const inspected = useMemo(() => {
    const on = (key: string) => {
      const list = resolve(waf, key, parents).value;
      return list === "all" || (Array.isArray(list) && list.length > 0);
    };
    const frame = on("frameInspectors");
    return {
      request: on("requestInspectors"),
      response: on("responseInspectors"),
      "frame:c2s": frame,
      "frame:s2c": frame,
      frame,
    } as Record<TailPhase, boolean>;
  }, [waf, parents]);

  /*
   * Предел тела -- у фазы запроса: `waf_body_limit response` форма не ведёт,
   * а у ответа потолок удержания задаёт сам снимок (hold.md).
   */
  const problems: CellProblem[] = useMemo(
    () =>
      phases.flatMap((phase) => {
        const models = Object.fromEntries(
          KINDS.map((kind) => [kind, axes[kind].effective[phase]]),
        ) as Record<TailKind, TailModel>;
        const ctx = {
          capture: models.capture,
          bodyLimit: phase === "request" ? bodyLimitText : undefined,
          clientMaxBody: phase === "request" ? clientMaxBody : undefined,
          phase,
          inspected: inspected[phase],
        };
        return [
          ...KINDS.flatMap((kind) =>
            checkTail(models[kind], kind, ctx).map((p) => ({ ...p, kind, phase })),
          ),
          ...checkStoreCross(models, phase).map((p) => ({ ...p, phase })),
        ];
      }),
    [axes, bodyLimitText, clientMaxBody, inspected],
  );

  /*
   * Запись кадров (waf_audit_frames) -- рядом с «В запись»: срез и архив кадра
   * уходят только вместе с записью кадра, и без политики рядом не понять,
   * почему настроенный архив молчит. Политика одна на путь, обе стороны.
   */
  const frameAudit = resolve(waf, "frameAudit", parents);
  const frameAuditPolicy = typeof frameAudit.value === "string" ? frameAudit.value : "deny";
  const frameAuditSample = resolve(waf, "frameAuditSample", parents).value;

  const setFrameAudit = (policy: string, sample?: number) => {
    const doc = { ...waf };
    if (policy === "inherit") {
      delete doc.frameAudit;
      delete doc.frameAuditSample;
    } else {
      doc.frameAudit = policy;
      if (policy === "all" && sample !== undefined && sample > 1) {
        doc.frameAuditSample = sample;
      } else {
        delete doc.frameAuditSample;
      }
    }
    onChange(doc);
  };

  /** Предупреждение стороны кадров: срез и архив настроены, а записи не будет. */
  const frameWarning = (phase: TailPhase): string | undefined => {
    if (phase !== "frame:c2s" && phase !== "frame:s2c") return undefined;
    const wants =
      axes.preview.effective[phase].objects.body.on || axes.archive.effective[phase].objects.body.on;
    if (!wants) return undefined;
    if (frameAuditPolicy === "off") return t("tail.frameAuditWarn.off");
    if (frameAuditPolicy === "deny" && !inspected[phase]) return t("tail.frameAuditWarn.deny");
    return undefined;
  };

  /** Какой объект открыт окном (или добавляется), какая ось -- диалогом. */
  const [editRow, setEditRow] = useState<{ phase: TailPhase; name: ObjectName } | null>(null);
  /*
   * Добавление: объект выбирают в меню у «+» фазы, и окно открывается уже
   * на нём -- селектор объекта внутри формы был вторым вопросом ради того,
   * что помещается в три пункта меню.
   */
  const [adding, setAdding] = useState<{ phase: TailPhase; name: ObjectName } | null>(null);

  /**
   * Одна запись в документ на действие: окно трогает сразу несколько осей,
   * а три вызова подряд считали бы `waf` из замыкания и затирали друг друга.
   * Ключ документа держит обе фазы, поэтому правка одной фазы записывает и
   * вторую -- тем, что на ней действует.
   */
  const commitAll = (
    next: Partial<Record<TailKind, Partial<PhaseModels>>>,
    routePatch?: Partial<Doc>,
  ) => {
    const doc = { ...waf, ...(routePatch ?? {}) };
    for (const kind of KINDS) {
      const patch = next[kind];
      if (patch === undefined) continue;
      const axis = axes[kind];
      doc[kind] = formatTails(
        byPhase((phase) =>
          overrideTail(axis.parent[phase], patch[phase] ?? axis.effective[phase], kind),
        ),
        kind,
      );
    }
    onChange(doc);
  };

  /** Исход диалога оси: чем задано и параметры фаз, одной записью. */
  const applyAxis = (kind: TailKind, state: FieldState, models: PhaseModels) => {
    if (state === "inherit") {
      const doc = { ...waf };
      delete doc[kind];
      onChange(doc);
      return;
    }
    if (state === "off") {
      onChange({ ...waf, [kind]: [] });
      return;
    }
    commitAll({ [kind]: models });
  };

  /*
   * Строки таблицы -- объекты, названные хоть одной осью, по фазам. Объект,
   * которого нет нигде, строкой не стоит: пустая строка на всех трёх осях
   * означала бы «ничего», а «ничего» показывают отсутствием строки.
   *
   * Снимок и отдача -- только для инспекторов: снимок кладут им, отдача
   * поднимает их правки. У фазы без инспекторов этих осей нет: строку заводят
   * запись и архив, ячейки снимка и отдачи пусты, а колонки пропадают, когда
   * инспекторов нет ни у одной фазы таблицы.
   */
  const usedKinds = (phase: TailPhase): readonly TailKind[] => usedKindsOf(inspected[phase]);
  const columns = KINDS.filter((kind) => phases.some((phase) => usedKinds(phase).includes(kind)));
  const rowsOf = (phase: TailPhase) =>
    PHASE_OBJECTS[phase].filter((name) =>
      ROW_KINDS.some(
        (kind) => usedKinds(phase).includes(kind) && axes[kind].effective[phase].objects[name].on,
      ),
    );
  const unusedOf = (phase: TailPhase) =>
    PHASE_OBJECTS[phase].filter((name) => !rowsOf(phase).includes(name));

  const dropObject = (phase: TailPhase, name: ObjectName) => {
    const patch: Partial<Record<TailKind, Partial<PhaseModels>>> = {};
    for (const kind of KINDS) {
      const model = axes[kind].effective[phase];
      if (!model.objects[name].on) continue;
      patch[kind] = {
        [phase]: {
          ...model,
          off: false,
          objects: { ...model.objects, [name]: { on: false } },
        },
      };
    }
    commitAll(patch);
  };

  const problemOf = (kind: TailKind, phase: TailPhase, name: ObjectName) =>
    problems.find((p) => p.kind === kind && p.phase === phase && p.object === name);

  /*
   * Свои строки -- как есть, чужие -- комментарием следом: у каждой оси своё
   * наследование, и «действует то, что выше» без самих строк не проверить.
   */
  const emitted: Line[] = KINDS.flatMap((kind) => {
    const axis = axes[kind];
    return axis.own === undefined
      ? inheritedBlock(t, axis)
      : printedLines(kind, axis.own).map((text) => ({ text }));
  });

  const hasAnyRow = phases.some((phase) => rowsOf(phase).length > 0);

  /*
   * Подзаголовок фазы делится, как строки под ним: слева объект и оси до
   * отдачи, справа отдача и действия. Без колонки отдачи справа -- одни
   * действия.
   */
  const rightSpan = columns.includes("send") ? 2 : 1;
  const leftSpan = columns.length + 2 - rightSpan;

  return (
    <SectionBleed>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("tail.object")} help={t("tail.objectHint")} width={OBJECT_W} />
            {columns.map((kind) => (
              <AxisHead
                key={kind}
                axis={axes[kind]}
                onState={(state) => applyAxis(kind, state, axes[kind].effective)}
              />
            ))}
            <FilterCell width={ACTIONS_W}>{null}</FilterCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {!hasAnyRow && (
            <TableNoticeRow colSpan={columns.length + 2} kind="empty" message={t("tail.empty")} />
          )}
          {phases.map((phase) => (
            <PhaseRows
              key={phase}
              phase={phase}
              rows={rowsOf(phase)}
              unused={unusedOf(phase)}
              span={{ left: leftSpan, right: rightSpan }}
              onAdd={(name) => setAdding({ phase, name })}
              /*
                Политика одна на обе стороны -- селектор у первой группы
                кадров, предупреждение -- у каждой своё.
              */
              audit={
                phase === phases.find((p) => p === "frame:c2s" || p === "frame:s2c")
                  ? {
                      state: frameAudit.state,
                      policy: frameAuditPolicy,
                      sample: typeof frameAuditSample === "number" ? frameAuditSample : undefined,
                      onChange: setFrameAudit,
                    }
                  : undefined
              }
              warning={frameWarning(phase)}
            >
              {rowsOf(phase).map((name) => (
                /*
                 * Строка кликабельна и открывает окно объекта -- как сервер
                 * пула: значения в ячейках показываются, а правятся все разом
                 * там, где у каждого есть подпись и подсказка.
                 */
                <TableRow
                  key={name}
                  hover
                  onClick={() => setEditRow({ phase, name })}
                  sx={{ cursor: "pointer" }}
                >
                  {/*
                    Объект -- словом оператора, ключ директивы -- в подсказке:
                    та же пара, что у подписей колонок («Решение», а не
                    `action=`). По конфигу объект находится подсказкой.
                  */}
                  <FilterCell width={OBJECT_W}>
                    <Tooltip
                      arrow
                      placement="top-start"
                      enterDelay={200}
                      title={<HintMarkup text={t(`tail.objectHints.${name}`)} />}
                    >
                      <Typography
                        component="span"
                        sx={{ fontSize: "0.75rem", fontWeight: 600, cursor: "help" }}
                      >
                        {t(`tail.objects.${name}`)}
                      </Typography>
                    </Tooltip>
                  </FilterCell>
                  {/*
                    Ось, которой у фазы нет (снимок и отдача без
                    инспекторов), -- пустая ячейка: колонка общая с фазами,
                    где она есть, а показывать в ней нечего.
                  */}
                  {columns.map((kind) =>
                    usedKinds(phase).includes(kind) ? (
                      <ObjectCell
                        key={kind}
                        axis={axes[kind]}
                        phase={phase}
                        name={name}
                        problem={problemOf(kind, phase, name)}
                        inspected={inspected[phase]}
                      />
                    ) : (
                      <FilterCell key={kind} width={axisWidth(kind)}>
                        {null}
                      </FilterCell>
                    ),
                  )}
                  <FilterCell width={ACTIONS_W}>
                    <Box
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 0.5,
                        width: "100%",
                      }}
                    >
                      <TableIconButton
                        color="primary"
                        icon={<SettingsOutlinedIcon />}
                        tooltip={t("tail.editObject")}
                        aria-label={`${t("tail.editObject")} ${name}`}
                        onClick={() => setEditRow({ phase, name })}
                      />
                      <TableIconButton
                        color="error"
                        icon={<DeleteIcon />}
                        tooltip={t("common.delete")}
                        onClick={() => dropObject(phase, name)}
                      />
                    </Box>
                  </FilterCell>
                </TableRow>
              ))}
            </PhaseRows>
          ))}
        </TableBody>
      </Table>
      {/*
        Что ляжет в файл на этом уровне. Форма прячет синтаксис, но оператор
        должен видеть, во что превратился его выбор -- особенно `=none`,
        которого он не ставил, и строку `reload`, -- и что действует сверху
        там, где своих строк нет.
      */}
      <Box sx={{ px: BLEED, py: 1.25, borderTop: 1, borderColor: "divider" }}>
        <DialogCode lines={emitted} empty={t("tail.emittedNone")} />
      </Box>
      {(editRow !== null || adding !== null) && (
        <ObjectDialog
          t={t}
          phase={editRow?.phase ?? adding?.phase ?? "request"}
          editName={editRow?.name ?? adding?.name ?? "body"}
          adding={adding !== null}
          axes={axes}
          bodyLimit={(editRow?.phase ?? adding?.phase) === "request" ? bodyLimitText : undefined}
          clientMaxBody={(editRow?.phase ?? adding?.phase) === "request" ? clientMaxBody : undefined}
          inspected={inspected[editRow?.phase ?? adding?.phase ?? "request"]}
          onClose={() => {
            setEditRow(null);
            setAdding(null);
          }}
          onApply={(patch) => {
            commitAll(patch);
            setEditRow(null);
            setAdding(null);
          }}
        />
      )}
    </SectionBleed>
  );
}

/**
 * Группа строк одной фазы: подзаголовок с кнопкой добавления и сами строки.
 *
 * Кнопка «+» у фазы, а не в шапке таблицы: объект добавляют в конкретную
 * фазу, и одна кнопка на две группы спрашивала бы, в какую. Открывает то же
 * окно объекта ([ObjectDialog]), которым строка потом правится: одна запись --
 * одно окно. Пустая группа говорит, что видят инспекторы фазы без её объектов;
 * у кадров в подзаголовке -- «Запись кадров» и предупреждение, если срез и
 * архив стороны настроены, а записи, с которой они уходят, не будет.
 */
/** Политика записи кадров пути, как её показывает подзаголовок группы кадров. */
interface FrameAudit {
  state: FieldState;
  /** Действующее значение: своё либо пришедшее сверху, умолчание модуля -- deny. */
  policy: string;
  sample?: number;
  onChange: (policy: string, sample?: number) => void;
}

const FRAME_AUDIT_SAMPLES = [1, 2, 5, 10, 100] as const;

/**
 * Оси, которые есть у фазы. Снимок и отдача -- для инспекторов: снимок кладут
 * им, отдача поднимает их правки. У фазы без инспекторов остаются запись и
 * архив.
 */
const JOURNAL_KINDS: readonly TailKind[] = ["preview", "archive"];

function usedKindsOf(inspected: boolean): readonly TailKind[] {
  return inspected ? KINDS : JOURNAL_KINDS;
}

/**
 * Политика записи кадров у правого края подзаголовка группы кадров: срез и
 * архив кадра уходят только вместе с записью кадра. Подписи перед селектором
 * нет -- варианты говорят сами («запись всех», «запись отказов», «без
 * записи»), а что это за политика, объясняет подсказка при наведении.
 */
function FrameAuditPick({ audit }: { audit: FrameAudit }) {
  const t = useT();
  const inherited = audit.state === "inherit";
  const options = [
    {
      value: "inherit",
      label: t("tail.frameAuditOptions.inherit", {
        value: t(`tail.frameAuditOptions.${audit.policy}`),
      }),
    },
    { value: "off", label: t("tail.frameAuditOptions.off") },
    { value: "deny", label: t("tail.frameAuditOptions.deny") },
    { value: "all", label: t("tail.frameAuditOptions.all") },
  ];

  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={400}
      title={<HintMarkup text={t("tail.frameAuditHint")} />}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
        <BlockSelect
          value={inherited ? "inherit" : audit.policy}
          options={options}
          onChange={(next) => audit.onChange(next, audit.sample)}
          ariaLabel={t("tail.frameAudit")}
        />
        {audit.policy === "all" && (
          <BlockSelect
            value={String(audit.sample ?? 1)}
            options={FRAME_AUDIT_SAMPLES.map((n) => ({
              value: String(n),
              label: n === 1 ? t("tail.frameAuditEveryOne") : t("tail.frameAuditEvery", { n }),
            }))}
            onChange={(next) => audit.onChange("all", Number(next))}
            ariaLabel={`${t("tail.frameAudit")}: sample=`}
          />
        )}
      </Stack>
    </Tooltip>
  );
}

function PhaseRows({
  phase,
  rows,
  unused,
  span,
  onAdd,
  audit,
  warning,
  children,
}: {
  phase: TailPhase;
  rows: readonly ObjectName[];
  unused: readonly ObjectName[];
  /** Сколько колонок занимают левая и правая ячейки подзаголовка. */
  span: { left: number; right: number };
  /** Выбранный в меню «+» объект: окно открывается уже на нём. */
  onAdd: (name: ObjectName) => void;
  /** Запись кадров -- только у первой группы кадров. */
  audit?: FrameAudit;
  /** Срез и архив группы настроены, а записи, с которой они уходят, не будет. */
  warning?: string;
  children: ReactNode;
}) {
  const t = useT();
  /*
   * «+» раскрывает меню из того, чего в фазе ещё нет. Объектов три, и они
   * помещаются в пункты; окно с селектором объекта внутри задавало бы тот
   * же вопрос вторым шагом. Когда все три в таблице, «+» гаснет с подсказкой.
   */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const openMenu = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const closeMenu = () => setAnchor(null);

  /*
   * Селектор записи кадров -- у правого края, рядом с «+». Правая ячейка
   * вмещает его, пока в ней есть колонка отдачи; без неё (на пути нет
   * инспекторов вовсе) он встаёт в конец левой ячейки -- тоже справа.
   */
  const auditRight = span.right > 1;

  return (
    <>
      <TableRow>
        <TableCell colSpan={span.left} sx={{ py: 0.5, bgcolor: "action.hover" }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <HintLabel
              text={t(`tail.phase.${phase}`)}
              hint={t(`tail.phaseHint.${phase}`)}
              sx={{ ...dialogLabelSx, fontWeight: 600, textTransform: "uppercase" }}
            />
            {rows.length === 0 && (
              <Typography sx={{ ...dialogLabelSx, opacity: 0.7, whiteSpace: "normal" }}>
                {t(`tail.phaseEmpty.${phase}`)}
              </Typography>
            )}
            {audit !== undefined && !auditRight && (
              <>
                <Box sx={{ flex: 1 }} />
                <FrameAuditPick audit={audit} />
              </>
            )}
          </Stack>
          {warning !== undefined && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0, pt: 0.25 }}>
              <WarningAmberIcon color="warning" sx={{ fontSize: 15, flexShrink: 0 }} />
              <Typography sx={{ ...dialogLabelSx, color: "warning.main", whiteSpace: "normal" }}>
                {warning}
              </Typography>
            </Stack>
          )}
        </TableCell>
        {/*
          Правая ячейка захватывает колонку отдачи: «+» фазы стоит у правого
          края, как кнопки действий в строках ниже.

          Ячейка обычная, не `FilterCell`: кольцо той ячейки значит «курсор в
          поле», а поля здесь нет. Отступы те же, что у ячейки фильтра: свои
          у ячейки сняты, внутренний `Box` получает их от `flushTableSx`.
        */}
        <TableCell
          colSpan={span.right}
          sx={{ p: "0 !important", height: HEAD_H, bgcolor: "action.hover" }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 0.75,
              width: "100%",
              minHeight: HEAD_H,
            }}
          >
            {audit !== undefined && auditRight && <FrameAuditPick audit={audit} />}
            <TableIconButton
              color="success"
              icon={<AddIcon />}
              disabled={unused.length === 0}
              tooltip={unused.length === 0 ? t("tail.addAllUsed") : t("tail.addObject")}
              aria-label={`${t("tail.addObject")} ${t(`tail.phase.${phase}`)}`}
              onClick={openMenu}
            />
            <Menu anchorEl={anchor} open={anchor !== null} onClose={closeMenu}>
              {unused.map((name) => (
                <MenuItem
                  key={name}
                  onClick={() => {
                    closeMenu();
                    onAdd(name);
                  }}
                  sx={{ alignItems: "flex-start" }}
                >
                  <ListItemText
                    primary={t(`tail.objects.${name}`)}
                    secondary={t(`tail.objectHints.${name}`)}
                    slotProps={{
                      primary: { sx: { fontSize: "0.85rem" } },
                      secondary: { sx: { fontSize: "0.72rem", whiteSpace: "normal", maxWidth: 360 } },
                    }}
                  />
                </MenuItem>
              ))}
            </Menu>
          </Box>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

/**
 * Шапка оси: подпись с подсказкой по наведению и селектор «чем задано».
 *
 * Селектор -- тот же `BlockSelect`, что в шапках блоков инспекторов и
 * локального слоя: «наследует» / «своё» / «none» видно и меняется на месте,
 * модалка ради одного вопроса не нужна. «Своё» материализует действующий
 * набор своими строками, «наследует» их стирает, «none» снимает ось. Правка
 * в окне объекта переводит ось в «своё» сама.
 *
 * Своих параметров у оси не осталось: срок и исход архива живут на объекте и
 * правятся его окном, а распоряжение на случай сорванного подъёма -- исключение
 * фазы (waf_exception ... body), общее для всякой недоступности объекта.
 */
function AxisHead({
  axis,
  onState,
}: {
  axis: Axis;
  onState: (next: FieldState) => void;
}) {
  const t = useT();

  const hint =
    axis.from === undefined
      ? t(`tail.${axis.kind}Hint`)
      : `${t(`tail.${axis.kind}Hint`)}\n${t(`inherit.fromHint.${axis.from}`)}`;

  /* У отдачи `none` нет: снятая строка возвращает умолчание модуля. */
  const states: { value: FieldState; label: string }[] =
    axis.kind === "send"
      ? [
          { value: "inherit", label: t("tail.state.inherit") },
          { value: "set", label: t("tail.state.set") },
        ]
      : [
          { value: "inherit", label: t("tail.state.inherit") },
          { value: "set", label: t("tail.state.set") },
          { value: "off", label: t("tail.state.off") },
        ];

  return (
    <TableCell sx={{ ...headCellSx, width: axisWidth(axis.kind) }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <HintLabel text={t(`tail.${axis.kind}`)} hint={hint} />
        <Box sx={{ flex: 1 }} />
        <BlockSelect
          value={axis.state}
          options={states}
          onChange={(next) => {
            if (next !== axis.state) onState(next);
          }}
          ariaLabel={`${t(`tail.${axis.kind}`)}: ${t("tail.stateLabel")}`}
        />
      </Stack>
    </TableCell>
  );
}

/**
 * Метка срока и исхода в ячейке архива: `30d · отказ`.
 *
 * Без неё фильтр исхода виден только в окне объекта и в строках файла, а
 * «архивируем» и «архивируем на отказах» -- разные политики хранения, и
 * различать их надо в таблице.
 */
function archiveMark(t: Translate, spec: ObjectSpec): { text: string; hint: string } | undefined {
  const ttl = spec.ttl !== undefined && spec.ttl !== "" ? spec.ttl : undefined;
  const when = spec.when ?? [];
  if (ttl === undefined && when.length === 0) {
    return undefined;
  }
  const outcome = when.length === 0 ? undefined : t(whenSummaryKey(when));
  return {
    text: [ttl, outcome].filter((part) => part !== undefined).join(" · "),
    hint: [
      `${t("tail.ttl")}: ${ttl ?? t("tail.ttlForever")}`,
      `${t("tail.when")}: ${t(whenSummaryKey(when))}`,
    ].join("\n"),
  };
}

/**
 * Значение ячейки словами: величина, «как снимок», «весь», «нет». Архив без
 * размера у фазы без инспекторов -- «весь»: снимка, в размере которого он
 * уехал бы, там нет, и модуль кладёт объект целиком.
 */
function cellValue(t: Translate, kind: TailKind, spec: ObjectSpec, inspected = true): string {
  if (kind === "capture") {
    return spec.size ?? t("tail.whole");
  }
  if (kind === "send") {
    return spec.send === "store" ? t("tail.sendStore") : t("tail.sendOriginal");
  }
  if (spec.original === true && (kind === "archive" || spec.size === undefined)) {
    if (spec.originalSize === "capture") return t("tail.asCapture");
    return spec.originalSize ?? t("tail.whole");
  }
  if (kind === "preview") {
    if (spec.size === undefined) return "—";
    return spec.item === undefined ? spec.size : `${spec.size} / ${spec.item}`;
  }
  return spec.size ?? t(inspected ? "tail.asCapture" : "tail.whole");
}

/**
 * Ячейка объект × ось: состояние словами, метки и скобка уровня.
 *
 * Значение здесь не правится -- правит окно объекта, которое открывает клик
 * по строке. Метка «ориг.» стоит у объекта, который эта ось везёт оригиналом
 * (строка `reload`); метка «имена» -- у объекта со своими списками имён.
 * Значение, пришедшее сверху, помечено уровнем -- `(http)`, `(server)`,
 * `(умолчание)`: на пути ключ может приехать и от сервера, и через его голову
 * от http, и общая приглушённость колонки на этот вопрос не отвечает.
 */
function ObjectCell({
  axis,
  phase,
  name,
  problem,
  inspected = true,
}: {
  axis: Axis;
  phase: TailPhase;
  name: ObjectName;
  problem?: CellProblem;
  /** Есть ли у фазы инспекторы: без них архив без размера -- весь объект. */
  inspected?: boolean;
}) {
  const t = useT();
  const effective = axis.effective[phase];
  const spec = effective.objects[name];
  const inheriting = axis.state === "inherit";
  const from = spec.on ? cellFrom(axis, phase, name) : undefined;
  const names = spec.on ? ownListsHint(t, effective, axis.kind, name) : undefined;
  const keep = spec.on && axis.kind === "archive" ? archiveMark(t, spec) : undefined;

  const text = spec.on
    ? cellValue(t, axis.kind, spec, inspected)
    : spec.none === true && axis.parent[phase].objects[name].on
      ? t("tail.clearedHere")
      : t("tail.no");

  return (
    <FilterCell
      width={axisWidth(axis.kind)}
      sx={{ minWidth: 0, opacity: inheriting ? 0.62 : 1 }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <Typography sx={{ ...CELL_VALUE_SX, opacity: spec.on ? 1 : 0.55 }}>{text}</Typography>
        {spec.on && spec.original === true && axis.kind !== "capture" && (
          <Tooltip arrow title={t("tail.originalMarkHint")}>
            <Typography component="span" sx={{ ...MARK_SX, color: "info.main" }}>
              {t("tail.originalMark")}
            </Typography>
          </Tooltip>
        )}
        {names !== undefined && (
          <Tooltip arrow title={names}>
            <Typography component="span" sx={{ ...MARK_SX, color: "text.secondary" }}>
              {t("tail.namesMark")}
            </Typography>
          </Tooltip>
        )}
        {/*
          Срок и исход -- рядом со значением, тем же кеглем, что скобка
          уровня: «30d · только отказ» отличает политику хранения от простого
          «архивируем», а полностью она читается подсказкой.
        */}
        {keep !== undefined && (
          <Tooltip arrow title={<HintMarkup text={keep.hint} />}>
            <Typography component="span" sx={{ ...MARK_SX, color: "text.secondary" }}>
              {keep.text}
            </Typography>
          </Tooltip>
        )}
        {/*
          Скобка уровня следом за значением -- ровно та же, что у запертых
          полей ядра: `1m (http)`. Своё значение пометки не имеет, как и в
          таблице настроек, где «своё» отличается снятой галочкой.
        */}
        {from !== undefined && (
          <Tooltip arrow title={t(`inherit.fromHint.${from}`)}>
            <Typography component="span" sx={FROM_SX}>
              ({t(`inherit.tag.${from}`)})
            </Typography>
          </Tooltip>
        )}
        {problem !== undefined && (
          <Tooltip arrow title={problemText(t, problem)}>
            <WarningAmberIcon
              color={problem.level === "error" ? "error" : "warning"}
              sx={{ fontSize: 15, flexShrink: 0 }}
            />
          </Tooltip>
        )}
      </Stack>
    </FilterCell>
  );
}

/** Ось объекта, пока она правится в окне: значения текстом, как в полях. */
interface AxisDraft {
  on: boolean;
  /** Срез снимка / бюджет записи / размер архива. */
  size: string;
  /** Потолок пары, только запись headers/args. */
  item: string;
  /**
   * Откуда байты: со снимка (что видели инспекторы), оригинал (у запроса и
   * ответа -- reload до масок; у кадра -- весь кадр, масок нет) или
   * доставленное получателю после подмены (только запись, response/frame).
   */
  source: "capture" | "original" | "sent";
  origMode: "capture" | "whole" | "size";
  origSize: string;
  ownLists: boolean;
  allow: string[];
  mask: string[];
  deny: string[];
  /** Откуда отдать получателю, только ось отдачи. */
  send: SendSource;
  /** Срок в архиве (`ttl=`), только ось архива; пусто -- вечно. */
  ttl: string;
  /** Исходы архива (`when=`), только ось архива; пусто -- любой. */
  when: ArchiveOutcome[];
}

type Draft = Record<TailKind, AxisDraft>;

function draftOf(
  model: TailModel,
  kind: TailKind,
  name: ObjectName,
  phase: TailPhase,
): AxisDraft {
  const spec = model.objects[name];
  const frame = phase === "frame:c2s" || phase === "frame:s2c";
  /*
   * У кадра «оригинал» -- это весь кадр без размера: строка `body` в архиве
   * или превью. reload у кадра нет, поэтому признак original в разборе не
   * появляется, и читается он здесь, по форме строки.
   */
  const original =
    spec.original === true || (frame && kind !== "capture" && spec.on && spec.size === undefined);
  const target = name === "body" ? undefined : (name as ListTarget);
  const lists =
    target === undefined
      ? { allow: [], mask: [], deny: [] }
      : {
          allow: model.allow[target] ?? [],
          mask: model.mask[target] ?? [],
          deny: model.deny[target] ?? [],
        };
  return {
    on: spec.on,
    size: spec.size ?? "",
    item: spec.item ?? "",
    source:
      kind === "preview" && name === "body" && model.sourceSent === true
        ? "sent"
        : original
          ? "original"
          : "capture",
    origMode:
      spec.original !== true || spec.originalSize === "capture"
        ? "capture"
        : spec.originalSize === undefined
          ? "whole"
          : "size",
    origSize:
      spec.originalSize !== undefined && spec.originalSize !== "capture"
        ? spec.originalSize
        : "",
    ownLists:
      kind !== "capture" &&
      (lists.allow.length > 0 || lists.mask.length > 0 || lists.deny.length > 0),
    ...lists,
    send: spec.send ?? "original",
    ttl: spec.ttl ?? "",
    when: [...(spec.when ?? [])],
  };
}

function offDraft(): AxisDraft {
  return {
    on: false,
    size: "",
    item: "",
    source: "capture",
    origMode: "capture",
    origSize: "",
    ownLists: false,
    allow: [],
    mask: [],
    deny: [],
    send: "original",
    ttl: "",
    when: [],
  };
}

function strU(raw: string): string | undefined {
  const text = raw.trim();
  return text === "" ? undefined : text;
}

/**
 * Объект целиком -- одним окном: снимок, запись и архив с подписанными полями.
 *
 * Им же объект и заводится («+» фазы): одна запись -- одно окно, иначе заводят
 * и правят по-разному. В ячейках это не набиралось: у записи две величины,
 * у источника три состояния, а у полей не было ни подписей, ни подсказок --
 * «30k / 2k» приходилось расшифровывать по ⓘ шапки.
 *
 * Черновик до «Применить»; пишутся только тронутые оси -- окно не
 * материализует наследование той оси, которую оператор не трогал. Внизу --
 * предупреждения (то, что иначе скажет `nginx -t` на ноде) и строки, которые
 * лягут в файл.
 */
function ObjectDialog({
  t,
  phase,
  editName,
  adding = false,
  axes,
  bodyLimit,
  clientMaxBody,
  inspected = true,
  onClose,
  onApply,
}: {
  t: Translate;
  phase: TailPhase;
  /** Окно добавления: объект уже выбран в меню «+», умолчания -- как у нового. */
  adding?: boolean;
  /** Объект строки -- или выбранный в меню «+» при добавлении. */
  editName: ObjectName;
  axes: Record<TailKind, Axis>;
  bodyLimit?: string;
  clientMaxBody?: string;
  /** Есть ли у фазы инспекторы: без них сверок со снимком нет, фаза -- журнал. */
  inspected?: boolean;
  onClose: () => void;
  onApply: (patch: Partial<Record<TailKind, Partial<PhaseModels>>>) => void;
}) {
  const name: ObjectName = editName;

  const baseline = useMemo<Draft>(() => {
    if (name === undefined) {
      return { capture: offDraft(), preview: offDraft(), archive: offDraft(), send: offDraft() };
    }
    return Object.fromEntries(
      KINDS.map((kind) => [
        kind,
        adding ? offDraft() : draftOf(axes[kind].effective[phase], kind, name, phase),
      ]),
    ) as Draft;
  }, [adding, axes, name, phase]);

  /* снимок включается новому объекту, только если его есть кому читать */
  const [draft, setDraft] = useState<Draft>(() =>
    adding && inspected ? { ...baseline, capture: { ...offDraft(), on: true } } : baseline,
  );

  if (name === undefined) return null;
  const target = name === "body" ? undefined : (name as ListTarget);
  const frame = phase === "frame:c2s" || phase === "frame:s2c";

  const patch = (kind: TailKind, part: Partial<AxisDraft>) =>
    setDraft((prev) => ({ ...prev, [kind]: { ...prev[kind], ...part } }));

  const specOf = (kind: TailKind, d: AxisDraft): ObjectSpec => {
    if (!d.on) return { on: false };
    if (kind === "send") return { on: true, send: d.send };
    if (kind === "capture") return { on: true, size: strU(d.size) };
    const original = d.source === "original";
    // У кадра оригинал -- всегда весь кадр: размера у него нет.
    const originalSize = frame
      ? undefined
      : d.origMode === "capture"
        ? "capture"
        : d.origMode === "whole"
          ? undefined
          : strU(d.origSize);
    if (kind === "archive") {
      /*
       * Срок и исход -- свойства вида, а не строки: они едут с объектом и
       * когда он уходит оригиналом (`reload body ttl=30d when=deny`).
       */
      const keep = {
        ttl: strU(d.ttl),
        when: d.when.length > 0 ? d.when : undefined,
      };
      return original
        ? { on: true, original: true, originalSize, ...keep }
        : { on: true, size: strU(d.size), ...keep };
    }
    return {
      on: true,
      size: strU(d.size),
      item: target === undefined ? undefined : strU(d.item),
      ...(original ? { original: true, originalSize } : {}),
    };
  };

  /** Модель оси этой фазы с объектом и его списками из черновика. */
  const patched = (kind: TailKind): TailModel => {
    const model = axes[kind].effective[phase];
    const d = draft[kind];
    const next: TailModel = {
      ...model,
      off: false,
      objects: { ...model.objects, [name]: specOf(kind, d) },
      // source=sent живёт на уровне превью body фаз с подменой.
      ...(kind === "preview" && name === "body"
        ? { sourceSent: d.on && d.source === "sent" }
        : {}),
    };
    if (target !== undefined) {
      const set = (list: ListName, values: string[]) => {
        /* В окне добавления пустой список ничего не стирает: стирать нечего. */
        if (adding && values.length === 0) return;
        next[list] = { ...next[list], [target]: values.length > 0 ? values : undefined };
      };
      if (!d.on) {
        if (!adding) {
          for (const list of listNames(kind)) set(list, []);
        }
      } else if (kind === "capture") {
        set("mask", d.mask);
        set("deny", d.deny);
      } else if (d.ownLists) {
        for (const list of listNames(kind)) set(list, d[list]);
      } else if (!adding) {
        for (const list of listNames(kind)) set(list, []);
      }
    }
    return next;
  };

  const models = Object.fromEntries(KINDS.map((kind) => [kind, patched(kind)])) as Record<
    TailKind,
    TailModel
  >;

  const touched = (kind: TailKind) =>
    JSON.stringify(draft[kind]) !== JSON.stringify(baseline[kind]);

  /*
   * Умолчание отдачи этого объекта: сказанное уровнем выше, иначе правило
   * модуля по снимку из черновика -- срез тела в этом же окне меняет его
   * на глазах. Метка у пункта селектора и строка «действует» под
   * выключенной осью.
   */
  const sendAbove = axes.send.parent[phase].objects[name].send;
  const sendDefault: SendSource =
    axes.send.parentFrom === "module" || axes.send.parentFrom === undefined || sendAbove === undefined
      ? moduleSendDefault(models.capture, name)
      : sendAbove;
  const sendDefaultLabel = t(sendDefault === "store" ? "tail.sendStore" : "tail.sendOriginal");
  const sendFrom =
    axes.send.parentFrom === undefined
      ? t("tail.fromAbove")
      : t(`inherit.from.${axes.send.parentFrom}`);
  const sendOptionLabel = (value: SendSource) =>
    value === sendDefault
      ? `${t(value === "store" ? "tail.sendStore" : "tail.sendOriginal")} ${t("tail.sendDefaultMark")}`
      : t(value === "store" ? "tail.sendStore" : "tail.sendOriginal");

  /* Те же проверки, что у таблицы, но до записи -- про этот объект. */
  const problems = [
    /* у фазы без инспекторов снимка и отдачи нет -- и спорить с ними нечему */
    ...usedKindsOf(inspected).flatMap((kind) =>
      checkTail(models[kind], kind, {
        capture: models.capture,
        bodyLimit,
        clientMaxBody,
        phase,
        inspected,
      }).map((p) => ({ ...p, kind })),
    ),
    ...checkStoreCross(models, phase),
  ].filter((p) => p.object === name);

  const blocked = problems.some((p) => p.level === "error");
  const ready = KINDS.some((kind) => touched(kind)) && !blocked;

  /*
   * Строки в файл: тронутые оси -- какими они станут, нетронутые -- как есть,
   * унаследованные без правок -- комментарием, что действует сверху.
   */
  const lines: Line[] = KINDS.flatMap((kind) => {
    const axis = axes[kind];
    if (!touched(kind)) {
      return axis.own === undefined
        ? inheritedBlock(t, axis)
        : printedLines(kind, axis.own).map((text) => ({ text }));
    }
    return printedLines(
      kind,
      formatTails(
        byPhase((p) =>
          overrideTail(axis.parent[p], p === phase ? models[kind] : axis.effective[p], kind),
        ),
        kind,
      ),
    ).map((text) => ({ text }));
  });

  const apply = () => {
    const out: Partial<Record<TailKind, Partial<PhaseModels>>> = {};
    for (const kind of KINDS) {
      if (touched(kind)) {
        out[kind] = { [phase]: models[kind] } as Partial<PhaseModels>;
      }
    }
    onApply(out);
  };

  /*
   * Один «Источник» на все фазы, и в каждом списке только то, что реально
   * различается. Со снимка есть везде. Оригинал: у запроса и ответа -- reload
   * до масок; у кадра масок нет, и оригинал -- это весь кадр в архиве, а в
   * записи он совпал бы со снимком, поэтому там не предлагается.
   * Доставленное -- только запись тела: подменяют его на всех фазах (ответ и
   * кадр -- секцией rewrite, запрос -- отдачей «с правками»).
   */
  const sourceOptionsFor = (kind: TailKind): DialogOption<"capture" | "original" | "sent">[] => [
    {
      value: "capture",
      label: t("tail.sourceCapture"),
      hint: t(frame ? "tail.sourceCaptureFrameHint" : "tail.sourceCaptureHint"),
    },
    ...(frame && kind === "preview"
      ? []
      : [
          {
            value: "original" as const,
            label: t("tail.sourceOriginal"),
            hint: t(frame ? "tail.sourceOriginalFrameHint" : "tail.sourceOriginalHint"),
          },
        ]),
    ...(kind === "preview" && name === "body"
      ? [{ value: "sent" as const, label: t("tail.recordSent"), hint: t("tail.recordSentHint") }]
      : []),
  ];

  const origOptions: DialogOption<"capture" | "whole" | "size">[] = [
    { value: "capture", label: t("tail.origAsCapture"), hint: t("tail.origAsCaptureHint") },
    { value: "whole", label: t("tail.origWhole"), hint: t("tail.origWholeHint") },
    { value: "size", label: t("tail.origBySize"), hint: t("tail.origBySizeHint") },
  ];

  /*
   * `whole` -- подпись фишки для пустого значения там, где пустота законна:
   * у среза это «весь», у архива «как снимок». Иначе «весь» достижим только
   * очисткой поля, о чём говорит лишь плейсхолдер. У записи бюджет обязателен
   * (модуль), фишки нет.
   */
  const sizeRow = (
    kind: TailKind,
    d: AxisDraft,
    label: string,
    hint: string,
    placeholder: string,
    whole?: string,
  ) => (
    <DialogInput
      label={label}
      hint={hint}
      value={d.size}
      placeholder={placeholder}
      end={
        <Presets
          keep
          items={[
            ...(whole === undefined ? [] : [{ label: whole, value: "" }]),
            ...SIZE_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.size}
          onPick={(next) => patch(kind, { size: next === d.size ? "" : next })}
        />
      }
      onChange={(size) => patch(kind, { size })}
    />
  );

  /*
   * Потолок пары -- отдельной строкой, не в хвосте бюджета: у него своя
   * подсказка и свои подстановки (сотни байт, а не 8k..1m). «без» -- пустое
   * значение, пара пишется целиком в пределах бюджета.
   */
  const pairCapRow = (kind: TailKind, d: AxisDraft) => (
    <DialogInput
      label={t("tail.pairCap")}
      hint={t("tail.pairCapHint")}
      value={d.item}
      placeholder={t("tail.pairCapNone")}
      end={
        <Presets
          keep
          items={[
            { label: t("tail.pairCapNone"), value: "" },
            ...PAIR_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.item}
          onPick={(next) => patch(kind, { item: next === d.item ? "" : next })}
        />
      }
      onChange={(item) => patch(kind, { item })}
    />
  );

  /*
   * Что источник делает с байтами -- строкой под селектором, а не в ⓘ.
   *
   * Разница между «со снимка» и «оригиналом» -- не в размере, а в том, что
   * стало с масками: снимок уже прошёл mask/deny и шире среза не бывает,
   * оригинал читается заново мимо них. Оператор, поставивший маску на cookie
   * и выбравший «оригинал», увозит cookie целым -- и узнать это по названию
   * пункта нельзя.
   */
  const sourceAlert = (kind: TailKind, d: AxisDraft) => {
    if (d.source === "sent") {
      return <DialogAlert text={t("tail.alert.sourceSent")} />;
    }
    /*
     * У фазы без инспекторов снимка нет: говорить о срезе снимка было бы
     * неправдой. Телу источник не показывается вовсе, заголовкам и строке
     * запроса -- словами журнала.
     */
    if (!inspected) {
      if (name === "body") {
        return null;
      }
      return d.source === "original" ? (
        <DialogAlert tone="warning" text={t("tail.journalOriginal")} />
      ) : (
        <DialogAlert text={t("tail.journalSource")} />
      );
    }
    if (d.source === "original") {
      return (
        <DialogAlert
          tone="warning"
          text={t(frame ? "tail.alert.sourceOriginalFrame" : "tail.alert.sourceOriginal")}
        />
      );
    }
    return (
      <DialogAlert
        text={t(
          !draft.capture.on
            ? "tail.alert.sourceCaptureOff"
            : kind === "archive"
              ? "tail.alert.sourceCaptureArchive"
              : "tail.alert.sourceCapture",
          { size: draft.capture.size === "" ? t("tail.whole") : draft.capture.size },
        )}
        tone={!draft.capture.on ? "warning" : "info"}
      />
    );
  };

  /*
   * Источник словами журнала -- у фазы без инспекторов. Масок у тела нет, и
   * выбирать ему нечего: строка источника у тела не показывается, пока в
   * черновике не стоит оригинал или доставленное из прежней настройки -- их
   * можно вернуть «по размеру». У заголовков и строки запроса -- «с масками»
   * или «оригинал».
   */
  const journalSourceOptions = (d: AxisDraft): DialogOption<"capture" | "original" | "sent">[] => [
    name === "body"
      ? { value: "capture", label: t("tail.sourceSized"), hint: t("tail.sourceSizedHint") }
      : { value: "capture", label: t("tail.sourceMasked"), hint: t("tail.sourceMaskedHint") },
    {
      value: "original" as const,
      label: t("tail.sourceOriginal"),
      hint: t("tail.sourceOriginalJournalHint"),
    },
    ...(d.source === "sent"
      ? [{ value: "sent" as const, label: t("tail.recordSent"), hint: t("tail.recordSentHint") }]
      : []),
  ];

  /** Источник и, при оригинале, сколько его класть в обменник. */
  const sourceRow = (kind: TailKind, d: AxisDraft) =>
    !inspected && name === "body" && d.source === "capture" ? null : (
    <>
      <DialogPick
        label={t("tail.source")}
        hint={t(
          !inspected ? "tail.sourceJournalHint" : frame ? "tail.sourceFrameHint" : "tail.sourceHint",
        )}
        value={d.source}
        options={inspected ? sourceOptionsFor(kind) : journalSourceOptions(d)}
        onChange={(source) => patch(kind, { source })}
      />
      {sourceAlert(kind, d)}
      {d.source === "original" && !frame && (
        <>
          <DialogPick
            label={t("tail.origAmount")}
            hint={t("tail.origAmountHint")}
            value={d.origMode}
            options={
              inspected
                ? origOptions
                : origOptions.filter((o) => o.value !== "capture" || d.origMode === "capture")
            }
            onChange={(origMode) => patch(kind, { origMode })}
          />
          {d.origMode === "size" && (
            <DialogInput
              label={t("tail.origSizeLabel")}
              hint={t("tail.origBySizeHint")}
              value={d.origSize}
              end={
                <Presets
                  keep
                  items={SIZE_PRESETS.map((item) => ({ label: item, value: item }))}
                  current={d.origSize}
                  onPick={(next) => patch(kind, { origSize: next === d.origSize ? "" : next })}
                />
              }
              onChange={(origSize) => patch(kind, { origSize })}
            />
          )}
        </>
      )}
    </>
  );

  /*
   * Срок в архиве -- у вида, а не у оси: строка директивы настраивает только
   * названные в ней виды, и «тело держим месяц, заголовки год» пишется двумя
   * строками. Чипы -- единицы nginx (`h`, `d`), которые иначе приходится
   * помнить; повторный клик по выбранному возвращает «вечно».
   */
  const ttlRow = (kind: TailKind, d: AxisDraft) => (
    <DialogInput
      label={t("tail.ttl")}
      hint={t("tail.ttlHint")}
      value={d.ttl}
      placeholder={t("tail.ttlForever")}
      end={
        <Presets
          keep
          items={[
            { label: t("tail.ttlForever"), value: "" },
            ...TTL_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.ttl}
          onPick={(next) => patch(kind, { ttl: next === d.ttl ? "" : next })}
        />
      }
      onChange={(ttl) => patch(kind, { ttl })}
    />
  );

  /*
   * Исход -- фильтр, а не выбор одного слова: `when=allow,deny` значит «всё,
   * кроме перенаправления», и четырьмя состояниями оно и называется списком.
   * Двумя кнопками это не читалось: «любой исход» набирался тем, что ничего
   * не нажато, и выглядел незаполненным полем.
   *
   * Исход берётся маршрутный, по последней фазе: `when=deny` у запроса
   * сработает и на отказе фазы ответа, ради чего запись запроса и ждёт исхода.
   */
  const whenRow = (kind: TailKind, d: AxisDraft) => (
    <DialogWhen
      label={t("tail.when")}
      hint={t("tail.whenHint")}
      value={d.when}
      onChange={(when) => patch(kind, { when: ARCHIVE_OUTCOMES.filter((name) => when.includes(name)) })}
    />
  );

  /** Свои списки имён оси -- или наследство снимка, одним селектором. */
  const listsRow = (kind: TailKind, d: AxisDraft) =>
    target === undefined ? null : (
      <>
        <DialogPick
          label={t("tail.lists")}
          hint={t(inspected ? "tail.listsHint" : "tail.listsJournalHint")}
          value={d.ownLists ? "own" : "capture"}
          options={[
            { value: "capture", label: t(inspected ? "tail.listsCapture" : "tail.listsStandard") },
            { value: "own", label: t("tail.listsOwn") },
          ]}
          onChange={(v) => patch(kind, { ownLists: v === "own" })}
        />
        {d.ownLists && (
          <>
            <DialogAlert text={t("tail.alert.ownLists")} />
            <DialogFrame label={t("tail.allow")} hint={t("tail.allowHint")}>
              <ChipInput
                names={d.allow}
                placeholder="content-type"
                addLabel={t("tail.addName")}
                onChange={(allow) => patch(kind, { allow })}
              />
            </DialogFrame>
            <DialogFrame label={t("tail.mask")} hint={t("tail.maskHint")}>
              <ChipInput
                names={d.mask}
                placeholder="cookie"
                addLabel={t("tail.addName")}
                onChange={(mask) => patch(kind, { mask })}
              />
            </DialogFrame>
            <DialogFrame label={t("tail.deny")} hint={t("tail.denyHint")}>
              <ChipInput
                names={d.deny}
                placeholder="authorization"
                addLabel={t("tail.addName")}
                onChange={(deny) => patch(kind, { deny })}
              />
            </DialogFrame>
          </>
        )}
        {!d.ownLists && d.source === "original" && (
          <DialogAlert tone="warning" text={t("tail.alert.listsOriginal")} />
        )}
      </>
    );

  /*
   * Свёрнутый блок оси: что она делает с этим объектом, одной строкой -- то
   * же слово, что стоит в её колонке таблицы. У отдачи вместо значения --
   * действующее умолчание: ось выключена, но получатель что-то получит, и
   * молчащая шапка врала бы.
   */
  const axisSummary = (kind: TailKind, d: AxisDraft): string => {
    if (kind === "send" && !d.on) {
      return t("tail.sendEffective", { value: sendDefaultLabel, from: sendFrom });
    }
    if (!d.on) {
      return t("tail.axisOff");
    }
    const value = cellValue(t, kind, specOf(kind, d), inspected);
    if (kind === "capture" || kind === "send") {
      return value;
    }
    const marks = [
      d.source === "original" ? t("tail.sourceOriginal") : undefined,
      d.source === "sent" ? t("tail.recordSent") : undefined,
      d.ownLists ? t("tail.namesMark") : undefined,
      kind === "archive" && d.when.length > 0 ? t(whenSummaryKey(d.when)) : undefined,
    ].filter((mark) => mark !== undefined);
    return [value, ...marks].join(" · ");
  };

  const axisBlock = (kind: TailKind) => {
    const d = draft[kind];
    return (
      <DialogSection
        key={kind}
        title={t(`tail.${kind}`)}
        hint={t(`tail.${kind}Short`)}
        summary={axisSummary(kind, d)}
        checked={d.on}
        onCheck={(on) => patch(kind, { on })}
        defaultOpen={d.on}
      >
        {kind === "capture" && (
          <>
            <DialogAlert text={t("tail.alert.capture")} />
            {sizeRow(kind, d, t("tail.slice"), t("tail.sliceHint"), t("tail.whole"), t("tail.whole"))}
            {target !== undefined && (
              <>
                <DialogFrame label={t("tail.mask")} hint={t("tail.maskHint")}>
                  <ChipInput
                    names={d.mask}
                    placeholder={
                      target === "args" ? "password" : phase === "response" ? "set-cookie" : "cookie"
                    }
                    addLabel={t("tail.addName")}
                    onChange={(mask) => patch(kind, { mask })}
                  />
                </DialogFrame>
                <DialogFrame label={t("tail.deny")} hint={t("tail.denyHint")}>
                  <ChipInput
                    names={d.deny}
                    placeholder={target === "headers" ? "authorization" : "session"}
                    addLabel={t("tail.addName")}
                    onChange={(deny) => patch(kind, { deny })}
                  />
                </DialogFrame>
              </>
            )}
          </>
        )}
        {kind === "preview" && (
          <>
            {sizeRow(kind, d, t("tail.budget"), t("tail.budgetHint"), t("tail.budgetNone"))}
            {target !== undefined && pairCapRow(kind, d)}
            {sourceRow(kind, d)}
            {listsRow(kind, d)}
            <DialogAlert tone="warning" text={t("tail.alert.auditOverride")} />
          </>
        )}
        {kind === "archive" && (
          <>
            {sourceRow(kind, d)}
            {/* без инспекторов снимка нет: пустой размер -- весь объект */}
            {d.source === "capture" &&
              sizeRow(
                kind,
                d,
                t("tail.archiveSize"),
                t(inspected ? "tail.archiveSizeHint" : "tail.archiveSizeJournalHint"),
                t(inspected ? "tail.asCapture" : "tail.whole"),
                t(inspected ? "tail.asCapture" : "tail.whole"),
              )}
            {ttlRow(kind, d)}
            {whenRow(kind, d)}
            {listsRow(kind, d)}
            <DialogAlert tone="warning" text={t("tail.alert.archiveOverride")} />
          </>
        )}
        {kind === "send" && (
          /*
           * Отдача: один селектор. «С правками» -- версия инспектора, если он
           * её положил, и последняя из цепочки, если правок было несколько;
           * неполный снимок тела -- сбой подъёма, которым распоряжается
           * политика фазы. У заголовков и строки запроса «с правками» --
           * склейка по имени.
           */
          <>
            <DialogPick
              label={t("tail.sendPick")}
              hint={t(
                name === "headers"
                  ? "tail.sendPickHeadersHint"
                  : name === "args"
                    ? "tail.sendPickArgsHint"
                    : frame
                      ? "tail.sendPickFrameHint"
                      : "tail.sendPickHint",
              )}
              value={d.send}
              options={[
                {
                  value: "original" as const,
                  label: sendOptionLabel("original"),
                  hint: t("tail.sendOriginalHint"),
                },
                {
                  value: "store" as const,
                  label: sendOptionLabel("store"),
                  hint: t("tail.sendStoreHint"),
                },
              ]}
              onChange={(send) => patch(kind, { send })}
            />
            <DialogAlert
              text={t(
                d.send === "store"
                  ? name === "body"
                    ? "tail.alert.sendStoreBody"
                    : "tail.alert.sendStoreNames"
                  : "tail.alert.sendOriginal",
              )}
            />
          </>
        )}
      </DialogSection>
    );
  };

  return (
    <Modal
      onClose={onClose}
      title={
        adding
          ? t("tail.addTitle", { phase: t(`tail.phase.${phase}`) })
          : t("tail.objectTitle", {
              object: t(`tail.objects.${name}`),
              phase: t(`tail.phase.${phase}`),
            })
      }
      hint={t(inspected ? "tail.objectDialogHint" : "tail.objectDialogHintJournal")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={apply}>
            {adding ? t("common.add") : t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={1}>
          {/* у фазы без инспекторов снимать и отдавать некому -- этих осей нет */}
          {usedKindsOf(inspected).map((kind) => axisBlock(kind))}
          {problems.length > 0 && (
            <Stack spacing={0.5}>
              {problems.map((p, index) => (
                <Stack
                  key={`${p.kind}:${p.code}:${index}`}
                  direction="row"
                  spacing={0.5}
                  sx={{ alignItems: "center" }}
                >
                  <WarningAmberIcon
                    color={p.level === "error" ? "error" : "warning"}
                    sx={{ fontSize: 15, flexShrink: 0 }}
                  />
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      color: p.level === "error" ? "error.main" : "warning.main",
                    }}
                  >
                    {`${t(`tail.${p.kind}`)}: ${problemText(t, p)}`}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
          <DialogEmitted
            label={t("tail.emitted")}
            lines={lines}
            empty={t("tail.emittedNone")}
          />
        </Stack>
    </Modal>
  );
}

/**
 * Секция «Снимок» карточки маршрута -- одна на сервер и на путь.
 *
 * Обёртка живёт рядом с таблицей, а не в форме уровня: у сервера и пути снимок
 * читается и правится одинаково (разница -- только в том, у кого они
 * наследуют, а это уже в `parents`), и две точки сборки рано или поздно
 * разошлись бы. Из nginx сюда приходит один ключ -- `client_max_body_size`:
 * снимок тела шире него не грузится, и форма ловит это до `nginx -t`.
 */
export function RouteCapture({
  waf,
  nginx,
  phases,
  wafParents,
  onWaf,
}: {
  waf: Doc;
  nginx: Doc;
  /** Фазы уровня (RouteForm.phasesFor); кадры раскладываются на обе стороны. */
  phases?: readonly ("request" | "response" | "frame")[];
  wafParents: ParentChain;
  onWaf: (next: Doc) => void;
}) {
  const tail: TailPhase[] | undefined = phases?.flatMap((phase) =>
    phase === "frame" ? (["frame:c2s", "frame:s2c"] as TailPhase[]) : [phase],
  );
  return (
    <CaptureTable
      waf={waf}
      parents={wafParents}
      onChange={onWaf}
      phases={tail}
      clientMaxBody={
        typeof nginx.clientMaxBodySize === "string" ? nginx.clientMaxBodySize : undefined
      }
    />
  );
}

/** Имена чипами: добавить -- Enter, запятая или потеря фокуса; убрать -- крестик. */
function ChipInput({
  names,
  placeholder,
  addLabel,
  onChange,
}: {
  names: string[];
  placeholder: string;
  addLabel: string;
  onChange: (names: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const fresh = raw
      .split(/[\s,]+/)
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n !== "" && !names.includes(n));
    if (fresh.length > 0) onChange([...names, ...fresh]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && names.length > 0) {
      onChange(names.slice(0, -1));
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 0.5,
        width: "100%",
        minHeight: 24,
        py: 0.25,
      }}
    >
      {names.map((name) => (
        <Chip
          key={name}
          size="small"
          label={name}
          onDelete={() => onChange(names.filter((n) => n !== name))}
          sx={{ height: 20, fontSize: "0.7rem", fontFamily: "monospace" }}
        />
      ))}
      <InputBase
        value={draft}
        placeholder={names.length === 0 ? placeholder : addLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
        inputProps={{ "aria-label": addLabel }}
        sx={{ fontSize: "0.78rem", flex: 1, minWidth: 72, "& input": { p: 0 } }}
      />
    </Box>
  );
}
