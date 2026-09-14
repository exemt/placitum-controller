/**
 * Профили инспектора куки: выдать куку, снять куку и рассказать об этом
 * соседям каналом действий.
 *
 * Страница снята с профилей действий и устроена так же, но у неё есть первая
 * секция, которой там нет, -- «Куки». Это объявления: что за кука, на какой
 * срок, чем заполняется её значение и чем подписывается. Правило на них
 * ссылается по имени, и без объявления правило не сохранится.
 *
 * Строка секции «Правила» -- одно правило: «когда» (условие профиля, фаза,
 * состояние куки на входе), «что сделать с кукой» (выдать, снять, ничего) и
 * не больше одной просьбы соседу. Просьба необязательна: правило вправе
 * только выдать куку и промолчать.
 *
 * Состояние `absent` вместе с выдачей -- это «первое касание»: кука достаётся
 * только тому, у кого её нет. Правило без состояния -- «последнее касание».
 * Разница между двумя моделями атрибуции видна в таблице, а не спрятана в
 * настройке с двумя значениями.
 *
 * В YAML загрузчика каждая строка печатается правилом с пустым match: пустой
 * признак совпадает со всяким запросом профиля -- профиль и так выбран
 * маршрутом.
 */

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

import { Form } from "../components/Form.tsx";
import { CopyNameModal } from "../components/CopyNameModal.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  DataTable,
  RowActionsHead,
  TableNoticeRow,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { flushTableSx, HeadCell, TableBlock } from "../components/table-block.tsx";
import { AddCell, RowActions, TextCell } from "../components/rules-table.tsx";
import { SettingsTable } from "../components/settings-table.tsx";
import { Section, Text } from "../components/fields.tsx";
import {
  COOKIE_PHASES,
  COOKIE_SIGNS,
  COOKIE_STATES,
  COOKIE_WRITES,
  MARKER_MAX_BYTES,
  axesFor,
  fetchActions,
  fetchDatasets,
  markerError,
  type ActionCondition,
  type CookieDecl,
  type CookiePhase,
  type CookieProfile,
  type CookieProfileAsk,
  type CookieProfileDoc,
  type CookieSign,
  type CookieState,
  type ActionRegistry,
  type Dataset,
  type InspectorMeta,
} from "../api.ts";
import { ConditionDialog, ConditionsTable, refsTo, whenLabel } from "./action-conds.tsx";
import { ACTION_CODE_RE, axisLabel, verbLabel } from "../components/action-select.tsx";
import {
  ASK_PHASES,
  AuditFields,
  GROUP_NAME_RE,
  POINTS_MAX,
  TO_DATASET,
  TO_MODULE,
  TO_SCORE,
  auditSummary,
  emptyRecordDrafts,
  humanTtl,
  isAuditVerb,
  isControlVerb,
  isRouteVerb,
  phaseSummary,
  recordDraftsOf,
  recordDraftsReady,
  recordObjectsPayload,
  ttlSeconds,
  verbMenuItems,
  verbsOf,
  type RecordDrafts,
} from "../components/action-part.tsx";
import { ARCHIVE_OUTCOMES, type ArchiveOutcome } from "../config/directive-tail.ts";
import ChannelNotice, { pageNoticeSx } from "../components/ChannelNotice.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  OVERLOAD_AT_MAX,
  OVERLOAD_AT_MIN,
  OVERLOAD_WHEN,
  overloadAtLabel,
  overloadAtOf,
  overloadAtOk,
} from "../overload.ts";
import {
  clearSent,
  closePanel,
  copyCookieProfile,
  loadCookieProfileDetail,
  loadCookieProfiles,
  openPanel,
  removeCookieProfile,
  restoreCookieProfileThunk,
  saveCookieProfileThunk,
  sendCookie,
} from "../store/slices/pages/cookie-profiles.ts";

/*
 * Ящик шире, чем у профилей автодействий: у правил куки есть своя колонка
 * «Кука», и в 720 таблица не влезала -- секция срезала справа «Параметры» и
 * «+», и завести правило было нечем. 908 -- как у счётчика.
 */
const PANEL_WIDTH = 908;
/** Раздел справки про условия профиля куки: пример и грабли -- там. */
const COOKIE_CONDS_HELP = "06-cookie#условия";
const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

/**
 * Строка секции «Правила»: когда, что сделать с кукой и одна просьба.
 *
 * Просьбы может не быть вовсе -- правило, которое только выдаёт куку,
 * нормальное. Операции тоже: правило, которое только рассказывает про
 * состояние куки, -- тоже.
 */
interface AskRow {
  ask: CookieProfileAsk | null;
  cond: string;
  negate: boolean;
  phase: CookiePhase | "";
  /** Состояние куки на входе; overload -- строка перегрузки, не про куку. */
  on: CookieState | "overload" | "";
  cookie: string;
  issue: string;
  drop: string;
  /** Только у строки перегрузки: порог очереди в процентах; пусто -- край. */
  at?: number | null;
}

/** Правила профиля одним списком: правило с двумя просьбами разложится на две строки. */
function asksOf(doc: CookieProfileDoc | undefined): AskRow[] {
  return (doc?.rules ?? []).flatMap((rule) => {
    const head = {
      cond: rule.cond ?? "",
      negate: rule.cond !== undefined && rule.cond !== "" && rule.negate === true,
      phase: rule.phase ?? "",
      on: rule.on ?? "",
      cookie: rule.cookie ?? "",
      issue: rule.issue ?? "",
      drop: rule.drop ?? "",
      at: rule.at ?? null,
    };

    if (rule.actions.length === 0) {
      return [{ ...head, ask: null } as AskRow];
    }

    return rule.actions.map((ask): AskRow => ({ ...head, ask }));
  });
}

/**
 * Обратно в форму загрузчика: правило на строку, признак пустой, имени нет --
 * загрузчик подставит порядковое. Признак и имя существуют ради профилей,
 * писанных руками; панели они не нужны.
 */
function rulesOf(rows: AskRow[]): CookieProfileDoc["rules"] {
  return rows.map((row) => ({
    name: "",
    match: { pathPrefix: "", suffixes: [], static: false, methods: [] },
    cond: row.cond,
    negate: row.cond === "" ? false : row.negate,
    phase: row.phase,
    on: row.on,
    ...(row.on === "overload" ? { at: row.at ?? null } : {}),
    cookie: row.cookie,
    issue: row.issue,
    drop: row.drop,
    actions: row.ask === null ? [] : [row.ask],
  }));
}

/** Пустое объявление куки: подпись по умолчанию и случайный хвост. */
function emptyCookie(): CookieDecl {
  return {
    name: "",
    path: "/",
    maxAgeS: 30 * 24 * 3600,
    renewAfterS: 0,
    sign: "hmac",
    value: { from: "", default: "", random: 8, maxLen: 64 },
  };
}

/** «Когда» просьбы одним словом: пусто -- всегда, `if:имя`, `unless:имя`. */
function whenKey(row: { cond: string; negate: boolean; on?: string }): string {
  if (row.on === "overload") {
    return OVERLOAD_WHEN;
  }

  if (row.cond === "") {
    return "";
  }

  return `${row.negate ? "unless" : "if"}:${row.cond}`;
}

function whenOf(key: string): { cond: string; negate: boolean } {
  if (key === "") {
    return { cond: "", negate: false };
  }

  const [kind, ...rest] = key.split(":");

  return { cond: rest.join(":"), negate: kind === "unless" };
}

/**
 * Очки на маршруте: просьба `score` без адресата, исполняет модуль. Пустая
 * форма -- то же, что у остальных просьб, заполнены только глагол, ось и
 * величина со знаком.
 */
function scoreAsk(value: number): CookieProfileAsk {
  return {
    to: "",
    do: "score",
    apply: "request",
    delta: null,
    value,
    counter: "",
    marker: "",
    group: "",
    phase: "",
    set: "",
    headers: null,
    args: null,
    body: null,
    ttlS: 0,
    when: [],
    code: "",
  };
}

type ListWrite = NonNullable<CookieProfileAsk["write"]>;

/**
 * Кого писать в набор -- четыре охвата, общих у всех отправителей, и пятый,
 * который есть только здесь: значение самой куки. Ради него набор и заводят --
 * край сверяет его быстрым путём, не спрашивая шину.
 */
const LIST_WRITES: readonly ListWrite[] = [...COOKIE_WRITES];

/**
 * Запись в набор: строка без адресата и глагола -- пишет сам инспектор, на
 * провод модулю она не едет. Срок обязателен у добавления; у снятия его нет
 * вовсе -- записи после него не остаётся.
 */
function listAsk(
  list: string,
  write: ListWrite,
  op: "add" | "remove",
  cookie: string,
  ttlS: number,
  code: string,
): CookieProfileAsk {
  return {
    to: "",
    do: "",
    apply: "",
    delta: null,
    value: null,
    counter: "",
    marker: "",
    group: "",
    phase: "",
    set: "",
    headers: null,
    args: null,
    body: null,
    ttlS: op === "remove" ? 0 : ttlS,
    when: [],
    list,
    write,
    op,
    cookie: write === "cookie" ? cookie : "",
    code,
  };
}

/** Строка -- запись в набор, а не просьба. */
function writesList(ask: CookieProfileAsk | null): boolean {
  return ask !== null && (ask.list ?? "") !== "";
}

/**
 * О какой куке говорит строка: её называет операция, поле «Кука» -- либо,
 * когда объявлена одна, она же и подразумевается. То же умолчание, что у
 * загрузчика.
 */
function rowCookie(row: AskRow, cookies: CookieDecl[]): string {
  const named = row.cookie || row.issue || row.drop;

  if (named !== "") {
    return named;
  }

  return cookies.length === 1 ? cookies[0].name : "";
}

/** Что строка делает с кукой одним словом. */
function opLabel(t: Translate, row: AskRow, cookies: CookieDecl[]): string {
  /* Строка перегрузки куку не трогает. */
  if (row.on === "overload") {
    return "—";
  }

  const named = rowCookie(row, cookies);

  if (row.issue !== "") {
    return `${t("cookieProfiles.opIssue")} · ${row.issue}`;
  }

  if (row.drop !== "") {
    return `${t("cookieProfiles.opDrop")} · ${row.drop}`;
  }

  return named === "" ? "—" : named;
}

/**
 * «Когда» строки одной фразой: условие профиля, фаза и состояние куки на входе.
 *
 * Всё это -- отбор запроса, и в одной колонке оно читается одним «когда»:
 * «если from_ads · на запросе · куки нет». Отдельные колонки условия и
 * состояния не помещались в ящик рядом с просьбой и срезали «+».
 */
function whenText(t: Translate, row: AskRow): string {
  if (row.on === "overload") {
    return `${t("outcomes.ons.overload")} ${overloadAtLabel(row.at)}`;
  }

  const parts: string[] = [];

  if (row.cond !== "") {
    parts.push(whenLabel(t, row.cond, row.negate));
  }

  if (row.phase !== "") {
    parts.push(t(`cookieProfiles.phasesAt.${row.phase}`));
  }

  if (row.on !== "") {
    parts.push(t(`cookieProfiles.states.${row.on}`));
  }

  return parts.length === 0 ? whenLabel(t, "", false) : parts.join(" · ");
}

export default function CookieProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.cookieProfiles.rows);
  const loading = useAppSelector((s) => s.pages.cookieProfiles.loading);
  const error = useAppSelector((s) => s.pages.cookieProfiles.error);
  const panelId = useAppSelector((s) => s.pages.cookieProfiles.panelId);
  const sending = useAppSelector((s) => s.pages.cookieProfiles.sending);
  const sent = useAppSelector((s) => s.pages.cookieProfiles.sent);
  const pager = usePager(rows);
  const ops = useRowOps<CookieProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyCookieProfile({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeCookieProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => void dispatch(loadCookieProfiles(scope)),
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendCookie(scope));
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
      <ChannelNotice id="action" />
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
          {t("cookieProfiles.sentHint")} {sent}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("cookieProfiles.rulesCount")}</TableCell>
          <TableCell>{t("cookieProfiles.description")}</TableCell>
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
                void dispatch(loadCookieProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{asksOf(row.doc).length}</TableCell>
              <TableCell>{row.description}</TableCell>
              {ops.cell(row, {
                remove:
                  row.name === "default" ? t("cookieProfiles.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("cookieProfiles.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadCookieProfiles(scope))} />
        <DataTable.Pager pager={pager} />
      </DataTable>
      {ops.modals}
      <Drawer
        anchor="right"
        open={panelId !== undefined}
        onClose={() => dispatch(closePanel())}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: PANEL_WIDTH },
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {panelId !== undefined && (
          <CookieProfileForm
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

/* --- карточка профиля ------------------------------------------------------- */

function CookieProfileForm({
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
  const detail = useAppSelector((s) => s.pages.cookieProfiles.detail);
  const inspectors = useAppSelector((s) => s.pages.cookieProfiles.inspectors);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cookies, setCookies] = useState<CookieDecl[]>([]);
  const [conditions, setConditions] = useState<ActionCondition[]>([]);
  const [asks, setAsks] = useState<AskRow[]>([]);
  /** Индекс объявления в диалоге; null -- новое, undefined -- диалог закрыт. */
  const [editingCookie, setEditingCookie] = useState<number | null | undefined>(undefined);
  /** Замечание секции кук: снять объявление, на котором стоят правила, нельзя. */
  const [cookieNotice, setCookieNotice] = useState<string | null>(null);
  /** Индекс просьбы в диалоге; null -- новая, undefined -- диалог закрыт. */
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  /** То же для условия. */
  const [editingCond, setEditingCond] = useState<number | null | undefined>(undefined);
  /** Замечание секции условий: снять условие, которое стоит у правил, нельзя. */
  const [condNotice, setCondNotice] = useState<string | null>(null);

  const [registry, setRegistry] = useState<ActionRegistry | null>(null);
  /* Наборы для условий: только активные списки -- только их видит зеркало инспектора. */
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  useEffect(() => {
    let alive = true;

    fetchActions()
      .then((reg) => {
        if (alive) {
          setRegistry(reg);
        }
      })
      .catch(() => {
        /* Пустой словарь -- осмысленное состояние, ронять страницу незачем. */
      });

    fetchDatasets(scope)
      .then((rows) => {
        if (alive) {
          setDatasets(rows.filter((row) => row.kind === "list" && row.active));
        }
      })
      .catch(() => {
        /* Пустой список наборов -- селектор пуст, страница живёт. */
      });

    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    if (id === null || detail === null || detail.uuid !== id) {
      return;
    }

    setName(detail.name);
    setDescription(detail.description);
    setCookies(detail.doc.cookies ?? []);
    setConditions(detail.doc.conditions ?? []);
    setAsks(asksOf(detail.doc));
  }, [id, detail]);

  /* Считает контроллер: только он видит профиль и реестр разом. */
  const unknownTargets =
    id !== null && detail !== null && detail.uuid === id
      ? (detail.unknown_targets ?? [])
      : [];

  const nameOk = NAME_RE.test(name);

  const save = () => {
    void dispatch(
      saveCookieProfileThunk({
        scope,
        id,
        name,
        description,
        doc: { description, cookies, conditions, rules: rulesOf(asks) },
      }),
    );
  };

  /**
   * Сколько правил и строк других условий стоит на условии: снять такое
   * нельзя, пока они его держат.
   */
  const usedBy = (condName: string): number =>
    asks.filter((row) => row.cond === condName).length + refsTo(conditions, condName);

  /**
   * Сколько правил стоит на куке: снять объявление, пока они его держат,
   * нельзя -- профиль всё равно не сохранится.
   */
  const cookieUsedBy = (cookieName: string): number =>
    asks.filter(
      (row) =>
        row.issue === cookieName ||
        row.drop === cookieName ||
        row.cookie === cookieName ||
        (row.ask?.cookie ?? "") === cookieName,
    ).length;

  const removeCookie = (index: number) => {
    const cookie = cookies[index];

    if (cookie === undefined) {
      return;
    }

    const n = cookieUsedBy(cookie.name);

    if (n > 0) {
      setCookieNotice(t("cookieProfiles.cookieInUse", { name: cookie.name, n: String(n) }));

      return;
    }

    setCookieNotice(null);
    setCookies((prev) => prev.filter((_row, i) => i !== index));
  };

  const removeCondition = (index: number) => {
    const cond = conditions[index];

    if (cond === undefined) {
      return;
    }

    const n = usedBy(cond.name);

    if (n > 0) {
      setCondNotice(t("cookieProfiles.condInUse", { name: cond.name, n: String(n) }));

      return;
    }

    setCondNotice(null);
    setConditions((prev) => prev.filter((_row, i) => i !== index));
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
          void dispatch(restoreCookieProfileThunk({ scope, id }));
        };
  const [copyOpen, setCopyOpen] = useState(false);

  return (
    <Form id="action-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("cookieProfiles.newTitle") : t("cookieProfiles.editTitle")}
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
        <Section
          title={t("cookieProfiles.sectionProfile")}
          hint={t("cookieProfiles.sectionProfileHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("cookieProfiles.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("cookieProfiles.description")}
              value={description}
              onChange={setDescription}
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("cookieProfiles.sectionCookies")}
          hint={t("cookieProfiles.cookiesHint")}
          flush
          defaultExpanded
        >
          {cookieNotice !== null && (
            <Alert severity="warning" sx={{ borderRadius: 0 }} onClose={() => setCookieNotice(null)}>
              {cookieNotice}
            </Alert>
          )}
          <CookiesTable
            t={t}
            cookies={cookies}
            onAdd={() => setEditingCookie(null)}
            onEdit={setEditingCookie}
            onRemove={removeCookie}
          />
        </Section>

        <Section
          title={t("cookieProfiles.sectionConditions")}
          hint={t("cookieProfiles.conditionsHint")}
          flush
          defaultExpanded
        >
          {condNotice !== null && (
            <Alert severity="warning" sx={{ borderRadius: 0 }} onClose={() => setCondNotice(null)}>
              {condNotice}
            </Alert>
          )}
          <ConditionsTable
            t={t}
            conditions={conditions}
            onAdd={() => setEditingCond(null)}
            onEdit={setEditingCond}
            onRemove={removeCondition}
          />
        </Section>

        <Section
          title={t("cookieProfiles.sectionRules")}
          hint={t("cookieProfiles.rulesHint")}
          flush
          defaultExpanded
        >
          {unknownTargets.length > 0 && (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              {t("cookieProfiles.unknownTargets")}: {unknownTargets.join(", ")}
            </Alert>
          )}
          <AsksTable
            t={t}
            asks={asks}
            cookies={cookies}
            onAdd={() => setEditing(null)}
            onEdit={setEditing}
            onRemove={(index) =>
              setAsks((prev) => prev.filter((_row, i) => i !== index))
            }
          />
        </Section>

        {registry === null && (
          <Alert severity="warning">{t("cookieProfiles.noRegistry")}</Alert>
        )}
      </Form.Body>
      <Form.Actions>
        {id !== null && (
          <Button
            startIcon={<ContentCopyOutlinedIcon />}
            onClick={() => setCopyOpen(true)}
          >
            {t("copyModal.button")}
          </Button>
        )}
        {id !== null && !isDefault && (
          <Button
            color="error"
            onClick={() => void dispatch(removeCookieProfile({ scope, id }))}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!nameOk} onClick={save}>
          {t("common.save")}
        </Button>
      </Form.Actions>
      {copyOpen && (
        <CopyNameModal
          title={t("copyModal.profileTitle")}
          source={name.trim()}
          onClose={() => setCopyOpen(false)}
          onCopy={(next) => {
            void dispatch(
              saveCookieProfileThunk({
                scope,
                id: null,
                name: next,
                description,
                doc: { description, cookies, conditions, rules: rulesOf(asks) },
              }),
            );
            setCopyOpen(false);
          }}
        />
      )}
      {editingCookie !== undefined && (
        <CookieDialog
          decl={editingCookie === null ? null : (cookies[editingCookie] ?? null)}
          taken={cookies
            .filter((_row, i) => i !== editingCookie)
            .map((row) => row.name)}
          onSave={(next) => {
            setCookies((prev) =>
              editingCookie === null
                ? [...prev, next]
                : prev.map((row, i) => (i === editingCookie ? next : row)),
            );
            setEditingCookie(undefined);
          }}
          onClose={() => setEditingCookie(undefined)}
        />
      )}
      {editing !== undefined && (
        <AskDialog
          row={editing === null ? null : (asks[editing] ?? null)}
          cookies={cookies}
          conditions={conditions}
          inspectors={inspectors}
          registry={registry}
          datasets={datasets}
          onSave={(next) => {
            setAsks((prev) =>
              editing === null
                ? [...prev, next]
                : prev.map((row, i) => (i === editing ? next : row)),
            );
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
      {editingCond !== undefined && (
        <ConditionDialog
          t={t}
          help={COOKIE_CONDS_HELP}
          cond={editingCond === null ? null : (conditions[editingCond] ?? null)}
          taken={conditions
            .filter((_row, i) => i !== editingCond)
            .map((row) => row.name)}
          datasets={datasets}
          onSave={(next) => {
            const before = editingCond === null ? null : conditions[editingCond];

            setConditions((prev) =>
              editingCond === null
                ? [...prev, next]
                : prev.map((row, i) => (i === editingCond ? next : row)),
            );

            /* Переименовали условие -- правила и ссылки соседей идут за новым именем. */
            if (before !== null && before !== undefined && before.name !== next.name) {
              setAsks((prev) =>
                prev.map((row) => (row.cond === before.name ? { ...row, cond: next.name } : row)),
              );
              setConditions((prev) =>
                prev.map((cond) => ({
                  ...cond,
                  rows: cond.rows.map((clause) =>
                    clause.cond === before.name ? { ...clause, cond: next.name } : clause,
                  ),
                })),
              );
            }

            setEditingCond(undefined);
          }}
          onClose={() => setEditingCond(undefined)}
        />
      )}
    </Form>
  );
}

/* --- таблица просьб --------------------------------------------------------- */

/**
 * Параметры просьбы одной фразой -- как у строк профиля адреса: ось там, где
 * она выбиралась, число со знаком, повод.
 */
function summaryOf(t: Translate, ask: CookieProfileAsk | null): string {
  if (ask === null) {
    return "";
  }

  const parts: string[] = [];

  /* Запись в набор: куда, кого и на сколько; у снятия срока нет. */
  if (writesList(ask)) {
    parts.push(ask.list ?? "", t(`cookieProfiles.writes.${ask.write ?? "addr"}`));

    parts.push(
      ask.op === "remove" ? t("cookieProfiles.opRemove") : humanTtl(ask.ttlS),
    );

    if (ask.code !== "") {
      parts.push(ask.code);
    }

    return parts.join(" · ");
  }

  /* Очки: одно число со знаком, и оно же -- вся строка. */
  if (ask.do === "score") {
    const n = ask.value ?? 0;
    const shown = `${n > 0 ? "+" : ""}${n}`;

    return ask.code === ""
      ? t("actions.score.summary", { n: shown })
      : `${t("actions.score.summary", { n: shown })} · ${ask.code}`;
  }

  /* У глаголов записи ось -- какая запись; её называет auditSummary. */
  if (ask.apply !== "" && ask.apply !== "request" && !isRouteVerb(ask.do)) {
    parts.push(axisLabel(t, ask.apply));
  }

  if (ask.delta !== null) {
    parts.push(t("cookieProfiles.amountShort.delta", { n: String(ask.delta) }));
  }

  if (ask.value !== null) {
    parts.push(t("cookieProfiles.amountShort.value", { n: String(ask.value) }));
  }

  /* mark: сама метка -- по ней строку и узнают в таблице. */
  if (ask.marker !== "") {
    parts.push(ask.marker);
  }

  /* mutate: группа получателя и сторона тумблера -- то, что назвал отправитель. */
  if (ask.group !== "") {
    parts.push(`${ask.group} → ${t(ask.set === "off" ? "actions.mutate.off" : "actions.mutate.on")}`);
  }

  /* Управляющие: фаза вызова адресата, если названа. */
  parts.push(...phaseSummary(t, ask));

  /* Глаголы записи: сторона, у archive -- объекты, срок и предел. */
  parts.push(...auditSummary(t, ask));

  if (ask.code !== "") {
    parts.push(ask.code);
  }

  return parts.join(" · ");
}

function AsksTable({
  t,
  asks,
  cookies,
  onAdd,
  onEdit,
  onRemove,
}: {
  t: Translate;
  asks: AskRow[];
  cookies: CookieDecl[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  /* Шапки у блока нет: имя и подсказка -- в заголовке секции «Правила». */
  return (
    <TableBlock last>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("cookieProfiles.when")} width={220} />
            <HeadCell label={t("cookieProfiles.cookie")} width={140} />
            <HeadCell label={t("cookieProfiles.to")} width={130} />
            <HeadCell label={t("cookieProfiles.verb")} width={130} />
            <HeadCell label={t("cookieProfiles.params")} />
            <AddCell label={t("cookieProfiles.addRule")} onAdd={onAdd} />
          </TableRow>
        </TableHead>
        <TableBody>
          {asks.length === 0 && (
            <TableNoticeRow
              colSpan={6}
              kind="empty"
              message={t("cookieProfiles.rulesEmpty")}
              actionLabel={t("cookieProfiles.addRule")}
              onAction={onAdd}
            />
          )}
          {asks.map((row, index) => {
            const ask = row.ask;

            return (
              <TableRow key={index} hover>
                <TextCell
                  text={whenText(t, row)}
                  muted={row.cond === "" && row.phase === "" && row.on === ""}
                />
                <TextCell
                  text={opLabel(t, row, cookies)}
                  muted={row.issue === "" && row.drop === ""}
                />
                {/*
                  Запись маршрута, очки и запись в набор адресата на проводе не
                  несут: у каждого свой пункт «Кому». Строки без просьбы тут
                  пусто -- правило только выдаёт или снимает.
                */}
                <TextCell
                  text={
                    ask === null
                      ? "—"
                      : writesList(ask)
                        ? t("outcomes.toDataset")
                        : ask.do === "score"
                          ? t("outcomes.toRoute")
                          : ask.to === ""
                            ? t("cookieProfiles.toModule")
                            : ask.to
                  }
                  muted={ask === null || writesList(ask)}
                />
                <TextCell
                  text={
                    ask === null
                      ? ""
                      : writesList(ask)
                        ? t("outcomes.outcomeWrite")
                        : verbLabel(t, ask.do)
                  }
                />
                <TextCell text={summaryOf(t, ask)} muted />
                <RowActions onEdit={() => onEdit(index)} onRemove={() => onRemove(index)} />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableBlock>
  );
}

/* --- объявления кук --------------------------------------------------------- */

/** Срок словами: то же, чем печатает его контроллер в YAML. */
function ageLabel(t: Translate, seconds: number): string {
  return seconds === 0 ? t("cookieProfiles.session") : humanTtl(seconds);
}

/** Чем заполняется значение -- одной строкой для таблицы. */
function valueLabel(t: Translate, decl: CookieDecl): string {
  const parts: string[] = [];

  if (decl.value.from !== "") {
    parts.push(decl.value.from);
  }

  if (decl.value.default !== "") {
    parts.push(t("cookieProfiles.valueDefaultShort", { text: decl.value.default }));
  }

  if (decl.value.random > 0) {
    parts.push(t("cookieProfiles.valueRandomShort", { n: String(decl.value.random) }));
  }

  return parts.join(" · ");
}

function CookiesTable({
  t,
  cookies,
  onAdd,
  onEdit,
  onRemove,
}: {
  t: Translate;
  cookies: CookieDecl[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  /* Шапки у блока нет: имя и подсказка -- в заголовке секции «Куки». */
  return (
    <TableBlock last>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("common.name")} width={160} />
            <HeadCell label={t("cookieProfiles.path")} width={110} />
            <HeadCell label={t("cookieProfiles.maxAge")} width={120} />
            <HeadCell label={t("cookieProfiles.sign")} width={110} />
            <HeadCell label={t("cookieProfiles.value")} />
            <AddCell label={t("cookieProfiles.addCookie")} onAdd={onAdd} />
          </TableRow>
        </TableHead>
        <TableBody>
          {cookies.length === 0 && (
            <TableNoticeRow
              colSpan={6}
              kind="empty"
              message={t("cookieProfiles.cookiesEmpty")}
              actionLabel={t("cookieProfiles.addCookie")}
              onAction={onAdd}
            />
          )}
          {cookies.map((decl, index) => (
            <TableRow key={index} hover>
              <TextCell text={decl.name} />
              <TextCell text={decl.path} muted />
              <TextCell
                text={
                  decl.renewAfterS === 0
                    ? ageLabel(t, decl.maxAgeS)
                    : `${ageLabel(t, decl.maxAgeS)} · ${t("cookieProfiles.renewShort", { ttl: humanTtl(decl.renewAfterS) })}`
                }
                muted
              />
              <TextCell
                text={t(`cookieProfiles.signs.${decl.sign}`)}
                muted={decl.sign === "none"}
              />
              <TextCell text={valueLabel(t, decl)} muted />
              <RowActions onEdit={() => onEdit(index)} onRemove={() => onRemove(index)} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableBlock>
  );
}

/** Имя куки: то же, чем отбраковывает его загрузчик. */
const COOKIE_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
/** Алфавит метки: всё прочее инспектор сводит к подчёркиванию. */
const TAG_RE = /^[A-Za-z0-9_-]*$/;

/*
 * Диалог объявления. Secure, HttpOnly и SameSite здесь не спрашиваются
 * намеренно: их форсирует waf_cookie_defaults маршрута, и поле в профиле
 * выглядело бы работающим, ничего не меняя. Домена нет по той же причине --
 * кука host-only.
 */
function CookieDialog({
  decl,
  taken,
  onSave,
  onClose,
}: {
  decl: CookieDecl | null;
  taken: string[];
  onSave: (next: CookieDecl) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<CookieDecl>(() => decl ?? emptyCookie());
  const [maxAge, setMaxAge] = useState(() =>
    (decl?.maxAgeS ?? emptyCookie().maxAgeS) === 0 ? "" : humanTtl(decl?.maxAgeS ?? emptyCookie().maxAgeS),
  );
  const [renew, setRenew] = useState(() =>
    (decl?.renewAfterS ?? 0) === 0 ? "" : humanTtl(decl?.renewAfterS ?? 0),
  );

  const set = (patch: Partial<CookieDecl>) => setDraft((prev) => ({ ...prev, ...patch }));
  const setValue = (patch: Partial<CookieDecl["value"]>) =>
    setDraft((prev) => ({ ...prev, value: { ...prev.value, ...patch } }));

  const name = draft.name.trim();
  const nameOk = COOKIE_NAME_RE.test(name) && !taken.includes(name);
  const maxAgeS = maxAge.trim() === "" ? 0 : ttlSeconds(maxAge);
  const renewS = renew.trim() === "" ? 0 : ttlSeconds(renew);
  const defaultOk = TAG_RE.test(draft.value.default.trim());
  const randomOk = draft.value.random >= 0 && draft.value.random <= 32;
  const maxLenOk = draft.value.maxLen >= 1 && draft.value.maxLen <= 128;
  const hasSource =
    draft.value.from.trim() !== "" || draft.value.default.trim() !== "" || draft.value.random > 0;

  /*
   * Продление живёт в подписанной половине значения: без подписи времени
   * выдачи в куке нет, и состояние expired не наступит никогда. Срок продления
   * короче срока куки -- иначе браузер выбросит её раньше, чем мы соберёмся
   * продлить.
   */
  const renewOk =
    renewS === 0 ||
    (draft.sign === "hmac" && renewS > 0 && (maxAgeS === 0 || renewS < maxAgeS));

  const ready =
    nameOk &&
    draft.path.trim().startsWith("/") &&
    (maxAge.trim() === "" || maxAgeS > 0) &&
    (renew.trim() === "" || renewS > 0) &&
    renewOk &&
    defaultOk &&
    randomOk &&
    maxLenOk &&
    hasSource;

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={decl === null ? t("cookieProfiles.addCookie") : t("cookieProfiles.editCookie")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!ready}
            onClick={() =>
              onSave({
                ...draft,
                name,
                path: draft.path.trim(),
                maxAgeS,
                renewAfterS: renewS,
                value: {
                  ...draft.value,
                  from: draft.value.from.trim(),
                  default: draft.value.default.trim(),
                },
              })
            }
          >
            {decl === null ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={2}>
        <TextField
          size="small"
          label={t("common.name")}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value.trim() })}
          required
          error={draft.name !== "" && !nameOk}
          helperText={
            taken.includes(name) && name !== ""
              ? t("cookieProfiles.cookieNameTaken")
              : t("cookieProfiles.cookieNameHint")
          }
        />
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label={t("cookieProfiles.path")}
            value={draft.path}
            onChange={(e) => set({ path: e.target.value.trim() })}
            error={!draft.path.trim().startsWith("/")}
            helperText={t("cookieProfiles.pathHint")}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label={t("cookieProfiles.maxAge")}
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            error={maxAge.trim() !== "" && maxAgeS <= 0}
            helperText={t("cookieProfiles.maxAgeHint")}
            sx={{ flex: 1 }}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label={t("cookieProfiles.sign")}
            value={draft.sign}
            onChange={(e) => set({ sign: e.target.value as CookieSign })}
            helperText={t("cookieProfiles.signHint")}
            sx={{ flex: 1 }}
          >
            {COOKIE_SIGNS.map((sign) => (
              <MenuItem key={sign} value={sign}>
                {t(`cookieProfiles.signs.${sign}`)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={t("cookieProfiles.renew")}
            value={renew}
            onChange={(e) => setRenew(e.target.value)}
            error={renew.trim() !== "" && !renewOk}
            helperText={t("cookieProfiles.renewHint")}
            sx={{ flex: 1 }}
          />
        </Stack>
        <TextField
          size="small"
          label={t("cookieProfiles.valueFrom")}
          value={draft.value.from}
          onChange={(e) => setValue({ from: e.target.value })}
          helperText={t("cookieProfiles.valueFromHint")}
        />
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label={t("cookieProfiles.valueDefault")}
            value={draft.value.default}
            onChange={(e) => setValue({ default: e.target.value })}
            error={!defaultOk}
            helperText={t("cookieProfiles.valueDefaultHint")}
            sx={{ flex: 1.4 }}
          />
          <TextField
            size="small"
            label={t("cookieProfiles.valueRandom")}
            value={String(draft.value.random)}
            onChange={(e) => setValue({ random: Number(e.target.value.trim()) || 0 })}
            error={!randomOk}
            helperText={t("cookieProfiles.valueRandomHint")}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label={t("cookieProfiles.valueMaxLen")}
            value={String(draft.value.maxLen)}
            onChange={(e) => setValue({ maxLen: Number(e.target.value.trim()) || 0 })}
            error={!maxLenOk}
            helperText={t("cookieProfiles.valueMaxLenHint")}
            sx={{ flex: 1 }}
          />
        </Stack>
        {!hasSource && (
          <Alert severity="warning" icon={false}>{t("cookieProfiles.valueEmpty")}</Alert>
        )}
        <Alert severity="info" icon={false}>{t("cookieProfiles.cookieAlert")}</Alert>
      </Stack>
    </Modal>
  );
}

/* --- диалог просьбы --------------------------------------------------------- */

/*
 * Та же форма, что у строки профиля адреса (ip-profile-dialog.tsx), без
 * «Когда» и без набора: «Кому» первым, «Что сделать» отфильтровано по
 * получателю, направление словами и величина без знака -- знак проставляет
 * сборка. «Всем» здесь нет: адресат у этого инспектора обязателен.
 */
interface AskFields {
  target: string;
  verb: string;
  axis: string;
  direction: "stricter" | "softer";
  percent: string;
  noteDir: "add" | "cut";
  notePercent: string;
  /** Только note в адрес счётчика: имя его корзины, селектор поверх правил. */
  counter: string;
  /** Только mutate: группа модификаторов получателя; set -- и у глаголов записи. */
  group: string;
  /** Только управляющие глаголы: фаза вызова адресата; пусто -- все вызовы имени. */
  phase: string;
  set: "on" | "off";
  /** Только mark: метка события на записи -- произвольная строка оператора. */
  marker: string;
  /** Журнал и архив с set on: объекты осями, срок и исход только у архива. */
  record: RecordDrafts;
  archiveTtl: string;
  /** Исходы архива; пусто -- любой, как отсутствие `when=` у директивы. */
  archiveWhen: ArchiveOutcome[];
  /** Только очки на маршруте: направление словами и величина без знака, 1..100. */
  scoreDir: "add" | "cut";
  scorePoints: string;
  /** Только запись в набор: имя активного списка, кого писать и срок. */
  list: string;
  write: ListWrite;
  /** Положить в набор либо снять из него: у снятия срока нет. */
  op: "add" | "remove";
  /** Только write: cookie -- чьё значение писать; пусто -- кука правила. */
  listCookie: string;
  ttl: string;
  code: string;
}

function fieldsOf(ask: CookieProfileAsk | null): AskFields {
  if (ask === null) {
    return {
      target: "",
      verb: "",
      axis: "",
      direction: "stricter",
      percent: "",
      scoreDir: "add",
      scorePoints: "",
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
      op: "add",
      listCookie: "",
      ttl: "",
      code: "",
    };
  }

  /* Запись в набор: свой пункт «Кому», глагола у неё нет. */
  if (writesList(ask)) {
    return {
      ...fieldsOf(null),
      target: TO_DATASET,
      list: ask.list ?? "",
      write: ask.write ?? "addr",
      op: ask.op ?? "add",
      listCookie: ask.cookie ?? "",
      ttl: ask.ttlS > 0 ? humanTtl(ask.ttlS) : "",
      code: ask.code,
    };
  }

  return {
    /* Глагол записи и очки адресата не несут: у каждого свой пункт «Кому». */
    target: isRouteVerb(ask.do) ? TO_MODULE : ask.do === "score" ? TO_SCORE : ask.to,
    verb: ask.do === "score" ? "" : ask.do,
    axis: ask.apply,
    direction: (ask.delta ?? 0) >= 0 ? "stricter" : "softer",
    percent: ask.delta === null ? "" : String(Math.abs(ask.delta)),
    scoreDir: (ask.value ?? 0) >= 0 ? "add" : "cut",
    scorePoints: ask.do === "score" && ask.value !== null ? String(Math.abs(ask.value)) : "",
    noteDir: (ask.value ?? 0) >= 0 ? "add" : "cut",
    notePercent: ask.value === null ? "" : String(Math.abs(ask.value)),
    counter: ask.counter,
    group: ask.group ?? "",
    phase: ask.phase ?? "",
    set: ask.set === "off" ? "off" : "on",
    marker: ask.marker ?? "",
    record: recordDraftsOf(ask),
    archiveTtl: (ask.ttlS ?? 0) > 0 ? humanTtl(ask.ttlS) : "",
    archiveWhen: ARCHIVE_OUTCOMES.filter((name) => (ask.when ?? []).includes(name)),
    list: "",
    write: "addr",
    op: "add",
    listCookie: "",
    ttl: "",
    code: ask.code,
  };
}

function numberOk(raw: string, min: number, max: number): boolean {
  if (raw.trim() === "") {
    return false;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= min && n <= max;
}

function AskDialog({
  row,
  cookies,
  conditions,
  inspectors,
  registry,
  datasets,
  onSave,
  onClose,
}: {
  /** null -- заводим новое правило. */
  row: AskRow | null;
  /** Объявления профиля: из них собираются «Кука» и «Что сделать с кукой». */
  cookies: CookieDecl[];
  /** Условия профиля: из них собирается «Когда». */
  conditions: ActionCondition[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  /** Активные списки пространства: только в них пишет keeper. */
  datasets: Dataset[];
  onSave: (row: AskRow) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ask = row === null ? null : row.ask;
  const [fields, setFields] = useState<AskFields>(() => fieldsOf(ask));
  /*
   * «Когда»: всегда, если А, если не А. Условие, которого в профиле уже нет
   * (сняли, пока окно было закрыто), остаётся пунктом -- иначе строка выглядела
   * бы «всегда», не будучи им.
   */
  const [when, setWhen] = useState<string>(() => (row === null ? "" : whenKey(row)));
  /* Порог строки перегрузки: пусто -- край, запрос сброшен. */
  const [atDraft, setAtDraft] = useState<string>(() =>
    row?.at === null || row?.at === undefined ? "" : String(row.at),
  );
  /* Фаза, состояние куки на входе и операция -- свойства правила, не просьбы. */
  const [phase, setPhase] = useState<CookiePhase | "">(() => row?.phase ?? "");
  const [on, setOn] = useState<CookieState | "">(() => (row?.on === "overload" ? "" : (row?.on ?? "")));
  const [cookie, setCookie] = useState<string>(() => row?.cookie ?? "");
  const [op, setOp] = useState<"" | "issue" | "drop">(() => {
    if (row === null) {
      return "";
    }

    if (row.issue !== "") {
      return "issue";
    }

    return row.drop !== "" ? "drop" : "";
  });

  /* Кука правила: названная явно либо единственная объявленная. */
  const named = cookie || (cookies.length === 1 ? cookies[0].name : "");
  const decl = cookies.find((item) => item.name === named);

  /*
   * Состояния, которых у неподписанной куки не бывает: сверять предъявленное
   * значение не с чем, а времени выдачи в нём нет. Правило с ними не
   * сохранится, поэтому и предлагать их незачем.
   */
  const states = COOKIE_STATES.filter(
    (state) =>
      (state !== "invalid" && state !== "expired") ||
      (decl?.sign === "hmac" && (state !== "expired" || (decl?.renewAfterS ?? 0) > 0)),
  );
  const whenOptions: { key: string; label: string }[] = [
    { key: "", label: whenLabel(t, "", false) },
    ...conditions.flatMap((cond) => [
      { key: `if:${cond.name}`, label: whenLabel(t, cond.name, false) },
      { key: `unless:${cond.name}`, label: whenLabel(t, cond.name, true) },
    ]),
    /* Перегрузка -- не условие профиля, а состояние инспектора: свой пункт. */
    { key: OVERLOAD_WHEN, label: t("outcomes.ons.overload") },
  ];

  if (when !== "" && !whenOptions.some((option) => option.key === when)) {
    const current = whenOf(when);

    whenOptions.push({ key: when, label: whenLabel(t, current.cond, current.negate) });
  }

  const set = (patch: Partial<AskFields>) =>
    setFields((prev) => ({ ...prev, ...patch }));

  /* Кому предлагать: только тех, кому словарь знает хоть одну просьбу. */
  const targets = inspectors.filter(
    (row) => verbsOf(registry, inspectors, row.name).length > 0,
  );

  /*
   * Модулю -- глаголы записи из словаря и очки: строка своя, потому что
   * очки -- не глагол канала, а вердикт, и словарь их не знает.
   */
  const verbs = fields.target === "" ? [] : verbsOf(registry, inspectors, fields.target);
  const axes = axesFor(registry, fields.verb === "" ? [] : [fields.verb]);

  const codeOk = fields.code === "" || ACTION_CODE_RE.test(fields.code);

  /*
   * Что мешает сохранить -- словами, null -- ничего. Та же проверка, что гасит
   * кнопку, только с причиной: погашенная «Добавить» без объяснений оставляла
   * гадать, какое из десятка полей не так.
   */
  const blocker = (): string | null => {
    const overload = when === OVERLOAD_WHEN;

    /* Строка перегрузки: порог в шкале и действие обязательно -- куки у неё нет. */
    if (overload && !overloadAtOk(atDraft)) {
      return t("cookieProfiles.needOverloadAt", {
        min: String(OVERLOAD_AT_MIN),
        max: String(OVERLOAD_AT_MAX),
      });
    }

    if (overload && fields.target === "") {
      return t("cookieProfiles.needOverloadAsk");
    }

    /*
     * Операция названа, а кука -- нет (объявлено несколько, ни одна не
     * выбрана): такое правило сохранялось бы без операции, молча.
     */
    if (!overload && op !== "" && named === "") {
      return t("cookieProfiles.needCookie");
    }

    /* Очки: глагола нет, есть величина 1..100 и направление. */
    if (fields.target === TO_SCORE) {
      if (!numberOk(fields.scorePoints, 1, POINTS_MAX)) {
        return t("cookieProfiles.needPoints", { max: String(POINTS_MAX) });
      }

      return codeOk ? null : t("cookieProfiles.needCode");
    }

    /*
     * Запись в набор: куда и на сколько. Срок обязателен у добавления; у
     * снятия его нет вовсе, и значение куки требует объявления.
     */
    if (fields.target === TO_DATASET) {
      if (fields.list === "") {
        return t("cookieProfiles.needList");
      }

      if (fields.write === "cookie" && named === "" && fields.listCookie === "") {
        return t("cookieProfiles.needCookie");
      }

      if (fields.op !== "remove" && ttlSeconds(fields.ttl) <= 0) {
        return t("cookieProfiles.needTtl");
      }

      return codeOk ? null : t("cookieProfiles.needCode");
    }

    /* Просьбы нет: строка только выдаёт или снимает куку -- это правило. */
    if (fields.target === "") {
      return op !== "" ? null : t("cookieProfiles.needSomething");
    }

    if (fields.verb === "") {
      return t("cookieProfiles.needVerb");
    }

    if (fields.verb === "threshold") {
      const cap = fields.direction === "softer" ? 100 : 900;

      if (!numberOk(fields.percent, 1, cap)) {
        return t("cookieProfiles.needPercent");
      }
    }

    if (fields.verb === "note" && !numberOk(fields.notePercent, 1, 100)) {
      return t("cookieProfiles.needPercent");
    }

    if (fields.verb === "mutate" && !GROUP_NAME_RE.test(fields.group.trim())) {
      return t("cookieProfiles.needGroup");
    }

    /* Пометить: без метки просьбы нет, и битую метку модуль не примет. */
    if (fields.verb === "mark" && markerError(fields.marker) !== null) {
      return t("cookieProfiles.needMarker");
    }

    /* Журнал и архив: срок и размеры объектов обязаны читаться. */
    if (isAuditVerb(fields.verb) && fields.set === "on") {
      if (fields.verb === "archive" && fields.archiveTtl.trim() !== "" && ttlSeconds(fields.archiveTtl) <= 0) {
        return t("cookieProfiles.needTtl");
      }

      if (!recordDraftsReady(fields.verb, fields.record)) {
        return t("cookieProfiles.needRecord");
      }
    }

    return codeOk ? null : t("cookieProfiles.needCode");
  };

  const blocked = blocker();

  const save = () => {
    const overload = when === OVERLOAD_WHEN;
    const { cond, negate } = overload ? { cond: "", negate: false } : whenOf(when);
    const at = overload ? overloadAtOf(atDraft) : null;

    /* Общая половина строки: когда она работает и что делает с кукой. */
    const head: Omit<AskRow, "ask"> = overload
      ? { cond: "", negate: false, phase: "", on: "overload", cookie: "", issue: "", drop: "", at }
      : {
          cond,
          negate,
          phase,
          on,
          cookie,
          issue: op === "issue" ? named : "",
          drop: op === "drop" ? named : "",
        };

    /* Просьбы нет: правило только выдаёт или снимает. */
    if (fields.target === "") {
      onSave({ ...head, ask: null });

      return;
    }

    if (fields.target === TO_SCORE) {
      const magnitude = Number(fields.scorePoints);
      const ask = scoreAsk(fields.scoreDir === "cut" ? -magnitude : magnitude);

      ask.code = fields.code;
      onSave({ ...head, ask });

      return;
    }

    if (fields.target === TO_DATASET) {
      onSave({
        ...head,
        ask: listAsk(
          fields.list,
          fields.write,
          fields.op,
          fields.listCookie,
          ttlSeconds(fields.ttl),
          fields.code,
        ),
      });

      return;
    }

    const recording = isAuditVerb(fields.verb) && fields.set === "on";
    const archiving = fields.verb === "archive" && fields.set === "on";
    const objects = recording
      ? recordObjectsPayload(fields.record)
      : { headers: null, args: null, body: null };
    const out: CookieProfileAsk = {
      /* «Журнал и архив» на проводе -- отсутствие адресата. */
      to: fields.target === TO_MODULE ? "" : fields.target,
      do: fields.verb,
      apply: fields.axis !== "" ? fields.axis : (axes[0] ?? ""),
      delta: null,
      value: null,
      counter:
        fields.verb === "note" && fields.target === "counter"
          ? fields.counter.trim()
          : "",
      group: fields.verb === "mutate" ? fields.group.trim() : "",
      phase: isControlVerb(fields.verb) ? fields.phase : "",
      set: fields.verb === "mutate" || isAuditVerb(fields.verb) ? fields.set : "",
      marker: fields.verb === "mark" ? fields.marker.trim() : "",
      headers: objects.headers,
      args: objects.args,
      body: objects.body,
      ttlS: archiving ? ttlSeconds(fields.archiveTtl) : 0,
      when: archiving ? [...fields.archiveWhen] : [],
      code: fields.code,
    };

    if (fields.verb === "threshold") {
      const magnitude = Number(fields.percent);

      out.delta = fields.direction === "softer" ? -magnitude : magnitude;
    }

    if (fields.verb === "note") {
      const magnitude = Number(fields.notePercent);

      out.value = fields.noteDir === "cut" ? -magnitude : magnitude;
    }

    onSave({ ...head, ask: out });
  };

  /*
   * Новое правило или правка -- по строке, а не по просьбе: правило, которое
   * только выдаёт куку, просьбы не несёт, и его правка называлась «Добавить».
   */
  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={
        row === null ? t("cookieProfiles.addRule") : t("cookieProfiles.editRule")
      }
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={blocked !== null} onClick={save}>
            {row === null ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2}>
          {/*
            Когда: всегда, если А, если не А -- первым полем, как колонка
            таблицы. Условия заводятся в секции профиля. Перегрузка снимает
            поля куки под собой, а не над тем местом, где её выбрали.
          */}
          <TextField
            select
            size="small"
            label={t("cookieProfiles.when")}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            helperText={
              conditions.length === 0
                ? t("cookieProfiles.whenNoConditions")
                : t("cookieProfiles.whenHint")
            }
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
          >
            {whenOptions.map((option) => (
              <MenuItem key={option.key} value={option.key}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          {/*
            Порог перегрузки: с какого заполнения очереди инспектора строка
            срабатывает. Пусто -- край: запрос уже сброшен (src/overload.ts).
          */}
          {when === OVERLOAD_WHEN && (
            <TextField
              size="small"
              label={t("outcomes.overloadAt")}
              value={atDraft}
              placeholder={String(OVERLOAD_AT_MAX)}
              onChange={(e) => setAtDraft(e.target.value)}
              error={!overloadAtOk(atDraft)}
              helperText={t("outcomes.overloadAtHint")}
              slotProps={{ htmlInput: { inputMode: "numeric", min: OVERLOAD_AT_MIN, max: OVERLOAD_AT_MAX } }}
            />
          )}

          {/*
            Что сделать с кукой. «Ничего» -- законный выбор: правило вправе
            только рассказать соседям про состояние куки, ничего не выдавая.
          */}
          {when !== OVERLOAD_WHEN && (
          <>
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label={t("cookieProfiles.operation")}
              value={op}
              onChange={(e) => setOp(e.target.value as "" | "issue" | "drop")}
              helperText={t("cookieProfiles.operationHint")}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">{t("cookieProfiles.opNone")}</MenuItem>
              <MenuItem value="issue">{t("cookieProfiles.opIssue")}</MenuItem>
              <MenuItem value="drop">{t("cookieProfiles.opDrop")}</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              label={t("cookieProfiles.cookie")}
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              helperText={
                cookies.length === 0
                  ? t("cookieProfiles.noCookies")
                  : t("cookieProfiles.cookieHint")
              }
              error={op !== "" && named === ""}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">
                {cookies.length === 1
                  ? t("cookieProfiles.cookieOnly", { name: cookies[0].name })
                  : t("cookieProfiles.cookieAny")}
              </MenuItem>
              {cookies.map((item) => (
                <MenuItem key={item.name} value={item.name}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Когда работает: фаза маршрута и состояние куки на входе. */}
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label={t("cookieProfiles.phase")}
              value={phase}
              onChange={(e) => setPhase(e.target.value as CookiePhase | "")}
              helperText={t("cookieProfiles.phaseHint")}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">{t("cookieProfiles.phaseBoth")}</MenuItem>
              {COOKIE_PHASES.map((item) => (
                <MenuItem key={item} value={item}>
                  {t(`cookieProfiles.phases.${item}`)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label={t("cookieProfiles.state")}
              value={on}
              onChange={(e) => setOn(e.target.value as CookieState | "")}
              helperText={
                on === "absent"
                  ? t("cookieProfiles.stateAbsentHint")
                  : t("cookieProfiles.stateHint")
              }
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">{t("cookieProfiles.anyState")}</MenuItem>
              {states.map((item) => (
                <MenuItem key={item} value={item}>
                  {t(`cookieProfiles.states.${item}`)}
                </MenuItem>
              ))}
              {/*
                Состояние, которое объявлению уже не подходит (сняли подпись,
                пока окно было закрыто), остаётся пунктом: иначе селектор молча
                стёр бы записанное.
              */}
              {on !== "" && !states.some((item) => item === on) && (
                <MenuItem value={on}>{t(`cookieProfiles.states.${on}`)}</MenuItem>
              )}
            </TextField>
          </Stack>
          </>
          )}

          <TextField
            select
            size="small"
            label={t("cookieProfiles.to")}
            value={fields.target}
            onChange={(e) => {
              const target = e.target.value;

              /*
               * Сменили адресата -- прежнее действие могло стать ему не
               * адресованным. Оставляем, только если новый его слушает.
               */
              const still = verbsOf(registry, inspectors, target).includes(fields.verb);

              set({
                target,
                verb: still ? fields.verb : "",
                axis: still ? fields.axis : "",
              });
            }}
            helperText={t("cookieProfiles.toHint")}
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
          >
            {/* Правило без просьбы: только выдать или снять куку. */}
            <MenuItem value="">{t("cookieProfiles.toNobody")}</MenuItem>
            {targets.map((row) => (
              <MenuItem key={row.uuid} value={row.name}>
                {row.name}
              </MenuItem>
            ))}
            {/* Запись маршрута -- глаголы из словаря; очки -- своим пунктом. */}
            {verbsOf(registry, inspectors, TO_MODULE).length > 0 && (
              <MenuItem value={TO_MODULE}>{t("cookieProfiles.toModule")}</MenuItem>
            )}
            <MenuItem value={TO_SCORE}>{t("outcomes.toScore")}</MenuItem>
            {/* Запись в набор: пишет сам инспектор, режет по набору тот, кто стоит перед маршрутом. */}
            <MenuItem value={TO_DATASET}>{t("outcomes.toDataset")}</MenuItem>
          </TextField>

          {fields.target === TO_SCORE && (
            <>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  size="small"
                  label={t("actions.score.direction")}
                  value={fields.scoreDir}
                  onChange={(e) => set({ scoreDir: e.target.value as AskFields["scoreDir"] })}
                  sx={{ flex: 1.2 }}
                >
                  <MenuItem value="add">{t("actions.score.add")}</MenuItem>
                  <MenuItem value="cut">{t("actions.score.cut")}</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  label={t("actions.score.points")}
                  value={fields.scorePoints}
                  onChange={(e) => set({ scorePoints: e.target.value.trim() })}
                  required
                  error={fields.scorePoints !== "" && !numberOk(fields.scorePoints, 1, POINTS_MAX)}
                  helperText={t("actions.score.pointsHint")}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Alert severity="info" icon={false}>{t("actions.verbs.score.hint")}</Alert>
            </>
          )}

          {/*
            Запись в набор: адресата и глагола нет, пишет сам инспектор. Кого
            писать -- адрес клиента либо то, во что он разворачивается у гео:
            самый узкий анонс, все накрывающие, система целиком.
          */}
          {fields.target === TO_DATASET && (
            <>
              <TextField
                select
                size="small"
                label={t("outcomes.outcomeList")}
                value={fields.list}
                onChange={(e) => set({ list: e.target.value })}
                helperText={t("outcomes.outcomeListHint")}
              >
                {datasets.map((row) => (
                  <MenuItem key={row.uuid} value={row.name}>
                    {row.name}
                  </MenuItem>
                ))}
                {/*
                  Набор, которого среди активных уже нет, остаётся пунктом:
                  иначе селектор молча стёр бы записанное.
                */}
                {fields.list !== "" && !datasets.some((row) => row.name === fields.list) && (
                  <MenuItem value={fields.list}>{fields.list}</MenuItem>
                )}
                {datasets.length === 0 && (
                  <MenuItem disabled value="">
                    {t("outcomes.listEmpty")}
                  </MenuItem>
                )}
              </TextField>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  size="small"
                  label={t("outcomes.outcomeWriteLabel")}
                  value={fields.write}
                  onChange={(e) => set({ write: e.target.value as ListWrite })}
                  helperText={t("outcomes.outcomeWriteHint")}
                  sx={{ flex: 1.6 }}
                >
                  {LIST_WRITES.map((write) => (
                    <MenuItem key={write} value={write}>
                      {t(`cookieProfiles.writes.${write}`)}
                    </MenuItem>
                  ))}
                </TextField>
                {/*
                  Снятию срок не нужен и запрещён: записи после него не
                  остаётся вовсе.
                */}
                {fields.op === "add" && (
                  <TextField
                    size="small"
                    label={t("outcomes.outcomeTtl")}
                    value={fields.ttl}
                    onChange={(e) => set({ ttl: e.target.value.trim() })}
                    required
                    error={fields.ttl !== "" && ttlSeconds(fields.ttl) <= 0}
                    helperText={t("outcomes.outcomeTtlHint")}
                    sx={{ flex: 1 }}
                  />
                )}
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  size="small"
                  label={t("cookieProfiles.listOp")}
                  value={fields.op}
                  onChange={(e) => set({ op: e.target.value as AskFields["op"] })}
                  helperText={t("cookieProfiles.listOpHint")}
                  sx={{ flex: 1 }}
                >
                  <MenuItem value="add">{t("cookieProfiles.opAdd")}</MenuItem>
                  <MenuItem value="remove">{t("cookieProfiles.opRemove")}</MenuItem>
                </TextField>
                {fields.write === "cookie" && (
                  <TextField
                    select
                    size="small"
                    label={t("cookieProfiles.listCookie")}
                    value={fields.listCookie}
                    onChange={(e) => set({ listCookie: e.target.value })}
                    helperText={t("cookieProfiles.listCookieHint")}
                    error={named === "" && fields.listCookie === ""}
                    slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
                    sx={{ flex: 1 }}
                  >
                    <MenuItem value="">
                      {named === ""
                        ? t("cookieProfiles.cookieAny")
                        : t("cookieProfiles.cookieOfRule", { name: named })}
                    </MenuItem>
                    {cookies.map((item) => (
                      <MenuItem key={item.name} value={item.name}>
                        {item.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </Stack>
            </>
          )}

          {fields.target !== "" && fields.target !== TO_SCORE && fields.target !== TO_DATASET && (
            <TextField
              select
              size="small"
              label={t("cookieProfiles.verb")}
              value={fields.verb}
              onChange={(e) =>
                set({
                  verb: e.target.value,
                  /*
                   * Баллы копятся в счётчиках адреса и сети -- «этот запрос» у
                   * накинутых баллов мёртвая пара, и первым по словарю стоять
                   * она не должна.
                   */
                  axis: e.target.value === "note" ? "ip" : "",
                })
              }
              helperText={
                fields.verb === ""
                  ? t("cookieProfiles.verbHint")
                  : t(`actions.verbs.${fields.verb}.hint`)
              }
            >
              {verbMenuItems(t, registry, verbs, fields.verb)}
            </TextField>
          )}

          {/*
            Фаза вызова адресата: у имени на двух фазах вызова два, и режим
            можно поставить одному. Пусто -- обоим, как без поля на проводе.
          */}
          {isControlVerb(fields.verb) && (
            <TextField
              select
              size="small"
              label={t("actions.phase.label")}
              value={fields.phase}
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

          {fields.target !== "" && fields.verb === "note" && axes.length > 1 && (
            <TextField
              select
              size="small"
              label={t("actions.counter.label")}
              value={fields.axis === "" ? "ip" : fields.axis}
              onChange={(e) => set({ axis: e.target.value })}
            >
              {axes
                .filter((axis) => axis !== "request")
                .map((axis) => (
                  <MenuItem key={axis} value={axis}>
                    {axisLabel(t, axis)}
                  </MenuItem>
                ))}
            </TextField>
          )}

          {fields.verb === "threshold" && (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label={t("actions.direction.label")}
                value={fields.direction}
                onChange={(e) =>
                  set({ direction: e.target.value as AskFields["direction"] })
                }
                sx={{ flex: 1.2 }}
              >
                <MenuItem value="stricter">{t("actions.direction.stricter")}</MenuItem>
                <MenuItem value="softer">{t("actions.direction.softer")}</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={t("actions.direction.percent")}
                value={fields.percent}
                onChange={(e) => set({ percent: e.target.value })}
                required
                helperText={t("actions.direction.percentHint")}
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {/*
            Метка: свободная строка оператора -- по ней события ищут и
            группируют в журнале. Подсказок ей взять неоткуда, проверяется
            только форма.
          */}
          {fields.verb === "mark" && (
            <TextField
              size="small"
              label={t("actions.mark.marker")}
              value={fields.marker}
              onChange={(e) => set({ marker: e.target.value })}
              required
              error={fields.marker !== "" && markerError(fields.marker) !== null}
              helperText={t("actions.mark.markerHint", { max: MARKER_MAX_BYTES })}
            />
          )}

          {/* Корзина: только для счётчика -- у него шкал несколько. */}
          {fields.verb === "note" && fields.target === "counter" && (
            <TextField
              size="small"
              label={t("actions.counter.bucket")}
              value={fields.counter}
              onChange={(e) => set({ counter: e.target.value.trim() })}
              helperText={t("actions.counter.bucketHint")}
            />
          )}

          {fields.verb === "note" && (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label={t("actions.counter.direction")}
                value={fields.noteDir}
                onChange={(e) =>
                  set({ noteDir: e.target.value as AskFields["noteDir"] })
                }
                sx={{ flex: 1.2 }}
              >
                <MenuItem value="add">{t("actions.counter.add")}</MenuItem>
                <MenuItem value="cut">{t("actions.counter.cut")}</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={t("actions.counter.percent")}
                value={fields.notePercent}
                onChange={(e) => set({ notePercent: e.target.value })}
                required
                helperText={t("actions.counter.percentHint")}
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {/* Переключить группу: что и куда, называет отправитель. */}
          {fields.verb === "mutate" && (
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label={t("actions.mutate.group")}
                value={fields.group}
                onChange={(e) => set({ group: e.target.value.trim() })}
                required
                helperText={t("actions.mutate.groupHint")}
                sx={{ flex: 1.2 }}
              />
              <TextField
                select
                size="small"
                label={t("actions.mutate.set")}
                value={fields.set}
                onChange={(e) => set({ set: e.target.value as AskFields["set"] })}
                sx={{ flex: 1 }}
              >
                <MenuItem value="on">{t("actions.mutate.on")}</MenuItem>
                <MenuItem value="off">{t("actions.mutate.off")}</MenuItem>
              </TextField>
            </Stack>
          )}

          {/* Глаголы записи: сторона, у archive -- объекты, срок и предел. */}
          <AuditFields
            verb={fields.verb}
            axis={fields.axis}
            set={fields.set}
            record={fields.record}
            ttl={fields.archiveTtl}
            when={fields.archiveWhen}
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

          {(fields.verb !== "" || fields.target === TO_DATASET) && (
            <TextField
              size="small"
              label={t("cookieProfiles.code")}
              value={fields.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              helperText={
                fields.target === TO_DATASET
                  ? t("cookieProfiles.listCodeHint")
                  : t("cookieProfiles.codeHint")
              }
            />
          )}

          {/* Что мешает сохранить -- словами, а не одной погашенной кнопкой. */}
          {blocked !== null && (
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {row === null
                ? t("common.blockedAdd", { what: blocked })
                : t("common.blockedSave", { what: blocked })}
            </Typography>
          )}
        </Stack>
    </Modal>
  );
}
