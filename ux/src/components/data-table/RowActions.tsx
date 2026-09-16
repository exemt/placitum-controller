import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteIcon from "@mui/icons-material/Delete";

import { TableIconButton } from "./TableIconButton.tsx";
import { useT } from "../../i18n/index.ts";

export const ROW_ACTIONS_W = 88;

export function rowActionsWidth(extra: number): number {
  return ROW_ACTIONS_W + extra * 24;
}

export type RowAction = {
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
};

export function RowActionsHead({ extra = 0 }: { extra?: number }) {
  const width = rowActionsWidth(extra);
  return <TableCell sx={{ width, minWidth: width }} />;
}

export function RowActionsCell({
  copy,
  remove,
  extra,
}: {
  copy?: RowAction;
  remove?: RowAction;
  extra?: ReactNode;
}) {
  const t = useT();

  return (
    <TableCell
      align="right"
      sx={{ whiteSpace: "nowrap" }}
      onClick={(e) => e.stopPropagation()}
    >
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
        {extra}
        <TableIconButton
          icon={<ContentCopyOutlinedIcon />}
          tooltip={copy?.tooltip ?? (copy === undefined ? t("table.copyOff") : t("copyModal.button"))}
          disabled={copy === undefined || copy.disabled === true}
          onClick={() => copy?.onClick()}
        />
        <TableIconButton
          color="error"
          icon={<DeleteIcon />}
          tooltip={
            remove?.tooltip ?? (remove === undefined ? t("table.deleteOff") : t("common.delete"))
          }
          disabled={remove === undefined || remove.disabled === true}
          onClick={() => remove?.onClick()}
        />
      </Stack>
    </TableCell>
  );
}
