/**
 * Правила капчи по событиям: «когда → кому → что сделать» — та же форма, что
 * строки профиля адреса. Событие вместо набора: провалил попытку, прошёл
 * проверку, корзина дошла до порога, клиент пришёл с действующим клиренсом
 * или без него.
 *
 * Действие ровно одно: заряд своей корзины, запись в набор либо просьба
 * соседу. Просьбы только у событий волны — порогов корзин и клиренса: провал
 * и прохождение случаются в HTTP-процессе, он не на волне, и просьбе оттуда
 * не уехать; подсказка диалога говорит это словами, как у deny в профиле
 * адреса. У клиента без клиренса своя оговорка: просьба доедет, только если
 * запрос пойдёт дальше, — виджет обрывает фазу. Форма просьбы общая с
 * остальными отправителями: соседу, режим вызова соседа, запись маршрута, очки.
 */

import { useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { Modal } from "../components/Modal.tsx";
import { TableBlock } from "../components/table-block.tsx";
import { ActionRulesTable } from "../components/rules-table.tsx";
import type { ActionRegistry, CaptchaEventRule, InspectorMeta } from "../api.ts";
import {
  ActionPart,
  actionReady,
  askPayload,
  auditSummary,
  isRouteVerb,
  draftOfAsk,
  draftOfList,
  emptyActionDraft,
  humanTtl,
  phaseSummary,
  ttlSeconds,
  TO_DATASET,
  type ActionDraft,
} from "../components/action-part.tsx";
import { axisLabel, verbLabel } from "../components/action-select.tsx";
import { useT, type Translate } from "../i18n/index.ts";

const ONS = ["fail", "pass", "bucket_captcha", "bucket_ban", "cleared", "uncleared"] as const;
const BUCKETS = ["ip", "sess", "asn_net", "asn_router"] as const;
/*
 * Что писать в набор. net -- лайт (эффективный анонс), net_all -- хард (все
 * накрывающие), asn -- система целиком. Подписи говорят, что именно уедет в
 * набор: это и есть радиус бана, и он должен быть виден в форме.
 */
const WRITES = ["addr", "net", "net_all", "asn", "cid"] as const;

/** События волны инспектора -- пороги корзин и клиренс, есть он или нет: им доступны и просьбы. */
function onWave(on: string): boolean {
  return on === "bucket_captcha" || on === "bucket_ban" || on === "cleared" || on === "uncleared";
}

/** Событие порога корзины: селектор корзины имеет смысл. */
function bucketEvent(on: string): boolean {
  return on === "bucket_captcha" || on === "bucket_ban";
}

/*
 * Решение лестницы бывает любым у клиента без клиренса и у порогов корзин: там
 * правило может ждать своего -- пропустила или показала виджет. У клиренса
 * решение всегда «пропустила», у событий виджета его нет. «Любое» -- пустое
 * значение правила; у выбора пустого значения нет подписи, поэтому в поле оно
 * живёт словом any.
 */
const NEXTS = ["any", "allow", "challenge"] as const;

function nextEvent(on: string): boolean {
  return on === "uncleared" || bucketEvent(on);
}

/** Кука известна там, где её выдали (pass) и где предъявили (cleared). */
function cidKnown(on: string): boolean {
  return on === "pass" || on === "cleared";
}

/* Псевдоцель «Кому», которой нет у остальных отправителей: своя корзина. */
const TO_BUCKET = "bucket";

export function emptyEventRule(): CaptchaEventRule {
  return {
    on: "fail",
    bucket: "",
    next: "",
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
    ttlS: 0,
    write: "addr",
    charge: "",
    percent: 0,
    code: "",
  };
}

/* --- таблица ---------------------------------------------------------------- */

/** Подсказка «Кому»: где просьбе не уехать вовсе, а где -- не всегда. */
function toHintOf(t: Translate, on: string, next: string): string {
  if (!onWave(on)) {
    return t("captcha.ruleToHttpHint");
  }

  /* Виджет обрывает фазу: соседу просьба доедет только от совещательной капчи. */
  if (next === "challenge") {
    return t("captcha.ruleToChallengeHint");
  }

  /* Решение не выбрано -- капча может и показать виджет. */
  if (next === "" && nextEvent(on)) {
    return t("captcha.ruleToWidgetHint");
  }

  return t("captcha.ruleToHint");
}

function whenOf(t: Translate, rule: CaptchaEventRule): string {
  let out = t(`captcha.ons.${rule.on}`);

  /* Корзина уточняет только пороги: у клиренса и событий виджета её нет. */
  if (bucketEvent(rule.on)) {
    const bucket =
      rule.bucket === ""
        ? t("captcha.bucketAny")
        : t(`captcha.buckets.${bucketKey(rule.bucket)}`);

    out += `: ${bucket}`;
  }

  /* Решение лестницы -- только если правило его ждёт. */
  if (rule.next) {
    out += ` · ${t(`captcha.nexts.${rule.next}`)}`;
  }

  return out;
}

/** Ключ i18n корзины: в словаре подписей camelCase, на проводе snake_case. */
function bucketKey(kind: string): string {
  switch (kind) {
    case "asn_net":
      return "asnNet";
    case "asn_router":
      return "asnRouter";
  }

  return kind;
}

function targetOf(t: Translate, rule: CaptchaEventRule): string {
  if (rule.charge !== "") {
    return t("captcha.toBucketShort");
  }

  if (rule.list !== "") {
    return t("captcha.toDatasetShort");
  }

  /* Очки: адресат -- сам маршрут, а не «всем». */
  if (rule.do === "score") {
    return t("outcomes.toRoute");
  }

  /* Глаголы записи: адресат -- запись самого маршрута. */
  if (isRouteVerb(rule.do)) {
    return t("outcomes.toModule");
  }

  return rule.to === "" ? t("captcha.toAll") : rule.to;
}

function verbOf(t: Translate, rule: CaptchaEventRule): string {
  if (rule.charge !== "") {
    return t(`captcha.buckets.${bucketKey(rule.charge)}`);
  }

  if (rule.list !== "") {
    return t("actions.verbs.list.label");
  }

  return verbLabel(t, rule.do);
}

function summaryOf(t: Translate, rule: CaptchaEventRule): string {
  const parts: string[] = [];

  if (rule.charge !== "") {
    parts.push(t("captcha.amountPercent", { n: String(rule.percent) }));
  }

  if (rule.list !== "") {
    parts.push(rule.list);
    parts.push(t(`captcha.writes.${rule.write}`));

    if (rule.ttlS > 0) {
      parts.push(humanTtl(rule.ttlS));
    }
  }

  if (rule.do !== "") {
    if (rule.apply !== "" && rule.apply !== "request") {
      parts.push(axisLabel(t, rule.apply));
    }

    if (rule.marker !== "") {
      parts.push(rule.marker);
    }

    if (rule.group !== "") {
      parts.push(`${rule.group} → ${t(rule.set === "off" ? "actions.mutate.off" : "actions.mutate.on")}`);
    }

    parts.push(...phaseSummary(t, rule));

    /* Глаголы записи: сторона, у archive -- объекты, срок и исход. */
    parts.push(...auditSummary(t, rule));

    if (rule.delta !== null) {
      parts.push(t("captcha.amountPercent", { n: String(rule.delta) }));
    }

    /* Очки на маршруте -- число со знаком без процентов. */
    if (rule.value !== null) {
      parts.push(
        rule.do === "score"
          ? t("actions.score.summary", { n: `${rule.value > 0 ? "+" : ""}${rule.value}` })
          : t("captcha.amountPercent", { n: String(rule.value) }),
      );
    }
  }

  if (rule.code !== "") {
    parts.push(rule.code);
  }

  return parts.join(" · ");
}

export function CaptchaRulesBlock({
  rules,
  datasets,
  inspectors,
  registry,
  onChange,
}: {
  rules: CaptchaEventRule[];
  datasets: string[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  onChange: (rules: CaptchaEventRule[]) => void;
}) {
  const t = useT();
  /** Индекс правила в диалоге; null -- новое, undefined -- диалог закрыт. */
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  return (
    <>
      <TableBlock title={t("channel.rules")} label={t("captcha.rulesHint")} last>
        <ActionRulesTable
          rows={rules.map((rule, i) => ({
            key: String(i),
            when: whenOf(t, rule),
            target: targetOf(t, rule),
            targetMuted: rule.do === "",
            what: verbOf(t, rule),
            params: summaryOf(t, rule),
            onEdit: () => setEditing(i),
            onRemove: () => onChange(rules.filter((_r, j) => j !== i)),
          }))}
          empty={t("captcha.rulesEmpty")}
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
  on: CaptchaEventRule["on"];
  bucket: string;
  /** Решение лестницы: пусто -- любое. */
  next: string;

  /* Заряд своей корзины -- псевдоцель TO_BUCKET, поля свои. */
  charge: string;
  chargeDir: "add" | "cut";
  chargePercent: string;

  draft: ActionDraft;
}

function fieldsOf(rule: CaptchaEventRule | null): Fields {
  const out: Fields = {
    on: rule?.on ?? "fail",
    bucket: rule?.bucket ?? "",
    next: rule?.next ?? "",
    charge: rule?.charge === undefined || rule.charge === "" ? "ip" : rule.charge,
    chargeDir: "add",
    chargePercent: "",
    draft: { ...emptyActionDraft(), target: TO_BUCKET },
  };

  if (rule === null) {
    return out;
  }

  out.draft.code = rule.code;

  if (rule.charge !== "") {
    out.chargeDir = rule.percent >= 0 ? "add" : "cut";
    out.chargePercent = String(Math.abs(rule.percent));

    return out;
  }

  if (rule.list !== "") {
    out.draft = draftOfList(rule);

    return out;
  }

  out.draft = draftOfAsk(rule);

  return out;
}

function numberOk(raw: string, min: number, max: number): boolean {
  if (raw.trim() === "") {
    return false;
  }

  const n = Number(raw);

  return Number.isInteger(n) && n >= min && n <= max;
}

function RuleDialog({
  rule,
  datasets,
  inspectors,
  registry,
  onSave,
  onClose,
}: {
  rule: CaptchaEventRule | null;
  datasets: string[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  onSave: (rule: CaptchaEventRule) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState<Fields>(() => fieldsOf(rule));

  const set = (patch: Partial<Fields>) => setFields((prev) => ({ ...prev, ...patch }));
  const patchDraft = (patch: Partial<ActionDraft>) =>
    setFields((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }));

  /* Просьбы соседям возможны только на волне: у fail и pass её нет. */
  const askable = onWave(fields.on);
  /* Клиренс -- не порог: корзины у события нет, и селектор ей не нужен. */
  const withBucket = bucketEvent(fields.on);
  /* Решение лестницы бывает любым у клиента без клиренса и у порогов. */
  const withNext = nextEvent(fields.on);

  const ready = (): boolean =>
    actionReady(fields.draft, {
      askable,
      extraReady: (target) =>
        target === TO_BUCKET
          ? fields.charge !== "" && numberOk(fields.chargePercent, 1, 100)
          : undefined,
    });

  const save = () => {
    const out = emptyEventRule();

    out.on = fields.on;
    out.bucket = bucketEvent(fields.on) ? fields.bucket : "";
    out.next = nextEvent(fields.on) ? (fields.next as CaptchaEventRule["next"]) : "";
    out.code = fields.draft.code;

    if (fields.draft.target === TO_BUCKET) {
      out.charge = fields.charge;
      const magnitude = Number(fields.chargePercent);
      out.percent = fields.chargeDir === "cut" ? -magnitude : magnitude;
    } else if (fields.draft.target === TO_DATASET) {
      out.list = fields.draft.list;
      out.ttlS = ttlSeconds(fields.draft.ttl);
      out.write = fields.draft.write as CaptchaEventRule["write"];
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
      /* У просьбы archive срок и исход -- её собственные. */
      out.ttlS = ask.ttlS;
      out.when = ask.when;
    }

    onSave(out);
  };

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={rule === null ? t("captcha.addRule") : t("captcha.editRule")}
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
            label={t("captcha.ruleWhen")}
            value={fields.on}
            onChange={(e) => {
              const on = e.target.value as Fields["on"];
              const keep =
                fields.draft.target === TO_DATASET || fields.draft.target === TO_BUCKET;

              /* Решение переживает смену события, только если у нового оно тоже бывает любым. */
              set({ on, bucket: "", next: nextEvent(on) ? fields.next : "" });

              /* Просьба не переживает уход с волны; кука -- уход с pass и cleared. */
              if (!onWave(on) && !keep) {
                patchDraft({ target: TO_BUCKET, verb: "", axis: "" });
              }

              if (!cidKnown(on) && fields.draft.write === "cid") {
                patchDraft({ write: "addr" });
              }
            }}
            helperText={t("captcha.ruleWhenHint")}
          >
            {ONS.map((on) => (
              <MenuItem key={on} value={on}>
                {t(`captcha.ons.${on}`)}
              </MenuItem>
            ))}
          </TextField>

          {withBucket && (
            <TextField
              select
              size="small"
              label={t("captcha.ruleBucket")}
              value={fields.bucket}
              onChange={(e) => set({ bucket: e.target.value })}
              helperText={t("captcha.ruleBucketHint")}
            >
              <MenuItem value="">{t("captcha.bucketAny")}</MenuItem>
              {BUCKETS.map((kind) => (
                <MenuItem key={kind} value={kind}>
                  {t(`captcha.buckets.${bucketKey(kind)}`)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {withNext && (
            <TextField
              select
              size="small"
              label={t("captcha.ruleNext")}
              value={fields.next === "" ? "any" : fields.next}
              onChange={(e) => set({ next: e.target.value === "any" ? "" : e.target.value })}
              helperText={t("captcha.ruleNextHint")}
            >
              {NEXTS.map((next) => (
                <MenuItem key={next} value={next}>
                  {t(`captcha.nexts.${next}`)}
                </MenuItem>
              ))}
            </TextField>
          )}

          <ActionPart
            draft={fields.draft}
            onChange={patchDraft}
            registry={registry}
            inspectors={inspectors}
            datasets={datasets.map((name) => ({ value: name, label: name }))}
            askable={askable}
            /* Запись маршрута -- журнал, архив, маркер: исполняет модуль, доступна на волне. */
            moduleTarget
            toHint={toHintOf(t, fields.on, fields.next)}
            writes={WRITES.filter((w) => w !== "cid" || cidKnown(fields.on)).map(
              (write) => ({ value: write, label: t(`captcha.writes.${write}`) }),
            )}
            extraTargets={[{ value: TO_BUCKET, label: t("captcha.toBucket") }]}
            renderExtra={() => (
              <>
                <TextField
                  select
                  size="small"
                  label={t("captcha.ruleCharge")}
                  value={fields.charge}
                  onChange={(e) => set({ charge: e.target.value })}
                >
                  {BUCKETS.map((kind) => (
                    <MenuItem key={kind} value={kind}>
                      {t(`captcha.buckets.${bucketKey(kind)}`)}
                    </MenuItem>
                  ))}
                </TextField>
                <Stack direction="row" spacing={1}>
                  <TextField
                    select
                    size="small"
                    label={t("actions.counter.direction")}
                    value={fields.chargeDir}
                    onChange={(e) => set({ chargeDir: e.target.value as Fields["chargeDir"] })}
                    sx={{ flex: 1.2 }}
                  >
                    <MenuItem value="add">{t("actions.counter.add")}</MenuItem>
                    <MenuItem value="cut">{t("actions.counter.cut")}</MenuItem>
                  </TextField>
                  <TextField
                    size="small"
                    label={t("actions.counter.percent")}
                    value={fields.chargePercent}
                    onChange={(e) => set({ chargePercent: e.target.value })}
                    required
                    helperText={t("captcha.chargeHint")}
                    sx={{ flex: 1 }}
                  />
                </Stack>
              </>
            )}
          />
        </Stack>
    </Modal>
  );
}
