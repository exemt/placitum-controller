/*
  Редакторы первого уровня для строк решений маршрута (`InheritedRow`).

  Это та же метрика, что у полей ядра nginx в таблице (`components/fields.tsx`,
  табличная ветка): значение 0.75rem/600, чипы подстановок у правого края
  ячейки, единица в правом слоте. Здесь нет галочки «умолчание» -- её место
  занимает чип источника («из http», «вместо on»), и нет селектов: выбор из
  двух-трёх вариантов делается чипами, как у `Tri` и `Choice` на странице http.

  Редакторы второго уровня (`editors.tsx`, `AuditEdit.tsx`, `LocalRules.tsx`)
  остаются у ключей с несколькими параметрами: там внутри ячейки стоит
  подстрока, и метрика подстроки -- её собственная.
*/
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";

import { filterInputSx } from "../components/data-table/index.ts";
import { Presets } from "../components/settings-table.tsx";
import { useT } from "../i18n/index.ts";
import type { InheritedCtx } from "./InheritedRow.tsx";

const inputSx = {
  ...filterInputSx,
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
    {
      WebkitAppearance: "none",
      margin: 0,
    },
} as const;

/** Полное имя варианта: `block — заблокировать`. Чипу хватает короткого. */
function optionLabel(t: (key: string) => string, option: string): string {
  const path = `config.option.${option}`;
  const text = t(path);
  return text === path ? option : text;
}

/**
 * Значение-выбор: в ячейке -- имя действующего варианта, справа -- чипы всех
 * вариантов. Клик по чипу, который уже стоит своим значением, снимает ключ:
 * это возврат к унаследованному тем же движением, что и выбор.
 */
export function PickValue({ value }: { value: unknown }) {
  const t = useT();
  const current = typeof value === "string" ? value : undefined;
  return (
    <Box
      sx={{
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: current === undefined ? "text.secondary" : "text.primary",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {current === undefined ? t("inherit.unset") : optionLabel(t, current)}
    </Box>
  );
}

export function pickPresets(
  row: InheritedCtx,
  options: readonly string[],
  encode: (option: string) => unknown = (option) => option,
  decode: (value: unknown) => string | undefined = (value) =>
    typeof value === "string" ? value : undefined,
) {
  const current = decode(row.value);
  return (
    <Presets
      items={options.map((option) => ({ label: option, value: option }))}
      current={current}
      onPick={(next) => {
        if (!row.inheriting && next === current) {
          row.drop();
          return;
        }
        row.set(encode(next));
      }}
    />
  );
}

/** Булево значение теми же чипами, что `Tri` на странице http. */
export const BOOL_OPTIONS = ["on", "off"] as const;

export function boolToOption(value: unknown): string | undefined {
  return value === true ? "on" : value === false ? "off" : undefined;
}

export function optionToBool(option: string): boolean {
  return option === "on";
}

/** Число или текст одной строкой: метрика поля фильтра, как у `Num`/`Text`. */
export function RowInput({
  value,
  onChange,
  number,
  placeholder,
  mono,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  number?: boolean;
  placeholder?: string;
  mono?: boolean;
}) {
  const text =
    typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  return (
    <InputBase
      value={text}
      type={number === true ? "number" : "text"}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        if (number !== true) {
          onChange(raw);
          return;
        }
        const trimmed = raw.trim();
        if (trimmed === "") {
          onChange(undefined);
          return;
        }
        const n = Number(trimmed);
        if (Number.isFinite(n)) {
          onChange(n);
        }
      }}
      sx={mono === true ? { ...inputSx, fontFamily: "monospace" } : inputSx}
    />
  );
}

/**
 * Список слов одной строкой: пробел и запятая разделяют одинаково. Текст
 * живёт локально и разбирается на выходе: иначе пробел в конце строки
 * срезался бы разбором раньше, чем за ним появилось следующее слово.
 */
export function RowList({
  value,
  onChange,
  placeholder,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  placeholder?: string;
}) {
  const items = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
  const joined = items.join(" ");
  const [text, setText] = useState(joined);
  useEffect(() => {
    setText((cur) => (split(cur).join(" ") === joined ? cur : joined));
  }, [joined]);
  return (
    <InputBase
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(split(e.target.value));
      }}
      sx={{ ...inputSx, fontFamily: "monospace" }}
    />
  );
}

function split(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Подстановки числа или строки: чип подставляет значение как своё. */
export function valuePresets(row: InheritedCtx, presets: readonly (number | string)[]) {
  const current = row.value;
  return (
    <Presets
      items={presets.map((item) => ({ label: String(item), value: item }))}
      current={row.inheriting ? undefined : (current as number | string | undefined)}
      onPick={(next) => {
        if (!row.inheriting && next === current) {
          row.drop();
          return;
        }
        row.set(next);
      }}
    />
  );
}
