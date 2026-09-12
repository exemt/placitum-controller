/**
 * Профили инспектора действий: отправитель канала соседям и очков модулю.
 *
 * Профиль -- именованные условия и список просьб, и больше ничего: на каком
 * пути они срабатывают, решает маршрут, к которому инспектор привязан тегом
 * profile=. Признаков запроса в панели нет намеренно -- второй разметке путей
 * рядом с маршрутами взяться неоткуда; выборочность даёт условие.
 *
 * Сначала заводятся условия (секция «Условия», pages/action-conds.tsx): имя и
 * строки `значение · сравнение · набор | текст` по И. Потом просьбы: у каждой
 * «Когда» -- всегда, если А, если не А. Строка секции «Правила» -- одна
 * просьба; правится диалогом той же формы, что строки профиля адреса: «Когда»
 * и «Кому» первыми, «Что сделать» отфильтровано по получателю, параметры
 * глагола -- теми же полями и подписями (неймспейс `actions` i18n). Словарь
 * приезжает с `GET /api/actions`.
 *
 * В YAML загрузчика каждая просьба печатается правилом с пустым match и своим
 * `if:` / `unless:`: пустой признак совпадает со всяким запросом профиля --
 * профиль и так выбран маршрутом.
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
  MARKER_MAX_BYTES,
  axesFor,
  fetchActions,
  fetchDatasets,
  markerError,
  type ActionCondition,
  type ActionProfile,
  type ActionProfileAsk,
  type ActionProfileDoc,
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
  clearSent,
  closePanel,
  copyActionProfile,
  loadActionProfileDetail,
  loadActionProfiles,
  openPanel,
  removeActionProfile,
  restoreActionProfileThunk,
  saveActionProfileThunk,
  sendAction,
} from "../store/slices/pages/action-profiles.ts";

const PANEL_WIDTH = 720;
const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

/** Строка секции «Правила»: просьба и её условие -- всегда, если А, если не А. */
interface AskRow {
  ask: ActionProfileAsk;
  cond: string;
  negate: boolean;
}

/** Просьбы профиля одним списком: правило-обёртка -- деталь хранения, условие -- нет. */
function asksOf(doc: ActionProfileDoc | undefined): AskRow[] {
  return (doc?.rules ?? []).flatMap((rule) =>
    rule.actions.map((ask) => ({
      ask,
      cond: rule.cond ?? "",
      negate: rule.cond !== undefined && rule.cond !== "" && rule.negate === true,
    })),
  );
}

/**
 * Обратно в форму загрузчика: правило на просьбу со своим условием, признак
 * пустой, имени нет -- загрузчик подставит порядковое. Признак и имя
 * существуют ради профилей, писанных руками; панели они не нужны.
 */
function rulesOf(rows: AskRow[]): ActionProfileDoc["rules"] {
  return rows.map((row) => ({
    name: "",
    match: { pathPrefix: "", suffixes: [], static: false, methods: [] },
    cond: row.cond,
    negate: row.cond === "" ? false : row.negate,
    actions: [row.ask],
  }));
}

/** «Когда» просьбы одним словом: пусто -- всегда, `if:имя`, `unless:имя`. */
function whenKey(row: { cond: string; negate: boolean }): string {
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
function scoreAsk(value: number): ActionProfileAsk {
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

type ListWrite = NonNullable<ActionProfileAsk["write"]>;

/**
 * Кого писать в набор -- те же охваты, что у остальных отправителей: адрес
 * клиента; самый узкий анонс; все анонсы, накрывающие адрес; систему целиком.
 * Подсеть и систему инспектор берёт у гео и пишет одной пачкой.
 */
const LIST_WRITES: readonly ListWrite[] = ["addr", "net", "net_all", "asn"];

/**
 * Запись в набор: строка без адресата и глагола -- пишет сам инспектор, на
 * провод модулю она не едет. Срок обязателен.
 */
function listAsk(list: string, write: ListWrite, ttlS: number, code: string): ActionProfileAsk {
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
    ttlS,
    when: [],
    list,
    write,
    code,
  };
}

/** Строка -- запись в набор, а не просьба. */
function writesList(ask: ActionProfileAsk): boolean {
  return (ask.list ?? "") !== "";
}

export default function ActionProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.actionProfiles.rows);
  const loading = useAppSelector((s) => s.pages.actionProfiles.loading);
  const error = useAppSelector((s) => s.pages.actionProfiles.error);
  const panelId = useAppSelector((s) => s.pages.actionProfiles.panelId);
  const sending = useAppSelector((s) => s.pages.actionProfiles.sending);
  const sent = useAppSelector((s) => s.pages.actionProfiles.sent);
  const pager = usePager(rows);
  const ops = useRowOps<ActionProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyActionProfile({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeActionProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => void dispatch(loadActionProfiles(scope)),
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendAction(scope));
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
          {t("actionProfiles.sentHint")} {sent}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("actionProfiles.rulesCount")}</TableCell>
          <TableCell>{t("actionProfiles.description")}</TableCell>
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
                void dispatch(loadActionProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{asksOf(row.doc).length}</TableCell>
              <TableCell>{row.description}</TableCell>
              {ops.cell(row, {
                remove:
                  row.name === "default" ? t("actionProfiles.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("actionProfiles.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadActionProfiles(scope))} />
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
          <ActionProfileForm
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

function ActionProfileForm({
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
  const detail = useAppSelector((s) => s.pages.actionProfiles.detail);
  const inspectors = useAppSelector((s) => s.pages.actionProfiles.inspectors);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState<ActionCondition[]>([]);
  const [asks, setAsks] = useState<AskRow[]>([]);
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
      saveActionProfileThunk({
        scope,
        id,
        name,
        description,
        doc: { description, conditions, rules: rulesOf(asks) },
      }),
    );
  };

  /**
   * Сколько правил и строк других условий стоит на условии: снять такое
   * нельзя, пока они его держат.
   */
  const usedBy = (condName: string): number =>
    asks.filter((row) => row.cond === condName).length + refsTo(conditions, condName);

  const removeCondition = (index: number) => {
    const cond = conditions[index];

    if (cond === undefined) {
      return;
    }

    const n = usedBy(cond.name);

    if (n > 0) {
      setCondNotice(t("actionProfiles.condInUse", { name: cond.name, n: String(n) }));

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
          void dispatch(restoreActionProfileThunk({ scope, id }));
        };
  const [copyOpen, setCopyOpen] = useState(false);

  return (
    <Form id="action-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("actionProfiles.newTitle") : t("actionProfiles.editTitle")}
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
          title={t("actionProfiles.sectionProfile")}
          hint={t("actionProfiles.sectionProfileHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("actionProfiles.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("actionProfiles.description")}
              value={description}
              onChange={setDescription}
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("actionProfiles.sectionConditions")}
          hint={t("actionProfiles.conditionsHint")}
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
          title={t("actionProfiles.sectionRules")}
          hint={t("actionProfiles.rulesHint")}
          flush
          defaultExpanded
        >
          {unknownTargets.length > 0 && (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              {t("actionProfiles.unknownTargets")}: {unknownTargets.join(", ")}
            </Alert>
          )}
          <AsksTable
            t={t}
            asks={asks}
            onAdd={() => setEditing(null)}
            onEdit={setEditing}
            onRemove={(index) =>
              setAsks((prev) => prev.filter((_row, i) => i !== index))
            }
          />
        </Section>

        {registry === null && (
          <Alert severity="warning">{t("actionProfiles.noRegistry")}</Alert>
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
            onClick={() => void dispatch(removeActionProfile({ scope, id }))}
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
              saveActionProfileThunk({
                scope,
                id: null,
                name: next,
                description,
                doc: { description, conditions, rules: rulesOf(asks) },
              }),
            );
            setCopyOpen(false);
          }}
        />
      )}
      {editing !== undefined && (
        <AskDialog
          row={editing === null ? null : (asks[editing] ?? null)}
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
function summaryOf(t: Translate, ask: ActionProfileAsk): string {
  const parts: string[] = [];

  /* Запись в набор: куда, кого и на сколько. */
  if (writesList(ask)) {
    parts.push(ask.list ?? "", t(`outcomes.writes.${ask.write ?? "addr"}`), humanTtl(ask.ttlS));

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
    parts.push(t("actionProfiles.amountShort.delta", { n: String(ask.delta) }));
  }

  if (ask.value !== null) {
    parts.push(t("actionProfiles.amountShort.value", { n: String(ask.value) }));
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
  onAdd,
  onEdit,
  onRemove,
}: {
  t: Translate;
  asks: AskRow[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <TableBlock
      title={t("actionProfiles.sectionRules")}
      label={t("actionProfiles.rulesHint")}
      last
    >
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("actionProfiles.when")} width={150} />
            <HeadCell label={t("actionProfiles.to")} width={130} />
            <HeadCell label={t("actionProfiles.verb")} width={170} />
            <HeadCell label={t("actionProfiles.params")} />
            <AddCell label={t("actionProfiles.addRule")} onAdd={onAdd} />
          </TableRow>
        </TableHead>
        <TableBody>
          {asks.length === 0 && (
            <TableNoticeRow
              colSpan={5}
              kind="empty"
              message={t("actionProfiles.rulesEmpty")}
            />
          )}
          {asks.map((row, index) => {
            const ask = row.ask;

            return (
              <TableRow key={index} hover>
                <TextCell text={whenLabel(t, row.cond, row.negate)} muted={row.cond === ""} />
                {/*
                  Запись маршрута, очки и запись в набор адресата на проводе не
                  несут: у каждого свой пункт «Кому».
                */}
                <TextCell
                  text={
                    writesList(ask)
                      ? t("outcomes.toDataset")
                      : ask.do === "score"
                        ? t("outcomes.toRoute")
                        : ask.to === ""
                          ? t("actionProfiles.toModule")
                          : ask.to
                  }
                  muted={writesList(ask)}
                />
                <TextCell text={writesList(ask) ? t("outcomes.outcomeWrite") : verbLabel(t, ask.do)} />
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
  ttl: string;
  code: string;
}

function fieldsOf(ask: ActionProfileAsk | null): AskFields {
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
  conditions,
  inspectors,
  registry,
  datasets,
  onSave,
  onClose,
}: {
  /** null -- заводим новую просьбу. */
  row: AskRow | null;
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
  const whenOptions: { key: string; label: string }[] = [
    { key: "", label: whenLabel(t, "", false) },
    ...conditions.flatMap((cond) => [
      { key: `if:${cond.name}`, label: whenLabel(t, cond.name, false) },
      { key: `unless:${cond.name}`, label: whenLabel(t, cond.name, true) },
    ]),
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

  const ready = (): boolean => {
    /* Очки: глагола нет, есть величина 1..100 и направление. */
    if (fields.target === TO_SCORE) {
      return numberOk(fields.scorePoints, 1, POINTS_MAX)
        && (fields.code === "" || ACTION_CODE_RE.test(fields.code));
    }

    /* Запись в набор: куда и на сколько -- срок обязателен, охват выбран всегда. */
    if (fields.target === TO_DATASET) {
      return fields.list !== "" && ttlSeconds(fields.ttl) > 0
        && (fields.code === "" || ACTION_CODE_RE.test(fields.code));
    }

    if (fields.target === "" || fields.verb === "") {
      return false;
    }

    if (fields.verb === "threshold") {
      const cap = fields.direction === "softer" ? 100 : 900;

      if (!numberOk(fields.percent, 1, cap)) {
        return false;
      }
    }

    if (fields.verb === "note" && !numberOk(fields.notePercent, 1, 100)) {
      return false;
    }

    if (fields.verb === "mutate" && !GROUP_NAME_RE.test(fields.group.trim())) {
      return false;
    }

    /* Пометить: без метки просьбы нет, и битую метку модуль не примет. */
    if (fields.verb === "mark" && markerError(fields.marker) !== null) {
      return false;
    }

    /* Журнал и архив: срок и размеры объектов обязаны читаться. */
    if (isAuditVerb(fields.verb) && fields.set === "on") {
      if (fields.verb === "archive" && fields.archiveTtl.trim() !== "" && ttlSeconds(fields.archiveTtl) <= 0) {
        return false;
      }

      if (!recordDraftsReady(fields.verb, fields.record)) {
        return false;
      }
    }

    return fields.code === "" || ACTION_CODE_RE.test(fields.code);
  };

  const save = () => {
    const { cond, negate } = whenOf(when);

    if (fields.target === TO_SCORE) {
      const magnitude = Number(fields.scorePoints);
      const ask = scoreAsk(fields.scoreDir === "cut" ? -magnitude : magnitude);

      ask.code = fields.code;
      onSave({ ask, cond, negate });

      return;
    }

    if (fields.target === TO_DATASET) {
      onSave({
        ask: listAsk(fields.list, fields.write, ttlSeconds(fields.ttl), fields.code),
        cond,
        negate,
      });

      return;
    }

    const recording = isAuditVerb(fields.verb) && fields.set === "on";
    const archiving = fields.verb === "archive" && fields.set === "on";
    const objects = recording
      ? recordObjectsPayload(fields.record)
      : { headers: null, args: null, body: null };
    const out: ActionProfileAsk = {
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

    onSave({ ask: out, cond, negate });
  };

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={
        ask === null ? t("actionProfiles.addRule") : t("actionProfiles.editRule")
      }
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready()} onClick={save}>
            {ask === null ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2}>
          {/* Когда: всегда, если А, если не А. Условия заводятся в секции профиля. */}
          <TextField
            select
            size="small"
            label={t("actionProfiles.when")}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            helperText={
              conditions.length === 0
                ? t("actionProfiles.whenNoConditions")
                : t("actionProfiles.whenHint")
            }
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
          >
            {whenOptions.map((option) => (
              <MenuItem key={option.key} value={option.key}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label={t("actionProfiles.to")}
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
            helperText={t("actionProfiles.toHint")}
          >
            {targets.map((row) => (
              <MenuItem key={row.uuid} value={row.name}>
                {row.name}
              </MenuItem>
            ))}
            {/* Запись маршрута -- глаголы из словаря; очки -- своим пунктом. */}
            {verbsOf(registry, inspectors, TO_MODULE).length > 0 && (
              <MenuItem value={TO_MODULE}>{t("actionProfiles.toModule")}</MenuItem>
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
                      {t(`outcomes.writes.${write}`)}
                    </MenuItem>
                  ))}
                </TextField>
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
              </Stack>
            </>
          )}

          {fields.target !== "" && fields.target !== TO_SCORE && fields.target !== TO_DATASET && (
            <TextField
              select
              size="small"
              label={t("actionProfiles.verb")}
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
                  ? t("actionProfiles.verbHint")
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
              label={t("actionProfiles.code")}
              value={fields.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              helperText={
                fields.target === TO_DATASET
                  ? t("actionProfiles.listCodeHint")
                  : t("actionProfiles.codeHint")
              }
            />
          )}
        </Stack>
    </Modal>
  );
}
