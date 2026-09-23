import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import { Duration, Flag, Num, Pick, Text } from "../components/fields.tsx";
import {
  dataActionCellSx,
  dataCellSx,
  dataHeadSx,
  dataInputSx,
  SectionBleed,
  SettingsGroup,
  SettingsTable,
} from "../components/settings-table.tsx";
import { TableIconButton } from "../components/data-table/index.ts";
import { Modal } from "../components/Modal.tsx";
import { flushTableSx, HeadCell, headCellSx } from "../components/table-block.tsx";
import { editorChipSx } from "../config/editor-kit.tsx";
import ChannelNotice from "../components/ChannelNotice.tsx";
import { useChannel } from "../convergence.tsx";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppSelector } from "../store/hooks.ts";
import { shortHash } from "../fleet.ts";
import {
  fetchHaproxyDesired,
  fetchHaproxySettings,
  saveHaproxySettings,
  sendHaproxySettings,
  type HaproxyBalance,
  type HaproxyConfDesired,
  type HaproxyEntryPointWire,
  type HaproxyServerWire,
  type HaproxySettingsWire,
} from "../api.ts";
import {
  LayerBar,
  LayerCard,
  LayerTabs,
  useLayerTab,
  type LayerItem,
} from "../config/layer-tabs.tsx";
import { MS_PRESETS } from "./config-fields.tsx";

const BALANCES: readonly HaproxyBalance[] = ["roundrobin", "leastconn", "source"];

const HAPROXY_TABS = ["proxy", "routing", "servers", "nodes"] as const;

const BALANCER_HELP = "05-config#балансировщик-перед-узлами";

const HELP: Record<HaproxyTab, string> = {
  proxy: BALANCER_HELP,
  routing: BALANCER_HELP,
  servers: BALANCER_HELP,
  nodes: "10-monitoring#применение-конфигурации",
};

type HaproxyTab = (typeof HAPROXY_TABS)[number];

const TAB_KEY = "waf.config.haproxy.tab";

const cellSx = dataCellSx;
const headSx = dataHeadSx;
const stateCellSx = { ...dataCellSx, textAlign: "right" } as const;
const serversTableSx = { ...flushTableSx, borderTop: 0 } as const;

function same(a: HaproxySettingsWire, b: HaproxySettingsWire): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function prune(input: HaproxySettingsWire): HaproxySettingsWire {
  const out: HaproxySettingsWire = {};

  const process: NonNullable<HaproxySettingsWire["process"]> = {};
  if (input.process?.maxconn !== undefined) process.maxconn = input.process.maxconn;
  if (input.process?.bufsize !== undefined) process.bufsize = input.process.bufsize;
  if (Object.keys(process).length > 0) out.process = process;

  const timeouts: NonNullable<HaproxySettingsWire["timeouts"]> = {};
  for (const key of [
    "connect_ms",
    "client_ms",
    "server_ms",
    "keepalive_ms",
    "tunnel_ms",
  ] as const) {
    const value = input.timeouts?.[key];
    if (value !== undefined) timeouts[key] = value;
  }
  if (Object.keys(timeouts).length > 0) out.timeouts = timeouts;

  const entry: NonNullable<HaproxySettingsWire["entry"]> = {};
  if (input.entry?.addresses !== undefined && input.entry.addresses.length > 0) {
    entry.addresses = [...input.entry.addresses];
  }
  if (input.entry?.ports !== undefined && Object.keys(input.entry.ports).length > 0) {
    entry.ports = { ...input.entry.ports };
  }
  if (Object.keys(entry).length > 0) out.entry = entry;

  const backend: NonNullable<HaproxySettingsWire["backend"]> = {};
  if (input.backend?.balance !== undefined) backend.balance = input.backend.balance;
  const check: NonNullable<NonNullable<HaproxySettingsWire["backend"]>["check"]> = {};
  if (input.backend?.check?.path) check.path = input.backend.check.path;
  if (input.backend?.check?.status !== undefined) {
    check.status = input.backend.check.status;
  }
  if (input.backend?.check?.inter_ms !== undefined) {
    check.inter_ms = input.backend.check.inter_ms;
  }
  if (Object.keys(check).length > 0) backend.check = check;
  const servers = (input.backend?.servers ?? [])
    .filter((row) => row.name.trim() !== "" && row.host.trim() !== "")
    .map((row) => ({ name: row.name, host: row.host }));
  if (servers.length > 0) backend.servers = servers;
  if (Object.keys(backend).length > 0) out.backend = backend;

  const stats: NonNullable<HaproxySettingsWire["stats"]> = {};
  if (input.stats?.enabled !== undefined) stats.enabled = input.stats.enabled;
  if (input.stats?.port !== undefined) stats.port = input.stats.port;
  if (Object.keys(stats).length > 0) out.stats = stats;

  if (input.docker_dns !== undefined) out.docker_dns = input.docker_dns;

  return out;
}

function numText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseNum(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function ServersTable({
  rows,
  onChange,
}: {
  rows: HaproxyServerWire[];
  onChange: (next: HaproxyServerWire[]) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const inputSx = { ...dataInputSx, fontFamily: "monospace" } as const;

  const patchAt = (index: number, patch: Partial<HaproxyServerWire>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <SectionBleed>
      <Table size="small" sx={serversTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell
              label={t("haproxy.servers.name")}
              help={t("haproxy.help.serverName")}
              width={220}
            />
            <HeadCell
              label={t("haproxy.servers.host")}
              help={t("haproxy.help.serverHost")}
            />
            <TableCell sx={{ ...headCellSx, width: 48, minWidth: 48 }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <TableIconButton
                  color="success"
                  icon={<AddIcon sx={{ fontSize: 16 }} />}
                  tooltip={t("common.add")}
                  onClick={() => setAdding(true)}
                />
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index} hover>
              <TableCell sx={cellSx}>
                <InputBase
                  value={row.name}
                  inputProps={{ "aria-label": t("haproxy.servers.name") }}
                  onChange={(e) => patchAt(index, { name: e.target.value })}
                  sx={inputSx}
                />
              </TableCell>
              <TableCell sx={cellSx}>
                <InputBase
                  value={row.host}
                  inputProps={{ "aria-label": t("haproxy.servers.host") }}
                  onChange={(e) => patchAt(index, { host: e.target.value })}
                  sx={inputSx}
                />
              </TableCell>
              <TableCell sx={dataActionCellSx}>
                <TableIconButton
                  color="error"
                  icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                  tooltip={t("common.delete")}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} sx={{ ...cellSx, color: "text.secondary" }}>
                {t("haproxy.servers.defaults")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {adding && (
        <ServerDialog
          taken={rows.map((row) => row.name)}
          onClose={() => setAdding(false)}
          onAdd={(row) => {
            onChange([...rows, row]);
            setAdding(false);
          }}
        />
      )}
    </SectionBleed>
  );
}

const SERVER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SERVER_HOST_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,253}$/;

function ServerDialog({
  taken,
  onClose,
  onAdd,
}: {
  taken: readonly string[];
  onClose: () => void;
  onAdd: (row: HaproxyServerWire) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");

  const trimmedName = name.trim();
  const trimmedHost = host.trim();
  const nameTaken = taken.includes(trimmedName);
  const ready = SERVER_NAME_RE.test(trimmedName) && !nameTaken && SERVER_HOST_RE.test(trimmedHost);

  const submit = () => {
    if (!ready) {
      return;
    }
    onAdd({ name: trimmedName, host: trimmedHost });
  };

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      dirty={name !== "" || host !== ""}
      title={t("haproxy.servers.addTitle")}
      notice={
        nameTaken ? { severity: "warning", text: t("haproxy.servers.nameTaken") } : null
      }
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
          mono
          label={t("haproxy.servers.name")}
          helper={t("haproxy.help.serverName")}
          placeholder="edge-04"
          value={name}
          onChange={setName}
        />
        <Text
          mono
          label={t("haproxy.servers.host")}
          helper={t("haproxy.help.serverHost")}
          placeholder="edge-04"
          value={host}
          onChange={setHost}
        />
      </SettingsTable>
    </Modal>
  );
}

export default function ConfigHaproxy() {
  const t = useT();
  const scope = useAppSelector((s) => s.session.scope);
  const services = useAppSelector((s) => s.fleet.snapshot?.services);
  const [saved, setSaved] = useState<HaproxySettingsWire | null>(null);
  const [draft, setDraft] = useState<HaproxySettingsWire | null>(null);
  const [desired, setDesired] = useState<HaproxyConfDesired | null>(null);
  const [entries, setEntries] = useState<HaproxyEntryPointWire[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useLayerTab<HaproxyTab>(TAB_KEY, HAPROXY_TABS);

  const reload = useCallback(async () => {
    if (scope === null) {
      return;
    }
    try {
      const [doc, pointer] = await Promise.all([
        fetchHaproxySettings(scope),
        fetchHaproxyDesired(scope).catch(() => ({ rev: null, sha256: null })),
      ]);
      setSaved(doc.settings);
      setDraft(doc.settings);
      setEntries(doc.entries ?? []);
      setDesired(pointer);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = useMemo(
    () => saved !== null && draft !== null && !same(prune(draft), saved),
    [saved, draft],
  );

  const channel = useChannel("haproxy");

  const save = async () => {
    if (scope === null || draft === null) {
      return;
    }
    setBusy(true);
    try {
      const doc = await saveHaproxySettings(scope, prune(draft));
      setSaved(doc.settings);
      setDraft(doc.settings);
      setEntries(doc.entries ?? []);
      setError(null);
      channel.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (scope === null) {
      return;
    }
    setBusy(true);
    try {
      setDesired(await sendHaproxySettings(scope));
      setError(null);
      channel.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  usePageBar({
    meta:
      desired?.rev == null
        ? undefined
        : t("haproxy.sent", {
            rev: desired.rev,
            hash: shortHash(desired.sha256 ?? ""),
          }),
    onSave: scope === null || draft === null ? undefined : () => void save(),
    onReset: saved === null ? undefined : () => setDraft(saved),
    onSend: scope === null ? undefined : () => void send(),
    saveDisabled: draft === null || !dirty || busy,
    resetDisabled: saved === null || !dirty || busy,
    sendDisabled: scope === null || busy,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  if (draft === null) {
    return <Typography color="text.secondary">{t("config.loading")}</Typography>;
  }

  const balancers = (services ?? []).filter((row) => row.name === "haproxy");

  const setProcess = (patch: Partial<NonNullable<HaproxySettingsWire["process"]>>) =>
    setDraft({ ...draft, process: { ...draft.process, ...patch } });
  const setTimeouts = (
    patch: Partial<NonNullable<HaproxySettingsWire["timeouts"]>>,
  ) => setDraft({ ...draft, timeouts: { ...draft.timeouts, ...patch } });
  const setBackend = (patch: Partial<NonNullable<HaproxySettingsWire["backend"]>>) =>
    setDraft({ ...draft, backend: { ...draft.backend, ...patch } });
  const setCheck = (
    patch: Partial<NonNullable<NonNullable<HaproxySettingsWire["backend"]>["check"]>>,
  ) => setBackend({ check: { ...draft.backend?.check, ...patch } });
  const setStats = (patch: Partial<NonNullable<HaproxySettingsWire["stats"]>>) =>
    setDraft({ ...draft, stats: { ...draft.stats, ...patch } });

  const field = (key: string) => t(`haproxy.field.${key}`);
  const help = (key: string) => t(`haproxy.help.${key}`);

  const items: LayerItem<HaproxyTab>[] = HAPROXY_TABS.map((id) => ({
    help: HELP[id],
    id,
    label: t(`haproxy.section.${id}`),
    hint: t(`haproxy.section.${id}Hint`),
  }));
  const item = items.find((row) => row.id === tab);

  return (
    <Stack spacing={2}>
      {error !== null && <Alert severity="error">{error}</Alert>}

      <Alert severity="info">{t("haproxy.scopeHint")}</Alert>

      <ChannelNotice id="haproxy" />

      <LayerBar>
        <LayerTabs items={items} value={tab} onChange={setTab} />

      <LayerCard flush title={item?.label ?? ""} hint={item?.hint} help={item?.help}>
        {tab === "nodes" ? (
          <SectionBleed scroll>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>{t("haproxy.nodes.node")}</TableCell>
                <TableCell sx={headSx} width={90}>
                  {t("haproxy.nodes.rev")}
                </TableCell>
                <TableCell sx={headSx} width={140}>
                  {t("haproxy.nodes.hash")}
                </TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }} width={150}>
                  {t("haproxy.nodes.state")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {balancers.map((row) => {
                const conf = row.conf;
                const state =
                  conf === undefined
                    ? "none"
                    : conf.apply === "apply_failed"
                      ? "failed"
                      : desired?.rev != null && conf.rev !== desired.rev
                        ? "stale"
                        : "ok";
                return (
                  <TableRow key={row.uuid} hover>
                    <TableCell sx={cellSx}>
                      {row.hostname === "" ? row.uuid : row.hostname}
                    </TableCell>
                    <TableCell sx={cellSx}>{conf?.rev ?? "—"}</TableCell>
                    <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>
                      {conf === undefined ? "—" : shortHash(conf.sha256)}
                    </TableCell>
                    <TableCell sx={stateCellSx}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={
                          state === "failed"
                            ? "error"
                            : state === "stale"
                              ? "warning"
                              : "default"
                        }
                        label={t(`haproxy.nodes.${state}`)}
                        sx={editorChipSx}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {balancers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ ...cellSx, color: "text.secondary" }}>
                    {t("haproxy.nodes.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </SectionBleed>
        ) : tab === "servers" ? (
          <ServersTable
            rows={draft.backend?.servers ?? []}
            onChange={(next) => setBackend({ servers: next })}
          />
        ) : (
          <SettingsTable>
            {tab === "proxy" ? (
              <>
          <SettingsGroup
            title={t("haproxy.group.process")}
            hint={t("haproxy.group.processHint")}
          >
            <Num
              optional
              fallback={4096}
              presets={[1024, 4096, 16384]}
              label={field("maxconn")}
              helper={help("maxconn")}
              value={numText(draft.process?.maxconn)}
              onChange={(v) => setProcess({ maxconn: parseNum(v) })}
            />
            <Num
              optional
              fallback={1048576}
              presets={[16384, 65536, 1048576]}
              label={field("bufsize")}
              helper={help("bufsize")}
              value={numText(draft.process?.bufsize)}
              onChange={(v) => setProcess({ bufsize: parseNum(v) })}
            />
            <Flag
              label={field("dockerDns")}
              helper={help("dockerDns")}
              checked={draft.docker_dns ?? true}
              onChange={(on) => setDraft({ ...draft, docker_dns: on })}
            />
          </SettingsGroup>
          <SettingsGroup
            title={t("haproxy.group.timeouts")}
            hint={t("haproxy.group.timeoutsHint")}
          >
            <Duration
              optional
              base="ms"
              fallback={2000}
              presets={MS_PRESETS.short}
              label={field("connect")}
              helper={help("connect")}
              value={draft.timeouts?.connect_ms}
              onChange={(v) => setTimeouts({ connect_ms: v })}
            />
            <Duration
              optional
              base="ms"
              fallback={30000}
              presets={MS_PRESETS.timeout}
              label={field("client")}
              helper={help("client")}
              value={draft.timeouts?.client_ms}
              onChange={(v) => setTimeouts({ client_ms: v })}
            />
            <Duration
              optional
              base="ms"
              fallback={30000}
              presets={MS_PRESETS.timeout}
              label={field("server")}
              helper={help("server")}
              value={draft.timeouts?.server_ms}
              onChange={(v) => setTimeouts({ server_ms: v })}
            />
            <Duration
              optional
              base="ms"
              fallback={5000}
              presets={MS_PRESETS.short}
              label={field("keepalive")}
              helper={help("keepalive")}
              value={draft.timeouts?.keepalive_ms}
              onChange={(v) => setTimeouts({ keepalive_ms: v })}
            />
            <Duration
              optional
              base="ms"
              fallback={3600000}
              presets={[600000, 3600000, 14400000]}
              label={field("tunnel")}
              helper={help("tunnel")}
              value={draft.timeouts?.tunnel_ms}
              onChange={(v) => setTimeouts({ tunnel_ms: v })}
            />
          </SettingsGroup>
              </>
            ) : (
              <>
          <SettingsGroup
            title={t("haproxy.group.frontends")}
            hint={t("haproxy.group.frontendsHint")}
          >
            <SectionBleed>
              <Table size="small" sx={serversTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={headSx}>{t("haproxy.frontends.ports")}</TableCell>
                    <TableCell sx={headSx}>{t("haproxy.frontends.port")}</TableCell>
                    <TableCell sx={headSx}>{t("haproxy.frontends.mode")}</TableCell>
                    <TableCell sx={headSx}>{t("haproxy.frontends.serverPort")}</TableCell>
                    <TableCell sx={headSx}>{t("haproxy.frontends.proxy")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>
                        {row.ports.join(", ")}
                      </TableCell>
                      <TableCell
                        sx={{ ...cellSx, fontFamily: row.taken === null ? "monospace" : undefined, color: row.taken === null ? undefined : "text.secondary" }}
                      >
                        {row.taken === null
                          ? (row.addresses.length === 0 ? ["*"] : row.addresses)
                              .map((address) => `${address}:${row.port}`)
                              .join(" ")
                          : t("haproxy.frontends.taken", { port: row.port, name: row.taken })}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>{row.mode}</TableCell>
                      <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>{row.server_port}</TableCell>
                      <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>
                        {row.send_proxy ? "send-proxy-v2" : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ ...cellSx, color: "text.secondary" }}>
                        {t("haproxy.frontends.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </SectionBleed>
          </SettingsGroup>
          <SettingsGroup
            title={t("haproxy.group.backend")}
            hint={t("haproxy.group.backendHint")}
          >
            <Pick
              label={field("balance")}
              helper={help("balance")}
              value={draft.backend?.balance ?? "roundrobin"}
              options={BALANCES.map((value) => ({ value, label: value }))}
              onChange={(v) => setBackend({ balance: v })}
            />
            <Text
              optional
              mono
              label={field("checkPath")}
              helper={help("checkPath")}
              value={draft.backend?.check?.path ?? ""}
              onChange={(v) => setCheck({ path: v })}
            />
            <Num
              optional
              fallback={200}
              presets={[200, 204]}
              label={field("checkStatus")}
              helper={help("checkStatus")}
              value={numText(draft.backend?.check?.status)}
              onChange={(v) => setCheck({ status: parseNum(v) })}
            />
            <Duration
              optional
              base="ms"
              fallback={2000}
              presets={MS_PRESETS.short}
              label={field("checkInter")}
              helper={help("checkInter")}
              value={draft.backend?.check?.inter_ms}
              onChange={(v) => setCheck({ inter_ms: v })}
            />
          </SettingsGroup>
          <SettingsGroup
            title={t("haproxy.group.stats")}
            hint={t("haproxy.group.statsHint")}
          >
            <Flag
              label={field("statsEnabled")}
              helper={help("statsEnabled")}
              checked={draft.stats?.enabled ?? true}
              onChange={(on) => setStats({ enabled: on })}
            />
            <Num
              optional
              fallback={8404}
              presets={[8404]}
              label={field("statsPort")}
              helper={help("statsPort")}
              value={numText(draft.stats?.port)}
              onChange={(v) => setStats({ port: parseNum(v) })}
            />
          </SettingsGroup>
              </>
            )}
          </SettingsTable>
        )}
      </LayerCard>
      </LayerBar>
    </Stack>
  );
}
