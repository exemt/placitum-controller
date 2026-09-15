import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

import type { ChannelId } from "../api.ts";
import { PAGE_RAIL, TABLE_RAIL } from "./PageBar.tsx";
import {
  CHANNEL_TONE,
  channelReason,
  channelStateLabel,
  useChannel,
} from "../convergence.tsx";
import { useT } from "../i18n/index.ts";
import { useAppSelector } from "../store/hooks.ts";

const QUIET = new Set(["ok", "empty", "unmanaged", "nobody"]);

const SEVERITY = {
  default: "info",
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
} as const;

export const pageNoticeSx = {
  borderRadius: 0,
  alignItems: "center",
  pl: `${TABLE_RAIL}px`,
  pr: `${PAGE_RAIL}px`,
  borderBottom: 1,
  borderColor: "divider",
  "& .MuiAlert-action": { alignItems: "center", pt: 0, mr: 0 },
} as const;

export default function ChannelNotice({ id }: { id: ChannelId }) {
  const t = useT();
  const { channel, canSend, sending, send } = useChannel(id);
  const error = useAppSelector((s) => s.convergence.error);

  if (channel === null) {
    return null;
  }

  if (QUIET.has(channel.state) && error === null) {
    return null;
  }

  if (error !== null) {
    return (
      <Alert severity="error" icon={false} sx={pageNoticeSx}>
        <AlertTitle>{t("convergence.sendFailed")}</AlertTitle>
        {error}
      </Alert>
    );
  }

  const reason = channelReason(t, channel);
  const withButton = canSend || sending;

  return (
    <Alert
      severity={SEVERITY[CHANNEL_TONE[channel.state]]}
      icon={false}
      sx={{
        ...pageNoticeSx,
        "& .MuiAlert-message": { display: "flex", alignItems: "baseline", minWidth: 0 },
      }}
      action={
        withButton ? (
          <Button
            color="warning"
            variant="contained"
            size="small"
            disabled={sending}
            onClick={send}
            startIcon={
              sending ? <CircularProgress size={14} color="inherit" /> : undefined
            }
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("common.send")}
          </Button>
        ) : undefined
      }
    >
      {!withButton && (
        <Box component="span" sx={{ fontWeight: 600, mr: 1, whiteSpace: "nowrap" }}>
          {channelStateLabel(t, channel.state)}
        </Box>
      )}
      {reason}
    </Alert>
  );
}
