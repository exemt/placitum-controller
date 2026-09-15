import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import {
  DraftCell,
  FilterCell,
  FilterSelect,
  TableIconButton,
  TableNoticeRow,
  type FilterOption,
} from "../components/data-table/index.ts";
import {
  BLEED,
  flushTableSx,
  HeadCell,
  headCellSx,
  TableBlock,
} from "../components/table-block.tsx";
import { dragSx, GripCell, useRowDrag, type DragApi } from "../components/row-drag.tsx";
import { DialogAlert, DialogLines, DialogSection } from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  CONDS_HELP,
  CondTable,
  asConds,
  condTail,
  condsDraft,
  readyConds,
  withConds,
  type Cond,
} from "../config/CondDialog.tsx";
import { formatTime, parseTime } from "../config/InspectorRegistry.tsx";
import { Picker } from "../config/Picker.tsx";
import {
  WaveBudget,
  type BudgetEdit,
  type BudgetFrom,
  type WaveRow,
} from "../config/Waves.tsx";
import type { Translate } from "../i18n/index.ts";
import {
  fetchDeclaredInspectors,
  fetchSpaceHttp,
  type DeclaredInspector,
  type InspectorPhase,
} from "../api.ts";
import {
  asRecord,
  asString,
  setKey,
  type Doc,
} from "./config-fields.tsx";

export type InspectorMode = "active" | "passive" | "vote" | "off" | "ignore";
export type InspectorResume = "off" | "prefer" | "require";

export type InspectorStream = "c2s" | "s2c" | "both";

export const STREAMS: readonly InspectorStream[] = ["c2s", "s2c", "both"];

export function isStream(value: unknown): value is InspectorStream {
  return value === "c2s" || value === "s2c" || value === "both";
}

export type InspectorRef = {
  name: string;
  wave?: number;
  timeoutMs?: number;
  mode?: InspectorMode;
  resume?: InspectorResume;
  stream?: InspectorStream;
  keep?: boolean;
  conds?: Cond[];
};

function callTail(row: InspectorRef): string {
  return condTail(row.conds).trim();
}

const MODES = ["active", "passive", "vote", "off"] as const;
const RESUMES: InspectorResume[] = ["off", "prefer", "require"];

const KINDS = ["inherit", "none", "override"] as const;

const SERVER_KINDS = ["none", "override"] as const;

type ListKind = "inherit" | "all" | "none" | "override";
type ListKey = "requestInspectors" | "responseInspectors" | "frameInspectors";

type RoutePhase = "request" | "response" | "frame";

type NameIssue = "unknown" | "phase" | undefined;

const W = {
  order: 78,
  name: 116,
  timeout: 92,
  mode: 128,
  pair: 116,
  stream: 124,
  actions: 72,
} as const;

type Keyed = { ref: InspectorRef; key: number };

function ordered(refs: InspectorRef[]): Keyed[] {
  return refs
    .map((ref, index) => ({ ref, key: ref.wave ?? 0, index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ ref, key }) => ({ ref, key }));
}

function renumber(rows: Keyed[]): InspectorRef[] {
  let wave = -1;
  let prev: number | undefined;
  return rows.map(({ ref, key }) => {
    if (prev === undefined || key !== prev) {
      wave += 1;
      prev = key;
    }
    return { ...ref, wave };
  });
}

function moveRef(refs: InspectorRef[], from: number, to: number): InspectorRef[] {
  const rows = ordered(refs);
  const moved = rows[from];
  if (moved === undefined || to < 0 || to >= rows.length || from === to) {
    return refs;
  }
  const next = [...rows];
  next.splice(from, 1);
  next.splice(to, 0, moved);
  const prev = next[to - 1];
  const after = next[to + 1];
  const key =
    prev !== undefined && after !== undefined && prev.key === after.key
      ? prev.key
      : prev === undefined
        ? (after?.key ?? 0) - 1
        : after === undefined
          ? prev.key + 1
          : (prev.key + after.key) / 2;
  return renumber(next.map((row) => (row === moved ? { ref: row.ref, key } : row)));
}

function joinWave(refs: InspectorRef[], index: number, joined: boolean): InspectorRef[] {
  const rows = ordered(refs);
  const prev = rows[index - 1];
  const row = rows[index];
  if (prev === undefined || row === undefined) {
    return refs;
  }
  const from = row.key;
  const key = joined ? prev.key : prev.key + 0.5;
  return renumber(
    rows.map((item, i) => (i >= index && item.key === from ? { ref: item.ref, key } : item)),
  );
}

function isMode(value: unknown): value is InspectorMode {
  return (
    value === "active" ||
    value === "passive" ||
    value === "vote" ||
    value === "off" ||
    value === "ignore"
  );
}

function isResume(value: unknown): value is InspectorResume {
  return value === "off" || value === "prefer" || value === "require";
}

function listKind(value: unknown): ListKind {
  if (value === "all" || value === "none") {
    return value;
  }
  if (Array.isArray(value)) {
    return "override";
  }
  return "inherit";
}

function asRefs(value: unknown): InspectorRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: InspectorRef[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Doc;
    const row: InspectorRef = { name: asString(rec.name) };
    if (typeof rec.wave === "number" && Number.isInteger(rec.wave) && rec.wave >= 0) {
      row.wave = rec.wave;
    }
    if (typeof rec.timeoutMs === "number" && rec.timeoutMs > 0) {
      row.timeoutMs = rec.timeoutMs;
    }
    if (isMode(rec.mode)) {
      row.mode = rec.mode;
    }
    if (isResume(rec.resume)) {
      row.resume = rec.resume;
    }
    if (isStream(rec.stream)) {
      row.stream = rec.stream;
    }
    if (rec.keep === true) {
      row.keep = true;
    }
    const conds = asConds(rec.conds);
    if (conds.length > 0) {
      row.conds = conds;
    }
    rows.push(row);
  }
  return rows;
}

function uniqueNames(items: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const name = item.trim();
    if (name === "" || seen.has(name)) {
      continue;
    }
    seen.add(name);
    next.push(name);
  }
  return next;
}

function applyMaps(ref: InspectorRef, chain: Doc[]): InspectorRef {
  let mode = ref.mode;
  for (const doc of chain) {
    const inheritedMode = asRecord(doc.inspectorModes)[ref.name];
    if (mode === undefined && isMode(inheritedMode)) {
      mode = inheritedMode;
    }
  }
  const next: InspectorRef = { ...ref };
  if (mode !== undefined) {
    next.mode = mode;
  }
  return next;
}

function inheritedRefs(chain: Doc[], field: ListKey, known: string[]): InspectorRef[] {
  for (const doc of chain) {
    const kind = listKind(doc[field]);
    if (kind === "inherit") {
      continue;
    }
    if (kind === "none") {
      return [];
    }
    if (kind === "override") {
      return asRefs(doc[field]).map((row) => applyMaps(row, chain));
    }
    return known.map((name) => applyMaps({ name }, chain));
  }
  return known.map((name) => applyMaps({ name }, chain));
}

function toWaveRows(refs: InspectorRef[]): WaveRow[] {
  return refs
    .filter((ref) => ref.mode !== "ignore")
    .map((ref) => ({
      name: ref.name,
      wave: ref.wave ?? 0,
      timeoutMs: ref.timeoutMs,
      passive: ref.mode === "passive",
    }));
}

const DEADLINE_KEY: Record<RoutePhase, string> = {
  request: "deadlineMs",
  response: "responseDeadlineMs",
  frame: "frameDeadlineMs",
};

const MODULE_DEADLINE_MS = 50;

interface PhaseBudget {
  ms: number;
  own: boolean;
  from?: BudgetFrom;
}

export const WafProtect = memo(function WafProtect({
  t,
  scope,
  value,
  onChange,
  parent,
  root,
  level = "location",
  phases = ["request", "response", "frame"],
}: {
  t: Translate;
  scope: string;
  value: Doc;
  onChange: (next: Doc) => void;
  parent?: Doc;
  root?: boolean;
  level?: "server" | "location";
  phases?: RoutePhase[];
}) {
  const [httpWaf, setHttpWaf] = useState<Doc | null>(null);
  const [declared, setDeclared] = useState<DeclaredInspector[]>([]);
  const [declaredReady, setDeclaredReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchDeclaredInspectors(scope)
      .then((rows) => {
        if (alive) {
          setDeclared(rows);
          setDeclaredReady(true);
        }
      })
      .catch(() => {
        if (alive) {
          setDeclared([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    if (root === true) {
      return;
    }
    let alive = true;
    void fetchSpaceHttp(scope)
      .then((doc) => {
        if (alive) {
          setHttpWaf(doc.waf);
        }
      })
      .catch(() => {
        if (alive) {
          setHttpWaf(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [root, scope]);

  const inspectorNames = useMemo(
    () => uniqueNames(declared.map((row) => row.name)),
    [declared],
  );

  const phasesOf = useMemo(
    () =>
      Object.fromEntries(
        declared.filter((row) => row.known).map((row) => [row.name, row.phases]),
      ) as Record<string, InspectorPhase[]>,
    [declared],
  );
  const broken = useMemo(
    () => new Set(declared.filter((row) => !row.known).map((row) => row.name)),
    [declared],
  );

  const hintOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of declared) {
      map.set(row.name, `${row.profile} · ${row.subject ?? "—"}`);
    }
    return (name: string) => map.get(name);
  }, [declared]);

  const processOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of declared) {
      if (row.known) {
        map.set(row.name, row.process);
      }
    }
    return (name: string) => map.get(name);
  }, [declared]);

  const withResponsePhase = phases.includes("response");
  const pairableFor = useMemo(
    () => (phase: RoutePhase) => (name: string) => {
      if (phase === "frame" || !withResponsePhase) {
        return false;
      }
      if (!declaredReady) {
        return true;
      }
      const list = phasesOf[name];
      return list !== undefined && list.includes("request") && list.includes("response");
    },
    [declaredReady, phasesOf, withResponsePhase],
  );

  const namesFor = useMemo(
    () => (phase: InspectorPhase) =>
      inspectorNames.filter((name) => {
        const list = phasesOf[name];
        return list === undefined || list.includes(phase);
      }),
    [inspectorNames, phasesOf],
  );
  const requestNames = useMemo(() => namesFor("request"), [namesFor]);
  const responseNames = useMemo(() => namesFor("response"), [namesFor]);
  const frameNames = useMemo(() => namesFor("frame"), [namesFor]);

  const issueOf = useMemo(
    () =>
      (phase: InspectorPhase) =>
      (name: string): NameIssue => {
        if (name === "" || !declaredReady) {
          return undefined;
        }
        if (!inspectorNames.includes(name) || broken.has(name)) {
          return "unknown";
        }
        const list = phasesOf[name];
        return list !== undefined && !list.includes(phase) ? "phase" : undefined;
      },
    [broken, declaredReady, inspectorNames, phasesOf],
  );

  const chain = useMemo(() => {
    if (root === true) {
      return [] as { doc: Doc; from: "server" | "http" }[];
    }
    const out: { doc: Doc; from: "server" | "http" }[] = [];
    if (parent !== undefined) {
      out.push({ doc: parent, from: "server" });
    }
    if (httpWaf !== null) {
      out.push({ doc: httpWaf, from: "http" });
    }
    return out;
  }, [httpWaf, parent, root]);

  const parents = useMemo(() => chain.map((item) => item.doc), [chain]);

  const shownKind = (kind: ListKind): ListKind =>
    level === "server" && kind === "inherit" ? "none" : kind;

  const requestKind = listKind(value.requestInspectors);
  const responseKind = listKind(value.responseInspectors);
  const frameKind = listKind(value.frameInspectors);
  const requestShown = shownKind(requestKind);
  const responseShown = shownKind(responseKind);
  const frameShown = shownKind(frameKind);

  const shownRefs = useCallback(
    (
      kind: ListKind,
      own: unknown,
      field: ListKey,
      names: string[],
    ): InspectorRef[] => {
      if (kind === "none" || (kind === "inherit" && level === "server")) {
        return [];
      }
      if (kind === "all") {
        return names.map((name) => ({ name, wave: 0 }));
      }
      if (kind === "override") {
        return asRefs(own);
      }
      return inheritedRefs(parents, field, names);
    },
    [level, parents],
  );

  const requestRefs = useMemo(
    () =>
      shownRefs(requestShown, value.requestInspectors, "requestInspectors", requestNames),
    [requestNames, requestShown, shownRefs, value.requestInspectors],
  );
  const responseRefs = useMemo(
    () =>
      shownRefs(
        responseShown,
        value.responseInspectors,
        "responseInspectors",
        responseNames,
      ),
    [responseNames, responseShown, shownRefs, value.responseInspectors],
  );
  const frameRefs = useMemo(
    () => shownRefs(frameShown, value.frameInspectors, "frameInspectors", frameNames),
    [frameNames, frameShown, shownRefs, value.frameInspectors],
  );

  const budgetOf = useCallback(
    (key: string): PhaseBudget | undefined => {
      const own = value[key];
      if (typeof own === "number") {
        return { ms: own, own: true };
      }
      for (const item of chain) {
        const ms = item.doc[key];
        if (typeof ms === "number") {
          return { ms, own: false, from: item.from };
        }
      }
      return undefined;
    },
    [chain, value],
  );

  const requestBudget = useMemo(
    (): PhaseBudget =>
      budgetOf(DEADLINE_KEY.request) ?? {
        ms: MODULE_DEADLINE_MS,
        own: false,
        from: "module",
      },
    [budgetOf],
  );

  const responseBudget = useMemo(
    (): PhaseBudget =>
      budgetOf(DEADLINE_KEY.response) ?? {
        ms: requestBudget.ms,
        own: false,
        from: "request",
      },
    [budgetOf, requestBudget],
  );

  const frameBudget = useMemo(
    (): PhaseBudget =>
      budgetOf(DEADLINE_KEY.frame) ?? {
        ms: requestBudget.ms,
        own: false,
        from: "request",
      },
    [budgetOf, requestBudget],
  );

  const setKind = (field: ListKey, next: ListKind) => {
    if (next === "inherit") {
      onChange(setKey(value, field, undefined));
      return;
    }
    if (next === "none" || next === "all") {
      onChange(setKey(value, field, next));
      return;
    }
    onChange(setKey(value, field, asRefs(value[field])));
  };

  const kindOptions = (kind: ListKind): FilterOption<ListKind>[] => {
    const offered: ListKind[] = [...(level === "server" ? SERVER_KINDS : KINDS)];
    const shown = kind === "all" ? [...offered, "all" as ListKind] : offered;
    return shown.map((item) => ({ value: item, label: t(`routeSettings.kind.${item}`) }));
  };

  return (
    <Stack spacing={0}>
      {phases.includes("request") && (
        <PhaseBlock
          t={t}
          phase="request"
          last={!phases.includes("response") && !phases.includes("frame")}
          title={t("routeSettings.request")}
          hint={t("routeSettings.requestHint")}
          kind={requestShown}
          options={kindOptions(requestKind)}
          refs={requestRefs}
          budget={requestBudget}
          field="requestInspectors"
          value={value}
          names={requestNames}
          hintOf={hintOf}
          processOf={processOf}
          pairable={pairableFor("request")}
          issue={issueOf("request")}
          level={level}
          onChange={onChange}
          onKind={(next) => setKind("requestInspectors", next)}
        />
      )}
      {phases.includes("response") && (
        <PhaseBlock
          t={t}
          phase="response"
          last={!phases.includes("frame")}
          title={t("routeSettings.response")}
          hint={t("routeSettings.responseHint")}
          kind={responseShown}
          options={kindOptions(responseKind)}
          refs={responseRefs}
          budget={responseBudget}
          field="responseInspectors"
          value={value}
          names={responseNames}
          hintOf={hintOf}
          processOf={processOf}
          pairable={pairableFor("response")}
          issue={issueOf("response")}
          level={level}
          onChange={onChange}
          onKind={(next) => setKind("responseInspectors", next)}
        />
      )}
      {phases.includes("frame") && (
        <PhaseBlock
          t={t}
          phase="frame"
          title={t("routeSettings.frame")}
          hint={t("routeSettings.frameHint")}
          kind={frameShown}
          options={kindOptions(frameKind)}
          refs={frameRefs}
          budget={frameBudget}
          field="frameInspectors"
          value={value}
          names={frameNames}
          hintOf={hintOf}
          processOf={processOf}
          pairable={pairableFor("frame")}
          issue={issueOf("frame")}
          level={level}
          last
          onChange={onChange}
          onKind={(next) => setKind("frameInspectors", next)}
        />
      )}
    </Stack>
  );
});

function nameOptions(
  names: string[],
  current: string,
  hintOf?: (name: string) => string | undefined,
  processOf?: (name: string) => string | undefined,
): FilterOption[] {
  const proc = processOf?.(current);
  const pool =
    proc === undefined ? names : names.filter((name) => processOf?.(name) === proc);
  const all = pool.includes(current) || current === "" ? pool : [current, ...pool];

  return all.map((name) => ({ value: name, label: name, hint: hintOf?.(name) }));
}

function PhaseBlock({
  t,
  phase,
  title,
  hint,
  kind,
  options,
  refs,
  budget,
  field,
  value,
  names,
  hintOf,
  processOf,
  pairable,
  issue,
  level,
  last,
  onChange,
  onKind,
}: {
  t: Translate;
  phase: RoutePhase;
  title: string;
  hint: string;
  kind: ListKind;
  options: FilterOption<ListKind>[];
  refs: InspectorRef[];
  budget: PhaseBudget;
  field: ListKey;
  value: Doc;
  names: string[];
  hintOf?: (name: string) => string | undefined;
  processOf?: (name: string) => string | undefined;
  pairable?: (name: string) => boolean;
  issue: (name: string) => NameIssue;
  level: "server" | "location";
  last?: boolean;
  onChange: (next: Doc) => void;
  onKind: (next: ListKind) => void;
}) {
  const own = kind === "override";

  const empty = own
    ? t(
        names.length === 0
          ? "routeSettings.emptyNoNames"
          : level === "server"
            ? "routeSettings.emptyListServer"
            : "routeSettings.emptyList",
      )
    : kind === "none"
      ? t("routeSettings.noneList")
      : t("routeSettings.inheritedEmpty");

  return (
    <TableBlock
      title={title}
      label={hint}
      kindLabel={t("routeSettings.listKind")}
      kind={kind}
      options={options}
      onKind={onKind}
      scroll
      last={last}
    >
      <InspectTable
        t={t}
        phase={phase}
        refs={refs}
        empty={empty}
        names={names}
        hintOf={hintOf}
        processOf={processOf}
        pairable={pairable}
        issue={issue}
        deadlineMs={budget.ms}
        budget={{
          own: budget.own,
          from: budget.from,
          set: (ms) => onChange(setKey(value, DEADLINE_KEY[phase], ms)),
          drop: () => onChange(setKey(value, DEADLINE_KEY[phase], undefined)),
        }}
        onChange={own ? (next) => onChange(setKey(value, field, next)) : undefined}
      />
    </TableBlock>
  );
}

function modeOptions(
  t: Translate,
  mode: InspectorMode | undefined,
): FilterOption<InspectorMode>[] {
  const shown: InspectorMode[] = mode === "ignore" ? [...MODES, "ignore"] : [...MODES];
  return shown.map((item) => ({ value: item, label: t(`routeSettings.modeValue.${item}`) }));
}

function resumeOptions(t: Translate): FilterOption<InspectorResume>[] {
  return RESUMES.map((item) => ({
    value: item,
    label: t(`routeSettings.resumeValue.${item}`),
  }));
}

function keepOptions(t: Translate): FilterOption<"off" | "on">[] {
  return [
    { value: "off", label: t("routeSettings.keepValue.off") },
    { value: "on", label: t("routeSettings.keepValue.on") },
  ];
}

function WaveMark({
  t,
  wave,
  joined,
  first,
  onJoin,
}: {
  t: Translate;
  wave: number;
  joined: boolean;
  first: boolean;
  onJoin?: (joined: boolean) => void;
}) {
  const label = String(wave);
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 20,
    px: 0.5,
    borderRadius: "3px",
    fontSize: "0.7rem",
    fontWeight: 700,
    lineHeight: 1,
    border: 1,
  } as const;

  if (onJoin === undefined || first) {
    return (
      <Tooltip arrow title={first ? t("routeSettings.waveFirst") : ""}>
        <Box
          component="span"
          sx={{ ...base, borderColor: "divider", color: "text.secondary" }}
        >
          {label}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      arrow
      title={t(joined ? "routeSettings.waveSplit" : "routeSettings.waveJoin", {
        n: label,
      })}
    >
      <Box
        component="span"
        role="button"
        tabIndex={0}
        aria-label={t("routeSettings.order")}
        onClick={() => onJoin(!joined)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onJoin(!joined);
          }
        }}
        sx={{
          ...base,
          cursor: "pointer",
          borderColor: joined ? "primary.main" : "divider",
          color: joined ? "primary.main" : "text.secondary",
          bgcolor: (theme) =>
            joined ? alpha(theme.palette.primary.main, 0.1) : "transparent",
          "&:hover": { borderColor: "primary.main", color: "primary.main" },
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );
}

function frameWord(stream: InspectorStream | undefined): string {
  switch (stream) {
    case "s2c":
      return "frame:s2c";
    case "both":
      return "frame";
    default:
      return "frame:c2s";
  }
}

function streamOptions(t: Translate): FilterOption<InspectorStream>[] {
  return STREAMS.map((item) => ({
    value: item,
    label: t(`routeSettings.streamValue.${item}`),
  }));
}

function inspectLine(phase: RoutePhase, row: InspectorRef, conds: Cond[]): string {
  const parts = [phase === "frame" ? frameWord(row.stream) : phase, row.name, `wave=${String(row.wave ?? 0)}`];
  if (typeof row.timeoutMs === "number") {
    parts.push(`timeout=${String(row.timeoutMs)}ms`);
  }
  if (row.mode !== undefined && row.mode !== "active") {
    parts.push(`mode=${row.mode}`);
  }
  if (row.keep === true && phase === "request") {
    parts.push("keep=on");
  }
  if (row.resume !== undefined && row.resume !== "off" && phase === "response") {
    parts.push(`resume=${row.resume}`);
  }
  return `waf_inspect ${parts.join(" ")}${condTail(conds)};`;
}

function EmptyCell({ width }: { width: number }) {
  return <TableCell sx={{ ...headCellSx, width, minWidth: width }} />;
}

const headActionSx = { display: "flex", justifyContent: "flex-end", width: "100%" } as const;

const rowActionsSx = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 0.5,
  width: "100%",
} as const;

const lockedTextSx = {
  width: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: "text.disabled",
} as const;

const lockedUnsetSx = { ...lockedTextSx, opacity: 0.55 } as const;

function LockedCell({
  text,
  unset,
  width,
}: {
  text: string;
  unset?: boolean;
  width: number;
}) {
  return (
    <FilterCell width={width}>
      <Box sx={unset === true ? lockedUnsetSx : lockedTextSx}>{text}</Box>
    </FilterCell>
  );
}

const LockedRow = memo(function LockedRow({
  t,
  row,
  first,
  pairable,
  withKeep,
  withResume,
  withStream,
}: {
  t: Translate;
  row: InspectorRef;
  first: boolean;
  pairable?: (name: string) => boolean;
  withKeep: boolean;
  withResume: boolean;
  withStream: boolean;
}) {
  const paired = pairable?.(row.name) ?? true;
  const tail = callTail(row);

  return (
    <TableRow data-rule="">
      <FilterCell width={W.order}>
        <WaveMark t={t} wave={row.wave ?? 0} joined={false} first={first} />
      </FilterCell>
      <LockedCell text={row.name} width={W.name} />
      <LockedCell
        text={
          row.timeoutMs === undefined
            ? t("routeSettings.timeoutInherit")
            : formatTime(row.timeoutMs)
        }
        unset={row.timeoutMs === undefined}
        width={W.timeout}
      />
      <LockedCell
        text={t(`routeSettings.modeValue.${row.mode ?? "active"}`)}
        width={W.mode}
      />
      {withKeep &&
        (paired || row.keep === true ? (
          <LockedCell
            text={t(`routeSettings.keepValue.${row.keep === true ? "on" : "off"}`)}
            width={W.pair}
          />
        ) : (
          <PairlessCell hint={t("routeSettings.keepNone")} />
        ))}
      {withResume &&
        (paired || (row.resume !== undefined && row.resume !== "off") ? (
          <LockedCell
            text={t(`routeSettings.resumeValue.${row.resume ?? "off"}`)}
            width={W.pair}
          />
        ) : (
          <PairlessCell hint={t("routeSettings.resumeNone")} />
        ))}
      {withStream && (
        <LockedCell
          text={t(`routeSettings.streamValue.${row.stream ?? "c2s"}`)}
          unset={row.stream === undefined}
          width={W.stream}
        />
      )}
      <FilterCell width={W.actions}>
        <Box sx={rowActionsSx}>
          {tail !== "" && (
            <TableIconButton
              color="info"
              icon={<SettingsOutlinedIcon />}
              disabled
              tooltip={tail}
              aria-label={t("routeSettings.call")}
            />
          )}
        </Box>
      </FilterCell>
    </TableRow>
  );
});

const InspectRow = memo(function InspectRow({
  t,
  row,
  index,
  first,
  joined,
  names,
  hintOf,
  processOf,
  pairable,
  withKeep,
  withResume,
  withStream,
  drag,
  onJoin,
  onRename,
  onPatch,
  onCall,
  onDelete,
}: {
  t: Translate;
  row: InspectorRef;
  index: number;
  first: boolean;
  joined: boolean;
  names: string[];
  hintOf?: (name: string) => string | undefined;
  processOf?: (name: string) => string | undefined;
  pairable?: (name: string) => boolean;
  withKeep: boolean;
  withResume: boolean;
  withStream: boolean;
  drag: DragApi;
  onJoin: (index: number, joined: boolean) => void;
  onRename: (index: number, name: string) => void;
  onPatch: (index: number, edit: (row: InspectorRef) => void) => void;
  onCall: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const options = useMemo(
    () => nameOptions(names, row.name, hintOf, processOf),
    [hintOf, names, processOf, row.name],
  );
  const paired = pairable?.(row.name) ?? true;
  const tail = callTail(row);

  return (
    <TableRow data-rule="" sx={dragSx(drag, index)}>
      <GripCell index={index} drag={drag} width={W.order} title={t("routeSettings.drag")}>
        <WaveMark
          t={t}
          wave={row.wave ?? 0}
          joined={joined}
          first={first}
          onJoin={(on) => onJoin(index, on)}
        />
      </GripCell>
      <FilterSelect
        value={row.name}
        width={W.name}
        options={options}
        onChange={(name) => onRename(index, name)}
      />
      <DraftCell
        value={formatTime(row.timeoutMs)}
        placeholder={t("routeSettings.timeoutInherit")}
        width={W.timeout}
        onChange={(raw) =>
          onPatch(index, (next) => {
            const ms = parseTime(raw);
            if (ms === undefined) {
              delete next.timeoutMs;
            } else {
              next.timeoutMs = ms;
            }
          })
        }
      />
      <FilterSelect
        value={row.mode ?? "active"}
        width={W.mode}
        options={modeOptions(t, row.mode)}
        unset="active"
        onChange={(mode) =>
          onPatch(index, (next) => {
            if (mode === "active") {
              delete next.mode;
            } else {
              next.mode = mode;
            }
          })
        }
      />
      {withKeep &&
        (paired || row.keep === true ? (
          <FilterSelect
            value={row.keep === true ? "on" : "off"}
            width={W.pair}
            options={keepOptions(t)}
            unset="off"
            onChange={(keep) =>
              onPatch(index, (next) => {
                if (keep === "on") {
                  next.keep = true;
                } else {
                  delete next.keep;
                }
              })
            }
          />
        ) : (
          <PairlessCell hint={t("routeSettings.keepNone")} />
        ))}
      {withResume &&
        (paired || (row.resume !== undefined && row.resume !== "off") ? (
          <FilterSelect
            value={row.resume ?? "off"}
            width={W.pair}
            options={resumeOptions(t)}
            unset="off"
            onChange={(resume) =>
              onPatch(index, (next) => {
                if (resume === "off") {
                  delete next.resume;
                } else {
                  next.resume = resume;
                }
              })
            }
          />
        ) : (
          <PairlessCell hint={t("routeSettings.resumeNone")} />
        ))}
      {withStream && (
        <FilterSelect
          value={row.stream ?? "c2s"}
          width={W.stream}
          options={streamOptions(t)}
          unset="c2s"
          onChange={(stream) =>
            onPatch(index, (next) => {
              if (stream === "c2s") {
                delete next.stream;
              } else {
                next.stream = stream;
              }
            })
          }
        />
      )}
      <FilterCell width={W.actions}>
        <Box sx={rowActionsSx}>
          <TableIconButton
            color={tail !== "" ? "info" : "primary"}
            icon={<SettingsOutlinedIcon />}
            tooltip={tail !== "" ? tail : t("routeSettings.call")}
            aria-label={t("routeSettings.call")}
            onClick={() => onCall(index)}
          />
          <TableIconButton
            color="error"
            icon={<DeleteIcon />}
            tooltip={t("common.delete")}
            onClick={() => onDelete(index)}
          />
        </Box>
      </FilterCell>
    </TableRow>
  );
});

function InspectTable({
  t,
  phase,
  refs: input,
  empty,
  names,
  hintOf,
  processOf,
  pairable,
  issue,
  deadlineMs,
  budget,
  onChange,
}: {
  t: Translate;
  phase: RoutePhase;
  refs: InspectorRef[];
  empty: string;
  names: string[];
  hintOf?: (name: string) => string | undefined;
  processOf?: (name: string) => string | undefined;
  pairable?: (name: string) => boolean;
  issue: (name: string) => NameIssue;
  deadlineMs: number;
  budget: BudgetEdit;
  onChange?: (next: InspectorRef[]) => void;
}) {
  const editable = onChange !== undefined;
  const refs = useMemo(() => ordered(input).map((row) => row.ref), [input]);
  const unused = names.filter((name) => !refs.some((row) => row.name === name));
  const withResume = phase === "response";
  const withKeep = phase === "request";
  const withStream = phase === "frame";
  const span = 6;
  const wrongPhase = uniqueNames(
    refs.filter((row) => issue(row.name) === "phase").map((row) => row.name),
  );
  const unknown = uniqueNames(
    refs.filter((row) => issue(row.name) === "unknown").map((row) => row.name),
  );

  const [callRow, setCallRow] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const live = useRef<{
    refs: InspectorRef[];
    onChange?: (next: InspectorRef[]) => void;
  }>({ refs, onChange });
  live.current.refs = refs;
  live.current.onChange = onChange;

  const setRefs = useCallback((next: InspectorRef[]) => {
    live.current.onChange?.(next);
  }, []);

  const drag = useRowDrag(refs.length, (from, to) =>
    setRefs(moveRef(live.current.refs, from, to)),
  );

  const addRow = (ref: InspectorRef) => {
    const rows = ordered(refs);
    const last = rows[rows.length - 1];
    setRefs(renumber([...rows, { ref, key: (last?.key ?? -1) + 1 }]));
  };

  const patch = useCallback(
    (index: number, edit: (row: InspectorRef) => void) => {
      setRefs(
        live.current.refs.map((item, i) => {
          if (i !== index) {
            return item;
          }
          const next = { ...item };
          edit(next);
          return next;
        }),
      );
    },
    [setRefs],
  );

  const rename = useCallback(
    (index: number, name: string) => {
      setRefs(
        live.current.refs.map((item, i) => (i === index ? { ...item, name } : item)),
      );
    },
    [setRefs],
  );

  const join = useCallback(
    (index: number, joined: boolean) => {
      setRefs(joinWave(live.current.refs, index, joined));
    },
    [setRefs],
  );

  const remove = useCallback(
    (index: number) => {
      setRefs(renumber(ordered(live.current.refs).filter((_, i) => i !== index)));
    },
    [setRefs],
  );

  const openCall = useCallback((index: number) => {
    setCallRow(index);
  }, []);

  return (
    <>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell
              label={t("routeSettings.order")}
              help={t("routeSettings.orderHint")}
              width={W.order}
            />
            <HeadCell
              label={t("routeSettings.inspector")}
              help={t("routeSettings.inspectorHint")}
              width={W.name}
            />
            <HeadCell
              label={t("routeSettings.timeout")}
              help={t("routeSettings.timeoutHint")}
              width={W.timeout}
            />
            <HeadCell
              label={t("routeSettings.mode")}
              help={t("routeSettings.modeHint")}
              width={W.mode}
            />
            {withKeep && (
              <HeadCell
                label={t("routeSettings.keep")}
                help={t("routeSettings.keepHint")}
                width={W.pair}
              />
            )}
            {withResume && (
              <HeadCell
                label={t("routeSettings.resume")}
                help={t("routeSettings.resumeHint")}
                width={W.pair}
              />
            )}
            {withStream && (
              <HeadCell
                label={t("routeSettings.stream")}
                help={t("routeSettings.streamHint")}
                width={W.stream}
              />
            )}
            {editable ? (
              <FilterCell width={W.actions}>
                <Box sx={headActionSx}>
                  <TableIconButton
                    color="success"
                    icon={<AddIcon />}
                    disabled={unused.length === 0}
                    tooltip={
                      names.length === 0
                        ? t("routeSettings.addNoNames")
                        : unused.length === 0
                          ? t("routeSettings.addAllUsed")
                          : t("routeSettings.addInspector")
                    }
                    onClick={() => setAddOpen(true)}
                  />
                </Box>
              </FilterCell>
            ) : (
              <EmptyCell width={W.actions} />
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {refs.length === 0 && (
            <TableNoticeRow colSpan={span} kind="empty" message={empty} />
          )}
          {refs.map((row, index) =>
            editable ? (
              <InspectRow
                key={`${row.name}-${index}`}
                t={t}
                row={row}
                index={index}
                first={index === 0}
                joined={index > 0 && (row.wave ?? 0) === (refs[index - 1]?.wave ?? 0)}
                names={names}
                hintOf={hintOf}
                processOf={processOf}
                pairable={pairable}
                withKeep={withKeep}
                withResume={withResume}
                withStream={withStream}
                drag={drag}
                onJoin={join}
                onRename={rename}
                onPatch={patch}
                onCall={openCall}
                onDelete={remove}
              />
            ) : (
              <LockedRow
                key={`${row.name}-${index}`}
                t={t}
                row={row}
                first={index === 0}
                pairable={pairable}
                withKeep={withKeep}
                withResume={withResume}
                withStream={withStream}
              />
            ),
          )}
          {wrongPhase.length > 0 && (
            <TableNoticeRow
              colSpan={span}
              severity="warning"
              title={t("routeSettings.wrongPhaseTitle")}
              message={t("routeSettings.wrongPhase", { names: wrongPhase.join(", ") })}
            />
          )}
          {unknown.length > 0 && (
            <TableNoticeRow
              colSpan={span}
              severity="warning"
              title={t("routeSettings.unknownNameTitle")}
              message={t("routeSettings.unknownName", { names: unknown.join(", ") })}
            />
          )}
        </TableBody>
      </Table>
      {refs.length > 0 && (
        <Box sx={{ px: BLEED, py: 1.25, borderTop: 1, borderColor: "divider" }}>
          <WaveBudget rows={toWaveRows(refs)} deadlineMs={deadlineMs} edit={budget} />
        </Box>
      )}
      {editable && callRow !== null && refs[callRow] !== undefined && (
        <CallDialog
          t={t}
          phase={phase}
          row={refs[callRow] as InspectorRef}
          onClose={() => setCallRow(null)}
          onApply={(conds) => {
            setRefs(refs.map((item, i) => (i === callRow ? withConds(item, conds) : item)));
            setCallRow(null);
          }}
        />
      )}
      {editable && (
        <AddInspectorDialog
          t={t}
          open={addOpen}
          phase={phase}
          names={unused}
          hintOf={hintOf}
          pairable={pairable}
          onClose={() => setAddOpen(false)}
          onAdd={(ref) => {
            setAddOpen(false);
            addRow(ref);
          }}
        />
      )}
    </>
  );
}

function CallDialog({
  t,
  phase,
  row,
  onClose,
  onApply,
}: {
  t: Translate;
  phase: RoutePhase;
  row: InspectorRef;
  onClose: () => void;
  onApply: (conds: Cond[]) => void;
}) {
  const [conds, setConds] = useState<Cond[]>(condsDraft(row.conds ?? []));

  const done = readyConds(conds);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("routeSettings.callTitle", { name: row.name })}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(done)}>{t("common.apply")}</Modal.Submit>
        </>
      }
    >
      <DialogSection
        title={t("routeSettings.condsBlock")}
        summary={
          done.length === 0
            ? t("routeSettings.condsSummaryAny")
            : t("routeSettings.condsSummary", { count: done.length })
        }
      >
        <DialogAlert text={t("routeSettings.condsAlert")} help={CONDS_HELP} />
        <CondTable t={t} conds={conds} onChange={setConds} />
      </DialogSection>
      <DialogLines title={t("cond.lineTitle")} lines={[inspectLine(phase, row, done)]} />
    </Modal>
  );
}

function PairlessCell({ hint }: { hint: string }) {
  return (
    <FilterCell width={W.pair}>
      <Tooltip arrow title={hint}>
        <Box sx={{ color: "text.disabled", fontSize: "0.75rem", width: "100%" }}>—</Box>
      </Tooltip>
    </FilterCell>
  );
}

function AddInspectorDialog({
  t,
  open,
  phase,
  names,
  hintOf,
  pairable,
  onClose,
  onAdd,
}: {
  t: Translate;
  open: boolean;
  phase: RoutePhase;
  names: string[];
  hintOf?: (name: string) => string | undefined;
  pairable?: (name: string) => boolean;
  onClose: () => void;
  onAdd: (ref: InspectorRef) => void;
}) {
  const [name, setName] = useState("");
  const [timeoutRaw, setTimeoutRaw] = useState("");
  const [mode, setMode] = useState<InspectorMode>("active");
  const [keep, setKeep] = useState<"off" | "on">("off");
  const [resume, setResume] = useState<InspectorResume>("off");
  const [stream, setStream] = useState<InspectorStream>("c2s");

  useEffect(() => {
    if (open) {
      setName("");
      setTimeoutRaw("");
      setMode("active");
      setKeep("off");
      setResume("off");
      setStream("c2s");
    }
  }, [open]);

  const timeoutOk = timeoutRaw.trim() === "" || parseTime(timeoutRaw) !== undefined;
  const paired = name !== "" && (pairable?.(name) ?? true);
  const ok = name !== "" && timeoutOk;

  const build = (): InspectorRef => {
    const ref: InspectorRef = { name };
    const ms = parseTime(timeoutRaw);
    if (ms !== undefined) {
      ref.timeoutMs = ms;
    }
    if (mode !== "active") {
      ref.mode = mode;
    }
    if (phase === "request" && paired && keep === "on") {
      ref.keep = true;
    }
    if (phase === "response" && paired && resume !== "off") {
      ref.resume = resume;
    }
    if (phase === "frame" && stream !== "c2s") {
      ref.stream = stream;
    }
    return ref;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("routeSettings.addInspector")}
      hint={t("routeSettings.addDialogHint")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ok} onClick={() => onAdd(build())}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("routeSettings.inspector")}
            </Typography>
            <Picker
              value={name}
              onChange={setName}
              placeholder={t("routeSettings.addPick")}
              options={names.map((item) => ({ value: item, hint: hintOf?.(item) }))}
            />
          </Box>
          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small"
              label={t("routeSettings.timeout")}
              value={timeoutRaw}
              placeholder={t("routeSettings.timeoutInherit")}
              error={!timeoutOk}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => setTimeoutRaw(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              select
              label={t("routeSettings.mode")}
              value={mode}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) =>
                setMode(isMode(e.target.value) && e.target.value !== "ignore" ? e.target.value : "active")
              }
              sx={{ flex: 1 }}
            >
              {modeOptions(t, undefined).map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
            {phase === "request" && paired && (
              <TextField
                size="small"
                select
                label={t("routeSettings.keep")}
                value={keep}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setKeep(e.target.value === "on" ? "on" : "off")}
                sx={{ flex: 1 }}
              >
                {keepOptions(t).map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {phase === "response" && paired && (
              <TextField
                size="small"
                select
                label={t("routeSettings.resume")}
                value={resume}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) =>
                  setResume(isResume(e.target.value) ? e.target.value : "off")
                }
                sx={{ flex: 1 }}
              >
                {resumeOptions(t).map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {phase === "frame" && (
              <TextField
                size="small"
                select
                label={t("routeSettings.stream")}
                value={stream}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setStream(isStream(e.target.value) ? e.target.value : "c2s")}
                sx={{ flex: 1 }}
              >
                {streamOptions(t).map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </Stack>
    </Modal>
  );
}
