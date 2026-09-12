/* Временный стенд для просмотра карточек флота без шины. Не входит в сборку. */

import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import Box from "@mui/material/Box";

import FleetPage from "./pages/FleetPage.tsx";
import { LocaleProvider } from "./i18n/index.ts";
import { PageBarProvider, ShellPageBar } from "./layout/PageBarHost.tsx";
import { store } from "./store/index.ts";
import { AppThemeProvider } from "./theme.tsx";
import { applyFleetSnapshot } from "./store/fleet-ingest.ts";
import { setConnected } from "./store/slices/fleet.ts";
import { toggleExpanded } from "./store/slices/pages/fleet.ts";
import type { FleetSnapshot } from "./fleet.ts";

const host = (usage: number, load: number, diskFill = 0.28, uptimeS = 3600 * 74) => ({
  cpu: { cores: 24, usage, load1: load, load5: load * 0.9, load15: load * 0.8 },
  memory: { total: 16 * 1024 ** 3, used: 3.1 * 1024 ** 3, available: 12 * 1024 ** 3 },
  disk: { total: 200 * 1024 ** 3, used: diskFill * 200 * 1024 ** 3 },
  uptime_s: uptimeS,
});

const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

function snapshot(seq: number): FleetSnapshot {
  const at = new Date().toISOString();
  const wobble = 0.6 + Math.sin(seq / 2) * 0.4;
  return {
    v: 1,
    type: "snapshot",
    seq,
    at,
    agents: [
      {
        uuid: "agent-1",
        kind: "agent",
        status: "up",
        seen_at: at,
        age_ms: 1200,
        apply: "ok",
        rps: 1240 * wobble,
        codes: {
          "2xx": 1100 * wobble,
          "3xx": 42 * wobble,
          "4xx": 78 * wobble,
          "5xx": 12 * wobble,
        },
        window_s: 10,
        waf: {
          allow: 1150 * wobble,
          deny: 74 * wobble,
          challenge: 16 * wobble,
          deadline_hits: 0,
          fail_open: 0,
          fail_closed: 0,
        },
        io: {
          archive: {
            ops: 84 * wobble,
            in: 1.4 * 1024 ** 2,
            out: 900 * 1024,
            p50_ms: 3.4,
            p95_ms: 12.8,
            max_ms: 44,
          },
          audit: { ops: 1240 * wobble, out: 320 * 1024, err: 2 },
        },
        bus: { reconnects: 1, rtt_ms: 0.8 },
        errors: [
          {
            at: ago(48),
            msg: "s3: PUT waf-bodies/9f3c… timeout after 2.0s",
            count: 3,
            source: "archive",
          },
        ],
        health: {
          node_id: "edge-docker",
          hostname: "edge-01",
          config_hash: "sha256:8f3c0000000000000000000000000001",
          conf_fingerprint: "md5:a03600000000000000000000000000a1",
        },
        host: host(0.34, 0.79),
        workers: [
          {
            uuid: "w1",
            kind: "worker",
            status: "up",
            seen_at: at,
            age_ms: 900,
            health: {
              node_id: "edge-docker",
              pid: 1400,
              nonce: "3a1f00aa",
              config_hash: "md5:a03600000000000000000000000000a1",
            },
          },
          {
            uuid: "w2",
            kind: "worker",
            status: "up",
            seen_at: at,
            age_ms: 900,
            health: {
              node_id: "edge-docker",
              pid: 1401,
              nonce: "90bc11bb",
              config_hash: "md5:a03600000000000000000000000000a1",
            },
          },
          {
            uuid: "w3",
            kind: "worker",
            status: "degraded",
            seen_at: at,
            age_ms: 9000,
            health: {
              node_id: "edge-docker",
              pid: 1402,
              nonce: "77dd22cc",
              config_hash: "md5:6d7700000000000000000000000000b2",
            },
          },
        ],
      },
      {
        uuid: "agent-2",
        kind: "agent",
        status: "degraded",
        seen_at: ago(21),
        age_ms: 21000,
        apply: "apply_failed",
        rps: 310 * wobble,
        codes: {
          "2xx": 210 * wobble,
          "3xx": 8 * wobble,
          "4xx": 30 * wobble,
          "5xx": 62 * wobble,
        },
        window_s: 10,
        waf: {
          allow: 240 * wobble,
          deny: 28 * wobble,
          challenge: 4 * wobble,
          deadline_hits: 14 * wobble,
          fail_open: 11 * wobble,
          fail_closed: 3 * wobble,
        },
        io: {
          archive: {
            ops: 22 * wobble,
            in: 500 * 1024,
            out: 380 * 1024,
            err: 6 * wobble,
            p50_ms: 9.1,
            p95_ms: 240,
            max_ms: 1900,
          },
          audit: { ops: 310 * wobble, out: 96 * 1024 },
        },
        bus: { reconnects: 7, rtt_ms: 18 },
        skew_ms: 5400,
        restarts_1h: 2,
        bus_flaps_1h: 3,
        errors: [
          {
            at: ago(12),
            msg: "upstream app-2:8080 connect: connection refused",
            count: 41,
            source: "audit",
          },
          {
            at: ago(140),
            msg: "apply: nginx -t failed: unknown directive \"waf_deadlin\"",
            source: "apply",
          },
        ],
        health: {
          node_id: "edge-baremetal",
          hostname: "edge-02",
          config_hash: "sha256:1111000000000000000000000000ffff",
          conf_fingerprint: "md5:6d7700000000000000000000000000b2",
        },
        host: host(0.87, 19.4, 0.93, 60 * 7),
        workers: [
          {
            uuid: "w4",
            kind: "worker",
            status: "up",
            seen_at: at,
            age_ms: 700,
            health: {
              node_id: "edge-baremetal",
              pid: 940,
              nonce: "aa00cc11",
              config_hash: "md5:6d7700000000000000000000000000b2",
            },
          },
        ],
      },
    ],
    orphans: [
      {
        uuid: "orph-1",
        kind: "worker",
        status: "degraded",
        seen_at: ago(30),
        age_ms: 30000,
        health: {
          node_id: "edge-lost",
          pid: 77,
          nonce: "dead00aa",
          config_hash: "md5:222200000000000000000000000000c3",
        },
      },
    ],
    inspectors: [
      {
        uuid: "insp-ip-1",
        kind: "inspector",
        status: "up",
        seen_at: at,
        age_ms: 600,
        name: "ip",
        subject: "waf.inspect.req.ip",
        queue: "ip-workers",
        hostname: "insp-01",
        ready: true,
        host: host(0.11, 0.6),
        work: { accepted: 92100, queued: 0, queue_depth: 64, rules: 1240 },
        window_s: 10,
        io: {
          inspect: {
            ops: 1240 * wobble,
            p50_ms: 0.4,
            p95_ms: 1.1,
            max_ms: 6,
            avg_ms: 0.6,
          },
        },
        config_hash: "sha256:aa10000000000000000000000000dead",
        rev: 12,
        apply: "ok",
        drift: "ok",
      },
      {
        uuid: "insp-modsec-1",
        kind: "inspector",
        status: "up",
        seen_at: at,
        age_ms: 800,
        name: "modsec",
        subject: "waf.inspect.req.modsec",
        queue: "modsec-workers",
        hostname: "insp-01",
        ready: true,
        host: host(0.62, 3.2),
        work: { accepted: 8123, shed: 4, queued: 2, queue_depth: 16 },
        window_s: 10,
        io: {
          inspect: {
            ops: 320 * wobble,
            p50_ms: 8,
            p95_ms: 42,
            max_ms: 110,
            avg_ms: 14,
          },
        },
        config_hash: "sha256:aa10000000000000000000000000dead",
        rev: 12,
        apply: "ok",
        drift: "ok",
      },
      {
        uuid: "insp-modsec-2",
        kind: "inspector",
        status: "up",
        seen_at: at,
        age_ms: 800,
        name: "modsec",
        subject: "waf.inspect.req.modsec",
        queue: "modsec-workers",
        hostname: "insp-02",
        ready: true,
        host: host(0.21, 1.1),
        work: { accepted: 7740, queued: 9, queue_depth: 16 },
        window_s: 10,
        io: {
          inspect: {
            ops: 280 * wobble,
            p50_ms: 11,
            p95_ms: 66,
            max_ms: 190,
            avg_ms: 220,
          },
        },
        errors: [
          {
            at: ago(300),
            msg: "rules: REQUEST-942-APPLICATION-ATTACK-SQLI.conf line 44: invalid operator",
            count: 2,
            source: "apply",
          },
        ],
        config_hash: "sha256:bb20000000000000000000000000beef",
        rev: 11,
        apply: "ok",
        drift: "stale",
      },
    ],
    stores: [
      {
        uuid: "redis-1",
        kind: "redis",
        status: "up",
        seen_at: at,
        age_ms: 1000,
        name: "redis",
        hostname: "store-01",
        ready: true,
        host: host(0.12, 0.4),
        window_s: 10,
        io: { cmd: { ops: 640 * wobble, p50_ms: 0.4, p95_ms: 1.2, max_ms: 8 } },
        bus: { reconnects: 0, rtt_ms: 0.3 },
        evicted_1h: 1284,
        redis: {
          ok: true,
          version: "7.2.4",
          role: "master",
          used_memory: 820 * 1024 ** 2,
          maxmemory: 2 * 1024 ** 3,
          maxmemory_policy: "allkeys-lru",
          keys: 18422,
          expires: 902,
          evicted: 45120,
          hits: 91200,
          misses: 8400,
          clients: 14,
        },
      },
      {
        uuid: "s3-1",
        kind: "s3",
        status: "up",
        seen_at: at,
        age_ms: 1000,
        name: "s3",
        hostname: "minio-01",
        ready: true,
        host: host(0.08, 0.2),
        window_s: 10,
        io: {
          api: {
            ops: 22 * wobble,
            in: 4 * 1024 ** 2,
            out: 900 * 1024,
            p50_ms: 6,
            p95_ms: 28,
            max_ms: 120,
          },
        },
        s3: {
          ok: true,
          version: "RELEASE.2024-01-01",
          endpoint: "http://minio:9000",
          bucket: "waf-bodies",
          region: "us-east-1",
          objects: 148_223,
          used_bytes: 41 * 1024 ** 3,
          capacity: 200 * 1024 ** 3,
          buckets: 3,
        },
      },
    ],
    services: [
      {
        uuid: "svc-logger",
        kind: "service",
        status: "up",
        seen_at: at,
        age_ms: 1000,
        name: "logger",
        hostname: "logger-01",
        ready: true,
        host: host(0.18, 0.9),
        window_s: 10,
        work: {
          inserted: 1_204_882,
          last_batch: 512,
          lag: 84_000,
          clickhouse_ok: true,
          fingerprint: "sha256:cafe000000000000000000000000beef",
        },
        bus: { reconnects: 0, rtt_ms: 0.6 },
        io: {
          consume: { ops: 1240 * wobble, in: 2.2 * 1024 ** 2 },
          insert: { ops: 12 * wobble, p50_ms: 22, p95_ms: 90, max_ms: 260 },
        },
      },
      {
        uuid: "svc-logger-2",
        kind: "service",
        status: "up",
        seen_at: at,
        age_ms: 1000,
        name: "logger",
        hostname: "logger-02",
        ready: true,
        host: host(0.44, 2.1),
        window_s: 10,
        work: {
          inserted: 880_140,
          last_batch: 480,
          lag: 41_000,
          clickhouse_ok: true,
          fingerprint: "sha256:cafe000000000000000000000000beef",
        },
        io: {
          consume: { ops: 1240 * wobble, in: 2.2 * 1024 ** 2 },
          insert: { ops: 12 * wobble, p50_ms: 22, p95_ms: 90, max_ms: 260 },
        },
      },
      {
        uuid: "svc-geo",
        kind: "service",
        status: "up",
        seen_at: at,
        age_ms: 1000,
        name: "geo",
        hostname: "geo-01",
        ready: false,
        host: host(0.09, 0.3),
        window_s: 10,
        work: {
          countries: 249,
          asns: 82000,
          skipped: 12,
          gen: 42,
          error: "mmdb: GeoLite2-ASN.mmdb is 46 days old",
          fingerprint: "sha256:0123000000000000000000000000cafe",
        },
        io: {
          probe: { ops: 4 * wobble, p50_ms: 1.2, p95_ms: 2.4, max_ms: 5 },
        },
        errors: [
          {
            at: ago(3600),
            msg: "mmdb: download geoip.maxmind.com: 403 Forbidden",
            count: 6,
            source: "probe",
          },
        ],
      },
    ],
  };
}

function Preview() {
  useEffect(() => {
    let seq = 1;
    // Полоса красит живость по лампе, а лампа без соединения красная.
    store.dispatch(setConnected(true));
    store.dispatch(applyFleetSnapshot(snapshot(seq)));
    for (const id of [
      "agent-1",
      "inspector:modsec",
      "service:geo",
    ]) {
      if (!store.getState().pages.fleet.expanded.includes(id)) {
        store.dispatch(toggleExpanded(id));
      }
    }
    const timer = setInterval(() => {
      seq += 1;
      store.dispatch(applyFleetSnapshot(snapshot(seq)));
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Полоса страницы -- часть того, что смотрят: в ней живость и ошибки. */}
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <ShellPageBar />
      </Box>
      <Box sx={{ p: 3 }}>
        <FleetPage />
      </Box>
    </Box>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <AppThemeProvider>
        <LocaleProvider>
          <MemoryRouter>
            <PageBarProvider>
              <Preview />
            </PageBarProvider>
          </MemoryRouter>
        </LocaleProvider>
      </AppThemeProvider>
    </Provider>
  </StrictMode>,
);
