import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import {
  LOAD_IP_POOLS,
  LOAD_META_TAGS,
  LOAD_METHODS,
  LOAD_SIZE_TAGS,
  fetchLoad,
  fetchLoadCases,
  startLoad,
  type LoadBus,
  type LoadCase,
  type LoadHeader,
  type LoadLimits,
  type LoadPlan,
  type LoadRun,
  type LoadSizes,
  type LoadStepPlan,
  type LoadStepResult,
  type LoadWaf,
} from "../api.ts";
import { Section } from "../components/fields.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";

/*
 * Страница генератора: кейсы e2e (tests/load/cases.mjs) сверху, форма
 * запроса и ступени ниже. Клик по кейсу выставляет форму целиком; дальше её
 * можно править -- прогон всё равно помнит, с какого кейса начался, и судит
 * ступени его порогами.
 */

const STORAGE_KEY = "waf.load.plan.v3";
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;

/* Пределы генератора; свежие приезжают с состоянием прогона (run.limits). */
const FALLBACK_LIMITS: LoadLimits = {
  max_steps: 10,
  min_rate: 1,
  max_rate: 20000,
  min_duration_s: 1,
  max_duration_s: 120,
  max_total_s: 600,
  max_headers: 32,
  max_body: 64 * 1024,
  ip_pools: [...LOAD_IP_POOLS],
  size_tags: [...LOAD_SIZE_TAGS],
  meta_tags: [...LOAD_META_TAGS],
};

const SIZE_LABEL: Record<string, string> = {
  "1k": "1 KB",
  "8k": "8 KB",
  "64k": "64 KB",
  "256k": "256 KB",
  "1m": "1 MB",
};

type DraftStep = { rate: string; duration_s: string };

type Draft = {
  caseId: string | null;
  host: string;
  method: string;
  path: string;
  /** Строки `Имя: значение`. */
  headers: string;
  body: string;
  expect: string;
  randomIp: string;
  unique: boolean;
  sizes: LoadSizes;
  steps: DraftStep[];
  ladder: { start: string; factor: string; count: string; duration_s: string };
};

function defaultDraft(): Draft {
  return {
    caseId: null,
    host: "shop.waf.test",
    method: "GET",
    path: "/",
    headers: "",
    body: "",
    expect: "200",
    randomIp: "",
    unique: true,
    sizes: { body: ["orig"], headers: ["orig"], args: ["orig"] },
    steps: [
      { rate: "100", duration_s: "10" },
      { rate: "300", duration_s: "10" },
      { rate: "1000", duration_s: "10" },
    ],
    ladder: { start: "100", factor: "1.5", count: "6", duration_s: "10" },
  };
}

function hasBody(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH";
}

function headersText(rows: LoadHeader[]): string {
  return rows.map((row) => `${row.name}: ${row.value}`).join("\n");
}

function parseHeaders(text: string): LoadHeader[] | null {
  const out: LoadHeader[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      return null;
    }
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!HEADER_NAME.test(name)) {
      return null;
    }
    out.push({ name, value });
  }
  return out;
}

function fromCase(row: LoadCase, prev: Draft): Draft {
  const tr = row.traffic;
  return {
    ...prev,
    caseId: row.id,
    host: tr.host,
    method: tr.method,
    path: tr.path,
    headers: headersText(tr.headers ?? []),
    body: tr.body ?? "",
    expect: String(tr.expect ?? 200),
    randomIp: tr.flags?.random_ip ?? "",
    unique: tr.flags?.unique ?? false,
    sizes: {
      body: tr.sizes?.body ?? ["orig"],
      headers: tr.sizes?.headers ?? ["orig"],
      args: tr.sizes?.args ?? ["orig"],
    },
    steps: (tr.steps ?? []).map((s) => ({ rate: String(s.rate), duration_s: String(s.duration_s) })),
  };
}

function readDraft(): Draft {
  const base = defaultDraft();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return base;
    }
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.map((row) => ({
          rate: String(row?.rate ?? ""),
          duration_s: String(row?.duration_s ?? ""),
        }))
      : base.steps;
    return {
      caseId: typeof parsed.caseId === "string" ? parsed.caseId : null,
      host: typeof parsed.host === "string" ? parsed.host : base.host,
      method: typeof parsed.method === "string" ? parsed.method : base.method,
      path: typeof parsed.path === "string" ? parsed.path : base.path,
      headers: typeof parsed.headers === "string" ? parsed.headers : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      expect: typeof parsed.expect === "string" ? parsed.expect : base.expect,
      randomIp: typeof parsed.randomIp === "string" ? parsed.randomIp : "",
      unique: parsed.unique === true,
      sizes: {
        body: tags(parsed.sizes?.body, base.sizes.body),
        headers: tags(parsed.sizes?.headers, base.sizes.headers),
        args: tags(parsed.sizes?.args, base.sizes.args),
      },
      steps: steps.length > 0 ? steps : base.steps,
      ladder: { ...base.ladder, ...(parsed.ladder ?? {}) },
    };
  } catch {
    return base;
  }
}

function tags(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) {
    return fallback;
  }
  return raw.filter((tag): tag is string => typeof tag === "string");
}

function parsePlan(draft: Draft, limits: LoadLimits): LoadPlan | null {
  const host = draft.host.trim();
  if (host === "" || !/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) {
    return null;
  }
  const path = draft.path.trim();
  if (!path.startsWith("/") || /\s/.test(path)) {
    return null;
  }
  const headers = parseHeaders(draft.headers);
  if (headers === null || headers.length > limits.max_headers) {
    return null;
  }
  const expect = Number(draft.expect);
  if (!Number.isInteger(expect) || expect < 100 || expect > 599) {
    return null;
  }
  if (new TextEncoder().encode(draft.body).length > limits.max_body) {
    return null;
  }
  if (draft.randomIp !== "" && !limits.ip_pools.includes(draft.randomIp)) {
    return null;
  }
  if (draft.steps.length < 1 || draft.steps.length > limits.max_steps) {
    return null;
  }
  const steps: LoadStepPlan[] = [];
  let total = 0;
  for (const row of draft.steps) {
    const rate = Number(row.rate);
    const duration_s = Number(row.duration_s);
    if (
      !Number.isInteger(rate) ||
      rate < limits.min_rate ||
      rate > limits.max_rate ||
      !Number.isInteger(duration_s) ||
      duration_s < limits.min_duration_s ||
      duration_s > limits.max_duration_s
    ) {
      return null;
    }
    total += duration_s;
    steps.push({ rate, duration_s });
  }
  if (total > limits.max_total_s) {
    return null;
  }
  const sizeOk = (list: string[], allowed: string[]) => list.filter((tag) => allowed.includes(tag));
  return {
    case: draft.caseId,
    target: { host, method: draft.method, path, headers, body: hasBody(draft.method) ? draft.body : "", expect },
    flags: { random_ip: draft.randomIp, unique: draft.unique },
    sizes: {
      body: sizeOk(draft.sizes.body, limits.size_tags),
      headers: sizeOk(draft.sizes.headers, limits.meta_tags),
      args: sizeOk(draft.sizes.args, limits.meta_tags),
    },
    steps,
  };
}

function ladderSteps(ladder: Draft["ladder"], limits: LoadLimits): DraftStep[] | null {
  const start = Number(ladder.start);
  const factor = Number(ladder.factor);
  const count = Number(ladder.count);
  const duration_s = Number(ladder.duration_s);
  if (
    !Number.isInteger(start) ||
    start < limits.min_rate ||
    !Number.isFinite(factor) ||
    factor <= 1 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > limits.max_steps ||
    !Number.isInteger(duration_s) ||
    duration_s < limits.min_duration_s
  ) {
    return null;
  }
  const out: DraftStep[] = [];
  let rate = start;
  for (let i = 0; i < count; i += 1) {
    out.push({ rate: String(Math.round(rate)), duration_s: String(duration_s) });
    rate *= factor;
  }
  return out;
}

function activeStepIndex(steps: LoadStepPlan[], elapsed: number): number {
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    t += steps[i].duration_s;
    if (elapsed < t) {
      return i;
    }
  }
  return Math.max(0, steps.length - 1);
}

function plannedOf(steps: LoadStepPlan[]): number {
  return steps.reduce((sum, row) => sum + row.rate * row.duration_s, 0);
}

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) {
    return "—";
  }
  return Math.round(n).toLocaleString("ru-RU");
}

function fmtRate(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) {
    return "—";
  }
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1);
}

function fmtMs(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) {
    return "—";
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(2)} s`;
  }
  if (n >= 100) {
    return `${Math.round(n)} ms`;
  }
  return `${n.toFixed(1)} ms`;
}

function fmtPct(part: number, whole: number): string {
  if (whole <= 0) {
    return "—";
  }
  const pct = (part / whole) * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}

function sumOf(counts: Record<string, number> | undefined): number {
  return Object.values(counts ?? {}).reduce((s, n) => s + n, 0);
}

function pipelineOf(row: LoadCase): string {
  const refs = row.route.waf?.requestInspectors;
  if (!Array.isArray(refs) || refs.length === 0) {
    return "—";
  }
  const waves = new Set(refs.map((ref) => ref.wave ?? 0)).size;
  return `${refs.length} × ${waves}`;
}

function stepsOf(steps: LoadStepPlan[]): string {
  if (steps.length === 0) {
    return "—";
  }
  const first = steps[0];
  const last = steps[steps.length - 1];
  return steps.length === 1 ? `${first.rate}` : `${first.rate} → ${last.rate} (${steps.length})`;
}

export default function Traffic() {
  const t = useT();
  const [run, setRun] = useState<LoadRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<LoadCase[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState<Draft>(readDraft);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const pull = () => {
    void fetchLoad()
      .then((row) => {
        setRun(row);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const pullCases = () => {
    void fetchLoadCases()
      .then((reply) => {
        setCases(reply.cases);
        setCasesError(reply.error);
      })
      .catch((err: unknown) => {
        setCasesError(err instanceof Error ? err.message : String(err));
      });
  };

  useEffect(() => {
    let stop = false;
    const tick = () => {
      void fetchLoad()
        .then((row) => {
          if (!stop) {
            setRun(row);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!stop) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
    };
    tick();
    pullCases();
    const id = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (run?.status !== "running") {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [run?.status]);

  usePageBar({
    onUpdate: () => {
      pull();
      pullCases();
    },
  });

  const limits = run?.limits ?? FALLBACK_LIMITS;
  const running = run?.status === "running";
  const disabled = run?.status === "disabled" || run === null;
  const locked = disabled || running;
  const plan = useMemo(() => parsePlan(draft, limits), [draft, limits]);
  const selected = cases.find((row) => row.id === draft.caseId) ?? null;
  const runSteps = run?.plan?.steps ?? [];
  const elapsed =
    running && run.started_at !== undefined ? Math.max(0, (now - Date.parse(run.started_at)) / 1000) : 0;
  const totalS = runSteps.reduce((sum, row) => sum + row.duration_s, 0);
  const activeIndex = running && runSteps.length > 0 ? activeStepIndex(runSteps, elapsed) : -1;
  const progress = running && totalS > 0 ? Math.min(100, (elapsed / totalS) * 100) : 0;
  const runCase = run?.plan?.case ? cases.find((row) => row.id === run.plan?.case) ?? null : null;
  const bodyOn = hasBody(draft.method);

  const patch = (next: Partial<Draft>) => setDraft({ ...draft, ...next });

  return (
    <Stack spacing={2}>
      <Typography sx={{ color: "text.secondary" }}>{t("traffic.blurb")}</Typography>
      {run?.runner === "host" && (
        <Chip
          size="small"
          color="success"
          variant="outlined"
          title={t("traffic.runnerHostHint")}
          label={`${t("traffic.runnerHost")} · ${run.target ?? ""}`}
          sx={{ alignSelf: "flex-start" }}
        />
      )}
      {run?.runner === "docker" && run.status !== "disabled" && (
        <Chip
          size="small"
          variant="outlined"
          label={`${t("traffic.runnerDocker")} · ${run.target ?? ""}`}
          sx={{ alignSelf: "flex-start" }}
        />
      )}

      {error !== null && <Alert severity="error">{error}</Alert>}
      {run?.status === "disabled" && <Alert severity="info">{t("traffic.disabled")}</Alert>}
      {run?.status === "error" && <Alert severity="warning">{t("traffic.failed")}</Alert>}

      <Section title={t("traffic.cases")} hint={t("traffic.casesHint")} defaultExpanded flush>
        {casesError !== null && (
          <Alert severity="warning" sx={{ m: 2 }}>
            {t("traffic.casesError")} {casesError}
          </Alert>
        )}
        {cases.length === 0 && casesError === null && (
          <Typography variant="body2" sx={{ color: "text.secondary", p: 2 }}>
            {t("traffic.casesEmpty")}
          </Typography>
        )}
        {cases.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("traffic.caseSection")}</TableCell>
                <TableCell>{t("traffic.caseTitle")}</TableCell>
                <TableCell>{t("traffic.caseRoute")}</TableCell>
                <TableCell align="right" title={t("traffic.casePipelineHint")}>
                  {t("traffic.casePipeline")}
                </TableCell>
                <TableCell align="right">{t("traffic.caseSteps")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.map((row) => {
                const on = row.id === draft.caseId;
                return (
                  <TableRow
                    key={row.id}
                    hover
                    selected={on}
                    onClick={() => {
                      if (!locked) {
                        setDraft(fromCase(row, draft));
                      }
                    }}
                    sx={{ cursor: locked ? "default" : "pointer" }}
                  >
                    <TableCell>
                      <Chip size="small" variant="outlined" label={t(`traffic.section.${row.section}`)} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.title}</Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {row.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <code>{row.route.path}</code>
                    </TableCell>
                    <TableCell align="right">{pipelineOf(row)}</TableCell>
                    <TableCell align="right">{stepsOf(row.traffic.steps ?? [])}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {selected !== null && (
          <Box sx={{ p: 2, pt: 1.5 }}>
            <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
              {selected.about}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
              {t("traffic.caseFixture")} <code>node tests/load/stand.mjs {selected.id}</code>
            </Typography>
          </Box>
        )}
      </Section>

      <Section title={t("traffic.request")} hint={t("traffic.requestHint")} defaultExpanded>
        {draft.caseId !== null && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`${t("traffic.caseOf")} ${draft.caseId}`}
              onDelete={locked ? undefined : () => patch({ caseId: null })}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("traffic.caseOfHint")}
            </Typography>
          </Stack>
        )}
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <TextField
            size="small"
            label={t("traffic.host")}
            value={draft.host}
            disabled={locked}
            onChange={(e) => patch({ host: e.target.value })}
            sx={{ width: 220 }}
          />
          <TextField
            size="small"
            select
            label={t("traffic.method")}
            value={draft.method}
            disabled={locked}
            onChange={(e) => patch({ method: e.target.value })}
            sx={{ width: 130 }}
          >
            {LOAD_METHODS.map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={t("traffic.path")}
            value={draft.path}
            disabled={locked}
            onChange={(e) => patch({ path: e.target.value })}
            sx={{ flexGrow: 1, minWidth: 260 }}
          />
          <TextField
            size="small"
            type="number"
            label={t("traffic.expect")}
            title={t("traffic.expectHint")}
            value={draft.expect}
            disabled={locked}
            onChange={(e) => patch({ expect: e.target.value })}
            slotProps={{ htmlInput: { min: 100, max: 599 } }}
            sx={{ width: 130 }}
          />
        </Stack>
        <TextField
          size="small"
          multiline
          minRows={2}
          label={t("traffic.headers")}
          helperText={t("traffic.headersHint")}
          value={draft.headers}
          disabled={locked}
          onChange={(e) => patch({ headers: e.target.value })}
          slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "monospace" } } }}
        />
        {bodyOn && (
          <TextField
            size="small"
            multiline
            minRows={3}
            label={t("traffic.body")}
            helperText={t("traffic.bodyHint")}
            value={draft.body}
            disabled={locked}
            onChange={(e) => patch({ body: e.target.value })}
            slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "monospace" } } }}
          />
        )}

        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("traffic.randomIp")}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {t("traffic.randomIpHint")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip
              label={t("traffic.ipFixed")}
              color={draft.randomIp === "" ? "primary" : "default"}
              variant={draft.randomIp === "" ? "filled" : "outlined"}
              disabled={locked}
              onClick={() => patch({ randomIp: "" })}
            />
            {limits.ip_pools.map((pool) => (
              <Chip
                key={pool}
                label={t(`traffic.ipPool.${pool}`)}
                title={t(`traffic.ipPoolHint.${pool}`)}
                color={draft.randomIp === pool ? "primary" : "default"}
                variant={draft.randomIp === pool ? "filled" : "outlined"}
                disabled={locked}
                onClick={() => patch({ randomIp: pool })}
              />
            ))}
          </Stack>
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("traffic.flags")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip
              label={t("traffic.unique")}
              title={t("traffic.uniqueHint")}
              color={draft.unique ? "primary" : "default"}
              variant={draft.unique ? "filled" : "outlined"}
              disabled={locked}
              onClick={() => patch({ unique: !draft.unique })}
            />
          </Stack>
        </Stack>

        {bodyOn && (
          <ChipRow
            title={t("traffic.bodiesSize")}
            hint={t("traffic.bodiesSizeHint")}
            options={sizeOptions(t, limits.size_tags)}
            selected={draft.sizes.body}
            locked={locked}
            onToggle={(tag, on) =>
              patch({ sizes: { ...draft.sizes, body: toggle(draft.sizes.body, tag, on) } })
            }
          />
        )}
        <ChipRow
          title={t("traffic.headersSize")}
          hint={t("traffic.headersSizeHint")}
          options={sizeOptions(t, limits.meta_tags)}
          selected={draft.sizes.headers}
          locked={locked}
          onToggle={(tag, on) =>
            patch({ sizes: { ...draft.sizes, headers: toggle(draft.sizes.headers, tag, on) } })
          }
        />
        <ChipRow
          title={t("traffic.argsSize")}
          hint={t("traffic.argsSizeHint")}
          options={sizeOptions(t, limits.meta_tags)}
          selected={draft.sizes.args}
          locked={locked}
          onToggle={(tag, on) =>
            patch({ sizes: { ...draft.sizes, args: toggle(draft.sizes.args, tag, on) } })
          }
        />
      </Section>

      <Section title={t("traffic.steps")} hint={t("traffic.stepsHint")} defaultExpanded>
        {draft.steps.map((row, index) => (
          <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <TextField
              size="small"
              type="number"
              label={t("traffic.rateField")}
              value={row.rate}
              disabled={locked}
              onChange={(e) => {
                const next = draft.steps.slice();
                next[index] = { ...row, rate: e.target.value };
                patch({ steps: next });
              }}
              slotProps={{ htmlInput: { min: limits.min_rate, max: limits.max_rate } }}
              sx={{ width: 140 }}
            />
            <TextField
              size="small"
              type="number"
              label={t("traffic.seconds")}
              value={row.duration_s}
              disabled={locked}
              onChange={(e) => {
                const next = draft.steps.slice();
                next[index] = { ...row, duration_s: e.target.value };
                patch({ steps: next });
              }}
              slotProps={{ htmlInput: { min: limits.min_duration_s, max: limits.max_duration_s } }}
              sx={{ width: 110 }}
            />
            <IconButton
              size="small"
              disabled={locked || draft.steps.length <= 1}
              onClick={() => patch({ steps: draft.steps.filter((_, i) => i !== index) })}
              aria-label={t("common.delete")}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
            {activeIndex === index && run?.plan?.case === draft.caseId && (
              <Chip size="small" color="primary" label={t("traffic.running")} />
            )}
          </Stack>
        ))}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={locked || draft.steps.length >= limits.max_steps}
            onClick={() => patch({ steps: [...draft.steps, { rate: "100", duration_s: "10" }] })}
          >
            {t("traffic.addStep")}
          </Button>
          <Button size="small" disabled={locked} onClick={() => setDraft({ ...defaultDraft(), caseId: null })}>
            {t("common.reset")}
          </Button>
        </Stack>
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("traffic.ladder")}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {t("traffic.ladderHint")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <TextField
              size="small"
              type="number"
              label={t("traffic.ladderStart")}
              value={draft.ladder.start}
              disabled={locked}
              onChange={(e) => patch({ ladder: { ...draft.ladder, start: e.target.value } })}
              sx={{ width: 120 }}
            />
            <TextField
              size="small"
              type="number"
              label={t("traffic.ladderFactor")}
              value={draft.ladder.factor}
              disabled={locked}
              onChange={(e) => patch({ ladder: { ...draft.ladder, factor: e.target.value } })}
              slotProps={{ htmlInput: { step: 0.1, min: 1.1 } }}
              sx={{ width: 110 }}
            />
            <TextField
              size="small"
              type="number"
              label={t("traffic.ladderCount")}
              value={draft.ladder.count}
              disabled={locked}
              onChange={(e) => patch({ ladder: { ...draft.ladder, count: e.target.value } })}
              slotProps={{ htmlInput: { min: 1, max: limits.max_steps } }}
              sx={{ width: 110 }}
            />
            <TextField
              size="small"
              type="number"
              label={t("traffic.seconds")}
              value={draft.ladder.duration_s}
              disabled={locked}
              onChange={(e) => patch({ ladder: { ...draft.ladder, duration_s: e.target.value } })}
              sx={{ width: 110 }}
            />
            <Button
              size="small"
              variant="outlined"
              disabled={locked || ladderSteps(draft.ladder, limits) === null}
              onClick={() => {
                const steps = ladderSteps(draft.ladder, limits);
                if (steps !== null) {
                  patch({ steps });
                }
              }}
            >
              {t("traffic.ladderBuild")}
            </Button>
          </Stack>
        </Stack>
      </Section>

      {plan === null && !locked && (
        <Alert severity="warning">
          {t("traffic.invalid", {
            steps: limits.max_steps,
            rate: limits.max_rate,
            sec: limits.max_duration_s,
            total: limits.max_total_s,
          })}
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
        <Button
          variant="contained"
          disabled={disabled || running || plan === null}
          onClick={() => {
            if (plan === null) {
              return;
            }
            void startLoad(plan)
              .then((row) => setRun(row))
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
              });
          }}
        >
          {running ? t("traffic.running") : t("traffic.run")}
        </Button>
        {plan !== null && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {plan.target.method} {plan.target.host}
            {plan.target.path} · {t("traffic.plannedShort", { n: fmtInt(plannedOf(plan.steps)) })}
          </Typography>
        )}
      </Stack>

      {running && <LinearProgress variant="determinate" value={progress} />}

      {run?.plan !== undefined && (run.status === "done" || run.status === "error" || running) && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {runCase !== null ? `${runCase.title} · ` : ""}
          {run.plan.target.method} {run.plan.target.host}
          {run.plan.target.path}
          {run.plan.flags.random_ip !== "" ? ` · ${t("traffic.randomIp")}: ${t(`traffic.ipPool.${run.plan.flags.random_ip}`)}` : ""}
        </Typography>
      )}

      {run?.totals !== undefined && <Totals run={run} t={t} />}

      {run?.totals?.waf != null && <WafPanel waf={run.totals.waf} seenOf={run.totals.reqs} t={t} />}

      {run?.by_step !== undefined && run.by_step.length > 0 && (
        <StepsTable rows={run.by_step} judged={run.status !== "running"} t={t} />
      )}

      {run?.bus != null && <BusTable bus={run.bus} t={t} />}

      {typeof run?.log === "string" && run.log !== "" && (
        <Section title={t("traffic.log")} hint={t("traffic.logHint")}>
          <Box
            component="pre"
            sx={{ m: 0, fontSize: "0.75rem", whiteSpace: "pre-wrap", overflowX: "auto", maxHeight: 360, overflowY: "auto" }}
          >
            {run.log}
          </Box>
        </Section>
      )}
    </Stack>
  );
}

function sizeOptions(t: Translate, tagsAllowed: string[]): { tag: string; label: string }[] {
  return tagsAllowed.map((tag) => ({
    tag,
    label: tag === "orig" ? t("traffic.bodyOrig") : (SIZE_LABEL[tag] ?? tag),
  }));
}

function toggle(list: string[], tag: string, on: boolean): string[] {
  return on ? list.filter((item) => item !== tag) : [...list, tag];
}

function Totals({ run, t }: { run: LoadRun; t: Translate }) {
  const totals = run.totals;
  if (totals === undefined) {
    return null;
  }
  const codes = Object.entries(totals.codes).sort((a, b) => b[1] - a[1]);
  const expect = run.plan?.target.expect ?? 200;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="subtitle2">{t("traffic.result")}</Typography>
        {run.ceiling !== undefined && run.status === "done" && (
          <Chip
            size="small"
            color={run.ceiling === null ? "error" : "success"}
            variant="outlined"
            title={t("traffic.ceilingHint")}
            label={
              run.ceiling === null
                ? t("traffic.ceilingNone")
                : t("traffic.ceiling", { rps: run.ceiling })
            }
          />
        )}
      </Stack>
      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", gap: 2 }}>
        <Stat label={t("traffic.planned")} value={fmtInt(plannedOf(run.plan?.steps ?? []))} />
        <Stat label={t("traffic.reqs")} value={fmtInt(totals.reqs)} />
        <Stat label={t("traffic.rps")} value={fmtRate(totals.rps)} />
        <Stat label="p50" value={fmtMs(totals.latency.p50)} />
        <Stat label="p99" value={fmtMs(totals.latency.p99)} />
        <Stat label="max" value={fmtMs(totals.latency.max)} />
        <Stat
          label={t("traffic.unexpected")}
          value={`${fmtInt(totals.unexpected)} · ${fmtPct(totals.unexpected, totals.reqs)}`}
        />
        <Stat label={t("traffic.sockets")} value={fmtInt(totals.sockets)} />
        <Stat label={t("traffic.timeouts")} value={fmtInt(totals.timeouts)} />
        <Stat label={t("traffic.connections")} value={fmtInt(totals.connections)} />
      </Stack>
      {codes.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("traffic.codes")}
          </Typography>
          {codes.map(([code, n]) => (
            <Chip
              key={code}
              size="small"
              variant="outlined"
              color={Number(code) === expect ? "success" : "warning"}
              label={`${code} · ${fmtInt(n)}`}
            />
          ))}
        </Stack>
      )}
      {totals.sockets > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {t("traffic.socketsHint")}
        </Alert>
      )}
    </Paper>
  );
}

function WafPanel({ waf, seenOf, t }: { waf: LoadWaf; seenOf: number; t: Translate }) {
  const fails = Object.entries(waf.fails).sort((a, b) => b[1] - a[1]);
  const verdicts = Object.entries(waf.verdicts).sort((a, b) => b[1] - a[1]);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2">{t("traffic.waf")}</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
        {t("traffic.wafHint")}
      </Typography>
      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", gap: 2 }}>
        <Stat label={t("traffic.seen")} value={`${fmtInt(waf.seen)} · ${fmtPct(waf.seen, seenOf)}`} />
        <Stat
          label={`${t("traffic.wafWait")} p50 / p99 / max`}
          value={`${fmtMs(waf.wait?.p50)} / ${fmtMs(waf.wait?.p99)} / ${fmtMs(waf.wait?.max)}`}
        />
        <Stat label={t("traffic.inspNone")} value={fmtInt(waf.none)} />
        <Stat label={t("traffic.fails")} value={fmtInt(sumOf(waf.fails))} />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", gap: 1, alignItems: "center" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {t("traffic.verdicts")}
        </Typography>
        {verdicts.length === 0 && (
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            —
          </Typography>
        )}
        {verdicts.map(([name, n]) => (
          <Chip
            key={name}
            size="small"
            variant="outlined"
            color={name === "allow" ? "success" : name === "deny" ? "error" : "default"}
            label={`${name} · ${fmtInt(n)}`}
          />
        ))}
        {fails.map(([name, n]) => (
          <Chip key={name} size="small" variant="outlined" color="error" label={`${name} · ${fmtInt(n)}`} />
        ))}
      </Stack>
      {waf.inspectors.length > 0 && (
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("traffic.inspectors")}</TableCell>
              <TableCell align="right">n</TableCell>
              <TableCell align="right">avg</TableCell>
              <TableCell align="right">p50</TableCell>
              <TableCell align="right">p99</TableCell>
              <TableCell align="right">max</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {waf.inspectors.map((row) => (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell align="right">{fmtInt(row.count)}</TableCell>
                <TableCell align="right">{fmtMs(row.avg)}</TableCell>
                <TableCell align="right">{fmtMs(row.p50)}</TableCell>
                <TableCell align="right">{fmtMs(row.p99)}</TableCell>
                <TableCell align="right">{fmtMs(row.max)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}

function StepsTable({ rows, judged, t }: { rows: LoadStepResult[]; judged: boolean; t: Translate }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("traffic.rate")}</TableCell>
            <TableCell align="right">{t("traffic.duration")}</TableCell>
            <TableCell align="right">{t("traffic.reqs")}</TableCell>
            <TableCell align="right">{t("traffic.rps")}</TableCell>
            <TableCell align="right">p50</TableCell>
            <TableCell align="right">p99</TableCell>
            <TableCell align="right">{t("traffic.unexpected")}</TableCell>
            <TableCell align="right">{t("traffic.fails")}</TableCell>
            <TableCell align="right" title={t("traffic.wafWaitHint")}>
              {t("traffic.wafWait")} p99
            </TableCell>
            <TableCell align="right">{t("traffic.sockets")}</TableCell>
            <TableCell>{t("traffic.stepState")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => {
            const failN = sumOf(row.waf?.fails);
            return (
              <TableRow key={`${row.step.rate}-${index}`}>
                <TableCell>{row.step.rate} rps</TableCell>
                <TableCell align="right">{row.step.duration_s} s</TableCell>
                <TableCell align="right">{fmtInt(row.reqs)}</TableCell>
                <TableCell align="right">{fmtRate(row.rps)}</TableCell>
                <TableCell align="right">{fmtMs(row.latency.p50)}</TableCell>
                <TableCell align="right">{fmtMs(row.latency.p99)}</TableCell>
                <TableCell align="right">
                  {fmtInt(row.unexpected)} · {fmtPct(row.unexpected, row.reqs)}
                </TableCell>
                <TableCell align="right">{row.waf === null ? "—" : fmtInt(failN)}</TableCell>
                <TableCell align="right">{fmtMs(row.waf?.wait?.p99)}</TableCell>
                <TableCell align="right">{fmtInt(row.sockets + row.timeouts)}</TableCell>
                <TableCell>
                  {row.clean === undefined ? (
                    "—"
                  ) : (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={row.clean ? "success" : judged ? "error" : "warning"}
                      label={
                        row.clean
                          ? t("traffic.stepClean")
                          : (row.why ?? []).map((why) => t(`traffic.why.${why}`)).join(", ")
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ChipRow({
  title,
  hint,
  options,
  selected,
  locked,
  onToggle,
}: {
  title: string;
  hint: string;
  options: { tag: string; label: string }[];
  selected: string[];
  locked: boolean;
  onToggle: (tag: string, on: boolean) => void;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.disabled" }}>
        {hint}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        {options.map((row) => {
          const on = selected.includes(row.tag);
          return (
            <Chip
              key={row.tag}
              label={row.label}
              color={on ? "primary" : "default"}
              variant={on ? "filled" : "outlined"}
              disabled={locked}
              onClick={() => onToggle(row.tag, on)}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Stack>
  );
}

/** Реплики одного сервиса приходят под одним именем: строка -- сервис, pending и счётчики суммой. */
function busRows(bus: LoadBus): { name: string; replicas: number; pending: number; in_msgs: number; out_msgs: number }[] {
  const byName = new Map<string, { name: string; replicas: number; pending: number; in_msgs: number; out_msgs: number }>();
  for (const row of bus.connections) {
    const acc = byName.get(row.name) ?? { name: row.name, replicas: 0, pending: 0, in_msgs: 0, out_msgs: 0 };
    acc.replicas += 1;
    acc.pending += row.pending_bytes;
    acc.in_msgs += row.in_msgs;
    acc.out_msgs += row.out_msgs;
    byName.set(row.name, acc);
  }
  return [...byName.values()].sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name));
}

function BusTable({ bus, t }: { bus: LoadBus; t: Translate }) {
  const rows = busRows(bus);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2">{t("traffic.bus")}</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
        {t("traffic.busHint")}
      </Typography>
      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", gap: 2 }}>
        <Stat
          label={t("traffic.slowConsumers")}
          value={
            bus.slow_consumers_delta === null
              ? String(bus.slow_consumers)
              : `${bus.slow_consumers} (+${bus.slow_consumers_delta})`
          }
        />
        <Stat
          label={`${t("traffic.msgs")} in / out`}
          value={`${fmtInt(bus.in_msgs_delta)} / ${fmtInt(bus.out_msgs_delta)}`}
        />
      </Stack>
      {rows.length > 0 && (
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("traffic.connection")}</TableCell>
              <TableCell align="right">{t("traffic.replicas")}</TableCell>
              <TableCell align="right">{t("traffic.pending")}</TableCell>
              <TableCell align="right">in</TableCell>
              <TableCell align="right">out</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell align="right">{row.replicas}</TableCell>
                <TableCell align="right">{fmtInt(row.pending)}</TableCell>
                <TableCell align="right">{fmtInt(row.in_msgs)}</TableCell>
                <TableCell align="right">{fmtInt(row.out_msgs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}

