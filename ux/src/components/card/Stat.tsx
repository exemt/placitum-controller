/*
 * Полоса показателей карточки.
 *
 * Enterprise-консоль показывает числа лентой, а не столбиком панелей: у
 * участника их полтора десятка, и каждая своя рамка с заголовком секции стоила
 * бы четырёх экранов на пять карточек. Поэтому все показатели одного участника
 * идут одной лентой: показатель — метка, значение и подпись в две строки,
 * слева тонкая грань. Грань же и группирует: у класса ответа и у канала она
 * своего цвета, у хоста — нейтральная.
 *
 * Показатель без значения не рисуется: прочерк вместо числа — не метрика.
 */

import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { Sparkline } from "../Sparkline.tsx";

export type Tone = "primary" | "success" | "warning" | "error";

export interface StatProps {
  label: string;
  value: string;
  /** Одна-две строки мелким: единицы, доля, разбор. */
  sub?: string | (string | null)[];
  /** Цвет метки, грани и ряда точек. Без него грань нейтральная. */
  accent?: string;
  /** Заполнение 0..1 — тонкой полосой под значением. */
  fill?: number;
  tone?: Tone;
  /** Ряд последних точек — фоном, а не отдельной колонкой. */
  series?: number[];
  /** Длинные подписи (каналы работы) просят вдвое больше места. */
  wide?: boolean;
  /**
   * Тянуться по остатку строки вместо фиксированной ширины. Ставит его
   * лента, а не показатель: см. `stretch` у StatStrip.
   */
  grow?: boolean;
  /**
   * Сколько строк подписи держать всегда. Канал пишет то две строки, то три —
   * без резерва лента прыгала бы каждый раз, как появится строка ошибок.
   */
  subSlots?: number;
}

export function Stat({
  label,
  value,
  sub,
  accent,
  fill,
  tone,
  series,
  wide = false,
  grow = false,
  subSlots,
}: StatProps) {
  const lines = subLines(sub, subSlots);
  const hasSeries = series !== undefined && series.length > 1;

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        // Ширина фиксирована, а не тянется по остатку строки: тогда CPU и
        // память стоят на одном месте во всех карточках сразу, и колонки
        // сравниваются взглядом сверху вниз, а не по одной карточке. У ленты,
        // которая на странице одна, сравнивать не с чем -- она тянется.
        flex: grow ? `1 1 ${wide ? 264 : 168}px` : "0 0 auto",
        width: grow ? "auto" : wide ? 264 : 168,
        maxWidth: "100%",
        borderLeft: "2px solid",
        borderColor: accent ?? "divider",
        pl: 1.25,
        py: 0.25,
        pb: hasSeries ? "13px" : 0.25,
      }}
    >
      {hasSeries && (
        <Box
          sx={{
            position: "absolute",
            insetInline: 0,
            bottom: 0,
            height: 12,
            opacity: 0.45,
            pointerEvents: "none",
            "& svg": { display: "block", height: 12 },
          }}
        >
          <Sparkline values={series} color={accent ?? "#6aa8ff"} />
        </Box>
      )}
      <Typography
        component="div"
        noWrap
        sx={{
          fontSize: "0.65rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          lineHeight: 1.4,
          color: accent ?? "text.secondary",
          opacity: accent === undefined ? 0.85 : 1,
        }}
      >
        {label}
      </Typography>
      <Typography
        component="div"
        noWrap
        sx={{
          position: "relative",
          fontSize: "0.95rem",
          fontWeight: 600,
          lineHeight: 1.35,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
      {lines.map((line, index) => (
        <Typography
          // eslint-disable-next-line react/no-array-index-key -- резерв строк
          key={index}
          component="div"
          noWrap
          sx={{
            position: "relative",
            fontSize: "0.65rem",
            lineHeight: 1.4,
            color: "text.secondary",
            opacity: 0.7,
          }}
        >
          {line}
        </Typography>
      ))}
      {fill !== undefined && (
        <LinearProgress
          variant="determinate"
          value={clamp01(fill) * 100}
          color={tone ?? fillTone(fill)}
          sx={{ position: "relative", mt: 0.5, height: 3, borderRadius: 1 }}
        />
      )}
    </Box>
  );
}

/**
 * Лента: показатели идут подряд и переносятся сами. Группы разделяются не
 * заголовком, а промежутком — `null` в списке и есть этот промежуток.
 *
 * `stretch` растягивает показатели по всей ширине. Это для ленты, которая на
 * странице одна: у ленты в карточке ширина фиксирована нарочно, чтобы CPU и
 * память стояли на одной вертикали во всех карточках сразу.
 */
export function StatStrip({
  items,
  stretch = false,
}: {
  items: (StatProps | null)[];
  stretch?: boolean;
}) {
  const shown = compact(items);

  if (shown.length === 0) {
    return null;
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "stretch",
        columnGap: 1.5,
        rowGap: 1,
        px: 1.5,
        py: 1,
      }}
    >
      {shown.map((item, index) =>
        item === null ? (
          // eslint-disable-next-line react/no-array-index-key -- разрыв группы
          <Box
            key={`gap-${index}`}
            sx={{
              flex: "0 0 auto",
              alignSelf: "stretch",
              width: "1px",
              mx: 0.5,
              bgcolor: "divider",
            }}
          />
        ) : (
          <Stat key={item.label} {...item} grow={stretch} />
        ),
      )}
    </Paper>
  );
}

/** Пустые группы не должны оставлять после себя разрывов. */
function compact(items: (StatProps | null)[]): (StatProps | null)[] {
  const out: (StatProps | null)[] = [];
  for (const item of items) {
    if (item === null) {
      if (out.length > 0 && out[out.length - 1] !== null) {
        out.push(null);
      }
      continue;
    }
    out.push(item);
  }
  while (out.length > 0 && out[out.length - 1] === null) {
    out.pop();
  }
  return out;
}

function subLines(sub: StatProps["sub"], slots?: number): string[] {
  const rows = sub === undefined ? [] : Array.isArray(sub) ? sub : [sub];
  const lines = rows.filter(
    (row): row is string => row !== null && row !== "",
  );
  while (slots !== undefined && lines.length < slots) {
    lines.push("\u00a0");
  }
  return lines;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fillTone(value: number): Tone {
  if (value >= 0.85) {
    return "error";
  }
  if (value >= 0.6) {
    return "warning";
  }
  return "primary";
}
