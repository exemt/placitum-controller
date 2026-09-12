/*
 * Полосы над таблицей событий. Четыре вещи, каждая -- о том, как смотреть на
 * один и тот же срез журнала.
 *
 * Строка запроса -- все условия отбора одной фразой: `time = 24h and
 * verdict = deny and ip = 10.0.0.1`. Пока она только читается: собирается из
 * полей шапки и панелей, и её дело -- показать целиком, что сейчас сужает
 * таблицу, когда сами поля разнесены по колонкам, свёрнутой секции и
 * групповой панели. Имена полей и знаки в ней -- не подписи интерфейса, а
 * будущий язык запроса, поэтому они не переводятся.
 *
 * Поиск по срезу -- сворачиваемая секция с заголовком, параметром и телом.
 * Поля отмечают галочками, ненужные не занимают место; свёрнутая секция
 * держит набранное чипами, чтобы условие не пропадало из виду вместе с полем.
 *
 * Оси группировки -- цепочка выбранных (её порядок -- порядок колонок таблицы
 * групп) и отдельно палитра свободных. Раньше все одиннадцать чипов стояли в
 * одном ряду, выбранные перескакивали вперёд, и ряд читался набором фильтров.
 *
 * Колонки -- какие показывать. Время и ray стоят всегда; колонка, по которой
 * стоит фильтр, показывается вопреки выбору: условие без колонки нечем ни
 * прочитать, ни снять. Выбор живёт в localStorage браузера -- это привычка
 * оператора, а не настройка контура.
 */

import { Fragment, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import SearchIcon from "@mui/icons-material/Search";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";

import { rangeCaption, type DateRange } from "../components/data-table/index.ts";
import { PAGE_RAIL, TABLE_RAIL } from "../components/PageBar.tsx";
import { useT } from "../i18n/index.ts";

/* ------------------------------------------------------------------------ */
/* Общее                                                                     */
/* ------------------------------------------------------------------------ */

/** Поля отбора списка: черновик и применённое -- одна и та же форма. */
export type AuditFields = {
  ray: string;
  ip: string;
  method: string;
  host: string;
  /** Имена блоков server через запятую -- из селектора или клика по ячейке. */
  server: string;
  uri: string;
  /** Uuid путей через запятую: ставится кликом по ячейке или разворотом группы. */
  route: string;
  status: string;
  phase: string;
  inspector: string;
  /** Логин из секции sessions: «все запросы alice». */
  user: string;
  /** Метка из секции markers: «все события, помеченные bot-farm». */
  marker: string;
  /** Код страны адреса по каталогу пространства: две буквы. */
  country: string;
  /** Номер автономной системы адреса по тому же каталогу, без `AS`. */
  asn: string;
  header: string;
  param: string;
  body: string;
};

export const emptyFields: AuditFields = {
  ray: "",
  ip: "",
  method: "",
  host: "",
  server: "",
  uri: "",
  route: "",
  status: "",
  phase: "",
  inspector: "",
  user: "",
  marker: "",
  country: "",
  asn: "",
  header: "",
  param: "",
  body: "",
};

const rowSx = {
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1,
  pl: `${TABLE_RAIL}px`,
  pr: `${PAGE_RAIL}px`,
} as const;

/**
 * Пустое место между левой и правой группами полосы.
 *
 * `ml: auto` у правого соседа тут не работает: `Stack` со `spacing`
 * раздаёт детям свой отступ правилом `& > * ~ *`, и оно перебивает
 * автополе из `sx` -- правая группа оставалась посреди строки. Распорка
 * ничьих отступов не трогает и переживает перенос: на узкой полосе она
 * схлопывается в ноль.
 */
export function Spacer() {
  return <Box sx={{ flex: "1 1 0", minWidth: 0 }} />;
}

/**
 * Метрика фишки полосы: те же 0.9 от фишки таблицы.
 *
 * Фишка -- частый гость этих полос, и в росте она соперничает с самими
 * данными. Размеры прописаны целиком, а не одним `fontSize`: метрика фишки
 * живёт в теме (`theme.tsx`), где подпись прибита к 0.7rem и строке 20px, и
 * `fontSize` на корне до неё не доходит.
 */
export const CHIP_SX = {
  height: 18,
  minHeight: 18,
  "& .MuiChip-label": {
    fontSize: "0.63rem",
    lineHeight: "18px",
    paddingLeft: "5px",
    paddingRight: "5px",
  },
  "& .MuiChip-icon": { fontSize: 11, marginLeft: "4px", marginRight: "-2px" },
  "& .MuiChip-deleteIcon": { fontSize: 11, marginLeft: "-1px", marginRight: "4px" },
} as const;

/**
 * Тумблер секции: галочка поворотом и название. Непустая секция помечена
 * точкой у названия -- свёрнутая секция иначе выглядит выключенной, хотя
 * набранное в ней продолжает сужать таблицу.
 */
function SectionToggle({
  title,
  open,
  onOpen,
  marked,
}: {
  title: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  marked: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(!open)}
      aria-expanded={open}
      sx={{
        appearance: "none",
        border: 0,
        bgcolor: "transparent",
        p: 0,
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        cursor: "pointer",
        color: marked ? "primary.main" : open ? "text.primary" : "text.secondary",
        fontFamily: "inherit",
        "&:hover": { color: marked ? "primary.light" : "text.primary" },
      }}
    >
      <ExpandMoreIcon
        sx={{
          fontSize: 16,
          transform: open ? "none" : "rotate(-90deg)",
          transition: "transform .15s",
        }}
      />
      <Typography
        variant="caption"
        sx={{ whiteSpace: "nowrap", fontWeight: 600, letterSpacing: "0.02em" }}
      >
        {title}
      </Typography>
      {marked && (
        <Box
          sx={{
            width: 5,
            height: 5,
            ml: 0.25,
            borderRadius: "50%",
            bgcolor: "primary.main",
          }}
        />
      )}
    </Box>
  );
}

/**
 * Секция полосы: всегда видимая шапка и тело под чертой.
 *
 * Шапка -- тумблер, сводка (что в секции набрано, пока она свёрнута) и правый
 * край, который виден в обоих состояниях: счёт групп, выбор колонок. Тело
 * появляется под разделителем: без него раскрытые поля читались продолжением
 * шапки, а не её содержимым.
 *
 * `spacing` у Stack здесь не ставится нигде: он раздаёт детям левый отступ
 * правилом `& > * ~ *`, которое перебивает `ml: auto` из `sx`. Расстояние
 * держит `gap`, а правый край отделяет [Spacer].
 */
export function ToolbarSection({
  title,
  open,
  onOpen,
  filled = false,
  summary,
  extra,
  gap = 1,
  children,
}: {
  title: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** В секции что-то набрано: метка у названия. */
  filled?: boolean;
  /** Что стоит в шапке вместо тела, пока секция свёрнута. */
  summary?: ReactNode;
  /** Правый край шапки: виден и в свёрнутой секции. */
  extra?: ReactNode;
  gap?: number;
  children: ReactNode;
}) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      {/*
        7px по краям: с фишкой в 18px это ровно 32px полосы. Пол высоты держит
        ту же меру у секции без фишек -- иначе полосы стоят лесенкой 30/32.
      */}
      <Stack direction="row" sx={{ ...rowSx, py: "7px", minHeight: 32 }}>
        <SectionToggle title={title} open={open} onOpen={onOpen} marked={filled} />
        {/*
          Набранное снимается крестиком у самой фишки -- и в свёрнутой секции
          тоже. Общей кнопки сброса у секции нет: она стояла отдельно от того,
          что сбрасывает, и повторяла собой ряд крестиков.
        */}
        {summary}
        <Spacer />
        {extra}
      </Stack>
      <Collapse in={open}>
        <Divider />
        <Stack direction="row" sx={{ ...rowSx, gap, py: 1 }}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
}

/* Полоса плотнее окна настроек: там поле 36px, здесь строка целиком 40px. */
const TOOLBAR_FIELD_H = 32;

/**
 * Поле полосы с подписью на рамке -- обычное поле Material, как в окнах
 * настроек ([DialogInput]). Подпись закреплена наверху всегда: под ней стоит
 * пример значения, и всплывающая подпись спорила бы с ним за место.
 */
export function LabeledField({
  label,
  value,
  onChange,
  onClear,
  placeholder,
  width,
  grow,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Мимо дебаунса набора: стирание -- не набор, ждать нечего. */
  onClear?: () => void;
  placeholder: string;
  width: number;
  /** Поле забирает остаток полосы: подстрока тела длиннее имени заголовка. */
  grow?: boolean;
}) {
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { "aria-label": label },
        input: {
          endAdornment:
            value === "" ? undefined : (
              <IconButton
                size="small"
                aria-label="clear"
                onClick={onClear ?? (() => onChange(""))}
                sx={{ p: 0.25, mr: -0.5 }}
              >
                <CloseIcon sx={{ fontSize: 13 }} />
              </IconButton>
            ),
        },
      }}
      sx={{
        flex: grow === true ? "1 1 auto" : "0 0 auto",
        minWidth: width,
        maxWidth: grow === true ? 460 : width,
        /*
         * Подпись висит на 9px выше рамки, и на общем отступе полосы она
         * ложилась ровно на черту под шапкой секции. Место под подпись
         * держит само поле: любой ряд ставит его обычным отступом.
         */
        mt: "6px",
        "& .MuiOutlinedInput-root": { height: TOOLBAR_FIELD_H, pr: 0.75 },
        "& .MuiInputBase-input": {
          fontFamily: "monospace",
          fontSize: "0.78rem",
          py: 0,
        },
      }}
    />
  );
}

/* Привычки оператора: браузер может их не хранить (приватный режим). */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Живём в памяти вкладки.
  }
}

function readStoredList<T extends string>(key: string, allowed: readonly T[]): T[] | null {
  const raw = readStored(key);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return allowed.filter((item) => parsed.includes(item));
  } catch {
    return null;
  }
}

/**
 * Поле панели фильтров: рамка, моно, крестик очистки у заполненного.
 * `onClear` идёт мимо дебаунса набора — стирание не набор, ждать нечего.
 */
export function FieldInput({
  value,
  onChange,
  onClear,
  placeholder,
  width,
  grow,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder: string;
  width: number;
  grow?: boolean;
}) {
  return (
    <InputBase
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ "aria-label": placeholder }}
      endAdornment={
        value !== "" ? (
          <IconButton
            size="small"
            aria-label="clear"
            onClick={onClear ?? (() => onChange(""))}
            sx={{ p: 0.25, mr: -0.5 }}
          >
            <CloseIcon sx={{ fontSize: 13 }} />
          </IconButton>
        ) : undefined
      }
      sx={{
        flex: grow === true ? 1 : undefined,
        minWidth: width,
        maxWidth: grow === true ? 420 : width,
        px: 1,
        height: 26,
        borderRadius: "2px",
        border: 1,
        borderColor: value !== "" ? "primary.main" : "divider",
        fontFamily: "monospace",
        fontSize: "0.78rem",
        "& .MuiInputBase-input": { py: 0 },
        "& .MuiInputBase-input::placeholder": { opacity: 0.6 },
      }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Колонки                                                                   */
/* ------------------------------------------------------------------------ */

/** Колонки списка в порядке таблицы. */
export const LIST_COLS = [
  "time",
  "ray",
  "ip",
  /*
   * Страна и ASN стоят подписью в самой колонке адреса, и своя колонка им
   * нужна не для чтения, а для отбора: условие без колонки нечем ни
   * прочитать, ни снять. Поэтому по умолчанию они скрыты
   * (HIDDEN_BY_DEFAULT), а фильтр поднимает их сам. Место -- сразу за
   * адресом, чей это признак; поднятая колонка забирает своё значение из
   * подписи, чтобы одно и то же не стояло в строке дважды.
   */
  "asn",
  "country",
  "phase",
  "method",
  "host",
  "uri",
  "server",
  "route",
  "status",
  "verdict",
  "score",
  "inspector",
  "user",
  "marker",
] as const;

export type ListCol = (typeof LIST_COLS)[number];

/**
 * Пол ширины колонки, вместе с отступами ячейки (16px по краям).
 *
 * Ширину колонки задают строки тела, а поле в шапке лежит абсолютом и в счёт
 * не идёт: колонка, где в теле коротко (вердикт, фаза, код), сжималась уже
 * своего же селектора, и тот вылезал на соседа. Пол мерится по тому, что в
 * колонке стоит: поле шапки или типичное значение строки. Таблица уже полов
 * не становится -- вместо этого уезжает в горизонтальную прокрутку, а какие
 * колонки держать, решает оператор ([ColumnPicker]).
 */
export const COL_MIN: Record<ListCol, number> = {
  time: 176,
  ray: 172,
  ip: 190,
  phase: 140,
  method: 118,
  host: 130,
  uri: 190,
  server: 150,
  route: 170,
  status: 92,
  verdict: 140,
  score: 72,
  inspector: 160,
  user: 160,
  marker: 150,
  country: 110,
  asn: 130,
};

/** Стоят всегда: без времени и ray строка -- не запись журнала. */
export const FIXED_COLS: readonly ListCol[] = ["time", "ray"];

/*
 * Пол ширины колонки ray, когда от него показан один хвост. Хвост -- 12 знаков
 * моноширинного, вместе с отступами ячейки это 132.
 */
export const RAY_TAIL_MIN = 132;

const RAY_TAIL_KEY = "waf.incidents.rayTail";

export function readRayTail(): boolean {
  return readStored(RAY_TAIL_KEY) === "1";
}

export function writeRayTail(on: boolean) {
  writeStored(RAY_TAIL_KEY, on ? "1" : "0");
}

/**
 * Хвост ray -- последний блок uuid: `cea99b02-...-73712e1c15ab` →
 * `73712e1c15ab`. В глазах строки различаются как раз хвостом, а полный ray
 * забирает под себя пятую часть таблицы. Ray без дефисов (чужой формат)
 * остаётся собой: резать его наугад -- потерять то, чем он опознаётся.
 */
export function rayTail(ray: string): string {
  const at = ray.lastIndexOf("-");
  return at < 0 ? ray : ray.slice(at + 1);
}

/**
 * Переключатель ray у правого края поля в шапке: «<<» жмёт ray до хвоста,
 * «>>» возвращает целиком.
 */
export function RayToggle({
  tail,
  onToggle,
}: {
  tail: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const title = t(tail ? "incidentsPage.rayWhole" : "incidentsPage.rayTail");
  return (
    <IconButton
      size="small"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      sx={{ p: 0.25, mr: -0.5, color: "text.disabled", "&:hover": { color: "text.primary" } }}
    >
      {tail ? (
        <KeyboardDoubleArrowRightIcon sx={{ fontSize: 14 }} />
      ) : (
        <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 14 }} />
      )}
    </IconButton>
  );
}

/*
 * Пол ширины колонки времени, когда к секунде показаны миллисекунды. Штамп
 * растёт с `09-10 14:23:45` до `09-10 14:23:45.123` -- четыре знака
 * моноширинного поверх COL_MIN.time.
 */
export const TIME_MS_MIN = 216;

const TIME_MS_KEY = "waf.incidents.timeMs";

export function readTimeMs(): boolean {
  return readStored(TIME_MS_KEY) === "1";
}

export function writeTimeMs(on: boolean) {
  writeStored(TIME_MS_KEY, on ? "1" : "0");
}

const TIME_ASC_KEY = "waf.incidents.timeAsc";

export function readTimeAsc(): boolean {
  return readStored(TIME_ASC_KEY) === "1";
}

export function writeTimeAsc(on: boolean) {
  writeStored(TIME_ASC_KEY, on ? "1" : "0");
}

/**
 * Штамп строки журнала. Миллисекунда не украшение: под одним ray лежат запрос
 * и ответ, у кадров WebSocket -- десятки записей подряд, и на секунде они
 * сливаются в одну кучу. Показывается по просьбе ([TimeToggle]): в обычном
 * чтении четыре лишних знака стоят колонке ширины.
 */
export function clock(ts: string, withMs = false): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return ts;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  return withMs ? `${stamp}.${String(d.getMilliseconds()).padStart(3, "0")}` : stamp;
}

/**
 * Переключатель времени у правого края поля в шапке -- тот же жест, что у ray:
 * «>>» разворачивает штамп до миллисекунд, «<<» сворачивает обратно.
 */
export function TimeToggle({
  ms,
  onToggle,
}: {
  ms: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const title = t(ms ? "incidentsPage.timeSec" : "incidentsPage.timeMs");
  return (
    <IconButton
      size="small"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      sx={{ p: 0.25, mr: -0.5, color: "text.disabled", "&:hover": { color: "text.primary" } }}
    >
      {ms ? (
        <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 14 }} />
      ) : (
        <KeyboardDoubleArrowRightIcon sx={{ fontSize: 14 }} />
      )}
    </IconButton>
  );
}

/**
 * Порядок списка по времени. Стоит в той же ячейке, что и окно: сортировка
 * журнала одна -- по времени, и отдельной колонке или меню взяться неоткуда.
 * Стрелка показывает нынешний порядок (вниз -- новые сверху), подпись --
 * что будет по нажатию.
 *
 * Умолчание нисходящее: журнал открывают вопросом «что происходит сейчас».
 * Восходящий нужен ровно там, где смотрят начало -- первый запрос сессии,
 * первый кадр соединения.
 */
export function TimeOrderToggle({
  asc,
  onToggle,
}: {
  asc: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const title = t(asc ? "incidentsPage.orderDesc" : "incidentsPage.orderAsc");
  return (
    <IconButton
      size="small"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      /*
       * Восходящий порядок -- не умолчание, и ячейка об этом не говорит:
       * заливка шапки означает фильтр, а порядок ничего не отбирает. Цвет
       * кнопки -- единственное, чем «смотрю с начала» видно, не наводя мышь.
       */
      sx={{
        p: 0.25,
        mr: 0.5,
        color: asc ? "primary.main" : "text.disabled",
        "&:hover": { color: asc ? "primary.main" : "text.primary" },
      }}
    >
      {asc ? (
        <ArrowUpwardIcon sx={{ fontSize: 14 }} />
      ) : (
        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
      )}
    </IconButton>
  );
}

const HIDDEN_KEY = "waf.incidents.hiddenColumns";

/*
 * Скрытые по умолчанию: страна и ASN уже стоят подписью в колонке адреса, и
 * второй раз, своей колонкой, нужны только тому, кто по ним отбирает или
 * листает глазами. Условие поднимает колонку само.
 */
const HIDDEN_BY_DEFAULT: readonly ListCol[] = ["country", "asn"];

/*
 * Хранятся скрытые, а не показанные: колонка, которой при сохранении ещё не
 * было, у оператора появится, а не пропадёт.
 */
export function readHiddenCols(): ListCol[] {
  return (readStoredList(HIDDEN_KEY, LIST_COLS) ?? [...HIDDEN_BY_DEFAULT]).filter(
    (col) => !FIXED_COLS.includes(col),
  );
}

export function writeHiddenCols(hidden: readonly ListCol[]) {
  writeStored(HIDDEN_KEY, JSON.stringify(hidden));
}

/**
 * Какие колонки показывать: всегда постоянные, всегда те, по которым стоит
 * фильтр, остальные -- по выбору.
 */
export function visibleCols(
  hidden: readonly ListCol[],
  forced: ReadonlySet<ListCol>,
): ListCol[] {
  return LIST_COLS.filter(
    (col) => FIXED_COLS.includes(col) || forced.has(col) || !hidden.includes(col),
  );
}

/** Чип «колонки» с окном выбора. */
export function ColumnPicker({
  hidden,
  forced,
  onChange,
}: {
  hidden: readonly ListCol[];
  /** Колонки, поднятые фильтром: галочка стоит и не снимается. */
  forced: ReadonlySet<ListCol>;
  onChange: (next: ListCol[]) => void;
}) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const shown = visibleCols(hidden, forced).length;
  const label =
    hidden.length === 0
      ? t("incidentsPage.columns.label")
      : t("incidentsPage.columns.count", { shown, total: LIST_COLS.length });

  const toggle = (col: ListCol) => {
    onChange(
      hidden.includes(col) ? hidden.filter((row) => row !== col) : [...hidden, col],
    );
  };

  return (
    <>
      <Chip
        size="small"
        variant="outlined"
        icon={<ViewColumnIcon />}
        label={label}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ ...CHIP_SX, color: hidden.length === 0 ? "text.secondary" : "text.primary" }}
      />
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { sx: { mt: 0.5, border: 1, borderColor: "divider", minWidth: 220 } },
        }}
      >
        <Stack sx={{ py: 0.5 }}>
          {LIST_COLS.map((col) => {
            const fixed = FIXED_COLS.includes(col);
            const lifted = !fixed && forced.has(col);
            const locked = fixed || lifted;
            const on = locked || !hidden.includes(col);
            return (
              <Box
                key={col}
                component="label"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.5,
                  py: 0.45,
                  cursor: locked ? "default" : "pointer",
                  "&:hover": { bgcolor: locked ? undefined : "action.hover" },
                }}
              >
                <Checkbox
                  size="small"
                  checked={on}
                  disabled={locked}
                  onChange={() => toggle(col)}
                  sx={{ p: 0 }}
                  slotProps={{ input: { "aria-label": t(`incidentsPage.columns.name.${col}`) } }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    fontSize: "0.8rem",
                    color: on ? "text.primary" : "text.secondary",
                  }}
                >
                  {t(`incidentsPage.columns.name.${col}`)}
                </Typography>
                {locked && (
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    {t(fixed ? "incidentsPage.columns.fixed" : "incidentsPage.columns.forced")}
                  </Typography>
                )}
              </Box>
            );
          })}
          {hidden.length > 0 && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Box
                component="button"
                type="button"
                onClick={() => onChange([])}
                sx={{
                  appearance: "none",
                  border: 0,
                  bgcolor: "transparent",
                  textAlign: "left",
                  px: 1.5,
                  py: 0.5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "primary.main",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                {t("incidentsPage.columns.all")}
              </Box>
            </>
          )}
        </Stack>
      </Popover>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Поиск по срезу                                                            */
/* ------------------------------------------------------------------------ */

export const SEARCH_KINDS = ["header", "param", "body"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

const SEARCH_FIELDS_KEY = "waf.incidents.searchFields";
const SEARCH_OPEN_KEY = "waf.incidents.searchOpen";

export function readSearchFields(): SearchKind[] {
  return readStoredList(SEARCH_FIELDS_KEY, SEARCH_KINDS) ?? [...SEARCH_KINDS];
}

export function writeSearchFields(fields: readonly SearchKind[]) {
  writeStored(SEARCH_FIELDS_KEY, JSON.stringify(fields));
}

export function readSearchOpen(): boolean {
  return readStored(SEARCH_OPEN_KEY) === "1";
}

export function writeSearchOpen(open: boolean) {
  writeStored(SEARCH_OPEN_KEY, open ? "1" : "0");
}

/*
 * Панель фильтров группового вида: в списке фильтры стоят над колонками, а
 * здесь колонок нет -- других полей отбора у группового вида не бывает,
 * поэтому раскрыта по умолчанию.
 */
const FILTERS_OPEN_KEY = "waf.incidents.filtersOpen";

export function readFiltersOpen(): boolean {
  return readStored(FILTERS_OPEN_KEY) !== "0";
}

export function writeFiltersOpen(open: boolean) {
  writeStored(FILTERS_OPEN_KEY, open ? "1" : "0");
}

const GROUP_OPEN_KEY = "waf.incidents.groupOpen";

/* Оси видны по умолчанию: свёрнутыми их пришлось бы сперва найти. */
export function readGroupOpen(): boolean {
  return readStored(GROUP_OPEN_KEY) !== "0";
}

export function writeGroupOpen(open: boolean) {
  writeStored(GROUP_OPEN_KEY, open ? "1" : "0");
}

/**
 * Секция поиска по срезу. Шапка стоит всегда: тумблер, набранное чипами
 * (пока секция свёрнута) и галочки полей; тело -- поля, которые отмечены
 * либо заполнены.
 */
export function SearchSection({
  open,
  onOpen,
  fields,
  onFields,
  values,
  onChange,
  onClear,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  fields: readonly SearchKind[];
  onFields: (next: SearchKind[]) => void;
  values: Pick<AuditFields, SearchKind>;
  onChange: (kind: SearchKind, value: string) => void;
  /** Мимо дебаунса: стирание -- не набор. */
  onClear: (kind: SearchKind) => void;
}) {
  const t = useT();
  const active = SEARCH_KINDS.filter((kind) => values[kind] !== "");
  /*
   * Значение, положенное кликом по срезу карточки, показывается и в снятом
   * поле: условие действует, и прятать его нельзя.
   */
  const shown = SEARCH_KINDS.filter((kind) => fields.includes(kind) || values[kind] !== "");

  const toggleField = (kind: SearchKind) => {
    if (fields.includes(kind)) {
      onFields(fields.filter((row) => row !== kind));
      if (values[kind] !== "") {
        onClear(kind);
      }
      return;
    }
    onFields([...fields, kind]);
    // Поле отмечают, чтобы набирать: свёрнутая секция раскрывается сама.
    if (!open) {
      onOpen(true);
    }
  };

  return (
    <ToolbarSection
      title={t("incidentsPage.search.title")}
      open={open}
      onOpen={onOpen}
      gap={2}
      filled={active.length > 0}
      summary={
        open ? undefined : (
          <>
            {active.map((kind) => (
              <Chip
                key={kind}
                size="small"
                variant="outlined"
                color="primary"
                label={`${t(`incidentsPage.search.kind.${kind}`)}: ${values[kind]}`}
                onClick={() => onOpen(true)}
                onDelete={() => onClear(kind)}
                sx={{ ...CHIP_SX, "& .MuiChip-label": { ...CHIP_SX["& .MuiChip-label"], fontFamily: "monospace" } }}
              />
            ))}
          </>
        )
      }
      extra={SEARCH_KINDS.map((kind) => {
        const on = fields.includes(kind);
        return (
          <Chip
            key={kind}
            size="small"
            variant="outlined"
            icon={on ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
            label={t(`incidentsPage.search.kind.${kind}`)}
            onClick={() => toggleField(kind)}
            sx={{
              ...CHIP_SX,
              color: on ? "text.primary" : "text.secondary",
              "& .MuiChip-icon": {
                ...CHIP_SX["& .MuiChip-icon"],
                color: on ? "primary.main" : "text.disabled",
              },
            }}
          />
        );
      })}
    >
      {shown.map((kind) => (
        <LabeledField
          key={kind}
          label={t(`incidentsPage.search.kind.${kind}`)}
          value={values[kind]}
          onChange={(next) => onChange(kind, next)}
          onClear={() => onClear(kind)}
          placeholder={t(`incidentsPage.search.placeholder.${kind}`)}
          width={kind === "body" ? 260 : 220}
          grow={kind === "body"}
        />
      ))}
    </ToolbarSection>
  );
}

/* ------------------------------------------------------------------------ */
/* Оси группировки                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Цепочка выбранных осей и палитра свободных. Выбранные -- залитые чипы со
 * стрелками между ними: первая ось -- первая колонка. Свободные -- пунктирные
 * чипы с плюсом: их можно добавить, и это не фильтры.
 *
 * Мера фишки -- по месту. В сводке свёрнутой секции фишка стоит в самой полосе,
 * рядом с тумблером, и берёт полосовую меру ([CHIP_SX], 0.9 от табличной);
 * в теле раскрытой секции она сама себе строка и идёт целиком, как задаёт тема.
 * Оба размера прописаны числами: `transform: scale` мылит подпись и оставляет
 * под фишкой место прежнего размера.
 */
export function GroupAxes<D extends string>({
  all,
  chosen,
  label,
  onToggle,
  summary = false,
}: {
  all: readonly D[];
  chosen: readonly D[];
  label: (dim: D) => string;
  onToggle: (dim: D) => void;
  /**
   * Сводка свёрнутой секции: та же цепочка со снятием, но мелкой мерой полосы
   * и без палитры -- ось добавляют, раскрыв секцию.
   */
  summary?: boolean;
}) {
  const free = summary ? [] : all.filter((dim) => !chosen.includes(dim));
  const chipSx = summary ? CHIP_SX : {};
  const iconSx = summary ? CHIP_SX["& .MuiChip-icon"] : {};
  return (
    <>
      {chosen.map((dim, i) => (
        <Fragment key={dim}>
          {i > 0 && (
            <ChevronRightIcon
              sx={{ fontSize: summary ? 12 : 14, color: "text.disabled", mx: -0.5 }}
            />
          )}
          {/* Обводка, как у фишек соседних секций: набранное везде читается одинаково. */}
          <Chip
            size="small"
            variant="outlined"
            color="primary"
            label={label(dim)}
            onDelete={() => onToggle(dim)}
            sx={chipSx}
          />
        </Fragment>
      ))}
      {chosen.length > 0 && free.length > 0 && (
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.25 }} />
      )}
      {free.map((dim) => (
        <Chip
          key={dim}
          size="small"
          variant="outlined"
          icon={<AddIcon />}
          label={label(dim)}
          onClick={() => onToggle(dim)}
          sx={{
            ...chipSx,
            color: "text.secondary",
            borderStyle: "dashed",
            "& .MuiChip-icon": { ...iconSx, color: "text.disabled" },
            "&:hover": { color: "text.primary", borderStyle: "solid" },
          }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Строка запроса                                                            */
/* ------------------------------------------------------------------------ */

/*
 * Знак -- то, как поиск сравнивает на самом деле: `=` -- совпадение целиком,
 * `~` -- подстрока без учёта регистра, `in` -- любое из списка, `exists` --
 * ключ есть, значение любое.
 */
export type QueryTerm = {
  field: string;
  op: "=" | "~" | "in" | "exists";
  values: string[];
};

function split(raw: string, by: RegExp): string[] {
  return raw
    .split(by)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function oneOrMany(field: string, values: string[]): QueryTerm | null {
  if (values.length === 0) {
    return null;
  }
  return values.length === 1
    ? { field, op: "=", values }
    : { field, op: "in", values };
}

/* `имя` -- ключ есть; `имя=значение` -- ключ с таким значением. */
function pair(prefix: string, raw: string): QueryTerm | null {
  if (raw === "") {
    return null;
  }
  const at = raw.indexOf("=");
  const name = (at < 0 ? raw : raw.slice(0, at)).trim();
  if (name === "") {
    return null;
  }
  const value = at < 0 ? "" : raw.slice(at + 1);
  return value === ""
    ? { field: `${prefix}.${name}`, op: "exists", values: [] }
    : { field: `${prefix}.${name}`, op: "=", values: [value] };
}

/** Условия отбора в порядке колонок; окно времени первым. */
export function queryTerms({
  range,
  verdict,
  fields,
  routeName,
}: {
  range: DateRange;
  verdict: string;
  fields: AuditFields;
  /** Подпись маршрута по uuid: в строке читают имя, а не ключ. */
  routeName: (id: string) => string;
}): QueryTerm[] {
  const out: QueryTerm[] = [];
  const push = (term: QueryTerm | null) => {
    if (term !== null) {
      out.push(term);
    }
  };
  const eq = (field: string, value: string) =>
    value === "" ? null : { field, op: "=" as const, values: [value] };
  const like = (field: string, value: string) =>
    value === "" ? null : { field, op: "~" as const, values: [value] };

  if (range.preset !== "") {
    push({ field: "time", op: "=", values: [range.preset] });
  } else {
    const caption = rangeCaption(range, (id) => id);
    if (caption !== "") {
      push({ field: "time", op: "in", values: caption.split(" – ") });
    }
  }
  push(eq("ray", fields.ray));
  push(oneOrMany("ip", split(fields.ip, /[,\s]+/)));
  push(eq("phase", fields.phase));
  push(eq("method", fields.method));
  push(eq("host", fields.host));
  push(like("uri", fields.uri));
  push(oneOrMany("server", split(fields.server, /,/)));
  push(oneOrMany("route", split(fields.route, /,/).map(routeName)));
  push(eq("status", fields.status));
  push(eq("verdict", verdict === "all" ? "" : verdict));
  push(eq("inspector", fields.inspector));
  push(eq("user", fields.user));
  push(eq("marker", fields.marker));
  push(eq("country", fields.country));
  push(eq("asn", fields.asn === "" ? "" : `AS${fields.asn}`));
  push(pair("header", fields.header));
  push(pair("param", fields.param));
  push(like("body", fields.body));
  return out;
}

/* Кавычки там, где без них граница значения теряется. */
function quote(value: string, always: boolean): string {
  return always || /[\s,"\[\]]/.test(value) || value === ""
    ? `"${value.replace(/"/g, '\\"')}"`
    : value;
}

const opSx = { color: "text.disabled", mx: 0.5 } as const;
const valueSx = { color: "text.primary", fontWeight: 600 } as const;

/**
 * Строка запроса: условия отбора одной фразой, читается, не правится. Вид
 * поля ввода -- обещание: когда-нибудь её можно будет набрать самому.
 */
export function QueryLine({
  terms,
  onReset,
}: {
  terms: readonly QueryTerm[];
  /** Сброс к чистой странице; нет -- сбрасывать нечего. */
  onReset?: () => void;
}) {
  const t = useT();
  return (
    <Stack direction="row" spacing={1} sx={{ ...rowSx, flexWrap: "nowrap", py: 0.75, borderBottom: 1, borderColor: "divider" }}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1,
          height: 28,
          border: 1,
          borderColor: "divider",
          borderRadius: "2px",
          bgcolor: "background.default",
          fontFamily: "monospace",
          fontSize: "0.8rem",
          whiteSpace: "nowrap",
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <SearchIcon sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }} />
        {terms.map((term, i) => (
          <Fragment key={`${term.field}\0${i}`}>
            {i > 0 && (
              <Box component="span" sx={{ color: "text.disabled", mx: 0.25 }}>
                and
              </Box>
            )}
            <Box component="span" sx={{ color: "text.secondary" }}>
              {term.field}
            </Box>
            <Box component="span" sx={opSx}>
              {term.op}
            </Box>
            {term.op === "in" ? (
              <Box component="span" sx={{ color: "text.disabled" }}>
                [
                {term.values.map((value, j) => (
                  <Fragment key={j}>
                    {j > 0 && ", "}
                    <Box component="span" sx={valueSx}>
                      {quote(value, false)}
                    </Box>
                  </Fragment>
                ))}
                ]
              </Box>
            ) : term.op === "exists" ? null : (
              <Box component="span" sx={valueSx}>
                {quote(term.values[0] ?? "", term.op === "~")}
              </Box>
            )}
          </Fragment>
        ))}
      </Box>
      {onReset !== undefined && (
        <Chip
          size="small"
          variant="outlined"
          label={t("incidentsPage.resetFilters")}
          onClick={onReset}
          sx={{ flexShrink: 0 }}
        />
      )}
    </Stack>
  );
}
