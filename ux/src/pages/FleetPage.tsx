import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { memo } from "react";

import {
  agentDrifted,
  cardAnchor,
  cardKey,
  fleetErrors,
  fleetLamp,
  fleetLiveness,
  formatAge,
  formatBytes,
  formatCount,
  formatRps,
  mergeErrors,
  pickFlow,
  shortHash,
  shortId,
  sumFlows,
  worstHost,
  type FleetMemberView,
  type InspectorView,
  type RedisView,
  type S3View,
  type ServiceView,
  type StoreView,
  type FleetLamp,
  type StatusRates,
  type WafRates,
} from "../fleet.ts";
import { fetchFleet } from "../api.ts";
import { InspectorBlocks } from "./Inspectors.tsx";
import { FleetOverview } from "./fleet-overview.tsx";
import {
  SummaryRow,
  blockAccordionSx,
  toHeadFlag,
  type HeadFlags,
} from "../components/BlockHead.tsx";
import {
  Block,
  CardBody,
  CODE_PARTS,
  CellChip,
  CellMono,
  CellValue,
  ErrorsBlock,
  FleetTable,
  MetaChips,
  StatStrip,
  WAF_PARTS,
  busStat,
  capacityStat,
  countStat,
  hostColumns,
  hostStats,
  meta,
  memberColumns,
  trafficStats,
  useFlowStats,
  verdictStats,
  type FleetColumn,
  type MetaItem,
  type StatProps,
} from "../components/card/index.ts";
import { FlowBar } from "../components/FlowPanel.tsx";
import { CpuBar, MemBar, MetricBar } from "../components/MetricBar.tsx";
import { useTheme } from "@mui/material/styles";
import { useT, type Translate } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { applyFleetSnapshot } from "../store/fleet-ingest.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { sameRefs } from "../store/reuse.ts";
import { EMPTY_RPS } from "../store/slices/fleet.ts";
import { selectInspectorGroups } from "../store/slices/inspectors.ts";
import { toggleExpanded } from "../store/slices/pages/fleet.ts";
import { isDrifted } from "../inspectors.ts";
import type { PageBarStatus } from "../components/PageBar.tsx";

/**
 * Живость в полосе красится тем же, чем лампа в шапке: у числа и у цвета над
 * ним один источник, и спорить им не о чем.
 */
const LAMP_TONE: Record<FleetLamp, PageBarStatus["tone"]> = {
  green: "success",
  yellow: "warning",
  red: "error",
};

const EMPTY_AGENTS: (FleetMemberView & { workers: FleetMemberView[] })[] = [];
const EMPTY_STORES: StoreView[] = [];
const EMPTY_SERVICES: ServiceView[] = [];
const EMPTY_MEMBERS: FleetMemberView[] = [];
const EMPTY_INSPECTORS: InspectorView[] = [];

export default function FleetPage() {
  const t = useT();
  const snapshot = useAppSelector((s) => s.fleet.snapshot);
  const connected = useAppSelector((s) => s.fleet.connected);
  const expanded = useAppSelector((s) => s.pages.fleet.expanded);
  const groups = useAppSelector(selectInspectorGroups);
  const dispatch = useAppDispatch();

  const agents = snapshot?.agents ?? EMPTY_AGENTS;
  const stores = snapshot?.stores ?? EMPTY_STORES;
  const services = snapshot?.services ?? EMPTY_SERVICES;
  const inspectors = snapshot?.inspectors ?? EMPTY_INSPECTORS;
  const orphans = snapshot?.orphans ?? EMPTY_MEMBERS;
  const orphanIds = orphanNodeIds(orphans);
  const empty =
    agents.length === 0 &&
    orphanIds.length === 0 &&
    stores.length === 0 &&
    inspectors.length === 0 &&
    services.length === 0;

  const liveness = fleetLiveness(snapshot);
  const errors = fleetErrors(snapshot);
  /*
   * Расхождение считается по этажам, а не одним числом на страницу: «3
   * разошлось» без адреса заставляет обойти взглядом все карточки, а отметка
   * у подписи группы говорит, на каком этаже искать.
   */
  const nodeDrift = agents.filter(agentDrifted).length;
  const inspectorDrift = groups.filter((row) => isDrifted(row.drift)).length;

  usePageBar({
    crumb: crumbForExpanded(expanded, stores, agents, inspectors, services, t),
    status: empty
      ? undefined
      : [
          {
            key: "fleet",
            label: t("fleetPage.bar.fleet"),
            value: `${liveness.up} / ${liveness.total}`,
            tone: LAMP_TONE[fleetLamp(connected, snapshot)],
            title: t("fleetPage.bar.fleetHint"),
          },
          {
            key: "errors",
            label: t("fleetPage.bar.errors"),
            value: formatCount(errors.entries),
            tone: errors.members > 0 ? "error" : "default",
            title:
              errors.members > 0
                ? t("fleetPage.bar.errorsHint", { n: errors.members })
                : t("fleetPage.bar.errorsQuiet"),
            anchor:
              errors.first === undefined
                ? undefined
                : cardAnchor(errors.first),
          },
        ],
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
      {empty && (
        <Alert severity="info">{t("fleet.empty")}</Alert>
      )}

      {!empty && <FleetOverview />}

      {(agents.length > 0 || orphanIds.length > 0) && (
        <GroupLabel
          title={t("fleetPage.nodesSection")}
          meta={String(agents.length + orphanIds.length)}
          drift={nodeDrift}
        />
      )}

      {agents.map((agent) => (
        <AgentBlock key={agent.uuid} id={agent.uuid} />
      ))}

      {orphanIds.map((nodeId) => (
        <OrphanBlock key={nodeId} nodeId={nodeId} />
      ))}

      {inspectors.length > 0 && (
        <GroupLabel
          title={t("fleetPage.inspectorsSection")}
          meta={String(new Set(inspectors.map((row) => row.name)).size)}
          drift={inspectorDrift}
        />
      )}

      <InspectorBlocks expandIn="fleet" />

      {stores.length > 0 && (
        <GroupLabel
          title={t("fleetPage.storesSection")}
          meta={String(stores.length)}
        />
      )}

      {stores.map((store) => (
        <StoreBlock key={store.uuid} id={store.uuid} />
      ))}

      {services.length > 0 && (
        <GroupLabel
          title={t("fleetPage.servicesSection")}
          meta={String(serviceNames(services).length)}
        />
      )}

      {serviceNames(services).map((name) => (
        <ServiceBlock key={name} name={name} />
      ))}
    </Stack>
  );
}

/**
 * Подпись группы карточек: порядок страницы повторяет путь запроса — ноды,
 * инспекторы, хранилища, сервисы, — и подпись даёт глазу зацепку, где чей
 * этаж, когда карточек становится больше пяти.
 *
 * `drift` — сколько карточек этажа стоят в `dr`. Плитки «Конфиг 17 / 20»
 * наверху больше нет: общее число не говорило, где искать, а этаж говорит.
 * Ноль не рисуется — отметка появляется только тогда, когда есть что чинить.
 */
function GroupLabel({
  title,
  meta: count,
  drift = 0,
}: {
  title: string;
  meta?: string;
  drift?: number;
}) {
  const t = useT();

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", mt: 0.5 }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: "0.65rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "text.secondary",
          opacity: 0.75,
          whiteSpace: "nowrap",
        }}
      >
        {title}
        {count !== undefined && (
          <Box component="span" sx={{ opacity: 0.6, ml: 0.75 }}>
            {count}
          </Box>
        )}
      </Typography>
      {drift > 0 && (
        <Typography
          component="span"
          title={t("fleetPage.state.dr")}
          sx={{
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "warning.main",
            whiteSpace: "nowrap",
          }}
        >
          {`dr ${drift}`}
        </Typography>
      )}
      <Box sx={{ flexGrow: 1, height: "1px", bgcolor: "divider" }} />
    </Stack>
  );
}

const StoreBlock = memo(function StoreBlock({ id }: { id: string }) {
  const store = useAppSelector((s) =>
    s.fleet.snapshot?.stores?.find((row) => row.uuid === id),
  );
  const expanded = useAppSelector((s) =>
    s.pages.fleet.expanded.includes(cardKey.store(id)),
  );
  const dispatch = useAppDispatch();
  if (store === undefined) {
    return null;
  }
  const onToggle = (next: boolean) => {
    if (next !== expanded) {
      dispatch(toggleExpanded(cardKey.store(id)));
    }
  };
  if (store.kind === "s3") {
    return (
      <S3StoreBlock store={store} expanded={expanded} onToggle={onToggle} />
    );
  }
  return (
    <RedisStoreBlock store={store} expanded={expanded} onToggle={onToggle} />
  );
});

function RedisStoreBlock({
  store,
  expanded,
  onToggle,
}: {
  store: RedisView;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useT();
  const host = store.host;
  const redis = store.redis;
  const used = redis.used_memory ?? 0;
  const cap = redis.maxmemory ?? 0;
  const flow = useFlowStats(store.io, store.uuid, t, store.window_s);
  const flags: HeadFlags = {
    ok: store.status === "up" && store.ready && redis.ok,
    er: redis.error !== undefined || !store.ready,
    dr: false,
  };

  return (
    <Accordion
      id={cardAnchor(cardKey.store(store.uuid))}
      expanded={expanded}
      onChange={(_, next) => onToggle(next)}
      variant="outlined"
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={blockAccordionSx(expanded, toHeadFlag(flags))}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <SummaryRow
          title={t("fleetPage.store")}
          // Redis в контуре два -- обменник и внутренний; различает их имя
          // из WAF_REDIS_NAME, hostname у сайдкаров почти одинаковый.
          label={`${store.name} · ${store.hostname}${build(store.version)} · ${seenAge(store.seen_at)}`}
          flags={flags}
          errorCount={store.errors?.length ?? 0}
          skewMs={store.skew_ms}
          slots={[
            <MetricBar
              key="fill"
              label=""
              caption={storeFillCaption(used, cap, redis.keys ?? 0)}
              value={cap > 0 ? used / cap : 0}
            />,
            <CpuBar key="cpu" host={host} />,
            <MemBar key="mem" host={host} />,
            <FlowBar
              key="flow"
              io={store.io}
              windowS={store.window_s}
              primary="cmd"
            />,
          ]}
        />
      </AccordionSummary>
      <AccordionDetails>
        <CardBody>
          <StatStrip
            items={[
              ...hostStats(host, t, store.restarts_1h),
              busStat(store.bus, store.bus_flaps_1h, t),
              null,
              ...flow,
            ]}
          />
          <StatStrip
            items={[
              capacityStat(t("fleetPage.store"), used, cap),
              countStat(
                t("fleetPage.keysLabel"),
                redis.keys,
                redis.expires === undefined ? undefined : `ttl ${redis.expires}`,
              ),
              hitRateStat(redis.hits, redis.misses, t),
              // Eviction на сторе вердиктов — потеря данных, не рядовое число.
              store.evicted_1h === undefined
                ? null
                : {
                    label: t("fleetPage.evicted"),
                    value: formatCount(store.evicted_1h),
                    sub: t("fleetPage.evictedHint"),
                    tone: "error",
                    fill: 1,
                  },
            ]}
          />
          <ErrorsBlock errors={store.errors} />
          <MetaChips
            items={[
              meta(t("fleetPage.version"), redis.version),
              meta(t("fleetPage.role"), redis.role),
              meta(t("fleetPage.policy"), redis.maxmemory_policy),
              redis.clients === undefined
                ? null
                : meta(t("fleetPage.clients"), formatCount(redis.clients)),
              meta(t("fleetPage.error"), redis.error, "warning"),
            ]}
          />
        </CardBody>
      </AccordionDetails>
    </Accordion>
  );
}

function S3StoreBlock({
  store,
  expanded,
  onToggle,
}: {
  store: S3View;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useT();
  const host = store.host;
  const s3 = store.s3;
  const used = s3.used_bytes ?? 0;
  const cap = s3.capacity ?? 0;
  const flow = useFlowStats(store.io, store.uuid, t, store.window_s);
  const flags: HeadFlags = {
    ok: store.status === "up" && store.ready && s3.ok,
    er: s3.error !== undefined || !store.ready,
    dr: false,
  };

  return (
    <Accordion
      id={cardAnchor(cardKey.store(store.uuid))}
      expanded={expanded}
      onChange={(_, next) => onToggle(next)}
      variant="outlined"
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={blockAccordionSx(expanded, toHeadFlag(flags))}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <SummaryRow
          title={t("fleetPage.storeS3")}
          label={`${store.hostname}${build(store.version)} · ${seenAge(store.seen_at)}`}
          flags={flags}
          errorCount={store.errors?.length ?? 0}
          skewMs={store.skew_ms}
          slots={[
            <MetricBar
              key="fill"
              label=""
              caption={storeFillCaption(used, cap, s3.objects ?? 0)}
              value={cap > 0 ? used / cap : 0}
            />,
            <CpuBar key="cpu" host={host} />,
            <MemBar key="mem" host={host} />,
            <FlowBar
              key="flow"
              io={store.io}
              windowS={store.window_s}
              primary="api"
            />,
          ]}
        />
      </AccordionSummary>
      <AccordionDetails>
        <CardBody>
          <StatStrip
            items={[
              ...hostStats(host, t, store.restarts_1h),
              busStat(store.bus, store.bus_flaps_1h, t),
              null,
              ...flow,
            ]}
          />
          <StatStrip
            items={[
              capacityStat(t("fleetPage.storeS3"), used, cap),
              countStat(t("fleetPage.objectsLabel"), s3.objects),
            ]}
          />
          <ErrorsBlock errors={store.errors} />
          <MetaChips
            items={[
              meta(t("fleetPage.bucket"), s3.bucket),
              s3.buckets === undefined
                ? null
                : meta(t("fleetPage.buckets"), formatCount(s3.buckets)),
              meta(t("fleetPage.endpoint"), s3.endpoint),
              meta(t("fleetPage.region"), s3.region),
              meta(t("fleetPage.version"), s3.version),
              meta(t("fleetPage.error"), s3.error, "warning"),
            ]}
          />
        </CardBody>
      </AccordionDetails>
    </Accordion>
  );
}

const AgentBlock = memo(function AgentBlock({ id }: { id: string }) {
  const agent = useAppSelector((s) =>
    s.fleet.snapshot?.agents.find((row) => row.uuid === id),
  );
  const expanded = useAppSelector((s) =>
    s.pages.fleet.expanded.includes(cardKey.agent(id)),
  );
  const history = useAppSelector(
    (s) => s.fleet.rpsHistory[agent?.health.node_id ?? ""] ?? EMPTY_RPS,
  );
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const t = useT();
  const flow = useFlowStats(agent?.io, agent?.uuid, t, agent?.window_s);
  if (agent === undefined) {
    return null;
  }
  const onToggle = (next: boolean) => {
    if (next !== expanded) {
      dispatch(toggleExpanded(cardKey.agent(id)));
    }
  };
  const host = agent.host;
  const codes = agent.codes;
  const rps = agent.rps;
  const waf = agent.waf;
  const failOpen = (waf?.fail_open ?? 0) > 0;
  const flags: HeadFlags = {
    ok: agent.status === "up" && !failOpen,
    // Fail-open — запросы уходят без инспекции: это сбой WAF, а не дрейф.
    er: agent.status === "degraded" || failOpen,
    dr: agentDrifted(agent),
  };

  return (
    <Accordion
      id={cardAnchor(cardKey.agent(agent.uuid))}
      expanded={expanded}
      onChange={(_, next) => onToggle(next)}
      variant="outlined"
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={blockAccordionSx(expanded, toHeadFlag(flags))}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <SummaryRow
          title={agent.health.node_id}
          label={`${t("fleetPage.agent")}${build(agent.health.version)} · ${agent.workers.length} wrk · ${seenAge(agent.seen_at)}`}
          flags={flags}
          errorCount={agent.errors?.length ?? 0}
          skewMs={agent.skew_ms}
          slots={[
            waf === undefined ? null : <WafBar key="waf" waf={waf} />,
            rps === undefined ? null : (
              <MetricBar
                key="rps"
                label={t("fleetPage.rps")}
                caption={formatRps(rps)}
                segments={CODE_PARTS.map((part) => ({
                  key: part.key,
                  value: codes?.[part.key] ?? 0,
                  color: part.color,
                }))}
                tooltip={() => <RpsTooltip total={rps} codes={codes} />}
                tooltipPlacement="left"
              />
            ),
            <CpuBar key="cpu" host={host} />,
            <MemBar key="mem" host={host} />,
            <FlowBar
              key="flow"
              io={agent.io}
              windowS={agent.window_s}
              primary="archive"
            />,
          ]}
        />
      </AccordionSummary>
      <AccordionDetails>
        <CardBody>
          <StatStrip
            items={[
              ...hostStats(host, t, agent.restarts_1h),
              busStat(agent.bus, agent.bus_flaps_1h, t),
              null,
              ...flow,
            ]}
          />
          {waf !== undefined && <StatStrip items={verdictStats(waf, t)} />}
          {rps !== undefined && (
            <StatStrip
              items={trafficStats(
                rps,
                codes,
                history,
                theme.palette.primary.main,
                t,
              )}
            />
          )}
          <Block
            title={t("fleetPage.sectionWorkers")}
            meta={String(agent.workers.length)}
          >
            <WorkersTable
              rows={agent.workers}
              confHash={agent.health.conf_fingerprint}
            />
          </Block>
          <ErrorsBlock errors={agent.errors} />
          <MetaChips
            items={[
              meta(t("fleetPage.apply"), agent.apply),
              meta(t("fleetPage.hash"), shortHash(agent.health.config_hash)),
              // Рядом с поколением, потому что это два разных документа:
              // шаблон, который приехал, и файл, который лёг на ноду. С
              // хешами воркеров сходится второй.
              meta(
                t("fleetPage.confHash"),
                agent.health.conf_fingerprint === undefined
                  ? undefined
                  : shortHash(agent.health.conf_fingerprint),
              ),
            ]}
          />
        </CardBody>
      </AccordionDetails>
    </Accordion>
  );
});

const OrphanBlock = memo(function OrphanBlock({ nodeId }: { nodeId: string }) {
  const workers = useAppSelector(
    (s) =>
      (s.fleet.snapshot?.orphans ?? EMPTY_MEMBERS).filter(
        (row) => row.health.node_id === nodeId,
      ),
    sameRefs,
  );
  const expanded = useAppSelector((s) =>
    s.pages.fleet.expanded.includes(cardKey.orphan(nodeId)),
  );
  const dispatch = useAppDispatch();
  const t = useT();
  const onToggle = (next: boolean) => {
    if (next !== expanded) {
      dispatch(toggleExpanded(cardKey.orphan(nodeId)));
    }
  };

  return (
    <Accordion
      id={cardAnchor(cardKey.orphan(nodeId))}
      expanded={expanded}
      onChange={(_, next) => onToggle(next)}
      variant="outlined"
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{ ...blockAccordionSx(expanded, "er"), borderStyle: "dashed" }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <SummaryRow
          title={nodeId}
          label={t("fleet.orphans")}
          flags={{ ok: false, er: true, dr: false }}
        />
      </AccordionSummary>
      <AccordionDetails>
        <CardBody>
          <Block
            title={t("fleetPage.sectionWorkers")}
            meta={String(workers.length)}
          >
            <WorkersTable rows={workers} />
          </Block>
        </CardBody>
      </AccordionDetails>
    </Accordion>
  );
});

/**
 * Сервис — пачка процессов одного имени, как и инспектор: логеров может стоять
 * несколько, и спрашивают их вместе. Счётчики складываются, размеры каталога —
 * нет: каждый процесс держит одну и ту же выборку, и сумма врала бы кратно.
 */
const ServiceBlock = memo(function ServiceBlock({ name }: { name: string }) {
  const rows = useAppSelector(
    (s) =>
      (s.fleet.snapshot?.services ?? EMPTY_SERVICES).filter(
        (row) => row.name === name,
      ),
    sameRefs,
  );
  const expanded = useAppSelector((s) =>
    s.pages.fleet.expanded.includes(cardKey.service(name)),
  );
  const dispatch = useAppDispatch();
  const t = useT();
  const io = sumFlows(rows);
  const flow = useFlowStats(io, `service:${name}`, t);
  const head = rows[0];
  if (head === undefined) {
    return null;
  }
  const onToggle = (next: boolean) => {
    if (next !== expanded) {
      dispatch(toggleExpanded(cardKey.service(name)));
    }
  };
  const up = rows.filter((row) => row.status === "up").length;
  const windowS = rows.find((row) => row.window_s !== undefined)?.window_s;
  const host = worstHost(rows);
  const totals = serviceTotals(rows);
  const errors = mergeErrors(rows);
  const single = rows.length === 1;
  const flags: HeadFlags = {
    ok: up === rows.length && rows.every((row) => row.ready),
    er:
      totals.errors.length > 0 ||
      rows.some((row) => !row.ready) ||
      totals.clickhouseOk === false,
    dr: false,
  };

  return (
    <Accordion
      id={cardAnchor(cardKey.service(name))}
      expanded={expanded}
      onChange={(_, next) => onToggle(next)}
      variant="outlined"
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={blockAccordionSx(expanded, toHeadFlag(flags))}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <SummaryRow
          title={serviceName(name, t)}
          label={`${head.hostname}${build(head.version)} · ${up}/${rows.length}`}
          flags={flags}
          errorCount={errors.length}
          skewMs={single ? head.skew_ms : undefined}
          slots={[
            <CpuBar key="cpu" host={host} />,
            <MemBar key="mem" host={host} />,
            <FlowBar key="flow" io={io} windowS={windowS} primary="insert" />,
          ]}
        />
      </AccordionSummary>
      <AccordionDetails>
        <CardBody>
          <StatStrip
            items={[
              ...(single
                ? [
                    ...hostStats(host, t, head.restarts_1h),
                    busStat(head.bus, head.bus_flaps_1h, t),
                  ]
                : []),
              null,
              ...flow,
            ]}
          />
          <StatStrip
            items={[
              {
                label: t("fleetPage.sectionInstances"),
                value: `${up} / ${rows.length}`,
              },
              countStat(t("fleetPage.inserted"), totals.inserted),
              countStat(t("fleetPage.lastBatch"), totals.lastBatch),
              // Отставание от JetStream: успевает ли логгер за шиной.
              totals.lag === undefined
                ? null
                : {
                    label: t("fleetPage.lag"),
                    value: formatCount(totals.lag),
                    sub: t("fleetPage.lagHint"),
                    tone: totals.lag > 10_000 ? "warning" : undefined,
                    fill: totals.lag > 10_000 ? 1 : undefined,
                  },
              countStat(t("fleetPage.countries"), totals.countries),
              countStat(t("fleetPage.asns"), totals.asns),
              countStat(t("fleetPage.skipped"), totals.skipped),
            ]}
          />
          {!single && (
            <Block
              title={t("fleetPage.sectionInstances")}
              meta={String(rows.length)}
            >
              <ServiceInstances rows={rows} />
            </Block>
          )}
          <ErrorsBlock errors={errors} />
          <MetaChips
            items={[
              totals.clickhouseOk === undefined
                ? null
                : {
                    label: t("fleetPage.clickhouse"),
                    value: totals.clickhouseOk
                      ? t("fleetPage.ok")
                      : t("fleetPage.danger"),
                    tone: totals.clickhouseOk ? "success" : "error",
                  },
              meta(
                t("fleetPage.fingerprint"),
                totals.fingerprint === undefined
                  ? undefined
                  : shortHash(totals.fingerprint),
              ),
              ...totals.errors.map((row) =>
                meta(t("fleetPage.error"), row, "warning"),
              ),
            ]}
          />
        </CardBody>
      </AccordionDetails>
    </Accordion>
  );
});

/**
 * Воркеры ноды. Своей телеметрии у воркера нет — в кадре только то, чем он
 * запущен: pid, nonce и hash конфига. Колонок поэтому мало, но они те же и в
 * том же порядке, что у экземпляров инспектора и сервиса: кто → как себя
 * чувствует → чем настроен → когда виделись.
 */
function WorkersTable({
  rows,
  confHash,
}: {
  rows: FleetMemberView[];
  confHash?: string;
}) {
  const t = useT();

  const columns: FleetColumn<FleetMemberView>[] = memberColumns(t, {
    nameLabel: t("fleetPage.process"),
    name: (row) => ({
      title: `pid ${row.health.pid ?? t("common.none")}`,
      sub: row.health.nonce,
    }),
    status: (row) => row.status,
    tail: [
      {
        key: "hash",
        label: t("fleetPage.hash"),
        has: (row) => row.health.config_hash !== undefined,
        cell: (row) => <CellMono text={shortHash(row.health.config_hash)} />,
      },
      {
        key: "sync",
        label: t("fleetPage.sync"),
        has: (row) =>
          confHash !== undefined && row.health.config_hash !== undefined,
        cell: (row) => syncChip(row.health.config_hash, confHash, t),
      },
    ],
    seen: (row) => row.seen_at,
  });

  return (
    <FleetTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.uuid}
      empty={t("fleetPage.noWorkers")}
    />
  );
}

/** Экземпляры сервиса: те же колонки и тот же порядок, что у инспектора. */
function ServiceInstances({ rows }: { rows: ServiceView[] }) {
  const t = useT();

  const columns: FleetColumn<ServiceView>[] = memberColumns(t, {
    nameLabel: t("fleetPage.instance"),
    name: (row) => ({ title: row.hostname, sub: `${shortId(row.uuid)}${build(row.version)}` }),
    status: (row) => row.status,
    middle: [
      ...hostColumns<ServiceView>(t, (row) => row.host),
      {
        key: "ops",
        label: t("fleetPage.flowOps"),
        has: (row) => pickFlow(row.io, "insert") !== null,
        cell: (row) => {
          const picked = pickFlow(row.io, "insert");
          return (
            <CellValue
              text={
                picked === null
                  ? "—"
                  : `${formatRps(picked[1].ops)} ${t("fleetPage.ops")}`
              }
            />
          );
        },
      },
      {
        key: "inserted",
        label: t("fleetPage.inserted"),
        align: "right",
        has: (row) => row.work?.inserted !== undefined,
        cell: (row) => (
          <CellValue
            text={
              row.work?.inserted === undefined
                ? "—"
                : formatCount(row.work.inserted)
            }
          />
        ),
      },
    ],
    tail: [
      {
        key: "fingerprint",
        label: t("fleetPage.fingerprint"),
        has: (row) => row.work?.fingerprint !== undefined,
        cell: (row) => <CellMono text={shortHash(row.work?.fingerprint)} />,
      },
    ],
    seen: (row) => row.seen_at,
  });

  return (
    <FleetTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.uuid}
      empty={t("fleet.empty")}
    />
  );
}

/**
 * Воркер перечитывает конфиг сам, поэтому разошедшийся hash — его статус.
 * Сравнение идёт с отпечатком боевого файла, который положил агент
 * (`conf_fingerprint`), а не с поколением шаблона: поколение — sha256 пака до
 * подстановки путей, и с md5 файла оно не сойдётся ни на одной ноде.
 */
function syncChip(
  hash: string | undefined,
  confHash: string | undefined,
  t: Translate,
) {
  if (hash === undefined || confHash === undefined) {
    return <CellChip label={t("common.none")} tone="default" />;
  }
  return hash === confHash ? (
    <CellChip label={t("fleetPage.syncOk")} tone="success" />
  ) : (
    <CellChip label={t("fleetPage.syncStale")} tone="warning" />
  );
}

/**
 * Полоса вердиктов в шапке агента: allow/challenge/deny и красная доля
 * fail-open. Подпись — deny, а при fail-open — он: важнее того, что заблокировано,
 * только то, что ушло без инспекции.
 */
function WafBar({ waf }: { waf: WafRates }) {
  const t = useT();
  const failOpen = waf.fail_open ?? 0;
  return (
    <MetricBar
      label={t("fleetPage.wafBar")}
      caption={
        failOpen > 0
          ? `${formatRps(failOpen)} ${t("fleetPage.wafFailShort")}`
          : `${formatRps(waf.deny)} ${t("fleetPage.wafDenyShort")}`
      }
      segments={[
        { key: "allow", value: waf.allow, color: WAF_PARTS.allow },
        {
          key: "challenge",
          value: waf.challenge ?? 0,
          color: WAF_PARTS.challenge,
        },
        { key: "deny", value: waf.deny, color: WAF_PARTS.deny },
        { key: "fail", value: failOpen, color: WAF_PARTS.fail },
      ]}
      tooltip={t("fleetPage.wafBarHint")}
    />
  );
}

function RpsTooltip({
  total,
  codes,
}: {
  total: number;
  codes?: StatusRates;
}) {
  const t = useT();
  const mix = CODE_PARTS.reduce(
    (sum, part) => sum + (codes?.[part.key] ?? 0),
    0,
  );

  return (
    <Stack spacing={1.25} sx={{ minWidth: 220 }}>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {t("fleetPage.rpsWindow")}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography variant="caption" color="text.secondary">
            {t("fleetPage.rpsTotal")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatRps(total)} {t("fleetPage.rps")}
          </Typography>
        </Stack>
      </Box>
      <Box
        sx={{
          display: "flex",
          height: 8,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "action.hover",
        }}
      >
        {mix > 0 &&
          CODE_PARTS.map((part) => {
            const n = codes?.[part.key] ?? 0;
            return n > 0 ? (
              <Box
                key={part.key}
                sx={{ flexGrow: n, bgcolor: part.color, minWidth: 2 }}
              />
            ) : null;
          })}
      </Box>
      <Stack spacing={1}>
        {CODE_PARTS.map((part) => {
          const n = codes?.[part.key] ?? 0;
          const share = mix > 0 ? Math.round((n / mix) * 100) : 0;
          return (
            <Box key={part.key}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: part.color,
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600, width: 32 }}>
                  {t(`fleetPage.${part.code}`)}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexGrow: 1 }}
                >
                  {t(`fleetPage.${part.hint}`)}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatRps(n)}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ width: 32, textAlign: "right" }}
                >
                  {share}%
                </Typography>
              </Stack>
              <Box
                sx={{
                  mt: 0.5,
                  ml: 2.25,
                  height: 3,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    width: `${share}%`,
                    height: "100%",
                    bgcolor: part.color,
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Stack>
      {mix <= 0 && (
        <Typography variant="caption" color="text.secondary">
          {t("fleetPage.rpsTooltipIdle")}
        </Typography>
      )}
    </Stack>
  );
}

/** Попадания в кэш: доля от обращений, а не два числа рядом. */
function hitRateStat(
  hits: number | undefined,
  misses: number | undefined,
  t: Translate,
): StatProps | null {
  if (hits === undefined || misses === undefined || hits + misses === 0) {
    return null;
  }
  const rate = hits / (hits + misses);
  return {
    label: t("fleetPage.hitRate"),
    value: `${Math.round(rate * 100)}%`,
    sub: `${formatCount(hits)} / ${formatCount(misses)}`,
    fill: rate,
    tone: rate >= 0.8 ? "success" : rate >= 0.5 ? "warning" : "error",
  };
}

interface ServiceTotals {
  inserted?: number;
  skipped?: number;
  lastBatch?: number;
  lag?: number;
  countries?: number;
  asns?: number;
  clickhouseOk?: boolean;
  fingerprint?: string;
  errors: string[];
}

function serviceTotals(rows: ServiceView[]): ServiceTotals {
  const totals: ServiceTotals = { errors: [] };
  const prints = new Set<string>();

  for (const row of rows) {
    const work = row.work;
    if (work === undefined) {
      continue;
    }
    totals.inserted = addUp(totals.inserted, work.inserted);
    totals.skipped = addUp(totals.skipped, work.skipped);
    // Отставание группы — сумма: у реплик один consumer, pending делится.
    totals.lag = addUp(totals.lag, work.lag);
    totals.lastBatch = keepMax(totals.lastBatch, work.last_batch);
    totals.countries = keepMax(totals.countries, work.countries);
    totals.asns = keepMax(totals.asns, work.asns);
    if (work.clickhouse_ok !== undefined) {
      totals.clickhouseOk = (totals.clickhouseOk ?? true) && work.clickhouse_ok;
    }
    if (work.fingerprint !== undefined) {
      prints.add(work.fingerprint);
    }
    if (work.error !== undefined && !totals.errors.includes(work.error)) {
      totals.errors.push(work.error);
    }
  }

  // Разошедшийся отпечаток — не общее свойство пачки: он виден в таблице.
  totals.fingerprint = prints.size === 1 ? [...prints][0] : undefined;
  return totals;
}

function addUp(acc: number | undefined, next: number | undefined) {
  return next === undefined ? acc : (acc ?? 0) + next;
}

function keepMax(acc: number | undefined, next: number | undefined) {
  return next === undefined ? acc : Math.max(acc ?? 0, next);
}

function serviceNames(rows: ServiceView[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (!names.includes(row.name)) {
      names.push(row.name);
    }
  }
  return names;
}

function crumbForExpanded(
  expanded: string[],
  stores: StoreView[],
  agents: (FleetMemberView & { workers: FleetMemberView[] })[],
  inspectors: InspectorView[],
  services: ServiceView[],
  t: Translate,
): string | undefined {
  const id = expanded[expanded.length - 1];
  if (id === undefined) {
    return undefined;
  }
  if (id.startsWith("store:")) {
    const uuid = id.slice("store:".length);
    return stores.find((row) => row.uuid === uuid) !== undefined
      ? t("fleetPage.storeSection")
      : undefined;
  }
  if (id.startsWith("inspector:")) {
    const name = id.slice("inspector:".length);
    return inspectors.some((row) => row.name === name) ? name : undefined;
  }
  if (id.startsWith("service:")) {
    const name = id.slice("service:".length);
    return services.some((row) => row.name === name)
      ? serviceName(name, t)
      : undefined;
  }
  if (id.startsWith("orphan:")) {
    return id.slice("orphan:".length);
  }
  const agent = agents.find((row) => row.uuid === id);
  return agent !== undefined ? t("fleetPage.agent") : undefined;
}

function serviceName(name: string, t: Translate): string {
  if (name === "logger" || name === "geo") {
    return t(`fleetPage.serviceName.${name}`);
  }
  return name;
}

function orphanNodeIds(rows: FleetMemberView[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.health.node_id;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

// Сборка процесса в подписи: « · v1.2.3»; у сборки без версии — ничего.
function build(version?: string): string {
  return version ? ` · ${version}` : "";
}

function seenAge(seenAt: string): string {
  return formatAge(Math.max(0, Date.now() - Date.parse(seenAt)));
}

function storeFillCaption(used: number, cap: number, units: number): string {
  const fill =
    cap > 0 ? `${formatBytes(used)} / ${formatBytes(cap)}` : formatBytes(used);
  return `${fill}  (${units})`;
}

export type { MetaItem };
