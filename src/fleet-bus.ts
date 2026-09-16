import { connect, JSONCodec, type NatsConnection } from "nats";

import { log } from "./log.ts";
import {
  ingestAgentPulse,
  ingestInspectorPulse,
  ingestRedisPulse,
  ingestS3Pulse,
  ingestServicePulse,
  ingestWorkerPulse,
} from "./state/slices/fleet.ts";
import type { AppDispatch } from "./state/types.ts";

const SUBJECT = "WAF_STATUS.>";
const codec = JSONCodec<unknown>();

export async function startFleetBus(
  url: string,
  dispatch: AppDispatch,
): Promise<() => void> {
  let nc: NatsConnection | null = null;
  let stopped = false;

  const open = async () => {
    while (!stopped) {
      try {
        nc = await connect({
          servers: url,
          name: "waf-controller",
          maxReconnectAttempts: -1,
          reconnectTimeWait: 500,
        });
        log("info", "fleet bus connected", { url, subject: SUBJECT });
        const sub = nc.subscribe(SUBJECT);
        for await (const msg of sub) {
          if (stopped) {
            break;
          }
          let payload: unknown;
          try {
            payload = codec.decode(msg.data);
          } catch {
            continue;
          }
          if (ingestAgentPulse(dispatch, payload)) {
            continue;
          }
          if (ingestInspectorPulse(dispatch, payload)) {
            continue;
          }
          if (ingestRedisPulse(dispatch, payload)) {
            continue;
          }
          if (ingestS3Pulse(dispatch, payload)) {
            continue;
          }
          if (ingestServicePulse(dispatch, payload)) {
            continue;
          }
          ingestWorkerPulse(dispatch, payload);
        }
      } catch (err) {
        log("warn", "fleet bus down", { error: String(err) });
        if (!stopped) {
          await sleep(1000);
        }
      }
    }
  };

  void open();

  return () => {
    stopped = true;
    void nc?.drain();
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
