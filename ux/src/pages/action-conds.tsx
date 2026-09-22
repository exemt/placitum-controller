import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import { TableIconButton, TableNoticeRow, type FilterOption } from "../components/data-table/index.ts";
import { DialogAlert, DialogFrame, DialogPick, type DialogOption } from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import { AddCell, RowActions, TextCell } from "../components/rules-table.tsx";
import { flushTableSx, HeadCell, TableBlock } from "../components/table-block.tsx";
import { VariableEdit, type VariableCatalog } from "../config/VariableEdit.tsx";
import type {
  ActionCondition,
  ActionCondOp,
  ActionWhenGroup,
  ActionWhenItem,
  Dataset,
} from "../api.ts";
import type { Translate } from "../i18n/index.ts";

export const ACTION_CONDS_HELP = "06-action#условия";

export const ACTION_CATALOG: VariableCatalog = {
  address: [{ name: "$remote_addr", hint: "адрес клиента" }],
  known: [
    { name: "$uri", hint: "путь без строки запроса" },
    { name: "$request_uri", hint: "путь со строкой запроса" },
    { name: "$host", hint: "имя хоста запроса" },
    { name: "$request_method", hint: "метод" },
    { name: "$scheme", hint: "http или https" },
    { name: "$http_user_agent", hint: "User-Agent" },
    { name: "$http_referer", hint: "Referer" },
  ],
  parsers: [
    { id: "http", prefix: "$http_", label: "заголовок", sample: "X-Api-Key", raw: false },
    { id: "cookie", prefix: "$cookie_", label: "cookie", sample: "session", raw: false },
    { id: "arg", prefix: "$arg_", label: "аргумент", sample: "token", raw: false },
    {
      id: "sel_headers",
      prefix: "$waf_request_headers.",
      label: "заголовок: все значения",
      sample: "x-api-key",
      raw: true,
    },
    {
      id: "sel_cookies",
      prefix: "$waf_request_cookies.",
      label: "cookie: все значения",
      sample: "sid",
      raw: true,
    },
    {
      id: "sel_args",
      prefix: "$waf_request_args.",
      label: "аргумент: все значения",
      sample: "token",
      raw: true,
    },
    { id: "var", prefix: "$waf_var.", label: "поле запроса (vars)", sample: "ja3", raw: true },
  ],
};

export const COND_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;

/* rule-N and rule-N.M name a rule's When in the printed profile. */
const COND_RESERVED_RE = /^rule-[0-9]+(\.[0-9]+)?$/;

const OPS: readonly ActionCondOp[] = ["eq", "ne", "in", "not_in"];

export function opTakesDataset(op: ActionCondOp): boolean {
  return op === "in" || op === "not_in";
}

export function opLabel(op: ActionCondOp): string {
  switch (op) {
    case "in":
      return "in";
    case "not_in":
      return "not in";
    case "eq":
      return "=";
    case "ne":
      return "≠";
  }
}

export function checkSummary(cond: ActionCondition): string {
  const operand = opTakesDataset(cond.op) ? cond.dataset : JSON.stringify(cond.text);

  return `${cond.value} ${opLabel(cond.op)} ${operand}`;
}

export function conditionReady(cond: ActionCondition): boolean {
  if (cond.value.trim() === "") {
    return false;
  }

  return opTakesDataset(cond.op) ? cond.dataset !== "" : cond.text !== "";
}

export function whenSummary(t: Translate, groups: ActionWhenGroup[]): string {
  if (groups.length === 0) {
    return t("actionProfiles.whenAlways");
  }

  const and = ` ${t("actionProfiles.condAnd")} `;
  const or = ` ${t("actionProfiles.condOr")} `;
  const item = (row: ActionWhenItem) =>
    row.not ? t("actionProfiles.whenNot", { name: row.cond }) : row.cond;

  return groups
    .map((group) => {
      const text = group.map(item).join(and);

      return groups.length > 1 && group.length > 1 ? `(${text})` : text;
    })
    .join(or);
}

export function whenUses(groups: ActionWhenGroup[], name: string): boolean {
  return groups.some((group) => group.some((row) => row.cond === name));
}

export function whenRename(
  groups: ActionWhenGroup[],
  from: string,
  to: string,
): ActionWhenGroup[] {
  return groups.map((group) =>
    group.map((row) => (row.cond === from ? { ...row, cond: to } : row)),
  );
}

export function whenReady(groups: ActionWhenGroup[]): boolean {
  return (
    groups.length > 0 &&
    groups.every((group) => group.length > 0 && group.every((row) => row.cond !== ""))
  );
}

export function ConditionsTable({
  t,
  conditions,
  onAdd,
  onEdit,
  onRemove,
}: {
  t: Translate;
  conditions: ActionCondition[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <TableBlock last>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("actionProfiles.condName")} width={180} />
            <HeadCell label={t("actionProfiles.condCol")} />
            <AddCell label={t("actionProfiles.addCondition")} onAdd={onAdd} />
          </TableRow>
        </TableHead>
        <TableBody>
          {conditions.length === 0 && (
            <TableNoticeRow
              colSpan={3}
              kind="empty"
              message={t("actionProfiles.conditionsEmpty")}
            />
          )}
          {conditions.map((cond, index) => (
            <TableRow key={index} hover>
              <TextCell text={cond.name} />
              <TextCell text={checkSummary(cond)} muted />
              <RowActions onEdit={() => onEdit(index)} onRemove={() => onRemove(index)} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableBlock>
  );
}

const NEW_CONDITION: ActionCondition = { name: "", value: "$uri", op: "eq", dataset: "", text: "" };

export function ConditionDialog({
  t,
  cond,
  taken,
  datasets,
  help = ACTION_CONDS_HELP,
  onClose,
  onSave,
}: {
  t: Translate;
  cond: ActionCondition | null;
  taken: string[];
  datasets: Dataset[];
  help?: string;
  onClose: () => void;
  onSave: (next: ActionCondition) => void;
}) {
  const [draft, setDraft] = useState<ActionCondition>(cond ?? NEW_CONDITION);

  const names = datasets.map((row) => row.name);
  const name = draft.name.trim();
  const nameTaken = taken.includes(name);
  const nameReserved = COND_RESERVED_RE.test(name);
  const nameOk = COND_NAME_RE.test(name) && !nameTaken && !nameReserved;
  const withDataset = opTakesDataset(draft.op);
  const dataset = datasets.find((row) => row.name === draft.dataset);
  const ready = nameOk && conditionReady(draft);

  const opOptions: FilterOption<ActionCondOp>[] = OPS.map((op) => ({ value: op, label: opLabel(op) }));

  /* A check compares with a dynamic list (the inspector mirrors it) and with a static one (it comes with the generation). */
  const datasetOptions: DialogOption<string>[] = [
    { value: "", label: names.length === 0 ? t("actionProfiles.condNoLists") : t("cond.pickList") },
    ...datasets.map((row) => ({
      value: row.name,
      label: row.name,
      tag: t(row.active ? "datasets.dynamic" : "datasets.static"),
    })),
  ];

  if (draft.dataset !== "" && !names.includes(draft.dataset)) {
    datasetOptions.push({
      value: draft.dataset,
      label: `${draft.dataset} — ${t("actionProfiles.condNoDataset")}`,
    });
  }

  const blocker = (): string => {
    if (name === "") {
      return t("actionProfiles.condNeedName");
    }

    if (!nameOk) {
      return t("actionProfiles.condFixName");
    }

    if (draft.value.trim() === "") {
      return t("actionProfiles.condNeedValue");
    }

    if (!withDataset) {
      return t("actionProfiles.condNeedText");
    }

    return names.length === 0 ? t("actionProfiles.condNoListsFix") : t("actionProfiles.condNeedList");
  };

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title={cond === null ? t("actionProfiles.addCondition") : t("actionProfiles.editCondition")}
      hint={t("actionProfiles.condPurpose")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!ready}
            onClick={() =>
              onSave({
                name,
                value: draft.value.trim(),
                op: draft.op,
                dataset: withDataset ? draft.dataset : "",
                text: withDataset ? "" : draft.text,
              })
            }
          >
            {cond === null ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={2}>
        <DialogAlert text={t("actionProfiles.condAlert")} help={help} />
        <TextField
          size="small"
          label={t("actionProfiles.condName")}
          value={draft.name}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          required
          error={draft.name !== "" && !nameOk}
          helperText={
            name === "" || nameOk
              ? t("actionProfiles.condNameHint")
              : nameTaken
                ? t("actionProfiles.condNameTaken")
                : nameReserved
                  ? t("actionProfiles.condNameReserved")
                  : t("actionProfiles.condNameBad")
          }
        />
        <DialogFrame label={t("cond.value")} hint={t("cond.valueHint")}>
          <VariableEdit
            value={draft.value}
            catalog={ACTION_CATALOG}
            datasetType={withDataset ? dataset?.type : undefined}
            onChange={(value) => setDraft((prev) => ({ ...prev, value }))}
          />
        </DialogFrame>
        <DialogPick
          mono
          label={t("actionProfiles.clauseOp")}
          hint={t("actionProfiles.clauseOpHint")}
          value={draft.op}
          options={opOptions}
          onChange={(op) => setDraft((prev) => ({ ...prev, op }))}
        />
        {withDataset ? (
          <DialogPick
            mono
            label={t("actionProfiles.clauseList")}
            hint={t("actionProfiles.clauseListHint")}
            value={draft.dataset}
            options={datasetOptions}
            onChange={(next) => setDraft((prev) => ({ ...prev, dataset: next }))}
          />
        ) : (
          <TextField
            size="small"
            label={t("actionProfiles.clauseTextLabel")}
            placeholder="/logout"
            value={draft.text}
            helperText={t("actionProfiles.clauseTextHint")}
            onChange={(e) => {
              const text = e.target.value;

              setDraft((prev) => ({ ...prev, text }));
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
        {!ready && (
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {cond === null
              ? t("common.blockedAdd", { what: blocker() })
              : t("common.blockedSave", { what: blocker() })}
          </Typography>
        )}
      </Stack>
    </Modal>
  );
}

const NEW_ITEM: ActionWhenItem = { cond: "", not: false };

/* Not a condition name: + is outside COND_NAME_RE. */
const NEW_KEY = "+new";

const connectorSx = {
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: 0.4,
  color: "text.secondary",
} as const;

/*
 * A rule's When as groups: conditions inside a group hold together (AND), and one group is enough
 * (OR). Each row is a condition of the profile with "if" or "if not". With onAddCondition set, the
 * list of a row also offers a new condition: it is added to the profile and put into the row.
 */
export function WhenGroups({
  t,
  groups,
  conditions,
  datasets,
  onChange,
  onAddCondition,
}: {
  t: Translate;
  groups: ActionWhenGroup[];
  conditions: ActionCondition[];
  datasets: Dataset[];
  onChange: (next: ActionWhenGroup[]) => void;
  onAddCondition?: (cond: ActionCondition) => void;
}) {
  const [creating, setCreating] = useState<{ group: number; item: number } | null>(null);
  const names = conditions.map((cond) => cond.name);

  const patch = (group: number, item: number, next: Partial<ActionWhenItem>) =>
    onChange(
      groups.map((rows, g) =>
        g !== group ? rows : rows.map((row, i) => (i === item ? { ...row, ...next } : row)),
      ),
    );

  const remove = (group: number, item: number) =>
    onChange(
      groups
        .map((rows, g) => (g !== group ? rows : rows.filter((_row, i) => i !== item)))
        .filter((rows) => rows.length > 0),
    );

  return (
    <Stack spacing={1}>
      {groups.map((rows, g) => (
        <Fragment key={g}>
          {g > 0 && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 12, borderTop: 1, borderColor: "divider" }} />
              <Typography sx={connectorSx}>{t("actionProfiles.whenOr")}</Typography>
              <Box sx={{ flex: 1, borderTop: 1, borderColor: "divider" }} />
            </Stack>
          )}
          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.default",
              p: 1,
            }}
          >
            <Stack spacing={1}>
              {rows.map((row, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography sx={{ ...connectorSx, width: 22, flexShrink: 0 }}>
                    {i === 0 ? "" : t("actionProfiles.whenAnd")}
                  </Typography>
                  <TextField
                    select
                    size="small"
                    value={row.not ? "not" : "is"}
                    onChange={(e) => patch(g, i, { not: e.target.value === "not" })}
                    sx={{ width: 118, flexShrink: 0 }}
                    slotProps={{ htmlInput: { "aria-label": t("actionProfiles.whenSign") } }}
                  >
                    <MenuItem value="is">{t("actionProfiles.whenIs")}</MenuItem>
                    <MenuItem value="not">{t("actionProfiles.whenIsNot")}</MenuItem>
                  </TextField>
                  <TextField
                    select
                    size="small"
                    value={row.cond}
                    error={row.cond === ""}
                    onChange={(e) => {
                      if (e.target.value === NEW_KEY) {
                        setCreating({ group: g, item: i });

                        return;
                      }

                      patch(g, i, { cond: e.target.value });
                    }}
                    sx={{ flex: 1, minWidth: 0 }}
                    slotProps={{
                      select: {
                        displayEmpty: true,
                        renderValue: (value) =>
                          value === "" ? (
                            <Box component="span" sx={{ color: "text.disabled" }}>
                              {t("actionProfiles.whenPick")}
                            </Box>
                          ) : (
                            String(value)
                          ),
                      },
                      htmlInput: { "aria-label": t("actionProfiles.condCol") },
                    }}
                  >
                    {conditions.map((cond) => (
                      <MenuItem key={cond.name} value={cond.name}>
                        <Box component="span" sx={{ fontWeight: 600 }}>
                          {cond.name}
                        </Box>
                        <Box
                          component="span"
                          sx={{ ml: 1, color: "text.secondary", fontSize: "0.72rem" }}
                        >
                          {checkSummary(cond)}
                        </Box>
                      </MenuItem>
                    ))}
                    {row.cond !== "" && !names.includes(row.cond) && (
                      <MenuItem value={row.cond}>
                        {row.cond} — {t("actionProfiles.whenGone")}
                      </MenuItem>
                    )}
                    {conditions.length === 0 && onAddCondition === undefined && (
                      <MenuItem disabled value="">
                        {t("actionProfiles.conditionsEmptyShort")}
                      </MenuItem>
                    )}
                    {onAddCondition !== undefined && (
                      <MenuItem value={NEW_KEY} sx={{ color: "primary.main" }}>
                        {t("actionProfiles.whenNewCondition")}
                      </MenuItem>
                    )}
                  </TextField>
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon />}
                    tooltip={t("actionProfiles.whenRemove")}
                    onClick={() => remove(g, i)}
                  />
                </Stack>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                title={t("actionProfiles.whenAddAndHint")}
                onClick={() =>
                  onChange(groups.map((other, j) => (j === g ? [...other, NEW_ITEM] : other)))
                }
                sx={{ alignSelf: "flex-start", minWidth: 0 }}
              >
                {t("actionProfiles.whenAnd")}
              </Button>
            </Stack>
          </Box>
        </Fragment>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        title={t("actionProfiles.whenAddOrHint")}
        onClick={() => onChange([...groups, [NEW_ITEM]])}
        sx={{ alignSelf: "flex-start", minWidth: 0 }}
      >
        {t("actionProfiles.whenOr")}
      </Button>
      {creating !== null && onAddCondition !== undefined && (
        <ConditionDialog
          t={t}
          cond={null}
          taken={names}
          datasets={datasets}
          onClose={() => setCreating(null)}
          onSave={(next) => {
            onAddCondition(next);
            patch(creating.group, creating.item, { cond: next.name });
            setCreating(null);
          }}
        />
      )}
    </Stack>
  );
}
