import type { ActionRegistry, IpOutcomeInput, IpRuleInput } from "../api.ts";
import {
  actionReady,
  askPayload,
  draftOfAsk,
  draftOfList,
  emptyActionDraft,
  ttlSeconds,
  TO_DATASET,
  type ActionDraft,
} from "../components/action-part.tsx";

export type SectionId = "white" | "black" | "rules";

export type RuleTrigger =
  | "list"
  | "list_not"
  | "white"
  | "black"
  | "none"
  | "overload";

import { OVERLOAD_AT_MAX, OVERLOAD_AT_MIN } from "../overload.ts";

export { OVERLOAD_AT_MAX, OVERLOAD_AT_MIN };

export function byList(trigger: RuleTrigger): trigger is "list" | "list_not" {
  return trigger === "list" || trigger === "list_not";
}

export type RuleSave =
  | { kind: "rule"; rule: IpRuleInput }
  | { kind: "outcome"; outcome: IpOutcomeInput };

export interface RuleFields {
  trigger: RuleTrigger;

  at: number;

  set: string;
  dataset: string;
  response: string;

  draft: ActionDraft;
}

export function emptyFields(section: SectionId): RuleFields {
  return {
    trigger: "list",
    at: OVERLOAD_AT_MAX,
    set: "",
    dataset: "",
    response: section === "black" ? "blocked" : "",
    draft: emptyActionDraft(),
  };
}

export function fieldsOf(rule: IpRuleInput | null, section: SectionId): RuleFields {
  const out = emptyFields(section);

  if (rule === null) {
    return out;
  }

  out.set = rule.set ?? "";
  out.dataset = rule.dataset ?? "";
  out.trigger = rule.not === true ? "list_not" : "list";
  out.draft.code = rule.code ?? "";

  if (rule.action === "deny") {
    out.response = rule.response ?? "";

    return out;
  }

  if (rule.action === "list") {
    out.draft = draftOfList({ list: rule.list ?? "", write: rule.write, ttlS: rule.ttl ?? 0 });

    return out;
  }

  out.draft = draftOfAsk({ ...rule, set: rule.side, ttlS: rule.ttl });

  return out;
}

export function fieldsOfOutcome(outcome: IpOutcomeInput): RuleFields {
  const out = emptyFields("rules");

  out.trigger = outcome.on;
  out.at = outcome.at ?? OVERLOAD_AT_MAX;

  if ((outcome.do ?? "") === "") {
    out.draft = draftOfList({ list: outcome.list, write: outcome.write, ttlS: outcome.ttl });
  } else {
    out.draft = draftOfAsk(outcome);
  }

  out.draft.code = outcome.code;

  return out;
}

export function draftReady(section: SectionId, fields: RuleFields): boolean {
  if (section !== "rules") {
    return fields.set !== "";
  }

  if (byList(fields.trigger) && fields.dataset === "") {
    return false;
  }

  return actionReady(fields.draft, { askable: true, ttlRequired: false });
}

export function buildSave(
  section: SectionId,
  fields: RuleFields,
  registry: ActionRegistry | null,
): RuleSave {
  if (section === "rules" && !byList(fields.trigger)) {
    const outcome: IpOutcomeInput = {
      on: fields.trigger,
      list: "",
      ttl: 0,
      code: fields.draft.code,
    };

    if (fields.trigger === "overload") {
      outcome.at = fields.at;
    }

    if (fields.draft.target === TO_DATASET) {
      outcome.list = fields.draft.list;
      outcome.write = fields.draft.write as IpOutcomeInput["write"];
      outcome.ttl = ttlSeconds(fields.draft.ttl);

      return { kind: "outcome", outcome };
    }

    const ask = askPayload(fields.draft, registry);

    outcome.to = ask.to;
    outcome.do = ask.do;
    outcome.apply = ask.apply;
    outcome.set = ask.set;
    outcome.when = [...ask.when];
    outcome.headers = ask.headers;
    outcome.args = ask.args;
    outcome.body = ask.body;
    outcome.ttl = ask.ttlS;

    if (ask.delta !== null) {
      outcome.delta = ask.delta;
    }

    if (ask.value !== null) {
      outcome.value = ask.value;
    }

    if (ask.counter !== "") {
      outcome.counter = ask.counter;
    }

    if (ask.marker !== "") {
      outcome.marker = ask.marker;
    }

    if (ask.group !== "") {
      outcome.group = ask.group;
    }

    if (ask.phase !== "") {
      outcome.phase = ask.phase;
    }

    return { kind: "outcome", outcome };
  }

  return { kind: "rule", rule: buildRule(section, fields, registry) };
}

export function buildRule(
  section: SectionId,
  fields: RuleFields,
  registry: ActionRegistry | null,
): IpRuleInput {
  if (section !== "rules") {
    const terminal: IpRuleInput = {
      set: fields.set,
      dataset: null,
      not: false,
      action: "allow",
      code: fields.draft.code,
      enabled: true,
    };

    if (section === "white") {
      return terminal;
    }

    return { ...terminal, action: "deny", response: fields.response };
  }

  const base: IpRuleInput = {
    set: null,
    dataset: fields.dataset,
    not: fields.trigger === "list_not",
    action: "allow",
    code: fields.draft.code,
    enabled: true,
  };

  if (fields.draft.target === TO_DATASET) {
    return {
      ...base,
      action: "list",
      code: "",
      list: fields.draft.list,
      write: fields.draft.write as IpRuleInput["write"],
      ttl: ttlSeconds(fields.draft.ttl),
    };
  }

  const ask = askPayload(fields.draft, registry);

  const rule: IpRuleInput = {
    ...base,
    action: "request",
    to: ask.to,
    do: ask.do,
    apply: ask.apply,
    side: ask.set,
    when: [...ask.when],
    headers: ask.headers,
    args: ask.args,
    body: ask.body,
    ttl: ask.ttlS,
  };

  if (ask.delta !== null) {
    rule.delta = ask.delta;
  }

  if (ask.value !== null) {
    rule.value = ask.value;
  }

  if (ask.counter !== "") {
    rule.counter = ask.counter;
  }

  if (ask.marker !== "") {
    rule.marker = ask.marker;
  }

  if (ask.group !== "") {
    rule.group = ask.group;
  }

  if (ask.phase !== "") {
    rule.phase = ask.phase;
  }

  return rule;
}

export function verbOf(rule: IpRuleInput): string {
  if (rule.action === "list") {
    return "list";
  }

  return rule.do ?? "";
}
