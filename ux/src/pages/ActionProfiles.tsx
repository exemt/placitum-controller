import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { Form } from "../components/Form.tsx";
import { Modal } from "../components/Modal.tsx";
import { DialogAlert } from "../components/dialog-kit.tsx";
import {
  DataTable,
  RowActionsHead,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { TableBlock } from "../components/table-block.tsx";
import { ActionRulesTable } from "../components/rules-table.tsx";
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
  type ActionWhenGroup,
  type Dataset,
  type InspectorMeta,
} from "../api.ts";
import {
  ConditionDialog,
  ConditionsTable,
  WhenGroups,
  whenReady,
  whenRename,
  whenSummary,
  whenUses,
} from "./action-conds.tsx";
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
  overloadAtLabel,
  overloadAtOf,
  overloadAtOk,
} from "../overload.ts";
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

interface AskRow {
  ask: ActionProfileAsk;
  when: ActionWhenGroup[];
  overload?: boolean;
  at?: number | null;
}

function asksOf(doc: ActionProfileDoc | undefined): AskRow[] {
  return (doc?.rules ?? []).flatMap((rule) =>
    rule.actions.map((ask) => ({
      ask,
      when: rule.when ?? [],
      overload: rule.on === "overload",
      at: rule.at ?? null,
    })),
  );
}

function rulesOf(rows: AskRow[]): ActionProfileDoc["rules"] {
  return rows.map((row) => ({
    name: "",
    ...(row.overload === true ? { on: "overload" as const, at: row.at ?? null } : {}),
    match: { pathPrefix: "", suffixes: [], static: false, methods: [] },
    when: row.overload === true ? [] : row.when,
    actions: [row.ask],
  }));
}

type WhenMode = "always" | "conds" | "overload";

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

const LIST_WRITES: readonly ListWrite[] = ["addr", "net", "net_all", "asn"];

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
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const [editingCond, setEditingCond] = useState<number | null | undefined>(undefined);
  const [condNotice, setCondNotice] = useState<string | null>(null);

  const [registry, setRegistry] = useState<ActionRegistry | null>(null);
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
      });

    fetchDatasets(scope)
      .then((rows) => {
        if (alive) {
          setDatasets(rows.filter((row) => row.kind === "list" && row.active));
        }
      })
      .catch(() => {
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

  const usedBy = (condName: string): number =>
    asks.filter((row) => whenUses(row.when, condName)).length;

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
      {editing !== undefined && (
        <AskDialog
          row={editing === null ? null : (asks[editing] ?? null)}
          conditions={conditions}
          inspectors={inspectors}
          registry={registry}
          datasets={datasets}
          onAddCondition={(cond) => setConditions((prev) => [...prev, cond])}
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

            if (before !== null && before !== undefined && before.name !== next.name) {
              setAsks((prev) =>
                prev.map((row) => ({ ...row, when: whenRename(row.when, before.name, next.name) })),
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

function summaryOf(t: Translate, ask: ActionProfileAsk): string {
  const parts: string[] = [];

  if (writesList(ask)) {
    parts.push(ask.list ?? "", t(`outcomes.writes.${ask.write ?? "addr"}`), humanTtl(ask.ttlS));

    if (ask.code !== "") {
      parts.push(ask.code);
    }

    return parts.join(" · ");
  }

  if (ask.do === "score") {
    const n = ask.value ?? 0;
    const shown = `${n > 0 ? "+" : ""}${n}`;

    return ask.code === ""
      ? t("actions.score.summary", { n: shown })
      : `${t("actions.score.summary", { n: shown })} · ${ask.code}`;
  }

  if (ask.apply !== "" && ask.apply !== "request" && !isRouteVerb(ask.do)) {
    parts.push(axisLabel(t, ask.apply));
  }

  if (ask.delta !== null) {
    parts.push(t("actionProfiles.amountShort.delta", { n: String(ask.delta) }));
  }

  if (ask.value !== null) {
    parts.push(t("actionProfiles.amountShort.value", { n: String(ask.value) }));
  }

  if (ask.marker !== "") {
    parts.push(ask.marker);
  }

  if (ask.group !== "") {
    parts.push(`${ask.group} → ${t(ask.set === "off" ? "actions.mutate.off" : "actions.mutate.on")}`);
  }

  parts.push(...phaseSummary(t, ask));

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
    <TableBlock last>
      <ActionRulesTable
        rows={asks.map((row, index) => {
          const ask = row.ask;

          return {
            key: String(index),
            when:
              row.overload === true
                ? `${t("outcomes.ons.overload")} ${overloadAtLabel(row.at)}`
                : whenSummary(t, row.when),
            target: writesList(ask)
              ? t("outcomes.toDataset")
              : ask.do === "score"
                ? t("outcomes.toRoute")
                : ask.to === ""
                  ? t("actionProfiles.toModule")
                  : ask.to,
            targetMuted: writesList(ask),
            what: writesList(ask) ? t("outcomes.outcomeWrite") : verbLabel(t, ask.do),
            params: summaryOf(t, ask),
            onEdit: () => onEdit(index),
            onRemove: () => onRemove(index),
          };
        })}
        empty={t("actionProfiles.rulesEmpty")}
        addLabel={t("actionProfiles.addRule")}
        onAdd={onAdd}
      />
    </TableBlock>
  );
}

interface AskFields {
  target: string;
  verb: string;
  axis: string;
  direction: "stricter" | "softer";
  percent: string;
  noteDir: "add" | "cut";
  notePercent: string;
  counter: string;
  group: string;
  phase: string;
  set: "on" | "off";
  marker: string;
  record: RecordDrafts;
  archiveTtl: string;
  archiveWhen: ArchiveOutcome[];
  scoreDir: "add" | "cut";
  scorePoints: string;
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
  onAddCondition,
  onSave,
  onClose,
}: {
  row: AskRow | null;
  conditions: ActionCondition[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  datasets: Dataset[];
  onAddCondition: (cond: ActionCondition) => void;
  onSave: (row: AskRow) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ask = row === null ? null : row.ask;
  const [fields, setFields] = useState<AskFields>(() => fieldsOf(ask));
  const [mode, setMode] = useState<WhenMode>(() =>
    row?.overload === true ? "overload" : (row?.when.length ?? 0) > 0 ? "conds" : "always",
  );
  const [groups, setGroups] = useState<ActionWhenGroup[]>(() =>
    row === null || row.overload === true ? [] : row.when,
  );
  const [atDraft, setAtDraft] = useState<string>(() =>
    row?.at === null || row?.at === undefined ? "" : String(row.at),
  );

  const set = (patch: Partial<AskFields>) =>
    setFields((prev) => ({ ...prev, ...patch }));

  const targets = inspectors.filter(
    (row) => verbsOf(registry, inspectors, row.name).length > 0,
  );

  const verbs = fields.target === "" ? [] : verbsOf(registry, inspectors, fields.target);
  const axes = axesFor(registry, fields.verb === "" ? [] : [fields.verb]);

  const ready = (): boolean => {
    if (mode === "overload" && !overloadAtOk(atDraft)) {
      return false;
    }

    if (mode === "conds" && !whenReady(groups)) {
      return false;
    }

    if (fields.target === TO_SCORE) {
      return numberOk(fields.scorePoints, 1, POINTS_MAX)
        && (fields.code === "" || ACTION_CODE_RE.test(fields.code));
    }

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

    if (fields.verb === "mark" && markerError(fields.marker) !== null) {
      return false;
    }

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
    const overload = mode === "overload";
    const when = mode === "conds" ? groups : [];
    const at = overload ? overloadAtOf(atDraft) : null;

    if (fields.target === TO_SCORE) {
      const magnitude = Number(fields.scorePoints);
      const ask = scoreAsk(fields.scoreDir === "cut" ? -magnitude : magnitude);

      ask.code = fields.code;
      onSave({ ask, when, overload, at });

      return;
    }

    if (fields.target === TO_DATASET) {
      onSave({
        ask: listAsk(fields.list, fields.write, ttlSeconds(fields.ttl), fields.code),
        when,
        overload,
        at,
      });

      return;
    }

    const recording = isAuditVerb(fields.verb) && fields.set === "on";
    const archiving = fields.verb === "archive" && fields.set === "on";
    const objects = recording
      ? recordObjectsPayload(fields.record)
      : { headers: null, args: null, body: null };
    const out: ActionProfileAsk = {
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

    onSave({ ask: out, when, overload, at });
  };

  return (
    <Modal
      onClose={onClose}
      size="sm"
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
          <TextField
            select
            size="small"
            label={t("actionProfiles.when")}
            value={mode}
            onChange={(e) => {
              const next = e.target.value as WhenMode;

              setMode(next);

              if (next === "conds" && groups.length === 0) {
                setGroups([[{ cond: conditions.length === 1 ? conditions[0].name : "", not: false }]]);
              }
            }}
            helperText={mode === "conds" ? t("actionProfiles.whenGroupsHint") : t("actionProfiles.whenHint")}
          >
            <MenuItem value="always">{t("actionProfiles.whenAlways")}</MenuItem>
            <MenuItem value="conds">{t("actionProfiles.whenConds")}</MenuItem>
            <MenuItem value="overload">{t("outcomes.ons.overload")}</MenuItem>
          </TextField>

          {mode === "conds" && (
            <>
              {conditions.length === 0 && (
                <DialogAlert text={t("actionProfiles.whenNoConditions")} />
              )}
              <WhenGroups
                t={t}
                groups={groups}
                conditions={conditions}
                datasets={datasets}
                onChange={setGroups}
                onAddCondition={onAddCondition}
              />
            </>
          )}

          {mode === "overload" && (
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

          <TextField
            select
            size="small"
            label={t("actionProfiles.to")}
            value={fields.target}
            onChange={(e) => {
              const target = e.target.value;

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
            {verbsOf(registry, inspectors, TO_MODULE).length > 0 && (
              <MenuItem value={TO_MODULE}>{t("actionProfiles.toModule")}</MenuItem>
            )}
            <MenuItem value={TO_SCORE}>{t("outcomes.toScore")}</MenuItem>
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

          {isControlVerb(fields.verb) && (
            <TextField
              select
              size="small"
              label={t("actions.phase.label")}
              value={fields.phase}
              onChange={(e) => set({ phase: e.target.value })}
              helperText={t("actions.phase.hint")}
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
