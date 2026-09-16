import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import {
  CERTIFICATE_KINDS,
  type CertificateKind,
  type CertificateType,
} from "../api.ts";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { useModal } from "../store/forms.ts";
import { useAppSelector } from "../store/hooks.ts";

export const FORM_SERVER_ADD_CERT = "server-add-cert";

const KIND_ACCEPTS: Record<CertificateKind, readonly CertificateType[]> = {
  server: ["server"],
  client_ca: ["client_ca"],
  trusted: ["client_ca", "server"],
};

export type ServerAddCertificatePayload = {
  scope: string;
  serverId: string | null;
  usedKinds: CertificateKind[];
};

export function certKindLabel(kind: CertificateKind, t: (path: string) => string): string {
  return t(`certificates.kind.${kind}`);
}

export function formatCertDate(value: string | null): string {
  if (value === null) {
    return "—";
  }
  return new Date(value).toLocaleDateString();
}

export function shortFingerprint(value: string): string {
  return value.length <= 22 ? value : `${value.slice(0, 19)}…`;
}

export function ServerAddCertificateForm({
  onLocalAdd,
}: {
  onLocalAdd?: (certificateId: string, kind: CertificateKind) => void;
}) {
  const t = useT();
  const modal = useModal<ServerAddCertificatePayload>(FORM_SERVER_ADD_CERT);
  const { open, payload, busy } = modal;
  const certificates = useAppSelector((s) => s.pages.servers.certificates);
  const [certificateId, setCertificateId] = useState("");
  const [kind, setKind] = useState<CertificateKind>("server");

  const usedKinds = payload?.usedKinds ?? [];
  const kinds = useMemo(
    () => CERTIFICATE_KINDS.filter((item) => !usedKinds.includes(item)),
    [usedKinds],
  );

  const options = useMemo(
    () => certificates.filter((row) => KIND_ACCEPTS[kind].includes(row.type ?? "server")),
    [certificates, kind],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setKind(kinds.includes("server") ? "server" : (kinds[0] ?? "server"));
  }, [open, kinds]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCertificateId((current) =>
      options.some((row) => row.uuid === current) ? current : (options[0]?.uuid ?? ""),
    );
  }, [open, options]);

  const canSubmit = certificateId !== "" && kinds.length > 0 && !busy;

  function submit() {
    if (certificateId === "" || kinds.length === 0) {
      return;
    }
    onLocalAdd?.(certificateId, kind);
    modal.close();
  }

  return (
    <Modal
      id={FORM_SERVER_ADD_CERT}
      title={t("servers.addCertTitle")}
      size="xs"
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!canSubmit} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      {certificates.length === 0 ? (
        <Alert severity="info">{t("servers.needCerts")}</Alert>
      ) : kinds.length === 0 ? (
        <Alert severity="info">{t("servers.certKindsFull")}</Alert>
      ) : (
        <>
          <TextField
            select
            size="small"
            fullWidth
            label={t("certificates.kind.label")}
            value={kind}
            onChange={(e) => setKind(e.target.value as CertificateKind)}
          >
            {kinds.map((item) => (
              <MenuItem key={item} value={item}>
                {certKindLabel(item, t)}
              </MenuItem>
            ))}
          </TextField>
          {options.length === 0 ? (
            <Alert severity="info">{t("servers.noCertsForKind")}</Alert>
          ) : (
            <TextField
              select
              size="small"
              fullWidth
              autoFocus
              label={t("common.name")}
              value={certificateId}
              onChange={(e) => setCertificateId(e.target.value)}
            >
              {options.map((row) => (
                <MenuItem key={row.uuid} value={row.uuid}>
                  {row.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </>
      )}
    </Modal>
  );
}
