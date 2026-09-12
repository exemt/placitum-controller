import { useMemo, useRef, useState } from "react";
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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import PlaylistRemoveIcon from "@mui/icons-material/PlaylistRemove";
import RuleFolderOutlinedIcon from "@mui/icons-material/RuleFolderOutlined";

import { CERTIFICATE_TYPES, type Certificate, type CertificateType } from "../api.ts";
import { Form, formDrawerPaperSx } from "../components/Form.tsx";
import { ConfirmModal } from "../components/Modal.tsx";
import { UnderlayTabs } from "../components/fields.tsx";
import {
  DataTable,
  RowActionsHead,
  TableIconButton,
  TableNotice,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { useT } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closeCrlPanel,
  closePanel,
  deleteCertificateThunk,
  loadCertificates,
  openCrlPanel,
  openPanel,
  removeCrlThunk,
  uploadCertificateThunk,
  uploadCrlThunk,
} from "../store/slices/pages/certificates.ts";

const PANEL_WIDTH = 520;

/** За сколько дней до конца срока строка становится предупреждением. */
const EXPIRY_WARN_DAYS = 30;

type ExpiryState = "expired" | "soon" | "ok" | "unknown";

function formatDate(value: string | null): string {
  if (value === null) {
    return "—";
  }
  return new Date(value).toLocaleDateString();
}

/**
 * Срок в терминах «сколько осталось», а не только дата: оператор смотрит на
 * список, чтобы понять, что пора перевыпускать, и считать дни в уме не должен.
 */
function expiryOf(notAfter: string | null): { state: ExpiryState; days: number } {
  if (notAfter === null) {
    return { state: "unknown", days: 0 };
  }

  const ms = new Date(notAfter).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);

  if (days < 0) {
    return { state: "expired", days };
  }
  return { state: days <= EXPIRY_WARN_DAYS ? "soon" : "ok", days };
}

function shortFingerprint(value: string): string {
  return value.length <= 22 ? value : `${value.slice(0, 19)}…`;
}

/** `CN=shop, O=Example` -> `shop`: в таблице ширины на полный DN нет. */
function shortSubject(value: string): string {
  const cn = /CN=([^,]+)/.exec(value);
  return cn === null ? value : cn[1];
}

function ExpiryCell({ row }: { row: Certificate }) {
  const t = useT();
  const { state, days } = expiryOf(row.not_after);

  const color =
    state === "expired"
      ? "error.main"
      : state === "soon"
        ? "warning.main"
        : "text.primary";

  const note =
    state === "expired"
      ? t("certificates.expired")
      : state === "soon"
        ? t("certificates.expiresIn", { days: String(days) })
        : null;

  return (
    <Tooltip
      title={
        row.not_before === null
          ? ""
          : t("certificates.validFrom", { date: formatDate(row.not_before) })
      }
    >
      <Box>
        <Typography variant="body2" sx={{ color }}>
          {formatDate(row.not_after)}
        </Typography>
        {note !== null && (
          <Typography variant="caption" sx={{ color, display: "block" }}>
            {note}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}

/**
 * Состояние списка отзыва у корня mTLS. Просроченный CRL опаснее
 * отсутствующего: nginx его примет, а отозванные с тех пор сертификаты
 * пройдут проверку -- поэтому next_update в прошлом подсвечивается ошибкой.
 */
function CrlCell({ row }: { row: Certificate }) {
  const t = useT();

  if (row.crl === null) {
    return (
      <Chip
        size="small"
        variant="outlined"
        label={t("certificates.crl.none")}
        sx={{ height: 20, fontSize: "0.7rem" }}
      />
    );
  }

  const stale =
    row.crl.next_update !== null &&
    new Date(row.crl.next_update).getTime() < Date.now();

  return (
    <Tooltip
      title={
        <Box>
          <div>
            {t("certificates.crl.thisUpdate", {
              date: formatDate(row.crl.this_update),
            })}
          </div>
          <div>
            {t("certificates.crl.nextUpdate", {
              date: formatDate(row.crl.next_update),
            })}
          </div>
        </Box>
      }
    >
      <Chip
        size="small"
        variant="outlined"
        color={stale ? "error" : "success"}
        label={t("certificates.crl.revoked", {
          count: String(row.crl.revoked ?? 0),
        })}
        sx={{ height: 20, fontSize: "0.7rem" }}
      />
    </Tooltip>
  );
}

export default function Certificates() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.certificates.rows);
  const loading = useAppSelector((s) => s.pages.certificates.loading);
  const error = useAppSelector((s) => s.pages.certificates.error);
  const cryptoStatus = useAppSelector((s) => s.pages.certificates.cryptoStatus);
  const cryptoError = useAppSelector((s) => s.pages.certificates.cryptoError);
  const panelOpen = useAppSelector((s) => s.pages.certificates.panelOpen);
  const crlPanelFor = useAppSelector((s) => s.pages.certificates.crlPanelFor);

  const [tab, setTab] = useState<CertificateType>("server");
  const [pendingCrlDrop, setPendingCrlDrop] = useState<Certificate | null>(null);

  // Строки до появления `type` в API считаются серверной парой: так они и
  // грузились раньше, и вкладка не должна их прятать.
  const shown = useMemo(
    () => rows.filter((row) => (row.type ?? "server") === tab),
    [rows, tab],
  );
  const pager = usePager(shown);
  /*
   * Копии у сертификата нет: тело лежит в хранилище шифрованным, и второй записи
   * с тем же отпечатком взяться неоткуда -- пару заливают заново.
   */
  const ops = useRowOps<Certificate>({
    nameOf: (row) => row.name,
    deleteTitle: t("certificates.deleteTitle"),
    deleteText: (row) => t("certificates.deleteConfirm", { name: row.name }),
    remove: async (row) =>
      thunkError(
        await dispatch(
          deleteCertificateThunk({ scope: scope ?? "", id: row.uuid }),
        ),
      ),
  });

  const crlTarget = rows.find((row) => row.uuid === crlPanelFor) ?? null;

  const uploadBlocked =
    cryptoError !== null || cryptoStatus === null || cryptoStatus.check === "mismatch";

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel()),
    onUpdate: () => {
      void dispatch(loadCertificates(scope));
    },
    createDisabled: scope === null || uploadBlocked,
    updateDisabled: scope === null,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  const isCa = tab === "client_ca";

  return (
    <>
      {cryptoError !== null && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {t("certificates.cryptoUnavailable")}
        </Alert>
      )}
      {cryptoError === null && cryptoStatus?.check === "mismatch" && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {t("certificates.pinMismatch")}
        </Alert>
      )}
      {cryptoError === null && cryptoStatus?.check === "no_pin" && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          {t("certificates.noPin", { fingerprint: cryptoStatus.crypto.fingerprint })}
        </Alert>
      )}
      {error !== null && rows.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ px: 2, py: 1.5 }}>
        <UnderlayTabs
          value={tab}
          onChange={(next) => {
            setTab(next);
            pager.setPage(0);
          }}
          items={CERTIFICATE_TYPES.map((value) => ({
            value,
            label: t(`certificates.type.${value}`),
          }))}
        />
      </Box>

      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>
            {isCa ? t("certificates.subject") : t("certificates.sans")}
          </TableCell>
          <TableCell>{t("certificates.notAfter")}</TableCell>
          {isCa && <TableCell>{t("certificates.crl.column")}</TableCell>}
          <TableCell>{t("certificates.fingerprint")}</TableCell>
          <RowActionsHead extra={2} />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row) => (
            <TableRow key={row.uuid} hover>
              <TableCell>{row.name}</TableCell>
              <TableCell>
                <Tooltip title={isCa ? row.subject : row.sans.join(", ")}>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>
                    {isCa ? shortSubject(row.subject) : row.sans.join(", ")}
                  </Typography>
                </Tooltip>
              </TableCell>
              <TableCell>
                <ExpiryCell row={row} />
              </TableCell>
              {isCa && (
                <TableCell>
                  <CrlCell row={row} />
                </TableCell>
              )}
              <TableCell>
                <Tooltip title={row.fingerprint}>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                  >
                    {shortFingerprint(row.fingerprint)}
                  </Typography>
                </Tooltip>
              </TableCell>
              {ops.cell(
                row,
                { copy: t("certificates.copyOff") },
                <>
                  {isCa && (
                    <TableIconButton
                      icon={<RuleFolderOutlinedIcon />}
                      tooltip={
                        row.crl === null
                          ? t("certificates.crl.upload")
                          : t("certificates.crl.replace")
                      }
                      disabled={uploadBlocked}
                      onClick={() => dispatch(openCrlPanel(row.uuid))}
                    />
                  )}
                  {isCa && row.crl !== null && (
                    <TableIconButton
                      icon={<PlaylistRemoveIcon />}
                      tooltip={t("certificates.crl.remove")}
                      color="warning"
                      onClick={() => setPendingCrlDrop(row)}
                    />
                  )}
                </>,
              )}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={isCa ? t("certificates.emptyCa") : t("certificates.empty")}
          actionLabel={t("common.create")}
          actionDisabled={uploadBlocked}
          onAction={() => dispatch(openPanel())}
        />
        <DataTable.Error onRetry={() => void dispatch(loadCertificates(scope))} />
        <DataTable.Pager pager={pager} />
      </DataTable>

      <Drawer
        anchor="right"
        open={panelOpen}
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
        {panelOpen && (
          <UploadForm
            scope={scope}
            initialType={tab}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>

      <Drawer
        anchor="right"
        open={crlTarget !== null}
        onClose={() => dispatch(closeCrlPanel())}
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
        {crlTarget !== null && (
          <CrlForm
            scope={scope}
            certificate={crlTarget}
            onClose={() => dispatch(closeCrlPanel())}
          />
        )}
      </Drawer>

      {ops.modals}

      {pendingCrlDrop !== null && (
        <ConfirmModal
          open
          color="warning"
          confirmLabel={t("common.delete")}
          title={t("certificates.crl.removeTitle")}
          text={t("certificates.crl.removeConfirm", {
            name: pendingCrlDrop.name,
          })}
          onClose={() => setPendingCrlDrop(null)}
          onConfirm={() => {
            void dispatch(removeCrlThunk({ scope, id: pendingCrlDrop.uuid }));
            setPendingCrlDrop(null);
          }}
        />
      )}
    </>
  );
}

function UploadForm({
  scope,
  initialType,
  onClose,
}: {
  scope: string;
  initialType: CertificateType;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const submitting = useAppSelector((s) => s.pages.certificates.submitting);
  const submitError = useAppSelector((s) => s.pages.certificates.submitError);

  const [type, setType] = useState<CertificateType>(initialType);
  const [name, setName] = useState("");
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [chainPem, setChainPem] = useState("");

  const needsKey = type === "server";

  const canSubmit =
    name.trim().length > 0 &&
    certPem !== "" &&
    (!needsKey || keyPem !== "") &&
    !submitting;

  const formError = submitError === null ? null : friendlyCertError(t, submitError);

  return (
    <Form id="certificate">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {t("certificates.newTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body spacing={1.5} scroll>
        <Typography variant="body2" color="text.secondary">
          {t("certificates.uploadBlurb")}
        </Typography>
        <TextField
          select
          size="small"
          label={t("certificates.type.label")}
          value={type}
          onChange={(e) => setType(e.target.value as CertificateType)}
          helperText={t(`certificates.type.${type}Hint`)}
        >
          {CERTIFICATE_TYPES.map((item) => (
            <MenuItem key={item} value={item}>
              {t(`certificates.type.${item}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label={t("common.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
        <PemField
          label={needsKey ? t("certificates.certFile") : t("certificates.caFile")}
          value={certPem}
          accept=".pem,.crt,.cer"
          required
          placeholder={t("certificates.noFile")}
          onChange={setCertPem}
        />
        {needsKey && (
          <PemField
            label={t("certificates.keyFile")}
            value={keyPem}
            accept=".pem,.key"
            required
            placeholder={t("certificates.noFile")}
            onChange={setKeyPem}
          />
        )}
        {needsKey && (
          <PemField
            label={t("certificates.chainFile")}
            value={chainPem}
            accept=".pem,.crt,.cer"
            placeholder={t("certificates.chainOptional")}
            onChange={setChainPem}
          />
        )}
      </Form.Body>
      {formError !== null && (
        <TableNotice
          kind="error"
          title={t("table.errorTitle")}
          message={formError}
          sx={{
            borderRadius: 0,
            borderTop: 1,
            borderColor: "error.main",
            py: 1.5,
            px: 2,
          }}
        />
      )}
      <Form.Actions>
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!canSubmit}
          onClick={() => {
            void dispatch(
              uploadCertificateThunk({
                scope,
                name: name.trim(),
                type,
                certPem,
                keyPem: needsKey ? keyPem : undefined,
                chainPem: !needsKey || chainPem === "" ? undefined : chainPem,
              }),
            );
          }}
        >
          {t("certificates.upload")}
        </Button>
      </Form.Actions>
    </Form>
  );
}

function CrlForm({
  scope,
  certificate,
  onClose,
}: {
  scope: string;
  certificate: Certificate;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const submitting = useAppSelector((s) => s.pages.certificates.submitting);
  const submitError = useAppSelector((s) => s.pages.certificates.submitError);

  const [crlPem, setCrlPem] = useState("");

  const formError = submitError === null ? null : friendlyCertError(t, submitError);

  return (
    <Form id="certificate-crl">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {t("certificates.crl.title", { name: certificate.name })}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body spacing={1.5} scroll>
        <Typography variant="body2" color="text.secondary">
          {t("certificates.crl.blurb")}
        </Typography>
        {certificate.crl !== null && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            {t("certificates.crl.current", {
              count: String(certificate.crl.revoked ?? 0),
              date: formatDate(certificate.crl.next_update),
            })}
          </Alert>
        )}
        <PemField
          label={t("certificates.crl.file")}
          value={crlPem}
          accept=".pem,.crl"
          required
          placeholder={t("certificates.noFile")}
          onChange={setCrlPem}
        />
      </Form.Body>
      {formError !== null && (
        <TableNotice
          kind="error"
          title={t("table.errorTitle")}
          message={formError}
          sx={{
            borderRadius: 0,
            borderTop: 1,
            borderColor: "error.main",
            py: 1.5,
            px: 2,
          }}
        />
      )}
      <Form.Actions>
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={crlPem === "" || submitting}
          onClick={() => {
            void dispatch(uploadCrlThunk({ scope, id: certificate.uuid, crlPem }));
          }}
        >
          {t("certificates.upload")}
        </Button>
      </Form.Actions>
    </Form>
  );
}

/**
 * Коды контроллера и crypto-сервиса -- в текст оператору. Всё, что не
 * опознали, показываем как есть: лучше сырой код, чем «что-то пошло не так».
 */
const CERT_ERROR_CODES = [
  "fingerprint_mismatch",
  "not_a_ca",
  "invalid_crl",
  "crl_issuer_mismatch",
  "crl_needs_client_ca",
  "key_mismatch",
  "key_required",
  "key_not_allowed",
  "invalid_certificate",
  "undecryptable",
  "crypto_unavailable",
] as const;

function friendlyCertError(
  t: (path: string, vars?: Record<string, string>) => string,
  raw: string,
): string {
  for (const code of CERT_ERROR_CODES) {
    if (raw.includes(code)) {
      return t(`certificates.errors.${code}`);
    }
  }
  return raw;
}

function PemField({
  label,
  value,
  accept,
  required,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  accept: string;
  required?: boolean;
  placeholder?: string;
  onChange: (text: string) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Box sx={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file === undefined) {
            return;
          }
          void file.text().then(onChange);
        }}
      />
      <TextField
        size="small"
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        multiline
        minRows={6}
        placeholder={placeholder}
        sx={{
          width: "100%",
          "& textarea": {
            fontFamily: "monospace",
            fontSize: "0.8rem",
            lineHeight: 1.45,
            pr: 6,
          },
        }}
      />
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 1,
        }}
      >
        <TableIconButton
          icon={<FileUploadOutlinedIcon />}
          tooltip={t("common.upload")}
          onClick={() => inputRef.current?.click()}
        />
      </Stack>
    </Box>
  );
}
