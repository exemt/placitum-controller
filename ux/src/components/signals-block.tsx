import { useState } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

import { serviceOfSubject, type InspectorMeta, type SenderCode } from "../api.ts";
import { TableNotice, TableNoticeRow, type FilterOption } from "./data-table/index.ts";
import { DialogMulti, DialogPick, type DialogOption } from "./dialog-kit.tsx";
import { Modal } from "./Modal.tsx";
import { CODE_W, HeadCell, TableBlock, flushTableSx } from "./table-block.tsx";
import { AddCell, RowActions, TextCell } from "./rules-table.tsx";
import { ACTION_CODE_RE, ActionCodesField, axisLabel, verbLabel } from "./action-select.tsx";
import { useT, type Translate } from "../i18n/index.ts";

export interface SignalRule {
  from: string;
  accept: string[];
  codes: string[];
  apply?: string[];
  counter?: string;
}

export const ANY_SENDER = "*";

const ALL_VERBS = "*";

const FROM_W = 130;
const ACCEPT_W = 170;

function broadcast(from: string): boolean {
  const name = from.trim();

  return name === "" || name === ANY_SENDER;
}

export function SignalsBlock({
  hint,
  help,
  rules,
  verbs,
  weakening = [],
  codes = [],
  unknown = [],
  senders = [],
  axes,
  targets,
  defaultRule,
  embedded = false,
  onChange,
}: {
  hint: string;
  help?: string;
  rules: SignalRule[];
  verbs: readonly FilterOption<string>[];
  weakening?: readonly string[];
  codes?: readonly SenderCode[];
  unknown?: readonly string[];
  senders?: readonly InspectorMeta[];
  axes?: (accept: string[]) => readonly FilterOption<string>[];
  targets?: readonly FilterOption<string>[];
  defaultRule: () => SignalRule;
  embedded?: boolean;
  onChange: (rules: SignalRule[]) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  const verbsOf = (rule: SignalRule): readonly FilterOption<string>[] => {
    const offered = broadcast(rule.from)
      ? verbs.filter((v) => v.value !== ALL_VERBS && !weakening.includes(v.value))
      : verbs;
    const kept = rule.accept
      .filter((v) => v !== ALL_VERBS && !offered.some((o) => o.value === v))
      .map((v) => ({ value: v, label: verbLabel(t, v) }));

    return kept.length === 0 ? offered : [...offered, ...kept];
  };

  const weakBroadcast = rules.some(
    (r) => broadcast(r.from) && r.accept.some((v) => v === ALL_VERBS || weakening.includes(v)),
  );

  const notices = [
    weakBroadcast ? (
      <TableNotice
        key="weak"
        kind="info"
        severity="warning"
        message={t("prior.broadcastWeakens")}
      />
    ) : null,
    unknown.length > 0 ? (
      <TableNotice
        key="unknown"
        kind="info"
        message={`${t("channel.unknownSenders")}: ${unknown.join(", ")}`}
      />
    ) : null,
  ].filter(Boolean);

  const notice = notices.length > 0 ? <>{notices}</> : undefined;

  const params = axes !== undefined || targets !== undefined;

  const acceptLabel = (verb: string): string =>
    verbs.find((v) => v.value === verb)?.label ?? verbLabel(t, verb);

  const table = (
    <Table size="small" sx={flushTableSx}>
      <TableHead>
        <TableRow>
          <HeadCell label={t("prior.from")} width={FROM_W} />
          <HeadCell label={t("prior.accept")} width={params ? ACCEPT_W : undefined} />
          <HeadCell label={t("prior.codes")} width={CODE_W} />
          {params && <HeadCell label={t("outcomes.outcomeParams")} />}
          <AddCell label={t("common.add")} onAdd={() => setEditing(null)} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rules.length === 0 && (
          <TableNoticeRow colSpan={params ? 5 : 4} kind="empty" message={t("prior.empty")} />
        )}
        {rules.map((rule, i) => (
          <TableRow key={i} hover>
            <TextCell
              text={broadcast(rule.from) ? t("prior.fromAny") : rule.from}
              muted={broadcast(rule.from)}
            />
            <TextCell text={rule.accept.map(acceptLabel).join(", ")} />
            <TextCell
              text={rule.codes.length === 0 ? t("prior.codesAny") : rule.codes.join(", ")}
              muted={rule.codes.length === 0}
            />
            {params && (
              <TextCell text={summaryOf(t, rule, { axes, targets })} muted />
            )}
            <RowActions
              onEdit={() => setEditing(i)}
              onRemove={() => onChange(rules.filter((_r, j) => j !== i))}
            />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const dialog = editing !== undefined && (
    <SignalDialog
      help={help}
      rule={editing === null ? defaultRule() : (rules[editing] ?? defaultRule())}
      isNew={editing === null}
      verbsOf={verbsOf}
      senders={senders}
      codes={codes}
      axes={axes}
      targets={targets}
      onSave={(next) => {
        onChange(
          editing === null ? [...rules, next] : rules.map((r, i) => (i === editing ? next : r)),
        );
        setEditing(undefined);
      }}
      onClose={() => setEditing(undefined)}
    />
  );

  if (embedded === true) {
    return (
      <>
        {notice}
        {table}
        {dialog}
      </>
    );
  }

  return (
    <>
      <TableBlock
        title={t("channel.signals")}
        label={hint}
        help={help}
        notice={notice}
      >
        {table}
      </TableBlock>
      {dialog}
    </>
  );
}

function summaryOf(
  t: Translate,
  rule: SignalRule,
  cols: {
    axes?: (accept: string[]) => readonly FilterOption<string>[];
    targets?: readonly FilterOption<string>[];
  },
): string {
  const parts: string[] = [];

  if (cols.axes !== undefined && (rule.apply ?? []).length > 0) {
    const options = cols.axes(rule.accept);
    const names = (rule.apply ?? []).map(
      (axis) => options.find((o) => o.value === axis)?.label ?? axisLabel(t, axis),
    );

    parts.push(`${t("prior.apply")}: ${names.join(", ")}`);
  }

  if (cols.targets !== undefined && (rule.counter ?? "") !== "") {
    parts.push(`${t("prior.counter")}: ${rule.counter}`);
  }

  return parts.length === 0 ? "—" : parts.join(" · ");
}

function SignalDialog({
  help,
  rule,
  isNew,
  verbsOf,
  senders,
  codes,
  axes,
  targets,
  onSave,
  onClose,
}: {
  help?: string;
  rule: SignalRule;
  isNew: boolean;
  verbsOf: (rule: SignalRule) => readonly FilterOption<string>[];
  senders: readonly InspectorMeta[];
  codes: readonly SenderCode[];
  axes?: (accept: string[]) => readonly FilterOption<string>[];
  targets?: readonly FilterOption<string>[];
  onSave: (rule: SignalRule) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<SignalRule>(() => ({
    ...rule,
    from: broadcast(rule.from) ? ANY_SENDER : rule.from,
    accept: [...rule.accept],
    codes: [...rule.codes],
    apply: rule.apply === undefined ? undefined : [...rule.apply],
  }));

  const set = (part: Partial<SignalRule>) => setDraft((prev) => ({ ...prev, ...part }));

  const senderOptions: DialogOption<string>[] = [
    { value: ANY_SENDER, label: t("prior.fromAnyLong"), tag: ANY_SENDER },
    ...senders.map((row) => ({
      value: row.name,
      label: row.name,
      tag: serviceOfSubject(row.subject),
    })),
  ];

  if (!broadcast(draft.from) && !senders.some((row) => row.name === draft.from)) {
    senderOptions.push({ value: draft.from, label: draft.from, tag: "?", missing: true });
  }

  const wantsNote = draft.accept.includes("note");
  const axisOptions = axes?.(draft.accept) ?? [];

  const setFrom = (from: string) => {
    const next = { ...draft, from };

    if (broadcast(from)) {
      const offered = verbsOf(next);

      next.accept = next.accept.filter((v) => offered.some((o) => o.value === v));
    }

    setDraft(next);
  };

  const setAccept = (picked: string[]) => {
    let accept = picked;
    const hadAll = draft.accept.includes(ALL_VERBS);
    const hasAll = accept.includes(ALL_VERBS);

    if (hasAll && !hadAll) {
      accept = [ALL_VERBS];
    } else if (hasAll && accept.length > 1) {
      accept = accept.filter((v) => v !== ALL_VERBS);
    }

    const next = { ...draft, accept };

    if (axes !== undefined) {
      const allowed = axes(accept).map((o) => o.value);

      next.apply = (next.apply ?? []).filter((axis) => allowed.includes(axis));
    }

    if (targets !== undefined && !accept.includes("note")) {
      next.counter = "";
    }

    setDraft(next);
  };

  const badCodes = draft.codes.some((code) => !ACTION_CODE_RE.test(code));

  const ready =
    draft.accept.length > 0 &&
    !badCodes &&
    (targets === undefined || !wantsNote || (draft.counter ?? "") !== "");

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={isNew ? t("prior.addSignal") : t("prior.editSignal")}
      hint={t("prior.dialogHint")}
      help={help}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={() => onSave(draft)}>
            {isNew ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <DialogPick
        label={t("prior.from")}
        hint={t("prior.fromHint")}
        value={draft.from}
        options={senderOptions}
        mono
        onChange={setFrom}
      />
      <DialogMulti
        label={t("prior.accept")}
        hint={t("prior.acceptHint")}
        value={draft.accept}
        options={verbsOf(draft)}
        emptyLabel={t("prior.counterPick")}
        onChange={setAccept}
      />
      {axes !== undefined && (
        <DialogMulti
          label={t("prior.apply")}
          hint={t("prior.applyHint")}
          value={draft.apply ?? []}
          options={axisOptions}
          emptyLabel={t("prior.applyAny")}
          disabled={axisOptions.length === 0}
          onChange={(apply) => set({ apply })}
        />
      )}
      {targets !== undefined && (
        <DialogPick
          label={t("prior.counter")}
          hint={t("prior.counterHint")}
          value={draft.counter ?? ""}
          options={[
            { value: "", label: wantsNote ? t("prior.counterPick") : "—" },
            ...targets.map((row) => ({ value: row.value, label: row.label })),
          ]}
          disabled={!wantsNote}
          mono
          onChange={(counter) => set({ counter })}
        />
      )}
      <ActionCodesField
        label={t("prior.codes")}
        hint={t("prior.codesHint")}
        anyLabel={t("prior.codesAny")}
        value={draft.codes}
        options={codes}
        onChange={(next) => set({ codes: next })}
      />
    </Modal>
  );
}
