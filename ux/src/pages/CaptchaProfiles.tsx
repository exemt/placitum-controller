import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import SettingsIcon from "@mui/icons-material/Settings";

import { Form } from "../components/Form.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  DataTable,
  DraftCell,
  EditorCellScope,
  FilterSelect,
  filterInputSx,
  RowActionsHead,
  TableIconButton,
  TableNotice,
  useRowOps,
  usePager,
  type FilterOption,
} from "../components/data-table/index.ts";
import { SettingsRow, SettingsTable } from "../components/settings-table.tsx";
import { flushTableSx, headCellSx, HeadCell, TableCols } from "../components/table-block.tsx";
import { ACTIONS_W, ActionCell, TextCell } from "../components/rules-table.tsx";
import {
  Chips,
  Flag,
  InlineFlag,
  Num,
  Pick,
  Section,
  Text,
} from "../components/fields.tsx";
import type {
  ActionRegistry,
  CaptchaAccept,
  CaptchaExternalConfig,
  CaptchaProfile,
  CaptchaProfileDoc,
  CaptchaProviderRef,
  InspectorMeta,
} from "../api.ts";
import { fetchActions, fetchInspectors, verbsFor, weakeningVerbs } from "../api.ts";
import { CaptchaRulesBlock } from "./captcha-rules.tsx";
import { SignalsBlock } from "../components/signals-block.tsx";
import { verbLabel } from "../components/action-select.tsx";
import ChannelNotice, { pageNoticeSx } from "../components/ChannelNotice.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  clearSent,
  closePanel,
  copyCaptchaProfile,
  loadCaptchaDatasets,
  loadCaptchaLocations,
  loadCaptchaProfileDetail,
  loadCaptchaProfiles,
  loadCaptchaServers,
  openPanel,
  removeCaptchaProfile,
  restoreCaptchaProfileThunk,
  saveCaptchaProfileThunk,
  sealCaptchaSecret,
  sendCaptcha,
} from "../store/slices/pages/captcha.ts";

const PANEL_WIDTH = 680;
const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const PROVIDERS = ["image", "turnstile", "recaptcha", "hcaptcha", "smartcaptcha"] as const;

const EXTERNAL = new Set(["turnstile", "recaptcha", "hcaptcha", "smartcaptcha"]);

const BINDS = ["subnet", "ip", "ua"] as const;

function bindPick(prev: string[], next: string[]): string[] {
  if (!next.includes("subnet") || !next.includes("ip")) {
    return next;
  }

  const drop = prev.includes("ip") ? "ip" : "subnet";

  return next.filter((bind) => bind !== drop);
}

type ExternalKind = "turnstile" | "recaptcha" | "hcaptcha" | "smartcaptcha";

function externalDefaults(kind: ExternalKind): CaptchaExternalConfig {
  return {
    version: kind === "recaptcha" ? "v2" : "",
    sitekey: "",
    secretEnv: "",
    secretStore: null,
    minScore: 0.5,
    remoteip: false,
    timeoutS: 3,
    onError: "fallback",
  };
}

function providerDefaults(kind: string): CaptchaProviderRef {
  return {
    kind,
    length: 5,
    audio: true,
  };
}

function emptyDoc(): CaptchaProfileDoc {
  return {
    path: "",
    title: "Подтвердите, что вы не робот",
    note: "",
    page: "",
    trigger: {
      when: "buckets",
      prior: [{ from: "*", accept: ["challenge"], codes: [] }],
    },
    buckets: {
      ip: { max: 0, loss: 0, captchaAt: 0, banAt: 0 },
      sess: { max: 0, loss: 0, captchaAt: 0, banAt: 0 },
      asnNet: { max: 0, loss: 0, captchaAt: 0, banAt: 0 },
      asnRouter: { max: 0, loss: 0, captchaAt: 0, banAt: 0 },
    },
    rules: [],
    gate: {
      redirectMethods: ["GET", "HEAD"],
      redirectStatus: 303,
      denyResponse: "captcha_required",
      htmlOnly: true,
      inline: false,
    },
    provider: providerDefaults("image"),
    fallback: null,
    providerConfig: {
      image: { alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", languages: [], audioDir: "" },
      turnstile: externalDefaults("turnstile"),
      recaptcha: externalDefaults("recaptcha"),
      hcaptcha: externalDefaults("hcaptcha"),
      smartcaptcha: externalDefaults("smartcaptcha"),
    },
    challenge: { cookie: "waf_cap", ttlS: 300 },
    clearance: {
      cookie: "waf_clr",
      idCookie: "waf_cid",
      ttlS: 24 * 3600,
      bind: ["subnet", "ua"],
      subnet: { v4: 24, v6: 64 },
      list: "",
      graceS: 0,
    },
    fingerprint: { collect: true, canvas: false, farmAt: 50, windowS: 3600 },
    limits: {
      issuePerSubnet: "30/m",
      verifyPerSubnet: "60/m",
      pendingMax: 200000,
      providerBudget: "50/s",
    },
    upstream: { header: "X-WAF-Captcha" },
    roster: { store: "redis", prefix: "cap:", revokeRefreshMs: 2000 },
    languages: ["ru", "en"],
  };
}

function BucketsTable({
  t,
  buckets,
  onChange,
}: {
  t: Translate;
  buckets: CaptchaProfileDoc["buckets"];
  onChange: (next: CaptchaProfileDoc["buckets"]) => void;
}) {
  const kinds = ["ip", "sess", "asnNet", "asnRouter"] as const;

  const cell = (
    kind: (typeof kinds)[number],
    field: "max" | "loss" | "captchaAt" | "banAt",
  ) => (
    <DraftCell
      value={buckets[kind][field] === 0 ? "" : String(buckets[kind][field])}
      placeholder="0"
      width={110}
      onChange={(raw) => {
        const n = Number(raw.trim());

        onChange({
          ...buckets,
          [kind]: {
            ...buckets[kind],
            [field]: Number.isFinite(n) && n > 0 ? n : 0,
          },
        });
      }}
    />
  );

  return (
    <Table size="small" sx={flushTableSx}>
      <TableHead>
        <TableRow>
          <HeadCell label={t("captcha.bucketKind")} />
          <HeadCell label={t("captcha.bucketMax")} help={t("captcha.bucketMaxHint")} width={110} />
          <HeadCell label={t("captcha.bucketLoss")} help={t("captcha.bucketLossHint")} width={110} />
          <HeadCell
            label={t("captcha.bucketCaptchaAt")}
            help={t("captcha.bucketCaptchaAtHint")}
            width={110}
          />
          <HeadCell
            label={t("captcha.bucketBanAt")}
            help={t("captcha.bucketBanAtHint")}
            width={110}
          />
        </TableRow>
      </TableHead>
      <TableBody>
        {kinds.map((kind) => (
          <TableRow key={kind}>
            <TextCell text={t(`captcha.buckets.${kind}`)} />
            {cell(kind, "max")}
            {cell(kind, "loss")}
            {cell(kind, "captchaAt")}
            {cell(kind, "banAt")}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function CaptchaProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.captcha.rows);
  const loading = useAppSelector((s) => s.pages.captcha.loading);
  const error = useAppSelector((s) => s.pages.captcha.error);
  const panelId = useAppSelector((s) => s.pages.captcha.panelId);
  const sending = useAppSelector((s) => s.pages.captcha.sending);
  const sent = useAppSelector((s) => s.pages.captcha.sent);
  const servers = useAppSelector((s) => s.pages.captcha.servers);
  const pager = usePager(rows);
  const ops = useRowOps<CaptchaProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyCaptchaProfile({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeCaptchaProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadCaptchaProfiles(scope));
      void dispatch(loadCaptchaServers(scope));
      void dispatch(loadCaptchaDatasets(scope));
    },
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendCaptcha(scope));
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
      <ChannelNotice id="captcha" />
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
          {t("captcha.sentHint")} {sent}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("captcha.when")}</TableCell>
          <TableCell>{t("captcha.providers")}</TableCell>
          <TableCell>{t("captcha.server")}</TableCell>
          <TableCell>{t("captcha.path")}</TableCell>
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
                void dispatch(loadCaptchaProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{t(`captcha.whens.${row.when}`)}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5}>
                  <Chip size="small" label={row.provider} />
                  {row.fallback !== null && (
                    <Chip size="small" variant="outlined" label={row.fallback} />
                  )}
                </Stack>
              </TableCell>
              <TableCell>
                {servers.find((item) => item.uuid === row.server_id)?.name ?? ""}
              </TableCell>
              <TableCell>{row.doc?.path ?? ""}</TableCell>
              {ops.cell(row, {
                remove: row.name === "default" ? t("captcha.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("captcha.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadCaptchaProfiles(scope))} />
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
          <CaptchaProfileForm
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

function CaptchaProfileForm({
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
  const detail = useAppSelector((s) => s.pages.captcha.detail);
  const servers = useAppSelector((s) => s.pages.captcha.servers);
  const locations = useAppSelector((s) => s.pages.captcha.locations);
  const datasets = useAppSelector((s) => s.pages.captcha.datasets);
  const pages = useAppSelector((s) => s.pages.captcha.pages);
  const denyResponses = useAppSelector((s) => s.pages.captcha.denyResponses);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serverId, setServerId] = useState<string | null>(null);
  const [doc, setDoc] = useState<CaptchaProfileDoc>(emptyDoc());

  const [actions, setActions] = useState<ActionRegistry | null>(null);
  const [inspectors, setInspectors] = useState<InspectorMeta[]>([]);

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

    fetchActions()
      .then((reg) => {
        if (alive) {
          setActions(reg);
        }
      })
      .catch(() => {
      });

    return () => {
      alive = false;
    };
  }, []);

  const unknownSenders =
    id !== null && detail !== null && detail.uuid === id
      ? (detail.unknown_senders ?? [])
      : [];

  const senderCodes =
    id !== null && detail !== null && detail.uuid === id
      ? (detail.sender_codes ?? [])
      : [];

  useEffect(() => {
    if (id !== null && detail !== null && detail.uuid === id) {
      setName(detail.name);
      setDescription(detail.description);
      setServerId(detail.server_id);
      setDoc({ ...emptyDoc(), ...detail.doc });
    }
  }, [id, detail]);

  useEffect(() => {
    void dispatch(loadCaptchaLocations({ scope, serverId }));
  }, [dispatch, scope, serverId]);

  const addressable = useMemo(
    () => locations.filter((row) => row.match === "prefix" || row.match === "exact"),
    [locations],
  );
  const paths = useMemo(() => addressable.map((row) => row.path), [addressable]);

  const nameOk = NAME_RE.test(name);
  const waiting = id !== null && (detail === null || detail.uuid !== id);
  const patch = (next: Partial<CaptchaProfileDoc>) => setDoc({ ...doc, ...next });

  const denyOptions = useMemo(() => {
    const names = denyResponses.map((row) => row.name);

    if (doc.gate.denyResponse !== "" && !names.includes(doc.gate.denyResponse)) {
      names.push(doc.gate.denyResponse);
    }

    return names.map((value) => ({ value, label: value }));
  }, [denyResponses, doc.gate.denyResponse]);


  const verbOptions: FilterOption<CaptchaAccept>[] = [
    { value: "*", label: t("captcha.priorAcceptAll") },
    ...verbsFor(actions, "captcha").map((verb) => ({
      value: verb as CaptchaAccept,
      label: verbLabel(t, verb),
    })),
  ];

  const loaded = id !== null && detail !== null && detail.uuid === id ? detail : null;
  const isDefault = loaded?.name === "default";
  const banner =
    loaded?.modified === true ? t("profiles.defaultModified") : undefined;
  const restore =
    id === null
      ? undefined
      : () => {
          void dispatch(restoreCaptchaProfileThunk({ scope, id }));
        };

  return (
    <Form id="captcha-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("captcha.newTitle") : t("captcha.editTitle")}
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
          title={t("captcha.sectionProfile")}
          hint={t("captcha.sectionProfileHint")}
          help="06-captcha#что-он-решает"
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("captcha.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("captcha.description")}
              value={description}
              onChange={setDescription}
            />
            <Pick
              label={t("captcha.when")}
              helper={t("captcha.whenHint")}
              value={doc.trigger.when}
              options={[
                { value: "always", label: t("captcha.whens.always") },
                { value: "buckets", label: t("captcha.whens.buckets") },
                { value: "never", label: t("captcha.whens.never") },
              ]}
              onChange={(when) =>
                patch({
                  trigger: {
                    ...doc.trigger,
                    when: when as CaptchaProfileDoc["trigger"]["when"],
                  },
                })
              }
            />
            <Pick
              select
              label={t("captcha.server")}
              helper={t("captcha.serverHint")}
              value={serverId ?? ""}
              options={[
                { value: "", label: "—" },
                ...servers.map((row) => ({ value: row.uuid, label: row.name })),
              ]}
              onChange={(value) => {
                setServerId(value === "" ? null : value);
                patch({ path: "" });
              }}
            />
            <Pick
              select
              label={t("captcha.path")}
              helper={t("captcha.pathHint")}
              value={doc.path}
              options={[
                { value: "", label: "—" },
                ...(doc.path !== "" && !paths.includes(doc.path)
                  ? [{ value: doc.path, label: doc.path }]
                  : []),
                ...paths.map((path) => ({ value: path, label: path })),
              ]}
              onChange={(path) => patch({ path })}
            />
            <Pick
              select
              label={t("captcha.page")}
              helper={t("captcha.pageHint")}
              value={doc.page}
              options={[
                { value: "", label: t("captcha.pageBuiltin") },
                ...pages.map((row) => ({ value: row.uuid, label: row.name })),
              ]}
              onChange={(page) => patch({ page })}
            />
            <Pick
              label={t("captcha.deliver")}
              helper={t("captcha.deliverHint")}
              value={doc.gate.inline ? "body" : "redirect"}
              options={[
                { value: "redirect", label: t("captcha.delivers.redirect") },
                { value: "body", label: t("captcha.delivers.body") },
              ]}
              onChange={(value) =>
                patch({ gate: { ...doc.gate, inline: value === "body" } })
              }
            />
          </SettingsTable>
          {serverId !== null && paths.length === 0 && (
            <Box sx={{ px: 2, py: 1 }}>
              <TableNotice kind="info" severity="warning" message={t("captcha.pathNone")} />
            </Box>
          )}
        </Section>

        <Section
          title={t("captcha.sectionChannel")}
          hint={t("captcha.sectionChannelHint")}
          help="06-captcha#канал-действий"
          flush
          defaultExpanded
        >
          <SignalsBlock
            help="06-captcha#сигналы-ранних-волн"
            hint={t("captcha.priorHint")}
            rules={doc.trigger.prior.map((row) => ({
              from: row.from,
              accept: [...row.accept],
              codes: row.codes,
            }))}
            verbs={verbOptions}
            weakening={weakeningVerbs(actions)}
            codes={senderCodes}
            unknown={unknownSenders}
            senders={inspectors}
            defaultRule={() => ({
              from: "*",
              accept: ["challenge"],
              codes: [],
            })}
            onChange={(prior) =>
              patch({
                trigger: {
                  ...doc.trigger,
                  prior: prior.map((row) => ({
                    from: row.from,
                    accept: row.accept as CaptchaAccept[],
                    codes: row.codes,
                  })),
                },
              })
            }
          />
          <CaptchaRulesBlock
            rules={doc.rules}
            datasets={datasets.map((row) => row.name)}
            inspectors={inspectors}
            registry={actions}
            onChange={(rules) => patch({ rules })}
          />
        </Section>

        <Section
          title={t("captcha.sectionBuckets")}
          hint={t("captcha.bucketsHint")}
          flush
          help="06-captcha#бакеты"
        >
          <BucketsTable t={t} buckets={doc.buckets} onChange={(buckets) => patch({ buckets })} />
        </Section>

        <Section
          title={t("captcha.sectionGate")}
          hint={t("captcha.sectionGateHint")}
          flush
          help="06-captcha#когда-требовать-проверку"
        >
          <SettingsTable aside={false}>
            <Chips
              t={t}
              freeSolo
              label={t("captcha.redirectMethods")}
              helper={t("captcha.redirectMethodsHint")}
              value={doc.gate.redirectMethods}
              options={["GET", "HEAD", "OPTIONS"]}
              flag={
                <InlineFlag
                  label={t("captcha.htmlOnly")}
                  help={t("captcha.htmlOnlyHint")}
                  checked={doc.gate.htmlOnly}
                  onChange={(value) =>
                    patch({ gate: { ...doc.gate, htmlOnly: value } })
                  }
                />
              }
              onChange={(value) =>
                patch({ gate: { ...doc.gate, redirectMethods: value ?? [] } })
              }
            />
            <Pick
              select
              label={t("captcha.denyResponse")}
              helper={t("captcha.denyResponseHint")}
              value={doc.gate.denyResponse}
              options={denyOptions}
              onChange={(value) => patch({ gate: { ...doc.gate, denyResponse: value } })}
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("captcha.sectionProviders")}
          hint={t("captcha.providersHint")}
          help="06-captcha#провайдеры"
          flush
        >
          <ProvidersTable t={t} scope={scope} doc={doc} onDoc={patch} />
        </Section>

        <Section
          title={t("captcha.sectionClearance")}
          hint={t("captcha.sectionClearanceHint")}
          flush
          help="06-captcha#пропуск-кука-и-список"
        >
          <SettingsTable aside={false}>
            <Num
              label={t("captcha.clearanceTtl")}
              value={String(doc.clearance.ttlS)}
              onChange={(value) =>
                patch({ clearance: { ...doc.clearance, ttlS: Number(value) || 0 } })
              }
            />
            <Text
              label={t("captcha.clearanceCookie")}
              helper={t("captcha.clearanceCookieHint")}
              value={doc.clearance.cookie}
              onChange={(value) =>
                patch({ clearance: { ...doc.clearance, cookie: value } })
              }
            />
            <Text
              label={t("captcha.idCookie")}
              helper={t("captcha.idCookieHint")}
              value={doc.clearance.idCookie}
              onChange={(value) =>
                patch({ clearance: { ...doc.clearance, idCookie: value } })
              }
            />
            <Chips
              t={t}
              freeSolo={false}
              label={t("captcha.bind")}
              helper={t("captcha.bindHint")}
              value={doc.clearance.bind}
              options={BINDS}
              optionLabel={(value) => t(`captcha.binds.${value}`)}
              onChange={(value) =>
                patch({
                  clearance: {
                    ...doc.clearance,
                    bind: bindPick(doc.clearance.bind, value ?? []),
                  },
                })
              }
            />
            <Flag
              label={t("captcha.fingerprint")}
              checked={doc.fingerprint.collect}
              onChange={(value) =>
                patch({ fingerprint: { ...doc.fingerprint, collect: value } })
              }
            />
            <Flag
              label={t("captcha.canvas")}
              checked={doc.fingerprint.canvas}
              disabled={!doc.fingerprint.collect}
              onChange={(value) =>
                patch({ fingerprint: { ...doc.fingerprint, canvas: value } })
              }
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("captcha.sectionList")}
          hint={t("captcha.sectionListHint")}
          flush
          help="06-captcha#пропуск-кука-и-список"
        >
          <SettingsTable aside={false}>
            <Pick
              select
              label={t("captcha.clearanceList")}
              helper={t("captcha.clearanceListHint")}
              value={doc.clearance.list}
              options={[
                { value: "", label: t("captcha.clearanceListNone") },
                ...datasets.map((row) => ({ value: row.name, label: row.name })),
              ]}
              onChange={(value) => patch({ clearance: { ...doc.clearance, list: value } })}
            />
            {doc.clearance.list !== "" && (
              <Num
                label={t("captcha.clearanceGrace")}
                helper={t("captcha.clearanceGraceHint")}
                value={String(doc.clearance.graceS)}
                onChange={(value) =>
                  patch({ clearance: { ...doc.clearance, graceS: Number(value) || 0 } })
                }
              />
            )}
          </SettingsTable>
        </Section>

        <Section
          title={t("captcha.sectionExtra")}
          hint={t("captcha.sectionExtraHint")}
          flush
          help="06-captcha#как-показывают-виджет"
        >
          <SettingsTable aside={false}>
            <Text
              label={t("captcha.title")}
              value={doc.title}
              onChange={(value) => patch({ title: value })}
            />
            <Text
              label={t("captcha.note")}
              value={doc.note}
              onChange={(value) => patch({ note: value })}
            />
            <Text
              label={t("captcha.challengeCookie")}
              helper={t("captcha.challengeCookieHint")}
              value={doc.challenge.cookie}
              onChange={(value) =>
                patch({ challenge: { ...doc.challenge, cookie: value } })
              }
            />
            <Text
              label={t("captcha.issuePerSubnet")}
              helper={t("captcha.limitsHint")}
              value={doc.limits.issuePerSubnet}
              onChange={(value) => patch({ limits: { ...doc.limits, issuePerSubnet: value } })}
            />
            <Text
              label={t("captcha.verifyPerSubnet")}
              value={doc.limits.verifyPerSubnet}
              onChange={(value) => patch({ limits: { ...doc.limits, verifyPerSubnet: value } })}
            />
          </SettingsTable>
        </Section>
      </Form.Body>
      <Form.Actions>
        {id !== null && !isDefault && (
          <Button
            size="small"
            color="error"
            onClick={() => void dispatch(removeCaptchaProfile({ scope, id }))}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!nameOk || waiting}
          onClick={() => {
            void dispatch(
              saveCaptchaProfileThunk({ scope, id, name, description, serverId, doc }),
            );
          }}
        >
          {id === null ? t("common.create") : t("common.save")}
        </Button>
      </Form.Actions>
    </Form>
  );
}

type Slot = "primary" | "fallback";

const PROVIDER_COLS = [120, 190, undefined, ACTIONS_W] as const;

function providerSummary(
  t: Translate,
  doc: CaptchaProfileDoc,
  ref: CaptchaProviderRef,
): string {
  if (ref.kind === "image") {
    const dir = doc.providerConfig.image.audioDir;

    return [
      t("captcha.sumChars", { n: ref.length }),
      !ref.audio
        ? t("captcha.sumNoAudio")
        : dir === ""
          ? t("captcha.sumAudioNoDir")
          : t("captcha.sumAudio", { dir }),
    ].join(" · ");
  }

  const cfg = doc.providerConfig[ref.kind as ExternalKind];
  const secret = cfg.secretStore !== null || cfg.secretEnv !== "";
  const parts = [
    cfg.sitekey === ""
      ? secret
        ? t("captcha.sumNoSitekey")
        : t("captcha.sumKeysNone")
      : secret
        ? t("captcha.sumKeysOk")
        : t("captcha.sumNoSecret"),
  ];

  if (ref.kind === "recaptcha") {
    parts.push(cfg.version === "v3" ? t("captcha.sumScore", { score: cfg.minScore }) : "v2");
  }

  parts.push(t("captcha.sumOnError", { what: t(`captcha.onErrors.${cfg.onError}`) }));

  if (cfg.remoteip) {
    parts.push(t("captcha.sumRemoteip"));
  }

  return parts.join(" · ");
}

function ProvidersTable({
  t,
  scope,
  doc,
  onDoc,
}: {
  t: Translate;
  scope: string;
  doc: CaptchaProfileDoc;
  onDoc: (next: Partial<CaptchaProfileDoc>) => void;
}) {
  const [editing, setEditing] = useState<Slot | null>(null);

  const setPrimary = (kind: string) =>
    onDoc({
      provider: doc.provider.kind === kind ? doc.provider : providerDefaults(kind),
      fallback: doc.fallback !== null && doc.fallback.kind === kind ? null : doc.fallback,
    });

  const setFallback = (kind: string) =>
    onDoc({
      fallback:
        kind === "" || kind === doc.provider.kind
          ? null
          : doc.fallback !== null && doc.fallback.kind === kind
            ? doc.fallback
            : providerDefaults(kind),
    });

  const options = (slot: Slot): FilterOption<string>[] =>
    slot === "primary"
      ? PROVIDERS.map((kind) => ({ value: kind, label: t(`captcha.provider.${kind}`) }))
      : [
          { value: "", label: t("captcha.noFallback") },
          ...PROVIDERS.filter((kind) => kind !== doc.provider.kind).map((kind) => ({
            value: kind,
            label: t(`captcha.provider.${kind}`),
          })),
        ];

  const rows: { slot: Slot; name: string; ref: CaptchaProviderRef | null }[] = [
    { slot: "primary", name: t("captcha.primary"), ref: doc.provider },
    { slot: "fallback", name: t("captcha.fallback"), ref: doc.fallback },
  ];

  const picked =
    editing === null ? null : editing === "primary" ? doc.provider : doc.fallback;

  return (
    <>
      <EditorCellScope>
        <Table size="small" sx={flushTableSx}>
          <TableCols widths={PROVIDER_COLS} />
          <TableHead>
            <TableRow>
              <HeadCell
                label={t("captcha.providerSlot")}
                help={t("captcha.providerSlotHint")}
              />
              <HeadCell label={t("captcha.providerWidget")} />
              <HeadCell
                label={t("captcha.providerSetup")}
                help={t("captcha.providerSetupHint")}
              />
              <TableCell sx={{ ...headCellSx, width: ACTIONS_W }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.slot}>
                <TextCell text={row.name} />
                <FilterSelect
                  value={row.ref === null ? "" : row.ref.kind}
                  unset=""
                  options={options(row.slot)}
                  onChange={row.slot === "primary" ? setPrimary : setFallback}
                />
                <TextCell
                  text={
                    row.ref === null
                      ? t("captcha.sumNone")
                      : providerSummary(t, doc, row.ref)
                  }
                  muted
                />
                <ActionCell>
                  <TableIconButton
                    icon={<SettingsIcon sx={{ fontSize: 16 }} />}
                    tooltip={t("captcha.providerDialog")}
                    disabled={row.ref === null}
                    onClick={() => setEditing(row.slot)}
                  />
                </ActionCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </EditorCellScope>
      {editing !== null && picked !== null && (
        <ProviderDialog
          t={t}
          scope={scope}
          slot={editing}
          widget={picked}
          doc={doc}
          onDoc={onDoc}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ProviderDialog({
  t,
  scope,
  slot,
  widget,
  doc,
  onDoc,
  onClose,
}: {
  t: Translate;
  scope: string;
  slot: Slot;
  widget: CaptchaProviderRef;
  doc: CaptchaProfileDoc;
  onDoc: (next: Partial<CaptchaProfileDoc>) => void;
  onClose: () => void;
}) {
  const kind = widget.kind;

  const patchWidget = (next: Partial<CaptchaProviderRef>) =>
    onDoc(
      slot === "primary"
        ? { provider: { ...doc.provider, ...next } }
        : { fallback: doc.fallback === null ? null : { ...doc.fallback, ...next } },
    );

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      title={t("captcha.providerDialog")}
      help="06-captcha#провайдеры"
      label={`${slot === "primary" ? t("captcha.primary") : t("captcha.fallback")} · ${t(
        `captcha.provider.${kind}`,
      )}`}
    >
      <SettingsTable aside={false} name="42%">
        {kind === "image" && (
          <>
            <Num
              label={t("captcha.imageLength")}
              helper={t("captcha.imageLengthHint")}
              value={String(widget.length)}
              onChange={(value) => patchWidget({ length: Number(value) || 0 })}
            />
            <Flag
              label={t("captcha.imageAudio")}
              helper={t("captcha.imageAudioHint")}
              checked={widget.audio}
              onChange={(value) => patchWidget({ audio: value })}
            />
            {widget.audio && (
              <Text
                label={t("captcha.audioDir")}
                helper={t("captcha.audioDirHint")}
                mono
                value={doc.providerConfig.image.audioDir}
                onChange={(value) =>
                  onDoc({
                    providerConfig: {
                      ...doc.providerConfig,
                      image: { ...doc.providerConfig.image, audioDir: value },
                    },
                  })
                }
              />
            )}
          </>
        )}
        {EXTERNAL.has(kind) && (
          <ExternalRows
            t={t}
            scope={scope}
            kind={kind as ExternalKind}
            cfg={doc.providerConfig[kind as ExternalKind]}
            onChange={(next) =>
              onDoc({
                providerConfig: {
                  ...doc.providerConfig,
                  [kind]: { ...doc.providerConfig[kind as ExternalKind], ...next },
                },
              })
            }
          />
        )}
      </SettingsTable>
    </Modal>
  );
}

function ExternalRows({
  t,
  scope,
  kind,
  cfg,
  onChange,
}: {
  t: Translate;
  scope: string;
  kind: ExternalKind;
  cfg: CaptchaExternalConfig;
  onChange: (next: Partial<CaptchaExternalConfig>) => void;
}) {
  const dispatch = useAppDispatch();
  const [secret, setSecret] = useState("");
  const [sealing, setSealing] = useState(false);

  const seal = async () => {
    setSealing(true);

    const result = await dispatch(sealCaptchaSecret({ scope, provider: kind, secret }));

    setSealing(false);

    if (sealCaptchaSecret.fulfilled.match(result)) {
      onChange({ secretStore: result.payload, secretEnv: "" });
      setSecret("");
    }
  };

  return (
    <>
      <Text
        label={t("captcha.sitekey")}
        mono
        value={cfg.sitekey}
        onChange={(value) => onChange({ sitekey: value })}
      />
      <Text
        label={t("captcha.secretEnv")}
        helper={t("captcha.secretHint")}
        mono
        value={cfg.secretEnv}
        onChange={(value) =>
          onChange({
            secretEnv: value,
            secretStore: value === "" ? cfg.secretStore : null,
          })
        }
      />
      <Text
        label={t("captcha.secretStore")}
        mono
        value={cfg.secretStore ?? ""}
        onChange={(value) =>
          onChange({
            secretStore: value === "" ? null : value,
            secretEnv: value === "" ? cfg.secretEnv : "",
          })
        }
      />
      <SettingsRow
        label={t("captcha.secretValue")}
        help={t("captcha.secretValueHint")}
        end={
          <Button
            size="small"
            variant="outlined"
            disabled={secret === "" || sealing}
            onClick={() => void seal()}
          >
            {t("captcha.sealSecret")}
          </Button>
        }
      >
        <InputBase
          type="password"
          value={secret}
          placeholder={t("captcha.secretValuePlaceholder")}
          onChange={(e) => setSecret(e.target.value)}
          sx={filterInputSx}
        />
      </SettingsRow>
      {kind === "recaptcha" && (
        <Pick
          select
          label={t("captcha.recaptchaVersion")}
          helper={t("captcha.recaptchaVersionHint")}
          value={cfg.version}
          options={[
            { value: "v2", label: "v2" },
            { value: "v3", label: "v3" },
          ]}
          onChange={(value) => onChange({ version: value })}
        />
      )}
      {kind === "recaptcha" && cfg.version === "v3" && (
        <Num
          label={t("captcha.minScore")}
          helper={t("captcha.minScoreHint")}
          value={String(cfg.minScore)}
          onChange={(value) => onChange({ minScore: Number(value) || 0 })}
        />
      )}
      <Pick
        select
        label={t("captcha.onError")}
        helper={t("captcha.onErrorHint")}
        value={cfg.onError}
        options={[
          { value: "fallback", label: t("captcha.onErrors.fallback") },
          { value: "allow", label: t("captcha.onErrors.allow") },
          { value: "deny", label: t("captcha.onErrors.deny") },
        ]}
        onChange={(value) =>
          onChange({ onError: value as CaptchaExternalConfig["onError"] })
        }
      />
      <Flag
        label={t("captcha.remoteip")}
        helper={t("captcha.remoteipHint")}
        checked={cfg.remoteip}
        onChange={(value) => onChange({ remoteip: value })}
      />
    </>
  );
}
