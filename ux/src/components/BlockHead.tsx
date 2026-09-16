import type { ReactNode } from "react";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ScheduleIcon from "@mui/icons-material/ScheduleOutlined";

import { useT } from "../i18n/index.ts";

export type BlockHeadStatus = "ok" | "warning" | "danger";

export type HeadFlag = "ok" | "er" | "dr";

export interface HeadFlags {
  ok: boolean;
  er: boolean;
  dr: boolean;
}

const STATUS_COLOR: Record<BlockHeadStatus, "success.main" | "warning.main" | "error.main"> =
  {
    ok: "success.main",
    warning: "warning.main",
    danger: "error.main",
  };

const FLAG_COLOR: Record<HeadFlag, "success.main" | "error.main" | "warning.main"> = {
  ok: "success.main",
  er: "error.main",
  dr: "warning.main",
};


export function toHeadStatus(
  status: "up" | "degraded" | "ok" | "warning" | "danger",
): BlockHeadStatus {
  if (status === "up" || status === "ok") {
    return "ok";
  }
  if (status === "danger") {
    return "danger";
  }
  return "warning";
}

export function toHeadFlag(flags: HeadFlags): HeadFlag {
  if (flags.er) {
    return "er";
  }
  if (flags.dr) {
    return "dr";
  }
  return "ok";
}

export function StatusMark({
  status,
  title,
}: {
  status: BlockHeadStatus;
  title?: string;
}) {
  return (
    <Box
      component="span"
      title={title ?? status}
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        bgcolor: STATUS_COLOR[status],
        flexShrink: 0,
      }}
    />
  );
}

export function StatusPlate({ flags }: { flags: HeadFlags }) {
  const t = useT();
  const code = toHeadFlag(flags);
  const color = FLAG_COLOR[code];

  return (
    <Box
      component="span"
      title={t(`fleetPage.state.${code}`)}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 24,
        borderRadius: "2px",
        border: "1px solid",
        borderColor: color,
        color,
        bgcolor: (theme) =>
          alpha(theme.palette[FLAG_TONE[code]].main, 0.09),
        fontSize: "0.7rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {code}
    </Box>
  );
}

const FLAG_TONE: Record<HeadFlag, "success" | "error" | "warning"> = {
  ok: "success",
  er: "error",
  dr: "warning",
};

export function ErrorBadge({ count }: { count: number }) {
  const t = useT();
  if (count <= 0) {
    return null;
  }
  return (
    <Box
      component="span"
      title={t("fleetPage.errorsBlock")}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        height: 22,
        px: 0.75,
        borderRadius: "2px",
        color: "error.main",
        bgcolor: (theme) => alpha(theme.palette.error.main, 0.12),
        fontSize: "0.68rem",
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 13 }} />
      {count}
    </Box>
  );
}

const SKEW_BADGE_MS = 3000;

export function SkewBadge({ skewMs }: { skewMs?: number }) {
  const t = useT();
  if (skewMs === undefined || Math.abs(skewMs) < SKEW_BADGE_MS) {
    return null;
  }
  const seconds = Math.round(Math.abs(skewMs) / 1000);
  return (
    <Box
      component="span"
      title={t("fleetPage.skewHint")}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        height: 22,
        px: 0.75,
        borderRadius: "2px",
        color: "warning.main",
        bgcolor: (theme) => alpha(theme.palette.warning.main, 0.12),
        fontSize: "0.68rem",
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <ScheduleIcon sx={{ fontSize: 13 }} />
      {skewMs > 0 ? "−" : "+"}
      {seconds}s
    </Box>
  );
}

export const HEAD_SLOTS = 5;

export function HeadMetrics({ slots }: { slots: (ReactNode | null)[] }) {
  const shown = [...slots];
  while (shown.length < HEAD_SLOTS) {
    shown.unshift(null);
  }
  return (
    <Box
      sx={{
        display: { xs: "none", md: "grid" },
        gridTemplateColumns: `repeat(${shown.length}, minmax(88px, 132px))`,
        columnGap: { md: 1.5, lg: 2 },
        alignItems: "center",
        minWidth: 0,
        flexShrink: 1,
      }}
    >
      {shown.map((slot, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Box key={index} sx={{ minWidth: 0 }}>
          {slot}
        </Box>
      ))}
    </Box>
  );
}

const ACCORDION_CONTENT_SX = {
  display: "flex",
  flexGrow: 1,
  minWidth: 0,
  my: 0.75,
  "& > *": {
    flex: 1,
    minWidth: 0,
  },
} as const;

const ACCORDION_BASE_SX = {
  borderRadius: "5px",
  overflow: "hidden",
  "&:before": { display: "none" },
  "& .MuiAccordionSummary-content": ACCORDION_CONTENT_SX,
  "& .MuiAccordionSummary-content.Mui-expanded": {
    my: 0.75,
  },
  "& .MuiAccordionDetails-root": {
    p: 2,
  },
} as const;

const ACCORDION_SX = {
  ...ACCORDION_BASE_SX,
  "& .MuiAccordionSummary-root": {
    bgcolor: "transparent",
    borderBottom: "1px solid",
    borderColor: "transparent",
  },
};

const ACCORDION_SX_OPEN = {
  ...ACCORDION_BASE_SX,
  "& .MuiAccordionSummary-root": {
    bgcolor: (theme: { palette: { mode: string } }) =>
      theme.palette.mode === "dark"
        ? "rgba(0, 0, 0, 0.35)"
        : "rgba(19, 32, 44, 0.05)",
    borderBottom: "1px solid",
    borderColor: "divider",
  },
};

const TONE_STRIPE: Record<HeadFlag, "success.main" | "error.main" | "warning.main"> = {
  ok: "success.main",
  er: "error.main",
  dr: "warning.main",
};

export function blockAccordionSx(expanded: boolean, tone?: HeadFlag) {
  const base = expanded ? ACCORDION_SX_OPEN : ACCORDION_SX;
  if (tone === undefined) {
    return base;
  }
  return {
    ...base,
    borderLeft: "3px solid",
    borderLeftColor: TONE_STRIPE[tone],
  };
}

export function SummaryRow({
  title,
  label,
  flags,
  errorCount = 0,
  skewMs,
  slots,
  children,
}: {
  title: string;
  label: string;
  flags: HeadFlags;
  errorCount?: number;
  skewMs?: number;
  slots?: (ReactNode | null)[];
  children?: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        flex: 1,
        minWidth: 0,
        width: "100%",
        pr: 1,
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ alignItems: "center", minWidth: 0, flexShrink: 1 }}
      >
        <StatusPlate flags={flags} />
        <BlockHead title={title} label={label} />
        <ErrorBadge count={errorCount} />
        <SkewBadge skewMs={skewMs} />
      </Stack>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", flexShrink: 1, minWidth: 0 }}
      >
        {slots !== undefined && <HeadMetrics slots={slots} />}
        {children !== undefined && (
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              gap: 2,
            }}
          >
            {children}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}

export function BlockHead({
  status,
  title,
  label,
  nowrap = true,
}: {
  status?: BlockHeadStatus;
  title: string;
  label?: string;
  nowrap?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 168, maxWidth: 280, flexShrink: 1 }}>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center", minWidth: 0 }}
      >
        {status !== undefined && <StatusMark status={status} />}
        <Typography
          component="span"
          variant="subtitle2"
          sx={{
            color: "secondary.main",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </Typography>
      </Stack>
      {label !== undefined && label !== "" && (
        <Typography
          component="div"
          noWrap={nowrap}
          sx={{
            mt: 0.25,
            pl: status !== undefined ? 1.75 : 0,
            fontSize: "0.7rem",
            lineHeight: 1.3,
            fontWeight: 500,
            color: "text.secondary",
            opacity: 0.55,
          }}
        >
          {label}
        </Typography>
      )}
    </Box>
  );
}
