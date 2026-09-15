import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import type { AuditFinding } from "../api.ts";
import { IpAddress } from "../components/ip-geo/index.ts";
import { useT, type Translate } from "../i18n/index.ts";

export function IpFindings({ findings }: { findings: AuditFinding[] }) {
  const t = useT();
  const items = findings.filter((finding) => !finding.clean);

  if (items.length === 0) {
    return null;
  }

  return (
    <Box>
      {items.map((finding) => (
        <IpHit
          key={`${finding.phase}\u0000${finding.index}\u0000${finding.rule ?? ""}`}
          finding={finding}
          t={t}
        />
      ))}
    </Box>
  );
}

function IpHit({
  finding,
  t,
}: {
  finding: AuditFinding;
  t: Translate;
}) {
  const detail = ipDetail(finding);
  const tone = severityTone(finding.severity);
  const reason = reasonLabel(detail, t);
  const list = listLabel(detail);

  return (
    <Box
      sx={(theme) => ({
        mb: 0.85,
        px: 1.5,
        py: 1.15,
        borderRadius: 1,
        bgcolor: alpha(
          tone === "default"
            ? theme.palette.text.secondary
            : theme.palette[tone].main,
          theme.palette.mode === "dark" ? 0.1 : 0.07,
        ),
      })}
    >
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, minWidth: 0 }}
      >
        {finding.severity !== undefined && finding.severity !== "" && (
          <Chip
            size="small"
            variant="outlined"
            color={tone === "default" ? "default" : tone}
            label={finding.severity}
          />
        )}
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color: tone === "default" ? "text.secondary" : `${tone}.main` }}
        >
          {reason}
        </Typography>
        {list !== "" && (
          <Typography
            variant="caption"
            sx={{ color: "secondary.main", fontWeight: 600, fontFamily: "monospace" }}
          >
            {list}
          </Typography>
        )}
      </Stack>

      {detail.ip !== "" && (
        <Box sx={{ mt: 0.85 }}>
          <IpAddress value={detail.ip} />
        </Box>
      )}
    </Box>
  );
}

type IpDetail = {
  ip: string;
  list: string;
  match: string;
  geo: string;
  code: string;
};

function ipDetail(finding: AuditFinding): IpDetail {
  const engine = asRecord(finding.engine);
  const match = str(engine?.match);
  const list = str(engine?.list) || (finding.rule ?? "");
  const geo = str(engine?.geo);

  return {
    ip: finding.evidence ?? "",
    list,
    match: match || matchFromCode(finding.code),
    geo,
    code: finding.code ?? "",
  };
}

function matchFromCode(code: string | undefined): string {
  if (code === "ip-geo") {
    return "country";
  }
  if (code === "ip-unknown-profile") {
    return "unknown";
  }
  if (code === "ip-denylist") {
    return "list";
  }

  return "";
}

function reasonLabel(detail: IpDetail, t: Translate): string {
  const key =
    detail.code === "ip-unknown-profile"
      ? "unknown"
      : detail.match === "country"
        ? "geo"
        : detail.match === "inverse"
          ? "inverse"
          : "denylist";
  const text = t(`incidentsPage.card.ip.reason.${key}`);

  return text.startsWith("incidentsPage.") ? key : text;
}

function listLabel(detail: IpDetail): string {
  if (detail.code === "ip-unknown-profile") {
    return detail.list;
  }

  if (detail.list === "") {
    return detail.match === "country" ? detail.geo.toUpperCase() : "";
  }

  if (detail.match === "country" || /^[a-z]{2}$/i.test(detail.list)) {
    return detail.list.toUpperCase();
  }

  return detail.list;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }

  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return undefined;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type SeverityTone = "error" | "warning" | "info" | "success" | "default";

function severityTone(severity: string | undefined): SeverityTone {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      return "default";
  }
}
