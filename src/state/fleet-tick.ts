import type { ControllerStore } from "./store.ts";
import { fleetTick } from "./slices/fleet.ts";

export function startFleetTicker(
  store: ControllerStore,
  opts: { tickMs: number; degradedMs: number; expireMs: number },
): () => void {
  const timer = setInterval(() => {
    store.dispatch(
      fleetTick({
        now: Date.now(),
        degradedMs: opts.degradedMs,
        expireMs: opts.expireMs,
      }),
    );
  }, opts.tickMs);

  timer.unref();
  return () => clearInterval(timer);
}
