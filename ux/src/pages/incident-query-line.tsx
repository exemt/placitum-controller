import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Popover from "@mui/material/Popover";
import Portal from "@mui/material/Portal";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, type Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import HistoryIcon from "@mui/icons-material/History";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import SearchIcon from "@mui/icons-material/Search";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";

import { PAGE_RAIL, TABLE_RAIL } from "../components/PageBar.tsx";
import { scrollbarSx } from "../components/scrollbar.ts";
import { useT, type Translate } from "../i18n/index.ts";
import {
  QUERY_FIELDS,
  fieldOps,
  formatQuery,
  formatState,
  parseQuery,
  pushRecentQuery,
  quoteValue,
  readRecentQueries,
  readSavedQueries,
  resolveQuery,
  segments,
  suggestContext,
  writeSavedQueries,
  type QueryCtx,
  type QueryError,
  type QueryState,
  type SavedQuery,
  type Segment,
  type SuggestContext,
  type Suggestion,
} from "./incident-query.ts";

const LINE_H = 32;
const FONT_SIZE = "0.8rem";
const TOP_FIELDS: readonly string[] = [
  "ip",
  "host",
  "uri",
  "status",
  "user",
  "marker",
  "country",
  "asn",
];
const LIKE_FIELDS: readonly string[] = ["uri", "body"];
const EXAMPLES = [
  "time = 1h and verdict = deny",
  'status = 403 and uri ~ "/api"',
  "ip in [203.0.113.0/24, 198.51.100.7]",
  "header.user-agent = curl and method = POST",
] as const;

const textSx = {
  fontFamily: "monospace",
  fontSize: FONT_SIZE,
  lineHeight: `${LINE_H - 2}px`,
  letterSpacing: 0,
  fontKerning: "none",
  fontVariantLigatures: "none",
  whiteSpace: "pre",
} as const;

function segmentColor(seg: Segment, theme: Theme): string {
  if (seg.role === "field") {
    return theme.palette.secondary.main;
  }
  if (seg.role === "value") {
    if (seg.field === "verdict") {
      const value = seg.text.toLowerCase();
      if (value === "deny") {
        return theme.palette.error.main;
      }
      if (value === "allow") {
        return theme.palette.success.main;
      }
      if (value === "redirect") {
        return theme.palette.warning.main;
      }
    }
    return theme.palette.text.primary;
  }
  if (seg.role === "bad") {
    return theme.palette.error.main;
  }
  return theme.palette.text.disabled;
}

function QueryText({ text, ctx }: { text: string; ctx: QueryCtx }) {
  const parts = useMemo(() => {
    const parsed = parseQuery(text);
    return segments(text, parsed, resolveQuery(parsed, ctx).errors);
  }, [text, ctx]);
  return (
    <>
      {parts.map((seg, i) => (
        <Box key={i} component="span" sx={{ color: (theme: Theme) => segmentColor(seg, theme) }}>
          {seg.text}
        </Box>
      ))}
    </>
  );
}

function buildItems(
  sc: SuggestContext,
  t: Translate,
  values: (field: string) => readonly Suggestion[] | null,
  top: readonly Suggestion[],
): Suggestion[] {
  const prefix = sc.prefix.toLowerCase();

  if (sc.stage === "field") {
    if (prefix.startsWith("header.") || prefix.startsWith("param.")) {
      return [];
    }
    return [...Object.keys(QUERY_FIELDS), "header.", "param."]
      .filter((name) => !sc.used.includes(name.replace(/\.$/, "")))
      .map((name) => ({
        value: name,
        insert: name.endsWith(".") ? name : `${name} `,
        detail: t(`incidentsPage.query.field.${name.replace(/\.$/, "")}`),
      }))
      .filter(
        (row) =>
          row.value.startsWith(prefix) || (row.detail ?? "").toLowerCase().startsWith(prefix),
      );
  }

  if (sc.stage === "op") {
    const ops = fieldOps(sc.field) ?? [];
    return ops
      .map((op): Suggestion => {
        if (op === "exists") {
          return { value: "and", insert: "and ", detail: t("incidentsPage.query.op.exists") };
        }
        if (op === "in") {
          return {
            value: "in",
            insert: "in [",
            detail: t(`incidentsPage.query.op.${sc.field === "time" ? "between" : "in"}`),
          };
        }
        return {
          value: op,
          insert: `${op} `,
          detail: t(`incidentsPage.query.op.${op === "=" ? "eq" : "like"}`),
        };
      })
      .filter((row) => row.value.startsWith(prefix));
  }

  if (sc.stage === "value") {
    const fixed = values(sc.field);
    const always = LIKE_FIELDS.includes(sc.field);
    return (fixed ?? top)
      .filter((row) => !sc.taken.includes(row.value))
      .filter(
        (row) =>
          row.value.toLowerCase().includes(prefix) ||
          (row.detail ?? "").toLowerCase().includes(prefix),
      )
      .slice(0, 40)
      .map((row) => ({
        ...row,
        insert: `${quoteValue(row.value, always)}${sc.inList ? "" : " "}`,
      }));
  }

  if (sc.stage === "list") {
    return [
      { value: ",", insert: ", ", detail: t("incidentsPage.query.list.more") },
      { value: "]", insert: "] ", detail: t("incidentsPage.query.list.close") },
    ].filter((row) => row.value.startsWith(prefix));
  }

  return "and".startsWith(prefix)
    ? [{ value: "and", insert: "and ", detail: t("incidentsPage.query.op.and") }]
    : [];
}

function stageHint(sc: SuggestContext, t: Translate): string {
  if (sc.stage === "value") {
    if (sc.field.startsWith("header.") || sc.field.startsWith("param.")) {
      return t("incidentsPage.query.hint.pairValue");
    }
    return sc.field in QUERY_FIELDS ? t(`incidentsPage.query.hint.${sc.field}`) : "";
  }
  if (sc.stage === "field") {
    const prefix = sc.prefix.toLowerCase();
    if (prefix.startsWith("header.")) {
      return t("incidentsPage.query.hint.header");
    }
    if (prefix.startsWith("param.")) {
      return t("incidentsPage.query.hint.param");
    }
  }
  return "";
}

const iconButtonSx = {
  p: 0.375,
  color: "text.disabled",
  "&:hover": { color: "text.primary" },
} as const;

const menuButtonSx = {
  appearance: "none",
  border: 0,
  bgcolor: "transparent",
  textAlign: "left",
  width: "100%",
  px: 1.5,
  py: 0.6,
  cursor: "pointer",
  fontFamily: "inherit",
  color: "text.primary",
  display: "block",
  minWidth: 0,
  "&:hover": { bgcolor: "action.hover" },
} as const;

function Caption({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        px: 1.5,
        pt: 1,
        pb: 0.25,
        color: "text.disabled",
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Typography>
  );
}

export function QueryLine({
  text,
  seed,
  ctx,
  scope,
  values,
  loadTop,
  onApply,
  onReset,
}: {
  text: string;
  seed?: string | null;
  ctx: QueryCtx;
  scope: string | null;
  values: (field: string) => readonly Suggestion[] | null;
  loadTop?: (field: string, state: QueryState) => Promise<Suggestion[]>;
  onApply: (state: QueryState) => void;
  onReset?: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(text);
  const [caret, setCaret] = useState(text.length);
  const [focused, setFocused] = useState(false);
  const [listOff, setListOff] = useState(false);
  const [active, setActive] = useState(-1);
  const [strict, setStrict] = useState(false);
  const [spot, setSpot] = useState({ left: 0, top: 0 });
  const [top, setTop] = useState<{ key: string; items: Suggestion[]; loading: boolean }>({
    key: "",
    items: [],
    loading: false,
  });
  const [saved, setSaved] = useState<SavedQuery[]>(() => readSavedQueries(scope));
  const [recent, setRecent] = useState<string[]>(() => readRecentQueries(scope));
  const [savedAnchor, setSavedAnchor] = useState<HTMLElement | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const [name, setName] = useState("");

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const topCache = useRef(new Map<string, Suggestion[]>());

  useEffect(() => {
    setDraft(text);
    setStrict(false);
  }, [text]);

  useEffect(() => {
    if (seed !== undefined && seed !== null) {
      setDraft(seed);
      setStrict(true);
    }
  }, [seed]);

  useEffect(() => {
    setSaved(readSavedQueries(scope));
    setRecent(readRecentQueries(scope));
  }, [scope]);

  const parsed = useMemo(() => parseQuery(draft), [draft]);
  const resolved = useMemo(() => resolveQuery(parsed, ctx), [parsed, ctx]);
  const sc = useMemo(() => suggestContext(draft, caret), [draft, caret]);
  const dirty = draft.trim() !== text;
  const current = saved.find((row) => row.query === text);

  const errors = useMemo<QueryError[]>(
    () =>
      strict || !focused
        ? resolved.errors
        : resolved.errors.filter(
            (err) =>
              err.start > sc.to ||
              draft.slice(Math.min(err.end, sc.from), sc.from).trim() !== "",
          ),
    [strict, focused, resolved, sc.from, sc.to, draft],
  );
  const firstError = errors[0];
  const parts = useMemo(() => segments(draft, parsed, errors), [draft, parsed, errors]);

  const wantsTop =
    focused && sc.stage === "value" && TOP_FIELDS.includes(sc.field) && loadTop !== undefined;
  const others = useMemo(
    () => parsed.terms.filter((term) => term.field !== sc.field),
    [parsed, sc.field],
  );
  const topKey = wantsTop ? `${sc.field}|${formatQuery(others)}` : "";

  useEffect(() => {
    if (topKey === "" || loadTop === undefined) {
      return;
    }
    const cached = topCache.current.get(topKey);
    if (cached !== undefined) {
      setTop({ key: topKey, items: cached, loading: false });
      return;
    }
    let alive = true;
    setTop({ key: topKey, items: [], loading: true });
    const field = sc.field;
    const id = window.setTimeout(() => {
      const { state } = resolveQuery({ tokens: [], terms: others, errors: [] }, ctx);
      loadTop(field, state)
        .then((items) => {
          topCache.current.set(topKey, items);
          if (alive) {
            setTop({ key: topKey, items, loading: false });
          }
        })
        .catch(() => {
          if (alive) {
            setTop({ key: topKey, items: [], loading: false });
          }
        });
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [topKey]);

  const topItems = top.key === topKey ? top.items : [];
  const items = useMemo(() => {
    const list = buildItems(sc, t, values, topItems);
    const typed = draft.slice(sc.from, sc.to);
    return list.length === 1 && (list[0] as Suggestion).insert.trim() === typed ? [] : list;
  }, [sc, t, values, topItems, draft]);
  const hint = stageHint(sc, t);
  const loadingTop = wantsTop && top.key === topKey && top.loading;
  const listOpen = focused && !listOff && (items.length > 0 || hint !== "" || loadingTop);

  useEffect(() => {
    setActive(sc.prefix !== "" && items.length > 0 ? 0 : -1);
  }, [sc.stage, sc.field, sc.prefix, items.length]);

  const syncScroll = () => {
    if (mirrorRef.current !== null && inputRef.current !== null) {
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input !== null && pendingCaret.current !== null) {
      input.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
    syncScroll();
  });

  useLayoutEffect(() => {
    if (!listOpen) {
      return;
    }
    const place = () => {
      const wrap = wrapRef.current;
      const input = inputRef.current;
      const measure = measureRef.current;
      if (wrap === null || input === null || measure === null) {
        return;
      }
      const frame = wrap.getBoundingClientRect();
      const field = input.getBoundingClientRect();
      const left = Math.min(
        Math.max(field.left + measure.offsetWidth - input.scrollLeft, field.left),
        Math.max(field.left, window.innerWidth - 380),
      );
      const next = { left: Math.round(left - 9), top: Math.round(frame.bottom - 2) };
      setSpot((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
    };
    place();
    const watch = new ResizeObserver(place);
    if (wrapRef.current !== null) {
      watch.observe(wrapRef.current);
    }
    window.addEventListener("resize", place);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [listOpen, sc.from, draft]);

  useEffect(() => {
    if (active < 0 || listRef.current === null) {
      return;
    }
    listRef.current.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const focusAt = (start: number, end: number) => {
    const input = inputRef.current;
    if (input === null) {
      return;
    }
    input.focus();
    input.setSelectionRange(start, end);
    setCaret(end);
  };

  const accept = (item: Suggestion) => {
    const after = draft.slice(sc.to);
    const glued = item.insert.endsWith(" ") && after.startsWith(" ");
    const insert = glued ? item.insert.slice(0, -1) : item.insert;
    const next = draft.slice(0, sc.from) + insert + after;
    const at = sc.from + insert.length + (glued ? 1 : 0);
    pendingCaret.current = at;
    setDraft(next);
    setCaret(at);
    setListOff(false);
    setStrict(false);
  };

  const run = (query: string) => {
    const result = resolveQuery(parseQuery(query), ctx);
    const failed = result.errors[0];
    if (failed !== undefined) {
      setDraft(query);
      setStrict(true);
      setListOff(true);
      window.setTimeout(() => focusAt(failed.start, Math.max(failed.end, failed.start)), 0);
      return;
    }
    const clean = formatState(result.state, ctx.routes);
    setDraft(clean);
    setStrict(false);
    setListOff(true);
    setRecent(pushRecentQuery(scope, clean));
    onApply(result.state);
  };

  const revert = () => {
    setDraft(text);
    setStrict(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!listOpen || items.length === 0) {
        if (listOff) {
          setListOff(false);
          e.preventDefault();
        }
        return;
      }
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((prev) => (prev < 0 ? (step > 0 ? 0 : items.length - 1) : (prev + step + items.length) % items.length));
      return;
    }
    if (e.key === "Tab" && listOpen && items.length > 0 && !e.shiftKey) {
      e.preventDefault();
      accept(items[Math.max(active, 0)] as Suggestion);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (listOpen && active >= 0 && items[active] !== undefined) {
        accept(items[active] as Suggestion);
        return;
      }
      run(draft);
      return;
    }
    if (e.key === "Escape") {
      if (listOpen) {
        e.preventDefault();
        setListOff(true);
        return;
      }
      if (dirty) {
        e.preventDefault();
        revert();
        return;
      }
      inputRef.current?.blur();
      return;
    }
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      setListOff(false);
    }
  };

  const track = () => {
    const input = inputRef.current;
    if (input !== null) {
      setCaret(input.selectionStart ?? input.value.length);
    }
    syncScroll();
  };

  const cleanDraft =
    resolved.errors.length === 0 ? formatState(resolved.state, ctx.routes) : null;
  const sameName = saved.find((row) => row.name === name.trim());

  const save = () => {
    const title = name.trim();
    if (title === "" || cleanDraft === null) {
      return;
    }
    const next = [
      { name: title, query: cleanDraft, at: Date.now() },
      ...saved.filter((row) => row.name !== title),
    ];
    setSaved(next);
    writeSavedQueries(scope, next);
    setName("");
    if (dirty) {
      run(cleanDraft);
    }
  };

  const remove = (title: string) => {
    const next = saved.filter((row) => row.name !== title);
    setSaved(next);
    writeSavedQueries(scope, next);
  };

  const pick = (query: string) => {
    setSavedAnchor(null);
    setHelpAnchor(null);
    run(query);
  };

  const errorText =
    firstError === undefined
      ? ""
      : t(`incidentsPage.query.error.${firstError.code}`, firstError.vars);
  const pending = dirty && !focused && firstError === undefined;

  return (
    <Box
      ref={wrapRef}
      sx={{ borderBottom: 1, borderColor: "divider", pl: `${TABLE_RAIL}px`, pr: `${PAGE_RAIL}px`, py: 0.75 }}
    >
      <Box
        ref={boxRef}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          height: LINE_H,
          pl: 1,
          pr: 0.5,
          border: 1,
          borderRadius: "3px",
          borderColor:
            firstError !== undefined
              ? "error.main"
              : focused
                ? "primary.main"
                : dirty
                  ? "warning.main"
                  : "divider",
          bgcolor: focused ? alpha(theme.palette.primary.main, 0.05) : "background.default",
          boxShadow: focused
            ? `0 0 0 3px ${alpha(firstError !== undefined ? theme.palette.error.main : theme.palette.primary.main, 0.14)}`
            : "none",
          transition: "border-color .12s, box-shadow .12s, background-color .12s",
          cursor: "text",
          "&:hover": {
            borderColor:
              firstError !== undefined ? "error.main" : focused ? "primary.main" : alpha(theme.palette.primary.main, 0.45),
          },
        })}
      >
        <SearchIcon
          sx={{ fontSize: 16, flexShrink: 0, color: focused ? "primary.main" : "text.disabled", pointerEvents: "none" }}
        />
        {current !== undefined && !dirty && (
          <Box
            component="button"
            type="button"
            title={t("incidentsPage.query.saved.title")}
            onClick={(e) => setSavedAnchor(e.currentTarget)}
            sx={(theme) => ({
              appearance: "none",
              border: 0,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              maxWidth: 220,
              height: 20,
              px: 0.75,
              borderRadius: "2px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "primary.main",
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.2) },
            })}
          >
            <StarIcon sx={{ fontSize: 12 }} />
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {current.name}
            </Box>
          </Box>
        )}
        <Box sx={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
          <Box
            ref={mirrorRef}
            aria-hidden
            sx={{
              ...textSx,
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            {parts.map((seg, i) => (
              <Box
                key={i}
                component="span"
                sx={(theme) => ({
                  color: segmentColor(seg, theme),
                  ...(seg.error
                    ? {
                        textDecoration: `underline wavy ${theme.palette.error.main}`,
                        textDecorationSkipInk: "none",
                        textUnderlineOffset: "3px",
                      }
                    : {}),
                })}
              >
                {seg.text}
              </Box>
            ))}
            <Box component="span" sx={{ display: "inline-block", width: 2 }} />
          </Box>
          <Box
            ref={measureRef}
            component="span"
            aria-hidden
            sx={{ ...textSx, position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none" }}
          >
            {draft.slice(0, sc.from)}
          </Box>
          <Box
            ref={inputRef}
            component="input"
            type="text"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={t("incidentsPage.query.aria")}
            aria-invalid={firstError !== undefined}
            placeholder={t("incidentsPage.query.placeholder")}
            onChange={(e) => {
              setDraft(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setListOff(false);
              setStrict(false);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={track}
            onClick={track}
            onSelect={track}
            onScroll={syncScroll}
            onFocus={() => {
              setFocused(true);
              setListOff(false);
              track();
            }}
            onBlur={() => setFocused(false)}
            sx={(theme) => ({
              ...textSx,
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              m: 0,
              p: 0,
              border: 0,
              outline: 0,
              bgcolor: "transparent",
              color: "transparent",
              caretColor: theme.palette.text.primary,
              "&::placeholder": { color: theme.palette.text.disabled, opacity: 1 },
              "&::selection": {
                color: "transparent",
                backgroundColor: alpha(theme.palette.primary.main, 0.3),
              },
            })}
          />
        </Box>
        {dirty && firstError === undefined && (
          <Box
            component="button"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(draft)}
            sx={(theme) => ({
              appearance: "none",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              height: 20,
              px: 0.75,
              border: 1,
              borderColor: alpha(theme.palette.primary.main, 0.5),
              borderRadius: "2px",
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              color: "primary.main",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.22) },
            })}
          >
            {t("incidentsPage.query.run")}
            <KeyboardReturnIcon sx={{ fontSize: 12 }} />
          </Box>
        )}
        {(onReset !== undefined || dirty) && (
          <Tooltip title={t(dirty ? "incidentsPage.query.revert" : "incidentsPage.resetFilters")}>
            <IconButton
              size="small"
              aria-label={t(dirty ? "incidentsPage.query.revert" : "incidentsPage.resetFilters")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (dirty ? revert() : onReset?.())}
              sx={iconButtonSx}
            >
              <CloseIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
        <Divider orientation="vertical" flexItem sx={{ my: 0.75 }} />
        <Tooltip title={t("incidentsPage.query.saved.title")}>
          <IconButton
            size="small"
            aria-label={t("incidentsPage.query.saved.title")}
            onClick={(e) => setSavedAnchor(e.currentTarget)}
            sx={{ ...iconButtonSx, color: current !== undefined ? "primary.main" : "text.disabled" }}
          >
            {current !== undefined ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t("incidentsPage.query.help.title")}>
          <IconButton
            size="small"
            aria-label={t("incidentsPage.query.help.title")}
            onClick={(e) => setHelpAnchor(e.currentTarget)}
            sx={iconButtonSx}
          >
            <HelpOutlineIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Collapse in={firstError !== undefined || pending} unmountOnExit>
        <Stack
          direction="row"
          role={firstError !== undefined ? "alert" : undefined}
          sx={{ alignItems: "center", gap: 0.75, pt: 0.5, pl: 0.25, minHeight: 20 }}
        >
          {firstError !== undefined ? (
            <Box
              component="button"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => focusAt(firstError.start, Math.max(firstError.end, firstError.start))}
              sx={{
                appearance: "none",
                border: 0,
                p: 0,
                bgcolor: "transparent",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.74rem",
                color: "error.main",
                textAlign: "left",
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: 14, flexShrink: 0 }} />
              {errorText}
              {errors.length > 1 && (
                <Box component="span" sx={{ color: "text.disabled", ml: 0.5 }}>
                  {t("incidentsPage.query.moreErrors", { count: errors.length - 1 })}
                </Box>
              )}
            </Box>
          ) : (
            <Typography variant="caption" sx={{ color: "warning.main", fontSize: "0.74rem" }}>
              {t("incidentsPage.query.pending")}
            </Typography>
          )}
        </Stack>
      </Collapse>

      {listOpen && (
        <Portal>
          <Box
            onMouseDown={(e) => e.preventDefault()}
            sx={(theme) => ({
              position: "fixed",
              left: spot.left,
              top: spot.top,
              zIndex: theme.zIndex.modal,
              width: 360,
              maxWidth: "calc(100vw - 24px)",
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: "4px",
              boxShadow: `0 10px 28px ${alpha("#000", theme.palette.mode === "dark" ? 0.5 : 0.18)}`,
              overflow: "hidden",
            })}
          >
            <Stack direction="row" sx={{ alignItems: "baseline", gap: 1, px: 1.25, pt: 0.75, pb: 0.5 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {t(`incidentsPage.query.stage.${sc.stage}`)}
                {sc.stage !== "field" && sc.stage !== "join" && sc.field !== "" ? ` · ${sc.field}` : ""}
              </Typography>
              {wantsTop && (loadingTop || topItems.length > 0) && (
                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", ml: "auto" }}>
                  {loadingTop ? t("incidentsPage.query.topLoading") : t("incidentsPage.query.top")}
                </Typography>
              )}
            </Stack>
            {hint !== "" && (
              <Typography
                variant="caption"
                sx={{ display: "block", px: 1.25, pb: 0.75, color: "text.secondary", fontSize: "0.74rem", lineHeight: 1.35 }}
              >
                {hint}
              </Typography>
            )}
            {items.length > 0 && (
              <Box
                ref={listRef}
                role="listbox"
                sx={(theme) => ({
                  maxHeight: 264,
                  overflowY: "auto",
                  borderTop: 1,
                  borderColor: "divider",
                  py: 0.5,
                  ...scrollbarSx(theme),
                })}
              >
                {items.map((item, i) => (
                  <Box
                    key={`${item.value}\0${i}`}
                    role="option"
                    aria-selected={i === active}
                    data-row={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => accept(item)}
                    sx={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 1.5,
                      px: 1.25,
                      py: 0.4,
                      cursor: "pointer",
                      bgcolor: i === active ? "action.selected" : "transparent",
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        fontFamily: "monospace",
                        fontSize: FONT_SIZE,
                        color: sc.stage === "field" ? "secondary.main" : "text.primary",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: sc.stage === "field" ? 84 : 0,
                        flex: "0 1 auto",
                      }}
                    >
                      {item.value}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: "0.72rem",
                        color: "text.secondary",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.detail}
                    </Box>
                    {item.count !== undefined && (
                      <Box
                        component="span"
                        sx={{ fontFamily: "monospace", fontSize: "0.7rem", color: "text.disabled", flexShrink: 0 }}
                      >
                        {item.count.toLocaleString()}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}
            <Typography
              variant="caption"
              sx={{
                display: "block",
                px: 1.25,
                py: 0.5,
                borderTop: 1,
                borderColor: "divider",
                color: "text.disabled",
                fontSize: "0.66rem",
              }}
            >
              {t(items.length > 0 ? "incidentsPage.query.keys" : "incidentsPage.query.keysPlain")}
            </Typography>
          </Box>
        </Portal>
      )}

      <Popover
        open={savedAnchor !== null}
        anchorEl={savedAnchor}
        onClose={() => setSavedAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 0.5, width: 420, border: 1, borderColor: "divider" } } }}
      >
        <Box sx={{ px: 1.5, pt: 1.25, pb: 1 }}>
          <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
            <InputBase
              autoFocus
              value={name}
              placeholder={t("incidentsPage.query.saved.name")}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              inputProps={{ "aria-label": t("incidentsPage.query.saved.name") }}
              sx={{
                flex: 1,
                height: 28,
                px: 1,
                border: 1,
                borderColor: "divider",
                borderRadius: "2px",
                fontSize: "0.8rem",
                "&.Mui-focused": { borderColor: "primary.main" },
                "& .MuiInputBase-input": { py: 0 },
              }}
            />
            <Box
              component="button"
              type="button"
              disabled={name.trim() === "" || cleanDraft === null}
              onClick={save}
              sx={(theme) => ({
                appearance: "none",
                height: 28,
                px: 1.25,
                border: 1,
                borderColor: "primary.main",
                borderRadius: "2px",
                bgcolor: alpha(theme.palette.primary.main, 0.14),
                color: "primary.main",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.76rem",
                fontWeight: 600,
                "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.24) },
                "&:disabled": {
                  cursor: "default",
                  borderColor: "divider",
                  bgcolor: "transparent",
                  color: "text.disabled",
                },
              })}
            >
              {t(sameName !== undefined ? "incidentsPage.query.saved.update" : "incidentsPage.query.saved.save")}
            </Box>
          </Stack>
          <Box
            sx={{
              ...textSx,
              lineHeight: 1.5,
              mt: 0.75,
              fontSize: "0.72rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "text.secondary",
            }}
          >
            {cleanDraft === null ? (
              <Box component="span" sx={{ fontFamily: "inherit", color: "error.main" }}>
                {t("incidentsPage.query.saved.invalid")}
              </Box>
            ) : (
              <QueryText text={cleanDraft} ctx={ctx} />
            )}
          </Box>
        </Box>
        <Divider />
        <Box sx={(theme) => ({ maxHeight: 360, overflowY: "auto", pb: 0.75, ...scrollbarSx(theme) })}>
          <Caption>{t("incidentsPage.query.saved.list")}</Caption>
          {saved.length === 0 && (
            <Typography variant="caption" sx={{ display: "block", px: 1.5, py: 0.5, color: "text.secondary" }}>
              {t("incidentsPage.query.saved.none")}
            </Typography>
          )}
          {saved.map((row) => (
            <Stack key={row.name} direction="row" sx={{ alignItems: "center", pr: 0.75 }}>
              <Box component="button" type="button" onClick={() => pick(row.query)} sx={menuButtonSx}>
                <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                  <StarIcon
                    sx={{ fontSize: 12, color: row.query === text ? "primary.main" : "text.disabled" }}
                  />
                  <Box
                    component="span"
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.name}
                  </Box>
                </Stack>
                <Box
                  sx={{ ...textSx, lineHeight: 1.5, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", pl: "16px" }}
                >
                  <QueryText text={row.query} ctx={ctx} />
                </Box>
              </Box>
              <Tooltip title={t("incidentsPage.query.saved.remove")}>
                <IconButton
                  size="small"
                  aria-label={`${t("incidentsPage.query.saved.remove")}: ${row.name}`}
                  onClick={() => remove(row.name)}
                  sx={iconButtonSx}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          ))}
          {recent.length > 0 && (
            <>
              <Caption>{t("incidentsPage.query.saved.recent")}</Caption>
              {recent.map((row) => (
                <Box key={row} component="button" type="button" onClick={() => pick(row)} sx={menuButtonSx}>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, minWidth: 0 }}>
                    <HistoryIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
                    <Box
                      sx={{ ...textSx, lineHeight: 1.5, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
                    >
                      <QueryText text={row} ctx={ctx} />
                    </Box>
                  </Stack>
                </Box>
              ))}
            </>
          )}
        </Box>
      </Popover>

      <Popover
        open={helpAnchor !== null}
        anchorEl={helpAnchor}
        onClose={() => setHelpAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 0.5, width: 460, border: 1, borderColor: "divider", pb: 0.75 } } }}
      >
        <Caption>{t("incidentsPage.query.help.title")}</Caption>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 1.5,
            rowGap: 0.5,
            px: 1.5,
            py: 0.5,
            alignItems: "baseline",
          }}
        >
          {(
            [
              ["host = shop.example", "eq"],
              ['uri ~ "/api"', "like"],
              ["ip in [a, b]", "in"],
              ["", "pair"],
              ["… and …", "and"],
            ] as const
          ).map(([sample, key]) => (
            <Box key={key} sx={{ display: "contents" }}>
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.76rem", color: "secondary.main", whiteSpace: "nowrap" }}>
                {key === "pair" ? t("incidentsPage.query.help.pairSample") : sample}
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.74rem", lineHeight: 1.35 }}>
                {t(`incidentsPage.query.help.${key}`)}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" sx={{ display: "block", px: 1.5, pt: 0.5, color: "text.disabled", fontSize: "0.7rem" }}>
          {t("incidentsPage.query.help.keys")}
        </Typography>
        <Caption>{t("incidentsPage.query.help.examples")}</Caption>
        {EXAMPLES.map((row) => (
          <Box
            key={row}
            component="button"
            type="button"
            onClick={() => {
              setHelpAnchor(null);
              setDraft(row);
              setStrict(false);
              window.setTimeout(() => focusAt(row.length, row.length), 0);
            }}
            sx={{ ...menuButtonSx, py: 0.4 }}
          >
            <Box sx={{ ...textSx, lineHeight: 1.5, fontSize: "0.74rem" }}>
              <QueryText text={row} ctx={ctx} />
            </Box>
          </Box>
        ))}
      </Popover>
    </Box>
  );
}
