import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteIcon from "@mui/icons-material/Delete";

import { TableIconButton } from "./TableIconButton.tsx";
import { useT } from "../../i18n/index.ts";

/**
 * Колонка действий страницы-списка.
 *
 * Последняя колонка везде одна и та же: копия и удаление строки. Раньше оба
 * действия жили кнопками в подвале карточки -- чтобы удалить объект, его
 * приходилось открыть, а чтобы скопировать -- открыть и найти кнопку среди
 * «Отмена» и «Сохранить». Список знает про строку всё, что для этого нужно,
 * и правый край страницы -- то место, где действие ищут.
 *
 * Кнопка, которой сейчас нет хода, не исчезает, а гаснет: пропавшая кнопка
 * сдвигает соседнюю на своё место, и в соседних строках одного списка
 * «удалить» оказывалось бы на разной вертикали. Серая кнопка держит колонку и
 * тултипом говорит, почему она серая ([RowAction] `tooltip`).
 *
 * Журналов и каталогов это не касается: у строки инцидента, строки лога и
 * набора GeoLite2 нет ни копии, ни удаления -- там колонка была бы двумя
 * серыми кнопками на всю страницу, и её не ставят вовсе.
 */

/**
 * Ширина колонки: 16 поля ячейки слева + две кнопки по 20 с зазором 4 + 24
 * правой вертикали страницы (`PAGE_RAIL`, его возвращает `railSx`).
 */
export const ROW_ACTIONS_W = 88;

/** Ширина колонки, когда страница ставит рядом свои кнопки (`extra`). */
export function rowActionsWidth(extra: number): number {
  return ROW_ACTIONS_W + extra * 24;
}

export type RowAction = {
  onClick: () => void;
  /**
   * Ход есть, но не сейчас: встроенный объект, заперт, на него ссылаются.
   * Кнопка серая, но остаётся на месте.
   */
  disabled?: boolean;
  /**
   * Своя подпись вместо общей. У серой кнопки -- причина: «встроенный набор»,
   * «используется профилями». Без причины серая кнопка выглядит поломкой.
   */
  tooltip?: string;
};

/** Пустой заголовок колонки: подписи у кнопок нет, а ширина нужна до строк. */
export function RowActionsHead({ extra = 0 }: { extra?: number }) {
  const width = rowActionsWidth(extra);
  return <TableCell sx={{ width, minWidth: width }} />;
}

/**
 * Ячейка действий строки.
 *
 * Действие, которого у страницы нет вовсе (копия каталожной записи, удаление
 * встроенного), передаётся как `undefined` -- кнопка серая с общей причиной.
 */
export function RowActionsCell({
  copy,
  remove,
  extra,
}: {
  copy?: RowAction;
  remove?: RowAction;
  /**
   * Кнопки страницы левее копии: у сервера -- шестерёнка настроек. Своя
   * колонка под них рядом с этой дала бы два правых края подряд.
   */
  extra?: ReactNode;
}) {
  const t = useT();

  return (
    <TableCell
      align="right"
      sx={{ whiteSpace: "nowrap" }}
      /* Строка открывает карточку; кнопка колонки -- своё действие, не оба. */
      onClick={(e) => e.stopPropagation()}
    >
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
        {extra}
        <TableIconButton
          icon={<ContentCopyOutlinedIcon />}
          tooltip={copy?.tooltip ?? (copy === undefined ? t("table.copyOff") : t("copyModal.button"))}
          disabled={copy === undefined || copy.disabled === true}
          onClick={() => copy?.onClick()}
        />
        <TableIconButton
          color="error"
          icon={<DeleteIcon />}
          tooltip={
            remove?.tooltip ?? (remove === undefined ? t("table.deleteOff") : t("common.delete"))
          }
          disabled={remove === undefined || remove.disabled === true}
          onClick={() => remove?.onClick()}
        />
      </Stack>
    </TableCell>
  );
}
