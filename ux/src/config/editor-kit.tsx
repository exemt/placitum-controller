import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import AddIcon from "@mui/icons-material/Add";

import { TableIconButton } from "../components/data-table/index.ts";

export const SUB_H = 24;

export const ACTIONS_W = 24;

export const editorInputSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  width: "100%",
  height: SUB_H,
  "& input": { p: 0, height: "100%" },
} as const;

export const editorSelectSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  height: SUB_H,
  "& .MuiSelect-select": {
    py: 0,
    pl: 0,
    height: `${SUB_H}px !important`,
    minHeight: "unset",
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
  },
  "& .MuiOutlinedInput-notchedOutline": { border: 0 },
  "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
} as const;

export const editorMenuItemSx = { fontSize: "0.78rem" } as const;

export const editorChipSx = {
  height: 20,
  borderRadius: "3px",
  fontSize: "0.66rem",
  fontWeight: 600,
  cursor: "pointer",
  "& .MuiChip-label": { px: 0.75 },
} as const;

export function EditorLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: "0.68rem",
        color: "text.secondary",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  );
}

export function EditorField({
  label,
  width,
  grow,
  children,
}: {
  label?: string;
  width?: number;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: "center",
        minWidth: 0,
        ...(grow === true ? { flex: 1 } : { flexShrink: 0 }),
      }}
    >
      {label !== undefined && <EditorLabel>{label}</EditorLabel>}
      <Box sx={{ minWidth: 0, ...(width === undefined ? { flex: 1 } : { width }) }}>
        {children}
      </Box>
    </Stack>
  );
}

export function SubRow({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", width: "100%", minWidth: 0, minHeight: SUB_H }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", flex: 1, minWidth: 0 }}
      >
        {children}
      </Stack>
      <Box
        sx={{
          width: ACTIONS_W,
          flexShrink: 0,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {actions}
      </Box>
    </Stack>
  );
}

export function RowAction({
  title,
  icon,
  color,
  disabled,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  color?: "success" | "error";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <TableIconButton
      color={color}
      icon={icon}
      tooltip={title}
      disabled={disabled === true}
      onClick={onClick}
    />
  );
}

export function AddRow({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", minHeight: SUB_H }}>
      <Link
        component="button"
        type="button"
        underline="hover"
        onClick={onAdd}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          fontSize: "0.7rem",
          fontWeight: 600,
        }}
      >
        <AddIcon sx={{ fontSize: 14 }} />
        {label}
      </Link>
    </Box>
  );
}

export function SubRows({ children }: { children: ReactNode }) {
  return (
    <Stack spacing={0.25} sx={{ width: "100%", py: 0.5 }}>
      {children}
    </Stack>
  );
}
