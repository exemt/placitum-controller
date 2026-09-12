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

/**
 * Поля диалога, который правит одну строку целиком.
 *
 * Строку с единицами и умолчаниями (лимит частоты, сервер пула, ось снимка) в
 * ячейках не набрать: у половины ключей значение по умолчанию, и пустая
 * ячейка означает не «пусто», а «то, что подставит модуль». Такая строка
 * правится окном, а внизу окна стоит готовая строка директивы.
 *
 * Полей два поколения, и новое ([DialogPick], [DialogInput], [DialogFrame])
 * держит подпись на рамке, а не отдельной колонкой слева.
 *
 * Колонка подписей стоила половины ширины окна: селектору набора оставалось
 * 220px, и «имя + тип» туда не помещались, а два ключа в одну строку
 * (`action=` и `response=`, `list=` и `ttl=`) не вставали вовсе -- подпись у
 * второго оказывалась в середине строки. Подпись на рамке отдаёт полю всю
 * ширину и едет вместе с ним.
 *
 * Плавающая подпись однажды была отвергнута за то, что наезжает на пустое
 * значение («выбрать набор»). Это лечится `shrink`: подпись поднята всегда,
 * потому что пустое значение окна -- не «поле не заполнено», а «взять
 * умолчание», и показывать его надо словом. `helperText` под полем по-прежнему
 * не ставится -- из восьми ключей он делает два экрана; подсказка приходит
 * наведением (`FieldTooltip`), как у полей настроек.
 *
 * Старое поколение ([DialogRow], [DialogField], [DialogText], [DialogSelect])
 * держат окна снимка и каталогов http. Новых окон на нём не собирают.
 *
 * Своих копий этих кусков в страницах быть не должно: два диалога одной
 * карточки, разошедшись, читаются разными окнами.
 */

/**
 * Высота поля окна. Одна на селектор, ввод и рамку составного редактора:
 * поля стоят по два-три в ряд, и разойдись они на пиксель, ряд читался бы
 * лесенкой. `minHeight` в `sx` -- сырые пиксели (множитель темы есть только у
 * отступов и радиуса), поэтому число здесь и есть высота.
 */
export const DIALOG_FIELD_H = 36;

/**
 * Радиус поля окна. Тема задаёт полям `borderRadius: 2` сырым CSS, а в `sx`
 * то же число означало бы 2 * `shape.borderRadius` = 10px -- рамка выходит
 * круглой рядом с квадратными полями. Отсюда строка с единицей.
 */
export const DIALOG_RADIUS = "2px";

export const dialogLabelSx = {
  fontSize: "0.68rem",
  color: "text.secondary",
  whiteSpace: "nowrap",
  lineHeight: 1,
} as const;

/** Поле ввода в диалоге: своя рамка есть, у окна её нет. */
export const dialogInputSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  px: 0.75,
  height: 28,
  borderRadius: DIALOG_RADIUS,
  border: 1,
  borderColor: "divider",
} as const;

/**
 * Строка диалога: имя слева, редактор следом, подсказка у правого края.
 *
 * Имя фиксированной ширины -- редакторы соседних строк тогда стоят на одной
 * вертикали, а ⓘ всех строк -- на другой: окно читается таблицей, а не
 * лестницей.
 */
export function DialogRow({
  label,
  hint,
  end,
  children,
}: {
  label: string;
  hint?: string;
  /** Между редактором и подсказкой: подстановки, единицы, пометки. */
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

/**
 * Поле в две строки: подпись сверху, редактор во всю ширину под ней.
 *
 * Для составных редакторов (переменная с разбором, чипы имён): в строку с
 * подписью они не помещаются, а сжатые до 180px показывают половину значения.
 */
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

/**
 * Пункт списка в окне: имя, метка справа и строка уточнения под именем.
 *
 * Одного `label` мало там, где выбирают из каталога: у набора есть тип, и
 * пара «набор + значение» работает, только если они сошлись (`cidr`
 * сравнивается с адресом, `string` -- со строкой). Тип, дописанный в имя
 * текстом, съедал ширину и читался частью имени, поэтому он стоит меткой у
 * правого края -- и в списке, и в закрытом поле.
 */
export type DialogOption<T extends string = string> = {
  value: T;
  label: string;
  /** Метка у правого края: тип набора, вид страницы. */
  tag?: string;
  /** Вторая строка пункта: чем этот выбор отличается от соседнего. */
  hint?: string;
  /** Имя из документа, которого в каталоге нет: выбрать можно, но это дефект. */
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
  /** Закрытое поле: вторая строка в него не помещается. */
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

/**
 * Селектор окна: подпись на рамке, значение во всю ширину.
 *
 * Подпись слева отдельной колонкой (`DialogRow`) держала поля на постоянной
 * вертикали, но стоила половины ширины окна: у селектора набора на значение
 * оставалось 220px, и имя с типом там не помещалось. Подпись на рамке отдаёт
 * полю всю строку и остаётся при нём, когда поля стоят по два в ряд.
 *
 * Подсказка не занимает третью строку под полем и не вешает ⓘ рядом: она
 * приходит наведением, тем же `FieldTooltip`, что и у полей настроек.
 */
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
  /** Имена из конфига -- моноширинным: их сверяют с файлом. */
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
          /*
           * Подпись поднята всегда: пустое значение окна -- это не «поле не
           * заполнено», а «взять умолчание», и подпись, лежащая поверх слов
           * «выбрать набор», делала из выбора пустоту.
           */
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

/**
 * Селектор нескольких значений: подпись на рамке, выбранное -- чипами.
 *
 * Пара к [DialogPick] там, где ключ принимает список (`accept: [a, b]`,
 * `apply: [ip, asn]`). Список из ячейки (`FilterMulti`) печатал выбранное
 * через запятую -- в окне у поля есть высота, и чип с крестиком снимает пункт
 * без похода в меню. Пустой список называется словом (`emptyLabel`): пустое
 * поле у ключа с умолчанием («любая ось») не отвечает, что будет.
 */
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
  /** Что значит пустой список: «любая ось», «выбрать». */
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
                      /*
                        Крестик снимает пункт, не открывая меню: нажатие на
                        поле селектора -- это mousedown, и без остановки чип
                        и снял бы пункт, и раскрыл список.
                      */
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

/**
 * Поле ввода окна: подпись на рамке, значение моноширинным.
 *
 * Пара к [DialogPick] -- у ключей директивы, которые не выбирают из списка, а
 * набирают (`rate=10r/s`, `ttl=1h`). Подсказка приходит наведением, как у
 * селектора; `helperText` под каждым полем превращал окно из восьми ключей в
 * два экрана.
 */
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
  /**
   * Набранное поле не примут. Только красит рамку: почему не примут -- дело
   * `DialogAlert` под полем, у красной рамки словаря нет, а гасить «Сохранить»
   * молча -- то же самое, что не отвечать.
   */
  error?: boolean;
  mono?: boolean;
  /**
   * Хвост внутри рамки поля: подстановки, единица, пометка. Ряд чипов стоял
   * рядом с полем и забирал его ширину -- поле сжималось до 168px, а соседние
   * поля окна оставались во всю ширину, и колонка значений читалась лесенкой.
   * Внутри рамки подстановки не спорят с полем за ширину: поле остаётся одной
   * ширины со всеми, а чипы стоят там, где у остальных полей стрелка списка.
   */
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

/**
 * Число с единицей: значение набирают, единицу выбирают.
 *
 * Строкой целиком (`10r/s`) это набиралось быстрее, но требовало помнить
 * форму записи, а ошибка в ней ловилась только регуляркой на сохранении --
 * поле молчало, а кнопка была погашена без объяснения. Единица списком делает
 * из двух вопросов один: сколько и на что.
 *
 * Селектор -- общий `UnitSelect` (та же рамка и тот же кегль, что у единиц в
 * строке настроек), только уже: внутри поля 80px забирали половину значения.
 */
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
        /* Только цифры: единица -- дело селектора, буквам в поле места нет. */
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

/**
 * Рамка с подписью под составной редактор (переменная с разбором, пара полей).
 *
 * Своя, а не `TextField`: внутри не одно поле, а два-три элемента, и подпись
 * им нужна та же самая -- иначе строка с редактором читается чужой среди
 * селекторов окна.
 */
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
        {/*
          Подпись повторяет метрику `InputLabel` соседних селекторов: 0.75rem
          и посадка на линию рамки. Разойдись они на пиксель -- строка с
          составным редактором читалась бы чужой среди полей окна.
        */}
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

/**
 * Селектор в строке диалога. Пустое значение показывается своим пунктом
 * («по умолчанию», «без автобана»), а не пустотой: у ключа с умолчанием
 * пустое место -- не ответ на вопрос, что будет.
 */
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

/**
 * Строка блока директив: своя или показанная комментарием как чужая.
 *
 * Чужие строки нужны там, где ключ наследуется: «действует то, что выше» --
 * это сами строки родителя, а не фраза о них ([DialogCode]).
 */
export interface DialogLine {
  text: string;
  muted?: boolean;
}

/** Строки директив блоком; чужие (`muted`) приглушены. */
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
      {/*
        Ключ -- номер строки: у двух осей, наследующих с одного уровня,
        заголовок комментария совпадает слово в слово (`# умолчание:`), а
        порядок строк здесь задан кодом и не переставляется.
      */}
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

/**
 * Подсказка блока -- надписью у правого края, а не иконкой у заголовка.
 *
 * ⓘ рядом с подписью читается её частью и требует прицеливания в 12 пикселей;
 * слово «подсказка» само говорит, что за ним есть текст, и стоит там, где
 * взгляд уже кончил читать заголовок.
 */
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

/** Содержимое блока: та же рамка и тот же фон у всех трёх видов. */
const blockBodySx = {
  px: 1.25,
  py: 0.75,
  borderRadius: DIALOG_RADIUS,
  bgcolor: "background.default",
  border: 1,
  borderColor: "divider",
} as const;

/**
 * Блок под полями окна: подпись сверху, содержимое в рамке под ней.
 *
 * Один на все три вида -- «что это значит», «строка конфигурации», «в файле на
 * этом уровне». Своих копий этой шапки было три, и они разъехались: подсказка
 * у одной висела иконкой, у остальных её не было, а отступ под подписью был
 * прижат к рамке так, что подпись читалась первой строкой содержимого.
 */
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

/**
 * То же, что [DialogLines], но строки бывают чужими: блок «в файле на этом
 * уровне» у снимка печатает своё как есть, а унаследованное -- комментарием.
 */
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

/**
 * Что ляжет в файл. У директивы с восемью ключами это единственный способ
 * увидеть результат целиком -- и единственное место, где виден порядок слов.
 */
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

/**
 * Что строка сделает -- словами, а не ключами директивы.
 *
 * Поля окна отвечают на вопрос «как это записано»: набор, значение,
 * `action=`. На вопрос «что и где ищется и почему сработает» они не отвечают
 * вовсе -- пара «набор + значение» стоит двумя свойствами, и направление
 * (значение ищут в наборе, а не наоборот) из неё не читается. Строка конфига
 * внизу этого тоже не говорит: там тот же порядок слов.
 *
 * Отсюда живая фраза над строкой конфига: попадание отдельно, промах отдельно.
 * Промах называется вслух, потому что в локальном слое он значит не
 * «пропустить», а «строка молчит»: решает следующая.
 */
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

/**
 * Сворачиваемый блок внутри окна: заголовок с подписью, содержимое под чертой.
 *
 * Тот же жест, что у секций карточки сервера и пути (`Section`), только в
 * масштабе окна: у окна объекта четыре оси, у окна инициатора -- повод и
 * действие, и все они стояли одной лентой полей. Свёрнутый блок держит на
 * экране то, чем оператор сейчас занят, а остальное остаётся строкой, по
 * которой видно, включено оно и что в нём стоит.
 *
 * Тумблер оси живёт в шапке, а не первой строкой тела: выключенная ось тела
 * не показывает вовсе, и тумблеру внутри было бы не на чем стоять. Клик по
 * нему не сворачивает блок -- событие до шапки не доходит.
 */
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
  /** Подпись под заголовком: чем этот блок отличается от соседнего. */
  hint?: string;
  /** Свёрнутое состояние словами: что в блоке стоит, не разворачивая его. */
  summary?: string;
  /** Тумблер в шапке. Нет обработчика -- блок без тумблера. */
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
      /* Выключенная ось не разворачивается: тела у неё нет. */
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
      /*
       * Свёрнутое тело снимается с дерева: поля его редакторов иначе остаются
       * в порядке табуляции и в чтении с экрана -- свёрнутый блок обещает, что
       * их нет. Состояния они не теряют: черновик живёт у окна.
       */
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
          /* У выключенной оси разворачивать нечего -- стрелки нет. */
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
                /* Включили ось -- показываем её поля: иначе тумблер молчит. */
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

/**
 * Описание правилом под полем: рамка, приглушённый фон, текст без иконки.
 *
 * Иконки здесь нет намеренно. ⚠ и ⓘ читаются как «случилось событие» и
 * требуют решения, а это не событие: это то, что поле сделает всегда, --
 * откуда возьмутся байты при «оригинале», что останется от масок, кто сильнее
 * маршрута. Такой текст стоял `helperText`-ом и терялся: восемь строк серым
 * кеглем 0.7 под полем читаются подписью к нему, а не правилом.
 *
 * Тон -- цвет левой кромки и фона: `info` -- как оно устроено, `warning` --
 * то, что оператор обычно не ждёт (маски не применяются, просьба сильнее
 * маршрута).
 *
 * `help` -- раздел справки с якорем (`05-protection#условия-вызова`): правило
 * говорит, что поле делает всегда, а подробности -- порядок, исключения,
 * взаимодействие с соседними ключами -- живут текстом и в окно не влезают.
 * Ссылка уходит новой вкладкой намеренно: переход внутри панели снял бы окно
 * вместе с черновиком, ради которого его открыли.
 */
export function DialogAlert({
  text,
  tone = "info",
  help,
}: {
  text: string;
  tone?: "info" | "warning";
  /** `<файл>#<якорь>` раздела справки; путь `/help/` дописывается здесь. */
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

/** Исходы фильтра `when=`: подмножество отказа и допуска. */
export type WhenOutcome = "deny" | "allow";

const WHEN_STATES: readonly { key: string; value: WhenOutcome[] }[] = [
  { key: "tail.whenSummaryAny", value: [] },
  { key: "tail.whenSummaryDeny", value: ["deny"] },
  { key: "tail.whenSummaryAllow", value: ["allow"] },
  { key: "tail.whenSummaryBoth", value: ["allow", "deny"] },
];

/**
 * Фильтр исхода -- списком из четырёх названных состояний.
 *
 * Двумя кнопками («отказ», «допуск») это не читалось: главное состояние --
 * «любой исход» -- набиралось тем, что не нажато ничего, и выглядело как
 * незаполненное поле. Подпись под кнопками говорила, что вышло, но прочесть
 * её успевал не всякий, а собрать нужное состояние с первого раза не
 * получалось вовсе: «оба нажаты» и «ни одного» -- разные вещи, а выглядят
 * одинаково пусто.
 *
 * Состояний ровно четыре, и каждое здесь названо словом. Порядок значений
 * внутри -- как у `ARCHIVE_OUTCOMES`, чтобы сравнение с сохранённым набором
 * шло строкой.
 */
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
