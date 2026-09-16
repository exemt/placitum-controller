import { type MouseEvent, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { FilterCell, HEAD_H, TableIconButton, TableNoticeRow } from "../components/data-table/index.ts";
import {
  BLEED,
  BlockSelect,
  flushTableSx,
  HeadCell,
  headCellSx,
} from "../components/table-block.tsx";
import { HintMarkup } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { Presets, SectionBleed } from "../components/settings-table.tsx";
import {
  DialogAlert,
  DialogCode,
  DialogEmitted,
  DialogFrame,
  DialogInput,
  DialogPick,
  DialogSection,
  DialogWhen,
  dialogLabelSx,
  type DialogLine as Line,
  type DialogOption,
} from "../components/dialog-kit.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import {
  ARCHIVE_OUTCOMES,
  checkStoreCross,
  checkTail,
  emptyTail,
  formatTails,
  hasOwnLists,
  listNames,
  mergeTail,
  openedByOwnLists,
  overrideTail,
  parseTail,
  NONE_PHASES,
  PHASE_OBJECTS,
  splitPhaseLine,
  TAIL_PHASES,
  whenSummaryKey,
  type ArchiveOutcome,
  type ListName,
  type ListTarget,
  type ObjectName,
  type ObjectSpec,
  type SendSource,
  type TailKind,
  type TailModel,
  type TailPhase,
  type TailProblem,
} from "./directive-tail.ts";
import {
  MODULE_DEFAULTS,
  resolve,
  type Doc,
  type FieldState,
  type ParentChain,
} from "./inherit.ts";
import type { InheritFrom } from "../api.ts";

const KINDS: readonly TailKind[] = ["capture", "preview", "archive", "send"];
const ROW_KINDS: readonly TailKind[] = ["capture", "preview", "archive"];

const OBJECT_W = 96;
const CAPTURE_W = 150;
const PREVIEW_W = 170;
const ARCHIVE_W = 170;
const SEND_W = 200;
const ACTIONS_W = 72;

const FROM_SX = {
  fontSize: "0.65rem",
  color: "text.secondary",
  whiteSpace: "nowrap",
  flexShrink: 0,
  lineHeight: 1,
} as const;

const CELL_VALUE_SX = {
  fontSize: "0.75rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
} as const;

const MARK_SX = {
  fontSize: "0.65rem",
  whiteSpace: "nowrap",
  flexShrink: 0,
  lineHeight: 1,
  cursor: "help",
} as const;


const TTL_PRESETS = ["1h", "12h", "1d", "7d", "30d"] as const;

const SIZE_PRESETS = ["8k", "64k", "256k", "1m"] as const;
const PAIR_PRESETS = ["256", "512", "1k", "2k"] as const;

type PhaseModels = Record<TailPhase, TailModel>;

function byPhase<T>(make: (phase: TailPhase) => T): Record<TailPhase, T> {
  return Object.fromEntries(TAIL_PHASES.map((phase) => [phase, make(phase)])) as Record<
    TailPhase,
    T
  >;
}

type FromLevel = InheritFrom | "module";

interface Axis {
  kind: TailKind;
  state: FieldState;
  from?: FromLevel;
  parentFrom?: FromLevel;
  parent: PhaseModels;
  effective: PhaseModels;
  mine: PhaseModels;
  own: string[] | undefined;
}

function ownLines(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((x): x is string => typeof x === "string");
}

function moduleSendDefault(_capture: TailModel, _name: ObjectName): SendSource {
  return "store";
}

function moduleSendDefaults(capture: PhaseModels): string[] {
  const body = (phase: TailPhase) => `body=${moduleSendDefault(capture[phase], "body")}`;
  return [
    `request headers=store args=store ${body("request")}`,
    `response headers=store ${body("response")}`,
    `frame:c2s ${body("frame:c2s")}`,
    `frame:s2c ${body("frame:s2c")}`,
  ];
}

function axisOf(kind: TailKind, waf: Doc, parents: ParentChain, capture?: PhaseModels): Axis {
  const resolved = resolve(waf, kind, parents);
  const above =
    parents[kind]?.value ??
    (kind === "send" && capture !== undefined ? moduleSendDefaults(capture) : MODULE_DEFAULTS[kind]);
  const parent = byPhase((phase) => parseTail(above, phase));
  const own = ownLines(waf[kind]);
  const mine = byPhase((phase) => (own === undefined ? emptyTail() : parseTail(own, phase)));

  let effective: PhaseModels;
  if (resolved.state === "off") {
    effective = byPhase(() => ({ ...emptyTail(), off: true }));
  } else if (resolved.state === "inherit") {
    effective = parent;
  } else {
    effective = byPhase((phase) => mergeTail(parent[phase], mine[phase]));
  }

  return {
    kind,
    state: resolved.state,
    from: resolved.state === "inherit" ? resolved.from : undefined,
    parentFrom:
      parents[kind]?.from ?? (MODULE_DEFAULTS[kind] === undefined ? undefined : "module"),
    parent,
    effective,
    mine,
    own,
  };
}

function cellFrom(axis: Axis, phase: TailPhase, name: ObjectName): FromLevel | undefined {
  if (axis.state === "off") return undefined;
  if (axis.state === "set") {
    const spec = axis.mine[phase].objects[name];
    if (spec.on || spec.none === true) return undefined;
  }
  return axis.parentFrom;
}

function axisWidth(kind: TailKind): number {
  if (kind === "send") return SEND_W;
  return kind === "capture" ? CAPTURE_W : kind === "preview" ? PREVIEW_W : ARCHIVE_W;
}

function printedLines(kind: TailKind, own: string[]): string[] {
  const name = `waf_${kind}`;
  if (own.length === 0) {
    return kind === "send" ? [] : NONE_PHASES.map((phase) => `${name} ${phase} none;`);
  }
  return own.flatMap((tail) => {
    const row = splitPhaseLine(tail);
    return row === null ? [] : [`${name} ${row.phase} ${row.rest};`];
  });
}

function inheritedBlock(t: Translate, axis: Axis): Line[] {
  const tails = formatTails(axis.parent, axis.kind);
  const head = `# ${
    axis.parentFrom === undefined ? t("tail.fromAbove") : t(`inherit.from.${axis.parentFrom}`)
  }:`;
  const body =
    tails.length === 0
      ? [`#   waf_${axis.kind} — ${t("tail.nothingAbove")}`]
      : printedLines(axis.kind, tails).map((line) => `#   ${line}`);
  return [head, ...body].map((text) => ({ text, muted: true }));
}

function HintLabel({
  text,
  hint,
  sx,
}: {
  text: string;
  hint?: string;
  sx?: Record<string, unknown>;
}) {
  const body = (
    <Box
      component="span"
      tabIndex={hint === undefined ? undefined : 0}
      sx={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        ...(hint === undefined
          ? {}
          : {
              cursor: "help",
              textDecoration: "underline dotted",
              textUnderlineOffset: "3px",
              textDecorationColor: "currentColor",
              opacity: 0.85,
              "&:hover, &:focus-visible": { opacity: 1 },
            }),
        ...sx,
      }}
    >
      {text}
    </Box>
  );
  if (hint === undefined) {
    return body;
  }
  return (
    <Tooltip arrow placement="top-start" enterDelay={200} title={<HintMarkup text={hint} />}>
      {body}
    </Tooltip>
  );
}

function problemText(t: Translate, p: TailProblem): string {
  const params =
    p.params === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(p.params).map(([key, value]) => [
            key,
            key === "axis" ? t(`tail.${value}`) : value,
          ]),
        );
  return t(`tail.problem.${p.code}`, params);
}

function listed(list: readonly string[], name: string): boolean {
  return list.some((item) => item.toLowerCase() === name.toLowerCase());
}

function ownListsHint(
  t: Translate,
  model: TailModel,
  kind: TailKind,
  name: ObjectName,
): string | undefined {
  if (name === "body") return undefined;
  const target = name as ListTarget;
  const allow = model.allow[target] ?? [];
  const mask = model.mask[target] ?? [];
  const deny = model.deny[target] ?? [];
  const parts: string[] = [];
  if (kind === "capture") {
    if (mask.length > 0) parts.push(`${t("tail.mask")}: ${mask.join(", ")}`);
    if (deny.length > 0) parts.push(`${t("tail.deny")}: ${deny.join(", ")}`);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }
  if (!hasOwnLists(model, target, kind)) return undefined;
  const kept = allow.filter((n) => !listed(mask, n) && !listed(deny, n));
  if (allow.length > 0) {
    parts.push(`${t("tail.namesOnlyShort")}: ${kept.length > 0 ? kept.join(", ") : "—"}`);
  } else if (deny.length > 0) {
    parts.push(`${t("tail.namesExceptShort")}: ${deny.join(", ")}`);
  }
  if (mask.length > 0) parts.push(`${t("tail.mask")}: ${mask.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : t("tail.ownEmpty");
}

type CellProblem = TailProblem & { kind: TailKind; phase: TailPhase };

export function CaptureTable({
  waf,
  parents,
  onChange,
  clientMaxBody,
  phases = TAIL_PHASES,
}: {
  waf: Doc;
  parents: ParentChain;
  onChange: (next: Doc) => void;
  clientMaxBody?: string;
  phases?: readonly TailPhase[];
}) {
  const t = useT();

  const axes = useMemo(() => {
    const capture = axisOf("capture", waf, parents);
    const rest = KINDS.filter((kind) => kind !== "capture").map((kind) => [
      kind,
      axisOf(kind, waf, parents, capture.effective),
    ]);
    return { capture, ...Object.fromEntries(rest) } as Record<TailKind, Axis>;
  }, [waf, parents]);

  const bodyLimit = resolve(waf, "bodyLimit", parents).value;
  const bodyLimitText = typeof bodyLimit === "string" ? bodyLimit : undefined;

  const inspected = useMemo(() => {
    const on = (key: string) => {
      const list = resolve(waf, key, parents).value;
      return list === "all" || (Array.isArray(list) && list.length > 0);
    };
    const frame = on("frameInspectors");
    return {
      request: on("requestInspectors"),
      response: on("responseInspectors"),
      "frame:c2s": frame,
      "frame:s2c": frame,
      frame,
    } as Record<TailPhase, boolean>;
  }, [waf, parents]);

  const problems: CellProblem[] = useMemo(
    () =>
      phases.flatMap((phase) => {
        const models = Object.fromEntries(
          KINDS.map((kind) => [kind, axes[kind].effective[phase]]),
        ) as Record<TailKind, TailModel>;
        const ctx = {
          capture: models.capture,
          bodyLimit: phase === "request" ? bodyLimitText : undefined,
          clientMaxBody: phase === "request" ? clientMaxBody : undefined,
          phase,
          inspected: inspected[phase],
        };
        return [
          ...KINDS.flatMap((kind) =>
            checkTail(models[kind], kind, ctx).map((p) => ({ ...p, kind, phase })),
          ),
          ...checkStoreCross(models, phase).map((p) => ({ ...p, phase })),
        ];
      }),
    [axes, bodyLimitText, clientMaxBody, inspected],
  );

  const frameAudit = resolve(waf, "frameAudit", parents);
  const frameAuditPolicy = typeof frameAudit.value === "string" ? frameAudit.value : "deny";
  const frameAuditSample = resolve(waf, "frameAuditSample", parents).value;

  const setFrameAudit = (policy: string, sample?: number) => {
    const doc = { ...waf };
    if (policy === "inherit") {
      delete doc.frameAudit;
      delete doc.frameAuditSample;
    } else {
      doc.frameAudit = policy;
      if (policy === "all" && sample !== undefined && sample > 1) {
        doc.frameAuditSample = sample;
      } else {
        delete doc.frameAuditSample;
      }
    }
    onChange(doc);
  };

  const frameWarning = (phase: TailPhase): string | undefined => {
    if (phase !== "frame:c2s" && phase !== "frame:s2c") return undefined;
    const wants =
      axes.preview.effective[phase].objects.body.on || axes.archive.effective[phase].objects.body.on;
    if (!wants) return undefined;
    if (frameAuditPolicy === "off") return t("tail.frameAuditWarn.off");
    if (frameAuditPolicy === "deny" && !inspected[phase]) return t("tail.frameAuditWarn.deny");
    return undefined;
  };

  const [editRow, setEditRow] = useState<{ phase: TailPhase; name: ObjectName } | null>(null);
  const [adding, setAdding] = useState<{ phase: TailPhase; name: ObjectName } | null>(null);

  const commitAll = (
    next: Partial<Record<TailKind, Partial<PhaseModels>>>,
    routePatch?: Partial<Doc>,
  ) => {
    const doc = { ...waf, ...(routePatch ?? {}) };
    for (const kind of KINDS) {
      const patch = next[kind];
      if (patch === undefined) continue;
      const axis = axes[kind];
      doc[kind] = formatTails(
        byPhase((phase) =>
          overrideTail(axis.parent[phase], patch[phase] ?? axis.effective[phase], kind),
        ),
        kind,
      );
    }
    onChange(doc);
  };

  const applyAxis = (kind: TailKind, state: FieldState, models: PhaseModels) => {
    if (state === "inherit") {
      const doc = { ...waf };
      delete doc[kind];
      onChange(doc);
      return;
    }
    if (state === "off") {
      onChange({ ...waf, [kind]: [] });
      return;
    }
    commitAll({ [kind]: models });
  };

  const usedKinds = (phase: TailPhase): readonly TailKind[] => usedKindsOf(inspected[phase]);
  const columns = KINDS.filter((kind) => phases.some((phase) => usedKinds(phase).includes(kind)));
  const rowsOf = (phase: TailPhase) =>
    PHASE_OBJECTS[phase].filter((name) =>
      ROW_KINDS.some(
        (kind) => usedKinds(phase).includes(kind) && axes[kind].effective[phase].objects[name].on,
      ),
    );
  const unusedOf = (phase: TailPhase) =>
    PHASE_OBJECTS[phase].filter((name) => !rowsOf(phase).includes(name));

  const dropObject = (phase: TailPhase, name: ObjectName) => {
    const patch: Partial<Record<TailKind, Partial<PhaseModels>>> = {};
    for (const kind of KINDS) {
      const model = axes[kind].effective[phase];
      if (!model.objects[name].on) continue;
      patch[kind] = {
        [phase]: {
          ...model,
          off: false,
          objects: { ...model.objects, [name]: { on: false } },
        },
      };
    }
    commitAll(patch);
  };

  const problemOf = (kind: TailKind, phase: TailPhase, name: ObjectName) =>
    problems.find((p) => p.kind === kind && p.phase === phase && p.object === name);

  const emitted: Line[] = KINDS.flatMap((kind) => {
    const axis = axes[kind];
    return axis.own === undefined
      ? inheritedBlock(t, axis)
      : printedLines(kind, axis.own).map((text) => ({ text }));
  });

  const hasAnyRow = phases.some((phase) => rowsOf(phase).length > 0);

  const rightSpan = columns.includes("send") ? 2 : 1;
  const leftSpan = columns.length + 2 - rightSpan;

  return (
    <SectionBleed>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("tail.object")} help={t("tail.objectHint")} width={OBJECT_W} />
            {columns.map((kind) => (
              <AxisHead
                key={kind}
                axis={axes[kind]}
                onState={(state) => applyAxis(kind, state, axes[kind].effective)}
              />
            ))}
            <FilterCell width={ACTIONS_W}>{null}</FilterCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {!hasAnyRow && (
            <TableNoticeRow
              colSpan={columns.length + 2}
              kind="empty"
              message={t(columns.includes("capture") ? "tail.empty" : "tail.emptyJournal")}
            />
          )}
          {phases.map((phase) => (
            <PhaseRows
              key={phase}
              phase={phase}
              inspected={inspected[phase]}
              rows={rowsOf(phase)}
              unused={unusedOf(phase)}
              span={{ left: leftSpan, right: rightSpan }}
              onAdd={(name) => setAdding({ phase, name })}
              audit={
                phase === phases.find((p) => p === "frame:c2s" || p === "frame:s2c")
                  ? {
                      state: frameAudit.state,
                      policy: frameAuditPolicy,
                      sample: typeof frameAuditSample === "number" ? frameAuditSample : undefined,
                      onChange: setFrameAudit,
                    }
                  : undefined
              }
              warning={frameWarning(phase)}
            >
              {rowsOf(phase).map((name) => (
                <TableRow
                  key={name}
                  hover
                  onClick={() => setEditRow({ phase, name })}
                  sx={{ cursor: "pointer" }}
                >
                  <FilterCell width={OBJECT_W}>
                    <Tooltip
                      arrow
                      placement="top-start"
                      enterDelay={200}
                      title={<HintMarkup text={t(`tail.objectHints.${name}`)} />}
                    >
                      <Typography
                        component="span"
                        sx={{ fontSize: "0.75rem", fontWeight: 600, cursor: "help" }}
                      >
                        {t(`tail.objects.${name}`)}
                      </Typography>
                    </Tooltip>
                  </FilterCell>
                  {columns.map((kind) =>
                    usedKinds(phase).includes(kind) ? (
                      <ObjectCell
                        key={kind}
                        axis={axes[kind]}
                        phase={phase}
                        name={name}
                        problem={problemOf(kind, phase, name)}
                      />
                    ) : (
                      <FilterCell key={kind} width={axisWidth(kind)}>
                        {null}
                      </FilterCell>
                    ),
                  )}
                  <FilterCell width={ACTIONS_W}>
                    <Box
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 0.5,
                        width: "100%",
                      }}
                    >
                      <TableIconButton
                        color="primary"
                        icon={<SettingsOutlinedIcon />}
                        tooltip={t("tail.editObject")}
                        aria-label={`${t("tail.editObject")} ${name}`}
                        onClick={() => setEditRow({ phase, name })}
                      />
                      <TableIconButton
                        color="error"
                        icon={<DeleteIcon />}
                        tooltip={t("common.delete")}
                        onClick={() => dropObject(phase, name)}
                      />
                    </Box>
                  </FilterCell>
                </TableRow>
              ))}
            </PhaseRows>
          ))}
        </TableBody>
      </Table>
      <Box sx={{ px: BLEED, py: 1.25, borderTop: 1, borderColor: "divider" }}>
        <DialogCode lines={emitted} empty={t("tail.emittedNone")} />
      </Box>
      {(editRow !== null || adding !== null) && (
        <ObjectDialog
          t={t}
          phase={editRow?.phase ?? adding?.phase ?? "request"}
          editName={editRow?.name ?? adding?.name ?? "body"}
          adding={adding !== null}
          axes={axes}
          bodyLimit={(editRow?.phase ?? adding?.phase) === "request" ? bodyLimitText : undefined}
          clientMaxBody={(editRow?.phase ?? adding?.phase) === "request" ? clientMaxBody : undefined}
          inspected={inspected[editRow?.phase ?? adding?.phase ?? "request"]}
          onClose={() => {
            setEditRow(null);
            setAdding(null);
          }}
          onApply={(patch) => {
            commitAll(patch);
            setEditRow(null);
            setAdding(null);
          }}
        />
      )}
    </SectionBleed>
  );
}

interface FrameAudit {
  state: FieldState;
  policy: string;
  sample?: number;
  onChange: (policy: string, sample?: number) => void;
}

const FRAME_AUDIT_SAMPLES = [1, 2, 5, 10, 100] as const;

const JOURNAL_KINDS: readonly TailKind[] = ["preview", "archive"];

function usedKindsOf(inspected: boolean): readonly TailKind[] {
  return inspected ? KINDS : JOURNAL_KINDS;
}

function FrameAuditPick({ audit }: { audit: FrameAudit }) {
  const t = useT();
  const inherited = audit.state === "inherit";
  const options = [
    {
      value: "inherit",
      label: t("tail.frameAuditOptions.inherit", {
        value: t(`tail.frameAuditOptions.${audit.policy}`),
      }),
    },
    { value: "off", label: t("tail.frameAuditOptions.off") },
    { value: "deny", label: t("tail.frameAuditOptions.deny") },
    { value: "all", label: t("tail.frameAuditOptions.all") },
  ];

  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={400}
      title={<HintMarkup text={t("tail.frameAuditHint")} />}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
        <BlockSelect
          value={inherited ? "inherit" : audit.policy}
          options={options}
          onChange={(next) => audit.onChange(next, audit.sample)}
          ariaLabel={t("tail.frameAudit")}
        />
        {audit.policy === "all" && (
          <BlockSelect
            value={String(audit.sample ?? 1)}
            options={FRAME_AUDIT_SAMPLES.map((n) => ({
              value: String(n),
              label: n === 1 ? t("tail.frameAuditEveryOne") : t("tail.frameAuditEvery", { n }),
            }))}
            onChange={(next) => audit.onChange("all", Number(next))}
            ariaLabel={`${t("tail.frameAudit")}: sample=`}
          />
        )}
      </Stack>
    </Tooltip>
  );
}

function PhaseRows({
  phase,
  inspected = true,
  rows,
  unused,
  span,
  onAdd,
  audit,
  warning,
  children,
}: {
  phase: TailPhase;
  inspected?: boolean;
  rows: readonly ObjectName[];
  unused: readonly ObjectName[];
  span: { left: number; right: number };
  onAdd: (name: ObjectName) => void;
  audit?: FrameAudit;
  warning?: string;
  children: ReactNode;
}) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const openMenu = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const closeMenu = () => setAnchor(null);

  const auditRight = span.right > 1;

  return (
    <>
      <TableRow>
        <TableCell colSpan={span.left} sx={{ py: 0.5, bgcolor: "action.hover" }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <HintLabel
              text={t(`tail.phase.${phase}`)}
              hint={t(`tail.phaseHint.${phase}`)}
              sx={{ ...dialogLabelSx, fontWeight: 600, textTransform: "uppercase" }}
            />
            {rows.length === 0 && (
              <Typography sx={{ ...dialogLabelSx, opacity: 0.7, whiteSpace: "normal" }}>
                {t(inspected ? `tail.phaseEmpty.${phase}` : "tail.phaseEmptyJournal")}
              </Typography>
            )}
            {audit !== undefined && !auditRight && (
              <>
                <Box sx={{ flex: 1 }} />
                <FrameAuditPick audit={audit} />
              </>
            )}
          </Stack>
          {warning !== undefined && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0, pt: 0.25 }}>
              <WarningAmberIcon color="warning" sx={{ fontSize: 15, flexShrink: 0 }} />
              <Typography sx={{ ...dialogLabelSx, color: "warning.main", whiteSpace: "normal" }}>
                {warning}
              </Typography>
            </Stack>
          )}
        </TableCell>
        <TableCell
          colSpan={span.right}
          sx={{ p: "0 !important", height: HEAD_H, bgcolor: "action.hover" }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 0.75,
              width: "100%",
              minHeight: HEAD_H,
            }}
          >
            {audit !== undefined && auditRight && <FrameAuditPick audit={audit} />}
            <TableIconButton
              color="success"
              icon={<AddIcon />}
              disabled={unused.length === 0}
              tooltip={unused.length === 0 ? t("tail.addAllUsed") : t("tail.addObject")}
              aria-label={`${t("tail.addObject")} ${t(`tail.phase.${phase}`)}`}
              onClick={openMenu}
            />
            <Menu anchorEl={anchor} open={anchor !== null} onClose={closeMenu}>
              {unused.map((name) => (
                <MenuItem
                  key={name}
                  onClick={() => {
                    closeMenu();
                    onAdd(name);
                  }}
                  sx={{ alignItems: "flex-start" }}
                >
                  <ListItemText
                    primary={t(`tail.objects.${name}`)}
                    secondary={t(`tail.objectHints.${name}`)}
                    slotProps={{
                      primary: { sx: { fontSize: "0.85rem" } },
                      secondary: { sx: { fontSize: "0.72rem", whiteSpace: "normal", maxWidth: 360 } },
                    }}
                  />
                </MenuItem>
              ))}
            </Menu>
          </Box>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

function AxisHead({
  axis,
  onState,
}: {
  axis: Axis;
  onState: (next: FieldState) => void;
}) {
  const t = useT();

  const hint =
    axis.from === undefined
      ? t(`tail.${axis.kind}Hint`)
      : `${t(`tail.${axis.kind}Hint`)}\n${t(`inherit.fromHint.${axis.from}`)}`;

  const states: { value: FieldState; label: string }[] =
    axis.kind === "send"
      ? [
          { value: "inherit", label: t("tail.state.inherit") },
          { value: "set", label: t("tail.state.set") },
        ]
      : [
          { value: "inherit", label: t("tail.state.inherit") },
          { value: "set", label: t("tail.state.set") },
          { value: "off", label: t("tail.state.off") },
        ];

  return (
    <TableCell sx={{ ...headCellSx, width: axisWidth(axis.kind) }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <HintLabel text={t(`tail.${axis.kind}`)} hint={hint} />
        <Box sx={{ flex: 1 }} />
        <BlockSelect
          value={axis.state}
          options={states}
          onChange={(next) => {
            if (next !== axis.state) onState(next);
          }}
          ariaLabel={`${t(`tail.${axis.kind}`)}: ${t("tail.stateLabel")}`}
        />
      </Stack>
    </TableCell>
  );
}

function archiveMark(t: Translate, spec: ObjectSpec): { text: string; hint: string } | undefined {
  const ttl = spec.ttl !== undefined && spec.ttl !== "" ? spec.ttl : undefined;
  const when = spec.when ?? [];
  if (ttl === undefined && when.length === 0) {
    return undefined;
  }
  const outcome = when.length === 0 ? undefined : t(whenSummaryKey(when));
  return {
    text: [ttl, outcome].filter((part) => part !== undefined).join(" · "),
    hint: [
      `${t("tail.ttl")}: ${ttl ?? t("tail.ttlForever")}`,
      `${t("tail.when")}: ${t(whenSummaryKey(when))}`,
    ].join("\n"),
  };
}

function cellValue(t: Translate, kind: TailKind, spec: ObjectSpec): string {
  if (kind === "capture") {
    return spec.size ?? t("tail.whole");
  }
  if (kind === "send") {
    return spec.send === "store" ? t("tail.sendStore") : t("tail.sendOriginal");
  }
  if (kind === "preview") {
    if (spec.size === undefined) return "—";
    return spec.item === undefined ? spec.size : `${spec.size} / ${spec.item}`;
  }
  return spec.size ?? t("tail.whole");
}

function ObjectCell({
  axis,
  phase,
  name,
  problem,
}: {
  axis: Axis;
  phase: TailPhase;
  name: ObjectName;
  problem?: CellProblem;
}) {
  const t = useT();
  const effective = axis.effective[phase];
  const spec = effective.objects[name];
  const inheriting = axis.state === "inherit";
  const from = spec.on ? cellFrom(axis, phase, name) : undefined;
  const names = spec.on ? ownListsHint(t, effective, axis.kind, name) : undefined;
  const keep = spec.on && axis.kind === "archive" ? archiveMark(t, spec) : undefined;

  const text = spec.on
    ? cellValue(t, axis.kind, spec)
    : spec.none === true && axis.parent[phase].objects[name].on
      ? t("tail.clearedHere")
      : t("tail.no");

  return (
    <FilterCell
      width={axisWidth(axis.kind)}
      sx={{ minWidth: 0, opacity: inheriting ? 0.62 : 1 }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <Typography sx={{ ...CELL_VALUE_SX, opacity: spec.on ? 1 : 0.55 }}>{text}</Typography>
        {spec.on && spec.sent === true && axis.kind === "preview" && (
          <Tooltip arrow title={t("tail.recordSentHint")}>
            <Typography component="span" sx={{ ...MARK_SX, color: "info.main" }}>
              {t("tail.recordSent")}
            </Typography>
          </Tooltip>
        )}
        {names !== undefined && (
          <Tooltip arrow title={names}>
            <Typography component="span" sx={{ ...MARK_SX, color: "text.secondary" }}>
              {t("tail.namesMark")}
            </Typography>
          </Tooltip>
        )}
        {keep !== undefined && (
          <Tooltip arrow title={<HintMarkup text={keep.hint} />}>
            <Typography component="span" sx={{ ...MARK_SX, color: "text.secondary" }}>
              {keep.text}
            </Typography>
          </Tooltip>
        )}
        {from !== undefined && (
          <Tooltip arrow title={t(`inherit.fromHint.${from}`)}>
            <Typography component="span" sx={FROM_SX}>
              ({t(`inherit.tag.${from}`)})
            </Typography>
          </Tooltip>
        )}
        {problem !== undefined && (
          <Tooltip arrow title={problemText(t, problem)}>
            <WarningAmberIcon
              color={problem.level === "error" ? "error" : "warning"}
              sx={{ fontSize: 15, flexShrink: 0 }}
            />
          </Tooltip>
        )}
      </Stack>
    </FilterCell>
  );
}

interface AxisDraft {
  on: boolean;
  size: string;
  item: string;
  /** the record body only: as received or as delivered after a rewrite */
  source: "received" | "sent";
  ownLists: boolean;
  /** own lists: all names except the named ones, or only the named ones */
  namesMode: "except" | "only";
  allow: string[];
  mask: string[];
  deny: string[];
  send: SendSource;
  ttl: string;
  when: ArchiveOutcome[];
}

type Draft = Record<TailKind, AxisDraft>;

function draftOf(model: TailModel, kind: TailKind, name: ObjectName): AxisDraft {
  const spec = model.objects[name];
  const target = name === "body" ? undefined : (name as ListTarget);
  const raw =
    target === undefined
      ? { allow: [] as string[], mask: [] as string[], deny: [] as string[] }
      : {
          allow: model.allow[target] ?? [],
          mask: model.mask[target] ?? [],
          deny: model.deny[target] ?? [],
        };
  // The dialog keeps one mode at a time. "Only these" is printed as allow=
  // with the masked names added (a masked name has to stay to be masked), so
  // it is read back without them; a denied name inside allow= never passes.
  const only = kind !== "capture" && raw.allow.length > 0;
  const lists = only
    ? {
        allow: raw.allow.filter((n) => !listed(raw.mask, n) && !listed(raw.deny, n)),
        mask: raw.mask.filter((n) => !listed(raw.deny, n)),
        deny: [],
      }
    : raw;
  return {
    namesMode: only ? ("only" as const) : ("except" as const),
    on: spec.on,
    size: spec.size ?? "",
    item: spec.item ?? "",
    source: kind === "preview" && spec.sent === true ? "sent" : "received",
    ownLists: kind !== "capture" && target !== undefined && hasOwnLists(model, target, kind),
    ...lists,
    send: spec.send ?? "original",
    ttl: spec.ttl ?? "",
    when: [...(spec.when ?? [])],
  };
}

function offDraft(): AxisDraft {
  return {
    on: false,
    size: "",
    item: "",
    source: "received",
    ownLists: false,
    namesMode: "except",
    allow: [],
    mask: [],
    deny: [],
    send: "original",
    ttl: "",
    when: [],
  };
}

function strU(raw: string): string | undefined {
  const text = raw.trim();
  return text === "" ? undefined : text;
}

function ObjectDialog({
  t,
  phase,
  editName,
  adding = false,
  axes,
  bodyLimit,
  clientMaxBody,
  inspected = true,
  onClose,
  onApply,
}: {
  t: Translate;
  phase: TailPhase;
  adding?: boolean;
  editName: ObjectName;
  axes: Record<TailKind, Axis>;
  bodyLimit?: string;
  clientMaxBody?: string;
  inspected?: boolean;
  onClose: () => void;
  onApply: (patch: Partial<Record<TailKind, Partial<PhaseModels>>>) => void;
}) {
  const name: ObjectName = editName;

  const baseline = useMemo<Draft>(() => {
    if (name === undefined) {
      return { capture: offDraft(), preview: offDraft(), archive: offDraft(), send: offDraft() };
    }
    return Object.fromEntries(
      KINDS.map((kind) => [
        kind,
        adding ? offDraft() : draftOf(axes[kind].effective[phase], kind, name),
      ]),
    ) as Draft;
  }, [adding, axes, name, phase]);

  const [draft, setDraft] = useState<Draft>(() =>
    adding && inspected ? { ...baseline, capture: { ...offDraft(), on: true } } : baseline,
  );

  if (name === undefined) return null;
  const target = name === "body" ? undefined : (name as ListTarget);
  const frame = phase === "frame:c2s" || phase === "frame:s2c";

  const patch = (kind: TailKind, part: Partial<AxisDraft>) =>
    setDraft((prev) => ({ ...prev, [kind]: { ...prev[kind], ...part } }));

  const specOf = (kind: TailKind, d: AxisDraft): ObjectSpec => {
    if (!d.on) return { on: false };
    if (kind === "send") return { on: true, send: d.send };
    if (kind === "capture") return { on: true, size: strU(d.size) };
    if (kind === "archive") {
      return {
        on: true,
        size: strU(d.size),
        ttl: strU(d.ttl),
        when: d.when.length > 0 ? d.when : undefined,
      };
    }
    return {
      on: true,
      size: strU(d.size),
      item: target === undefined ? undefined : strU(d.item),
      sent: name === "body" && d.source === "sent" ? true : undefined,
    };
  };

  const patched = (kind: TailKind): TailModel => {
    const model = axes[kind].effective[phase];
    const d = draft[kind];
    const next: TailModel = {
      ...model,
      off: false,
      objects: { ...model.objects, [name]: specOf(kind, d) },
    };
    if (target !== undefined) {
      const set = (list: ListName, values: string[]) => {
        if (adding && values.length === 0) return;
        next[list] = { ...next[list], [target]: values.length > 0 ? values : undefined };
      };
      if (!d.on) {
        if (!adding) {
          for (const list of listNames(kind)) set(list, []);
        }
      } else if (kind === "capture") {
        set("mask", d.mask);
        set("deny", d.deny);
      } else if (d.ownLists) {
        // Own lists replace the capture lists. One mode at a time: "except"
        // prints deny=, "only" prints allow= with the masked names kept. A
        // list left empty still overrides one named above, and a set with
        // nothing named at all is printed as mask=none -- own and empty.
        const above = axes[kind].parent[phase];
        const aboveHas = (list: ListName) => (above[list][target]?.length ?? 0) > 0;
        const orEmpty = (list: ListName, values: string[]) =>
          values.length > 0 ? values : aboveHas(list) ? [] : undefined;
        const unique = (values: string[]) =>
          values.filter((n, i) => values.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
        const own: Record<ListName, string[] | undefined> =
          d.namesMode === "only"
            ? {
                allow: orEmpty("allow", unique([...d.allow, ...d.mask])),
                mask: orEmpty("mask", d.mask),
                deny: orEmpty("deny", []),
              }
            : {
                allow: orEmpty("allow", []),
                mask: orEmpty("mask", d.mask),
                deny: orEmpty("deny", d.deny),
              };
        if (listNames(kind).every((list) => own[list] === undefined)) {
          own.mask = [];
        }
        for (const list of listNames(kind)) {
          next[list] = { ...next[list], [target]: own[list] };
        }
      } else if (!adding) {
        for (const list of listNames(kind)) set(list, []);
      }
    }
    return next;
  };

  const models = Object.fromEntries(KINDS.map((kind) => [kind, patched(kind)])) as Record<
    TailKind,
    TailModel
  >;

  const touched = (kind: TailKind) =>
    JSON.stringify(draft[kind]) !== JSON.stringify(baseline[kind]);

  const sendAbove = axes.send.parent[phase].objects[name].send;
  const sendDefault: SendSource =
    axes.send.parentFrom === "module" || axes.send.parentFrom === undefined || sendAbove === undefined
      ? moduleSendDefault(models.capture, name)
      : sendAbove;
  const sendDefaultLabel = t(sendDefault === "store" ? "tail.sendStore" : "tail.sendOriginal");
  const sendFrom =
    axes.send.parentFrom === undefined
      ? t("tail.fromAbove")
      : t(`inherit.from.${axes.send.parentFrom}`);
  const sendOptionLabel = (value: SendSource) =>
    value === sendDefault
      ? `${t(value === "store" ? "tail.sendStore" : "tail.sendOriginal")} ${t("tail.sendDefaultMark")}`
      : t(value === "store" ? "tail.sendStore" : "tail.sendOriginal");

  const problems = [
    ...usedKindsOf(inspected).flatMap((kind) =>
      checkTail(models[kind], kind, {
        capture: models.capture,
        bodyLimit,
        clientMaxBody,
        phase,
        inspected,
      }).map((p) => ({ ...p, kind })),
    ),
    ...checkStoreCross(models, phase),
  ].filter((p) => p.object === name);

  const onlyEmpty = (["preview", "archive"] as const).some(
    (kind) =>
      target !== undefined &&
      draft[kind].on &&
      draft[kind].ownLists &&
      draft[kind].namesMode === "only" &&
      draft[kind].allow.length === 0 &&
      draft[kind].mask.length === 0,
  );
  const blocked = onlyEmpty || problems.some((p) => p.level === "error");
  const ready = KINDS.some((kind) => touched(kind)) && !blocked;

  const lines: Line[] = KINDS.flatMap((kind) => {
    const axis = axes[kind];
    if (!touched(kind)) {
      return axis.own === undefined
        ? inheritedBlock(t, axis)
        : printedLines(kind, axis.own).map((text) => ({ text }));
    }
    return printedLines(
      kind,
      formatTails(
        byPhase((p) =>
          overrideTail(axis.parent[p], p === phase ? models[kind] : axis.effective[p], kind),
        ),
        kind,
      ),
    ).map((text) => ({ text }));
  });

  const apply = () => {
    const out: Partial<Record<TailKind, Partial<PhaseModels>>> = {};
    for (const kind of KINDS) {
      if (touched(kind)) {
        out[kind] = { [phase]: models[kind] } as Partial<PhaseModels>;
      }
    }
    onApply(out);
  };

  // Only the record body has a source: what came in or what went out after a
  // rewrite. What headers and args show is set by the name lists.
  const recordSourceOptions: DialogOption<"received" | "sent">[] = [
    { value: "received", label: t("tail.recordReceived"), hint: t("tail.recordReceivedHint") },
    { value: "sent", label: t("tail.recordSent"), hint: t("tail.recordSentHint") },
  ];

  const sizeRow = (
    kind: TailKind,
    d: AxisDraft,
    label: string,
    hint: string,
    placeholder: string,
    whole?: string,
  ) => (
    <DialogInput
      label={label}
      hint={hint}
      value={d.size}
      placeholder={placeholder}
      end={
        <Presets
          keep
          items={[
            ...(whole === undefined ? [] : [{ label: whole, value: "" }]),
            ...SIZE_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.size}
          onPick={(next) => patch(kind, { size: next === d.size ? "" : next })}
        />
      }
      onChange={(size) => patch(kind, { size })}
    />
  );

  const pairCapRow = (kind: TailKind, d: AxisDraft) => (
    <DialogInput
      label={t("tail.pairCap")}
      hint={t("tail.pairCapHint")}
      value={d.item}
      placeholder={t("tail.pairCapNone")}
      end={
        <Presets
          keep
          items={[
            { label: t("tail.pairCapNone"), value: "" },
            ...PAIR_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.item}
          onPick={(next) => patch(kind, { item: next === d.item ? "" : next })}
        />
      }
      onChange={(item) => patch(kind, { item })}
    />
  );

  const sourceRow = (kind: TailKind, d: AxisDraft) =>
    kind !== "preview" || name !== "body" ? null : (
      <>
        <DialogPick
          label={t("tail.source")}
          hint={t("tail.sourceHint")}
          value={d.source}
          options={recordSourceOptions}
          onChange={(source) => patch(kind, { source })}
        />
        {d.source === "sent" && <DialogAlert text={t("tail.alert.sourceSent")} />}
      </>
    );

  const ttlRow = (kind: TailKind, d: AxisDraft) => (
    <DialogInput
      label={t("tail.ttl")}
      hint={t("tail.ttlHint")}
      value={d.ttl}
      placeholder={t("tail.ttlForever")}
      end={
        <Presets
          keep
          items={[
            { label: t("tail.ttlForever"), value: "" },
            ...TTL_PRESETS.map((item) => ({ label: item, value: item })),
          ]}
          current={d.ttl}
          onPick={(next) => patch(kind, { ttl: next === d.ttl ? "" : next })}
        />
      }
      onChange={(ttl) => patch(kind, { ttl })}
    />
  );

  const whenRow = (kind: TailKind, d: AxisDraft) => (
    <DialogWhen
      label={t("tail.when")}
      hint={t("tail.whenHint")}
      value={d.when}
      onChange={(when) => patch(kind, { when: ARCHIVE_OUTCOMES.filter((name) => when.includes(name)) })}
    />
  );

  const listsRow = (kind: TailKind, d: AxisDraft) =>
    target === undefined ? null : (
      <>
        <DialogPick
          label={t("tail.lists")}
          hint={t(inspected ? "tail.listsHint" : "tail.listsJournalHint")}
          value={d.ownLists ? "own" : "capture"}
          options={[
            {
              value: "capture",
              label: t(inspected ? "tail.listsCapture" : "tail.listsStandard"),
              hint: t(inspected ? "tail.listsCaptureHint" : "tail.listsStandardHint"),
            },
            { value: "own", label: t("tail.listsOwn"), hint: t("tail.listsOwnHint") },
          ]}
          onChange={(v) => patch(kind, { ownLists: v === "own" })}
        />
        {d.ownLists && (
          <>
            <DialogPick
              label={t("tail.namesMode")}
              hint={t("tail.namesModeHint")}
              value={d.namesMode}
              options={[
                { value: "except", label: t("tail.namesExcept"), hint: t("tail.namesExceptHint") },
                { value: "only", label: t("tail.namesOnly"), hint: t("tail.namesOnlyHint") },
              ]}
              onChange={(namesMode) => patch(kind, { namesMode })}
            />
            {d.namesMode === "only" ? (
              <DialogFrame label={t("tail.namesKeep")} hint={t("tail.namesKeepHint")}>
                <ChipInput
                  names={d.allow}
                  placeholder={phase === "response" ? "content-type" : target === "args" ? "id" : "host"}
                  addLabel={t("tail.addName")}
                  onChange={(allow) => patch(kind, { allow })}
                />
              </DialogFrame>
            ) : (
              <DialogFrame label={t("tail.namesDrop")} hint={t("tail.namesDropHint")}>
                <ChipInput
                  names={d.deny}
                  placeholder={target === "args" ? "session" : "authorization"}
                  addLabel={t("tail.addName")}
                  onChange={(deny) => patch(kind, { deny })}
                />
              </DialogFrame>
            )}
            <DialogFrame label={t("tail.mask")} hint={t("tail.ownMaskHint")}>
              <ChipInput
                names={d.mask}
                placeholder={target === "args" ? "password" : "cookie"}
                addLabel={t("tail.addName")}
                onChange={(mask) => patch(kind, { mask })}
              />
            </DialogFrame>
            {d.namesMode === "only" && d.allow.length === 0 && d.mask.length === 0 && (
              <DialogAlert tone="warning" text={t("tail.alert.namesOnlyEmpty")} />
            )}
            {(() => {
              // An empty "only" set cannot be applied: its own notice says so,
              // and the names it would open are not the point yet.
              if (d.namesMode === "only" && d.allow.length === 0 && d.mask.length === 0) return null;
              const opened = openedByOwnLists(models.capture, models[kind], target);
              return opened.length === 0 ? null : (
                <DialogAlert
                  tone="warning"
                  text={t(inspected ? "tail.alert.ownListsOpen" : "tail.alert.ownListsOpenJournal", {
                    names: opened.join(", "),
                  })}
                />
              );
            })()}
          </>
        )}
      </>
    );

  const axisSummary = (kind: TailKind, d: AxisDraft): string => {
    if (kind === "send" && !d.on) {
      return t("tail.sendEffective", { value: sendDefaultLabel, from: sendFrom });
    }
    if (!d.on) {
      return t("tail.axisOff");
    }
    const value = cellValue(t, kind, specOf(kind, d));
    if (kind === "capture" || kind === "send") {
      return value;
    }
    const marks = [
      kind === "preview" && name === "body" && d.source === "sent" ? t("tail.recordSent") : undefined,
      d.ownLists ? t("tail.namesMark") : undefined,
      kind === "archive" && d.when.length > 0 ? t(whenSummaryKey(d.when)) : undefined,
    ].filter((mark) => mark !== undefined);
    return [value, ...marks].join(" · ");
  };

  const axisBlock = (kind: TailKind) => {
    const d = draft[kind];
    return (
      <DialogSection
        key={kind}
        title={t(`tail.${kind}`)}
        hint={t(`tail.${kind}Short`)}
        summary={axisSummary(kind, d)}
        checked={d.on}
        onCheck={(on) => patch(kind, { on })}
        defaultOpen={d.on}
      >
        {kind === "capture" && (
          <>
            <DialogAlert text={t("tail.alert.capture")} />
            {sizeRow(kind, d, t("tail.slice"), t("tail.sliceHint"), t("tail.whole"), t("tail.whole"))}
            {target !== undefined && (
              <>
                <DialogFrame label={t("tail.mask")} hint={t("tail.captureMaskHint")}>
                  <ChipInput
                    names={d.mask}
                    placeholder={
                      target === "args" ? "password" : phase === "response" ? "set-cookie" : "cookie"
                    }
                    addLabel={t("tail.addName")}
                    onChange={(mask) => patch(kind, { mask })}
                  />
                </DialogFrame>
                <DialogFrame label={t("tail.deny")} hint={t("tail.captureDenyHint")}>
                  <ChipInput
                    names={d.deny}
                    placeholder={target === "headers" ? "authorization" : "session"}
                    addLabel={t("tail.addName")}
                    onChange={(deny) => patch(kind, { deny })}
                  />
                </DialogFrame>
              </>
            )}
          </>
        )}
        {kind === "preview" && (
          <>
            {sizeRow(kind, d, t("tail.budget"), t("tail.budgetHint"), t("tail.budgetNone"))}
            {target !== undefined && pairCapRow(kind, d)}
            {sourceRow(kind, d)}
            {listsRow(kind, d)}
            <DialogAlert tone="warning" text={t("tail.alert.auditOverride")} />
          </>
        )}
        {kind === "archive" && (
          <>
            {sourceRow(kind, d)}
            {sizeRow(
              kind,
              d,
              t("tail.archiveSize"),
              t(inspected ? "tail.archiveSizeHint" : "tail.archiveSizeJournalHint"),
              t("tail.whole"),
              t("tail.whole"),
            )}
            {ttlRow(kind, d)}
            {whenRow(kind, d)}
            {listsRow(kind, d)}
            <DialogAlert tone="warning" text={t("tail.alert.archiveOverride")} />
          </>
        )}
        {kind === "send" && (
          <>
            <DialogPick
              label={t("tail.sendPick")}
              hint={t(
                name === "headers"
                  ? "tail.sendPickHeadersHint"
                  : name === "args"
                    ? "tail.sendPickArgsHint"
                    : frame
                      ? "tail.sendPickFrameHint"
                      : "tail.sendPickHint",
              )}
              value={d.send}
              options={[
                {
                  value: "original" as const,
                  label: sendOptionLabel("original"),
                  hint: t("tail.sendOriginalHint"),
                },
                {
                  value: "store" as const,
                  label: sendOptionLabel("store"),
                  hint: t("tail.sendStoreHint"),
                },
              ]}
              onChange={(send) => patch(kind, { send })}
            />
            <DialogAlert
              text={t(
                d.send === "store"
                  ? name === "body"
                    ? "tail.alert.sendStoreBody"
                    : "tail.alert.sendStoreNames"
                  : "tail.alert.sendOriginal",
              )}
            />
          </>
        )}
      </DialogSection>
    );
  };

  return (
    <Modal
      onClose={onClose}
      title={
        adding
          ? t("tail.addTitle", { phase: t(`tail.phase.${phase}`) })
          : t("tail.objectTitle", {
              object: t(`tail.objects.${name}`),
              phase: t(`tail.phase.${phase}`),
            })
      }
      hint={t(inspected ? "tail.objectDialogHint" : "tail.objectDialogHintJournal")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={apply}>
            {adding ? t("common.add") : t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={1}>
          {usedKindsOf(inspected).map((kind) => axisBlock(kind))}
          {problems.length > 0 && (
            <Stack spacing={0.5}>
              {problems.map((p, index) => (
                <Stack
                  key={`${p.kind}:${p.code}:${index}`}
                  direction="row"
                  spacing={0.5}
                  sx={{ alignItems: "center" }}
                >
                  <WarningAmberIcon
                    color={p.level === "error" ? "error" : "warning"}
                    sx={{ fontSize: 15, flexShrink: 0 }}
                  />
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      color: p.level === "error" ? "error.main" : "warning.main",
                    }}
                  >
                    {`${t(`tail.${p.kind}`)}: ${problemText(t, p)}`}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
          <DialogEmitted
            label={t("tail.emitted")}
            lines={lines}
            empty={t("tail.emittedNone")}
          />
        </Stack>
    </Modal>
  );
}

export function RouteCapture({
  waf,
  nginx,
  phases,
  wafParents,
  onWaf,
}: {
  waf: Doc;
  nginx: Doc;
  phases?: readonly ("request" | "response" | "frame")[];
  wafParents: ParentChain;
  onWaf: (next: Doc) => void;
}) {
  const tail: TailPhase[] | undefined = phases?.flatMap((phase) =>
    phase === "frame" ? (["frame:c2s", "frame:s2c"] as TailPhase[]) : [phase],
  );
  return (
    <CaptureTable
      waf={waf}
      parents={wafParents}
      onChange={onWaf}
      phases={tail}
      clientMaxBody={
        typeof nginx.clientMaxBodySize === "string" ? nginx.clientMaxBodySize : undefined
      }
    />
  );
}

function ChipInput({
  names,
  placeholder,
  addLabel,
  onChange,
}: {
  names: string[];
  placeholder: string;
  addLabel: string;
  onChange: (names: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const fresh = raw
      .split(/[\s,]+/)
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n !== "" && !names.includes(n));
    if (fresh.length > 0) onChange([...names, ...fresh]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && names.length > 0) {
      onChange(names.slice(0, -1));
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 0.5,
        width: "100%",
        minHeight: 24,
        py: 0.25,
      }}
    >
      {names.map((name) => (
        <Chip
          key={name}
          size="small"
          label={name}
          onDelete={() => onChange(names.filter((n) => n !== name))}
          sx={{ height: 20, fontSize: "0.7rem", fontFamily: "monospace" }}
        />
      ))}
      <InputBase
        value={draft}
        placeholder={names.length === 0 ? placeholder : addLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
        inputProps={{ "aria-label": addLabel }}
        sx={{ fontSize: "0.78rem", flex: 1, minWidth: 72, "& input": { p: 0 } }}
      />
    </Box>
  );
}
