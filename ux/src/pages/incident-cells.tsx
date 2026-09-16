import type { ReactElement, ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

import type { AuditSearchEvent } from "../api.ts";
import { sessionIdentity } from "../api.ts";
import { verdictColor } from "../audit.ts";
import {
  IpAddress,
  geoTagOf,
  useIpGeo,
  type GeoField,
} from "../components/ip-geo/index.ts";
import { formatMs } from "../fleet.ts";
import { useT } from "../i18n/index.ts";
import { inspectorName } from "../inspectors.ts";
import { InspectorRef, inspectorProfileOf } from "./incident-reason.tsx";

export type SeekField =
  | "ray"
  | "ip"
  | "phase"
  | "method"
  | "host"
  | "server"
  | "uri"
  | "route"
  | "status"
  | "verdict"
  | "inspector"
  | "user"
  | "marker"
  | "country"
  | "asn";

export type SeekValue = (field: SeekField, value: string) => void;

export interface SeekState {
  apply: SeekValue;
  active: Partial<Record<SeekField, string>>;
}

const CHIPS_SHOWN = 4;

const CHIP_SX = {
  minWidth: 0,
  "& .MuiChip-label": { minWidth: 0 },
} as const;

function isActive(seek: SeekState, field: SeekField, value: string): boolean {
  const current = seek.active[field] ?? "";
  return field === "route" || field === "server"
    ? current.split(",").includes(value)
    : current === value;
}

function hint(seek: SeekState, field: SeekField, value: string): string {
  return isActive(seek, field, value)
    ? "incidentsPage.seek.clear"
    : "incidentsPage.seek.apply";
}

export function Seekable({
  field,
  value,
  seek,
  children,
  sx,
}: {
  field: SeekField;
  value: string;
  seek: SeekState;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const t = useT();

  if (value === "") {
    return <>{children}</>;
  }

  const on = isActive(seek, field, value);

  return (
    <Box
      component="span"
      onClick={(e) => {
        e.stopPropagation();
        seek.apply(field, value);
      }}
      title={t(hint(seek, field, value))}
      sx={{
        display: "inline-block",
        boxSizing: "content-box",
        maxWidth: "100%",
        minWidth: 0,
        px: 0.5,
        mx: -0.5,
        borderRadius: "2px",
        cursor: "pointer",
        bgcolor: on ? "action.selected" : "transparent",
        "&:hover": { bgcolor: "action.hover" },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export function IpCell({
  value,
  seek,
  geoFields,
}: {
  value?: string;
  seek: SeekState;
  geoFields?: readonly GeoField[];
}) {
  const t = useT();

  if (value === undefined || value === "") {
    return <>—</>;
  }

  return (
    <IpAddress
      value={value}
      onSeek={() => {
        seek.apply("ip", value);
      }}
      seekHint={t(hint(seek, "ip", value))}
      seekActive={seek.active.ip === value}
      geoFields={geoFields}
      geoSeek={{
        apply: (field, geo) => {
          seek.apply(field, geo);
        },
        active: { country: seek.active.country, asn: seek.active.asn },
        hint: (on) =>
          t(on ? "incidentsPage.seek.clear" : "incidentsPage.seek.apply"),
      }}
    />
  );
}

const PHASES = ["request", "response", "frame", "session"];

export function phaseColor(phase: string): "default" | "info" | "secondary" {
  return phase === "response" ? "info" : phase === "frame" || phase === "session" ? "secondary" : "default";
}

export function PhaseChip({ phase, seek }: { phase: string; seek: SeekState }) {
  const t = useT();

  if (phase === "") {
    return <>—</>;
  }

  const known = PHASES.includes(phase);
  const chip = (
    <Chip
      size="small"
      variant="outlined"
      color={phaseColor(phase)}
      label={t(`incidentsPage.phaseValue.${phase}`)}
      clickable={known}
      onClick={
        known
          ? (e) => {
              e.stopPropagation();
              seek.apply("phase", phase);
            }
          : undefined
      }
    />
  );

  return known ? <SeekTip field="phase" value={phase} seek={seek}>{chip}</SeekTip> : chip;
}

function SeekTip({
  field,
  value,
  seek,
  children,
}: {
  field: SeekField;
  value: string;
  seek: SeekState;
  children: ReactElement;
}) {
  const t = useT();

  return (
    <Tooltip describeChild arrow placement="top" title={t(hint(seek, field, value))}>
      {children}
    </Tooltip>
  );
}

export function VerdictChip({
  verdict,
  seek,
}: {
  verdict: string;
  seek: SeekState;
}) {
  const known =
    verdict === "allow" || verdict === "deny" || verdict === "redirect";
  const chip = (
    <Chip
      size="small"
      variant="outlined"
      color={verdictColor(verdict)}
      label={verdict}
      clickable={known}
      onClick={
        known
          ? (e) => {
              e.stopPropagation();
              seek.apply("verdict", verdict);
            }
          : undefined
      }
    />
  );

  return known ? (
    <SeekTip field="verdict" value={verdict} seek={seek}>
      {chip}
    </SeekTip>
  ) : (
    chip
  );
}

export function StatusCell({
  row,
  seek,
}: {
  row: AuditSearchEvent;
  seek: SeekState;
}) {
  const t = useT();
  const ours = row.status > 0 ? String(row.status) : "—";
  const app = row.upstream_status ?? 0;

  if (app === 0 || app === row.status || row.status === 0) {
    const shown = app !== 0 ? String(app) : ours;
    return (
      <Seekable field="status" value={row.status > 0 ? ours : ""} seek={seek}>
        <Box component="span" sx={{ fontFamily: "monospace" }}>
          {shown}
        </Box>
      </Seekable>
    );
  }

  return (
    <Box component="span" sx={{ whiteSpace: "nowrap" }}>
      <Tooltip arrow title={t("incidentsPage.statusSplit")}>
        <Box component="span">
          <Seekable field="status" value={ours} seek={seek}>
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {ours}
            </Box>
          </Seekable>
        </Box>
      </Tooltip>
      <Box
        component="span"
        sx={{ color: "text.secondary", ml: 0.75, fontFamily: "monospace" }}
      >
        {`← ${String(app)}`}
      </Box>
    </Box>
  );
}

interface Part {
  raw: string;
  shown: string;
  state: string;
  verdict: string;
  score: number;
  latency?: number;
  role: string;
  profile: string;
  decisive: boolean;
}

function part(row: AuditSearchEvent, raw: string): Part {
  const score = row.inspectors_score[raw] ?? 0;

  return {
    raw,
    shown: inspectorName(raw),
    state: row.inspectors_state?.[raw] ?? "",
    verdict: row.inspectors_verdict[raw] ?? "",
    score,
    latency: row.inspectors_latency_ms?.[raw],
    role: row.inspectors_role?.[raw] ?? "",
    profile: inspectorProfileOf(row, raw),
    decisive: row.by === raw || row.by === inspectorName(raw),
  };
}

function chipLabel(item: Part): string {
  if (item.state !== "") {
    return `${item.shown}: ${item.state}`;
  }

  if (item.score > 0) {
    return `${item.shown}: ${String(item.score)}`;
  }

  if (item.verdict !== "" && item.verdict !== "allow") {
    return `${item.shown}: ${item.verdict}`;
  }

  return item.shown;
}

function chipTone(item: Part) {
  return item.state !== "" ? "warning" : verdictColor(item.verdict);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Box component="span" sx={{ color: "text.secondary" }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontFamily: "monospace" }}>
        {children}
      </Box>
    </>
  );
}

function ChipDetails({ item, seek }: { item: Part; seek: SeekState }) {
  const t = useT();

  return (
    <Box sx={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
      <Box sx={{ fontWeight: 600, mb: 0.5 }}>
        <InspectorRef name={item.raw} profile={item.profile} />
        {item.decisive && (
          <Box component="span" sx={{ ml: 0.75, color: "warning.main" }}>
            {t("incidentsPage.card.decisive")}
          </Box>
        )}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          columnGap: 1,
          rowGap: 0.25,
        }}
      >
        {item.state !== "" && (
          <Detail label={t("incidentsPage.chip.state")}>{item.state}</Detail>
        )}
        {item.verdict !== "" && (
          <Detail label={t("incidentsPage.chip.verdict")}>{item.verdict}</Detail>
        )}
        {item.score > 0 && (
          <Detail label={t("incidentsPage.chip.score")}>{String(item.score)}</Detail>
        )}
        {item.role !== "" && (
          <Detail label={t("incidentsPage.chip.role")}>{item.role}</Detail>
        )}
        {item.latency !== undefined && item.latency > 0 && (
          <Detail label={t("incidentsPage.chip.latency")}>
            {`${formatMs(item.latency)} ${t("incidentsPage.chip.ms")}`}
          </Detail>
        )}
      </Box>
      <Box sx={{ mt: 0.5, color: "text.secondary" }}>
        {t(hint(seek, "inspector", item.raw))}
      </Box>
    </Box>
  );
}

function InspectorChip({ item, seek }: { item: Part; seek: SeekState }) {
  return (
    <Tooltip arrow placement="top" title={<ChipDetails item={item} seek={seek} />}>
      <Chip
        size="small"
        variant={item.decisive ? "filled" : "outlined"}
        color={chipTone(item)}
        label={chipLabel(item)}
        clickable
        onClick={(e) => {
          e.stopPropagation();
          seek.apply("inspector", item.raw);
        }}
        sx={CHIP_SX}
      />
    </Tooltip>
  );
}

export function UserCell({ row, seek }: { row: AuditSearchEvent; seek: SeekState }) {
  const ids: string[] = [];
  const unverified = new Set<string>();

  for (const s of row.sessions ?? []) {
    const id = sessionIdentity(s);

    if (id === "") {
      continue;
    }

    if (!ids.includes(id)) {
      ids.push(id);
    }

    if (!s.verified) {
      unverified.add(id);
    }
  }

  if (ids.length === 0) {
    return <>—</>;
  }

  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 ? ", " : ""}
          <Seekable field="user" value={id} seek={seek}>
            {id}
            {unverified.has(id) ? "*" : ""}
          </Seekable>
        </span>
      ))}
    </>
  );
}

export function MarkerCell({ row, seek }: { row: AuditSearchEvent; seek: SeekState }) {
  const markers = row.markers ?? [];

  if (markers.length === 0) {
    return <>—</>;
  }

  return (
    <>
      {markers.map((marker, i) => (
        <span key={marker}>
          {i > 0 ? ", " : ""}
          <Seekable field="marker" value={marker} seek={seek}>
            {marker}
          </Seekable>
        </span>
      ))}
    </>
  );
}

export function GeoCell({
  row,
  field,
  seek,
}: {
  row: AuditSearchEvent;
  field: "country" | "asn";
  seek: SeekState;
}) {
  const geo = useIpGeo(row.client_ip ?? "");

  if (geo.status === "pending") {
    return null;
  }

  const tag = geoTagOf(geo, field);

  if (tag === undefined) {
    return <>—</>;
  }

  return (
    <Seekable field={field} value={tag.value} seek={seek}>
      {tag.label}
    </Seekable>
  );
}

export function InspectorChips({
  row,
  seek,
}: {
  row: AuditSearchEvent;
  seek: SeekState;
}) {
  const t = useT();
  const parts = row.inspectors.map((name) => part(row, name));

  if (parts.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  const shown = parts.slice(0, CHIPS_SHOWN);
  const rest = parts.slice(CHIPS_SHOWN);

  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: "center",
        flexWrap: "nowrap",
        overflow: "hidden",
        minWidth: 0,
        maxWidth: 280,
      }}
    >
      {shown.map((item) => (
        <InspectorChip key={item.raw} item={item} seek={seek} />
      ))}
      {rest.length > 0 && (
        <Tooltip
          arrow
          placement="top"
          title={
            <Box sx={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
              {rest.map((item) => (
                <Box key={item.raw} sx={{ fontFamily: "monospace" }}>
                  {chipLabel(item)}
                </Box>
              ))}
            </Box>
          }
        >
          <Chip
            size="small"
            variant="outlined"
            label={t("incidentsPage.chip.more", { count: rest.length })}
            sx={CHIP_SX}
          />
        </Tooltip>
      )}
    </Stack>
  );
}
