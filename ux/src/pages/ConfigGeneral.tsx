import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  Chips,
  Choice,
  Duration,
  Num,
  Text,
  Tri,
  UnderlayTabs,
} from "../components/fields.tsx";
import {
  SettingsTable,
  UnitLabel,
  UnitSelect,
} from "../components/settings-table.tsx";
import { useT } from "../i18n/index.ts";
import {
  asNumText,
  asOptBool,
  asOptNum,
  asRecord,
  asString,
  asStringList,
  MS_PRESETS,
  parseNum,
  setKey,
  setNested,
  SizeField,
  SIZE_HINTS,
} from "./config-fields.tsx";
import { PreviewDock } from "../config/PreviewDock.tsx";
import {
  asPairs,
  EditorRow,
  sanitize,
  useHttpDraft,
} from "../config/http-draft.tsx";
import { VarsCatalog } from "../config/VarsCatalog.tsx";
import {
  LayerBar,
  LayerCard,
  LayerTabs,
  useLayerTab,
  type LayerItem,
} from "../config/layer-tabs.tsx";

const WAF_MODULE = "modules/ngx_http_waf_module.so";
const WORKER_PROCESSES = ["auto", "1", "2", "4", "8", "16"];
const RLIMIT_NOFILE = [1024, 4096, 65535, 1048576];
const USERS = ["nginx", "www-data", "nobody"];
const PIDS = ["/var/run/nginx.pid", "/run/nginx.pid"];
const ERROR_LOG_PATHS = ["/var/log/nginx/error.log", "/dev/stderr", "stderr"];
const ERROR_LEVELS = [
  "debug",
  "info",
  "notice",
  "warn",
  "error",
  "crit",
  "alert",
  "emerg",
] as const;
type ErrorLevel = (typeof ERROR_LEVELS)[number];
const WORKER_CONNECTIONS = [512, 1024, 4096, 10240, 65535];
const EVENT_METHODS = ["epoll", "kqueue", "poll", "select"];
const INCLUDES = ["/etc/nginx/waf-node.conf", "/etc/nginx/modules-enabled/*.conf"];
const MAX_INFLIGHT = [1024, 4096, 16384, 65536];
const AGENT_SOCKETS = ["/run/waf/verdict.sock", "unix:/run/waf/verdict.sock"];
const BODY_HOLDS = [100, 1000, 10000];

type GeneralView = "waf" | "nginx" | "preview";

const NGINX_TABS = ["mainModule", "mainEvents", "mainIncludes"] as const;
const WAF_TABS = ["shm", "limits", "bus", "vars"] as const;

type NginxTab = (typeof NGINX_TABS)[number];
type WafTab = (typeof WAF_TABS)[number];

const NGINX_TAB_KEY = "waf.config.general.nginxTab";
const WAF_TAB_KEY = "waf.config.general.wafTab";

function splitErrorLog(raw: string): { path: string; level: ErrorLevel | "" } {
  const parts = raw.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  if (parts.length > 1 && (ERROR_LEVELS as readonly string[]).includes(last)) {
    return { path: parts.slice(0, -1).join(" "), level: last as ErrorLevel };
  }
  return { path: raw.trim(), level: "" };
}

function joinErrorLog(path: string, level: string): string {
  const p = path.trim();
  if (p === "") {
    return "";
  }
  return level === "" ? p : `${p} ${level}`;
}

export default function ConfigGeneral() {
  const t = useT();
  const { scope, doc, draft, setDraft, loading, error } = useHttpDraft();
  const [view, setView] = useState<GeneralView>("waf");
  const [nginxTab, setNginxTab] = useLayerTab<NginxTab>(NGINX_TAB_KEY, NGINX_TABS);
  const [wafTab, setWafTab] = useLayerTab<WafTab>(WAF_TAB_KEY, WAF_TABS);

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  if (loading && draft === null) {
    return <Typography color="text.secondary">{t("config.loading")}</Typography>;
  }

  if (draft === null) {
    return <Alert severity="warning">{t("config.empty")}</Alert>;
  }

  const main = draft.nginx_main;
  const events = asRecord(main.events);
  const shm = asRecord(draft.waf_http.shmZone);
  const bus = asRecord(draft.waf_http.bus);
  const vars = asPairs(draft.waf_http.vars);
  const errorLog = splitErrorLog(asString(main.errorLog));

  const setNginxMain = (next: typeof draft.nginx_main) =>
    setDraft({ ...draft, nginx_main: next });
  const setMain = (key: string, value: unknown) =>
    setNginxMain(setKey(main, key, value));
  const setEvents = (key: string, value: unknown) =>
    setNginxMain(setNested(main, "events", setKey(events, key, value)));
  const setWafHttp = (next: typeof draft.waf_http) =>
    setDraft({ ...draft, waf_http: next });
  const setWaf = (key: string, value: unknown) =>
    setWafHttp(setKey(draft.waf_http, key, value));
  const setBus = (key: string, value: unknown) =>
    setWafHttp(setNested(draft.waf_http, "bus", setKey(bus, key, value)));

  const field = (key: string) => t(`config.field.${key}`);
  const help = (key: string) => t(`config.help.${key}`);
  const group = (key: string) => t(`config.group.${key}`);
  const groupHint = (key: string) => {
    const path = `config.group.${key}Hint`;
    const value = t(path);
    return value === path ? undefined : value;
  };

  const nginxItems: LayerItem<NginxTab>[] = NGINX_TABS.map((id) => ({
    id,
    label: group(id),
    hint: groupHint(id),
  }));
  const wafItems: LayerItem<WafTab>[] = WAF_TABS.map((id) => ({
    id,
    label: group(id),
    hint: groupHint(id),
  }));
  const tab: NginxTab | WafTab = view === "nginx" ? nginxTab : wafTab;
  const item = [...nginxItems, ...wafItems].find((row) => row.id === tab);

  const fields = () => {
    switch (tab) {
      case "mainEvents":
        return (
          <>
            <Num
              optional
              fallback={1024}
              presets={WORKER_CONNECTIONS}
              label={field("workerConnections")}
              helper={help("workerConnections")}
              value={asNumText(events.workerConnections)}
              end={<UnitLabel>conn</UnitLabel>}
              onChange={(v) => setEvents("workerConnections", parseNum(v))}
            />
            <Tri
              t={t}
              fallback="off"
              optional
              label={field("multiAccept")}
              helper={help("multiAccept")}
              value={asOptBool(events.multiAccept)}
              onChange={(v) => setEvents("multiAccept", v)}
            />
            <Choice
              t={t}
              optional
              label={field("eventsUse")}
              helper={help("eventsUse")}
              value={asString(events.use)}
              options={EVENT_METHODS}
              onChange={(v) => setEvents("use", v)}
            />
          </>
        );
      case "mainIncludes":
        return (
          <>
            <Chips
              t={t}
              optional
              label={field("mainIncludes")}
              helper={help("mainIncludes")}
              value={asStringList(main.includes)}
              options={INCLUDES}
              placeholder={INCLUDES[0]}
              onChange={(v) => setMain("includes", v)}
            />
          </>
        );
      case "shm":
        return (
          <>
            <Text
              optional
              fallback="waf"
              label={field("shmName")}
              helper={help("shmName")}
              value={asString(shm.name)}
              placeholder="waf"
              onChange={(name) =>
                setWafHttp(
                  setNested(
                    draft.waf_http,
                    "shmZone",
                    setKey(
                      setKey(shm, "name", name),
                      "size",
                      asString(shm.size) === "" && name !== "" ? "8m" : asString(shm.size),
                    ),
                  ),
                )
              }
            />
            <SizeField
              optional
              label={field("shmSize")}
              helper={help("shmSize")}
              value={shm.size}
              units={["gb", "mb"]}
              hints={SIZE_HINTS.shm}
              onChange={(size) =>
                setWafHttp(
                  setNested(
                    draft.waf_http,
                    "shmZone",
                    setKey(
                      setKey(shm, "size", size),
                      "name",
                      asString(shm.name) === "" && size !== undefined
                        ? "waf"
                        : asString(shm.name),
                    ),
                  ),
                )
              }
            />
            <Num
              optional
              fallback={4096}
              presets={MAX_INFLIGHT}
              label={field("maxInflight")}
              helper={help("maxInflight")}
              value={asNumText(draft.waf_http.maxInflight)}
              end={<UnitLabel>req</UnitLabel>}
              onChange={(v) => setWaf("maxInflight", parseNum(v))}
            />
            <Text
              presets={AGENT_SOCKETS}
              mono
              label={field("agentSocket")}
              helper={help("agentSocket")}
              value={asString(draft.waf_http.agentSocket)}
              placeholder={AGENT_SOCKETS[0]}
              onChange={(v) => setWaf("agentSocket", v)}
            />
          </>
        );
      case "limits":
        return (
          <>
            <SizeField
              optional
              label={field("replyMax")}
              helper={help("replyMax")}
              value={draft.waf_http.replyMax}
              units={["mb", "kb"]}
              hints={SIZE_HINTS.reply}
              onChange={(v) => setWaf("replyMax", v)}
            />
            <SizeField
              optional
              label={field("headerValueMax")}
              helper={help("headerValueMax")}
              value={draft.waf_http.headerValueMax}
              units={["mb", "kb"]}
              hints={SIZE_HINTS.header}
              onChange={(v) => setWaf("headerValueMax", v)}
            />
            <Num
              optional
              fallback={1000}
              presets={BODY_HOLDS}
              label={field("bodyMaxHolds")}
              helper={help("bodyMaxHolds")}
              value={asNumText(draft.waf_http.bodyMaxHolds)}
              end={<UnitLabel>bodies</UnitLabel>}
              onChange={(v) => setWaf("bodyMaxHolds", parseNum(v))}
            />
          </>
        );
      case "bus":
        return (
          <>
            <EditorRow label={field("busAddress")} help={help("busAddress")}>
              <Box
                component="code"
                sx={{
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "text.secondary",
                }}
              >
                {doc?.infra?.nats_url ? doc.infra.nats_url : "—"}
              </Box>
            </EditorRow>
            <EditorRow label={field("redisExchange")} help={help("redisExchange")}>
              <Box
                component="code"
                sx={{
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "text.secondary",
                }}
              >
                {doc?.infra?.redis_url ? doc.infra.redis_url : "—"}
              </Box>
            </EditorRow>
            <EditorRow label={field("redisInternal")} help={help("redisInternal")}>
              <Box
                component="code"
                sx={{
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "text.secondary",
                }}
              >
                {doc?.infra?.redis_internal_url ? doc.infra.redis_internal_url : "—"}
              </Box>
            </EditorRow>
            <Text
              optional
              label={field("busName")}
              helper={help("busName")}
              value={asString(bus.name)}
              placeholder="waf-edge"
              onChange={(v) => setBus("name", v)}
            />
            <Duration
              optional
              base="ms"
              fallback={1000}
              presets={MS_PRESETS.short}
              label={field("busConnectTimeoutMs")}
              helper={help("busConnectTimeoutMs")}
              value={asOptNum(bus.connectTimeoutMs)}
              onChange={(v) => setBus("connectTimeoutMs", v)}
            />
            <Duration
              optional
              base="ms"
              fallback={100}
              presets={MS_PRESETS.short}
              label={field("busReconnectWaitMs")}
              helper={help("busReconnectWaitMs")}
              value={asOptNum(bus.reconnectWaitMs)}
              onChange={(v) => setBus("reconnectWaitMs", v)}
            />
            <Duration
              optional
              base="ms"
              fallback={10000}
              presets={MS_PRESETS.interval}
              label={field("busPingIntervalMs")}
              helper={help("busPingIntervalMs")}
              value={asOptNum(bus.pingIntervalMs)}
              onChange={(v) => setBus("pingIntervalMs", v)}
            />
            <SizeField
              optional
              label={field("busPendingMax")}
              helper={help("busPendingMax")}
              value={bus.pendingMax}
              units={["gb", "mb"]}
              hints={SIZE_HINTS.pending}
              onChange={(v) => setBus("pendingMax", v)}
            />
            <SizeField
              optional
              label={field("busPayloadMax")}
              helper={help("busPayloadMax")}
              value={bus.payloadMax}
              units={["mb", "kb"]}
              hints={SIZE_HINTS.payload}
              onChange={(v) => setBus("payloadMax", v)}
            />
            <Duration
              optional
              base="ms"
              fallback={0}
              presets={[0, 10, 50, 100, 500]}
              label={field("busFlushIntervalMs")}
              helper={help("busFlushIntervalMs")}
              value={asOptNum(draft.waf_http.busFlushIntervalMs)}
              onChange={(v) => setWaf("busFlushIntervalMs", v)}
            />

          </>
        );
      default:
        return (
          <>
            <Chips
              t={t}
              optional
              label={field("loadModules")}
              helper={help("loadModules")}
              value={asStringList(main.loadModules)}
              options={[WAF_MODULE]}
              placeholder={WAF_MODULE}
              onChange={(v) => setMain("loadModules", v)}
            />
            <Text
              optional
              fallback="auto"
              presets={WORKER_PROCESSES}
              label={field("workerProcesses")}
              helper={help("workerProcesses")}
              value={
                main.workerProcesses === undefined ? "" : String(main.workerProcesses)
              }
              placeholder="auto"
              onChange={(v) =>
                setMain(
                  "workerProcesses",
                  v === "" ? undefined : v === "auto" ? "auto" : (parseNum(v) ?? v),
                )
              }
            />
            <Num
              optional
              presets={RLIMIT_NOFILE}
              label={field("workerRlimitNofile")}
              helper={help("workerRlimitNofile")}
              value={asNumText(main.workerRlimitNofile)}
              end={<UnitLabel>fd</UnitLabel>}
              onChange={(v) => setMain("workerRlimitNofile", parseNum(v))}
            />
            <Text
              optional
              fallback="nginx"
              presets={USERS}
              label={field("user")}
              helper={help("user")}
              value={asString(main.user)}
              placeholder="nginx"
              onChange={(v) => setMain("user", v)}
            />
            <Text
              optional
              fallback="/var/run/nginx.pid"
              presets={PIDS}
              mono
              label={field("pid")}
              helper={help("pid")}
              value={asString(main.pid)}
              placeholder="/var/run/nginx.pid"
              onChange={(v) => setMain("pid", v)}
            />
            <Text
              optional
              fallback="/var/log/nginx/error.log info"
              presets={ERROR_LOG_PATHS}
              mono
              label={field("mainErrorLog")}
              helper={help("mainErrorLog")}
              value={errorLog.path}
              placeholder="/var/log/nginx/error.log"
              onChange={(v) => {
                const next = splitErrorLog(v);
                setMain(
                  "errorLog",
                  joinErrorLog(next.path, next.level === "" ? errorLog.level : next.level),
                );
              }}
              end={
                <UnitSelect
                  width={84}
                  label="level"
                  value={errorLog.level === "" ? "error" : errorLog.level}
                  options={ERROR_LEVELS.map((level) => ({ value: level, label: level }))}
                  onChange={(level) =>
                    setMain("errorLog", joinErrorLog(errorLog.path, level))
                  }
                />
              }
            />
            <Tri
              t={t}
              fallback="on"
              optional
              label={field("mainErrorLogShip")}
              helper={help("mainErrorLogShip")}
              value={asOptBool(main.errorLogShip)}
              onChange={(v) => setMain("errorLogShip", v)}
            />
          </>
        );
    }
  };

  return (
    <Stack spacing={2}>
      {error !== null && <Alert severity="error">{error}</Alert>}

      <LayerBar>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <UnderlayTabs
            value={view}
            onChange={setView}
            items={[
              { value: "waf", label: t("config.tab.waf") },
              { value: "nginx", label: t("config.tab.nginx") },
              { value: "preview", label: t("config.tab.preview") },
            ]}
          />
          <Box sx={{ flexGrow: 1 }} />
        </Stack>
        {view === "nginx" && (
          <LayerTabs items={nginxItems} value={nginxTab} onChange={setNginxTab} />
        )}
        {view === "waf" && (
          <LayerTabs items={wafItems} value={wafTab} onChange={setWafTab} />
        )}
      {view === "preview" ? (
        <PreviewDock
          scope={scope}
          draft={{ http: sanitize(draft) }}
          node={{ kind: "http" }}
          enabled
        />
      ) : (
        <LayerCard flush title={item?.label ?? ""} hint={item?.hint}>
          {tab === "vars" ? (
            <VarsCatalog
              rows={vars}
              onChange={(next) => setWaf("vars", next.length === 0 ? undefined : next)}
            />
          ) : (
            <SettingsTable>{fields()}</SettingsTable>
          )}
        </LayerCard>
      )}
      </LayerBar>
    </Stack>
  );
}
