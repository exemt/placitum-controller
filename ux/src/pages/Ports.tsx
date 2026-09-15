import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";

import { Form, formDrawerPaperSx } from "../components/Form.tsx";
import { ConfirmModal } from "../components/Modal.tsx";
import {
  DataTable,
  RowActionsHead,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { Flag, Num, Section, Text } from "../components/fields.tsx";
import { SettingsTable } from "../components/settings-table.tsx";
import { useT } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import type { ListenPort } from "../api.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  deletePortThunk,
  loadPorts,
  openPanel,
  savePortThunk,
} from "../store/slices/pages/ports.ts";

const PANEL_WIDTH = 768;

const ADDRESS_PRESETS = ["0.0.0.0", "::", "127.0.0.1"] as const;
const PORT_PRESETS = [80, 443] as const;

function listenLine(row: { address: string; port: number; ssl: boolean; http2: boolean; proxy_protocol: boolean }) {
  const flags = [
    row.ssl ? "ssl" : null,
    row.http2 ? "http2" : null,
    row.proxy_protocol ? "proxy_protocol" : null,
  ].filter((item): item is string => item !== null);
  return `${row.address}:${row.port}${flags.length > 0 ? " " + flags.join(" ") : ""}`;
}

export default function Ports() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.ports.rows);
  const loading = useAppSelector((s) => s.pages.ports.loading);
  const error = useAppSelector((s) => s.pages.ports.error);
  const panelId = useAppSelector((s) => s.pages.ports.panelId);
  const pager = usePager(rows);
  const ops = useRowOps<ListenPort>({
    nameOf: (row) => row.name,
    remove: async (row) =>
      thunkError(
        await dispatch(deletePortThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadPorts(scope));
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
          <TableCell>{t("ports.listen")}</TableCell>
          <TableCell>{t("ports.ssl")}</TableCell>
          <TableCell>{t("ports.http2")}</TableCell>
          <TableCell>{t("ports.proxyProtocol")}</TableCell>
          <TableCell align="right">{t("ports.servers")}</TableCell>
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
              <TableCell>{row.name}</TableCell>
              <TableCell sx={{ fontFamily: "monospace" }}>
                {listenLine(row)}
              </TableCell>
              <TableCell>{row.ssl ? t("common.yes") : t("common.no")}</TableCell>
              <TableCell>{row.http2 ? t("common.yes") : t("common.no")}</TableCell>
              <TableCell>
                {row.proxy_protocol ? t("common.yes") : t("common.no")}
              </TableCell>
              <TableCell align="right">{row.bind_count}</TableCell>
              {ops.cell(row, {
                copy: t("ports.copyOff"),
                remove: row.bind_count > 0 ? t("ports.boundDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("ports.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadPorts(scope))} />
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
          <PortForm
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

function PortForm({
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
    id === null ? null : (s.pages.ports.rows.find((item) => item.uuid === id) ?? null),
  );
  const [name, setName] = useState(row?.name ?? "");
  const [address, setAddress] = useState(row?.address ?? "0.0.0.0");
  const [port, setPort] = useState(row === null ? "443" : String(row.port));
  const [ssl, setSsl] = useState(row?.ssl ?? true);
  const [http2, setHttp2] = useState(row?.http2 ?? true);
  const [proxyProtocol, setProxyProtocol] = useState(row?.proxy_protocol ?? false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (row === null) {
      return;
    }
    setName(row.name);
    setAddress(row.address);
    setPort(String(row.port));
    setSsl(row.ssl);
    setHttp2(row.http2);
    setProxyProtocol(row.proxy_protocol);
  }, [row]);

  const portNum = Number(port);
  const nameOk = name.trim() !== "";
  const addressOk = address.trim() !== "";
  const portOk = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;

  return (
    <>
    <Form id="port" sx={{ flex: 1, minWidth: 0 }}>
      <Form.Header sx={{ py: 1.5 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {id === null ? t("ports.newTitle") : t("ports.editTitle")}
        </Typography>
        {id !== null && (
          <IconButton
            size="small"
            aria-label={t("ports.deleteAria")}
            onClick={() => setConfirm(true)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body spacing={2} scroll>
        <Text
          label={t("common.name")}
          helper={t("ports.nameHint")}
          value={name}
          onChange={setName}
        />
        <Section
          title={t("ports.sectionListen")}
          hint={t("ports.sectionListenHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              mono
              label={t("ports.address")}
              helper={t("ports.addressHint")}
              value={address}
              presets={ADDRESS_PRESETS}
              onChange={setAddress}
            />
            <Num
              label={t("ports.port")}
              helper={t("ports.portHint")}
              value={port}
              presets={PORT_PRESETS}
              onChange={setPort}
            />
          </SettingsTable>
        </Section>
        <Section
          title={t("ports.sectionSocket")}
          hint={t("ports.sectionSocketHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Flag label={t("ports.ssl")} helper={t("ports.sslHint")} checked={ssl} onChange={setSsl} />
            <Flag label={t("ports.http2")} helper={t("ports.http2Hint")} checked={http2} onChange={setHttp2} />
            <Flag
              label={t("ports.proxyProtocol")}
              helper={t("ports.proxyProtocolHint")}
              checked={proxyProtocol}
              onChange={setProxyProtocol}
            />
          </SettingsTable>
        </Section>
        {row !== null && row.bind_count > 0 && (
          <Alert severity="info">
            {t("ports.boundNote", { count: row.bind_count })}
          </Alert>
        )}
      </Form.Body>
      <Form.Actions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          variant="contained"
          disabled={!nameOk || !addressOk || !portOk}
          onClick={() => {
            void dispatch(
              savePortThunk({
                scope,
                id,
                body: {
                  name: name.trim(),
                  address: address.trim(),
                  port: portNum,
                  ssl,
                  http2,
                  proxy_protocol: proxyProtocol,
                },
              }),
            );
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
          title={t("ports.deleteTitle")}
          text={t("ports.deleteConfirm", { name })}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            if (id !== null) {
              void dispatch(deletePortThunk({ scope, id }));
            }
            setConfirm(false);
          }}
        />
      )}
    </>
  );
}
