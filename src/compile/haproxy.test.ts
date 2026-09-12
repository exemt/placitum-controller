import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHaproxyConf,
  fmtMs,
  hashHaproxyConf,
  parseHaproxyConfPointer,
  renderHaproxyCfg,
} from "./haproxy.ts";

test("fmtMs: круглые сроки печатаются крупной единицей", () => {
  assert.equal(fmtMs(2000), "2s");
  assert.equal(fmtMs(90000), "90s");
  assert.equal(fmtMs(60000), "1m");
  assert.equal(fmtMs(3600000), "1h");
  assert.equal(fmtMs(250), "250ms");
});

test("renderHaproxyCfg: пустой документ -- поставочный конфиг стенда", () => {
  const cfg = renderHaproxyCfg({});

  // Ключевые строки поставочного конфига (bootstrap в haproxy/agent/entrypoint.sh).
  assert.match(cfg, /maxconn {5}4096/);
  assert.match(cfg, /tune\.bufsize 1048576/);
  assert.match(cfg, /resolvers docker/);
  assert.match(cfg, /timeout connect {9}2s/);
  assert.match(cfg, /timeout tunnel {10}1h/);
  assert.match(cfg, /bind \*:8080/);
  assert.match(cfg, /balance roundrobin/);
  assert.match(cfg, /option httpchk GET \/healthz/);
  assert.match(cfg, /http-check expect status 200/);
  assert.match(
    cfg,
    /server edge-01 edge-01:8080 check inter 2s resolvers docker init-addr last,libc,none/,
  );
  assert.match(cfg, /server edge-03 edge-03:8080/);
  assert.match(cfg, /bind \*:8404/);
});

test("renderHaproxyCfg: правки печатаются, docker_dns=off убирает резолвер", () => {
  const cfg = renderHaproxyCfg({
    process: { maxconn: 128 },
    timeouts: { tunnelMs: 120000 },
    frontend: { port: 9090 },
    backend: {
      balance: "leastconn",
      check: { path: "/ping", status: 204, interMs: 500 },
      servers: [{ name: "app-1", host: "10.0.0.5", port: 8081 }],
    },
    stats: { enabled: false },
    dockerDns: false,
  });

  assert.match(cfg, /maxconn {5}128/);
  assert.match(cfg, /timeout tunnel {10}2m/);
  assert.match(cfg, /bind \*:9090/);
  assert.match(cfg, /balance leastconn/);
  assert.match(cfg, /option httpchk GET \/ping/);
  assert.match(cfg, /http-check expect status 204/);
  assert.match(cfg, /server app-1 10\.0\.0\.5:8081 check inter 500ms\n/);
  assert.doesNotMatch(cfg, /resolvers/);
  assert.doesNotMatch(cfg, /listen stats/);
});

test("хеш стабилен и совпадает с указателем", () => {
  const settings = { frontend: { port: 8081 } };
  const hash = hashHaproxyConf(settings);

  assert.equal(hash, hashHaproxyConf({ frontend: { port: 8081 } }));
  assert.notEqual(hash, hashHaproxyConf({}));

  const pointer = buildHaproxyConf(settings, 3);
  assert.equal(pointer.sha256, hash);
  assert.equal(pointer.rev, 3);
  assert.equal(pointer.cfg, renderHaproxyCfg(settings));
});

test("parseHaproxyConfPointer: свой указатель принимается, мусор нет", () => {
  const pointer = buildHaproxyConf({}, 1);
  assert.deepEqual(parseHaproxyConfPointer(pointer), pointer);

  assert.equal(parseHaproxyConfPointer(null), null);
  assert.equal(parseHaproxyConfPointer({ v: 1, kind: "agent-conf" }), null);
  assert.equal(
    parseHaproxyConfPointer({ v: 1, kind: "haproxy-conf", rev: 0, sha256: "x", cfg: "" }),
    null,
  );
  assert.equal(
    parseHaproxyConfPointer({ v: 1, kind: "haproxy-conf", rev: 1, sha256: "x" }),
    null,
  );
});
