import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import { Modal } from "../components/Modal.tsx";
import type { ListenPort } from "../api.ts";
import { useT } from "../i18n/index.ts";
import { useModal } from "../store/forms.ts";
import { useAppSelector } from "../store/hooks.ts";

export const FORM_SERVER_ADD_LISTEN = "server-add-listen";

export type ServerAddListenPayload = {
  scope: string;
  serverId: string | null;
  used: string[];
  sslMode: boolean | null;
};

export function portLine(row: {
  address: string;
  port: number;
  http2: boolean;
  proxy_protocol: boolean;
}): string {
  return `${row.address}:${row.port}${row.http2 ? " http2" : ""}${row.proxy_protocol ? " proxy_protocol" : ""}`;
}

export function ServerAddListenForm({
  onLocalAdd,
}: {
  onLocalAdd?: (portId: string) => void;
}) {
  const t = useT();
  const modal = useModal<ServerAddListenPayload>(FORM_SERVER_ADD_LISTEN);
  const { open, payload, busy } = modal;
  const ports = useAppSelector((s) => s.pages.servers.ports);
  const [portId, setPortId] = useState("");

  const used = payload?.used ?? [];
  const sslMode = payload?.sslMode ?? null;

  const unused = useMemo(
    () => ports.filter((row) => !used.includes(row.uuid)),
    [ports, used],
  );
  const compatible = useMemo(
    () => unused.filter((row) => sslMode === null || row.ssl === sslMode),
    [unused, sslMode],
  );
  const blocked = unused.length - compatible.length;

  useEffect(() => {
    if (!open) {
      return;
    }
    setPortId(compatible[0]?.uuid ?? "");
  }, [open, compatible]);

  const canSubmit = portId !== "" && !busy;

  /*
   * Диалог только пополняет черновик карточки -- ни для нового сервера, ни для
   * существующего он в базу не пишет. Привязка уезжает вместе с остальной
   * карточкой по её кнопке «Сохранить»: одна карточка -- одно сохранение.
   */
  function submit() {
    if (portId === "") {
      return;
    }
    onLocalAdd?.(portId);
    modal.close();
  }

  return (
    <Modal
      id={FORM_SERVER_ADD_LISTEN}
      title={t("servers.addListenTitle")}
      size="xs"
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!canSubmit || compatible.length === 0}
            onClick={submit}
          >
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      {compatible.length === 0 ? (
        <Alert severity="info">
          {ports.length === 0
            ? t("servers.needPorts")
            : sslMode === null
              ? t("servers.needPorts")
              : t(sslMode ? "servers.sslOnly" : "servers.plainOnly")}
        </Alert>
      ) : (
        <>
          {blocked > 0 && sslMode !== null && (
            <Alert severity="info">
              {t(sslMode ? "servers.sslOnly" : "servers.plainOnly")}
            </Alert>
          )}
          <TextField
            select
            size="small"
            fullWidth
            autoFocus
            label={t("servers.addListen")}
            value={portId}
            onChange={(e) => setPortId(e.target.value)}
          >
            {compatible.map((row) => (
              <MenuItem key={row.uuid} value={row.uuid}>
                {row.name} · {portLine(row)}
                {row.ssl ? ` · ${t("servers.tls")}` : ""}
              </MenuItem>
            ))}
          </TextField>
        </>
      )}
    </Modal>
  );
}

export function listenSslMode(rows: readonly { ssl: boolean }[]): boolean | null {
  return rows[0]?.ssl ?? null;
}

export function defaultTakenBy(
  port: ListenPort | undefined,
  serverId: string | null,
): string | null {
  if (
    port === undefined ||
    port.default_server_id === null ||
    port.default_server_id === serverId
  ) {
    return null;
  }
  return port.default_server_id;
}
