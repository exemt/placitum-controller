import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Box from "@mui/material/Box";
import TableCell from "@mui/material/TableCell";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";

import { HEAD_H } from "./data-table/index.ts";

export const GRIP_W = 52;

export function moveTo<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= rows.length) {
    return rows;
  }
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export function useRowDrag(count: number, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<number | null>(null);
  const live = useRef<{
    count: number;
    onMove: (from: number, to: number) => void;
    from: number | null;
  }>({ count, onMove, from: null });
  live.current.count = count;
  live.current.onMove = onMove;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, index: number) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      live.current.from = index;
      setDrag(index);
    },
    [],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const from = live.current.from;
    if (from === null) {
      return;
    }
    const body = event.currentTarget.closest("tbody");
    if (body === null) {
      return;
    }
    const items = [...body.querySelectorAll<HTMLElement>("[data-rule]")];
    let next = Math.min(items.length, live.current.count) - 1;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item === undefined) {
        continue;
      }
      const rect = item.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        next = i;
        break;
      }
    }
    if (next === from || next < 0) {
      return;
    }
    live.current.onMove(from, next);
    live.current.from = next;
    setDrag(next);
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (live.current.from === null) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    live.current.from = null;
    setDrag(null);
  }, []);

  return useMemo(
    () => ({ drag, onPointerDown, onPointerMove, onPointerUp }),
    [drag, onPointerDown, onPointerMove, onPointerUp],
  );
}

export type DragApi = ReturnType<typeof useRowDrag>;

export function GripCell({
  index,
  drag,
  title,
  width = GRIP_W,
  children,
}: {
  index: number;
  drag: DragApi;
  title: string;
  width?: number;
  children?: React.ReactNode;
}) {
  return (
    <TableCell
      sx={{
        p: "0 !important",
        width,
        minWidth: width,
        height: HEAD_H,
        verticalAlign: "middle",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: children === undefined ? "center" : "flex-start",
          alignItems: "center",
          gap: 0.5,
          pl: children === undefined ? 0 : 1.5,
        }}
      >
        <Box
          component="span"
          title={title}
          onPointerDown={(event) => drag.onPointerDown(event, index)}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerUp}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            color: "text.secondary",
            cursor: drag.drag === null ? "grab" : "grabbing",
            touchAction: "none",
            opacity: 0.55,
            "&:hover": { opacity: 1 },
          }}
        >
          <DragIndicatorIcon sx={{ fontSize: 18 }} />
        </Box>
        {children}
      </Box>
    </TableCell>
  );
}

export function dragSx(drag: DragApi, index: number) {
  return {
    opacity: drag.drag === index ? 0.45 : 1,
    bgcolor: drag.drag === index ? "action.selected" : undefined,
  };
}
