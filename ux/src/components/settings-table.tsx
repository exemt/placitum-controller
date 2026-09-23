import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { BlockHead } from "./BlockHead.tsx";
import { FocusScope } from "./FocusContext.tsx";
import { FilterCell, HEAD_H } from "./data-table/index.ts";
import { HintMarkup } from "./fields.tsx";
import { HelpMark } from "../help/link.tsx";

const SettingsDepth = createContext(false);

const NoAside = createContext(false);

const FlushSection = createContext(false);

export const FlushSectionProvider = FlushSection.Provider;

export const ASIDE_W = 168;

export const NAME_W = "30%";

export const UNIT_W = 80;

const CHECK_W = 20;

export function useInsideSettings(): boolean {
  return useContext(SettingsDepth);
}

export function useFlushSection(): boolean {
  return useContext(FlushSection);
}

const BLEED_PX = 16;

export function SectionBleed({
  scroll,
  children,
}: {
  scroll?: boolean;
  children: ReactNode;
}) {
  const flush = useFlushSection();
  return (
    <Box
      style={flush ? undefined : { marginLeft: -BLEED_PX, marginRight: -BLEED_PX }}
      sx={{
        minWidth: 0,
        maxWidth: flush ? "100%" : `calc(100% + ${2 * BLEED_PX}px)`,
        ...(scroll === true
          ? { overflowX: "auto", overflowY: "hidden" }
          : { overflowX: "hidden" }),
      }}
    >
      {children}
    </Box>
  );
}

export function SettingsTable({
  aside = ASIDE_W,
  name = NAME_W,
  children,
}: {
  aside?: number | false;
  name?: number | string;
  children: ReactNode;
}) {
  if (useContext(SettingsDepth)) {
    throw new Error("SettingsTable нельзя вкладывать в SettingsTable");
  }
  return (
    <SettingsDepth.Provider value={true}>
    <NoAside.Provider value={aside === false}>
      <FocusScope>
        <SectionBleed>
          <Table
            size="small"
            sx={{
              width: "100%",
              tableLayout: "fixed",
              "& td, & th": { borderLeft: 0, borderRight: 0 },
              "& tr:last-of-type > td": { borderBottom: 0 },
            }}
          >
            <colgroup>
              <col style={{ width: name }} />
              <col />
              {aside !== false && <col style={{ width: aside }} />}
            </colgroup>
            <TableBody>{children}</TableBody>
          </Table>
        </SectionBleed>
      </FocusScope>
    </NoAside.Provider>
    </SettingsDepth.Provider>
  );
}

function useRequireTable(component: string) {
  if (!useContext(SettingsDepth)) {
    throw new Error(`${component} стоит только внутри SettingsTable`);
  }
}

export function SettingsGroup({
  title,
  hint,
  help,
  children,
}: {
  title: string;
  hint?: string;
  help?: string;
  children: ReactNode;
}) {
  useRequireTable("SettingsGroup");
  const noAside = useContext(NoAside);
  return (
    <>
      <TableRow>
        <TableCell
          colSpan={noAside ? 2 : 3}
          sx={{
            pt: 1.5,
            pb: 0.75,
            px: 2,
            borderBottom: 1,
            borderColor: "divider",
            "tr:first-of-type > &": { pt: 1.25 },
          }}
        >
          {help === undefined ? (
            <BlockHead title={title} label={hint} />
          ) : (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ alignItems: "center", minWidth: 0 }}
            >
              <BlockHead title={title} label={hint} />
              <HelpMark to={help} />
            </Stack>
          )}
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

export function SettingsWideRow({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  useRequireTable("SettingsWideRow");
  const noAside = useContext(NoAside);
  return (
    <TableRow>
      <TableCell colSpan={noAside ? 2 : 3} sx={{ p: "0 !important" }}>
        <Box
          role={label === undefined ? undefined : "group"}
          aria-label={label}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            minHeight: HEAD_H,
          }}
        >
          {children}
        </Box>
      </TableCell>
    </TableRow>
  );
}

export function SettingsNote({ children }: { children: ReactNode }) {
  useRequireTable("SettingsNote");
  const noAside = useContext(NoAside);
  return (
    <TableRow>
      <TableCell colSpan={noAside ? 2 : 3} sx={{ px: 2, py: 1 }}>
        {children}
      </TableCell>
    </TableRow>
  );
}

export function SettingsMore({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}) {
  useRequireTable("SettingsMore");
  const noAside = useContext(NoAside);
  return (
    <>
      <TableRow>
        <TableCell colSpan={noAside ? 2 : 3} sx={{ py: 0.75, textAlign: "right" }}>
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={onToggle}
            sx={{ fontSize: "0.78rem" }}
          >
            {open ? "↑ " : "↓ "}
            {label}
          </Link>
        </TableCell>
      </TableRow>
      {open && children}
    </>
  );
}

function RowDivider() {
  return (
    <Divider
      orientation="vertical"
      flexItem
      sx={{ my: 1, borderColor: "divider", flexShrink: 0 }}
    />
  );
}

export function SettingsName({ label, help }: { label: string; help?: string }) {
  return (
    <TableCell sx={{ minHeight: HEAD_H, height: HEAD_H, py: 0, verticalAlign: "middle" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </Box>
        {help !== undefined && help !== "" && (
          <Tooltip
            arrow
            title={<HintMarkup text={help} />}
            placement="top-start"
            enterDelay={200}
            leaveDelay={200}
          >
            <Box
              component="span"
              tabIndex={0}
              aria-label={label}
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
        )}
      </Box>
    </TableCell>
  );
}

export function SettingsAside({
  unit,
  check,
}: {
  unit?: ReactNode;
  check?: ReactNode;
}) {
  return (
    <TableCell sx={{ p: "0 16px 0 0 !important", verticalAlign: "middle" }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", justifyContent: "flex-end", minHeight: HEAD_H }}
      >
        <RowDivider />
        <Box
          sx={{
            width: UNIT_W,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            "& .MuiInputBase-root": { width: "100%", minWidth: 0, maxWidth: "100%" },
          }}
        >
          {unit}
        </Box>
        <RowDivider />
        <Box
          sx={{
            minWidth: CHECK_W,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          {check}
        </Box>
      </Stack>
    </TableCell>
  );
}

export function SettingsRow({
  label,
  help,
  grow,
  quiet,
  end,
  unit,
  check,
  children,
}: {
  label: string;
  help?: string;
  grow?: boolean;
  quiet?: boolean;
  end?: ReactNode;
  unit?: ReactNode;
  check?: ReactNode;
  children: ReactNode;
}) {
  useRequireTable("SettingsRow");
  const noAside = useContext(NoAside);
  const inner = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        minWidth: 0,
        gap: 1.5,
        height: "100%",
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </Box>
      {end}
    </Box>
  );
  return (
    <TableRow>
      <SettingsName label={label} help={help} />
      {quiet === true ? (
        <TableCell sx={{ p: "0 !important", verticalAlign: grow ? "top" : "middle" }}>
          <Box sx={{ px: 2, py: grow ? 0.5 : 0, minHeight: HEAD_H, display: "flex" }}>
            {inner}
          </Box>
        </TableCell>
      ) : (
        <FilterCell grow={grow}>{inner}</FilterCell>
      )}
      {!noAside && <SettingsAside unit={unit} check={check} />}
    </TableRow>
  );
}

export type PresetItem<T> = { label: string; value: T; default?: boolean };

const CHIPS_KEEP_NARROW = 2;

export const PRESETS_MIN = 2;

export function Presets<T>({
  items,
  current,
  onPick,
  disabled,
  keep,
  min,
}: {
  items: readonly PresetItem<T>[];
  current?: T;
  onPick: (value: T) => void;
  disabled?: boolean;
  keep?: boolean;
  min?: number;
}) {
  if (items.length < (min ?? PRESETS_MIN)) {
    return null;
  }
  const narrowFits = keep === true || items.length <= CHIPS_KEEP_NARROW;

  return (
    <Box
      sx={{
        display: narrowFits ? "flex" : { xs: "none", md: "flex" },
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
        minWidth: 0,
        opacity: disabled === true ? 0.4 : 1,
        pointerEvents: disabled === true ? "none" : undefined,
      }}
    >
      {items.map((item) => {
        const selected = current !== undefined && current === item.value;
        return (
          <Tooltip key={item.label} arrow title={item.label} placement="top">
            <Chip
              size="small"
              variant={selected ? "filled" : "outlined"}
              color={selected ? "primary" : "default"}
              label={item.label}
              onClick={() => onPick(item.value)}
              sx={{
                height: 20,
                maxWidth: 150,
                borderRadius: "3px",
                fontSize: "0.66rem",
                fontWeight: 600,
                cursor: "pointer",
                "& .MuiChip-label": { px: 0.75 },
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}

export const DATA_ROW_H = HEAD_H;

export const dataCellSx = {
  py: 0,
  height: DATA_ROW_H,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  verticalAlign: "middle",
} as const;

export const dataHeadSx = {
  py: 0.5,
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "text.secondary",
  lineHeight: 1.2,
} as const;

export const dataActionCellSx = {
  ...dataCellSx,
  width: 48,
  textAlign: "right",
  whiteSpace: "nowrap",
} as const;

export const dataInputSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  width: "100%",
  height: 24,
  "& input": { p: 0, height: "100%" },
} as const;

export type UnitOption<T extends string> = { value: T; label: string };

export function UnitLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: 20,
        display: "flex",
        alignItems: "center",
        fontSize: "0.66rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "text.disabled",
      }}
    >
      {children}
    </Box>
  );
}

export function UnitSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  width = 80,
  label,
}: {
  value: T;
  options: readonly UnitOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  width?: number;
  label?: string;
}) {
  return (
    <Select
      value={value}
      variant="standard"
      disableUnderline
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      onClick={(e) => e.stopPropagation()}
      inputProps={{ "aria-label": label ?? "unit" }}
      sx={{
        flexShrink: 0,
        width,
        minWidth: width,
        maxWidth: width,
        boxSizing: "border-box",
        height: 20,
        border: 1,
        borderColor: "divider",
        borderRadius: "3px",
        fontSize: "0.66rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: disabled === true ? "text.disabled" : "text.secondary",
        "& .MuiSelect-select": {
          py: 0,
          pl: 1,
          pr: "18px !important",
          height: "18px !important",
          minHeight: "18px !important",
          display: "flex",
          alignItems: "center",
          boxSizing: "border-box",
        },
        "& .MuiSelect-icon": { right: -1, fontSize: 15 },
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
