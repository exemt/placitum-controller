import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import Link from "@mui/material/Link";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import InputBase from "@mui/material/InputBase";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { BlockHead, blockAccordionSx } from "./BlockHead.tsx";
import { FocusScope } from "./FocusContext.tsx";
import {
  FilterCell,
  filterInputSx,
  HEAD_H,
} from "./data-table/index.ts";
import { describe, type ParentChain } from "../config/inherit.ts";
import { useT, type Translate } from "../i18n/index.ts";
import {
  FlushSectionProvider,
  Presets,
  PRESETS_MIN,
  SettingsAside,
  SettingsGroup,
  SettingsName,
  SettingsRow,
  SettingsTable,
  UnitSelect,
  useInsideSettings,
  type PresetItem,
} from "./settings-table.tsx";

const fieldSx = { width: "100%" };
const UNSET = "__unset__";
/** Поле, в котором стоит умолчание: значение читается, но оно не своё. */
const mutedInputSx = {
  "& .MuiInputBase-input": { color: "text.disabled" },
} as const;

/**
 * Правый слот запертого поля: значок о том, что править нечего.
 *
 * Оранжевый (`warning`), а не серый: это не подсказка и не отказ, а запрет,
 * про который иначе узнают, только получив отказ ручки на «Сохранить».
 * Один значок, без слова: замок читается сам, а подпись «заперто» повторялась
 * в каждом запертом поле формы и отъедала место у значения. Причина -- в
 * подсказке поля, она же приходит сюда всплывающей: два разных текста об
 * одном и том же расходятся первой же правкой. Без подсказки всплывает само
 * слово -- значок без объяснения не должен оставаться немым.
 */
export function LockedNote({ hint }: { hint?: string }) {
  const t = useT();
  const word = t("common.locked");
  return (
    <Tooltip title={hint !== undefined && hint !== "" ? hint : word} placement="top">
      <Box
        role="img"
        aria-label={word}
        sx={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          color: "warning.main",
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: 15 }} />
      </Box>
    </Tooltip>
  );
}

/**
 * Запертое поле вне таблицы: значение своё и видно как обычно, но ни фокуса,
 * ни выделения -- рамка вокруг значения обещала бы правку, которой не будет.
 * Гасится только само значение: замок в правом слоте стоит внутри рамки и
 * должен остаться живым, иначе подсказка о запрете не всплывёт.
 */
export const lockedInputSx = {
  "& .MuiInputBase-input": { pointerEvents: "none" },
} as const;

/** Чип значения в списке: метрика чипов подстановок плюс крестик. */
export const valueChipSx = {
  height: 20,
  borderRadius: "3px",
  fontSize: "0.66rem",
  fontWeight: 600,
  ml: "0 !important",
  mr: 0.5,
  "& .MuiChip-label": { px: 0.75 },
  /*
    Крестик светлее подписи, но её же цвета: на цветном чипе (красный повод,
    которого нет в реестре) серый `text.secondary` тонул в заливке.
  */
  "& .MuiChip-deleteIcon": {
    fontSize: 13,
    ml: "-1px",
    mr: 0.4,
    color: "inherit",
    opacity: 0.6,
    "&:hover": { color: "inherit", opacity: 1 },
  },
} as const;

/**
 * Поле-список в строке формы: ряд чипов стоит ровно 30px -- столько же,
 * сколько соседний small-select. Своими отступами (6px вокруг поля и по 3px
 * у чипа) `Autocomplete` давал 38, и в строке «hostname + включён» два
 * контрола не сходились ни верхом, ни низом.
 *
 * Пустое поле держит ту же высоту (`minHeight`), а второй ряд чипов растит
 * поле вниз -- селектор рядом остаётся на первой строке.
 *
 * Селектор с двумя классами намеренно: своё правило `Autocomplete` пишет тем
 * же весом и позже, и `& .MuiOutlinedInput-root` до поля не доходит.
 */
const chipsFieldSx = {
  "& .MuiAutocomplete-inputRoot.MuiOutlinedInput-root": {
    minHeight: 30,
    boxSizing: "border-box",
    paddingTop: "3px",
    paddingBottom: "3px",
  },
  "& .MuiAutocomplete-tag": { marginTop: "1px", marginBottom: "1px" },
} as const;

const numberInputSx = {
  ...filterInputSx,
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
    {
      WebkitAppearance: "none",
      margin: 0,
    },
} as const;
const HINT_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function HintInline({ text }: { text: string }) {
  const parts = text.split(HINT_TOKEN);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <Box key={index} component="strong" sx={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </Box>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <Box
          key={index}
          component="code"
          sx={{
            px: 0.4,
            borderRadius: 0.5,
            bgcolor: "action.hover",
            fontWeight: 700,
          }}
        >
          {part.slice(1, -1)}
        </Box>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function HintMarkup({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {blocks.map((block, index) => (
        <Typography
          key={index}
          variant="caption"
          component="div"
          sx={{ display: "block", lineHeight: 1.45, color: "inherit" }}
        >
          {block.split("\n").map((line, lineIndex) => (
            <Box key={lineIndex} component="span" sx={{ display: "block" }}>
              <HintInline text={line} />
            </Box>
          ))}
        </Typography>
      ))}
    </Box>
  );
}

type FieldLayout = "grid" | "table";

const FieldLayoutContext = createContext<FieldLayout>("grid");

function useFieldLayout(): FieldLayout {
  const inside = useInsideSettings();
  const layout = useContext(FieldLayoutContext);
  return inside ? "table" : layout;
}

/**
 * Режим наследования: поля стоят в оверлее сервера или пути, и «нет своего
 * ключа» значит «взять у родителя», а не «умолчание директивы». Галочка и
 * подпись запертого поля читают это отсюда: та же галочка, те же строки, но
 * слово другое -- «наследовать», и значения в скобках нет: что стоит у
 * родителя, поле не знает.
 */
const InheritModeContext = createContext<ParentChain | null>(null);

/** Значение -- родительская цепочка уровня; пустая тоже включает режим. */
export const InheritModeProvider = InheritModeContext.Provider;

function useInheritMode(): boolean {
  return useContext(InheritModeContext) !== null;
}

/**
 * Что унаследовано по ключу `name`: короткая подпись значения и уровень, с
 * которого оно пришло. Поле без `name` про родителя не знает и пишет просто
 * «наследуется».
 */
export function useInherited(
  name: string | undefined,
): { value: unknown; text: string; from: string } | null {
  const t = useT();
  const parents = useContext(InheritModeContext);
  if (parents === null || name === undefined) {
    return null;
  }
  const row = parents[name];
  if (row === undefined || row.value === undefined) {
    return null;
  }
  return { value: row.value, text: describe(name, row.value), from: t(`inherit.tag.${row.from}`) };
}

/**
 * Подпись унаследованного: `1m (http)`. Родитель ключа не задал -- действует
 * умолчание директивы: `1m (умолчание)`, если поле его знает, иначе просто
 * «наследуется».
 */
function inheritedLabel(
  t: Translate,
  inherited: { text: string; from: string } | null,
  fallback = "",
): string {
  if (inherited !== null) {
    return `${inherited.text} (${inherited.from})`;
  }
  return fallback === "" ? t("common.inherited") : `${fallback} (${t("inherit.tag.module")})`;
}

export const NameCell = SettingsName;

/**
 * Строка с произвольной ячейкой значения: имя | children | правый слот.
 * Для редакторов, у которых нет табличной пары в полях (наследование, списки).
 */
export function FieldRow({
  label,
  help,
  unit,
  check,
  children,
}: {
  label: string;
  help?: string;
  unit?: ReactNode;
  check?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TableRow>
      <SettingsName label={label} help={help} />
      {children}
      <SettingsAside unit={unit} check={check} />
    </TableRow>
  );
}

export function TableValue({
  active,
  grow,
  quiet,
  extra,
  children,
}: {
  active?: boolean;
  grow?: boolean;
  /**
   * Без рамки фокуса. Кольцо `FilterCell` -- язык таблицы фильтров: там оно
   * говорит, какая колонка сейчас сужает выборку. В форме настроек редактор
   * открыт всегда, и та же рамка означала бы лишь «курсор здесь» -- шум,
   * который спорит с подсветкой самого поля.
   */
  quiet?: boolean;
  extra?: ReactNode;
  children: ReactNode;
}) {
  if (quiet === true) {
    return (
      <TableCell sx={{ p: "0 !important", verticalAlign: grow ? "top" : "middle" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            minWidth: 0,
            gap: 0.5,
            px: 2,
            py: grow ? 0.5 : 0,
            minHeight: HEAD_H,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
          {extra}
        </Box>
      </TableCell>
    );
  }

  return (
    <FilterCell active={active} grow={grow}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          minWidth: 0,
          gap: 0.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, height: "100%" }}>{children}</Box>
        {extra}
      </Box>
    </FilterCell>
  );
}

export function FieldTooltip({
  title,
  children,
  open,
  disabled,
}: {
  title?: string;
  children: ReactElement;
  open?: boolean;
  disabled?: boolean;
}) {
  if (title === undefined || title === "" || disabled === true) {
    return children;
  }
  return (
    <Tooltip
      arrow
      title={<HintMarkup text={title} />}
      placement="top-start"
      enterDelay={200}
      open={open === true ? true : undefined}
    >
      <Box component="div" sx={{ width: "100%" }}>
        {children}
      </Box>
    </Tooltip>
  );
}

function useOptionalLock(optional: boolean | undefined, hasValue: boolean) {
  const [armed, setArmed] = useState(false);
  const keepArmed = useRef(false);

  useEffect(() => {
    if (hasValue) {
      setArmed(false);
      keepArmed.current = false;
      return;
    }
    if (keepArmed.current) {
      keepArmed.current = false;
      return;
    }
    setArmed(false);
  }, [hasValue]);

  const locked = optional === true && !hasValue && !armed;
  const overridden = optional !== true || hasValue || armed;

  const setOverridden = (on: boolean, apply: (on: boolean) => void) => {
    if (on && !hasValue) {
      keepArmed.current = true;
      setArmed(true);
    } else {
      setArmed(false);
    }
    apply(on);
  };

  return { locked, overridden, setOverridden };
}

function lockedFieldSx(locked: boolean) {
  return {
    "& .MuiInputBase-input": {
      opacity: locked ? 0.55 : 1,
      pointerEvents: locked ? "none" : "auto",
      cursor: locked ? "default" : undefined,
    },
    "& .MuiOutlinedInput-root": {
      pointerEvents: locked ? "none" : "auto",
    },
    "& .MuiInputAdornment-root": {
      pointerEvents: "auto",
    },
    ...(locked
      ? {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "action.disabled",
          },
          "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "action.disabled",
          },
          "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
            {
              borderColor: "action.disabled",
            },
          "& .MuiInputLabel-root, & .MuiInputLabel-root.Mui-focused": {
            color: "text.disabled",
          },
        }
      : {}),
  };
}

/**
 * «По умолчанию»: галочка стоит, пока своего ключа в документе нет. Снять её
 * значит задать своё -- и поле тут же получает значение (умолчание директивы
 * либо первая подстановка): пустое поле после снятия было бы не выбором, а
 * ещё одним шагом, который всё равно придётся сделать.
 */
export function Optional({
  overridden,
  onOverridden,
}: {
  overridden: boolean;
  onOverridden: (next: boolean) => void;
}) {
  const t = useT();
  const word = useInheritMode() ? t("common.inherit") : t("common.default");
  return (
    <Tooltip arrow title={word} placement="top">
      <Checkbox
        size="small"
        checked={!overridden}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onOverridden(!e.target.checked)}
        sx={{ p: 0 }}
        slotProps={{ input: { "aria-label": word } }}
      />
    </Tooltip>
  );
}

function FieldAdornment({
  extra,
  optional,
  overridden,
  onOverridden,
}: {
  extra?: ReactNode;
  optional?: boolean;
  overridden: boolean;
  onOverridden: (next: boolean) => void;
}) {
  if (optional !== true && extra === undefined) {
    return undefined;
  }
  return (
    <InputAdornment position="end" sx={{ ml: 0.5, mr: 0 }}>
      <Stack
        direction="row"
        spacing={0.25}
        sx={{ alignItems: "center" }}
      >
        {extra}
        {optional === true && extra !== undefined && (
          <Divider orientation="vertical" flexItem sx={{ mx: 0, my: 0.5 }} />
        )}
        {optional === true && (
          <Optional overridden={overridden} onOverridden={onOverridden} />
        )}
      </Stack>
    </InputAdornment>
  );
}

/**
 * Что стоит в поле, пока своего ключа нет. Без значения в скобках «по
 * умолчанию» не отвечает на единственный вопрос, который в этот момент есть:
 * а что там сейчас.
 */
function defaultLabel(t: Translate, value: string): string {
  return value === ""
    ? t("common.default")
    : t("common.defaultOf", { value });
}

/**
 * Подпись запертого поля с учётом режима наследования: в оверлее маршрута
 * умолчание директивы было бы враньём -- значение приезжает сверху, и
 * подпись говорит, какое и откуда: `1m (http)`.
 */
function useDefaultLabel(name: string | undefined): (value: string) => string {
  const t = useT();
  const inherit = useInheritMode();
  const inherited = useInherited(name);
  return (value) => (inherit ? inheritedLabel(t, inherited, value) : defaultLabel(t, value));
}

function optionLabel(t: Translate, value: string): string {
  const path = `config.option.${value}`;
  const translated = t(path);
  return translated === path ? value : translated;
}

export function Section({
  title,
  hint,
  defaultExpanded,
  nested,
  expanded,
  onToggle,
  flush,
  end,
  children,
}: {
  title: string;
  hint: string;
  defaultExpanded?: boolean;
  nested?: boolean;
  expanded?: boolean;
  onToggle?: (next: boolean) => void;
  /**
   * Секция без внутренних полей: содержимое -- таблица, а свой ритм она задаёт
   * сама. Поля секции добавляли бы к нему второй, из-за чего строки висели в
   * воздухе под шапкой.
   */
  flush?: boolean;
  /**
   * Действие в шапке справа, у шеврона: достаётся и у свёрнутой секции. Клик и
   * фокус до шапки не доходят -- иначе нажатие заодно сворачивало бы секцию, а
   * фокус подсвечивал бы шапку целиком.
   */
  end?: ReactNode;
  children: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded === true);
  const head = <BlockHead title={title} label={hint} />;
  const open = expanded ?? uncontrolled;

  return (
    <Accordion
      expanded={open}
      onChange={(_, next) => {
        if (expanded === undefined) {
          setUncontrolled(next);
        }
        onToggle?.(next);
      }}
      disableGutters
      variant="outlined"
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{
        ...blockAccordionSx(open),
        ...(nested === true ? { bgcolor: "background.default" } : {}),
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        {end === undefined ? (
          head
        ) : (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between", pr: 1 }}
          >
            {head}
            <Box
              onClick={(event) => event.stopPropagation()}
              onFocus={(event) => event.stopPropagation()}
              sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              {end}
            </Box>
          </Stack>
        )}
      </AccordionSummary>
      <AccordionDetails sx={flush === true ? { p: "0 !important" } : undefined}>
        <FlushSectionProvider value={flush === true}>
          <Stack spacing={flush === true ? 0 : 2}>{children}</Stack>
        </FlushSectionProvider>
      </AccordionDetails>
    </Accordion>
  );
}

export function UnderlayTabs<T extends string>({
  value,
  onChange,
  items,
  end,
  wrap,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
  end?: ReactNode;
  /**
   * Длинный ряд переносится на вторую строку, а не уезжает за край страницы:
   * шесть групп директив в ящике 768px иначе давали горизонтальный скролл.
   */
  wrap?: boolean;
}) {
  return (
    <Box
      sx={{
        display: end !== undefined ? "flex" : "inline-flex",
        alignItems: "center",
        width: end !== undefined ? "100%" : undefined,
        p: 0.4,
        gap: 0.4,
        flexWrap: wrap === true ? "wrap" : undefined,
        borderRadius: 1,
        bgcolor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(255, 255, 255, 0.06)"
            : "rgba(0, 0, 0, 0.05)",
        border: 1,
        borderColor: "divider",
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Box
            key={item.value}
            component="button"
            type="button"
            onClick={() => onChange(item.value)}
            sx={{
              appearance: "none",
              fontFamily: "inherit",
              border: 0,
              cursor: "pointer",
              px: 1.5,
              py: 0.55,
              borderRadius: 0.75,
              fontWeight: 600,
              fontSize: "0.85rem",
              lineHeight: 1.25,
              bgcolor: (theme) =>
                selected
                  ? theme.palette.action.selected
                  : "transparent",
              color: selected ? "primary.main" : "text.secondary",
            }}
          >
            {item.label}
          </Box>
        );
      })}
      {end !== undefined && (
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
          {end}
        </Box>
      )}
    </Box>
  );
}

/**
 * Группа полей. Без рамки: рамка есть у секции, и коробка в коробке только
 * съедала ширину. В табличном режиме -- `SettingsTable` с одной группой;
 * внутри уже открытой `SettingsTable` такой Group бросит ошибку -- там нужен
 * `SettingsGroup`.
 */
export function Group({
  title,
  hint,
  layout = "grid",
  children,
}: {
  title: string;
  hint?: string;
  layout?: FieldLayout;
  children: ReactNode;
}) {
  if (layout === "table") {
    return (
      <FieldLayoutContext.Provider value="table">
        <SettingsTable>
          <SettingsGroup title={title} hint={hint}>
            {children}
          </SettingsGroup>
        </SettingsTable>
      </FieldLayoutContext.Provider>
    );
  }
  return (
    <FieldLayoutContext.Provider value={layout}>
      <FocusScope>
        <Box>
          <BlockHead title={title} label={hint} nowrap={false} />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 2,
              alignItems: "start",
              mt: 1.5,
            }}
          >
            {children}
          </Box>
        </Box>
      </FocusScope>
    </FieldLayoutContext.Provider>
  );
}

export function More({
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
  return (
    <Stack spacing={2}>
      <Divider />
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={onToggle}
          sx={{ fontSize: "0.8rem" }}
        >
          {label}
        </Link>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={2}>{children}</Stack>
      </Collapse>
    </Stack>
  );
}

export function Text({
  name,
  label,
  value,
  onChange,
  placeholder,
  password,
  wide,
  helper,
  optional,
  fallback = "",
  presets,
  mono,
  end,
  readOnly,
}: {
  /** Ключ документа -- чтобы запертое поле показало, что унаследовано. */
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  password?: boolean;
  wide?: boolean;
  helper?: string;
  optional?: boolean;
  fallback?: string;
  /** Подстановки в правом слоте строки. Выбор снимает «умолчание». */
  presets?: readonly string[];
  mono?: boolean;
  /** Хвост значения: селектор единиц или уровня у правого края ячейки. */
  end?: ReactNode;
  /**
   * Значение показывается, но не правится: имя объекта, на который ссылаются
   * по имени -- профиль `default`, встроенный набор. Не то же, что поле,
   * запертое наследованием: там в поле стоит чужое значение и `locked` его
   * гасит, здесь -- своё, и выглядит оно как обычное.
   */
  readOnly?: boolean;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  // В оверлее маршрута галочка есть у каждого поля: снять ключ можно всегда.
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== "",
  );
  // Снятая галочка даёт значение: унаследованное, своё умолчание, иначе
  // первая подстановка -- правка начинается с того, что действует сейчас.
  const inherited = useInherited(name);
  const seed =
    typeof inherited?.value === "string"
      ? inherited.value
      : fallback !== ""
        ? fallback
        : (presets?.[0] ?? "");
  const display = locked ? defaultLabelOf(seed) : value;
  // Запрет ввода приходит с двух сторон: наследование и запертое имя.
  const frozen = locked || readOnly === true;
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) => setOverridden(on, () => onChange(on ? seed : ""))}
      />
    ) : undefined;
  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          readOnly === true ? (
            <LockedNote hint={helper} />
          ) : presets === undefined || presets.length < PRESETS_MIN ? undefined : (
            <Presets
              items={presets.map((item) => ({
                label: item,
                value: item,
                default: item === fallback,
              }))}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(next) => setOverridden(true, () => onChange(next))}
            />
          )
        }
        unit={locked ? undefined : end}
        check={optionalSlot}
      >
        <InputBase
          value={display}
          placeholder={placeholder}
          readOnly={frozen}
          type={password === true && !locked ? "password" : "text"}
          onChange={(e) => onChange(e.target.value)}
          inputProps={{ tabIndex: frozen ? -1 : undefined }}
          sx={{
            ...filterInputSx,
            ...(locked ? mutedInputSx : {}),
            ...(mono === true && !locked ? { fontFamily: "monospace" } : {}),
            /*
              Запертое поле не берёт ни фокус, ни выделение: рамка вокруг
              значения обещала бы правку, которой не будет. Значок в правом
              слоте остаётся живым -- он вне поля.
            */
            ...(readOnly === true ? { pointerEvents: "none" } : {}),
          }}
        />
      </SettingsRow>
    );
  }
  const field = (
    <FieldTooltip title={helper} disabled={locked}>
      <TextField
        size="small"
        fullWidth
        label={label}
        value={display}
        placeholder={placeholder}
        type={password === true && !locked ? "password" : "text"}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          htmlInput: { readOnly: frozen, tabIndex: frozen ? -1 : undefined },
          input: {
            endAdornment: (
              <FieldAdornment
                extra={readOnly === true ? <LockedNote hint={helper} /> : undefined}
                optional={optional}
                overridden={overridden}
                onOverridden={(on) =>
                  setOverridden(on, () => onChange(on ? fallback : ""))
                }
              />
            ),
          },
        }}
        sx={{
          ...(wide === true ? { ...fieldSx, gridColumn: "1 / -1" } : fieldSx),
          ...lockedFieldSx(locked),
          ...(readOnly === true ? lockedInputSx : {}),
        }}
      />
    </FieldTooltip>
  );
  return field;
}

export function Num({
  name,
  label,
  value,
  onChange,
  helper,
  optional,
  fallback,
  presets,
  end,
}: {
  /** Ключ документа -- чтобы запертое поле показало, что унаследовано. */
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  optional?: boolean;
  fallback?: number | string;
  /** Подстановки в правом слоте строки. Выбор снимает «умолчание». */
  presets?: readonly number[];
  /** Хвост значения: подпись единицы у правого края ячейки. */
  end?: ReactNode;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  // В оверлее маршрута галочка есть у каждого поля: снять ключ можно всегда.
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const preset = fallback === undefined ? "" : String(fallback);
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== "",
  );
  const inherited = useInherited(name);
  const seed =
    typeof inherited?.value === "number"
      ? String(inherited.value)
      : preset !== ""
        ? preset
        : presets?.[0] === undefined
          ? ""
          : String(presets[0]);
  const display = locked ? defaultLabelOf(seed) : value;
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) => setOverridden(on, () => onChange(on ? seed : ""))}
      />
    ) : undefined;
  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          presets === undefined || presets.length < PRESETS_MIN ? undefined : (
            <Presets
              items={presets.map((item) => ({
                label: String(item),
                value: String(item),
                default: preset !== "" && String(item) === preset,
              }))}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(next) => setOverridden(true, () => onChange(next))}
            />
          )
        }
        /*
          Подпись единицы стоит и при «умолчании» -- как погашенный селектор у
          длительности и размера: иначе колонка единиц пустеет и выглядит так,
          будто единицы у поля нет вовсе.
        */
        unit={end}
        check={optionalSlot}
      >
        <InputBase
          value={display}
          readOnly={locked}
          type={locked ? "text" : "number"}
          onChange={(e) => onChange(e.target.value)}
          inputProps={{ tabIndex: locked ? -1 : undefined }}
          sx={{ ...numberInputSx, ...(locked ? mutedInputSx : {}) }}
        />
      </SettingsRow>
    );
  }
  return (
    <FieldTooltip title={helper} disabled={locked}>
      <TextField
        size="small"
        fullWidth
        type={locked ? "text" : "number"}
        label={label}
        value={display}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          htmlInput: { readOnly: locked, tabIndex: locked ? -1 : undefined },
          input: {
            endAdornment: (
              <FieldAdornment
                optional={optional}
                overridden={overridden}
                onOverridden={(on) =>
                  setOverridden(on, () => onChange(on ? preset : ""))
                }
              />
            ),
          },
        }}
        sx={{
          ...fieldSx,
          ...lockedFieldSx(locked),
          "& input[type=number]": { MozAppearance: "textfield" },
          "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
            {
              WebkitAppearance: "none",
              margin: 0,
            },
        }}
      />
    </FieldTooltip>
  );
}

export type ByteUnit = "b" | "kb" | "mb" | "gb";

export type ByteHint = {
  label: string;
  value: number;
  default?: boolean;
};

const UNIT_FACTOR: Record<ByteUnit, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

const ALL_UNITS: readonly ByteUnit[] = ["b", "kb", "mb", "gb"];

function resolveUnits(units: readonly ByteUnit[] | undefined): ByteUnit[] {
  if (units === undefined || units.length === 0) {
    return [...ALL_UNITS];
  }
  const seen = new Set<ByteUnit>();
  const next: ByteUnit[] = [];
  for (const unit of units) {
    if (UNIT_FACTOR[unit] === undefined || seen.has(unit)) {
      continue;
    }
    seen.add(unit);
    next.push(unit);
  }
  return next.length === 0 ? [...ALL_UNITS] : next;
}

function defaultUnit(units: readonly ByteUnit[]): ByteUnit {
  return units.includes("mb") ? "mb" : (units[0] ?? "b");
}

function trimAmount(n: number): string {
  if (Number.isInteger(n)) {
    return String(n);
  }
  return String(Math.round(n * 1000) / 1000);
}

function splitBytes(
  bytes: number,
  units: readonly ByteUnit[],
): { amount: string; unit: ByteUnit } {
  const ranked = [...units].sort((a, b) => UNIT_FACTOR[b] - UNIT_FACTOR[a]);
  /* Ноль делится нацело на любую единицу -- см. [splitTime]. */
  if (bytes === 0) {
    return { amount: "0", unit: ranked[ranked.length - 1] ?? "b" };
  }
  for (const unit of ranked) {
    const factor = UNIT_FACTOR[unit];
    if (bytes % factor === 0) {
      return { amount: String(bytes / factor), unit };
    }
  }
  for (const unit of ranked) {
    const factor = UNIT_FACTOR[unit];
    if (bytes >= factor) {
      return { amount: trimAmount(bytes / factor), unit };
    }
  }
  const unit = ranked[ranked.length - 1] ?? "b";
  return { amount: trimAmount(bytes / UNIT_FACTOR[unit]), unit };
}

function toBytes(amount: string, unit: ByteUnit): number | undefined {
  const raw = amount.trim();
  if (raw === "") {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }
  return Math.round(n * UNIT_FACTOR[unit]);
}

export function Bytes({
  name,
  label,
  value,
  onChange,
  units,
  hints,
  helper,
  defaultValue,
  optional,
  wide,
}: {
  /** Ключ документа -- чтобы запертое поле показало, что унаследовано. */
  name?: string;
  label: string;
  value: number | undefined;
  onChange: (bytes: number | undefined) => void;
  units?: readonly ByteUnit[];
  hints?: readonly ByteHint[];
  helper?: string;
  defaultValue?: number;
  optional?: boolean;
  wide?: boolean;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  // В оверлее маршрута галочка есть у каждого поля: снять ключ можно всегда.
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const allowedKey = (units === undefined || units.length === 0 ? ALL_UNITS : units).join(
    ",",
  );
  const allowed = useMemo(
    () => resolveUnits(allowedKey.split(",") as ByteUnit[]),
    [allowedKey],
  );
  const preset =
    defaultValue ??
    hints?.find((hint) => hint.default === true)?.value ??
    hints?.[0]?.value;
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== undefined,
  );
  const shown = locked ? preset : value;
  const lastEmitted = useRef<number | undefined>(value);
  const initial = splitBytes(shown ?? 0, allowed);
  const [amount, setAmount] = useState(shown === undefined ? "" : initial.amount);
  const [unit, setUnit] = useState<ByteUnit>(
    shown === undefined ? defaultUnit(allowed) : initial.unit,
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (shown === undefined) {
      lastEmitted.current = value;
      setAmount("");
      setUnit((current) => (allowed.includes(current) ? current : defaultUnit(allowed)));
      return;
    }
    if (overridden && value === lastEmitted.current) {
      return;
    }
    if (overridden) {
      lastEmitted.current = value;
    }
    const next = splitBytes(shown, allowed);
    setAmount(next.amount);
    setUnit(next.unit);
  }, [shown, value, overridden, allowed]);

  const emit = (nextAmount: string, nextUnit: ByteUnit) => {
    const raw = nextAmount.trim();
    if (raw === "") {
      lastEmitted.current = undefined;
      onChange(undefined);
      return;
    }
    const bytes = toBytes(nextAmount, nextUnit);
    if (bytes === undefined) {
      return;
    }
    lastEmitted.current = bytes;
    onChange(bytes);
  };

  const applyHint = (bytes: number) => {
    const next = splitBytes(bytes, allowed);
    setAmount(next.amount);
    setUnit(next.unit);
    lastEmitted.current = bytes;
    onChange(bytes);
  };

  // Метка умолчания: подпись подсказки, если она есть, иначе своя разбивка.
  const presetLabel =
    preset === undefined
      ? ""
      : (hints?.find((hint) => hint.value === preset)?.label ??
        (() => {
          const split = splitBytes(preset, allowed);
          return `${split.amount}${split.unit}`;
        })());
  // При «умолчании» селектор стоит на месте, но погашен: иначе колонка единиц
  // пустеет и выглядит так, будто единицы у поля нет вовсе.
  const unitSelect = (
    <UnitSelect
      disabled={locked}
      value={allowed.includes(unit) ? unit : defaultUnit(allowed)}
      options={allowed.map((item) => ({ value: item, label: item }))}
      onChange={(next) => {
        setUnit(next);
        emit(amount, next);
      }}
    />
  );

  const hintRow =
    hints !== undefined && hints.length > 0 && !table ? (
      <Stack
        direction="row"
        useFlexGap
        spacing={0.5}
        sx={{ flexWrap: "wrap", mt: 0.5 }}
      >
        {hints.map((hint) => {
          const selected = !locked && shown === hint.value;
          const isDefault = !locked && preset === hint.value;
          return (
            <Chip
              key={`${hint.label}-${hint.value}`}
              size="small"
              disabled={locked}
              variant={selected ? "filled" : "outlined"}
              color={selected || isDefault ? "primary" : "default"}
              label={hint.label}
              onClick={() => applyHint(hint.value)}
            />
          );
        })}
      </Stack>
    ) : undefined;

  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          hints === undefined || hints.length < PRESETS_MIN ? undefined : (
            <Presets
              items={hints.map((hint) => ({
                label: hint.label,
                value: hint.value,
                default: preset === hint.value,
              }))}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(bytes) => setOverridden(true, () => applyHint(bytes))}
            />
          )
        }
        unit={unitSelect}
        check={
          optional === true ? (
            <Optional
              overridden={overridden}
              onOverridden={(on) =>
                setOverridden(on, () => onChange(on ? (preset ?? 0) : undefined))
              }
            />
          ) : undefined
        }
      >
        <InputBase
          value={locked ? defaultLabelOf(presetLabel) : amount}
          readOnly={locked}
          type={locked ? "text" : "number"}
          onChange={(e) => {
            const next = e.target.value;
            setAmount(next);
            emit(next, unit);
          }}
          inputProps={{
            min: 0,
            step: "any",
            tabIndex: locked ? -1 : undefined,
          }}
          sx={{ ...numberInputSx, ...(locked ? mutedInputSx : {}) }}
        />
      </SettingsRow>
    );
  }

  const field = (
    <TextField
      size="small"
      fullWidth
      type={locked ? "text" : "number"}
      label={label}
      value={locked ? defaultLabelOf("") : amount}
      onFocus={() => {
        if (!locked) {
          setFocused(true);
        }
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const next = e.target.value;
        setAmount(next);
        emit(next, unit);
      }}
      slotProps={{
        htmlInput: {
          min: 0,
          step: "any",
          readOnly: locked,
          tabIndex: locked ? -1 : undefined,
        },
        input: {
          endAdornment: (
            <FieldAdornment
              optional={optional}
              overridden={overridden}
              onOverridden={(on) =>
                setOverridden(on, () =>
                  onChange(on ? (preset ?? 0) : undefined),
                )
              }
              extra={locked ? undefined : unitSelect}
            />
          ),
        },
      }}
      sx={{
        width: "100%",
        ...lockedFieldSx(locked),
        "& input[type=number]": { MozAppearance: "textfield" },
        "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
          {
            WebkitAppearance: "none",
            margin: 0,
          },
      }}
    />
  );

  return (
    <Box sx={wide === true ? { ...fieldSx, gridColumn: "1 / -1" } : fieldSx}>
      <FieldTooltip title={helper} open={focused} disabled={locked}>
        {field}
      </FieldTooltip>
      {hintRow}
    </Box>
  );
}

/**
 * Строка выбора: действующее значение текстом, варианты -- чипами у правого
 * края той же строки. Отдельная выпадашка внутри ячейки ставила бы свою
 * стрелку на 16px левее колонки единиц, и правый край строки гулял бы от
 * вида поля к виду поля.
 */
/**
 * Выбор из фиксированного списка без «умолчания»: метод балансировки, вид
 * сертификата. В таблице -- строка с чипами вариантов, в сетке -- Select.
 */
export function Pick<T extends string>({
  label,
  helper,
  value,
  options,
  select,
  onChange,
}: {
  label: string;
  helper?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  /**
   * Выпадающий список вместо чипов. Чипы хороши на трёх режимах, где выбор
   * виден целиком; десяток путей или страниц чипами -- это строка на три
   * экрана, и её место в списке.
   */
  select?: boolean;
  onChange: (next: T) => void;
}) {
  if (useFieldLayout() === "table") {
    if (select === true) {
      return (
        <SelectRow
          label={label}
          helper={helper}
          value={value}
          options={options}
          onChange={onChange}
        />
      );
    }

    return (
      <PickRow label={label} helper={helper} value={value} options={options} onChange={onChange} />
    );
  }
  return (
    <FormControl size="small" fullWidth sx={fieldSx}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        /*
          Пустое значение -- полноправный пункт («встроенная страница»,
          «редирект»): без displayEmpty MUI считает его «ничего не выбрано» и
          рисует пустое поле, хотя пункт с подписью в списке есть.
        */
        displayEmpty
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {helper !== undefined && helper !== "" && (
        <FormHelperText>{helper}</FormHelperText>
      )}
    </FormControl>
  );
}

/**
 * Строка с выпадающим списком: значение и есть селектор, без рамки и
 * подчёркивания -- рамка вокруг него читалась бы полем внутри таблицы. Тот же
 * вид, что у селектора «чем задано» в шапке блока.
 */
function SelectRow<T extends string>({
  label,
  helper,
  value,
  options,
  onChange,
}: {
  label: string;
  helper?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <SettingsRow label={label} help={helper}>
      <Select
        value={value}
        variant="standard"
        disableUnderline
        fullWidth
        /* Пустое значение -- обычный пункт со своей подписью, см. Pick выше. */
        displayEmpty
        inputProps={{ "aria-label": label }}
        onChange={(e) => onChange(e.target.value as T)}
        sx={{
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          "& .MuiSelect-select": {
            py: 0,
            pl: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} sx={{ fontSize: "0.8rem" }}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </SettingsRow>
  );
}

function PickRow<T extends string>({
  label,
  helper,
  value,
  options,
  unset,
  check,
  onChange,
}: {
  label: string;
  helper?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  unset?: T;
  /** Галочка «умолчание» в правом слоте -- та же, что у полей со значением. */
  check?: ReactNode;
  onChange: (next: T) => void;
}) {
  const current = options.find((item) => item.value === value);
  const isUnset = unset !== undefined && value === unset;
  /*
    Чипами показываются только настоящие варианты: «по умолчанию» уже написано
    в самой ячейке, и чип с ним удлинял бы ряд ради того, что и так видно.
    Повторный клик по выбранному чипу снимает ключ -- это и есть возврат к
    умолчанию, тем же движением, что и выбор.
  */
  const picks = options.filter((item) => item.value !== unset);
  return (
    <SettingsRow
      label={label}
      help={helper}
      end={
        picks.length < PRESETS_MIN ? undefined : (
        <Presets
          items={picks.map((item) => ({ label: item.label, value: item.value }))}
          current={value}
          onPick={(next) =>
            onChange(next === value && unset !== undefined ? unset : next)
          }
        />
        )
      }
      check={check}
    >
      <Box
        sx={{
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: isUnset ? "text.secondary" : "text.primary",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {current?.label ?? value}
      </Box>
    </SettingsRow>
  );
}

export type TimeUnit = "ms" | "s" | "min" | "h";

const TIME_FACTOR_MS: Record<TimeUnit, number> = {
  ms: 1,
  s: 1000,
  min: 60_000,
  h: 3_600_000,
};

const TIME_UNITS: readonly TimeUnit[] = ["ms", "s", "min", "h"];

function splitTime(
  valueMs: number,
  units: readonly TimeUnit[],
): { amount: string; unit: TimeUnit } {
  const ranked = [...units].sort((a, b) => TIME_FACTOR_MS[b] - TIME_FACTOR_MS[a]);
  /*
    Ноль делится нацело на любую единицу, и правило «самая крупная, в которой
    значение целое» давало `0h` там, где директива меряет миллисекунды. У нуля
    единица одна -- та, в которой поле считает.
  */
  if (valueMs === 0) {
    return { amount: "0", unit: ranked[ranked.length - 1] ?? "ms" };
  }
  for (const unit of ranked) {
    if (valueMs % TIME_FACTOR_MS[unit] === 0) {
      return { amount: String(valueMs / TIME_FACTOR_MS[unit]), unit };
    }
  }
  const unit = ranked[ranked.length - 1] ?? "ms";
  return { amount: trimAmount(valueMs / TIME_FACTOR_MS[unit]), unit };
}

/**
 * Подпись длительности той единицей, в которой она целая: 10000 -- «10s».
 * Та же, что у подстановок поля: значение в таблице и подстановка под ним
 * читаются одной мерой.
 */
export function timeLabel(valueMs: number): string {
  const split = splitTime(valueMs, TIME_UNITS);
  return `${split.amount}${split.unit}`;
}

/**
 * Длительность с селектором единиц. Значение наружу -- число в `base`
 * (миллисекунды или секунды -- как хранит директива); единицы мельче base не
 * предлагаются, потому что директива их не примет.
 */
export function Duration({
  name,
  label,
  value,
  onChange,
  base,
  helper,
  optional,
  fallback,
  presets,
}: {
  /** Ключ документа -- чтобы запертое поле показало, что унаследовано. */
  name?: string;
  label: string;
  /** В единицах `base`. */
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  base: "ms" | "s";
  helper?: string;
  optional?: boolean;
  /** В единицах `base`. */
  fallback?: number;
  /** В единицах `base`. */
  presets?: readonly number[];
}) {
  const defaultLabelOf = useDefaultLabel(name);
  // В оверлее маршрута галочка есть у каждого поля: снять ключ можно всегда.
  optional = optional === true || useInheritMode();
  const table = useFieldLayout() === "table";
  const baseMs = TIME_FACTOR_MS[base];
  const allowed = useMemo(
    () => TIME_UNITS.filter((unit) => TIME_FACTOR_MS[unit] >= baseMs),
    [baseMs],
  );
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value !== undefined,
  );
  const shown = locked ? fallback : value;
  const lastEmitted = useRef<number | undefined>(value);
  const initial = splitTime((shown ?? 0) * baseMs, allowed);
  const [amount, setAmount] = useState(shown === undefined ? "" : initial.amount);
  const [unit, setUnit] = useState<TimeUnit>(shown === undefined ? base : initial.unit);

  useEffect(() => {
    if (shown === undefined) {
      lastEmitted.current = value;
      setAmount("");
      return;
    }
    if (overridden && value === lastEmitted.current) {
      return;
    }
    if (overridden) {
      lastEmitted.current = value;
    }
    const next = splitTime(shown * baseMs, allowed);
    setAmount(next.amount);
    setUnit(next.unit);
  }, [shown, value, overridden, allowed, baseMs]);

  const emit = (nextAmount: string, nextUnit: TimeUnit) => {
    const raw = nextAmount.trim();
    if (raw === "") {
      lastEmitted.current = undefined;
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return;
    }
    const next = Math.round((n * TIME_FACTOR_MS[nextUnit]) / baseMs);
    lastEmitted.current = next;
    onChange(next);
  };

  const apply = (next: number) => {
    const split = splitTime(next * baseMs, allowed);
    setAmount(split.amount);
    setUnit(split.unit);
    lastEmitted.current = next;
    onChange(next);
  };

  // Селектор виден и при «умолчании», погашенным -- см. Bytes.
  const unitSelect = (
    <UnitSelect
      disabled={locked}
      value={unit}
      options={allowed.map((item) => ({ value: item, label: item }))}
      onChange={(next) => {
        setUnit(next);
        emit(amount, next);
      }}
    />
  );
  const seed = fallback ?? presets?.[0] ?? 0;
  const presetItems: PresetItem<number>[] = (presets ?? []).map((item) => {
    const split = splitTime(item * baseMs, allowed);
    return {
      label: `${split.amount}${split.unit}`,
      value: item,
      default: fallback === item,
    };
  });
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) =>
          setOverridden(on, () => (on ? apply(seed) : onChange(undefined)))
        }
      />
    ) : undefined;
  // Подпись умолчания: своё значение директивы, иначе первая подстановка --
  // та же, что подставится по снятию галочки.
  const seedLabel =
    seed === 0 && fallback === undefined
      ? ""
      : (() => {
          const split = splitTime(seed * baseMs, allowed);
          return `${split.amount}${split.unit}`;
        })();
  const input = (
    <InputBase
      value={locked ? defaultLabelOf(seedLabel) : amount}
      readOnly={locked}
      type={locked ? "text" : "number"}
      onChange={(e) => {
        const next = e.target.value;
        setAmount(next);
        emit(next, unit);
      }}
      inputProps={{ min: 0, step: "any", tabIndex: locked ? -1 : undefined }}
      sx={{ ...numberInputSx, ...(locked ? mutedInputSx : {}) }}
    />
  );

  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        end={
          presetItems.length < PRESETS_MIN ? undefined : (
            <Presets
              items={presetItems}
              current={locked ? undefined : value}
              disabled={locked}
              onPick={(next) => setOverridden(true, () => apply(next))}
            />
          )
        }
        unit={unitSelect}
        check={optionalSlot}
      >
        {input}
      </SettingsRow>
    );
  }

  return (
    <FieldTooltip title={helper} disabled={locked}>
      <TextField
        size="small"
        fullWidth
        type={locked ? "text" : "number"}
        label={label}
        value={locked ? defaultLabelOf(seedLabel) : amount}
        onChange={(e) => {
          const next = e.target.value;
          setAmount(next);
          emit(next, unit);
        }}
        slotProps={{
          htmlInput: {
            min: 0,
            step: "any",
            readOnly: locked,
            tabIndex: locked ? -1 : undefined,
          },
          input: {
            endAdornment: (
              <FieldAdornment
                optional={optional}
                overridden={overridden}
                onOverridden={(on) =>
                  setOverridden(on, () => (on ? apply(seed) : onChange(undefined)))
                }
                extra={locked ? undefined : unitSelect}
              />
            ),
          },
        }}
        sx={{ ...fieldSx, ...lockedFieldSx(locked), ...numberInputSx }}
      />
    </FieldTooltip>
  );
}

export function Tri({
  fallback,
  name,
  t,
  label,
  value,
  onChange,
  helper,
  optional,
}: {
  /**
   * Умолчание директивы -- значение в подписи пустого варианта: `on (по
   * умолчанию)` на http, `on (умолчание)` в оверлее маршрута. Без него подпись
   * не отвечает на единственный вопрос пустой строки -- что действует сейчас.
   */
  fallback?: string;
  name?: string;
  t: Translate;
  label: string;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
  helper?: string;
  /**
   * Ключа может не быть -- и тогда в правом слоте стоит та же галочка, что у
   * полей со значением. Повторный клик по чипу снимает ключ и без неё, но
   * узнать об этом можно было, только попробовав: у соседней строки с числом
   * галочка есть, у этой колонка пустая, и «умолчание» читалось свойством
   * чисел. Снятая галочка ставит умолчание директивы явным значением.
   */
  optional?: boolean;
}) {
  const inheritMode = useInheritMode();
  optional = optional === true || inheritMode;
  const inherited = useInherited(name);
  const unsetLabel = inheritMode
    ? inheritedLabel(t, inherited, fallback ?? "")
    : defaultLabel(t, fallback ?? "");
  const current = value === undefined ? UNSET : value ? "on" : "off";
  // Снятая галочка даёт то, что действует сейчас: значение родителя в оверлее
  // маршрута, иначе умолчание директивы.
  const seed = typeof inherited?.value === "boolean" ? inherited.value : fallback === "on";
  if (useFieldLayout() === "table") {
    return (
      <PickRow
        label={label}
        helper={helper}
        value={current}
        unset={UNSET}
        options={[
          { value: UNSET, label: unsetLabel },
          { value: "on", label: t("common.on") },
          { value: "off", label: t("common.off") },
        ]}
        check={
          optional === true ? (
            <Optional
              overridden={value !== undefined}
              onOverridden={(on) => onChange(on ? seed : undefined)}
            />
          ) : undefined
        }
        onChange={(next) => onChange(next === UNSET ? undefined : next === "on")}
      />
    );
  }
  return (
    <FormControl size="small" fullWidth sx={fieldSx}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={current}
        onChange={(e) => {
          const next = String(e.target.value);
          onChange(next === UNSET ? undefined : next === "on");
        }}
      >
        <MenuItem value={UNSET}>{unsetLabel}</MenuItem>
        <MenuItem value="on">{t("common.on")}</MenuItem>
        <MenuItem value="off">{t("common.off")}</MenuItem>
      </Select>
      {helper !== undefined && helper !== "" && (
        <FormHelperText>{helper}</FormHelperText>
      )}
    </FormControl>
  );
}

export function Choice({
  fallback,
  name,
  t,
  label,
  value,
  options,
  onChange,
  helper,
  optional,
}: {
  /**
   * Умолчание директивы -- значение в подписи пустого варианта: `on (по
   * умолчанию)` на http, `on (умолчание)` в оверлее маршрута. Без него подпись
   * не отвечает на единственный вопрос пустой строки -- что действует сейчас.
   */
  fallback?: string;
  name?: string;
  t: Translate;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
  helper?: string;
  /** Ключа может не быть: галочка «умолчание» в правом слоте -- см. [Tri]. */
  optional?: boolean;
}) {
  const inheritMode = useInheritMode();
  optional = optional === true || inheritMode;
  const inherited = useInherited(name);
  const unsetLabel = inheritMode
    ? inheritedLabel(t, inherited, fallback ?? "")
    : defaultLabel(t, fallback === undefined ? "" : optionLabel(t, fallback));
  /*
    Снятая галочка даёт то, что действует сейчас: значение родителя в оверлее
    маршрута, иначе умолчание директивы, иначе первый вариант.
  */
  const seed =
    typeof inherited?.value === "string" && inherited.value !== ""
      ? inherited.value
      : (fallback ?? options[0]);
  if (useFieldLayout() === "table") {
    const current = value === "" ? UNSET : value;
    return (
      <PickRow
        label={label}
        helper={helper}
        value={current}
        unset={UNSET}
        options={[
          { value: UNSET, label: unsetLabel },
          ...options.map((option) => ({
            value: option,
            label: optionLabel(t, option),
          })),
        ]}
        check={
          optional === true && seed !== undefined ? (
            <Optional
              overridden={value !== ""}
              onOverridden={(on) => onChange(on ? seed : undefined)}
            />
          ) : undefined
        }
        onChange={(next) => onChange(next === UNSET ? undefined : next)}
      />
    );
  }
  return (
    <FormControl size="small" fullWidth sx={fieldSx}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value === "" ? UNSET : value}
        onChange={(e) => {
          const next = String(e.target.value);
          onChange(next === UNSET ? undefined : next);
        }}
      >
        <MenuItem value={UNSET}>{unsetLabel}</MenuItem>
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {optionLabel(t, option)}
          </MenuItem>
        ))}
      </Select>
      {helper !== undefined && helper !== "" && (
        <FormHelperText>{helper}</FormHelperText>
      )}
    </FormControl>
  );
}

export function Chips({
  name,
  t,
  label,
  value,
  onChange,
  options,
  helper,
  placeholder,
  wide,
  freeSolo,
  parse,
  optional,
  fallback,
  flag,
  optionLabel: labelOf,
}: {
  /** Ключ документа -- чтобы запертое поле показало, что унаследовано. */
  name?: string;
  t: Translate;
  label: string;
  value: string[];
  onChange: (value: string[] | undefined) => void;
  options?: readonly string[];
  helper?: string;
  placeholder?: string;
  wide?: boolean;
  freeSolo?: boolean;
  parse?: (raw: string) => string | undefined;
  optional?: boolean;
  fallback?: readonly string[];
  /**
   * Оговорка к полю -- `InlineFlag` в хвосте строки, за подстановками.
   * Табличный режим: в сетке у поля нет строки, в хвост которой её положить
   * (так же, как `wide` живёт только в сетке).
   */
  flag?: ReactNode;
  /**
   * Человеческая подпись значения -- в подстановках и на чипах. Хранится и
   * едет на провод само значение: подпись только для глаз.
   */
  optionLabel?: (value: string) => string;
}) {
  const defaultLabelOf = useDefaultLabel(name);
  const show = labelOf ?? ((value: string) => value);
  // В оверлее маршрута галочка есть у каждого поля: снять ключ можно всегда.
  optional = optional === true || useInheritMode();
  const inherited = useInherited(name);
  const inheritedList = Array.isArray(inherited?.value)
    ? inherited.value.filter((v): v is string => typeof v === "string")
    : undefined;
  const seedList = inheritedList ?? fallback ?? options?.slice(0, 1) ?? [];
  const table = useFieldLayout() === "table";
  const allowFree = freeSolo !== false;
  const { locked, overridden, setOverridden } = useOptionalLock(
    optional,
    value.length > 0,
  );
  const display = locked ? [] : value;
  const normalize = (raw: string): string | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return undefined;
    }
    return parse === undefined ? trimmed : parse(trimmed);
  };

  const commit = (next: readonly (string | { label?: string })[]) => {
    const items: string[] = [];
    for (const item of next) {
      const raw = typeof item === "string" ? item : (item.label ?? "");
      const parsed = normalize(raw);
      if (parsed !== undefined && !items.includes(parsed)) {
        items.push(parsed);
      }
    }
    onChange(items.length === 0 ? undefined : items);
  };

  const rest = (options ?? []).filter((option) => !value.includes(option));
  /*
    У поля со свободным вводом одна подстановка -- шум: значение и так набирают
    руками. У закрытого словаря подстановки заменяют список, и один оставшийся
    вариант там столь же нужен, сколько первый.
  */
  const presetsMin = allowFree ? PRESETS_MIN : 1;

  const hint = locked
    ? defaultLabelOf((fallback ?? []).join(", "))
    : (placeholder ??
      (allowFree
        ? t("config.chipsHint")
        : table && rest.length > 0
          ? t("config.chipsPick")
          : undefined));
  const optionalSlot =
    optional === true ? (
      <Optional
        overridden={overridden}
        onOverridden={(on) =>
          setOverridden(on, () =>
            onChange(on ? [...seedList] : undefined),
          )
        }
      />
    ) : undefined;

  const autocomplete = (
    <Autocomplete
      multiple
      sx={table ? { width: "100%" } : chipsFieldSx}
      readOnly={locked}
      disableClearable={locked}
      /*
        В таблице список не разворачивается: он ложится во всю ширину строки,
        закрывает соседние и требует второго клика ради значения, которое рядом
        стоит чипом. Варианты предлагаются подстановками справа, ввод -- Enter.
      */
      open={locked || table ? false : undefined}
      forcePopupIcon={false}
      freeSolo={allowFree}
      options={options === undefined ? [] : [...options]}
      value={display}
      filterSelectedOptions
      onChange={(_e: SyntheticEvent, next) => {
        if (locked) {
          return;
        }
        commit(next);
      }}
      /*
        Значения -- те же чипы, что подстановки справа: одна высота, одно
        скругление, один кегль. Крестик -- обычный крест, а не бледный кружок
        `CancelIcon`: в строке высотой 20px он читался грязным пятном.
        Левый край чипа стоит там же, где текст в соседних строках -- своего
        отступа у списка нет.
      */
      renderValue={(items, getItemProps) =>
        items.map((item, index) => (
          <Chip
            {...getItemProps({ index })}
            key={`${item}-${index}`}
            label={show(item)}
            size="small"
            deleteIcon={<CloseIcon />}
            sx={valueChipSx}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          variant={table ? "standard" : "outlined"}
          label={table ? undefined : label}
          placeholder={table && display.length > 0 ? undefined : hint}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps?.htmlInput,
              /*
                В таблице список не разворачивается, а закрытый словарь не
                принимает набранного: строка ввода там только собирает текст,
                которому некуда деться. Значения кладут чипы подстановок.
              */
              readOnly: locked || (table && !allowFree),
              tabIndex: locked ? -1 : undefined,
            },
            input: {
              ...params.slotProps.input,
              ...(table === true ? { disableUnderline: true } : {}),
              endAdornment: table ? (
                undefined
              ) : (
                <FieldAdornment
                  extra={
                    locked ? undefined : params.slotProps.input.endAdornment
                  }
                  optional={optional}
                  overridden={overridden}
                  onOverridden={(on) =>
                    setOverridden(on, () =>
                      onChange(on ? [...seedList] : undefined),
                    )
                  }
                />
              ),
            },
          }}
          sx={
            table
              ? {
                  width: "100%",
                  ...lockedFieldSx(locked),
                  "& .MuiInputBase-root": {
                    flexWrap: "wrap",
                    alignItems: "center",
                    minHeight: 24,
                  },
                  "& .MuiInputBase-input": {
                    py: 0.25,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  },
                }
              : {
                  ...(wide === true
                    ? { ...fieldSx, gridColumn: "1 / -1" }
                    : fieldSx),
                  ...lockedFieldSx(locked),
                }
          }
        />
      )}
    />
  );

  const presets =
    rest.length < presetsMin ? undefined : (
      <Presets
        items={rest.map((option) => ({ label: show(option), value: option }))}
        min={presetsMin}
        disabled={locked}
        onPick={(next) => setOverridden(true, () => onChange([...value, next]))}
      />
    );

  if (table) {
    return (
      <SettingsRow
        label={label}
        help={helper}
        grow
        end={
          presets === undefined && flag === undefined ? undefined : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexShrink: 0,
              }}
            >
              {presets}
              {/*
                Разделитель отделяет подстановку от оговорки: чип кладёт
                значение в поле слева, тумблер -- своя настройка, и без линии
                хвост строки читается одним рядом значков.
              */}
              {presets !== undefined && flag !== undefined && (
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ my: 1, borderColor: "divider" }}
                />
              )}
              {flag}
            </Box>
          )
        }
        check={optionalSlot}
      >
        {autocomplete}
      </SettingsRow>
    );
  }

  return <FieldTooltip title={helper} disabled={locked}>{autocomplete}</FieldTooltip>;
}

export function Flag({
  label,
  checked,
  onChange,
  helper,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  helper?: string;
  disabled?: boolean;
}) {
  if (useFieldLayout() === "table") {
    return (
      <SettingsRow label={label} help={helper}>
        {/* Тумблер у правого края ячейки: слева он висел в пустоте значения. */}
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
          <Switch
            size="small"
            checked={checked}
            disabled={disabled === true}
            onChange={(e) => onChange(e.target.checked)}
            slotProps={{ input: { "aria-label": label } }}
          />
        </Box>
      </SettingsRow>
    );
  }
  return (
    <Box sx={fieldSx}>
      <FormControlLabel
        sx={{ ml: 0.5 }}
        control={
          <Switch
            size="small"
            checked={checked}
            disabled={disabled === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        }
        label={label}
      />
      {helper !== undefined && helper !== "" && (
        <FormHelperText sx={{ ml: 1.5, mt: 0 }}>{helper}</FormHelperText>
      )}
    </Box>
  );
}

/**
 * Тумблер в хвосте чужой строки: короткая подпись и переключатель.
 *
 * Своя строка нужна тумблеру, который сам по себе настройка. Оговорка к
 * соседнему полю («а GET без text/html?») на своей строке читается как второе,
 * независимое правило, да ещё и с фразой-условием вместо имени в колонке имён.
 * В хвосте строки она стоит там же, где стоит во фразе, а сам переключатель --
 * в той же правой колонке, что тумблеры обычных строк.
 *
 * Подпись поэтому короткая: условие целиком живёт в подсказке. Подсказка
 * висит на всей группе -- и на подписи, и на переключателе: значок со своей
 * подсказкой в строке уже есть (в колонке имён), второй читался бы как
 * подсказка к тому же полю.
 */
export function InlineFlag({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const hinted = help !== undefined && help !== "";
  const flag = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flexShrink: 0,
        cursor: hinted ? "help" : undefined,
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: "0.66rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          color: disabled === true ? "text.disabled" : "text.secondary",
        }}
      >
        {label}
      </Box>
      <Switch
        size="small"
        checked={checked}
        disabled={disabled === true}
        onChange={(e) => onChange(e.target.checked)}
        slotProps={{ input: { "aria-label": label } }}
      />
    </Box>
  );

  if (!hinted) {
    return flag;
  }

  return (
    <Tooltip
      arrow
      title={<HintMarkup text={help} />}
      placement="top-end"
      enterDelay={200}
    >
      {flag}
    </Tooltip>
  );
}

export { NginxEditor } from "./nginx-editor/NginxEditor.tsx";
