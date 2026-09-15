import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";

import {
  fetchAuditContent,
  frameAddr,
  fetchAuditEvent,
  type AuditContent,
  type AuditContentKind,
  type AuditContentPair,
  type AuditSearchEvent,
  type AuditStoreLocator,
} from "../api.ts";
import { formScrollSx } from "../components/Form.tsx";
import { TableIconButton } from "../components/data-table/TableIconButton.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import {
  Failed,
  Note,
  Waiting,
  bytes,
  reasonText,
  useRemote,
} from "./incident-shared.tsx";

export type PreviewQuery = {
  header: string;
  param: string;
  body: string;
};

export type SeekPreview = (kind: "header" | "param", name: string, value?: string) => void;

type Source = "preview" | "archive";

const VIEW_CHUNK = 32 * 1024;
const DOWNLOAD_CHUNK = 256 * 1024;
const DOWNLOAD_MAX = 8 * 1024 * 1024;
const VALUE_SPAN = 8192;
const VIEW_HEIGHT = 360;

const panelSx = {
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  bgcolor: "background.paper",
  minWidth: 0,
  minHeight: 320,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
} as const;

function scrollSx(theme: Theme) {
  return {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    width: "100%",
    maxHeight: { xs: VIEW_HEIGHT, md: "none" },
    ...formScrollSx(theme),
  };
}

const chipSx = {
  appearance: "none",
  border: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 0.6,
  height: 20,
  minHeight: 20,
  maxHeight: 20,
  boxSizing: "border-box",
  px: 0.75,
  py: 0,
  m: 0,
  borderRadius: 0.6,
  fontFamily: "inherit",
  fontWeight: 600,
  lineHeight: 1,
} as const;

export function PreviewPanel({
  row,
  onSeek,
  query,
}: {
  row: AuditSearchEvent;
  onSeek?: SeekPreview;
  query?: PreviewQuery;
}) {
  const t = useT();
  const [tab, setTab] = useState<AuditContentKind>("headers");
  const [source, setSource] = useState<Source>("preview");
  const phase = row.phase || "request";
  const frame = frameAddr(row);
  const event = useRemote<AuditSearchEvent>(
    `${row.node}\u0000${row.ray}\u0000${phase}\u0000${frame}`,
    () => fetchAuditEvent(row.node, row.ray, phase, frame),
  );

  const data = event.data ?? row;
  const store = data.store ?? row.store;
  const ws = phase === "frame" || phase === "session";
  const locator =
    tab === "headers" ? store?.headers : tab === "args" ? store?.args : store?.body;
  const archived = locatorAddressable(locator);

  useEffect(() => {
    if (phase === "response" && tab === "args") {
      setTab("headers");
    }

    if (ws && tab !== "body") {
      setTab("body");
    }
  }, [phase, tab, ws]);

  useEffect(() => {
    if (!archived && source === "archive") {
      setSource("preview");
    }
  }, [archived, source]);

  return (
    <Box sx={{ minWidth: 0, minHeight: 320, height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={panelSx}>
        <KindSwitch
          value={tab}
          onChange={setTab}
          source={source}
          onSource={setSource}
          archived={archived}
          locator={locator}
          kinds={ws ? ["body"] : phase === "response" ? ["headers", "body"] : ["headers", "args", "body"]}
          sizes={{
            headers: data.headers_size,
            args: data.args_size,
            body: data.frame?.size ?? data.body_size,
          }}
          onDownload={() => void downloadArchive(row.node, row.ray, phase, frame, tab)}
        />
        <Box
          sx={{
            px: 1.25,
            pt: 1,
            pb: 1.25,
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {source === "archive" ? (
            <ArchiveView node={row.node} ray={row.ray} phase={phase} frame={frame} kind={tab} />
          ) : tab === "headers" ? (
            <HeadersPreview
              loading={event.loading}
              error={event.error}
              pairs={data.headers_preview}
              truncated={data.headers_preview_truncated}
              dropped={data.headers_preview_dropped}
              emptyHint={
                data.headers_count > 0
                  ? t("incidentsPage.card.previewHeadersFiltered")
                  : t("incidentsPage.card.previewHeadersNone")
              }
              onSeek={onSeek}
              query={query?.header}
            />
          ) : tab === "args" ? (
            <ArgsPreview
              loading={event.loading}
              error={event.error}
              pairs={data.args_preview}
              truncated={data.args_preview_truncated}
              dropped={data.args_preview_dropped}
              emptyHint={
                data.args_size > 0
                  ? t("incidentsPage.card.previewArgsFiltered")
                  : t("incidentsPage.card.previewArgsNone")
              }
              onSeek={onSeek}
              query={query?.param}
            />
          ) : phase === "session" ? (
            <Note text={t("incidentsPage.card.previewSessionNone")} />
          ) : (
            <BodyPreview
              loading={event.loading}
              error={event.error}
              text={
                phase === "frame"
                  ? data.body_preview || data.frame?.payload_preview
                  : data.body_preview
              }
              sourceSent={data.body_preview_source === "sent"}
              query={query?.body}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

function HeadersPreview({
  loading,
  error,
  pairs,
  truncated,
  dropped,
  emptyHint,
  onSeek,
  query,
}: {
  loading: boolean;
  error: string | null;
  pairs: Record<string, string> | undefined;
  truncated: string[] | undefined;
  dropped: number | undefined;
  emptyHint: string;
  onSeek?: SeekPreview;
  query?: string;
}) {
  const t = useT();
  const entries = !loading && pairs !== undefined ? Object.entries(pairs) : undefined;
  const cut = new Set((truncated ?? []).map((name) => name.toLowerCase()));

  return (
    <Box sx={scrollSx}>
      {loading ? (
        <Waiting />
      ) : error !== null ? (
        <Failed message={error} />
      ) : entries === undefined ? (
        <Note text={t("incidentsPage.card.previewOff")} />
      ) : entries.length === 0 ? (
        <Note text={emptyHint} />
      ) : (
        <PreviewPairs
          entries={entries}
          cut={cut}
          seekKind="header"
          onSeek={onSeek}
          query={query}
        />
      )}
      {dropped !== undefined && dropped > 0 && (
        <Note text={t("incidentsPage.card.previewDropped", { count: String(dropped) })} />
      )}
    </Box>
  );
}

function ArgsPreview({
  loading,
  error,
  pairs,
  truncated,
  dropped,
  emptyHint,
  onSeek,
  query,
}: {
  loading: boolean;
  error: string | null;
  pairs: Record<string, string> | undefined;
  truncated: string[] | undefined;
  dropped: number | undefined;
  emptyHint: string;
  onSeek?: SeekPreview;
  query?: string;
}) {
  const t = useT();
  const entries = !loading && pairs !== undefined ? Object.entries(pairs) : undefined;
  const cut = new Set(truncated ?? []);

  return (
    <Box sx={scrollSx}>
      {loading ? (
        <Waiting />
      ) : error !== null ? (
        <Failed message={error} />
      ) : entries === undefined ? (
        <Note text={t("incidentsPage.card.previewOff")} />
      ) : entries.length === 0 ? (
        <Note text={emptyHint} />
      ) : (
        <PreviewPairs
          entries={entries}
          cut={cut}
          seekKind="param"
          onSeek={onSeek}
          query={query}
        />
      )}
      {dropped !== undefined && dropped > 0 && (
        <Note text={t("incidentsPage.card.previewDropped", { count: String(dropped) })} />
      )}
    </Box>
  );
}

function BodyPreview({
  loading,
  error,
  text,
  sourceSent,
  query,
}: {
  loading: boolean;
  error: string | null;
  text: string | undefined;
  sourceSent?: boolean;
  query?: string;
}) {
  const t = useT();
  const empty = !loading && (text === undefined || text === "");

  if (loading) {
    return <Waiting />;
  }

  if (error !== null) {
    return <Failed message={error} />;
  }

  if (empty) {
    return <Note text={t("incidentsPage.card.previewBodyNone")} />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {sourceSent === true && (
        <Box
          sx={{
            mb: 0.75,
            fontSize: 11,
            color: "warning.main",
          }}
        >
          {t("incidentsPage.card.previewSent")}
        </Box>
      )}
      <Box
        component="pre"
        sx={[
          scrollSx,
          {
            m: 0,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "monospace",
          },
        ]}
      >
        {highlightBody(text ?? "", query)}
      </Box>
    </Box>
  );
}

function ArchiveView({
  node,
  ray,
  phase,
  frame,
  kind,
}: {
  node: string;
  ray: string;
  phase: string;
  frame: string;
  kind: AuditContentKind;
}) {
  const t = useT();
  const archive = useArchiveWindow(node, ray, phase, frame, kind);
  const scroller = useRef<HTMLDivElement>(null);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 64) {
      archive.loadMore();
    }
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el === null || archive.done || archive.loading || archive.error !== null) {
      return;
    }
    if (el.scrollHeight <= el.clientHeight + 8) {
      archive.loadMore();
    }
  }, [archive.done, archive.loading, archive.error, archive.offset, archive.loadMore]);

  if (archive.loading && archive.offset === 0) {
    return <Waiting />;
  }

  if (archive.error !== null && archive.offset === 0) {
    return <Failed message={archive.error} />;
  }

  if (!archive.available && archive.reason !== undefined) {
    const rest = [
      archive.size > 0 ? bytes(archive.size) : undefined,
      archive.sha256,
    ].filter((item): item is string => item !== undefined && item !== "");

    return (
      <Note
        severity="warning"
        text={[reasonText(t, archive.reason), ...rest].join(" · ")}
      />
    );
  }

  if (!archive.available) {
    return <Note text={t("incidentsPage.card.noContent")} />;
  }

  const text = archivePlainText(kind, archive);
  const empty = text === "" && archive.done;

  return (
    <Box ref={scroller} onScroll={onScroll} sx={scrollSx}>
      {kind === "body" && archive.binary && <Note text={t("incidentsPage.card.binary")} />}
      {empty ? (
        <Note text={t("incidentsPage.card.emptyContent")} />
      ) : (
        <ArchivePlain text={text} />
      )}
      {archive.loading && <Waiting />}
      {archive.error !== null && archive.offset > 0 && <Failed message={archive.error} />}
    </Box>
  );
}

function archivePlainText(kind: AuditContentKind, archive: ArchiveWindow): string {
  if (kind === "headers") {
    return archive.pairs
      .map(([name, value]) => (value === "" ? name : `${name}  ${value}`))
      .join("\n");
  }

  if (kind === "args") {
    if (archive.raw !== "") {
      return archive.raw;
    }

    return archive.pairs.map(([name, value]) => `${name}=${value}`).join("&");
  }

  return archive.texts.join("");
}

function ArchivePlain({ text }: { text: string }) {
  if (text === "") {
    return null;
  }

  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        fontFamily: "monospace",
        fontSize: (theme) => theme.typography.caption.fontSize,
        lineHeight: (theme) => theme.typography.caption.lineHeight,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        wordBreak: "break-all",
      }}
    >
      {chunkedText(text)}
    </Box>
  );
}

type ArchiveWindow = {
  pairs: [string, string][];
  raw: string;
  texts: string[];
  binary: boolean;
  size: number;
  sha256?: string;
  offset: number;
  done: boolean;
  loading: boolean;
  error: string | null;
  available: boolean;
  reason?: string;
  loadMore: () => void;
};

function emptyWindow(): Omit<ArchiveWindow, "loadMore"> {
  return {
    pairs: [],
    raw: "",
    texts: [],
    binary: false,
    size: 0,
    offset: 0,
    done: false,
    loading: false,
    error: null,
    available: true,
  };
}

function useArchiveWindow(
  node: string,
  ray: string,
  phase: string,
  frame: string,
  kind: AuditContentKind,
): ArchiveWindow {
  const t = useT();
  const [state, setState] = useState<Omit<ArchiveWindow, "loadMore">>(emptyWindow);
  const offsetRef = useRef(0);
  const doneRef = useRef(false);
  const loadingRef = useRef(false);
  const genRef = useRef(0);

  const pull = useCallback(
    async (gen: number, offset: number, replace: boolean) => {
      if (loadingRef.current && !replace) {
        return;
      }

      loadingRef.current = true;
      setState((cur) => ({ ...cur, loading: true, error: null }));

      try {
        const row = await fetchAuditContent(
          node,
          ray,
          kind,
          { offset, limit: VIEW_CHUNK },
          phase,
          frame,
        );
        if (gen !== genRef.current) {
          return;
        }

        const nextOffset = offset + row.returned;
        const done =
          !row.available ||
          !row.clipped ||
          row.returned === 0 ||
          (row.size > 0 && nextOffset >= row.size);

        offsetRef.current = nextOffset;
        doneRef.current = done;
        setState((cur) => mergeWindow(replace ? emptyWindow() : cur, row, kind, done));
      } catch (err: unknown) {
        if (gen !== genRef.current) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        doneRef.current = true;
        setState((cur) => ({
          ...cur,
          loading: false,
          error: msg === "search_unreachable" ? t("incidentsPage.unreachable") : msg,
        }));
      } finally {
        if (gen === genRef.current) {
          loadingRef.current = false;
        }
      }
    },
    [kind, node, ray, phase, frame, t],
  );

  useEffect(() => {
    const gen = ++genRef.current;
    offsetRef.current = 0;
    doneRef.current = false;
    loadingRef.current = false;
    setState({ ...emptyWindow(), loading: true });
    void pull(gen, 0, true);

    return () => {
      genRef.current += 1;
    };
  }, [node, ray, phase, frame, kind, pull]);

  const loadMore = useCallback(() => {
    if (doneRef.current || loadingRef.current) {
      return;
    }
    void pull(genRef.current, offsetRef.current, false);
  }, [pull]);

  return { ...state, loadMore };
}

function mergeWindow(
  cur: Omit<ArchiveWindow, "loadMore">,
  row: AuditContent,
  kind: AuditContentKind,
  done: boolean,
): Omit<ArchiveWindow, "loadMore"> {
  const next: Omit<ArchiveWindow, "loadMore"> = {
    ...cur,
    loading: false,
    error: null,
    available: row.available,
    reason: row.reason,
    size: row.size,
    sha256: row.sha256,
    offset: (row.offset ?? cur.offset) + row.returned,
    done,
  };

  if (!row.available) {
    return next;
  }

  if (row.continuation === true && row.text !== undefined && row.text !== "") {
    if (next.pairs.length === 0) {
      next.pairs = [["", row.text]];
    } else {
      const last = next.pairs[next.pairs.length - 1];
      if (last === undefined) {
        next.pairs = [["", row.text]];
      } else {
        next.pairs = [...next.pairs.slice(0, -1), [last[0], last[1] + row.text]];
      }
    }
  }

  if (kind === "headers" && row.headers !== undefined) {
    next.pairs = [
      ...next.pairs,
      ...row.headers.map((pair): [string, string] => [pair.name, pair.value]),
    ];
  }

  if (kind === "args") {
    if (row.raw !== undefined && row.raw !== "") {
      next.raw += row.raw;
    }
    if (row.params !== undefined) {
      next.pairs = [
        ...next.pairs,
        ...row.params.map((pair): [string, string] => [pair.name, pair.value]),
      ];
    }
  }

  if (kind === "body") {
    if (row.binary === true) {
      next.binary = true;
      next.texts = [...next.texts, row.base64 ?? ""];
    } else {
      next.texts = [...next.texts, row.text ?? ""];
    }
  }

  return next;
}

function KindSwitch({
  value,
  onChange,
  source,
  onSource,
  sizes,
  archived,
  locator,
  kinds,
  onDownload,
}: {
  value: AuditContentKind;
  onChange: (next: AuditContentKind) => void;
  source: Source;
  onSource: (next: Source) => void;
  sizes: { headers: number; args: number; body: number };
  archived: boolean;
  locator: AuditStoreLocator | undefined;
  kinds: AuditContentKind[];
  onDownload: () => void;
}) {
  const t = useT();
  const all: { kind: AuditContentKind; label: string; size: number }[] = [
    { kind: "headers", label: t("incidentsPage.card.headers"), size: sizes.headers },
    { kind: "args", label: t("incidentsPage.card.args"), size: sizes.args },
    { kind: "body", label: t("incidentsPage.card.body"), size: sizes.body },
  ];
  const items = all.filter((item) => kinds.includes(item.kind));
  const sources: { id: Source; label: string; disabled: boolean }[] = [
    { id: "preview", label: t("incidentsPage.card.sourcePreview"), disabled: false },
    { id: "archive", label: t("incidentsPage.card.sourceArchive"), disabled: !archived },
  ];
  const archiveHint = archiveCaption(t, locator);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        width: "100%",
        minWidth: 0,
        px: 1.25,
        py: 0,
        height: 36,
        minHeight: 36,
        boxSizing: "border-box",
        gap: 1,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: (theme) =>
          theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.35, minWidth: 0 }}>
        {items.map((item) => {
          const active = value === item.kind;

          return (
            <Box
              key={item.kind}
              component="button"
              type="button"
              aria-pressed={active}
              onClick={() => onChange(item.kind)}
              sx={{
                ...chipSx,
                cursor: "pointer",
                bgcolor: (theme) => (active ? theme.palette.action.selected : "transparent"),
                color: active ? "primary.main" : "text.secondary",
                "&:hover": { color: active ? "primary.main" : "text.primary" },
              }}
            >
              <Typography
                component="span"
                variant="subtitle2"
                sx={{ fontSize: "0.72rem", fontWeight: 600, lineHeight: 1, color: "inherit" }}
              >
                {item.label}
              </Typography>
              <Typography
                component="span"
                variant="caption"
                sx={{ fontFamily: "monospace", fontSize: "0.7rem", lineHeight: 1, color: "text.secondary" }}
              >
                {bytes(item.size)}
              </Typography>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.35, flexShrink: 0 }}>
        {sources.map((item) => {
          const active = source === item.id;
          const button = (
            <Box
              key={item.id}
              component="button"
              type="button"
              disabled={item.disabled}
              aria-pressed={active}
              onClick={() => onSource(item.id)}
              sx={{
                ...chipSx,
                cursor: item.disabled ? "default" : "pointer",
                opacity: item.disabled ? 0.38 : 1,
                bgcolor: (theme) => (active ? theme.palette.action.selected : "transparent"),
                color: active ? "primary.main" : "text.secondary",
                "&:hover": item.disabled
                  ? undefined
                  : { color: active ? "primary.main" : "text.primary" },
              }}
            >
              <Typography
                component="span"
                variant="subtitle2"
                sx={{ fontSize: "0.72rem", fontWeight: 600, lineHeight: 1, color: "inherit" }}
              >
                {item.label}
              </Typography>
            </Box>
          );

          if (item.id !== "archive") {
            return button;
          }

          return (
            <Tooltip key={item.id} title={archiveHint}>
              <Box component="span" sx={{ display: "inline-flex" }}>
                {button}
              </Box>
            </Tooltip>
          );
        })}
        <TableIconButton
          icon={<FileDownloadOutlinedIcon />}
          tooltip={t("common.download")}
          disabled={!archived}
          onClick={onDownload}
        />
      </Box>
    </Box>
  );
}

function PreviewPairs({
  entries,
  cut,
  seekKind,
  onSeek,
  query,
}: {
  entries: [string, string][];
  cut: Set<string>;
  seekKind: "header" | "param";
  onSeek?: SeekPreview;
  query?: string;
}) {
  const t = useT();
  const match = parsePreviewQuery(query);

  if (entries.length === 0) {
    return <Note text={t("incidentsPage.card.emptyContent")} />;
  }

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "1px", minWidth: 0 }}>
      {entries.map(([name, value], i) => {
        const trimmed = cut.has(seekKind === "header" ? name.toLowerCase() : name);
        const hit =
          match !== null &&
          (seekKind === "header"
            ? name.toLowerCase() === match.name.toLowerCase()
            : name === match.name) &&
          (match.value === undefined || match.value === value);

        return (
          <Box
            key={`${name}\u0000${String(i)}`}
            onClick={
              onSeek !== undefined
                ? () => onSeek(seekKind, name, trimmed ? undefined : value)
                : undefined
            }
            title={onSeek !== undefined ? t("incidentsPage.card.seekHint") : undefined}
            sx={{
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr)",
              columnGap: "12px",
              minWidth: 0,
              borderRadius: "2px",
              px: 0.5,
              mx: -0.5,
              cursor: onSeek !== undefined ? "pointer" : "default",
              bgcolor: hit ? "action.selected" : "transparent",
              "&:hover": onSeek !== undefined ? { bgcolor: "action.hover" } : undefined,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: "monospace", whiteSpace: "nowrap", fontWeight: hit ? 700 : 400 }}
            >
              {name}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontFamily: "monospace",
                minWidth: 0,
                overflowWrap: "anywhere",
                wordBreak: "break-all",
                fontWeight: hit ? 700 : 400,
              }}
              title={trimmed ? t("incidentsPage.card.previewPairTruncated") : undefined}
            >
              {chunkedText(value)}
              {trimmed && (
                <Box component="span" sx={{ color: "text.secondary" }}>
                  {" …"}
                </Box>
              )}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function chunkedText(text: string): ReactNode {
  if (text.length <= VALUE_SPAN) {
    return text;
  }

  const parts: ReactNode[] = [];
  for (let i = 0; i < text.length; i += VALUE_SPAN) {
    parts.push(
      <Box
        key={i}
        component="span"
        sx={{ display: "inline", contentVisibility: "auto" }}
      >
        {text.slice(i, i + VALUE_SPAN)}
      </Box>,
    );
  }

  return parts;
}

function parsePreviewQuery(query: string | undefined): { name: string; value?: string } | null {
  if (query === undefined || query.trim() === "") {
    return null;
  }

  const idx = query.indexOf("=");
  if (idx === -1) {
    return { name: query };
  }

  return { name: query.slice(0, idx), value: query.slice(idx + 1) };
}

function highlightBody(text: string, query: string | undefined): ReactNode {
  if (query === undefined || query.trim() === "") {
    return text;
  }

  const needle = query.toLowerCase();
  const hay = text.toLowerCase();
  let idx = hay.indexOf(needle);

  if (idx === -1) {
    return text;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  while (idx !== -1) {
    parts.push(text.slice(cursor, idx));
    parts.push(
      <Box
        key={idx}
        component="mark"
        sx={{
          bgcolor: "warning.main",
          color: "warning.contrastText",
          borderRadius: "2px",
          px: "1px",
        }}
      >
        {text.slice(idx, idx + needle.length)}
      </Box>,
    );
    cursor = idx + needle.length;
    idx = hay.indexOf(needle, cursor);
  }

  parts.push(text.slice(cursor));
  return parts;
}

function locatorAddressable(loc: AuditStoreLocator | undefined): boolean {
  if (loc === undefined) {
    return false;
  }
  if (loc.unavailable !== undefined && loc.unavailable !== "") {
    return false;
  }

  return loc.store !== undefined && loc.driver !== undefined && loc.key !== undefined;
}

function archiveCaption(t: Translate, loc: AuditStoreLocator | undefined): string {
  if (loc === undefined) {
    return t("incidentsPage.card.archiveStatus.none");
  }

  if (loc.unavailable !== undefined && loc.unavailable !== "") {
    return reasonText(t, loc.unavailable);
  }

  const until =
    loc.expires_at !== undefined && loc.expires_at > 0 ? formatUnix(loc.expires_at) : undefined;
  const empty = loc.size <= 0;

  if (locatorAddressable(loc)) {
    if (empty && until !== undefined) {
      return t("incidentsPage.card.archiveStatus.emptyUntil", { date: until });
    }
    if (empty) {
      return t("incidentsPage.card.archiveStatus.empty");
    }
    if (until !== undefined) {
      return t("incidentsPage.card.archiveStatus.savedUntil", { date: until });
    }
    return t("incidentsPage.card.archiveStatus.saved");
  }

  if (empty) {
    return t("incidentsPage.card.archiveStatus.none");
  }

  return t("incidentsPage.card.archiveStatus.released");
}

function formatUnix(sec: number): string {
  return new Date(sec * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function downloadArchive(
  node: string,
  ray: string,
  phase: string,
  frame: string,
  kind: AuditContentKind,
): Promise<void> {
  try {
    const pieces: AuditContent[] = [];
    let offset = 0;

    for (;;) {
      const row = await fetchAuditContent(
        node,
        ray,
        kind,
        { offset, limit: DOWNLOAD_CHUNK },
        phase,
        frame,
      );
      pieces.push(row);
      if (!row.available || row.returned === 0) {
        break;
      }
      offset += row.returned;
      if (!row.clipped || (row.size > 0 && offset >= row.size) || offset >= DOWNLOAD_MAX) {
        break;
      }
    }

    const first = pieces[0];
    if (first === undefined || !first.available) {
      return;
    }

    const body = downloadBody(kind, pieces);
    const name = `${ray}.${kind}${first.binary === true ? ".bin" : ".txt"}`;
    const blob = new Blob([body], {
      type: first.binary === true ? "application/octet-stream" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
  }
}

function downloadBody(kind: AuditContentKind, pieces: AuditContent[]): BlobPart {
  if (kind === "headers") {
    const pairs: AuditContentPair[] = [];
    for (const row of pieces) {
      if (row.continuation === true && row.text !== undefined && pairs.length > 0) {
        const last = pairs[pairs.length - 1];
        if (last !== undefined) {
          last.value += row.text;
        }
      }
      if (row.headers !== undefined) {
        pairs.push(...row.headers.map((pair) => ({ name: pair.name, value: pair.value })));
      }
    }
    return pairs.map((pair) => `${pair.name}: ${pair.value}`).join("\n");
  }

  if (kind === "args") {
    return pieces.map((row) => row.raw ?? "").join("");
  }

  const binary = pieces.some((row) => row.binary === true);
  if (binary) {
    const chunks = pieces.map((row) => {
      if (row.binary === true && row.base64 !== undefined) {
        const bin = atob(row.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        return bytes;
      }
      return new TextEncoder().encode(row.text ?? "");
    });
    const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }

  return pieces.map((row) => row.text ?? "").join("");
}
