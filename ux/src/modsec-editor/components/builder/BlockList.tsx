import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import Box from '@mui/material/Box';
import { BLOCK_GAP, COLLAPSED_STEP, segmentsOf, visibleRange } from './blockRuns';

const FLASH_MS = 1400;

const REVEAL_MARGIN = 12;

function flashSx(on: boolean) {
  return {
    borderRadius: 1,
    outline: on ? '2px solid' : '2px solid transparent',
    outlineColor: on ? 'primary.main' : 'transparent',
    transition: 'outline-color 400ms',
  };
}

function useViewportTicker(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
): [(listener: () => void) => () => void, () => void] {
  const listeners = useRef(new Set<() => void>());

  useEffect(() => {
    const view = scroller.current;
    if (view === null) return;

    let frame = 0;
    const tick = () => {
      frame = 0;
      for (const listener of listeners.current) listener();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    view.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (observer !== null && content.current !== null) observer.observe(content.current);

    return () => {
      view.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller, content]);

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => {
    for (const listener of listeners.current) listener();
  }, []);

  return [subscribe, refresh];
}

interface RunProps {
  from: number;
  to: number;
  scroller: RefObject<HTMLElement | null>;
  subscribe: (listener: () => void) => () => void;
  held: number | null;
  flash: number | null;
  render: (index: number) => ReactNode;
}

function CollapsedRun({ from, to, scroller, subscribe, held, flash, render }: RunProps) {
  const count = to - from;
  const box = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([0, count]);

  const first = Math.min(range[0], count);
  const last = Math.min(range[1], count);

  const measure = useCallback(() => {
    const el = box.current;
    const view = scroller.current;
    if (el === null || view === null) return;

    const height = view.clientHeight;
    if (height === 0) {
      setRange((prev) => (prev[0] === 0 && prev[1] === count ? prev : [0, count]));
      return;
    }

    const top = el.getBoundingClientRect().top - view.getBoundingClientRect().top;
    const next = visibleRange(top, height, COLLAPSED_STEP, count);
    setRange((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next));
  }, [count, scroller]);

  useLayoutEffect(measure);
  useEffect(() => subscribe(measure), [subscribe, measure]);

  const rows: ReactNode[] = [];
  for (let offset = first; offset < last; offset++) rows.push(row(offset));

  const heldOffset = held === null ? null : held - from;
  if (heldOffset !== null && (heldOffset < first || heldOffset >= last)) {
    rows.push(row(heldOffset));
  }

  return (
    <Box ref={box} sx={{ position: 'relative', height: count * COLLAPSED_STEP }}>
      {rows}
    </Box>
  );

  function row(offset: number): ReactNode {
    const index = from + offset;
    return (
      <Box
        key={index}
        data-block={index}
        sx={{
          position: 'absolute',
          top: offset * COLLAPSED_STEP,
          left: 0,
          right: 0,
          height: COLLAPSED_STEP - BLOCK_GAP,
          ...flashSx(flash === index),
        }}
      >
        {render(index)}
      </Box>
    );
  }
}

interface BlockListProps {
  count: number;
  isOpen: (index: number) => boolean;
  render: (index: number) => ReactNode;
  dimmed: boolean;
  revealIndex?: number | null;
  revealSeq?: number;
}

export function BlockList({
  count,
  isOpen,
  render,
  dimmed,
  revealIndex = null,
  revealSeq = 0,
}: BlockListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [subscribe, refresh] = useViewportTicker(scroller, content);

  const [held, setHeld] = useState<number | null>(null);

  const [flash, setFlash] = useState<number | null>(null);
  const target = useRef(revealIndex);
  target.current = revealIndex;

  useEffect(() => {
    const index = target.current;
    const view = scroller.current;
    if (revealSeq === 0 || index === null || view === null) return;

    const el = view.querySelector<HTMLElement>(`[data-block="${index}"]`);
    if (el !== null) {
      const top = el.getBoundingClientRect().top - view.getBoundingClientRect().top;
      view.scrollTop += top - REVEAL_MARGIN;
      refresh();
    }

    setFlash(index);
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [revealSeq, refresh]);

  const segments = segmentsOf(count, isOpen);

  return (
    <Box
      ref={scroller}
      onFocus={(event) => setHeld(blockIndexOf(event.target))}
      onBlur={() => setHeld(null)}
      sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.5 }}
    >
      <Box
        ref={content}
        sx={{
          opacity: dimmed ? 0.45 : 1,
          pointerEvents: dimmed ? 'none' : 'auto',
          overflowAnchor: 'none',
        }}
      >
        {segments.map((segment) =>
          segment.open ? (
            <Box
              key={`open-${segment.index}`}
              data-block={segment.index}
              sx={{ mb: `${BLOCK_GAP}px`, ...flashSx(flash === segment.index) }}
            >
              {render(segment.index)}
            </Box>
          ) : (
            <CollapsedRun
              key={`run-${segment.from}`}
              from={segment.from}
              to={segment.to}
              scroller={scroller}
              subscribe={subscribe}
              held={inSegment(held, segment.from, segment.to)}
              flash={inSegment(flash, segment.from, segment.to)}
              render={render}
            />
          ),
        )}
      </Box>
    </Box>
  );
}

function inSegment(index: number | null, from: number, to: number): number | null {
  return index !== null && index >= from && index < to ? index : null;
}

function blockIndexOf(node: HTMLElement): number | null {
  const host = node.closest<HTMLElement>('[data-block]');
  if (host === null) return null;
  const index = Number(host.dataset.block);
  return Number.isNaN(index) ? null : index;
}
