import { createContext, useContext, type ReactNode } from "react";
import InputBase from "@mui/material/InputBase";

import type { CatalogBundle } from "../api.ts";
import {
  EditorField,
  editorInputSx,
  SubRow,
} from "./editor-kit.tsx";
import { useT } from "../i18n/index.ts";
import type { Doc } from "./inherit.ts";
import { Picker } from "./Picker.tsx";

const inputSx = editorInputSx;

export function TextEdit({
  value,
  onChange,
  placeholder,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  placeholder?: string;
}) {
  return (
    <InputBase
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      sx={inputSx}
    />
  );
}

const CatalogContext = createContext<CatalogBundle | null>(null);

export function CatalogProvider({
  value,
  children,
}: {
  value: CatalogBundle | null;
  children: ReactNode;
}) {
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogBundle | null {
  return useContext(CatalogContext);
}

export type CatalogKind = "deny_responses" | "datasets" | "log_formats" | "inspectors";

export function CatalogEdit({
  value,
  onChange,
  kind,
  filter,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  kind: CatalogKind;
  filter?: (row: { name: string; kind?: string; in_nginx?: boolean }) => boolean;
}) {
  const catalog = useCatalog();
  const current = typeof value === "string" ? value : "";

  if (catalog === null) {
    return <TextEdit value={value} onChange={onChange} />;
  }

  const rows = (catalog[kind] ?? []).filter((row) =>
    filter === undefined
      ? true
      : filter(row as { name: string; kind?: string; in_nginx?: boolean }),
  );

  return (
    <Picker
      plain
      value={current}
      onChange={onChange}
      options={rows.map((row) => ({
        value: row.name,
        hint: summary(row as Record<string, unknown>),
      }))}
    />
  );
}

function summary(row: Record<string, unknown>): string {
  if (typeof row.status === "number") {
    return String(row.status);
  }
  if (typeof row.subject === "string") {
    return row.subject;
  }
  if (typeof row.summary === "string") {
    return row.summary.slice(0, 40);
  }
  if (typeof row.type === "string") {
    const mode = row.active === true ? "active" : "internal";
    return `${row.type} · ${mode}`;
  }
  return "";
}

export function ScoreEdit({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const t = useT();
  const row = (value !== null && typeof value === "object" ? value : {}) as Doc;
  const threshold = typeof row.threshold === "number" ? String(row.threshold) : "";

  return (
    <SubRow>
      <EditorField width={64}>
        <InputBase
          value={threshold}
          placeholder="100"
          onChange={(e) => {
            const n = Number(e.target.value.trim());
            onChange({ ...row, threshold: Number.isFinite(n) ? n : 0 });
          }}
          sx={inputSx}
        />
      </EditorField>
      <EditorField grow label={t("config.op.scorePage")}>
        <CatalogEdit
          kind="deny_responses"
          value={row.response}
          onChange={(next) => {
            const copy = { ...row };
            if (typeof next === "string" && next !== "") {
              copy.response = next;
            } else {
              delete copy.response;
            }
            onChange(copy);
          }}
        />
      </EditorField>
    </SubRow>
  );
}
