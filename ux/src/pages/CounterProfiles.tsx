import { useEffect, useMemo, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";

import { Form } from "../components/Form.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  DataTable,
  DraftCell,
  FilterSelect,
  RowActionsHead,
  rowActionsWidth,
  TableIconButton,
  TableNoticeRow,
  useRowOps,
  usePager,
  type FilterOption,
} from "../components/data-table/index.ts";
import {
  CODE_W,
  flushTableSx,
  HeadCell,
  HeadHint,
  TableBlock,
  TableCols,
} from "../components/table-block.tsx";
import { DialogAlert } from "../components/dialog-kit.tsx";
import {
  dataCellSx,
  SettingsGroup,
  SettingsNote,
  SettingsTable,
} from "../components/settings-table.tsx";
import { LongTextCell } from "../components/long-text-cell.tsx";
import { OutcomesBlock } from "../components/outcomes-block.tsx";
import { SignalsBlock } from "../components/signals-block.tsx";
import {
  Chips,
  Flag,
  Num,
  Pick,
  Section,
  Text,
  UnderlayTabs,
} from "../components/fields.tsx";
import { useLayerTab } from "../config/layer-tabs.tsx";
import type {
  ActionRegistry,
  CounterAxis,
  CounterDecl,
  CounterJudgeRule,
  CounterMeasureRule,
  CounterPriorRule,
  CounterProfile,
  CounterProfileDoc,
  CounterSharedDoc,
  InspectorMeta,
} from "../api.ts";
import { COUNTER_AXES, COUNTER_DIRECTIONS, COUNTER_OPCODES, fetchActions, fetchDatasets, fetchInspectors, verbsFor, weakeningVerbs } from "../api.ts";
import { axisLabel, verbLabel } from "../components/action-select.tsx";
import ChannelNotice, { pageNoticeSx } from "../components/ChannelNotice.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { PAGE_RAIL, TABLE_RAIL } from "../components/PageBar.tsx";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  clearSent,
  closePanel,
  copyCounterProfile,
  loadCounterDenyResponses,
  loadCounterProfileDetail,
  loadCounterProfiles,
  loadCounterShared,
  openPanel,
  removeCounterProfile,
  restoreCounterProfileThunk,
  saveCounterProfileThunk,
  saveCounterSharedThunk,
  sendCounter,
} from "../store/slices/pages/counter.ts";

/*
 * Ящик карточки: 908, как у сервера и пути. В 720 не входили три таблицы
 * профиля -- сигналы (тогда семь колонок: отправитель, глаголы, ось, корзина,
 * поводы, потолок и кнопки), метрики и инициаторы: колонка без своей ширины
 * получала остаток, а остатка не оставалось, и её поле рисовалось поверх
 * соседней колонки.
 */
const PANEL_WIDTH = 908;
const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;
const COUNTER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/*
 * Два содержимого одной страницы: объявления счётчиков и профили, которые
 * ссылаются на них по имени. Раньше они шли лентой -- общий блок сверху,
 * список профилей под ним. Блок стоял в полях карточки (`TableBlock` выносит
 * таблицу на поля секции), список -- в полях страницы: левые вертикали
 * расходились на 16px, а у списка не было заголовка вовсе -- имя ему давал
 * только пункт меню.
 *
 * Селектор ставит на экран ровно одно из двух и называет его -- тот же слой,
 * что у разделов страницы конфигурации. Счётчики первыми: счётчик объявляется
 * один раз на инспектор, профили лишь ссылаются на него, и порядок вкладок
 * повторяет порядок настройки.
 */
const COUNTER_VIEWS = ["counters", "profiles"] as const;

type CounterView = (typeof COUNTER_VIEWS)[number];

/** Выбранная вкладка переживает уход со страницы -- как разделы конфига. */
const VIEW_KEY = "waf.counter.view";

/* Умолчания повторяют defaults() инспектора и normalizeDoc контроллера. */
function emptyDoc(): CounterProfileDoc {
  return {
    description: "",
    /* Правил приёма по умолчанию нет: все три глагола требуют имени отправителя. */
    trigger: { prior: [] },
    request: { enabled: true, judge: [], denyResponse: "counter_limit", outcomes: [] },
    response: { enabled: true, measure: [] },
    frame: emptyFrame(),
  };
}

/* Секция кадров: у документов, заведённых до неё, достраивается здесь же. */
function emptyFrame(): CounterProfileDoc["frame"] {
  return { enabled: true, measure: [], judge: [], denyResponse: "ws_policy", outcomes: [] };
}

function withFrame(doc: CounterProfileDoc): CounterProfileDoc {
  return doc.frame === undefined ? { ...doc, frame: emptyFrame() } : doc;
}

function measureRule(counter: string): CounterMeasureRule {
  return {
    if: { status: [], contentType: [], methods: [], direction: [], opcode: [] },
    source: "const",
    regex: "",
    per: null,
    counter,
    axes: [],
  };
}

/* Целое из поля; мусор возвращает умолчание, а не ноль. */
function whole(raw: string, def: number): number {
  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : def;
}

export default function CounterProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.counter.rows);
  const shared = useAppSelector((s) => s.pages.counter.shared);
  const loading = useAppSelector((s) => s.pages.counter.loading);
  const error = useAppSelector((s) => s.pages.counter.error);
  const panelId = useAppSelector((s) => s.pages.counter.panelId);
  const sending = useAppSelector((s) => s.pages.counter.sending);
  const sent = useAppSelector((s) => s.pages.counter.sent);
  const pager = usePager(rows);
  const ops = useRowOps<CounterProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyCounterProfile({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeCounterProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });
  const [view, setView] = useLayerTab<CounterView>(VIEW_KEY, COUNTER_VIEWS);
  /*
   * Правка счётчика живёт здесь, а не в блоке: «Создать» на полосе страницы
   * заводит то, на что смотрят, -- на вкладке счётчиков это счётчик, а не
   * профиль в ящике справа.
   */
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  usePageBar({
    flush: scope !== null,
    onCreate: () => {
      if (view === "counters") {
        setEditing(null);
        return;
      }
      dispatch(openPanel(null));
    },
    onUpdate: () => {
      void dispatch(loadCounterProfiles(scope));
      void dispatch(loadCounterShared(scope));
      void dispatch(loadCounterDenyResponses(scope));
    },
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendCounter(scope));
      }
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
    sendDisabled: sending || scope === null || rows.length === 0,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      <ChannelNotice id="counter" />
      {error !== null && (
        <Alert severity="error" icon={false} sx={pageNoticeSx}>
          {error}
        </Alert>
      )}
      {sent !== null && (
        <Alert
          severity="success"
          icon={false}
          sx={pageNoticeSx}
          onClose={() => dispatch(clearSent())}
        >
          {t("counter.sentHint")} {sent}
        </Alert>
      )}
      {/*
        Полоса страницы -- только селектор содержимого: имя выбранному даёт он
        сам. Рассылка ушла на полосу страницы, к «Обновить» и «Создать»: она
        одна на обе вкладки (счётчики и профили едут инспектору одним
        поколением), и второй кнопкой на экране была лишней. Объяснение
        поколения жило здесь абзацем -- его говорит полоса состояния канала
        над таблицей, и то лишь когда есть о чём говорить.
      */}
      <Box
        sx={{
          pl: `${TABLE_RAIL}px`,
          pr: `${PAGE_RAIL}px`,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <UnderlayTabs
          value={view}
          onChange={setView}
          items={[
            { value: "counters", label: t("counter.sectionCounters") },
            { value: "profiles", label: t("counter.sectionProfiles") },
          ]}
        />
      </Box>

      {view === "counters" ? (
        <SharedBlock
          t={t}
          scope={scope}
          rows={rows}
          shared={shared}
          editing={editing}
          setEditing={setEditing}
        />
      ) : (
        <DataTable loading={loading} error={error}>
          <DataTable.Head>
            <TableCell>{t("common.name")}</TableCell>
            <TableCell>{t("counter.judgeCount")}</TableCell>
            <TableCell>{t("counter.measureCount")}</TableCell>
            <TableCell>{t("counter.phases")}</TableCell>
            <RowActionsHead />
          </DataTable.Head>
          <DataTable.Body>
            {pager.rows.map((row) => (
              <TableRow
                key={row.uuid}
                hover
                selected={panelId === row.uuid}
                onClick={() => {
                  dispatch(openPanel(row.uuid));
                  void dispatch(loadCounterProfileDetail({ scope, id: row.uuid }));
                }}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.doc?.request.judge.length ?? 0}</TableCell>
                <TableCell>{row.doc?.response.measure.length ?? 0}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    {row.doc?.request.enabled && (
                      <Chip size="small" label={t("counter.request")} />
                    )}
                    {row.doc?.response.enabled && (
                      <Chip size="small" variant="outlined" label={t("counter.response")} />
                    )}
                  </Stack>
                </TableCell>
                {ops.cell(row, {
                  remove:
                    row.name === "default" ? t("counter.lockedDelete") : undefined,
                })}
              </TableRow>
            ))}
          </DataTable.Body>
          <DataTable.Empty
            message={t("counter.empty")}
            actionLabel={t("common.create")}
            onAction={() => dispatch(openPanel(null))}
          />
          <DataTable.Error onRetry={() => void dispatch(loadCounterProfiles(scope))} />
          <DataTable.Pager pager={pager} />
        </DataTable>
      )}
      {ops.modals}
      <Drawer
        anchor="right"
        open={panelId !== undefined}
        onClose={() => dispatch(closePanel())}
        slotProps={{
          paper: {
            sx: { width: { xs: "100%", sm: PANEL_WIDTH }, borderLeft: 1, borderColor: "divider" },
          },
        }}
      >
        {panelId !== undefined && (
          <CounterProfileForm
            key={panelId ?? "new"}
            scope={scope}
            id={panelId}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </>
  );
}

/* --- вкладка «Счётчики»: объявления и субъекты ------------------------------ */

/*
 * Кто из профилей называет счётчик. Повторяет `checkReferences` контроллера
 * (counter-profile-doc.ts): имя корзины стоит в четырёх местах документа --
 * суд, учёт, инициатор и правило приёма note.
 *
 * Считаем и то, что контроллер из сверки исключает: профиль в режиме «выключен»
 * и своё `do: note`. Ссылка там настоящая, и сломается она в тот день, когда
 * профиль включат, -- панель строже ручки осознанно, а тултип называет место.
 */
type CounterSite = "judge" | "measure" | "outcome" | "prior";

const COUNTER_SITES: CounterSite[] = ["judge", "measure", "outcome", "prior"];

interface CounterUse {
  profile: string;
  /** Профиль выключен: ссылка есть, но контроллер её сейчас не сторожит. */
  sites: CounterSite[];
}

function counterUses(rows: CounterProfile[], name: string): CounterUse[] {
  const out: CounterUse[] = [];

  for (const row of rows) {
    const doc: CounterProfileDoc | undefined = row.doc;

    if (doc === undefined) {
      continue;
    }

    const sites = new Set<CounterSite>();

    if (
      doc.request.judge.some((rule) => rule.counter === name) ||
      (doc.frame?.judge ?? []).some((rule) => rule.counter === name)
    ) {
      sites.add("judge");
    }

    if (
      doc.response.measure.some((rule) => rule.counter === name) ||
      (doc.frame?.measure ?? []).some((rule) => rule.counter === name)
    ) {
      sites.add("measure");
    }

    /*
     * Инициатор называет корзину дважды и по-разному: `on: level` смотрит на
     * уровень своей, `do: note` наполняет названную. Обе -- отсюда.
     */
    const inOutcome = doc.request.outcomes.some(
      (rule) =>
        (rule.on === "level" && rule.if?.counter === name) ||
        (rule.do === "note" && rule.counter === name),
    );

    if (inOutcome) {
      sites.add("outcome");
    }

    const inPrior = doc.trigger.prior.some(
      (rule) => rule.accept.includes("note") && rule.counter === name,
    );

    if (inPrior) {
      sites.add("prior");
    }

    if (sites.size > 0) {
      out.push({
        profile: row.name,
        sites: COUNTER_SITES.filter((site) => sites.has(site)),
      });
    }
  }

  return out;
}

/** «default · суд, приём»: профиль и места, где стоит имя счётчика. */
function usageLabel(t: Translate, use: CounterUse): string {
  const sites = use.sites.map((site) => t(`counter.sites.${site}`)).join(", ");

  return `${use.profile} · ${sites}`;
}

/** Причина серой корзинки: `RowAction.tooltip` -- строка, не узел. */
function usesLine(t: Translate, uses: CounterUse[]): string {
  return uses.map((use) => usageLabel(t, use)).join("; ");
}

/** Скрепка: тот же список столбиком -- его читают, а не скользят взглядом. */
function usesTooltip(t: Translate, uses: CounterUse[]): ReactNode {
  return (
    <Stack spacing={0.25}>
      <span>{t("counter.usedByHint")}</span>
      {uses.map((use) => (
        <span key={use.profile}>{usageLabel(t, use)}</span>
      ))}
    </Stack>
  );
}

/*
 * Счётчики таблицей: строка -- счётчик, оси с ёмкостью и потерями читаются
 * фишками прямо в строке; правка -- диалогом по строке, как вторичные
 * настройки на других страницах. Источники ключей субъектов -- за шестерёнкой:
 * их задают один раз и потом на них не смотрят.
 *
 * Таблица -- та же `DataTable`, что у профилей на соседней вкладке, а не блок
 * секции: у страницы нет карточки, на поля которой блок выносил бы себя, и от
 * этого выноса левая вертикаль счётчиков расходилась со списком профилей.
 * Через `DataTable` совпадают и рельсы, и шапка, и строки состояний.
 */
function SharedBlock({
  t,
  scope,
  rows,
  shared,
  editing,
  setEditing,
}: {
  t: Translate;
  scope: string;
  /** Профили той же страницы: по ним и считается занятость счётчика. */
  rows: CounterProfile[];
  /** До ответа контроллера объявлений нет -- таблица показывает загрузку. */
  shared: CounterSharedDoc | null;
  editing: string | null | undefined;
  setEditing: (next: string | null | undefined) => void;
}) {
  const dispatch = useAppDispatch();
  const [subjectsOpen, setSubjectsOpen] = useState(false);

  const counters = shared?.counters ?? {};
  const names = Object.keys(counters).sort();

  const save = (next: CounterSharedDoc) =>
    void dispatch(saveCounterSharedThunk({ scope, shared: next }));

  /*
   * Удаление счётчика -- та же правка общей секции: отдельной ручки на
   * объявление нет, PUT везёт секцию целиком. Отсюда и `doc`: узкое место
   * сужения -- замыкание, и `shared` в нём должен быть константой.
   */
  const doc = shared;
  const ops = useRowOps<string>({
    nameOf: (name) => name,
    deleteText: (name) => t("counter.deleteAsk", { name }),
    remove:
      doc === null
        ? undefined
        : async (name) => {
            const next = { ...doc, counters: { ...doc.counters } };

            delete next.counters[name];

            return thunkError(
              await dispatch(saveCounterSharedThunk({ scope, shared: next })),
            );
          },
  });

  /*
   * Почему корзинка серая. Занятость считаем сами -- те же четыре места, что
   * сверит контроллер на PUT; последний счётчик он отобьёт как пустую секцию
   * (`invalid_shared`), и объяснять это отказом после клика поздно.
   */
  const removeReason = (uses: CounterUse[]): string | undefined => {
    if (uses.length > 0) {
      return `${t("counter.inUse")} ${usesLine(t, uses)}`;
    }

    return names.length === 1 ? t("counter.lastCounter") : undefined;
  };

  return (
    <>
      <DataTable loading={shared === null}>
        <DataTable.Head>
          <TableCell sx={{ width: 220 }}>{t("common.name")}</TableCell>
          <TableCell sx={{ width: 110 }}>{t("counter.unit")}</TableCell>
          <TableCell>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Box component="span">{t("counter.axes")}</Box>
              <HeadHint text={t("counter.axesHint")} />
            </Stack>
          </TableCell>
          <TableCell
            align="right"
            sx={{ width: rowActionsWidth(1), minWidth: rowActionsWidth(1) }}
          >
            <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
              <TableIconButton
                icon={<SettingsIcon />}
                tooltip={t("counter.subjects")}
                disabled={shared === null}
                onClick={() => setSubjectsOpen(true)}
              />
              <TableIconButton
                color="success"
                icon={<AddIcon />}
                tooltip={t("common.add")}
                disabled={shared === null}
                onClick={() => setEditing(null)}
              />
            </Stack>
          </TableCell>
        </DataTable.Head>
        <DataTable.Body>
          {names.map((name) => {
            const decl = counters[name];
            const uses = counterUses(rows, name);

            return (
              <TableRow
                key={name}
                hover
                selected={editing === name}
                onClick={() => setEditing(name)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                    <Box component="span">{name}</Box>
                    {/* Сигнальную корзину наполняют соседи, и это видно в строке:
                        иначе «почему её нельзя мерить» останется вопросом. */}
                    {decl.fill === "note" && (
                      <Chip size="small" variant="outlined" label={t("counter.fills.note")} />
                    )}
                  </Stack>
                </TableCell>
                <TableCell>{decl.unit}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {COUNTER_AXES.filter((axis) => decl.axes[axis] !== undefined).map(
                      (axis) => {
                        const tier = decl.axes[axis];

                        return (
                          <Chip
                            key={axis}
                            size="small"
                            variant="outlined"
                            label={`${t(`counter.axis.${axis}`)} ${tier?.max ?? 0} · ${tier?.loss ?? 0}%/с`}
                          />
                        );
                      },
                    )}
                  </Stack>
                </TableCell>
                {ops.cell(
                  name,
                  { copy: t("counter.copyOff"), remove: removeReason(uses) },
                  /*
                    Скрепка -- ответ на «с чем он связан»: профили, чьи правила
                    называют этот счётчик. Ссылок нет -- на её месте пустое
                    место, иначе корзинки соседних строк разъезжаются.
                  */
                  uses.length > 0 ? (
                    <TableIconButton
                      icon={<AttachFileOutlinedIcon />}
                      tooltip={usesTooltip(t, uses)}
                      aria-label={t("counter.usedByHint")}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <Box sx={{ width: 20, height: 20, flexShrink: 0 }} />
                  ),
                )}
              </TableRow>
            );
          })}
        </DataTable.Body>
        <DataTable.Empty
          message={t("counter.countersEmpty")}
          actionLabel={t("common.add")}
          onAction={() => setEditing(null)}
        />
      </DataTable>
      {ops.modals}
      {shared !== null && editing !== undefined && (
        <CounterDialog
          t={t}
          name={editing}
          shared={shared}
          removeBlock={
            editing === null
              ? null
              : (removeReason(counterUses(rows, editing)) ?? null)
          }
          onClose={() => setEditing(undefined)}
          onSave={(next) => {
            setEditing(undefined);
            save(next);
          }}
        />
      )}
      {shared !== null && subjectsOpen && (
        <SubjectsDialog
          t={t}
          shared={shared}
          onClose={() => setSubjectsOpen(false)}
          onSave={(next) => {
            setSubjectsOpen(false);
            save(next);
          }}
        />
      )}
    </>
  );
}

/*
 * Карточка счётчика: имя, единица, таблица осей. Ось без ёмкости выключена --
 * не считает и не судит; включённая требует оба числа, это же проверит и
 * контроллер, и загрузчик инспектора.
 */
function CounterDialog({
  t,
  name,
  shared,
  removeBlock,
  onClose,
  onSave,
}: {
  t: Translate;
  name: string | null;
  shared: CounterSharedDoc;
  /** Почему удалять нельзя; `null` -- можно. Причину считает таблица. */
  removeBlock: string | null;
  onClose: () => void;
  onSave: (next: CounterSharedDoc) => void;
}) {
  const existing: CounterDecl | null = name === null ? null : shared.counters[name];

  const [counterName, setCounterName] = useState(name ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [fill, setFill] = useState<CounterDecl["fill"]>(existing?.fill ?? "measure");
  const [axes, setAxes] = useState<CounterDecl["axes"]>(existing?.axes ?? {});
  /* Свои источники ключей: пусто -- общая секция subjects. */
  const [sessCookie, setSessCookie] = useState(existing?.subjects?.sess.cookie ?? "");
  const [userFrom, setUserFrom] = useState(existing?.subjects?.user.from ?? "");

  const nameOk = COUNTER_NAME_RE.test(counterName);
  const enabled = COUNTER_AXES.filter((axis) => axes[axis] !== undefined);
  /*
   * Оси, у которых чисел ещё нет. Не просто `false`: включённая ось приходит
   * с нулевой ёмкостью, и «Сохранить» гасло молча -- оператор видел серую
   * кнопку и ни слова о том, какая строка её держит.
   */
  const tierGaps = enabled.filter(
    (axis) =>
      !(
        (axes[axis]?.max ?? 0) > 0 &&
        (axes[axis]?.loss ?? 0) > 0 &&
        (axes[axis]?.loss ?? 0) <= 100
      ),
  );
  const tiersOk = tierGaps.length === 0;
  /*
   * Ось «пользователь» без источника не грузится ни у контроллера, ни у
   * инспектора: корзина есть, а ключа для неё нет. Форма это знает раньше
   * сервера -- иначе оператор узнаёт об этом английской строкой после клика.
   */
  const userSourceMissing =
    axes.user !== undefined && userFrom === "" && shared.subjects.user.from === "";
  const canSave = nameOk && enabled.length > 0 && tiersOk && !userSourceMissing;

  const patchAxis = (axis: CounterAxis, part: { max?: number; loss?: number } | null) =>
    setAxes((prev) => {
      if (part === null) {
        const next = { ...prev };
        delete next[axis];

        return next;
      }

      return { ...prev, [axis]: { max: 0, loss: 1, ...prev[axis], ...part } };
    });

  const save = () => {
    const counters = { ...shared.counters };

    if (name !== null && name !== counterName) {
      delete counters[name];
    }

    counters[counterName] = {
      unit,
      fill,
      axes,
      subjects:
        sessCookie === "" && userFrom === ""
          ? null
          : { sess: { cookie: sessCookie }, user: { from: userFrom } },
    };
    onSave({ ...shared, counters });
  };

  const remove = () => {
    if (name === null) {
      return;
    }

    const counters = { ...shared.counters };
    delete counters[name];
    onSave({ ...shared, counters });
  };

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      title={name === null ? t("counter.newCounter") : t("counter.editCounter")}
      actions={
        <>
          {/*
            Удаление тут же, где правка: сюда приходят от строки, и «занят
            профилем» должно отвечать в обоих местах одинаково -- серой
            кнопкой с причиной, а не отказом сервера после клика.
          */}
          {name !== null && (
            <Tooltip title={removeBlock ?? ""}>
              <Box component="span" sx={{ display: "inline-flex" }}>
                <Button color="error" disabled={removeBlock !== null} onClick={remove}>
                  {t("common.delete")}
                </Button>
              </Box>
            </Tooltip>
          )}
          <Modal.Cancel />
          <Modal.Submit disabled={!canSave} onClick={save}>
            {t("common.save")}
          </Modal.Submit>
        </>
      }
    >
        <SettingsTable aside={false} name={COUNTER_NAME_W}>
          <Text
            label={t("common.name")}
            helper={t("counter.counterNameHint")}
            value={counterName}
            onChange={setCounterName}
          />
          <Text label={t("counter.unit")} helper={t("counter.unitHint")} value={unit} onChange={setUnit} />
          <Pick
            label={t("counter.fill")}
            helper={t("counter.fillHint")}
            value={fill}
            options={[
              { value: "measure", label: t("counter.fills.measure") },
              { value: "note", label: t("counter.fills.note") },
            ]}
            onChange={(value) => setFill(value as CounterDecl["fill"])}
          />
        </SettingsTable>
        {/*
          Оси -- блок со своей шапкой, а не таблица вслед за полями: без
          шапки следующая за ней строка источника читалась седьмой осью.
          `flushTableSx` выводит её на те же края, что и строки настроек
          (без него таблица стояла на 16px уже с каждой стороны).

          Шапка -- обычная шапка `TableBlock`: свои поля она берёт по тому же
          контексту, что и вынос таблицы (`useFlushSection`), и в окне не берёт
          вовсе -- имя стоит на вертикали колонки, которую называет. Ширины
          колонок при этом держит `TableCols`: они должны стоять до первой
          строки.
        */}
        <TableBlock title={t("counter.axes")} label={t("counter.axesLabel")}>
          <Table size="small" sx={flushTableSx}>
            <TableCols widths={[undefined, TIER_W, TIER_W]} />
            <TableHead>
              <TableRow>
                <HeadCell label={t("counter.axisCol")} help={t("counter.axesHint")} />
                <HeadCell label={t("counter.max")} help={t("counter.maxHint")} width={TIER_W} />
                <HeadCell label={t("counter.loss")} help={t("counter.lossHint")} width={TIER_W} />
              </TableRow>
            </TableHead>
            <TableBody>
              {COUNTER_AXES.map((axis) => {
                const tier = axes[axis];
                const on = tier !== undefined;
                const axisName = t(`counter.axis.${axis}`);

                return (
                  <TableRow key={axis}>
                    <TableCell sx={dataCellSx}>
                      {/*
                        `edge="start"` снимает собственное поле тумблера: его
                        дорожка встаёт на ту же вертикаль, что имена строк
                        выше, а не на 20px правее них.
                      */}
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", minWidth: 0 }}
                      >
                        <Switch
                          size="small"
                          edge="start"
                          checked={on}
                          onChange={(_, next) => patchAxis(axis, next ? {} : null)}
                          slotProps={{ input: { "aria-label": axisName } }}
                        />
                        <Box
                          component="span"
                          sx={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: on ? "text.primary" : "text.secondary",
                          }}
                        >
                          {axisName}
                        </Box>
                      </Stack>
                    </TableCell>
                    <DraftCell
                      value={on ? String(tier?.max ?? 0) : ""}
                      placeholder={on ? "0" : "—"}
                      width={TIER_W}
                      disabled={!on}
                      onChange={(raw) => patchAxis(axis, { max: whole(raw, 0) })}
                    />
                    <DraftCell
                      value={on ? String(tier?.loss ?? 0) : ""}
                      placeholder={on ? "1" : "—"}
                      width={TIER_W}
                      disabled={!on}
                      onChange={(raw) => {
                        const parsed = Number.parseFloat(raw.replace(",", "."));

                        patchAxis(axis, {
                          loss: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
                        });
                      }}
                    />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableBlock>
        {/*
          Свои источники ключей настраиваемых осей: «на эту куку заведён
          счётчик» видно прямо в объявлении. Пусто -- общая настройка
          источников (шестерёнка над таблицей).
        */}
        {(axes.sess !== undefined || axes.user !== undefined) && (
          <SettingsTable aside={false} name={COUNTER_NAME_W}>
            <SettingsGroup
              title={t("counter.ownSubjects")}
              hint={t("counter.ownSubjectsHint")}
            >
              {axes.sess !== undefined && (
                <Text
                  label={t("counter.ownSessCookie")}
                  helper={t("counter.ownSessCookieHint")}
                  placeholder={shared.subjects.sess.cookie}
                  value={sessCookie}
                  onChange={setSessCookie}
                />
              )}
              {axes.user !== undefined && (
                <UserFromField
                  t={t}
                  label={t("counter.ownUserFrom")}
                  helper={t("counter.ownUserFromHint")}
                  value={userFrom}
                  onChange={setUserFrom}
                />
              )}
            </SettingsGroup>
          </SettingsTable>
        )}
        {/*
          Почему «Сохранить» серая -- строкой в окне, а не догадкой оператора:
          ось без ёмкости и объявление без осей гасят кнопку одинаково молча.
        */}
        {(enabled.length === 0 || tierGaps.length > 0 || userSourceMissing) && (
          <Stack spacing={1} sx={{ pt: 1.5 }}>
            {enabled.length === 0 && (
              <DialogAlert tone="warning" text={t("counter.axesEmpty")} />
            )}
            {tierGaps.length > 0 && (
              <DialogAlert
                tone="warning"
                text={t("counter.axisTierMissing", {
                  axes: tierGaps.map((axis) => t(`counter.axis.${axis}`)).join(", "),
                })}
              />
            )}
            {userSourceMissing && (
              <DialogAlert tone="warning" text={t("counter.userSourceMissing")} />
            )}
          </Stack>
        )}
    </Modal>
  );
}

/**
 * Колонка имён в окнах счётчика.
 *
 * Шире страничной трети: имена здесь длиннее («Источник оси «Пользователь»»),
 * а значение рядом -- имя куки или выбор из списка, которому 42% окна хватает
 * с запасом. Одна доля у обоих окон: строки «Источников ключей» и строки
 * объявления стоят на одной вертикали.
 */
const COUNTER_NAME_W = "42%";

/** Колонка числа оси: ёмкость и потери одной ширины -- см. таблицу осей. */
const TIER_W = 110;

/** Кука клиренса капчи: ею ключуется ось sess, пока не названа другая. */
const SESS_COOKIE = "waf_cid";

/*
 * Источник ключа оси «пользователь». На проводе это одна строка «вид:имя», но
 * вводить её руками -- значит угадывать словарь: cookie и header ждут имени,
 * а session -- это не имя, а выбор из двух («логин» либо «сессия»). Поэтому
 * вид выбирается списком, а поле имени показывается только тем видам, у
 * которых имя есть.
 *
 * Пустая строка наружу означает «источника нет»: у общей секции это
 * выключенная ось, у объявления счётчика -- «взять общий». Недописанный
 * источник (вид выбран, имя пусто) наружу тоже уезжает пустым -- сохранять
 * "cookie:" незачем, а вид держится в состоянии окна, пока имя дописывают.
 */
const USER_FROM_KINDS = ["", "cookie", "header", "session:user", "session:sid"] as const;

type UserFromKind = (typeof USER_FROM_KINDS)[number];

function splitUserFrom(value: string): { kind: UserFromKind; name: string } {
  if (value === "session:user" || value === "session:sid") {
    return { kind: value, name: "" };
  }

  const i = value.indexOf(":");
  const kind = i < 0 ? "" : value.slice(0, i);

  return kind === "cookie" || kind === "header"
    ? { kind, name: value.slice(i + 1) }
    : { kind: "", name: "" };
}

function UserFromField({
  t,
  label,
  helper,
  placeholder,
  value,
  onChange,
}: {
  t: Translate;
  label: string;
  helper: string;
  /** Что стоит в общей секции: показывается видом «не задан» у объявления. */
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = splitUserFrom(value);

  const [kind, setKind] = useState<UserFromKind>(parsed.kind);
  const [name, setName] = useState(parsed.name);

  const emit = (nextKind: UserFromKind, nextName: string) => {
    if (nextKind === "cookie" || nextKind === "header") {
      onChange(nextName === "" ? "" : `${nextKind}:${nextName}`);

      return;
    }

    onChange(nextKind);
  };

  return (
    <>
      <Pick
        label={label}
        helper={helper}
        select
        value={kind}
        options={USER_FROM_KINDS.map((item) => ({
          value: item,
          label: t(`counter.userFromKinds.${item === "" ? "none" : item.replace(":", "_")}`),
        }))}
        onChange={(next) => {
          setKind(next);
          emit(next, name);
        }}
      />
      {(kind === "cookie" || kind === "header") && (
        <Text
          label={t("counter.userFromName")}
          helper={t("counter.userFromNameHint")}
          placeholder={placeholder}
          value={name}
          onChange={(next) => {
            setName(next);
            emit(kind, next);
          }}
        />
      )}
      {/*
        Личность приезжает не из запроса, а от соседа: без калитки на маршруте
        ось молчит, и узнать это по пустым корзинам через сутки -- худший из
        способов. Строка стоит рядом с выбором, а не в справке.

        Строкой таблицы (`SettingsNote`), а не коробкой: `gridColumn` остался
        от сетки, а в таблице такой `<div>` браузер уносил в безымянную ячейку
        колонки имён -- плашка вставала в треть ширины окна с дырой справа.
      */}
      {(kind === "session:user" || kind === "session:sid") && (
        <SettingsNote>
          <DialogAlert text={t("counter.identityHint")} />
        </SettingsNote>
      )}
    </>
  );
}

function SubjectsDialog({
  t,
  shared,
  onClose,
  onSave,
}: {
  t: Translate;
  shared: CounterSharedDoc;
  onClose: () => void;
  onSave: (next: CounterSharedDoc) => void;
}) {
  const [cookie, setCookie] = useState(shared.subjects.sess.cookie);
  const [from, setFrom] = useState(shared.subjects.user.from);

  const fromOk = from === "" || /^(cookie|header):.+$/.test(from);

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      title={t("counter.subjects")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!fromOk}
            onClick={() =>
              onSave({
                ...shared,
                subjects: {
                  sess: { cookie: cookie || SESS_COOKIE },
                  user: { from },
                },
              })
            }
          >
            {t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      {/*
        Имена длиннее страничных, а значение -- имя куки: в окне колонка имён
        берёт больше трети, иначе имя обрезается рядом с полупустым полем.
      */}
      <SettingsTable aside={false} name={COUNTER_NAME_W}>
        <Text
          label={t("counter.sessCookie")}
          helper={t("counter.sessCookieHint")}
          placeholder={SESS_COOKIE}
          value={cookie}
          onChange={setCookie}
        />
        <UserFromField
          t={t}
          label={t("counter.userFrom")}
          helper={t("counter.userFromHint")}
          placeholder="uid"
          value={from}
          onChange={setFrom}
        />
      </SettingsTable>
    </Modal>
  );
}

/* --- карточка профиля -------------------------------------------------------- */

function CounterProfileForm({
  scope,
  id,
  onClose,
}: {
  scope: string;
  id: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const detail = useAppSelector((s) => s.pages.counter.detail);
  const shared = useAppSelector((s) => s.pages.counter.shared);
  const denyResponses = useAppSelector((s) => s.pages.counter.denyResponses);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [doc, setDoc] = useState<CounterProfileDoc>(emptyDoc);

  const [actionsReg, setActionsReg] = useState<ActionRegistry | null>(null);
  const [inspectors, setInspectors] = useState<InspectorMeta[]>([]);
  const [datasetNames, setDatasetNames] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;

    fetchActions()
      .then((reg) => {
        if (alive) {
          setActionsReg(reg);
        }
      })
      .catch(() => {
        /* Пустой словарь -- осмысленное состояние, ронять страницу незачем. */
      });

    fetchInspectors(scope)
      .then((rows) => {
        if (alive) {
          setInspectors(rows);
        }
      })
      .catch(() => {
        /* Селектор «кому» без соседей -- страница живёт. */
      });

    fetchDatasets(scope)
      .then((rows) => {
        if (alive) {
          setDatasetNames(
            rows.filter((row) => row.kind === "list" && row.active).map((row) => row.name),
          );
        }
      })
      .catch(() => {
        /* Пустой список наборов -- селектор пуст, страница живёт. */
      });

    return () => {
      alive = false;
    };
  }, [scope]);

  const unknownSenders =
    id !== null && detail !== null && detail.uuid === id
      ? (detail.unknown_senders ?? [])
      : [];

  const senderCodes =
    id !== null && detail !== null && detail.uuid === id
      ? (detail.sender_codes ?? [])
      : [];

  useEffect(() => {
    if (id === null || detail === null || detail.uuid !== id) {
      return;
    }

    setName(detail.name);
    setDescription(detail.description);
    setDoc(withFrame(detail.doc));
  }, [id, detail]);

  const patch = (part: Partial<CounterProfileDoc>) =>
    setDoc((prev) => ({ ...prev, ...part }));

  const patchRequest = (part: Partial<CounterProfileDoc["request"]>) =>
    setDoc((prev) => ({ ...prev, request: { ...prev.request, ...part } }));

  const patchResponse = (part: Partial<CounterProfileDoc["response"]>) =>
    setDoc((prev) => ({ ...prev, response: { ...prev.response, ...part } }));

  const patchFrame = (part: Partial<CounterProfileDoc["frame"]>) =>
    setDoc((prev) => ({ ...prev, frame: { ...(prev.frame ?? emptyFrame()), ...part } }));

  const frame = doc.frame ?? emptyFrame();

  const nameOk = NAME_RE.test(name);

  const denyOptions = useMemo(
    () => denyResponses.map((row) => ({ value: row.name, label: row.name })),
    [denyResponses],
  );

  const canSave =
    nameOk && (doc.request.enabled || doc.response.enabled || frame.enabled);

  const save = () => {
    void dispatch(saveCounterProfileThunk({ scope, id, name, description, doc }));
  };

  /*
   * У default заперты имя и удаление, содержимое -- нет: объявление без
   * profile= читает именно его, и править его -- обычный ход, а не повод
   * заводить копию. Полоса над телом говорит, что профиль разошёлся с
   * поставкой, кнопка рядом возвращает его назад.
   *
   * Признак берётся из карточки, а не из поля имени: имя правится в форме, и
   * полоса моргала бы на каждую набранную букву.
   */
  const loaded = id !== null && detail !== null && detail.uuid === id ? detail : null;
  const isDefault = loaded?.name === "default";
  const banner =
    loaded?.modified === true ? t("profiles.defaultModified") : undefined;
  const restore =
    id === null
      ? undefined
      : () => {
          void dispatch(restoreCounterProfileThunk({ scope, id }));
        };

  return (
    <Form id="counter-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("counter.newTitle") : t("counter.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body
        spacing={2}
        scroll
        banner={banner}
        bannerActionLabel={t("common.restore")}
        onBannerAction={restore}
      >
        <Section title={t("counter.sectionProfile")} hint={t("counter.sectionProfileHint")} flush defaultExpanded>
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("counter.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text label={t("counter.description")} value={description} onChange={setDescription} />
          </SettingsTable>
        </Section>

        <Section title={t("channel.signals")} hint={t("counter.priorHint")} flush>
          <SignalsBlock
            embedded
            hint={t("counter.priorHint")}
            rules={doc.trigger.prior.map((row) => ({ ...row, accept: [...row.accept] }))}
            verbs={verbsFor(actionsReg, "counter").map((verb) => ({
              value: verb,
              label: verbLabel(t, verb),
            }))}
            weakening={weakeningVerbs(actionsReg)}
            codes={senderCodes}
            unknown={unknownSenders}
            senders={inspectors}
            /*
             * Оси считаются по глаголам строки, как велит загрузчик: threshold
             * и skip -- про этот запрос, note -- про субъекта. request у note
             * корзины не имеет, и предлагать мёртвую пару нельзя.
             */
            axes={(accept) => {
              const out: FilterOption<string>[] = [];

              if (accept.includes("threshold") || accept.includes("skip")) {
                out.push({ value: "request", label: axisLabel(t, "request") });
              }

              if (accept.includes("note")) {
                for (const axis of ["ip", "asn", "session"]) {
                  out.push({ value: axis, label: axisLabel(t, axis) });
                }
              }

              return out;
            }}
            /* Адресат note -- корзина fill: note: имя по проводу не ездит. */
            targets={Object.keys(shared?.counters ?? {})
              .filter((name) => shared?.counters[name]?.fill === "note")
              .sort()
              .map((name) => ({ value: name, label: name }))}
            defaultRule={() => ({
              from: "ip",
              accept: ["skip"],
              apply: [],
              codes: [],
              counter: "",
            })}
            onChange={(prior) =>
              patch({
                trigger: {
                  prior: prior.map((row) => ({
                    ...row,
                    accept: row.accept as CounterPriorRule["accept"],
                    apply: row.apply ?? [],
                    counter: row.counter ?? "",
                  })),
                },
              })
            }
          />
        </Section>

        {/*
          Три фазы -- одной секцией: где счётчик работает и какими страницами
          отказывает. Учёт, суд и инициаторы ниже лежат каждый одной таблицей
          со строкой «Где»: документ по-прежнему хранит секции по фазам, а
          раскладывает и собирает их форма.
        */}
        <Section title={t("counter.sectionPhases")} hint={t("counter.sectionPhasesHint")} flush defaultExpanded>
          <SettingsTable aside={false}>
            <Flag
              label={t("counter.phaseRequest")}
              helper={t("counter.judgeEnabledHint")}
              checked={doc.request.enabled}
              onChange={(value) => patchRequest({ enabled: value })}
            />
            <Flag
              label={t("counter.phaseResponse")}
              helper={t("counter.measureEnabledHint")}
              checked={doc.response.enabled}
              onChange={(value) => patchResponse({ enabled: value })}
            />
            <Flag
              label={t("counter.phaseFrame")}
              helper={t("counter.frameEnabledHint")}
              checked={frame.enabled}
              onChange={(value) => patchFrame({ enabled: value })}
            />
            <Pick
              select
              label={t("counter.denyResponse")}
              helper={t("counter.denyResponseHint")}
              value={doc.request.denyResponse}
              options={denyOptions}
              onChange={(value) => patchRequest({ denyResponse: value })}
            />
            <Pick
              select
              label={t("counter.frameDenyResponse")}
              helper={t("counter.frameDenyResponseHint")}
              value={frame.denyResponse}
              options={denyOptions}
              onChange={(value) => patchFrame({ denyResponse: value })}
            />
          </SettingsTable>
        </Section>

        <Section title={t("counter.sectionMeasure")} hint={t("counter.sectionMeasureHint")} flush defaultExpanded>
          <MeasureTable
            t={t}
            rows={[
              ...doc.response.measure.map((rule) => ({ ...rule, phase: "response" as const })),
              ...frame.measure.map((rule) => ({ ...rule, phase: "frame" as const })),
            ]}
            shared={shared}
            enabled={{ response: doc.response.enabled, frame: frame.enabled }}
            onChange={(rows) => {
              patchResponse({
                measure: rows.filter((row) => row.phase === "response").map(stripPhase),
              });
              patchFrame({
                measure: rows.filter((row) => row.phase === "frame").map(stripPhase),
              });
            }}
          />
        </Section>

        <Section title={t("counter.sectionJudge")} hint={t("counter.sectionJudgeHint")} flush defaultExpanded>
          <JudgeTable
            t={t}
            rows={[
              ...doc.request.judge.map((rule) => ({ ...rule, phase: "request" as const })),
              ...frame.judge.map((rule) => ({ ...rule, phase: "frame" as const })),
            ]}
            shared={shared}
            enabled={{ request: doc.request.enabled, frame: frame.enabled }}
            onChange={(rows) => {
              patchRequest({
                judge: rows.filter((row) => row.phase === "request").map(stripPhase),
              });
              patchFrame({ judge: rows.filter((row) => row.phase === "frame").map(stripPhase) });
            }}
          />
          <OutcomesBlock
            hint={t("counter.outcomesHint")}
            outcomes={[
              ...doc.request.outcomes.map((row) => ({ ...row, section: "request" })),
              ...frame.outcomes.map((row) => ({ ...row, section: "frame" })),
            ]}
            datasets={datasetNames}
            inspectors={inspectors}
            registry={actionsReg}
            ons={["deny", "allow", "score", "overload"]}
            phases={[
              { value: "request", label: t("counter.phaseRequest") },
              { value: "frame", label: t("counter.phaseFrame") },
            ]}
            /*
             * Свои корзины: по ним строка умеет срабатывать на уровне, а не на
             * вердикте. Вердикт у фазы один, корзин много — иначе не отличить,
             * какая перелилась. Ось conn диалог прячет у строк запроса сам.
             */
            buckets={Object.keys(shared?.counters ?? {})
              .sort()
              .map((name) => ({
                counter: name,
                axes: COUNTER_AXES.filter(
                  (axis) => shared?.counters[name]?.axes[axis] !== undefined,
                ),
              }))}
            onChange={(outcomes) => {
              patchRequest({
                outcomes: outcomes.filter((row) => row.section !== "frame").map(stripSection),
              });
              patchFrame({
                outcomes: outcomes.filter((row) => row.section === "frame").map(stripSection),
              });
            }}
          />
        </Section>
      </Form.Body>
      <Form.Actions>
        {id !== null && !isDefault && (
          <Button
            color="error"
            onClick={() => void dispatch(removeCounterProfile({ scope, id }))}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!canSave} onClick={save}>
          {t("common.save")}
        </Button>
      </Form.Actions>
    </Form>
  );
}

/* --- суд: лестница уровней -------------------------------------------------- */

/*
 * Строка -- не правило, а ПАРА «счётчик + ось»: у одного счётчика уровней
 * обычно несколько (45% -- счёт, 90% -- отказ), и плоским списком они читались
 * повторами одного и того же имени. Что именно происходит на каждом уровне,
 * видно сводкой; правят её окном по шестерёнке -- там лестница стоит столбцом,
 * в том порядке, в каком её проходит субъект.
 *
 * На проводе и в документе профиля правила остаются плоским списком: группа --
 * способ их показать, а не новая сущность. Порядок внутри пары значения не
 * имеет (побеждает строже), поэтому собрать список обратно можно как угодно --
 * важно лишь не потерять правила чужих пар.
 */

/*
 * Фазы одной таблицы. Документ по-прежнему хранит секции request / response /
 * frame (так его читает инспектор), а форма показывает учёт, суд и инициаторы
 * одной таблицей каждый -- со строкой «Где». Раскладка по секциям и обратно --
 * дело формы: измерять умеют ответ и кадры, судить и просить -- запрос и
 * кадры.
 */
type MeasurePhase = "response" | "frame";
type JudgePhase = "request" | "frame";

type MeasureRow = CounterMeasureRule & { phase: MeasurePhase };
type JudgeRow = CounterJudgeRule & { phase: JudgePhase };

/** Снять пометку фазы: в секцию документа строка едет без неё. */
/*
 * Инициаторы носят секцию в `section`, а не в `phase`: у просьбы `phase` --
 * фаза вызова адресата, и она едет в документ как есть.
 */
function stripSection<T extends { section?: string }>(row: T): Omit<T, "section"> {
  const { section: _section, ...rest } = row;

  return rest;
}

function stripPhase<T extends { phase?: string }>(row: T): Omit<T, "phase"> {
  const { phase: _phase, ...rest } = row;
  return rest;
}

/*
 * Перенос правила учёта между фазами: у ответа селекторы -- код, тип и метод,
 * у кадра -- сторона и опкод, а ось conn есть только у кадра. Чужие селекторы
 * загрузчик отверг бы, поэтому они снимаются при переезде.
 */
function movedMeasure(row: MeasureRow, phase: MeasurePhase): MeasureRow {
  if (phase === row.phase) {
    return row;
  }

  return {
    ...row,
    phase,
    if:
      phase === "frame"
        ? { ...row.if, status: [], contentType: [], methods: [] }
        : { ...row.if, direction: [], opcode: [] },
    axes: phase === "frame" ? row.axes : row.axes.filter((axis) => axis !== "conn"),
  };
}

type JudgeGroup = {
  phase: JudgePhase;
  counter: string;
  axis: CounterAxis;
  levels: CounterJudgeRule[];
};

const judgeKey = (phase: string, counter: string, axis: string) =>
  `${phase}\u0000${counter}\u0000${axis}`;

/** Пары в порядке первого появления: список правил оператор писал сам. */
function groupJudge(rows: JudgeRow[]): JudgeGroup[] {
  const out: JudgeGroup[] = [];
  const at = new Map<string, number>();

  for (const row of rows) {
    const key = judgeKey(row.phase, row.counter, row.axis);
    const index = at.get(key);

    if (index === undefined) {
      at.set(key, out.length);
      out.push({
        phase: row.phase,
        counter: row.counter,
        axis: row.axis,
        levels: [stripPhase(row)],
      });
      continue;
    }

    out[index]?.levels.push(stripPhase(row));
  }

  return out;
}

/** Лестница обратно в плоский список: порядок пар сохраняется. */
function flattenJudge(groups: JudgeGroup[]): JudgeRow[] {
  return groups.flatMap((group) =>
    [...group.levels]
      .sort((a, b) => a.at - b.at)
      .map((level) => ({
        ...level,
        phase: group.phase,
        counter: group.counter,
        axis: group.axis,
      })),
  );
}

/**
 * Лестница строкой: «45% → счёт 40 · 90% → отказ». Пороги по возрастанию --
 * так их проходит субъект, и так их читают.
 */
function judgeSummary(t: Translate, group: JudgeGroup): string {
  if (group.levels.length === 0) {
    return "—";
  }

  return [...group.levels]
    .sort((a, b) => a.at - b.at)
    .map((level) =>
      level.action === "deny"
        ? `${level.at}% → ${t("counter.actions.deny")}`
        : `${level.at}% → ${t("counter.actions.score")} ${level.score}`,
    )
    .join(" · ");
}

function JudgeTable({
  t,
  rows,
  shared,
  disabled = false,
  enabled,
  onChange,
}: {
  t: Translate;
  /** Правила обеих фаз суда одной таблицей: строка носит свою фазу. */
  rows: JudgeRow[];
  shared: CounterSharedDoc | null;
  disabled?: boolean;
  /** Какие фазы включены: строка выключенной фазы показывается, но заперта. */
  enabled: Record<JudgePhase, boolean>;
  onChange: (next: JudgeRow[]) => void;
}) {
  /* `{ index: null }` -- новая пара: строку заводит окно, а не «+». */
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);

  const counters = Object.keys(shared?.counters ?? {}).sort();
  const groups = groupJudge(rows);

  const patch = (index: number, next: JudgeGroup) =>
    onChange(flattenJudge(groups.map((row, i) => (i === index ? next : row))));

  /* Отправка окна: новая пара встаёт в конец, правка -- на своё место. */
  const apply = (next: JudgeGroup) => {
    if (editing === null) {
      return;
    }

    onChange(
      flattenJudge(
        editing.index === null
          ? [...groups, next]
          : groups.map((row, i) => (i === editing.index ? next : row)),
      ),
    );
    setEditing(null);
  };

  const axisLabel = (axis: CounterAxis) => t(`counter.axis.${axis}`);

  const phaseOptions: FilterOption<JudgePhase>[] = [
    { value: "request", label: t("counter.phaseRequest") },
    { value: "frame", label: t("counter.phaseFrame") },
  ];

  /* Новая пара -- на включённую фазу: запрос, а без него кадры. */
  const newPhase: JudgePhase = enabled.request || !enabled.frame ? "request" : "frame";

  /* Первая ось счётчика: объявлять пару по оси, которой у него нет, нельзя. */
  const firstAxis = (counter: string): CounterAxis =>
    COUNTER_AXES.find(
      (axis) => shared?.counters[counter]?.axes[axis] !== undefined,
    ) ?? "ip";

  /* Заготовка пары для окна: первый счётчик и одна ступень -- их и правят. */
  const blankJudge = (): JudgeGroup => {
    const counter = counters[0] ?? "";
    const axis = firstAxis(counter);

    return {
      phase: newPhase,
      counter,
      axis,
      levels: [{ counter, axis, at: 60, action: "score", score: 40, code: "" }],
    };
  };

  return (
    <>
      <TableBlock title={t("counter.judge")} label={t("counter.judgeHint")}>
        <Table size="small" sx={flushTableSx}>
          <TableHead>
            <TableRow>
              <HeadCell label={t("counter.where")} help={t("counter.whereHint")} width={110} />
              <HeadCell label={t("counter.counter")} width={170} />
              <HeadCell label={t("counter.axisCol")} width={130} />
              <HeadCell label={t("counter.judgeStair")} help={t("counter.judgeStairHint")} />
              <TableCell align="right" sx={{ width: 76 }}>
                <TableIconButton
                  color="success"
                  icon={<AddIcon />}
                  tooltip={t("common.add")}
                  disabled={disabled || counters.length === 0}
                  onClick={() => setEditing({ index: null })}
                />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.length === 0 && (
              <TableNoticeRow colSpan={5} kind="empty" message={t("counter.judgeEmpty")} />
            )}
            {groups.map((group, index) => (
              <TableRow
                key={judgeKey(group.phase, group.counter, group.axis)}
                sx={enabled[group.phase] ? undefined : { opacity: 0.55 }}
              >
                <FilterSelect
                  value={group.phase}
                  width={110}
                  options={phaseOptions}
                  disabled={disabled}
                  unset={group.phase}
                  onChange={(phase) =>
                    patch(index, {
                      ...group,
                      phase,
                      // Ось conn есть только у кадров: пара запроса на ней молчала бы.
                      axis:
                        phase === "request" && group.axis === "conn"
                          ? firstAxis(group.counter)
                          : group.axis,
                    })
                  }
                />
                <TableCell sx={{ fontSize: "0.8rem", fontFamily: "monospace" }}>
                  {group.counter}
                </TableCell>
                <TableCell sx={{ fontSize: "0.8rem" }}>{axisLabel(group.axis)}</TableCell>
                <TableCell sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
                  {judgeSummary(t, group)}
                </TableCell>
                <TableCell align="right">
                  <TableIconButton
                    icon={<SettingsIcon sx={{ fontSize: 16 }} />}
                    tooltip={t("counter.judgeDialog")}
                    disabled={disabled}
                    onClick={() => setEditing({ index })}
                  />
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon />}
                    tooltip={t("common.delete")}
                    disabled={disabled}
                    onClick={() =>
                      onChange(flattenJudge(groups.filter((_row, i) => i !== index)))
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableBlock>
      {editing !== null && (
        <JudgeDialog
          t={t}
          group={editing.index === null ? null : (groups[editing.index] ?? null)}
          blank={blankJudge()}
          shared={shared}
          onClose={() => setEditing(null)}
          onSave={apply}
        />
      )}
    </>
  );
}

/*
 * Окно пары: чей счёт, по какой оси и лестница уровней столбцом. Счётчик и ось
 * стоят над лестницей, а не в её строках, -- они у всех уровней общие, и в
 * строках повторялись бы столько раз, сколько уровней.
 */
function JudgeDialog({
  t,
  group,
  blank,
  shared,
  onClose,
  onSave,
}: {
  t: Translate;
  /** `null` -- новая пара: в таблице её ещё нет, заводит её «Добавить». */
  group: JudgeGroup | null;
  blank: JudgeGroup;
  shared: CounterSharedDoc | null;
  onClose: () => void;
  onSave: (next: JudgeGroup) => void;
}) {
  const fresh = group === null;
  const [draft, setDraft] = useState<JudgeGroup>(group ?? blank);

  const counters = Object.keys(shared?.counters ?? {}).sort();
  const counterOptions = counters.map((name) => ({ value: name, label: name }));

  // Ось conn есть только у кадров: паре запроса она не предлагается.
  const declared = COUNTER_AXES.filter(
    (axis) =>
      shared?.counters[draft.counter]?.axes[axis] !== undefined &&
      (draft.phase === "frame" || axis !== "conn"),
  );

  const axisOptions = (declared.length > 0 ? declared : [draft.axis]).map((axis) => ({
    value: axis,
    label: t(`counter.axis.${axis}`),
  }));

  const level = (index: number, part: Partial<CounterJudgeRule>) =>
    setDraft((prev) => ({
      ...prev,
      levels: prev.levels.map((row, i) => (i === index ? { ...row, ...part } : row)),
    }));

  const actionOptions: FilterOption<CounterJudgeRule["action"]>[] = [
    { value: "score", label: t("counter.actions.score") },
    { value: "deny", label: t("counter.actions.deny") },
  ];

  /* Пара без уровней -- это отсутствие правила: сохранять её незачем. */
  const canSave = draft.levels.length > 0;

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      title={fresh ? t("counter.judgeNewDialog") : t("counter.judgeDialog")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!canSave} onClick={() => onSave(draft)}>
            {fresh ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <SettingsTable aside={false}>
        <Pick
          select
          label={t("counter.where")}
          helper={t("counter.whereJudgeHint")}
          value={draft.phase}
          options={[
            { value: "request", label: t("counter.phaseRequest") },
            { value: "frame", label: t("counter.phaseFrame") },
          ]}
          onChange={(phase) =>
            setDraft((prev) => ({
              ...prev,
              phase: phase === "frame" ? "frame" : "request",
              axis:
                phase !== "frame" && prev.axis === "conn"
                  ? (COUNTER_AXES.find(
                      (axis) =>
                        axis !== "conn" && shared?.counters[prev.counter]?.axes[axis] !== undefined,
                    ) ?? prev.axis)
                  : prev.axis,
            }))
          }
        />
        <Pick
          select
          label={t("counter.counter")}
          helper={t("counter.judgeCounterHint")}
          value={draft.counter}
          options={counterOptions.length > 0 ? counterOptions : [
            { value: draft.counter, label: draft.counter },
          ]}
          onChange={(counter) =>
            setDraft((prev) => {
              /*
               * У нового счётчика может не быть прежней оси: тогда лестница
               * переезжает на первую объявленную, иначе правило ссылалось бы
               * на ось, которой нет, и инспектор отверг бы весь профиль.
               */
              const axes = COUNTER_AXES.filter(
                (axis) => shared?.counters[counter]?.axes[axis] !== undefined,
              );
              const axis = axes.includes(prev.axis) ? prev.axis : axes[0] ?? prev.axis;

              return { ...prev, counter, axis };
            })
          }
        />
        <Pick
          select
          label={t("counter.axisCol")}
          helper={t("counter.judgeAxisHint")}
          value={draft.axis}
          options={axisOptions}
          onChange={(axis) => setDraft((prev) => ({ ...prev, axis: axis as CounterAxis }))}
        />
      </SettingsTable>
      <TableBlock title={t("counter.judgeLevels")} label={t("counter.judgeLevelsHint")} last>
        <Table size="small" sx={flushTableSx}>
          <TableHead>
            <TableRow>
              <HeadCell label={t("counter.at")} help={t("counter.atHint")} width={90} />
              {/* Остаток окна забирает колонка действия: повод стоит в CODE_W, как везде. */}
              <HeadCell label={t("counter.action")} />
              <HeadCell label={t("counter.score")} help={t("counter.scoreHint")} width={90} />
              <HeadCell label={t("counter.code")} help={t("counter.codeHint")} width={CODE_W} />
              <TableCell align="right" sx={{ width: 44 }}>
                <TableIconButton
                  color="success"
                  icon={<AddIcon />}
                  tooltip={t("common.add")}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      levels: [
                        ...prev.levels,
                        {
                          counter: prev.counter,
                          axis: prev.axis,
                          at: 90,
                          action: "deny",
                          score: 0,
                          code: "",
                        },
                      ],
                    }))
                  }
                />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {draft.levels.length === 0 && (
              <TableNoticeRow colSpan={5} kind="empty" message={t("counter.judgeLevelsEmpty")} />
            )}
            {draft.levels.map((row, index) => (
              <TableRow key={index}>
                <DraftCell
                  value={String(row.at)}
                  placeholder="60"
                  width={90}
                  onChange={(raw) => {
                    const parsed = Number.parseFloat(raw.replace(",", "."));

                    level(index, {
                      at: Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : 0,
                    });
                  }}
                />
                <FilterSelect
                  value={row.action}
                  options={actionOptions}
                  unset={row.action}
                  onChange={(action) =>
                    level(index, {
                      action,
                      // Счёт значим только у score: контроллер отвергнет число у deny.
                      score: action === "deny" ? 0 : row.score === 0 ? 40 : row.score,
                    })
                  }
                />
                <DraftCell
                  value={row.action === "score" ? String(row.score) : ""}
                  placeholder={row.action === "score" ? "40" : "—"}
                  width={90}
                  disabled={row.action !== "score"}
                  onChange={(raw) => level(index, { score: Math.min(whole(raw, 40), 100) })}
                />
                <DraftCell
                  value={row.code}
                  placeholder="COUNTER_LEVEL"
                  mono
                  width={CODE_W}
                  onChange={(code) => level(index, { code: code.toUpperCase() })}
                />
                <TableCell align="right">
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon />}
                    tooltip={t("common.delete")}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        levels: prev.levels.filter((_row, i) => i !== index),
                      }))
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableBlock>
    </Modal>
  );
}

/* --- учёт: правила фазы ответа ---------------------------------------------- */

/*
 * Строка -- правило: какой ответ, чем измерить и в какой счётчик. Главное
 * читается в строке (счётчик, источник, выражение), предикат ответа и
 * множитель -- в диалоге по шестерёнке: их задают один раз.
 */
function MeasureTable({
  t,
  rows,
  shared,
  disabled = false,
  enabled,
  onChange,
}: {
  t: Translate;
  /** Правила обеих фаз учёта одной таблицей: строка носит свою фазу. */
  rows: MeasureRow[];
  shared: CounterSharedDoc | null;
  disabled?: boolean;
  /** Какие фазы включены: строка выключенной фазы показывается, но заперта. */
  enabled: Record<MeasurePhase, boolean>;
  onChange: (next: MeasureRow[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  /* Мерить можно только свои корзины: fill: note наполняют соседи, и правило
     measure в неё контроллер отвергнет как второго владельца. */
  const counters = Object.keys(shared?.counters ?? {})
    .filter((name) => shared?.counters[name]?.fill !== "note")
    .sort();
  const counterOptions: FilterOption<string>[] = counters.map((name) => ({
    value: name,
    label: name,
  }));

  const sourceOptions: FilterOption<CounterMeasureRule["source"]>[] = [
    { value: "const", label: t("counter.sources.const") },
    { value: "regex_count", label: t("counter.sources.regex_count") },
    { value: "size_kb", label: t("counter.sources.size_kb") },
    { value: "bytes", label: t("counter.sources.bytes") },
  ];

  const patch = (index: number, part: Partial<MeasureRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...part } : row)));

  const phaseOptions: FilterOption<MeasurePhase>[] = [
    { value: "response", label: t("counter.phaseResponse") },
    { value: "frame", label: t("counter.phaseFrame") },
  ];

  /* Новое правило -- на включённую фазу: ответ, а без него кадры. */
  const newPhase: MeasurePhase = enabled.response || !enabled.frame ? "response" : "frame";

  const condSummary = (rule: MeasureRow): string => {
    const parts: string[] = [];

    if (rule.phase === "frame") {
      if (rule.if.direction.length > 0) {
        parts.push(rule.if.direction.map((d) => t(`counter.directions.${d}`)).join(", "));
      }

      if (rule.if.opcode.length > 0) {
        parts.push(rule.if.opcode.map((op) => t(`counter.opcodes.${op}`)).join(", "));
      }

      if (rule.per !== null && rule.per !== 1) {
        parts.push(`×${rule.per}`);
      }

      return parts.length === 0 ? t("counter.anyFrame") : parts.join(" · ");
    }

    if (rule.if.status.length > 0) {
      parts.push(rule.if.status.join(", "));
    }

    if (rule.if.contentType.length > 0) {
      parts.push(rule.if.contentType.join(", "));
    }

    if (rule.if.methods.length > 0) {
      parts.push(rule.if.methods.join(", "));
    }

    if (rule.per !== null && rule.per !== 1) {
      parts.push(`×${rule.per}`);
    }

    return parts.length === 0 ? t("counter.anyResponse") : parts.join(" · ");
  };

  return (
    <TableBlock title={t("counter.measure")} label={t("counter.measureHint")} last>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("counter.where")} help={t("counter.whereHint")} width={110} />
            <HeadCell label={t("counter.counter")} width={170} />
            <HeadCell label={t("counter.source")} width={170} />
            <HeadCell label={t("counter.regex")} help={t("counter.regexHint")} />
            <HeadCell label={t("counter.cond")} help={t("counter.condHint")} width={180} />
            <TableCell align="right" sx={{ width: 44 }}>
              <TableIconButton
                color="success"
                icon={<AddIcon />}
                tooltip={t("common.add")}
                disabled={disabled || counters.length === 0}
                onClick={() =>
                  onChange([...rows, { ...measureRule(counters[0] ?? ""), phase: newPhase }])
                }
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={6} kind="empty" message={t("counter.measureEmpty")} />
          )}
          {rows.map((row, index) => (
            <TableRow key={index} sx={enabled[row.phase] ? undefined : { opacity: 0.55 }}>
              <FilterSelect
                value={row.phase}
                width={110}
                options={phaseOptions}
                disabled={disabled}
                unset={row.phase}
                onChange={(phase) => patch(index, movedMeasure(row, phase))}
              />
              <FilterSelect
                value={row.counter}
                width={170}
                options={counterOptions}
                disabled={disabled}
                unset={row.counter}
                onChange={(counter) => patch(index, { counter, axes: [] })}
              />
              <FilterSelect
                value={row.source}
                width={170}
                options={sourceOptions}
                disabled={disabled}
                unset={row.source}
                onChange={(source) =>
                  patch(index, { source, regex: source === "regex_count" ? row.regex : "" })
                }
              />
              <LongTextCell
                value={row.regex}
                placeholder={row.source === "regex_count" ? '"id"\\s*:' : "—"}
                disabled={disabled || row.source !== "regex_count"}
                title={t("counter.regex")}
                hint={t("counter.regexHint")}
                onChange={(regex) => patch(index, { regex })}
              />
              <TableCell
                onClick={() => !disabled && setEditing(index)}
                sx={{ cursor: disabled ? "default" : "pointer" }}
              >
                <Typography variant="caption" color="text.secondary">
                  {condSummary(row)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <TableIconButton
                  icon={<DeleteIcon />}
                  tooltip={t("common.delete")}
                  onClick={() => onChange(rows.filter((_row, i) => i !== index))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing !== null && rows[editing] !== undefined && (
        <MeasureDialog
          t={t}
          rule={rows[editing]}
          shared={shared}
          onClose={() => setEditing(null)}
          onSave={(rule) => {
            patch(editing, rule);
            setEditing(null);
          }}
        />
      )}
    </TableBlock>
  );
}

/*
 * Подстановки условия: ходовые коды и глаголы. Остальное набирают руками --
 * поле свободное, парсер лишь отсекает то, что не бывает на проводе.
 */
const STATUS_PRESETS = [
  "200", "201", "204", "206", "302", "400",
  "401", "403", "404", "429", "500", "503",
];
const METHOD_PRESETS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Код ответа -- целое от 100 до 599; «2xx» и прочие маски провод не знает. */
function parseStatus(raw: string): string | undefined {
  return /^[1-5]\d\d$/.test(raw) ? raw : undefined;
}

/** Метод -- HTTP-токен; хранится в верхнем регистре, как сравнивает модуль. */
function parseMethod(raw: string): string | undefined {
  const upper = raw.toUpperCase();
  return /^[A-Z][A-Z0-9_-]*$/.test(upper) ? upper : undefined;
}

/*
 * Предикат и вторичные настройки правила: их задают один раз, и в строке они
 * съели бы место у того, что читают глазами.
 */
function MeasureDialog({
  t,
  rule,
  shared,
  onClose,
  onSave,
}: {
  t: Translate;
  rule: MeasureRow;
  shared: CounterSharedDoc | null;
  onClose: () => void;
  onSave: (rule: MeasureRow) => void;
}) {
  const [draft, setDraft] = useState<MeasureRow>(rule);
  /* Правила фазы кадров: селекторы -- сторона и опкод, а не код и тип. */
  const frame = draft.phase === "frame";

  // Ось conn есть только у кадров.
  const declared = COUNTER_AXES.filter(
    (axis) =>
      shared?.counters[draft.counter]?.axes[axis] !== undefined && (frame || axis !== "conn"),
  );

  const cond = (part: Partial<CounterMeasureRule["if"]>) =>
    setDraft((prev) => ({ ...prev, if: { ...prev.if, ...part } }));

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      size="md"
      title={t("counter.measureDialog")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onSave(draft)}>
            {t("common.save")}
          </Modal.Submit>
        </>
      }
    >
        <SettingsTable aside={false}>
          <Pick
            select
            label={t("counter.where")}
            helper={t("counter.whereMeasureHint")}
            value={draft.phase}
            options={[
              { value: "response", label: t("counter.phaseResponse") },
              { value: "frame", label: t("counter.phaseFrame") },
            ]}
            onChange={(phase) =>
              setDraft((prev) => movedMeasure(prev, phase === "frame" ? "frame" : "response"))
            }
          />
          {frame ? (
            <>
              <Chips
                t={t}
                label={t("counter.condDirection")}
                helper={t("counter.condDirectionHint")}
                value={draft.if.direction}
                options={[...COUNTER_DIRECTIONS]}
                onChange={(value) => cond({ direction: value ?? [] })}
              />
              <Chips
                t={t}
                label={t("counter.condOpcode")}
                helper={t("counter.condOpcodeHint")}
                value={draft.if.opcode}
                options={[...COUNTER_OPCODES]}
                onChange={(value) => cond({ opcode: value ?? [] })}
              />
            </>
          ) : (
            <>
              <Chips
                t={t}
                freeSolo
                label={t("counter.condStatus")}
                helper={t("counter.condStatusHint")}
                value={draft.if.status.map(String)}
                options={STATUS_PRESETS}
                parse={parseStatus}
                onChange={(value) => cond({ status: (value ?? []).map(Number) })}
              />
              <Chips
                t={t}
                freeSolo
                label={t("counter.condTypes")}
                helper={t("counter.condTypesHint")}
                value={draft.if.contentType}
                onChange={(value) => cond({ contentType: value ?? [] })}
              />
              <Chips
                t={t}
                freeSolo
                label={t("counter.condMethods")}
                helper={t("counter.condMethodsHint")}
                value={draft.if.methods}
                options={METHOD_PRESETS}
                parse={parseMethod}
                onChange={(value) => cond({ methods: value ?? [] })}
              />
            </>
          )}
          <Num
            label={t("counter.per")}
            helper={t("counter.perHint")}
            value={draft.per === null ? "" : String(draft.per)}
            onChange={(raw) => {
              const parsed = Number.parseFloat(raw.replace(",", "."));

              setDraft((prev) => ({
                ...prev,
                per: raw.trim() === "" || !Number.isFinite(parsed) ? null : parsed,
              }));
            }}
          />
          <Chips
            t={t}
            label={t("counter.measureAxes")}
            helper={t("counter.measureAxesHint")}
            value={draft.axes}
            options={declared}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, axes: (value ?? []) as CounterAxis[] }))
            }
          />
        </SettingsTable>
    </Modal>
  );
}
