import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { deleteLicense, fetchLicense, putLicense, type LicenseView } from "../api.ts";
import { errorCode } from "../errors.ts";
import Markdown from "../components/Markdown.tsx";
import { useT } from "../i18n/index.ts";
import { LICENSE_VERSION, isCurrent, licenseText } from "../license.ts";
import { useAppSelector } from "../store/hooks.ts";

const STATE_COLOR = {
  active: "success",
  pending: "warning",
  expired: "error",
  invalid: "error",
  missing: "default",
} as const;

function dayOf(unix: number | undefined): string {
  return unix === undefined || unix === 0 ? "" : new Date(unix * 1000).toISOString().slice(0, 10);
}

/* The commercial license key: what the installation holds, and a field to paste a new one. */
function LicenseKey() {
  const t = useT();
  const [view, setView] = useState<LicenseView | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchLicense()
      .then(setView)
      .catch((err: unknown) => setError(errorCode(err)));
  }, []);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      setView(await putLicense(key));
      setKey("");
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      setView(await deleteLicense());
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  const doc = view?.doc ?? null;
  const state = view?.state ?? "missing";

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="subtitle2">{t("license.key.title")}</Typography>
          <Chip size="small" variant="outlined" color={STATE_COLOR[state]} label={t(`license.key.state.${state}`)} />
        </Stack>
        {doc !== null && (
          <Typography variant="body2" color="text.secondary">
            {t("license.key.holder", { id: doc.id, licensee: doc.licensee.name })}
            {doc.exp !== undefined && doc.exp !== 0
              ? ` · ${t("license.key.until", { date: dayOf(doc.exp) })}`
              : ` · ${t("license.key.forever")}`}
            {" · "}
            {doc.grants.map((g) => g.product).join(", ")}
          </Typography>
        )}
        {state === "missing" && (
          <Typography variant="body2" color="text.secondary">
            {t("license.key.hint")}
          </Typography>
        )}
        {error !== null && <Alert severity="error">{t(`license.key.errors.${error}`) === `license.key.errors.${error}` ? error : t(`license.key.errors.${error}`)}</Alert>}
        <TextField
          size="small"
          multiline
          minRows={3}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="PLC1.…"
          label={t("license.key.field")}
          slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: "0.8rem" } } }}
        />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" disabled={busy || key.trim() === ""} onClick={() => void apply()}>
            {t("license.key.apply")}
          </Button>
          {doc !== null && (
            <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => void remove()}>
              {t("license.key.remove")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function License() {
  const t = useT();
  const locale = useAppSelector((s) => s.ui.locale);
  const accepted = useAppSelector((s) => s.ui.license);

  const status = isCurrent(accepted)
    ? t("license.acceptedAt", {
        date: new Date(accepted!.at).toLocaleDateString(locale),
      })
    : t("license.notAccepted");

  return (
    <Stack spacing={2} sx={{ maxWidth: "80ch", pb: 6 }}>
      <Typography variant="caption" color="text.secondary">
        {t("license.version", { version: LICENSE_VERSION })} · {status}
      </Typography>
      <LicenseKey />
      <Box>
        <Markdown text={licenseText(locale)} />
      </Box>
    </Stack>
  );
}
