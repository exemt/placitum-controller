import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import InputBase from "@mui/material/InputBase";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import { FieldRow, TableValue } from "../components/fields.tsx";
import { draftKey } from "../components/table-block.tsx";
import {
  EditorField,
  editorInputSx,
  RowAction,
  SubRow,
  SubRows,
} from "./editor-kit.tsx";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { saveSpaceHttpThunk, sendConfigThunk } from "../store/slices/pages/config.ts";
import { shortHash } from "../fleet.ts";
import type { SpaceHttp } from "../api.ts";
import {
  asRecord,
  asString,
  sanitizeHttpWaf,
  type Doc,
} from "../pages/config-fields.tsx";
import { isBuiltinVar } from "./VarsCatalog.tsx";

export type Draft = {
  nginx_main: Doc;
  nginx: Doc;
  waf_http: Doc;
  waf: Doc;
  raw: boolean;
  raw_nginx: string;
};

export function fromDoc(doc: {
  nginx_main?: Record<string, unknown>;
  nginx: Record<string, unknown>;
  waf_http: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
}): Draft {
  return {
    nginx_main: { ...(doc.nginx_main ?? {}) },
    nginx: { ...doc.nginx },
    waf_http: { ...doc.waf_http },
    waf: { ...doc.waf },
    raw: doc.raw,
    raw_nginx: doc.raw_nginx,
  };
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function asPairs(value: unknown): Doc[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (row): row is Doc =>
      row !== null && typeof row === "object" && !Array.isArray(row),
  );
}

export function sanitize(draft: Draft): Draft {
  const waf_http = { ...draft.waf_http };
  const bus = asRecord(waf_http.bus);
  if (Object.keys(bus).length === 0) {
    delete waf_http.bus;
  }
  const shm = asRecord(waf_http.shmZone);
  if (asString(shm.name) === "" || asString(shm.size) === "") {
    delete waf_http.shmZone;
  }
  if (Array.isArray(waf_http.vars)) {
    const vars = asPairs(waf_http.vars).filter(
      (row) =>
        asString(row.name) !== "" &&
        asString(row.value) !== "" &&
        !isBuiltinVar(asString(row.name)),
    );
    if (vars.length === 0) {
      delete waf_http.vars;
    } else {
      waf_http.vars = vars;
    }
  }

  const waf = sanitizeHttpWaf({ ...draft.waf });

  const nginx = { ...draft.nginx };
  const buffers = asRecord(nginx.largeClientHeaderBuffers);
  if (typeof buffers.count !== "number" || asString(buffers.size) === "") {
    delete nginx.largeClientHeaderBuffers;
  }
  if (Array.isArray(nginx.addHeaders)) {
    const headers = asPairs(nginx.addHeaders).filter(
      (row) => asString(row.name) !== "" && asString(row.value) !== "",
    );
    if (headers.length === 0) {
      delete nginx.addHeaders;
    } else {
      nginx.addHeaders = headers;
    }
  }
  if (nginx.errorLog !== undefined && typeof nginx.errorLog !== "string") {
    if (asString(asRecord(nginx.errorLog).path) === "") {
      delete nginx.errorLog;
    }
  }
  if (Array.isArray(nginx.accessLog) && nginx.accessLog.length === 0) {
    delete nginx.accessLog;
  }

  const nginx_main = { ...draft.nginx_main };
  const events = asRecord(nginx_main.events);
  if (Object.keys(events).length === 0) {
    delete nginx_main.events;
  }

  return { ...draft, nginx_main, nginx, waf_http, waf };
}

export interface SiblingDraft {
  dirty: boolean;
  saving: boolean;
  save: () => void | Promise<void>;
  reset: () => void;
}

export function useHttpDraft(sibling?: SiblingDraft): {
  scope: string | null;
  doc: SpaceHttp | null;
  draft: Draft | null;
  setDraft: Dispatch<SetStateAction<Draft | null>>;
  loading: boolean;
  error: string | null;
} {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const doc = useAppSelector((s) => s.pages.config.doc);
  const loading = useAppSelector((s) => s.pages.config.loading);
  const saving = useAppSelector((s) => s.pages.config.saving);
  const sending = useAppSelector((s) => s.pages.config.sending);
  const lastSend = useAppSelector((s) => s.pages.config.lastSend);
  const error = useAppSelector((s) => s.pages.config.error);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    setDraft(doc === null ? null : fromDoc(doc));
  }, [doc]);

  const dirty = useMemo(() => {
    if (doc === null || draft === null) {
      return false;
    }
    return !sameDraft(draft, fromDoc(doc));
  }, [doc, draft]);

  const siblingDirty = sibling?.dirty ?? false;
  const siblingSaving = sibling?.saving ?? false;

  usePageBar({
    crumb: doc?.name,
    meta: lastSend
      ? t("config.sent", { rev: lastSend.rev, hash: shortHash(lastSend.config_hash) })
      : doc?.uuid,
    onSave:
      scope === null || draft === null
        ? undefined
        : () => {
            if (dirty) {
              void dispatch(
                saveSpaceHttpThunk({
                  scope,
                  ...sanitize(draft),
                }),
              );
            }
            if (sibling !== undefined && sibling.dirty) {
              void sibling.save();
            }
          },
    onReset:
      doc === null || draft === null
        ? undefined
        : () => {
            setDraft(fromDoc(doc));
            sibling?.reset();
          },
    onSend:
      scope === null
        ? undefined
        : () => {
            void dispatch(sendConfigThunk(scope));
          },
    saveDisabled: draft === null || saving || siblingSaving || (!dirty && !siblingDirty),
    resetDisabled: draft === null || saving || siblingSaving || (!dirty && !siblingDirty),
    sendDisabled: sending || scope === null,
  });

  return { scope, doc, draft, setDraft, loading, error };
}

export function EditorRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <FieldRow label={label} help={help}>
      <TableValue quiet grow>
        {children}
      </TableValue>
    </FieldRow>
  );
}

const pairInputSx = editorInputSx;

export function PairRows({
  rows,
  namePlaceholder,
  valuePlaceholder,
  mono,
  addLabel,
  extra,
  onChange,
}: {
  rows: Doc[];
  namePlaceholder: string;
  valuePlaceholder: string;
  mono?: boolean;
  addLabel: string;
  extra?: (row: Doc, patch: (patch: Doc) => void) => ReactNode;
  onChange: (next: Doc[]) => void;
}) {
  const t = useT();
  const patchAt = (index: number, patch: Doc) =>
    onChange(
      rows.map((item, i) => {
        if (i !== index) {
          return item;
        }
        const next = { ...item, ...patch };
        for (const key of Object.keys(patch)) {
          if (patch[key] === undefined) {
            delete next[key];
          }
        }
        return next;
      }),
    );

  const font = mono === true ? "monospace" : undefined;

  const [draftName, setDraftName] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const ready = draftName.trim() !== "" && draftValue.trim() !== "";
  const add = () => {
    onChange([...rows, { name: draftName.trim(), value: draftValue.trim() }]);
    setDraftName("");
    setDraftValue("");
    nameRef.current?.focus();
  };
  const onKey = draftKey(ready, add);

  return (
    <SubRows>
      {rows.map((row, index) => (
        <SubRow
          key={index}
          actions={
            <RowAction
              color="error"
              title={t("common.delete")}
              icon={<DeleteIcon sx={{ fontSize: 16 }} />}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            />
          }
        >
          <EditorField width={190}>
            <InputBase
              value={asString(row.name)}
              placeholder={namePlaceholder}
              onChange={(e) => patchAt(index, { name: e.target.value })}
              sx={{ ...pairInputSx, fontFamily: font }}
            />
          </EditorField>
          <EditorField grow>
            <InputBase
              value={asString(row.value)}
              placeholder={valuePlaceholder}
              onChange={(e) => patchAt(index, { value: e.target.value })}
              sx={{ ...pairInputSx, fontFamily: font }}
            />
          </EditorField>
          {extra?.(row, (patch) => patchAt(index, patch))}
        </SubRow>
      ))}
      <SubRow
        actions={
          <RowAction
            color="success"
            title={addLabel}
            disabled={!ready}
            icon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={add}
          />
        }
      >
        <EditorField width={190}>
          <InputBase
            inputRef={nameRef}
            value={draftName}
            placeholder={namePlaceholder}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={onKey}
            sx={{ ...pairInputSx, fontFamily: font }}
          />
        </EditorField>
        <EditorField grow>
          <InputBase
            value={draftValue}
            placeholder={valuePlaceholder}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={onKey}
            sx={{ ...pairInputSx, fontFamily: font }}
          />
        </EditorField>
      </SubRow>
    </SubRows>
  );
}
