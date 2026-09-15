import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import type { AuditFinding } from "../api.ts";
import { useT, type Translate } from "../i18n/index.ts";

export function ModsecFindings({ findings }: { findings: AuditFinding[] }) {
  const t = useT();
  const items = findings.filter((finding) => !finding.clean && hasFinding(finding));
  const attacks = items.filter((finding) => !isMeta(crsFamily(finding)));
  const meta = items.filter((finding) => isMeta(crsFamily(finding)));

  if (items.length === 0) {
    return null;
  }

  return (
    <Box>
      {attacks.map((finding) => (
        <AttackRow
          key={findingKey(finding)}
          finding={finding}
          t={t}
        />
      ))}
      {meta.length > 0 && (
        <Box sx={{ mt: attacks.length > 0 ? 0.75 : 0 }}>
          {meta.map((finding) => (
            <MetaRow key={findingKey(finding)} finding={finding} t={t} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function AttackRow({
  finding,
  t,
}: {
  finding: AuditFinding;
  t: Translate;
}) {
  const tone = severityTone(finding.severity);
  const family = crsFamily(finding);
  const quote = parseEvidence(finding.evidence);

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
      <FindingHead finding={finding} family={family} tone={tone} t={t} />
      <FindingMessage message={finding.message} />
      {quote !== null && (
        <EvidenceBody quote={quote} tone={tone} t={t} finding={finding} />
      )}
      <FindingTags tags={finding.tags} />
    </Box>
  );
}

function MetaRow({
  finding,
  t,
}: {
  finding: AuditFinding;
  t: Translate;
}) {
  return (
    <Box sx={{ py: 0.25, opacity: 0.72 }}>
      <FindingHead
        finding={finding}
        family={crsFamily(finding)}
        tone="default"
        t={t}
      />
      <FindingMessage message={finding.message} />
      <FindingTags tags={finding.tags} />
    </Box>
  );
}

function FindingMessage({ message }: { message: string | undefined }) {
  if (message === undefined || message === "") {
    return null;
  }

  return (
    <Typography variant="caption" sx={{ display: "block", mt: 0.4 }}>
      {message}
    </Typography>
  );
}

function FindingTags({ tags }: { tags: string[] | undefined }) {
  if (tags === undefined || tags.length === 0) {
    return null;
  }

  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.6 }}>
      {tags.map((tag) => (
        <Chip key={tag} size="small" variant="outlined" label={tag} sx={{ fontFamily: "monospace" }} />
      ))}
    </Stack>
  );
}

function FindingHead({
  finding,
  family,
  tone,
  t,
}: {
  finding: AuditFinding;
  family: CrsFamily;
  tone: SeverityTone;
  t: Translate;
}) {
  const rule = finding.rule || stripCrsPrefix(finding.code);

  return (
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
        {t(`incidentsPage.card.modsec.family.${family}`)}
      </Typography>
      {rule !== "" && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "monospace" }}
        >
          #{rule}
        </Typography>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontFamily: "monospace" }}
      >
        {targetLabel(finding.target, t)}
      </Typography>
    </Stack>
  );
}

function EvidenceBody({
  quote,
  tone,
  t,
  finding,
}: {
  quote: EvidenceQuote;
  tone: SeverityTone;
  t: Translate;
  finding: AuditFinding;
}) {
  const place = quote.place || targetLabel(finding.target, t);
  const span =
    (finding.length ?? 0) > 0
      ? t("incidentsPage.card.modsec.span", {
          offset: finding.offset ?? 0,
          length: finding.length ?? 0,
        })
      : "";

  return (
    <Box sx={{ mt: 0.7 }}>
      {(quote.what !== "" || place !== "" || span !== "") && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: quote.payload !== "" || quote.raw !== "" ? 0.4 : 0 }}
        >
          {[quote.what, place !== "" ? t("incidentsPage.card.modsec.foundIn", { place }) : "", span]
            .filter((part) => part !== "")
            .join(" · ")}
        </Typography>
      )}
      {(quote.payload !== "" || quote.raw !== "") && (
        <Typography
          component="pre"
          variant="caption"
          sx={{
            m: 0,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {quote.payload !== ""
            ? highlight(quote.payload, quote.what, tone)
            : quote.raw}
        </Typography>
      )}
    </Box>
  );
}

function highlight(payload: string, needle: string, tone: SeverityTone) {
  if (needle === "" || needle === payload) {
    return payload;
  }

  const at = payload.indexOf(needle);
  if (at < 0) {
    return payload;
  }

  return (
    <>
      {payload.slice(0, at)}
      <Box
        component="mark"
        sx={(theme) => ({
          color: "inherit",
          backgroundColor: alpha(
            tone === "default"
              ? theme.palette.warning.main
              : theme.palette[tone].main,
            theme.palette.mode === "dark" ? 0.35 : 0.22,
          ),
          padding: 0,
        })}
      >
        {payload.slice(at, at + needle.length)}
      </Box>
      {payload.slice(at + needle.length)}
    </>
  );
}

type SeverityTone = "error" | "warning" | "info" | "success" | "default";

type CrsFamily =
  | "init"
  | "exceptions"
  | "method"
  | "scanner"
  | "protocol"
  | "protocolAttack"
  | "multipart"
  | "lfi"
  | "rfi"
  | "rce"
  | "php"
  | "generic"
  | "xss"
  | "sqli"
  | "session"
  | "java"
  | "inbound"
  | "leak"
  | "sqlError"
  | "javaError"
  | "phpError"
  | "iisError"
  | "nodeError"
  | "outbound"
  | "correlation"
  | "rule";

type EvidenceQuote = {
  what: string;
  place: string;
  payload: string;
  raw: string;
};

const META_FAMILIES = new Set<CrsFamily>([
  "init",
  "exceptions",
  "inbound",
  "outbound",
  "correlation",
]);

const CRS_SERIES: Record<number, CrsFamily> = {
  901: "init",
  905: "exceptions",
  911: "method",
  913: "scanner",
  920: "protocol",
  921: "protocolAttack",
  922: "multipart",
  930: "lfi",
  931: "rfi",
  932: "rce",
  933: "php",
  934: "generic",
  941: "xss",
  942: "sqli",
  943: "session",
  944: "java",
  949: "inbound",
  950: "leak",
  951: "sqlError",
  952: "javaError",
  953: "phpError",
  954: "iisError",
  955: "nodeError",
  959: "outbound",
  980: "correlation",
};

const MATCHED =
  /^(?:Matched Data:\s*)?(.+?)\s+found within\s+(.+?)(?::\s(.*))?$/s;

function parseEvidence(evidence: string | undefined): EvidenceQuote | null {
  if (evidence === undefined || evidence === "") {
    return null;
  }

  const text = evidence.replace(/^Matched Data:\s*/i, "");
  const match = MATCHED.exec(evidence);

  if (match === null) {
    return { what: "", place: "", payload: "", raw: text };
  }

  return {
    what: match[1]?.trim() ?? "",
    place: match[2]?.trim() ?? "",
    payload: match[3]?.trim() ?? "",
    raw: text,
  };
}

function crsFamily(finding: AuditFinding): CrsFamily {
  const id = ruleNumber(finding.rule || finding.code);
  if (id === 0) {
    return "rule";
  }

  return CRS_SERIES[Math.floor(id / 1000)] ?? "rule";
}

function isMeta(family: CrsFamily): boolean {
  return META_FAMILIES.has(family);
}

function ruleNumber(value: string | undefined): number {
  if (value === undefined || value === "") {
    return 0;
  }

  const digits = value.replace(/\D/g, "");
  if (digits === "") {
    return 0;
  }

  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function stripCrsPrefix(code: string | undefined): string {
  if (code === undefined) {
    return "";
  }

  return code.startsWith("crs-") ? code.slice(4) : code;
}

function hasFinding(finding: AuditFinding): boolean {
  return (
    (finding.code !== undefined && finding.code !== "") ||
    (finding.rule !== undefined && finding.rule !== "") ||
    (finding.evidence !== undefined && finding.evidence !== "")
  );
}

function findingKey(finding: AuditFinding): string {
  return `${finding.phase}\u0000${finding.index}\u0000${finding.rule ?? ""}`;
}

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

function targetLabel(target: string | undefined, t: Translate): string {
  if (target === undefined || target === "") {
    return "";
  }

  if (target.startsWith("header:")) {
    return t("incidentsPage.card.modsec.header", { name: target.slice(7) });
  }

  if (target.startsWith("cookie:")) {
    return t("incidentsPage.card.modsec.cookie", { name: target.slice(7) });
  }

  const key = `incidentsPage.card.modsec.target.${target}`;
  const text = t(key);

  return text === key ? target : text;
}
