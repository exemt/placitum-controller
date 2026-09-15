import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import Box from "@mui/material/Box";
import FormHelperText from "@mui/material/FormHelperText";
import { alpha, useTheme } from "@mui/material/styles";

import { scrollbarSx } from "../scrollbar.ts";
import { highlightNginx } from "./highlight.ts";

const FONT_MONO =
  '"IBM Plex Mono", ui-monospace, "Cascadia Code", Consolas, monospace';
const LINE = 20;
const TAB = "    ";
const CHROME = 22;
const FILL_TAIL = 24;

export function NginxEditor({
  label,
  value,
  onChange,
  helper,
  minRows = 16,
  maxRows = 40,
  disabled,
  readOnly,
  wide,
  fill,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  helper?: string;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
  readOnly?: boolean;
  wide?: boolean;
  fill?: boolean;
}) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState<number | null>(null);

  const measure = useCallback(() => {
    const node = rootRef.current;
    if (fill !== true || node === null) {
      return;
    }
    const top = node.getBoundingClientRect().top + window.scrollY;
    const next = Math.max(
      minRows * LINE + CHROME,
      Math.round(window.innerHeight - top - FILL_TAIL),
    );
    setFilled((cur) => (cur === next ? cur : next));
  }, [fill, minRows]);

  useLayoutEffect(() => {
    if (fill !== true) {
      setFilled((cur) => (cur === null ? cur : null));
      return;
    }
    measure();
  });

  useEffect(() => {
    if (fill !== true) {
      return;
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fill, measure]);

  const lineCount = Math.max(1, value.split("\n").length);
  const visible = Math.min(Math.max(lineCount, minRows), maxRows);
  const height = filled === null ? visible * LINE : filled - CHROME;
  const gutterLines = Math.max(lineCount, Math.floor(height / LINE));
  const html = useMemo(
    () => highlightNginx(value.endsWith("\n") ? `${value} ` : value),
    [value],
  );

  useEffect(() => {
    const area = areaRef.current;
    const caret = caretRef.current;
    if (area === null || caret === null) {
      return;
    }
    area.selectionStart = caret;
    area.selectionEnd = caret;
    caretRef.current = null;
  }, [value]);

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const top = event.currentTarget.scrollTop;
    const left = event.currentTarget.scrollLeft;
    if (preRef.current !== null) {
      preRef.current.scrollTop = top;
      preRef.current.scrollLeft = left;
    }
    if (gutterRef.current !== null) {
      gutterRef.current.scrollTop = top;
    }
  };

  const locked = disabled === true || readOnly === true;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || locked) {
      return;
    }
    event.preventDefault();
    const area = event.currentTarget;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const next = `${value.slice(0, start)}${TAB}${value.slice(end)}`;
    caretRef.current = start + TAB.length;
    onChange?.(next);
  };

  const accent = focused ? "primary.main" : "divider";
  const labelColor = focused
    ? "primary.main"
    : disabled === true
      ? "text.disabled"
      : "text.secondary";

  return (
    <Box
      ref={rootRef}
      sx={wide === true ? { gridColumn: "1 / -1", width: "100%" } : { width: "100%" }}
    >
      <Box
        sx={{
          position: "relative",
          border: 1,
          borderColor: accent,
          borderRadius: 1,
          bgcolor: "background.paper",
          opacity: disabled === true ? 0.62 : readOnly === true ? 0.92 : 1,
          boxShadow: focused
            ? `0 0 0 1px ${alpha(theme.palette.primary.main, dark ? 0.4 : 0.3)}`
            : "none",
        }}
      >
        <Box
          component="span"
          sx={{
            position: "absolute",
            top: 0,
            left: 10,
            transform: "translateY(-50%)",
            px: 0.5,
            bgcolor: "background.paper",
            color: labelColor,
            fontSize: "0.75rem",
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          {label}
        </Box>
        <Box sx={{ display: "flex", pt: 1.25, pb: 1.25 }}>
          <Box
            ref={gutterRef}
            aria-hidden
            sx={{
              flex: "0 0 auto",
              width: `${Math.max(2, String(lineCount).length) + 1.2}ch`,
              height,
              overflow: "hidden",
              textAlign: "right",
              pr: 1,
              pl: 1,
              userSelect: "none",
              fontFamily: FONT_MONO,
              fontSize: 13,
              lineHeight: `${LINE}px`,
              color: "text.secondary",
              borderRight: 1,
              borderColor: "divider",
            }}
          >
            {Array.from({ length: gutterLines }, (_, index) => (
              <Box key={index} component="div">
                {index + 1}
              </Box>
            ))}
          </Box>
          <Box sx={{ position: "relative", flex: 1, minWidth: 0, height }}>
            <Box
              ref={preRef}
              component="pre"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: html.length === 0 ? " " : html }}
              sx={{
                boxSizing: "border-box",
                m: 0,
                px: 1.25,
                py: 0,
                height: "100%",
                overflow: "hidden",
                fontFamily: FONT_MONO,
                fontSize: 13,
                lineHeight: `${LINE}px`,
                whiteSpace: "pre",
                wordBreak: "normal",
                color: "text.primary",
                pointerEvents: "none",
                "& .ngx-comment": { color: dark ? "#5a7180" : "#6b7f86" },
                "& .ngx-string": { color: dark ? "#3dd68c" : "#1b8a4a" },
                "& .ngx-variable": { color: dark ? "#c792ea" : "#7b1fa2" },
                "& .ngx-directive": { color: theme.palette.primary.main },
                "& .ngx-block": { color: dark ? "#5eb8ff" : "#1565c0", fontWeight: 600 },
                "& .ngx-important": { color: dark ? "#f0b429" : "#b8860b", fontWeight: 600 },
                "& .ngx-number": { color: dark ? "#ffb86b" : "#c45c00" },
                "& .ngx-flag": { color: dark ? "#ff8a65" : "#c62828" },
                "& .ngx-operator": { color: dark ? "#7d969e" : "#4a6368" },
                "& .ngx-punct": { color: dark ? "#7d969e" : "#4a6368" },
                "& .ngx-path": { color: dark ? "#9cdcfe" : "#0277bd" },
                "& .ngx-named": { color: dark ? "#7eb8d4" : "#1565a0" },
              }}
            />
            <Box
              component="textarea"
              ref={areaRef}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              disabled={disabled}
              readOnly={readOnly}
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              onScroll={syncScroll}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              sx={{
                position: "absolute",
                inset: 0,
                boxSizing: "border-box",
                resize: "none",
                border: 0,
                outline: "none",
                m: 0,
                px: 1.25,
                py: 0,
                background: "transparent",
                color: "transparent",
                caretColor: readOnly === true ? "transparent" : theme.palette.primary.main,
                fontFamily: FONT_MONO,
                fontSize: 13,
                lineHeight: `${LINE}px`,
                whiteSpace: "pre",
                overflow: "auto",
                ...scrollbarSx(theme),
                "&::selection": {
                  backgroundColor: alpha(theme.palette.primary.main, dark ? 0.28 : 0.22),
                },
              }}
            />
          </Box>
        </Box>
      </Box>
      {helper !== undefined && helper !== "" && (
        <FormHelperText sx={{ mx: 1.75 }}>{helper}</FormHelperText>
      )}
    </Box>
  );
}
