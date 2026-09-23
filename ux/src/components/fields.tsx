import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import Link from "@mui/material/Link";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import InputBase from "@mui/material/InputBase";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { BlockHead, blockAccordionSx } from "./BlockHead.tsx";
import { FocusScope } from "./FocusContext.tsx";
import {
  FilterCell,
  filterInputSx,
  HEAD_H,
} from "./data-table/index.ts";
import { describe, type ParentChain } from "../config/inherit.ts";
import { HelpMark, HelpLink } from "../help/link.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import {
  FlushSectionProvider,
  Presets,
  PRESETS_MIN,
  SettingsAside,
  SettingsGroup,
  SettingsName,
  SettingsRow,
  SettingsTable,
  UnitSelect,
  useInsideSettings,
  type PresetItem,
} from "./settings-table.tsx";

const fieldSx = { width: "100%" };
const UNSET = "__unset__";
const mutedInputSx = {
  "& .MuiInputBase-input": { color: "text.disabled" },
} as const;

export function LockedNote({ hint, quiet }: { hint?: string; quiet?: boolean }) {
  const t = useT();
  const word = t("common.locked");
  const mark = (
    <Box
      role="img"
      aria-label={word}
      sx={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        color: "warning.main",
      }}
    >
      <LockOutlinedIcon sx={{ fontSize: 15 }} />
    </Box>
  );
  if (quiet === true) {
    return mark;
  }
  return (
    <Tooltip
      title={
        hint !== undefined && hint !== "" ? <HintMarkup text={hint} /> : word
      }
      placement="top"
      leaveDelay={200}
    >
      {mark}
    </Tooltip>
  );
}

export const lockedInputSx = {
  "& .MuiInputBase-input": { pointerEvents: "none" },
} as const;

export const valueChipSx = {
  height: 20,
  borderRadius: "3px",
  fontSize: "0.66rem",
  fontWeight: 600,
  ml: "0 !important",
  mr: 0.5,
  "& .MuiChip-label": { px: 0.75 },
  "& .MuiChip-deleteIcon": {
    fontSize: 13,
    ml: "-1px",
    mr: 0.4,
    color: "inherit",
    opacity: 0.6,
    "&:hover": { color: "inherit", opacity: 1 },
  },
} as const;

const chipsFieldSx = {
  "& .MuiAutocomplete-inputRoot.MuiOutlinedInput-root": {
    minHeight: 30,
    boxSizing: "border-box",
    paddingTop: "3px",
    paddingBottom: "3px",
  },
  "& .MuiAutocomplete-tag": { marginTop: "1px", marginBottom: "1px" },
} as const;

const numberInputSx = {
  ...filterInputSx,
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
    {
      WebkitAppearance: "none",
      margin: 0,
    },
} as const;
const HINT_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g;
const HINT_LINK = /^\[([^\]]+)\]\(([^\s)]+)\)$/;

function HintInline({ text }: { text: string }) {
  const parts = text.split(HINT_TOKEN);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <Box key={index} component="strong" sx={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </Box>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <Box
          key={index}
          component="code"
          sx={{
            px: 0.4,
            borderRadius: 0.5,
            bgcolor: "action.hover",
            fontWeight: 700,
          }}
        >
          {part.slice(1, -1)}
        </Box>
      );
    }
    const link = HINT_LINK.exec(part);
    if (link !== null) {
      return <HelpLink key={index} to={link[2]} label={link[1]} />;
    }
    return <span key={index}>{part}</span>;
  });
}

export function HintMarkup({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {blocks.map((block, index) => (
        <Typography
          key={index}
          variant="caption"
          component="div"
          sx={{ display: "block", lineHeight: 1.45, color: "inherit" }}
        >
          {block.split("\n").map((line, lineIndex) => (
            <Box key={lineIndex} component="span" sx={{ display: "block" }}>
              <HintInline text={line} />
            </Box>
          ))}
        </Typography>
      ))}
    </Box>
  );
}

type FieldLayout = "grid" | "table";

const FieldLayoutContext = createContext<FieldLayout>("grid");

function useFieldLayout(): FieldLayout {
  const inside = useInsideSettings();
  const layout = useContext(FieldLayoutContext);
  return inside ? "table" : layout;
}

const InheritModeContext = createContext<ParentChain | null>(null);

export const InheritModeProvider = InheritModeContext.Provider;

function useInheritMode(): boolean {
  return useContext(InheritModeContext) !== null;
}

export function useInherited(
  name: string | undefined,
): { value: unknown; text: string; from: string } | null {
  const t = useT();
  const parents = useContext(InheritModeContext);
  if (parents === null || name === undefined) {
    return null;
  }
  const row = parents[name];
  if (row === undefined || row.value === undefined) {
    return null;
  }
  return { value: row.value, text: describe(name, row.value), from: t(`inherit.tag.${row.from}`) };
}

function inheritedLabel(
  t: Translate,
  inherited: { text: string; from: string } | null,
  fallback = "",
): string {
  if (inherited !== null) {
    return `${inherited.text} (${inherited.from})`;
  }
  return fallback === "" ? t("common.inherited") : `${fallback} (${t("inherit.tag.module")})`;
}

export const NameCell = SettingsName;

export function FieldRow({
  label,
  help,
  unit,
  check,
  children,
}: {
  label: string;
  help?: string;
  unit?: ReactNode;
  check?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TableRow>
      <SettingsName label={label} help={help} />
      {children}
      <SettingsAside unit={unit} check={check} />
    </TableRow>
  );
}

export function TableValue({
  active,
  grow,
  quiet,
  extra,
  children,
}: {
  active?: boolean;
  grow?: boolean;
  quiet?: boolean;
  extra?: ReactNode;
  children: ReactNode;
}) {
  if (quiet === true) {
    return (
      <TableCell sx={{ p: "0 !important", verticalAlign: grow ? "top" : "middle" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            minWidth: 0,
            gap: 0.5,
            px: 2,
            py: grow ? 0.5 : 0,
            minHeight: HEAD_H,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
          {extra}
        </Box>
      </TableCell>
    );
  }

  return (
    <FilterCell active={active} grow={grow}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          minWidth: 0,
          gap: 0.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, height: "100%" }}>{children}</Box>
        {extra}
      </Box>
    </FilterCell>
  );
}

export function FieldTooltip({
  title,
  children,
  open,
  disabled,
}: {
  title?: string;
  children: ReactElement;
  open?: boolean;
  disabled?: boolean;
}) {
  if (title === undefined || title === "" || disabled === true) {
    return children;
  }
  return (
    <Tooltip
      arrow
      title={<HintMarkup text={title} />}
      placement="top-start"
      enterDelay={200}
      leaveDelay={200}
      open={open === true ? true : undefined}
    >
      <Box component="div" sx={{ width: "100%" }}>
        {children}
      </Box>
    </Tooltip>
  );
}

function useOptionalLock(optional: boolean | undefined, hasValue: boolean) {
  const [armed, setArmed] = useState(false);
  const keepArmed = useRef(false);

  useEffect(() => {
    if (hasValue) {
      setArmed(false);
      keepArmed.current = false;
      return;
    }
    if (keepArmed.current) {
      keepArmed.current = false;
      return;
    }
    setArmed(false);
  }, [hasValue]);

  const locked = optional === true && !hasValue && !armed;
  const overridden = optional !== true || hasValue || armed;

  const setOverridden = (on: boolean, apply: (on: boolean) => void) => {
    if (on && !hasValue) {
      keepArmed.current = true;
      setArmed(true);
    } else {
      setArmed(false);
    }
    apply(on);
  };

  return { locked, overridden, setOverridden };
}

function lockedFieldSx(locked: boolean) {
  return {
    "& .MuiInputBase-input": {
      opacity: locked ? 0.55 : 1,
      pointerEvents: locked ? "none" : "auto",
      cursor: locked ? "default" : undefined,
    },
    "& .MuiOutlinedInput-root": {
      pointerEvents: locked ? "none" : "auto",
    },
    "& .MuiInputAdornment-root": {
      pointerEvents: "auto",
    },
    ...(locked
      ? {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "action.disabled",
          },
          "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "action.disabled",
          },
          "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
            {
              borderColor: "action.disabled",
            },
          "& .MuiInputLabel-root, & .MuiInputLabel-root.Mui-focused": {
            color: "text.disabled",
          },
        }
      : {}),
  };
}

export function Optional({
  overridden,
  onOverridden,
}: {
  overridden: boolean;
  onOverridden: (next: boolean) => void;
}) {
  const t = useT();
  const word = useInheritMode() ? t("common.inherit") : t("common.default");
  return (
    <Tooltip arrow title={word} placement="top">
      <Checkbox
        size="small"
        checked={!overridden}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onOverridden(!e.target.checked)}
        sx={{ p: 0 }}
        slotProps={{ input: { "aria-label": word } }}
      />
    </Tooltip>
  );
}

function FieldAdornment({
  extra,
  optional,
  overridden,
  onOverridden,
}: {
  extra?: ReactNode;
  optional?: boolean;
  overridden: boolean;
  onOverridden: (next: boolean) => void;
}) {
  if (optional !== true && extra === undefined) {
    return undefined;
  }
  return (
    <InputAdornment position="end" sx={{ ml: 0.5, mr: 0 }}>
      <Stack
        direction="row"
        spacing={0.25}
        sx={{ alignItems: "center" }}
      >
        {extra}
        {optional === true && extra !== undefined && (
          <Divider orientation="vertical" flexItem sx={{ mx: 0, my: 0.5 }} />
        )}
        {optional === true && (
          <Optional overridden={overridden} onOverridden={onOverridden} />
        )}
      </Stack>
    </InputAdornment>
  );
}

function defaultLabel(t: Translate, value: string): string {
  return value === ""
    ? t("common.default")
    : t("common.defaultOf", { value });
}

function useDefaultLabel(name: string | undefined): (value: string) => string {
  const t = useT();
  const inherit = useInheritMode();
  const inherited = useInherited(name);
  return (value) => (inherit ? inheritedLabel(t, inherited, value) : defaultLabel(t, value));
}

function optionLabel(t: Translate, value: string): string {
  const path = `config.option.${value}`;
  const translated = t(path);
  return translated === path ? value : translated;
}

export function Section({
  title,
  hint,
  help,
  defaultExpanded,
  nested,
  expanded,
  onToggle,
  flush,
  end,
  children,
}: {
  title: string;
  hint: string;
  help?: string;
  defaultExpanded?: boolean;
  nested?: boolean;
  expanded?: boolean;
  onToggle?: (next: boolean) => void;
  flush?: boolean;
  end?: ReactNode;
  children: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded === true);
  const head =
    help === undefined ? (
      <BlockHead title={title} label={hint} />
    ) : (
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
        <BlockHead title={title} label={hint} />
        <HelpMark to={help} />
      </Stack>
    );
  const open = expanded ?? uncontrolled;

  return (
    <Accordion
      expanded={open}
      onChange={(_, next) => {
        if (expanded === undefined) {
          setUncontrolled(next);
        }
        onToggle?.(next);
      }}
      disableGutters
      variant="outlined"
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{
        ...blockAccordionSx(open),
        ...(nested === true ? { bgcolor: "background.default" } : {}),
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        {end === undefined ? (
          head
        ) : (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between", pr: 1 }}
          >
            {head}
            <Box
              onClick={(event) => event.stopPropagation()}
              onFocus={(event) => event.stopPropagation()}
              sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              {end}
            </Box>
          </Stack>
        )}
      </AccordionSummary>
      <AccordionDetails sx={flush === true ? { p: "0 !important" } : undefined}>
        <FlushSectionProvider value={flush === true}>
          <Stack spacing={flush === true ? 0 : 2}>{children}</Stack>
        </FlushSectionProvider>
      </AccordionDetails>
    </Accordion>
  );
}

export function UnderlayTabs<T extends string>({
  value,
  onChange,
  items,
  end,
  wrap,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
  end?: ReactNode;
  wrap?: boolean;
}) {
  return (
    <Box
      sx={{
        display: end !== undefined ? "flex" : "inline-flex",
        alignItems: "center",
        width: end !== undefined ? "100%" : undefined,
        p: 0.4,
        gap: 0.4,
        flexWrap: wrap === true ? "wrap" : undefined,
        borderRadius: 1,
        bgcolor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(255, 255, 255, 0.06)"
            : "rgba(0, 0, 0, 0.05)",
        border: 1,
        borderColor: "divider",
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Box
            key={item.value}
            component="button"
            type="button"
            onClick={() => onChange(item.value)}
            sx={{
              appearance: "none",
              fontFamily: "inherit",
              border: 0,
              cursor: "pointer",
              px: 1.5,
              py: 0.55,
              borderRadius: 0.75,
              fontWeight: 600,
              fontSize: "0.85rem",
              lineHeight: 1.25,
              bgcolor: (theme) =>
                selected
                  ? theme.palette.action.selected
                  : "transparent",
              color: selected ? "primary.main" : "text.secondary",
            }}
          >
            {item.label}
          </Box>
        );
      })}
      {end !== undefined && (
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
          {end}
        </Box>
      )}
    </Box>
  );
}

export function Group({
  title,
  hint,
  help,
  layout = "grid",
  children,
}: {
  title: string;
  hint?: string;
  help?: string;
  layout?: FieldLayout;
  children: ReactNode;
}) {
  if (layout === "table") {
    return (
      <FieldLayoutContext.Provider value="table">
        <SettingsTable>
          <SettingsGroup title={title} hint={hint} help={help}>
            {children}
          </SettingsGroup>
        </SettingsTable>
      </FieldLayoutContext.Provider>
    );
  }
  return (
    <FieldLayoutContext.Provider value={layout}>
      <FocusScope>
        <Box>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
            <BlockHead title={title} label={hint} nowrap={false} />
            {help !== undefined && <HelpMark to={help} />}
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 2,
              alignItems: "start",
              mt: 1.5,
            }}
          >
            {children}
          </Box>
        </Box>
      </FocusScope>
    </FieldLayoutContext.Provider>
  );
}

export function More({
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
  return (
    <Stack spacing={2}>
      <Divider />
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={onToggle}
          sx={{ fontSize: "0.8rem" }}
        >
          {label}
        </Link>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={2}>{children}</Stack>
      </Collapse>
    </Stack>
  );
}

export function Text({
  name,
  label,
  value,
  onChange,
  placeholder,
  password,
  wide,
  helper,
  optional,
  fallback = "",
  presets,
  mono,
  end,
  readOnly,
}: {
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  password?: boolean;
  wide?: boolean;
  helper?: string;
  optional?: boolean;
  fallback?: string;
  presets?: readonly string[];
  mono?: boolean;
  end?: ReactNode;
  readOnly?: boolean;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== "",
  );
  const inherited = useInherited(name);
  const seed =
    typeof inherited?.value === "string"
      ? inherited.value
      : fallback !== ""
        ? fallback
        : (presets?.[0] ?? "");
  const display = locked ? defaultLabelOf(seed) : value;
  const frozen = locked || readOnly === true;
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) => setOverridden(on, () => onChange(on ? seed : ""))}
      />
    ) : undefined;
  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          readOnly === true ? (
            <LockedNote hint={helper} />
          ) : presets === undefined || presets.length < PRESETS_MIN ? undefined : (
            <Presets
              items={presets.map((item) => ({
                label: item,
                value: item,
                default: item === fallback,
              }))}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(next) => setOverridden(true, () => onChange(next))}
            />
          )
        }
        unit={locked ? undefined : end}
        check={optionalSlot}
      >
        <InputBase
          value={display}
          placeholder={placeholder}
          readOnly={frozen}
          type={password === true && !locked ? "password" : "text"}
          onChange={(e) => onChange(e.target.value)}
          inputProps={{ tabIndex: frozen ? -1 : undefined }}
          sx={{
            ...filterInputSx,
            ...(locked ? mutedInputSx : {}),
            ...(mono === true && !locked ? { fontFamily: "monospace" } : {}),
            ...(readOnly === true ? { pointerEvents: "none" } : {}),
          }}
        />
      </SettingsRow>
    );
  }
  const field = (
    <FieldTooltip title={helper} disabled={locked}>
      <TextField
        size="small"
        fullWidth
        label={label}
        value={display}
        placeholder={placeholder}
        type={password === true && !locked ? "password" : "text"}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          htmlInput: { readOnly: frozen, tabIndex: frozen ? -1 : undefined },
          input: {
            endAdornment: (
              <FieldAdornment
                extra={
                  readOnly === true ? (
                    <LockedNote
                      hint={helper}
                      quiet={!locked && helper !== undefined && helper !== ""}
                    />
                  ) : undefined
                }
                optional={optional}
                overridden={overridden}
                onOverridden={(on) =>
                  setOverridden(on, () => onChange(on ? fallback : ""))
                }
              />
            ),
          },
        }}
        sx={{
          ...(wide === true ? { ...fieldSx, gridColumn: "1 / -1" } : fieldSx),
          ...lockedFieldSx(locked),
          ...(readOnly === true ? lockedInputSx : {}),
        }}
      />
    </FieldTooltip>
  );
  return field;
}

export function Num({
  name,
  label,
  value,
  onChange,
  helper,
  optional,
  fallback,
  presets,
  end,
}: {
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  optional?: boolean;
  fallback?: number | string;
  presets?: readonly number[];
  end?: ReactNode;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const preset = fallback === undefined ? "" : String(fallback);
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== "",
  );
  const inherited = useInherited(name);
  const seed =
    typeof inherited?.value === "number"
      ? String(inherited.value)
      : preset !== ""
        ? preset
        : presets?.[0] === undefined
          ? ""
          : String(presets[0]);
  const display = locked ? defaultLabelOf(seed) : value;
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) => setOverridden(on, () => onChange(on ? seed : ""))}
      />
    ) : undefined;
  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          presets === undefined || presets.length < PRESETS_MIN ? undefined : (
            <Presets
              items={presets.map((item) => ({
                label: String(item),
                value: String(item),
                default: preset !== "" && String(item) === preset,
              }))}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(next) => setOverridden(true, () => onChange(next))}
            />
          )
        }
        unit={end}
        check={optionalSlot}
      >
        <InputBase
          value={display}
          readOnly={locked}
          type={locked ? "text" : "number"}
          onChange={(e) => onChange(e.target.value)}
          inputProps={{ tabIndex: locked ? -1 : undefined }}
          sx={{ ...numberInputSx, ...(locked ? mutedInputSx : {}) }}
        />
      </SettingsRow>
    );
  }
  return (
    <FieldTooltip title={helper} disabled={locked}>
      <TextField
        size="small"
        fullWidth
        type={locked ? "text" : "number"}
        label={label}
        value={display}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          htmlInput: { readOnly: locked, tabIndex: locked ? -1 : undefined },
          input: {
            endAdornment: (
              <FieldAdornment
                optional={optional}
                overridden={overridden}
                onOverridden={(on) =>
                  setOverridden(on, () => onChange(on ? preset : ""))
                }
              />
            ),
          },
        }}
        sx={{
          ...fieldSx,
          ...lockedFieldSx(locked),
          "& input[type=number]": { MozAppearance: "textfield" },
          "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
            {
              WebkitAppearance: "none",
              margin: 0,
            },
        }}
      />
    </FieldTooltip>
  );
}

export type ByteUnit = "b" | "kb" | "mb" | "gb";

export type ByteHint = {
  label: string;
  value: number;
  default?: boolean;
};

const UNIT_FACTOR: Record<ByteUnit, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

const ALL_UNITS: readonly ByteUnit[] = ["b", "kb", "mb", "gb"];

function resolveUnits(units: readonly ByteUnit[] | undefined): ByteUnit[] {
  if (units === undefined || units.length === 0) {
    return [...ALL_UNITS];
  }
  const seen = new Set<ByteUnit>();
  const next: ByteUnit[] = [];
  for (const unit of units) {
    if (UNIT_FACTOR[unit] === undefined || seen.has(unit)) {
      continue;
    }
    seen.add(unit);
    next.push(unit);
  }
  return next.length === 0 ? [...ALL_UNITS] : next;
}

function defaultUnit(units: readonly ByteUnit[]): ByteUnit {
  return units.includes("mb") ? "mb" : (units[0] ?? "b");
}

function trimAmount(n: number): string {
  if (Number.isInteger(n)) {
    return String(n);
  }
  return String(Math.round(n * 1000) / 1000);
}

function splitBytes(
  bytes: number,
  units: readonly ByteUnit[],
): { amount: string; unit: ByteUnit } {
  const ranked = [...units].sort((a, b) => UNIT_FACTOR[b] - UNIT_FACTOR[a]);
  if (bytes === 0) {
    return { amount: "0", unit: ranked[ranked.length - 1] ?? "b" };
  }
  for (const unit of ranked) {
    const factor = UNIT_FACTOR[unit];
    if (bytes % factor === 0) {
      return { amount: String(bytes / factor), unit };
    }
  }
  for (const unit of ranked) {
    const factor = UNIT_FACTOR[unit];
    if (bytes >= factor) {
      return { amount: trimAmount(bytes / factor), unit };
    }
  }
  const unit = ranked[ranked.length - 1] ?? "b";
  return { amount: trimAmount(bytes / UNIT_FACTOR[unit]), unit };
}

function toBytes(amount: string, unit: ByteUnit): number | undefined {
  const raw = amount.trim();
  if (raw === "") {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }
  return Math.round(n * UNIT_FACTOR[unit]);
}

export function Bytes({
  name,
  label,
  value,
  onChange,
  units,
  hints,
  helper,
  defaultValue,
  optional,
  wide,
}: {
  name?: string;
  label: string;
  value: number | undefined;
  onChange: (bytes: number | undefined) => void;
  units?: readonly ByteUnit[];
  hints?: readonly ByteHint[];
  helper?: string;
  defaultValue?: number;
  optional?: boolean;
  wide?: boolean;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const allowedKey = (units === undefined || units.length === 0 ? ALL_UNITS : units).join(
    ",",
  );
  const allowed = useMemo(
    () => resolveUnits(allowedKey.split(",") as ByteUnit[]),
    [allowedKey],
  );
  const preset =
    defaultValue ??
    hints?.find((hint) => hint.default === true)?.value ??
    hints?.[0]?.value;
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== undefined,
  );
  const shown = locked ? preset : value;
  const lastEmitted = useRef<number | undefined>(value);
  const initial = splitBytes(shown ?? 0, allowed);
  const [amount, setAmount] = useState(shown === undefined ? "" : initial.amount);
  const [unit, setUnit] = useState<ByteUnit>(
    shown === undefined ? defaultUnit(allowed) : initial.unit,
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (shown === undefined) {
      lastEmitted.current = value;
      setAmount("");
      setUnit((current) => (allowed.includes(current) ? current : defaultUnit(allowed)));
      return;
    }
    if (overridden && value === lastEmitted.current) {
      return;
    }
    if (overridden) {
      lastEmitted.current = value;
    }
    const next = splitBytes(shown, allowed);
    setAmount(next.amount);
    setUnit(next.unit);
  }, [shown, value, overridden, allowed]);

  const emit = (nextAmount: string, nextUnit: ByteUnit) => {
    const raw = nextAmount.trim();
    if (raw === "") {
      lastEmitted.current = undefined;
      onChange(undefined);
      return;
    }
    const bytes = toBytes(nextAmount, nextUnit);
    if (bytes === undefined) {
      return;
    }
    lastEmitted.current = bytes;
    onChange(bytes);
  };

  const applyHint = (bytes: number) => {
    const next = splitBytes(bytes, allowed);
    setAmount(next.amount);
    setUnit(next.unit);
    lastEmitted.current = bytes;
    onChange(bytes);
  };

  const presetLabel =
    preset === undefined
      ? ""
      : (hints?.find((hint) => hint.value === preset)?.label ??
        (() => {
          const split = splitBytes(preset, allowed);
          return `${split.amount}${split.unit}`;
        })());
  const unitSelect = (
    <UnitSelect
      disabled={locked}
      value={allowed.includes(unit) ? unit : defaultUnit(allowed)}
      options={allowed.map((item) => ({ value: item, label: item }))}
      onChange={(next) => {
        setUnit(next);
        emit(amount, next);
      }}
    />
  );

  const hintRow =
    hints !== undefined && hints.length > 0 && !table ? (
      <Stack
        direction="row"
        useFlexGap
        spacing={0.5}
        sx={{ flexWrap: "wrap", mt: 0.5 }}
      >
        {hints.map((hint) => {
          const selected = !locked && shown === hint.value;
          const isDefault = !locked && preset === hint.value;
          return (
            <Chip
              key={`${hint.label}-${hint.value}`}
              size="small"
              disabled={locked}
              variant={selected ? "filled" : "outlined"}
              color={selected || isDefault ? "primary" : "default"}
              label={hint.label}
              onClick={() => applyHint(hint.value)}
            />
          );
        })}
      </Stack>
    ) : undefined;

  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          hints === undefined || hints.length < PRESETS_MIN ? undefined : (
            <Presets
              items={hints.map((hint) => ({
                label: hint.label,
                value: hint.value,
                default: preset === hint.value,
              }))}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(bytes) => setOverridden(true, () => applyHint(bytes))}
            />
          )
        }
        unit={unitSelect}
        check={
          optional === true ? (
            <Optional
              overridden={overridden}
              onOverridden={(on) =>
                setOverridden(on, () => onChange(on ? (preset ?? 0) : undefined))
              }
            />
          ) : undefined
        }
      >
        <InputBase
          value={locked ? defaultLabelOf(presetLabel) : amount}
          readOnly={locked}
          type={locked ? "text" : "number"}
          onChange={(e) => {
            const next = e.target.value;
            setAmount(next);
            emit(next, unit);
          }}
          inputProps={{
            min: 0,
            step: "any",
            tabIndex: locked ? -1 : undefined,
          }}
          sx={{ ...numberInputSx, ...(locked ? mutedInputSx : {}) }}
        />
      </SettingsRow>
    );
  }

  const field = (
    <TextField
      size="small"
      fullWidth
      type={locked ? "text" : "number"}
      label={label}
      value={locked ? defaultLabelOf("") : amount}
      onFocus={() => {
        if (!locked) {
          setFocused(true);
        }
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const next = e.target.value;
        setAmount(next);
        emit(next, unit);
      }}
      slotProps={{
        htmlInput: {
          min: 0,
          step: "any",
          readOnly: locked,
          tabIndex: locked ? -1 : undefined,
        },
        input: {
          endAdornment: (
            <FieldAdornment
              optional={optional}
              overridden={overridden}
              onOverridden={(on) =>
                setOverridden(on, () =>
                  onChange(on ? (preset ?? 0) : undefined),
                )
              }
              extra={locked ? undefined : unitSelect}
            />
          ),
        },
      }}
      sx={{
        width: "100%",
        ...lockedFieldSx(locked),
        "& input[type=number]": { MozAppearance: "textfield" },
        "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
          {
            WebkitAppearance: "none",
            margin: 0,
          },
      }}
    />
  );

  return (
    <Box sx={wide === true ? { ...fieldSx, gridColumn: "1 / -1" } : fieldSx}>
      <FieldTooltip title={helper} open={focused} disabled={locked}>
        {field}
      </FieldTooltip>
      {hintRow}
    </Box>
  );
}

export function Pick<T extends string>({
  label,
  helper,
  value,
  options,
  select,
  onChange,
}: {
  label: string;
  helper?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  select?: boolean;
  onChange: (next: T) => void;
}) {
  if (useFieldLayout() === "table") {
    if (select === true) {
      return (
        <SelectRow
          label={label}
          helper={helper}
          value={value}
          options={options}
          onChange={onChange}
        />
      );
    }

    return (
      <PickRow label={label} helper={helper} value={value} options={options} onChange={onChange} />
    );
  }
  return (
    <FormControl size="small" fullWidth sx={fieldSx}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        displayEmpty
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {helper !== undefined && helper !== "" && (
        <FormHelperText>{helper}</FormHelperText>
      )}
    </FormControl>
  );
}

function SelectRow<T extends string>({
  label,
  helper,
  value,
  options,
  onChange,
}: {
  label: string;
  helper?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <SettingsRow label={label} help={helper}>
      <Select
        value={value}
        variant="standard"
        disableUnderline
        fullWidth
        displayEmpty
        inputProps={{ "aria-label": label }}
        onChange={(e) => onChange(e.target.value as T)}
        sx={{
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          "& .MuiSelect-select": {
            py: 0,
            pl: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} sx={{ fontSize: "0.8rem" }}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </SettingsRow>
  );
}

function PickRow<T extends string>({
  label,
  helper,
  value,
  options,
  unset,
  check,
  onChange,
}: {
  label: string;
  helper?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  unset?: T;
  check?: ReactNode;
  onChange: (next: T) => void;
}) {
  const current = options.find((item) => item.value === value);
  const isUnset = unset !== undefined && value === unset;
  const picks = options.filter((item) => item.value !== unset);
  return (
    <SettingsRow
      label={label}
      help={helper}
      end={
        picks.length < PRESETS_MIN ? undefined : (
        <Presets
          items={picks.map((item) => ({ label: item.label, value: item.value }))}
          current={value}
          onPick={(next) =>
            onChange(next === value && unset !== undefined ? unset : next)
          }
        />
        )
      }
      check={check}
    >
      <Box
        sx={{
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: isUnset ? "text.secondary" : "text.primary",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {current?.label ?? value}
      </Box>
    </SettingsRow>
  );
}

export type TimeUnit = "ms" | "s" | "min" | "h";

const TIME_FACTOR_MS: Record<TimeUnit, number> = {
  ms: 1,
  s: 1000,
  min: 60_000,
  h: 3_600_000,
};

const TIME_UNITS: readonly TimeUnit[] = ["ms", "s", "min", "h"];

function splitTime(
  valueMs: number,
  units: readonly TimeUnit[],
): { amount: string; unit: TimeUnit } {
  const ranked = [...units].sort((a, b) => TIME_FACTOR_MS[b] - TIME_FACTOR_MS[a]);
  if (valueMs === 0) {
    return { amount: "0", unit: ranked[ranked.length - 1] ?? "ms" };
  }
  for (const unit of ranked) {
    if (valueMs % TIME_FACTOR_MS[unit] === 0) {
      return { amount: String(valueMs / TIME_FACTOR_MS[unit]), unit };
    }
  }
  const unit = ranked[ranked.length - 1] ?? "ms";
  return { amount: trimAmount(valueMs / TIME_FACTOR_MS[unit]), unit };
}

export function timeLabel(valueMs: number): string {
  const split = splitTime(valueMs, TIME_UNITS);
  return `${split.amount}${split.unit}`;
}

export function Duration({
  name,
  label,
  value,
  onChange,
  base,
  helper,
  optional,
  fallback,
  presets,
}: {
  name?: string;
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  base: "ms" | "s";
  helper?: string;
  optional?: boolean;
  fallback?: number;
  presets?: readonly number[];
}) {
  const defaultLabelOf = useDefaultLabel(name);
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const baseMs = TIME_FACTOR_MS[base];
  const allowed = useMemo(
    () => TIME_UNITS.filter((unit) => TIME_FACTOR_MS[unit] >= baseMs),
    [baseMs],
  );
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== undefined,
  );
  const shown = locked ? fallback : value;
  const lastEmitted = useRef<number | undefined>(value);
  const initial = splitTime((shown ?? 0) * baseMs, allowed);
  const [amount, setAmount] = useState(shown === undefined ? "" : initial.amount);
  const [unit, setUnit] = useState<TimeUnit>(shown === undefined ? base : initial.unit);

  useEffect(() => {
    if (shown === undefined) {
      lastEmitted.current = value;
      setAmount("");
      return;
    }
    if (overridden && value === lastEmitted.current) {
      return;
    }
    if (overridden) {
      lastEmitted.current = value;
    }
    const next = splitTime(shown * baseMs, allowed);
    setAmount(next.amount);
    setUnit(next.unit);
  }, [shown, value, overridden, allowed, baseMs]);

  const emit = (nextAmount: string, nextUnit: TimeUnit) => {
    const raw = nextAmount.trim();
    if (raw === "") {
      lastEmitted.current = undefined;
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return;
    }
    const next = Math.round((n * TIME_FACTOR_MS[nextUnit]) / baseMs);
    lastEmitted.current = next;
    onChange(next);
  };

  const apply = (next: number) => {
    const split = splitTime(next * baseMs, allowed);
    setAmount(split.amount);
    setUnit(split.unit);
    lastEmitted.current = next;
    onChange(next);
  };

  const unitSelect = (
    <UnitSelect
      disabled={locked}
      value={unit}
      options={allowed.map((item) => ({ value: item, label: item }))}
      onChange={(next) => {
        setUnit(next);
        emit(amount, next);
      }}
    />
  );
  const seed = fallback ?? presets?.[0] ?? 0;
  const presetItems: PresetItem<number>[] = (presets ?? []).map((item) => {
    const split = splitTime(item * baseMs, allowed);
    return {
      label: `${split.amount}${split.unit}`,
      value: item,
      default: fallback === item,
    };
  });
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) =>
          setOverridden(on, () => (on ? apply(seed) : onChange(undefined)))
        }
      />
    ) : undefined;
  const seedLabel =
    seed === 0 && fallback === undefined
      ? ""
      : (() => {
          const split = splitTime(seed * baseMs, allowed);
          return `${split.amount}${split.unit}`;
        })();
  const input = (
    <InputBase
      value={locked ? defaultLabelOf(seedLabel) : amount}
      readOnly={locked}
      type={locked ? "text" : "number"}
      onChange={(e) => {
        const next = e.target.value;
        setAmount(next);
        emit(next, unit);
      }}
      inputProps={{ min: 0, step: "any", tabIndex: locked ? -1 : undefined }}
      sx={{ ...numberInputSx, ...(locked ? mutedInputSx : {}) }}
    />
  );

  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          presetItems.length < PRESETS_MIN ? undefined : (
            <Presets
              items={presetItems}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(next) => setOverridden(true, () => apply(next))}
            />
          )
        }
        unit={unitSelect}
        check={optionalSlot}
      >
        {input}
      </SettingsRow>
    );
  }

  return (
    <FieldTooltip title={helper} disabled={locked}>
      <TextField
        size="small"
        fullWidth
        type={locked ? "text" : "number"}
        label={label}
        value={locked ? defaultLabelOf(seedLabel) : amount}
        onChange={(e) => {
          const next = e.target.value;
          setAmount(next);
          emit(next, unit);
        }}
        slotProps={{
          htmlInput: {
            min: 0,
            step: "any",
            readOnly: locked,
            tabIndex: locked ? -1 : undefined,
          },
          input: {
            endAdornment: (
              <FieldAdornment
                optional={optional}
                overridden={overridden}
                onOverridden={(on) =>
                  setOverridden(on, () => (on ? apply(seed) : onChange(undefined)))
                }
                extra={locked ? undefined : unitSelect}
              />
            ),
          },
        }}
        sx={{ ...fieldSx, ...lockedFieldSx(locked), ...numberInputSx }}
      />
    </FieldTooltip>
  );
}

export function Tri({
  fallback,
  name,
  t,
  label,
  value,
  onChange,
  helper,
  optional,
}: {
  fallback?: string;
  name?: string;
  t: Translate;
  label: string;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
  helper?: string;
  optional?: boolean;
}) {
  const inheritMode = useInheritMode();
  optional = optional === true || inheritMode;
  const inherited = useInherited(name);
  const unsetLabel = inheritMode
    ? inheritedLabel(t, inherited, fallback ?? "")
    : defaultLabel(t, fallback ?? "");
  const current = value === undefined ? UNSET : value ? "on" : "off";
  const seed = typeof inherited?.value === "boolean" ? inherited.value : fallback === "on";
  if (useFieldLayout() === "table") {
    return (
      <PickRow
        label={label}
        helper={helper}
        value={current}
        unset={UNSET}
        options={[
          { value: UNSET, label: unsetLabel },
          { value: "on", label: t("common.on") },
          { value: "off", label: t("common.off") },
        ]}
        check={
          optional === true ? (
            <Optional
              overridden={value !== undefined}
              onOverridden={(on) => onChange(on ? seed : undefined)}
            />
          ) : undefined
        }
        onChange={(next) => onChange(next === UNSET ? undefined : next === "on")}
      />
    );
  }
  return (
    <FormControl size="small" fullWidth sx={fieldSx}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={current}
        onChange={(e) => {
          const next = String(e.target.value);
          onChange(next === UNSET ? undefined : next === "on");
        }}
      >
        <MenuItem value={UNSET}>{unsetLabel}</MenuItem>
        <MenuItem value="on">{t("common.on")}</MenuItem>
        <MenuItem value="off">{t("common.off")}</MenuItem>
      </Select>
      {helper !== undefined && helper !== "" && (
        <FormHelperText>{helper}</FormHelperText>
      )}
    </FormControl>
  );
}

export function Choice({
  fallback,
  name,
  t,
  label,
  value,
  options,
  onChange,
  helper,
  optional,
}: {
  fallback?: string;
  name?: string;
  t: Translate;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
  helper?: string;
  optional?: boolean;
}) {
  const inheritMode = useInheritMode();
  optional = optional === true || inheritMode;
  const inherited = useInherited(name);
  const unsetLabel = inheritMode
    ? inheritedLabel(t, inherited, fallback ?? "")
    : defaultLabel(t, fallback === undefined ? "" : optionLabel(t, fallback));
  const seed =
    typeof inherited?.value === "string" && inherited.value !== ""
      ? inherited.value
      : (fallback ?? options[0]);
  if (useFieldLayout() === "table") {
    const current = value === "" ? UNSET : value;
    return (
      <PickRow
        label={label}
        helper={helper}
        value={current}
        unset={UNSET}
        options={[
          { value: UNSET, label: unsetLabel },
          ...options.map((option) => ({
            value: option,
            label: optionLabel(t, option),
          })),
        ]}
        check={
          optional === true && seed !== undefined ? (
            <Optional
              overridden={value !== ""}
              onOverridden={(on) => onChange(on ? seed : undefined)}
            />
          ) : undefined
        }
        onChange={(next) => onChange(next === UNSET ? undefined : next)}
      />
    );
  }
  return (
    <FormControl size="small" fullWidth sx={fieldSx}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value === "" ? UNSET : value}
        onChange={(e) => {
          const next = String(e.target.value);
          onChange(next === UNSET ? undefined : next);
        }}
      >
        <MenuItem value={UNSET}>{unsetLabel}</MenuItem>
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {optionLabel(t, option)}
          </MenuItem>
        ))}
      </Select>
      {helper !== undefined && helper !== "" && (
        <FormHelperText>{helper}</FormHelperText>
      )}
    </FormControl>
  );
}

export function Chips({
  name,
  t,
  label,
  value,
  onChange,
  options,
  helper,
  placeholder,
  wide,
  freeSolo,
  parse,
  optional,
  fallback,
  flag,
  optionLabel: labelOf,
}: {
  name?: string;
  t: Translate;
  label: string;
  value: string[];
  onChange: (value: string[] | undefined) => void;
  options?: readonly string[];
  helper?: string;
  placeholder?: string;
  wide?: boolean;
  freeSolo?: boolean;
  parse?: (raw: string) => string | undefined;
  optional?: boolean;
  fallback?: readonly string[];
  flag?: ReactNode;
  optionLabel?: (value: string) => string;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  const show = labelOf ?? ((value: string) => value);
  optional = optional === true || useInheritMode();
  const inherited = useInherited(name);
  const inheritedList = Array.isArray(inherited?.value)
    ? inherited.value.filter((v): v is string => typeof v === "string")
    : undefined;
  const seedList = inheritedList ?? fallback ?? options?.slice(0, 1) ?? [];
  const table = useFieldLayout() === "table";
  const allowFree = freeSolo !== false;
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value.length > 0,
  );
  const display = locked ? [] : value;
  const normalize = (raw: string): string | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return undefined;
    }
    return parse === undefined ? trimmed : parse(trimmed);
  };

  const commit = (next: readonly (string | { label?: string })[]) => {
    const items: string[] = [];
    for (const item of next) {
      const raw = typeof item === "string" ? item : (item.label ?? "");
      const parsed = normalize(raw);
      if (parsed !== undefined && !items.includes(parsed)) {
        items.push(parsed);
      }
    }
    onChange(items.length === 0 ? undefined : items);
  };

  const rest = (options ?? []).filter((option) => !value.includes(option));
  const presetsMin = allowFree ? PRESETS_MIN : 1;

  const hint = locked
    ? defaultLabelOf((fallback ?? []).join(", "))
    : (placeholder ??
      (allowFree
        ? t("config.chipsHint")
        : table && rest.length > 0
          ? t("config.chipsPick")
          : undefined));
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) =>
          setOverridden(on, () =>
            onChange(on ? [...seedList] : undefined),
          )
        }
      />
    ) : undefined;

  const autocomplete = (
    <Autocomplete
      multiple
      sx={table ? { width: "100%" } : chipsFieldSx}
      readOnly={locked}
      disableClearable={locked}
      open={locked || table ? false : undefined}
      forcePopupIcon={false}
      freeSolo={allowFree}
      autoSelect={allowFree}
      options={options === undefined ? [] : [...options]}
      value={display}
      filterSelectedOptions
      onChange={(_e: SyntheticEvent, next) => {
        if (locked) {
          return;
        }
        commit(next);
      }}
      renderValue={(items, getItemProps) =>
        items.map((item, index) => (
          <Chip
            {...getItemProps({ index })}
            key={`${item}-${index}`}
            label={show(item)}
            size="small"
            deleteIcon={<CloseIcon />}
            sx={valueChipSx}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          variant={table ? "standard" : "outlined"}
          label={table ? undefined : label}
          placeholder={table && display.length > 0 ? undefined : hint}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps?.htmlInput,
              readOnly: locked || (table && !allowFree),
              tabIndex: locked ? -1 : undefined,
            },
            input: {
              ...params.slotProps.input,
              ...(table === true ? { disableUnderline: true } : {}),
              endAdornment: table ? (
                undefined
              ) : (
                <FieldAdornment
                  extra={
                    locked ? undefined : params.slotProps.input.endAdornment
                  }
                  optional={optional}
                  overridden={overridden}
                  onOverridden={(on) =>
                    setOverridden(on, () =>
                      onChange(on ? [...seedList] : undefined),
                    )
                  }
                />
              ),
            },
          }}
          sx={
            table
              ? {
                  width: "100%",
                  ...lockedFieldSx(locked),
                  "& .MuiInputBase-root": {
                    flexWrap: "wrap",
                    alignItems: "center",
                    minHeight: 24,
                  },
                  "& .MuiInputBase-input": {
                    py: 0.25,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  },
                }
              : {
                  ...(wide === true
                    ? { ...fieldSx, gridColumn: "1 / -1" }
                    : fieldSx),
                  ...lockedFieldSx(locked),
                }
          }
        />
      )}
    />
  );

  const presets =
    rest.length < presetsMin ? undefined : (
      <Presets
        items={rest.map((option) => ({ label: show(option), value: option }))}
        min={presetsMin}
        disabled={locked}
        onPick={(next) => setOverridden(true, () => onChange([...value, next]))}
      />
    );

  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        grow
        end={
          presets === undefined && flag === undefined ? undefined : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexShrink: 0,
              }}
            >
              {presets}
              {presets !== undefined && flag !== undefined && (
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ my: 1, borderColor: "divider" }}
                />
              )}
              {flag}
            </Box>
          )
        }
        check={optionalSlot}
      >
        {autocomplete}
      </SettingsRow>
    );
  }

  return <FieldTooltip title={helper} disabled={locked}>{autocomplete}</FieldTooltip>;
}

export function Flag({
  label,
  checked,
  onChange,
  helper,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  helper?: string;
  disabled?: boolean;
}) {
  if (useFieldLayout() === "table") {
    return (
      <SettingsRow label={label} help={helper}>
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
          <Switch
            size="small"
            checked={checked}
            disabled={disabled === true}
            onChange={(e) => onChange(e.target.checked)}
            slotProps={{ input: { "aria-label": label } }}
          />
        </Box>
      </SettingsRow>
    );
  }
  return (
    <Box sx={fieldSx}>
      <FormControlLabel
        sx={{ ml: 0.5 }}
        control={
          <Switch
            size="small"
            checked={checked}
            disabled={disabled === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        }
        label={label}
      />
      {helper !== undefined && helper !== "" && (
        <FormHelperText sx={{ ml: 1.5, mt: 0 }}>{helper}</FormHelperText>
      )}
    </Box>
  );
}

export function InlineFlag({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const hinted = help !== undefined && help !== "";
  const flag = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flexShrink: 0,
        cursor: hinted ? "help" : undefined,
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: "0.66rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          color: disabled === true ? "text.disabled" : "text.secondary",
        }}
      >
        {label}
      </Box>
      <Switch
        size="small"
        checked={checked}
        disabled={disabled === true}
        onChange={(e) => onChange(e.target.checked)}
        slotProps={{ input: { "aria-label": label } }}
      />
    </Box>
  );

  if (!hinted) {
    return flag;
  }

  return (
    <Tooltip
      leaveDelay={200}
      arrow
      title={<HintMarkup text={help} />}
      placement="top-end"
      enterDelay={200}
    >
      {flag}
    </Tooltip>
  );
}

export { NginxEditor } from "./nginx-editor/NginxEditor.tsx";
