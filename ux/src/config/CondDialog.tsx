import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import {
  FilterCell,
  FilterSelect,
  TableIconButton,
  TableNoticeRow,
  type FilterOption,
} from "../components/data-table/index.ts";
import {
  DialogAlert,
  DialogFrame,
  DialogLines,
  DialogPick,
} from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import { flushTableSx, HeadCell, headCellSx } from "../components/table-block.tsx";
import { GRIP_W } from "../components/row-drag.tsx";
import type { Translate } from "../i18n/index.ts";
import { useCatalog } from "./editors.tsx";
import { VariableEdit } from "./VariableEdit.tsx";

export const CONDS_HELP = "05-protection#условия-вызова";

export interface Cond {
  value: string;
  dataset: string;
  negate?: boolean;
}

export function condTail(conds: Cond[] | undefined): string {
  return (conds ?? [])
    .map((cond) => ` if ${cond.value} ${cond.negate === true ? "not in" : "in"} ${cond.dataset}`)
    .join("");
}

export function asConds(value: unknown): Cond[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: Cond[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const text = typeof rec.value === "string" ? rec.value : "";
    const dataset = typeof rec.dataset === "string" ? rec.dataset : "";
    const row: Cond = { value: text, dataset };
    if (rec.negate === true) {
      row.negate = true;
    }
    rows.push(row);
  }
  return rows;
}

export function withConds<T extends { conds?: Cond[] }>(row: T, conds: Cond[]): T {
  const next = { ...row };
  if (conds.length === 0) {
    delete next.conds;
  } else {
    next.conds = conds;
  }
  return next;
}

const NEW_COND: Cond = { value: "$uri", dataset: "" };

export function readyConds(conds: Cond[]): Cond[] {
  return conds.filter((cond) => cond.value.trim() !== "" && cond.dataset !== "");
}

const OP_OPTIONS: FilterOption<"in" | "not in">[] = [
  { value: "in", label: "in" },
  { value: "not in", label: "not in" },
];

const ACTIONS_W = 56;

const frameSx = {
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  bgcolor: "background.default",
  overflow: "hidden",
} as const;

function ActionCell({
  color,
  icon,
  tooltip,
  onClick,
}: {
  color: "success" | "error";
  icon: ReactNode;
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

export function CondTable({
  t,
  conds,
  onChange,
}: {
  t: Translate;
  conds: Cond[];
  onChange: (next: Cond[]) => void;
}) {
  const catalog = useCatalog();
  const [adding, setAdding] = useState(false);

  const datasets = (catalog?.datasets ?? []).filter(
    (row) => row.kind === "list" && row.in_nginx !== false,
  );
  const names = datasets.map((row) => row.name);

  const datasetOptions = (current: string): FilterOption<string>[] => {
    const options: FilterOption<string>[] = [{ value: "", label: t("cond.pickList") }];
    for (const name of names) {
      options.push({ value: name, label: name });
    }
    if (current !== "" && !names.includes(current)) {
      options.push({ value: current, label: `${current} — ${t("cond.notDeclared")}` });
    }
    return options;
  };

  const patch = (index: number, edit: (row: Cond) => void) =>
    onChange(
      conds.map((item, i) => {
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
            <TableCell sx={{ ...headCellSx, width: GRIP_W, px: 1 }} />
            <HeadCell label={t("cond.value")} />
            <HeadCell label="" width={96} />
            <HeadCell label={t("cond.dataset")} width={150} />
            <ActionCell
              color="success"
              icon={<AddIcon />}
              tooltip={t("cond.add")}
              onClick={() => setAdding(true)}
            />
          </TableRow>
        </TableHead>
        <TableBody>
          {conds.length === 0 && (
            <TableNoticeRow colSpan={5} kind="empty" message={t("cond.empty")} />
          )}
          {conds.map((cond, index) => (
            <TableRow key={index}>
              <FilterCell width={GRIP_W}>
                <Box
                  sx={{
                    fontSize: "0.72rem",
                    color: "text.secondary",
                    fontFamily: "monospace",
                  }}
                >
                  if
                </Box>
              </FilterCell>
              <FilterCell active={cond.value !== ""} grow>
                <VariableEdit
                  value={cond.value}
                  datasetType={datasets.find((row) => row.name === cond.dataset)?.type}
                  onChange={(value) =>
                    patch(index, (next) => {
                      next.value = value;
                    })
                  }
                />
              </FilterCell>
              <FilterSelect
                value={cond.negate === true ? "not in" : "in"}
                width={96}
                options={OP_OPTIONS}
                unset="in"
                onChange={(op) =>
                  patch(index, (next) => {
                    if (op === "not in") {
                      next.negate = true;
                    } else {
                      delete next.negate;
                    }
                  })
                }
              />
              <FilterSelect
                value={cond.dataset}
                width={150}
                options={datasetOptions(cond.dataset)}
                unset=""
                onChange={(dataset) =>
                  patch(index, (next) => {
                    next.dataset = dataset;
                  })
                }
              />
              <ActionCell
                color="error"
                icon={<DeleteIcon />}
                tooltip={t("common.delete")}
                onClick={() => onChange(conds.filter((_, i) => i !== index))}
              />
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {adding && (
        <CondAddDialog
          t={t}
          datasets={datasets}
          datasetOptions={datasetOptions}
          onClose={() => setAdding(false)}
          onAdd={(cond) => {
            onChange([...conds, cond]);
            setAdding(false);
          }}
        />
      )}
    </Box>
  );
}

function CondAddDialog({
  t,
  datasets,
  datasetOptions,
  onClose,
  onAdd,
}: {
  t: Translate;
  datasets: { name: string; type: string }[];
  datasetOptions: (current: string) => FilterOption<string>[];
  onClose: () => void;
  onAdd: (cond: Cond) => void;
}) {
  const [draft, setDraft] = useState<Cond>(NEW_COND);

  const value = draft.value.trim();
  const ready = value !== "" && draft.dataset !== "";
  const op = draft.negate === true ? "not in" : "in";
  const line = `if ${value === "" ? "…" : value} ${op} ${draft.dataset === "" ? "…" : draft.dataset}`;

  const submit = () => {
    if (ready) {
      onAdd({ ...draft, value });
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={t("cond.addTitle")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={2}>
        <DialogFrame label={t("cond.value")} hint={t("cond.valueHint")}>
          <VariableEdit
            value={draft.value}
            datasetType={datasets.find((row) => row.name === draft.dataset)?.type}
            onChange={(next) => setDraft((prev) => ({ ...prev, value: next }))}
          />
        </DialogFrame>
        <DialogPick
          mono
          label={t("cond.op")}
          hint={t("cond.opHint")}
          value={op}
          options={OP_OPTIONS}
          onChange={(next) =>
            setDraft((prev) => {
              const { negate: _negate, ...rest } = prev;

              return next === "not in" ? { ...rest, negate: true } : rest;
            })
          }
        />
        <DialogPick
          mono
          label={t("cond.dataset")}
          hint={t("cond.datasetHint")}
          value={draft.dataset}
          options={datasetOptions(draft.dataset)}
          onChange={(dataset) => setDraft((prev) => ({ ...prev, dataset }))}
        />
        <DialogLines title={t("cond.lineTitle")} lines={[line]} />
      </Stack>
    </Modal>
  );
}

export function CondDialog({
  t,
  title,
  conds,
  line,
  onClose,
  onApply,
}: {
  t: Translate;
  title: string;
  conds: Cond[];
  line: (conds: Cond[]) => string;
  onClose: () => void;
  onApply: (next: Cond[]) => void;
}) {
  const [draft, setDraft] = useState<Cond[]>(conds);
  const done = readyConds(draft);

  return (
    <Modal
      onClose={onClose}
      title={t("cond.title", { name: title })}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(done)}>
            {t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
      <DialogAlert text={t("cond.alert")} help={CONDS_HELP} />
      <CondTable t={t} conds={draft} onChange={setDraft} />
      <DialogLines title={t("cond.lineTitle")} lines={[line(done)]} />
    </Modal>
  );
}
