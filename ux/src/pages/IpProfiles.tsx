import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

import { Form } from "../components/Form.tsx";
import { CopyNameModal } from "../components/CopyNameModal.tsx";
import {
  DataTable,
  RowActionsHead,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import {
  Presets,
  SettingsTable,
  SettingsWideRow,
} from "../components/settings-table.tsx";
import { Section, Text } from "../components/fields.tsx";
import { TableBlock } from "../components/table-block.tsx";
import type {
  IpDefaultAction,
  IpOutcomeInput,
  IpProfileMeta,
  IpRule,
} from "../api.ts";
import {
  BlackTable,
  DatasetTable,
  RulesTable,
  WhiteTable,
  type RuleDraft,
} from "./ip-profile-tables.tsx";
import { RuleDialog } from "./ip-profile-dialog.tsx";
import {
  draftReady,
  fieldsOf,
  type RuleSave,
  type SectionId,
} from "./ip-profile-rule.ts";
import ChannelNotice from "../components/ChannelNotice.tsx";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  copyIpProfileThunk,
  loadIpProfileDetail,
  loadIpProfiles,
  openPanel,
  removeIpProfileThunk,
  restoreIpProfileThunk,
  saveIpProfileThunk,
} from "../store/slices/pages/ip-profiles.ts";
import { errorCode, thunkError } from "../errors.ts";

const PANEL_WIDTH = 720;

let seq = 0;

function nextKey(): string {
  seq += 1;

  return `rule-${seq}`;
}

function draftOf(rule: IpRule): RuleDraft {
  return {
    key: nextKey(),
    /* Условие: у терминальной строки набор, у строки канала -- сырой список. */
    set: rule.set,
    dataset: rule.dataset,
    /* «Не в списке» -- часть условия: без него правка теряет половину. */
    not: rule.not,
    action: rule.action,
    response: rule.response,
    code: rule.code,
    to: rule.to,
    do: rule.do,
    apply: rule.apply,
    delta: rule.delta,
    value: rule.value,
    /*
     * Корзина и метка -- такие же поля просьбы, как ось и величина: без них
     * строка, открытая с сервера и сохранённая обратно, теряла бы половину
     * действия.
     */
    counter: rule.counter,
    marker: rule.marker,
    /* Просьба записи: сторона, исходы и объекты -- часть строки, не украшение. */
    side: rule.side,
    when: rule.when,
    headers: rule.headers,
    args: rule.args,
    body: rule.body,
    force: rule.force,
    list: rule.list,
    ttl: rule.ttl,
    enabled: rule.enabled,
  };
}

/* Что показывает и правит форма объявленных списков. */
type DeclaredDataset = { uuid: string; name: string; active: boolean };

export default function IpProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const error = useAppSelector((s) => s.pages.ipProfiles.error);
  const rows = useAppSelector((s) => s.pages.ipProfiles.rows);
  const loading = useAppSelector((s) => s.pages.ipProfiles.loading);
  const panelId = useAppSelector((s) => s.pages.ipProfiles.panelId);
  const pager = usePager(rows);
  const ops = useRowOps<IpProfileMeta>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyIpProfileThunk({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeIpProfileThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadIpProfiles(scope));
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      <ChannelNotice id="ip" />
      {error !== null && rows.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("ipProfiles.description")}</TableCell>
          <TableCell align="right">{t("ipProfiles.rules")}</TableCell>
          <RowActionsHead />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row) => (
            <TableRow
              key={row.uuid}
              hover
              selected={panelId === row.uuid}
              onClick={() => {
                dispatch(openPanel(row.uuid));
                void dispatch(loadIpProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell align="right">{row.rule_count}</TableCell>
              {ops.cell(row, {
                remove:
                  row.name === "default" ? t("ipProfiles.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("ipProfiles.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadIpProfiles(scope))} />
        <DataTable.Pager pager={pager} />
      </DataTable>
      {ops.modals}
      <Drawer
        anchor="right"
        open={panelId !== undefined}
        onClose={() => dispatch(closePanel())}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: PANEL_WIDTH },
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {panelId !== undefined && (
          <IpProfileForm
            key={panelId ?? "new"}
            scope={scope}
            id={panelId}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </>
  );
}

function IpProfileForm({
  scope,
  id,
  onClose,
}: {
  scope: string;
  id: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const sets = useAppSelector((s) => s.pages.ipProfiles.sets);
  const live = useAppSelector((s) => s.pages.ipProfiles.live);
  const lists = useAppSelector((s) => s.pages.ipProfiles.lists);
  const inspectors = useAppSelector((s) => s.pages.ipProfiles.inspectors);
  const registry = useAppSelector((s) => s.pages.ipProfiles.actions);
  const denyResponses = useAppSelector((s) => s.pages.ipProfiles.denyResponses);
  const detail = useAppSelector((s) => s.pages.ipProfiles.detail);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [declared, setDeclared] = useState<DeclaredDataset[]>([]);
  const [outcomes, setOutcomes] = useState<IpOutcomeInput[]>([]);
  const [fallback, setFallback] = useState<IpDefaultAction>("allow");
  // Отказ удаления: 409 in_use называет объявления с profile=. Живёт в
  // форме -- алерт страницы прячется за панелью.
  const [formError, setFormError] = useState<string | null>(null);
  /*
   * Что сейчас открыто в форме строки: секция и ключ правки. Ключ null --
   * заводим новую. Полусобранных строк в таблице не бывает: строка появляется,
   * когда форма закрыта кнопкой «Добавить».
   */
  const [editing, setEditing] = useState<{
    section: SectionId;
    key: string | null;
  } | null>(null);

  useEffect(() => {
    if (id !== null && detail !== null && detail.uuid === id) {
      setName(detail.name);
      setDescription(detail.description);
      /*
       * Ответ без правил -- это не пустой профиль, а контроллер прежней
       * сборки. Форма в таком случае показывает пустую таблицу и ошибку
       * загрузки наборов, но страницу не роняет: белый экран объясняет
       * оператору меньше, чем строка про недоступный ресурс.
       */
      setRules((detail.rules ?? []).map(draftOf));
      setDeclared(detail.datasets ?? []);
      setOutcomes(detail.outcomes ?? []);
      setFallback(detail.default ?? "allow");
    }
  }, [id, detail]);

  const waiting = id !== null && (detail === null || detail.uuid !== id);
  const nameOk = name.trim() !== "";
  /*
   * Готовность считается тем же кодом, что и в форме строки, -- общей
   * проверкой действия из components/action-part.
   */
  const ready = rules.every((rule) => {
    const section: SectionId =
      rule.action === "allow" ? "white" : rule.action === "deny" ? "black" : "rules";

    return draftReady(section, fieldsOf(rule, section));
  });

  const remove = (key: string) => {
    setRules((prev) => prev.filter((row) => row.key !== key));
  };

  /* Ключи строк-инициаторов в общей таблице: "o:<индекс в outcomes>". */
  const outcomeKey = (index: number) => `o:${index}`;
  const outcomeIndexOf = (key: string | null | undefined) =>
    key !== null && key !== undefined && key.startsWith("o:")
      ? Number(key.slice(2))
      : null;

  const removeOutcome = (index: number) =>
    setOutcomes((prev) => prev.filter((_row, i) => i !== index));

  /*
   * Сохранение формы строки. Форма одна на два вида строк: триггер «адрес в
   * наборе» даёт правило, триггер по исходу -- инициатор. Правка может сменить
   * вид -- тогда строка переезжает из одного хранилища в другое.
   */
  const saveRule = (next: RuleSave) => {
    const key = editing?.key ?? null;
    const oIndex = outcomeIndexOf(key);

    if (next.kind === "outcome") {
      if (oIndex !== null) {
        setOutcomes((prev) =>
          prev.map((row, i) => (i === oIndex ? next.outcome : row)),
        );
      } else {
        if (key !== null) {
          remove(key);
        }

        setOutcomes((prev) => [...prev, next.outcome]);
      }
    } else {
      if (oIndex !== null) {
        removeOutcome(oIndex);
        setRules((prev) => [...prev, { ...next.rule, key: nextKey() }]);
      } else {
        setRules((prev) => {
          if (key !== null) {
            return prev.map((row) =>
              row.key === key ? { ...next.rule, key } : row,
            );
          }

          return [...prev, { ...next.rule, key: nextKey() }];
        });
      }
    }

    setEditing(null);
  };

  /*
   * Порядок правил переставляется внутри своей секции: секции решают разное,
   * и «выше» из чёрного списка не значит «выше» относительно правил.
   * Хранится по-прежнему один плоский список: секция отдаёт свой порядок
   * целиком, а на местах её строк в общем списке он и раскладывается --
   * чужие строки не двигаются.
   */
  const reorderWithin = (keys: string[]) => {
    setRules((prev) => {
      const moved = keys.map((key) => prev.find((row) => row.key === key));

      if (moved.some((row) => row === undefined)) {
        return prev;
      }

      const mine = new Set(keys);
      let at = 0;

      return prev.map((row) =>
        mine.has(row.key) ? (moved[at++] as RuleDraft) : row,
      );
    });
  };

  /*
   * Что ответить, когда не совпал ни один набор. Список короткий и стоит
   * чипами: выбор в один клик, как у остальных настроек.
   */
  const fallbacks = [
    { value: "allow" as const, label: t("ipProfiles.fallbackActions.allow") },
    { value: "deny" as const, label: t("ipProfiles.fallbackActions.deny") },
  ];

  /*
   * Списки, которые ещё можно объявить: те же данные, что в разделе «Списки»,
   * минус уже названные. Объявление -- это перечисление, дважды один список в
   * нём не значит ничего.
   */
  const declarable = lists
    .filter((row) => !declared.some((item) => item.uuid === row.uuid))
    .map((row) => ({ uuid: row.uuid, name: row.name, active: row.active === true }));

  const editingOutcome =
    editing === null ? null : outcomeIndexOf(editing.key);

  const current =
    editing?.key === null || editing === null || editingOutcome !== null
      ? null
      : (rules.find((row) => row.key === editing.key) ?? null);

  const currentOutcome =
    editingOutcome === null ? null : (outcomes[editingOutcome] ?? null);

  /*
   * У default заперты имя и удаление, содержимое -- нет: объявление без
   * profile= читает именно его, и править его -- обычный ход, а не повод
   * заводить копию. Полоса над телом говорит, что профиль разошёлся с
   * поставкой, кнопка рядом возвращает его назад.
   *
   * Признак берётся из карточки, а не из поля имени: имя правится в форме, и
   * полоса моргала бы на каждую набранную букву.
   */
  const loaded = id !== null && detail !== null && detail.uuid === id ? detail : null;
  const isDefault = loaded?.name === "default";
  const banner =
    loaded?.modified === true ? t("profiles.defaultModified") : undefined;
  const restore =
    id === null
      ? undefined
      : () => {
          void dispatch(restoreIpProfileThunk({ scope, id }));
        };
  const [copyOpen, setCopyOpen] = useState(false);

  return (
    <Form id="ip-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("ipProfiles.newTitle") : t("ipProfiles.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body
        spacing={2}
        scroll
        banner={banner}
        bannerActionLabel={t("common.restore")}
        onBannerAction={restore}
      >
        <Section
          title={t("ipProfiles.sectionProfile")}
          hint={t("ipProfiles.sectionProfileHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("ipProfiles.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("ipProfiles.description")}
              value={description}
              onChange={setDescription}
            />
          </SettingsTable>
        </Section>

        {/*
          Три блока внутри карточки списков, потому что решают они разное.
          Белый список абсолютен: совпадение сразу даёт allow, и порядок строк
          на это не влияет. Чёрных может быть несколько -- с разными действиями
          и разным счётом, решает первый совпавший. «Иначе» отвечает за всех,
          кто не совпал ни с одним.
        */}
        <Section
          title={t("ipProfiles.sectionLists")}
          hint={t("ipProfiles.sectionListsHint")}
          flush
          defaultExpanded
        >
            <TableBlock
              title={t("ipProfiles.whiteTitle")}
              label={t("ipProfiles.whiteHint")}
            >
              <WhiteTable
                rules={rules.filter((row) => row.action === "allow")}
                sets={sets}
                onAdd={() => setEditing({ section: "white", key: null })}
                onEdit={(key) => setEditing({ section: "white", key })}
                onRemove={remove}
              />
            </TableBlock>
            <TableBlock
              title={t("ipProfiles.blackTitle")}
              label={t("ipProfiles.blackHint")}
            >
              {/* Счёта у инспектора нет: чёрный список -- это отказы. */}
              <BlackTable
                rules={rules.filter((row) => row.action === "deny")}
                sets={sets}
                onAdd={() => setEditing({ section: "black", key: null })}
                onEdit={(key) => setEditing({ section: "black", key })}
                onReorder={reorderWithin}
                onRemove={remove}
              />
            </TableBlock>
            {/*
              «Иначе» -- не строка таблицы, а настройка профиля: она про
              всех, кто не совпал ни с одним набором, и в ряду со строками
              читалась последним правилом, которое можно переставить или
              убрать. Отдельный блок ставит её туда, где она и стоит по
              смыслу: после чёрных списков и до правил.
            */}
            <TableBlock
              title={t("ipProfiles.fallbackTitle")}
              label={t("ipProfiles.fallbackHint")}
              last
            >
              <SettingsTable aside={false}>
                {/*
                  Ответ выбирается чипами во всю строку, без имени слева:
                  строка в блоке одна, и «Что ответить» повторяло бы его
                  заголовок -- см. SettingsWideRow.
                */}
                <SettingsWideRow label={t("ipProfiles.fallbackAction")}>
                  <Presets keep items={fallbacks} current={fallback} onPick={setFallback} />
                </SettingsWideRow>
              </SettingsTable>
            </TableBlock>
        </Section>

        {/*
          Списки для условий -- своя секция, а не блок канала. Канал действий
          везде устроен парой «сигналы -- правила», и третий блок внутри него
          читался бы третьим участником разговора. Здесь же разговора нет:
          это доставка, и стоит она между тем, чем инспектор решает, и тем,
          что он рассказывает соседям.
        */}
        <Section
          title={t("ipProfiles.sectionDatasets")}
          hint={t("ipProfiles.sectionDatasetsHint")}
          flush
          defaultExpanded
        >
            <TableBlock label={t("ipProfiles.datasetsHint")} last>
              <DatasetTable
                datasets={declared}
                declarable={declarable}
                onAdd={(uuid) => {
                  const row = declarable.find((item) => item.uuid === uuid);

                  if (row !== undefined) {
                    setDeclared((prev) => [...prev, row]);
                  }
                }}
                onRemove={(uuid) => {
                  /*
                   * Список, на который ссылается строка, снять нельзя: она
                   * осталась бы с условием, которого нет, и контроллер отверг
                   * бы весь профиль на сохранении.
                   */
                  if (rules.some((row) => row.dataset === uuid)) {
                    setFormError(t("ipProfiles.listInUse"));

                    return;
                  }

                  setDeclared((prev) => prev.filter((row) => row.uuid !== uuid));
                }}
              />
            </TableBlock>
        </Section>

        {/*
          Канал действий у адреса -- только правила: сигналов здесь нет и быть
          не может. Адрес стоит нулевой волной, ему никто ничего не шлёт, и
          пустой таблицы приёма в карточке не заводят.
        */}
        <Section
          title={t("ipProfiles.sectionChannel")}
          hint={t("ipProfiles.sectionChannelHint")}
          flush
          defaultExpanded
        >
            <TableBlock
              title={t("ipProfiles.rulesTitle")}
              label={t("ipProfiles.rulesHint")}
              last
            >
              <RulesTable
                rules={rules.filter(
                  (row) => row.action === "request" || row.action === "list",
                )}
                outcomes={outcomes}
                datasets={declared}
                live={live}
                onAdd={() => setEditing({ section: "rules", key: null })}
                onEdit={(key) => setEditing({ section: "rules", key })}
                onEditOutcome={(index) =>
                  setEditing({ section: "rules", key: outcomeKey(index) })
                }
                onReorder={reorderWithin}
                onRemove={remove}
                onRemoveOutcome={removeOutcome}
              />
            </TableBlock>
        </Section>
        {sets.length === 0 && (
          <Alert severity="info">{t("ipProfiles.needSets")}</Alert>
        )}
      </Form.Body>
      <Form.Notice
        notice={
          formError === null
            ? null
            : { text: formError, code: errorCode(formError) }
        }
        onDismiss={() => setFormError(null)}
      />
      <Form.Actions>
        {id !== null && (
          <Button
            size="small"
            startIcon={<ContentCopyOutlinedIcon />}
            onClick={() => setCopyOpen(true)}
          >
            {t("copyModal.button")}
          </Button>
        )}
        {id !== null && !isDefault && (
          <Button
            size="small"
            color="error"
            disabled={waiting}
            onClick={() => {
              void (async () => {
                setFormError(null);
                const result = await dispatch(
                  removeIpProfileThunk({ scope, id }),
                );
                if (removeIpProfileThunk.rejected.match(result)) {
                  setFormError(
                    typeof result.payload === "string"
                      ? result.payload
                      : String(result.error.message ?? result.error),
                  );
                }
              })();
            }}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!nameOk || !ready || waiting}
          onClick={() => {
            void dispatch(
              saveIpProfileThunk({
                scope,
                id,
                name: name.trim(),
                description,
                rules: rules.map(({ key: _key, ...rule }) => rule),
                datasets: declared.map((row) => row.uuid),
                outcomes,
                default: fallback,
                defaultCode: "",
              }),
            );
          }}
        >
          {id === null ? t("common.create") : t("common.save")}
        </Button>
      </Form.Actions>
      {copyOpen && (
        <CopyNameModal
          title={t("copyModal.profileTitle")}
          source={name.trim()}
          onClose={() => setCopyOpen(false)}
          onCopy={(next) => {
            void dispatch(
              saveIpProfileThunk({
                scope,
                id: null,
                name: next,
                description,
                rules: rules.map(({ key: _key, ...rule }) => rule),
                datasets: declared.map((row) => row.uuid),
                outcomes,
                default: fallback,
                defaultCode: "",
              }),
            );
            setCopyOpen(false);
          }}
        />
      )}
      {editing !== null && (
        <RuleDialog
          section={editing.section}
          rule={current}
          outcome={currentOutcome}
          sets={sets}
          datasets={declared}
          denyResponses={denyResponses}
          live={live}
          inspectors={inspectors}
          registry={registry}
          onSave={saveRule}
          onClose={() => setEditing(null)}
        />
      )}

    </Form>
  );
}
