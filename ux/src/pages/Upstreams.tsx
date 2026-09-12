import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import {
  UPSTREAM_METHODS,
  type UpstreamInput,
  type UpstreamPool,
  type UpstreamMethod,
  type UpstreamPeer,
} from "../api.ts";
import { Form, formDrawerPaperSx } from "../components/Form.tsx";
import { ConfirmModal } from "../components/Modal.tsx";
import { PreviewDock } from "../config/PreviewDock.tsx";
import { RouteModeTabs } from "./route-fields.tsx";
import {
  DataTable,
  FilterCell,
  RowActionsHead,
  TableIconButton,
  TableNoticeRow,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { Duration, Flag, Num, Pick, Section, Text, timeLabel } from "../components/fields.tsx";
import { dataCellSx, SettingsTable } from "../components/settings-table.tsx";
import { flushTableSx, HeadCell } from "../components/table-block.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  copyUpstreamThunk,
  deleteUpstreamThunk,
  loadUpstreams,
  openPanel,
  saveUpstreamThunk,
} from "../store/slices/pages/upstreams.ts";
import {
  parseOptInt,
  parsePort,
  peerFromRow,
  PeerDialog,
  PEER_FAIL_TIMEOUT_MS,
  PEER_MAX_FAILS,
  PEER_WEIGHT,
  type PeerDraft,
} from "./UpstreamPeerDialog.tsx";

/* Тот же ящик, что у сервера: форма -- стопка секций-таблиц. */
const PANEL_WIDTH = 768;

/*
 * Ширины колонок таблицы пиров. Сумма фиксированных держится ниже ширины
 * секции в ящике 768: горизонтальный скролл внутри карточки -- дефект.
 * Хост и порт стоят одной колонкой -- строкой `server host:port`, как в
 * файле: две колонки под неё отнимали ширину у остальных, и заголовки
 * флагов обрезались многоточием.
 */
const WEIGHT_W = 64;
const FAILS_W = 88;
const TIMEOUT_W = 96;
const FLAGS_W = 120;
const ACTIONS_W = 48;

/* Таблица и есть содержимое секции: черту под шапкой рисует сама секция. */
const peersTableSx = { ...flushTableSx, borderTop: 0 } as const;

/*
 * Ячейка строки пула: поля держит коробка значения (`Val`), а не сама ячейка --
 * так их считает `flushTableSx` и так же стоит шапка. Со своими полями ячейка
 * складывалась с полями коробки, и значение стояло на 16px правее заголовка
 * своей колонки.
 *
 * `!important` -- тот же, что у `FilterCell`: поля крайних ячеек тема задаёт
 * через `&:first-of-type`, а это старше обычного класса `sx`.
 */
const peerCellSx = { ...dataCellSx, p: "0 !important" } as const;

const HASH_PRESETS = ["$request_uri", "$remote_addr"] as const;

/* Схема -- часть адреса узла: 443 без TLS выглядит так же, а работает иначе. */
function peersLine(peers: UpstreamPeer[], tls: boolean): string {
  if (peers.length === 0) {
    return "—";
  }
  const scheme = tls ? "https://" : "";
  return peers.map((row) => `${scheme}${row.host}:${row.port}`).join("  ");
}

/** Имя узла, когда оно одно на пул: за такой пул можно решать. */
export function soleHost(peers: readonly { host: string }[]): string {
  const hosts = new Set(peers.map((row) => row.host.trim()).filter((h) => h !== ""));
  const [first] = hosts;
  return hosts.size === 1 ? first : "";
}

function toInput(
  name: string,
  method: UpstreamMethod,
  hashKey: string,
  keepalive: string,
  keepaliveRequests: string,
  keepaliveTimeoutMs: string,
  tls: boolean,
  tlsName: string,
  hostHeader: string,
  peers: PeerDraft[],
): UpstreamInput | null {
  const keep = parseOptInt(keepalive, 0);
  const keepReq = parseOptInt(keepaliveRequests, 0);
  const keepTo = parseOptInt(keepaliveTimeoutMs, 0);
  if (keep === "bad" || keepReq === "bad" || keepTo === "bad") {
    return null;
  }
  const body: UpstreamInput["peers"] = [];
  for (const peer of peers) {
    const host = peer.host.trim();
    if (host === "") {
      return null;
    }
    const port = parsePort(peer.port);
    const weight = parseOptInt(peer.weight, 1);
    const maxFails = parseOptInt(peer.maxFails, 0);
    const failTimeoutMs = parseOptInt(peer.failTimeoutMs, 0);
    if (
      port === "bad" ||
      weight === "bad" ||
      weight === null ||
      maxFails === "bad" ||
      failTimeoutMs === "bad"
    ) {
      return null;
    }
    body.push({
      host,
      port,
      weight,
      max_fails: maxFails,
      fail_timeout_ms: failTimeoutMs,
      backup: peer.backup,
      down: peer.down,
    });
  }
  return {
    name: name.trim(),
    method,
    hash_key: method === "hash" ? hashKey.trim() || null : null,
    keepalive: keep,
    keepalive_requests: keepReq,
    keepalive_timeout_ms: keepTo,
    tls,
    tls_name: tlsName.trim() || null,
    host_header: hostHeader.trim() || null,
    peers: body,
  };
}

export default function Upstreams() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.upstreams.rows);
  const loading = useAppSelector((s) => s.pages.upstreams.loading);
  const error = useAppSelector((s) => s.pages.upstreams.error);
  const panelId = useAppSelector((s) => s.pages.upstreams.panelId);
  const pager = usePager(rows);
  const ops = useRowOps<UpstreamPool>({
    nameOf: (row) => row.name,
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyUpstreamThunk({ scope: scope ?? "", source: row, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(deleteUpstreamThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadUpstreams(scope));
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      {error !== null && rows.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("upstreams.method")}</TableCell>
          <TableCell>{t("upstreams.peers")}</TableCell>
          <TableCell align="right">{t("upstreams.paths")}</TableCell>
          <RowActionsHead />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row) => (
            <TableRow
              key={row.uuid}
              hover
              selected={panelId === row.uuid}
              onClick={() => dispatch(openPanel(row.uuid))}
              sx={{ cursor: "pointer" }}
            >
              <TableCell sx={{ fontFamily: "monospace" }}>{row.name}</TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>{row.method}</TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>
                {peersLine(row.peers, row.tls)}
              </TableCell>
              <TableCell align="right">{row.bind_count}</TableCell>
              {ops.cell(row, {
                remove: row.bind_count > 0 ? t("upstreams.boundDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("upstreams.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadUpstreams(scope))} />
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
          <UpstreamForm
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

/*
 * Карточка апстрима -- та же стопка, что у сервера: имя сверху, дальше секции.
 * Серверы пула -- таблица данных с черновой строкой внизу: новый пир
 * набирается там и попадает в список по «+» или Enter, пустых строк в пуле
 * нет. Балансировка и keepalive -- таблицы настроек (директива, ⓘ, значение,
 * подстановки и «умолчание» справа).
 */
function UpstreamForm({
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
  const row = useAppSelector((s) =>
    id === null ? null : (s.pages.upstreams.rows.find((item) => item.uuid === id) ?? null),
  );
  const [name, setName] = useState(row?.name ?? "");
  const [method, setMethod] = useState<UpstreamMethod>(row?.method ?? "round_robin");
  const [hashKey, setHashKey] = useState(row?.hash_key ?? "");
  const [keepalive, setKeepalive] = useState(
    row?.keepalive === null || row?.keepalive === undefined ? "" : String(row.keepalive),
  );
  const [keepaliveRequests, setKeepaliveRequests] = useState(
    row?.keepalive_requests === null || row?.keepalive_requests === undefined
      ? ""
      : String(row.keepalive_requests),
  );
  const [keepaliveTimeoutMs, setKeepaliveTimeoutMs] = useState(
    row?.keepalive_timeout_ms === null || row?.keepalive_timeout_ms === undefined
      ? ""
      : String(row.keepalive_timeout_ms),
  );
  const [tls, setTls] = useState(row?.tls ?? false);
  const [tlsName, setTlsName] = useState(row?.tls_name ?? "");
  const [hostHeader, setHostHeader] = useState(row?.host_header ?? "");
  const [peers, setPeers] = useState<PeerDraft[]>(row === null ? [] : row.peers.map(peerFromRow));
  const [confirm, setConfirm] = useState(false);
  /*
    Просмотр -- состояние формы: блок `upstream {}` по черновику настоящим
    компилятором, пока открыта вкладка. Своего конфига у пула нет, вкладки две.
  */
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (row === null) {
      return;
    }
    setName(row.name);
    setMethod(row.method);
    setHashKey(row.hash_key ?? "");
    setKeepalive(row.keepalive === null ? "" : String(row.keepalive));
    setKeepaliveRequests(
      row.keepalive_requests === null ? "" : String(row.keepalive_requests),
    );
    setKeepaliveTimeoutMs(
      row.keepalive_timeout_ms === null ? "" : String(row.keepalive_timeout_ms),
    );
    setTls(row.tls);
    setTlsName(row.tls_name ?? "");
    setHostHeader(row.host_header ?? "");
    setPeers(row.peers.map(peerFromRow));
  }, [row]);

  const body = toInput(
    name,
    method,
    hashKey,
    keepalive,
    keepaliveRequests,
    keepaliveTimeoutMs,
    tls,
    tlsName,
    hostHeader,
    peers,
  );
  /*
    Умолчания секции считаются по черновику пула, а не по сохранённой строке:
    оператор правит узлы и переключатель в одном окне, и погашенное значение
    должно показывать то, что уедет в файл после «Сохранить».
  */
  const host = soleHost(peers);
  const sni = tlsName.trim() || host;
  const nameOk = name.trim() !== "";
  const hashOk = method !== "hash" || hashKey.trim() !== "";
  const peersOk = body !== null && body.peers.length > 0;
  const canSave = nameOk && hashOk && peersOk && body !== null;

  return (
    <>
      <Form id="upstream" sx={{ flex: 1, minWidth: 0 }}>
        <Form.Header sx={{ py: 1.5 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {id === null ? t("upstreams.newTitle") : t("upstreams.editTitle")}
          </Typography>
          {id !== null && (
            <IconButton
              size="small"
              aria-label={t("upstreams.deleteAria")}
              onClick={() => setConfirm(true)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
          <Form.Close onClick={onClose} />
        </Form.Header>
        <Form.Body spacing={2} scroll>
          <RouteModeTabs
            t={t}
            raw={false}
            mode={showPreview ? "preview" : "config"}
            onMode={(next) => setShowPreview(next === "preview")}
          />
          {showPreview ? (
            /*
              Пул без имени или с кривым узлом парсер записи не примет -- и
              превью не запрашивается: вместо блока оператор видел бы код
              ошибки формы, которую форма и так подсвечивает.
            */
            <PreviewDock
              scope={scope}
              draft={body === null || !nameOk ? {} : { upstream: { uuid: id ?? "", ...body } }}
              node={{ kind: "upstream", uuid: id ?? "" }}
              enabled={body !== null && nameOk}
            />
          ) : (
            <>
          <Text
            label={t("common.name")}
            helper={t("upstreams.nameHint")}
            value={name}
            onChange={setName}
          />
          <Section
            title={t("upstreams.peers")}
            hint={t("upstreams.peersHint")}
            flush
            defaultExpanded
          >
            <Peers t={t} rows={peers} onChange={setPeers} />
          </Section>
          <Section
            title={t("upstreams.sectionWire")}
            hint={t("upstreams.sectionWireHint")}
            flush
            defaultExpanded
          >
            {/* Слот справа нужен: у имени и Host есть галочка «своё значение». */}
            <SettingsTable>
              <Flag
                label={t("upstreams.tls")}
                helper={t("upstreams.tlsHint")}
                checked={tls}
                onChange={setTls}
              />
              {tls && (
                <Text
                  mono
                  optional
                  fallback={host}
                  label={t("upstreams.tlsName")}
                  helper={t("upstreams.tlsNameHint")}
                  value={tlsName}
                  onChange={setTlsName}
                />
              )}
              <Text
                mono
                optional
                fallback={tls ? sni : ""}
                label={t("upstreams.hostHeader")}
                helper={t("upstreams.hostHeaderHint")}
                value={hostHeader}
                onChange={setHostHeader}
              />
            </SettingsTable>
          </Section>
          <Section
            title={t("upstreams.sectionBalance")}
            hint={t("upstreams.sectionBalanceHint")}
            flush
            defaultExpanded
          >
            <SettingsTable aside={false}>
              <Pick
                label={t("upstreams.method")}
                helper={t("upstreams.methodHint")}
                value={method}
                options={UPSTREAM_METHODS.map((item) => ({ value: item, label: item }))}
                onChange={setMethod}
              />
              {method === "hash" && (
                <Text
                  mono
                  label={t("upstreams.hashKey")}
                  helper={t("upstreams.hashKeyHint")}
                  value={hashKey}
                  presets={HASH_PRESETS}
                  onChange={setHashKey}
                />
              )}
            </SettingsTable>
          </Section>
          <Section
            title={t("upstreams.sectionKeepalive")}
            hint={t("upstreams.sectionKeepaliveHint")}
            flush
          >
            <SettingsTable>
              <Num
                optional
                presets={[16, 32, 64]}
                label={t("upstreams.keepalive")}
                helper={t("upstreams.keepaliveHint")}
                value={keepalive}
                onChange={setKeepalive}
              />
              <Num
                optional
                fallback={1000}
                presets={[100, 1000, 10000]}
                label={t("upstreams.keepaliveRequests")}
                helper={t("upstreams.keepaliveRequestsHint")}
                value={keepaliveRequests}
                onChange={setKeepaliveRequests}
              />
              <Duration
                base="ms"
                optional
                fallback={60_000}
                presets={[10_000, 60_000, 300_000]}
                label={t("upstreams.keepaliveTimeoutMs")}
                helper={t("upstreams.keepaliveTimeoutHint")}
                value={keepaliveTimeoutMs === "" ? undefined : Number(keepaliveTimeoutMs)}
                onChange={(v) => setKeepaliveTimeoutMs(v === undefined ? "" : String(v))}
              />
            </SettingsTable>
          </Section>
          {row !== null && row.bind_count > 0 && (
            <Alert severity="info">
              {t("upstreams.boundNote", { count: row.bind_count })}
            </Alert>
          )}
            </>
          )}
        </Form.Body>
        <Form.Actions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            disabled={!canSave}
            onClick={() => {
              if (body === null) {
                return;
              }
              void dispatch(saveUpstreamThunk({ scope, id, body }));
            }}
          >
            {id === null ? t("common.create") : t("common.save")}
          </Button>
        </Form.Actions>
      </Form>
      {confirm && (
        <ConfirmModal
          open
          danger
          title={t("upstreams.deleteTitle")}
          text={t("upstreams.deleteConfirm", { name })}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            if (id !== null) {
              void dispatch(deleteUpstreamThunk({ scope, id }));
            }
            setConfirm(false);
          }}
        />
      )}
    </>
  );
}

/** Значение ячейки: погашенное -- то, чего в файле нет и что подставит nginx. */
function Val({ text, muted, mono }: { text: string; muted?: boolean; mono?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        color: muted === true ? "text.disabled" : "text.primary",
        fontFamily: mono === true ? "monospace" : undefined,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "block",
      }}
    >
      {text}
    </Box>
  );
}

/**
 * Серверы пула: таблица данных внутри секции. Строка -- `server host:port` с
 * параметрами, и правится она целиком, окном (`PeerDialog`): в ячейке у
 * `fail_timeout` не было ни единиц, ни умолчания, а новый сервер набирался в
 * черновой строке внизу, где «+» читался продолжением списка. Здесь строка
 * показывает, что уедет в файл: заданное -- обычным цветом, умолчание nginx --
 * погашенным. Заводит сервер «+» в шапке, как порты и сертификаты сервера.
 */
function Peers({
  t,
  rows,
  onChange,
}: {
  t: Translate;
  rows: PeerDraft[];
  onChange: (next: PeerDraft[]) => void;
}) {
  /* `{ index: null }` -- новый сервер, число -- правка строки. */
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);

  const apply = (peer: PeerDraft) => {
    if (editing === null) {
      return;
    }
    onChange(
      editing.index === null
        ? [...rows, peer]
        : rows.map((item, i) => (i === editing.index ? peer : item)),
    );
    setEditing(null);
  };

  const flags = (peer: PeerDraft) =>
    [peer.backup ? "backup" : "", peer.down ? "down" : ""].filter((s) => s !== "").join(" ");

  return (
    <>
      <Table size="small" sx={peersTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("upstreams.server")} help={t("upstreams.hostHint")} />
            <HeadCell
              label={t("upstreams.weight")}
              help={t("upstreams.weightHint")}
              width={WEIGHT_W}
            />
            <HeadCell
              label={t("upstreams.maxFails")}
              help={t("upstreams.maxFailsHint")}
              width={FAILS_W}
            />
            <HeadCell
              label={t("upstreams.failTimeoutMs")}
              help={t("upstreams.failTimeoutHint")}
              width={TIMEOUT_W}
            />
            <HeadCell
              label={t("upstreams.flags")}
              help={t("upstreams.flagsHint")}
              width={FLAGS_W}
            />
            <FilterCell width={ACTIONS_W}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <TableIconButton
                  color="success"
                  icon={<AddIcon />}
                  tooltip={t("upstreams.addPeer")}
                  onClick={() => setEditing({ index: null })}
                />
              </Box>
            </FilterCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={6} kind="empty" message={t("upstreams.peersEmpty")} />
          )}
          {rows.map((peer, index) => {
            const weight = peer.weight.trim();
            const maxFails = peer.maxFails.trim();
            const timeout = peer.failTimeoutMs.trim();
            const line = flags(peer);
            return (
              <TableRow
                key={index}
                hover
                onClick={() => setEditing({ index })}
                sx={{ cursor: "pointer" }}
              >
                <TableCell sx={peerCellSx}>
                  <Val mono text={`${peer.host}:${peer.port}`} />
                </TableCell>
                <TableCell sx={{ ...peerCellSx, width: WEIGHT_W }}>
                  <Val
                    text={weight === "" ? String(PEER_WEIGHT) : weight}
                    muted={weight === "" || weight === String(PEER_WEIGHT)}
                  />
                </TableCell>
                <TableCell sx={{ ...peerCellSx, width: FAILS_W }}>
                  <Val
                    text={maxFails === "" ? String(PEER_MAX_FAILS) : maxFails}
                    muted={maxFails === ""}
                  />
                </TableCell>
                <TableCell sx={{ ...peerCellSx, width: TIMEOUT_W }}>
                  <Val
                    text={timeLabel(timeout === "" ? PEER_FAIL_TIMEOUT_MS : Number(timeout))}
                    muted={timeout === ""}
                  />
                </TableCell>
                <TableCell sx={{ ...peerCellSx, width: FLAGS_W }}>
                  <Val mono muted={line === ""} text={line === "" ? t("common.none") : line} />
                </TableCell>
                <TableCell sx={{ ...peerCellSx, width: ACTIONS_W }}>
                  {/* Та же коробка, что у «+» в шапке: кнопки стоят на одной вертикали. */}
                  <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                    <TableIconButton
                      color="error"
                      icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                      tooltip={t("upstreams.deletePeerAria")}
                      onClick={(e) => {
                        // Кнопка строки -- не сама строка: иначе за удалением
                        // открывалось бы ещё и окно правки.
                        e.stopPropagation();
                        onChange(rows.filter((_, i) => i !== index));
                      }}
                    />
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {editing !== null && (
        <PeerDialog
          t={t}
          peer={editing.index === null ? null : (rows[editing.index] ?? null)}
          onClose={() => setEditing(null)}
          onApply={apply}
        />
      )}
    </>
  );
}
