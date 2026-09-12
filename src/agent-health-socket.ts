import { WebSocketServer, type WebSocket } from "ws";

import { log } from "./log.ts";
import { snapshotFleet } from "./state/fleet-view.ts";
import type { RootState } from "./state/types.ts";

const PATH = "/agent_health_socket";

/**
 * Отдельный сокет живого флота. На коннект — снимок, дальше — когда seq
 * в Redux сдвинулся (пульс, degraded, удаление). Не REST и не /api.
 */
export function attachAgentHealthSocket(
  getState: () => RootState,
  subscribe: (listener: () => void) => () => void,
): { wss: WebSocketServer; path: string; close: () => void } {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();
  let prevSeq = getState().fleet.seq;

  wss.on("connection", (socket) => {
    clients.add(socket);
    send(socket, snapshotFleet(getState()));
    socket.on("close", () => {
      clients.delete(socket);
    });
    socket.on("error", () => {
      clients.delete(socket);
    });
  });

  const unsubscribe = subscribe(() => {
    const seq = getState().fleet.seq;
    if (seq === prevSeq) {
      return;
    }
    prevSeq = seq;
    const payload = snapshotFleet(getState());
    for (const socket of clients) {
      send(socket, payload);
    }
  });

  log("info", "agent health socket", { path: PATH });

  return {
    wss,
    path: PATH,
    close: () => {
      unsubscribe();
      for (const socket of clients) {
        socket.close();
      }
      wss.close();
    },
  };
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== 1) {
    return;
  }
  socket.send(JSON.stringify(payload));
}
