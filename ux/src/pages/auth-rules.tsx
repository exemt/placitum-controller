/**
 * Правила калитки по событиям: «когда → кому → что сделать» — та же форма,
 * что у правил капчи и строк профиля адреса. Событие вместо набора: вошёл,
 * аноним, сессия недействительна, чужая группа.
 *
 * Действие ровно одно: просьба соседу либо запись адреса клиента в живой
 * набор. Просьба соседу доедет только с «вошёл» — отказ и редирект обрывают
 * фазу; остальным событиям остаются глаголы записи маршрута, очки и набор.
 * Подсказка диалога говорит это словами, как у deny в профиле адреса.
 */

import { useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { Modal } from "../components/Modal.tsx";
import { TableBlock } from "../components/table-block.tsx";
import { ActionRulesTable } from "../components/rules-table.tsx";
import type { ActionRegistry, AuthEventRule, InspectorMeta } from "../api.ts";
import {
  ActionPart,
  actionReady,
  askPayload,
  auditSummary,
  draftOfAsk,
  draftOfList,
  emptyActionDraft,
  humanTtl,
  isRouteVerb,
  phaseSummary,
  ttlSeconds,
  TO_DATASET,
  TO_MODULE,
  TO_SCORE,
  type ActionDraft,
} from "../components/action-part.tsx";
import { axisLabel, verbLabel } from "../components/action-select.tsx";
import { useT, type Translate } from "../i18n/index.ts";

const ONS = ["authenticated", "anonymous", "invalid", "forbidden"] as const;

/**
 * Кого писать в набор -- те же охваты, что у остальных отправителей: адрес;
 * самый узкий анонс; все анонсы, накрывающие адрес; систему целиком. Подсеть
 * и систему калитка берёт у кодера гео и пишет одной пачкой.
 */
const WRITES = ["addr", "net", "net_all", "asn"] as const;

/** Просьба соседу доедет только с allow: отказ и редирект обрывают фазу. */
function askTravels(on: string): boolean {
  return on === "authenticated";
}

export function emptyEventRule(): AuthEventRule {
  return {
    on: "authenticated",
    to: "",
    do: "",
    apply: "",
    delta: null,
    value: null,
    counter: "",
    marker: "",
    group: "",
    phase: "",
    set: "",
    headers: null,
    args: null,
    body: null,
    when: [],
    list: "",
    write: "addr",
    ttlS: 0,
    code: "",
  };
}

/* --- таблица ---------------------------------------------------------------- */

function targetOf(t: Translate, rule: AuthEventRule): string {
  if (rule.list !== "") {
    return t("captcha.toDatasetShort");
  }

  if (rule.do === "score") {
    return t("outcomes.toRoute");
  }

  if (isRouteVerb(rule.do)) {
    return t("outcomes.toModule");
  }

  return rule.to === "" ? t("auth.toAll") : rule.to;
}

function verbOf(t: Translate, rule: AuthEventRule): string {
  if (rule.list !== "") {
    return t("actions.verbs.list.label");
  }

  return verbLabel(t, rule.do);
}

function summaryOf(t: Translate, rule: AuthEventRule): string {
  const parts: string[] = [];

  if (rule.list !== "") {
    parts.push(rule.list);
    parts.push(t(`outcomes.writes.${rule.write ?? "addr"}`));

    if (rule.ttlS > 0) {
      parts.push(humanTtl(rule.ttlS));
    }
  }

  if (rule.do !== "") {
    if (rule.apply !== "" && rule.apply !== "request") {
      parts.push(axisLabel(t, rule.apply));
    }

    if (rule.delta !== null) {
      parts.push(t("captcha.amountPercent", { n: String(rule.delta) }));
    }

    if (rule.value !== null) {
      parts.push(
        rule.do === "score"
          ? t("actions.score.summary", { n: `${rule.value > 0 ? "+" : ""}${rule.value}` })
          : t("captcha.amountPercent", { n: String(rule.value) }),
      );
    }

    if (rule.marker !== "") {
      parts.push(rule.marker);
    }

    if (rule.group !== "") {
      parts.push(`${rule.group} → ${t(rule.set === "off" ? "actions.mutate.off" : "actions.mutate.on")}`);
    }

    parts.push(...phaseSummary(t, rule));

    parts.push(...auditSummary(t, rule));
  }

  if (rule.code !== "") {
    parts.push(rule.code);
  }

  return parts.join(" · ");
}

export function AuthRulesBlock({
  rules,
  datasets,
  inspectors,
  registry,
  onChange,
}: {
  rules: AuthEventRule[];
  datasets: string[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  onChange: (rules: AuthEventRule[]) => void;
}) {
  const t = useT();
  /** Индекс правила в диалоге; null -- новое, undefined -- диалог закрыт. */
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  return (
    <>
      <TableBlock title={t("channel.rules")} label={t("auth.rulesHint")} last>
        <ActionRulesTable
          rows={rules.map((rule, i) => ({
            key: String(i),
            when: t(`auth.ons.${rule.on}`),
            target: targetOf(t, rule),
            targetMuted: rule.do === "",
            what: verbOf(t, rule),
            params: summaryOf(t, rule),
            onEdit: () => setEditing(i),
            onRemove: () => onChange(rules.filter((_r, j) => j !== i)),
          }))}
          empty={t("auth.rulesEmpty")}
          addLabel={t("common.add")}
          onAdd={() => setEditing(null)}
        />
      </TableBlock>
      {editing !== undefined && (
        <RuleDialog
          rule={editing === null ? null : (rules[editing] ?? null)}
          datasets={datasets}
          inspectors={inspectors}
          registry={registry}
          onSave={(rule) => {
            onChange(
              editing === null
                ? [...rules, rule]
                : rules.map((r, i) => (i === editing ? rule : r)),
            );
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}

/* --- диалог ----------------------------------------------------------------- */

interface Fields {
  on: AuthEventRule["on"];
  draft: ActionDraft;
}

function fieldsOf(rule: AuthEventRule | null): Fields {
  const out: Fields = {
    on: rule?.on ?? "authenticated",
    draft: emptyActionDraft(),
  };

  if (rule === null) {
    return out;
  }

  out.draft = rule.list !== "" ? draftOfList(rule) : draftOfAsk(rule);
  out.draft.code = rule.code;

  return out;
}

function RuleDialog({
  rule,
  datasets,
  inspectors,
  registry,
  onSave,
  onClose,
}: {
  rule: AuthEventRule | null;
  datasets: string[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  onSave: (rule: AuthEventRule) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState<Fields>(() => fieldsOf(rule));

  const set = (patch: Partial<Fields>) => setFields((prev) => ({ ...prev, ...patch }));
  const patchDraft = (patch: Partial<ActionDraft>) =>
    setFields((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }));

  /* Просьба соседу -- только с allow; остальным событиям запись маршрута и набор. */
  const askable = askTravels(fields.on);

  const ready = (): boolean =>
    actionReady(fields.draft, { askable: askable || fields.draft.target === TO_MODULE });

  const save = () => {
    const out = emptyEventRule();

    out.on = fields.on;
    out.code = fields.draft.code;

    if (fields.draft.target === TO_DATASET) {
      out.list = fields.draft.list;
      out.write = fields.draft.write as AuthEventRule["write"];
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
      size="xs"
      title={rule === null ? t("auth.addRule") : t("auth.editRule")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready()} onClick={save}>
            {rule === null ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={2}>
        <TextField
          select
          size="small"
          label={t("auth.ruleWhen")}
          value={fields.on}
          onChange={(e) => {
            const on = e.target.value as Fields["on"];
            const keep =
              fields.draft.target === TO_DATASET ||
              fields.draft.target === TO_SCORE ||
              isRouteVerb(fields.draft.verb);

            set({ on });

            /* Просьба соседу не переживает уход с allow: адресат сбрасывается. */
            if (!askTravels(on) && !keep) {
              patchDraft({ target: "", verb: "", axis: "" });
            }
          }}
          helperText={t("auth.ruleWhenHint")}
        >
          {ONS.map((on) => (
            <MenuItem key={on} value={on}>
              {t(`auth.ons.${on}`)}
            </MenuItem>
          ))}
        </TextField>

        <ActionPart
          draft={fields.draft}
          onChange={patchDraft}
          registry={registry}
          inspectors={inspectors}
          datasets={datasets.map((name) => ({ value: name, label: name }))}
          askable={askable}
          /* Запись маршрута -- журнал, архив, маркер: исполняет модуль на любом исходе. */
          moduleTarget
          routeOnly={!askable}
          toHint={askable ? t("auth.ruleToHint") : t("auth.ruleToDenyHint")}
          writes={WRITES.map((write) => ({ value: write, label: t(`outcomes.writes.${write}`) }))}
        />
      </Stack>
    </Modal>
  );
}
