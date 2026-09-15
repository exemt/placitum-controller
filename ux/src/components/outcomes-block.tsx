import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";

import { DIALOG_FIELD_H, DialogSection } from "./dialog-kit.tsx";
import { valueChipSx } from "./fields.tsx";
import { Modal } from "./Modal.tsx";
import { TableBlock } from "./table-block.tsx";
import { ActionRulesTable } from "./rules-table.tsx";
import type { ActionRegistry, InspectorMeta, OutcomeRule } from "../api.ts";
import { CRS_TAGS } from "../crs-tags.ts";
import {
  ActionPart,
  actionReady,
  TO_MODULE,
  askPayload,
  auditSummary,
  draftOfAsk,
  draftOfList,
  emptyActionDraft,
  humanTtl,
  phaseSummary,
  ttlSeconds,
  TO_DATASET,
  type ActionDraft,
} from "./action-part.tsx";
import { axisLabel, verbLabel } from "./action-select.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { OVERLOAD_AT_MAX, OVERLOAD_AT_MIN, overloadAtOf, overloadAtOk } from "../overload.ts";

const ONS = ["deny", "allow", "score"] as const;

const WRITES = ["addr", "net", "net_all", "asn"] as const;

function askable(on: string): boolean {
  return on !== "deny";
}

export type OutcomeOn = OutcomeRule["on"];

export function emptyOutcome(): OutcomeRule {
  return {
    on: "score",
    at: null,
    below: false,
    eq: false,
    if: null,
    to: "",
    do: "",
    apply: "",
    delta: null,
    value: null,
    counter: "",
    list: "",
    write: "addr",
    ttlS: 0,
    code: "",
  };
}

export function OutcomesBlock({
  hint,
  outcomes,
  datasets,
  inspectors,
  registry,
  buckets,
  ons,
  writable = true,
  writes,
  onChange,
  phases,
}: {
  hint: string;
  outcomes: OutcomeRule[];
  datasets: string[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  buckets?: { counter: string; axes: string[] }[];
  ons?: readonly OutcomeOn[];
  writable?: boolean;
  writes?: readonly OutcomeRule["write"][];
  onChange: (outcomes: OutcomeRule[]) => void;
  phases?: readonly { value: string; label: string }[];
}) {
  const t = useT();
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  const phaseLabel = (phase: string | undefined) =>
    phases?.find((p) => p.value === phase)?.label ?? phase ?? "";

  return (
    <>
      <TableBlock title={t("channel.rules")} label={hint} last>
        <ActionRulesTable
          whereLabel={phases !== undefined ? t("outcomes.outcomeWhere") : undefined}
          rows={outcomes.map((outcome, i) => ({
            key: String(i),
            where: phases !== undefined ? phaseLabel(outcome.section) : undefined,
            when: whenOf(t, outcome),
            target: targetOf(t, outcome),
            targetMuted: outcome.do === "",
            what: whatOf(t, outcome),
            params: summaryOf(t, outcome),
            onEdit: () => setEditing(i),
            onRemove: () => onChange(outcomes.filter((_o, j) => j !== i)),
          }))}
          empty={t("outcomes.outcomesEmpty")}
          addLabel={t("common.add")}
          onAdd={() => setEditing(null)}
        />
      </TableBlock>
      {editing !== undefined && (
        <OutcomeDialog
          phases={phases}
          outcome={editing === null ? null : (outcomes[editing] ?? null)}
          datasets={datasets}
          inspectors={inspectors}
          registry={registry}
          buckets={buckets}
          ons={ons}
          writable={writable}
          writes={writes}
          onSave={(outcome) => {
            onChange(
              editing === null
                ? [...outcomes, outcome]
                : outcomes.map((o, i) => (i === editing ? outcome : o)),
            );
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}

function whenOf(t: Translate, o: OutcomeRule): string {
  if (o.on === "level") {
    const sign = o.below ? "<" : "≥";
    const where = o.if === null || o.if === undefined ? "?" : `${o.if.counter}/${o.if.axis}`;

    return `${where} ${sign} ${o.at ?? 0}%`;
  }

  if (o.on === "overload") {
    return `${t("outcomes.ons.overload")} ≥ ${o.at ?? OVERLOAD_AT_MAX}%`;
  }

  if (o.on === "rule") {
    return `${t("outcomes.ons.rule")}: ${ruleFilterSummary(o.rules ?? [], o.tags ?? [])}`;
  }

  if (o.on !== "score") {
    return t(`outcomes.ons.${o.on}`);
  }

  const sign = o.eq ? "=" : o.below ? "<" : "≥";

  return `${t("outcomes.ons.score")} ${sign} ${o.at ?? 0}`;
}

function targetOf(t: Translate, o: OutcomeRule): string {
  if (o.do === "score") {
    return t("outcomes.toRoute");
  }

  if (o.do !== "") {
    return o.to === "" ? t("outcomes.toAny") : o.to;
  }

  return t("outcomes.toDataset");
}

function whatOf(t: Translate, o: OutcomeRule): string {
  return o.do === "" ? t("outcomes.outcomeWrite") : verbLabel(t, o.do);
}

function summaryOf(t: Translate, o: OutcomeRule): string {
  const parts: string[] = [];

  if (o.do === "") {
    parts.push(o.list);
    parts.push(t(`outcomes.writes.${o.write}`));
    parts.push(humanTtl(o.ttlS));
  } else {
    if (o.apply !== "" && o.do === "note") {
      parts.push(axisLabel(t, o.apply));
    }

    if (o.delta !== null) {
      parts.push(`${o.delta > 0 ? "+" : ""}${o.delta}%`);
    }

    if (o.value !== null) {
      parts.push(
        o.do === "score"
          ? t("actions.score.summary", { n: `${o.value > 0 ? "+" : ""}${o.value}` })
          : `${o.value > 0 ? "+" : ""}${o.value}%`,
      );
    }

    if (o.marker !== undefined && o.marker !== "") {
      parts.push(o.marker);
    }

    if (o.group !== undefined && o.group !== "") {
      parts.push(`${o.group} → ${t(o.set === "off" ? "actions.mutate.off" : "actions.mutate.on")}`);
    }

    parts.push(...phaseSummary(t, o));

    parts.push(...auditSummary(t, o));
  }

  if (o.code !== "") {
    parts.push(o.code);
  }

  return parts.join(" · ");
}

interface Fields {
  on: OutcomeRule["on"];
  at: string;
  section: string;
  cmp: "above" | "below" | "eq";
  bucket: string;
  bucketAxis: string;
  rules: string[];
  tags: string[];
  draft: ActionDraft;
}

function fieldsOf(outcome: OutcomeRule | null, writable: boolean): Fields {
  if (outcome === null) {
    return {
      on: "score",
      at: "",
      section: "",
      cmp: "above",
      bucket: "",
      bucketAxis: "",
      rules: [],
      tags: [],
      draft: { ...emptyActionDraft(), target: writable ? TO_DATASET : "" },
    };
  }

  return {
    on: outcome.on,
    at: outcome.at === null ? "" : String(outcome.at),
    section: outcome.section ?? "",
    cmp: outcome.eq ? "eq" : outcome.below ? "below" : "above",
    bucket: outcome.if?.counter ?? "",
    bucketAxis: outcome.if?.axis ?? "",
    rules: outcome.rules ?? [],
    tags: outcome.tags ?? [],
    draft: outcome.do !== "" ? draftOfAsk(outcome) : draftOfList(outcome),
  };
}

function numberOk(raw: string, min: number, max: number): boolean {
  if (raw.trim() === "") {
    return false;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= min && n <= max;
}

function OutcomeDialog({
  outcome,
  datasets,
  inspectors,
  registry,
  buckets,
  ons,
  writable = true,
  writes,
  phases,
  onSave,
  onClose,
}: {
  outcome: OutcomeRule | null;
  datasets: string[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  buckets?: { counter: string; axes: string[] }[];
  ons?: readonly OutcomeOn[];
  writable?: boolean;
  writes?: readonly OutcomeRule["write"][];
  phases?: readonly { value: string; label: string }[];
  onSave: (outcome: OutcomeRule) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState<Fields>(() => {
    const init = fieldsOf(outcome, writable);
    if (phases !== undefined && init.section === "") {
      init.section = phases[0]?.value ?? "";
    }
    return init;
  });

  const set = (patch: Partial<Fields>) => setFields((prev) => ({ ...prev, ...patch }));
  const patchDraft = (patch: Partial<ActionDraft>) =>
    setFields((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }));

  const asks = askable(fields.on);

  const ready = (): boolean => {
    if (fields.on === "score" && !numberOk(fields.at, 0, 100)) {
      return false;
    }

    if (fields.on === "level") {
      if (fields.bucket === "" || fields.bucketAxis === "") {
        return false;
      }

      if (!numberOk(fields.at, 0, 100)) {
        return false;
      }
    }

    if (fields.on === "overload" && !overloadAtOk(fields.at)) {
      return false;
    }

    if (
      fields.on === "rule" &&
      ((fields.rules.length === 0 && fields.tags.length === 0) ||
        !fields.rules.every(ruleOk) ||
        !fields.tags.every(tagOk))
    ) {
      return false;
    }

    return actionReady(fields.draft, {
      askable: asks || fields.draft.target === TO_MODULE,
    });
  };

  const triggerSummary = (): string => {
    const parts: string[] = [];

    if (phases !== undefined) {
      parts.push(phases.find((p) => p.value === fields.section)?.label ?? fields.section);
    }

    if (fields.on === "level") {
      const sign = fields.cmp === "below" ? "<" : "≥";
      parts.push(`${fields.bucket || "?"}/${fields.bucketAxis || "?"} ${sign} ${fields.at || "?"}%`);
    } else if (fields.on === "score") {
      const sign = fields.cmp === "eq" ? "=" : fields.cmp === "below" ? "<" : "≥";
      parts.push(`${t("outcomes.ons.score")} ${sign} ${fields.at || "?"}`);
    } else if (fields.on === "overload") {
      parts.push(`${t("outcomes.ons.overload")} ≥ ${fields.at.trim() || OVERLOAD_AT_MAX}%`);
    } else if (fields.on === "rule") {
      parts.push(`${t("outcomes.ons.rule")}: ${ruleFilterSummary(fields.rules, fields.tags) || "?"}`);
    } else {
      parts.push(t(`outcomes.ons.${fields.on}`));
    }

    return parts.join(" · ");
  };

  const actionSummary = (): string => {
    const d = fields.draft;

    if (d.target === "") {
      return "";
    }

    if (d.target === TO_DATASET) {
      return [t("outcomes.toDataset"), d.list].filter((part) => part !== "").join(" · ");
    }

    const to = d.target === TO_MODULE ? t("outcomes.toModule") : d.target;

    return d.verb === "" ? to : `${to} · ${verbLabel(t, d.verb)}`;
  };

  const save = () => {
    const out = emptyOutcome();

    out.on = fields.on;
    out.code = fields.draft.code;

    if (phases !== undefined) {
      out.section = fields.section;
    }

    if (fields.on === "score") {
      out.at = Number(fields.at);
      out.below = fields.cmp === "below";
      out.eq = fields.cmp === "eq";
    }

    if (fields.on === "level") {
      out.at = Number(fields.at);
      out.below = fields.cmp === "below";
      out.eq = false;
      out.if = { counter: fields.bucket, axis: fields.bucketAxis };
    }

    if (fields.on === "overload") {
      out.at = overloadAtOf(fields.at);
    }

    if (fields.on === "rule") {
      out.rules = fields.rules;
      out.tags = fields.tags;
    }

    if (fields.draft.target === TO_DATASET) {
      out.list = fields.draft.list;
      out.write = fields.draft.write as OutcomeRule["write"];
      out.ttlS = ttlSeconds(fields.draft.ttl);
    } else {
      const ask = askPayload(fields.draft, registry);

      out.to = ask.to;
      out.do = ask.do;
      out.apply = ask.apply;
      out.delta = ask.delta;
      out.value = ask.value;
      out.counter = ask.counter;
      out.marker = ask.marker;
      out.group = ask.group;
      out.phase = ask.phase;
      out.set = ask.set;
      out.headers = ask.headers;
      out.args = ask.args;
      out.body = ask.body;
      out.ttlS = ask.ttlS;
      out.when = ask.when;
    }

    onSave(out);
  };

  return (
    <Modal
      onClose={onClose}
      title={
        outcome === null ? t("outcomes.addOutcome") : t("outcomes.editOutcome")
      }
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready()} onClick={save}>
            {outcome === null ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={1}>
          <DialogSection
            title={t("outcomes.sectionWhen")}
            hint={t("outcomes.sectionWhenHint")}
            summary={triggerSummary()}
          >
            {phases !== undefined && (
              <TextField
                select
                size="small"
                label={t("outcomes.outcomeWhere")}
                helperText={t("outcomes.outcomeWhereHint")}
                value={fields.section}
                onChange={(e) => {
                  const section = e.target.value;
                  set({
                    section,
                    on: section !== "request" && fields.on === "overload" ? "score" : fields.on,
                    bucketAxis:
                      section !== "frame" && fields.bucketAxis === "conn" ? "" : fields.bucketAxis,
                  });
                }}
              >
                {phases.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              select
              size="small"
              label={t("outcomes.outcomeWhen")}
              value={fields.on}
              onChange={(e) => {
                const on = e.target.value as Fields["on"];

                set({ on, at: on === "overload" && !overloadAtOk(fields.at) ? "" : fields.at });

                if (
                  !askable(on) &&
                  fields.draft.target !== TO_DATASET &&
                  fields.draft.target !== TO_MODULE
                ) {
                  patchDraft({ target: TO_DATASET, verb: "", axis: "" });
                }
              }}
              helperText={t("outcomes.outcomeWhenHint")}
            >
              {(ons ?? ONS)
                .filter((on) => on !== "overload" || phases === undefined || fields.section === "request")
                .map((on) => (
                <MenuItem key={on} value={on}>
                  {t(`outcomes.ons.${on}`)}
                </MenuItem>
              ))}
              {(buckets?.length ?? 0) > 0 && (
                <MenuItem value="level">{t("outcomes.ons.level")}</MenuItem>
              )}
            </TextField>

            {fields.on === "level" && (
              <>
                <Stack direction="row" spacing={1}>
                  <TextField
                    select
                    size="small"
                    label={t("outcomes.outcomeBucket")}
                    value={fields.bucket}
                    onChange={(e) => {
                      const bucket = e.target.value;
                      const axes = buckets?.find((b) => b.counter === bucket)?.axes ?? [];

                      set({
                        bucket,
                        bucketAxis: axes.includes(fields.bucketAxis) ? fields.bucketAxis : (axes[0] ?? ""),
                      });
                    }}
                    helperText={t("outcomes.outcomeBucketHint")}
                    sx={{ flex: 1.4 }}
                  >
                    {(buckets ?? []).map((b) => (
                      <MenuItem key={b.counter} value={b.counter}>
                        {b.counter}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label={t("outcomes.outcomeBucketAxis")}
                    value={fields.bucketAxis}
                    onChange={(e) => set({ bucketAxis: e.target.value })}
                    disabled={fields.bucket === ""}
                    sx={{ flex: 1 }}
                  >
                    {(buckets?.find((b) => b.counter === fields.bucket)?.axes ?? [])
                      .filter((axis) => phases === undefined || fields.section === "frame" || axis !== "conn")
                      .map((axis) => (
                        <MenuItem key={axis} value={axis}>
                          {t(`counter.axis.${axis}`)}
                        </MenuItem>
                      ),
                    )}
                  </TextField>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField
                    select
                    size="small"
                    label={t("outcomes.outcomeCompare")}
                    value={fields.cmp === "eq" ? "above" : fields.cmp}
                    onChange={(e) => set({ cmp: e.target.value as Fields["cmp"] })}
                    sx={{ flex: 1.2 }}
                  >
                    <MenuItem value="above">{t("outcomes.compare.levelAbove")}</MenuItem>
                    <MenuItem value="below">{t("outcomes.compare.levelBelow")}</MenuItem>
                  </TextField>
                  <TextField
                    size="small"
                    label={t("outcomes.outcomeLevelAt")}
                    value={fields.at}
                    onChange={(e) => set({ at: e.target.value })}
                    required
                    helperText={t("outcomes.outcomeLevelAtHint")}
                    sx={{ flex: 1 }}
                  />
                </Stack>
              </>
            )}

            {fields.on === "score" && (
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  size="small"
                  label={t("outcomes.outcomeCompare")}
                  value={fields.cmp}
                  onChange={(e) => set({ cmp: e.target.value as Fields["cmp"] })}
                  sx={{ flex: 1.2 }}
                >
                  <MenuItem value="above">{t("outcomes.compare.above")}</MenuItem>
                  <MenuItem value="below">{t("outcomes.compare.below")}</MenuItem>
                  <MenuItem value="eq">{t("outcomes.compare.eq")}</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  label={t("outcomes.outcomeAt")}
                  value={fields.at}
                  onChange={(e) => set({ at: e.target.value })}
                  required
                  helperText={t("outcomes.outcomeAtHint")}
                  sx={{ flex: 1 }}
                />
              </Stack>
            )}

            {fields.on === "rule" && (
              <>
                <FilterChips
                  label={t("outcomes.outcomeRules")}
                  hint={t("outcomes.outcomeRulesHint")}
                  bad={t("outcomes.outcomeRulesBad")}
                  value={fields.rules}
                  valid={ruleOk}
                  split={/[\s,]+/}
                  onChange={(rules) => set({ rules })}
                />
                <FilterChips
                  label={t("outcomes.outcomeTags")}
                  hint={t("outcomes.outcomeTagsHint")}
                  bad={t("outcomes.outcomeTagsHint")}
                  value={fields.tags}
                  options={CRS_TAGS}
                  valid={tagOk}
                  split={/,/}
                  onChange={(tags) => set({ tags })}
                />
              </>
            )}

            {fields.on === "overload" && (
              <TextField
                size="small"
                label={t("outcomes.overloadAt")}
                value={fields.at}
                placeholder={String(OVERLOAD_AT_MAX)}
                onChange={(e) => set({ at: e.target.value })}
                error={!overloadAtOk(fields.at)}
                helperText={t("outcomes.overloadAtHint")}
                slotProps={{ htmlInput: { inputMode: "numeric", min: OVERLOAD_AT_MIN, max: OVERLOAD_AT_MAX } }}
              />
            )}
          </DialogSection>

          <DialogSection
            title={t("outcomes.sectionDo")}
            hint={t("outcomes.sectionDoHint")}
            summary={actionSummary()}
          >
            <ActionPart
              draft={fields.draft}
              onChange={patchDraft}
              registry={registry}
              inspectors={inspectors}
              datasets={datasets.map((name) => ({ value: name, label: name }))}
              askable={asks}
              writable={writable}
              moduleTarget
              routeOnly={!asks}
              frame={phases !== undefined && fields.section === "frame"}
              writes={
                (writes ?? WRITES).length > 1
                  ? (writes ?? WRITES).map((write) => ({
                      value: write,
                      label: t(`outcomes.writes.${write}`),
                    }))
                  : undefined
              }
            />
          </DialogSection>
        </Stack>
    </Modal>
  );
}

const RULE_RE = /^(\d+)(?:-(\d+))?$/;

function ruleOk(item: string): boolean {
  const m = RULE_RE.exec(item);

  return m !== null && (m[2] === undefined || Number(m[1]) <= Number(m[2]));
}

function tagOk(tag: string): boolean {
  return tag !== "" && tag.trim() === tag && new TextEncoder().encode(tag).length <= 128;
}

function ruleFilterSummary(rules: readonly string[], tags: readonly string[]): string {
  return [rules.join(", "), tags.join(", ")].filter((part) => part !== "").join(" · ");
}

function FilterChips({
  label,
  hint,
  bad,
  value,
  options = [],
  valid,
  split,
  onChange,
}: {
  label: string;
  hint: string;
  bad: string;
  value: string[];
  options?: readonly string[];
  valid: (item: string) => boolean;
  split: RegExp;
  onChange: (next: string[]) => void;
}) {
  const wrong = value.filter((item) => !valid(item));

  return (
    <Autocomplete<string, true, false, true>
      multiple
      freeSolo
      autoSelect
      fullWidth
      size="small"
      options={options.filter((option) => !value.includes(option))}
      value={value}
      onChange={(_e, next) =>
        onChange([
          ...new Set(
            next
              .flatMap((item) => item.split(split))
              .map((item) => item.trim())
              .filter((item) => item !== ""),
          ),
        ])
      }
      renderValue={(items, getItemProps) =>
        items.map((item, index) => (
          <Chip
            {...getItemProps({ index })}
            key={`${item}-${index}`}
            size="small"
            label={item}
            color={valid(item) ? "default" : "error"}
            deleteIcon={<CloseIcon />}
            sx={valueChipSx}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={wrong.length > 0}
          helperText={wrong.length > 0 ? `${bad}: ${wrong.join(", ")}` : hint}
          slotProps={{ ...params.slotProps, inputLabel: { shrink: true } }}
          sx={{
            "& .MuiOutlinedInput-root": { minHeight: DIALOG_FIELD_H, py: 0.5 },
            "& .MuiInputBase-input": {
              fontFamily: "monospace",
              fontSize: "0.78rem",
              py: 0,
              minWidth: 48,
            },
          }}
        />
      )}
    />
  );
}
