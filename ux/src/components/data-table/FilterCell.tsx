import { createContext, useContext, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TableCell from "@mui/material/TableCell";
import CloseIcon from "@mui/icons-material/Close";
import { styled, type SxProps, type Theme } from "@mui/material/styles";

import { useFocusContext, useFocusField } from "../FocusContext.tsx";
import { useTableStatus } from "./DataTable.tsx";

export const HEAD_H = 36;
const TEXT_PX = 16;

const EMPTY_MIN_W = 120;

const CellRoot = styled(TableCell)({
  padding: "0 !important",
  minWidth: 0,
  height: HEAD_H,
  minHeight: HEAD_H,
  textTransform: "none",
  letterSpacing: 0,
  fontWeight: 600,
  position: "relative",
  verticalAlign: "middle",
  '&[data-grow="1"]': { height: "auto", verticalAlign: "top" },
  '&[data-pinned="1"]': { backgroundColor: "var(--cell-paper)" },
});

const CellBody = styled(Box)({
  display: "flex",
  alignItems: "center",
  paddingLeft: TEXT_PX,
  paddingRight: TEXT_PX,
  position: "absolute",
  inset: 0,
  '&[data-grow="1"]': {
    position: "static",
    minHeight: HEAD_H,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 4,
  },
  '&[data-pinned="1"]': { backgroundColor: "var(--cell-paper)" },
  '&[data-tone="filled"]': { backgroundColor: "var(--cell-ring-bg)" },
  '&[data-tone="ring"]': {
    backgroundColor: "var(--cell-ring-bg)",
    boxShadow: "var(--cell-ring-shadow)",
  },
  '&[data-hot="1"]:focus-within': {
    backgroundColor: "var(--cell-ring-bg)",
    boxShadow: "var(--cell-ring-shadow)",
  },
});

const EditorCells = createContext(false);

export function EditorCellScope({ children }: { children: ReactNode }) {
  return <EditorCells.Provider value={true}>{children}</EditorCells.Provider>;
}

export function FilterCell({
  active = false,
  width,
  minWidth,
  grow = false,
  pinned = false,
  colSpan,
  sx,
  children,
}: {
  active?: boolean;
  width?: number | string;
  minWidth?: number | string;
  grow?: boolean;
  pinned?: boolean;
  colSpan?: number;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const scoped = useFocusContext() !== null;
  const field = useFocusField();
  const rowless = useTableStatus() !== "ready";
  const hot = useContext(EditorCells) ? false : active;
  const ring = scoped ? field.focused : hot;
  const filled = scoped && hot && !field.focused;
  const flag = (on: boolean) => (on ? "1" : undefined);

  return (
    <CellRoot
      colSpan={colSpan}
      data-grow={flag(grow)}
      data-pinned={flag(pinned)}
      style={{
        width,
        minWidth:
          minWidth ?? (width === undefined && rowless ? EMPTY_MIN_W : undefined),
      }}
      sx={sx}
    >
      <CellBody
        ref={field.setRoot}
        onFocusCapture={(event) => {
          const target = event.target as HTMLElement;
          if (!event.currentTarget.contains(target)) {
            return;
          }
          if (target.closest("button") !== null) {
            field.release();
            return;
          }
          field.onFocus();
        }}
        data-grow={flag(grow)}
        data-pinned={flag(pinned && !ring && !filled)}
        data-tone={ring ? "ring" : filled ? "filled" : undefined}
        data-hot={flag(!scoped)}
      >
        {children}
      </CellBody>
    </CellRoot>
  );
}

export const filterInputSx = {
  width: "100%",
  height: "100%",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  "& .MuiInputBase-input": {
    py: 0,
    height: "100%",
    boxSizing: "border-box" as const,
  },
};

export function FilterText({
  value,
  onChange,
  onBlur,
  placeholder,
  title,
  width,
  minWidth,
  mono,
  disabled,
  plain,
  type,
  clearable,
  action,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  title?: string;
  width?: number | string;
  minWidth?: number | string;
  mono?: boolean;
  disabled?: boolean;
  plain?: boolean;
  type?: string;
  clearable?: boolean;
  action?: ReactNode;
}) {
  return (
    <FilterCell active={value !== ""} width={width} minWidth={minWidth}>
      <InputBase
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
        inputProps={{ "aria-label": placeholder, title }}
        endAdornment={
          clearable === true && value !== "" ? (
            <>
              <IconButton
                size="small"
                aria-label="clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                sx={{ p: 0.25, mr: action === undefined ? -0.5 : 0.5 }}
              >
                <CloseIcon sx={{ fontSize: 13 }} />
              </IconButton>
              {action}
            </>
          ) : (
            action
          )
        }
        sx={{
          ...filterInputSx,
          fontFamily: mono === true ? "monospace" : "inherit",
          "& .MuiInputBase-input::placeholder": {
            textTransform: plain === true ? "none" : "uppercase",
            letterSpacing: plain === true ? "0.02em" : "0.04em",
            opacity: 0.55,
          },
          ...(type === "number"
            ? {
                "& input[type=number]": { MozAppearance: "textfield" },
                "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
                  {
                    WebkitAppearance: "none",
                    margin: 0,
                  },
              }
            : {}),
        }}
      />
    </FilterCell>
  );
}

export type FilterOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
};

const selectSx = {
  height: "100%",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  "& .MuiSelect-select": {
    py: 0,
    height: "100%",
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box" as const,
  },
};

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  unset,
  width,
  minWidth,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly FilterOption<T>[];
  placeholder?: string;
  unset?: T;
  width?: number | string;
  minWidth?: number | string;
  disabled?: boolean;
}) {
  const idle = unset ?? options[0]?.value;
  const active = idle !== undefined && value !== idle;

  return (
    <FilterCell active={active} width={width} minWidth={minWidth}>
      <Select
        variant="standard"
        disableUnderline
        displayEmpty
        fullWidth
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        onClick={(e) => e.stopPropagation()}
        renderValue={(current) => {
          const row = options.find((item) => item.value === current);
          return row?.label ?? placeholder ?? "";
        }}
        inputProps={{ "aria-label": placeholder }}
        sx={{
          ...selectSx,
          color: active ? "text.primary" : "text.secondary",
        }}
      >
        {options.map((item) => (
          <MenuItem key={item.value} value={item.value} sx={{ fontSize: "0.8rem" }}>
            {item.hint === undefined ? (
              item.label
            ) : (
              <Box>
                <Box>{item.label}</Box>
                <Box
                  sx={{
                    fontSize: "0.65rem",
                    color: "text.secondary",
                    fontFamily: "monospace",
                  }}
                >
                  {item.hint}
                </Box>
              </Box>
            )}
          </MenuItem>
        ))}
      </Select>
    </FilterCell>
  );
}

export function FilterMulti<T extends string>({
  value,
  onChange,
  options,
  placeholder = "",
  width,
  disabled = false,
}: {
  value: readonly T[];
  onChange: (value: T[]) => void;
  options: readonly FilterOption<T>[];
  placeholder?: string;
  width?: number | string;
  disabled?: boolean;
}) {
  const chosen = new Set(value);
  return (
    <FilterCell active={value.length > 0} width={width}>
      <Select
        multiple
        variant="standard"
        disableUnderline
        displayEmpty
        fullWidth
        disabled={disabled}
        value={[...value]}
        onChange={(e) => {
          const raw = e.target.value;
          onChange((typeof raw === "string" ? raw.split(",") : raw) as T[]);
        }}
        renderValue={(selected) => {
          if (selected.length === 0) {
            return placeholder;
          }
          return selected
            .map((item) => options.find((row) => row.value === item)?.label ?? item)
            .join(", ");
        }}
        onClick={(e) => e.stopPropagation()}
        inputProps={{ "aria-label": placeholder }}
        title={value.length === 0 ? placeholder : value.join(", ")}
        sx={{
          ...selectSx,
          color: value.length === 0 ? "text.secondary" : "text.primary",
        }}
      >
        {options.map((item) => (
          <MenuItem
            key={item.value}
            value={item.value}
            sx={{
              fontSize: "0.8rem",
              fontWeight: chosen.has(item.value) ? 700 : 400,
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Select>
    </FilterCell>
  );
}

function parseCsv(raw: string): string[] | undefined {
  const items = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length === 0 ? undefined : items;
}

export function FilterCsv({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: readonly string[];
  onChange: (value: string[] | undefined) => void;
  placeholder: string;
  width?: number | string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.join(", ");

  return (
    <FilterCell active={value.length > 0 || (draft !== null && draft !== "")} width={width}>
      <InputBase
        value={shown}
        placeholder={placeholder}
        onFocus={() => setDraft(value.join(", "))}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          onChange(parseCsv(text));
        }}
        onBlur={() => setDraft(null)}
        onClick={(e) => e.stopPropagation()}
        inputProps={{ "aria-label": placeholder }}
        sx={{
          ...filterInputSx,
          "& .MuiInputBase-input::placeholder": {
            textTransform: "none",
            letterSpacing: "0.02em",
            opacity: 0.55,
          },
        }}
      />
    </FilterCell>
  );
}

export function DraftCell({
  value,
  placeholder,
  width,
  mono,
  disabled,
  action,
  onChange,
}: {
  value: string;
  placeholder: string;
  width?: number | string;
  mono?: boolean;
  disabled?: boolean;
  action?: ReactNode;
  onChange: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <FilterText
      value={draft ?? value}
      placeholder={placeholder}
      width={width}
      mono={mono}
      disabled={disabled}
      action={action}
      plain
      onChange={(raw) => {
        setDraft(raw);
        onChange(raw);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
