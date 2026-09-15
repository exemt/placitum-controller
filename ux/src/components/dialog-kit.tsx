import { useState, type ReactNode } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import InputBase from "@mui/material/InputBase";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type { FilterOption } from "./data-table/index.ts";
import { FieldTooltip, HintMarkup, valueChipSx } from "./fields.tsx";
import { UnitSelect, type UnitOption } from "./settings-table.tsx";
import { HeadHint } from "./table-block.tsx";
import { useT } from "../i18n/index.ts";

export const DIALOG_FIELD_H = 36;

export const DIALOG_RADIUS = "2px";

export const dialogLabelSx = {
  fontSize: "0.68rem",
  color: "text.secondary",
  whiteSpace: "nowrap",
  lineHeight: 1,
} as const;

export const dialogInputSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  px: 0.75,
  height: 28,
  borderRadius: DIALOG_RADIUS,
  border: 1,
  borderColor: "divider",
} as const;

export function DialogRow({
  label,
  hint,
  end,
  children,
}: {
  label: string;
  hint?: string;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography sx={{ ...dialogLabelSx, fontWeight: 600, width: 132, whiteSpace: "normal" }}>
        {label}
      </Typography>
      {children}
      <Box sx={{ flex: 1, minWidth: 0 }} />
      {end}
      {hint !== undefined && <HeadHint text={hint} />}
    </Stack>
  );
}

export function DialogField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 0.5 }}>
        <Typography sx={{ ...dialogLabelSx, fontWeight: 600 }}>{label}</Typography>
        {hint !== undefined && <HeadHint text={hint} />}
      </Stack>
      <Box
        sx={{
          ...dialogInputSx,
          height: "auto",
          minHeight: 28,
          py: 0.25,
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export type DialogOption<T extends string = string> = {
  value: T;
  label: string;
  tag?: string;
  hint?: string;
  missing?: boolean;
};

const optionTagSx = {
  height: 16,
  borderRadius: DIALOG_RADIUS,
  fontFamily: "monospace",
  "& .MuiChip-label": { px: 0.5, fontSize: "0.62rem", lineHeight: "16px" },
} as const;

function OptionTag({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={warn === true ? "warning" : "default"}
      label={text}
      sx={optionTagSx}
    />
  );
}

function OptionRow<T extends string>({
  option,
  mono,
  compact,
}: {
  option: DialogOption<T>;
  mono?: boolean;
  compact?: boolean;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", width: "100%", minWidth: 0 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            fontFamily: mono === true ? "monospace" : "inherit",
            fontSize: "0.78rem",
            fontWeight: 600,
            color: option.missing === true ? "warning.main" : "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {option.label}
        </Box>
        {compact !== true && option.hint !== undefined && option.hint !== "" && (
          <Box sx={{ fontSize: "0.66rem", color: "text.secondary", lineHeight: 1.4 }}>
            {option.hint}
          </Box>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 8 }} />
      {option.tag !== undefined && option.tag !== "" && (
        <OptionTag text={option.tag} warn={option.missing} />
      )}
    </Stack>
  );
}

export function DialogPick<T extends string>({
  label,
  hint,
  value,
  options,
  disabled,
  mono,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly DialogOption<T>[];
  disabled?: boolean;
  mono?: boolean;
  onChange: (next: T) => void;
}) {
  const current = options.find((item) => item.value === value);
  return (
    <FieldTooltip title={hint} disabled={disabled}>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        slotProps={{
          inputLabel: { shrink: true },
          select: {
            displayEmpty: true,
            renderValue: () =>
              current === undefined ? (
                <Box component="span" sx={{ color: "text.disabled" }}>
                  {String(value)}
                </Box>
              ) : (
                <OptionRow option={current} mono={mono} compact />
              ),
            MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } },
          },
        }}
        sx={{
          "& .MuiOutlinedInput-root": { minHeight: DIALOG_FIELD_H },
          "& .MuiSelect-select": {
            py: 0,
            minHeight: "unset",
            display: "flex",
            alignItems: "center",
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} sx={{ py: 0.5 }}>
            <OptionRow option={option} mono={mono} />
          </MenuItem>
        ))}
      </TextField>
    </FieldTooltip>
  );
}

export function DialogMulti<T extends string>({
  label,
  hint,
  value,
  options,
  emptyLabel,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: readonly T[];
  options: readonly DialogOption<T>[];
  emptyLabel: string;
  disabled?: boolean;
  onChange: (next: T[]) => void;
}) {
  const labelOf = (item: T) => options.find((option) => option.value === item)?.label ?? item;

  return (
    <FieldTooltip title={hint} disabled={disabled}>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={[...value]}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value as unknown;

          onChange((typeof raw === "string" ? raw.split(",") : raw) as T[]);
        }}
        slotProps={{
          inputLabel: { shrink: true },
          select: {
            multiple: true,
            displayEmpty: true,
            renderValue: (selected) => {
              const items = selected as T[];

              if (items.length === 0) {
                return (
                  <Box component="span" sx={{ color: "text.disabled" }}>
                    {emptyLabel}
                  </Box>
                );
              }

              return (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {items.map((item) => (
                    <Chip
                      key={item}
                      size="small"
                      label={labelOf(item)}
                      sx={valueChipSx}
                      deleteIcon={<CloseIcon onMouseDown={(e) => e.stopPropagation()} />}
                      onDelete={
                        disabled === true
                          ? undefined
                          : () => onChange(value.filter((row) => row !== item))
                      }
                    />
                  ))}
                </Box>
              );
            },
            MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } },
          },
        }}
        sx={{
          "& .MuiOutlinedInput-root": { minHeight: DIALOG_FIELD_H },
          "& .MuiSelect-select": {
            py: 0.5,
            minHeight: "unset",
            display: "flex",
            alignItems: "center",
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} sx={{ py: 0.5 }}>
            <OptionRow option={option} />
          </MenuItem>
        ))}
      </TextField>
    </FieldTooltip>
  );
}

export function DialogInput({
  label,
  hint,
  value,
  placeholder,
  disabled,
  error,
  mono = true,
  end,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  mono?: boolean;
  end?: ReactNode;
  onChange: (next: string) => void;
}) {
  return (
    <FieldTooltip title={hint} disabled={disabled}>
      <TextField
        fullWidth
        size="small"
        label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        error={error === true}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          inputLabel: { shrink: true },
          ...(end === undefined
            ? {}
            : {
                input: {
                  endAdornment: (
                    <InputAdornment position="end" sx={{ ml: 0.5, mr: -0.25 }}>
                      {end}
                    </InputAdornment>
                  ),
                },
              }),
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            minHeight: DIALOG_FIELD_H,
            ...(end === undefined ? {} : { pr: 0.75 }),
          },
          "& .MuiInputBase-input": {
            fontFamily: mono ? "monospace" : "inherit",
            fontSize: "0.78rem",
            fontWeight: 600,
            py: 0,
          },
        }}
      />
    </FieldTooltip>
  );
}

export function DialogUnit<T extends string>({
  label,
  hint,
  value,
  unit,
  units,
  placeholder,
  disabled,
  onChange,
  onUnit,
}: {
  label: string;
  hint?: string;
  value: string;
  unit: T;
  units: readonly UnitOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onUnit: (next: T) => void;
}) {
  return (
    <FieldTooltip title={hint} disabled={disabled}>
      <TextField
        fullWidth
        size="small"
        label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={{ ml: 0.5, mr: -0.5 }}>
                <UnitSelect
                  value={unit}
                  options={units}
                  width={58}
                  disabled={disabled}
                  label={label}
                  onChange={onUnit}
                />
              </InputAdornment>
            ),
          },
        }}
        sx={{
          "& .MuiOutlinedInput-root": { minHeight: DIALOG_FIELD_H, pr: 0.75 },
          "& .MuiInputBase-input": {
            fontFamily: "monospace",
            fontSize: "0.78rem",
            fontWeight: 600,
            py: 0,
          },
        }}
      />
    </FieldTooltip>
  );
}

export function DialogFrame({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <FieldTooltip title={hint}>
      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          minHeight: DIALOG_FIELD_H,
          px: 1.25,
          py: 0.25,
          border: 1,
          borderColor: "divider",
          borderRadius: DIALOG_RADIUS,
          "&:hover": { borderColor: "text.disabled" },
        }}
      >
        <Typography
          component="span"
          sx={{
            position: "absolute",
            top: -7,
            left: 10,
            px: 0.5,
            bgcolor: "background.paper",
            fontSize: "0.75rem",
            lineHeight: 1,
            color: "text.secondary",
          }}
        >
          {label}
        </Typography>
        <Box sx={{ width: "100%", minWidth: 0 }}>{children}</Box>
      </Box>
    </FieldTooltip>
  );
}

export function DialogText({
  value,
  placeholder,
  width = 180,
  mono,
  disabled,
  onChange,
}: {
  value: string;
  placeholder?: string;
  width?: number;
  mono?: boolean;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <InputBase
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ "aria-label": placeholder }}
      sx={{
        ...dialogInputSx,
        width,
        fontFamily: mono === true ? "monospace" : "inherit",
        "& .MuiInputBase-input::placeholder": { opacity: 0.55 },
      }}
    />
  );
}

export function DialogSelect<T extends string>({
  value,
  options,
  width = 180,
  disabled,
  onChange,
}: {
  value: T;
  options: readonly FilterOption<T>[];
  width?: number;
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <Select
      value={value}
      variant="standard"
      disableUnderline
      displayEmpty
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      renderValue={(current) =>
        options.find((item) => item.value === current)?.label ?? String(current)
      }
      sx={{
        ...dialogInputSx,
        width,
        "& .MuiSelect-select": {
          py: 0,
          height: "100%",
          display: "flex",
          alignItems: "center",
          boxSizing: "border-box",
        },
        "& .MuiSelect-icon": { fontSize: 18, color: "text.secondary" },
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
                sx={{ fontSize: "0.65rem", color: "text.secondary", fontFamily: "monospace" }}
              >
                {item.hint}
              </Box>
            </Box>
          )}
        </MenuItem>
      ))}
    </Select>
  );
}

export interface DialogLine {
  text: string;
  muted?: boolean;
}

export function DialogCode({
  lines,
  empty,
}: {
  lines: readonly DialogLine[];
  empty?: string;
}) {
  if (lines.length === 0) {
    return <Typography sx={{ ...dialogLabelSx, opacity: 0.7 }}>{empty}</Typography>;
  }

  return (
    <Box
      component="code"
      sx={{
        display: "block",
        fontSize: "0.74rem",
        lineHeight: 1.5,
        fontFamily: "monospace",
        color: "text.secondary",
        whiteSpace: "pre",
        overflowX: "auto",
      }}
    >
      {lines.map((line, index) => (
        <Box
          key={index}
          component="span"
          sx={{ display: "block", opacity: line.muted === true ? 0.55 : 1 }}
        >
          {line.text}
        </Box>
      ))}
    </Box>
  );
}

function DialogHint({ text }: { text: string }) {
  const t = useT();
  return (
    <Tooltip
      arrow
      title={<HintMarkup text={text} />}
      placement="top-end"
      enterDelay={200}
    >
      <Box
        component="span"
        sx={{
          fontSize: "0.66rem",
          lineHeight: 1,
          color: "primary.main",
          cursor: "help",
          whiteSpace: "nowrap",
          textDecoration: "underline dotted",
          textUnderlineOffset: "3px",
        }}
      >
        {t("common.hint")}
      </Box>
    </Tooltip>
  );
}

const blockBodySx = {
  px: 1.25,
  py: 0.75,
  borderRadius: DIALOG_RADIUS,
  bgcolor: "background.default",
  border: 1,
  borderColor: "divider",
} as const;

export function DialogBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", mb: 1, minWidth: 0 }}
      >
        <Typography
          sx={{ ...dialogLabelSx, fontWeight: 600, textTransform: "uppercase" }}
        >
          {title}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 8 }} />
        {hint !== undefined && hint !== "" && <DialogHint text={hint} />}
      </Stack>
      <Box sx={blockBodySx}>{children}</Box>
    </Box>
  );
}

export function DialogEmitted({
  label,
  hint,
  lines,
  empty,
}: {
  label: string;
  hint?: string;
  lines: readonly DialogLine[];
  empty: string;
}) {
  return (
    <DialogBlock title={label} hint={hint}>
      <DialogCode lines={lines} empty={empty} />
    </DialogBlock>
  );
}

export function DialogLines({
  title,
  hint,
  lines,
  empty,
}: {
  title: string;
  hint?: string;
  lines: readonly string[];
  empty?: string;
}) {
  return (
    <DialogBlock title={title} hint={hint}>
      {lines.length === 0 && empty !== undefined ? (
        <Box sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{empty}</Box>
      ) : (
        lines.map((line) => (
          <Box
            key={line}
            component="code"
            sx={{
              display: "block",
              fontSize: "0.72rem",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            {line}
          </Box>
        ))
      )}
    </DialogBlock>
  );
}

export function DialogNote({
  title,
  hint,
  lines,
}: {
  title: string;
  hint?: string;
  lines: readonly DialogLine[];
}) {
  return (
    <DialogBlock title={title} hint={hint}>
      {lines.map((line) => (
        <Box
          key={line.text}
          sx={{
            fontSize: "0.72rem",
            lineHeight: 1.6,
            color: line.muted === true ? "text.secondary" : "text.primary",
          }}
        >
          {line.text}
        </Box>
      ))}
    </DialogBlock>
  );
}

export function DialogSection({
  title,
  hint,
  summary,
  checked,
  onCheck,
  open,
  onToggle,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  summary?: string;
  checked?: boolean;
  onCheck?: (next: boolean) => void;
  open?: boolean;
  onToggle?: (next: boolean) => void;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const expanded = open ?? own;
  const off = onCheck !== undefined && checked !== true;

  return (
    <Accordion
      expanded={expanded && !off}
      onChange={(_, next) => {
        if (off) {
          return;
        }
        if (open === undefined) {
          setOwn(next);
        }
        onToggle?.(next);
      }}
      disableGutters
      variant="outlined"
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{
        borderRadius: DIALOG_RADIUS,
        overflow: "hidden",
        "&:before": { display: "none" },
        "& .MuiAccordionSummary-root": {
          minHeight: 0,
          px: 1.25,
          ...(off ? { cursor: "default" } : {}),
        },
        "& .MuiAccordionSummary-content": { my: 0.75, minWidth: 0 },
        "& .MuiAccordionSummary-content.Mui-expanded": { my: 0.75 },
        "& .MuiAccordionDetails-root": { px: 1.25, pt: 0.5, pb: 1.5 },
      }}
    >
      <AccordionSummary
        expandIcon={
          off ? undefined : <ExpandMoreIcon sx={{ fontSize: 18 }} />
        }
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0, width: "100%" }}>
          {onCheck !== undefined && (
            <Switch
              size="small"
              checked={checked === true}
              onClick={(event) => event.stopPropagation()}
              onChange={(_, next) => {
                onCheck(next);
                if (next && open === undefined) {
                  setOwn(true);
                }
              }}
              slotProps={{ input: { "aria-label": title } }}
              sx={{ flexShrink: 0 }}
            />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, lineHeight: 1.3 }}>
              {title}
            </Typography>
            {hint !== undefined && hint !== "" && (
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  lineHeight: 1.35,
                  color: "text.secondary",
                  opacity: 0.7,
                }}
              >
                {hint}
              </Typography>
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 8 }} />
          {summary !== undefined && summary !== "" && (
            <Typography
              sx={{
                fontSize: "0.7rem",
                color: "text.secondary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "45%",
              }}
            >
              {summary}
            </Typography>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>{children}</Stack>
      </AccordionDetails>
    </Accordion>
  );
}

export function DialogAlert({
  text,
  tone = "info",
  help,
}: {
  text: string;
  tone?: "info" | "warning";
  help?: string;
}) {
  const t = useT();

  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.75,
        borderRadius: DIALOG_RADIUS,
        borderLeft: "2px solid",
        borderLeftColor: tone === "warning" ? "warning.main" : "divider",
        bgcolor: (theme) =>
          tone === "warning"
            ? alpha(theme.palette.warning.main, 0.08)
            : theme.palette.mode === "dark"
              ? "rgba(255, 255, 255, 0.04)"
              : "rgba(0, 0, 0, 0.03)",
        color: "text.secondary",
        fontSize: "0.72rem",
      }}
    >
      <HintMarkup text={text} />
      {help !== undefined && (
        <Link
          href={`/help/${help}`}
          target="_blank"
          rel="noopener"
          sx={{ display: "inline-block", mt: 0.5, fontSize: "0.72rem" }}
        >
          {t("common.helpMore")}
        </Link>
      )}
    </Box>
  );
}

export type WhenOutcome = "deny" | "allow";

const WHEN_STATES: readonly { key: string; value: WhenOutcome[] }[] = [
  { key: "tail.whenSummaryAny", value: [] },
  { key: "tail.whenSummaryDeny", value: ["deny"] },
  { key: "tail.whenSummaryAllow", value: ["allow"] },
  { key: "tail.whenSummaryBoth", value: ["allow", "deny"] },
];

export function DialogWhen({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: readonly WhenOutcome[];
  onChange: (next: WhenOutcome[]) => void;
}) {
  const t = useT();
  const key = [...value].sort().join(",");

  return (
    <DialogPick
      label={label}
      hint={hint}
      value={key}
      options={WHEN_STATES.map((state) => ({
        value: [...state.value].sort().join(","),
        label: t(state.key),
      }))}
      onChange={(next) =>
        onChange(WHEN_STATES.find((state) => [...state.value].sort().join(",") === next)?.value ?? [])
      }
    />
  );
}
