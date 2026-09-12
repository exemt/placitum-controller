import { useState, type ReactNode } from "react";

import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { formatBytes, formatCpu } from "../fleet.ts";
import { useT } from "../i18n/index.ts";
import {
  latencyCaption,
  latencyFill,
  latencyTone,
  queueCaption,
  queueFill,
  queueTone,
  type InspectorLatency,
  type InspectorQueue,
} from "../inspectors.ts";

export interface MetricBarSegment {
  key: string;
  value: number;
  color: string;
}

export function MetricBar({
  label,
  caption,
  value,
  color,
  segments,
  tooltip,
  tooltipPlacement = "bottom-start",
}: {
  label: string;
  caption: string;
  value?: number;
  color?: "primary" | "success" | "warning" | "error";
  segments?: MetricBarSegment[];
  tooltip?: ReactNode | (() => ReactNode);
  tooltipPlacement?: "left" | "right" | "top" | "bottom" | "bottom-start";
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const bar = (
    <Box sx={{ width: "100%", maxWidth: 132, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {[label, caption].filter((part) => part !== "").join(" ")}
      </Typography>
      {segments !== undefined ? (
        <StackedTrack segments={segments} />
      ) : (
        <LinearProgress
          variant="determinate"
          value={clamp01(value ?? 0) * 100}
          color={color ?? barColor(value ?? 0)}
          sx={{ height: 6, borderRadius: 1 }}
        />
      )}
    </Box>
  );

  if (tooltip === undefined) {
    return bar;
  }

  const title =
    typeof tooltip === "function" ? (tipOpen ? tooltip() : "") : tooltip;

  return (
    <Tooltip
      title={title}
      arrow
      placement={tooltipPlacement}
      enterDelay={200}
      onOpen={
        typeof tooltip === "function" ? () => setTipOpen(true) : undefined
      }
      onClose={
        typeof tooltip === "function" ? () => setTipOpen(false) : undefined
      }
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            border: 1,
            borderColor: "divider",
            boxShadow: 4,
            px: 1.75,
            py: 1.25,
            maxWidth: 280,
          },
        },
        arrow: { sx: { color: "background.paper" } },
      }}
    >
      {bar}
    </Tooltip>
  );
}

function StackedTrack({ segments }: { segments: MetricBarSegment[] }) {
  const mix = segments.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return (
    <Box
      sx={{
        display: "flex",
        height: 6,
        borderRadius: 1,
        overflow: "hidden",
        bgcolor: "action.hover",
      }}
    >
      {mix > 0 &&
        segments.map((part) =>
          part.value > 0 ? (
            <Box
              key={part.key}
              sx={{
                flexGrow: part.value,
                bgcolor: part.color,
                minWidth: 2,
              }}
            />
          ) : null,
        )}
    </Box>
  );
}

export function QueueBar({ queue }: { queue: InspectorQueue }) {
  const t = useT();
  return (
    <MetricBar
      label={t("inspectorsPage.queued")}
      caption={queueCaption(queue)}
      value={queueFill(queue)}
      color={queueTone(queue)}
      tooltip={t("inspectorsPage.queuedHint")}
    />
  );
}

export function LatencyBar({ latency }: { latency: InspectorLatency }) {
  const t = useT();
  const shown: InspectorLatency = latency.known
    ? latency
    : { avgMs: 0, known: true };
  return (
    <MetricBar
      label={t("inspectorsPage.avgMs")}
      caption={latencyCaption(shown, t("fleetPage.ms"))}
      value={latencyFill(shown)}
      color={latencyTone(shown)}
      tooltip={t("inspectorsPage.avgMsHint")}
    />
  );
}

export interface HostBarsHost {
  cpu: { usage: number };
  memory: { used: number; total: number };
}

export function CpuBar({ host }: { host?: HostBarsHost }) {
  const t = useT();
  if (host === undefined) {
    return null;
  }
  return (
    <MetricBar
      label={t("fleetPage.cpu")}
      caption={formatCpu(host.cpu.usage)}
      value={host.cpu.usage}
    />
  );
}

export function MemBar({ host }: { host?: HostBarsHost }) {
  const t = useT();
  if (host === undefined) {
    return null;
  }
  const ram = host.memory.total === 0 ? 0 : host.memory.used / host.memory.total;
  return (
    <MetricBar
      label={t("fleetPage.memory")}
      caption={`${formatBytes(host.memory.used)} / ${formatBytes(host.memory.total)}`}
      value={ram}
    />
  );
}

export function HostBars({ host }: { host?: HostBarsHost }) {
  if (host === undefined) {
    return null;
  }
  return (
    <>
      <CpuBar host={host} />
      <MemBar host={host} />
    </>
  );
}

/**
 * Полоса в ячейке таблицы: значение подписью, трек под ним. Тот же язык, что
 * у плитки в теле карточки, — только без метки: её несёт шапка колонки.
 */
export function MiniBar({
  value,
  caption,
  color,
}: {
  value: number;
  caption: string;
  color?: "primary" | "success" | "warning" | "error";
}) {
  const clamped = clamp01(value);
  return (
    <Box sx={{ minWidth: 84 }}>
      <Typography
        component="div"
        variant="caption"
        color="text.secondary"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {caption}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={clamped * 100}
        color={color ?? barColor(clamped)}
        sx={{ height: 4, borderRadius: 1 }}
      />
    </Box>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function barColor(value: number): "primary" | "warning" | "error" {
  if (value >= 0.85) {
    return "error";
  }
  if (value >= 0.6) {
    return "warning";
  }
  return "primary";
}
