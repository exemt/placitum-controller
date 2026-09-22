import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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

import { Form } from "../components/Form.tsx";
import { Modal } from "../components/Modal.tsx";
import { DialogAlert, DialogFrame, DialogSection } from "../components/dialog-kit.tsx";
import {
  DataTable,
  RowActionsHead,
  TableNoticeRow,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { flushTableSx, HeadCell, TableBlock } from "../components/table-block.tsx";
import { ActionRulesTable, AddCell, RowActions, TextCell } from "../components/rules-table.tsx";
import { SettingsTable } from "../components/settings-table.tsx";
import { Section, Text } from "../components/fields.tsx";
import {
  COOKIE_PHASES,
  COOKIE_SIGNS,
  COOKIE_WRITES,
  MARKER_MAX_BYTES,
  axesFor,
  fetchActions,
  fetchDatasets,
  markerError,
  type ActionProfileMatch,
  type CookieDecl,
  type CookieListed,
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
import { ACTION_CODE_RE, axisLabel, verbLabel } from "../components/action-select.tsx";
import { isAddressDataset, VariableEdit } from "../config/VariableEdit.tsx";
import { ACTION_CATALOG } from "./action-conds.tsx";
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
  copyCookieProfile,
  loadCookieProfileDetail,
  loadCookieProfiles,
  openPanel,
  removeCookieProfile,
  restoreCookieProfileThunk,
  saveCookieProfileThunk,
  sendCookie,
} from "../store/slices/pages/cookie-profiles.ts";

const PANEL_WIDTH = 908;
const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

const TO_SELF = "@self";

interface AskRow {
  ask: CookieProfileAsk | null;
  phase: CookiePhase | "";
  status: number[];
  match: ActionProfileMatch;
  on: CookieState | "overload" | "";
  tags: string[];
  tagsNot: boolean;
  listed: CookieListed | null;
  cookie: string;
  issue: string;
  drop: string;
  at?: number | null;
}

const ANY_REQUEST: ActionProfileMatch = { pathPrefix: "", suffixes: [], static: false, methods: [] };

function asksOf(doc: CookieProfileDoc | undefined): AskRow[] {
  return (doc?.rules ?? []).flatMap((rule) => {
    const head = {
      phase: rule.phase ?? "",
      status: rule.status ?? [],
      match: rule.match ?? ANY_REQUEST,
      on: rule.on ?? "",
      tags: rule.tags ?? [],
      tagsNot: (rule.tags ?? []).length > 0 && rule.tagsNot === true,
      listed: rule.listed ?? null,
      cookie: rule.cookie ?? "",
      issue: "",
      drop: "",
      at: rule.at ?? null,
    };

    const rows: AskRow[] = [];

    if ((rule.issue ?? "") !== "" || (rule.drop ?? "") !== "") {
      rows.push({ ...head, issue: rule.issue ?? "", drop: rule.drop ?? "", ask: null });
    }

    for (const ask of rule.actions) {
      rows.push({ ...head, cookie: head.cookie || rule.issue || rule.drop || "", ask });
    }

    return rows;
  });
}

function rulesOf(rows: AskRow[]): CookieProfileDoc["rules"] {
  return rows.map((row) => ({
    name: "",
    match: row.match,
    phase: row.phase,
    status: row.phase === "response" ? row.status : [],
    on: row.on,
    ...(row.on === "overload" ? { at: row.at ?? null } : {}),
    cookie: row.cookie,
    tags: row.tags,
    tagsNot: row.tags.length > 0 && row.tagsNot,
    listed: row.listed,
    issue: row.issue,
    drop: row.drop,
    actions: row.ask === null ? [] : [row.ask],
  }));
}

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

/*
 * What a rule puts into a list: the value of the cookie or the address of the client. The whole
 * cookie string (write: cookie) is for a check outside the cookie inspector -- auto-actions or the
 * node compare the string as the browser sends it; the panel offers it only on a row that has it.
 */
const LIST_WRITES: readonly ListWrite[] = COOKIE_WRITES.filter((write) => write !== "cookie");

/* The value of the cookie or the whole cookie: both need to know which cookie. */
function writesCookie(write: ListWrite): boolean {
  return write === "value" || write === "cookie";
}

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
    cookie: writesCookie(write) ? cookie : "",
    code,
  };
}

function writesList(ask: CookieProfileAsk | null): boolean {
  return ask !== null && (ask.list ?? "") !== "";
}

function rowCookie(row: AskRow, cookies: CookieDecl[]): string {
  const named = row.cookie || row.issue || row.drop;

  if (named !== "") {
    return named;
  }

  return cookies.length === 1 ? cookies[0].name : "";
}

type Trigger = "always" | "absent" | "present" | "expired" | "invalid" | "overload";

const TRIGGERS: readonly Trigger[] = [
  "always",
  "absent",
  "present",
  "expired",
  "invalid",
  "overload",
];

function triggerOf(row: AskRow): Trigger {
  if (row.on === "overload") {
    return "overload";
  }

  return row.on === "" ? "always" : row.on;
}

/*
 * A value exists only on a cookie that is there and ours: present or due for renewal. The value
 * check is offered for those states and for "always".
 */
function labelled(trigger: Trigger): boolean {
  return trigger === "always" || trigger === "present" || trigger === "expired";
}

/*
 * One check of the value: one of or none of the values typed in the rule (tags / not_tags), in a
 * list or not in it (listed). The list is any string list, dynamic or static.
 */
type ValueMode = "any" | "one_of" | "none_of" | "in" | "not_in";

const VALUE_MODES: readonly ValueMode[] = ["any", "one_of", "none_of", "in", "not_in"];

function valueModeOf(row: AskRow | null): ValueMode {
  if (row === null) {
    return "any";
  }

  if (row.listed !== null) {
    return row.listed.op === "not_in" ? "not_in" : "in";
  }

  if (row.tags.length > 0) {
    return row.tagsNot ? "none_of" : "one_of";
  }

  return "any";
}

const RULE_TAG_RE = /^[A-Za-z0-9_-]{1,128}$/;
const METHOD_RE = /^[A-Z]+$/;
const STATUS_RE = /^[1-5][0-9][0-9]$/;
const METHOD_PRESETS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const STATUS_PRESETS = ["200", "201", "204", "301", "302", "304", "400", "401", "403", "404", "429", "500", "502", "503"];

function whenText(t: Translate, row: AskRow, cookies: CookieDecl[]): string {
  if (row.on === "overload") {
    return `${t("outcomes.ons.overload")} ${overloadAtLabel(row.at)}`;
  }

  const parts: string[] = [];
  const trigger = triggerOf(row);

  if (trigger !== "always") {
    const said = t(`cookieProfiles.triggers.${trigger}`);
    const named = rowCookie(row, cookies);

    parts.push(cookies.length > 1 && named !== "" ? `${named}: ${said}` : said);
  }

  if (row.tags.length > 0) {
    parts.push(
      t(row.tagsNot ? "cookieProfiles.labelNotShort" : "cookieProfiles.labelShort", {
        tags: row.tags.join(", "),
      }),
    );
  }

  if (row.listed !== null) {
    parts.push(
      t(row.listed.op === "not_in" ? "cookieProfiles.notListedShort" : "cookieProfiles.listedShort", {
        list: row.listed.list,
      }),
    );
  }

  if (row.phase !== "") {
    parts.push(t(`cookieProfiles.phasesAt.${row.phase}`));
  }

  if (row.phase === "response" && row.status.length > 0) {
    parts.push(row.status.join(", "));
  }

  if (row.match.pathPrefix !== "") {
    parts.push(t("cookieProfiles.pathShort", { path: row.match.pathPrefix }));
  }

  if (row.match.methods.length > 0) {
    parts.push(row.match.methods.join(", "));
  }

  if (row.match.suffixes.length > 0 || row.match.static) {
    parts.push(t("cookieProfiles.suffixesShort"));
  }

  return parts.length === 0 ? t("cookieProfiles.triggers.always") : parts.join(" · ");
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
  const [asks, setAsks] = useState<AskRow[]>([]);
  const [editingCookie, setEditingCookie] = useState<number | null | undefined>(undefined);
  const [cookieNotice, setCookieNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

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
          setDatasets(rows.filter((row) => row.kind === "list"));
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
    setCookies(detail.doc.cookies ?? []);
    setAsks(asksOf(detail.doc));
  }, [id, detail]);

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
        doc: { description, cookies, rules: rulesOf(asks) },
      }),
    );
  };

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
    </Form>
  );
}

function summaryOf(t: Translate, ask: CookieProfileAsk | null): string {
  if (ask === null) {
    return "";
  }

  const parts: string[] = [];

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
    parts.push(t("cookieProfiles.amountShort.delta", { n: String(ask.delta) }));
  }

  if (ask.value !== null) {
    parts.push(t("cookieProfiles.amountShort.value", { n: String(ask.value) }));
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
  return (
    <TableBlock last>
      <ActionRulesTable
        rows={asks.map((row, index) => {
          const ask = row.ask;

          return {
            key: String(index),
            when: whenText(t, row, cookies),
            target:
              ask === null
                ? t("cookieProfiles.toSelf")
                : writesList(ask)
                  ? t("outcomes.toDataset")
                  : ask.do === "score"
                    ? t("outcomes.toRoute")
                    : ask.to === ""
                      ? t("cookieProfiles.toModule")
                      : ask.to,
            targetMuted: ask !== null && writesList(ask),
            what:
              ask === null
                ? row.drop !== ""
                  ? t("cookieProfiles.opDrop")
                  : t("cookieProfiles.opIssue")
                : writesList(ask)
                  ? t("outcomes.outcomeWrite")
                  : verbLabel(t, ask.do),
            params: ask === null ? rowCookie(row, cookies) : summaryOf(t, ask),
            onEdit: () => onEdit(index),
            onRemove: () => onRemove(index),
          };
        })}
        empty={t("cookieProfiles.rulesEmpty")}
        addLabel={t("cookieProfiles.addRule")}
        onAdd={onAdd}
      />
    </TableBlock>
  );
}

function ageLabel(t: Translate, seconds: number): string {
  return seconds === 0 ? t("cookieProfiles.session") : humanTtl(seconds);
}

function valueLabel(t: Translate, decl: CookieDecl): string {
  const parts: string[] = [];
  const source = valueSourceOf(decl.value);

  switch (source) {
    case "request":
      parts.push(decl.value.from);

      if (decl.value.default !== "") {
        parts.push(t("cookieProfiles.valueFallbackShort", { text: decl.value.default }));
      }

      break;
    case "const":
      parts.push(decl.value.default);
      break;
    case "uid":
      parts.push(t("cookieProfiles.valueUidShort", { n: String(decl.value.random) }));
      break;
  }

  /* A cookie written by hand or through the API may carry a number next to its value. */
  if (decl.value.random > 0 && source !== "uid") {
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
            <TableNoticeRow colSpan={6} kind="empty" message={t("cookieProfiles.cookiesEmpty")} />
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

const COOKIE_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const TAG_RE = /^[A-Za-z0-9_-]*$/;

/*
 * What the value of a cookie is: a unique number (uid) of its own for every client, a concrete
 * value, the same for everyone, or a request variable (with a fallback when the request has none).
 * In the file: value.random, value.default, value.from.
 */
type ValueSource = "uid" | "const" | "request";

const VALUE_SOURCES: readonly ValueSource[] = ["uid", "const", "request"];

function valueSourceOf(value: CookieDecl["value"]): ValueSource {
  if (value.from !== "") {
    return "request";
  }

  return value.default !== "" ? "const" : "uid";
}

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

  const [source, setSource] = useState<ValueSource>(() =>
    decl === null ? "uid" : valueSourceOf(decl.value),
  );

  const set = (patch: Partial<CookieDecl>) => setDraft((prev) => ({ ...prev, ...patch }));
  const setValue = (patch: Partial<CookieDecl["value"]>) =>
    setDraft((prev) => ({ ...prev, value: { ...prev.value, ...patch } }));

  const name = draft.name.trim();
  const nameOk = COOKIE_NAME_RE.test(name) && !taken.includes(name);
  const maxAgeS = maxAge.trim() === "" ? 0 : ttlSeconds(maxAge);
  const renewS = renew.trim() === "" ? 0 : ttlSeconds(renew);
  const constant = draft.value.default.trim();
  const defaultOk = TAG_RE.test(constant) && constant.length <= 128;
  const randomOk = source !== "uid" || (draft.value.random >= 1 && draft.value.random <= 32);
  const maxLenOk = draft.value.maxLen >= 1 && draft.value.maxLen <= 128;
  const hasSource =
    source === "request"
      ? draft.value.from.trim() !== ""
      : source === "const"
        ? constant !== ""
        : draft.value.random > 0;

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
                  from: source === "request" ? draft.value.from.trim() : "",
                  default: source === "uid" ? "" : constant,
                  random: source === "uid" ? draft.value.random : 0,
                  maxLen:
                    source === "const" ? Math.max(draft.value.maxLen, constant.length) : draft.value.maxLen,
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
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label={t("cookieProfiles.valueSource")}
            value={source}
            onChange={(e) => {
              const next = e.target.value as ValueSource;

              setSource(next);

              if (next === "uid" && draft.value.random === 0) {
                setValue({ random: emptyCookie().value.random });
              }
            }}
            helperText={t(`cookieProfiles.valueSourceHints.${source}`)}
            sx={{ flex: 1.4 }}
          >
            {VALUE_SOURCES.map((item) => (
              <MenuItem key={item} value={item}>
                {t(`cookieProfiles.valueSources.${item}`)}
              </MenuItem>
            ))}
          </TextField>
          {source === "uid" ? (
            <TextField
              size="small"
              label={t("cookieProfiles.valueRandom")}
              value={String(draft.value.random)}
              onChange={(e) => setValue({ random: Number(e.target.value.trim()) || 0 })}
              error={!randomOk}
              helperText={t("cookieProfiles.valueRandomHint")}
              sx={{ flex: 1 }}
            />
          ) : (
            <Box sx={{ flex: 1 }} />
          )}
        </Stack>
        {source === "request" && (
          <>
            <DialogFrame label={t("cookieProfiles.valueFrom")} hint={t("cookieProfiles.valueFromHint")}>
              <VariableEdit
                value={draft.value.from}
                catalog={ACTION_CATALOG}
                onChange={(from) => setValue({ from })}
              />
            </DialogFrame>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label={t("cookieProfiles.valueFallback")}
                value={draft.value.default}
                onChange={(e) => setValue({ default: e.target.value })}
                error={!defaultOk}
                helperText={t("cookieProfiles.valueFallbackHint")}
                sx={{ flex: 1.4 }}
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
          </>
        )}
        {source === "const" && (
          <TextField
            size="small"
            label={t("cookieProfiles.valueConst")}
            value={draft.value.default}
            onChange={(e) => setValue({ default: e.target.value })}
            required
            error={!defaultOk}
            helperText={t("cookieProfiles.valueConstHint")}
          />
        )}
        {(!hasSource || !randomOk) && (
          <Alert severity="warning" icon={false}>
            {t(source === "uid" ? "cookieProfiles.valueNeedRandom" : "cookieProfiles.valueEmpty")}
          </Alert>
        )}
        <DialogAlert text={t("cookieProfiles.cookieAlert")} help="06-cookie#куки" />
      </Stack>
    </Modal>
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
  op: "add" | "remove";
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

/*
 * A marker is a string with slots in braces, filled from the cookies of the request: {value} the
 * value of the rule's cookie, {name} its name, {<name>} the value of any cookie of the profile. A
 * slot of a cookie with no value leaves the request without the marker.
 */
const OWN_SLOTS = ["value", "tag", "name"];

function markerSlots(marker: string): { slots: string[]; unpaired: boolean } {
  const slots: string[] = [];
  let rest = marker;

  for (;;) {
    const open = rest.indexOf("{");
    const close = rest.indexOf("}");

    if (open < 0) {
      return { slots, unpaired: close >= 0 };
    }

    if (close >= 0 && close < open) {
      return { slots, unpaired: true };
    }

    const end = rest.indexOf("}", open);

    if (end < 0) {
      return { slots, unpaired: true };
    }

    slots.push(rest.slice(open + 1, end));
    rest = rest.slice(end + 1);
  }
}

function markerSlotError(
  marker: string,
  own: string,
  valued: boolean,
  cookies: CookieDecl[],
): { key: string; slot: string } | null {
  const { slots, unpaired } = markerSlots(marker);

  if (unpaired) {
    return { key: "cookieProfiles.needMarkerBrace", slot: "" };
  }

  for (const slot of slots) {
    if (OWN_SLOTS.includes(slot)) {
      if (own === "") {
        return { key: "cookieProfiles.needMarkerOwn", slot };
      }

      if (!valued && slot !== "name") {
        return { key: "cookieProfiles.needMarkerNoValue", slot };
      }

      continue;
    }

    if (!cookies.some((item) => item.name === slot)) {
      return { key: "cookieProfiles.needMarkerSlot", slot };
    }
  }

  return null;
}

/*
 * The marker field with buttons that insert a slot where the cursor is. valued is false where the
 * rule's cookie has no value (no cookie, a bad signature): its slots are not offered, the values of
 * the other cookies are.
 */
function MarkerField({
  t,
  value,
  own,
  valued,
  cookies,
  onChange,
}: {
  t: Translate;
  value: string;
  own: string;
  valued: boolean;
  cookies: CookieDecl[];
  onChange: (next: string) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const bad = markerSlotError(value, own, valued, cookies);
  const mine = own !== "" && valued;
  const others = cookies.filter((item) => item.name !== own);

  const slots: { token: string; label: string }[] = [
    ...(mine ? [{ token: "{value}", label: t("cookieProfiles.markerSlotValue", { name: own }) }] : []),
    ...others.map((item) => ({
      token: `{${item.name}}`,
      label: t("cookieProfiles.markerSlotCookie", { name: item.name }),
    })),
  ];

  const hint =
    own !== "" && !valued
      ? t(others.length > 0 ? "cookieProfiles.markerHintOthers" : "cookieProfiles.markerHintPlain", {
          name: own,
          max: MARKER_MAX_BYTES,
        })
      : t("cookieProfiles.markerHint", { max: MARKER_MAX_BYTES });

  const insert = (token: string) => {
    const el = input.current;
    const from = el?.selectionStart ?? value.length;
    const to = el?.selectionEnd ?? from;
    const next = value.slice(0, from) + token + value.slice(to);

    onChange(next);

    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from + token.length, from + token.length);
    });
  };

  return (
    <Stack spacing={0.75}>
      <TextField
        size="small"
        label={t("actions.mark.marker")}
        value={value}
        inputRef={input}
        placeholder={mine ? "client_{value}" : "first_visit"}
        onChange={(e) => onChange(e.target.value)}
        required
        error={value !== "" && (markerError(value) !== null || bad !== null)}
        helperText={bad !== null ? t(bad.key, { slot: bad.slot }) : hint}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {slots.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
          <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", mr: 0.5 }}>
            {t("cookieProfiles.markerInsert")}
          </Typography>
          {slots.map((slot) => (
            <Chip
              key={slot.token}
              size="small"
              variant="outlined"
              label={
                <>
                  <Box component="span" sx={{ fontFamily: "monospace", mr: 0.75 }}>
                    {slot.token}
                  </Box>
                  {slot.label}
                </>
              }
              onClick={() => insert(slot.token)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function numberOk(raw: string, min: number, max: number): boolean {
  if (raw.trim() === "") {
    return false;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= min && n <= max;
}

function ChipsField({
  label,
  helper,
  badHelper,
  value,
  options,
  valid,
  parse = (raw) => raw,
  required,
  onChange,
}: {
  label: string;
  helper: string;
  badHelper: (item: string) => string;
  value: string[];
  options: readonly string[];
  valid: (item: string) => boolean;
  parse?: (raw: string) => string;
  required?: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const bad = value.find((item) => !valid(item));

  const commit = (next: string[]) => {
    onChange([...new Set(next.map((item) => parse(item.trim())).filter((item) => item !== ""))]);
    setDraft("");
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      size="small"
      options={[...new Set(options)].filter((option) => !value.includes(option))}
      value={value}
      inputValue={draft}
      onInputChange={(_e, next, reason) => {
        const why: string = reason;

        if (why === "input" && /[,\s]$/.test(next)) {
          commit([...value, next.slice(0, -1)]);

          return;
        }

        if (why !== "reset") {
          setDraft(next);
        }
      }}
      onChange={(_e, next) => commit(next)}
      sx={{ flex: 1, minWidth: 0 }}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label={label}
          required={required}
          error={bad !== undefined}
          helperText={bad === undefined ? helper : badHelper(bad)}
        />
      )}
    />
  );
}

function AskDialog({
  row,
  cookies,
  inspectors,
  registry,
  datasets,
  onSave,
  onClose,
}: {
  row: AskRow | null;
  cookies: CookieDecl[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  datasets: Dataset[];
  onSave: (row: AskRow) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ask = row === null ? null : row.ask;
  const [fields, setFields] = useState<AskFields>(() => {
    const init = fieldsOf(ask);

    if (row === null ? cookies.length > 0 : ask === null) {
      init.target = TO_SELF;
    }

    return init;
  });
  const [trigger, setTrigger] = useState<Trigger>(() =>
    row === null ? (cookies.length > 0 ? "absent" : "always") : triggerOf(row),
  );
  const [tags, setTags] = useState<string[]>(() => row?.tags ?? []);
  const [valueMode, setValueMode] = useState<ValueMode>(() => valueModeOf(row));
  const [listName, setListName] = useState<string>(() => row?.listed?.list ?? "");
  const [pathPrefix, setPathPrefix] = useState<string>(() => row?.match.pathPrefix ?? "");
  const [methods, setMethods] = useState<string[]>(() => row?.match.methods ?? []);
  const [statuses, setStatuses] = useState<string[]>(() => (row?.status ?? []).map(String));
  const [atDraft, setAtDraft] = useState<string>(() =>
    row?.at === null || row?.at === undefined ? "" : String(row.at),
  );
  const [phase, setPhase] = useState<CookiePhase | "">(() => row?.phase ?? "");
  const [cookie, setCookie] = useState<string>(
    () => row?.cookie || row?.issue || row?.drop || "",
  );
  const [op, setOp] = useState<"issue" | "drop">(() =>
    row !== null && row.drop !== "" ? "drop" : "issue",
  );

  const overload = trigger === "overload";
  const self = fields.target === TO_SELF;

  const named = cookie || (cookies.length === 1 ? cookies[0].name : "");
  const decl = cookies.find((item) => item.name === named);

  const valueChecked = !overload && labelled(trigger);
  const byLabel = valueChecked && (valueMode === "one_of" || valueMode === "none_of");
  const byList = valueChecked && (valueMode === "in" || valueMode === "not_in");
  const needsCookie = !overload && (trigger !== "always" || self || byLabel || byList);

  /* A cookie value is a string: an address list cannot hold it. A check compares with any string list. */
  const stringLists = datasets.filter((row) => !isAddressDataset(row.type));

  /*
   * Lists a write can go to: only dynamic ones, as keeper writes them. The value of a cookie goes
   * into a string list, a network or a system only into an address list.
   */
  const dynamic = datasets.filter((row) => row.active);
  const writable = writesCookie(fields.write)
    ? dynamic.filter((row) => !isAddressDataset(row.type))
    : fields.write === "addr"
      ? dynamic
      : dynamic.filter((row) => isAddressDataset(row.type));

  const triggers = TRIGGERS.filter((item) => {
    if (item === "always" || item === "overload") {
      return true;
    }

    if (cookies.length === 0) {
      return false;
    }

    if (item === "invalid") {
      return decl === undefined || decl.sign === "hmac";
    }

    if (item === "expired") {
      return decl === undefined || (decl.sign === "hmac" && decl.renewAfterS > 0);
    }

    return true;
  });

  if (!triggers.includes(trigger)) {
    triggers.push(trigger);
  }

  const set = (patch: Partial<AskFields>) =>
    setFields((prev) => ({ ...prev, ...patch }));

  const targets = inspectors.filter(
    (row) => verbsOf(registry, inspectors, row.name).length > 0,
  );

  const verbs =
    fields.target === "" || self ? [] : verbsOf(registry, inspectors, fields.target);
  const axes = axesFor(registry, fields.verb === "" ? [] : [fields.verb]);

  const codeOk = fields.code === "" || ACTION_CODE_RE.test(fields.code);
  const badTag = tags.find((tag) => !RULE_TAG_RE.test(tag));
  const badMethod = methods.find((method) => !METHOD_RE.test(method));
  const badStatus = statuses.find((code) => !STATUS_RE.test(code));
  const path = pathPrefix.trim();

  const blocker = (): string | null => {
    if (overload && !overloadAtOk(atDraft)) {
      return t("cookieProfiles.needOverloadAt", {
        min: String(OVERLOAD_AT_MIN),
        max: String(OVERLOAD_AT_MAX),
      });
    }

    if (overload && (fields.target === "" || self)) {
      return t("cookieProfiles.needOverloadAsk");
    }

    if (byLabel && tags.length === 0) {
      return t("cookieProfiles.needTags");
    }

    if (byLabel && badTag !== undefined) {
      return t("cookieProfiles.needTagsFix", { tag: badTag });
    }

    if (byList && listName === "") {
      return t("cookieProfiles.needListed");
    }

    if (!overload && path !== "" && !path.startsWith("/")) {
      return t("cookieProfiles.needPathSlash");
    }

    if (!overload && badMethod !== undefined) {
      return t("cookieProfiles.needMethodFix", { method: badMethod });
    }

    if (!overload && phase === "response" && badStatus !== undefined) {
      return t("cookieProfiles.needStatusFix", { code: badStatus });
    }

    if (needsCookie && named === "") {
      return cookies.length === 0
        ? t("cookieProfiles.needCookieDecl")
        : t("cookieProfiles.needCookie");
    }

    if (self) {
      return null;
    }

    if (fields.target === "") {
      return t("cookieProfiles.needTarget");
    }

    if (fields.target === TO_SCORE) {
      if (!numberOk(fields.scorePoints, 1, POINTS_MAX)) {
        return t("cookieProfiles.needPoints", { max: String(POINTS_MAX) });
      }

      return codeOk ? null : t("cookieProfiles.needCode");
    }

    if (fields.target === TO_DATASET) {
      if (fields.list === "") {
        return t("cookieProfiles.needList");
      }

      if (writesCookie(fields.write) && named === "" && fields.listCookie === "") {
        return t("cookieProfiles.needCookie");
      }

      if (fields.op !== "remove" && ttlSeconds(fields.ttl) <= 0) {
        return t("cookieProfiles.needTtl");
      }

      return codeOk ? null : t("cookieProfiles.needCode");
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

    if (fields.verb === "mark" && markerError(fields.marker) !== null) {
      return t("cookieProfiles.needMarker");
    }

    if (fields.verb === "mark") {
      const bad = markerSlotError(
        fields.marker,
        overload ? "" : named,
        trigger !== "absent" && trigger !== "invalid",
        cookies,
      );

      if (bad !== null) {
        return t(bad.key, { slot: bad.slot });
      }
    }

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

  const head: Omit<AskRow, "ask"> = overload
    ? {
        phase: "",
        status: [],
        match: ANY_REQUEST,
        on: "overload",
        tags: [],
        tagsNot: false,
        listed: null,
        cookie: "",
        issue: "",
        drop: "",
        at: overloadAtOf(atDraft),
      }
    : {
        phase,
        status: phase === "response" ? statuses.map(Number) : [],
        match: { ...(row?.match ?? ANY_REQUEST), pathPrefix: path, methods },
        on: trigger === "always" ? "" : trigger,
        tags: byLabel ? tags : [],
        tagsNot: byLabel && valueMode === "none_of",
        listed: byList ? { list: listName, op: valueMode === "not_in" ? "not_in" : "in" } : null,
        cookie: needsCookie ? cookie : "",
        issue: self && op === "issue" ? named : "",
        drop: self && op === "drop" ? named : "",
      };

  const whenSummary = whenText(t, { ...head, cookie: named, ask: null }, cookies);
  const doSummary = self
    ? [
        t("cookieProfiles.toSelf"),
        op === "drop" ? t("cookieProfiles.opDrop") : t("cookieProfiles.opIssue"),
        named,
      ]
        .filter((part) => part !== "")
        .join(" · ")
    : fields.target === TO_DATASET
      ? [t("outcomes.toDataset"), fields.list].filter((part) => part !== "").join(" · ")
      : fields.target === TO_SCORE
        ? t("outcomes.toScore")
        : [
            fields.target === TO_MODULE ? t("cookieProfiles.toModule") : fields.target,
            fields.verb === "" ? "" : verbLabel(t, fields.verb),
          ]
            .filter((part) => part !== "")
            .join(" · ");

  const save = () => {
    if (self) {
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

  return (
    <Modal
      onClose={onClose}
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
        <Stack spacing={1}>
          <DialogSection
            title={t("outcomes.sectionWhen")}
            hint={t("cookieProfiles.sectionWhenHint")}
            summary={whenSummary}
          >
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label={t("cookieProfiles.when")}
                value={trigger}
                onChange={(e) => {
                  const next = e.target.value as Trigger;

                  setTrigger(next);

                  if (next === "overload" && self) {
                    set({ target: "", verb: "", axis: "" });
                  }
                }}
                helperText={
                  overload
                    ? t("cookieProfiles.overloadHint")
                    : cookies.length === 0
                      ? t("cookieProfiles.noCookies")
                      : trigger === "absent"
                        ? t("cookieProfiles.stateAbsentHint")
                        : t("cookieProfiles.triggerHint")
                }
                sx={{ flex: 1 }}
              >
                {triggers.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item === "overload"
                      ? t("outcomes.ons.overload")
                      : t(`cookieProfiles.triggers.${item}`)}
                  </MenuItem>
                ))}
              </TextField>
              {!overload && (
                <TextField
                  select
                  size="small"
                  label={t("cookieProfiles.cookie")}
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                  helperText={
                    cookies.length === 0 ? t("cookieProfiles.noCookies") : t("cookieProfiles.cookieHint")
                  }
                  error={needsCookie && named === ""}
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
                  {cookie !== "" && !cookies.some((item) => item.name === cookie) && (
                    <MenuItem value={cookie}>{cookie}</MenuItem>
                  )}
                </TextField>
              )}
            </Stack>

            {valueChecked && (
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  size="small"
                  label={t("cookieProfiles.label")}
                  value={valueMode}
                  onChange={(e) => setValueMode(e.target.value as ValueMode)}
                  helperText={t(`cookieProfiles.valueModeHints.${valueMode}`)}
                  sx={{ flex: 1 }}
                >
                  {VALUE_MODES.map((mode) => (
                    <MenuItem key={mode} value={mode}>
                      {t(`cookieProfiles.valueModes.${mode}`)}
                    </MenuItem>
                  ))}
                </TextField>
                {byLabel && (
                  <ChipsField
                    label={t("cookieProfiles.tags")}
                    helper={t("cookieProfiles.tagsHint")}
                    badHelper={(tag) => t("cookieProfiles.tagsBad", { tag })}
                    value={tags}
                    options={cookies.map((item) => item.value.default).filter((tag) => tag !== "")}
                    valid={(tag) => RULE_TAG_RE.test(tag)}
                    required
                    onChange={setTags}
                  />
                )}
                {byList && (
                  <TextField
                    select
                    size="small"
                    label={t("cookieProfiles.listedList")}
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    error={listName === ""}
                    helperText={t("cookieProfiles.listedListHint")}
                    slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
                    sx={{ flex: 1 }}
                  >
                    <MenuItem value="" disabled>
                      {stringLists.length === 0
                        ? t("cookieProfiles.listedNone")
                        : t("cookieProfiles.listedPick")}
                    </MenuItem>
                    {stringLists.map((item) => (
                      <MenuItem key={item.uuid} value={item.name}>
                        {item.name}
                        <Box component="span" sx={{ color: "text.secondary", ml: 1 }}>
                          {t(item.active ? "datasets.dynamic" : "datasets.static")}
                        </Box>
                      </MenuItem>
                    ))}
                    {listName !== "" && !stringLists.some((item) => item.name === listName) && (
                      <MenuItem value={listName}>{listName}</MenuItem>
                    )}
                  </TextField>
                )}
                {!byLabel && !byList && <Box sx={{ flex: 1 }} />}
              </Stack>
            )}

            {overload && (
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

            {!overload && (
              <>
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
                  {phase === "response" ? (
                    <ChipsField
                      label={t("cookieProfiles.status")}
                      helper={t("cookieProfiles.statusHint")}
                      badHelper={(code) => t("cookieProfiles.statusBad", { code })}
                      value={statuses}
                      options={STATUS_PRESETS}
                      valid={(code) => STATUS_RE.test(code)}
                      onChange={setStatuses}
                    />
                  ) : (
                    <Box sx={{ flex: 1 }} />
                  )}
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    label={t("cookieProfiles.pathPrefix")}
                    value={pathPrefix}
                    placeholder="/catalog"
                    onChange={(e) => setPathPrefix(e.target.value)}
                    error={path !== "" && !path.startsWith("/")}
                    helperText={t("cookieProfiles.pathPrefixHint")}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ flex: 1 }}
                  />
                  <ChipsField
                    label={t("cookieProfiles.methods")}
                    helper={t("cookieProfiles.methodsHint")}
                    badHelper={(method) => t("cookieProfiles.methodsBad", { method })}
                    value={methods}
                    options={METHOD_PRESETS}
                    valid={(method) => METHOD_RE.test(method)}
                    parse={(raw) => raw.toUpperCase()}
                    onChange={setMethods}
                  />
                </Stack>
              </>
            )}
          </DialogSection>

          <DialogSection
            title={t("outcomes.sectionDo")}
            hint={t("cookieProfiles.sectionDoHint")}
            summary={doSummary}
          >
            <TextField
              select
              size="small"
              label={t("cookieProfiles.to")}
              value={fields.target}
              onChange={(e) => {
                const target = e.target.value;

                const still = verbsOf(registry, inspectors, target).includes(fields.verb);

                set({
                  target,
                  verb: still ? fields.verb : "",
                  axis: still ? fields.axis : "",
                  ...(target === TO_DATASET && fields.target !== TO_DATASET && cookies.length > 0
                    ? { write: "value" as const }
                    : {}),
                });
              }}
              helperText={t("cookieProfiles.toHint")}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
            >
              {!overload && <MenuItem value={TO_SELF}>{t("cookieProfiles.toSelf")}</MenuItem>}
              {targets.map((row) => (
                <MenuItem key={row.uuid} value={row.name}>
                  {row.name}
                </MenuItem>
              ))}
              {verbsOf(registry, inspectors, TO_MODULE).length > 0 && (
                <MenuItem value={TO_MODULE}>{t("cookieProfiles.toModule")}</MenuItem>
              )}
              <MenuItem value={TO_SCORE}>{t("outcomes.toScore")}</MenuItem>
              <MenuItem value={TO_DATASET}>{t("outcomes.toDataset")}</MenuItem>
            </TextField>

            {self && (
              <TextField
                select
                size="small"
                label={t("cookieProfiles.verb")}
                value={op}
                onChange={(e) => setOp(e.target.value as "issue" | "drop")}
                helperText={t("cookieProfiles.selfHint")}
              >
                <MenuItem value="issue">{t("cookieProfiles.opIssue")}</MenuItem>
                <MenuItem value="drop">{t("cookieProfiles.opDrop")}</MenuItem>
              </TextField>
            )}

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
                  {writable.map((row) => (
                    <MenuItem key={row.uuid} value={row.name}>
                      {row.name}
                    </MenuItem>
                  ))}
                  {fields.list !== "" && !writable.some((row) => row.name === fields.list) && (
                    <MenuItem value={fields.list}>{fields.list}</MenuItem>
                  )}
                  {writable.length === 0 && (
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
                    {(fields.write === "cookie" ? [...LIST_WRITES, "cookie" as const] : LIST_WRITES).map((write) => (
                      <MenuItem key={write} value={write}>
                        {t(`cookieProfiles.writes.${write}`)}
                      </MenuItem>
                    ))}
                  </TextField>
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
                  {writesCookie(fields.write) && (
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

            {fields.target !== "" && !self && fields.target !== TO_SCORE && fields.target !== TO_DATASET && (
              <TextField
                select
                size="small"
                label={t("cookieProfiles.verb")}
                value={fields.verb}
                onChange={(e) =>
                  set({
                    verb: e.target.value,
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
              <MarkerField
                t={t}
                value={fields.marker}
                own={overload ? "" : named}
                valued={trigger !== "absent" && trigger !== "invalid"}
                cookies={cookies}
                onChange={(marker) => set({ marker })}
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
          </DialogSection>

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
