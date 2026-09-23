import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SettingsIcon from "@mui/icons-material/Settings";

import { Form, formDrawerPaperSx } from "../components/Form.tsx";
import {
  DataTable,
  FilterSelect,
  FilterText,
  RowActionsHead,
  TableIconButton,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { Choice, Num, Section, Text } from "../components/fields.tsx";
import { GRIP_W, dragSx, moveTo, useRowDrag } from "../components/row-drag.tsx";
import { useT } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  copyLocationThunk,
  deleteLocationThunk,
  loadPaths,
  openPanel,
  reorderLocationsThunk,
  saveLocationThunk,
  setServerFilter,
} from "../store/slices/pages/paths.ts";
import type { PreviewDraft, RouteLocation } from "../api.ts";
import {
  asNumText,
  parseNum,
  sanitizeHeaders,
  sanitizeWaf,
  type Doc,
} from "./config-fields.tsx";
import { TrafficBar } from "../components/TrafficBar.tsx";
import {
  nginxLocationName,
  nginxServerName,
  routeKey,
  useRouteTraffic,
  useTrafficLive,
} from "../traffic.ts";
import { RouteBody, RouteOffNotice, RoutePower } from "../config/RouteBody.tsx";
import { CatalogProvider } from "../config/editors.tsx";
import { useCatalogBundle, useInheritance } from "../config/usePreview.ts";

const PANEL_WIDTH = 908;
const MATCHES = ["prefix", "exact", "regex", "regex_i", "named"] as const;
const HANDLERS = ["proxy", "static", "return"] as const;
const PROTOCOLS = ["http", "websocket"] as const;

function isRedirect(status: number | undefined): boolean {
  return status !== undefined && status >= 300 && status < 400;
}

function denyRank(row: RouteLocation): number {
  return row.nginx?.role === "deny_page" ? 0 : 1;
}

/** Pool of a path: its own, or the server default when a proxy path names none. */
function PoolCell({ row }: { row: RouteLocation }) {
  const t = useT();
  const upstreams = useAppSelector((s) => s.pages.paths.upstreams);
  const servers = useAppSelector((s) => s.pages.paths.servers);
  const serverPool =
    row.upstream_id === null && row.handler === "proxy"
      ? (servers.find((item) => item.uuid === row.server_id)?.upstream_id ?? null)
      : null;
  const id = row.upstream_id ?? serverPool;
  if (id === null) {
    return <>{t("common.none")}</>;
  }
  const name = upstreams.find((item) => item.uuid === id)?.name ?? id;
  if (serverPool === null) {
    return <>{name}</>;
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "baseline", whiteSpace: "nowrap" }}>
      <span>{name}</span>
      <Typography variant="caption" color="text.secondary">
        ({t("inherit.tag.server")})
      </Typography>
    </Stack>
  );
}

export default function Paths() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const servers = useAppSelector((s) => s.pages.paths.servers);
  const rows = useAppSelector((s) => s.pages.paths.rows);
  const serverId = useAppSelector((s) => s.pages.paths.serverId);
  const loading = useAppSelector((s) => s.pages.paths.loading);
  const error = useAppSelector((s) => s.pages.paths.error);
  const panelId = useAppSelector((s) => s.pages.paths.panelId);
  const [matchQuery, setMatchQuery] = useState("");
  const [pathQuery, setPathQuery] = useState("");
  const [handlerQuery, setHandlerQuery] = useState("");
  const [enabledQuery, setEnabledQuery] = useState("");
  const [draft, setDraft] = useState<RouteLocation[] | null>(null);
  const [cutId, setCutId] = useState<string | null>(null);

  const routeTraffic = useRouteTraffic();
  const live = useTrafficLive();
  const serverNameById = useMemo(
    () => new Map(servers.map((row) => [row.uuid, nginxServerName(row)])),
    [servers],
  );

  const serverOptions = useMemo(
    () => [
      { value: "", label: t("paths.server") },
      ...servers.map((row) => ({
        value: row.uuid,
        label: row.server_names.join(" ") || row.name,
      })),
    ],
    [servers, t],
  );
  const matchOptions = useMemo(
    () => [
      { value: "", label: t("paths.match") },
      ...MATCHES.map((row) => ({ value: row, label: row })),
    ],
    [t],
  );
  const handlerOptions = useMemo(
    () => [
      { value: "", label: t("paths.handler") },
      ...HANDLERS.map((row) => ({ value: row, label: row })),
    ],
    [t],
  );
  const enabledOptions = useMemo(
    () => [
      { value: "", label: t("common.enabled") },
      { value: "yes", label: t("common.yes") },
      { value: "no", label: t("common.no") },
    ],
    [t],
  );

  const filtered = useMemo(() => {
    const path = pathQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (serverId !== null && row.server_id !== serverId) {
        return false;
      }
      if (matchQuery !== "" && row.match !== matchQuery) {
        return false;
      }
      if (path.length > 0 && !row.path.toLowerCase().includes(path)) {
        return false;
      }
      if (handlerQuery !== "" && row.handler !== handlerQuery) {
        return false;
      }
      if (enabledQuery === "yes" && !row.enabled) {
        return false;
      }
      if (enabledQuery === "no" && row.enabled) {
        return false;
      }
      return true;
    });
  }, [
    enabledQuery,
    handlerQuery,
    matchQuery,
    pathQuery,
    rows,
    serverId,
  ]);
  const narrowed =
    matchQuery !== "" ||
    pathQuery.trim() !== "" ||
    handlerQuery !== "" ||
    enabledQuery !== "";
  const filtering = serverId !== null || narrowed;
  const ordering = serverId !== null && !narrowed;
  const shown = draft ?? filtered;
  const pager = usePager(shown);
  const ops = useRowOps<RouteLocation>({
    nameOf: (row) => row.path,
    copyTitle: t("paths.copyTitle"),
    copyNameLabel: t("paths.copyPath"),
    copyNameHint: t("paths.copyPathHint"),
    deleteText: (row) =>
      t("paths.deleteAsk", { path: row.path, server: row.server_name }),
    copy: async (row, path) =>
      thunkError(
        await dispatch(copyLocationThunk({ scope: scope ?? "", source: row, path })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(deleteLocationThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });
  const offset = pager.page * pager.pageSize;

  const orderDirty = draft !== null;

  useEffect(() => {
    setDraft(null);
  }, [serverId, narrowed]);

  const commitOrder = () => {
    if (scope === null || serverId === null || draft === null) {
      return;
    }
    void dispatch(
      reorderLocationsThunk({ scope, serverId, order: draft.map((row) => row.uuid) }),
    ).finally(() => setDraft(null));
  };
  const drag = useRowDrag(pager.rows.length, (from, to) => {
    setDraft(moveTo(draft ?? filtered, from + offset, to + offset));
  });

  const cutRow = cutId === null ? null : (rows.find((row) => row.uuid === cutId) ?? null);
  const paste = (beforeId: string | null) => {
    if (cutId === null) {
      return;
    }
    const item = filtered.find((row) => row.uuid === cutId);
    const rest = filtered.filter((row) => row.uuid !== cutId);
    setCutId(null);
    if (item === undefined) {
      return;
    }
    const at = beforeId === null ? -1 : rest.findIndex((row) => row.uuid === beforeId);
    rest.splice(at < 0 ? rest.length : at, 0, item);
    setDraft(rest);
  };
  useEffect(() => {
    if (cutId === null) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCutId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cutId]);

  const setServer = (value: string) => {
    dispatch(setServerFilter(value === "" ? null : value));
    setCutId(null);
    pager.setPage(0);
  };
  const setMatch = (value: string) => {
    setMatchQuery(value);
    pager.setPage(0);
  };
  const setPath = (value: string) => {
    setPathQuery(value);
    pager.setPage(0);
  };
  const setHandler = (value: string) => {
    setHandlerQuery(value);
    pager.setPage(0);
  };
  const setEnabled = (value: string) => {
    setEnabledQuery(value);
    pager.setPage(0);
  };

  usePageBar({
    flush: scope !== null,
    onCreate: () => {
      dispatch(openPanel(null));
    },
    onUpdate: () => {
      void dispatch(loadPaths({ scope }));
    },
    onSave: orderDirty ? () => commitOrder() : undefined,
    onReset: orderDirty ? () => setDraft(null) : undefined,
    createDisabled: scope === null || servers.length === 0,
    updateDisabled: scope === null,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {error !== null && filtered.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      {servers.length === 0 && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          {t("paths.needServer")}
        </Alert>
      )}
      {cutRow !== null && (
        <Alert
          severity="info"
          icon={<ContentCutIcon fontSize="inherit" />}
          sx={{ borderRadius: 0, alignItems: "center" }}
          action={
            <Stack direction="row" spacing={0.5}>
              <Button size="small" color="inherit" onClick={() => paste(null)}>
                {t("paths.pasteEnd")}
              </Button>
              <Button size="small" color="inherit" onClick={() => setCutId(null)}>
                {t("common.cancel")}
              </Button>
            </Stack>
          }
        >
          {t("paths.cutBar", { path: cutRow.path })}
        </Alert>
      )}
      <DataTable
        loading={loading}
        error={error}
        sx={{ flex: 1, minHeight: 0 }}
      >
        <DataTable.Head>
          <TableCell sx={{ width: GRIP_W, minWidth: GRIP_W }} />
          <FilterSelect
            value={serverId ?? ""}
            onChange={setServer}
            options={serverOptions}
            placeholder={t("paths.server")}
            unset=""
            width="18%"
          />
          <FilterSelect
            value={matchQuery}
            onChange={setMatch}
            options={matchOptions}
            placeholder={t("paths.match")}
            unset=""
            width={110}
          />
          <FilterText
            value={pathQuery}
            onChange={setPath}
            placeholder={t("paths.path")}
            width="28%"
            mono
          />
          <FilterSelect
            value={handlerQuery}
            onChange={setHandler}
            options={handlerOptions}
            placeholder={t("paths.handler")}
            unset=""
            width={120}
          />
          <TableCell>{t("paths.upstreamId")}</TableCell>
          <FilterSelect
            value={enabledQuery}
            onChange={setEnabled}
            options={enabledOptions}
            placeholder={t("common.enabled")}
            unset=""
            width={110}
          />
          <TableCell sx={{ width: 132 }}>{t("servers.traffic")}</TableCell>
          <RowActionsHead extra={2} />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row, index) => (
            <TableRow
              key={row.uuid}
              hover
              data-rule=""
              selected={panelId === row.uuid}
              onClick={() => {
                dispatch(openPanel(row.uuid));
              }}
              sx={{
                cursor: "pointer",
                ...dragSx(drag, index),
                ...(cutId === row.uuid ? { opacity: 0.45 } : {}),
              }}
            >
              <TableCell
                onClick={(e) => e.stopPropagation()}
                sx={{ p: "0 !important", width: GRIP_W, minWidth: GRIP_W, textAlign: "center" }}
              >
                <Box
                  component="span"
                  title={ordering ? t("paths.drag") : t("paths.dragLocked")}
                  onPointerDown={ordering ? (e) => drag.onPointerDown(e, index) : undefined}
                  onPointerMove={ordering ? drag.onPointerMove : undefined}
                  onPointerUp={ordering ? drag.onPointerUp : undefined}
                  onPointerCancel={ordering ? drag.onPointerUp : undefined}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    color: "text.secondary",
                    cursor: ordering ? (drag.drag === null ? "grab" : "grabbing") : "default",
                    touchAction: "none",
                    opacity: ordering ? 0.55 : 0.2,
                    "&:hover": { opacity: ordering ? 1 : 0.2 },
                  }}
                >
                  <DragIndicatorIcon sx={{ fontSize: 18 }} />
                </Box>
              </TableCell>
              <TableCell>{row.server_name}</TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={row.match} />
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ maxWidth: 420, fontFamily: "monospace" }}
                  >
                    {row.path}
                  </Typography>
                  {row.builtin && (
                    <LockOutlinedIcon
                      titleAccess={t("paths.builtinHint")}
                      sx={{ fontSize: 14, color: "text.disabled" }}
                    />
                  )}
                </Stack>
              </TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={row.handler} />
              </TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>
                <PoolCell row={row} />
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={row.enabled ? t("common.yes") : t("common.no")}
                  color={row.enabled ? "success" : "default"}
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                <TrafficBar
                  traffic={
                    routeTraffic.get(row.uuid) ??
                    routeTraffic.get(
                      routeKey(
                        serverNameById.get(row.server_id) ?? "_",
                        nginxLocationName(row),
                      ),
                    )
                  }
                  live={live}
                />
              </TableCell>
              {ops.cell(
                row,
                { remove: row.builtin ? t("paths.builtinHint") : undefined },
                <>
                  {ordering && cutId === null && (
                    <TableIconButton
                      icon={<ContentCutIcon />}
                      tooltip={t("paths.cut")}
                      onClick={() => setCutId(row.uuid)}
                    />
                  )}
                  {cutId !== null && cutId !== row.uuid && (
                    <TableIconButton
                      color="success"
                      icon={<ContentPasteIcon />}
                      tooltip={t("paths.pasteBefore")}
                      onClick={() => paste(row.uuid)}
                    />
                  )}
                  {cutId === row.uuid && (
                    <TableIconButton
                      icon={<CloseIcon />}
                      tooltip={t("common.cancel")}
                      onClick={() => setCutId(null)}
                    />
                  )}
                  <TableIconButton
                    icon={<SettingsIcon />}
                    tooltip={t("routeSettings.general")}
                    onClick={() => {
                      dispatch(openPanel(row.uuid));
                    }}
                  />
                </>,
              )}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          kind={filtering ? "none" : "empty"}
          message={filtering ? t("table.none") : t("paths.empty")}
          actionLabel={filtering ? undefined : t("common.create")}
          actionDisabled={servers.length === 0}
          onAction={
            filtering
              ? undefined
              : () => {
                  dispatch(openPanel(null));
                }
          }
        />
        <DataTable.Error onRetry={() => void dispatch(loadPaths({ scope }))} />
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
              ...formDrawerPaperSx,
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {panelId !== undefined && (
          <LocationForm
            key={panelId ?? "new"}
            scope={scope}
            id={panelId}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </Box>
  );
}

function LocationForm({
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
  const servers = useAppSelector((s) => s.pages.paths.servers);
  const upstreams = useAppSelector((s) => s.pages.paths.upstreams);
  const filterId = useAppSelector((s) => s.pages.paths.serverId);
  const rows = useAppSelector((s) => s.pages.paths.rows);
  const row = useAppSelector((s) =>
    id === null ? null : (s.pages.paths.rows.find((item) => item.uuid === id) ?? null),
  );
  const [serverId, setServerId] = useState(row?.server_id ?? filterId ?? servers[0]?.uuid ?? "");
  const serverPool = servers.find((item) => item.uuid === serverId)?.upstream_id ?? null;
  const serverPoolName =
    serverPool === null
      ? null
      : (upstreams.find((item) => item.uuid === serverPool)?.name ?? serverPool);
  const [match, setMatch] = useState(row?.match ?? "prefix");
  const [path, setPath] = useState(row?.path ?? "/");
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [handler, setHandler] = useState(row?.handler ?? "proxy");
  const [protocol, setProtocol] = useState(row?.protocol ?? "http");
  const [upstreamId, setUpstreamId] = useState(row?.upstream_id ?? "");
  const [upstreamUri, setUpstreamUri] = useState(row?.upstream_uri ?? "");
  const [returnStatus, setReturnStatus] = useState(asNumText(row?.return_status));
  const [returnPage, setReturnPage] = useState(row?.return_page ?? "");
  const [returnUrl, setReturnUrl] = useState(row?.return_url ?? "");
  const [staticFile, setStaticFile] = useState(row?.static_file ?? "");
  const [nginx, setNginx] = useState<Doc>(row?.nginx ?? {});
  const [waf, setWaf] = useState<Doc>(row?.waf ?? {});
  const [raw, setRaw] = useState(row?.raw ?? false);
  const [rawNginx, setRawNginx] = useState(row?.raw_nginx ?? "");
  const parents = useInheritance(
    scope,
    id === null
      ? { level: "location", serverUuid: serverId }
      : { level: "location", uuid: id },
  );
  const catalog = useCatalogBundle(scope);

  useEffect(() => {
    if (row === null) {
      return;
    }
    setServerId(row.server_id);
    setMatch(row.match);
    setPath(row.path);
    setEnabled(row.enabled);
    setHandler(row.handler);
    setProtocol(row.protocol ?? "http");
    setUpstreamId(row.upstream_id ?? "");
    setUpstreamUri(row.upstream_uri ?? "");
    setReturnStatus(asNumText(row.return_status));
    setReturnPage(row.return_page ?? "");
    setReturnUrl(row.return_url ?? "");
    setStaticFile(row.static_file ?? "");
    setNginx(row.nginx);
    setWaf(row.waf);
    setRaw(row.raw);
    setRawNginx(row.raw_nginx);
  }, [row]);

  const pageTargets = useMemo(
    () =>
      rows
        .filter(
          (item) =>
            item.server_id === serverId && item.match === "named" && item.uuid !== id,
        )
        .sort((a, b) => denyRank(a) - denyRank(b) || a.path.localeCompare(b.path))
        .map((item) => `@${item.path.replace(/^@/, "")}`),
    [rows, serverId, id],
  );

  // The files of the space, as the server dialog offers them for its own deny pages.
  const spaceFiles = useMemo(
    () => (catalog?.response_pages ?? []).map((item) => item.name),
    [catalog],
  );

  const pathOk = path.trim() !== "";
  const serverOk = serverId !== "";
  const builtin = row?.builtin === true;
  const title = id === null ? t("paths.newTitle") : t("paths.editTitle");

  const save = () => {
    const status = parseNum(returnStatus);
    const redirect = isRedirect(status);
    void dispatch(
      saveLocationThunk({
        scope,
        serverId,
        id,
        body: {
          match,
          path: path.trim(),
          enabled,
          handler,
          protocol,
          upstream_id: upstreamId.trim() === "" ? null : upstreamId.trim(),
          upstream_uri: upstreamUri.trim() === "" ? null : upstreamUri,
          return_status: status === undefined ? null : status,
          return_page: redirect || returnPage === "" ? null : returnPage,
          return_url: !redirect || returnUrl === "" ? null : returnUrl,
          static_file: handler === "static" && staticFile !== "" ? staticFile : null,
          nginx: {
            ...nginx,
            addHeaders: sanitizeHeaders(nginx.addHeaders),
            proxySetHeaders: sanitizeHeaders(nginx.proxySetHeaders),
          },
          waf: sanitizeWaf(waf),
          raw,
          raw_nginx: rawNginx,
        },
      }),
    );
  };
  const saveLabel = id === null ? t("common.create") : t("common.save");
  const canSave = pathOk && serverOk;

  const previewStatus = parseNum(returnStatus);
  const previewRedirect = isRedirect(previewStatus);
  const previewDraft: PreviewDraft = {
    location: {
      uuid: id ?? "",
      server_id: serverId,
      match,
      path: path.trim() === "" ? "/" : path.trim(),
      enabled,
      handler,
      protocol,
      upstream_id: upstreamId.trim() === "" ? null : upstreamId.trim(),
      upstream_uri: upstreamUri.trim() === "" ? null : upstreamUri,
      return_status: previewStatus === undefined ? null : previewStatus,
      return_page: previewRedirect || returnPage === "" ? null : returnPage,
      return_url: !previewRedirect || returnUrl === "" ? null : returnUrl,
      static_file: handler === "static" && staticFile !== "" ? staticFile : null,
      nginx: {
        ...nginx,
        addHeaders: sanitizeHeaders(nginx.addHeaders),
        proxySetHeaders: sanitizeHeaders(nginx.proxySetHeaders),
      },
      waf: sanitizeWaf(waf),
      raw,
      raw_nginx: rawNginx,
    },
  };

  return (
      <CatalogProvider value={catalog}>
      <Box sx={{ ...formDrawerPaperSx, flexDirection: "row" }}>
      <Box sx={{ ...formDrawerPaperSx, flex: 1, minWidth: 0, position: "relative" }}>
      <Form id="path" sx={{ flex: 1, minWidth: 0 }}>
      <Form.Header sx={{ py: 1.5 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        <RoutePower t={t} enabled={enabled} onChange={setEnabled} />
        <Form.Close onClick={onClose} />
      </Form.Header>
      {!enabled && <RouteOffNotice t={t} level="location" />}
      <Form.Body spacing={2} scroll>
        <RouteBody
          t={t}
          scope={scope}
          level="location"
          protocol={protocol === "websocket" ? "websocket" : "http"}
          raw={raw}
          onRaw={setRaw}
          rawNginx={rawNginx}
          onRawNginx={setRawNginx}
          waf={waf}
          nginx={nginx}
          onWaf={setWaf}
          onNginx={setNginx}
          parents={parents}
          wafParent={servers.find((item) => item.uuid === serverId)?.waf}
          preview={{ draft: previewDraft, node: { kind: "location", uuid: id ?? "" } }}
          outside={
            <>
              <TextField
                select
                label={t("paths.server")}
                value={serverId}
                disabled={id !== null}
                onChange={(e) => setServerId(e.target.value)}
                required
              >
                {servers.map((item) => (
                  <MenuItem key={item.uuid} value={item.uuid}>
                    {item.server_names.join(" ") || item.name}
                  </MenuItem>
                ))}
              </TextField>
              {builtin ? (
                <Text
                  label={t("paths.match")}
                  helper={t("paths.builtinHint")}
                  value={match}
                  onChange={() => {}}
                  readOnly
                />
              ) : (
                <Choice
                  t={t}
                  label={t("paths.match")}
                  helper={t("paths.matchHint")}
                  value={match}
                  options={MATCHES}
                  onChange={(v) => setMatch(v ?? "prefix")}
                />
              )}
              <Text
                label={t("paths.path")}
                helper={builtin ? t("paths.builtinHint") : t("paths.pathHint")}
                value={path}
                onChange={setPath}
                readOnly={builtin}
              />
            </>
          }
          own={
            <Section
              title={t("paths.handlerSection")}
              hint={t("paths.handlerSectionHint")}
              help="05-protection#маршруты"
              defaultExpanded
            >
              <Choice
                t={t}
                label={t("paths.handler")}
                helper={t("paths.handlerHint")}
                value={handler}
                options={HANDLERS}
                onChange={(v) => setHandler(v ?? "proxy")}
              />
              {handler === "proxy" && (
                <Choice
                  t={t}
                  label={t("paths.protocol")}
                  helper={t("paths.protocolHint")}
                  value={protocol}
                  options={PROTOCOLS}
                  onChange={(v) => setProtocol(v ?? "http")}
                />
              )}
              {handler === "proxy" && (
                <>
                  {upstreams.length === 0 && (
                    <Alert severity="info">
                      {t("paths.needUpstream")}{" "}
                      <Link to="/structure/upstreams">{t("nav.upstreams")}</Link>
                    </Alert>
                  )}
                  <TextField
                    select
                    label={t("paths.upstreamId")}
                    value={upstreamId}
                    helperText={t("paths.upstreamHint")}
                    onChange={(e) => setUpstreamId(e.target.value)}
                    slotProps={
                      serverPoolName === null
                        ? undefined
                        : { inputLabel: { shrink: true }, select: { displayEmpty: true } }
                    }
                  >
                    <MenuItem value="">
                      {serverPoolName === null
                        ? t("paths.upstreamNone")
                        : t("paths.upstreamInherit", { name: serverPoolName })}
                    </MenuItem>
                    {upstreams.map((item) => (
                      <MenuItem key={item.uuid} value={item.uuid}>
                        {item.name}
                      </MenuItem>
                    ))}
                    {upstreamId !== "" &&
                      !upstreams.some((item) => item.uuid === upstreamId) && (
                        <MenuItem value={upstreamId}>{upstreamId}</MenuItem>
                      )}
                  </TextField>
                  <Text
                    label={t("paths.upstreamUri")}
                    helper={t("paths.upstreamUriHint")}
                    value={upstreamUri}
                    onChange={setUpstreamUri}
                  />
                </>
              )}
              {handler === "static" && (
                <>
                  {spaceFiles.length === 0 && (
                    <Alert severity="info">
                      {t("paths.needFile")}{" "}
                      <Link to="/datasets/files">{t("nav.files")}</Link>
                    </Alert>
                  )}
                  <TextField
                    select
                    label={t("paths.staticFile")}
                    value={staticFile}
                    helperText={t("paths.staticFileHint")}
                    onChange={(e) => setStaticFile(e.target.value)}
                  >
                    <MenuItem value="">{t("paths.staticFileNone")}</MenuItem>
                    {spaceFiles.map((name) => (
                      <MenuItem key={name} value={name}>
                        {name}
                      </MenuItem>
                    ))}
                    {staticFile !== "" && !spaceFiles.includes(staticFile) && (
                      <MenuItem value={staticFile}>{staticFile}</MenuItem>
                    )}
                  </TextField>
                </>
              )}
              {handler === "return" && (
                <>
                  <Num
                    label={t("paths.returnStatus")}
                    helper={t("paths.returnStatusHint")}
                    value={returnStatus}
                    onChange={setReturnStatus}
                  />
                  {isRedirect(parseNum(returnStatus)) ? (
                    <Text
                      label={t("paths.returnUrl")}
                      helper={t("paths.returnUrlHint")}
                      value={returnUrl}
                      onChange={setReturnUrl}
                    />
                  ) : (
                    <>
                      {pageTargets.length === 0 && (
                        <Alert severity="info">{t("paths.needPage")}</Alert>
                      )}
                      <TextField
                        select
                        label={t("paths.returnPage")}
                        value={returnPage}
                        helperText={t("paths.returnPageHint")}
                        onChange={(e) => setReturnPage(e.target.value)}
                      >
                        <MenuItem value="">{t("paths.returnPageNone")}</MenuItem>
                        {pageTargets.map((target) => (
                          <MenuItem key={target} value={target}>
                            {target}
                          </MenuItem>
                        ))}
                        {returnPage !== "" && !pageTargets.includes(returnPage) && (
                          <MenuItem value={returnPage}>{returnPage}</MenuItem>
                        )}
                      </TextField>
                    </>
                  )}
                </>
              )}
            </Section>
          }
        />
      </Form.Body>
      <Form.Actions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!canSave} onClick={save}>
          {saveLabel}
        </Button>
      </Form.Actions>
    </Form>
    </Box>
      </Box>
      </CatalogProvider>
  );
}
