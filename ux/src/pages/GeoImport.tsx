import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  fetchGeoImports,
  GeoUploadError,
  uploadGeoFile,
  type GeoFileInfo,
  type GeoImportJob,
  type GeoImportView,
  type GeoKind,
} from "../api.ts";
import { Modal } from "../components/Modal.tsx";
import type { PageBarStatus } from "../components/PageBar.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import type { FormNotice } from "../store/slices/forms.ts";
import { bytes } from "./incident-shared.tsx";

const POLL_RUNNING_MS = 1000;
const POLL_CODER_MS = 2000;
const CODER_WAIT_MS = 120_000;

type Banner = { severity: "success" | "error"; text: string };

export function useGeoImport(
  kind: GeoKind,
  scope: string | null,
  onLoaded: () => void,
): {
  status: PageBarStatus[];
  uploadDisabled: boolean;
  openUpload: () => void;
  refresh: () => void;
  dialog: ReactNode;
  banner: ReactNode;
} {
  const t = useT();
  const [view, setView] = useState<GeoImportView | null>(null);
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const loaded = useRef(onLoaded);
  const lastState = useRef<GeoImportJob["state"] | null>(null);
  const coderUntil = useRef(0);

  loaded.current = onLoaded;

  const load = useCallback(async () => {
    if (scope === null) {
      return;
    }

    try {
      setView(await fetchGeoImports(scope));
    } catch {
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const job = view?.jobs[kind] ?? null;
  const file = view?.files[kind] ?? null;
  const replicas = view?.coder.replicas ?? 0;
  const running = job?.state === "running";
  const behind = file !== null && replicas > 0 && file.coders < replicas;
  const state = job?.state ?? null;

  useEffect(() => {
    const since = file === null ? 0 : Date.parse(file.uploaded_at) + CODER_WAIT_MS;

    if (
      view === null ||
      !(running || (behind && Date.now() < Math.max(coderUntil.current, since)))
    ) {
      return;
    }

    const timer = setTimeout(() => void load(), running ? POLL_RUNNING_MS : POLL_CODER_MS);
    return () => clearTimeout(timer);
  }, [view, file, running, behind, load]);

  useEffect(() => {
    const prev = lastState.current;
    lastState.current = state;

    if (prev !== "running" || job === null) {
      return;
    }

    if (state === "done") {
      coderUntil.current = Date.now() + CODER_WAIT_MS;
      setBanner({
        severity: "success",
        text: t("geoImport.done", {
          type: job.database_type,
          build: buildDate(job.build_epoch),
          networks: count(job.networks),
          added: count(job.added),
          removed: count(job.removed),
        }),
      });
      loaded.current();
    } else if (state === "failed") {
      setBanner({ severity: "error", text: errorText(t, kind, job.error, job.detail) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const upload = useCallback(
    async (picked: File) => {
      if (scope === null) {
        throw new GeoUploadError("no_space");
      }

      const next = await uploadGeoFile(scope, kind, picked);

      setBanner(null);
      setView((prev) => ({
        jobs: { country: null, asn: null, ...prev?.jobs, [kind]: next },
        files: prev?.files ?? { country: null, asn: null },
        coder: prev?.coder ?? { replicas: 0, rev: 0 },
      }));
    },
    [scope, kind],
  );

  const status: PageBarStatus[] = [];

  if (job !== null && job.state === "running") {
    status.push({
      key: "geo-import",
      label: t("geoImport.statusImport"),
      value: count(job.networks),
      tone: "warning",
      title:
        job.phase === "catalog"
          ? t("geoImport.phaseCatalog", { type: job.database_type })
          : t("geoImport.phasePublish"),
    });
  } else if (job !== null && job.state === "failed") {
    status.push({
      key: "geo-import",
      label: t("geoImport.statusImport"),
      value: t("geoImport.failed"),
      tone: "error",
      title: errorText(t, kind, job.error, job.detail),
    });
  }

  if (file !== null) {
    status.push(
      {
        key: "geo-file",
        label: t("geoImport.statusFile"),
        value: buildDate(file.build_epoch),
        title: t("geoImport.fileTitle", {
          type: file.database_type,
          size: bytes(file.size),
          uploaded: new Date(file.uploaded_at).toLocaleString(),
          sha: file.sha256.replace(/^sha256:/, "").slice(0, 12),
        }),
      },
      {
        key: "geo-coder",
        label: t("geoImport.statusCoder"),
        value: replicas === 0 ? t("geoImport.coderNone") : `${file.coders}/${replicas}`,
        tone: replicas > 0 && file.coders === replicas ? "success" : "warning",
        title: coderTitle(t, file, replicas),
      },
    );
  }

  return {
    status,
    uploadDisabled: scope === null || running,
    openUpload: () => setOpen(true),
    refresh: () => void load(),
    dialog: open ? (
      <GeoImportDialog kind={kind} onClose={() => setOpen(false)} onUpload={upload} />
    ) : null,
    banner:
      banner === null ? null : (
        <Alert severity={banner.severity} onClose={() => setBanner(null)} sx={{ borderRadius: 0 }}>
          {banner.text}
        </Alert>
      ),
  };
}

function GeoImportDialog({
  kind,
  onClose,
  onUpload,
}: {
  kind: GeoKind;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<FormNotice | null>(null);

  const submit = async () => {
    if (file === null) {
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      await onUpload(file);
      onClose();
    } catch (err: unknown) {
      setBusy(false);
      setNotice({
        severity: "error",
        text:
          err instanceof GeoUploadError
            ? errorText(t, kind, err.code, err.detail)
            : String(err),
      });
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={t("geoImport.title")}
      label={kind === "asn" ? t("geoImport.kindAsn") : t("geoImport.kindCountry")}
      hint={kind === "asn" ? t("geoImport.hintAsn") : t("geoImport.hintCountry")}
      busy={busy}
      notice={notice}
      onNoticeClose={() => setNotice(null)}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={file === null} onClick={() => void submit()}>
            {t("geoImport.submit")}
          </Modal.Submit>
        </>
      }
    >
      <input
        ref={input}
        type="file"
        accept=".mmdb"
        hidden
        onChange={(e) => {
          const next = e.target.files?.[0];
          e.target.value = "";
          if (next !== undefined) {
            setFile(next);
            setNotice(null);
          }
        }}
      />
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() => input.current?.click()}
          sx={{ flexShrink: 0 }}
        >
          {t("geoImport.pick")}
        </Button>
        <Typography
          variant="body2"
          noWrap
          title={file?.name}
          sx={{
            minWidth: 0,
            color: file === null ? "text.secondary" : "text.primary",
            fontFamily: file === null ? undefined : "monospace",
          }}
        >
          {file === null ? t("geoImport.noFile") : `${file.name} · ${bytes(file.size)}`}
        </Typography>
      </Stack>
    </Modal>
  );
}

function coderTitle(t: Translate, file: GeoFileInfo, replicas: number): string {
  if (replicas === 0) {
    return t("geoImport.coderNoneTitle");
  }

  if (!file.published) {
    return t("geoImport.coderUnpublished");
  }

  return file.coders === replicas ? t("geoImport.coderOnFile") : t("geoImport.coderBehind");
}

function count(n: number): string {
  return n.toLocaleString();
}

function buildDate(epoch: number): string {
  return epoch > 0 ? new Date(epoch * 1000).toLocaleDateString() : "—";
}

function errorText(
  t: Translate,
  kind: GeoKind,
  code: string | undefined,
  detail: string | undefined,
): string {
  switch (code) {
    case "mmdb_kind_mismatch":
      return t("geoImport.errors.mmdb_kind_mismatch", {
        got: detail === "asn" ? t("geoImport.kindAsn") : t("geoImport.kindCountry"),
        want: kind === "asn" ? t("geoImport.kindAsn") : t("geoImport.kindCountry"),
      });
    case "file_too_large":
      return t("geoImport.errors.file_too_large", { max: bytes(Number(detail ?? 0)) });
    case "file_empty":
      return t("geoImport.errors.file_empty");
    case "file_unreadable":
      return t("geoImport.errors.file_unreadable");
    case "mmdb_invalid":
      return t("geoImport.errors.mmdb_invalid");
    case "mmdb_unsupported":
      return t("geoImport.errors.mmdb_unsupported");
    case "mmdb_empty":
      return t("geoImport.errors.mmdb_empty");
    case "import_running":
      return t("geoImport.errors.import_running");
    case "catalog_failed":
      return t("geoImport.errors.catalog_failed", { detail: detail ?? "" });
    default:
      return detail === undefined ? (code ?? "") : `${code ?? "error"}: ${detail}`;
  }
}
