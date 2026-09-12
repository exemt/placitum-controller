/*
 * Выбор нескольких значений из каталога с набором текстом.
 *
 * Селектор со списком годится на десяток пунктов; у путей и серверов их
 * десятки, и в них ищут глазами. Здесь список сужается набором: в поле
 * печатают кусок имени, галочками отмечают нужные, поле показывает сводку
 * выбранного вместо чипов -- чипы не влезают в ячейку шапки высотой 36px.
 *
 * Значение -- список ключей (uuid пути, имя блока server), а не подписей:
 * подпись берётся из каталога, а неизвестный ключ (путь удалён, чужой
 * контур) остаётся в выборе как есть -- снять его можно, потерять нельзя.
 */

import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import InputBase from "@mui/material/InputBase";
import type { SxProps, Theme } from "@mui/material/styles";

import { FilterCell, filterInputSx } from "./data-table/FilterCell.tsx";

export type PickOption = { value: string; label: string };

function PickMulti({
  value,
  onChange,
  options,
  placeholder,
  inputSx,
}: {
  value: readonly string[];
  onChange: (value: string[]) => void;
  options: readonly PickOption[];
  placeholder: string;
  inputSx: SxProps<Theme>;
}) {
  const [text, setText] = useState("");
  const labelOf = (id: string) => options.find((row) => row.value === id)?.label ?? id;
  const chosen = value.map(
    (id) => options.find((row) => row.value === id) ?? { value: id, label: id },
  );
  const summary = value.length === 0 ? placeholder : value.map(labelOf).join(", ");

  return (
    <Autocomplete
      multiple
      disableCloseOnSelect
      disableClearable
      forcePopupIcon={false}
      fullWidth
      size="small"
      options={options}
      value={chosen}
      inputValue={text}
      // Сброс после выбора и на уходе -- иначе набранное висит поверх сводки.
      onInputChange={(_, next, reason) => setText(reason === "reset" ? "" : next)}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      getOptionLabel={(row) => row.label}
      onChange={(_, list) => onChange(list.map((row) => row.value))}
      renderValue={() => null}
      slotProps={{
        popper: { sx: { minWidth: 360 } },
        listbox: { sx: { fontSize: "0.8rem", py: 0.5 } },
      }}
      renderOption={(props, option, { selected }) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <li key={key} {...rest} style={{ padding: "2px 8px" }}>
            <Checkbox size="small" checked={selected} sx={{ p: 0.25, mr: 0.5 }} />
            {option.label}
          </li>
        );
      }}
      renderInput={(params) => (
        <InputBase
          ref={params.slotProps.input.ref}
          className={params.slotProps.input.className}
          onMouseDown={params.slotProps.input.onMouseDown}
          inputProps={{ ...params.slotProps.htmlInput, "aria-label": placeholder }}
          placeholder={summary}
          title={summary}
          sx={inputSx}
        />
      )}
      sx={{ height: "100%" }}
    />
  );
}

/** Выбор в ячейке шапки таблицы фильтров: тот же вид, что у FilterText. */
export function FilterPick({
  value,
  onChange,
  options,
  placeholder,
  width,
  minWidth,
}: {
  value: readonly string[];
  onChange: (value: string[]) => void;
  options: readonly PickOption[];
  placeholder: string;
  width?: number | string;
  /** Пол ширины колонки: см. [FilterCell]. */
  minWidth?: number | string;
}) {
  const active = value.length > 0;
  return (
    <FilterCell active={active} width={width} minWidth={minWidth}>
      <Box sx={{ width: "100%", height: "100%" }} onClick={(e) => e.stopPropagation()}>
        <PickMulti
          value={value}
          onChange={onChange}
          options={options}
          placeholder={placeholder}
          inputSx={{
            ...filterInputSx,
            fontFamily: "monospace",
            /*
             * Сводка выбранного живёт в placeholder: пока не набирают, поле
             * пусто, и сводка читается как значение -- без прозрачности и
             * капслока, которыми отмечен настоящий placeholder.
             */
            "& .MuiInputBase-input::placeholder": {
              textTransform: active ? "none" : "uppercase",
              letterSpacing: active ? "0.02em" : "0.04em",
              opacity: active ? 1 : 0.55,
              color: "inherit",
            },
          }}
        />
      </Box>
    </FilterCell>
  );
}

/** Выбор в панели фильтров над группами: рамка и размеры как у FieldSelect. */
export function FieldPick({
  value,
  onChange,
  options,
  placeholder,
  width,
}: {
  value: readonly string[];
  onChange: (value: string[]) => void;
  options: readonly PickOption[];
  placeholder: string;
  width: number;
}) {
  const active = value.length > 0;
  return (
    <Box
      sx={{
        minWidth: width,
        maxWidth: width,
        height: 26,
        px: 1,
        border: 1,
        borderColor: active ? "primary.main" : "divider",
        borderRadius: "2px",
        display: "flex",
        alignItems: "center",
        color: active ? "text.primary" : "text.secondary",
      }}
    >
      <PickMulti
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        inputSx={{
          width: "100%",
          height: "100%",
          fontSize: "0.78rem",
          fontFamily: "monospace",
          color: "inherit",
          "& .MuiInputBase-input": { py: 0, height: "100%", boxSizing: "border-box" },
          "& .MuiInputBase-input::placeholder": {
            opacity: active ? 1 : 0.7,
            color: "inherit",
          },
        }}
      />
    </Box>
  );
}
