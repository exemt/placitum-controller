import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { Form } from "../components/Form.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  DataTable,
  DraftCell,
  FilterSelect,
  RowActionsHead,
  TableIconButton,
  TableNoticeRow,
  useRowOps,
  usePager,
  type FilterOption,
} from "../components/data-table/index.ts";
import {
  flushTableSx,
  HeadCell,
  TableBlock,
} from "../components/table-block.tsx";
import { SettingsTable } from "../components/settings-table.tsx";
import { OutcomesBlock } from "../components/outcomes-block.tsx";
import { SignalsBlock } from "../components/signals-block.tsx";
import { Bytes, Chips, Flag, Num, Pick, Section, Text } from "../components/fields.tsx";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import type {
  ActionRegistry,
  InspectorMeta,
  JsonAction,
  JsonBinding,
  JsonFrameBinding,
  JsonFrameDirection,
  JsonFramePhase,
  JsonPriorRule,
  JsonProfile,
  JsonProfileDoc,
  JsonRequestPhase,
  JsonResponsePhase,
  JsonRule,
} from "../api.ts";
import { fetchActions, fetchDatasets, fetchInspectors, verbsFor, weakeningVerbs } from "../api.ts";
import { verbLabel } from "../components/action-select.tsx";
import ChannelNotice, { pageNoticeSx } from "../components/ChannelNotice.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  clearSent,
  closePanel,
  copyJsonProfile,
  loadJsonDenyResponses,
  loadJsonDocuments,
  loadJsonProfileDetail,
  loadJsonProfiles,
  openPanel,
  removeJsonProfile,
  restoreJsonProfileThunk,
  saveJsonProfileThunk,
  sendJson,
} from "../store/slices/pages/json.ts";

const PANEL_WIDTH = 720;
const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

const ACTIONS: JsonAction[] = ["deny", "score", "allow"];

const REQUEST_OUTCOMES = [
  "invalid",
  "unparsable",
  "truncated",
  "unknown_operation",
  "content_type",
  "unavailable",
] as const;

const RESPONSE_OUTCOMES = [...REQUEST_OUTCOMES, "status"] as const;

const FRAME_OUTCOMES = [
  "invalid",
  "unparsable",
  "truncated",
  "unknown_operation",
  "opcode",
  "unavailable",
] as const;

type Outcome = (typeof RESPONSE_OUTCOMES)[number] | (typeof FRAME_OUTCOMES)[number];

function rule(action: JsonAction, score: number): JsonRule {
  return { action, score };
}

function whole(raw: string, def: number): number {
  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : def;
}

function emptyDoc(): JsonProfileDoc {
  return {
    trigger: { prior: [] },
    description: "",
    schema: { kind: "openapi", source: "", basePath: "" },
    request: {
      enabled: true,
      checks: { body: true, query: true, pathParams: true, headers: false },
      policy: {
        invalid: rule("deny", 70),
        unparsable: rule("deny", 70),
        truncated: rule("deny", 70),
        unknown_operation: rule("allow", 70),
        content_type: rule("allow", 70),
        unavailable: rule("allow", 70),
      },
      denyResponse: "json_invalid",
      outcomes: [],
    },
    response: {
      enabled: true,
      checks: { body: true, status: true, contentType: true },
      policy: {
        invalid: rule("score", 40),
        unparsable: rule("allow", 40),
        truncated: rule("allow", 40),
        unknown_operation: rule("allow", 40),
        content_type: rule("allow", 40),
        unavailable: rule("allow", 40),
        status: rule("score", 40),
      },
      onlyTypes: ["application/json", "+json"],
      denyResponse: "json_response_invalid",
      outcomes: [],
    },
    frame: {
      enabled: false,
      bindings: [],
      c2s: {
        checks: { body: true },
        policy: {
          invalid: rule("deny", 70),
          unparsable: rule("deny", 70),
          truncated: rule("deny", 70),
          unknown_operation: rule("deny", 70),
          opcode: rule("deny", 70),
          unavailable: rule("allow", 70),
        },
        denyResponse: "ws_policy",
        outcomes: [],
      },
      s2c: {
        checks: { body: true },
        policy: {
          invalid: rule("score", 40),
          unparsable: rule("allow", 40),
          truncated: rule("allow", 40),
          unknown_operation: rule("allow", 40),
          opcode: rule("allow", 40),
          unavailable: rule("allow", 40),
        },
        denyResponse: "ws_policy",
        outcomes: [],
      },
    },
    bindings: [],
    limits: { maxBody: 1024 * 1024, maxDepth: 64, maxErrors: 20, cache: 4096 },
    audit: { values: "off", paths: true },
  };
}

export default function JsonProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.json.rows);
  const loading = useAppSelector((s) => s.pages.json.loading);
  const error = useAppSelector((s) => s.pages.json.error);
  const panelId = useAppSelector((s) => s.pages.json.panelId);
  const sending = useAppSelector((s) => s.pages.json.sending);
  const sent = useAppSelector((s) => s.pages.json.sent);
  const documents = useAppSelector((s) => s.pages.json.documents);
  const pager = usePager(rows);
  const ops = useRowOps<JsonProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyJsonProfile({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeJsonProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadJsonProfiles(scope));
      void dispatch(loadJsonDocuments(scope));
      void dispatch(loadJsonDenyResponses(scope));
    },
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendJson(scope));
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
      <ChannelNotice id="json" />
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
          {t("json.sentHint")} {sent}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("json.kind")}</TableCell>
          <TableCell>{t("json.source")}</TableCell>
          <TableCell>{t("json.phases")}</TableCell>
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
                void dispatch(loadJsonProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{t(`json.kinds.${row.kind}`)}</TableCell>
              <TableCell>
                {documents.find((item) => item.uuid === row.source)?.name ?? ""}
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5}>
                  {row.doc?.request.enabled && (
                    <Chip size="small" label={t("json.request")} />
                  )}
                  {row.doc?.response.enabled && (
                    <Chip size="small" variant="outlined" label={t("json.response")} />
                  )}
                  {row.doc?.frame?.enabled && (
                    <Chip size="small" variant="outlined" label={t("json.frame")} />
                  )}
                </Stack>
              </TableCell>
              {ops.cell(row, {
                remove: row.name === "default" ? t("json.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("json.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadJsonProfiles(scope))} />
        <DataTable.Pager pager={pager} />
      </DataTable>
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
          <JsonProfileForm
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

function JsonProfileForm({
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
  const detail = useAppSelector((s) => s.pages.json.detail);
  const documents = useAppSelector((s) => s.pages.json.documents);
  const denyResponses = useAppSelector((s) => s.pages.json.denyResponses);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [doc, setDoc] = useState<JsonProfileDoc>(emptyDoc);

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
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    fetchInspectors(scope)
      .then((rows) => {
        if (alive) {
          setInspectors(rows);
        }
      })
      .catch(() => {
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
    setDoc({ ...detail.doc, frame: detail.doc.frame ?? emptyDoc().frame });
  }, [id, detail]);

  const patch = (part: Partial<JsonProfileDoc>) => setDoc((prev) => ({ ...prev, ...part }));

  const patchRequest = (part: Partial<JsonRequestPhase>) =>
    setDoc((prev) => ({ ...prev, request: { ...prev.request, ...part } }));

  const patchResponse = (part: Partial<JsonResponsePhase>) =>
    setDoc((prev) => ({ ...prev, response: { ...prev.response, ...part } }));

  const patchFrame = (part: Partial<JsonFramePhase>) =>
    setDoc((prev) => ({ ...prev, frame: { ...prev.frame, ...part } }));

  const patchDirection = (dir: "c2s" | "s2c", part: Partial<JsonFrameDirection>) =>
    setDoc((prev) => ({
      ...prev,
      frame: { ...prev.frame, [dir]: { ...prev.frame[dir], ...part } },
    }));

  const nameOk = NAME_RE.test(name);

  const bindable = doc.schema.kind === "jsonschema";

  const denyOptions = useMemo(
    () => denyResponses.map((row) => ({ value: row.name, label: row.name })),
    [denyResponses],
  );

  const documentOptions = useMemo(
    () => documents.map((row) => ({ value: row.uuid, label: row.name })),
    [documents],
  );

  const frameOn = bindable && doc.frame.enabled;

  const canSave =
    nameOk &&
    (doc.schema.source !== "" || doc.bindings.length > 0 || (frameOn && doc.frame.bindings.length > 0)) &&
    (doc.request.enabled || doc.response.enabled || frameOn);

  const save = () => {
    void dispatch(saveJsonProfileThunk({ scope, id, name, description, doc }));
  };

  const loaded = id !== null && detail !== null && detail.uuid === id ? detail : null;
  const isDefault = loaded?.name === "default";
  const banner =
    loaded?.modified === true ? t("profiles.defaultModified") : undefined;
  const restore =
    id === null
      ? undefined
      : () => {
          void dispatch(restoreJsonProfileThunk({ scope, id }));
        };

  return (
    <Form id="json-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("json.newTitle") : t("json.editTitle")}
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
          title={t("json.sectionProfile")}
          hint={t("json.sectionProfileHint")}
          flush
          defaultExpanded
          help="06-json#что-он-решает"
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("json.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("json.description")}
              value={description}
              onChange={setDescription}
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("json.sectionSchema")}
          hint={t("json.sectionSchemaHint")}
          flush
          defaultExpanded
          help="06-json#чем-описан-контракт"
        >
          <SettingsTable aside={false}>
            <Pick
              label={t("json.kind")}
              helper={t("json.kindHint")}
              value={doc.schema.kind}
              options={[
                { value: "openapi", label: t("json.kinds.openapi") },
                { value: "jsonschema", label: t("json.kinds.jsonschema") },
              ]}
              onChange={(value) =>
                patch({
                  schema: { ...doc.schema, kind: value as JsonProfileDoc["schema"]["kind"] },
                  bindings: value === "openapi" ? [] : doc.bindings,
                })
              }
            />
            <Pick
              select
              label={t("json.source")}
              helper={t("json.sourceHint")}
              value={doc.schema.source}
              options={[{ value: "", label: t("json.sourceNone") }, ...documentOptions]}
              onChange={(value) => patch({ schema: { ...doc.schema, source: value } })}
            />
            <Text
              label={t("json.basePath")}
              helper={t("json.basePathHint")}
              value={doc.schema.basePath}
              onChange={(value) => patch({ schema: { ...doc.schema, basePath: value } })}
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("channel.signals")}
          hint={t("json.priorHint")}
          flush
          help="06-json#канал-действий"
        >
          <SignalsBlock
            help="06-json#канал-действий"
            embedded
            hint={t("json.priorHint")}
            rules={doc.trigger.prior.map((row) => ({ ...row, accept: [...row.accept] }))}
            verbs={verbsFor(actionsReg, "json").map((verb) => ({
              value: verb,
              label: verbLabel(t, verb),
            }))}
            weakening={weakeningVerbs(actionsReg)}
            codes={senderCodes}
            unknown={unknownSenders}
            senders={inspectors}
            defaultRule={() => ({
              from: "ip",
              accept: ["threshold"],
              codes: [],
            })}
            onChange={(prior) =>
              patch({
                trigger: {
                  prior: prior.map((row) => ({
                    ...row,
                    accept: row.accept as JsonPriorRule["accept"],
                  })),
                },
              })
            }
          />
        </Section>

        <Section
          title={t("json.sectionRequest")}
          hint={t("json.sectionRequestHint")}
          flush
          defaultExpanded
          help="06-json#политика-исходов"
        >
          <SettingsTable aside={false}>
            <Flag
              label={t("json.phaseEnabled")}
              helper={t("json.phaseEnabledHint")}
              checked={doc.request.enabled}
              onChange={(value) => patchRequest({ enabled: value })}
            />
            <Flag
              label={t("json.checkBody")}
              helper={t("json.checkBodyHint")}
              checked={doc.request.checks.body}
              disabled={!doc.request.enabled}
              onChange={(value) =>
                patchRequest({ checks: { ...doc.request.checks, body: value } })
              }
            />
            <Flag
              label={t("json.checkQuery")}
              helper={t("json.checkQueryHint")}
              checked={doc.request.checks.query}
              disabled={!doc.request.enabled}
              onChange={(value) =>
                patchRequest({ checks: { ...doc.request.checks, query: value } })
              }
            />
            <Flag
              label={t("json.checkPathParams")}
              helper={t("json.checkPathParamsHint")}
              checked={doc.request.checks.pathParams}
              disabled={!doc.request.enabled}
              onChange={(value) =>
                patchRequest({ checks: { ...doc.request.checks, pathParams: value } })
              }
            />
            <Flag
              label={t("json.checkHeaders")}
              helper={t("json.checkHeadersHint")}
              checked={doc.request.checks.headers}
              disabled={!doc.request.enabled}
              onChange={(value) =>
                patchRequest({ checks: { ...doc.request.checks, headers: value } })
              }
            />
            <Pick
              select
              label={t("json.denyResponse")}
              helper={t("json.denyResponseHint")}
              value={doc.request.denyResponse}
              options={denyOptions}
              onChange={(value) => patchRequest({ denyResponse: value })}
            />
          </SettingsTable>
          <PolicyTable
            t={t}
            outcomes={REQUEST_OUTCOMES}
            policy={doc.request.policy}
            disabled={!doc.request.enabled}
            onChange={(policy) =>
              patchRequest({ policy: policy as JsonRequestPhase["policy"] })
            }
          />
          <OutcomesBlock
            help="06-json#канал-действий"
            hint={t("outcomes.hint.request")}
            outcomes={doc.request.outcomes}
            datasets={datasetNames}
            inspectors={inspectors}
            registry={actionsReg}
            ons={["deny", "allow", "score", "overload"]}
            onChange={(outcomes) => patchRequest({ outcomes })}
          />
        </Section>

        <Section
          title={t("json.sectionResponse")}
          hint={t("json.sectionResponseHint")}
          flush
          help="06-json#политика-исходов"
        >
          <SettingsTable aside={false}>
            <Flag
              label={t("json.phaseEnabled")}
              helper={t("json.phaseEnabledHint")}
              checked={doc.response.enabled}
              onChange={(value) => patchResponse({ enabled: value })}
            />
            <Flag
              label={t("json.checkBody")}
              helper={t("json.checkBodyHint")}
              checked={doc.response.checks.body}
              disabled={!doc.response.enabled}
              onChange={(value) =>
                patchResponse({ checks: { ...doc.response.checks, body: value } })
              }
            />
            <Flag
              label={t("json.checkStatus")}
              helper={t("json.checkStatusHint")}
              checked={doc.response.checks.status}
              disabled={!doc.response.enabled}
              onChange={(value) =>
                patchResponse({ checks: { ...doc.response.checks, status: value } })
              }
            />
            <Flag
              label={t("json.checkContentType")}
              helper={t("json.checkContentTypeHint")}
              checked={doc.response.checks.contentType}
              disabled={!doc.response.enabled}
              onChange={(value) =>
                patchResponse({ checks: { ...doc.response.checks, contentType: value } })
              }
            />
            <Chips
              t={t}
              freeSolo
              label={t("json.onlyTypes")}
              helper={t("json.onlyTypesHint")}
              value={doc.response.onlyTypes}
              onChange={(value) => patchResponse({ onlyTypes: value ?? [] })}
            />
            <Pick
              select
              label={t("json.denyResponse")}
              helper={t("json.denyResponseHint")}
              value={doc.response.denyResponse}
              options={denyOptions}
              onChange={(value) => patchResponse({ denyResponse: value })}
            />
          </SettingsTable>
          <PolicyTable
            t={t}
            outcomes={RESPONSE_OUTCOMES}
            policy={doc.response.policy}
            disabled={!doc.response.enabled}
            onChange={(policy) =>
              patchResponse({ policy: policy as JsonResponsePhase["policy"] })
            }
          />
          <OutcomesBlock
            help="06-json#канал-действий"
            hint={t("outcomes.hint.response")}
            outcomes={doc.response.outcomes}
            datasets={datasetNames}
            inspectors={inspectors}
            registry={actionsReg}
            onChange={(outcomes) => patchResponse({ outcomes })}
          />
        </Section>

        {bindable && (
          <Section
            title={t("json.sectionBindings")}
            hint={t("json.bindingsHint")}
            flush
            help="06-json#привязки-какую-схему-к-чему-применять"
          >
            <BindingsTable
              t={t}
              rows={doc.bindings}
              documents={documentOptions}
              onChange={(bindings) => patch({ bindings })}
            />
          </Section>
        )}

        {bindable && (
          <Section
            title={t("json.sectionFrame")}
            hint={t("json.sectionFrameHint")}
            flush
            help="06-json#кадры-websocket"
          >
            <SettingsTable aside={false}>
              <Flag
                label={t("json.frameEnabled")}
                helper={t("json.frameEnabledHint")}
                checked={doc.frame.enabled}
                onChange={(value) => patchFrame({ enabled: value })}
              />
            </SettingsTable>
            <FrameBindingsTable
              t={t}
              rows={doc.frame.bindings}
              documents={documentOptions}
              disabled={!doc.frame.enabled}
              onChange={(bindings) => patchFrame({ bindings })}
            />
            {(["c2s", "s2c"] as const).map((dir) => (
              <Section
                key={dir}
                title={t(`json.direction.${dir}`)}
                hint={t(`json.directionHint.${dir}`)}
                flush
                defaultExpanded={dir === "c2s"}
              >
                <SettingsTable aside={false}>
                  <Flag
                    label={t("json.checkBody")}
                    helper={t("json.frameCheckBodyHint")}
                    checked={doc.frame[dir].checks.body}
                    disabled={!doc.frame.enabled}
                    onChange={(value) => patchDirection(dir, { checks: { body: value } })}
                  />
                  <Pick
                    select
                    label={t("json.denyResponse")}
                    helper={t("json.frameDenyResponseHint")}
                    value={doc.frame[dir].denyResponse}
                    options={denyOptions}
                    onChange={(value) => patchDirection(dir, { denyResponse: value })}
                  />
                </SettingsTable>
                <PolicyTable
                  t={t}
                  outcomes={FRAME_OUTCOMES}
                  policy={doc.frame[dir].policy}
                  disabled={!doc.frame.enabled}
                  onChange={(policy) => patchDirection(dir, { policy })}
                />
                <OutcomesBlock
                  help="06-json#канал-действий"
                  hint={t(`json.frameOutcomesHint.${dir}`)}
                  outcomes={doc.frame[dir].outcomes}
                  datasets={datasetNames}
                  inspectors={inspectors}
                  registry={actionsReg}
                  onChange={(outcomes) => patchDirection(dir, { outcomes })}
                />
              </Section>
            ))}
          </Section>
        )}

        <Section
          title={t("json.sectionLimits")}
          hint={t("json.sectionLimitsHint")}
          flush
          help="06-json#пределы-и-аудит"
        >
          <SettingsTable aside={false}>
            <Bytes
              label={t("json.maxBody")}
              helper={t("json.maxBodyHint")}
              value={doc.limits.maxBody}
              onChange={(value) =>
                patch({ limits: { ...doc.limits, maxBody: value ?? 1024 * 1024 } })
              }
            />
            <Num
              label={t("json.maxDepth")}
              helper={t("json.maxDepthHint")}
              value={String(doc.limits.maxDepth)}
              onChange={(value) =>
                patch({ limits: { ...doc.limits, maxDepth: whole(value, 64) } })
              }
            />
            <Num
              label={t("json.maxErrors")}
              helper={t("json.maxErrorsHint")}
              value={String(doc.limits.maxErrors)}
              onChange={(value) =>
                patch({ limits: { ...doc.limits, maxErrors: whole(value, 20) } })
              }
            />
            <Num
              label={t("json.cache")}
              helper={t("json.cacheHint")}
              value={String(doc.limits.cache)}
              onChange={(value) =>
                patch({ limits: { ...doc.limits, cache: whole(value, 4096) } })
              }
            />
            <Pick
              label={t("json.auditValues")}
              helper={t("json.auditValuesHint")}
              value={doc.audit.values}
              options={[
                { value: "off", label: t("json.auditValuesOff") },
                { value: "hash", label: t("json.auditValuesHash") },
              ]}
              onChange={(value) =>
                patch({
                  audit: { ...doc.audit, values: value as JsonProfileDoc["audit"]["values"] },
                })
              }
            />
            <Flag
              label={t("json.auditPaths")}
              helper={t("json.auditPathsHint")}
              checked={doc.audit.paths}
              onChange={(value) => patch({ audit: { ...doc.audit, paths: value } })}
            />
          </SettingsTable>
        </Section>
      </Form.Body>
      <Form.Actions>
        {id !== null && !isDefault && (
          <Button
            color="error"
            onClick={() => void dispatch(removeJsonProfile({ scope, id }))}
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

function PolicyTable({
  t,
  outcomes,
  policy,
  disabled,
  onChange,
}: {
  t: Translate;
  outcomes: readonly Outcome[];
  policy: Record<string, JsonRule>;
  disabled: boolean;
  onChange: (next: Record<string, JsonRule>) => void;
}) {
  const options: FilterOption<JsonAction>[] = ACTIONS.map((action) => ({
    value: action,
    label: t(`json.actions.${action}`),
  }));

  const patch = (outcome: Outcome, part: Partial<JsonRule>) =>
    onChange({ ...policy, [outcome]: { ...policy[outcome], ...part } });

  return (
    <TableBlock title={t("json.policy")} label={t("json.policyHint")} last>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("json.outcome")} />
            <HeadCell label={t("json.action")} help={t("json.actionHint")} width={132} />
            <HeadCell label={t("json.score")} help={t("json.scoreHint")} width={92} />
          </TableRow>
        </TableHead>
        <TableBody>
          {outcomes.map((outcome) => {
            const row = policy[outcome] ?? rule("allow", 0);
            const scored = row.action === "score";

            return (
              <TableRow key={outcome}>
                <TableCell sx={{ py: 0.5 }}>
                  <Typography variant="body2">{t(`json.outcomes.${outcome}`)}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {t(`json.codes.${outcome}`)}
                  </Typography>
                </TableCell>
                <FilterSelect
                  value={row.action}
                  width={132}
                  options={options}
                  disabled={disabled}
                  unset={row.action}
                  onChange={(action) => patch(outcome, { action })}
                />
                <DraftCell
                  value={scored ? String(row.score) : ""}
                  placeholder={scored ? "0" : "—"}
                  width={92}
                  disabled={disabled || !scored}
                  onChange={(raw) => {
                    const parsed = Number(raw.replace(/[^0-9]/g, ""));

                    patch(outcome, {
                      score: Number.isFinite(parsed) ? Math.min(parsed, 100) : 0,
                    });
                  }}
                />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableBlock>
  );
}

function BindingsTable({
  t,
  rows,
  documents,
  onChange,
}: {
  t: Translate;
  rows: JsonBinding[];
  documents: FilterOption<string>[];
  onChange: (next: JsonBinding[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const matches: FilterOption<JsonBinding["match"]>[] = [
    { value: "exact", label: t("json.matches.exact") },
    { value: "prefix", label: t("json.matches.prefix") },
  ];

  const patch = (index: number, part: Partial<JsonBinding>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...part } : row)));

  return (
    <TableBlock title={t("json.sectionBindings")} label={t("json.bindingsHint")} last>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("json.bindingMethods")} width={120} />
            <HeadCell label={t("json.bindingPath")} />
            <HeadCell label={t("json.bindingMatch")} width={110} />
            <HeadCell label={t("json.bindingSchema")} width={160} />
            <TableCell align="right" sx={{ width: 44 }}>
              <TableIconButton
                color="success"
                icon={<AddIcon />}
                tooltip={t("common.add")}
                onClick={() => setAdding(true)}
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={5} kind="empty" message={t("json.bindingsEmpty")} />
          )}
          {rows.map((row, index) => (
            <TableRow key={index}>
              <DraftCell
                value={row.methods.join(", ")}
                placeholder={t("json.anyMethod")}
                width={120}
                onChange={(raw) =>
                  patch(index, {
                    methods: raw
                      .toUpperCase()
                      .split(",")
                      .map((item) => item.trim())
                      .filter((item) => item !== ""),
                  })
                }
              />
              <DraftCell
                value={row.path}
                placeholder="/api/orders"
                mono
                onChange={(path) => patch(index, { path })}
              />
              <FilterSelect
                value={row.match}
                width={110}
                options={matches}
                unset={row.match}
                onChange={(match) => patch(index, { match })}
              />
              <FilterSelect
                value={row.schema}
                width={160}
                options={documents}
                unset={row.schema}
                onChange={(schema) => patch(index, { schema })}
              />
              <TableCell align="right">
                <TableIconButton
                  color="error"
                  icon={<DeleteIcon />}
                  tooltip={t("common.delete")}
                  onClick={() => onChange(rows.filter((_row, i) => i !== index))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {adding && (
        <BindingDialog
          t={t}
          documents={documents}
          matches={matches}
          onClose={() => setAdding(false)}
          onAdd={(binding) => {
            onChange([...rows, binding]);
            setAdding(false);
          }}
        />
      )}
    </TableBlock>
  );
}

function FrameBindingsTable({
  t,
  rows,
  documents,
  disabled,
  onChange,
}: {
  t: Translate;
  rows: JsonFrameBinding[];
  documents: FilterOption<string>[];
  disabled: boolean;
  onChange: (next: JsonFrameBinding[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const matches: FilterOption<JsonFrameBinding["match"]>[] = [
    { value: "exact", label: t("json.matches.exact") },
    { value: "prefix", label: t("json.matches.prefix") },
  ];

  const directions: FilterOption<JsonFrameBinding["direction"]>[] = [
    { value: "c2s", label: t("json.directions.c2s") },
    { value: "s2c", label: t("json.directions.s2c") },
    { value: "any", label: t("json.directions.any") },
  ];

  const patch = (index: number, part: Partial<JsonFrameBinding>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...part } : row)));

  const patchDiscriminator = (index: number, part: { pointer?: string; value?: string }) => {
    const row = rows[index];
    const next = {
      pointer: part.pointer ?? row.discriminator?.pointer ?? "",
      value: part.value ?? row.discriminator?.value ?? "",
    };

    patch(index, { discriminator: next.pointer === "" ? null : next });
  };

  return (
    <TableBlock title={t("json.frameBindings")} label={t("json.frameBindingsHint")}>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("json.bindingPath")} />
            <HeadCell label={t("json.bindingMatch")} width={80} />
            <HeadCell label={t("json.bindingDirection")} help={t("json.bindingDirectionHint")} width={88} />
            <HeadCell label={t("json.bindingSubprotocol")} help={t("json.bindingSubprotocolHint")} width={88} />
            <HeadCell label={t("json.bindingPointer")} help={t("json.bindingPointerHint")} width={88} />
            <HeadCell label={t("json.bindingValue")} width={72} />
            <HeadCell label={t("json.bindingSchema")} width={120} />
            <TableCell align="right" sx={{ width: 44 }}>
              <TableIconButton
                color="success"
                icon={<AddIcon />}
                tooltip={t("common.add")}
                disabled={disabled}
                onClick={() => setAdding(true)}
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={8} kind="empty" message={t("json.frameBindingsEmpty")} />
          )}
          {rows.map((row, index) => (
            <TableRow key={index}>
              <DraftCell
                value={row.path}
                placeholder="/ws/chat"
                mono
                disabled={disabled}
                onChange={(path) => patch(index, { path })}
              />
              <FilterSelect
                value={row.match}
                width={80}
                options={matches}
                unset={row.match}
                disabled={disabled}
                onChange={(match) => patch(index, { match })}
              />
              <FilterSelect
                value={row.direction}
                width={88}
                options={directions}
                unset={row.direction}
                disabled={disabled}
                onChange={(direction) => patch(index, { direction })}
              />
              <DraftCell
                value={row.subprotocol}
                placeholder={t("json.anySubprotocol")}
                width={88}
                disabled={disabled}
                onChange={(subprotocol) => patch(index, { subprotocol })}
              />
              <DraftCell
                value={row.discriminator?.pointer ?? ""}
                placeholder="/type"
                mono
                width={88}
                disabled={disabled}
                onChange={(pointer) => patchDiscriminator(index, { pointer })}
              />
              <DraftCell
                value={row.discriminator?.value ?? ""}
                placeholder="msg"
                mono
                width={72}
                disabled={disabled || row.discriminator === null}
                onChange={(value) => patchDiscriminator(index, { value })}
              />
              <FilterSelect
                value={row.schema}
                width={120}
                options={documents}
                unset={row.schema}
                disabled={disabled}
                onChange={(schema) => patch(index, { schema })}
              />
              <TableCell align="right">
                <TableIconButton
                  color="error"
                  icon={<DeleteIcon />}
                  tooltip={t("common.delete")}
                  disabled={disabled}
                  onClick={() => onChange(rows.filter((_row, i) => i !== index))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {adding && (
        <FrameBindingDialog
          t={t}
          documents={documents}
          matches={matches}
          directions={directions}
          onClose={() => setAdding(false)}
          onAdd={(binding) => {
            onChange([...rows, binding]);
            setAdding(false);
          }}
        />
      )}
    </TableBlock>
  );
}

const METHOD_PRESETS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function parseMethod(raw: string): string | undefined {
  const upper = raw.trim().toUpperCase();

  return /^[A-Z]+$/.test(upper) ? upper : undefined;
}

function schemaOptions(t: Translate, documents: FilterOption<string>[]): FilterOption<string>[] {
  return documents.length > 0 ? documents : [{ value: "", label: t("json.sourceEmpty") }];
}

function BindingDialog({
  t,
  documents,
  matches,
  onClose,
  onAdd,
}: {
  t: Translate;
  documents: FilterOption<string>[];
  matches: FilterOption<JsonBinding["match"]>[];
  onClose: () => void;
  onAdd: (binding: JsonBinding) => void;
}) {
  const [draft, setDraft] = useState<JsonBinding>(() => ({
    methods: [],
    path: "/",
    match: "prefix",
    schema: documents[0]?.value ?? "",
  }));

  const patch = (part: Partial<JsonBinding>) => setDraft((prev) => ({ ...prev, ...part }));
  const ready = draft.path.startsWith("/") && draft.schema !== "";

  const submit = () => {
    if (ready) {
      onAdd(draft);
    }
  };

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      title={t("json.bindingNewDialog")}
      help="06-json#привязки-какую-схему-к-чему-применять"
      onEnter={submit}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <SettingsTable aside={false}>
        <Chips
          t={t}
          freeSolo
          label={t("json.bindingMethods")}
          helper={t("json.bindingMethodsHint")}
          value={draft.methods}
          options={METHOD_PRESETS}
          parse={parseMethod}
          placeholder={t("json.anyMethod")}
          onChange={(value) => patch({ methods: value ?? [] })}
        />
        <Text
          label={t("json.bindingPath")}
          helper={t("json.bindingPathHint")}
          placeholder="/api/orders"
          value={draft.path}
          mono
          onChange={(path) => patch({ path: path.trim() })}
        />
        <Pick
          select
          label={t("json.bindingMatch")}
          helper={t("json.bindingMatchHint")}
          value={draft.match}
          options={matches}
          onChange={(match) => patch({ match })}
        />
        <Pick
          select
          label={t("json.bindingSchema")}
          helper={t("json.bindingSchemaHint")}
          value={draft.schema}
          options={schemaOptions(t, documents)}
          onChange={(schema) => patch({ schema })}
        />
      </SettingsTable>
    </Modal>
  );
}

function FrameBindingDialog({
  t,
  documents,
  matches,
  directions,
  onClose,
  onAdd,
}: {
  t: Translate;
  documents: FilterOption<string>[];
  matches: FilterOption<JsonFrameBinding["match"]>[];
  directions: FilterOption<JsonFrameBinding["direction"]>[];
  onClose: () => void;
  onAdd: (binding: JsonFrameBinding) => void;
}) {
  const [path, setPath] = useState("/ws/");
  const [match, setMatch] = useState<JsonFrameBinding["match"]>("prefix");
  const [direction, setDirection] = useState<JsonFrameBinding["direction"]>("c2s");
  const [subprotocol, setSubprotocol] = useState("");
  const [pointer, setPointer] = useState("/type");
  const [value, setValue] = useState("");
  const [schema, setSchema] = useState(documents[0]?.value ?? "");

  const ready =
    path.startsWith("/") &&
    schema !== "" &&
    (pointer === "" || (pointer.startsWith("/") && value !== ""));

  const submit = () => {
    if (!ready) {
      return;
    }

    onAdd({
      path,
      match,
      direction,
      subprotocol,
      discriminator: pointer === "" ? null : { pointer, value },
      schema,
    });
  };

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      title={t("json.frameBindingNewDialog")}
      help="06-json#кадры-websocket"
      onEnter={submit}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <SettingsTable aside={false}>
        <Text
          label={t("json.bindingPath")}
          helper={t("json.frameBindingPathHint")}
          placeholder="/ws/chat"
          value={path}
          mono
          onChange={(next) => setPath(next.trim())}
        />
        <Pick
          select
          label={t("json.bindingMatch")}
          helper={t("json.bindingMatchHint")}
          value={match}
          options={matches}
          onChange={setMatch}
        />
        <Pick
          select
          label={t("json.bindingDirection")}
          helper={t("json.bindingDirectionHint")}
          value={direction}
          options={directions}
          onChange={setDirection}
        />
        <Text
          label={t("json.bindingSubprotocol")}
          helper={t("json.bindingSubprotocolHint")}
          placeholder={t("json.anySubprotocol")}
          value={subprotocol}
          onChange={(next) => setSubprotocol(next.trim())}
        />
        <Text
          label={t("json.bindingPointer")}
          helper={t("json.bindingPointerHint")}
          placeholder="/type"
          value={pointer}
          mono
          onChange={(next) => setPointer(next.trim())}
        />
        {pointer !== "" && (
          <Text
            label={t("json.bindingValue")}
            helper={t("json.bindingValueHint")}
            placeholder="msg"
            value={value}
            mono
            onChange={setValue}
          />
        )}
        <Pick
          select
          label={t("json.bindingSchema")}
          helper={t("json.bindingSchemaHint")}
          value={schema}
          options={schemaOptions(t, documents)}
          onChange={setSchema}
        />
      </SettingsTable>
    </Modal>
  );
}
