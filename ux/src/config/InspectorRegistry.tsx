import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import {
  fetchInspectors,
  serviceOfSubject,
  type CatalogBundle,
  type InspectorMeta,
} from "../api.ts";
import { TableIconButton } from "../components/data-table/index.ts";
import {
  DialogAlert,
  DialogFrame,
  DialogInput,
  DialogLines,
  DialogPick,
  DialogSection,
  type DialogOption,
} from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  dataActionCellSx,
  dataCellSx,
  dataHeadSx,
  SectionBleed,
} from "../components/settings-table.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { useCatalog } from "./editors.tsx";
import type { Doc } from "./inherit.ts";
import { Picker } from "./Picker.tsx";
import { BUILTIN_VARS } from "./VarsCatalog.tsx";

const cellSx = dataCellSx;
const headSx = dataHeadSx;

const ACTIONS_W = 72;
const actionCellSx = { ...dataActionCellSx, width: ACTIONS_W } as const;

const NAME_W = 320;
const PROFILE_W = 260;

type Breaker = {
  enabled?: boolean;
  threshold?: number;
  windowMs?: number;
  probeMs?: number;
};

type Decl = {
  process?: string;
  profile?: string;
  audit?: string;
  breaker?: Breaker;
  vars?: string[];
};

function asGraph(value: unknown): Record<string, Decl> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, Decl> = {};
  for (const [name, raw] of Object.entries(value as Doc)) {
    out[name] = raw !== null && typeof raw === "object" ? (raw as Decl) : {};
  }
  return out;
}

function clean(name: string, row: Decl): Decl {
  const next: Decl = {};
  if (row.process && row.process !== name) next.process = row.process;
  if (row.profile && row.profile !== "default") next.profile = row.profile;
  if (row.audit) next.audit = row.audit;
  const b = row.breaker ?? {};
  const breaker: Breaker = {};
  if (b.enabled !== undefined) breaker.enabled = b.enabled;
  if (typeof b.threshold === "number") breaker.threshold = b.threshold;
  if (typeof b.windowMs === "number") breaker.windowMs = b.windowMs;
  if (typeof b.probeMs === "number") breaker.probeMs = b.probeMs;
  if (Object.keys(breaker).length > 0) next.breaker = breaker;
  if (Array.isArray(row.vars) && row.vars.length > 0) next.vars = row.vars;
  return next;
}

export function parseTime(raw: string): number | undefined {
  const text = raw.trim().toLowerCase();
  if (text === "") return undefined;
  const m = text.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/);
  if (m === null) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = m[2] ?? "ms";
  if (unit === "s") return Math.round(n * 1000);
  if (unit === "m") return Math.round(n * 60000);
  return Math.round(n);
}

export function formatTime(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms % 60000 === 0) return `${ms / 60000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const auditDefault = (name: string) => `waf.audit.inspector.${name}`;

export function InspectorRegistry({
  scope,
  value,
  varNames,
  onChange,
}: {
  scope: string;
  value: Doc;
  varNames: string[];
  onChange: (next: Doc) => void;
}) {
  const t = useT();
  const graph = asGraph(value.inspectors);
  const names = Object.keys(graph);
  const [rows, setRows] = useState<InspectorMeta[]>([]);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await fetchInspectors(scope));
    } catch {
      setRows([]);
    } finally {
      setReady(true);
    }
  }, [scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  const processOf = (name: string) => graph[name]?.process ?? name;
  const metaOf = (name: string) => byName.get(processOf(name));
  const unknown = ready ? names.filter((n) => metaOf(n) === undefined) : [];
  const noCatalog = ready && rows.length === 0;

  const setGraph = (next: Record<string, Decl>) => {
    const waf = { ...value };
    if (Object.keys(next).length === 0) delete waf.inspectors;
    else waf.inspectors = next;
    onChange(waf);
  };

  const patch = (name: string, decl: Decl) =>
    setGraph({ ...graph, [name]: clean(name, decl) });

  const removeName = (gone: string) => {
    const raw = (value.inspectors ?? {}) as Record<string, { after?: string[] }>;
    const next: Record<string, Decl> = {};

    for (const [name, decl] of Object.entries(raw)) {
      if (name === gone) {
        continue;
      }
      const after = decl.after ?? [];
      if (!after.includes(gone)) {
        next[name] = decl as Decl;
        continue;
      }
      const kept = after.filter((item) => item !== gone);
      const { after: _dropped, ...rest } = decl;
      next[name] = (kept.length > 0 ? { ...rest, after: kept } : rest) as Decl;
    }

    setGraph(next);
  };

  return (
    <Stack spacing={1.5}>
      {unknown.length > 0 && (
        <Alert severity="error">{t("registry.unknown", { names: unknown.join(", ") })}</Alert>
      )}

      <SectionBleed scroll>
        <Table size="small" sx={{ "& td, & th": { borderLeft: 0, borderRight: 0 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...headSx, pl: 2, width: NAME_W }}>{t("registry.name")}</TableCell>
              <TableCell sx={{ ...headSx, width: PROFILE_W }}>{t("registry.profile")}</TableCell>
              <TableCell sx={headSx} />
              <TableCell sx={{ ...headSx, width: ACTIONS_W, textAlign: "right" }}>
                <TableIconButton
                  color="success"
                  icon={<AddIcon />}
                  disabled={noCatalog}
                  tooltip={noCatalog ? t("registry.addNoCatalog") : t("registry.add")}
                  onClick={() => setAdding(true)}
                />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {names.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} sx={{ ...cellSx, pl: 2, color: "text.secondary" }}>
                  {t("registry.empty")}
                </TableCell>
              </TableRow>
            )}
            {names.map((name) => {
              const decl = graph[name] ?? {};
              const meta = metaOf(name);
              const aliased = decl.process !== undefined && decl.process !== name;
              const tuned = tunedParts(name, decl, t);
              return (
                <TableRow key={name} hover>
                  <TableCell sx={{ ...cellSx, pl: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ fontWeight: 700 }}>
                        <code>{name}</code>
                      </Box>
                      <Box
                        sx={{
                          fontSize: "0.68rem",
                          fontFamily: meta === undefined ? undefined : "monospace",
                          color: meta === undefined ? "error.main" : "text.secondary",
                        }}
                      >
                        {meta === undefined
                          ? t("registry.notInCatalog", { process: processOf(name) })
                          : aliased
                            ? `${decl.process} · ${meta.subject}`
                            : meta.subject}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <ProfileCell
                      subject={meta?.subject}
                      value={decl.profile ?? ""}
                      onChange={(profile) => patch(name, { ...decl, profile })}
                    />
                  </TableCell>
                  <TableCell sx={cellSx} />
                  <TableCell sx={actionCellSx}>
                    <Box
                      sx={{
                        display: "flex",
                        gap: 0.5,
                        justifyContent: "flex-end",
                        alignItems: "center",
                      }}
                    >
                      <TableIconButton
                        color={tuned.length > 0 ? "info" : "primary"}
                        icon={<SettingsOutlinedIcon />}
                        tooltip={
                          tuned.length > 0
                            ? `${t("registry.settings")}: ${tuned.join(" · ")}`
                            : t("registry.settings")
                        }
                        aria-label={t("registry.settings")}
                        onClick={() => setEditing(name)}
                      />
                      <TableIconButton
                        color="error"
                        icon={<DeleteIcon />}
                        tooltip={t("registry.remove")}
                        onClick={() => removeName(name)}
                      />
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionBleed>

      {adding && (
        <AddDialog
          rows={rows}
          graph={graph}
          onClose={() => setAdding(false)}
          onAdd={(name, decl) => {
            setAdding(false);
            setGraph({ ...graph, [name]: clean(name, decl) });
          }}
        />
      )}

      <SettingsDialog
        name={editing ?? undefined}
        decl={editing === null ? undefined : graph[editing]}
        rows={rows}
        taken={names.filter((n) => n !== editing)}
        varNames={varNames}
        onClose={() => setEditing(null)}
        onDone={(from, to, next) => {
          setEditing(null);
          setGraph(
            Object.fromEntries(
              Object.entries(graph).map(([key, decl]) => [
                key === from ? to : key,
                key === from ? clean(to, next) : decl,
              ]),
            ),
          );
        }}
      />
    </Stack>
  );
}

function tunedParts(name: string, decl: Decl, t: Translate): string[] {
  const parts: string[] = [];

  if (decl.audit === "off") {
    parts.push(t("registry.auditOffTag"));
  } else if (decl.audit !== undefined && decl.audit !== auditDefault(name)) {
    parts.push(t("registry.auditOnTag", { subject: decl.audit }));
  }

  const b = decl.breaker ?? {};
  if (b.enabled === false) {
    parts.push(t("registry.breakerOffTag"));
  } else if (
    b.threshold !== undefined ||
    b.windowMs !== undefined ||
    b.probeMs !== undefined
  ) {
    parts.push(breakerSummary(b, t));
  }

  const vars = decl.vars ?? [];
  if (vars.includes("all")) {
    parts.push(t("registry.varsAllTag"));
  } else if (vars.length > 0) {
    parts.push(t("registry.varsTag", { fields: vars.join(", ") }));
  }

  return parts;
}

function profilesOf(
  catalog: CatalogBundle | null,
  subject: string | undefined,
): { value: string }[] {
  if (subject === undefined) {
    return [];
  }
  const service = serviceOfSubject(subject);
  return (catalog?.profiles ?? [])
    .filter((row) => row.kind === service)
    .map((row) => ({ value: row.name }));
}

function declLine(name: string, subject: string, profile: string): string {
  const parts = [`subject=${subject}`];
  if (profile !== "" && profile !== "default") {
    parts.push(`profile=${profile}`);
  }
  return `waf_inspector ${name === "" ? "?" : name} ${parts.join(" ")};`;
}

function AddDialog({
  rows,
  graph,
  onClose,
  onAdd,
}: {
  rows: InspectorMeta[];
  graph: Record<string, Decl>;
  onClose: () => void;
  onAdd: (name: string, decl: Decl) => void;
}) {
  const t = useT();
  const catalog = useCatalog();
  const [process, setProcess] = useState("");
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [profile, setProfile] = useState("");

  const taken = Object.keys(graph);
  const used = new Set(taken.map((key) => graph[key]?.process ?? key));
  const meta = rows.find((row) => row.name === process);
  const nameBad = nameError(name, taken, t);
  const ok = name !== "" && nameBad === undefined && meta !== undefined;

  const profileOptions = profilesOf(catalog, meta?.subject);

  const pick = (next: string) => {
    setProcess(next);
    setProfile("");
    if (!named) {
      setName(next);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={t("registry.addTitle")}
      hint={t("registry.declareBlurb")}
      dirty={process !== "" || name !== "" || profile !== ""}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!ok}
            onClick={() => onAdd(name, { process, profile: profile || undefined })}
          >
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.25}>
        <DialogPick
          mono
          label={t("registry.process")}
          hint={t("registry.processHint")}
          value={process}
          options={processOptions(rows, process, t, used)}
          onChange={pick}
        />
        <DialogInput
          label={t("common.name")}
          hint={t("registry.nameHint")}
          placeholder="modsec-strict"
          value={name}
          error={nameBad !== undefined}
          onChange={(next) => {
            setName(next);
            setNamed(next !== "");
          }}
        />
        {nameBad !== undefined && <DialogAlert tone="warning" text={nameBad} />}
        <DialogFrame label={t("registry.profile")} hint={t("registry.profileDeclareHint")}>
          <Picker
            free
            plain
            disabled={meta === undefined}
            value={profile}
            onChange={setProfile}
            placeholder={
              meta !== undefined && profileOptions.length === 0
                ? t("registry.noProfileSource")
                : t("registry.profilePick")
            }
            options={profileOptions}
            unknownLabel={t("registry.ownProfile")}
          />
        </DialogFrame>
        <DialogLines
          title={t("registry.line")}
          lines={meta === undefined ? [] : [declLine(name, meta.subject, profile)]}
          empty={t("registry.lineEmpty")}
        />
      </Stack>
    </Modal>
  );
}

function processOptions(
  rows: InspectorMeta[],
  value: string,
  t: Translate,
  used?: ReadonlySet<string>,
): DialogOption[] {
  const options: DialogOption[] = rows.map((row) => ({
    value: row.name,
    label: row.name,
    hint: `${row.subject} · ${row.phases.join(", ")}`,
    ...(used?.has(row.name) === true ? { tag: t("registry.declared") } : {}),
  }));
  if (value === "") {
    options.unshift({ value: "", label: t("registry.processPick") });
  } else if (!rows.some((row) => row.name === value)) {
    options.push({ value, label: value, tag: t("registry.processGone"), missing: true });
  }
  return options;
}

function nameError(name: string, taken: string[], t: Translate): string | undefined {
  if (name === "") {
    return undefined;
  }
  if (!NAME_RE.test(name)) {
    return t("registry.nameBad");
  }
  return taken.includes(name) ? t("registry.nameUsed") : undefined;
}

function SettingsDialog({
  name: current,
  decl,
  rows,
  taken,
  varNames,
  onClose,
  onDone,
}: {
  name?: string;
  decl?: Decl;
  rows: InspectorMeta[];
  taken: string[];
  varNames: string[];
  onClose: () => void;
  onDone: (from: string, to: string, decl: Decl) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [process, setProcess] = useState("");
  const [auditOn, setAuditOn] = useState(true);
  const [audit, setAudit] = useState("");
  const [breakerOn, setBreakerOn] = useState(true);
  const [pct, setPct] = useState("");
  const [win, setWin] = useState("");
  const [probe, setProbe] = useState("");
  const [varsOn, setVarsOn] = useState(false);
  const [vars, setVars] = useState<string[]>([]);
  const open = current !== undefined;

  useEffect(() => {
    if (current === undefined) {
      return;
    }
    const b = decl?.breaker ?? {};
    setName(current);
    setProcess(decl?.process ?? current);
    setAuditOn(decl?.audit !== "off");
    setAudit(decl?.audit === "off" ? "" : (decl?.audit ?? ""));
    setBreakerOn(b.enabled !== false);
    setPct(b.threshold === undefined ? "" : String(Math.round(b.threshold * 100)));
    setWin(formatTime(b.windowMs));
    setProbe(formatTime(b.probeMs));
    setVarsOn((decl?.vars ?? []).length > 0);
    setVars(decl?.vars ?? []);
  }, [current, decl]);

  const nameBad = nameError(name, taken, t);
  const processOk = rows.some((row) => row.name === process);
  const pctNum = pct.trim() === "" ? undefined : Number(pct.trim());
  const pctOk =
    pctNum === undefined || (Number.isFinite(pctNum) && pctNum > 0 && pctNum <= 100);
  const winOk = win.trim() === "" || parseTime(win) !== undefined;
  const probeOk = probe.trim() === "" || parseTime(probe) !== undefined;
  const varsOk = !varsOn || vars.length > 0;
  const ok =
    name !== "" && nameBad === undefined && processOk && pctOk && winOk && probeOk && varsOk;
  const renamed = current !== undefined && current !== name;

  const breaker: Breaker = {
    enabled: breakerOn ? undefined : false,
    threshold: pctNum === undefined || !pctOk ? undefined : pctNum / 100,
    windowMs: parseTime(win),
    probeMs: parseTime(probe),
  };

  const draft: Decl = {
    ...decl,
    process,
    audit: auditOn ? (audit.trim() === "" ? undefined : audit.trim()) : "off",
    breaker,
    vars: varsOn ? vars : [],
  };

  const tuned = {
    audit: decl?.audit !== undefined,
    breaker: Object.keys(decl?.breaker ?? {}).length > 0,
    vars: (decl?.vars ?? []).length > 0,
  };

  const dirty =
    current !== undefined &&
    (renamed || JSON.stringify(clean(name, draft)) !== JSON.stringify(clean(current, decl ?? {})));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("registry.editTitle", { name: current ?? "" })}
      hint={t("registry.editBlurb")}
      dirty={dirty}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!ok || current === undefined}
            onClick={() => {
              if (current !== undefined) {
                onDone(current, name, draft);
              }
            }}
          >
            {t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.25}>
        <DialogInput
          label={t("common.name")}
          hint={t("registry.nameHint")}
          value={name}
          error={nameBad !== undefined}
          onChange={setName}
        />
        {nameBad !== undefined && <DialogAlert tone="warning" text={nameBad} />}
        <DialogPick
          mono
          label={t("registry.process")}
          hint={t("registry.processHint")}
          value={process}
          options={processOptions(rows, process, t)}
          onChange={setProcess}
        />
        {renamed && nameBad === undefined && (
          <DialogAlert tone="warning" text={t("registry.renameWarn")} />
        )}

        <DialogSection
          title={t("registry.audit")}
          hint={auditOn ? t("registry.auditBlurb") : t("registry.auditOffHint")}
          summary={
            auditOn
              ? audit.trim() === ""
                ? t("registry.auditDefaultSummary")
                : audit.trim()
              : ""
          }
          checked={auditOn}
          onCheck={setAuditOn}
          defaultOpen={tuned.audit}
        >
          <DialogInput
            label={t("registry.auditSubject")}
            hint={t("registry.auditSubjectHint")}
            value={audit}
            placeholder={auditDefault(name)}
            onChange={setAudit}
          />
          <DialogAlert text={t("registry.auditHint")} />
        </DialogSection>

        <DialogSection
          title={t("registry.breaker")}
          hint={breakerOn ? t("registry.breakerBlurb") : t("registry.breakerOff")}
          summary={breakerOn ? breakerShort(breaker, t) : ""}
          checked={breakerOn}
          onCheck={setBreakerOn}
          defaultOpen={tuned.breaker}
        >
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <DialogInput
                label={t("registry.breakerThreshold")}
                value={pct}
                placeholder="50"
                error={!pctOk}
                end="%"
                onChange={setPct}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <DialogInput
                label={t("registry.breakerWindow")}
                value={win}
                placeholder="10s"
                error={!winOk}
                onChange={setWin}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <DialogInput
                label={t("registry.breakerProbe")}
                value={probe}
                placeholder="5s"
                error={!probeOk}
                onChange={setProbe}
              />
            </Box>
          </Stack>
          {(!pctOk || !winOk || !probeOk) && (
            <DialogAlert
              tone="warning"
              text={pctOk ? t("registry.breakerTimeBad") : t("registry.breakerPctBad")}
            />
          )}
          <DialogAlert text={t("registry.breakerHint")} />
        </DialogSection>

        <DialogSection
          title={t("registry.vars")}
          hint={varsOn ? t("registry.varsBlurb") : t("registry.varsOffHint")}
          summary={
            varsOn ? (vars.includes("all") ? t("registry.varsAllSummary") : vars.join(", ")) : ""
          }
          checked={varsOn}
          onCheck={(next) => {
            setVarsOn(next);
            if (next && vars.length === 0) setVars(["all"]);
          }}
          defaultOpen={tuned.vars}
        >
          <VarsPicker value={vars} own={varNames} onChange={setVars} />
          {!varsOk && <DialogAlert tone="warning" text={t("registry.varsNone")} />}
          <DialogAlert text={t("registry.varsHint")} />
        </DialogSection>
      </Stack>
    </Modal>
  );
}

function VarsPicker({
  value,
  own,
  onChange,
}: {
  value: string[];
  own: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useT();
  const all = value.includes("all");
  const builtin: string[] = BUILTIN_VARS.map((v) => v.name);
  const stale = value.filter((v) => v !== "all" && !builtin.includes(v) && !own.includes(v));
  const toggle = (name: string, next: boolean) =>
    onChange(
      next ? [...value.filter((v) => v !== name), name] : value.filter((v) => v !== name),
    );
  const box = (name: string, label: string, mono: boolean, bad = false) => (
    <FormControlLabel
      key={name}
      control={
        <Checkbox
          size="small"
          checked={name === "all" ? all : all || value.includes(name)}
          disabled={all && name !== "all"}
          onChange={(_, next) => toggle(name, next)}
          sx={{ p: 0.5 }}
        />
      }
      label={label}
      slotProps={{
        typography: {
          sx: {
            fontSize: "0.78rem",
            fontFamily: mono ? "monospace" : undefined,
            color: bad ? "warning.main" : undefined,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
      }}
      sx={{ mr: 0, ml: "-4px", minWidth: 0 }}
    />
  );

  const group = (title: string, names: string[], badFrom = names.length) => (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))",
          columnGap: 1,
          rowGap: 0.25,
          mt: 0.25,
        }}
      >
        {names.map((name, i) => box(name, name, true, i >= badFrom))}
      </Box>
    </Box>
  );

  return (
    <Stack spacing={1.25}>
      <Box>{box("all", t("registry.varsAll"), false)}</Box>
      {group(t("registry.varsBuiltin"), builtin)}
      {(own.length > 0 || stale.length > 0) &&
        group(t("registry.varsOwn"), [...own, ...stale], own.length)}
    </Stack>
  );
}

function ProfileCell({
  subject,
  value,
  onChange,
}: {
  subject?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const catalog = useCatalog();

  const options = useMemo(() => profilesOf(catalog, subject), [catalog, subject]);

  return (
    <Picker
      free
      plain
      value={value}
      onChange={onChange}
      options={options}
      placeholder={
        options.length === 0 ? t("registry.noProfileSource") : t("registry.profilePick")
      }
      unknownLabel={t("registry.ownProfile")}
    />
  );
}

function breakerSummary(b: Breaker, t: Translate): string {
  return t("registry.breakerSummary", breakerWords(b));
}

function breakerShort(b: Breaker, t: Translate): string {
  return t("registry.breakerShort", breakerWords(b));
}

function breakerWords(b: Breaker): Record<string, string> {
  return {
    pct: String(b.threshold === undefined ? 50 : Math.round(b.threshold * 100)),
    window: formatTime(b.windowMs) || "10s",
    probe: formatTime(b.probeMs) || "5s",
  };
}
