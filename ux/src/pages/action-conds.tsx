import { useState } from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import {
  FilterCell,
  FilterSelect,
  TableIconButton,
  TableNoticeRow,
  type FilterOption,
} from "../components/data-table/index.ts";
import { DialogAlert } from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import { AddCell, RowActions, TextCell } from "../components/rules-table.tsx";
import { flushTableSx, HeadCell, TableBlock } from "../components/table-block.tsx";
import { VariableEdit, type VariableCatalog } from "../config/VariableEdit.tsx";
import type { ActionClause, ActionCondition, ActionCondOp, Dataset } from "../api.ts";
import type { Translate } from "../i18n/index.ts";

/**
 * Условия профиля инспектора действий.
 *
 * То же, что «Когда звать» у вызова инспектора на маршруте (config/CondDialog),
 * только считает их сам инспектор, а не модуль, поэтому сравнивать умеет и с
 * текстом, а значения берёт из своего сообщения: путь, метод, хост и адрес --
 * инлайном, заголовки, куки и аргументы -- из обменника, поля `vars` --
 * секцией. Условие именованное: правила ссылаются на него по имени, и одно
 * условие годится нескольким просьбам -- «если А» одной, «если не А» другой.
 *
 * Строки условия складываются по И либо по ИЛИ -- режим у условия целиком.
 * Строкой бывает и ссылка на другое условие («истинно» / «ложно»): так И
 * внутри ИЛИ и любая глубина набираются плоскими именованными условиями, без
 * дерева в окне. Циклы ссылок отбраковывает контроллер.
 *
 * Здесь два куска. [ConditionsTable] -- строка на условие в секции профиля:
 * имя и строки словами через «и» / «или». [ConditionDialog] -- окно одного
 * условия: имя, режим и таблица строк `<значение | условие> <сравнение>
 * <набор | текст>`. Ручки `if` у строки нет: таблица целиком и есть условие,
 * и слово повторяло бы заголовок окна. Редактор значения общий с условиями маршрута
 * (VariableEdit), каталог -- свой: у инспектора нет `$binary_remote_addr` и
 * `$ssl_client_s_dn`, зато есть поля сообщения.
 */

/** Раздел справки: «Автодействия» -> «Условия». */
export const ACTION_CONDS_HELP = "06-action#условия";

/**
 * Каталог значений инспектора. Готовые -- поля сообщения (`$remote_addr` --
 * адрес клиента, единственное, с чем сравним набор адресов) и два заголовка,
 * которые модуль везёт в vars и без снимка. Разборы -- как у модуля, плюс
 * `$waf_var.<имя>`: поле секции vars (стандартный набор модуля и waf_var).
 */
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

export function opTakesDataset(op: ActionCondOp): boolean {
  return op === "in" || op === "not_in";
}

/** Строка-ссылка: другое условие истинно / ложно. */
export function opIsRef(op: ActionCondOp): boolean {
  return op === "is" || op === "is_not";
}

/** Сравнение словами: `in`, `not in`, `=`, `≠`; у ссылки -- истинно / ложно. */
export function opLabel(t: Translate, op: ActionCondOp): string {
  switch (op) {
    case "in":
      return "in";
    case "not_in":
      return "not in";
    case "eq":
      return "=";
    case "ne":
      return "≠";
    case "is":
      return t("actionProfiles.opIs");
    case "is_not":
      return t("actionProfiles.opIsNot");
  }
}

/** Строка условия одной фразой: `$http_x_api_key in api_keys`, `$uri = "/x"`, `trusted истинно`. */
export function clauseSummary(t: Translate, clause: ActionClause): string {
  if (opIsRef(clause.op)) {
    return `${clause.cond} ${opLabel(t, clause.op)}`;
  }

  const operand = opTakesDataset(clause.op) ? clause.dataset : JSON.stringify(clause.text);

  return `${clause.value} ${opLabel(t, clause.op)} ${operand}`;
}

/** Условие целиком: строки через «и» либо «или». */
export function conditionSummary(t: Translate, cond: ActionCondition): string {
  const glue = t(cond.any ? "actionProfiles.condOr" : "actionProfiles.condAnd");

  return cond.rows.map((clause) => clauseSummary(t, clause)).join(` ${glue} `);
}

/** «Когда» у правила: всегда, если А, если не А. */
export function whenLabel(t: Translate, cond: string, negate: boolean): string {
  if (cond === "") {
    return t("actionProfiles.whenAlways");
  }

  return t(negate ? "actionProfiles.whenUnless" : "actionProfiles.whenIf", { name: cond });
}

/** Готовая строка: значение, сравнение и набор либо текст; у ссылки -- имя условия. */
export function clauseReady(clause: ActionClause): boolean {
  if (opIsRef(clause.op)) {
    return clause.cond !== "";
  }

  if (clause.value.trim() === "") {
    return false;
  }

  return opTakesDataset(clause.op) ? clause.dataset !== "" : clause.text !== "";
}

/** Кто ссылается на условие с этим именем: строки других условий. */
export function refsTo(conditions: ActionCondition[], name: string): number {
  let n = 0;

  for (const cond of conditions) {
    for (const clause of cond.rows) {
      if (opIsRef(clause.op) && clause.cond === name) {
        n += 1;
      }
    }
  }

  return n;
}

/* --- таблица условий профиля ---------------------------------------------- */

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
    <TableBlock
      title={t("actionProfiles.sectionConditions")}
      label={t("actionProfiles.conditionsHint")}
      last
    >
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
              <TextCell text={conditionSummary(t, cond)} muted />
              <RowActions onEdit={() => onEdit(index)} onRemove={() => onRemove(index)} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableBlock>
  );
}

/* --- окно условия ------------------------------------------------------------ */

const NEW_CLAUSE: ActionClause = { value: "$uri", op: "in", dataset: "", text: "", cond: "" };
const NEW_REF: ActionClause = { value: "", op: "is", dataset: "", text: "", cond: "" };

const ACTIONS_W = 56;

const frameSx = {
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  bgcolor: "background.default",
  overflow: "hidden",
} as const;

const inputSx = {
  fontSize: "0.78rem",
  width: "100%",
  "& input": { p: 0 },
} as const;

function ActionCell({
  color,
  icon,
  tooltip,
  onClick,
}: {
  color: "success" | "error";
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <FilterCell width={ACTIONS_W}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <TableIconButton color={color} icon={icon} tooltip={tooltip} onClick={onClick} />
      </Box>
    </FilterCell>
  );
}

type RowKind = "value" | "cond";

/**
 * Таблица строк условия: ручка `if`, род строки (значение либо условие),
 * значение или имя условия, сравнение, набор либо текст. Набор -- только
 * активный список пространства: только такие держит keeper, и только такие
 * видит зеркало инспектора. Условие -- любое другое условие профиля, кроме
 * себя самого.
 */
function ClausesTable({
  t,
  clauses,
  datasets,
  others,
  onChange,
}: {
  t: Translate;
  clauses: ActionClause[];
  datasets: Dataset[];
  /** Имена остальных условий профиля -- для строк-ссылок. */
  others: string[];
  onChange: (next: ActionClause[]) => void;
}) {
  const names = datasets.map((row) => row.name);

  const kindOptions: FilterOption<RowKind>[] = [
    { value: "value", label: t("actionProfiles.clauseKindValue") },
    { value: "cond", label: t("actionProfiles.clauseKindCond") },
  ];

  const valueOps: FilterOption<ActionCondOp>[] = (["in", "not_in", "eq", "ne"] as const).map(
    (op) => ({ value: op, label: opLabel(t, op) }),
  );
  const refOps: FilterOption<ActionCondOp>[] = (["is", "is_not"] as const).map((op) => ({
    value: op,
    label: opLabel(t, op),
  }));

  const datasetOptions = (current: string): FilterOption<string>[] => {
    const options: FilterOption<string>[] = [{ value: "", label: t("cond.pickList") }];

    for (const name of names) {
      options.push({ value: name, label: name });
    }

    /* Имя из документа, которого в каталоге нет, не выбрасываем: иначе поле
       показывало бы пустоту там, где в базе ссылка. */
    if (current !== "" && !names.includes(current)) {
      options.push({ value: current, label: `${current} — ${t("actionProfiles.condNoDataset")}` });
    }

    return options;
  };

  const condOptions = (current: string): FilterOption<string>[] => {
    const options: FilterOption<string>[] = [{ value: "", label: t("actionProfiles.condRefPick") }];

    for (const name of others) {
      options.push({ value: name, label: name });
    }

    if (current !== "" && !others.includes(current)) {
      options.push({ value: current, label: `${current} — ${t("actionProfiles.condRefGone")}` });
    }

    return options;
  };

  const patch = (index: number, edit: (row: ActionClause) => void) =>
    onChange(
      clauses.map((item, i) => {
        if (i !== index) {
          return item;
        }

        const next = { ...item };

        edit(next);

        return next;
      }),
    );

  return (
    <Box sx={{ ...frameSx, overflowX: "auto", overflowY: "hidden" }}>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label="" width={96} />
            <HeadCell label={t("cond.value")} />
            <HeadCell label="" width={96} />
            <HeadCell label={t("actionProfiles.clauseOperand")} width={160} />
            <ActionCell
              color="success"
              icon={<AddIcon />}
              tooltip={t("actionProfiles.addClause")}
              onClick={() => onChange([...clauses, NEW_CLAUSE])}
            />
          </TableRow>
        </TableHead>
        <TableBody>
          {clauses.length === 0 && (
            <TableNoticeRow colSpan={5} kind="empty" message={t("actionProfiles.clausesEmpty")} />
          )}
          {clauses.map((clause, index) => {
            const ref = opIsRef(clause.op);
            const withDataset = opTakesDataset(clause.op);
            const dataset = datasets.find((row) => row.name === clause.dataset);

            return (
              <TableRow key={index}>
                <FilterSelect
                  value={ref ? "cond" : "value"}
                  width={96}
                  options={kindOptions}
                  unset="value"
                  onChange={(kind) =>
                    patch(index, (next) => {
                      /* Сменили род строки -- чужие поля не тащим. */
                      Object.assign(next, kind === "cond" ? NEW_REF : NEW_CLAUSE);
                    })
                  }
                />
                {ref ? (
                  <FilterSelect
                    value={clause.cond}
                    minWidth={160}
                    options={condOptions(clause.cond)}
                    unset=""
                    onChange={(name) =>
                      patch(index, (next) => {
                        next.cond = name;
                      })
                    }
                  />
                ) : (
                  <FilterCell active={clause.value !== ""} grow>
                    <VariableEdit
                      value={clause.value}
                      catalog={ACTION_CATALOG}
                      datasetType={withDataset ? dataset?.type : undefined}
                      onChange={(value) =>
                        patch(index, (next) => {
                          next.value = value;
                        })
                      }
                    />
                  </FilterCell>
                )}
                <FilterSelect
                  value={clause.op}
                  width={96}
                  options={ref ? refOps : valueOps}
                  unset={ref ? "is" : "in"}
                  onChange={(op) =>
                    patch(index, (next) => {
                      next.op = op;

                      /* Сменили род сравнения -- чужой операнд не тащим. */
                      if (opTakesDataset(op)) {
                        next.text = "";
                      } else {
                        next.dataset = "";
                      }
                    })
                  }
                />
                {ref ? (
                  <FilterCell width={160}>
                    <Box sx={{ fontSize: "0.72rem", color: "text.disabled" }}>—</Box>
                  </FilterCell>
                ) : withDataset ? (
                  <FilterSelect
                    value={clause.dataset}
                    width={160}
                    options={datasetOptions(clause.dataset)}
                    unset=""
                    onChange={(name) =>
                      patch(index, (next) => {
                        next.dataset = name;
                      })
                    }
                  />
                ) : (
                  <FilterCell width={160} active={clause.text !== ""}>
                    <InputBase
                      value={clause.text}
                      placeholder={t("actionProfiles.clauseText")}
                      onChange={(e) =>
                        patch(index, (next) => {
                          next.text = e.target.value;
                        })
                      }
                      sx={inputSx}
                    />
                  </FilterCell>
                )}
                <ActionCell
                  color="error"
                  icon={<DeleteIcon />}
                  tooltip={t("common.delete")}
                  onClick={() => onChange(clauses.filter((_, i) => i !== index))}
                />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}

export function ConditionDialog({
  t,
  cond,
  taken,
  datasets,
  onClose,
  onSave,
}: {
  t: Translate;
  /** null -- заводим новое условие. */
  cond: ActionCondition | null;
  /** Имена остальных условий профиля: имя обязано быть единственным, ссылки -- на них. */
  taken: string[];
  datasets: Dataset[];
  onClose: () => void;
  onSave: (next: ActionCondition) => void;
}) {
  const [name, setName] = useState(cond?.name ?? "");
  const [any, setAny] = useState(cond?.any === true);
  const [clauses, setClauses] = useState<ActionClause[]>(
    cond === null || cond.rows.length === 0 ? [NEW_CLAUSE] : cond.rows,
  );

  const trimmed = name.trim();
  const nameOk = COND_NAME_RE.test(trimmed) && !taken.includes(trimmed);
  const done = clauses.filter(clauseReady);
  const ready = nameOk && done.length > 0 && done.length === clauses.length;

  return (
    <Modal
      onClose={onClose}
      size="md"
      title={cond === null ? t("actionProfiles.addCondition") : t("actionProfiles.editCondition")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!ready}
            onClick={() => onSave({ name: trimmed, any, rows: done })}
          >
            {cond === null ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={2}>
        <DialogAlert text={t("actionProfiles.condAlert")} help={ACTION_CONDS_HELP} />
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label={t("actionProfiles.condName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            error={name !== "" && !nameOk}
            helperText={
              trimmed !== "" && taken.includes(trimmed)
                ? t("actionProfiles.condNameTaken")
                : t("actionProfiles.condNameHint")
            }
            sx={{ flex: 1.4 }}
          />
          {/* Режим: все строки (И) либо любая (ИЛИ) -- у условия целиком. */}
          <TextField
            select
            size="small"
            label={t("actionProfiles.condMode")}
            value={any ? "any" : "all"}
            onChange={(e) => setAny(e.target.value === "any")}
            helperText={t("actionProfiles.condModeHint")}
            sx={{ flex: 1 }}
          >
            <MenuItem value="all">{t("actionProfiles.condModeAll")}</MenuItem>
            <MenuItem value="any">{t("actionProfiles.condModeAny")}</MenuItem>
          </TextField>
        </Stack>
        <ClausesTable
          t={t}
          clauses={clauses}
          datasets={datasets}
          others={taken}
          onChange={setClauses}
        />
      </Stack>
    </Modal>
  );
}
