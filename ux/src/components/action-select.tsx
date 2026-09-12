/**
 * Общие элементы настройки действий между инспекторами.
 *
 * У канала две стороны -- страница отправителя (правила ip) и правила приёма
 * в профиле получателя (prior капчи), -- и обе называют одно и то же одними
 * словами: подписи глаголов и осей живут в неймспейсе `actions` i18n, а не в
 * неймспейсе страницы. Сам словарь -- глаголы, оси, допустимые пары --
 * приезжает с `GET /api/actions`; здесь только то, как его показать.
 */

import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";

import type { SenderCode } from "../api.ts";
import { DIALOG_FIELD_H } from "./dialog-kit.tsx";
import { FieldTooltip, valueChipSx } from "./fields.tsx";
import type { Translate } from "../i18n/index.ts";

/**
 * Человеческое имя глагола. Незнакомый глагол печатается как есть: словарь
 * расширяется контроллером раньше, чем панель узнаёт про подпись, и сырое имя
 * честнее пути ключа i18n.
 */
export function verbLabel(t: Translate, verb: string): string {
  const key = `actions.verbs.${verb}.label`;
  const label = t(key);

  return label === key ? verb : label;
}

/** Человеческое имя оси. Незнакомая ось печатается как есть, как у глагола. */
export function axisLabel(t: Translate, axis: string): string {
  const key = `actions.axes.${axis}`;
  const label = t(key);

  return label === key ? axis : label;
}

/**
 * Повод: [A-Z][A-Z0-9_]*, до 64 байт -- то же ограничение, которым модуль
 * отбраковывает действие с провода (docs/inspector-actions.md, «Повод»).
 */
export const ACTION_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * Поле поводов: чипы со свободным вводом.
 *
 * Подсказки -- поводы, объявленные профилями отправителей контура: список один
 * на пространство, а не «что шлют этому инспектору». Правило приёма пишут
 * раньше, чем сосед начнёт слать повод именно сюда, и список, отфильтрованный
 * по адресату, молчал бы ровно тогда, когда нужен. Зато у каждой строки видно
 * объявителя -- процесс и профиль, -- и выбирает оператор.
 *
 * Словарём поле не становится: повод -- произвольная строка пары
 * отправитель-получатель, профили, приезжающие файлами, контроллеру не видны,
 * и своё значение вводится руками. Набранное ищется и по коду, и по
 * объявителю: «counter» покажет всё, что объявил счётчик.
 *
 * Пустое поле -- «любой повод», и об этом говорит подстановка, а не пустота.
 * Ввод поднимается в верхний регистр сам: повод -- машинный код, и раскладка
 * не должна делать два разных кода из одного слова.
 *
 * Поле окна: подпись на рамке и метрика `dialog-kit`, подсказка наведением.
 * Под полем стоит только отказ -- повод не по алфавиту провода: он объясняет,
 * почему главная кнопка окна погашена, и это не подсказка, а причина.
 */
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
  /** Подстановка пустого поля: «любой». */
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
        /*
         * Значение -- всегда строка: выбранная подсказка сводится к коду
         * (`by` живёт только в списке), набранное руками -- к самому себе.
         */
        getOptionLabel={(option) => (typeof option === "string" ? option : option.code)}
        isOptionEqualToValue={(option, chosen) =>
          option.code === (typeof chosen === "string" ? chosen : chosen.code)
        }
        /*
         * Поиск по всей строке подсказки: код, процесс, профиль. Оператор
         * помнит либо код, либо кто его шлёт, и второе -- чаще.
         */
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
        /*
         * Строка подсказки: код слева, объявители справа -- та же раскладка,
         * что у статуса в меню. Один повод объявляют и двое, и трое, поэтому
         * объявители перечисляются в одной строке, а не множатся строками.
         */
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
