import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";

import { TableIconButton, TableNoticeRow } from "./data-table/index.ts";
import { dataActionCellSx, dataCellSx } from "./settings-table.tsx";
import { HeadCell, flushTableSx } from "./table-block.tsx";
import { useT } from "../i18n/index.ts";

export const ACTIONS_W = 72;

export function TextCell({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <TableCell
      sx={{
        ...dataCellSx,
        p: "0 !important",
        color: muted === true ? "text.secondary" : undefined,
      }}
    >
      <Box
        component="span"
        title={text}
        sx={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </Box>
    </TableCell>
  );
}

export function ActionCell({ children }: { children: ReactNode }) {
  return (
    <TableCell sx={{ ...dataActionCellSx, p: "0 !important", width: ACTIONS_W }}>
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          justifyContent: "flex-end",
          alignItems: "center",
          width: "100%",
        }}
      >
        {children}
      </Box>
    </TableCell>
  );
}

export function AddCell({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <ActionCell>
      <TableIconButton color="success" icon={<AddIcon />} tooltip={label} onClick={onAdd} />
    </ActionCell>
  );
}

export function RowActions({
  onEdit,
  onRemove,
}: {
  onEdit?: () => void;
  onRemove: () => void;
}) {
  const t = useT();

  return (
    <ActionCell>
      {onEdit !== undefined && (
        <TableIconButton icon={<EditIcon />} tooltip={t("common.edit")} onClick={onEdit} />
      )}
      <TableIconButton
        color="error"
        icon={<DeleteIcon />}
        tooltip={t("common.delete")}
        onClick={onRemove}
      />
    </ActionCell>
  );
}

export interface ActionRuleRow {
  key: string;
  where?: string;
  when: string;
  target: string;
  targetMuted?: boolean;
  what: string;
  params: string;
  onEdit: () => void;
  onRemove: () => void;
}

export function ActionRulesTable({
  rows,
  empty,
  addLabel,
  whereLabel,
  onAdd,
}: {
  rows: ActionRuleRow[];
  empty: string;
  addLabel: string;
  whereLabel?: string;
  onAdd: () => void;
}) {
  const t = useT();

  return (
    <Table size="small" sx={flushTableSx}>
      <TableHead>
        <TableRow>
          {whereLabel !== undefined && <HeadCell label={whereLabel} width={110} />}
          <HeadCell label={t("outcomes.outcomeWhen")} />
          <HeadCell label={t("outcomes.outcomeTo")} width={130} />
          <HeadCell label={t("outcomes.outcomeWhat")} width={170} />
          <HeadCell label={t("outcomes.outcomeParams")} width={190} />
          <AddCell label={addLabel} onAdd={onAdd} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.length === 0 && (
          <TableNoticeRow colSpan={whereLabel !== undefined ? 6 : 5} kind="empty" message={empty} />
        )}
        {rows.map((row) => (
          <TableRow key={row.key} hover>
            {whereLabel !== undefined && <TextCell text={row.where ?? ""} />}
            <TextCell text={row.when} />
            <TextCell text={row.target} muted={row.targetMuted} />
            <TextCell text={row.what} />
            <TextCell text={row.params} muted />
            <RowActions onEdit={row.onEdit} onRemove={row.onRemove} />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
