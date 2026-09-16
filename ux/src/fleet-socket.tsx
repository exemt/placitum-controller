import { useEffect } from "react";

import { useAppDispatch } from "./store/hooks.ts";
import { applyFleetSnapshot } from "./store/fleet-ingest.ts";
import { setConnected } from "./store/slices/fleet.ts";
import type { FleetSnapshot } from "./fleet.ts";

const HIDDEN_CLOSE_MS = 30_000;

const APPLY_GAP_MS = 500;

function socketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/agent_health_socket`;
}

export function FleetSocket() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let park: number | undefined;
    let delay = 500;
    let pending: string | null = null;
    let raf = 0;
    let gap: number | undefined;
    let appliedAt = -Infinity;

    const flush = () => {
      raf = 0;
      if (cancelled || pending === null || document.hidden) {
        return;
      }
      const raw = pending;
      pending = null;
      appliedAt = performance.now();
      try {
        const payload = JSON.parse(raw) as FleetSnapshot;
        if (payload.type === "snapshot") {
          dispatch(applyFleetSnapshot(payload));
        }
      } catch {
      }
    };

    const schedule = () => {
      if (raf !== 0 || gap !== undefined || pending === null || document.hidden) {
        return;
      }
      const wait = appliedAt + APPLY_GAP_MS - performance.now();
      if (wait > 0) {
        gap = window.setTimeout(() => {
          gap = undefined;
          schedule();
        }, wait);
        return;
      }
      raf = window.requestAnimationFrame(flush);
    };

    const open = () => {
      if (cancelled || socket !== null || document.hidden) {
        return;
      }

      const ws = new WebSocket(socketUrl());
      socket = ws;

      ws.onopen = () => {
        if (socket === ws) {
          delay = 500;
          dispatch(setConnected(true));
        }
      };

      ws.onmessage = (event) => {
        if (socket !== ws || typeof event.data !== "string") {
          return;
        }
        pending = event.data;
        schedule();
      };

      ws.onclose = () => {
        if (socket !== ws) {
          return;
        }
        socket = null;
        dispatch(setConnected(false));
        retry = window.setTimeout(() => {
          retry = undefined;
          open();
        }, delay);
        delay = Math.min(delay * 2, 8_000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    const close = () => {
      const ws = socket;
      socket = null;
      pending = null;
      ws?.close();
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (park === undefined && socket !== null) {
          park = window.setTimeout(() => {
            park = undefined;
            if (document.hidden) {
              close();
            }
          }, HIDDEN_CLOSE_MS);
        }
        return;
      }
      if (park !== undefined) {
        window.clearTimeout(park);
        park = undefined;
      }
      if (socket === null) {
        if (retry !== undefined) {
          window.clearTimeout(retry);
          retry = undefined;
        }
        delay = 500;
        open();
      }
      schedule();
    };

    document.addEventListener("visibilitychange", onVisibility);
    open();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf !== 0) {
        window.cancelAnimationFrame(raf);
      }
      for (const id of [retry, park, gap]) {
        if (id !== undefined) {
          window.clearTimeout(id);
        }
      }
      close();
    };
  }, [dispatch]);

  return null;
}
