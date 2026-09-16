import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { formatRps } from "../fleet.ts";
import { useT } from "../i18n/index.ts";
import { ZERO_CODES, type Traffic } from "../traffic.ts";
import { CODE_PARTS } from "./card/stats.ts";
import { MetricBar } from "./MetricBar.tsx";

export function TrafficBar({
  traffic,
  live,
}: {
  traffic: Traffic | undefined;
  live: boolean;
}) {
  const t = useT();

  if (!live) {
    return (
      <Typography variant="caption" color="text.secondary">
        {t("common.none")}
      </Typography>
    );
  }

  const codes = traffic?.codes ?? ZERO_CODES;
  const rps = traffic?.rps ?? 0;
  const mix = CODE_PARTS.reduce((sum, part) => sum + codes[part.key], 0);

  return (
    <MetricBar
      label=""
      caption={`${formatRps(rps)} ${t("fleetPage.rps")}`}
      segments={CODE_PARTS.map((part) => ({
        key: part.key,
        value: codes[part.key],
        color: part.color,
      }))}
      tooltip={() => (
        <Stack spacing={0.5}>
          {CODE_PARTS.map((part) => (
            <Stack
              key={part.key}
              direction="row"
              spacing={1}
              sx={{ alignItems: "center" }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "2px",
                  bgcolor: part.color,
                  flex: "0 0 auto",
                }}
              />
              <Typography variant="caption" sx={{ minWidth: 32 }}>
                {t(`fleetPage.${part.label}`)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatRps(codes[part.key])}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {mix > 0 ? `${Math.round((codes[part.key] / mix) * 100)}%` : "0%"}
              </Typography>
            </Stack>
          ))}
          <Typography variant="caption" color="text.secondary">
            {traffic === undefined
              ? t("fleetPage.routeSilent")
              : t("fleetPage.routeNodes", { n: traffic.nodes })}
          </Typography>
        </Stack>
      )}
    />
  );
}
