import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { HEAD_H, TableIconButton, type FilterOption } from "./data-table/index.ts";
import { BlockHead } from "./BlockHead.tsx";
import { HintMarkup } from "./fields.tsx";
import { dataActionCellSx, SectionBleed, useFlushSection } from "./settings-table.tsx";

/**
 * Блок с таблицей внутри секции карточки.
 *
 * Одна форма на все такие блоки -- локальный слой, инспекторы, наборы:
 * шапка (имя, серая строка под ним, справа селектор «чем задано») и сразу под
 * ней таблица во всю ширину секции. Своей рамки у таблицы нет: рамка есть у
 * секции, а вторая внутри неё рисует блок в блоке и отнимает у колонок по
 * 16px с каждой стороны.
 *
 * Шапка блока и шапка секции устроены одинаково -- `BlockHead`, имя и label:
 * внутри одной карточки они стоят друг под другом, и разный вид у них
 * читался разным смыслом. Абзаца-подсказки над таблицей при этом нет:
 * постоянный текст занимает высоту карточки, а искать его приходят к той
 * строке, к которой он относится, -- в заголовках колонок он остаётся
 * тултипом ([HeadHint]).
 */

/**
 * Отступ в ячейках -- 10px, а не 16 общего `FilterCell`: карточка открывается
 * в ящике шириной 768, и восемь колонок по 32px отступов съедали бы строку
 * раньше, чем её содержимое.
 */
export const CELL_PX = 1.25;

/**
 * Ширина колонки повода -- одна на всю панель.
 *
 * Повод стоит в таблицах разных инспекторов (сигналы ранних волн -- у семи,
 * лестница уровней -- у счётчика) и в ящиках разной ширины: 680 у капчи и
 * калитки, 720 у правки ответов, 908 у счётчика. Пока колонка была без своей
 * ширины, она забирала остаток таблицы, и один и тот же список кодов стоял
 * то в 82px у калитки, то в 310 у счётчика -- колонка читалась разной от
 * карточки к карточке. Остаток забирает соседняя колонка (та, в которой
 * самый длинный текст строки), а повод везде одной ширины: 180px -- на код
 * с запасом, длинный список подрезается многоточием и целиком виден в
 * подсказке.
 */
export const CODE_W = 180;

/**
 * Высота селектора в шапке блока. Ровно строка заголовка: выше -- шапка
 * растёт и расходится с соседним блоком, ниже -- обводка читается ободком
 * вокруг текста.
 */
const SELECT_H = 22;

/** Поля секции карточки (`AccordionDetails px=2`), на которые выходит таблица. */
export const BLEED = 2;

export const flushTableSx = {
  width: "100%",
  tableLayout: "fixed",
  "& td > .MuiBox-root": { px: CELL_PX },
  /*
   * Таблица выходит за поля секции до краёв карточки (см. BLEED), поэтому поля
   * секции возвращаются внутрь крайних ячеек: текст стоит на одной вертикали с
   * заголовком блока, а линии и фон -- во всю ширину.
   */
  "& th:first-of-type": { pl: BLEED },
  "& th:last-of-type": { pr: BLEED },
  "& td:first-of-type > .MuiBox-root, & td:first-of-type": { pl: BLEED },
  "& td:last-of-type > .MuiBox-root": { pr: BLEED },
  "& th > .MuiBox-root": { px: CELL_PX },
  "& th:first-of-type > .MuiBox-root": { pl: BLEED },
  "& th:last-of-type > .MuiBox-root": { pr: BLEED },
  "& tbody td[colspan]": { px: BLEED },
  /*
   * Нижней линии у таблицы нет: закрывает блок сам блок ([TableBlock]), и
   * только тогда, когда за ним что-то идёт. Своя линия у таблицы рисовала
   * вторую черту под последним блоком секции -- секция и так кончается рамкой.
   */
  borderTop: 1,
  borderColor: "divider",
  "& td, & th": { borderLeft: 0, borderRight: 0 },
  "& tbody tr:last-child td": { borderBottom: 0 },
} as const;

/**
 * Полоса предупреждения над таблицей секции.
 *
 * Поля возвращаются внутрь самой заметки (`px: BLEED`), а не отжимают её
 * коробку от краёв, -- как у крайних ячеек таблицы под ней. Отжатая коробка
 * стояла в секции второй рамкой: фон предупреждения начинался правее и
 * заголовка секции, и заголовков колонок, к которым оно относится.
 *
 * Скруглений у полосы нет: углы есть у карточки, а не у ленты во всю её
 * ширину. Две заметки подряд разделяет линия -- иначе они читаются одной.
 */
export function SectionNotice({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        "& .MuiAlert-root": { px: BLEED, py: 1.25, borderRadius: 0 },
        "& .MuiAlert-root + .MuiAlert-root": { borderTop: 1, borderColor: "divider" },
      }}
    >
      {children}
    </Box>
  );
}

export const headCellSx = {
  py: 0,
  height: HEAD_H,
  minHeight: HEAD_H,
  px: CELL_PX,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "none",
} as const;

/**
 * Подсказка иконкой, а не абзацем.
 *
 * Текст про порядок волн или про `action=` не меняется от строки к строке:
 * показанный постоянно, он занимает высоту карточки. В шапке блока и в
 * заголовке колонки он лежит там, где о нём спрашивают.
 */
export function HeadHint({ text }: { text: string }) {
  return (
    <Tooltip arrow placement="top-start" enterDelay={200} title={<HintMarkup text={text} />}>
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: "inline-flex",
          flexShrink: 0,
          color: "text.secondary",
          opacity: 0.5,
          cursor: "help",
          "&:hover, &:focus-visible": { opacity: 0.95 },
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 14 }} />
      </Box>
    </Tooltip>
  );
}

/**
 * Ширины колонок -- до первой строки.
 *
 * `table-layout: fixed` берёт ширины из первой строки, и объединённая шапка
 * (`HeadCell colSpan={2}`) делит свою ширину между колонками поровну: колонка
 * ручки получала половину от 202px вместо своих 52, а ключ уезжал на полсотни
 * пикселей вправо от подписи. Второе: когда ширина задана у всех колонок,
 * остаток ширины таблицы раздаётся им пропорционально -- вместе с колонкой
 * кнопок, которой расти незачем.
 *
 * `<colgroup>` решает и то, и другое: ширины стоят до строк, а колонка без
 * ширины (`undefined`) забирает остаток -- растёт та, которой есть что
 * показывать. Числа те же, что у ячеек: одна константа на колонку.
 */
export function TableCols({ widths }: { widths: readonly (number | undefined)[] }) {
  return (
    <colgroup>
      {widths.map((width, index) => (
        <col key={index} style={width === undefined ? undefined : { width }} />
      ))}
    </colgroup>
  );
}

/**
 * Заголовок колонки, при необходимости с подсказкой.
 *
 * `colSpan` -- для колонки порядка: своей подписи у неё нет (в ячейке стоит
 * хват или стрелки), и пустая ячейка в шапке отодвигала первую подпись на
 * полсотни пикселей от заголовка блока. Объединённая шапка ставит подпись на
 * ту же вертикаль, а строки таблицы остаются как есть. Ширины при этом задаёт
 * [TableCols]: делить объединённую ширину поровну -- не то же, что 52 + 150.
 */
export function HeadCell({
  label,
  help,
  width,
  minWidth,
  colSpan,
}: {
  label: string;
  help?: string;
  width?: number;
  minWidth?: number;
  colSpan?: number;
}) {
  /*
   * Подсказка приходит наведением на саму подпись, а не на иконку рядом.
   *
   * ⓘ в заголовке колонки занимала место в строке, где его нет (подписи и так
   * обрезаются многоточием), и делила один смысл на два объекта: подпись
   * отдельно, значок отдельно. Что за подписью есть пояснение, говорит
   * пунктирное подчёркивание -- то же, что у сокращений в тексте.
   */
  const text = (
    <Box
      component="span"
      tabIndex={help === undefined ? undefined : 0}
      sx={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        ...(help === undefined
          ? {}
          : {
              cursor: "help",
              textDecoration: "underline dotted",
              textUnderlineOffset: "3px",
              textDecorationColor: "currentColor",
              opacity: 0.85,
              "&:hover, &:focus-visible": { opacity: 1 },
            }),
      }}
    >
      {label}
    </Box>
  );

  return (
    <TableCell
      colSpan={colSpan}
      sx={{ ...headCellSx, width, minWidth: minWidth ?? 0 }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        {help === undefined ? (
          text
        ) : (
          <Tooltip
            arrow
            placement="top-start"
            enterDelay={200}
            title={<HintMarkup text={help} />}
          >
            {text}
          </Tooltip>
        )}
      </Stack>
    </TableCell>
  );
}

/**
 * Селектор «чем задано» в строке заголовка блока.
 *
 * Своя обводка у него есть, а подчёркивания нет. Голый текст с крохотной
 * галкой в шапке не читался управлением: `none` рядом с подписью выглядел
 * значением, которое кто-то показывает, а не тем, что можно сменить, -- и в
 * него не кликали. Рамка -- та же, что у чипов подстановок (1px `divider`,
 * скругление 3px): второй границей внутри блока она не читается, потому что
 * обводит контрол по высоте строки, а не область.
 *
 * Первый пункт списка -- «наследовать»: пока стоит он, текст приглушён, как
 * незаданное значение в таблице настроек.
 */
export function BlockSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly FilterOption<T>[];
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  const idle = options[0]?.value;
  return (
    <Select
      value={value}
      variant="standard"
      disableUnderline
      inputProps={{ "aria-label": ariaLabel }}
      onChange={(e) => onChange(e.target.value as T)}
      sx={{
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        minWidth: 0,
        maxWidth: "100%",
        height: SELECT_H,
        border: 1,
        borderColor: "divider",
        borderRadius: "3px",
        color: value === idle ? "text.secondary" : "text.primary",
        "&:hover": { borderColor: "text.disabled", bgcolor: "action.hover" },
        "&.Mui-focused": { borderColor: "primary.main" },
        "& .MuiSelect-select": {
          py: 0,
          pr: "22px !important",
          pl: 0.75,
          height: "100%",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
        // Галка -- на месте, а не за краем: обводка сдвинула правый край на 1px.
        "& .MuiSelect-icon": { right: 2, fontSize: 16, color: "text.secondary" },
      }}
    >
      {options.map((item) => (
        <MenuItem key={item.value} value={item.value} sx={{ fontSize: "0.8rem" }}>
          {item.label}
        </MenuItem>
      ))}
    </Select>
  );
}

/**
 * Блок таблицы: шапка и таблица под ней.
 *
 * Шапка -- та же, что у секции и у блока директив ядра: имя и серая строка
 * под ним (`BlockHead`). Иконкой подсказки она была раньше и читалась
 * по-разному в соседних блоках одной карточки -- у секции текст виден, у
 * блока внутри неё лежал под ⓘ.
 *
 * Селектор появляется там, где выбор есть: на сервере наследовать нечего, и
 * пустого выпадающего списка с одним пунктом в шапке не стоит.
 */
export function TableBlock<T extends string>({
  title,
  label,
  kindLabel,
  kind,
  options,
  onKind,
  notice,
  scroll,
  last,
  children,
}: {
  /**
   * Имя блока. Необязательно: блок, единственный в своей секции, второго
   * заголовка не просит -- секция уже названа, и повтор читался бы вторым
   * уровнем там, где уровень один. Без имени шапки нет вовсе.
   */
  title?: string;
  /** Серая строка под именем блока. */
  label?: string;
  /**
   * Имя селектора для скринридера. На экране его нет: слово в самом
   * селекторе («наследовать», «задать») читается значением, а о чём оно --
   * сказано именем блока и серой строкой под ним. Подпись рядом повторяла
   * это имя третий раз и отжимала селектор от края.
   */
  kindLabel?: string;
  kind?: T;
  options?: readonly FilterOption<T>[];
  onKind?: (next: T) => void;
  /** Строка предупреждения между заголовком и таблицей. */
  notice?: ReactNode;
  /** Широкая таблица прокручивается внутри секции, а не растягивает страницу. */
  scroll?: boolean;
  /**
   * Последний блок секции: закрывающей линии у него нет. Секция кончается
   * своей рамкой, и черта под ней -- вторая линия на том же месте.
   */
  last?: boolean;
  children: ReactNode;
}) {
  const picker =
    kind !== undefined && options !== undefined && onKind !== undefined && options.length > 1;
  /* Шапка есть, когда её есть чем занять: имя, серая строка или селектор. */
  const head = title !== undefined || label !== undefined || picker;
  const flush = useFlushSection();

  return (
    <Box>
      {/*
        Поля шапки -- те же, что у таблицы под ней, и берутся оттуда же
        ([useFlushSection]).

        В секции с блоками (`Section flush`) полей нет ни у кого: 16px внутри
        крайних ячеек -- весь отступ таблицы, и столько же шапка берёт себе.
        Без этого над первым блоком висела полоса пустоты, а таблица под ним
        начиналась сразу от линии.

        В окне (`DialogContent p: 2`) поля есть у тела, и таблица за них
        выходит ([SectionBleed]), возвращая те же 16px внутрь ячеек: колонка
        встаёт ровно на поле тела. Шапка туда попадает и без своих полей --
        её коробка и есть поле тела, -- а с ними уезжала на 16px правее
        колонки, которую называет.

        Отступ сверху равен отступу снизу: шапка -- полоса своей высоты, а не
        начало текста.
      */}
      {head && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", px: flush ? BLEED : 0, py: 0.75 }}
        >
          <BlockHead title={title ?? ""} label={label} />
          <Box sx={{ flex: 1 }} />
          {picker && (
            <BlockSelect
              value={kind}
              options={options}
              onChange={onKind}
              ariaLabel={kindLabel}
            />
          )}
        </Stack>
      )}
      {notice !== undefined && <SectionNotice>{notice}</SectionNotice>}
      <SectionBleed scroll={scroll}>
        <Box
          sx={
            last === true
              ? undefined
              : { borderBottom: 1, borderColor: "divider" }
          }
        >
          {children}
        </Box>
      </SectionBleed>
    </Box>
  );
}

/**
 * Ячейка действий черновой строки -- последней строки таблицы, в которой
 * вместо значений стоят пустые поля с подстановками. Запись появляется, когда
 * строка заполнена: кнопка «+» до того погашена, Enter в любом поле строки
 * делает то же, что кнопка (`draftKey`).
 *
 * Черновая строка вместо «+» в шапке там, где пустую запись некуда положить:
 * формат без имени не сохранить, строка `server` без адреса не собрать.
 * Кнопка «Создать», раскрывавшая поле имени под таблицей, добавляла шаг и
 * стояла не в том ряду, где потом правится остальное.
 *
 * Где подсказки самой строки читаются записью, она не годится: пары
 * `add_header` (`config/PairsTable.tsx`) заводятся окном у «+» в шапке.
 */
export function DraftAddCell({
  label,
  ready,
  onAdd,
}: {
  label: string;
  ready: boolean;
  onAdd: () => void;
}) {
  return (
    <TableCell sx={dataActionCellSx}>
      <TableIconButton
        color="success"
        icon={<AddIcon sx={{ fontSize: 16 }} />}
        tooltip={label}
        disabled={!ready}
        onClick={onAdd}
      />
    </TableCell>
  );
}

/** Enter в поле черновой строки -- то же, что «+»; пустую строку не добавляет. */
export function draftKey(ready: boolean, onAdd: () => void) {
  return (e: { key: string; preventDefault: () => void }) => {
    if (e.key === "Enter" && ready) {
      e.preventDefault();
      onAdd();
    }
  };
}
