import type { AppDispatch } from "./types.ts";
import { ingestWorkerPulse } from "./slices/fleet.ts";
import { log } from "../log.ts";

/**
 * Demo-воркеры в ту же секцию, куда ляжет ingest с NATS. node_id edge-docker
 * совпадает с агентом в deploy, чтобы merge повесил их внутрь живого агента.
 * Выключить: CONTROLLER_FLEET_DEMO=0.
 *
 * Хеши -- в том виде, в каком их шлёт модуль: md5 боевого файла. Демо с
 * sha256 подсказывало бы, что воркер несёт поколение шаблона, а он несёт
 * отпечаток файла, и сравнивают его с `conf_fingerprint` агента.
 */
export function startFleetDemo(dispatch: AppDispatch): () => void {
  log("info", "fleet demo worker pulses on");

  const pulseA = () => {
    const at = new Date().toISOString();
    ingestWorkerPulse(dispatch, {
      v: 1,
      kind: "worker",
      node_id: "edge-docker",
      pid: 1400,
      nonce: "3a1f00aa",
      config_hash: "md5:8f3c00000000000000000000000000a1",
      at,
    });
    ingestWorkerPulse(dispatch, {
      v: 1,
      kind: "worker",
      node_id: "edge-docker",
      pid: 1401,
      nonce: "90bc11bb",
      config_hash: "md5:8f3c00000000000000000000000000a1",
      at,
    });
  };

  const pulseB = () => {
    ingestWorkerPulse(dispatch, {
      v: 1,
      kind: "worker",
      node_id: "demo-edge-08",
      pid: 2201,
      nonce: "c0ffee00",
      config_hash: "md5:aa1000000000000000000000000000b2",
      at: new Date().toISOString(),
    });
  };

  pulseA();
  pulseB();
  const a = setInterval(pulseA, 4_000);
  const b = setInterval(pulseB, 25_000);
  a.unref();
  b.unref();

  return () => {
    clearInterval(a);
    clearInterval(b);
  };
}
