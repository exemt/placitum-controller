/**
 * Инициаторы по исходу: «когда → кому → что сделать». Один блок на всех, кто
 * судит по вердикту, — контракт API и правила: у них и триггер общий (отказ,
 * пропуск, счёт против порога), и действие.
 *
 * Само действие — общая форма ActionPart: четыре копии «кому → что →
 * параметры» разъезжались бы на первой правке словаря. Здесь остаётся только
 * триггер и перевод черновика в форму провода.
 */

import { useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { DialogSection } from "./dialog-kit.tsx";
import { Modal } from "./Modal.tsx";
import { TableBlock } from "./table-block.tsx";
import { ActionRulesTable } from "./rules-table.tsx";
import type { ActionRegistry, InspectorMeta, OutcomeRule } from "../api.ts";
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

const ONS = ["deny", "allow", "score"] as const;

/**
 * Кого писать в набор -- те же четыре охвата, что у капчи: адрес; эффективный
 * анонс; все анонсы, накрывающие адрес; систему целиком. Подсеть и систему
 * инспектор берёт у кодера гео и пишет одной пачкой.
 */
const WRITES = ["addr", "net", "net_all", "asn"] as const;

/**
 * Отказ обрывает фазу: просьбе соседу с него уехать некуда. Остаются запись в
 * набор и глаголы записи маршрута -- их исполняет модуль, и отказ для них
 * главный случай.
 */
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
  /** Подсказка блока: чем этот набор строк отличается от соседнего. */
  hint: string;
  outcomes: OutcomeRule[];
  datasets: string[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  /**
   * Корзины отправителя: имя счётчика и его объявленные оси. Непусто —
   * появляется триггер «уровень счётчика». Есть только у счётчика: у
   * остальных отправителей своих корзин нет вовсе.
   */
  buckets?: { counter: string; axes: string[] }[];
  /**
   * Триггеры этого отправителя. Список у каждого свой -- у vlai нет отказа,
   * зато есть перегрузка, -- и предлагать триггер, который загрузчик профиля
   * отвергнет, значит собрать мышью то, что не сохранится.
   */
  ons?: readonly OutcomeOn[];
  /**
   * Умеет ли отправитель писать в живые наборы. Ложь прячет цель «в набор».
   */
  writable?: boolean;
  /**
   * Субъекты записи этого отправителя. Один адрес -- селектор «Кого» не
   * показывается вовсе: выбора нет. Отсутствует -- все три, как у тех, кто
   * ходит в справочник гео.
   */
  writes?: readonly OutcomeRule["write"][];
  onChange: (outcomes: OutcomeRule[]) => void;
  /**
   * Фазы одной таблицы: у счётчика инициаторы запроса и кадров лежат вместе,
   * и строка носит свою секцию (`section`). Нет поля -- таблица одной фазы, как
   * у остальных отправителей.
   */
  phases?: readonly { value: string; label: string }[];
}) {
  const t = useT();
  /** Индекс строки в диалоге; null -- новая, undefined -- диалог закрыт. */
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

/* --- строки таблицы --------------------------------------------------------- */

function whenOf(t: Translate, o: OutcomeRule): string {
  if (o.on === "level") {
    const sign = o.below ? "<" : "≥";
    const where = o.if === null || o.if === undefined ? "?" : `${o.if.counter}/${o.if.axis}`;

    return `${where} ${sign} ${o.at ?? 0}%`;
  }

  if (o.on !== "score") {
    return t(`outcomes.ons.${o.on}`);
  }

  const sign = o.eq ? "=" : o.below ? "<" : "≥";

  return `${t("outcomes.ons.score")} ${sign} ${o.at ?? 0}`;
}

function targetOf(t: Translate, o: OutcomeRule): string {
  /* Очки: адресат -- сам маршрут, а не «всем». */
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

    /* Очки на маршруте -- число со знаком без процентов: это не доля шкалы. */
    if (o.value !== null) {
      parts.push(
        o.do === "score"
          ? t("actions.score.summary", { n: `${o.value > 0 ? "+" : ""}${o.value}` })
          : `${o.value > 0 ? "+" : ""}${o.value}%`,
      );
    }

    /* mark: сама метка -- по ней строку и узнают в таблице. */
    if (o.marker !== undefined && o.marker !== "") {
      parts.push(o.marker);
    }

    /* mutate: группа получателя и сторона тумблера, как их назвал отправитель. */
    if (o.group !== undefined && o.group !== "") {
      parts.push(`${o.group} → ${t(o.set === "off" ? "actions.mutate.off" : "actions.mutate.on")}`);
    }

    /* Управляющие: фаза вызова адресата, если названа. */
    parts.push(...phaseSummary(t, o));

    /* Глаголы записи: сторона, у archive -- объекты, срок и предел. */
    parts.push(...auditSummary(t, o));
  }

  if (o.code !== "") {
    parts.push(o.code);
  }

  return parts.join(" · ");
}

/* --- диалог ----------------------------------------------------------------- */

interface Fields {
  on: OutcomeRule["on"];
  at: string;
  /** Секция строки в общей таблице (фаза отправителя); пусто -- таблица одной фазы. */
  section: string;
  /** Сравнение счёта: «не ниже», «ниже», «ровно». */
  cmp: "above" | "below" | "eq";
  /** Только при on: level — какую корзину смотреть. */
  bucket: string;
  bucketAxis: string;
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
      /* У отправителя без записей в наборы стартовая цель пуста: «в набор»
       * ему не предлагается вовсе. */
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
  /** Фазы общей таблицы; строка выбирает свою. Нет поля -- фаза одна. */
  phases?: readonly { value: string; label: string }[];
  onSave: (outcome: OutcomeRule) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState<Fields>(() => {
    const init = fieldsOf(outcome, writable);
    // Новая строка общей таблицы стартует с первой фазы.
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

    return actionReady(fields.draft, {
      askable: asks || fields.draft.target === TO_MODULE,
    });
  };

  /*
   * Повод свёрнутого блока словами: тот же порядок, что в колонке «Когда»
   * таблицы, только по черновику -- строки ещё нет.
   */
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
    } else {
      parts.push(t(`outcomes.ons.${fields.on}`));
    }

    return parts.join(" · ");
  };

  /** Действие свёрнутого блока: кому и что, без параметров. */
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
      // У уровня сравнений два: «ровно» на непрерывной величине не случается.
      out.below = fields.cmp === "below";
      out.eq = false;
      out.if = { counter: fields.bucket, axis: fields.bucketAxis };
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
      /* У просьбы archive срок и исход -- её собственные; у прочих их нет. */
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
          {/*
            Повод и действие -- два блока, а не одна лента полей. У инициатора
            записи их девять: фаза, триггер, сравнение, порог, адресат, глагол,
            сторона записи и три объекта, -- и, набрав повод, оператор больше к
            нему не возвращается. Свёрнутый блок оставляет от него строку
            словами, а место отдаёт тому, чем занят.
          */}
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
                  // Ось conn есть только у кадров: корзина по ней на запросе молчала бы.
                  set({
                    section,
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

                set({ on });

                /* Просьба соседу не переживает уход на отказ: ей некуда ехать. */
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
              {(ons ?? ONS).map((on) => (
                <MenuItem key={on} value={on}>
                  {t(`outcomes.ons.${on}`)}
                </MenuItem>
              ))}
              {/*
                «Уровень счётчика» только у того, у кого корзины есть: остальным
                отправителям смотреть нечего, и пустой пункт был бы ловушкой.
              */}
              {(buckets?.length ?? 0) > 0 && (
                <MenuItem value="level">{t("outcomes.ons.level")}</MenuItem>
              )}
            </TextField>

            {/*
              Условие по уровню: какая корзина, по какой оси и с какого процента.
              Порог и направление — те же поля, что у счёта: сравнение одно
              понятие, и разводить его по двум формам значило бы писать «ниже»
              дважды разными словами.
            */}
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
                        // Ось у новой корзины своя: чужая молчала бы навсегда.
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
              /* Все отправители этого блока возят set/objects/limit -- глаголы записи им доступны. */
              moduleTarget
              routeOnly={!asks}
              frame={phases !== undefined && fields.section === "frame"}
              /*
               * Единственный субъект -- селектор «Кого» не показывается вовсе:
               * выбора нет, а черновик и так стартует с адреса.
               */
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
