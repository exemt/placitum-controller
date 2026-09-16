import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";

import type { SenderCode } from "../api.ts";
import { DIALOG_FIELD_H } from "./dialog-kit.tsx";
import { FieldTooltip, valueChipSx } from "./fields.tsx";
import type { Translate } from "../i18n/index.ts";

export function verbLabel(t: Translate, verb: string): string {
  const key = `actions.verbs.${verb}.label`;
  const label = t(key);

  return label === key ? verb : label;
}

export function axisLabel(t: Translate, axis: string): string {
  const key = `actions.axes.${axis}`;
  const label = t(key);

  return label === key ? axis : label;
}

export const ACTION_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

export function ActionCodesField({
  label,
  hint,
  anyLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  anyLabel: string;
  value: string[];
  options: readonly SenderCode[];
  onChange: (next: string[]) => void;
}) {
  const bad = value.filter((code) => !ACTION_CODE_RE.test(code));

  return (
    <FieldTooltip title={hint}>
      <Autocomplete<SenderCode, true, false, true>
        multiple
        freeSolo
        autoSelect
        fullWidth
        size="small"
        options={options.filter((option) => !value.includes(option.code))}
        value={value}
        getOptionLabel={(option) => (typeof option === "string" ? option : option.code)}
        isOptionEqualToValue={(option, chosen) =>
          option.code === (typeof chosen === "string" ? chosen : chosen.code)
        }
        filterOptions={(list, { inputValue }) => {
          const query = inputValue.trim().toLowerCase();

          if (query === "") {
            return list;
          }

          return list.filter((option) =>
            [option.code, ...option.by.map((by) => `${by.inspector} ${by.profile}`)]
              .join(" ")
              .toLowerCase()
              .includes(query),
          );
        }}
        onChange={(_e, next) =>
          onChange(
            [
              ...new Set(
                next.map((item) =>
                  (typeof item === "string" ? item : item.code).trim().toUpperCase(),
                ),
              ),
            ].filter((code) => code !== ""),
          )
        }
        renderValue={(items, getItemProps) =>
          items.map((item, index) => {
            const code = typeof item === "string" ? item : item.code;

            return (
              <Chip
                {...getItemProps({ index })}
                key={`${code}-${index}`}
                size="small"
                label={code}
                color={ACTION_CODE_RE.test(code) ? "default" : "error"}
                deleteIcon={<CloseIcon />}
                sx={valueChipSx}
              />
            );
          })
        }
        renderOption={(props, option) => {
          const { key, ...rest } = props as typeof props & { key: string };

          return (
            <Box
              component="li"
              key={key}
              {...rest}
              sx={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 1.5,
              }}
            >
              <Box
                component="span"
                sx={{ fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 600 }}
              >
                {option.code}
              </Box>
              <Box
                component="span"
                sx={{ color: "text.secondary", fontSize: "0.72rem", textAlign: "right" }}
              >
                {option.by.map((by) => `${by.inspector} · ${by.profile}`).join(", ")}
              </Box>
            </Box>
          );
        }}
        slotProps={{ listbox: { sx: { py: 0.5 } }, popper: { sx: { minWidth: 320 } } }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={value.length === 0 ? anyLabel : undefined}
            error={bad.length > 0}
            helperText={bad.length > 0 ? `[A-Z][A-Z0-9_]*: ${bad.join(", ")}` : undefined}
            slotProps={{ ...params.slotProps, inputLabel: { shrink: true } }}
            sx={{
              "& .MuiOutlinedInput-root": { minHeight: DIALOG_FIELD_H, py: 0.5 },
              "& .MuiInputBase-input": {
                fontFamily: "monospace",
                fontSize: "0.78rem",
                fontWeight: 600,
                py: 0,
                minWidth: 48,
              },
              "& .MuiInputBase-input::placeholder": { opacity: 0.55 },
            }}
          />
        )}
      />
    </FieldTooltip>
  );
}
