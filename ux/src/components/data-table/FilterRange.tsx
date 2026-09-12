import { useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { Theme } from "@mui/material/styles";

import { useT } from "../../i18n/index.ts";
import type { Locale } from "../../i18n/locale.ts";
import { useAppSelector } from "../../store/hooks.ts";
import { FilterCell } from "./FilterCell.tsx";

const DAY = 28;

export const RANGE_PRESETS = [
  "15m",
  "1h",
  "6h",
  "24h",
  "7d",
  "30d",
  "today",
  "yesterday",
  "week",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export type DateRange = {
  preset: RangePreset | "";
  from: string;
  to: string;
};

const PRESET_MS: Partial<Record<RangePreset, number>> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseLocal(s: string): Date | undefined {
  if (s === "") {
    return undefined;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
}

function startOfWeek(d: Date, weekStartsOn: 0 | 1): Date {
  const day = d.getDay();
  const diff = weekStartsOn === 1 ? (day === 0 ? 6 : day - 1) : day;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff));
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function withDay(stamp: string, day: Date, fallbackH: number, fallbackM: number): string {
  const prev = parseLocal(stamp);
  const h = prev?.getHours() ?? fallbackH;
  const m = prev?.getMinutes() ?? fallbackM;
  return toLocalInput(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m));
}

function withClock(stamp: string, clock: string, fallbackDay: Date): string {
  const day = parseLocal(stamp) ?? fallbackDay;
  const [h, m] = clock.split(":").map((p) => Number(p));
  return toLocalInput(
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0),
  );
}

export function weekStart(locale: Locale): 0 | 1 {
  return locale === "en" ? 0 : 1;
}

export function snapshotPreset(
  preset: RangePreset,
  now = new Date(),
  weekStartsOn: 0 | 1 = 1,
): DateRange {
  if (preset === "today") {
    return { preset, from: toLocalInput(startOfDay(now)), to: toLocalInput(now) };
  }
  if (preset === "yesterday") {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { preset, from: toLocalInput(startOfDay(y)), to: toLocalInput(endOfDay(y)) };
  }
  if (preset === "week") {
    return {
      preset,
      from: toLocalInput(startOfWeek(now, weekStartsOn)),
      to: toLocalInput(now),
    };
  }
  const ms = PRESET_MS[preset] ?? PRESET_MS["24h"] ?? 0;
  return {
    preset,
    from: toLocalInput(new Date(now.getTime() - ms)),
    to: toLocalInput(now),
  };
}

export function defaultRange(): DateRange {
  return snapshotPreset("24h");
}

export function rangeISO(range: DateRange): { from?: string; to?: string } {
  const from = parseLocal(range.from);
  const to = parseLocal(range.to);
  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
    return { from: to.toISOString(), to: from.toISOString() };
  }
  return {
    from: from?.toISOString(),
    to: to?.toISOString(),
  };
}

function compact(local: string): string {
  if (local.length < 16) {
    return local;
  }
  return `${local.slice(5, 10)} ${local.slice(11, 16)}`;
}

export function rangeCaption(range: DateRange, presetLabel: (id: RangePreset) => string): string {
  if (range.preset !== "") {
    return presetLabel(range.preset);
  }
  if (range.from === "" && range.to === "") {
    return "";
  }
  return `${compact(range.from)} – ${compact(range.to)}`;
}

function monthCells(year: number, month: number, weekStartsOn: 0 | 1): Date[] {
  const first = new Date(year, month, 1);
  const lead = weekStartsOn === 1 ? (first.getDay() === 0 ? 6 : first.getDay() - 1) : first.getDay();
  const start = new Date(year, month, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function weekdayLabels(locale: string, weekStartsOn: 0 | 1): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + weekStartsOn + i)));
}

function Month({
  cursor,
  weekStartsOn,
  locale,
  from,
  to,
  hover,
  today,
  onDay,
  onHover,
}: {
  cursor: Date;
  weekStartsOn: 0 | 1;
  locale: string;
  from: string;
  to: string;
  hover: string | null;
  today: string;
  onDay: (day: Date) => void;
  onHover: (day: string | null) => void;
}) {
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth(), weekStartsOn);
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(cursor);
  const names = weekdayLabels(locale, weekStartsOn);
  const start = from.slice(0, 10);
  const end = (hover ?? to.slice(0, 10));
  const a = start !== "" && end !== "" && start > end ? end : start;
  const b = start !== "" && end !== "" && start > end ? start : end;

  return (
    <Box sx={{ width: 7 * DAY + 8, px: 0.5 }}>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          textAlign: "center",
          fontWeight: 700,
          textTransform: "capitalize",
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", mb: 0.25 }}>
        {names.map((name) => (
          <Typography
            key={name}
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center", fontSize: "0.65rem", fontWeight: 600 }}
          >
            {name}
          </Typography>
        ))}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((day) => {
          const key = ymd(day);
          const outside = day.getMonth() !== cursor.getMonth();
          const future = key > today;
          const isStart = key === start;
          const isEnd = key === end && end !== "";
          const inRange = a !== "" && b !== "" && key >= a && key <= b;
          const isToday = key === today;
          return (
            <Box
              key={key + String(outside)}
              component="button"
              type="button"
              disabled={future}
              onClick={() => onDay(day)}
              onMouseEnter={() => onHover(key)}
              onMouseLeave={() => onHover(null)}
              sx={{
                appearance: "none",
                border: 0,
                width: DAY,
                height: DAY,
                p: 0,
                m: 0,
                fontFamily: "inherit",
                fontSize: "0.7rem",
                fontWeight: isStart || isEnd || isToday ? 700 : 500,
                cursor: future ? "default" : "pointer",
                color: future
                  ? "text.disabled"
                  : outside
                    ? "text.disabled"
                    : isStart || isEnd
                      ? "primary.contrastText"
                      : "text.primary",
                bgcolor: (theme: Theme) =>
                  isStart || isEnd
                    ? theme.palette.primary.main
                    : inRange
                      ? theme.palette.action.selected
                      : "transparent",
                borderRadius: isStart || isEnd ? "50%" : inRange ? 0.5 : "50%",
                outline: isToday && !isStart && !isEnd ? 1 : 0,
                outlineColor: "primary.main",
                "&:hover": future
                  ? undefined
                  : {
                      bgcolor: (theme: Theme) =>
                        isStart || isEnd
                          ? theme.palette.primary.main
                          : theme.palette.action.hover,
                    },
              }}
            >
              {day.getDate()}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Сам выбор окна: пресеты, два месяца, время. Общий у ячейки шапки
 * ([FilterRange]) и поля панели ([RangeField]): календарь один, якоря разные.
 * Состояние выбора живёт здесь и сбрасывается закрытием — Popover
 * размонтирует содержимое.
 */
function RangePicker({
  value,
  onChange,
  anchor,
  onClose,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useAppSelector((s) => s.ui.locale);
  const intl = locale === "ru" ? "ru-RU" : "en-US";
  const weekStartsOn = weekStart(locale);
  const [hover, setHover] = useState<string | null>(null);
  const [pick, setPick] = useState<"from" | "to">("from");
  const fromDate = parseLocal(value.from) ?? new Date();
  const [cursor, setCursor] = useState(() => new Date(fromDate.getFullYear(), fromDate.getMonth(), 1));
  const today = ymd(new Date());

  const presets = useMemo(
    () => RANGE_PRESETS.map((id) => ({ id, label: t(`incidentsPage.range.${id}`) })),
    [t],
  );

  const applyDay = (day: Date) => {
    if (pick === "from" || value.from === "") {
      onChange({
        preset: "",
        from: withDay(value.from, day, 0, 0),
        to: value.to,
      });
      setPick("to");
      return;
    }
    const nextTo = withDay(value.to, day, 23, 59);
    const startAt = parseLocal(value.from);
    const endAt = parseLocal(nextTo);
    if (startAt !== undefined && endAt !== undefined && endAt.getTime() < startAt.getTime()) {
      onChange({ preset: "", from: nextTo, to: value.from });
    } else {
      onChange({ preset: "", from: value.from, to: nextTo });
    }
    setPick("from");
    setHover(null);
  };

  const fromClock = value.from.length >= 16 ? value.from.slice(11, 16) : "00:00";
  const toClock = value.to.length >= 16 ? value.to.slice(11, 16) : "23:59";

  return (
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={onClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              overflow: "hidden",
              border: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        <Stack direction="row" onClick={(e) => e.stopPropagation()}>
          <Stack sx={{ py: 1, width: 132, flexShrink: 0 }}>
            {presets.map((row) => {
              const selected = value.preset === row.id;
              return (
                <Box
                  key={row.id}
                  component="button"
                  type="button"
                  onClick={() => {
                    onChange(snapshotPreset(row.id, new Date(), weekStartsOn));
                    setPick("from");
                    setHover(null);
                  }}
                  sx={{
                    appearance: "none",
                    border: 0,
                    textAlign: "left",
                    px: 1.5,
                    py: 0.55,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    bgcolor: selected ? "action.selected" : "transparent",
                    color: selected ? "primary.main" : "text.secondary",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  {row.label}
                </Box>
              );
            })}
          </Stack>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ p: 1.25 }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
              <IconButton
                size="small"
                onClick={() => setCursor((cur) => addMonths(cur, -1))}
                aria-label="prev"
                sx={{ width: 24, height: 24 }}
              >
                <ChevronLeftIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setCursor((cur) => addMonths(cur, 1))}
                aria-label="next"
                sx={{ width: 24, height: 24 }}
              >
                <ChevronRightIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Month
                cursor={cursor}
                weekStartsOn={weekStartsOn}
                locale={intl}
                from={value.from}
                to={value.to}
                hover={pick === "to" ? hover : null}
                today={today}
                onDay={applyDay}
                onHover={setHover}
              />
              <Month
                cursor={addMonths(cursor, 1)}
                weekStartsOn={weekStartsOn}
                locale={intl}
                from={value.from}
                to={value.to}
                hover={pick === "to" ? hover : null}
                today={today}
                onDay={applyDay}
                onHover={setHover}
              />
            </Stack>
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: "center", mt: 1.25, px: 0.5 }}
            >
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t("incidentsPage.range.from")}
                </Typography>
                <InputBase
                  type="time"
                  value={fromClock}
                  onChange={(e) =>
                    onChange({
                      preset: "",
                      from: withClock(value.from, e.target.value, new Date()),
                      to: value.to,
                    })
                  }
                  sx={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    fontWeight: 600,
                    borderBottom: 1,
                    borderColor: "divider",
                    flex: 1,
                  }}
                />
              </Stack>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t("incidentsPage.range.to")}
                </Typography>
                <InputBase
                  type="time"
                  value={toClock}
                  onChange={(e) =>
                    onChange({
                      preset: "",
                      from: value.from,
                      to: withClock(value.to, e.target.value, new Date()),
                    })
                  }
                  sx={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    fontWeight: 600,
                    borderBottom: 1,
                    borderColor: "divider",
                    flex: 1,
                  }}
                />
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Popover>
  );
}

export function FilterRange({
  value,
  onChange,
  placeholder,
  width,
  minWidth,
  action,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  placeholder: string;
  width?: number | string;
  /** Пол ширины колонки: см. [FilterCell]. */
  minWidth?: number | string;
  /**
   * Кнопки у правого края поля -- как у [FilterText]: не отбор, а то, как
   * колонка показывает своё значение (порядок строк, миллисекунды). Окно
   * времени открывается кликом по полю, поэтому клик по кнопке до него не
   * доходит сам -- останавливать всплытие её дело.
   */
  action?: ReactNode;
}) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const shown = rangeCaption(value, (id) => t(`incidentsPage.range.${id}`));
  const active = value.preset !== "24h";

  return (
    <FilterCell active={active} width={width} minWidth={minWidth}>
      <InputBase
        readOnly
        value={shown}
        placeholder={placeholder}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
        inputProps={{ "aria-label": placeholder }}
        endAdornment={action}
        sx={{
          width: "100%",
          height: "100%",
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          cursor: "pointer",
          "& .MuiInputBase-input": {
            py: 0,
            height: "100%",
            boxSizing: "border-box",
            cursor: "pointer",
          },
          "& .MuiInputBase-input::placeholder": {
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            opacity: 0.55,
          },
        }}
      />
      <RangePicker
        value={value}
        onChange={onChange}
        anchor={anchor}
        onClose={() => setAnchor(null)}
      />
    </FilterCell>
  );
}

/**
 * То же окно времени, но полем панели, а не ячейкой шапки: групповой вид
 * держит фильтры над таблицей, и периоду там самое место — он такой же
 * фильтр, как и остальные.
 */
export function RangeField({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  placeholder: string;
  width?: number;
}) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const shown = rangeCaption(value, (id) => t(`incidentsPage.range.${id}`));
  const active = value.preset !== "24h";

  return (
    <>
      <InputBase
        readOnly
        value={shown}
        placeholder={placeholder}
        onClick={(e) => setAnchor(e.currentTarget)}
        inputProps={{ "aria-label": placeholder }}
        sx={{
          minWidth: width ?? 120,
          maxWidth: width ?? 120,
          px: 1,
          height: 26,
          borderRadius: "2px",
          border: 1,
          borderColor: active ? "primary.main" : "divider",
          fontSize: "0.78rem",
          fontWeight: 600,
          cursor: "pointer",
          "& .MuiInputBase-input": { py: 0, cursor: "pointer" },
          "& .MuiInputBase-input::placeholder": { opacity: 0.6 },
        }}
      />
      <RangePicker
        value={value}
        onChange={onChange}
        anchor={anchor}
        onClose={() => setAnchor(null)}
      />
    </>
  );
}
