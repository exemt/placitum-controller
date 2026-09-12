import { useEffect } from "react";

import { useAppDispatch } from "./store/hooks.ts";
import { applyFleetSnapshot } from "./store/fleet-ingest.ts";
import { setConnected } from "./store/slices/fleet.ts";
import type { FleetSnapshot } from "./fleet.ts";

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
    let delay = 500;
    // Свёрнутая вкладка копит кадры. Снимок полный — достаточно последнего.
    let pending: string | null = null;
    let raf = 0;

    const flush = () => {
      raf = 0;
      if (cancelled || pending === null || document.hidden) {
        return;
      }
      const raw = pending;
      pending = null;
      try {
        const payload = JSON.parse(raw) as FleetSnapshot;
        if (payload.type === "snapshot") {
          dispatch(applyFleetSnapshot(payload));
        }
      } catch {
        // битый кадр — ждём следующий
      }
    };

    const schedule = () => {
      if (raf !== 0 || document.hidden) {
        return;
      }
      raf = window.requestAnimationFrame(flush);
    };

    const onVisible = () => {
      if (!document.hidden) {
        schedule();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    const open = () => {
      if (cancelled) {
        return;
      }

      const ws = new WebSocket(socketUrl());
      socket = ws;

      ws.onopen = () => {
        if (!cancelled) {
          delay = 500;
          dispatch(setConnected(true));
        }
      };

      ws.onmessage = (event) => {
        if (cancelled || typeof event.data !== "string") {
          return;
        }
        pending = event.data;
        schedule();
      };

      ws.onclose = () => {
        if (cancelled) {
          return;
        }
        dispatch(setConnected(false));
        retry = window.setTimeout(open, delay);
        delay = Math.min(delay * 2, 8_000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    open();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (raf !== 0) {
        window.cancelAnimationFrame(raf);
      }
      if (retry !== undefined) {
        window.clearTimeout(retry);
      }
      socket?.close();
    };
  }, [dispatch]);

  return null;
}
