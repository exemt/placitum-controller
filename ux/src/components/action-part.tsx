import { useEffect, useState, type ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import {
  MARKER_MAX_BYTES,
  RECORD_OBJECTS,
  axesFor,
  fetchCounterShared,
  markerError,
  type ActionRegistry,
  type InspectorMeta,
  type RecordObject,
  type RecordObjectName,
} from "../api.ts";
import {
  ARCHIVE_OUTCOMES,
  sizeBytes,
  whenSummaryKey,
  type ArchiveOutcome,
} from "../config/directive-tail.ts";
import { formatSize } from "../pages/config-fields.tsx";
import {
  DialogAlert,
  DialogInput,
  DialogPick,
  DialogSection,
  DialogWhen,
} from "./dialog-kit.tsx";
import { Presets } from "./settings-table.tsx";
import { useAppSelector } from "../store/hooks.ts";
import { ACTION_CODE_RE, axisLabel, verbLabel } from "./action-select.tsx";

export const GROUP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
import { useT, type Translate } from "../i18n/index.ts";

export const TO_DATASET = "dataset";

export const BROADCAST = "*";

export const TO_MODULE = "module";

export const TO_SCORE = "score";

export const POINTS_MAX = 100;

export const ARCHIVE_LIMIT_MAX = 1073741824;

const SIZE_PRESETS = ["8k", "64k", "256k", "1m"] as const;

const TTL_PRESETS = ["1h", "12h", "1d", "7d", "30d"] as const;

export function isRouteVerb(verb: string): boolean {
  return isAuditVerb(verb) || verb === "mark";
}

export function isAuditVerb(verb: string): boolean {
  return verb === "audit" || verb === "archive";
}

export function isControlVerb(verb: string): boolean {
  return verb === "active" || verb === "passive" || verb === "vote" || verb === "off";
}

export const ASK_PHASES = ["request", "response", "frame"] as const;

export function phaseSummary(t: Translate, ask: { phase?: string | null }): string[] {
  const phase = ask.phase ?? "";

  return phase === "" ? [] : [t(`actions.phase.${phase}`)];
}

export interface RecordDraft {
  on: boolean;
  size: string;
  source: "store" | "original";
}

export type RecordDrafts = Record<RecordObjectName, RecordDraft>;

export function emptyRecordDrafts(): RecordDrafts {
  return {
    headers: { on: false, size: "", source: "store" },
    args: { on: false, size: "", source: "store" },
    body: { on: false, size: "", source: "store" },
  };
}

export function recordDraftsOf(ask: {
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
}): RecordDrafts {
  const out = emptyRecordDrafts();

  for (const name of RECORD_OBJECTS) {
    const spec = ask[name];

    if (spec === undefined || spec === null || spec.set === "off") {
      continue;
    }

    out[name] = {
      on: true,
      size: spec.limit !== null && spec.limit > 0 ? formatSize(spec.limit) : "",
      source: spec.source === "original" ? "original" : "store",
    };
  }

  return out;
}

export function recordObjectsPayload(
  record: RecordDrafts,
): Record<RecordObjectName, RecordObject | null> {
  const out = {} as Record<RecordObjectName, RecordObject | null>;

  for (const name of RECORD_OBJECTS) {
    const d = record[name];

    out[name] = d.on
      ? { set: "", limit: sizeBytes(d.size) ?? null, source: d.source }
      : null;
  }

  return out;
}

export function recordDraftsReady(_verb: string, record: RecordDrafts): boolean {
  for (const name of RECORD_OBJECTS) {
    const d = record[name];

    if (!d.on) {
      continue;
    }

    const bytes = sizeBytes(d.size);

    if (d.size.trim() !== "" && (bytes === undefined || bytes <= 0 || bytes > ARCHIVE_LIMIT_MAX)) {
      return false;
    }
  }

  return true;
}

export const THRESHOLD_PERCENT_MIN = -100;
export const THRESHOLD_PERCENT_MAX = 900;

export interface ActionDraft {
  target: string;
  verb: string;
  axis: string;
  direction: "stricter" | "softer";
  percent: string;
  noteDir: "add" | "cut";
  notePercent: string;
  counter: string;
  group: string;
  phase: string;
  set: "on" | "off";
  marker: string;
  record: RecordDrafts;
  archiveTtl: string;
  archiveWhen: ArchiveOutcome[];

  list: string;
  write: string;
  ttl: string;

  scoreDir: "add" | "cut";
  scorePoints: string;

  code: string;
}

export function emptyActionDraft(): ActionDraft {
  return {
    target: "",
    verb: "",
    axis: "",
    direction: "stricter",
    percent: "",
    noteDir: "add",
    notePercent: "",
    counter: "",
    group: "",
    phase: "",
    set: "on",
    marker: "",
    record: emptyRecordDrafts(),
    archiveTtl: "",
    archiveWhen: [],
    list: "",
    write: "addr",
    ttl: "",
    scoreDir: "add",
    scorePoints: "",
    code: "",
  };
}

export function draftOfAsk(ask: {
  to?: string | null;
  do?: string | null;
  apply?: string | null;
  delta?: number | null;
  value?: number | null;
  counter?: string | null;
  group?: string | null;
  phase?: string | null;
  set?: string | null;
  marker?: string | null;
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  ttlS?: number | null;
  when?: readonly string[] | null;
  code?: string | null;
}): ActionDraft {
  const out = emptyActionDraft();

  out.verb = ask.do ?? "";
  out.target = isRouteVerb(out.verb)
    ? TO_MODULE
    : (ask.to ?? "") === "" ? BROADCAST : (ask.to as string);

  if (out.verb === "score") {
    out.target = TO_SCORE;
    out.verb = "";
    out.scoreDir = (ask.value ?? 0) >= 0 ? "add" : "cut";
    out.scorePoints = String(Math.abs(ask.value ?? 0));
    out.code = ask.code ?? "";

    return out;
  }
  out.axis = ask.apply ?? "";
  out.counter = ask.counter ?? "";
  out.group = ask.group ?? "";
  out.phase = ask.phase ?? "";
  out.set = ask.set === "off" ? "off" : "on";
  out.marker = ask.marker ?? "";
  out.record = recordDraftsOf(ask);
  out.archiveTtl = (ask.ttlS ?? 0) > 0 ? humanTtl(ask.ttlS as number) : "";
  out.archiveWhen = ARCHIVE_OUTCOMES.filter((name) => (ask.when ?? []).includes(name));
  out.code = ask.code ?? "";

  if (ask.delta !== null && ask.delta !== undefined) {
    out.direction = ask.delta >= 0 ? "stricter" : "softer";
    out.percent = String(Math.abs(ask.delta));
  }

  if (ask.value !== null && ask.value !== undefined) {
    out.noteDir = ask.value >= 0 ? "add" : "cut";
    out.notePercent = String(Math.abs(ask.value));
  }

  return out;
}

export function draftOfList(row: {
  list: string;
  write?: string;
  ttlS: number;
  code?: string | null;
}): ActionDraft {
  const out = emptyActionDraft();

  out.target = TO_DATASET;
  out.list = row.list;
  out.write = row.write === undefined || row.write === "" ? "addr" : row.write;
  out.ttl = row.ttlS === 0 ? "" : humanTtl(row.ttlS);
  out.code = row.code ?? "";

  return out;
}

export function humanTtl(seconds: number): string {
  if (seconds % 86400 === 0) {
    return `${seconds / 86400}d`;
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
}

export function ttlSeconds(raw: string): number {
  const value = raw.trim().toLowerCase();

  if (value === "") {
    return 0;
  }

  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const mult = units[value.slice(-1)];
  const digits = mult === undefined ? value : value.slice(0, -1);
  const n = Number(digits);

  if (!Number.isInteger(n) || n <= 0) {
    return 0;
  }

  return n * (mult ?? 1);
}

function numberOk(raw: string, min: number, max: number): boolean {
  if (raw.trim() === "") {
    return false;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= min && n <= max;
}

function serviceOf(row: InspectorMeta): string {
  return row.subject.split(".").pop() || row.name;
}

export function verbsOf(
  registry: ActionRegistry | null,
  inspectors: InspectorMeta[],
  target: string,
  only?: readonly string[],
): string[] {
  const all = registry?.verbs ?? [];

  if (target === TO_MODULE) {
    return all
      .filter(
        (row) =>
          row.route === true && row.do !== "score" && (only === undefined || only.includes(row.do)),
      )
      .map((row) => row.do);
  }

  if (target === BROADCAST) {
    return all
      .filter(
        (row) => row.module !== true && (row.listeners.length === 0 || row.listeners.length > 1),
      )
      .map((row) => row.do);
  }

  const found = inspectors.find((row) => row.name === target);
  const service = found === undefined ? target : serviceOf(found);

  return all
    .filter(
      (row) =>
        row.route !== true &&
        (row.module === true ||
          row.listeners.length === 0 ||
          row.listeners.includes(service) ||
          row.listeners.includes(target)),
    )
    .map((row) => row.do);
}

export function verbMenuItems(
  t: Translate,
  registry: ActionRegistry | null,
  verbs: readonly string[],
  current = "",
): ReactNode[] {
  const shown = current !== "" && !verbs.includes(current) ? [...verbs, current] : verbs;
  const isRoute = (verb: string): boolean =>
    registry?.verbs.find((row) => row.do === verb)?.route === true;
  const isMode = (verb: string): boolean =>
    !isRoute(verb) && registry?.verbs.find((row) => row.do === verb)?.module === true;
  const routes = shown.filter(isRoute);
  const modes = shown.filter(isMode);
  const asks = shown.filter((verb) => !isMode(verb) && !isRoute(verb));
  const headSx = { fontSize: "0.68rem", lineHeight: 2 };
  const item = (verb: string) => (
    <MenuItem key={verb} value={verb}>
      {verbLabel(t, verb)}
    </MenuItem>
  );

  const out: ReactNode[] = [];

  if (routes.length > 0) {
    out.push(
      <ListSubheader key="group-record" disableSticky sx={headSx}>
        {t("actions.group.record")}
      </ListSubheader>,
      ...routes.map(item),
    );
  }

  if (modes.length > 0) {
    out.push(
      <ListSubheader key="group-mode" disableSticky sx={headSx}>
        {t("actions.group.mode")}
      </ListSubheader>,
      ...modes.map(item),
    );
  }

  if (modes.length > 0 && asks.length > 0) {
    out.push(
      <ListSubheader
        key="group-ask"
        disableSticky
        sx={{ ...headSx, mt: 0.5, borderTop: 1, borderColor: "divider" }}
      >
        {t("actions.group.ask")}
      </ListSubheader>,
    );
  }

  out.push(...asks.map(item));

  return out;
}

export interface ActionReadyOptions {
  askable: boolean;
  ttlRequired?: boolean;
  extraReady?: (target: string) => boolean | undefined;
}

export function actionReady(draft: ActionDraft, opts: ActionReadyOptions): boolean {
  if (draft.code !== "" && !ACTION_CODE_RE.test(draft.code)) {
    return false;
  }

  if (draft.target === TO_DATASET) {
    if (draft.list === "") {
      return false;
    }

    if ((opts.ttlRequired ?? true) && ttlSeconds(draft.ttl) <= 0) {
      return false;
    }

    return draft.ttl.trim() === "" || ttlSeconds(draft.ttl) > 0;
  }

  if (draft.target === TO_SCORE) {
    return numberOk(draft.scorePoints, 1, POINTS_MAX);
  }

  if (opts.extraReady !== undefined) {
    const extra = opts.extraReady(draft.target);

    if (extra !== undefined) {
      return extra;
    }
  }

  if (!opts.askable || draft.target === "" || draft.verb === "") {
    return false;
  }

  if (draft.verb === "mutate" && !GROUP_NAME_RE.test(draft.group.trim())) {
    return false;
  }

  if (draft.verb === "mark" && markerError(draft.marker) !== null) {
    return false;
  }

  if (isAuditVerb(draft.verb) && draft.set === "on") {
    if (draft.verb === "archive" && draft.archiveTtl.trim() !== "" && ttlSeconds(draft.archiveTtl) <= 0) {
      return false;
    }

    if (!recordDraftsReady(draft.verb, draft.record)) {
      return false;
    }
  }

  if (draft.verb === "threshold") {
    const cap =
      draft.direction === "softer" ? -THRESHOLD_PERCENT_MIN : THRESHOLD_PERCENT_MAX;

    return numberOk(draft.percent, 1, cap);
  }

  if (draft.verb === "note") {
    return numberOk(draft.notePercent, 1, 100);
  }

  return true;
}

export function askPayload(
  draft: ActionDraft,
  registry: ActionRegistry | null,
): {
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  group: string;
  phase: string;
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  ttlS: number;
  when: ArchiveOutcome[];
} {
  const axes = axesFor(registry, draft.verb === "" ? [] : [draft.verb]);
  const scoring = draft.target === TO_SCORE;
  const recording = isAuditVerb(draft.verb) && draft.set === "on";
  const archiving = draft.verb === "archive" && draft.set === "on";
  const objects = recording
    ? recordObjectsPayload(draft.record)
    : { headers: null, args: null, body: null };

  const apply = draft.axis !== "" ? draft.axis : (axes[0] ?? "");

  const out = {
    to: draft.target === BROADCAST || draft.target === TO_MODULE || scoring ? "" : draft.target,
    do: scoring ? "score" : draft.verb,
    apply: scoring ? "request" : apply,
    delta: null as number | null,
    value: null as number | null,
    counter: draft.verb === "note" ? draft.counter.trim() : "",
    group: draft.verb === "mutate" ? draft.group.trim() : "",
    phase: isControlVerb(draft.verb) ? draft.phase : "",
    set: draft.verb === "mutate" || isAuditVerb(draft.verb) ? draft.set : ("" as const),
    marker: draft.verb === "mark" ? draft.marker.trim() : "",
    headers: objects.headers,
    args: apply === "response" ? null : objects.args,
    body: objects.body,
    ttlS: archiving ? ttlSeconds(draft.archiveTtl) : 0,
    when: archiving ? [...draft.archiveWhen] : [],
  };

  if (draft.verb === "threshold") {
    const magnitude = Number(draft.percent);

    out.delta = draft.direction === "softer" ? -magnitude : magnitude;
  }

  if (draft.verb === "note") {
    const magnitude = Number(draft.notePercent);

    out.value = draft.noteDir === "cut" ? -magnitude : magnitude;
  }

  if (scoring) {
    const magnitude = Number(draft.scorePoints);

    out.value = draft.scoreDir === "cut" ? -magnitude : magnitude;
  }

  return out;
}

export interface TargetOption {
  value: string;
  label: string;
}

export function AuditFields({
  verb,
  axis,
  set,
  record,
  ttl,
  when,
  frame = false,
  onChange,
}: {
  verb: string;
  axis: string;
  set: "on" | "off";
  record: RecordDrafts;
  ttl: string;
  when: ArchiveOutcome[];
  frame?: boolean;
  onChange: (patch: {
    axis?: string;
    set?: "on" | "off";
    record?: RecordDrafts;
    ttl?: string;
    when?: ArchiveOutcome[];
  }) => void;
}) {
  const t = useT();

  if (!isAuditVerb(verb)) {
    return null;
  }

  const audit = verb === "audit";
  const response = axis === "response";
  const onLabel = audit ? t("actions.audit.write") : t("actions.audit.keep");
  const offLabel = audit ? t("actions.audit.skip") : t("actions.audit.drop");
  const patchObject = (name: RecordObjectName, part: Partial<RecordDraft>) =>
    onChange({ record: { ...record, [name]: { ...record[name], ...part } } });

  const sourceOptions = [
    { value: "store" as const, label: t("tail.sourceCapture"), hint: t("tail.sourceCaptureHint") },
    { value: "original" as const, label: t("tail.sourceOriginal"), hint: t("tail.sourceOriginalHint") },
  ];

  const sizeRow = (name: RecordObjectName, d: RecordDraft) => (
    <DialogInput
      label={audit ? t("tail.budget") : t("tail.archiveSize")}
      hint={audit ? t("actions.audit.budgetHint") : t("actions.audit.sizeHint")}
      value={d.size}
      placeholder={t("tail.whole")}
      end={
        <Presets
          keep
          items={[
            { label: t("tail.whole"), value: "" },
            ...SIZE_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.size}
          onPick={(next) => patchObject(name, { size: next === d.size ? "" : next })}
        />
      }
      onChange={(size) => patchObject(name, { size })}
    />
  );

  const sourceRow = (name: RecordObjectName, d: RecordDraft) => (
    <>
      <DialogPick
        label={t("tail.source")}
        hint={t("actions.audit.sourceHint")}
        value={d.source}
        options={sourceOptions}
        onChange={(source) => patchObject(name, { source })}
      />
      <DialogAlert
        tone={d.source === "original" ? "warning" : "info"}
        text={t(
          d.source === "original"
            ? "tail.alert.sourceOriginal"
            : "actions.audit.alertSourceCapture",
        )}
      />
    </>
  );

  const objectBlock = (name: RecordObjectName) => {
    const d = record[name];

    return (
      <DialogSection
        key={name}
        title={t(`tail.objects.${name}`)}
        hint={t("actions.audit.objectShort")}
        summary={
          d.on
            ? [
                d.size === "" ? t("tail.whole") : d.size,
                t(d.source === "original" ? "tail.sourceOriginal" : "tail.sourceCapture"),
              ].join(" · ")
            : t("actions.audit.objectAsRoute")
        }
        checked={d.on}
        onCheck={(on) => patchObject(name, { on })}
        defaultOpen={d.on}
      >
        {audit ? (
          <>
            {sizeRow(name, d)}
            {sourceRow(name, d)}
          </>
        ) : (
          <>
            {sourceRow(name, d)}
            {sizeRow(name, d)}
          </>
        )}
      </DialogSection>
    );
  };

  return (
    <>
      {!frame && (
        <TextField
          select
          size="small"
          label={t("actions.audit.record")}
          value={response ? "response" : "request"}
          onChange={(e) =>
            onChange({
              axis: e.target.value,
              record:
                e.target.value === "response"
                  ? { ...record, args: emptyRecordDrafts().args }
                  : record,
            })
          }
          helperText={t("actions.audit.recordHint")}
        >
          <MenuItem value="request">{t("actions.audit.recordOf.request")}</MenuItem>
          <MenuItem value="response">{t("actions.audit.recordOf.response")}</MenuItem>
        </TextField>
      )}

      <TextField
        select
        size="small"
        label={t("actions.audit.set")}
        value={set}
        onChange={(e) => onChange({ set: e.target.value as "on" | "off" })}
      >
        <MenuItem value="on">{onLabel}</MenuItem>
        <MenuItem value="off">{offLabel}</MenuItem>
      </TextField>

      <DialogAlert
        tone={set === "on" ? "warning" : "info"}
        text={t(
          audit
            ? set === "on"
              ? "actions.audit.alertAuditOn"
              : "actions.audit.alertAuditOff"
            : set === "on"
              ? "actions.audit.alertArchiveOn"
              : "actions.audit.alertArchiveOff",
        )}
      />

      {set === "on" && (
        <>
          <DialogAlert
            text={audit ? t("actions.audit.objectsAuditHint") : t("actions.audit.objectsArchiveHint")}
          />
          <Stack spacing={1}>
            {RECORD_OBJECTS.filter((name) => !response || name !== "args").map(objectBlock)}
          </Stack>
          {!audit && (
            <>
              <DialogInput
                label={t("actions.audit.ttl")}
                hint={t("actions.audit.ttlHint")}
                value={ttl}
                placeholder="30d"
                end={
                  <Presets
                    keep
                    items={TTL_PRESETS.map((item) => ({ label: item, value: item }))}
                    current={ttl}
                    onPick={(next) => onChange({ ttl: next === ttl ? "" : next })}
                  />
                }
                onChange={(next) => onChange({ ttl: next })}
              />
              <DialogWhen
                label={t("actions.audit.when")}
                hint={t("actions.audit.whenHint")}
                value={when}
                onChange={(next) =>
                  onChange({ when: ARCHIVE_OUTCOMES.filter((name) => next.includes(name)) })
                }
              />
            </>
          )}
        </>
      )}
    </>
  );
}

export function auditSummary(
  t: Translate,
  ask: {
    do: string;
    set?: string | null;
    headers?: RecordObject | null;
    args?: RecordObject | null;
    body?: RecordObject | null;
    ttlS?: number | null;
    when?: readonly string[] | null;
    apply?: string | null;
  },
): string[] {
  if (!isAuditVerb(ask.do)) {
    return [];
  }

  const on = ask.set !== "off";
  const parts = [
    ...(ask.apply === "response" ? [t("actions.audit.recordResponse")] : []),
    ask.do === "audit"
      ? t(on ? "actions.audit.write" : "actions.audit.skip")
      : t(on ? "actions.audit.keep" : "actions.audit.drop"),
  ];

  if (on) {
    for (const name of RECORD_OBJECTS) {
      const spec = ask[name];

      if (spec === undefined || spec === null) {
        continue;
      }

      if (spec.set === "off") {
        parts.push(`${t(`tail.objects.${name}`)}: ${t("actions.audit.objectOff")}`);
        continue;
      }

      const bits = [t(`tail.objects.${name}`)];

      bits.push(spec.limit !== null && spec.limit > 0 ? formatSize(spec.limit) : t("tail.whole"));

      if (spec.source === "store" || spec.source === "original") {
        bits.push(t(spec.source === "store" ? "tail.sourceCapture" : "tail.sourceOriginal"));
      }

      parts.push(bits.join(" "));
    }

    if (ask.do === "archive" && (ask.ttlS ?? 0) > 0) {
      parts.push(humanTtl(ask.ttlS as number));
    }

    if (ask.do === "archive") {
      const when = ARCHIVE_OUTCOMES.filter((name) => (ask.when ?? []).includes(name));

      if (when.length > 0) {
        parts.push(t(whenSummaryKey(when)));
      }
    }
  }

  return parts;
}

export function ActionPart({
  draft,
  onChange,
  registry,
  inspectors,
  datasets,
  askable,
  broadcast = false,
  writable = true,
  writes,
  writeHint,
  ttlRequired = true,
  extraTargets = [],
  renderExtra,
  toHint,
  showCode = true,
  codeHint,
  moduleTarget = false,
  moduleVerbs,
  routeOnly = false,
  frame = false,
}: {
  draft: ActionDraft;
  onChange: (patch: Partial<ActionDraft>) => void;
  registry: ActionRegistry | null;
  inspectors: InspectorMeta[];
  moduleTarget?: boolean;
  moduleVerbs?: readonly string[];
  routeOnly?: boolean;
  frame?: boolean;
  datasets: TargetOption[];
  askable: boolean;
  broadcast?: boolean;
  writable?: boolean;
  writes?: TargetOption[];
  writeHint?: string;
  ttlRequired?: boolean;
  extraTargets?: TargetOption[];
  renderExtra?: (target: string) => ReactNode;
  toHint?: string;
  showCode?: boolean;
  codeHint?: string;
}) {
  const t = useT();
  const scope = useAppSelector((state) => state.session.scope);

  const [noteBuckets, setNoteBuckets] = useState<string[]>([]);

  useEffect(() => {
    if (draft.target !== "counter" || scope === null) {
      return;
    }

    let alive = true;

    fetchCounterShared(scope)
      .then((shared) => {
        if (alive) {
          setNoteBuckets(
            Object.keys(shared.counters)
              .filter((name) => shared.counters[name]?.fill === "note")
              .sort(),
          );
        }
      })
      .catch(() => {
      });

    return () => {
      alive = false;
    };
  }, [draft.target, scope]);

  const set = onChange;
  const writing = draft.target === TO_DATASET;
  const scoring = draft.target === TO_SCORE;
  const extra = extraTargets.some((row) => row.value === draft.target);
  const routeAsk =
    (askable || routeOnly)
    && moduleTarget
    && verbsOf(registry, inspectors, TO_MODULE, moduleVerbs).length > 0;
  const canAsk = askable || (routeOnly && draft.target === TO_MODULE);

  const verbs =
    writing || extra || draft.target === ""
      ? []
      : verbsOf(registry, inspectors, draft.target, moduleVerbs);
  const axes = axesFor(registry, draft.verb === "" ? [] : [draft.verb]);

  const targets = inspectors.filter(
    (row) => verbsOf(registry, inspectors, row.name).length > 0,
  );

  return (
    <>
      <TextField
        select
        size="small"
        label={t("outcomes.outcomeTo")}
        value={draft.target}
        onChange={(e) => {
          const target = e.target.value;

          if (
            target === TO_DATASET ||
            target === TO_SCORE ||
            extraTargets.some((row) => row.value === target)
          ) {
            set({ target, verb: "", axis: "" });

            return;
          }

          const still = verbsOf(registry, inspectors, target).includes(draft.verb);

          set({ target, verb: still ? draft.verb : "", axis: still ? draft.axis : "" });
        }}
        helperText={
          toHint ??
          (askable
            ? t("outcomes.outcomeToHint")
            : routeAsk
              ? t("outcomes.outcomeToDenyRouteHint")
              : t("outcomes.outcomeToDenyHint"))
        }
      >
        {askable && broadcast && (
          <MenuItem value={BROADCAST}>
            {t("outcomes.toAll")} ({BROADCAST})
          </MenuItem>
        )}
        {askable &&
          targets.map((row) => (
            <MenuItem key={row.uuid} value={row.name}>
              {row.name}
            </MenuItem>
          ))}
        {routeAsk && (
          <MenuItem value={TO_MODULE}>{t("outcomes.toModule")}</MenuItem>
        )}
        {(askable || routeOnly) && (
          <MenuItem value={TO_SCORE}>{t("outcomes.toScore")}</MenuItem>
        )}
        {extraTargets.map((row) => (
          <MenuItem key={row.value} value={row.value}>
            {row.label}
          </MenuItem>
        ))}
        {writable && (
          <MenuItem value={TO_DATASET}>{t("outcomes.toDataset")}</MenuItem>
        )}
      </TextField>

      {extra && renderExtra !== undefined && renderExtra(draft.target)}

      {scoring && (
        <>
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label={t("actions.score.direction")}
              value={draft.scoreDir}
              onChange={(e) => set({ scoreDir: e.target.value as ActionDraft["scoreDir"] })}
              sx={{ flex: 1.2 }}
            >
              <MenuItem value="add">{t("actions.score.add")}</MenuItem>
              <MenuItem value="cut">{t("actions.score.cut")}</MenuItem>
            </TextField>
            <TextField
              size="small"
              label={t("actions.score.points")}
              value={draft.scorePoints}
              onChange={(e) => set({ scorePoints: e.target.value.trim() })}
              required
              error={draft.scorePoints !== "" && !numberOk(draft.scorePoints, 1, POINTS_MAX)}
              helperText={t("actions.score.pointsHint")}
              sx={{ flex: 1 }}
            />
          </Stack>
          <DialogAlert text={t("actions.verbs.score.hint")} />
        </>
      )}

      {writing && (
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label={t("outcomes.outcomeList")}
            value={draft.list}
            onChange={(e) => set({ list: e.target.value })}
            helperText={t("outcomes.outcomeListHint")}
            sx={{ flex: 1.4 }}
          >
            {datasets.map((row) => (
              <MenuItem key={row.value} value={row.value}>
                {row.label}
              </MenuItem>
            ))}
            {datasets.length === 0 && (
              <MenuItem disabled value="">
                {t("outcomes.listEmpty")}
              </MenuItem>
            )}
          </TextField>
          {writes !== undefined && (
            <TextField
              select
              size="small"
              label={t("outcomes.outcomeWriteLabel")}
              value={draft.write}
              onChange={(e) => set({ write: e.target.value })}
              helperText={writeHint ?? t("outcomes.outcomeWriteHint")}
              sx={{ flex: 1.2 }}
            >
              {writes.map((row) => (
                <MenuItem key={row.value} value={row.value}>
                  {row.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            size="small"
            label={t("outcomes.outcomeTtl")}
            value={draft.ttl}
            onChange={(e) => set({ ttl: e.target.value })}
            required={ttlRequired}
            helperText={t("outcomes.outcomeTtlHint")}
            sx={{ flex: 1 }}
          />
        </Stack>
      )}

      {canAsk && !writing && !scoring && !extra && draft.target !== "" && (
        <>
          <TextField
            select
            size="small"
            label={t("outcomes.outcomeWhat")}
            value={draft.verb}
            onChange={(e) =>
              set({
                verb: e.target.value,
                axis: e.target.value === "note" ? "ip" : "",
              })
            }
          >
            {verbMenuItems(t, registry, verbs, draft.verb)}
          </TextField>

          {draft.verb !== "" && <DialogAlert text={t(`actions.verbs.${draft.verb}.hint`)} />}

          {axes.length > 1 && !isRouteVerb(draft.verb) && (
            <TextField
              select
              size="small"
              label={t("actions.counter.label")}
              value={draft.axis !== "" ? draft.axis : draft.verb === "note" ? "ip" : (axes[0] ?? "")}
              onChange={(e) => set({ axis: e.target.value })}
            >
              {axes
                .filter((axis) => draft.verb !== "note" || axis !== "request")
                .map((axis) => (
                  <MenuItem key={axis} value={axis}>
                    {axisLabel(t, axis)}
                  </MenuItem>
                ))}
            </TextField>
          )}

          {isControlVerb(draft.verb) && (
            <TextField
              select
              size="small"
              label={t("actions.phase.label")}
              value={draft.phase}
              onChange={(e) => set({ phase: e.target.value })}
              helperText={t("actions.phase.hint")}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
            >
              <MenuItem value="">{t("actions.phase.all")}</MenuItem>
              {ASK_PHASES.map((phase) => (
                <MenuItem key={phase} value={phase}>
                  {t(`actions.phase.${phase}`)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {draft.verb === "threshold" && (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label={t("actions.direction.label")}
                value={draft.direction}
                onChange={(e) =>
                  set({ direction: e.target.value as ActionDraft["direction"] })
                }
                sx={{ flex: 1.2 }}
              >
                <MenuItem value="stricter">{t("actions.direction.stricter")}</MenuItem>
                <MenuItem value="softer">{t("actions.direction.softer")}</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={t("actions.direction.percent")}
                value={draft.percent}
                onChange={(e) => set({ percent: e.target.value })}
                required
                helperText={t("actions.direction.percentHint")}
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {draft.verb === "note" && draft.target === "counter" && (
            <Autocomplete
              freeSolo
              autoSelect
              size="small"
              options={noteBuckets.filter((name) => name !== draft.counter)}
              value={draft.counter}
              onChange={(_e, next) => set({ counter: (next ?? "").trim() })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label={t("actions.counter.bucket")}
                  helperText={t("actions.counter.bucketHint")}
                />
              )}
            />
          )}

          {draft.verb === "note" && (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label={t("actions.counter.direction")}
                value={draft.noteDir}
                onChange={(e) => set({ noteDir: e.target.value as ActionDraft["noteDir"] })}
                sx={{ flex: 1.2 }}
              >
                <MenuItem value="add">{t("actions.counter.add")}</MenuItem>
                <MenuItem value="cut">{t("actions.counter.cut")}</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={t("actions.counter.percent")}
                value={draft.notePercent}
                onChange={(e) => set({ notePercent: e.target.value })}
                required
                helperText={t("actions.counter.percentHint")}
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {draft.verb === "mutate" && (
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label={t("actions.mutate.group")}
                value={draft.group}
                onChange={(e) => set({ group: e.target.value.trim() })}
                required
                helperText={t("actions.mutate.groupHint")}
                sx={{ flex: 1.2 }}
              />
              <TextField
                select
                size="small"
                label={t("actions.mutate.set")}
                value={draft.set}
                onChange={(e) => set({ set: e.target.value as ActionDraft["set"] })}
                sx={{ flex: 1 }}
              >
                <MenuItem value="on">{t("actions.mutate.on")}</MenuItem>
                <MenuItem value="off">{t("actions.mutate.off")}</MenuItem>
              </TextField>
            </Stack>
          )}

          {draft.verb === "mark" && (
            <TextField
              size="small"
              label={t("actions.mark.marker")}
              value={draft.marker}
              onChange={(e) => set({ marker: e.target.value })}
              required
              error={draft.marker !== "" && markerError(draft.marker) !== null}
              helperText={t("actions.mark.markerHint", { max: MARKER_MAX_BYTES })}
            />
          )}

          <AuditFields
            verb={draft.verb}
            axis={draft.axis}
            set={draft.set}
            record={draft.record}
            ttl={draft.archiveTtl}
            when={draft.archiveWhen}
            frame={frame}
            onChange={(patch) =>
              set({
                ...(patch.axis !== undefined ? { axis: patch.axis } : {}),
                ...(patch.set !== undefined ? { set: patch.set } : {}),
                ...(patch.record !== undefined ? { record: patch.record } : {}),
                ...(patch.ttl !== undefined ? { archiveTtl: patch.ttl } : {}),
                ...(patch.when !== undefined ? { archiveWhen: patch.when } : {}),
              })
            }
          />
        </>
      )}

      {showCode && (
        <TextField
          size="small"
          label={t("outcomes.outcomeCode")}
          value={draft.code}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          helperText={codeHint ?? t("outcomes.outcomeCodeHint")}
          autoComplete="off"
        />
      )}
    </>
  );
}
