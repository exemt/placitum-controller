/*
 * Верх страницы состояния: суммарный темп флота одной лентой.
 *
 * Лента, а не сетка плиток, и по той же причине, по какой лента стоит в
 * карточках: состав показателей не должен диктовать вёрстку. Плитки жили в
 * сетке по шесть колонок, и девятая плитка сама собой заводила второй ряд из
 * трёх штук и пустоты — при том, что шесть значений из девяти были нули.
 *
 * Что здесь не показывают:
 *   - живость флота и сходимость конфига — они в шапке, где лампа и чип
 *     сходимости, и там у них есть цвет и меню, а не только число;
 *   - сертификаты — метрика суточная, её место на своей странице, а не в
 *     живом снимке, ради которого страница держит сокет.
 *
 * Остаётся то, что меняется каждую секунду и ради чего на страницу смотрят:
 * темп с разбором по классам ответа и два вердикта WAF. Fail-open главный —
 * его ноль и есть здоровье. Считается из того же снимка, что и карточки,
 * своих запросов у обзора нет.
 */

import { useTheme } from "@mui/material/styles";

import {
  ERR_COLOR,
  OK_COLOR,
  StatStrip,
  WAF_PARTS,
  trafficStats,
  type StatProps,
} from "../components/card/index.ts";
import { formatRps, type FleetSnapshot, type StatusRates } from "../fleet.ts";
import { useT, type Translate } from "../i18n/index.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { RpsSample } from "../store/slices/fleet.ts";

export function FleetOverview() {
  const t = useT();
  const theme = useTheme();
  const snapshot = useAppSelector((s) => s.fleet.snapshot);
  const rpsHistory = useAppSelector((s) => s.fleet.rpsHistory);

  if (snapshot === null) {
    return null;
  }

  const items = buildStrip(
    snapshot,
    rpsHistory,
    theme.palette.primary.main,
    t,
  );
  if (items.length === 0) {
    return null;
  }

  return <StatStrip items={items} stretch />;
}

function buildStrip(
  snap: FleetSnapshot,
  rpsHistory: Record<string, RpsSample[]>,
  accent: string,
  t: Translate,
): (StatProps | null)[] {
  const verdicts = verdictItems(snap, t);
  const rated = snap.agents.filter((row) => row.rps !== undefined);
  if (rated.length === 0) {
    return verdicts;
  }

  const total = rated.reduce((sum, row) => sum + (row.rps ?? 0), 0);
  const codes = sumCodes(snap);

  return [
    ...trafficStats(
      total,
      codes,
      sumSeries(rpsHistory),
      accent,
      t,
      t("fleetPage.rpsFleet"),
    ),
    ...(verdicts.length === 0 ? [] : [null, ...verdicts]),
  ];
}

/**
 * Вердикты по всем агентам — только Deny и Fail-open.
 *
 * Allow в ленте нет намеренно: итог уже стоит слева, и allow — это он минус
 * два соседа. Deny отвечает «WAF работает», fail-open — «работает ли он
 * вообще»; остальной разбор (challenge, дедлайны, fail-closed) живёт в
 * карточке ноды, где видно, у какой именно.
 */
function verdictItems(snap: FleetSnapshot, t: Translate): StatProps[] {
  const rated = snap.agents.filter((row) => row.waf !== undefined);
  if (rated.length === 0) {
    return [];
  }

  let allow = 0;
  let deny = 0;
  let challenge = 0;
  let failOpen = 0;
  for (const row of rated) {
    const waf = row.waf;
    if (waf === undefined) {
      continue;
    }
    allow += waf.allow;
    deny += waf.deny;
    challenge += waf.challenge ?? 0;
    failOpen += waf.fail_open ?? 0;
  }
  const mix = allow + deny + challenge;

  return [
    {
      label: t("fleetPage.wafDeny"),
      value: formatRps(deny),
      sub: `${mix > 0 ? Math.round((deny / mix) * 100) : 0}%`,
      accent: WAF_PARTS.deny,
    },
    {
      label: t("fleetPage.wafFailOpen"),
      value: formatRps(failOpen),
      sub: t("fleetPage.wafFailOpenHint"),
      accent: failOpen > 0 ? ERR_COLOR : OK_COLOR,
      tone: failOpen > 0 ? "error" : "success",
      fill: failOpen > 0 ? 1 : undefined,
    },
  ];
}

/** Классы ответа, сложенные по всем агентам, которые их пишут. */
function sumCodes(snap: FleetSnapshot): StatusRates {
  const sums: StatusRates = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  for (const row of snap.agents) {
    const codes = row.codes;
    if (codes === undefined) {
      continue;
    }
    sums["2xx"] += codes["2xx"];
    sums["3xx"] += codes["3xx"];
    sums["4xx"] += codes["4xx"];
    sums["5xx"] += codes["5xx"];
  }
  return sums;
}

/** Ряды нод, сложенные по seq: одна кривая на весь флот, класс за классом. */
function sumSeries(rpsHistory: Record<string, RpsSample[]>): RpsSample[] {
  const bySeq = new Map<number, RpsSample>();
  for (const series of Object.values(rpsHistory)) {
    for (const sample of series) {
      const acc = bySeq.get(sample.seq);
      if (acc === undefined) {
        bySeq.set(sample.seq, { ...sample });
        continue;
      }
      acc.total += sample.total;
      acc["2xx"] += sample["2xx"];
      acc["3xx"] += sample["3xx"];
      acc["4xx"] += sample["4xx"];
      acc["5xx"] += sample["5xx"];
    }
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}
