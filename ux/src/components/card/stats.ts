import {
  formatBytes,
  formatBytesRate,
  formatCount,
  formatCpu,
  formatMs,
  formatRps,
  type BusStats,
  type Flow,
  type FleetMemberView,
  type FlowMap,
  type StatusRates,
  type WafRates,
} from "../../fleet.ts";
import type { Translate } from "../../i18n/index.ts";
import { useAppSelector } from "../../store/hooks.ts";
import type { RpsSample } from "../../store/slices/fleet.ts";
import type { StatProps } from "./Stat.tsx";

export const OK_COLOR = "#3dd68c";
export const ERR_COLOR = "#e85d5d";

export const CODE_PARTS: {
  key: keyof StatusRates;
  label: "rps2xx" | "rps3xx" | "rps4xx" | "rps5xx";
  code: "rps200" | "rps300" | "rps400" | "rps500";
  hint: "rps200Hint" | "rps300Hint" | "rps400Hint" | "rps500Hint";
  color: string;
}[] = [
  { key: "2xx", label: "rps2xx", code: "rps200", hint: "rps200Hint", color: OK_COLOR },
  { key: "3xx", label: "rps3xx", code: "rps300", hint: "rps300Hint", color: "#6aa8ff" },
  { key: "4xx", label: "rps4xx", code: "rps400", hint: "rps400Hint", color: "#f0b429" },
  { key: "5xx", label: "rps5xx", code: "rps500", hint: "rps500Hint", color: ERR_COLOR },
];

export function hostStats(
  host: FleetMemberView["host"],
  t: Translate,
  restarts?: number,
): (StatProps | null)[] {
  if (host === undefined) {
    return [];
  }

  const ram =
    host.memory.total === 0 ? 0 : host.memory.used / host.memory.total;
  const disk = host.disk;
  const diskFill =
    disk === undefined || disk.total === 0 ? 0 : disk.used / disk.total;

  return [
    {
      label: t("fleetPage.cpu"),
      value: formatCpu(host.cpu.usage),
      sub: `load ${host.cpu.load1.toFixed(2)} · ${host.cpu.cores} ${t("fleetPage.cores")}`,
      fill: host.cpu.usage,
    },
    {
      label: t("fleetPage.memory"),
      value: `${formatBytes(host.memory.used)} / ${formatBytes(host.memory.total)}`,
      sub: formatCpu(ram),
      fill: ram,
    },
    disk === undefined
      ? null
      : {
          label: t("fleetPage.disk"),
          value: `${formatBytes(disk.used)} / ${formatBytes(disk.total)}`,
          sub: formatCpu(diskFill),
          fill: diskFill,
        },
    {
      label: t("fleetPage.uptime"),
      value: formatUptime(host.uptime_s),
      sub:
        restarts === undefined || restarts === 0
          ? undefined
          : t("fleetPage.restarts", { n: restarts }),
      tone: restarts !== undefined && restarts > 0 ? "warning" : undefined,
      fill: restarts !== undefined && restarts > 0 ? 1 : undefined,
    },
  ];
}

export function busStat(
  bus: BusStats | undefined,
  flaps: number | undefined,
  t: Translate,
): StatProps | null {
  if (bus === undefined) {
    return null;
  }
  const flapping = (flaps ?? 0) > 0;
  return {
    label: t("fleetPage.bus"),
    value:
      bus.rtt_ms === undefined
        ? `${formatCount(bus.reconnects)} reconn`
        : `${formatMs(bus.rtt_ms)} ${t("fleetPage.ms")}`,
    sub:
      bus.rtt_ms === undefined
        ? undefined
        : `${formatCount(bus.reconnects)} reconn`,
    tone: flapping ? "warning" : undefined,
    fill: flapping ? 1 : undefined,
  };
}

export const WAF_PARTS = {
  allow: OK_COLOR,
  challenge: "#6aa8ff",
  deny: "#f0b429",
  fail: ERR_COLOR,
} as const;

export function verdictStats(
  waf: WafRates | undefined,
  t: Translate,
): (StatProps | null)[] {
  if (waf === undefined) {
    return [];
  }
  const mix = waf.allow + waf.deny + (waf.challenge ?? 0);
  const share = (n: number) =>
    mix > 0 ? `${Math.round((n / mix) * 100)}%` : "0%";
  const failOpen = waf.fail_open ?? 0;
  const failClosed = waf.fail_closed ?? 0;

  return [
    {
      label: t("fleetPage.wafAllow"),
      value: formatRps(waf.allow),
      sub: share(waf.allow),
      accent: WAF_PARTS.allow,
    },
    {
      label: t("fleetPage.wafDeny"),
      value: formatRps(waf.deny),
      sub: share(waf.deny),
      accent: WAF_PARTS.deny,
    },
    waf.challenge === undefined
      ? null
      : {
          label: t("fleetPage.wafChallenge"),
          value: formatRps(waf.challenge),
          sub: share(waf.challenge),
          accent: WAF_PARTS.challenge,
        },
    null,
    waf.deadline_hits === undefined
      ? null
      : {
          label: t("fleetPage.wafDeadline"),
          value: formatRps(waf.deadline_hits),
          tone: waf.deadline_hits > 0 ? "warning" : undefined,
          fill: waf.deadline_hits > 0 ? 1 : undefined,
        },
    {
      label: t("fleetPage.wafFailOpen"),
      value: formatRps(failOpen),
      sub: t("fleetPage.wafFailOpenHint"),
      accent: failOpen > 0 ? ERR_COLOR : OK_COLOR,
      tone: failOpen > 0 ? "error" : "success",
      fill: failOpen > 0 ? 1 : undefined,
    },
    failClosed <= 0
      ? null
      : {
          label: t("fleetPage.wafFailClosed"),
          value: formatRps(failClosed),
          tone: "warning",
          fill: 1,
        },
  ];
}

export function trafficStats(
  total: number,
  codes: StatusRates | undefined,
  history: RpsSample[],
  accent: string,
  t: Translate,
  totalLabel?: string,
): (StatProps | null)[] {
  const mix = CODE_PARTS.reduce(
    (sum, part) => sum + (codes?.[part.key] ?? 0),
    0,
  );

  return [
    {
      label: totalLabel ?? t("fleetPage.rpsWindow"),
      value: `${formatRps(total)} ${t("fleetPage.rps")}`,
      accent,
      series: history.map((row) => row.total),
    },
    null,
    ...CODE_PARTS.map((part) => {
      const n = codes?.[part.key] ?? 0;
      return {
        label: `${t(`fleetPage.${part.label}`)} · ${t(`fleetPage.${part.hint}`)}`,
        value: formatRps(n),
        sub: `${mix > 0 ? Math.round((n / mix) * 100) : 0}%`,
        accent: part.color,
        series: history.map((row) => row[part.key]),
      };
    }),
  ];
}

export function useFlowStats(
  io: FlowMap | undefined,
  prefix: string | undefined,
  t: Translate,
  windowS?: number,
): (StatProps | null)[] {
  const ioHistory = useAppSelector((s) => s.fleet.ioHistory);

  return Object.entries(io ?? {}).map(([name, flow]) => {
    const err = flow.err ?? 0;
    return {
      label:
        windowS === undefined
          ? channelLabel(name, t)
          : `${channelLabel(name, t)} · ${windowS} ${t("fleetPage.secondsShort")}`,
      value: `${formatRps(flow.ops)} ${t("fleetPage.ops")}`,
      sub: [
        bytesLine(flow, t),
        latencyLine(flow, t),
        err > 0
          ? `${t("fleetPage.flowErr")} ${formatRps(err)} ${t("fleetPage.ops")}`
          : null,
      ],
      subSlots: 3,
      accent: err > 0 ? ERR_COLOR : OK_COLOR,
      series:
        prefix === undefined
          ? undefined
          : ioHistory[`${prefix}:${name}`]?.map((row) => row.ops),
      wide: true,
    };
  });
}

export function capacityStat(
  label: string,
  used: number,
  cap: number,
): StatProps {
  if (cap <= 0) {
    return { label, value: formatBytes(used) };
  }
  return {
    label,
    value: `${formatBytes(used)} / ${formatBytes(cap)}`,
    sub: formatCpu(used / cap),
    fill: used / cap,
  };
}

export function countStat(
  label: string,
  value: number | undefined,
  sub?: string,
): StatProps | null {
  return value === undefined
    ? null
    : { label, value: formatCount(value), sub };
}

export function channelLabel(name: string, t: Translate): string {
  const key = `fleetPage.flowChannel.${name}`;
  const label = t(key);
  return label === key ? name : label;
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

function bytesLine(flow: Flow, t: Translate): string | null {
  const parts: string[] = [];
  if (flow.in !== undefined) {
    parts.push(`${t("fleetPage.flowIn")} ${formatBytesRate(flow.in)}`);
  }
  if (flow.out !== undefined) {
    parts.push(`${t("fleetPage.flowOut")} ${formatBytesRate(flow.out)}`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

function latencyLine(flow: Flow, t: Translate): string | null {
  if (flow.p50_ms === undefined && flow.p95_ms === undefined) {
    return null;
  }
  const parts = [flow.p50_ms, flow.p95_ms, flow.max_ms]
    .filter((n): n is number => n !== undefined)
    .map(formatMs);
  return `${t("fleetPage.flowLatency")} ${parts.join(" / ")} ${t("fleetPage.ms")}`;
}
