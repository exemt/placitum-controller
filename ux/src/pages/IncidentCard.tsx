import { useEffect, useState, type ReactNode } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import {
  fetchActions,
  fetchAuditInspectors,
  frameAddr,
  sessionIdentity,
  type ActionRegistry,
  type ActionSpec,
  type AuditCard,
  type AuditAction,
  type AuditFrameInfo,
  type AuditParticipant,
  type AuditSearchEvent,
  type AuditSession,
  type AuditSessionInfo,
} from "../api.ts";
import { actionColor, verdictColor } from "../audit.ts";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import LinkIcon from "@mui/icons-material/Link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { formatBytes } from "../fleet.ts";
import { useT, type Translate } from "../i18n/index.ts";
import { phaseColor, type SeekState } from "./incident-cells.tsx";
import { InspectorFindings } from "./incident-findings.tsx";
import { InspectorRef, VerdictReason, participantProfileOf } from "./incident-reason.tsx";
import {
  PreviewPanel,
  type PreviewQuery,
  type SeekPreview,
} from "./incident-preview.tsx";
import { Failed, Note, Waiting, useRemote } from "./incident-shared.tsx";

export type { PreviewQuery, SeekPreview } from "./incident-preview.tsx";

const PANEL_MIN = 320;

/**
 * Карточка инцидента: развёрнутая строка журнала.
 *
 * Слева — итог модуля (не сворачивается) и участники фазы гармошкой: в шапке
 * вердикт со счётом, имя, время; внутри находки своего типа. Allow без находок и
 * skipped не раскрываются. Справа — срез запроса в такой же панели; список
 * его не отдаёт, карточка просит `one`. Справа в блоке — preview или archive
 * окнами по scroll; скачать и archive выключены, если локатора уже нет. Нода,
 * ray и сокет в карточке не повторяются: они уже в строке списка.
 */

/** Парная запись того же ray на другой фазе -- и как её открыть. */
export interface SiblingRecord {
  phase: string;
  open: () => void;
}

export function IncidentCard({
  row,
  onSeek,
  query,
  sibling,
  cell,
}: {
  row: AuditSearchEvent;
  onSeek?: SeekPreview;
  query?: PreviewQuery;
  sibling?: SiblingRecord;
  /** Фильтры списка: фишка соединения кладёт туда ray рукопожатия. */
  cell?: SeekState;
}) {
  return (
    <Box
      sx={(theme) => {
        const tone = theme.palette[actionColor(row.verdict)].main;
        return {
          py: 1.5,
          px: 1.5,
          backgroundImage: `linear-gradient(125deg, ${alpha(tone, 0.07)} 0%, ${alpha(tone, 0.02)} 32%, transparent 58%)`,
        };
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" },
          gap: 1,
          alignItems: "stretch",
          minHeight: PANEL_MIN,
        }}
      >
        <InspectorsPanel row={row} sibling={sibling} cell={cell} />
        <Box
          sx={{
            minWidth: 0,
            minHeight: PANEL_MIN,
            position: { md: "relative" },
          }}
        >
          <Box
            sx={{
              minWidth: 0,
              minHeight: PANEL_MIN,
              height: { md: "100%" },
              position: { md: "absolute" },
              inset: { md: 0 },
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <PreviewPanel row={row} onSeek={onSeek} query={query} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function InspectorsPanel({
  row,
  sibling,
  cell,
}: {
  row: AuditSearchEvent;
  sibling?: SiblingRecord;
  cell?: SeekState;
}) {
  const t = useT();
  /*
   * Разбор -- по фазе записи: у запроса и ответа общий ray, а участники и
   * находки у каждой фазы свои.
   */
  const frame = frameAddr(row);
  const card = useRemote<AuditCard>(
    `${row.node}\u0000${row.ray}\u0000${row.phase}\u0000${frame}`,
    () => fetchAuditInspectors(row.node, row.ray, row.phase, frame),
  );
  const [open, setOpen] = useState<string | null | undefined>(undefined);

  const items = (card.data?.items ?? []).filter((item) => !item.self);
  const fallback =
    items.find((item) => item.decisive && canExpand(item))?.name ??
    items.find(canExpand)?.name ??
    null;
  const expanded = open === undefined ? fallback : open;

  return (
    <Box sx={{ minWidth: 0, minHeight: PANEL_MIN, height: "100%" }}>
      <ResultRow row={row} sibling={sibling} cell={cell} />
      <FrameRow frame={row.frame} />
      <SessionRow session={row.session} />
      {card.loading ? (
        <Waiting />
      ) : card.error !== null ? (
        <Failed message={card.error} />
      ) : items.length === 0 ? (
        card.data === null || (card.data.items ?? []).length === 0 ? (
          <Note text={t("incidentsPage.card.noInspectors")} />
        ) : null
      ) : (
        items.map((item) => (
          <ParticipantRow
            key={item.name}
            item={item}
            expanded={expanded === item.name}
            onToggle={() =>
              setOpen((cur) => {
                const was = cur === undefined ? fallback : cur;
                return was === item.name ? null : item.name;
              })
            }
          />
        ))
      )}
      {/*
        Секции -- под участниками, и всегда в этом порядке: сессии, автодействия,
        маркеры в самом низу. Все три отвечают на вопрос «что было вокруг
        вердикта», и читать их идут после того, как разобрали сам вердикт;
        просьбы соседей -- после сессий, потому что их исход часто объясняется
        тем, что стоит выше, а маркеры -- итог просьб mark: кто и по какому
        поводу пометил, видно в автодействиях над ними.
      */}
      <SessionsPanel items={row.sessions ?? []} />
      <ActionsPanel items={card.data?.actions ?? []} heard={card.data?.items ?? []} />
      <MarkersPanel markers={row.markers ?? []} seek={cell} />
    </Box>
  );
}

/*
 * Маркеры записи: метки, которые попросили поставить инспекторы глаголом mark.
 * Фишками и кликом в фильтр -- метку ставят затем, чтобы по ней собрать
 * остальные такие же события, и первый жест на ней именно этот.
 *
 * Рамка та же, что у сессий и автодействий, только внутри не таблица, а
 * фишки: полей у метки нет, делить её на столбцы нечем. Кто и по какому поводу
 * пометил, здесь не печатается: это видно выше, в автодействиях, где просьба
 * стоит рядом с именем отправителя.
 *
 * Секция появляется, только когда метки есть.
 */
function MarkersPanel({ markers, seek }: { markers: string[]; seek?: SeekState }) {
  const t = useT();

  if (markers.length === 0) {
    return null;
  }

  return (
    <CardSection title={t("incidentsPage.card.markers")}>
      {/* Зазор флексом, а не отступом: перенесённая фишка встаёт к левому краю. */}
      <Stack
        direction="row"
        spacing={0.75}
        useFlexGap
        sx={{ px: 1.25, py: 0.75, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}
      >
        {markers.map((marker) => (
          <Chip
            key={marker}
            size="small"
            variant={seek?.active.marker === marker ? "filled" : "outlined"}
            label={marker}
            clickable={seek !== undefined}
            onClick={(e) => {
              e.stopPropagation();
              seek?.apply("marker", marker);
            }}
          />
        ))}
      </Stack>
    </CardSection>
  );
}

/*
 * Чьи сессии назвали инспекторы: «кто это был». Строка на запись: логин,
 * вид и источник, идентификатор -- и две пометки, без которых запись читалась
 * бы как доказательство: подпись не проверена (claims написал клиент) и
 * отправитель пассивен (заголовки личности приложению не легли).
 *
 * Секция появляется, только когда сессии есть: на маршруте без калитки или у
 * клиента без входа рамка была бы шумом на каждом запросе.
 */
function SessionsPanel({ items }: { items: AuditSession[] }) {
  const t = useT();

  if (items.length === 0) {
    return null;
  }

  /* Незнакомый вид -- как прислали: словарь видов открыт со стороны инспектора. */
  const kinds: Record<string, string> = {
    own: t("incidentsPage.card.sessionKind.own"),
    jwt: t("incidentsPage.card.sessionKind.jwt"),
    app: t("incidentsPage.card.sessionKind.app"),
  };

  return (
    <CardTable
      title={t("incidentsPage.card.sessions")}
      cols={SESSION_COLS.map((key) => ({
        key,
        label: t(`incidentsPage.card.sessionCol.${key}`),
        right: key === "notes",
      }))}
      rows={items.map((item, i) => ({
        key: `${item.source}:${item.id}:${i}`,
        cells: [
          /*
            Личность целиком -- `источник:логин`: та же строка, что в колонке
            списка и в ключе группировки, чтобы её можно было прочитать здесь
            и узнать там. Источник отдельной колонкой не повторяется.
          */
          <CardValue
            key="identity"
            text={
              sessionIdentity(item) !== ""
                ? sessionIdentity(item)
                : t("incidentsPage.card.sessionAnonymous")
            }
            dim={sessionIdentity(item) === ""}
          />,
          <CardValue key="kind" text={kinds[item.kind] ?? item.kind} mono={false} />,
          <CardValue key="by" text={item.by ?? ""} />,
          <CardValue
            key="id"
            text={item.id.length > 24 ? `${item.id.slice(0, 24)}…` : item.id}
            title={item.id}
          />,
          <CardValue key="groups" text={item.groups ?? ""} />,
          <SessionNotes key="notes" item={item} />,
        ],
      }))}
    />
  );
}

const SESSION_COLS = ["identity", "kind", "by", "id", "groups", "notes"] as const;

/**
 * Две пометки, без которых запись читалась бы как доказательство: подпись не
 * проверена (claims написал клиент) и отправитель пассивен (заголовки личности
 * приложению не легли). Ни одной -- прочерк, как у любого пустого поля.
 */
function SessionNotes({ item }: { item: AuditSession }) {
  const t = useT();
  const notes: { text: string; tone: string }[] = [];

  if (!item.verified) {
    notes.push({ text: t("incidentsPage.card.sessionUnverified"), tone: "warning.main" });
  }
  if (item.passive === true) {
    notes.push({ text: t("incidentsPage.card.sessionPassive"), tone: "text.secondary" });
  }

  if (notes.length === 0) {
    return <CardValue text="" />;
  }

  return (
    <>
      {notes.map((note) => (
        <Typography
          key={note.text}
          variant="caption"
          sx={{ display: "block", color: note.tone }}
        >
          {note.text}
        </Typography>
      ))}
    </>
  );
}

/*
 * Общий вид секций карточки: сессии, автодействия и маркеры -- один и тот же
 * разбор записи, и рамка у них одна на всех. Рамка как у участника, только
 * серая: это не чей-то вердикт, цветной полосы блоку брать неоткуда.
 *
 * Секции нет, пока ей нечего показать: решает панель, а рамка только рисует.
 */
function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        mt: 1,
        mb: 0.75,
        minWidth: 0,
        border: 1,
        borderColor: "divider",
        borderLeft: "3px solid",
        borderLeftColor: "text.secondary",
        borderRadius: "0 4px 4px 0",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          height: 36,
          minHeight: 36,
          boxSizing: "border-box",
          px: 1.25,
          display: "flex",
          alignItems: "center",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {/* Фишка как у участника, только серая: блок разбора, а не вердикт. */}
        <Chip size="small" variant="outlined" color="default" label={title} />
      </Box>
      {children}
    </Box>
  );
}

/*
 * Секция-таблица: сессии и автодействия. Столбцы делят ширину поровну и не
 * жмутся ниже своего содержимого, отступы живут в ячейках, а не зазором грида:
 * иначе разделитель строк рвался бы на каждом промежутке между столбцами.
 */
interface CardColumn {
  key: string;
  label: string;
  /** Столбец у правого края -- значение прижимается к рамке. */
  right?: boolean;
}

interface CardRow {
  key: string;
  /** Ячейки в порядке колонок. */
  cells: ReactNode[];
}

/** Рамка ячейки: разделитель строки идёт от края до края блока. */
function cardCellSx(col: number, cols: number, last: boolean) {
  return {
    py: 0.5,
    pl: col === 0 ? 1.25 : 0.75,
    pr: col === cols - 1 ? 1.25 : 0.75,
    borderBottom: last ? 0 : 1,
    borderColor: "divider",
  } as const;
}

function CardTable({
  title,
  cols,
  rows,
}: {
  title: string;
  cols: CardColumn[];
  rows: CardRow[];
}) {
  return (
    <CardSection title={title}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols.length}, minmax(max-content, 1fr))`,
          minWidth: 0,
          /* Длинное значение не ломает столбцы: таблица едет полосой внутри блока. */
          overflowX: "auto",
        }}
      >
        {/* Цвет -- только через sx: prop `color` у Typography в этой сборке молчит. */}
        {cols.map((col, i) => (
          <Typography
            key={col.key}
            variant="caption"
            sx={{
              ...cardCellSx(i, cols.length, false),
              color: "text.secondary",
              whiteSpace: "nowrap",
              textAlign: col.right === true ? "right" : "left",
            }}
          >
            {col.label}
          </Typography>
        ))}
        {rows.map((row, r) =>
          cols.map((col, i) => (
            <Box
              key={`${row.key}\u0000${col.key}`}
              sx={{
                ...cardCellSx(i, cols.length, r === rows.length - 1),
                minWidth: 0,
                textAlign: col.right === true ? "right" : "left",
              }}
            >
              {row.cells[i]}
            </Box>
          )),
        )}
      </Box>
    </CardSection>
  );
}

/** Значение в ячейке: пустое поле -- прочерк, иначе столбец читается как сдвинутый. */
function CardValue({
  text,
  mono = true,
  dim = false,
  title,
}: {
  text: string;
  mono?: boolean;
  dim?: boolean;
  title?: string;
}) {
  const empty = text === "";

  return (
    <Typography
      variant="caption"
      title={title}
      sx={{
        display: "block",
        fontFamily: mono ? "monospace" : undefined,
        color: empty || dim ? "text.disabled" : "text.primary",
      }}
    >
      {empty ? "—" : text}
    </Typography>
  );
}

/*
 * Просьбы соседей. Главный вопрос к этому каналу -- "ip просил капчу, капчи не
 * было", и ответ на него читается только колонкой исхода: без неё видно, что
 * просьба была, и не видно, почему ничего не случилось.
 *
 * Секция появляется, только когда просьбы были: пустая рамка на каждом запросе
 * -- шум, канал по большинству маршрутов молчит.
 *
 * Таблицей, а не фишками: просьб на записи бывает с десяток, и читают их
 * сверху вниз одной колонкой -- «кто просил», «о ком», «сколько». Фишка на
 * каждое поле сбивала строки в разную ширину, и глазу приходилось разбирать
 * каждую заново. Блок -- общий с сессиями `CardTable`.
 */
const ACTION_COLS = ["from", "to", "do", "apply", "code", "amount", "outcome"] as const;

/*
 * Словарь глаголов контура: кто исполняет глагол -- сосед по маршруту или сам
 * модуль. Своей копии списка у панели нет (`GET /api/actions`), а на странице
 * событий он один на все карточки, поэтому запрос уходит однажды.
 */
let registryOnce: Promise<ActionRegistry> | null = null;

function useActionRegistry(): ActionRegistry | null {
  const [registry, setRegistry] = useState<ActionRegistry | null>(null);

  useEffect(() => {
    let alive = true;

    if (registryOnce === null) {
      registryOnce = fetchActions();
    }

    registryOnce.then(
      (reg) => {
        if (alive) {
          setRegistry(reg);
        }
      },
      () => {
        /* Не достался -- следующая карточка спросит заново. */
        registryOnce = null;
      },
    );

    return () => {
      alive = false;
    };
  }, []);

  return registry;
}

function ActionsPanel({ items, heard }: { items: AuditAction[]; heard: AuditParticipant[] }) {
  const t = useT();
  const registry = useActionRegistry();

  if (items.length === 0) {
    return null;
  }

  /*
   * Кто на этой записи вообще отвечал. Нужен, чтобы отличить «получатель
   * промолчал» от «получателя не звали»: у второго вопрос не к правилам
   * приёма, а к маршруту -- фаза кончилась раньше его волны, он выключен либо
   * просьба адресована поздней фазе.
   */
  const answered = new Set(
    heard.filter((row) => row.verdict !== undefined).map((row) => row.name),
  );
  /*
   * Кто исполняет глагол, знает словарь, а не карточка: у просьбы соседу исход
   * называет получатель, у глагола модуля получателя нет вовсе.
   */
  const specOf = (verb: string): ActionSpec | undefined =>
    registry?.verbs.find((spec) => spec.do === verb);

  return (
    <CardTable
      title={t("incidentsPage.card.actions")}
      cols={ACTION_COLS.map((key) => ({
        key,
        label: t(`incidentsPage.card.actionCol.${key}`),
        /* Число и исход прижаты к правому краю блока. */
        right: key === "amount" || key === "outcome",
      }))}
      rows={items.map((item, i) => {
        const amount = item.delta ?? item.value;
        const spec = specOf(item.do);

        return {
          key: `${item.from ?? ""}:${item.do}:${item.code ?? ""}:${i}`,
          cells: [
            <CardValue key="from" text={item.from ?? "?"} />,
            /*
             * Широковещательная просьба адресата не называет: «всем» -- не имя.
             * У очков, журнала, архива и маркера адресат -- сам маршрут: поля
             * `to` у них нет по построению, и «всем» было бы неправдой.
             */
            <CardValue
              key="to"
              text={
                item.to !== undefined && item.to !== ""
                  ? item.to
                  : t(
                      spec?.route === true
                        ? "incidentsPage.card.actionRoute"
                        : "incidentsPage.card.actionAll",
                    )
              }
              dim={item.to === undefined || item.to === ""}
            />,
            <CardValue key="do" text={item.do} />,
            <CardValue key="apply" text={item.apply ?? ""} />,
            <CardValue key="code" text={item.code ?? ""} />,
            <CardValue key="amount" text={amount === undefined ? "" : String(amount)} />,
            <ActionOutcome
              key="outcome"
              item={item}
              answered={answered}
              spec={spec}
              known={registry !== null}
            />,
          ],
        };
      })}
    />
  );
}

/**
 * Судьба просьбы: кто её принял и что сделал. Пустой список бывает по четырём
 * разным причинам, и называть их одинаково нельзя -- разбирают их в разных
 * местах:
 *
 *   - глагол исполняет сам модуль (очки, журнал, архив, маркер, режим вызова):
 *     получателя с правилами приёма у него нет, и отчитываться о просьбе
 *     некому. «Нет правила» здесь было бы неправдой -- просьба исполнена. От
 *     пассивного отправителя модуль берёт запись и метку, а очки и режимы
 *     отвергает: на трафик пассивный не влияет;
 *   - отправитель пассивен: просьбы не было на проводе вовсе;
 *   - получателя на этой записи не спрашивали -- фаза кончилась раньше его
 *     волны (например, сам отправитель отказал), он выключен на маршруте либо
 *     просьба живёт до поздней фазы и исход будет в её записи. Вопрос к
 *     маршруту, а не к правилам приёма, поэтому это не предупреждение;
 *   - получателя спрашивали, он ответил и об исходе не сказал: правила приёма
 *     этого отправителя не слушают. Вот это и есть предупреждение.
 */
function ActionOutcome({
  item,
  answered,
  spec,
  known,
}: {
  item: AuditAction;
  answered: Set<string>;
  spec: ActionSpec | undefined;
  /** Словарь приехал: до этого об исполнителе глагола судить не по чему. */
  known: boolean;
}) {
  const t = useT();
  const outcomes = item.outcomes ?? [];

  if (spec?.module === true) {
    /* Пассивному отказано только в том, что двигает трафик: очки и режимы. */
    const rejected = item.passive === true && spec.fromPassive !== true;

    return (
      <Typography
        variant="caption"
        sx={{ display: "block", color: rejected ? "text.secondary" : "success.main" }}
      >
        {rejected
          ? t("incidentsPage.card.actionModuleRejected")
          : t("incidentsPage.card.actionModule")}
      </Typography>
    );
  }

  if (item.passive === true) {
    return (
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
        {t("incidentsPage.card.actionPassive")}
      </Typography>
    );
  }

  if (outcomes.length === 0) {
    /*
     * Пока словарь не приехал, молчим: глагол модуля без исхода выглядел бы
     * предупреждением «нет правила», а правило ему и не нужно.
     */
    if (!known) {
      return null;
    }

    /* Широковещательная просьба адресата не называет: спросить некого поимённо. */
    const notAsked = item.to !== undefined && item.to !== "" && !answered.has(item.to);

    return (
      <Typography
        variant="caption"
        sx={{ display: "block", color: notAsked ? "text.secondary" : "warning.main" }}
      >
        {notAsked
          ? t("incidentsPage.card.actionNotAsked")
          : t("incidentsPage.card.actionUnheard")}
      </Typography>
    );
  }

  return (
    <>
      {outcomes.map((o) => (
        <Typography
          key={o.inspector}
          variant="caption"
          sx={{
            display: "block",
            color: o.outcome === "applied" ? "success.main" : "text.secondary",
          }}
        >
          <Box component="span" sx={{ fontFamily: "monospace" }}>
            {o.inspector}
          </Box>
          {": "}
          {t(`incidentsPage.card.outcome.${o.outcome}`)}
          {o.took !== undefined && o.took !== 0 ? ` ${o.took}` : ""}
        </Typography>
      ))}
    </>
  );
}

/**
 * Итог модуля — не ещё один инспектор. Сворачивать нечего: причина уже в
 * `code`, а подробности живут у того, кого модуль назвал в `by`.
 */
function ResultRow({
  row,
  sibling,
  cell,
}: {
  row: AuditSearchEvent;
  sibling?: SiblingRecord;
  cell?: SeekState;
}) {
  const t = useT();
  const tone = verdictColor(row.verdict);
  /*
   * Соединение WebSocket лежит под одним ray: рукопожатие, кадры, сессия.
   * Фишка кладёт ray в фильтр списка -- и видно всё соединение целиком. У
   * рукопожатия соединение узнаётся по 101.
   */
  const conn =
    row.phase === "frame" || row.phase === "session" || row.status === 101 ? row.ray : "";

  return (
    <Box
      sx={{
        mb: 0.75,
        height: 36,
        minHeight: 36,
        boxSizing: "border-box",
        px: 1.25,
        py: 0,
        display: "flex",
        alignItems: "center",
        border: 1,
        borderColor: "divider",
        borderLeft: "3px solid",
        borderLeftColor: tone === "default" ? "text.secondary" : `${tone}.main`,
        borderRadius: "0 4px 4px 0",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, minWidth: 0 }}
      >
        <Chip
          size="small"
          variant="outlined"
          color={tone}
          label={row.verdict || "—"}
        />
        {/*
          Фаза рядом с вердиктом: одна и та же атака выглядит по-разному в
          зависимости от того, на чём её поймали -- на запросе или уже на
          ответе приложения, -- и без этой подписи карточка на вопрос «где это
          случилось» не отвечает.
        */}
        {row.phase !== "" && (
          <Chip
            size="small"
            variant="outlined"
            color={phaseColor(row.phase)}
            label={t(`incidentsPage.phaseValue.${row.phase}`)}
          />
        )}
        {conn !== "" && (
          <Chip
            size="small"
            variant="outlined"
            clickable={cell !== undefined}
            icon={<LinkIcon sx={{ fontSize: 14 }} />}
            onClick={
              cell === undefined
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    cell.apply("ray", conn);
                  }
            }
            label={
              cell?.active.ray === conn
                ? t("incidentsPage.card.connectionActive")
                : t("incidentsPage.card.connection")
            }
          />
        )}
        {/*
          Парная запись -- переходом, а не слиянием карточек: у каждой фазы
          свои участники и свой обменник, и одна карточка на обе читалась бы как
          один вердикт. Фишка стоит только когда пара есть в списке.
        */}
        {sibling !== undefined && (
          <Chip
            size="small"
            variant="outlined"
            clickable
            icon={<SwapHorizIcon sx={{ fontSize: 14 }} />}
            onClick={(e) => {
              e.stopPropagation();
              sibling.open();
            }}
            label={t("incidentsPage.card.siblingPhase", {
              phase: t(`incidentsPage.phaseValue.${sibling.phase}`),
            })}
          />
        )}
        <Typography
          variant="subtitle2"
          sx={{ fontSize: "0.8rem", fontWeight: 600, minWidth: 0 }}
        >
          <VerdictReason row={row} />
        </Typography>
      </Stack>
    </Box>
  );
}

/*
 * Кадр: сторона, опкод, номер, размер, целостность и подмена -- строкой фишек
 * под итогом. Это то, чего у записи запроса нет, и без этого строка кадра
 * читается как ещё один запрос без метода.
 */
function FrameRow({ frame }: { frame?: AuditFrameInfo }) {
  const t = useT();

  if (frame === undefined) {
    return null;
  }

  const dir = frame.direction === "s2c" ? "s2c" : "c2s";

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, minWidth: 0, mb: 0.75, px: 1.25 }}
    >
      <Chip
        size="small"
        variant="outlined"
        color="secondary"
        icon={dir === "s2c" ? <ArrowBackIcon sx={{ fontSize: 14 }} /> : <ArrowForwardIcon sx={{ fontSize: 14 }} />}
        label={t(`incidentsPage.card.frameDir.${dir}`)}
      />
      <Chip size="small" variant="outlined" label={frame.opcode || "—"} />
      <Typography variant="caption" color="text.secondary">
        {t("incidentsPage.card.frameSeq", { seq: String(frame.seq) })}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {formatBytes(frame.size)}
      </Typography>
      {!frame.fin && (
        <Chip size="small" variant="outlined" label={t("incidentsPage.card.frameFragment")} />
      )}
      {frame.rewritten && (
        <Chip size="small" variant="outlined" color="warning" label={t("incidentsPage.card.frameRewritten")} />
      )}
    </Stack>
  );
}

/*
 * Итог соединения: сколько кадров и байт в каждую сторону, сколько отказано
 * и подменено, как закрылось. У записи сессии участников нет -- она про
 * соединение целиком, и эта строка в карточке главная.
 */
function SessionRow({ session }: { session?: AuditSessionInfo }) {
  const t = useT();

  if (session === undefined) {
    return null;
  }

  const cells: Array<[string, string]> = [
    [t("incidentsPage.card.session.c2s"), `${session.frames_c2s} · ${formatBytes(session.bytes_c2s)}`],
    [t("incidentsPage.card.session.s2c"), `${session.frames_s2c} · ${formatBytes(session.bytes_s2c)}`],
    [t("incidentsPage.card.session.denied"), String(session.frames_denied)],
    [t("incidentsPage.card.session.rewritten"), String(session.frames_rewritten)],
    [
      t("incidentsPage.card.session.close"),
      `${session.close_code || "—"}${session.close_reason ? ` · ${session.close_reason}` : ""}`,
    ],
    [t("incidentsPage.card.session.duration"), formatDuration(session.duration_ms)],
  ];

  return (
    <Box
      sx={{
        mb: 0.75,
        px: 1.25,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 0.5,
      }}
    >
      {cells.map(([label, value]) => (
        <Box key={label} sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {label}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }

  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }

  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min} min ${sec} s`;
}

function canExpand(item: AuditParticipant): boolean {
  if (item.state === "skipped") {
    return false;
  }

  /*
   * Правка ответа раскрывается и без находок: у неё allow и пустой список
   * срабатываний, а сказать она хочет ровно то, чего в строке не видно, --
   * подняли ли её объект, какие группы сработали и на сколько байт разошлись
   * архив и то, что получил клиент.
   */
  if (item.rewrite !== undefined) {
    return true;
  }

  if (item.verdict === "allow" && (item.clean || (item.findings ?? []).length === 0)) {
    return false;
  }

  return (item.findings ?? []).length > 0;
}

function participantTone(item: AuditParticipant) {
  return item.state !== undefined && item.state !== ""
    ? "warning"
    : verdictColor(item.verdict ?? "");
}

function ParticipantRow({
  item,
  expanded,
  onToggle,
}: {
  item: AuditParticipant;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone = participantTone(item);
  const accent = {
    borderLeft: "3px solid",
    borderLeftColor: tone === "default" ? "text.secondary" : `${tone}.main`,
  } as const;

  if (!canExpand(item)) {
    return (
      <Box
        sx={{
          mb: 0.75,
          height: 36,
          minHeight: 36,
          boxSizing: "border-box",
          px: 1.25,
          py: 0,
          display: "flex",
          alignItems: "center",
          border: 1,
          borderColor: "divider",
          borderRadius: "0 4px 4px 0",
          ...accent,
        }}
      >
        <ParticipantHead item={item} tone={tone} />
      </Box>
    );
  }

  return (
    <Accordion
      expanded={expanded}
      onChange={onToggle}
      variant="outlined"
      disableGutters
      sx={{
        mb: 0.75,
        borderRadius: "0 4px 4px 0",
        ...accent,
        "&:before": { display: "none" },
        "&:first-of-type, &:last-of-type": { borderRadius: "0 4px 4px 0" },
        "& .MuiAccordionSummary-root": {
          height: 36,
          minHeight: 36,
          boxSizing: "border-box",
          px: 1.25,
          borderBottom: "1px solid",
          borderBottomColor: expanded ? "divider" : "transparent",
        },
        "& .MuiAccordionSummary-root.Mui-expanded": {
          height: 36,
          minHeight: 36,
        },
        "& .MuiAccordionSummary-content, & .MuiAccordionSummary-content.Mui-expanded": {
          my: 0,
          alignItems: "center",
        },
        "& .MuiAccordionDetails-root": { px: 1.25, pt: 1, pb: 1.25 },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}>
        <ParticipantHead item={item} tone={tone} />
      </AccordionSummary>
      <AccordionDetails>
        <ParticipantNotes item={item} />
        <InspectorFindings item={item} />
      </AccordionDetails>
    </Accordion>
  );
}

function ParticipantHead({
  item,
  tone,
}: {
  item: AuditParticipant;
  tone: ReturnType<typeof verdictColor>;
}) {
  const mark =
    item.state !== undefined && item.state !== "" ? item.state : (item.verdict ?? "—");
  const score = item.score ?? 0;
  const chip = score > 0 ? `${mark} = ${score}` : mark;
  const ms =
    (item.latency_ms ?? 0) > 0 ? (item.latency_ms ?? 0) : (item.engine_ms ?? 0);

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, pr: 1, minWidth: 0 }}
    >
      <Chip
        size="small"
        variant="outlined"
        color={tone}
        label={chip}
      />
      <Typography
        variant="subtitle2"
        sx={{ color: "text.primary", fontSize: "0.8rem", fontWeight: 600 }}
      >
        <InspectorRef name={item.name} profile={participantProfileOf(item)} />
      </Typography>
      {ms > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "monospace" }}
        >
          {millis(ms)}
        </Typography>
      )}
    </Stack>
  );
}

function ParticipantNotes({ item }: { item: AuditParticipant }) {
  const t = useT();
  const findings = item.findings ?? [];
  const notes = [
    item.role,
    item.clean ? t("incidentsPage.card.clean") : undefined,
    item.orphan ? t("incidentsPage.card.orphan") : undefined,
    rewriteNote(t, item.rewrite),
  ].filter((note): note is string => note !== undefined && note !== "");

  if (notes.length === 0) {
    return null;
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, mb: findings.length > 0 ? 0.75 : 0 }}
    >
      {notes.map((note) => (
        <Typography
          key={note}
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "monospace" }}
        >
          {note}
        </Typography>
      ))}
    </Stack>
  );
}

function millis(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`;
}

/**
 * Правка ответа строкой заметки участника.
 *
 * Смысл пометки тот же, ради которого её пишет модуль: архив и срез запроса
 * хранят ОРИГИНАЛ, а клиент получил объект инспектора, и без этой строки
 * расхождение читалось бы порчей данных. Поэтому применённую правку видно
 * всегда, даже когда сказать про неё больше нечего.
 *
 * `applied: false` -- не пропуск: так выглядит наблюдающий профиль и
 * проигравший заказ (объект поднимают ровно один), и группы рядом отвечают на
 * вопрос «что было бы применено».
 */
function rewriteNote(
  t: Translate,
  rewrite: AuditParticipant["rewrite"],
): string | undefined {
  if (rewrite === undefined) {
    return undefined;
  }

  const parts = [
    rewrite.applied
      ? t("incidentsPage.card.rewriteApplied")
      : t("incidentsPage.card.rewriteWouldApply"),
  ];

  if ((rewrite.groups ?? []).length > 0) {
    parts.push((rewrite.groups ?? []).join(", "));
  }

  /* Размер есть только у правки тела: у заголовочной его не бывает вовсе. */
  if (rewrite.size !== undefined && rewrite.size > 0) {
    parts.push(formatBytes(rewrite.size));
  }

  return parts.join(" · ");
}
