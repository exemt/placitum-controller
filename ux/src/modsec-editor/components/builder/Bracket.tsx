import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import { BRACKET_WIDTH } from './layout';
import { CONTROL_HEIGHT } from '../../theme';

interface BracketLineProps {
  name: string;
  top?: number | string;
  height?: number | string;
}

export function BracketLine({ name, top = 0, height = CONTROL_HEIGHT }: BracketLineProps) {
  return (
    <Box
      aria-hidden
      data-bracket-line={name}
      sx={{
        position: 'absolute',
        left: 0,
        top,
        width: 0,
        height,
        pointerEvents: 'none',
      }}
    />
  );
}

interface BracketProps {
  label: string;
  color: string;
  line: string;
  children: ReactNode;
}

const LINE_MARGIN = 10;

const TICK_LENGTH = 6;

const LABEL_GAP = 4;

export function Bracket({ label, color, line, children }: BracketProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<{ top: number; bottom: number } | null>(null);
  const [labelWidth, setLabelWidth] = useState<number | null>(null);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (host === null) return;

    const lines = host.querySelectorAll<HTMLElement>(`[data-bracket-line="${line}"]`);
    if (lines.length === 0) {
      setSpan(null);
    } else {
      const origin = host.getBoundingClientRect().top;
      const first = lines[0].getBoundingClientRect();
      const last = lines[lines.length - 1].getBoundingClientRect();
      const next = {
        top: first.top - origin + first.height / 2,
        bottom: last.top - origin + last.height / 2,
      };
      setSpan((prev) =>
        prev !== null && prev.top === next.top && prev.bottom === next.bottom ? prev : next,
      );
    }

    const labelBox = labelRef.current;
    if (labelBox !== null) {
      const width = labelBox.getBoundingClientRect().width;
      setLabelWidth((prev) => (prev !== null && Math.abs(prev - width) < 0.5 ? prev : width));
    }
  }, [line]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    if (labelRef.current !== null) observer.observe(labelRef.current);
    host
      .querySelectorAll<HTMLElement>(`[data-bracket-line="${line}"]`)
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [children, line, measure]);

  const center = span === null ? '50%' : `${(span.top + span.bottom) / 2}px`;

  const columnWidth =
    labelWidth === null
      ? BRACKET_WIDTH
      : Math.max(BRACKET_WIDTH, Math.ceil(labelWidth) + LABEL_GAP + TICK_LENGTH + LINE_MARGIN);
  const lineLeft = columnWidth - LINE_MARGIN;
  const tickLeft = lineLeft - TICK_LENGTH;

  return (
    <Box ref={hostRef} sx={{ display: 'flex', alignItems: 'stretch' }}>
      <Box sx={{ position: 'relative', width: columnWidth, flexShrink: 0 }}>
        <Box
          sx={{
            position: 'absolute',
            left: lineLeft,
            top: 0,
            bottom: 0,
            borderLeft: '1px solid',
            borderColor: color,
            opacity: 0.7,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: center,
            left: tickLeft,
            width: TICK_LENGTH,
            borderTop: '1px solid',
            borderColor: color,
            opacity: 0.7,
          }}
        />
        <Box
          ref={labelRef}
          sx={{
            position: 'absolute',
            top: center,
            left: 0,
            transform: 'translateY(-50%)',
            px: 0.75,
            py: 0.125,
            borderRadius: 1,
            bgcolor: color,
            color: 'common.black',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            lineHeight: '18px',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
