import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { AuditFinding, AuditParticipant } from "../api.ts";
import { ModsecFindings } from "./incident-modsec.tsx";
import { IpFindings } from "./incident-ip.tsx";

export function InspectorFindings({ item }: { item: AuditParticipant }) {
  const findings = item.findings ?? [];

  switch (findingsKind(item.name)) {
    case "modsec":
      return <ModsecFindings findings={findings} />;
    case "ip":
      return <IpFindings findings={findings} />;
    case "vlai":
      return <VlaiFindings findings={findings} />;
    default:
      return <DefaultFindings findings={findings} />;
  }
}

type FindingsKind = "modsec" | "ip" | "vlai" | "other";

function findingsKind(name: string): FindingsKind {
  const n = name.toLowerCase();

  if (n === "crs" || n.startsWith("crs-") || n === "modsec" || n.startsWith("modsec")) {
    return "modsec";
  }
  if (n === "ip" || n.startsWith("ip-")) {
    return "ip";
  }
  if (
    n === "vlai" ||
    n === "ai" ||
    n === "model" ||
    n.startsWith("vlai") ||
    n.startsWith("ai-") ||
    n.startsWith("model")
  ) {
    return "vlai";
  }

  return "other";
}

function VlaiFindings({ findings }: { findings: AuditFinding[] }) {
  return <FindingsList findings={findings} />;
}

function DefaultFindings({ findings }: { findings: AuditFinding[] }) {
  return <FindingsList findings={findings} />;
}

function FindingsList({ findings }: { findings: AuditFinding[] }) {
  return (
    <>
      {findings.map((finding) => (
        <FindingLine
          key={`${finding.phase}\u0000${finding.index}\u0000${finding.rule ?? ""}`}
          finding={finding}
        />
      ))}
    </>
  );
}

function FindingLine({ finding }: { finding: AuditFinding }) {
  const head = [
    finding.severity,
    finding.code,
    finding.rule !== undefined && finding.rule !== "" ? `#${finding.rule}` : undefined,
    finding.target,
    finding.confidence !== undefined && finding.confidence > 0
      ? finding.confidence.toFixed(2)
      : undefined,
  ].filter((item): item is string => item !== undefined && item !== "");

  return (
    <Box sx={{ py: 0.25, mb: 0.5 }}>
      <Typography variant="caption" sx={{ display: "block", fontFamily: "monospace" }}>
        {head.join(" · ")}
      </Typography>
      {finding.evidence !== undefined && finding.evidence !== "" && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", fontFamily: "monospace", wordBreak: "break-all" }}
        >
          {finding.evidence}
        </Typography>
      )}
      {finding.engine !== undefined && finding.engine !== null && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", fontFamily: "monospace", wordBreak: "break-all" }}
        >
          {JSON.stringify(finding.engine)}
        </Typography>
      )}
    </Box>
  );
}
