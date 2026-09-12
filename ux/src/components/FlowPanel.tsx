/*
 * Головной канал `io` в свёрнутой шапке карточки.
 *
 * Форма канала одна на все kind, поэтому и полоса одна. Карточка выбирает
 * канал, по которому её узнают: `archive` у агента, `insert` у логера, `cmd`
 * у Redis. Раскрытая карточка показывает все каналы лентой показателей —
 * см. `card/stats.ts`.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  formatBytesRate,
  formatMs,
  formatRps,
  pickFlow,
  type Flow,
  type FlowMap,
} from "../fleet.ts";
import { useT, type Translate } from "../i18n/index.ts";
import { ERR_COLOR, OK_COLOR, channelLabel } from "./card/stats.ts";
import { MetricBar } from "./MetricBar.tsx";

/** Полоса головного канала для свёрнутой шапки. Подробности — в тултипе. */
export function FlowBar({
  io,
  windowS,
  primary,
}: {
  io?: FlowMap;
  windowS?: number;
  primary: string;
}) {
  const t = useT();
  const picked = pickFlow(io, primary);

  if (picked === null || io === undefined) {
    return null;
  }

  const [name, flow] = picked;
  const err = flow.err ?? 0;

  return (
    <MetricBar
      label={channelLabel(name, t)}
      caption={`${formatRps(flow.ops)} ${t("fleetPage.ops")}`}
      segments={[
        { key: "ok", value: Math.max(0, flow.ops - err), color: OK_COLOR },
        { key: "err", value: err, color: ERR_COLOR },
      ]}
      tooltip={() => <FlowTooltip io={io} windowS={windowS} />}
      tooltipPlacement="left"
    />
  );
}

function FlowTooltip({ io, windowS }: { io: FlowMap; windowS?: number }) {
  const t = useT();

  return (
    <Stack spacing={1.25} sx={{ minWidth: 240 }}>
      <Typography variant="caption" color="text.secondary">
        {windowS !== undefined
          ? t("fleetPage.flowWindow", { n: windowS })
          : t("fleetPage.flow")}
      </Typography>
      {Object.entries(io).map(([name, flow]) => (
        <Box key={name}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
            <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
              {channelLabel(name, t)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatRps(flow.ops)} {t("fleetPage.ops")}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {tooltipDetail(flow, t)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

function tooltipDetail(flow: Flow, t: Translate): string {
  const parts: string[] = [];

  if (flow.in !== undefined) {
    parts.push(`${t("fleetPage.flowIn")} ${formatBytesRate(flow.in)}`);
  }
  if (flow.out !== undefined) {
    parts.push(`${t("fleetPage.flowOut")} ${formatBytesRate(flow.out)}`);
  }
  if (flow.p95_ms !== undefined) {
    parts.push(`p95 ${formatMs(flow.p95_ms)} ${t("fleetPage.ms")}`);
  }
  if ((flow.err ?? 0) > 0) {
    parts.push(`${t("fleetPage.flowErr")} ${formatRps(flow.err ?? 0)}`);
  }

  return parts.length === 0 ? t("fleetPage.flowIdle") : parts.join(" · ");
}
