import { useMemo } from "react";

import { InheritModeProvider } from "../components/fields.tsx";
import { SettingsTable, UnitLabel } from "../components/settings-table.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { CatalogEdit, ScoreEdit } from "./editors.tsx";
import { InheritedRow, type InheritedCtx } from "./InheritedRow.tsx";
import { CookieDefaultsEdit } from "./LocalRules.tsx";
import { ExceptionEdit } from "./ExceptionEdit.tsx";
import type { Doc, Level, ParentChain } from "./inherit.ts";
import type { LayerItem } from "./layer-tabs.tsx";
import {
  BOOL_OPTIONS,
  boolToOption,
  optionToBool,
  pickPresets,
  PickValue,
  RowInput,
  RowList,
  valuePresets,
} from "./route-editors.tsx";

type Editor =
  | { kind: "bool" }
  | { kind: "num"; unit?: string; presets?: readonly number[] }
  | { kind: "text"; placeholder?: string; presets?: readonly string[] }
  | { kind: "choice"; options: readonly string[] }
  | { kind: "list"; placeholder?: string }
  | { kind: "score" }
  | { kind: "catalog"; catalog: "deny_responses" | "datasets" | "log_formats" }
  | { kind: "cookieDefaults" }
  | { kind: "exception" };

interface FieldSpec {
  key: string;
  directive: string;
  editor: Editor;
  offable?: boolean;
  levels?: Level[];
}

interface GroupSpec {
  id: string;
  fields: FieldSpec[];
}

const BODY_LIMIT = ["block", "trim", "pass"] as const;
const DENY_MODES = ["fast", "deterministic"] as const;
const HOLD_MODES = ["gate", "monitor"] as const;
const FRAME_AUDIT = ["off", "deny", "all"] as const;
const AUDIT_SAMPLES = [2, 5, 10, 100] as const;
const CONTROL_RATES = ["2r/s", "10r/s", "60r/m", "off"] as const;
const CACHE_TTLS = ["10s", "30s", "1m", "5m"] as const;
const CACHE_STREAMS = ["both", "c2s", "s2c"] as const;
const DEADLINE_MS = [100, 250, 500, 1000, 2000] as const;
const BODY_SIZES = ["256k", "1m", "8m", "64m"] as const;

const GROUPS: GroupSpec[] = [
  {
    id: "core",
    fields: [
      { key: "enabled", directive: "waf", editor: { kind: "bool" } },
      {
        key: "deadlineMs",
        directive: "waf_deadline",
        editor: { kind: "num", unit: "ms", presets: DEADLINE_MS },
      },
      {
        key: "denyMode",
        directive: "waf_deny_mode",
        editor: { kind: "choice", options: DENY_MODES },
      },
    ],
  },
  {
    id: "policies",
    fields: [
      { key: "exception", directive: "waf_exception", editor: { kind: "exception" } },
    ],
  },
  {
    id: "score",
    fields: [
      { key: "scoreDeny", directive: "waf_score_deny", editor: { kind: "score" } },
      {
        key: "denyResponseDefault",
        directive: "waf_deny_response_default",
        editor: { kind: "catalog", catalog: "deny_responses" },
      },
      {
        key: "redirectAllow",
        directive: "waf_redirect_allow",
        editor: { kind: "list", placeholder: "/waf/captcha  https://example.com" },
        offable: true,
      },
      {
        key: "actionMax",
        directive: "waf_action_max",
        editor: { kind: "text", placeholder: "192" },
      },
      {
        key: "actionsMax",
        directive: "waf_actions_max",
        editor: { kind: "num", presets: [0, 8, 16, 32, 64] },
      },
    ],
  },
  {
    id: "body",
    fields: [
      {
        key: "bodyLimit",
        directive: "waf_body_limit",
        editor: { kind: "text", placeholder: "1m", presets: BODY_SIZES },
      },
      {
        key: "bodyLimitPolicy",
        directive: "waf_body_limit · политика",
        editor: { kind: "choice", options: BODY_LIMIT },
      },
    ],
  },
  {
    id: "cookie",
    fields: [
      {
        key: "cookieDefaults",
        directive: "waf_cookie_defaults",
        editor: { kind: "cookieDefaults" },
      },
      { key: "debugHeader", directive: "waf_debug_header", editor: { kind: "bool" } },
    ],
  },
  {
    id: "phaseResponse",
    fields: [
      {
        key: "responseDeadlineMs",
        directive: "waf_deadline response",
        editor: { kind: "num", unit: "ms", presets: DEADLINE_MS },
      },
      {
        key: "responseHold",
        directive: "waf_hold response",
        editor: { kind: "choice", options: HOLD_MODES },
      },
      {
        key: "responseScoreDeny",
        directive: "waf_score_deny response",
        editor: { kind: "score" },
      },
    ],
  },
  {
    id: "phaseFrame",
    fields: [
      {
        key: "frameDeadlineMs",
        directive: "waf_deadline frame",
        editor: { kind: "num", unit: "ms", presets: DEADLINE_MS },
      },
      {
        key: "frameScoreDeny",
        directive: "waf_score_deny frame",
        editor: { kind: "score" },
      },
      {
        key: "requireUpgrade",
        directive: "waf_require_upgrade",
        editor: { kind: "bool" },
      },
      {
        key: "requireUpgradeResponse",
        directive: "waf_require_upgrade response=",
        editor: { kind: "catalog", catalog: "deny_responses" },
      },
      {
        key: "wsStripExtensions",
        directive: "waf_ws_strip_extensions",
        editor: { kind: "list" },
      },
      {
        key: "frameAudit",
        directive: "waf_audit_frames",
        editor: { kind: "choice", options: FRAME_AUDIT },
      },
      {
        key: "frameAuditSample",
        directive: "waf_audit_frames sample=",
        editor: { kind: "num", presets: AUDIT_SAMPLES },
      },
      {
        key: "frameReassemble",
        directive: "waf_frame_reassemble",
        editor: { kind: "bool" },
      },
      {
        key: "frameControlRate",
        directive: "waf_frame_control_rate",
        editor: { kind: "text", placeholder: "10r/s", presets: CONTROL_RATES },
      },
      {
        key: "frameCacheTtl",
        directive: "waf_frame_cache ttl=",
        editor: { kind: "text", placeholder: "30s", presets: CACHE_TTLS },
      },
      {
        key: "frameCacheStream",
        directive: "waf_frame_cache: сторона",
        editor: { kind: "choice", options: CACHE_STREAMS },
      },
    ],
  },
];

export type RouteLevel = Exclude<Level, "http">;

export type RouteProtocol = "http" | "websocket";

export function phasesFor(
  level: RouteLevel,
  protocol: RouteProtocol | undefined,
): ("request" | "response" | "frame")[] {
  if (level === "location" && protocol === "websocket") {
    return ["request", "frame"];
  }
  return ["request", "response"];
}

const PHASE_GROUPS: Record<string, "response" | "frame"> = {
  phaseResponse: "response",
  phaseFrame: "frame",
};

function groupsFor(level: RouteLevel, protocol?: RouteProtocol): GroupSpec[] {
  const phases = phasesFor(level, protocol);
  return GROUPS.filter((group) => {
    const phase = PHASE_GROUPS[group.id];
    return phase === undefined || phases.includes(phase);
  })
    .map((group) => ({
      ...group,
      fields: group.fields.filter(
        (field) => field.levels === undefined || field.levels.includes(level),
      ),
    }))
    .filter((group) => group.fields.length > 0);
}

export function routeItems(
  t: Translate,
  level: RouteLevel,
  protocol?: RouteProtocol,
): LayerItem<string>[] {
  return groupsFor(level, protocol).map((group) => ({
    id: group.id,
    label: t(`config.group.${group.id}`),
    hint: hint(t, group.id),
  }));
}

export function routeKeys(level: RouteLevel, protocol?: RouteProtocol): string[] {
  return groupsFor(level, protocol).flatMap((group) => group.fields.map((field) => field.key));
}

function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function routeCount(level: RouteLevel, waf: Doc, protocol?: RouteProtocol): number {
  return routeKeys(level, protocol).filter((key) => isSet(waf[key])).length;
}

export function RouteGroupBody({
  level,
  protocol,
  group,
  waf,
  parents,
  onChange,
}: {
  level: RouteLevel;
  protocol?: RouteProtocol;
  group: string;
  waf: Doc;
  parents: ParentChain;
  onChange: (next: Doc) => void;
}) {
  const t = useT();
  const found = useMemo(
    () => groupsFor(level, protocol).find((row) => row.id === group),
    [level, protocol, group],
  );
  if (found === undefined) {
    return null;
  }

  return (
    <InheritModeProvider value={parents}>
    <SettingsTable>
      {found.fields.map((field) => (
        <InheritedRow
          key={field.key}
          label={field.directive}
          unit={
            field.editor.kind === "num" && field.editor.unit !== undefined ? (
              <UnitLabel>{field.editor.unit}</UnitLabel>
            ) : undefined
          }
          help={t(`config.help.${field.key}`)}
          fieldKey={field.key}
          doc={waf}
          parents={parents}
          onChange={onChange}
          offable={field.offable}
          seed={seedOf(field.editor)}
          end={(row) => renderEnd(field.editor, row)}
        >
          {(value, set) => renderEditor(field.editor, value, set)}
        </InheritedRow>
      ))}
    </SettingsTable>
    </InheritModeProvider>
  );
}

function renderEditor(
  editor: Editor,
  value: unknown,
  set: (next: unknown) => void,
) {
  switch (editor.kind) {
    case "bool":
      return <PickValue value={boolToOption(value)} />;
    case "choice":
      return <PickValue value={value} />;
    case "num":
      return <RowInput number value={value} onChange={set} />;
    case "text":
      return <RowInput mono value={value} onChange={set} placeholder={editor.placeholder} />;
    case "list":
      return <RowList value={value} onChange={set} placeholder={editor.placeholder} />;
    case "score":
      return <ScoreEdit value={value} onChange={set} />;
    case "catalog":
      return <CatalogEdit value={value} onChange={set} kind={editor.catalog} />;
    case "cookieDefaults":
      return <CookieDefaultsEdit value={value} onChange={set} />;
    case "exception":
      return <ExceptionEdit value={value} onChange={set} />;
  }
}

function seedOf(editor: Editor): unknown {
  switch (editor.kind) {
    case "bool":
      return true;
    case "num":
      return editor.presets?.[0] ?? 0;
    case "text":
      return editor.presets?.[0] ?? editor.placeholder ?? "-";
    case "choice":
      return editor.options[0];
    case "list":
      return (editor.placeholder ?? "").split(/\s+/).filter(Boolean).slice(0, 1);
    case "score":
      return { threshold: 100 };
    case "catalog":
      return "";
    case "cookieDefaults":
      return {};
    case "exception":
      return ["request timeout deny"];
  }
}

function renderEnd(editor: Editor, row: InheritedCtx) {
  switch (editor.kind) {
    case "bool":
      return pickPresets(row, BOOL_OPTIONS, optionToBool, boolToOption);
    case "choice":
      return pickPresets(row, editor.options);
    case "num":
    case "text":
      return editor.presets === undefined ? undefined : valuePresets(row, editor.presets);
    default:
      return undefined;
  }
}

function hint(t: Translate, id: string): string | undefined {
  const path = `config.group.${id}Hint`;
  const text = t(path);
  return text === path ? undefined : text;
}
