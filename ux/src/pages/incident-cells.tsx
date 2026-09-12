/*
 * Ячейки строки журнала. Две мысли на весь файл.
 *
 * Первая: значение в строке -- это готовый вопрос к остальному журналу. Увидел
 * адрес, хост, код -- хочешь тут же увидеть все записи с ним, а не перебивать
 * то же самое в поле фильтра над колонкой. Поэтому значения кликабельны, а
 * повторный клик по уже выставленному снимает фильтр: щёлкнуть второй раз
 * ближе, чем целиться в шапку.
 *
 * Вторая: инспекторы в списке -- фишки, а не строка `modsec: score [100], ...`.
 * Строка обрезалась на втором участнике и не отвечала ни на один вопрос о нём;
 * фишка держит имя и главное число, цвет держит вердикт, а подробности
 * (профиль, роль, вес, задержка) ждут в подсказке.
 */

import type { ReactElement, ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

import type { AuditSearchEvent } from "../api.ts";
import { sessionIdentity } from "../api.ts";
import { verdictColor } from "../audit.ts";
import {
  IpAddress,
  geoTagOf,
  useIpGeo,
  type GeoField,
} from "../components/ip-geo/index.ts";
import { formatMs } from "../fleet.ts";
import { useT } from "../i18n/index.ts";
import { inspectorName } from "../inspectors.ts";
import { InspectorRef, inspectorProfileOf } from "./incident-reason.tsx";

/** Поля, которые строка умеет положить в фильтр списка. */
export type SeekField =
  | "ray"
  | "ip"
  | "phase"
  | "method"
  | "host"
  | "server"
  | "uri"
  | "route"
  | "status"
  | "verdict"
  | "inspector"
  | "user"
  | "marker"
  | "country"
  | "asn";

/**
 * Клик по значению. Выставляет фильтр, а на уже выставленном -- снимает:
 * решает страница, здесь только повод.
 */
export type SeekValue = (field: SeekField, value: string) => void;

export interface SeekState {
  apply: SeekValue;
  /** Что сейчас в фильтрах: по полю на значение. Пусто -- фильтра нет. */
  active: Partial<Record<SeekField, string>>;
}

/** Больше в колонку не влезает: остальные уходят под `+N`. */
const CHIPS_SHOWN = 4;

/*
 * Размеры фишки берутся из темы -- здесь только `minWidth`, и он не про вид, а
 * про соседей: ширина колонки в таблице -- это ширина её содержимого, и без
 * права ужиматься фишки отобрали бы место у uri. С ним колонка сдаётся первой,
 * а подпись фишки доедается многоточием -- ровно как в колонке uri.
 */
const CHIP_SX = {
  minWidth: 0,
  "& .MuiChip-label": { minWidth: 0 },
} as const;

/**
 * Стоит ли это значение в фильтре. Маршрутов и серверов в фильтре несколько
 * -- список через запятую, и ячейка «включена», когда её ключ среди них.
 */
function isActive(seek: SeekState, field: SeekField, value: string): boolean {
  const current = seek.active[field] ?? "";
  return field === "route" || field === "server"
    ? current.split(",").includes(value)
    : current === value;
}

function hint(seek: SeekState, field: SeekField, value: string): string {
  return isActive(seek, field, value)
    ? "incidentsPage.seek.clear"
    : "incidentsPage.seek.apply";
}

/**
 * Значение строки, которое просится в фильтр. Пустое значение (или то, которое
 * фильтру нечем принять) остаётся просто текстом: подчёркнутый курсором «клик»,
 * ничего не меняющий, хуже отсутствия клика.
 *
 * Клик не даёт строке раскрыться: два действия на одном месте развести нечем,
 * а карточка открывается по всей остальной строке.
 */
export function Seekable({
  field,
  value,
  seek,
  children,
  sx,
}: {
  field: SeekField;
  value: string;
  seek: SeekState;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const t = useT();

  if (value === "") {
    return <>{children}</>;
  }

  const on = isActive(seek, field, value);

  return (
    <Box
      component="span"
      onClick={(e) => {
        e.stopPropagation();
        seek.apply(field, value);
      }}
      title={t(hint(seek, field, value))}
      sx={{
        display: "inline-block",
        /*
         * Коробка меряется по содержимому. При глобальном `border-box`
         * `maxWidth: 100%` ограничивает внешний край, и горизонтальный паддинг
         * вычитается изнутри: в ужатой колонке (её ширина -- ровно ширина
         * значения) тексту оставалось на 8px меньше, чем он занимает, и он
         * вылезал из подсветки вправо. Отрицательные поля ниже возвращают
         * левый край значения на место соседей.
         */
        boxSizing: "content-box",
        maxWidth: "100%",
        minWidth: 0,
        px: 0.5,
        mx: -0.5,
        borderRadius: "2px",
        cursor: "pointer",
        bgcolor: on ? "action.selected" : "transparent",
        "&:hover": { bgcolor: "action.hover" },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Адрес клиента. Кликается каждое значение по отдельности, а не вся ячейка:
 * адрес ставит `ip=`, страна и ASN -- свои фильтры (журнал отбирает по ним
 * словарём каталога, см. logger/schema/022).
 */
export function IpCell({
  value,
  seek,
  geoFields,
}: {
  value?: string;
  seek: SeekState;
  /** Чего нет своей колонкой: только это и стоит подписью у адреса. */
  geoFields?: readonly GeoField[];
}) {
  const t = useT();

  if (value === undefined || value === "") {
    return <>—</>;
  }

  return (
    <IpAddress
      value={value}
      onSeek={() => {
        seek.apply("ip", value);
      }}
      seekHint={t(hint(seek, "ip", value))}
      seekActive={seek.active.ip === value}
      geoFields={geoFields}
      geoSeek={{
        apply: (field, geo) => {
          seek.apply(field, geo);
        },
        active: { country: seek.active.country, asn: seek.active.asn },
        hint: (on) =>
          t(on ? "incidentsPage.seek.clear" : "incidentsPage.seek.apply"),
      }}
    />
  );
}

/*
 * Фаза записи. Фишкой, а не словом в строке: в таблице на 200 строк глаз
 * ищет её формой, и «запрос» рядом с «ответом» должны различаться до чтения.
 * Фильтр знает только две фазы -- `frame` кликабельной не делаем, иначе селектор
 * в шапке получил бы значение, которого у него нет в списке.
 */
/** Фазы, по которым список умеет отбирать. */
const PHASES = ["request", "response", "frame", "session"];

/**
 * Цвет фазы: запрос -- нейтральный, ответ -- info, кадр и сессия -- свой,
 * чтобы строки WebSocket отличались от HTTP с первого взгляда.
 */
export function phaseColor(phase: string): "default" | "info" | "secondary" {
  return phase === "response" ? "info" : phase === "frame" || phase === "session" ? "secondary" : "default";
}

export function PhaseChip({ phase, seek }: { phase: string; seek: SeekState }) {
  const t = useT();

  if (phase === "") {
    return <>—</>;
  }

  const known = PHASES.includes(phase);
  const chip = (
    <Chip
      size="small"
      variant="outlined"
      color={phaseColor(phase)}
      label={t(`incidentsPage.phaseValue.${phase}`)}
      clickable={known}
      onClick={
        known
          ? (e) => {
              e.stopPropagation();
              seek.apply("phase", phase);
            }
          : undefined
      }
    />
  );

  return known ? <SeekTip field="phase" value={phase} seek={seek}>{chip}</SeekTip> : chip;
}

/**
 * Подсказка «клик -- фильтр» на фишке. `describeChild` обязателен: без него
 * MUI кладёт подсказку в `aria-label`, и фишка перестаёт называться тем, что
 * на ней написано -- скринридер прочитает «отобрать по этому значению» вместо
 * «запрос».
 */
function SeekTip({
  field,
  value,
  seek,
  children,
}: {
  field: SeekField;
  value: string;
  seek: SeekState;
  children: ReactElement;
}) {
  const t = useT();

  return (
    <Tooltip describeChild arrow placement="top" title={t(hint(seek, field, value))}>
      {children}
    </Tooltip>
  );
}

/** Вердикт записи. Кликабелен ровно тем, что умеет селектор в шапке. */
export function VerdictChip({
  verdict,
  seek,
}: {
  verdict: string;
  seek: SeekState;
}) {
  const known =
    verdict === "allow" || verdict === "deny" || verdict === "redirect";
  const chip = (
    <Chip
      size="small"
      variant="outlined"
      color={verdictColor(verdict)}
      label={verdict}
      clickable={known}
      onClick={
        known
          ? (e) => {
              e.stopPropagation();
              seek.apply("verdict", verdict);
            }
          : undefined
      }
    />
  );

  return known ? (
    <SeekTip field="verdict" value={verdict} seek={seek}>
      {chip}
    </SeekTip>
  ) : (
    chip
  );
}

/*
 * Код ответа: наш и приложения. Разошлись -- показываем оба и подписываем чей,
 * иначе «мы закрыли успешный ответ» неотличимо от «приложение упало».
 *
 * В фильтр просится только наш: колонки `upstream_status` в поиске нет, и клик
 * по коду приложения обещал бы отбор, которого не будет.
 */
export function StatusCell({
  row,
  seek,
}: {
  row: AuditSearchEvent;
  seek: SeekState;
}) {
  const t = useT();
  const ours = row.status > 0 ? String(row.status) : "—";
  const app = row.upstream_status ?? 0;

  /*
   * Нашего кода нет (allow: модуль ничего не подменял), а код приложения
   * есть -- у записи запроса, дождавшейся фазы ответа. Клиент получил ровно
   * его, и «— ← 200» читалось бы как расхождение, которого не было.
   */
  if (app === 0 || app === row.status || row.status === 0) {
    const shown = app !== 0 ? String(app) : ours;
    return (
      <Seekable field="status" value={row.status > 0 ? ours : ""} seek={seek}>
        <Box component="span" sx={{ fontFamily: "monospace" }}>
          {shown}
        </Box>
      </Seekable>
    );
  }

  return (
    <Box component="span" sx={{ whiteSpace: "nowrap" }}>
      <Tooltip arrow title={t("incidentsPage.statusSplit")}>
        <Box component="span">
          <Seekable field="status" value={ours} seek={seek}>
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {ours}
            </Box>
          </Seekable>
        </Box>
      </Tooltip>
      <Box
        component="span"
        sx={{ color: "text.secondary", ml: 0.75, fontFamily: "monospace" }}
      >
        {`← ${String(app)}`}
      </Box>
    </Box>
  );
}

/** Что журнал знает об участии одного инспектора в этой записи. */
interface Part {
  /** Имя как в записи: им же отбирается список, алиасы только для показа. */
  raw: string;
  shown: string;
  state: string;
  verdict: string;
  /** Что легло в сумму фазы: заявка при score, сотня у совещательного deny. */
  score: number;
  latency?: number;
  role: string;
  profile: string;
  decisive: boolean;
}

function part(row: AuditSearchEvent, raw: string): Part {
  const score = row.inspectors_score[raw] ?? 0;

  return {
    raw,
    shown: inspectorName(raw),
    state: row.inspectors_state?.[raw] ?? "",
    verdict: row.inspectors_verdict[raw] ?? "",
    score,
    latency: row.inspectors_latency_ms?.[raw],
    role: row.inspectors_role?.[raw] ?? "",
    profile: inspectorProfileOf(row, raw),
    decisive: row.by === raw || row.by === inspectorName(raw),
  };
}

/*
 * Подпись фишки. Состояние важнее вердикта: «инспектор не ответил» -- это не
 * его мнение о запросе, и путать одно с другим нельзя. Дальше идёт счёт: он
 * отвечает «сколько принёс», а «чей вердикт» отвечает цвет.
 */
function chipLabel(item: Part): string {
  if (item.state !== "") {
    return `${item.shown}: ${item.state}`;
  }

  if (item.score > 0) {
    return `${item.shown}: ${String(item.score)}`;
  }

  if (item.verdict !== "" && item.verdict !== "allow") {
    return `${item.shown}: ${item.verdict}`;
  }

  return item.shown;
}

function chipTone(item: Part) {
  return item.state !== "" ? "warning" : verdictColor(item.verdict);
}

/** Строка подсказки: подпись слева, значение справа. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Box component="span" sx={{ color: "text.secondary" }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontFamily: "monospace" }}>
        {children}
      </Box>
    </>
  );
}

function ChipDetails({ item, seek }: { item: Part; seek: SeekState }) {
  const t = useT();

  return (
    <Box sx={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
      <Box sx={{ fontWeight: 600, mb: 0.5 }}>
        <InspectorRef name={item.raw} profile={item.profile} />
        {item.decisive && (
          <Box component="span" sx={{ ml: 0.75, color: "warning.main" }}>
            {t("incidentsPage.card.decisive")}
          </Box>
        )}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          columnGap: 1,
          rowGap: 0.25,
        }}
      >
        {item.state !== "" && (
          <Detail label={t("incidentsPage.chip.state")}>{item.state}</Detail>
        )}
        {item.verdict !== "" && (
          <Detail label={t("incidentsPage.chip.verdict")}>{item.verdict}</Detail>
        )}
        {item.score > 0 && (
          <Detail label={t("incidentsPage.chip.score")}>{String(item.score)}</Detail>
        )}
        {item.role !== "" && (
          <Detail label={t("incidentsPage.chip.role")}>{item.role}</Detail>
        )}
        {item.latency !== undefined && item.latency > 0 && (
          <Detail label={t("incidentsPage.chip.latency")}>
            {`${formatMs(item.latency)} ${t("incidentsPage.chip.ms")}`}
          </Detail>
        )}
      </Box>
      <Box sx={{ mt: 0.5, color: "text.secondary" }}>
        {t(hint(seek, "inspector", item.raw))}
      </Box>
    </Box>
  );
}

function InspectorChip({ item, seek }: { item: Part; seek: SeekState }) {
  return (
    <Tooltip arrow placement="top" title={<ChipDetails item={item} seek={seek} />}>
      <Chip
        size="small"
        /*
         * Решающий -- заливкой. В строке с тремя участниками первый вопрос
         * «кто закрыл», и отвечать на него цветом рамки, которую делят все
         * несогласные, нечем.
         */
        variant={item.decisive ? "filled" : "outlined"}
        color={chipTone(item)}
        label={chipLabel(item)}
        clickable
        onClick={(e) => {
          e.stopPropagation();
          seek.apply("inspector", item.raw);
        }}
        sx={CHIP_SX}
      />
    </Tooltip>
  );
}

/**
 * Участники записи фишками. Порядок -- как в записи: это порядок волны, и
 * пересортировать его значило бы соврать о том, кто за кем считал.
 */
/**
 * Кто это был: личности из секции sessions -- `источник:логин`, без повторов.
 * Источник в строке обязателен: голый логин не отвечает на вопрос «кто», пока
 * не сказано, чья это калитка, -- `alice` контура и `alice` из чужого JWT
 * совпадают именем и больше ничем.
 *
 * Сессий у запроса бывает несколько (калитка контура и подсмотренная кука
 * приложения) -- тогда строк тоже несколько, через запятую. Пусто -- «—»: на
 * маршруте нет калитки либо клиент пришёл без сессии. Непроверенная подпись
 * (JWT без ключа) отмечена звёздочкой -- claims там написал клиент.
 *
 * По клику -- фильтр `user=источник:логин`, тот же ключ, которым журнал
 * группирует: клик по строке и разворот группы приводят к одному списку.
 */
export function UserCell({ row, seek }: { row: AuditSearchEvent; seek: SeekState }) {
  const ids: string[] = [];
  const unverified = new Set<string>();

  for (const s of row.sessions ?? []) {
    const id = sessionIdentity(s);

    if (id === "") {
      continue;
    }

    if (!ids.includes(id)) {
      ids.push(id);
    }

    if (!s.verified) {
      unverified.add(id);
    }
  }

  if (ids.length === 0) {
    return <>—</>;
  }

  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 ? ", " : ""}
          <Seekable field="user" value={id} seek={seek}>
            {id}
            {unverified.has(id) ? "*" : ""}
          </Seekable>
        </span>
      ))}
    </>
  );
}

/**
 * Маркеры записи -- метки, которые попросили поставить инспекторы. Строками
 * через запятую, а не фишками: метку пишет оператор, и она бывает фразой --
 * фишка обрезала бы её на середине. По клику -- фильтр marker=.
 *
 * Пусто -- «—»: обычное состояние, никто ничего не пометил.
 */
export function MarkerCell({ row, seek }: { row: AuditSearchEvent; seek: SeekState }) {
  const markers = row.markers ?? [];

  if (markers.length === 0) {
    return <>—</>;
  }

  return (
    <>
      {markers.map((marker, i) => (
        <span key={marker}>
          {i > 0 ? ", " : ""}
          <Seekable field="marker" value={marker} seek={seek}>
            {marker}
          </Seekable>
        </span>
      ))}
    </>
  );
}

/**
 * Страна или ASN адреса отдельной колонкой. Значение то же, что в подписи у
 * самого адреса: геостор отвечает на адрес один раз на всю страницу, второго
 * похода колонка не стоит. Колонка нужна тем, кто по ним отбирает, -- и тем,
 * кому условие надо снять: снимается оно кликом по значению, как везде.
 */
export function GeoCell({
  row,
  field,
  seek,
}: {
  row: AuditSearchEvent;
  field: "country" | "asn";
  seek: SeekState;
}) {
  const geo = useIpGeo(row.client_ip ?? "");

  // Кодера ещё не спросили: пусто, а не прочерк -- прочерк тут значит «не знает».
  if (geo.status === "pending") {
    return null;
  }

  const tag = geoTagOf(geo, field);

  if (tag === undefined) {
    return <>—</>;
  }

  return (
    <Seekable field={field} value={tag.value} seek={seek}>
      {tag.label}
    </Seekable>
  );
}

export function InspectorChips({
  row,
  seek,
}: {
  row: AuditSearchEvent;
  seek: SeekState;
}) {
  const t = useT();
  const parts = row.inspectors.map((name) => part(row, name));

  if (parts.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  const shown = parts.slice(0, CHIPS_SHOWN);
  const rest = parts.slice(CHIPS_SHOWN);

  return (
    <Stack
      direction="row"
      spacing={0.5}
      /*
       * Потолок тот же, что был у строки свода: ширину колонки в таблице
       * задаёт содержимое, и без него пятеро участников растащили бы её за
       * счёт uri. Упёршись в потолок, фишки доедают подписи многоточием.
       */
      sx={{
        alignItems: "center",
        flexWrap: "nowrap",
        overflow: "hidden",
        minWidth: 0,
        maxWidth: 280,
      }}
    >
      {shown.map((item) => (
        <InspectorChip key={item.raw} item={item} seek={seek} />
      ))}
      {rest.length > 0 && (
        <Tooltip
          arrow
          placement="top"
          title={
            <Box sx={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
              {rest.map((item) => (
                <Box key={item.raw} sx={{ fontFamily: "monospace" }}>
                  {chipLabel(item)}
                </Box>
              ))}
            </Box>
          }
        >
          <Chip
            size="small"
            variant="outlined"
            label={t("incidentsPage.chip.more", { count: rest.length })}
            sx={CHIP_SX}
          />
        </Tooltip>
      )}
    </Stack>
  );
}
