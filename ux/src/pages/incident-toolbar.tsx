import { Fragment, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";

import { PAGE_RAIL, TABLE_RAIL } from "../components/PageBar.tsx";
import { useT } from "../i18n/index.ts";
import type { AuditFields } from "./incident-query.ts";

export { emptyFields, type AuditFields } from "./incident-query.ts";

const rowSx = {
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1,
  pl: `${TABLE_RAIL}px`,
  pr: `${PAGE_RAIL}px`,
} as const;

export function Spacer() {
  return <Box sx={{ flex: "1 1 0", minWidth: 0 }} />;
}

export const CHIP_SX = {
  height: 18,
  minHeight: 18,
  "& .MuiChip-label": {
    fontSize: "0.63rem",
    lineHeight: "18px",
    paddingLeft: "5px",
    paddingRight: "5px",
  },
  "& .MuiChip-icon": { fontSize: 11, marginLeft: "4px", marginRight: "-2px" },
  "& .MuiChip-deleteIcon": { fontSize: 11, marginLeft: "-1px", marginRight: "4px" },
} as const;

function SectionToggle({
  title,
  open,
  onOpen,
  marked,
}: {
  title: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  marked: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(!open)}
      aria-expanded={open}
      sx={{
        appearance: "none",
        border: 0,
        bgcolor: "transparent",
        p: 0,
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        cursor: "pointer",
        color: marked ? "primary.main" : open ? "text.primary" : "text.secondary",
        fontFamily: "inherit",
        "&:hover": { color: marked ? "primary.light" : "text.primary" },
      }}
    >
      <ExpandMoreIcon
        sx={{
          fontSize: 16,
          transform: open ? "none" : "rotate(-90deg)",
          transition: "transform .15s",
        }}
      />
      <Typography
        variant="caption"
        sx={{ whiteSpace: "nowrap", fontWeight: 600, letterSpacing: "0.02em" }}
      >
        {title}
      </Typography>
      {marked && (
        <Box
          sx={{
            width: 5,
            height: 5,
            ml: 0.25,
            borderRadius: "50%",
            bgcolor: "primary.main",
          }}
        />
      )}
    </Box>
  );
}

export function ToolbarSection({
  title,
  open,
  onOpen,
  filled = false,
  summary,
  extra,
  gap = 1,
  children,
}: {
  title: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  filled?: boolean;
  summary?: ReactNode;
  extra?: ReactNode;
  gap?: number;
  children: ReactNode;
}) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Stack direction="row" sx={{ ...rowSx, py: "7px", minHeight: 32 }}>
        <SectionToggle title={title} open={open} onOpen={onOpen} marked={filled} />
        {summary}
        <Spacer />
        {extra}
      </Stack>
      <Collapse in={open}>
        <Divider />
        <Stack direction="row" sx={{ ...rowSx, gap, py: 1 }}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
}

const TOOLBAR_FIELD_H = 32;

export function LabeledField({
  label,
  value,
  onChange,
  onClear,
  placeholder,
  width,
  grow,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder: string;
  width: number;
  grow?: boolean;
}) {
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { "aria-label": label },
        input: {
          endAdornment:
            value === "" ? undefined : (
              <IconButton
                size="small"
                aria-label="clear"
                onClick={onClear ?? (() => onChange(""))}
                sx={{ p: 0.25, mr: -0.5 }}
              >
                <CloseIcon sx={{ fontSize: 13 }} />
              </IconButton>
            ),
        },
      }}
      sx={{
        flex: grow === true ? "1 1 auto" : "0 0 auto",
        minWidth: width,
        maxWidth: grow === true ? 460 : width,
        mt: "6px",
        "& .MuiOutlinedInput-root": { height: TOOLBAR_FIELD_H, pr: 0.75 },
        "& .MuiInputBase-input": {
          fontFamily: "monospace",
          fontSize: "0.78rem",
          py: 0,
        },
      }}
    />
  );
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

function readStoredList<T extends string>(key: string, allowed: readonly T[]): T[] | null {
  const raw = readStored(key);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return allowed.filter((item) => parsed.includes(item));
  } catch {
    return null;
  }
}

export function FieldInput({
  value,
  onChange,
  onClear,
  placeholder,
  width,
  grow,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder: string;
  width: number;
  grow?: boolean;
}) {
  return (
    <InputBase
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ "aria-label": placeholder }}
      endAdornment={
        value !== "" ? (
          <IconButton
            size="small"
            aria-label="clear"
            onClick={onClear ?? (() => onChange(""))}
            sx={{ p: 0.25, mr: -0.5 }}
          >
            <CloseIcon sx={{ fontSize: 13 }} />
          </IconButton>
        ) : undefined
      }
      sx={{
        flex: grow === true ? 1 : undefined,
        minWidth: width,
        maxWidth: grow === true ? 420 : width,
        px: 1,
        height: 26,
        borderRadius: "2px",
        border: 1,
        borderColor: value !== "" ? "primary.main" : "divider",
        fontFamily: "monospace",
        fontSize: "0.78rem",
        "& .MuiInputBase-input": { py: 0 },
        "& .MuiInputBase-input::placeholder": { opacity: 0.6 },
      }}
    />
  );
}

export const LIST_COLS = [
  "time",
  "ray",
  "ip",
  "asn",
  "country",
  "phase",
  "method",
  "host",
  "uri",
  "server",
  "route",
  "status",
  "verdict",
  "score",
  "inspector",
  "user",
  "marker",
] as const;

export type ListCol = (typeof LIST_COLS)[number];

export const COL_MIN: Record<ListCol, number> = {
  time: 176,
  ray: 172,
  ip: 190,
  phase: 140,
  method: 118,
  host: 130,
  uri: 190,
  server: 150,
  route: 170,
  status: 92,
  verdict: 140,
  score: 72,
  inspector: 160,
  user: 160,
  marker: 150,
  country: 110,
  asn: 130,
};

export const FIXED_COLS: readonly ListCol[] = ["time", "ray"];

export const RAY_TAIL_MIN = 132;

const RAY_TAIL_KEY = "waf.incidents.rayTail";

export function readRayTail(): boolean {
  return readStored(RAY_TAIL_KEY) === "1";
}

export function writeRayTail(on: boolean) {
  writeStored(RAY_TAIL_KEY, on ? "1" : "0");
}

export function rayTail(ray: string): string {
  const at = ray.lastIndexOf("-");
  return at < 0 ? ray : ray.slice(at + 1);
}

export function RayToggle({
  tail,
  onToggle,
}: {
  tail: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const title = t(tail ? "incidentsPage.rayWhole" : "incidentsPage.rayTail");
  return (
    <IconButton
      size="small"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      sx={{ p: 0.25, mr: -0.5, color: "text.disabled", "&:hover": { color: "text.primary" } }}
    >
      {tail ? (
        <KeyboardDoubleArrowRightIcon sx={{ fontSize: 14 }} />
      ) : (
        <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 14 }} />
      )}
    </IconButton>
  );
}

export const TIME_MS_MIN = 216;

const TIME_MS_KEY = "waf.incidents.timeMs";

export function readTimeMs(): boolean {
  return readStored(TIME_MS_KEY) === "1";
}

export function writeTimeMs(on: boolean) {
  writeStored(TIME_MS_KEY, on ? "1" : "0");
}

const TIME_ASC_KEY = "waf.incidents.timeAsc";

export function readTimeAsc(): boolean {
  return readStored(TIME_ASC_KEY) === "1";
}

export function writeTimeAsc(on: boolean) {
  writeStored(TIME_ASC_KEY, on ? "1" : "0");
}

export function clock(ts: string, withMs = false): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return ts;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  return withMs ? `${stamp}.${String(d.getMilliseconds()).padStart(3, "0")}` : stamp;
}

export function TimeToggle({
  ms,
  onToggle,
}: {
  ms: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const title = t(ms ? "incidentsPage.timeSec" : "incidentsPage.timeMs");
  return (
    <IconButton
      size="small"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      sx={{ p: 0.25, mr: -0.5, color: "text.disabled", "&:hover": { color: "text.primary" } }}
    >
      {ms ? (
        <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 14 }} />
      ) : (
        <KeyboardDoubleArrowRightIcon sx={{ fontSize: 14 }} />
      )}
    </IconButton>
  );
}

export function TimeOrderToggle({
  asc,
  onToggle,
}: {
  asc: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const title = t(asc ? "incidentsPage.orderDesc" : "incidentsPage.orderAsc");
  return (
    <IconButton
      size="small"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      sx={{
        p: 0.25,
        mr: 0.5,
        color: asc ? "primary.main" : "text.disabled",
        "&:hover": { color: asc ? "primary.main" : "text.primary" },
      }}
    >
      {asc ? (
        <ArrowUpwardIcon sx={{ fontSize: 14 }} />
      ) : (
        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
      )}
    </IconButton>
  );
}

const HIDDEN_KEY = "waf.incidents.hiddenColumns";

const HIDDEN_BY_DEFAULT: readonly ListCol[] = ["country", "asn"];

export function readHiddenCols(): ListCol[] {
  return (readStoredList(HIDDEN_KEY, LIST_COLS) ?? [...HIDDEN_BY_DEFAULT]).filter(
    (col) => !FIXED_COLS.includes(col),
  );
}

export function writeHiddenCols(hidden: readonly ListCol[]) {
  writeStored(HIDDEN_KEY, JSON.stringify(hidden));
}

export function visibleCols(
  hidden: readonly ListCol[],
  forced: ReadonlySet<ListCol>,
): ListCol[] {
  return LIST_COLS.filter(
    (col) => FIXED_COLS.includes(col) || forced.has(col) || !hidden.includes(col),
  );
}

export function ColumnPicker({
  hidden,
  forced,
  onChange,
}: {
  hidden: readonly ListCol[];
  forced: ReadonlySet<ListCol>;
  onChange: (next: ListCol[]) => void;
}) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const shown = visibleCols(hidden, forced).length;
  const label =
    hidden.length === 0
      ? t("incidentsPage.columns.label")
      : t("incidentsPage.columns.count", { shown, total: LIST_COLS.length });

  const toggle = (col: ListCol) => {
    onChange(
      hidden.includes(col) ? hidden.filter((row) => row !== col) : [...hidden, col],
    );
  };

  return (
    <>
      <Chip
        size="small"
        variant="outlined"
        icon={<ViewColumnIcon />}
        label={label}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ ...CHIP_SX, color: hidden.length === 0 ? "text.secondary" : "text.primary" }}
      />
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { sx: { mt: 0.5, border: 1, borderColor: "divider", minWidth: 220 } },
        }}
      >
        <Stack sx={{ py: 0.5 }}>
          {LIST_COLS.map((col) => {
            const fixed = FIXED_COLS.includes(col);
            const lifted = !fixed && forced.has(col);
            const locked = fixed || lifted;
            const on = locked || !hidden.includes(col);
            return (
              <Box
                key={col}
                component="label"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.5,
                  py: 0.45,
                  cursor: locked ? "default" : "pointer",
                  "&:hover": { bgcolor: locked ? undefined : "action.hover" },
                }}
              >
                <Checkbox
                  size="small"
                  checked={on}
                  disabled={locked}
                  onChange={() => toggle(col)}
                  sx={{ p: 0 }}
                  slotProps={{ input: { "aria-label": t(`incidentsPage.columns.name.${col}`) } }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    fontSize: "0.8rem",
                    color: on ? "text.primary" : "text.secondary",
                  }}
                >
                  {t(`incidentsPage.columns.name.${col}`)}
                </Typography>
                {locked && (
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    {t(fixed ? "incidentsPage.columns.fixed" : "incidentsPage.columns.forced")}
                  </Typography>
                )}
              </Box>
            );
          })}
          {hidden.length > 0 && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Box
                component="button"
                type="button"
                onClick={() => onChange([])}
                sx={{
                  appearance: "none",
                  border: 0,
                  bgcolor: "transparent",
                  textAlign: "left",
                  px: 1.5,
                  py: 0.5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "primary.main",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                {t("incidentsPage.columns.all")}
              </Box>
            </>
          )}
        </Stack>
      </Popover>
    </>
  );
}

export const SEARCH_KINDS = ["header", "param", "body"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

const SEARCH_FIELDS_KEY = "waf.incidents.searchFields";
const SEARCH_OPEN_KEY = "waf.incidents.searchOpen";

export function readSearchFields(): SearchKind[] {
  return readStoredList(SEARCH_FIELDS_KEY, SEARCH_KINDS) ?? [...SEARCH_KINDS];
}

export function writeSearchFields(fields: readonly SearchKind[]) {
  writeStored(SEARCH_FIELDS_KEY, JSON.stringify(fields));
}

export function readSearchOpen(): boolean {
  return readStored(SEARCH_OPEN_KEY) === "1";
}

export function writeSearchOpen(open: boolean) {
  writeStored(SEARCH_OPEN_KEY, open ? "1" : "0");
}

const FILTERS_OPEN_KEY = "waf.incidents.filtersOpen";

export function readFiltersOpen(): boolean {
  return readStored(FILTERS_OPEN_KEY) !== "0";
}

export function writeFiltersOpen(open: boolean) {
  writeStored(FILTERS_OPEN_KEY, open ? "1" : "0");
}

const GROUP_OPEN_KEY = "waf.incidents.groupOpen";

export function readGroupOpen(): boolean {
  return readStored(GROUP_OPEN_KEY) !== "0";
}

export function writeGroupOpen(open: boolean) {
  writeStored(GROUP_OPEN_KEY, open ? "1" : "0");
}

export function SearchSection({
  open,
  onOpen,
  fields,
  onFields,
  values,
  onChange,
  onClear,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  fields: readonly SearchKind[];
  onFields: (next: SearchKind[]) => void;
  values: Pick<AuditFields, SearchKind>;
  onChange: (kind: SearchKind, value: string) => void;
  onClear: (kind: SearchKind) => void;
}) {
  const t = useT();
  const active = SEARCH_KINDS.filter((kind) => values[kind] !== "");
  const shown = SEARCH_KINDS.filter((kind) => fields.includes(kind) || values[kind] !== "");

  const toggleField = (kind: SearchKind) => {
    if (fields.includes(kind)) {
      onFields(fields.filter((row) => row !== kind));
      if (values[kind] !== "") {
        onClear(kind);
      }
      return;
    }
    onFields([...fields, kind]);
    if (!open) {
      onOpen(true);
    }
  };

  return (
    <ToolbarSection
      title={t("incidentsPage.search.title")}
      open={open}
      onOpen={onOpen}
      gap={2}
      filled={active.length > 0}
      summary={
        open ? undefined : (
          <>
            {active.map((kind) => (
              <Chip
                key={kind}
                size="small"
                variant="outlined"
                color="primary"
                label={`${t(`incidentsPage.search.kind.${kind}`)}: ${values[kind]}`}
                onClick={() => onOpen(true)}
                onDelete={() => onClear(kind)}
                sx={{ ...CHIP_SX, "& .MuiChip-label": { ...CHIP_SX["& .MuiChip-label"], fontFamily: "monospace" } }}
              />
            ))}
          </>
        )
      }
      extra={SEARCH_KINDS.map((kind) => {
        const on = fields.includes(kind);
        return (
          <Chip
            key={kind}
            size="small"
            variant="outlined"
            icon={on ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
            label={t(`incidentsPage.search.kind.${kind}`)}
            onClick={() => toggleField(kind)}
            sx={{
              ...CHIP_SX,
              color: on ? "text.primary" : "text.secondary",
              "& .MuiChip-icon": {
                ...CHIP_SX["& .MuiChip-icon"],
                color: on ? "primary.main" : "text.disabled",
              },
            }}
          />
        );
      })}
    >
      {shown.map((kind) => (
        <LabeledField
          key={kind}
          label={t(`incidentsPage.search.kind.${kind}`)}
          value={values[kind]}
          onChange={(next) => onChange(kind, next)}
          onClear={() => onClear(kind)}
          placeholder={t(`incidentsPage.search.placeholder.${kind}`)}
          width={kind === "body" ? 260 : 220}
          grow={kind === "body"}
        />
      ))}
    </ToolbarSection>
  );
}

export function GroupAxes<D extends string>({
  all,
  chosen,
  label,
  onToggle,
  summary = false,
}: {
  all: readonly D[];
  chosen: readonly D[];
  label: (dim: D) => string;
  onToggle: (dim: D) => void;
  summary?: boolean;
}) {
  const free = summary ? [] : all.filter((dim) => !chosen.includes(dim));
  const chipSx = summary ? CHIP_SX : {};
  const iconSx = summary ? CHIP_SX["& .MuiChip-icon"] : {};
  return (
    <>
      {chosen.map((dim, i) => (
        <Fragment key={dim}>
          {i > 0 && (
            <ChevronRightIcon
              sx={{ fontSize: summary ? 12 : 14, color: "text.disabled", mx: -0.5 }}
            />
          )}
          <Chip
            size="small"
            variant="outlined"
            color="primary"
            label={label(dim)}
            onDelete={() => onToggle(dim)}
            sx={chipSx}
          />
        </Fragment>
      ))}
      {chosen.length > 0 && free.length > 0 && (
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.25 }} />
      )}
      {free.map((dim) => (
        <Chip
          key={dim}
          size="small"
          variant="outlined"
          icon={<AddIcon />}
          label={label(dim)}
          onClick={() => onToggle(dim)}
          sx={{
            ...chipSx,
            color: "text.secondary",
            borderStyle: "dashed",
            "& .MuiChip-icon": { ...iconSx, color: "text.disabled" },
            "&:hover": { color: "text.primary", borderStyle: "solid" },
          }}
        />
      ))}
    </>
  );
}
