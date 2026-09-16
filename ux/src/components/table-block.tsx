import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { HEAD_H, TableIconButton, type FilterOption } from "./data-table/index.ts";
import { BlockHead } from "./BlockHead.tsx";
import { HintMarkup } from "./fields.tsx";
import { dataActionCellSx, SectionBleed, useFlushSection } from "./settings-table.tsx";

export const CELL_PX = 1.25;

export const CODE_W = 180;

const SELECT_H = 22;

export const BLEED = 2;

export const flushTableSx = {
  width: "100%",
  tableLayout: "fixed",
  "& td > .MuiBox-root": { px: CELL_PX },
  "& th:first-of-type": { pl: BLEED },
  "& th:last-of-type": { pr: BLEED },
  "& td:first-of-type > .MuiBox-root, & td:first-of-type": { pl: BLEED },
  "& td:last-of-type > .MuiBox-root": { pr: BLEED },
  "& th > .MuiBox-root": { px: CELL_PX },
  "& th:first-of-type > .MuiBox-root": { pl: BLEED },
  "& th:last-of-type > .MuiBox-root": { pr: BLEED },
  "& tbody td[colspan]": { px: BLEED },
  borderTop: 1,
  borderColor: "divider",
  "& td, & th": { borderLeft: 0, borderRight: 0 },
  "& tbody tr:last-child td": { borderBottom: 0 },
} as const;

export function SectionNotice({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        "& .MuiAlert-root": { px: BLEED, py: 1.25, borderRadius: 0 },
        "& .MuiAlert-root + .MuiAlert-root": { borderTop: 1, borderColor: "divider" },
      }}
    >
      {children}
    </Box>
  );
}

export const headCellSx = {
  py: 0,
  height: HEAD_H,
  minHeight: HEAD_H,
  px: CELL_PX,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "none",
} as const;

export function HeadHint({ text }: { text: string }) {
  return (
    <Tooltip arrow placement="top-start" enterDelay={200} title={<HintMarkup text={text} />}>
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: "inline-flex",
          flexShrink: 0,
          color: "text.secondary",
          opacity: 0.5,
          cursor: "help",
          "&:hover, &:focus-visible": { opacity: 0.95 },
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 14 }} />
      </Box>
    </Tooltip>
  );
}

export function TableCols({ widths }: { widths: readonly (number | undefined)[] }) {
  return (
    <colgroup>
      {widths.map((width, index) => (
        <col key={index} style={width === undefined ? undefined : { width }} />
      ))}
    </colgroup>
  );
}

export function HeadCell({
  label,
  help,
  width,
  minWidth,
  colSpan,
}: {
  label: string;
  help?: string;
  width?: number;
  minWidth?: number;
  colSpan?: number;
}) {
  const text = (
    <Box
      component="span"
      tabIndex={help === undefined ? undefined : 0}
      sx={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        ...(help === undefined
          ? {}
          : {
              cursor: "help",
              textDecoration: "underline dotted",
              textUnderlineOffset: "3px",
              textDecorationColor: "currentColor",
              opacity: 0.85,
              "&:hover, &:focus-visible": { opacity: 1 },
            }),
      }}
    >
      {label}
    </Box>
  );

  return (
    <TableCell
      colSpan={colSpan}
      sx={{ ...headCellSx, width, minWidth: minWidth ?? 0 }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        {help === undefined ? (
          text
        ) : (
          <Tooltip
            arrow
            placement="top-start"
            enterDelay={200}
            title={<HintMarkup text={help} />}
          >
            {text}
          </Tooltip>
        )}
      </Stack>
    </TableCell>
  );
}

export function BlockSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly FilterOption<T>[];
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  const idle = options[0]?.value;
  return (
    <Select
      value={value}
      variant="standard"
      disableUnderline
      inputProps={{ "aria-label": ariaLabel }}
      onChange={(e) => onChange(e.target.value as T)}
      sx={{
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        minWidth: 0,
        maxWidth: "100%",
        height: SELECT_H,
        border: 1,
        borderColor: "divider",
        borderRadius: "3px",
        color: value === idle ? "text.secondary" : "text.primary",
        "&:hover": { borderColor: "text.disabled", bgcolor: "action.hover" },
        "&.Mui-focused": { borderColor: "primary.main" },
        "& .MuiSelect-select": {
          py: 0,
          pr: "22px !important",
          pl: 0.75,
          height: "100%",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
        "& .MuiSelect-icon": { right: 2, fontSize: 16, color: "text.secondary" },
      }}
    >
      {options.map((item) => (
        <MenuItem key={item.value} value={item.value} sx={{ fontSize: "0.8rem" }}>
          {item.label}
        </MenuItem>
      ))}
    </Select>
  );
}

export function TableBlock<T extends string>({
  title,
  label,
  kindLabel,
  kind,
  options,
  onKind,
  notice,
  scroll,
  last,
  children,
}: {
  title?: string;
  label?: string;
  kindLabel?: string;
  kind?: T;
  options?: readonly FilterOption<T>[];
  onKind?: (next: T) => void;
  notice?: ReactNode;
  scroll?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  const picker =
    kind !== undefined && options !== undefined && onKind !== undefined && options.length > 1;
  const head = title !== undefined || label !== undefined || picker;
  const flush = useFlushSection();

  return (
    <Box>
      {head && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", px: flush ? BLEED : 0, py: 0.75 }}
        >
          <BlockHead title={title ?? ""} label={label} />
          <Box sx={{ flex: 1 }} />
          {picker && (
            <BlockSelect
              value={kind}
              options={options}
              onChange={onKind}
              ariaLabel={kindLabel}
            />
          )}
        </Stack>
      )}
      {notice !== undefined && <SectionNotice>{notice}</SectionNotice>}
      <SectionBleed scroll={scroll}>
        <Box
          sx={
            last === true
              ? undefined
              : { borderBottom: 1, borderColor: "divider" }
          }
        >
          {children}
        </Box>
      </SectionBleed>
    </Box>
  );
}

export function DraftAddCell({
  label,
  ready,
  onAdd,
}: {
  label: string;
  ready: boolean;
  onAdd: () => void;
}) {
  return (
    <TableCell sx={dataActionCellSx}>
      <TableIconButton
        color="success"
        icon={<AddIcon sx={{ fontSize: 16 }} />}
        tooltip={label}
        disabled={!ready}
        onClick={onAdd}
      />
    </TableCell>
  );
}

export function draftKey(ready: boolean, onAdd: () => void) {
  return (e: { key: string; preventDefault: () => void }) => {
    if (e.key === "Enter" && ready) {
      e.preventDefault();
      onAdd();
    }
  };
}
