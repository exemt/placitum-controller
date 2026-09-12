import { createContext, useContext, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TableCell from "@mui/material/TableCell";
import CloseIcon from "@mui/icons-material/Close";
import { styled, type SxProps, type Theme } from "@mui/material/styles";

import { useFocusContext, useFocusField } from "../FocusContext.tsx";
import { useTableStatus } from "./DataTable.tsx";

export const HEAD_H = 36;
const TEXT_PX = 16;

/*
 * Пол ширины колонки, которой ширину не задали.
 *
 * Содержимое ячейки лежит абсолютом ([CellBody]), поэтому своей ширины у
 * колонки фильтра нет -- её задают строки тела. Строк не осталось (фильтр
 * ничего не нашёл, ошибка, загрузка): таблица рисует одну ячейку на весь
 * `colspan`, свободную ширину забирает соседняя колонка с текстом в шапке, а
 * колонка без `width` уходит в ноль. Вместе с ней пропадает поле и набранное
 * в нём: фильтр, который и убрал строки, нечем ни прочитать, ни стереть.
 *
 * Пол ставится только на этом состоянии и только там, где ширины нет:
 * `minWidth` по ширине колонки не давал таблице сжаться в ящике (см.
 * [CellRoot]), а на таблице со строками колонки и так шире.
 */
const EMPTY_MIN_W = 120;

/*
 * Ячейка -- постоянное правило, а не `sx`.
 *
 * Их в таблице сотни: у набора инспекторов на карточке маршрута выходило под
 * две сотни, и `sx` перебирал тему на каждую при каждом рендере -- дороже,
 * чем стоило само содержимое. Здесь класс серилизуется один раз при загрузке
 * модуля, состояния переключаются атрибутами, а цвета приходят переменными из
 * темы (`theme.tsx`), так что теме на рендере делать нечего.
 *
 * Ширина остаётся инлайном: она своя у каждой колонки, и класс на колонку
 * означал бы ровно столько же разборов, сколько было раньше.
 */
const CellRoot = styled(TableCell)({
  padding: "0 !important",
  /*
   * Пол `minWidth: width` не давал таблице сжаться в ящике: сумма колонок
   * вылезала за секцию, и обёртка с overflow рисовала полосы.
   */
  minWidth: 0,
  height: HEAD_H,
  minHeight: HEAD_H,
  textTransform: "none",
  letterSpacing: 0,
  fontWeight: 600,
  position: "relative",
  verticalAlign: "middle",
  // Растущая ячейка: высоту задаёт содержимое, а не строка таблицы.
  '&[data-grow="1"]': { height: "auto", verticalAlign: "top" },
  '&[data-pinned="1"]': { backgroundColor: "var(--cell-paper)" },
});

/*
 * Внутренняя обёртка ячейки. Остаётся `Box`: поля таблиц внутри секции
 * возвращаются в крайние колонки селекторами по `.MuiBox-root`
 * (`components/table-block.tsx`, `flushTableSx`), и потеряй она этот класс --
 * первая колонка разъехалась бы с заголовком блока.
 *
 * Порядок правил -- это их старшинство: фон закреплённой колонки перебивается
 * заливкой и кольцом, а кольцо фокуса стоит последним и бьёт всё.
 */
const CellBody = styled(Box)({
  display: "flex",
  alignItems: "center",
  paddingLeft: TEXT_PX,
  paddingRight: TEXT_PX,
  position: "absolute",
  inset: 0,
  '&[data-grow="1"]': {
    position: "static",
    minHeight: HEAD_H,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 4,
  },
  '&[data-pinned="1"]': { backgroundColor: "var(--cell-paper)" },
  '&[data-tone="filled"]': { backgroundColor: "var(--cell-ring-bg)" },
  '&[data-tone="ring"]': {
    backgroundColor: "var(--cell-ring-bg)",
    boxShadow: "var(--cell-ring-shadow)",
  },
  '&[data-hot="1"]:focus-within': {
    backgroundColor: "var(--cell-ring-bg)",
    boxShadow: "var(--cell-ring-shadow)",
  },
});

/**
 * Таблица-редактор, а не фильтр.
 *
 * Заливка и кольцо ячейки -- язык таблицы фильтров: там они говорят, какая
 * колонка сужает выборку, и незаполненных колонок в ней большинство. В
 * редакторе заполненное поле -- норма: «активны» оказываются все ячейки разом,
 * и подсветка красит синим строку целиком, ничего этим не сообщая. То же
 * правило у строки настроек -- `quiet` в `fields.tsx`.
 *
 * Подсветка фокуса при этом остаётся: поля в ячейках рамок не имеют, и
 * «курсор здесь» -- единственное, чем они отделены друг от друга.
 */
const EditorCells = createContext(false);

/** Объявляет таблицу редактором: см. [EditorCells]. */
export function EditorCellScope({ children }: { children: ReactNode }) {
  return <EditorCells.Provider value={true}>{children}</EditorCells.Provider>;
}

export function FilterCell({
  active = false,
  width,
  minWidth,
  grow = false,
  pinned = false,
  colSpan,
  sx,
  children,
}: {
  active?: boolean;
  width?: number | string;
  /**
   * Пол ширины колонки.
   *
   * Содержимое ячейки лежит абсолютом, в ширину колонки оно не входит вовсе:
   * ширину задают строки тела. Колонка, у которой в теле коротко (вердикт,
   * фаза), сжималась уже своего же поля в шапке, и селектор вылезал на
   * соседа. Пол ставится там, где колонке есть чем мериться, кроме тела;
   * сумма полов -- минимальная ширина таблицы, ниже которой она не жмётся, а
   * уезжает в прокрутку.
   */
  minWidth?: number | string;
  grow?: boolean;
  pinned?: boolean;
  /** Ячейка на несколько колонок: строка-продолжение под строкой правила. */
  colSpan?: number;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const scoped = useFocusContext() !== null;
  const field = useFocusField();
  const rowless = useTableStatus() !== "ready";
  // В редакторе «заполнено» ничего не значит -- остаётся один фокус.
  const hot = useContext(EditorCells) ? false : active;
  const ring = scoped ? field.focused : hot;
  const filled = scoped && hot && !field.focused;
  const flag = (on: boolean) => (on ? "1" : undefined);

  return (
    <CellRoot
      colSpan={colSpan}
      data-grow={flag(grow)}
      data-pinned={flag(pinned)}
      style={{
        width,
        minWidth:
          minWidth ?? (width === undefined && rowless ? EMPTY_MIN_W : undefined),
      }}
      sx={sx}
    >
      <CellBody
        ref={field.setRoot}
        /*
         * Кольцо ячейки значит «курсор здесь», а кнопка курсора не держит:
         * нажатый «+» подсвечивал свою ячейку так же, как поле в правке, и
         * читался выбранной строкой. Кнопка фокус получает (иначе с неё не
         * уйти клавиатурой), но кольца не зажигает.
         */
        onFocusCapture={(event) => {
          const target = event.target as HTMLElement;
          /*
           * Фокус в меню или окне, открытом из ячейки: React проводит его
           * сквозь портал, а в DOM ячейки его нет. Кольцо следует за курсором
           * в самой ячейке -- иначе «+» с меню зажигал его, стоило меню
           * открыться, хотя кнопка выше кольца не заслужила.
           */
          if (!event.currentTarget.contains(target)) {
            return;
          }
          if (target.closest("button") !== null) {
            field.release();
            return;
          }
          field.onFocus();
        }}
        data-grow={flag(grow)}
        // Фон закреплённой колонки нужен, только пока её не перекрасили.
        data-pinned={flag(pinned && !ring && !filled)}
        data-tone={ring ? "ring" : filled ? "filled" : undefined}
        // Своя подсветка фокуса -- у ячейки вне области фокуса: внутри области
        // её зажигает сама область, и второе кольцо спорило бы с первым.
        data-hot={flag(!scoped)}
      >
        {children}
      </CellBody>
    </CellRoot>
  );
}

export const filterInputSx = {
  width: "100%",
  height: "100%",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  "& .MuiInputBase-input": {
    py: 0,
    height: "100%",
    boxSizing: "border-box" as const,
  },
};

export function FilterText({
  value,
  onChange,
  onBlur,
  placeholder,
  title,
  width,
  minWidth,
  mono,
  disabled,
  plain,
  type,
  clearable,
  action,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Уход из поля: место, где редактор сбрасывает черновик набора. */
  onBlur?: () => void;
  placeholder: string;
  /**
   * Подсказка по наведению -- там, где поле принимает больше, чем говорит
   * подпись (личность журнала: и логин, и пара «источник:логин»). Подписи
   * колонок фильтров -- одно слово, и объяснять форму значения в них негде.
   */
  title?: string;
  width?: number | string;
  /** Пол ширины колонки: см. [FilterCell]. */
  minWidth?: number | string;
  mono?: boolean;
  disabled?: boolean;
  plain?: boolean;
  type?: string;
  /**
   * Крестик очистки у заполненного поля. Только для фильтров: в редакторе
   * (DraftCell) пустое значение — не «нет фильтра», а стёртая настройка.
   */
  clearable?: boolean;
  /**
   * Кнопка у правого края поля — там, где значение длиннее ячейки и правится
   * окном ([LongTextCell]), или там, где колонка сама умеет показываться
   * по-разному ([RayToggle], [TimeToggle]). Стоит после крестика очистки:
   * очистка относится к значению, а действие — к способу его править.
   */
  action?: ReactNode;
}) {
  return (
    <FilterCell active={value !== ""} width={width} minWidth={minWidth}>
      <InputBase
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
        inputProps={{ "aria-label": placeholder, title }}
        endAdornment={
          clearable === true && value !== "" ? (
            <>
              <IconButton
                size="small"
                aria-label="clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                /*
                 * Отрицательный отступ -- выравнивание последней кнопки по
                 * краю поля: он гасит собственную набивку IconButton. У
                 * крестика с соседом край держит уже сосед, а крестику нужен
                 * зазор от него -- иначе две иконки читаются одной кнопкой.
                 */
                sx={{ p: 0.25, mr: action === undefined ? -0.5 : 0.5 }}
              >
                <CloseIcon sx={{ fontSize: 13 }} />
              </IconButton>
              {action}
            </>
          ) : (
            action
          )
        }
        sx={{
          ...filterInputSx,
          fontFamily: mono === true ? "monospace" : "inherit",
          "& .MuiInputBase-input::placeholder": {
            textTransform: plain === true ? "none" : "uppercase",
            letterSpacing: plain === true ? "0.02em" : "0.04em",
            opacity: 0.55,
          },
          ...(type === "number"
            ? {
                "& input[type=number]": { MozAppearance: "textfield" },
                "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
                  {
                    WebkitAppearance: "none",
                    margin: 0,
                  },
              }
            : {}),
        }}
      />
    </FilterCell>
  );
}

export type FilterOption<T extends string = string> = {
  value: T;
  label: string;
  /**
   * Вторая строка пункта меню: контекст выбора (профиль и тема инспектора).
   * В выбранном значении не показывается -- ячейке хватает label.
   */
  hint?: string;
};

const selectSx = {
  height: "100%",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  "& .MuiSelect-select": {
    py: 0,
    height: "100%",
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box" as const,
  },
};

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  unset,
  width,
  minWidth,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly FilterOption<T>[];
  placeholder?: string;
  unset?: T;
  width?: number | string;
  /** Пол ширины колонки: см. [FilterCell]. */
  minWidth?: number | string;
  disabled?: boolean;
}) {
  const idle = unset ?? options[0]?.value;
  const active = idle !== undefined && value !== idle;

  return (
    <FilterCell active={active} width={width} minWidth={minWidth}>
      <Select
        variant="standard"
        disableUnderline
        displayEmpty
        fullWidth
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        onClick={(e) => e.stopPropagation()}
        renderValue={(current) => {
          const row = options.find((item) => item.value === current);
          return row?.label ?? placeholder ?? "";
        }}
        inputProps={{ "aria-label": placeholder }}
        sx={{
          ...selectSx,
          color: active ? "text.primary" : "text.secondary",
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
                  sx={{
                    fontSize: "0.65rem",
                    color: "text.secondary",
                    fontFamily: "monospace",
                  }}
                >
                  {item.hint}
                </Box>
              </Box>
            )}
          </MenuItem>
        ))}
      </Select>
    </FilterCell>
  );
}

export function FilterMulti<T extends string>({
  value,
  onChange,
  options,
  placeholder = "",
  width,
  disabled = false,
}: {
  value: readonly T[];
  onChange: (value: T[]) => void;
  options: readonly FilterOption<T>[];
  placeholder?: string;
  width?: number | string;
  /** Колонка, которая в этой строке не значит ничего (см. FilterSelect). */
  disabled?: boolean;
}) {
  const chosen = new Set(value);
  return (
    <FilterCell active={value.length > 0} width={width}>
      <Select
        multiple
        variant="standard"
        disableUnderline
        displayEmpty
        fullWidth
        disabled={disabled}
        value={[...value]}
        onChange={(e) => {
          const raw = e.target.value;
          onChange((typeof raw === "string" ? raw.split(",") : raw) as T[]);
        }}
        renderValue={(selected) => {
          if (selected.length === 0) {
            return placeholder;
          }
          return selected
            .map((item) => options.find((row) => row.value === item)?.label ?? item)
            .join(", ");
        }}
        onClick={(e) => e.stopPropagation()}
        inputProps={{ "aria-label": placeholder }}
        title={value.length === 0 ? placeholder : value.join(", ")}
        sx={{
          ...selectSx,
          color: value.length === 0 ? "text.secondary" : "text.primary",
        }}
      >
        {options.map((item) => (
          <MenuItem
            key={item.value}
            value={item.value}
            sx={{
              fontSize: "0.8rem",
              fontWeight: chosen.has(item.value) ? 700 : 400,
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Select>
    </FilterCell>
  );
}

function parseCsv(raw: string): string[] | undefined {
  const items = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length === 0 ? undefined : items;
}

export function FilterCsv({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: readonly string[];
  onChange: (value: string[] | undefined) => void;
  placeholder: string;
  width?: number | string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.join(", ");

  return (
    <FilterCell active={value.length > 0 || (draft !== null && draft !== "")} width={width}>
      <InputBase
        value={shown}
        placeholder={placeholder}
        onFocus={() => setDraft(value.join(", "))}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          onChange(parseCsv(text));
        }}
        onBlur={() => setDraft(null)}
        onClick={(e) => e.stopPropagation()}
        inputProps={{ "aria-label": placeholder }}
        sx={{
          ...filterInputSx,
          "& .MuiInputBase-input::placeholder": {
            textTransform: "none",
            letterSpacing: "0.02em",
            opacity: 0.55,
          },
        }}
      />
    </FilterCell>
  );
}

/**
 * Ячейка, которая набирается черновиком.
 *
 * Значение из модели затирало бы «1.» и «50» на полпути: промежуточный символ
 * не разбирается, ключ пропадает, и допечатать до конца нельзя. Пока поле в
 * фокусе, показывается набранное; модель обновляется на каждый ввод, а
 * показанное приводится к каноническому виду по уходу из поля.
 *
 * Годится всему, что модель хранит разобранным, а человек набирает посимвольно:
 * числа (`wave=`, `burst=`) и времена (`timeout=`, `ttl=`).
 */
export function DraftCell({
  value,
  placeholder,
  width,
  mono,
  disabled,
  action,
  onChange,
}: {
  value: string;
  placeholder: string;
  width?: number | string;
  mono?: boolean;
  disabled?: boolean;
  /** Кнопка у правого края ячейки: правка длинного значения окном. */
  action?: ReactNode;
  onChange: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <FilterText
      value={draft ?? value}
      placeholder={placeholder}
      width={width}
      mono={mono}
      disabled={disabled}
      action={action}
      plain
      onChange={(raw) => {
        setDraft(raw);
        onChange(raw);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
