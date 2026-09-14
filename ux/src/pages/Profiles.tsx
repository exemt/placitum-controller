import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Theme } from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";

import { OutcomesBlock } from "../components/outcomes-block.tsx";
import { SignalsBlock } from "../components/signals-block.tsx";
import { verbLabel } from "../components/action-select.tsx";
import {
  fetchActions,
  fetchDatasets,
  fetchInspectors,
  fetchRuleFile,
  verbsFor,
  type ActionRegistry,
  type InspectorMeta,
  type ModsecPolicy,
  type RuleSetMeta,
  weakeningVerbs,
} from "../api.ts";
import { Form } from "../components/Form.tsx";
import { RulesEditorModal } from "../components/rules-editor/RulesEditorModal.tsx";
import { Section, Text } from "../components/fields.tsx";
import { SettingsTable } from "../components/settings-table.tsx";
import {
  DataTable,
  RowActionsHead,
  TableIconButton,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import ChannelNotice from "../components/ChannelNotice.tsx";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  copyProfileThunk,
  loadProfileDetail,
  loadProfileLists,
  loadProfiles,
  openPanel,
  removeProfileThunk,
  restoreProfileThunk,
  saveProfileThunk,
  sendProfilesThunk,
} from "../store/slices/pages/profiles.ts";
import { errorCode, thunkError } from "../errors.ts";
import { shortHash } from "../fleet.ts";

/* Шире соседей по разделу: в панели живут таблицы канала действий. */
const PANEL_WIDTH = 680;

/** Пустая политика: профиль никого не слушает и никого не просит. */
function emptyPolicy(): ModsecPolicy {
  return { prior: [], outcomes: [] };
}
const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const INCLUDE_PAD = 2;

/**
 * Точки в глифе ручки начинаются не от края svg: без поправки колонка
 * оптически уезжает вправо от заголовка блока.
 */
const GRIP_INK = "5px";

const includeTableSx = {
  width: "100%",
  borderTop: 1,
  borderColor: "divider",
  "& td, & th": { borderLeft: 0, borderRight: 0 },
  "& .MuiTableCell-root:first-of-type": {
    width: 24,
    paddingLeft: (theme: Theme) =>
      `calc(${theme.spacing(INCLUDE_PAD)} - ${GRIP_INK}) !important`,
    paddingRight: 0.5,
  },
  "& .MuiTableCell-root:nth-of-type(2)": {
    paddingLeft: 0.5,
  },
  "& .MuiTableCell-root:last-of-type": {
    paddingRight: (theme: Theme) => `${theme.spacing(INCLUDE_PAD)} !important`,
  },
} as const;

const includeHandleSx = {
  color: "text.secondary",
} as const;

const includeActionsSx = {
  width: "1%",
  whiteSpace: "nowrap",
  py: 0.5,
  pl: 0.75,
  textAlign: "right",
} as const;

function moveItem(order: string[], id: string, index: number): string[] {
  const from = order.indexOf(id);
  if (from < 0 || index < 0 || index >= order.length || from === index) {
    return order;
  }
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(index, 0, item);
  return next;
}

export default function Profiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const error = useAppSelector((s) => s.pages.profiles.error);
  const rows = useAppSelector((s) => s.pages.profiles.rows);
  const loading = useAppSelector((s) => s.pages.profiles.loading);
  const panelId = useAppSelector((s) => s.pages.profiles.panelId);
  const sending = useAppSelector((s) => s.pages.profiles.sending);
  const lastSend = useAppSelector((s) => s.pages.profiles.lastSend);
  const pager = usePager(rows);
  const ops = useRowOps<RuleSetMeta>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyProfileThunk({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeProfileThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadProfiles(scope));
    },
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendProfilesThunk(scope));
      }
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
    sendDisabled: sending || scope === null,
    meta:
      lastSend === null
        ? undefined
        : t("profiles.sent", {
            rev: lastSend.rev,
            hash: shortHash(lastSend.config_hash),
          }),
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      <ChannelNotice id="rules" />
      {error !== null && rows.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("profiles.description")}</TableCell>
          <TableCell align="right">{t("profiles.lists")}</TableCell>
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
                void dispatch(loadProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell align="right">{row.file_count}</TableCell>
              {ops.cell(row, {
                remove: row.name === "default" ? t("profiles.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("profiles.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadProfiles(scope))} />
        <DataTable.Pager pager={pager} />
      </DataTable>
      {ops.modals}
      <Drawer
        anchor="right"
        open={panelId !== undefined}
        onClose={() => dispatch(closePanel())}
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
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
          <ProfileForm
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

function IncludeOrder({
  lists,
  order,
  onMoveTo,
  onRemove,
  onAdd,
}: {
  lists: { uuid: string; name: string }[];
  order: string[];
  onMoveTo: (id: string, index: number) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  const t = useT();
  const unused = lists.filter((list) => !order.includes(list.uuid));
  const [dragId, setDragId] = useState<string | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragId(id);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (dragId === null) {
      return;
    }
    const body = event.currentTarget.closest("tbody");
    if (body === null) {
      return;
    }
    const rows = [...body.querySelectorAll<HTMLElement>("[data-list-id]")];
    let next = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        next = i;
        break;
      }
    }
    onMoveTo(dragId, next);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (dragId === null) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragId(null);
  }

  /*
   * Ни рамки, ни заголовка: и то и другое даёт карточка секции. Таблица здесь
   * -- содержимое блока, а не отдельный островок внутри него.
   */
  return (
    <>
      {order.length === 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ px: INCLUDE_PAD, py: 1.25 }}
        >
          {t("profiles.emptyOrder")}
        </Typography>
      ) : (
        <Table
          size="small"
          sx={{
            ...includeTableSx,
            userSelect: dragId === null ? "auto" : "none",
          }}
        >
          <TableBody>
            {order.map((listId) => {
              const list = lists.find((row) => row.uuid === listId);
              const label = list?.name ?? listId;
              return (
                <TableRow
                  key={listId}
                  data-list-id={listId}
                  hover
                  sx={{
                    opacity: dragId === listId ? 0.45 : 1,
                    bgcolor: dragId === listId ? "action.selected" : undefined,
                  }}
                >
                  <TableCell sx={includeHandleSx}>
                    <Box
                      component="span"
                      title={t("profiles.drag")}
                      onPointerDown={(event) => onPointerDown(event, listId)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: "text.secondary",
                        cursor: dragId === null ? "grab" : "grabbing",
                        touchAction: "none",
                        opacity: 0.55,
                        "&:hover": { opacity: 1 },
                      }}
                    >
                      <DragIndicatorIcon sx={{ fontSize: 18 }} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ py: 0.75 }}>
                    <Typography
                      title={label}
                      noWrap
                      sx={{ fontSize: "0.8rem", lineHeight: 1.35 }}
                    >
                      {label}
                    </Typography>
                  </TableCell>
                  <TableCell sx={includeActionsSx}>
                    <TableIconButton
                      color="error"
                      icon={<DeleteIcon />}
                      tooltip={t("profiles.removeList")}
                      onClick={() => onRemove(listId)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {unused.length > 0 && (
        <Box sx={{ px: INCLUDE_PAD, py: 1.25 }}>
          <TextField
            select
            size="small"
            fullWidth
            label={t("profiles.addList")}
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (id !== "") {
                onAdd(id);
              }
            }}
            slotProps={{
              inputLabel: { shrink: true },
              select: {
                displayEmpty: true,
                renderValue: () => (
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {t("profiles.chooseSet")}
                  </Box>
                ),
              },
            }}
          >
            <MenuItem value="" disabled>
              {t("profiles.chooseSet")}
            </MenuItem>
            {unused.map((list) => (
              <MenuItem key={list.uuid} value={list.uuid}>
                {list.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      )}
    </>
  );
}

function ProfileForm({
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
  const lists = useAppSelector((s) => s.pages.profiles.lists);
  const detail = useAppSelector((s) => s.pages.profiles.detail);
  const error = useAppSelector((s) => s.pages.profiles.error);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  /* Файлы данных под операторы `*FromFile`: порядок здесь -- порядок печати. */
  const [dataOrder, setDataOrder] = useState<string[]>([]);
  const [dataFiles, setDataFiles] = useState<{ uuid: string; name: string }[]>([]);
  const [policy, setPolicy] = useState<ModsecPolicy>(emptyPolicy);
  // Отказ удаления: default_required или in_use с местами. Живёт в форме --
  // алерт страницы прячется за панелью.
  const [formError, setFormError] = useState<string | null>(null);
  /** Чего не нашлось в каталоге при возврате default к поставке. */
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  /*
   * Соседи, наборы и словарь действий -- для политики: кому просьба, в какой
   * набор запись, каким глаголом. Не доехали -- селекторы пусты, уже
   * записанные строки видны как есть.
   */
  const [inspectors, setInspectors] = useState<InspectorMeta[]>([]);
  /*
   * Подсказки поля поводов: их приносит карточка набора. Список общий на
   * пространство -- его собирает контроллер по профилям отправителей.
   */
  const senderCodes =
    id !== null && detail !== null && detail.uuid === id ? (detail.sender_codes ?? []) : [];
  const [datasets, setDatasets] = useState<string[]>([]);
  const [registry, setRegistry] = useState<ActionRegistry | null>(null);

  useEffect(() => {
    if (id !== null && detail !== null && detail.uuid === id) {
      setName(detail.name);
      setDescription(detail.description);
      setOrder(detail.files.map((file) => file.uuid));
      setDataOrder((detail.data_files ?? []).map((file) => file.uuid));
      setPolicy(detail.policy ?? emptyPolicy());
    }
  }, [id, detail]);

  useEffect(() => {
    let alive = true;

    fetchInspectors(scope)
      .then((rows) => {
        if (alive) {
          setInspectors(rows);
        }
      })
      .catch(() => {
        /* Селектор «кому» без соседей -- карточка живёт. */
      });

    fetchDatasets(scope)
      .then((rows) => {
        if (alive) {
          // Записывать можно только в активный набор: у пассивного нет темы,
          // и событие уехало бы в никуда.
          setDatasets(
            rows.filter((row) => row.kind === "list" && row.active).map((row) => row.name),
          );
          /*
           * Файлом данных бывает текстовое содержимое: список фраз или
           * адресов. Двоичному телу в SecLang-операторе делать нечего, и
           * предлагать его в селекторе -- предлагать сломать загрузку правил.
           */
          setDataFiles(
            rows
              .filter((row) => row.kind === "content")
              .map((row) => ({ uuid: row.uuid, name: row.name })),
          );
        }
      })
      .catch(() => {
        /* Пустой список наборов -- селектор пуст, карточка живёт. */
      });

    fetchActions()
      .then((reg) => {
        if (alive) {
          setRegistry(reg);
        }
      })
      .catch(() => {
        /* Пустой словарь -- осмысленное состояние, ронять карточку незачем. */
      });

    return () => {
      alive = false;
    };
  }, [scope]);

  const waiting = id !== null && (detail === null || detail.uuid !== id);
  const nameOk = PROFILE_NAME_RE.test(name.trim());

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
  /*
   * Состав набора ищется по именам файлов, и чего-то может не оказаться в
   * каталоге: восстановление ставит найденное и называет остальное полосой
   * уровня «предупреждение» -- запись прошла, но состав неполный, и полоса
   * «изменён» останется.
   */
  const restore =
    id === null
      ? undefined
      : () => {
          void (async () => {
            setFormError(null);
            setRestoreNotice(null);

            const result = await dispatch(restoreProfileThunk({ scope, id }));

            if (restoreProfileThunk.rejected.match(result)) {
              setFormError(
                typeof result.payload === "string"
                  ? result.payload
                  : String(result.error.message ?? result.error),
              );

              return;
            }

            if (result.payload.length > 0) {
              setRestoreNotice(
                `${t("profiles.restoreMissing")} ${result.payload.join(", ")}`,
              );
            }
          })();
        };
  const [editorOpen, setEditorOpen] = useState(false);

  /*
   * Редактор открывает наборы профиля в порядке include и пишет их на сервер
   * сам, вместе с порядком, -- поэтому фишка стоит в шапке порядка, а не среди
   * кнопок формы. Пустому профилю править нечего; у нового профиля наборов
   * ещё нет. Обёртка нужна, чтобы подсказка работала и у выключенной фишки.
   */
  const editorChip =
    id === null ? undefined : (
      <Tooltip
        title={
          order.length === 0
            ? t("rulesEditor.openEmpty")
            : t("rulesEditor.openHint")
        }
      >
        <span>
          <Chip
            size="small"
            variant="outlined"
            clickable
            icon={<EditNoteOutlinedIcon />}
            label={t("rulesEditor.open")}
            disabled={waiting || order.length === 0}
            onClick={() => setEditorOpen(true)}
          />
        </span>
      </Tooltip>
    );

  return (
    <Form id="profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("profiles.newTitle") : t("profiles.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body
        scroll
        banner={banner}
        bannerActionLabel={t("common.restore")}
        onBannerAction={restore}
      >
        {error !== null && <Alert severity="error">{error}</Alert>}

        <Section
          title={t("profiles.sectionProfile")}
          hint={t("profiles.sectionProfileHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("profiles.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("profiles.description")}
              value={description}
              onChange={setDescription}
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("profiles.includeOrder")}
          hint={t("profiles.sectionIncludeHint")}
          flush
          defaultExpanded
          end={editorChip}
        >
          <IncludeOrder
            lists={lists}
            order={order}
            onMoveTo={(id, index) => setOrder((current) => moveItem(current, id, index))}
            onRemove={(listId) => setOrder(order.filter((row) => row !== listId))}
            onAdd={(id) => setOrder((current) => [...current, id])}
          />
        </Section>
        {lists.length === 0 && <Alert severity="info">{t("profiles.needLists")}</Alert>}

        {/*
          Файлы данных -- не правила, и порядок у них не значит ничего:
          операторы `*FromFile` читают файл по имени. Но таблица та же, что у
          состава, -- заводить второй способ показать «что включено в профиль»
          значило бы держать две разные таблицы про одно.
        */}
        <Section
          title={t("profiles.dataFiles")}
          hint={t("profiles.dataFilesHint")}
          flush
        >
          <IncludeOrder
            lists={dataFiles}
            order={dataOrder}
            onMoveTo={(fileId, index) =>
              setDataOrder((current) => moveItem(current, fileId, index))
            }
            onRemove={(fileId) =>
              setDataOrder(dataOrder.filter((row) => row !== fileId))
            }
            onAdd={(fileId) => setDataOrder((current) => [...current, fileId])}
          />
        </Section>

        {/*
          Канал действий -- парой и в этом порядке: сначала сигналы (что
          принимаем от соседей), сразу за ними правила (что говорим сами).
          Пока профиль не сохранён, политике негде жить -- её показывают
          только у заведённого.
        */}
        {id !== null && (
          <Section
            title={t("profiles.sectionChannel")}
            hint={t("profiles.sectionChannelHint")}
            flush
            defaultExpanded
          >
            <SignalsBlock
              hint={t("prior.hint")}
              rules={policy.prior}
              codes={senderCodes}
              verbs={verbsFor(registry, "modsec").map((verb) => ({
                value: verb,
                label: verbLabel(t, verb),
              }))}
              weakening={weakeningVerbs(registry)}
              senders={inspectors}
              defaultRule={() => ({
                from: "ip",
                accept: ["threshold"],
                codes: [],
              })}
              onChange={(prior) => setPolicy((current) => ({ ...current, prior }))}
            />
            <OutcomesBlock
              hint={t("outcomes.hint.rules")}
              outcomes={policy.outcomes}
              datasets={datasets}
              inspectors={inspectors}
              registry={registry}
              /*
               * «Перегрузка» -- запрос снят на входе из-за полной очереди
               * (MODSEC_QUEUE_LIMIT): оценка не начиналась, но профиль вправе
               * сбросить клиента в набор либо рассказать соседям. «Сработало
               * правило» -- номера и метки находок фазы, есть только здесь.
               */
              ons={["deny", "allow", "score", "overload", "rule"]}
              onChange={(outcomes) => setPolicy((current) => ({ ...current, outcomes }))}
            />
          </Section>
        )}
      </Form.Body>
      <Form.Notice
        notice={
          formError !== null
            ? { text: formError, code: errorCode(formError) }
            : restoreNotice === null
              ? null
              : { severity: "warning", text: restoreNotice, title: "" }
        }
        onDismiss={() => {
          setFormError(null);
          setRestoreNotice(null);
        }}
      />
      <Form.Actions>
        {id !== null && !isDefault && (
          <Button
            size="small"
            color="error"
            disabled={waiting}
            onClick={() => {
              void (async () => {
                setFormError(null);
                const result = await dispatch(
                  removeProfileThunk({ scope, id }),
                );
                if (removeProfileThunk.rejected.match(result)) {
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
          disabled={!nameOk || waiting}
          onClick={() => {
            void dispatch(
              saveProfileThunk({
                scope,
                id,
                name: name.trim(),
                description,
                files: order,
                dataFiles: dataOrder,
                policy: id === null ? undefined : policy,
              }),
            );
          }}
        >
          {id === null ? t("common.create") : t("common.save")}
        </Button>
      </Form.Actions>
      {/*
        Редактор читает наборы по черновику порядка в форме, а не по детали:
        переставленное, но не записанное здесь, в редакторе стоит так же.
        Запись из него кладёт порядок в профиль, и форма подхватывает его
        назад, чтобы её собственная запись не откатила редакторскую.
      */}
      {editorOpen && id !== null && (
        <RulesEditorModal
          scope={scope}
          name={name.trim()}
          mode="profile"
          profileId={id}
          load={() =>
            Promise.all(
              order.map(async (uuid) => {
                const row = await fetchRuleFile(scope, uuid);
                return { uuid, name: row.name, text: row.text_raw };
              }),
            )
          }
          onClose={() => setEditorOpen(false)}
          onSaved={(saved) => {
            setOrder(saved.files.map((file) => file.uuid));
            void dispatch(loadProfileLists(scope));
            void dispatch(loadProfiles(scope));
          }}
        />
      )}
    </Form>
  );
}
