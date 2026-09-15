import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import {
  dataActionCellSx,
  dataCellSx,
  dataInputSx,
  SectionBleed,
} from "../components/settings-table.tsx";
import { TableIconButton, TableNoticeRow } from "../components/data-table/index.ts";
import {
  DialogLines,
  DialogRow,
  DialogText,
  dialogLabelSx,
} from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import { flushTableSx, headCellSx, HeadCell } from "../components/table-block.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { asString, type Doc } from "../pages/config-fields.tsx";

const tableSx = { ...flushTableSx, borderTop: 0 } as const;

const NAME_W = 240;
const FLAG_W = 90;
const ACTIONS_W = 48;

export type PairFlag = {
  key: string;
  label: string;
  help?: string;
};

export type PairsAdd = {
  button: string;
  title: string;
  hint: string;
  directive: string;
  emitted: string;
  nothing: string;
  empty: string;
  dup: string;
};

function pairKey(name: string, value: string): string {
  return `${name.trim().toLowerCase()} ${value.trim()}`;
}

function AddDialog({
  t,
  add,
  flag,
  nameHelp,
  valueLabel,
  valueHelp,
  namePlaceholder,
  valuePlaceholder,
  mono,
  taken,
  onClose,
  onAdd,
}: {
  t: Translate;
  add: PairsAdd;
  flag?: PairFlag;
  nameHelp: string;
  valueLabel: string;
  valueHelp?: string;
  namePlaceholder: string;
  valuePlaceholder: string;
  mono?: boolean;
  taken: readonly string[];
  onClose: () => void;
  onAdd: (row: Doc) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [flagOn, setFlagOn] = useState(false);

  const filled = name.trim() !== "" && value.trim() !== "";
  const dup = filled && taken.includes(pairKey(name, value));
  const ready = filled && !dup;
  const tail = flag !== undefined && flagOn ? ` ${flag.key}` : "";
  const line = `${add.directive} ${name.trim()} ${value.trim()}${tail};`;

  const submit = () => {
    const row: Doc = { name: name.trim(), value: value.trim() };
    if (flag !== undefined && flagOn) {
      row[flag.key] = true;
    }
    onAdd(row);
  };

  return (
    <Modal
      onClose={onClose}
      dirty={name !== "" || value !== ""}
      title={add.title}
      hint={add.hint}
      onEnter={ready ? submit : undefined}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.5}>
        <DialogRow label={t("common.name")} hint={nameHelp}>
          <DialogText
            mono={mono}
            width={260}
            value={name}
            placeholder={namePlaceholder}
            onChange={setName}
          />
        </DialogRow>
        <DialogRow label={valueLabel} hint={valueHelp}>
          <DialogText
            mono={mono}
            width={260}
            value={value}
            placeholder={valuePlaceholder}
            onChange={setValue}
          />
        </DialogRow>
        {flag !== undefined && (
          <DialogRow label={flag.label} hint={flag.help}>
            <Checkbox
              size="small"
              checked={flagOn}
              onChange={(_, on) => setFlagOn(on)}
              slotProps={{ input: { "aria-label": flag.label } }}
              sx={{ p: 0.25 }}
            />
          </DialogRow>
        )}
        {dup && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <WarningAmberIcon color="warning" sx={{ fontSize: 15, flexShrink: 0 }} />
            <Typography
              sx={{ ...dialogLabelSx, color: "warning.main", whiteSpace: "normal" }}
            >
              {add.dup}
            </Typography>
          </Stack>
        )}
        <DialogLines
          title={add.emitted}
          lines={filled ? [line] : []}
          empty={add.nothing}
        />
      </Stack>
    </Modal>
  );
}

export function PairsTable({
  rows,
  nameHelp,
  valueLabel,
  valueHelp,
  namePlaceholder,
  valuePlaceholder,
  flag,
  mono,
  add,
  onChange,
}: {
  rows: Doc[];
  nameHelp: string;
  valueLabel: string;
  valueHelp?: string;
  namePlaceholder: string;
  valuePlaceholder: string;
  flag?: PairFlag;
  mono?: boolean;
  add: PairsAdd;
  onChange: (next: Doc[]) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const inputSx = mono === true ? { ...dataInputSx, fontFamily: "monospace" } : dataInputSx;
  const span = flag === undefined ? 3 : 4;

  const patchAt = (index: number, patch: Doc) =>
    onChange(
      rows.map((row, i) => {
        if (i !== index) {
          return row;
        }
        const next = { ...row, ...patch };
        for (const key of Object.keys(patch)) {
          if (patch[key] === undefined) {
            delete next[key];
          }
        }
        return next;
      }),
    );

  const flagCell = (checked: boolean, onToggle: (on: boolean) => void): ReactNode =>
    flag === undefined ? null : (
      <TableCell sx={dataCellSx}>
        <Checkbox
          size="small"
          checked={checked}
          onChange={(_, on) => onToggle(on)}
          slotProps={{ input: { "aria-label": flag.label } }}
          sx={{ p: 0.25 }}
        />
      </TableCell>
    );

  return (
    <>
      <SectionBleed>
        <Table size="small" sx={tableSx}>
          <TableHead>
            <TableRow>
              <HeadCell label={t("common.name")} help={nameHelp} width={NAME_W} />
              <HeadCell label={valueLabel} help={valueHelp} />
              {flag !== undefined && (
                <HeadCell label={flag.label} help={flag.help} width={FLAG_W} />
              )}
              <TableCell sx={{ ...headCellSx, width: ACTIONS_W, minWidth: ACTIONS_W }}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                  <TableIconButton
                    color="success"
                    icon={<AddIcon sx={{ fontSize: 16 }} />}
                    tooltip={add.button}
                    onClick={() => setAdding(true)}
                  />
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableNoticeRow colSpan={span} kind="empty" message={add.empty} />
            )}
            {rows.map((row, index) => (
              <TableRow key={index} hover>
                <TableCell sx={dataCellSx}>
                  <InputBase
                    value={asString(row.name)}
                    inputProps={{ "aria-label": t("common.name") }}
                    onChange={(e) => patchAt(index, { name: e.target.value })}
                    sx={inputSx}
                  />
                </TableCell>
                <TableCell sx={dataCellSx}>
                  <InputBase
                    value={asString(row.value)}
                    inputProps={{ "aria-label": valueLabel }}
                    onChange={(e) => patchAt(index, { value: e.target.value })}
                    sx={inputSx}
                  />
                </TableCell>
                {flag !== undefined &&
                  flagCell(row[flag.key] === true, (on) =>
                    patchAt(index, { [flag.key]: on ? true : undefined }),
                  )}
                <TableCell sx={dataActionCellSx}>
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                    tooltip={t("common.delete")}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionBleed>
      {adding && (
        <AddDialog
          t={t}
          add={add}
          flag={flag}
          nameHelp={nameHelp}
          valueLabel={valueLabel}
          valueHelp={valueHelp}
          namePlaceholder={namePlaceholder}
          valuePlaceholder={valuePlaceholder}
          mono={mono}
          taken={rows.map((row) => pairKey(asString(row.name), asString(row.value)))}
          onClose={() => setAdding(false)}
          onAdd={(row) => {
            setAdding(false);
            onChange([...rows, row]);
          }}
        />
      )}
    </>
  );
}
