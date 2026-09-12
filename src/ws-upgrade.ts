import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { Server } from "node:http";

import { WebSocketServer } from "ws";

/**
 * Один listener на upgrade. Два WebSocketServer({ server }) на одном
 * http.Server оба едят событие: чужой path получает 400, свой — битый кадр.
 */
export function routeUpgrades(
  server: Server,
  routes: ReadonlyArray<{ path: string; wss: WebSocketServer }>,
): () => void {
  const onUpgrade = (
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): void => {
    const path = pathname(req.url);
    const hit = routes.find((row) => row.path === path);

    if (hit === undefined) {
      socket.destroy();
      return;
    }

    hit.wss.handleUpgrade(req, socket, head, (ws) => {
      hit.wss.emit("connection", ws, req);
    });
  };

  server.on("upgrade", onUpgrade);

  return () => {
    server.off("upgrade", onUpgrade);
  };
}

function pathname(url: string | undefined): string {
  if (url === undefined || url === "") {
    return "/";
  }

  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}
