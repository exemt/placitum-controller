/*
  Единая таблица настроек.

  Секция страницы настроек -- это одна таблица. Строка -- имя директивы, её
  редактор и правый слот: подстановки и чекбокс «умолчание». Подзаголовок
  группы -- тоже строка, а не коробка в коробке: рамка у секции уже есть,
  вторая рамка внутри неё ничего не добавляет, кроме отступов.

  Правила:

    1. Таблица в таблицу не вкладывается. `SettingsTable` внутри
       `SettingsTable` -- ошибка при рендере, не предупреждение: вложенную
       рамку легко не заметить в коде и невозможно не заметить на экране.
    2. `SettingsGroup` и строки живут только внутри `SettingsTable`.
    3. Всё, что помогает заполнить поле -- подстановки, единицы, «умолчание»,
       -- стоит справа, в одну линию с редактором. Строка не растёт вниз
       ради подсказок; высота строки задана редактором.
    4. Значение редактируется в ячейке значения; единицы измерения -- это
       часть значения и стоят у правого края той же ячейки (`UnitSelect`).
*/
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { BlockHead } from "./BlockHead.tsx";
import { FocusScope } from "./FocusContext.tsx";
import { FilterCell, HEAD_H } from "./data-table/index.ts";
import { HintMarkup } from "./fields.tsx";

const SettingsDepth = createContext(false);

/**
 * Таблица без правого слота: ни у одной строки нет единиц и «умолчания»
 * (порт, где всё обязательно). Пустые колонки с разделителями там читались
 * как недостающие поля.
 */
const NoAside = createContext(false);

/**
 * Секция, у которой убраны поля (`Section flush`): выносить таблицу за них
 * уже не нужно, иначе она вылезет за рамку карточки.
 */
const FlushSection = createContext(false);

export const FlushSectionProvider = FlushSection.Provider;

/**
 * Ширина правого слота: разделитель, единицы, разделитель, чекбокс
 * «умолчание» и поле справа. Считана по этому набору -- в более узком слоте
 * содержимое выпирало влево и линия слота накладывалась на ячейку значения.
 * Одна ширина у всех строк: единицы и галочки стоят колонками, а не пляшут
 * следом за длиной значения. Подстановки живут левее, в самой ячейке.
 */
export const ASIDE_W = 168;

/**
 * Доля колонки имён. Треть -- мера страницы: там таблица занимает секцию
 * целиком, и на имя приходится за две сотни пикселей.
 *
 * В окне (`sm` -- 600px) те же 30% дают 180px, а за вычетом полей и значка
 * подсказки на текст остаётся 128: имя в два слова встаёт впритык, третье уже
 * уезжает в многоточие -- и это при ячейке значения в 420px, где стоит имя
 * куки. Такое окно ставит долю больше: место есть, его просто держит не та
 * колонка.
 */
export const NAME_W = "30%";

/** Место под селектор единиц. Пустует, если у поля их нет -- колонка ровная. */
export const UNIT_W = 80;

/** Место под галочку «умолчание». Пустует у полей, где умолчание не выразимо. */
const CHECK_W = 20;

export function useInsideSettings(): boolean {
  return useContext(SettingsDepth);
}

/**
 * Есть ли у контейнера свои поля.
 *
 * Отвечает тем, кто рисует не таблицу, а то, что должно стоять с ней на одной
 * вертикали, -- шапке блока ([TableBlock]). Поля возвращает либо контейнер
 * (`flush`: секция их сняла, и 16px внутри крайних ячеек -- это весь отступ),
 * либо сама таблица, выйдя за них ([SectionBleed]) и вернув внутрь ячеек. В
 * первом случае шапке нужны свои 16px, во втором -- ноль: её коробка и так
 * стоит там, куда таблица возвращает ячейки.
 */
export function useFlushSection(): boolean {
  return useContext(FlushSection);
}

/**
 * Поля секции, за которые выходит таблица (`AccordionDetails`/карточка `p: 2`).
 * То же число, что `table-block.BLEED`, только в пикселях: здесь оно уходит в
 * inline-стиль, а не в `sx`.
 */
const BLEED_PX = 16;

/**
 * Вынос таблицы на всю ширину секции.
 *
 * Секция (`AccordionDetails`) держит поля `p: 2`; таблица должна идти от рамки
 * до рамки, а отступ возвращаться внутрь крайних ячеек -- их тема и так даёт
 * (`MuiTableCell` first/last-of-type: 16px).
 *
 * Поля заданы inline, а не через `sx`: содержимое секции лежит в `Stack`, и
 * его правило `> :not(style):not(style) { margin: 0 }` специфичнее классов sx
 * -- отрицательные поля из `sx` здесь молча обнуляются. Вертикаль не трогаем:
 * ею `Stack` разделяет соседние блоки секции.
 */
export function SectionBleed({
  scroll,
  children,
}: {
  /** Широкая таблица прокручивается внутри секции, а не растягивает страницу. */
  scroll?: boolean;
  children: ReactNode;
}) {
  const flush = useFlushSection();
  return (
    <Box
      style={flush ? undefined : { marginLeft: -BLEED_PX, marginRight: -BLEED_PX }}
      sx={{
        /*
         * `overflow-x: auto` без `overflow-y` по спецификации делает
         * `overflow-y` тоже auto: на Windows появляются обе полосы, даже
         * когда таблица выше контейнера на пиксель из‑за горизонтальной.
         * Прячем вертикаль; горизонталь — только если таблица правда шире.
         */
        minWidth: 0,
        /*
         * Потолок ширины считается с выносом.
         *
         * `maxWidth: 100%` -- это 100% ширины секции, то есть ровно на вынос
         * меньше, чем занимает вынесенная коробка. CSS в такой ситуации не
         * растягивает её обратно, а гасит правое поле (over-constrained,
         * CSS 2.1 §10.3.3): левый край выходил к рамке, правый оставался в
         * 32px от неё, и у каждой таблицы секции справа стояла дырка.
         */
        maxWidth: flush ? "100%" : `calc(100% + ${2 * BLEED_PX}px)`,
        ...(scroll === true
          ? { overflowX: "auto", overflowY: "hidden" }
          : { overflowX: "hidden" }),
      }}
    >
      {children}
    </Box>
  );
}

export function SettingsTable({
  aside = ASIDE_W,
  name = NAME_W,
  children,
}: {
  /**
   * Ширина правого слота. Шире её делают там, где в слоте живёт не только
   * единица с галочкой: у строк маршрута туда уезжают источник значения и
   * кнопки «снять»/«вернуть» -- в ячейке значения они отнимали место у самого
   * редактора, и он переносился в три ряда там, где хватало одного.
   * `false` -- слота нет вовсе: ни одной строке нечего в него положить.
   */
  aside?: number | false;
  /** Ширина колонки имён -- см. [NAME_W]. Шире её делают в окне. */
  name?: number | string;
  children: ReactNode;
}) {
  if (useContext(SettingsDepth)) {
    throw new Error("SettingsTable нельзя вкладывать в SettingsTable");
  }
  return (
    <SettingsDepth.Provider value={true}>
    <NoAside.Provider value={aside === false}>
      <FocusScope>
        {/* Строки идут от рамки до рамки секции -- см. SectionBleed. */}
        <SectionBleed>
          <Table
            size="small"
            sx={{
              width: "100%",
              tableLayout: "fixed",
              "& td, & th": { borderLeft: 0, borderRight: 0 },
              "& tr:last-of-type > td": { borderBottom: 0 },
            }}
          >
            <colgroup>
              <col style={{ width: name }} />
              <col />
              {aside !== false && <col style={{ width: aside }} />}
            </colgroup>
            <TableBody>{children}</TableBody>
          </Table>
        </SectionBleed>
      </FocusScope>
    </NoAside.Provider>
    </SettingsDepth.Provider>
  );
}

function useRequireTable(component: string) {
  if (!useContext(SettingsDepth)) {
    throw new Error(`${component} стоит только внутри SettingsTable`);
  }
}

/** Подзаголовок группы строк. Строка таблицы, а не коробка. */
export function SettingsGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  useRequireTable("SettingsGroup");
  const noAside = useContext(NoAside);
  return (
    <>
      <TableRow>
        <TableCell
          colSpan={noAside ? 2 : 3}
          sx={{
            pt: 1.5,
            pb: 0.75,
            px: 2,
            borderBottom: 1,
            borderColor: "divider",
            "tr:first-of-type > &": { pt: 1.25 },
          }}
        >
          <BlockHead title={title} label={hint} />
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

/**
 * Строка без имени: редактор занимает её целиком.
 *
 * Имя нужно там, где строк несколько и их надо различать. Когда строка в
 * блоке одна, имя повторяет его заголовок («Иначе» -- «Что ответить»), а
 * выбор из трёх чипов при этом жмётся к правому краю, оставляя половину
 * строки пустой. Без имени редактор начинается там же, где заголовок блока и
 * первая колонка соседней таблицы, -- левая вертикаль карточки одна на всё.
 *
 * Строка остаётся строкой таблицы: высота, поля и линия под ней те же, что у
 * именованных соседей (`Счёт` под этой строкой), а не своя коробка рядом.
 */
export function SettingsWideRow({
  label,
  children,
}: {
  /**
   * Имя для скринридера: на экране его говорит заголовок блока и серая
   * строка под ним.
   */
  label?: string;
  children: ReactNode;
}) {
  useRequireTable("SettingsWideRow");
  const noAside = useContext(NoAside);
  return (
    <TableRow>
      <TableCell colSpan={noAside ? 2 : 3} sx={{ p: "0 !important" }}>
        <Box
          role={label === undefined ? undefined : "group"}
          aria-label={label}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            minHeight: HEAD_H,
          }}
        >
          {children}
        </Box>
      </TableCell>
    </TableRow>
  );
}

/**
 * Строка-правило: блок текста во всю ширину таблицы.
 *
 * Плашка `DialogAlert` -- это не значение и не имя, она относится ко всей
 * строке над собой («логин называет калитка»), и колонок ей не нужно. Своей
 * коробкой рядом с таблицей она стоять не может: `<div>` внутри `<tbody>`
 * браузер выносит в безымянную ячейку первой колонки -- плашка вставала
 * шириной с колонку имён, с дырой во всю остальную строку.
 */
export function SettingsNote({ children }: { children: ReactNode }) {
  useRequireTable("SettingsNote");
  const noAside = useContext(NoAside);
  return (
    <TableRow>
      <TableCell colSpan={noAside ? 2 : 3} sx={{ px: 2, py: 1 }}>
        {children}
      </TableCell>
    </TableRow>
  );
}

/** Строка «ещё»: раскрывает редкие строки той же таблицы, не вторую таблицу. */
export function SettingsMore({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}) {
  useRequireTable("SettingsMore");
  const noAside = useContext(NoAside);
  return (
    <>
      <TableRow>
        <TableCell colSpan={noAside ? 2 : 3} sx={{ py: 0.75, textAlign: "right" }}>
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={onToggle}
            sx={{ fontSize: "0.78rem" }}
          >
            {open ? "↑ " : "↓ "}
            {label}
          </Link>
        </TableCell>
      </TableRow>
      {open && children}
    </>
  );
}

/**
 * Разделитель блоков строки: значение | подстановки | единицы | «умолчание».
 * Без него правая часть строки читается одной кашей из чипов и кнопок.
 */
function RowDivider() {
  return (
    <Divider
      orientation="vertical"
      flexItem
      sx={{ my: 1, borderColor: "divider", flexShrink: 0 }}
    />
  );
}

export function SettingsName({ label, help }: { label: string; help?: string }) {
  return (
    <TableCell sx={{ minHeight: HEAD_H, height: HEAD_H, py: 0, verticalAlign: "middle" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </Box>
        {help !== undefined && help !== "" && (
          <Tooltip
            arrow
            title={<HintMarkup text={help} />}
            placement="top-start"
            enterDelay={200}
          >
            <Box
              component="span"
              tabIndex={0}
              aria-label={label}
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
        )}
      </Box>
    </TableCell>
  );
}

/**
 * Правый слот строки: место под единицы и место под «умолчание».
 *
 * Оба места есть всегда, даже когда полю нечего в них положить: иначе селектор
 * одной строки стоит там, где у соседней галочка, и правая часть таблицы
 * читается как набор случайных значков вместо двух колонок.
 */
export function SettingsAside({
  unit,
  check,
}: {
  unit?: ReactNode;
  check?: ReactNode;
}) {
  return (
    <TableCell sx={{ p: "0 16px 0 0 !important", verticalAlign: "middle" }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", justifyContent: "flex-end", minHeight: HEAD_H }}
      >
        <RowDivider />
        <Box
          sx={{
            width: UNIT_W,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            // Ширину держит слот, а не текст внутри: иначе «INFO» шире «MB» и
            // левый край селектора съезжает от строки к строке.
            "& .MuiInputBase-root": { width: "100%", minWidth: 0, maxWidth: "100%" },
          }}
        >
          {unit}
        </Box>
        <RowDivider />
        <Box
          sx={{
            minWidth: CHECK_W,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          {check}
        </Box>
      </Stack>
    </TableCell>
  );
}

/**
 * Строка таблицы: имя | редактор | правый слот.
 *
 * Ячейка значения не красится: «своё или умолчание» говорит галочка справа, а
 * заливка делала соседние строки разноцветными без разницы в смысле. `quiet`
 * -- без кольца фокуса, для редакторов со своей подсветкой (список пар,
 * наследование маршрута).
 */
export function SettingsRow({
  label,
  help,
  grow,
  quiet,
  end,
  unit,
  check,
  children,
}: {
  label: string;
  help?: string;
  grow?: boolean;
  quiet?: boolean;
  /** Хвост ячейки значения: чипы подстановок, прижатые к правому краю. */
  end?: ReactNode;
  /** Селектор единиц: своё постоянное место в правом слоте. */
  unit?: ReactNode;
  /** Галочка «умолчание»: своё постоянное место в правом слоте. */
  check?: ReactNode;
  children: ReactNode;
}) {
  useRequireTable("SettingsRow");
  const noAside = useContext(NoAside);
  const inner = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        minWidth: 0,
        // 12px по сторонам разделителя: вплотную к нему значение и чипы
        // читались как одно поле с полосой посередине.
        gap: 1.5,
        height: "100%",
      }}
    >
      {/*
        Значение центрируется по строке: у редактора своя высота (input, чипы,
        список), и без этого текст прижимался к верху ячейки, а чипы рядом
        стояли по центру -- строка читалась как две.
      */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </Box>
      {end}
    </Box>
  );
  return (
    <TableRow>
      <SettingsName label={label} help={help} />
      {quiet === true ? (
        <TableCell sx={{ p: "0 !important", verticalAlign: grow ? "top" : "middle" }}>
          <Box sx={{ px: 2, py: grow ? 0.5 : 0, minHeight: HEAD_H, display: "flex" }}>
            {inner}
          </Box>
        </TableCell>
      ) : (
        <FilterCell grow={grow}>{inner}</FilterCell>
      )}
      {!noAside && <SettingsAside unit={unit} check={check} />}
    </TableRow>
  );
}

export type PresetItem<T> = { label: string; value: T; default?: boolean };

/** Больше двух чипов на узкой странице съедают поле -- там их не показываем. */
const CHIPS_KEEP_NARROW = 2;

/**
 * Сколько подстановок имеет смысл показывать. Один вариант -- не выбор: чип,
 * повторяющий то, что и так стоит в поле, занимает место и ничего не даёт.
 * Проверяется и на стороне строки: пустой ряд не должен оставлять после себя
 * разделитель.
 */
export const PRESETS_MIN = 2;

/**
 * Подстановки значения -- ряд чипов у правого края ячейки, в одну линию с
 * полем. Клик подставляет значение и снимает «умолчание».
 *
 * Выпадающих списков здесь нет намеренно: список, разворачивающийся во всю
 * ширину строки, закрывает соседние строки и требует второго клика ради того,
 * что помещается чипом. Длинная подстановка (путь, адрес) обрезается, полное
 * значение -- в подсказке; на узкой странице ряд длиннее двух чипов уступает
 * место самому полю.
 */
export function Presets<T>({
  items,
  current,
  onPick,
  disabled,
  keep,
  min,
}: {
  items: readonly PresetItem<T>[];
  current?: T;
  onPick: (value: T) => void;
  disabled?: boolean;
  /**
   * Ряд не уступает место полю на узкой странице: он и есть поле
   * (`SettingsWideRow`). Спрятанные чипы там оставляют строку без редактора.
   */
  keep?: boolean;
  /**
   * Порог показа. Ниже `PRESETS_MIN` его опускает только закрытый словарь: там
   * чипы -- единственный способ узнать, что вообще бывает, и последний
   * оставшийся вариант нужен не меньше первого.
   */
  min?: number;
}) {
  if (items.length < (min ?? PRESETS_MIN)) {
    return null;
  }
  const narrowFits = keep === true || items.length <= CHIPS_KEEP_NARROW;

  return (
    <Box
      sx={{
        display: narrowFits ? "flex" : { xs: "none", md: "flex" },
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
        minWidth: 0,
        opacity: disabled === true ? 0.4 : 1,
        pointerEvents: disabled === true ? "none" : undefined,
      }}
    >
      {items.map((item) => {
        const selected = current !== undefined && current === item.value;
        return (
          <Tooltip key={item.label} arrow title={item.label} placement="top">
            <Chip
              size="small"
              variant={selected ? "filled" : "outlined"}
              color={selected ? "primary" : "default"}
              label={item.label}
              onClick={() => onPick(item.value)}
              sx={{
                height: 20,
                maxWidth: 150,
                borderRadius: "3px",
                fontSize: "0.66rem",
                fontWeight: 600,
                cursor: "pointer",
                "& .MuiChip-label": { px: 0.75 },
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}

/*
  Таблицы данных (каталоги контура, реестр инспекторов, наборы) собираются
  вручную, но живут по той же метрике, что строки настроек: иначе на одной
  странице соседствуют строки 26px и 37px, поля 0.8rem и 0.75rem, а кнопки
  висят там, где у соседей середина ячейки.
*/

/** Высота строки данных. Та же, что у строки настроек. */
export const DATA_ROW_H = HEAD_H;

/** Ячейка данных: высота строки задана, кегль -- как у значения настройки. */
export const dataCellSx = {
  py: 0,
  height: DATA_ROW_H,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  verticalAlign: "middle",
} as const;

/** Шапка таблицы данных. */
export const dataHeadSx = {
  py: 0.5,
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "text.secondary",
  lineHeight: 1.2,
} as const;

/**
 * Колонка действий -- последняя, прижата к правому краю. Кнопка внутри стоит
 * там же, где галочка «умолчание» в таблице настроек, а не гуляет по ширине
 * ячейки.
 */
export const dataActionCellSx = {
  ...dataCellSx,
  width: 48,
  textAlign: "right",
  whiteSpace: "nowrap",
} as const;

/** Поле ввода внутри строки данных: метрика второго уровня. */
export const dataInputSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  width: "100%",
  height: 24,
  "& input": { p: 0, height: "100%" },
} as const;

export type UnitOption<T extends string> = { value: T; label: string };

/**
 * Единица без выбора: у ключа маршрута она задана моделью (`waf_deadline` --
 * всегда миллисекунды). Селектор из одного пункта был бы не выбором, а
 * ложным обещанием, поэтому здесь метка -- но в той же колонке и той же
 * метрике, что селекторы соседних строк.
 */
export function UnitLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: 20,
        display: "flex",
        alignItems: "center",
        fontSize: "0.66rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "text.disabled",
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Единицы значения -- чипом, а не полем со стрелкой: это не отдельная
 * настройка, а хвост числа, и по высоте он должен совпадать с чипами
 * подстановок в той же строке.
 */
export function UnitSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  width = 80,
  label,
}: {
  value: T;
  options: readonly UnitOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  width?: number;
  label?: string;
}) {
  return (
    <Select
      value={value}
      variant="standard"
      disableUnderline
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      onClick={(e) => e.stopPropagation()}
      inputProps={{ "aria-label": label ?? "unit" }}
      sx={{
        flexShrink: 0,
        // Одна ширина у всех селекторов строки: колонка единиц ровная, а не
        // пляшет между «MB» и «MIN».
        width,
        minWidth: width,
        maxWidth: width,
        // Рамка внутрь: иначе «INFO» шире «MB» на толщину границы и колонка
        // единиц едет на пару пикселей от строки к строке.
        boxSizing: "border-box",
        height: 20,
        border: 1,
        borderColor: "divider",
        borderRadius: "3px",
        fontSize: "0.66rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: disabled === true ? "text.disabled" : "text.secondary",
        "& .MuiSelect-select": {
          py: 0,
          pl: 1,
          pr: "18px !important",
          height: "18px !important",
          minHeight: "18px !important",
          display: "flex",
          alignItems: "center",
          boxSizing: "border-box",
        },
        "& .MuiSelect-icon": { right: -1, fontSize: 15 },
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
