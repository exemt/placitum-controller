import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";

function escapeEntity(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function evalExpr(expr: string, vars: Record<string, string>): boolean {
  const bare = /^\s*\$(\w+)\s*$/.exec(expr);
  if (bare !== null) {
    return (vars[bare[1]] ?? "") !== "";
  }

  const cmp = /^\s*\$(\w+)\s*(!=|=)\s*(\S*)\s*$/.exec(expr);
  if (cmp === null) {
    return false;
  }
  const left = vars[cmp[1]] ?? "";
  return cmp[2] === "=" ? left === cmp[3] : left !== cmp[3];
}

export function renderSsi(src: string, vars: Record<string, string>): string {
  const out: string[] = [];
  const stack: { taken: boolean; on: boolean }[] = [];
  const active = () => stack.every((f) => f.on);
  const re = /<!--#\s*(\w+)([^]*?)-->/g;

  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    if (active()) {
      out.push(src.slice(last, m.index));
    }
    last = re.lastIndex;
    const [, cmd, rawArgs] = m;

    if (cmd === "if") {
      const on = evalExpr(/expr="([^"]*)"/.exec(rawArgs)?.[1] ?? "", vars);
      stack.push({ taken: on, on });
    } else if (cmd === "elif") {
      const f = stack[stack.length - 1];
      if (f !== undefined) {
        const on = !f.taken && evalExpr(/expr="([^"]*)"/.exec(rawArgs)?.[1] ?? "", vars);
        f.on = on;
        f.taken ||= on;
      }
    } else if (cmd === "else") {
      const f = stack[stack.length - 1];
      if (f !== undefined) {
        f.on = !f.taken;
        f.taken = true;
      }
    } else if (cmd === "endif") {
      stack.pop();
    } else if (cmd === "echo" && active()) {
      const name = /var=["']([^"']*)["']/.exec(rawArgs)?.[1] ?? "";
      const def = /default=["']([^"']*)["']/.exec(rawArgs)?.[1] ?? "(none)";
      const value = vars[name];
      out.push(value === undefined || value === "" ? def : escapeEntity(value));
    }
  }
  out.push(src.slice(last));
  return out.join("");
}

const BASE = {
  waf_deny_ray: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  waf_deny_addr: "203.0.113.47",
};

const SCENARIOS: { id: string; vars: Record<string, string> }[] = [
  { id: "network", vars: { ...BASE, waf_deny_scope: "network", waf_deny_subject: "203.0.113.0/24", waf_deny_retry: "600" } },
  { id: "address", vars: { ...BASE, waf_deny_scope: "address", waf_deny_subject: "203.0.113.47" } },
  { id: "country", vars: { ...BASE, waf_deny_scope: "country" } },
  { id: "asn", vars: { ...BASE, waf_deny_scope: "asn", waf_deny_subject: "AS64496" } },
  { id: "retry", vars: { ...BASE, waf_deny_retry: "60" } },
  { id: "silent", vars: {} },
];

export function PagePreviewDialog({
  name,
  typeName,
  body,
  onClose,
}: {
  name: string;
  typeName: string;
  body: string;
  onClose: () => void;
}) {
  const t = useT();
  const [scenario, setScenario] = useState("network");

  const rendered = useMemo(() => {
    const found = SCENARIOS.find((s) => s.id === scenario) ?? SCENARIOS[0];
    return renderSsi(body, found.vars);
  }, [body, scenario]);

  const html = typeName === "html";
  const jsonError = useMemo(() => {
    if (typeName !== "json") {
      return null;
    }
    try {
      JSON.parse(rendered);
      return null;
    } catch (err: unknown) {
      return String(err);
    }
  }, [rendered, typeName]);

  return (
    <Modal
      onClose={onClose}
      title={t("datasets.previewTitle")}
      label={name}
      hint={t("datasets.previewHint")}
      size="md"
      scroll={false}
      actions={<Modal.Close />}
    >
      <Stack spacing={1.5} sx={{ minHeight: 0, flex: 1 }}>
        <Stack direction="row" spacing={1.5}>
          <TextField
            select
            size="small"
            label={t("datasets.previewScenario")}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            sx={{ width: 260, flexShrink: 0 }}
          >
            {SCENARIOS.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {t(`datasets.previewCase.${s.id}`)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {jsonError !== null && (
          <Alert severity="error">{t("datasets.previewJsonBad")}</Alert>
        )}

        {html ? (
          <Box
            component="iframe"
            title={name}
            sandbox=""
            srcDoc={rendered}
            sx={{
              width: "100%",
              flex: 1,
              minHeight: 480,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.paper",
            }}
          />
        ) : (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              flex: 1,
              minHeight: 300,
              overflow: "auto",
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {rendered}
          </Box>
        )}
      </Stack>
    </Modal>
  );
}
