/*
  «Конфигурация → Агент»: настройки процесса, который возит объекты в архив.

  Это отдельный документ, а не часть конфигурации nginx, и отдельная страница
  именно поэтому: у него своя кнопка «сохранить» и своя «отправить». Поколение
  nginx уезжает через `nginx -t` и reload, здесь нет ни того, ни другого --
  агент перечитывает настройку на лету и трафика не касается.

  На странице только то, что одинаково у всех нод контура. Бутстрап агента
  (адрес шины, контроллер, ключ ноды, сокет вердиктов) сюда не попадает: им
  агент дотягивается до самой шины, и доставить их шиной нельзя по кругу
  зависимостей. Реквизиты S3 -- секрет ноды: контроллер называет хранилище,
  но не открывает его.
*/
import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { Duration, Num, Text } from "../components/fields.tsx";
import {
  dataCellSx,
  dataHeadSx,
  SectionBleed,
  SettingsGroup,
  SettingsTable,
} from "../components/settings-table.tsx";
import { editorChipSx } from "../config/editor-kit.tsx";
import ChannelNotice from "../components/ChannelNotice.tsx";
import { useChannel } from "../convergence.tsx";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppSelector } from "../store/hooks.ts";
import { shortHash } from "../fleet.ts";
import {
  fetchAgentDesired,
  fetchAgentSettings,
  saveAgentSettings,
  sendAgentSettings,
  type AgentArchiveKind,
  type AgentConfDesired,
  type AgentSettingsWire,
} from "../api.ts";
import {
  LayerBar,
  LayerCard,
  LayerTabs,
  useLayerTab,
  type LayerItem,
} from "../config/layer-tabs.tsx";
import { MS_PRESETS } from "./config-fields.tsx";

const KINDS: readonly AgentArchiveKind[] = ["headers", "args", "body"];

/** Стенд и типовые развёртывания: с них начинают, дальше правят руками. */
const ENDPOINTS = ["http://minio:9000", "https://s3.amazonaws.com"];
const REGIONS = ["us-east-1", "eu-central-1", "ru-central1"];
const BUCKETS: Record<AgentArchiveKind, readonly string[]> = {
  headers: ["waf-headers", "waf-archive"],
  args: ["waf-args", "waf-archive"],
  body: ["waf-bodies", "waf-archive"],
};

/**
 * Разделы страницы -- вкладки, как на http и общей: на экране одна таблица, а
 * что в ней -- видно по ряду сверху. Лентой аккордеонов ноды уезжали под две
 * раскрытые формы.
 */
const AGENT_TABS = ["archive", "pace", "nodes"] as const;

type AgentTab = (typeof AGENT_TABS)[number];

const TAB_KEY = "waf.config.agent.tab";

// Метрика строки данных -- общая, см. settings-table.tsx.
const cellSx = dataCellSx;
const headSx = dataHeadSx;
const stateCellSx = { ...dataCellSx, textAlign: "right" } as const;

function same(a: AgentSettingsWire, b: AgentSettingsWire): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Пустые ветки убираются: `{s3:{}}` и «ничего не задано» -- одно и то же. */
function prune(input: AgentSettingsWire): AgentSettingsWire {
  const out: AgentSettingsWire = {};

  const s3: NonNullable<AgentSettingsWire["s3"]> = {};
  if (input.s3?.endpoint) s3.endpoint = input.s3.endpoint;
  if (input.s3?.region) s3.region = input.s3.region;
  const buckets: Partial<Record<AgentArchiveKind, string>> = {};
  for (const kind of KINDS) {
    const name = input.s3?.buckets?.[kind];
    if (name !== undefined && name !== "") buckets[kind] = name;
  }
  if (Object.keys(buckets).length > 0) s3.buckets = buckets;
  if (Object.keys(s3).length > 0) out.s3 = s3;

  const archive: NonNullable<AgentSettingsWire["archive"]> = {};
  if (input.archive?.workers !== undefined) archive.workers = input.archive.workers;
  if (input.archive?.queue !== undefined) archive.queue = input.archive.queue;
  if (input.archive?.timeout_ms !== undefined) {
    archive.timeout_ms = input.archive.timeout_ms;
  }
  const batch: NonNullable<NonNullable<AgentSettingsWire["archive"]>["batch"]> = {};
  for (const kind of KINDS) {
    const row = input.archive?.batch?.[kind];
    if (row === undefined) continue;
    const next: { size?: number; timeout_ms?: number } = {};
    if (row.size !== undefined) next.size = row.size;
    if (row.timeout_ms !== undefined) next.timeout_ms = row.timeout_ms;
    if (Object.keys(next).length > 0) batch[kind] = next;
  }
  if (Object.keys(batch).length > 0) archive.batch = batch;
  if (Object.keys(archive).length > 0) out.archive = archive;

  return out;
}

function numText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseNum(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export default function ConfigAgent() {
  const t = useT();
  const scope = useAppSelector((s) => s.session.scope);
  const agents = useAppSelector((s) => s.fleet.snapshot?.agents);
  const [saved, setSaved] = useState<AgentSettingsWire | null>(null);
  const [draft, setDraft] = useState<AgentSettingsWire | null>(null);
  const [desired, setDesired] = useState<AgentConfDesired | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useLayerTab<AgentTab>(TAB_KEY, AGENT_TABS);

  const reload = useCallback(async () => {
    if (scope === null) {
      return;
    }
    try {
      const [doc, pointer] = await Promise.all([
        fetchAgentSettings(scope),
        fetchAgentDesired(scope).catch(() => ({ rev: null, sha256: null })),
      ]);
      setSaved(doc.settings);
      setDraft(doc.settings);
      setDesired(pointer);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = useMemo(
    () => saved !== null && draft !== null && !same(prune(draft), saved),
    [saved, draft],
  );

  // Канал агента в общем механизме: состояние, причина и право нажать
  // приходят от контроллера, страница их не пересчитывает.
  const channel = useChannel("agent");

  const save = async () => {
    if (scope === null || draft === null) {
      return;
    }
    setBusy(true);
    try {
      const doc = await saveAgentSettings(scope, prune(draft));
      setSaved(doc.settings);
      setDraft(doc.settings);
      setError(null);
      channel.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (scope === null) {
      return;
    }
    setBusy(true);
    try {
      setDesired(await sendAgentSettings(scope));
      setError(null);
      channel.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  usePageBar({
    meta:
      desired?.rev == null
        ? undefined
        : t("agent.sent", {
            rev: desired.rev,
            hash: shortHash(desired.sha256 ?? ""),
          }),
    onSave: scope === null || draft === null ? undefined : () => void save(),
    onReset:
      saved === null ? undefined : () => setDraft(saved),
    onSend: scope === null ? undefined : () => void send(),
    saveDisabled: draft === null || !dirty || busy,
    resetDisabled: saved === null || !dirty || busy,
    sendDisabled: scope === null || busy,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  if (draft === null) {
    return <Typography color="text.secondary">{t("config.loading")}</Typography>;
  }

  const setS3 = (patch: Partial<NonNullable<AgentSettingsWire["s3"]>>) =>
    setDraft({ ...draft, s3: { ...draft.s3, ...patch } });
  const setBucket = (kind: AgentArchiveKind, value: string) =>
    setS3({ buckets: { ...draft.s3?.buckets, [kind]: value } });
  const setArchive = (patch: Partial<NonNullable<AgentSettingsWire["archive"]>>) =>
    setDraft({ ...draft, archive: { ...draft.archive, ...patch } });
  const setBatch = (
    kind: AgentArchiveKind,
    patch: { size?: number; timeout_ms?: number },
  ) =>
    setArchive({
      batch: {
        ...draft.archive?.batch,
        [kind]: { ...draft.archive?.batch?.[kind], ...patch },
      },
    });

  const field = (key: string) => t(`agent.field.${key}`);
  const help = (key: string) => t(`agent.help.${key}`);

  const items: LayerItem<AgentTab>[] = AGENT_TABS.map((id) => ({
    id,
    label: t(`agent.section.${id}`),
    hint: t(`agent.section.${id}Hint`),
  }));
  const item = items.find((row) => row.id === tab);

  return (
    <Stack spacing={2}>
      {error !== null && <Alert severity="error">{error}</Alert>}

      <Alert severity="info">{t("agent.scopeHint")}</Alert>

      <ChannelNotice id="agent" />

      {/*
        Первый ряд -- раздел страницы. Второго слоя тут нет: групп внутри
        раздела по одной-две, и они остаются подзаголовками строк.
      */}
      <LayerBar>
        <LayerTabs items={items} value={tab} onChange={setTab} />

      <LayerCard flush title={item?.label ?? ""} hint={item?.hint}>
        {tab === "nodes" ? (
          /* Ноды -- таблица данных: сюда смотрят, а не правят. */
          <SectionBleed scroll>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>{t("agent.nodes.node")}</TableCell>
                <TableCell sx={headSx} width={90}>
                  {t("agent.nodes.rev")}
                </TableCell>
                <TableCell sx={headSx} width={140}>
                  {t("agent.nodes.hash")}
                </TableCell>
                <TableCell sx={{ ...headSx, textAlign: "right" }} width={150}>
                  {t("agent.nodes.state")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(agents ?? []).map((row) => {
                const conf = row.agent_conf;
                const state =
                  conf === undefined
                    ? "none"
                    : conf.apply === "apply_failed"
                      ? "failed"
                      : desired?.rev != null && conf.rev !== desired.rev
                        ? "stale"
                        : "ok";
                return (
                  <TableRow key={row.uuid} hover>
                    <TableCell sx={cellSx}>{row.health.node_id}</TableCell>
                    <TableCell sx={cellSx}>{conf?.rev ?? "—"}</TableCell>
                    <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>
                      {conf === undefined ? "—" : shortHash(conf.sha256)}
                    </TableCell>
                    <TableCell sx={stateCellSx}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={
                          state === "failed"
                            ? "error"
                            : state === "stale"
                              ? "warning"
                              : "default"
                        }
                        label={t(`agent.nodes.${state}`)}
                        sx={editorChipSx}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {(agents ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ ...cellSx, color: "text.secondary" }}>
                    {t("agent.nodes.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </SectionBleed>
        ) : (
          <SettingsTable>
            {tab === "archive" ? (
              <>
          <SettingsGroup title={t("agent.group.s3")} hint={t("agent.group.s3Hint")}>
            <Text
              optional
              label={field("endpoint")}
              helper={help("endpoint")}
              presets={ENDPOINTS}
              mono
              value={draft.s3?.endpoint ?? ""}
              placeholder="http://minio:9000"
              onChange={(v) => setS3({ endpoint: v })}
            />
            <Text
              optional
              fallback="us-east-1"
              presets={REGIONS}
              label={field("region")}
              helper={help("region")}
              value={draft.s3?.region ?? ""}
              placeholder="us-east-1"
              onChange={(v) => setS3({ region: v })}
            />
            {KINDS.map((kind) => (
              <Text
                key={kind}
                optional
                presets={BUCKETS[kind]}
                mono
                label={`${field("bucket")} ${kind}`}
                helper={help(`bucket_${kind}`)}
                value={draft.s3?.buckets?.[kind] ?? ""}
                placeholder={`waf-${kind === "body" ? "bodies" : kind}`}
                onChange={(v) => setBucket(kind, v)}
              />
            ))}
          </SettingsGroup>
              </>
            ) : (
              <>
          <SettingsGroup title={t("agent.group.pool")} hint={t("agent.group.poolHint")}>
            <Num
              optional
              fallback={4}
              presets={[2, 4, 8, 16]}
              label={field("workers")}
              helper={help("workers")}
              value={numText(draft.archive?.workers)}
              onChange={(v) => setArchive({ workers: parseNum(v) })}
            />
            <Num
              optional
              fallback={1024}
              presets={[256, 1024, 4096]}
              label={field("queue")}
              helper={help("queue")}
              value={numText(draft.archive?.queue)}
              onChange={(v) => setArchive({ queue: parseNum(v) })}
            />
            <Duration
              optional
              base="ms"
              fallback={5000}
              presets={MS_PRESETS.timeout}
              label={field("timeout")}
              helper={help("timeout")}
              value={draft.archive?.timeout_ms}
              onChange={(v) => setArchive({ timeout_ms: v })}
            />
          </SettingsGroup>
          {/*
            Корзина на вид: сколько объектов копить и сколько ждать. Две строки
            на вид, а не таблица в ячейке: таблица в таблицу не вкладывается.
          */}
          <SettingsGroup title={t("agent.group.batch")} hint={t("agent.group.batchHint")}>
            {KINDS.map((kind) => (
              <Num
                key={`${kind}-size`}
                optional
                presets={[10, 50, 100, 500]}
                label={`${field("batch")} ${kind} size`}
                helper={help("batch")}
                value={numText(draft.archive?.batch?.[kind]?.size)}
                onChange={(v) => setBatch(kind, { size: parseNum(v) })}
              />
            ))}
            {KINDS.map((kind) => (
              <Duration
                key={`${kind}-timeout`}
                optional
                base="ms"
                presets={MS_PRESETS.short}
                label={`${field("batch")} ${kind} timeout`}
                helper={help("batch")}
                value={draft.archive?.batch?.[kind]?.timeout_ms}
                onChange={(v) => setBatch(kind, { timeout_ms: v })}
              />
            ))}
          </SettingsGroup>
              </>
            )}
          </SettingsTable>
        )}
      </LayerCard>
      </LayerBar>
    </Stack>
  );
}
