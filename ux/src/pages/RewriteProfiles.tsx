/**
 * Профили инспектора rewrite: модификация ответов сервера.
 *
 * Профиль отвечает на четыре вопроса и в таком же порядке разложен по
 * карточке: править или наблюдать (режим), что менять (группы модификаторов),
 * кого слушать (правила приёма mutate/skip) и что делать, когда подмена решена,
 * но не состоялась (при ошибке).
 *
 * Группа -- единица включения: у неё условия (код ответа, тип содержимого) и
 * операции над телом и заголовками. Выключенную по умолчанию группу включает
 * просьба соседа, поэтому имена групп и правила приёма читаются в одной
 * карточке: грант живёт здесь, по проводу имена не ездят.
 *
 * Строка таблицы групп показывает главное -- имя, включена ли сама, условия
 * и счёт операций; сами операции правятся в окне по шестерёнке: их задают
 * один раз, а regex в строке таблицы не читается.
 */

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";

import { Form } from "../components/Form.tsx";
import { CopyNameModal } from "../components/CopyNameModal.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  DataTable,
  DraftCell,
  FilterSelect,
  FilterText,
  RowActionsHead,
  TableIconButton,
  TableNoticeRow,
  useRowOps,
  usePager,
  type FilterOption,
} from "../components/data-table/index.ts";
import { SettingsTable } from "../components/settings-table.tsx";
import { LongTextCell } from "../components/long-text-cell.tsx";
import { Chips, Pick, Section, Text } from "../components/fields.tsx";
import { HeadCell, TableBlock, flushTableSx } from "../components/table-block.tsx";
import { SignalsBlock } from "../components/signals-block.tsx";
import {
  fetchActions,
  fetchInspectors,
  verbsFor,
  weakeningVerbs,
  type ActionRegistry,
  type InspectorMeta,
  type RewriteBodyOp,
  type RewriteBodyOpKind,
  type RewriteGroup,
  type RewriteHeaderOp,
  type RewritePriorRule,
  type RewriteProfile,
  type RewriteProfileDoc,
} from "../api.ts";
import { verbLabel } from "../components/action-select.tsx";
import ChannelNotice, { pageNoticeSx } from "../components/ChannelNotice.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  clearSent,
  closePanel,
  copyRewriteProfile,
  loadRewriteProfileDetail,
  loadRewriteProfiles,
  openPanel,
  removeRewriteProfile,
  restoreRewriteProfileThunk,
  saveRewriteProfileThunk,
  sendRewrite,
} from "../store/slices/pages/rewrite-profiles.ts";

const PANEL_WIDTH = 720;
const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

const emptyDoc = (): RewriteProfileDoc => ({
  description: "",
  denyResponse: "rewrite_failed",
  groups: [],
  prior: [],
});

/* Заготовка группы для окна: включена сама, без условий и операций --
   «Добавить» заперто, пока группа ничего не меняет. */
const newGroup = (index: number): RewriteGroup => ({
  name: `group_${index}`,
  default: true,
  on: "response",
  status: [],
  contentType: [],
  direction: [],
  opcode: [],
  body: [],
  headers: [],
});

const DIRECTIONS = ["c2s", "s2c"] as const;
const OPCODES = ["text", "binary", "continuation"] as const;

const newBodyOp = (): RewriteBodyOp => ({
  op: "replace",
  pattern: "",
  to: "",
  text: "",
  maxMatches: null,
});

const newHeaderOp = (): RewriteHeaderOp => ({ op: "set", name: "", value: "" });

export default function RewriteProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.rewriteProfiles.rows);
  const loading = useAppSelector((s) => s.pages.rewriteProfiles.loading);
  const error = useAppSelector((s) => s.pages.rewriteProfiles.error);
  const panelId = useAppSelector((s) => s.pages.rewriteProfiles.panelId);
  const sending = useAppSelector((s) => s.pages.rewriteProfiles.sending);
  const sent = useAppSelector((s) => s.pages.rewriteProfiles.sent);
  const pager = usePager(rows);
  const ops = useRowOps<RewriteProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(
          copyRewriteProfile({ scope: scope ?? "", id: row.uuid, name }),
        ),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeRewriteProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => void dispatch(loadRewriteProfiles(scope)),
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendRewrite(scope));
      }
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
    sendDisabled: sending || scope === null || rows.length === 0,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      <ChannelNotice id="rewrite" />
      {error !== null && (
        <Alert severity="error" icon={false} sx={pageNoticeSx}>
          {error}
        </Alert>
      )}
      {sent !== null && (
        <Alert
          severity="success"
          icon={false}
          sx={pageNoticeSx}
          onClose={() => dispatch(clearSent())}
        >
          {t("rewrite.sentHint")} {sent}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("rewrite.groupsCol")}</TableCell>
          <TableCell>{t("rewrite.denyResponse")}</TableCell>
          <TableCell>{t("rewrite.description")}</TableCell>
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
                void dispatch(loadRewriteProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{groupsSummary(row.doc.groups)}</TableCell>
              <TableCell>{row.doc.denyResponse}</TableCell>
              <TableCell>{row.description}</TableCell>
              {ops.cell(row, {
                remove:
                  row.name === "default" ? t("rewrite.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("rewrite.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadRewriteProfiles(scope))} />
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
          <RewriteProfileForm
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

/**
 * Сводка групп в строке списка: сколько включено само и сколько ждёт просьбы.
 * Выключенная группа -- не отключённая: её включает `mutate` соседа, и в списке
 * это разные состояния.
 */
function groupsSummary(groups: RewriteGroup[]): string {
  if (groups.length === 0) {
    return "—";
  }

  const on = groups.filter((group) => group.default).length;

  return on === groups.length
    ? String(groups.length)
    : `${on} / ${groups.length}`;
}

/* --- карточка профиля ------------------------------------------------------- */

function RewriteProfileForm({
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
  const detail = useAppSelector((s) => s.pages.rewriteProfiles.detail);
  const denyResponses = useAppSelector((s) => s.pages.rewriteProfiles.denyResponses);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [doc, setDoc] = useState<RewriteProfileDoc>(emptyDoc);
  const [registry, setRegistry] = useState<ActionRegistry | null>(null);

  useEffect(() => {
    let alive = true;

    fetchActions()
      .then((reg) => {
        if (alive) {
          setRegistry(reg);
        }
      })
      .catch(() => {
        /* Пустой словарь -- осмысленное состояние, ронять страницу незачем. */
      });

    return () => {
      alive = false;
    };
  }, []);

  /* Реестр контура: из него окно сигнала выбирает отправителя. */
  const [inspectors, setInspectors] = useState<InspectorMeta[]>([]);

  useEffect(() => {
    let alive = true;

    fetchInspectors(scope)
      .then((rows) => {
        if (alive) {
          setInspectors(rows);
        }
      })
      .catch(() => {
        /* Селектор отправителя без реестра -- страница живёт. */
      });

    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    if (id === null || detail === null || detail.uuid !== id) {
      return;
    }

    setName(detail.name);
    setDescription(detail.description);
    setDoc({ ...emptyDoc(), ...detail.doc });
  }, [id, detail]);

  const loaded = id !== null && detail !== null && detail.uuid === id ? detail : null;
  const unknownSenders = loaded?.unknown_senders ?? [];
  const senderCodes = loaded?.sender_codes ?? [];

  const patch = (part: Partial<RewriteProfileDoc>) =>
    setDoc((prev) => ({ ...prev, ...part }));

  const nameOk = NAME_RE.test(name);

  const save = () => {
    void dispatch(
      saveRewriteProfileThunk({
        scope,
        id,
        name,
        description,
        doc: { ...doc, description },
      }),
    );
  };

  const isDefault = loaded?.name === "default";
  const banner = loaded?.modified === true ? t("profiles.defaultModified") : undefined;
  const restore =
    id === null
      ? undefined
      : () => {
          void dispatch(restoreRewriteProfileThunk({ scope, id }));
        };
  const [copyOpen, setCopyOpen] = useState(false);

  /*
   * Ответ отказа называется именем каталога: страницу печатает модуль, и имя
   * обязано в этом каталоге быть. Селектор -- из записей http; grpc и
   * websocket фазе ответа этого инспектора не отвечают.
   */
  const denyOptions: FilterOption<string>[] = denyResponses
    .filter((row) => row.type === "http")
    .map((row) => ({ value: row.name, label: row.name }));

  return (
    <Form id="rewrite-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("rewrite.newTitle") : t("rewrite.editTitle")}
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
          title={t("rewrite.sectionProfile")}
          hint={t("rewrite.sectionProfileHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("rewrite.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("rewrite.description")}
              value={description}
              onChange={setDescription}
            />
            {/*
              Подмена решена, но не состоялась: тело не доехало, обменник
              молчит, вышел срок. Инспектор тогда отказывает -- отдать оригинал
              значит отдать ровно то, что маскировали, -- и здесь называется
              запись каталога, которой он отказывает.
            */}
            <Pick
              select
              label={t("rewrite.denyResponse")}
              helper={t("rewrite.denyResponseHint")}
              value={doc.denyResponse}
              options={
                denyOptions.length > 0
                  ? denyOptions
                  : [{ value: doc.denyResponse, label: doc.denyResponse }]
              }
              onChange={(denyResponse) => patch({ denyResponse })}
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("rewrite.groups")}
          hint={t("rewrite.groupsHint")}
          flush
          defaultExpanded
        >
          <GroupsTable
            t={t}
            groups={doc.groups}
            onChange={(groups) => patch({ groups })}
          />
        </Section>

        <Section title={t("channel.signals")} hint={t("rewrite.priorHint")} flush>
          <SignalsBlock
            embedded
            hint={t("rewrite.priorHint")}
            rules={doc.prior.map((rule) => ({
              from: rule.from,
              accept: [...rule.accept],
              codes: [...rule.codes],
            }))}
            verbs={verbsFor(registry, "rewrite").map((verb) => ({
              value: verb,
              label: verbLabel(t, verb),
            }))}
            weakening={weakeningVerbs(registry)}
            codes={senderCodes}
            unknown={unknownSenders}
            senders={inspectors}
            defaultRule={() => ({
              from: "counter",
              accept: ["mutate"],
              codes: [],
            })}
            onChange={(prior) =>
              patch({
                prior: prior.map((rule) => ({
                  from: rule.from,
                  accept: rule.accept as RewritePriorRule["accept"],
                  codes: rule.codes,
                })),
              })
            }
          />
        </Section>

        {registry === null && <Alert severity="warning">{t("rewrite.noRegistry")}</Alert>}
      </Form.Body>
      <Form.Actions>
        {id !== null && (
          <Button
            startIcon={<ContentCopyOutlinedIcon />}
            onClick={() => setCopyOpen(true)}
          >
            {t("copyModal.button")}
          </Button>
        )}
        {id !== null && !isDefault && (
          <Button
            color="error"
            onClick={() => void dispatch(removeRewriteProfile({ scope, id }))}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!nameOk} onClick={save}>
          {t("common.save")}
        </Button>
      </Form.Actions>
      {copyOpen && (
        <CopyNameModal
          title={t("copyModal.profileTitle")}
          source={name.trim()}
          onClose={() => setCopyOpen(false)}
          onCopy={(next) => {
            void dispatch(
              saveRewriteProfileThunk({
                scope,
                id: null,
                name: next,
                description,
                doc: { ...doc, description },
              }),
            );
            setCopyOpen(false);
          }}
        />
      )}
    </Form>
  );
}

/* --- группы модификаторов --------------------------------------------------- */

/**
 * Строка -- группа: имя, включена ли сама, условия и счёт операций. Условия и
 * сами операции правятся в окне по шестерёнке: regex в ячейку не помещается, а
 * задают его один раз.
 */
function GroupsTable({
  t,
  groups,
  onChange,
}: {
  t: Translate;
  groups: RewriteGroup[];
  onChange: (next: RewriteGroup[]) => void;
}) {
  /* `{ index: null }` -- новая группа: строку заводит окно, а не «+». */
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);

  const patch = (index: number, part: Partial<RewriteGroup>) =>
    onChange(groups.map((row, i) => (i === index ? { ...row, ...part } : row)));

  /* Отправка окна: новая группа встаёт в конец, правка -- на своё место. */
  const apply = (group: RewriteGroup) => {
    if (editing === null) {
      return;
    }

    onChange(
      editing.index === null
        ? [...groups, group]
        : groups.map((row, i) => (i === editing.index ? group : row)),
    );
    setEditing(null);
  };

  const defaults: FilterOption<string>[] = [
    { value: "on", label: t("rewrite.defaultOn") },
    { value: "off", label: t("rewrite.defaultOff") },
  ];

  return (
    <>
      <TableBlock title={t("rewrite.groups")} label={t("rewrite.groupsBlockHint")} last>
        <Table size="small" sx={flushTableSx}>
          <TableHead>
            <TableRow>
              <HeadCell label={t("rewrite.groupName")} width={150} />
              <HeadCell
                label={t("rewrite.groupDefault")}
                help={t("rewrite.groupDefaultHint")}
                width={130}
              />
              <HeadCell label={t("rewrite.condCol")} help={t("rewrite.condHint")} />
              <HeadCell label={t("rewrite.opsCol")} width={110} />
              <TableCell align="right" sx={{ width: 76 }}>
                <TableIconButton
                  color="success"
                  icon={<AddIcon />}
                  tooltip={t("common.add")}
                  onClick={() => setEditing({ index: null })}
                />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.length === 0 && (
              <TableNoticeRow colSpan={5} kind="empty" message={t("rewrite.groupsEmpty")} />
            )}
            {groups.map((group, index) => (
              <TableRow key={index}>
                <FilterText
                  value={group.name}
                  placeholder="mask_pii"
                  mono
                  plain
                  width={150}
                  onChange={(name) => patch(index, { name: name.trim() })}
                />
                <FilterSelect
                  value={group.default ? "on" : "off"}
                  width={130}
                  options={defaults}
                  unset={group.default ? "on" : "off"}
                  onChange={(value) => patch(index, { default: value === "on" })}
                />
                <TableCell sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
                  {condSummary(t, group)}
                </TableCell>
                <TableCell sx={{ fontSize: "0.8rem" }}>
                  {opsSummary(t, group)}
                </TableCell>
                <TableCell align="right">
                  <TableIconButton
                    icon={<SettingsIcon sx={{ fontSize: 16 }} />}
                    tooltip={t("rewrite.groupDialog")}
                    onClick={() => setEditing({ index })}
                  />
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon />}
                    tooltip={t("common.delete")}
                    onClick={() => onChange(groups.filter((_row, i) => i !== index))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableBlock>
      {editing !== null && (
        <GroupDialog
          t={t}
          group={editing.index === null ? null : (groups[editing.index] ?? null)}
          blank={newGroup(groups.length + 1)}
          onClose={() => setEditing(null)}
          onSave={apply}
        />
      )}
    </>
  );
}

/** Условия строкой: пусто -- любой код и любой тип, и это надо сказать словом. */
function condSummary(t: Translate, group: RewriteGroup): string {
  const parts: string[] = [];

  // Кадровая группа: сторона и опкод вместо кода и типа.
  if (group.on === "frame") {
    parts.push(t("rewrite.frames"));
    parts.push(
      group.direction.length === 0
        ? t("rewrite.anyDirection")
        : group.direction.map((d) => t(`rewrite.directions.${d}`)).join(", "),
    );
    parts.push(
      (group.opcode.length === 0 ? ["text"] : group.opcode)
        .map((op) => t(`rewrite.opcodes.${op}`))
        .join(", "),
    );

    return parts.join(" · ");
  }

  parts.push(
    group.status.length === 0 ? t("rewrite.anyStatus") : group.status.join(", "),
  );

  if (group.contentType.length > 0) {
    parts.push(group.contentType.join(", "));
  } else {
    parts.push(t("rewrite.anyType"));
  }

  return parts.join(" · ");
}

function opsSummary(t: Translate, group: RewriteGroup): string {
  const parts: string[] = [];

  if (group.body.length > 0) {
    parts.push(`${t("rewrite.bodyShort")} ${group.body.length}`);
  }

  if (group.headers.length > 0) {
    parts.push(`${t("rewrite.headersShort")} ${group.headers.length}`);
  }

  return parts.length === 0 ? "—" : parts.join(", ");
}

/* --- окно группы ------------------------------------------------------------ */

/*
 * Подстановки условия: ходовые коды ответа. Остальное набирают руками --
 * поле свободное, парсер лишь отсекает то, чего не бывает на проводе.
 */
const STATUS_PRESETS = [
  "200", "201", "204", "206", "301", "302",
  "400", "401", "403", "404", "429", "500", "502", "503",
];

/** Код ответа -- целое от 100 до 599; «2xx» и прочие маски провод не знает. */
function parseStatus(raw: string): string | undefined {
  return /^[1-5]\d\d$/.test(raw) ? raw : undefined;
}

function GroupDialog({
  t,
  group,
  blank,
  onClose,
  onSave,
}: {
  t: Translate;
  /** `null` -- новая группа: в таблице её ещё нет, заводит её «Добавить». */
  group: RewriteGroup | null;
  blank: RewriteGroup;
  onClose: () => void;
  onSave: (next: RewriteGroup) => void;
}) {
  const fresh = group === null;
  const [draft, setDraft] = useState<RewriteGroup>(group ?? blank);

  const patch = (part: Partial<RewriteGroup>) =>
    setDraft((prev) => ({ ...prev, ...part }));

  /*
   * Группа обязана что-то менять, а операция -- быть заполненной: пустое
   * выражение и заголовок без имени контроллер отвергнет. Ловить это надо
   * здесь, а не сырой ошибкой после «Сохранить» на карточке профиля.
   */
  const bodyOk = draft.body.every(
    (op) =>
      op.pattern.trim() !== "" &&
      (op.op === "insert_before" || op.op === "insert_after"
        ? op.text !== ""
        : true),
  );
  const headersOk = draft.headers.every((op) => op.name.trim() !== "");
  const frame = draft.on === "frame";
  const canSave =
    NAME_RE.test(draft.name) &&
    draft.body.length + (frame ? 0 : draft.headers.length) > 0 &&
    bodyOk &&
    (frame || headersOk);

  /*
   * Точка применения меняет и условия, и набор операций: у кадра нет ни
   * кода ответа, ни типа, ни заголовков. Чужие поля снимаются при
   * переключении -- контроллер их отвергнет, а показывать нечего.
   */
  const setOn = (on: RewriteGroup["on"]) =>
    setDraft((prev) =>
      on === "frame"
        ? { ...prev, on, status: [], contentType: [], headers: [] }
        : { ...prev, on, direction: [], opcode: [] },
    );

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      size="md"
      title={fresh ? t("rewrite.groupNewDialog") : t("rewrite.groupDialog")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!canSave} onClick={() => onSave(draft)}>
            {fresh ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <SettingsTable aside={false}>
        <Text
          label={t("rewrite.groupName")}
          helper={t("rewrite.groupNameHint")}
          value={draft.name}
          mono
          onChange={(name) => patch({ name: name.trim() })}
        />
        {/* Состояние, а не тумблер: у группы два названных положения, и просьба
            соседа их же и переставляет -- селектор говорит это прямо. */}
        <Pick
          select
          label={t("rewrite.groupDefault")}
          helper={t("rewrite.groupDefaultHint")}
          value={draft.default ? "on" : "off"}
          options={[
            { value: "on", label: t("rewrite.defaultOn") },
            { value: "off", label: t("rewrite.defaultOff") },
          ]}
          onChange={(value) => patch({ default: value === "on" })}
        />
        <Pick
          select
          label={t("rewrite.groupOn")}
          helper={t("rewrite.groupOnHint")}
          value={draft.on}
          options={[
            { value: "response", label: t("rewrite.groupOns.response") },
            { value: "frame", label: t("rewrite.groupOns.frame") },
          ]}
          onChange={(value) => setOn(value === "frame" ? "frame" : "response")}
        />
        {frame ? (
          <>
            <Chips
              t={t}
              label={t("rewrite.direction")}
              helper={t("rewrite.directionHint")}
              value={draft.direction}
              options={[...DIRECTIONS]}
              placeholder={t("rewrite.anyDirection")}
              onChange={(value) => patch({ direction: value ?? [] })}
            />
            <Chips
              t={t}
              label={t("rewrite.opcode")}
              helper={t("rewrite.opcodeHint")}
              value={draft.opcode}
              options={[...OPCODES]}
              placeholder={t("rewrite.opcodes.text")}
              onChange={(value) => patch({ opcode: value ?? [] })}
            />
          </>
        ) : (
          <>
            <Chips
              t={t}
              freeSolo
              label={t("rewrite.status")}
              helper={t("rewrite.statusHint")}
              value={draft.status.map(String)}
              options={STATUS_PRESETS}
              parse={parseStatus}
              placeholder={t("rewrite.anyStatus")}
              onChange={(value) => patch({ status: (value ?? []).map(Number) })}
            />
            <Chips
              t={t}
              freeSolo
              label={t("rewrite.contentType")}
              helper={t("rewrite.contentTypeHint")}
              value={draft.contentType}
              placeholder={t("rewrite.anyType")}
              onChange={(value) => patch({ contentType: value ?? [] })}
            />
          </>
        )}
      </SettingsTable>
      <BodyOpsTable
        t={t}
        rows={draft.body}
        onChange={(body) => patch({ body })}
      />
      {!frame && (
        <HeaderOpsTable
          t={t}
          rows={draft.headers}
          onChange={(headers) => patch({ headers })}
        />
      )}
    </Modal>
  );
}

/**
 * Операции над телом. Выражения исполняет Go (RE2), поэтому здесь их только
 * записывают; отбраковку делает контроллер на сохранении профиля, а
 * окончательную -- загрузчик инспектора.
 */
function BodyOpsTable({
  t,
  rows,
  onChange,
}: {
  t: Translate;
  rows: RewriteBodyOp[];
  onChange: (next: RewriteBodyOp[]) => void;
}) {
  const patch = (index: number, part: Partial<RewriteBodyOp>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...part } : row)));

  const kinds: FilterOption<RewriteBodyOpKind>[] = [
    { value: "replace", label: t("rewrite.ops.replace") },
    { value: "remove", label: t("rewrite.ops.remove") },
    { value: "insert_before", label: t("rewrite.ops.insert_before") },
    { value: "insert_after", label: t("rewrite.ops.insert_after") },
  ];

  return (
    <TableBlock title={t("rewrite.bodyOps")} label={t("rewrite.bodyOpsHint")}>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("rewrite.op")} width={150} />
            <HeadCell label={t("rewrite.pattern")} help={t("rewrite.patternHint")} />
            <HeadCell label={t("rewrite.replacement")} help={t("rewrite.replacementHint")} />
            <HeadCell
              label={t("rewrite.maxMatches")}
              help={t("rewrite.maxMatchesHint")}
              width={90}
            />
            <TableCell align="right" sx={{ width: 44 }}>
              <TableIconButton
                color="success"
                icon={<AddIcon />}
                tooltip={t("common.add")}
                onClick={() => onChange([...rows, newBodyOp()])}
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={5} kind="empty" message={t("rewrite.bodyEmpty")} />
          )}
          {rows.map((row, index) => (
            <TableRow key={index}>
              <FilterSelect
                value={row.op}
                width={150}
                options={kinds}
                unset={row.op}
                onChange={(op) =>
                  patch(index, {
                    op,
                    /* Чужое поле у нового глагола -- отказ сохранения: to
                       живёт только у replace, text только у вставок. */
                    to: op === "replace" ? row.to : "",
                    text: op === "replace" || op === "remove" ? "" : row.text,
                  })
                }
              />
              <LongTextCell
                value={row.pattern}
                placeholder="debug-token=[a-z0-9]+"
                title={t("rewrite.pattern")}
                hint={t("rewrite.patternHint")}
                onChange={(pattern) => patch(index, { pattern })}
              />
              {/*
                Одна колонка на два разных поля: у replace это шаблон замены с
                $1..$9, у вставок -- литеральный текст. Две колонки, из которых
                в каждой строке пуста одна, читались бы хуже.
              */}
              <LongTextCell
                value={row.op === "replace" ? row.to : row.text}
                placeholder={row.op === "remove" ? "—" : "$1********$2"}
                title={t("rewrite.replacement")}
                hint={t("rewrite.replacementHint")}
                disabled={row.op === "remove"}
                onChange={(value) =>
                  patch(
                    index,
                    row.op === "replace" ? { to: value } : { text: value },
                  )
                }
              />
              <DraftCell
                value={row.maxMatches === null ? "" : String(row.maxMatches)}
                placeholder="256"
                width={90}
                onChange={(raw) => {
                  const parsed = Number.parseInt(raw.trim(), 10);

                  patch(index, {
                    maxMatches: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
                  });
                }}
              />
              <TableCell align="right">
                <TableIconButton
                  color="error"
                  icon={<DeleteIcon />}
                  tooltip={t("common.delete")}
                  onClick={() => onChange(rows.filter((_row, i) => i !== index))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableBlock>
  );
}

/**
 * Операции над заголовками ответа. Запретный список (длина, кодировка, Host,
 * Set-Cookie у set) проверяет контроллер: он же зеркалит запреты модуля.
 */
function HeaderOpsTable({
  t,
  rows,
  onChange,
}: {
  t: Translate;
  rows: RewriteHeaderOp[];
  onChange: (next: RewriteHeaderOp[]) => void;
}) {
  const patch = (index: number, part: Partial<RewriteHeaderOp>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...part } : row)));

  const kinds: FilterOption<RewriteHeaderOp["op"]>[] = [
    { value: "set", label: t("rewrite.headerSet") },
    { value: "unset", label: t("rewrite.headerUnset") },
  ];

  return (
    <TableBlock title={t("rewrite.headerOps")} label={t("rewrite.headerOpsHint")} last>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("rewrite.op")} width={150} />
            <HeadCell label={t("rewrite.headerName")} width={200} />
            <HeadCell label={t("rewrite.headerValue")} />
            <TableCell align="right" sx={{ width: 44 }}>
              <TableIconButton
                color="success"
                icon={<AddIcon />}
                tooltip={t("common.add")}
                onClick={() => onChange([...rows, newHeaderOp()])}
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={4} kind="empty" message={t("rewrite.headersEmpty")} />
          )}
          {rows.map((row, index) => (
            <TableRow key={index}>
              <FilterSelect
                value={row.op}
                width={150}
                options={kinds}
                unset={row.op}
                onChange={(op) =>
                  patch(index, { op, value: op === "unset" ? "" : row.value })
                }
              />
              <DraftCell
                value={row.name}
                placeholder="X-Frame-Options"
                mono
                width={200}
                onChange={(name) => patch(index, { name: name.trim() })}
              />
              <LongTextCell
                value={row.value}
                placeholder={row.op === "unset" ? "—" : "DENY"}
                title={t("rewrite.headerValue")}
                disabled={row.op === "unset"}
                onChange={(value) => patch(index, { value })}
              />
              <TableCell align="right">
                <TableIconButton
                  color="error"
                  icon={<DeleteIcon />}
                  tooltip={t("common.delete")}
                  onClick={() => onChange(rows.filter((_row, i) => i !== index))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableBlock>
  );
}
