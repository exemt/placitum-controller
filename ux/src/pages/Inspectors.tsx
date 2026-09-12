import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { memo } from "react";

import { fetchFleet } from "../api.ts";
import {
  SummaryRow,
  blockAccordionSx,
  toHeadFlag,
  type HeadFlags,
} from "../components/BlockHead.tsx";
import {
  Block,
  CardBody,
  CellBar,
  CellChip,
  CellMono,
  CellValue,
  ErrorsBlock,
  FleetTable,
  MetaChips,
  StatStrip,
  busStat,
  hostColumns,
  hostStats,
  meta,
  memberColumns,
  useFlowStats,
  type FleetColumn,
  type StatProps,
} from "../components/card/index.ts";
import { FlowBar } from "../components/FlowPanel.tsx";
import { CpuBar, LatencyBar, MemBar, QueueBar } from "../components/MetricBar.tsx";
import { usePageBar } from "../layout/PageBarHost.tsx";
import {
  cardAnchor,
  cardKey,
  formatRps,
  mergeErrors,
  pickFlow,
  shortHash,
  shortId,
  sumFlows,
  worstHost,
  type InspectorDrift,
  type InspectorView,
} from "../fleet.ts";
import {
  groupLatency,
  groupQueue,
  latencyCaption,
  latencyFill,
  latencyTone,
  queueCaption,
  queueFill,
  queueTone,
  groupInspectors,
  isDrifted,
  replicaLatency,
  replicaQueue,
} from "../inspectors.ts";
import { CHANNEL_TONE, channelLabel } from "../convergence.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { applyFleetSnapshot } from "../store/fleet-ingest.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { sameRefs } from "../store/reuse.ts";
import {
  selectInspectorGroupNames,
  selectInspectorGroups,
} from "../store/slices/inspectors.ts";
import { toggleExpanded as toggleFleetExpanded } from "../store/slices/pages/fleet.ts";
import { toggleExpanded as toggleInspectorsExpanded } from "../store/slices/pages/inspectors.ts";

const CHIP_TONE = {
  default: undefined,
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
} as const;

export function InspectorBlocks({
  expandIn,
}: {
  expandIn: "fleet" | "inspectors";
}) {
  const names = useAppSelector(selectInspectorGroupNames);
  return (
    <>
      {names.map((name) => (
        <GroupBlock key={name} name={name} expandIn={expandIn} />
      ))}
    </>
  );
}

export default function Inspectors() {
  const t = useT();
  const dispatch = useAppDispatch();
  const connected = useAppSelector((s) => s.fleet.connected);
  const seq = useAppSelector((s) => s.inspectors.seq);
  const groups = useAppSelector(selectInspectorGroups);
  const snapshot = useAppSelector((s) => s.convergence.snapshot);

  usePageBar({
    onUpdate: () => {
      void fetchFleet()
        .then((row) => {
          dispatch(applyFleetSnapshot(row));
        })
        .catch(() => {
          // живой поток сокета всё равно догонит
        });
    },
  });

  return (
    <Stack spacing={2}>
      <Typography variant="caption" color="text.secondary">
        {connected ? t("fleet.live") : t("fleet.disconnected")}
        {seq > 0 ? ` · seq ${seq}` : ""}
      </Typography>
      {/*
        Поколение -- по каналам, а не одно на всех: у modsec, калитки, капчи и
        адреса свои манифесты, и общий хеш означал бы вечное расхождение у трёх
        инспекторов из четырёх.
      */}
      {snapshot !== null && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {snapshot.channels
            .filter((row) => row.desired !== null && row.id !== "nginx" && row.id !== "agent")
            .map((row) => (
              <Chip
                key={row.id}
                size="small"
                variant="outlined"
                color={CHIP_TONE[CHANNEL_TONE[row.state]]}
                label={`${channelLabel(t, row.id)} · rev ${row.desired?.rev} · ${shortHash(
                  row.desired?.hash ?? "",
                )}`}
                sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
              />
            ))}
        </Stack>
      )}

      {groups.length === 0 && (
        <Alert severity="info">{t("inspectorsPage.empty")}</Alert>
      )}

      <InspectorBlocks expandIn="inspectors" />
    </Stack>
  );
}

const GroupBlock = memo(function GroupBlock({
  name,
  expandIn,
}: {
  name: string;
  expandIn: "fleet" | "inspectors";
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const replicas = useAppSelector(
    (s) => s.inspectors.rows.filter((row) => row.name === name),
    sameRefs,
  );
  const expanded = useAppSelector((s) =>
    expandIn === "fleet"
      ? s.pages.fleet.expanded.includes(cardKey.inspector(name))
      : s.pages.inspectors.expanded.includes(name),
  );
  const flow = useFlowStats(
    sumFlows(replicas),
    `inspector:${name}`,
    t,
    replicas.find((row) => row.window_s !== undefined)?.window_s,
  );
  if (replicas.length === 0) {
    return null;
  }
  const group = groupInspectors(replicas)[0];
  if (group === undefined) {
    return null;
  }
  const up = group.replicas.filter((row) => row.status === "up").length;
  // Инспектор — это набор реплик за одной очередью, и спрашивают его темп
  // целиком. Разброс по процессам виден ниже, в колонке таблицы.
  const io = sumFlows(group.replicas);
  const windowS = group.replicas.find(
    (row) => row.window_s !== undefined,
  )?.window_s;
  const queue = groupQueue(group.replicas);
  const latency = groupLatency(group.replicas);
  const inspect = pickFlow(io, "inspect");
  const errors = mergeErrors(group.replicas);
  const single = group.replicas.length === 1;
  const flags: HeadFlags = {
    ok: group.status === "up",
    er:
      group.status === "degraded" ||
      group.drift === "failed" ||
      group.drift === "foreign",
    dr: isDrifted(group.drift),
  };
  const onToggle = () => {
    if (expandIn === "fleet") {
      dispatch(toggleFleetExpanded(cardKey.inspector(name)));
    } else {
      dispatch(toggleInspectorsExpanded(name));
    }
  };

  return (
    <Accordion
      id={
        expandIn === "fleet"
          ? cardAnchor(cardKey.inspector(name))
          : undefined
      }
      expanded={expanded}
      onChange={onToggle}
      variant="outlined"
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={blockAccordionSx(expanded, toHeadFlag(flags))}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <SummaryRow
          title={group.name.toUpperCase()}
          label={`${group.subject} ${up}/${group.replicas.length}`}
          flags={flags}
          errorCount={errors.length}
          skewMs={single ? group.replicas[0]?.skew_ms : undefined}
          slots={[
            <QueueBar key="queue" queue={queue} />,
            <LatencyBar key="latency" latency={latency} />,
            <CpuBar key="cpu" host={worstHost(group.replicas)} />,
            <MemBar key="mem" host={worstHost(group.replicas)} />,
            <FlowBar key="flow" io={io} windowS={windowS} primary="inspect" />,
          ]}
        />
      </AccordionSummary>
      <AccordionDetails>
        <CardBody>
          <StatStrip
            items={[
              ...(single
                ? [
                    ...hostStats(
                      worstHost(group.replicas),
                      t,
                      group.replicas[0]?.restarts_1h,
                    ),
                    busStat(
                      group.replicas[0]?.bus,
                      group.replicas[0]?.bus_flaps_1h,
                      t,
                    ),
                  ]
                : []),
              null,
              ...flow,
            ]}
          />
          <StatStrip
            items={[
              {
                label: t("inspectorsPage.replicasLabel"),
                value: `${up} / ${group.replicas.length}`,
                sub: t(`inspectorsPage.engine.${group.engine}`),
              },
              inspect === null
                ? null
                : {
                    label: t("fleetPage.flowOps"),
                    value: `${formatRps(inspect[1].ops)} ${t("fleetPage.ops")}`,
                  },
              queue.known
                ? {
                    label: t("inspectorsPage.queued"),
                    value: queueCaption(queue),
                    fill: queueFill(queue),
                    tone: queueTone(queue),
                  }
                : null,
              latency.known
                ? {
                    label: t("inspectorsPage.avgMs"),
                    value: latencyCaption(latency, t("fleetPage.ms")),
                    fill: latencyFill(latency),
                    tone: latencyTone(latency),
                  }
                : null,
            ] satisfies (StatProps | null)[]}
          />
          {!single && (
            <Block
              title={t("fleetPage.sectionInstances")}
              meta={String(group.replicas.length)}
            >
              <ReplicasTable rows={group.replicas} />
            </Block>
          )}
          <ErrorsBlock errors={errors} />
          <MetaChips
            items={[
              meta(t("inspectorsPage.engineLabel"), group.engine),
              meta(t("inspectorsPage.subject"), group.subject),
              meta(t("inspectorsPage.queue"), group.queue),
              ...(single ? soloMeta(group.replicas[0], t) : []),
            ]}
          />
        </CardBody>
      </AccordionDetails>
    </Accordion>
  );
});

/**
 * Экземпляры инспектора. Порядок колонок тот же, что у воркеров агента: кто →
 * как себя чувствует → что делает → чем настроен → когда виделись. Метрики
 * посередине пишет не всякая реплика, и колонка без данных не рисуется.
 */
function ReplicasTable({ rows }: { rows: InspectorView[] }) {
  const t = useT();

  const columns: FleetColumn<InspectorView>[] = memberColumns(t, {
    nameLabel: t("fleetPage.instance"),
    name: (row) => ({ title: row.hostname, sub: shortId(row.uuid) }),
    status: (row) => row.status,
    middle: [
      ...hostColumns<InspectorView>(t, (row) => row.host),
      {
        key: "ops",
        label: t("fleetPage.flowOps"),
        has: (row) => pickFlow(row.io, "inspect") !== null,
        cell: (row) => <CellValue text={rateLabel(row, t)} />,
      },
      {
        key: "queued",
        label: t("inspectorsPage.queued"),
        has: (row) => replicaQueue(row).known,
        cell: (row) => {
          const cell = replicaQueue(row);
          return (
            <CellBar
              value={queueFill(cell)}
              caption={queueCaption(cell)}
              tone={queueTone(cell)}
            />
          );
        },
      },
      {
        key: "latency",
        label: t("inspectorsPage.avgMs"),
        has: (row) => replicaLatency(row).known,
        cell: (row) => {
          const cell = replicaLatency(row);
          return (
            <CellBar
              value={latencyFill(cell)}
              caption={latencyCaption(cell, t("fleetPage.ms"))}
              tone={latencyTone(cell)}
            />
          );
        },
      },
      {
        key: "work",
        label: t("inspectorsPage.work"),
        has: (row) => workLabel(row) !== undefined,
        cell: (row) => <CellValue text={workLabel(row) ?? t("common.none")} />,
      },
    ],
    tail: [
      {
        key: "hash",
        label: t("fleetPage.hash"),
        has: (row) => row.config_hash !== undefined,
        cell: (row) => (
          <CellMono
            text={shortHash(row.config_hash)}
            sub={
              row.apply !== undefined && row.apply !== "ok"
                ? row.apply
                : undefined
            }
          />
        ),
      },
      {
        key: "drift",
        label: t("fleetPage.sync"),
        has: (row) => row.drift !== undefined && row.drift !== "unknown",
        cell: (row) => (
          <CellChip
            label={t(`inspectorsPage.driftState.${row.drift ?? "unknown"}`)}
            tone={driftTone(row.drift ?? "unknown")}
          />
        ),
      },
    ],
    seen: (row) => row.seen_at,
  });

  return (
    <FleetTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.uuid}
      empty={t("inspectorsPage.empty")}
    />
  );
}

/** Одна реплика — таблицы нет: её hash, сходимость и работа идут в чипы. */
function soloMeta(row: InspectorView, t: Translate) {
  return [
    meta(t("fleetPage.hash"), shortHash(row.config_hash)),
    row.drift === undefined || row.drift === "unknown"
      ? null
      : meta(
          t("inspectorsPage.drift"),
          t(`inspectorsPage.driftState.${row.drift}`),
          row.drift === "ok" ? "success" : "warning",
        ),
    meta(t("inspectorsPage.work"), workLabel(row)),
  ];
}

function driftTone(
  drift: InspectorDrift,
): "default" | "success" | "warning" | "error" {
  if (drift === "ok") {
    return "success";
  }
  if (drift === "unknown") {
    return "default";
  }
  return "warning";
}

function rateLabel(row: InspectorView, t: Translate): string {
  const picked = pickFlow(row.io, "inspect");
  if (picked === null) {
    return "—";
  }
  return `${formatRps(picked[1].ops)} ${t("fleetPage.ops")}`;
}

/** Работа реплики: то, что она сама считает, — принято, отброшено, правила. */
function workLabel(row: InspectorView): string | undefined {
  const work = row.work;
  if (work === undefined) {
    return undefined;
  }
  if (work.accepted !== undefined) {
    const shed = work.shed ?? 0;
    return shed > 0 ? `${work.accepted} ok · ${shed} shed` : `${work.accepted} ok`;
  }
  if (work.rules !== undefined) {
    return `${work.rules} rules`;
  }
  return undefined;
}
