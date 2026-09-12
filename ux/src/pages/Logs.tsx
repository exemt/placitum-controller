/*
 * Журнал процессов ноды: строки access_log и error_log, которые агент снял со
 * своего сокета и положил в waf.log.
 *
 * Не «Журнал» из меню инцидентов и не его срез. Там запись запроса с вердиктом
 * и участниками, здесь строка текста, у которой нет ни ray, ни решения:
 * error_log пишется и там, где запроса не было вовсе -- reload, апстрим, сам
 * конфиг. Общей страницей это было бы двумя таблицами под одним заголовком.
 *
 * Три фильтра и окно. Кто записал и что за сервис -- списки, а не поля ввода:
 * наборы закрытые, короткие и известны заранее (их отдаёт facets), а подстрока
 * по ним нашла бы edge-01 внутри edge-011. Текст -- наоборот, только
 * подстрока: имени у строки лога нет.
 *
 * Те же три значения кликаются прямо в строке (см. Pick): в логи приходят от
 * одной строки, а не от списка -- «вот эта, покажи такие же».
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { fetchLogFacets, fetchLogSearch, type LogFacet, type LogLine } from "../api.ts";
import {
  DataTable,
  FilterRange,
  FilterSelect,
  FilterText,
  useServerPager,
  defaultRange,
  rangeCaption,
  rangeISO,
  snapshotPreset,
  weekStart,
  type DateRange,
  type FilterOption,
} from "../components/data-table/index.ts";
import { useT, type Translate } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { LogLevelsButton } from "./log-levels.tsx";
import { useAppSelector } from "../store/hooks.ts";

const COLS = 5;

/*
 * Уровни syslog в порядке убывания тяжести -- тот же порядок, в котором их
 * называет сам nginx. Набор закрытый, поэтому список зашит, а не считается по
 * данным: «покажи ошибки» надо уметь спросить и на пустом окне.
 */
const SEVERITIES = [
  "",
  "emerg",
  "alert",
  "crit",
  "error",
  "warn",
  "notice",
  "info",
  "debug",
] as const;

// Красное -- то, на что смотрят первым. Остальное серым: раскрашенный целиком
// список перестаёт выделять хоть что-нибудь.
const SEVERITY_COLOR: Record<string, "error" | "warning" | "default"> = {
  emerg: "error",
  alert: "error",
  crit: "error",
  error: "error",
  warn: "warning",
};

export default function Logs() {
  const t = useT();
  const locale = useAppSelector((s) => s.ui.locale);

  // Со страниц-справочников сюда приходят с готовым фильтром: каталог
  // инспекторов зовёт /logs?service=<процесс>. Параметр читается один раз,
  // дальше фильтром владеет сама страница.
  const [searchParams] = useSearchParams();

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [writer, setWriter] = useState("");
  const [service, setService] = useState(() => searchParams.get("service") ?? "");
  const [severity, setSeverity] = useState("");
  const [draftText, setDraftText] = useState("");
  const [text, setText] = useState("");

  /*
   * Размер страницы считает пагинатор по высоте таблицы; 100 -- запасное
   * значение, если мерить нечем. Запрос ждёт `ready`: иначе первая страница
   * уезжает с запасным размером и тут же перезапрашивается посчитанным.
   */
  const pager = useServerPager({ fallback: 100 });
  const { page, pageSize, setPage } = pager;
  const [items, setItems] = useState<LogLine[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<LogFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const rangeLabel =
    rangeCaption(range, (id) => t(`incidentsPage.range.${id}`)) || t("logsPage.time");

  usePageBar({
    flush: true,
    onUpdate: () => {
      if (range.preset !== "") {
        setRange(snapshotPreset(range.preset, new Date(), weekStart(locale)));
      }
      setTick((n) => n + 1);
    },
    meta: rangeLabel,
  });

  // Подстрока набирается посимвольно, а запрос по ней читает партицию: без
  // паузы каждая буква стоила бы отдельного похода в ClickHouse.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = draftText.trim();
      setText((prev) => {
        if (prev === next) {
          return prev;
        }
        setPage(0);
        return next;
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [draftText]);

  useEffect(() => {
    const ac = new AbortController();
    const win = rangeISO(range);

    void fetchLogFacets({ from: win.from, to: win.to })
      .then((row) => {
        if (!ac.signal.aborted) {
          setFacets(row.items);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) {
          setFacets([]);
        }
      });

    return () => ac.abort();
  }, [range, tick]);

  useEffect(() => {
    if (!pager.ready) {
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const win = rangeISO(range);
    void fetchLogSearch({
      writer,
      service,
      severity,
      text,
      from: win.from,
      to: win.to,
      limit: pageSize,
      offset: page * pageSize,
    })
      .then((row) => {
        if (ac.signal.aborted) {
          return;
        }
        setItems(row.items);
        setTotal(row.total);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg === "search_unreachable" ? t("logsPage.unreachable") : msg);
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      });

    return () => ac.abort();
  }, [writer, service, severity, text, page, pageSize, pager.ready, range, t, tick]);

  /*
   * Список сервисов сужается выбранной нодой: пары приезжают вместе, и
   * предлагать тег, которого на этой ноде не бывает, значит предлагать заведомо
   * пустой ответ. Выбранное значение остаётся в списке всегда -- иначе смена
   * ноды молча стирала бы второй фильтр.
   */
  const writers = useMemo(
    () => options(unique(facets.map((row) => row.writer)), writer, t("logsPage.filter.all")),
    [facets, writer, t],
  );

  const services = useMemo(
    () =>
      options(
        unique(
          facets
            .filter((row) => writer === "" || row.writer === writer)
            .map((row) => row.service),
        ),
        service,
        t("logsPage.filter.all"),
      ),
    [facets, writer, service, t],
  );

  const severities = useMemo<FilterOption[]>(
    () =>
      SEVERITIES.map((row) => ({
        value: row,
        label: row === "" ? t("logsPage.filter.all") : row,
      })),
    [t],
  );

  /*
   * Клик по ноде в строке не сбрасывает сервис -- в отличие от селектора.
   * Селектор меняет ноду вслепую, и выбранный сервис на новой может не
   * встречаться вовсе; здесь пара приехала одной строкой, то есть строки на
   * этом пересечении заведомо есть -- сама открытая и есть доказательство.
   */
  const pickWriter = (next: string) => {
    setWriter(next);
    setPage(0);
  };

  const pickService = (next: string) => {
    setService(next);
    setPage(0);
  };

  const pickSeverity = (next: string) => {
    setSeverity(next);
    setPage(0);
  };

  const filtered =
    writer !== "" ||
    service !== "" ||
    severity !== "" ||
    text !== "" ||
    range.preset !== "24h";

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <DataTable
        loading={loading && items.length === 0}
        error={error}
        colSpan={COLS}
        sx={{ flex: 1, minHeight: 0 }}
      >
        <DataTable.Head>
          <FilterRange
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(0);
            }}
            placeholder={t("logsPage.time")}
            width={160}
          />
          <FilterSelect
            value={writer}
            onChange={(next) => {
              setWriter(next);
              setService("");
              setPage(0);
            }}
            options={writers}
            placeholder={t("logsPage.writer")}
            unset=""
            width={150}
          />
          <FilterSelect
            value={service}
            onChange={(next) => {
              setService(next);
              setPage(0);
            }}
            options={services}
            placeholder={t("logsPage.service")}
            unset=""
            width={150}
          />
          <FilterSelect
            value={severity}
            onChange={(next) => {
              setSeverity(next);
              setPage(0);
            }}
            options={severities}
            placeholder={t("logsPage.severity")}
            unset=""
            width={110}
          />
          {/*
            Уровни журнала -- у правого края шапки: их поднимают, когда в
            журнале не видно нужного, и результат смотрят здесь же.
          */}
          <FilterText
            value={draftText}
            onChange={setDraftText}
            placeholder={t("logsPage.text")}
            mono
            action={<LogLevelsButton />}
          />
        </DataTable.Head>
        <DataTable.Body>
          {items.map((row, i) => (
            <TableRow key={`${row.ts}|${row.writer}|${i}`} hover>
              <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
                {clock(row.ts)}
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
                <Pick value={row.writer} current={writer} onPick={pickWriter} />
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
                <Pick value={row.service} current={service} onPick={pickService} />
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                <SeverityChip
                  value={row.severity ?? ""}
                  current={severity}
                  onPick={pickSeverity}
                />
              </TableCell>
              {/*
                Строка целиком, с переносами: обрезанный access-лог отвечает на
                «что-то было», а смотрят в него ради конца строки -- кода,
                апстрима, причины отказа.
              */}
              <TableCell>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {row.text}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          kind={filtered ? "none" : "empty"}
          message={filtered ? t("logsPage.none") : t("logsPage.empty")}
        />
        <DataTable.Error onRetry={() => setTick((n) => n + 1)} />
        <DataTable.Pager
          page={page}
          total={total}
          size={pager}
          disabled={loading}
          onPageChange={setPage}
        />
      </DataTable>
    </Box>
  );
}

/*
 * Значение строки как рычаг фильтра: клик ставит его в шапку. Набор в колонке
 * закрытый и уже разложен по селекторам сверху, но искать там глазами то же
 * слово, которое лежит под курсором, дольше, чем ткнуть в него.
 *
 * Повторный клик снимает. Под фильтром вся колонка -- одно и то же значение, и
 * «поставить его ещё раз» было бы кликом в никуда; снять -- единственное, что
 * с уже выбранным значением вообще можно сделать. Своего состояния у ячейки
 * при этом нет: что выбрано, показывает селектор -- одно место на фильтр.
 */
type PickProps = {
  value: string;
  current: string;
  onPick: (next: string) => void;
};

// Подсказка нужна один раз -- дальше клик очевиден, а всплывающая на каждой
// сотой строке мешает читать сам лог. Отсюда пауза длиннее обычных 200 мс.
const PICK_DELAY = 600;

function pickHint(t: Translate, active: boolean, value: string): string {
  return active ? t("logsPage.pick.off") : t("logsPage.pick.on", { value });
}

function Pick({ value, current, onPick }: PickProps) {
  const t = useT();

  // Пустое значение фильтром не станет: у строки просто нет ноды или тега, а
  // фильтр по пустому -- это «все».
  if (value === "") {
    return <>—</>;
  }

  const active = current === value;

  return (
    <Tooltip arrow placement="top-start" enterDelay={PICK_DELAY} title={pickHint(t, active, value)}>
      <Box
        component="button"
        type="button"
        aria-pressed={active}
        onClick={() => onPick(active ? "" : value)}
        sx={{
          appearance: "none",
          border: 0,
          p: 0,
          bgcolor: "transparent",
          fontFamily: "inherit",
          fontSize: "inherit",
          lineHeight: "inherit",
          color: "inherit",
          cursor: "pointer",
          textDecoration: "none",
          "&:hover": { color: "primary.main", textDecoration: "underline" },
          "&:focus-visible": { color: "primary.main", textDecoration: "underline" },
        }}
      >
        {value}
      </Box>
    </Tooltip>
  );
}

function SeverityChip({ value, current, onPick }: PickProps) {
  const t = useT();

  if (value === "") {
    return <>—</>;
  }

  const active = current === value;

  return (
    <Tooltip arrow placement="top-start" enterDelay={PICK_DELAY} title={pickHint(t, active, value)}>
      <Chip
        size="small"
        variant="outlined"
        color={SEVERITY_COLOR[value] ?? "default"}
        label={value}
        aria-pressed={active}
        onClick={() => onPick(active ? "" : value)}
      />
    </Tooltip>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((row) => row !== ""))].sort();
}

/*
 * Список для селектора. Выбранное значение добавляется, даже если его нет в
 * наборе окна: иначе сдвиг окна назад молча сбрасывал бы фильтр, по которому
 * строк в новом окне не нашлось.
 */
function options(values: string[], selected: string, all: string): FilterOption[] {
  const rows =
    selected !== "" && !values.includes(selected) ? [selected, ...values] : values;

  return [{ value: "", label: all }, ...rows.map((row) => ({ value: row, label: row }))];
}

function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return ts;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
