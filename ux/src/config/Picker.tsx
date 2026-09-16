import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";

import { useT } from "../i18n/index.ts";

export interface PickerOption {
  value: string;
  hint?: string;
  group?: string;
  label?: string;
  disabled?: boolean;
  note?: string;
}

export function Picker({
  value,
  onChange,
  options,
  placeholder,
  free,
  unknownLabel,
  plain,
  width,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  options: PickerOption[];
  placeholder?: string;
  free?: boolean;
  unknownLabel?: string;
  plain?: boolean;
  width?: number | string;
  disabled?: boolean;
}) {
  const t = useT();
  const known = options.some((o) => o.value === value);
  const grouped = options.some((o) => o.group !== undefined);

  return (
    <Autocomplete
      size="small"
      freeSolo={free === true}
      autoHighlight
      openOnFocus
      disabled={disabled === true}
      disableClearable={false}
      value={value === "" ? null : value}
      options={options.map((o) => o.value)}
      getOptionLabel={(v) => options.find((o) => o.value === v)?.label ?? v}
      groupBy={grouped ? (v) => options.find((o) => o.value === v)?.group ?? "" : undefined}
      getOptionDisabled={(v) => options.find((o) => o.value === v)?.disabled === true}
      filterOptions={(values, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (q === "") {
          return values;
        }
        return values.filter((v) => {
          const row = options.find((o) => o.value === v);
          return [row?.label ?? v, row?.hint].some(
            (s) => s !== undefined && s.toLowerCase().includes(q),
          );
        });
      }}
      slotProps={{
        listbox: {
          sx: { '& .MuiAutocomplete-option[aria-disabled="true"]': { opacity: 0.62 } },
        },
      }}
      onChange={(_, next) => onChange(next ?? "")}
      onInputChange={(_, next, reason) => {
        if (free === true && reason === "input") {
          onChange(next);
        }
      }}
      renderOption={(props, option) => {
        const row = options.find((o) => o.value === option);
        const { key, ...rest } = props as { key?: string } & Record<string, unknown>;
        return (
          <Box
            component="li"
            key={key ?? option}
            {...rest}
            sx={{ display: "flex", gap: 1, fontSize: "0.8rem" }}
          >
            {row?.note !== undefined && (
              <Box component="span" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                {row.note}
              </Box>
            )}
            {row?.label === undefined ? (
              <Box component="code">{option}</Box>
            ) : (
              <Box component="span">{row.label}</Box>
            )}
            <Box sx={{ flex: 1 }} />
            {row?.hint !== undefined && (
              <Box component="span" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                {row.hint}
              </Box>
            )}
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          variant={plain === true ? "standard" : "outlined"}
          placeholder={placeholder ?? t("catalog.pick")}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps?.input,
              ...(plain === true ? { disableUnderline: true } : {}),
              ...(value !== "" && !known
                ? {
                    startAdornment: (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={unknownLabel ?? t("catalog.unknown")}
                        sx={{ height: 20, fontSize: "0.66rem", mr: 0.5 }}
                      />
                    ),
                  }
                : {}),
            },
          }}
          sx={
            plain === true
              ? {
                  "& .MuiInputBase-root": {
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    py: 0,
                    height: 24,
                  },
                  "& input": { p: "0 !important" },
                  "& .MuiAutocomplete-endAdornment .MuiIconButton-root": {
                    p: 0,
                    width: 20,
                    height: 20,
                    borderRadius: "3px",
                  },
                  "& .MuiAutocomplete-endAdornment .MuiSvgIcon-root": {
                    fontSize: 16,
                  },
                }
              : { "& .MuiInputBase-root": { fontSize: "0.8rem" } }
          }
        />
      )}
      sx={{ width: width ?? "100%" }}
    />
  );
}
