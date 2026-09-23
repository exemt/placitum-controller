import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

import {
  fetchCertificates,
  fetchPorts,
  fetchServers,
  fetchUpstreams,
  UPSTREAM_METHODS,
  type Certificate,
  type UpstreamMethod,
} from "../api.ts";
import { Chips } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import {
  buildPlan,
  emptyCatalog,
  emptyDraft,
  listenLine,
  modeDefaults,
  peersLine,
  planReady,
  portNum,
  runPlan,
  type PlanProgress,
  type PlanStepKind,
  type RunOutcome,
  type RunState,
  type SetupCatalog,
  type SetupDraft,
  type SetupMode,
} from "./setup-plan.ts";

const STEPS = ["port", "server", "upstream", "wire"] as const;

const MODES: readonly SetupMode[] = ["https", "http", "custom"];

const LAST = STEPS.length - 1;

const rowSx = { alignItems: "center" } as const;

const tagSx = { height: 18, fontSize: "0.62rem" } as const;

function StateIcon({ state }: { state: RunState | undefined }) {
  if (state === "run") {
    return <CircularProgress size={14} />;
  }
  if (state === "done") {
    return <CheckCircleIcon fontSize="small" color="success" />;
  }
  if (state === "fail") {
    return <ErrorOutlineIcon fontSize="small" color="error" />;
  }
  return (
    <RadioButtonUncheckedIcon fontSize="small" sx={{ color: "text.disabled" }} />
  );
}

function Ask({ text }: { text: string }) {
  return (
    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
      {text}
    </Typography>
  );
}

function PortStep({
  t,
  draft,
  patch,
  suggestion,
  reused,
}: {
  t: Translate;
  draft: SetupDraft;
  patch: (next: Partial<SetupDraft>) => void;
  suggestion: string;
  reused: string | null;
}) {
  const modeHint = {
    https: t("setup.modeHttpsHint"),
    http: t("setup.modeHttpHint"),
    custom: t("setup.modeCustomHint"),
  }[draft.mode];

  return (
    <Stack spacing={2}>
      <Ask text={t("setup.portAsk")} />
      <Box>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={draft.mode}
          onChange={(_event, next: SetupMode | null) => {
            if (next === null) {
              return;
            }
            patch({ ...modeDefaults(next), mode: next, portName: "" });
          }}
        >
          {MODES.map((mode) => (
            <ToggleButton key={mode} value={mode} sx={{ textTransform: "none" }}>
              {t(`setup.mode${mode[0].toUpperCase()}${mode.slice(1)}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="caption" sx={{ display: "block", mt: 0.75, color: "text.secondary" }}>
          {modeHint}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          label={t("ports.address")}
          helperText={t("ports.addressHint")}
          value={draft.address}
          onChange={(e) => patch({ address: e.target.value })}
          slotProps={{ input: { sx: { fontFamily: "monospace" } } }}
        />
        <TextField
          size="small"
          label={t("ports.port")}
          helperText={t("setup.portHint")}
          value={draft.port}
          onChange={(e) => patch({ port: e.target.value })}
          error={draft.port !== "" && portNum(draft.port) === null}
          sx={{ width: 140 }}
        />
      </Stack>
      <Stack direction="row" spacing={2} sx={rowSx}>
        {draft.mode === "custom" && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={draft.ssl}
                onChange={(e) =>
                  patch({ ssl: e.target.checked, http2: e.target.checked })
                }
              />
            }
            label={t("ports.ssl")}
          />
        )}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={draft.http2}
              onChange={(e) => patch({ http2: e.target.checked })}
            />
          }
          label={t("ports.http2")}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={draft.proxyProtocol}
              onChange={(e) => patch({ proxyProtocol: e.target.checked })}
            />
          }
          label={t("ports.proxyProtocol")}
        />
      </Stack>
      {reused === null && (
        <TextField
          size="small"
          label={t("setup.portName")}
          helperText={t("setup.portNameHint")}
          placeholder={suggestion}
          value={draft.portName}
          onChange={(e) => patch({ portName: e.target.value })}
        />
      )}
      {draft.ssl && (
        <Box>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={draft.redirect}
                onChange={(e) => patch({ redirect: e.target.checked })}
              />
            }
            label={t("setup.redirect")}
          />
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {t("setup.redirectHint")}
          </Typography>
        </Box>
      )}
      <Alert severity="info">
        {reused === null
          ? t("setup.portNew")
          : t("setup.portReuse", {
              listen: listenLine({
                address: draft.address.trim(),
                port: portNum(draft.port) ?? 0,
              }),
              name: reused,
            })}
      </Alert>
    </Stack>
  );
}

function ServerStep({
  t,
  draft,
  patch,
  planned,
  certificates,
}: {
  t: Translate;
  draft: SetupDraft;
  patch: (next: Partial<SetupDraft>) => void;
  planned: string;
  certificates: readonly Certificate[];
}) {
  const typed = draft.serverName.trim();
  const renamed = typed !== "" && typed !== planned;

  return (
    <Stack spacing={2}>
      <Ask text={t("setup.serverAsk")} />
      <Chips
        t={t}
        wide
        freeSolo
        label={t("servers.names")}
        helper={t("servers.namesHint")}
        value={draft.names}
        onChange={(names) => patch({ names: names ?? [] })}
      />
      <TextField
        size="small"
        label={t("setup.serverName")}
        helperText={t("setup.serverNameHint")}
        placeholder={planned}
        value={draft.serverName}
        onChange={(e) => patch({ serverName: e.target.value })}
      />
      {draft.ssl && certificates.length > 0 && (
        <TextField
          select
          size="small"
          label={t("setup.certificate")}
          helperText={t("setup.certHint")}
          value={draft.certificateId}
          onChange={(e) => patch({ certificateId: e.target.value })}
        >
          <MenuItem value="">{t("setup.certNone")}</MenuItem>
          {certificates.map((row) => (
            <MenuItem key={row.uuid} value={row.uuid}>
              {row.name}
              {row.sans.length > 0 ? ` · ${row.sans.join(" ")}` : ""}
            </MenuItem>
          ))}
        </TextField>
      )}
      {draft.ssl && certificates.length === 0 && (
        <Alert severity="warning">{t("setup.certEmpty")}</Alert>
      )}
      {draft.names.length === 0 && (
        <Alert severity="warning">{t("setup.namesEmpty")}</Alert>
      )}
      {renamed && (
        <Alert severity="warning">
          {t("setup.nameTaken", { name: typed, next: planned })}
        </Alert>
      )}
    </Stack>
  );
}

function UpstreamStep({
  t,
  draft,
  patch,
  planned,
  reused,
}: {
  t: Translate;
  draft: SetupDraft;
  patch: (next: Partial<SetupDraft>) => void;
  planned: string;
  reused: string | null;
}) {
  const setPeer = (index: number, next: { host?: string; port?: string }) => {
    patch({
      peers: draft.peers.map((peer, at) =>
        at === index ? { ...peer, ...next } : peer,
      ),
    });
  };

  return (
    <Stack spacing={2}>
      <Ask text={t("setup.upstreamAsk")} />
      <Box>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {t("setup.peersHint")}
        </Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {draft.peers.map((peer, index) => (
            <Stack key={index} direction="row" spacing={1} sx={rowSx}>
              <TextField
                size="small"
                fullWidth
                label={t("upstreams.host")}
                value={peer.host}
                onChange={(e) => setPeer(index, { host: e.target.value })}
                slotProps={{ input: { sx: { fontFamily: "monospace" } } }}
              />
              <TextField
                size="small"
                label={t("upstreams.port")}
                value={peer.port}
                onChange={(e) => setPeer(index, { port: e.target.value })}
                error={peer.port !== "" && portNum(peer.port) === null}
                sx={{ width: 120 }}
              />
              <IconButton
                size="small"
                aria-label={t("setup.dropPeer")}
                disabled={draft.peers.length < 2}
                onClick={() =>
                  patch({ peers: draft.peers.filter((_row, at) => at !== index) })
                }
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
        <Button
          size="small"
          startIcon={<AddIcon />}
          sx={{ mt: 1 }}
          onClick={() => patch({ peers: [...draft.peers, { host: "", port: "80" }] })}
        >
          {t("setup.addPeer")}
        </Button>
      </Box>
      <Stack direction="row" spacing={1.5}>
        <TextField
          select
          size="small"
          label={t("upstreams.method")}
          helperText={t("upstreams.methodHint")}
          value={draft.method}
          onChange={(e) => patch({ method: e.target.value as UpstreamMethod })}
          disabled={draft.peers.length < 2}
          sx={{ width: 200 }}
        >
          {UPSTREAM_METHODS.filter((method) => method !== "hash").map((method) => (
            <MenuItem key={method} value={method}>
              {method}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          fullWidth
          label={t("upstreams.hostHeader")}
          helperText={t("setup.hostHeaderHint")}
          value={draft.hostHeader}
          onChange={(e) => patch({ hostHeader: e.target.value })}
        />
      </Stack>
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={draft.poolTls}
              onChange={(e) => patch({ poolTls: e.target.checked })}
            />
          }
          label={t("upstreams.tls")}
        />
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {t("upstreams.tlsHint")}
        </Typography>
      </Box>
      {reused === null && (
        <TextField
          size="small"
          label={t("setup.poolName")}
          helperText={t("setup.poolNameHint")}
          placeholder={planned}
          value={draft.poolName}
          onChange={(e) => patch({ poolName: e.target.value })}
        />
      )}
      <Alert severity="info">
        {reused === null
          ? t("setup.poolNew")
          : t("setup.poolReuse", { name: reused })}
      </Alert>
    </Stack>
  );
}

export function SetupWizard({
  scope,
  onClose,
  onCreated,
}: {
  scope: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SetupDraft>(emptyDraft);
  const [cat, setCat] = useState<SetupCatalog>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [states, setStates] = useState<Partial<Record<PlanStepKind, RunState>>>({});
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const progress = useRef<PlanProgress>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchPorts(scope),
      fetchServers(scope),
      fetchUpstreams(scope),
      fetchCertificates(scope),
    ])
      .then(([ports, servers, pools, certificates]) => {
        if (!alive) {
          return;
        }
        setCat({
          ports,
          servers,
          pools,
          certificates: certificates.filter((row) => row.type === "server"),
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) {
          return;
        }
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  const plan = useMemo(() => buildPlan(draft, cat), [draft, cat]);
  const patch = (next: Partial<SetupDraft>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  const started = Object.keys(states).length > 0;
  const done = outcome?.ok === true;
  const failedStep = plan.steps.find((row) => row.kind === outcome?.failed);
  const defaultBusy =
    plan.port.existing !== null && plan.port.existing.default_server_id !== null;

  const stepOk = [
    draft.address.trim() !== "" && portNum(draft.port) !== null,
    draft.names.some((name) => name.trim() !== ""),
    peersLine(draft.peers) !== "",
    planReady(draft),
  ][step];

  async function run() {
    setRunning(true);
    setOutcome(null);
    const result = await runPlan(scope, plan, progress.current, (kind, state) => {
      setStates((prev) => ({ ...prev, [kind]: state }));
    });
    setRunning(false);
    setOutcome(result);
    if (result.ok) {
      onCreated();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={running}
      size="md"
      title={t("setup.title")}
      label={t("setup.step", { n: step + 1 })}
      hint={t("setup.blurb")}
      dismissable={!running}
      actions={
        done ? (
          <Modal.Close />
        ) : (
          <>
            <Modal.Cancel />
            {step > 0 && (
              <Button disabled={running || started} onClick={() => setStep(step - 1)}>
                {t("common.back")}
              </Button>
            )}
            {step < LAST ? (
              <Modal.Submit
                disabled={stepOk !== true}
                onClick={() => setStep(step + 1)}
              >
                {t("common.next")}
              </Modal.Submit>
            ) : (
              <Modal.Submit disabled={stepOk !== true || loading} onClick={() => void run()}>
                {outcome === null ? t("common.create") : t("setup.retry")}
              </Modal.Submit>
            )}
          </>
        )
      }
    >
      <Stepper activeStep={step} sx={{ pb: 1 }}>
        {STEPS.map((name) => (
          <Step key={name}>
            <StepLabel>{t(`setup.steps.${name}`)}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {loadError !== null && <Alert severity="error">{loadError}</Alert>}
      {loading ? (
        <Stack direction="row" spacing={1} sx={rowSx}>
          <CircularProgress size={16} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("setup.loading")}
          </Typography>
        </Stack>
      ) : (
        <>
          {step === 0 && (
            <PortStep
              t={t}
              draft={draft}
              patch={patch}
              suggestion={plan.port.input.name}
              reused={plan.port.existing?.name ?? null}
            />
          )}
          {step === 1 && (
            <ServerStep
              t={t}
              draft={draft}
              patch={patch}
              planned={plan.server.name}
              certificates={cat.certificates}
            />
          )}
          {step === 2 && (
            <UpstreamStep
              t={t}
              draft={draft}
              patch={patch}
              planned={plan.pool.input.name}
              reused={plan.pool.existing?.name ?? null}
            />
          )}
          {step === LAST && (
            <Stack spacing={2}>
              <Ask text={t("setup.wireAsk")} />
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={draft.defaultServer && !defaultBusy}
                      disabled={defaultBusy || started}
                      onChange={(e) => patch({ defaultServer: e.target.checked })}
                    />
                  }
                  label={t("setup.defaultServer")}
                />
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                  {defaultBusy
                    ? t("setup.defaultTaken", {
                        listen: listenLine(plan.port.existing ?? { address: "", port: 0 }),
                      })
                    : t("setup.defaultServerHint")}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {t("setup.plan")}
                </Typography>
                <Stack spacing={0.75} sx={{ mt: 1 }}>
                  {plan.steps.map((row) => (
                    <Stack key={row.kind} direction="row" spacing={1} sx={rowSx}>
                      <StateIcon state={states[row.kind]} />
                      <Typography sx={{ fontSize: "0.78rem" }}>
                        {t(row.label, row.vars)}
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 8 }} />
                      {states[row.kind] !== "done" && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={row.reuse ? "default" : "primary"}
                          label={row.reuse ? t("setup.planReuse") : t("setup.planNew")}
                          sx={tagSx}
                        />
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
              {plan.serverOff && (
                <Alert severity="warning">{t("setup.certWarn")}</Alert>
              )}
              {running && (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {t("setup.running")}
                </Typography>
              )}
              {outcome !== null && !outcome.ok && (
                <Alert severity="error">
                  <Stack spacing={0.5}>
                    <span>
                      {t("setup.failed", {
                        step:
                          failedStep === undefined
                            ? ""
                            : t(failedStep.label, failedStep.vars),
                      })}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                      {outcome.error}
                    </span>
                    <span>{t("setup.failedHint")}</span>
                  </Stack>
                </Alert>
              )}
              {done && (
                <Alert severity="success">
                  <Stack spacing={0.5}>
                    <span>{t("setup.done")}</span>
                    {draft.ssl && <span>{t("setup.doneCert")}</span>}
                  </Stack>
                </Alert>
              )}
            </Stack>
          )}
        </>
      )}
    </Modal>
  );
}
