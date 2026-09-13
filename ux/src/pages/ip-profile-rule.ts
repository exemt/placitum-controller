/**
 * Строка профиля: перевод между формой и тем, что принимает API.
 *
 * Форма одна на два вида строк секции «Правила», и язык у триггера один —
 * **где оказался адрес**: в списке, не в списке, в белых списках, в чёрных,
 * ни в одних. Первые два хранятся в rules (второй — флагом `not`), остальные
 * три в outcomes; различие — деталь хранения, а не два экрана.
 *
 * Список здесь сырой — тот, что профиль объявил и попросил упаковать, — а не
 * составной набор: вердикта эти строки не выносят, и выражение над сырьём им
 * ни к чему. Наборы остались белому и чёрному спискам, где вердикт и живёт.
 *
 * Само действие — общий черновик ActionDraft (components/action-part): у всех
 * отправителей канала оно одно, и списка глаголов здесь нет — словарь
 * приезжает реестром с `GET /api/actions`.
 */

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

/**
 * Триггер строки: где оказался адрес. Первые два адресуют объявленный сырой
 * список, остальные — списки профиля целиком.
 */
export type RuleTrigger =
  | "list"
  | "list_not"
  | "white"
  | "black"
  | "none"
  /** Не про адрес, а про инспектора: очередь подошла к порогу `at`. */
  | "overload";

/** Край шкалы порога: очередь полна, запрос сброшен. Он же умолчание. */
import { OVERLOAD_AT_MAX, OVERLOAD_AT_MIN } from "../overload.ts";

export { OVERLOAD_AT_MAX, OVERLOAD_AT_MIN };

/**
 * Строка спрашивает про сырой список — значит, у неё есть поле «Список».
 * Предикат, а не просто boolean: отрицание им сужает триггер до трёх слов
 * инициатора, и `on` собирается без приведения типа.
 */
export function byList(trigger: RuleTrigger): trigger is "list" | "list_not" {
  return trigger === "list" || trigger === "list_not";
}

/** Что вернула форма: правило по набору либо инициатор по исходу. */
export type RuleSave =
  | { kind: "rule"; rule: IpRuleInput }
  | { kind: "outcome"; outcome: IpOutcomeInput };

export interface RuleFields {
  /** Когда срабатывает строка. У белого и чёрного списков всегда list. */
  trigger: RuleTrigger;

  /**
   * Порог перегрузки в процентах заполнения очереди. Значим только у
   * триггера `overload`; у остальных лежит краем шкалы и никуда не уезжает.
   */
  at: number;

  /** Условие терминальной строки: составной набор. */
  set: string;
  /** Условие накопительной строки: объявленный сырой список. */
  dataset: string;
  /** deny: запись каталога отказов. Счёта у инспектора нет. */
  response: string;

  /** Действие строки: просьба соседу либо запись в живой набор. */
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

/** Строка, приехавшая с сервера, обязана открыться теми же полями. */
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

  /* Сторона просьбы записи у строки зовётся side: ключ set занят набором. */
  out.draft = draftOfAsk({ ...rule, set: rule.side, ttlS: rule.ttl });

  return out;
}

/** Строка по исходу открывается той же формой. */
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
  /*
   * Белый и чёрный списки спрашивают составной набор -- им нужно выражение
   * над сырьём, потому что вердикт выносят они. Больше у них требований нет:
   * счёта у инспектора не бывает.
   */
  if (section !== "rules") {
    return fields.set !== "";
  }

  /*
   * Строка канала: условие -- объявленный сырой список либо вовсе не набор
   * (у строк по исходу его нет). Срок записи у ip необязателен: запись без
   * срока живёт по TTL самого набора.
   */
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

    /* Порог едет только у перегрузки: у остальных исходов его не бывает. */
    if (fields.trigger === "overload") {
      outcome.at = fields.at;
    }

    if (fields.draft.target === TO_DATASET) {
      outcome.list = fields.draft.list;
      outcome.write = fields.draft.write as IpOutcomeInput["write"];
      outcome.ttl = ttlSeconds(fields.draft.ttl);

      return { kind: "outcome", outcome };
    }

    /* Просьба соседу: собирается тем же способом, что у строки по списку. */
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
  /*
   * Условие ровно одно, и какое -- решает секция. Белый и чёрный списки
   * выносят вердикт: им нужен составной набор. Строка канала вердикта не
   * выносит: ей нужен состав, то есть объявленный сырой список.
   */
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
    /*
     * «Не в списке» есть только у строк канала: терминальному промаху нечем
     * объясниться, и контроллер такую строку не примет.
     */
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

/** Что показать в колонке «что сделать»: глагол либо запись в набор. */
export function verbOf(rule: IpRuleInput): string {
  if (rule.action === "list") {
    return "list";
  }

  return rule.do ?? "";
}
