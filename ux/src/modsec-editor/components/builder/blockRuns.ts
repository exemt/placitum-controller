import { BLOCK_ROW } from '../../theme';

const CARD_BORDER = 1;

export const BLOCK_GAP = 12;

export const COLLAPSED_STEP = BLOCK_ROW + CARD_BORDER * 2 + BLOCK_GAP;

const OVERSCAN = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function visibleRange(
  top: number,
  viewHeight: number,
  step: number,
  count: number,
): [number, number] {
  const first = clamp(Math.floor((-top - OVERSCAN) / step), 0, count);
  const last = clamp(Math.ceil((viewHeight - top + OVERSCAN) / step), first, count);
  return [first, last];
}

export type Segment =
  | { open: true; index: number }
  | { open: false; from: number; to: number };

export function segmentsOf(count: number, isOpen: (index: number) => boolean): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < count; i++) {
    if (isOpen(i)) {
      segments.push({ open: true, index: i });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last !== undefined && !last.open) last.to = i + 1;
    else segments.push({ open: false, from: i, to: i + 1 });
  }
  return segments;
}
