import { WebSocketServer, type WebSocket } from "ws";

import { log } from "./log.ts";
import { snapshotFleet } from "./state/fleet-view.ts";
import type { RootState } from "./state/types.ts";

const PATH = "/agent_health_socket";

export interface HealthSocketOptions {
  pushMs?: number;
  backlogBytes?: number;
  pingMs?: number;
}

const DEFAULTS = { pushMs: 1_000, backlogBytes: 256 * 1024, pingMs: 30_000 };

export function attachAgentHealthSocket(
  getState: () => RootState,
  subscribe: (listener: () => void) => () => void,
  options: HealthSocketOptions = {},
): { wss: WebSocketServer; path: string; close: () => void } {
  const { pushMs, backlogBytes, pingMs } = { ...DEFAULTS, ...options };
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, number>();
  const alive = new Set<WebSocket>();
  let seenSeq = getState().fleet.seq;
  let pushedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const drop = (socket: WebSocket): void => {
    clients.delete(socket);
    alive.delete(socket);
  };

  wss.on("connection", (socket) => {
    const state = getState();
    clients.set(socket, state.fleet.seq);
    alive.add(socket);
    send(socket, JSON.stringify(snapshotFleet(state)));
    socket.on("pong", () => {
      alive.add(socket);
    });
    socket.on("close", () => {
      drop(socket);
    });
    socket.on("error", () => {
      drop(socket);
    });
  });

  const push = (): void => {
    timer = undefined;
    pushedAt = Date.now();
    const state = getState();
    const seq = state.fleet.seq;
    let payload: string | undefined;
    let behind = false;

    for (const [socket, sent] of clients) {
      if (sent === seq) {
        continue;
      }
      if (socket.bufferedAmount > backlogBytes) {
        behind = true;
        continue;
      }
      payload ??= JSON.stringify(snapshotFleet(state));
      if (send(socket, payload)) {
        clients.set(socket, seq);
      }
    }

    if (behind) {
      schedule();
    }
  };

  const schedule = (): void => {
    if (timer === undefined) {
      timer = setTimeout(push, Math.max(0, pushedAt + pushMs - Date.now()));
    }
  };

  const unsubscribe = subscribe(() => {
    const seq = getState().fleet.seq;
    if (seq === seenSeq) {
      return;
    }
    seenSeq = seq;
    schedule();
  });

  const heartbeat = setInterval(() => {
    for (const socket of clients.keys()) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, pingMs);
  heartbeat.unref();

  log("info", "agent health socket", { path: PATH });

  return {
    wss,
    path: PATH,
    close: () => {
      unsubscribe();
      clearInterval(heartbeat);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      for (const socket of clients.keys()) {
        socket.close();
      }
      wss.close();
    },
  };
}

function send(socket: WebSocket, payload: string): boolean {
  if (socket.readyState !== 1) {
    return false;
  }
  socket.send(payload);
  return true;
}
