/**
 * Основной компилятор: compileMain + compileHttp.
 * raw пространства заменяет файл целиком.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { compileHttp } from "./nginx-http.ts";
import { compileMain } from "./nginx-main.ts";
import { compileNginx, validateNginxExport, type NginxExport } from "./nginx.ts";

function emptySpace(): NginxExport["space"] {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "default",
    nginxMain: {},
    nginx: {},
    wafHttp: {},
    waf: {},
    raw: false,
    rawNginx: "",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function emptySource(space = emptySpace()): NginxExport {
  return {
    space,
    inspectors: [],
    datasets: [],
    denyResponses: [],
    bodyStores: [],
    logFormats: [],
    upstreams: [],
    ports: [],
    certificates: [],
    servers: [],
    contentObjects: [],
  };
}

test("склеивает compileMain и compileHttp", () => {
  const space = emptySpace();
  space.nginxMain = {
    loadModules: ["modules/ngx_http_waf_module.so"],
    workerProcesses: 2,
    errorLog: "/var/log/nginx/error.log info",
    events: { workerConnections: 1024 },
  };
  space.nginx = { sendfile: true };

  const source = emptySource(space);
  const expected = compileMain(space.nginxMain).text + compileHttp({ nginx: space.nginx }).text;

  assert.equal(compileNginx(source).text, expected);
});

test("raw пространства -- весь файл, без events и http", () => {
  const space = emptySpace();
  space.raw = true;
  space.rawNginx = "worker_processes 1;\nevents {}\nhttp { include /tmp/x.conf; }";
  space.nginxMain = { loadModules: ["modules/ngx_http_waf_module.so"] };

  const { text } = compileNginx(emptySource(space));
  assert.equal(text, space.rawNginx + "\n");
  assert.doesNotMatch(text, /load_module/);
});

test("raw собирает store:<uuid> из текста оператора", () => {
  const cert = "00000000-0000-4000-8000-000000000099";
  const space = emptySpace();
  space.raw = true;
  space.rawNginx = `ssl_certificate store:${cert};`;

  const { storeRefs } = compileNginx(emptySource(space));
  assert.deepEqual(storeRefs, [cert]);
});

test("proxy_pass uses upstream name and colon profile", () => {
  const source: NginxExport = {
    space: {
      ...emptySpace(),
      wafHttp: {
        bus: { urls: ["nats://127.0.0.1:4222"] },
        agentSocket: "/tmp/waf.sock",
        // Локальный слой сервера ниже: без зоны такой конфиг не проходит -t.
        shmZone: { name: "waf", size: "32m" },
      },
    },
    inspectors: [
      {
        id: "i1",
        httpSpaceId: "s",
        name: "modsec",
        subject: "waf.req.modsec",
        phases: ["request"],
      },
    ],
    datasets: [
      {
        id: "ds1",
        httpSpaceId: "s",
        name: "allowlist",
        description: "",
        kind: "list",
        type: "ip",
        maxEntries: 1024,
        inNginx: true,
        active: true,
        size: 0,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
    denyResponses: [],
    bodyStores: [],
    logFormats: [],
    // Активный набор читает пакеты keeper из внутреннего Redis: без адреса
    // http {} не компилируется.
    infra: { redisInternalUrl: "redis://redis-internal:6379" },
    upstreams: [
      {
        id: "u1",
        name: "backend",
        method: "round_robin",
        peers: [{ host: "backend", port: 8080, weight: 1, backup: false, down: false }],
      },
    ],
    ports: [],
    certificates: [],
    contentObjects: [],
    servers: [
      {
        server: {
          id: "srv",
          httpSpaceId: "s",
          name: "main",
          serverNames: [],
          enabled: true,
          nginx: { root: "/var/www" },
          waf: {
            enabled: true,
            inspectors: {
              modsec: {
                timeoutMs: 500,
                needs: "headers,args,body",
                body: "full",
                allowHeaders: ["x-request-id"],
              },
            },
            requestInspectors: [{ name: "modsec", profile: "strict" }],
            inspectorModes: { ip: "ignore" },
            localChecks: [
              { dataset: "allowlist", variable: "$binary_remote_addr", action: "allow" },
            ],
            localRates: [{ key: "$binary_remote_addr", rate: "5r/s", burst: 5 }],
          },
          raw: false,
          rawNginx: "",
        },
        listens: [
          {
            id: "b",
            serverId: "srv",
            portId: "p",
            ssl: false,
            http2: false,
            proxyProtocol: false,
            defaultServer: false,
            port: {
              id: "p",
              httpSpaceId: "s",
              name: "http",
              address: "0.0.0.0",
              port: 8080,
              ssl: false,
              http2: false,
              proxyProtocol: false,
            },
          },
        ],
        certificates: [],
        locations: [
          {
            id: "deny",
            serverId: "srv",
            match: "named",
            path: "waf_deny",
            position: 0,
            enabled: true,
            handler: "static",
            protocol: "http",
            nginx: { ssi: true, ssiTypes: ["*"], tryFiles: ["/blocked.html"] },
            waf: { enabled: false },
            raw: false,
            rawNginx: "",
            builtin: false,
          },
          {
            id: "loc",
            serverId: "srv",
            match: "prefix",
            path: "/app/",
            position: 1,
            enabled: true,
            handler: "proxy",
            protocol: "http",
            upstreamId: "u1",
            upstreamUri: "/",
            nginx: {},
            waf: {},
            raw: false,
            rawNginx: "",
            builtin: false,
          },
        ],
      },
    ],
  };

  const { text } = compileNginx(source);
  assert.match(text, /^\n?events \{\n\}\n\nhttp \{/);
  assert.match(text, /proxy_pass http:\/\/backend\/;/);
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec profile=strict;/);
  assert.match(text, /waf_inspect request modsec wave=0 timeout=500ms;/);
  assert.doesNotMatch(text, /waf_request_inspectors|waf_inspector_mode|waf_inspector_profile /);
  assert.doesNotMatch(text, /waf_inspect ip|mode=ignore/);
  assert.match(text, /waf_local_check allowlist \$binary_remote_addr action=allow;/);
  assert.match(text, /waf_local_rate \$binary_remote_addr rate=5r\/s burst=5;/);
  assert.doesNotMatch(text, /timeout=500ms needs=|waf_inspector_allow_/);
  assert.match(text, /location @waf_deny \{/);
  assert.doesNotMatch(text, /modsec@/);
  assert.doesNotMatch(text, /variable=/);
  assert.doesNotMatch(text, /key=\$/);
  assert.doesNotMatch(text, /allow_headers=/);
  assert.doesNotMatch(text, /waf_body_allow_remote|waf_body_store|waf_body_archive/);
  assert.doesNotMatch(text, /waf_request_body_access|waf_body /);
});

/**
 * Парность keep=/resume= -- по эффективным маршрутам, как nginx -t на ноде.
 * Фикстура минимальная: компилятор здесь не вызывается дальше validate.
 */
function pairSource(
  serverWaf: NginxExport["servers"][number]["server"]["waf"],
  locations: {
    path: string;
    waf: NginxExport["servers"][number]["server"]["waf"];
    protocol?: "http" | "websocket";
  }[],
): NginxExport {
  const source = emptySource({
    ...emptySpace(),
    wafHttp: { bus: { urls: ["nats://127.0.0.1:4222"] }, agentSocket: "/tmp/waf.sock" },
    // Вызовы ссылаются на объявления: без узла графа набор -- undeclared_inspector.
    waf: { inspectors: { modsec: {} } },
  });
  source.inspectors = [
    {
      id: "i1",
      httpSpaceId: "s",
      name: "modsec",
      subject: "waf.req.modsec",
      phases: ["request", "response"],
    },
  ];
  source.servers = [
    {
      server: {
        id: "srv",
        httpSpaceId: "s",
        name: "main",
        serverNames: ["a"],
        enabled: true,
        nginx: {},
        waf: serverWaf,
        raw: false,
        rawNginx: "",
      },
      listens: [],
      certificates: [],
      locations: locations.map((loc, i) => ({
        id: `loc${i}`,
        serverId: "srv",
        match: "prefix" as const,
        path: loc.path,
        position: i,
        enabled: true,
        // websocket-путь обязан проксировать: иначе сборка падает раньше пары.
        handler: loc.protocol === "websocket" ? ("proxy" as const) : ("static" as const),
        protocol: loc.protocol ?? "http",
        nginx: {},
        waf: loc.waf,
        raw: false,
        rawNginx: "",
        builtin: false,
      })),
    },
  ];
  return source;
}

const codes = (source: NginxExport) =>
  validateNginxExport(source, new Set()).map((e) => e.code).sort();

test("validate: keep=on и resume= парой на одном маршруте -- чисто", () => {
  const source = pairSource({}, [
    {
      path: "/leaks/",
      waf: {
        requestInspectors: [{ name: "modsec", keep: true }],
        responseInspectors: [{ name: "modsec", resume: "prefer" }],
      },
    },
  ]);
  assert.deepEqual(codes(source), []);
});

test("validate: keep на сервере, resume в location -- чисто по листьям", () => {
  // Сервер сам по себе пары не составляет, но у него есть location, и там
  // пара сходится. Проверяются листья, а не уровни.
  const source = pairSource({ requestInspectors: [{ name: "modsec", keep: true }] }, [
    { path: "/a/", waf: { responseInspectors: [{ name: "modsec", resume: "require" }] } },
  ]);
  assert.deepEqual(codes(source), []);
});

test("validate: resume= без keep=on -- ошибка", () => {
  const source = pairSource({}, [
    {
      path: "/leaks/",
      waf: {
        requestInspectors: [{ name: "modsec" }],
        responseInspectors: [{ name: "modsec", resume: "prefer" }],
      },
    },
  ]);
  assert.deepEqual(codes(source), ["resume_without_keep"]);
});

test("validate: keep=on без потребителя -- ошибка, в том числе унаследованный", () => {
  // Первый location переопределил ответ без resume, второй унаследовал с
  // сервера пустой ответ: оба -- keep без потребителя.
  const source = pairSource({ requestInspectors: [{ name: "modsec", keep: true }] }, [
    { path: "/a/", waf: { responseInspectors: [{ name: "modsec" }] } },
    { path: "/b/", waf: {} },
  ]);
  assert.deepEqual(codes(source), ["keep_without_resume", "keep_without_resume"]);
});

test("validate: websocket-путь не потребляет продолжение -- keep=on без пары", () => {
  // Сервер держит modsec на запросе и продолжает на ответе, но у websocket-пути
  // фазы ответа нет (компилятор печатает `response none`), а кадры транзакцию
  // рукопожатия не продолжают: унаследованный `resume=` там никого не спасает.
  const source = pairSource(
    {
      requestInspectors: [{ name: "modsec", keep: true }],
      responseInspectors: [{ name: "modsec", resume: "prefer" }],
    },
    [
      { path: "/api/", waf: {} },
      { path: "/ws/", waf: {}, protocol: "websocket" },
    ],
  );
  assert.deepEqual(codes(source), ["keep_without_resume"]);
});
