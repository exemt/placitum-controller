/*
  Второй уровень таблицы настроек: то, что редактор рисует внутри ячейки
  значения.

  Первый уровень -- строка таблицы (`settings-table.tsx`): имя директивы,
  значение, правый слот. Второй -- когда у одного ключа несколько параметров
  (`waf_cookie_defaults secure= http_only=`), список приёмников или пары имя/значение.
  До этого каждый такой редактор изобретал свой ритм: кегли 0.8/0.78/0.75,
  чипы 17/18/20, кнопки то 15px внизу слева, то 20px в шапке. Логика у них
  разная, метрика -- нет.

  Канон второго уровня:

    высота подстроки          24
    промежуток между полями   12 (подпись и её поле -- 4)
    значение                  0.75rem / 600, как в обычной строке
    подпись параметра         0.68rem, text.secondary, слева от своего поля
    чип                       20 x 3px x 0.66rem -- тот же, что подстановки
    действие строки           `TableIconButton` 20x20 с обводкой, у правого края

  Заголовка у второго уровня нет: имя директивы уже стоит в первой колонке.
  Он появляется только там, где второй уровень -- настоящая таблица со своими
  колонками (снимок запроса), и тогда это шапка того же вида, что `HeadCell`.
*/
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import AddIcon from "@mui/icons-material/Add";

import { TableIconButton } from "../components/data-table/index.ts";

/** Высота подстроки. Совпадает с чипом плюс воздух, чтобы ряды не «дышали». */
export const SUB_H = 24;

/** Ширина слота действий: одна кнопка 20px и поле до края ячейки. */
export const ACTIONS_W = 24;

export const editorInputSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  width: "100%",
  height: SUB_H,
  "& input": { p: 0, height: "100%" },
} as const;

/**
 * Селект без собственной рамки: строку уже обрамляет таблица, а вторая рамка
 * вокруг значения читается как отдельное поле ввода, которым оно не является.
 */
export const editorSelectSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  height: SUB_H,
  "& .MuiSelect-select": {
    py: 0,
    pl: 0,
    height: `${SUB_H}px !important`,
    minHeight: "unset",
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
  },
  "& .MuiOutlinedInput-notchedOutline": { border: 0 },
  "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
} as const;

/** Пункт выпадающего списка: тот же кегль, что у значения в строке. */
export const editorMenuItemSx = { fontSize: "0.78rem" } as const;

/** Чип второго уровня. Метрика подстановок: разными они быть не должны. */
export const editorChipSx = {
  height: 20,
  borderRadius: "3px",
  fontSize: "0.66rem",
  fontWeight: 600,
  cursor: "pointer",
  "& .MuiChip-label": { px: 0.75 },
} as const;

/** Подпись параметра внутри ячейки: `sample=`, `same_site`, `on=`. */
export function EditorLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: "0.68rem",
        color: "text.secondary",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  );
}

/** Подпись и её поле: пара, которая не разрывается при переносе. */
export function EditorField({
  label,
  width,
  grow,
  children,
}: {
  label?: string;
  /** Фиксированная ширина поля: числа и коды не должны прыгать по строке. */
  width?: number;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: "center",
        minWidth: 0,
        ...(grow === true ? { flex: 1 } : { flexShrink: 0 }),
      }}
    >
      {label !== undefined && <EditorLabel>{label}</EditorLabel>}
      <Box sx={{ minWidth: 0, ...(width === undefined ? { flex: 1 } : { width }) }}>
        {children}
      </Box>
    </Stack>
  );
}

/**
 * Ряд второго уровня. Действия (удалить, снять) уходят в слот у правого края
 * -- так крестики стоят колонкой, как галочки «умолчание» этажом выше.
 */
export function SubRow({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", width: "100%", minWidth: 0, minHeight: SUB_H }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", flex: 1, minWidth: 0 }}
      >
        {children}
      </Stack>
      <Box
        sx={{
          width: ACTIONS_W,
          flexShrink: 0,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {actions}
      </Box>
    </Stack>
  );
}

/**
 * Кнопка действия подстроки: удалить приёмник, снять пару.
 *
 * Тот же квадрат с обводкой, что в таблицах данных (`TableIconButton`):
 * удаление красное, добавление зелёное. Голая иконка без рамки стояла на
 * одной карточке с таблицами, где то же действие обведено, и читалась другим
 * контролом -- а у удаления обводка ещё и единственный знак, отличающий его
 * от правки до наведения.
 */
export function RowAction({
  title,
  icon,
  color,
  disabled,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  /** Красная -- удаление, зелёная -- добавление, без цвета -- всё прочее. */
  color?: "success" | "error";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <TableIconButton
      color={color}
      icon={icon}
      tooltip={title}
      disabled={disabled === true}
      onClick={onClick}
    />
  );
}

/**
 * Последняя строка списка: «+ добавить» по левому краю значений.
 *
 * Иконка внизу слева выглядела остатком от предыдущей строки и не говорила,
 * что добавляется; текст стоит там же, где значения, и продолжает их ряд.
 */
export function AddRow({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", minHeight: SUB_H }}>
      <Link
        component="button"
        type="button"
        underline="hover"
        onClick={onAdd}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          fontSize: "0.7rem",
          fontWeight: 600,
        }}
      >
        <AddIcon sx={{ fontSize: 14 }} />
        {label}
      </Link>
    </Box>
  );
}

/** Список подстрок: один вертикальный ритм у пар, приёмников и правил. */
export function SubRows({ children }: { children: ReactNode }) {
  return (
    <Stack spacing={0.25} sx={{ width: "100%", py: 0.5 }}>
      {children}
    </Stack>
  );
}
