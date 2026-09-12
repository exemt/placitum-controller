/**
 * Форма одной строки профиля: когда, кому, что сделать, параметры.
 *
 * Порядок полей -- порядок решений, и первым стоит **триггер**. Язык у него
 * один -- где оказался адрес: в списке, не в списке, в белых списках, в
 * чёрных, ни в одних. Список здесь сырой, из объявленных профилем: вердикта
 * эти строки не выносят, и составной набор -- выражение над сырьём -- им ни к
 * чему. Действие у всех пяти одно и то же и рендерится общей формой
 * ActionPart; на отказе просьба соседу не доедет (deny обрывает фазу), и об
 * этом сказано подписью поля «Кому», а не запретом её собрать.
 */

import { useState } from "react";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import type {
  ActionRegistry,
  Dataset,
  DenyResponseRow,
  InspectorMeta,
  IpOutcomeInput,
  IpProfileDataset,
  IpRuleInput,
  IpSetMeta,
} from "../api.ts";
import {
  ActionPart,
  TO_DATASET,
  type ActionDraft,
} from "../components/action-part.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import {
  buildSave,
  byList,
  draftReady,
  fieldsOf,
  fieldsOfOutcome,
  OVERLOAD_AT_MAX,
  OVERLOAD_AT_MIN,
  type RuleSave,
  type RuleTrigger,
  type SectionId,
  type RuleFields,
} from "./ip-profile-rule.ts";

/*
 * Значения селектора «Когда». Порядок -- от списков профиля к отдельному
 * списку: сперва то, что решил сам инспектор, потом уточнение по списку.
 */
const TRIGGERS: readonly RuleTrigger[] = [
  "white",
  "black",
  "none",
  "list",
  "list_not",
  /* Не про адрес, а про сам инспектор: очередь подошла к порогу. */
  "overload",
];

export function RuleDialog({
  section,
  rule,
  outcome,
  sets,
  datasets,
  denyResponses,
  live,
  inspectors,
  registry,
  onSave,
  onClose,
}: {
  section: SectionId;
  /** null -- заводим новую строку либо правим инициатор. */
  rule: IpRuleInput | null;
  /** null -- правим правило либо заводим новую строку. */
  outcome: IpOutcomeInput | null;
  sets: IpSetMeta[];
  /** Сырые списки, объявленные профилем: из них выбирается условие строки. */
  datasets: IpProfileDataset[];
  /** Каталог ответов отказа: ответ строки чёрного списка -- имя записи из него. */
  denyResponses: DenyResponseRow[];
  live: Dataset[];
  inspectors: InspectorMeta[];
  registry: ActionRegistry | null;
  onSave: (next: RuleSave) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState<RuleFields>(() =>
    outcome !== null ? fieldsOfOutcome(outcome) : fieldsOf(rule, section),
  );
  /*
   * Кадров у фильтра нет: он стоит нулевой волной на запросе. Ось `conn` и
   * запись ответа поэтому не предлагаются -- модуль отбраковал бы такой ответ.
   */

  const set = (patch: Partial<RuleFields>) =>
    setFields((prev) => ({ ...prev, ...patch }));
  const patchDraft = (patch: Partial<ActionDraft>) =>
    setFields((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }));

  const sorted = [...sets].sort((a, b) => a.name.localeCompare(b.name));
  const declared = [...datasets].sort((a, b) => a.name.localeCompare(b.name));
  const writing = fields.draft.target === TO_DATASET;
  /*
   * Условие спрашивают одним из двух полей, и каким -- решает секция. Белый и
   * чёрный списки выносят вердикт: им нужен составной набор. Строка канала
   * вердикта не выносит: ей нужен объявленный сырой список.
   */
  const asksForSet = section !== "rules";
  const asksForList = section === "rules" && byList(fields.trigger);
  /*
   * Просьба соседу доедет отовсюду, кроме отказа: там фаза оборвана, и поздней
   * волны не будет. Чёрный список решает двумя действиями, и на счёте она
   * доезжает, -- поэтому здесь не запрет, а подпись поля «Кому».
   */
  const denyRisk =
    section === "rules" && (fields.trigger === "black" || fields.trigger === "none");

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={
        rule === null && outcome === null
          ? t(`ipProfiles.add.${section}`)
          : t(`ipProfiles.edit.${section}`)
      }
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!draftReady(section, fields)}
            onClick={() => onSave(buildSave(section, fields, registry))}
          >
            {rule === null && outcome === null
              ? t("common.add")
              : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2}>
          {section === "rules" && (
            <TextField
              select
              size="small"
              label={t("ipProfiles.trigger")}
              value={fields.trigger}
              onChange={(e) => {
                const value = e.target.value as RuleTrigger;

                /*
                 * Меняется условие, а не то, что строка делает: действие у
                 * всех пяти триггеров одно, и стирать собранное незачем.
                 * Пропадает только набор-условие -- у строк по спискам его
                 * нет.
                 */
                set({
                  trigger: value,
                  dataset: byList(value) ? fields.dataset : "",
                });

                /*
                 * Запись на перегрузке исполняет модуль, а он знает только
                 * адрес клиента: собранные подсеть и система тут не поедут, и
                 * оставлять их в форме значит обещать невыполнимое.
                 */
                if (value === "overload") {
                  patchDraft({ write: "addr" });
                }
              }}
              helperText={t("ipProfiles.triggerHint")}
            >
              {TRIGGERS.map((value) => (
                <MenuItem key={value} value={value}>
                  {t(`ipProfiles.triggers.${value}`)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {/*
            Порог перегрузки: с какого заполнения очереди строка срабатывает.
            До края (100) инспектор проверяет как обычно и просто высказывает
            просьбу -- запрос живёт и получает настоящий вердикт; на краю
            вердикта уже нет, и судьбу запроса решает waf_exception маршрута.
          */}
          {fields.trigger === "overload" && (
            <TextField
              size="small"
              type="number"
              label={t("ipProfiles.overloadAt")}
              value={String(fields.at)}
              onChange={(e) => {
                const n = Number(e.target.value);

                set({ at: Number.isFinite(n) ? Math.round(n) : OVERLOAD_AT_MAX });
              }}
              slotProps={{ htmlInput: { min: OVERLOAD_AT_MIN, max: OVERLOAD_AT_MAX, step: 5 } }}
              error={fields.at < OVERLOAD_AT_MIN || fields.at > OVERLOAD_AT_MAX}
              helperText={t("ipProfiles.overloadAtHint")}
            />
          )}

          {asksForSet && (
            <TextField
              select
              size="small"
              label={t("ipProfiles.set")}
              value={fields.set}
              onChange={(e) => set({ set: e.target.value })}
              helperText={t("ipProfiles.setHint")}
            >
              {sorted.map((row) => (
                <MenuItem key={row.uuid} value={row.uuid}>
                  {row.name}
                  {row.live ? " · live" : ""}
                </MenuItem>
              ))}
            </TextField>
          )}

          {/*
            Условие строки канала -- сырой список, и только объявленный этим
            профилем: неназванный на ноду не поедет, и строка не совпала бы
            никогда. Пустой селектор поэтому не молчит, а говорит, где список
            объявляют.
          */}
          {asksForList && (
            <TextField
              select
              size="small"
              label={t("ipProfiles.list")}
              value={fields.dataset}
              onChange={(e) => set({ dataset: e.target.value })}
              helperText={t("ipProfiles.listHint")}
            >
              {declared.map((row) => (
                <MenuItem key={row.uuid} value={row.uuid}>
                  {row.name}
                  {row.active ? " · live" : ""}
                </MenuItem>
              ))}
              {declared.length === 0 && (
                <MenuItem disabled value="">
                  {t("ipProfiles.listEmpty")}
                </MenuItem>
              )}
            </TextField>
          )}

          {/*
            Счёта у инспектора нет: строка чёрного списка -- всегда отказ, и
            вопрос у неё один -- какой страницей отказать. Это имя записи
            каталога, а не свободная строка: набранное мимо каталога молча не
            найдёт страницу, поэтому здесь выбор, как у остальных инспекторов.
          */}
          {section === "black" && (
            <TextField
              select
              size="small"
              label={t("ipProfiles.response")}
              value={fields.response}
              onChange={(e) => set({ response: e.target.value })}
              helperText={t("ipProfiles.responseHint")}
            >
              {/* Пусто -- умолчание маршрута; своя строка, а не пустая ячейка. */}
              <MenuItem value="">{t("ipProfiles.responseDefault")}</MenuItem>
              {denyResponses.map((row) => (
                <MenuItem key={row.uuid} value={row.name}>
                  {row.name}
                </MenuItem>
              ))}
              {/*
                Каталог не доехал, а имя записано: показать его пунктом, иначе
                селектор молча стёр бы чужую настройку при первом сохранении.
              */}
              {fields.response !== ""
                && !denyResponses.some((row) => row.name === fields.response) && (
                <MenuItem value={fields.response}>{fields.response}</MenuItem>
              )}
            </TextField>
          )}

          {section === "rules" && (
            <ActionPart
              draft={fields.draft}
              onChange={patchDraft}
              registry={registry}
              inspectors={inspectors}
              datasets={live.map((row) => ({ value: row.uuid, label: row.name }))}
              askable
              /*
               * Пункта «всем» здесь нет: просьба без имени доезжает до всех, и
               * применить её вправе кто угодно, а круг слушателей -- решение
               * отправителя (docs/profiles.md репозитория ip).
               */
              /*
               * Псевдоадресат «запись маршрута»: метка, журнал и архив этого
               * запроса. Список глаголов не сужаем -- он приезжает реестром
               * канала, и своя копия здесь однажды уже отстала от него на пять
               * слов, а форма предлагала то, чего контроллер не принимал.
               */
              moduleTarget
              ttlRequired={false}
              /*
               * Кого писать: адрес либо подсеть и система -- их фильтр берёт у
               * гео. На перегрузке выбора нет: запись исполняет модуль, а он
               * сетей не резолвит -- кодер есть только у инспекторов.
               */
              writes={(fields.trigger === "overload"
                ? (["addr"] as const)
                : (["addr", "net", "net_all", "asn"] as const)
              ).map((write) => ({
                value: write,
                label: t(`outcomes.writes.${write}`),
              }))}
              writeHint={
                fields.trigger === "overload"
                  ? t("ipProfiles.overloadWriteHint")
                  : undefined
              }
              toHint={
                denyRisk ? t("ipProfiles.toDenyRiskHint") : t("ipProfiles.toHint")
              }
              /*
               * Запись адреса, попавшего в набор-условие, повода не несёт:
               * build его стирает, поэтому и поле не показывается.
               */
              showCode={!(writing && byList(fields.trigger))}
              /*
               * Повод объясняет не строку, а её адресата, поэтому и подпись
               * зависит от него, а не от «Когда». Просьбе повод нужен для
               * отбора на той стороне (codes в правиле приёма получателя),
               * записи в набор -- чтобы объяснить саму запись. Кодов вердикта
               * (IP_LIST, IP_GEO) здесь не бывает вовсе: строка канала
               * вердикта не выносит.
               */
              codeHint={
                writing
                  ? t("ipProfiles.outcomeCodeHint")
                  : t("ipProfiles.askCodeHint")
              }
            />
          )}

          {section !== "rules" && (
            <TextField
              size="small"
              label={t("ipProfiles.code")}
              value={fields.draft.code}
              onChange={(e) => patchDraft({ code: e.target.value.toUpperCase() })}
              helperText={t("ipProfiles.codeHint")}
            />
          )}

          {registry === null && section === "rules" && (
            <Alert severity="warning">{t("ipProfiles.noRegistry")}</Alert>
          )}
        </Stack>
    </Modal>
  );
}
