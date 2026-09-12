/**
 * Компилятор `http {}`: настройки пространства, каталоги, апстримы и серверы.
 * Серверы собирает compileServer.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { NGINX_MAX_DATASETS, type Dataset, type Inspector } from "../model/http-space.ts";
import type { Location } from "../model/location.ts";
import type { Server } from "../model/server.ts";
import { flattenColumns } from "./nginx-align.ts";
import {
  compileHttp as compileHttpColumns,
  NginxCompileError,
  WafCompileError,
} from "./nginx-http.ts";

/*
  Колонки печати -- забота nginx-align.ts, и проверяет их nginx-align.test.ts.
  Здесь текст читают по директивам, поэтому столбик схлопывается обратно в один
  пробел: иначе каждая проверка зависела бы от длины соседнего имени в том же
  блоке -- новое имя в наборе роняло бы те, что про него ничего не знают.
*/
const compileHttp: typeof compileHttpColumns = (source, ...rest) => {
  // Внутренний Redis подставляется, как на стенде: активный набор без него --
  // ошибка компиляции, и проверяется она своим тестом через compileHttpColumns.
  const withInfra = {
    ...source,
    infra: { redisInternalUrl: "redis://redis-internal:6379", ...(source.infra ?? {}) },
  };
  const out = compileHttpColumns(withInfra, ...rest);
  return { ...out, text: flattenColumns(out.text) };
};

import type { ServerExport, Upstream } from "./nginx-source.ts";

const SPACE = "00000000-0000-4000-8000-000000000001";
const SERVER = "00000000-0000-4000-8000-000000000010";
const UPSTREAM = "00000000-0000-4000-8000-000000000020";

function inspector(name = "modsec"): Inspector {
  return {
    id: "00000000-0000-4000-8000-0000000000i1",
    httpSpaceId: SPACE,
    name,
    subject: "waf.req.modsec",
    phases: ["request"],
  };
}

function server(extra: Partial<Server> = {}, locations: Location[] = []): ServerExport {
  return {
    server: {
      id: SERVER,
      httpSpaceId: SPACE,
      name: extra.name ?? "edge",
      serverNames: extra.serverNames ?? [],
      enabled: extra.enabled ?? true,
      nginx: extra.nginx ?? {},
      waf: extra.waf ?? {},
      raw: extra.raw ?? false,
      rawNginx: extra.rawNginx ?? "",
    },
    listens: [
      {
        id: "b",
        serverId: SERVER,
        portId: "p",
        ssl: false,
        http2: false,
        proxyProtocol: false,
        defaultServer: false,
        port: {
          id: "p",
          httpSpaceId: SPACE,
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
    locations,
  };
}

const BUS = { bus: { urls: ["nats://127.0.0.1:4222"] } };
/** Локальный слой без зоны -- `nginx -t`, поэтому фикстуры с ним берут её. */
const SHM = { shmZone: { name: "waf", size: "32m" } };

function dataset(name: string, extra: Partial<Dataset> = {}): Dataset {
  return {
    id: `00000000-0000-4000-8000-0000000000${name.length}1`,
    httpSpaceId: SPACE,
    name,
    description: "",
    kind: "list",
    type: "string",
    maxEntries: 1000,
    inNginx: true,
    active: true,
    size: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  };
}

function backend(): Upstream {
  return {
    id: UPSTREAM,
    name: "backend",
    method: "round_robin",
    peers: [{ host: "backend", port: 8080, weight: 1, backup: false, down: false }],
  };
}

test("пустой http -- скобки и absolute_redirect: он печатается всегда", () => {
  assert.equal(compileHttp({}).text, "http {\n    absolute_redirect off;\n}\n");
});

test("nginx jsonb пространства: include, sendfile, keepalive", () => {
  const expected = `http {
    include /etc/nginx/mime.types;
    include /etc/nginx/waf-node.conf;
    absolute_redirect off;
    sendfile on;
    keepalive_timeout 65s;
    default_type application/octet-stream;
    access_log /var/log/nginx/access.log;
}
`;
  assert.equal(
    compileHttp({
      nginx: {
        includes: ["/etc/nginx/mime.types", "/etc/nginx/waf-node.conf"],
        sendfile: true,
        keepaliveTimeoutS: 65,
        defaultType: "application/octet-stream",
        accessLog: [{ path: "/var/log/nginx/access.log" }],
      },
    }).text,
    expected,
  );
});

/*
  Пара «буфер + каталог»: тело крупнее буфера уезжает в файл, и каталог решает,
  окажется ли этот файл на диске. Печатаются рядом, чтобы читались вместе.
*/
test("nginx jsonb пространства: буфер тела и каталог временных файлов", () => {
  const expected = `http {
    absolute_redirect off;
    client_body_buffer_size 64k;
    client_body_temp_path /dev/shm/client_temp;
}
`;
  assert.equal(
    compileHttp({
      nginx: {
        clientBodyBufferSize: "64k",
        clientBodyTempPath: "/dev/shm/client_temp",
      },
    }).text,
    expected,
  );
});

test("waf_http: зона, потолок, сокет агента", () => {
  const expected = `http {
    absolute_redirect off;
    waf_shm_zone waf 8m;
    waf_max_inflight 4096;
    waf_agent_socket /var/run/waf/verdict.sock;
}
`;
  assert.equal(
    compileHttp({
      wafHttp: {
        maxInflight: 4096,
        agentSocket: "/var/run/waf/verdict.sock",
        shmZone: { name: "waf", size: "8m" },
      },
    }).text,
    expected,
  );
});

test("граф в waf.inspectors + subject из реестра", () => {
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: {
      inspectors: {
        modsec: {
          timeoutMs: 500,
          needs: "headers,args,body",
          body: "full",
          allowHeaders: ["x-request-id"],
        },
      },
    },
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec;/);
  assert.doesNotMatch(text, /timeout=|needs=|body=|allow_headers|waf_inspector_allow_/);
});

test("устаревшие needs/body на реестре не печатаются", () => {
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: {
      inspectors: {
        modsec: { needs: "headers,args,body", body: "none" },
      },
    },
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec;/);
  assert.doesNotMatch(text, /needs=|body=/);
});

test("profile с узла и с маршрута -- на waf_inspector", () => {
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: { inspectors: { modsec: { profile: "strict" } } },
    servers: [server({ waf: { requestInspectors: [{ name: "modsec" }] } })],
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec profile=strict;/);
  assert.match(text, /waf_inspect request modsec wave=0;/);
});

test("реестр без графа не печатает waf_inspector", () => {
  const { text } = compileHttp({ inspectors: [inspector()] });
  assert.doesNotMatch(text, /waf_inspector /);
});

/*
 * Права на подмену в конфигурации больше нет: mutate= снят у директивы, и
 * модуль принимает секцию rewrite от любой декларации. Раньше сборка выводила
 * его из сервиса процесса -- проверяем, что не выводит ни у кого, включая тех,
 * кто подменой и живёт.
 */
test("mutate= не печатается ни одной декларации", () => {
  const rw = inspector("rewrite");
  rw.subject = "waf.req.rewrite";
  rw.phases = ["response"];
  const auth = inspector("auth");
  auth.subject = "waf.req.auth";
  const captcha = inspector("captcha");
  captcha.subject = "waf.req.captcha";

  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), rw, auth, captcha],
    waf: {
      inspectors: {
        modsec: {},
        rewrite: {},
        "rewrite-observe": { process: "rewrite", profile: "observe" },
        auth: {},
        captcha: {},
      },
    },
  });

  assert.doesNotMatch(text, /mutate=/);
  assert.match(text, /waf_inspector rewrite subject=waf\.req\.rewrite;/);
  assert.match(
    text,
    /waf_inspector rewrite-observe subject=waf\.req\.rewrite profile=observe;/,
  );
  assert.match(text, /waf_inspector auth subject=waf\.req\.auth;/);
  assert.match(text, /waf_inspector captcha subject=waf\.req\.captcha;/);
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec;/);
});

/*
 * Две капчи на одном маршруте -- отказ сборки: билет и клиренс у профилей под
 * одними куками, второй виджет затирает первый. Две калитки -- законная
 * стыковка факторов (пароль, затем код), у каждого источника своя кука.
 */
test("две капчи на одном маршруте -- captcha_duplicate, две калитки -- нет", () => {
  const captcha = inspector("captcha");
  captcha.subject = "waf.req.captcha";
  const auth = inspector("auth");
  auth.subject = "waf.req.auth";

  const inspectors = { inspectors: { captcha: {}, "captcha-form": { process: "captcha", profile: "form" }, auth: {}, "auth-totp": { process: "auth", profile: "totp" } } };

  assert.throws(
    () =>
      compileHttp({
        wafHttp: BUS,
        inspectors: [captcha, auth],
        waf: inspectors,
        servers: [
          server({}, [
            location({
              requestInspectors: [
                { name: "captcha", wave: 0 },
                { name: "captcha-form", wave: 1 },
              ],
            }),
          ]),
        ],
      }),
    (err: unknown) =>
      err instanceof WafCompileError &&
      err.code === "captcha_duplicate" &&
      /captcha, captcha-form/.test(err.message) &&
      /\/api\//.test(err.message),
  );

  // Унаследованный с сервера набор судится так же, как и свой.
  assert.throws(
    () =>
      compileHttp({
        wafHttp: BUS,
        inspectors: [captcha, auth],
        waf: inspectors,
        servers: [
          server(
            { waf: { requestInspectors: [{ name: "captcha" }, { name: "captcha-form" }] } },
            [location({})],
          ),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "captcha_duplicate",
  );

  assert.doesNotThrow(() =>
    compileHttp({
      wafHttp: BUS,
      inspectors: [captcha, auth],
      waf: inspectors,
      servers: [
        server({}, [
          location({
            requestInspectors: [
              { name: "auth", wave: 1 },
              { name: "auth-totp", wave: 2 },
              { name: "captcha", wave: 0 },
            ],
          }),
        ]),
      ],
    }),
  );
});

test("узел с пути попадает в http, http побеждает при конфликте", () => {
  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000i2";
  ip.subject = "waf.req.ip";
  ip.position = 20;
  const loc: Location = {
    id: "loc",
    serverId: SERVER,
    match: "prefix",
    path: "/app/",
    position: 0,
    enabled: true,
    handler: "static",
    protocol: "http",
    nginx: {},
    waf: { inspectors: { ip: { timeoutMs: 5, needs: "none" } } },
    raw: false,
    rawNginx: "",
    builtin: false,
  };
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), ip],
    waf: {
      inspectors: {
        modsec: { timeoutMs: 500, after: ["ip"] },
        ip: { timeoutMs: 20, needs: "none" },
      },
    },
    servers: [
      server({ waf: { requestInspectors: [{ name: "ip" }, { name: "modsec" }] } }, [loc]),
    ],
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec;/);
  assert.match(text, /waf_inspector ip subject=waf\.req\.ip;/);
  assert.match(text, /waf_inspect request ip wave=0 timeout=20ms;/);
  assert.match(text, /waf_inspect request modsec wave=1 timeout=500ms;/);
  assert.doesNotMatch(text, /timeout=5ms|after=|needs=/);
});

test("реестр печатается столбиком: имена и subject= по колонкам", () => {
  // Пасс колонок разобран в nginx-align.test.ts; здесь проверяется, что печать
  // http {} через него проходит -- иначе реестр уехал бы в один пробел молча.
  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000i2";
  ip.subject = "waf.req.ip";
  const { text } = compileHttpColumns({
    wafHttp: BUS,
    inspectors: [inspector(), ip],
    waf: { inspectors: { modsec: { profile: "strict" }, ip: {} } },
    servers: [
      server({ waf: { requestInspectors: [{ name: "ip" }, { name: "modsec" }] } }),
    ],
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec profile=strict;/);
  assert.match(text, /waf_inspector ip     subject=waf\.req\.ip;/);
});

test("wave из after, явный wave побеждает", () => {
  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000i2";
  ip.subject = "waf.req.ip";
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), ip],
    waf: {
      inspectors: {
        ip: { timeoutMs: 20, after: [] },
        modsec: { timeoutMs: 500, after: ["ip"] },
      },
    },
    servers: [
      server({
        waf: {
          requestInspectors: [
            { name: "ip" },
            { name: "modsec", wave: 3, timeoutMs: 100 },
          ],
        },
      }),
    ],
  });
  assert.match(text, /waf_inspect request ip wave=0 timeout=20ms;/);
  assert.match(text, /waf_inspect request modsec wave=3 timeout=100ms;/);
});

test("none и все ignore -- waf_inspect request none", () => {
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: { inspectors: { modsec: {} } },
    servers: [server({ waf: { requestInspectors: "none" } })],
  });
  assert.match(text, /waf_inspect request none;/);

  const ignored = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: { inspectors: { modsec: {} } },
    servers: [
      server({
        waf: {
          requestInspectors: [{ name: "modsec" }],
          inspectorModes: { modsec: "ignore" },
        },
      }),
    ],
  });
  assert.match(ignored.text, /waf_inspect request none;/);
  assert.doesNotMatch(ignored.text, /waf_inspect request modsec/);
});

test("пустой набор запроса -- none, а не наследование родителя", () => {
  // Сервер зовёт modsec, маршрут «задать» очистил до пуста: это «никого» на
  // маршруте, а не молчаливый возврат к набору сервера.
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: { inspectors: { modsec: {} } },
    servers: [
      server({ waf: { requestInspectors: [{ name: "modsec" }] } }, [
        location({ requestInspectors: [] }, "/open"),
      ]),
    ],
  });
  const open = text.slice(text.indexOf("location /open"), text.indexOf("location /open") + 400);
  assert.match(open, /waf_inspect request none;/);
  assert.doesNotMatch(open, /waf_inspect request modsec/);
});

test("порядок ключей графа -- порядок waf_inspector, не position каталога", () => {
  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000i2";
  ip.subject = "waf.req.ip";
  ip.position = 10;
  const modsec = inspector("modsec");
  modsec.position = 20;
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [ip, modsec],
    waf: {
      inspectors: {
        ip: { timeoutMs: 20, needs: "none" },
        modsec: { timeoutMs: 500, after: ["ip"] },
      },
    },
  });
  const ipAt = text.indexOf("waf_inspector ip ");
  const modsecAt = text.indexOf("waf_inspector modsec ");
  assert.ok(ipAt >= 0 && modsecAt > ipAt);
});

test("имя вне реестра -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        inspectors: [inspector()],
        waf: { inspectors: { ghost: { timeoutMs: 10 } } },
      }),
    (err: unknown) => err instanceof NginxCompileError && err.names.includes("ghost"),
  );
});

test("имя только на пути объявляется в http {}", () => {
  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000i2";
  ip.subject = "waf.req.ip";
  ip.position = 20;
  const loc: Location = {
    id: "loc",
    serverId: SERVER,
    match: "prefix",
    path: "/app/",
    position: 0,
    enabled: true,
    handler: "static",
    protocol: "http",
    nginx: {},
    waf: { inspectors: { ip: { timeoutMs: 5, needs: "none" } } },
    raw: false,
    rawNginx: "",
    builtin: false,
  };
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), ip],
    waf: { inspectors: { modsec: { timeoutMs: 500 } } },
    servers: [server({}, [loc])],
  });
  assert.match(text, /waf_inspector ip subject=waf\.req\.ip;/);
  assert.doesNotMatch(text, /timeout=5ms|needs=/);
});

test("обменник без имени, archive и preview -- по строке на объект", () => {
  // Обменник -- конфигурация контура и стоит в http; снимок и архив -- решения по
  // запросу и стоят на сервере.
  const expected = `http {
    absolute_redirect off;
    waf_store driver=redis url=redis://redis:6379 ttl=1m;

    server {
        listen 8080;
        waf_deadline request 200ms;
        waf_exception request timeout pass;
        waf_body_limit request 1m trim;
        waf_archive request headers ttl=30d;
        waf_archive request body=8k ttl=180d;
        waf_preview request headers=30k/2k;
        waf_preview request headers deny=x-api-key;
        waf_preview request args=8k;
        waf_preview request body=10k;
        waf_capture request headers args body;
        waf_capture request headers deny=x-api-key;
        waf_capture request args mask=token;
    }
}
`;
  assert.equal(
    compileHttp({
      servers: [
        server({
          waf: {
            capture: [
              "headers",
              "args",
              "body",
              "headers deny=x-api-key",
              "args mask=token",
            ],
            archive: ["request headers ttl=30d", "request body=8k ttl=180d"],
            preview: ["headers=30k/2k", "headers deny=x-api-key", "args=8k", "body=10k"],
            deadlineMs: 200,
            exception: ["request timeout pass"],
            bodyLimit: "1m",
            bodyLimitPolicy: "trim",
          },
        }),
      ],
      bodyStores: [
        {
          id: "bs1",
          httpSpaceId: SPACE,
          name: "hot",
          driver: "redis",
          spec: { ttl: "1m" },
        },
      ],
      infra: { redisUrl: "redis://redis:6379" },
    }).text,
    expected,
  );
});

test("обменник: адрес из окружения, а не из каталога", () => {
  // url в spec остался у пространств, заведённых до переноса адреса: печатать
  // его вместо окружения значило бы вернуть ту самую расходимость с агентом и
  // инспекторами, ради которой поле и убрали.
  const { text } = compileHttp({
    bodyStores: [
      {
        id: "bs1",
        httpSpaceId: SPACE,
        name: "hot",
        driver: "redis",
        spec: { url: "redis://stale:6379", ttl: "1m" },
      },
    ],
    infra: { redisUrl: "redis://redis:6379" },
  });
  assert.match(text, /waf_store driver=redis url=redis:\/\/redis:6379 ttl=1m;/);
  assert.doesNotMatch(text, /stale/);
});

test("обменник без адреса контроллера -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        bodyStores: [
          { id: "bs1", httpSpaceId: SPACE, name: "hot", driver: "redis", spec: { ttl: "1m" } },
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "store_url_unset",
  );
});

test("политику без её значения не печатать", () => {
  const { text } = compileHttp({
    servers: [server({ waf: { exception: ["request timeout deny"], bodyLimitPolicy: "trim" } })],
  });
  assert.doesNotMatch(text, /waf_deadline|waf_body_limit/);
});

test("upstream: имя пула и peer", () => {
  const expected = `http {
    absolute_redirect off;

    upstream backend {
        server backend:8080;
    }
}
`;
  assert.equal(compileHttp({ upstreams: [backend()] }).text, expected);
});

test("вставляет compileServer и пропускает выключенный сервер", () => {
  const loc: Location = {
    id: "loc",
    serverId: SERVER,
    match: "prefix",
    path: "/app/",
    position: 0,
    enabled: true,
    handler: "proxy",
    protocol: "http",
    upstreamId: UPSTREAM,
    upstreamUri: "/",
    nginx: {},
    waf: {},
    raw: false,
    rawNginx: "",
    builtin: false,
  };

  const { text } = compileHttp({
    upstreams: [backend()],
    servers: [
      server({ name: "off", enabled: false }),
      server({ name: "edge", nginx: { root: "/var/www" } }, [loc]),
    ],
  });

  assert.match(text, /upstream backend/);
  assert.match(text, /listen 8080;/);
  assert.match(text, /root \/var\/www;/);
  assert.match(text, /proxy_pass http:\/\/backend\/;/);
  assert.equal((text.match(/server \{/g) ?? []).length, 1);
});

test("nested=include: апстримы и серверы заглушками по uuid, выключенный закомментирован", () => {
  const { text } = compileHttp({
    upstreams: [backend()],
    servers: [
      server({ name: "off", enabled: false }),
      server({ name: "edge", serverNames: ["edge.test"], nginx: { root: "/var/www" } }),
    ],
    nested: "include",
  });

  assert.match(
    text,
    new RegExp(`^    include upstreams/${UPSTREAM}\\.conf; +# upstream backend$`, "m"),
  );
  assert.match(text, new RegExp(`^    include servers/${SERVER}\\.conf; +# server edge\\.test$`, "m"));
  // Выключенный сервер в файле не печатается, но карточка есть -- заглушка
  // закомментирована, а не пропущена. Без имён подписывается именем карточки.
  assert.match(
    text,
    new RegExp(`^    # include servers/${SERVER}\\.conf; +# server off \\(off\\)$`, "m"),
  );
  assert.doesNotMatch(text, /server \{|upstream backend \{|listen |root /);
});

test("request и response inspect -- две директивы, без phase=", () => {
  const json = inspector("json");
  json.id = "00000000-0000-4000-8000-0000000000i3";
  json.subject = "waf.req.json";
  json.phases = ["response"];
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), json],
    waf: { inspectors: { modsec: {}, json: {} } },
    servers: [
      server({
        waf: {
          requestInspectors: [{ name: "modsec" }],
          responseInspectors: [{ name: "json" }],
        },
      }),
    ],
  });
  assert.match(text, /waf_inspect request modsec wave=0;/);
  assert.match(text, /waf_inspect response json wave=0;/);
  assert.doesNotMatch(text, /phase=/);
});

/*
 * «Все» на фазе -- это все, кто её умеет. Инспектор запроса в наборе фазы
 * ответа означал бы вызов, на который никто не ответит: слот ждал бы вердикта
 * до дедлайна, и политика этой фазы отработала бы на пустом месте.
 *
 * Процесс, объявивший обе стороны, попадает в оба набора одним объявлением --
 * ради этого фазы и стали множеством.
 */
test("inspectors: all выбирает по заявленным фазам", () => {
  const both = inspector("modsec");
  both.phases = ["request", "response"];

  const json = inspector("json");
  json.id = "00000000-0000-4000-8000-0000000000i3";
  json.subject = "waf.req.json";
  json.phases = ["response"];

  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000i4";
  ip.subject = "waf.req.ip";
  ip.phases = ["request"];

  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [both, json, ip],
    waf: { inspectors: { modsec: {}, json: {}, ip: {} } },
    servers: [
      server({
        waf: { requestInspectors: "all", responseInspectors: "all" },
      }),
    ],
  });

  assert.match(text, /waf_inspect request modsec wave=0;/);
  assert.match(text, /waf_inspect request ip wave=0;/);
  assert.doesNotMatch(text, /waf_inspect request json /);

  assert.match(text, /waf_inspect response modsec wave=0;/);
  assert.match(text, /waf_inspect response json wave=0;/);
  assert.doesNotMatch(text, /waf_inspect response ip /);
});

test("resume= печатается на response и никогда на request", () => {
  const json = inspector("json");
  json.id = "00000000-0000-4000-8000-0000000000i3";
  json.subject = "waf.req.json";
  json.phases = ["response"];
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), json],
    waf: { inspectors: { modsec: {}, json: {} } },
    servers: [
      server({
        waf: {
          // resume на запросе парсер отвергает; эмит страхуется сам и не
          // печатает опцию даже для строки, пришедшей мимо парсера.
          requestInspectors: [{ name: "modsec", resume: "prefer" }],
          responseInspectors: [
            { name: "json", resume: "prefer" },
            { name: "modsec", wave: 1, resume: "off" },
          ],
        },
      }),
    ],
  });
  assert.match(text, /waf_inspect request modsec wave=0;/);
  assert.match(text, /waf_inspect response json wave=0 resume=prefer;/);
  // off -- умолчание модуля, его не пишем.
  assert.match(text, /waf_inspect response modsec wave=1;/);
});

test("keep=on печатается на request и никогда на response", () => {
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: { inspectors: { modsec: {} } },
    servers: [
      server({
        waf: {
          requestInspectors: [{ name: "modsec", keep: true, timeoutMs: 800 }],
          // keep на ответе парсер отвергает; эмит страхуется сам.
          responseInspectors: [{ name: "modsec", keep: true, resume: "require" }],
        },
      }),
    ],
  });
  assert.match(text, /waf_inspect request modsec wave=0 timeout=800ms keep=on;/);
  assert.match(text, /waf_inspect response modsec wave=0 resume=require;/);
  assert.doesNotMatch(text, /response modsec[^\n]*keep=/);
});

test("mode=off печатается на любой фазе, control= снят и не печатается", () => {
  const counter = inspector("counter");
  counter.id = "00000000-0000-4000-8000-0000000000c1";
  counter.subject = "waf.req.counter";
  counter.phases = ["request", "frame"];
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), counter],
    waf: { inspectors: { modsec: {}, counter: {} } },
    servers: [
      server({
        waf: {
          requestInspectors: [
            { name: "counter", wave: 0 },
            { name: "modsec", wave: 1, mode: "off" },
          ],
          responseInspectors: [{ name: "modsec" }],
        },
      }),
    ],
  });
  assert.match(text, /waf_inspect request counter wave=0;/);
  assert.match(text, /waf_inspect request modsec wave=1 mode=off;/);
  // active -- умолчание, не печатается.
  assert.match(text, /waf_inspect response modsec wave=0;/);
  assert.doesNotMatch(text, /when=/);
  assert.doesNotMatch(text, /control=/);
});

test("waf_hold response печатается из responseHold", () => {
  const { text } = compileHttp({
    wafHttp: BUS,
    servers: [server({ waf: { responseHold: "monitor" } })],
  });
  assert.match(text, /waf_hold response monitor;/);
});

test("датасет active без uuid, internal со строками entry", () => {
  const { text } = compileHttp({
    // Слот без waf_shm_zone -- `nginx -t`, поэтому зона в фикстуре.
    wafHttp: SHM,
    datasets: [
      {
        id: "ds1",
        httpSpaceId: SPACE,
        name: "blocklist",
        description: "",
        kind: "list",
        type: "ip",
        maxEntries: 1000000,
        inNginx: true,
        active: true,
        ttl: "5m",
        size: 0,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      {
        id: "ds2",
        httpSpaceId: SPACE,
        name: "office",
        description: "",
        kind: "list",
        type: "ip",
        maxEntries: 1024,
        inNginx: true,
        active: false,
        entries: ["10.0.0.0/8", "192.168.0.0/16"],
        size: 2,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      {
        id: "ds3",
        httpSpaceId: SPACE,
        name: "compiler_pack",
        description: "",
        kind: "list",
        type: "ip",
        maxEntries: 100,
        inNginx: false,
        active: false,
        entries: ["1.2.3.4"],
        size: 1,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
  });
  assert.match(text, /waf_local_dataset blocklist type=cidr limit=1000000 ttl=5m active;/);
  assert.match(text, /waf_local_dataset office type=cidr limit=1024 internal;/);
  assert.match(text, /waf_local_dataset office 10\.0\.0\.0\/8 192\.168\.0\.0\/16;/);
  assert.doesNotMatch(text, /waf_local_dataset [^\n]*(uuid=|max=|live_max=)/);
  assert.doesNotMatch(text, /compiler_pack/);
  // Активный набор читает пакеты и снапшоты keeper из внутреннего Redis:
  // адрес -- из окружения контроллера, как у обменника.
  assert.match(
    text,
    /waf_sets_store driver=redis url=redis:\/\/redis-internal:6379 pool=2 max=512m get_timeout=30s;/,
  );
});

test("активный набор без внутреннего Redis -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttpColumns({
        wafHttp: SHM,
        infra: { redisUrl: "redis://redis:6379" },
        datasets: [
          {
            id: "ds1",
            httpSpaceId: SPACE,
            name: "blocklist",
            description: "",
            kind: "list",
            type: "ip",
            maxEntries: 1000,
            inNginx: true,
            active: true,
            ttl: "5m",
            size: 0,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          },
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "sets_store_url_unset",
  );
});

test("два обменника -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        bodyStores: [
          {
            id: "a",
            httpSpaceId: SPACE,
            name: "hot",
            driver: "redis",
            spec: { url: "redis://a" },
          },
          {
            id: "b",
            httpSpaceId: SPACE,
            name: "cold",
            driver: "redis",
            spec: { url: "redis://b" },
          },
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "multiple_stores",
  );
});

test("local_check action=wave", () => {
  const { text } = compileHttp({
    wafHttp: SHM,
    datasets: [dataset("tokens")],
    servers: [
      server({
        waf: {
          localChecks: [
            { dataset: "tokens", variable: "$http_x_api_key", action: "wave" },
          ],
        },
      }),
    ],
  });
  assert.match(text, /waf_local_check tokens \$http_x_api_key action=wave;/);
});

test("снятое не печатается", () => {
  const { text } = compileHttp({
    wafHttp: {
      protocolVersions: [1],
      busFlushIntervalMs: 50,
      bus: { urls: ["nats://127.0.0.1:4222"], tls: true },
    },
    servers: [
      server({
        waf: {},
      }),
    ],
  });
  assert.match(text, /waf_bus nats:\/\/127\.0\.0\.1:4222;/);
  assert.doesNotMatch(text, /tls=|waf_protocol_versions|waf_bus_flush_interval|waf_response_body_access|waf_response_buffer_max|waf_audit/);
});

test("потолок кадра шины печатается опцией waf_bus", () => {
  // Умолчание модуля -- 1m, и нода с крупными буферами заголовков без этой
  // опции не проходит nginx -t: он считает худший inspect-пакет от их размера.
  const { text } = compileHttp({
    wafHttp: {
      bus: {
        urls: ["nats://nats:4222"],
        payloadMax: "16m",
        pendingMax: "8m",
      },
    },
  });
  assert.match(text, /waf_bus nats:\/\/nats:4222 pending_max=8m payload_max=16m;/);
});

test("шина: адрес из окружения, опции из документа", () => {
  // Сохранённый список адресов остаётся у пространств, заведённых до переноса
  // адреса в окружение: печатать его вместо CONTROLLER_NATS_URL значило бы
  // развести модуль с агентом и инспекторами, которые подняты вторым.
  const { text } = compileHttp({
    wafHttp: {
      bus: { urls: ["nats://stale:4222"], name: "waf-edge", payloadMax: "16m" },
    },
    infra: { natsUrl: "nats://nats:4222" },
  });
  assert.match(text, /waf_bus nats:\/\/nats:4222 name=waf-edge payload_max=16m;/);
  assert.doesNotMatch(text, /stale/);
});

test("шина: реквизиты только из окружения", () => {
  const { text } = compileHttp({
    wafHttp: { bus: {} },
    infra: { natsUrl: "nats://nats:4222", natsUser: "waf", natsPass: "secret" },
  });
  assert.match(text, /waf_bus nats:\/\/nats:4222 user=waf pass=secret;/);
});

test("шина печатается инспекторам и без документа шины", () => {
  // Пространство, заведённое после переноса, о шине в документе не говорит
  // ничего: адрес есть у контроллера, а инспекторы без waf_bus не публикуют.
  const { text } = compileHttp({
    inspectors: [inspector()],
    waf: { inspectors: { modsec: {} } },
    infra: { natsUrl: "nats://nats:4222" },
  });
  assert.match(text, /waf_bus nats:\/\/nats:4222;/);
});

test("инспекторы без шины -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        inspectors: [inspector()],
        waf: { inspectors: { modsec: {} } },
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "inspectors_need_bus",
  );
});

test("waf on без сокета -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: BUS,
        servers: [server({ waf: { enabled: true } })],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "agent_socket_required",
  );
});

test("score response= не из каталога -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        servers: [server({ waf: { scoreDeny: { threshold: 80, response: "missing" } } })],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "unknown_deny_response",
  );
});

test("archive при waf on без обменника -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: { ...BUS, agentSocket: "/tmp/waf.sock" },
        inspectors: [inspector()],
        waf: { inspectors: { modsec: {} } },
        servers: [
          server({
            waf: {
              enabled: true,
              requestInspectors: [{ name: "modsec" }],
              archive: ["request headers"],
            },
          }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "archive_needs_store",
  );
});

test("фаза ответа: capture, archive и preview печатаются со своей фазой", () => {
  const { text } = compileHttp({
    wafHttp: { ...BUS, agentSocket: "/tmp/waf.sock" },
    bodyStores: [{ id: "bs1", httpSpaceId: SPACE, name: "hot", driver: "redis", spec: { ttl: "1m" } }],
    infra: { redisUrl: "redis://redis:6379" },
    inspectors: [inspector()],
    waf: { inspectors: { modsec: {} } },
    servers: [
      server({
        waf: {
          enabled: true,
          requestInspectors: [{ name: "modsec" }],
          responseInspectors: [{ name: "modsec" }],
          capture: ["headers=64k", "response headers=8k body=64k", "response headers deny=set-cookie"],
          archive: ["request headers when=deny", "response body when=deny"],
          preview: ["headers=30k/1k", "response body=2k"],
        },
      }),
    ],
  });
  assert.match(text, /waf_capture request headers=64k;/);
  assert.match(text, /waf_capture response headers=8k body=64k;/);
  assert.match(text, /waf_capture response headers deny=set-cookie;/);
  assert.match(text, /waf_archive request headers when=deny;/);
  assert.match(text, /waf_archive response body when=deny;/);
  assert.match(text, /waf_preview request headers=30k\/1k;/);
  assert.match(text, /waf_preview response body=2k;/);
});

test("пустой набор снимает обе фазы", () => {
  const { text } = compileHttp({
    servers: [server({ waf: { capture: [], archive: [], preview: [] } })],
  });
  assert.match(text, /waf_capture request none;/);
  assert.match(text, /waf_capture response none;/);
  assert.match(text, /waf_archive request none;/);
  assert.match(text, /waf_archive response none;/);
  assert.match(text, /waf_preview response none;/);
});

test("archive response без инспекторов фазы ответа -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: { ...BUS, agentSocket: "/tmp/waf.sock" },
        bodyStores: [{ id: "bs1", httpSpaceId: SPACE, name: "hot", driver: "redis", spec: { ttl: "1m" } }],
        infra: { redisUrl: "redis://redis:6379" },
        inspectors: [inspector()],
        waf: { inspectors: { modsec: {} } },
        servers: [
          server({
            waf: {
              enabled: true,
              requestInspectors: [{ name: "modsec" }],
              capture: ["response body=64k"],
              archive: ["response body"],
            },
          }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "archive_needs_inspect",
  );
});

test("фаза кадра в capture: обе стороны одним словом, только на websocket-пути", () => {
  const { text } = compileHttp({
    denyResponses: [DENY_UPGRADE],
    servers: [server({}, [location({ capture: ["frame body=8k"] }, "/ws/", "websocket")])],
  });
  assert.match(text, /waf_capture frame body=8k;/);

  // На сервере ключей кадров не бывает: он смешивает пути обоих протоколов.
  assert.throws(
    () => compileHttp({ servers: [server({ waf: { capture: ["frame body=8k"] } })] }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_at_server",
  );
});

/*
 * Архив и превью кадров печатаются так же, как у запроса и ответа: фаза
 * первым словом, сторона -- частью слова. Архив требует инспекторов кадров
 * на маршруте -- нагрузку держит и исход решает их волна.
 */
test("архив и превью кадров: печатаются по сторонам, архив требует инспекторов кадров", () => {
  const json = inspector("json");
  json.id = "00000000-0000-4000-8000-0000000000f1";
  json.subject = "waf.req.json";
  json.phases = ["request", "frame"];

  const stand = {
    wafHttp: { ...BUS, agentSocket: "/tmp/waf.sock" },
    bodyStores: [
      { id: "bs1", httpSpaceId: SPACE, name: "hot", driver: "redis" as const, spec: { ttl: "1m" } },
    ],
    infra: { redisUrl: "redis://redis:6379" },
    inspectors: [json],
    waf: { inspectors: { json: {} } },
    denyResponses: [DENY_UPGRADE, DENY_WS],
  };

  const { text } = compileHttp({
    ...stand,
    servers: [
      server({}, [
        location(
          {
            enabled: true,
            frameInspectors: [{ name: "json", timeoutMs: 20 }],
            capture: ["frame body=64k"],
            archive: ["frame:c2s body=8k ttl=30d when=deny", "frame:s2c body ttl=1h"],
            preview: ["frame body=1k"],
          },
          "/ws/",
          "websocket",
        ),
      ]),
    ],
  });
  assert.match(text, /waf_archive frame:c2s body=8k ttl=30d when=deny;/);
  assert.match(text, /waf_archive frame:s2c body ttl=1h;/);
  assert.match(text, /waf_preview frame body=1k;/);

  // source=sent: запись показывает доставленную версию подменённого тела.
  // Пробегает разбор->печать: строка сохраняет опцию (тот же стенд).
  {
    const round = compileHttp({
      ...stand,
      servers: [
        server({}, [
          location(
            {
              enabled: true,
              frameInspectors: [{ name: "json", timeoutMs: 20 }],
              capture: ["frame body=64k"],
              preview: ["frame body=16k source=sent"],
            },
            "/ws/",
            "websocket",
          ),
        ]),
      ],
    });
    assert.match(round.text, /waf_preview frame body=16k source=sent;/);
  }

  // waf_send: откуда отдать объект получателю. Строки печатаются с фазой
  // первым словом, как хвосты снимка; кадры одной строкой на обе стороны.
  {
    const sd = compileHttp({
      ...stand,
      servers: [
        server({}, [
          location(
            {
              enabled: true,
              frameInspectors: [{ name: "json", timeoutMs: 20 }],
              capture: ["frame body=10k"],
              send: ["frame body=original"],
            },
            "/ws/",
            "websocket",
          ),
          location(
            {
              enabled: true,
              send: ["response headers=original body=store", "request body=original"],
            },
            "/api/",
          ),
        ]),
      ],
    });
    assert.match(sd.text, /waf_send frame body=original;/);
    assert.match(sd.text, /waf_send response headers=original body=store;/);
    assert.match(sd.text, /waf_send request body=original;/);
  }

  // Значение объекта только original|store, объект -- из словаря фазы.
  assert.throws(
    () =>
      compileHttp({
        ...stand,
        servers: [server({}, [location({ enabled: true, send: ["response body=maybe"] }, "/api/")])],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "send_value",
  );
  assert.throws(
    () =>
      compileHttp({
        ...stand,
        servers: [server({}, [location({ enabled: true, send: ["response args=store"] }, "/api/")])],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "send_object",
  );

  assert.throws(
    () =>
      compileHttp({
        ...stand,
        servers: [
          server({}, [
            location(
              { enabled: true, capture: ["frame body=64k"], archive: ["frame body ttl=1h"] },
              "/ws/",
              "websocket",
            ),
          ]),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "archive_needs_inspect",
  );

  // На сервере -- та же граница, что у снимка.
  assert.throws(
    () => compileHttp({ servers: [server({ waf: { archive: ["frame body ttl=1h"] } })] }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_at_server",
  );
});

/*
 * Протокол пути решает, какие фазы у него есть. websocket печатает пресет
 * апгрейда, час чтения и `waf_inspect response none` сам; ключи кадров на
 * http-пути и ключи ответа на websocket-пути -- ошибки компиляции.
 */
test("websocket-путь: умолчания апгрейда и снятая фаза ответа", () => {
  const { text } = compileHttp({
    denyResponses: [DENY_UPGRADE],
    servers: [
      server({ waf: { responseInspectors: [{ name: "modsec" }] } }, [
        location({ requestInspectors: [{ name: "modsec" }] }, "/ws/", "websocket"),
      ]),
    ],
    inspectors: [inspector("modsec")],
    waf: { inspectors: { modsec: {} } },
    wafHttp: BUS,
  });
  assert.match(text, /proxy_http_version 1\.1;/);
  assert.match(text, /proxy_set_header Upgrade\s+\$http_upgrade;/);
  assert.match(text, /proxy_set_header Connection\s+\$connection_upgrade;/);
  assert.match(text, /proxy_read_timeout 3600s;/);
  assert.match(text, /map \$http_upgrade \$connection_upgrade/);
  assert.match(text, /waf_inspect response\s+none;/);
  // Рукопожатие защищено по умолчанию: 426 без апгрейда, сжатие снято.
  assert.match(text, /waf_require_upgrade on response=upgrade_required;/);
  assert.match(text, /waf_ws_strip_extensions permessage-deflate;/);
});

test("websocket-путь: рукопожатие снимается явно, запись отказа проверяется", () => {
  const { text } = compileHttp({
    denyResponses: [DENY_UPGRADE],
    servers: [
      server({}, [
        location(
          { requireUpgrade: false, wsStripExtensions: [] },
          "/ws/",
          "websocket",
        ),
      ]),
    ],
  });
  assert.match(text, /waf_require_upgrade off;/);
  assert.match(text, /waf_ws_strip_extensions off;/);
  // Аудит кадров без ключа не печатается: умолчание модуля deny.
  assert.doesNotMatch(text, /waf_audit_frames/);

  const audited = compileHttp({
    servers: [
      server({}, [
        location({ frameAudit: "all", frameAuditSample: 10 }, "/ws/", "websocket"),
        location({ frameAudit: "deny", frameAuditSample: 10 }, "/ws2/", "websocket"),
      ]),
    ],
  }).text;
  assert.match(audited, /waf_audit_frames all sample=10;/);
  // sample= есть только у all: модуль отверг бы его на nginx -t.
  assert.match(audited, /waf_audit_frames deny;/);

  assert.throws(
    () =>
      compileHttp({
        servers: [
          server({}, [
            location({ requireUpgradeResponse: "ghost" }, "/ws/", "websocket"),
          ]),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "unknown_deny_response",
  );
});

test("кадры: сборка, контрольные кадры и кеш вердикта печатаются только названными", () => {
  const silent = compileHttp({
    denyResponses: [DENY_UPGRADE],
    servers: [server({}, [location({}, "/ws/", "websocket")])],
  }).text;
  // Умолчания модуля -- off, 10r/s и выключенный кеш: без записи строк нет.
  assert.doesNotMatch(silent, /waf_frame_reassemble|waf_frame_control_rate|waf_frame_cache/);

  const text = compileHttp({
    wafHttp: SHM,
    denyResponses: [DENY_UPGRADE],
    servers: [
      server({}, [
        location(
          {
            frameReassemble: true,
            frameControlRate: "2r/s",
            frameCacheTtl: "30s",
            frameCacheStream: "c2s",
          },
          "/ws/",
          "websocket",
        ),
        location(
          { frameReassemble: false, frameControlRate: "off", frameCacheTtl: "1m" },
          "/ws2/",
          "websocket",
        ),
        // Срок не назван -- кеш не печатается: сторона сама по себе ничего не включает.
        location({ frameCacheStream: "s2c" }, "/ws3/", "websocket"),
      ]),
    ],
  }).text;
  assert.match(text, /waf_frame_reassemble on;/);
  assert.match(text, /waf_frame_control_rate 2r\/s;/);
  assert.match(text, /waf_frame_cache frame:c2s ttl=30s;/);
  assert.match(text, /waf_frame_reassemble off;/);
  assert.match(text, /waf_frame_control_rate off;/);
  // Сторона не названа -- обе одной строкой.
  assert.match(text, /waf_frame_cache frame ttl=1m;/);
  assert.doesNotMatch(text, /waf_frame_cache frame:s2c/);

  // Форма значений: модуль отверг бы их на nginx -t, компилятор -- раньше.
  assert.throws(
    () =>
      compileHttp({
        denyResponses: [DENY_UPGRADE],
        servers: [server({}, [location({ frameControlRate: "10" }, "/ws/", "websocket")])],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_control_rate_invalid",
  );
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        denyResponses: [DENY_UPGRADE],
        servers: [server({}, [location({ frameCacheTtl: "2h" }, "/ws/", "websocket")])],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_cache_ttl_invalid",
  );
  // Таблица кеша живёт в зоне локального слоя.
  assert.throws(
    () =>
      compileHttp({
        denyResponses: [DENY_UPGRADE],
        servers: [server({}, [location({ frameCacheTtl: "30s" }, "/ws/", "websocket")])],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "shm_zone_required",
  );
  // Ключи кадров -- только у websocket-пути.
  assert.throws(
    () => compileHttp({ servers: [server({}, [location({ frameReassemble: true })])] }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_needs_websocket",
  );
});

test("локальный лимит count=frames: печатается и только на websocket-пути", () => {
  const text = compileHttp({
    wafHttp: SHM,
    denyResponses: [DENY_UPGRADE],
    servers: [
      server({}, [
        location(
          {
            localRates: [{ key: "$waf_conn_id", rate: "50r/s", burst: 20, count: "frames" }],
          },
          "/ws/",
          "websocket",
        ),
      ]),
    ],
  }).text;
  assert.match(text, /waf_local_rate \$waf_conn_id rate=50r\/s burst=20 count=frames;/);

  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        servers: [
          server({}, [
            location({
              localRates: [{ key: "$waf_conn_id", rate: "50r/s", burst: 20, count: "frames" }],
            }),
          ]),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_needs_websocket",
  );
});

test("протокол пути: кадры только на websocket, ответ только на http", () => {
  assert.throws(
    () => compileHttp({ servers: [server({}, [location({ frameDeadlineMs: 50 })])] }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_needs_websocket",
  );
  assert.throws(
    () => compileHttp({ servers: [server({}, [location({ frameAudit: "all" })])] }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_needs_websocket",
  );
  assert.throws(
    () =>
      compileHttp({
        servers: [server({}, [location({ responseHold: "gate" }, "/ws/", "websocket")])],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "websocket_no_response",
  );
  assert.throws(
    () =>
      compileHttp({
        servers: [server({ waf: { frameScoreDeny: { threshold: 50, response: "ws_policy" } } })],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "frame_at_server",
  );
  // Явное «нет» у фазы ответа -- не ключ: так путь и хранится.
  compileHttp({
    denyResponses: [DENY_UPGRADE],
    servers: [server({}, [location({ responseInspectors: "none" }, "/ws/", "websocket")])],
  });
});

test("body_limit response печатается со своей фазой", () => {
  const { text } = compileHttp({
    servers: [
      server({
        waf: {
          bodyLimit: "response 4m",
          bodyLimitPolicy: "pass",
          capture: ["response headers body"],
          responseHold: "gate",
        },
      }),
    ],
  });

  assert.match(text, /waf_body_limit response 4m pass;/);
});

/*
 * Предел ответа ничего не говорит о снимке запроса: сравнивать их -- значит
 * отвергать конфигурацию, в которой ошибки нет.
 */
test("body_limit response не сверяется со снимком запроса", () => {
  const { text } = compileHttp({
    servers: [
      server({
        waf: {
          bodyLimit: "response 1m",
          capture: ["request body=2m", "response body=512k"],
        },
      }),
    ],
  });

  assert.match(text, /waf_body_limit response 1m;/);
});

test("capture больше body_limit -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        servers: [server({ waf: { bodyLimit: "1m", capture: ["request body=2m"] } })],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "size_over_limit",
  );
});

test("смысл 1-api: фаза первым словом, reload, active не здесь", () => {
  const { text } = compileHttp({
    wafHttp: {
      nodeId: "edge-07",
      bus: { urls: ["nats://nats-1:4222", "nats://nats-2:4222"] },
      agentSocket: "/run/waf/verdict.sock",
    },
    inspectors: [
      { ...inspector("allow_ip"), subject: "waf.req.ip" },
      { ...inspector("sqli"), id: "i2", subject: "waf.req.sqli" },
    ],
    denyResponses: [
      { id: "d1", httpSpaceId: SPACE, name: "blocked", type: "http", spec: { status: 403 } },
    ],
    bodyStores: [
      {
        id: "bs1",
        httpSpaceId: SPACE,
        name: "hot",
        driver: "redis",
        spec: { url: "redis://redis:6379", ttl: "30s" },
      },
    ],
    servers: [
      server({
        waf: {
          enabled: true,
          requestInspectors: [
            { name: "allow_ip", wave: 0, timeoutMs: 5 },
            { name: "sqli", wave: 1, timeoutMs: 15 },
          ],
          capture: ["headers=64k", "args=64k", "headers mask=authorization,cookie"],
          archive: [
            "request headers args ttl=30d when=deny",
            "request reload headers=capture",
          ],
          preview: ["headers=30k/1k", "args=8k/1k"],
          deadlineMs: 50,
          exception: ["request timeout deny", "request absent deny", "request bus pass"],
          denyMode: "fast",
          scoreDeny: { threshold: 0 },
        },
      }),
    ],
    waf: { inspectors: { allow_ip: {}, sqli: {} } },
  });
  assert.match(text, /waf_inspect request allow_ip wave=0 timeout=5ms;/);
  assert.match(text, /waf_inspect request sqli wave=1 timeout=15ms;/);
  assert.match(text, /waf_capture request headers=64k args=64k;/);
  assert.match(text, /waf_archive request headers args ttl=30d when=deny;/);
  assert.match(text, /waf_archive request reload headers=capture;/);
  assert.match(text, /waf_preview request headers=30k\/1k;/);
  assert.match(text, /waf_preview request args=8k\/1k;/);
  assert.match(text, /waf_deadline request 50ms;/);
  assert.doesNotMatch(text, /phase=|uuid=|waf_inspect none;/);
});

test("active с entries -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        datasets: [
          dataset("blocklist", { type: "ip", maxEntries: 10, entries: ["10.0.0.0/8"], size: 1 }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "dataset_entries_active",
  );
});

/* --- локальный слой ------------------------------------------------------- */

/** Запись отказа для waf_require_upgrade, умолчание websocket-пути. */
const DENY_UPGRADE = {
  id: "00000000-0000-4000-8000-0000000000d1",
  httpSpaceId: SPACE,
  name: "upgrade_required",
  type: "http",
  spec: { status: 426 },
  position: 63,
} as const;

/** Запись type=websocket: код и причина кадра Close по отказу на кадре. */
const DENY_WS = {
  id: "00000000-0000-4000-8000-0000000000d2",
  httpSpaceId: SPACE,
  name: "ws_policy",
  type: "websocket",
  spec: { code: 1008, reason: "policy violation" },
  position: 62,
} as const;

function location(
  waf: Location["waf"],
  path = "/api/",
  protocol: Location["protocol"] = "http",
): Location {
  return {
    id: "00000000-0000-4000-8000-000000000030",
    serverId: SERVER,
    match: "prefix",
    path,
    position: 0,
    enabled: true,
    handler: "proxy",
    protocol,
    nginx: {},
    waf,
    raw: false,
    rawNginx: "",
    builtin: false,
  };
}

test("пресет заголовков в http {}: набор на всё пространство", () => {
  const expected = `http {
    absolute_redirect off;
    sendfile on;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
`;

  assert.equal(
    compileHttp({ nginx: { sendfile: true, proxyHeaders: "standard" } }).text,
    expected,
  );
});

/*
  map нужен только пресету websocket, поэтому и печатается только с ним --
  хоть из http, хоть с одного пути. Объявление, которого никто не читает, --
  это вопрос у того, кто откроет файл, а не безобидная строка.
*/
test("map $connection_upgrade: один на файл, и только под websocket", () => {
  const bare = compileHttp({ nginx: { proxyHeaders: "standard" } }).text;
  assert.doesNotMatch(bare, /connection_upgrade/);

  const fromPath = compileHttp({
    servers: [
      server({}, [
        { ...location({}, "/ws"), nginx: { proxyHeaders: "websocket" } },
        { ...location({}, "/ws2"), nginx: { proxyHeaders: "websocket" } },
      ]),
    ],
  }).text;

  assert.equal(fromPath.match(/map \$http_upgrade/g)?.length, 1);
  assert.match(fromPath, /default upgrade;/);
  assert.match(fromPath, /"" close;/);
  assert.equal(fromPath.match(/proxy_set_header Connection \$connection_upgrade;/g)?.length, 2);
});

test("локальный слой печатается: пропуск, бан, лимит с автобаном", () => {
  const { text } = compileHttp({
    wafHttp: SHM,
    denyResponses: [
      { id: "d1", httpSpaceId: SPACE, name: "blocked", type: "http", spec: { status: 403 } },
      { id: "d2", httpSpaceId: SPACE, name: "too_many", type: "http", spec: { status: 429 } },
    ],
    datasets: [
      dataset("office", { type: "ip", active: false, entries: ["10.0.0.0/8"] }),
      dataset("blocklist", { type: "ip", ttl: "5m" }),
    ],
    servers: [
      server({
        waf: {
          localChecks: [
            { dataset: "office", variable: "$binary_remote_addr", action: "allow" },
            {
              dataset: "blocklist",
              variable: "$binary_remote_addr",
              action: "block",
              response: "blocked",
            },
          ],
          localRates: [
            {
              key: "$binary_remote_addr",
              rate: "5r/s",
              burst: 5,
              response: "too_many",
              list: "blocklist",
            },
          ],
        },
      }),
    ],
  });
  assert.match(text, /waf_local_check office \$binary_remote_addr action=allow;/);
  assert.match(
    text,
    /waf_local_check blocklist \$binary_remote_addr action=block response=blocked;/,
  );
  assert.match(
    text,
    /waf_local_rate \$binary_remote_addr rate=5r\/s burst=5 response=too_many list=blocklist;/,
  );
});

test("проверка по необъявленному набору -- ошибка компиляции", () => {
  // Опечатка в имени набора уезжает на ноду проверкой, которая не срабатывает
  // ни разу, то есть маршрутом, выглядящим защищённым.
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("blocklist")],
        servers: [
          server({
            waf: {
              localChecks: [
                { dataset: "blocklst", variable: "$binary_remote_addr", action: "block" },
              ],
            },
          }),
        ],
      }),
    (err: unknown) =>
      err instanceof WafCompileError && err.code === "local_dataset_not_declared",
  );
});

test("набор ip-компилятора слотом не объявлен -- проверкой по нему не собрать", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("ip_office", { inNginx: false })],
        servers: [
          server({
            waf: {
              localChecks: [
                { dataset: "ip_office", variable: "$binary_remote_addr", action: "allow" },
              ],
            },
          }),
        ],
      }),
    (err: unknown) =>
      err instanceof WafCompileError && err.code === "local_dataset_not_declared",
  );
});

test("локальный слой без waf_shm_zone -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        datasets: [dataset("blocklist")],
        servers: [
          server({
            waf: {
              localChecks: [
                { dataset: "blocklist", variable: "$binary_remote_addr", action: "block" },
              ],
            },
          }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "shm_zone_required",
  );
});

test("rate без единицы -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        servers: [
          server({
            waf: { localRates: [{ key: "$binary_remote_addr", rate: "100", burst: 5 }] },
          }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "local_rate_invalid",
  );
});

test("автобан во внутренний набор -- ошибка компиляции", () => {
  // Состав internal живёт в конфиге: overlay, куда пишет автобан, там нет.
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("office", { type: "ip", active: false })],
        servers: [
          server({
            waf: {
              localRates: [
                {
                  key: "$binary_remote_addr",
                  rate: "5r/s",
                  burst: 5,
                  list: "office",
                  ttl: "5m",
                },
              ],
            },
          }),
        ],
      }),
    (err: unknown) =>
      err instanceof WafCompileError && err.code === "local_rate_list_internal",
  );
});

test("автобан без ttl -- ни у правила, ни у набора -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("blocklist", { type: "ip" })],
        servers: [
          server({
            waf: {
              localRates: [
                { key: "$binary_remote_addr", rate: "5r/s", burst: 5, list: "blocklist" },
              ],
            },
          }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "local_rate_list_ttl",
  );
});

test("ttl набора хватает: правилу свой не нужен", () => {
  const { text } = compileHttp({
    wafHttp: SHM,
    datasets: [dataset("blocklist", { type: "ip", ttl: "5m" })],
    servers: [
      server({
        waf: {
          localRates: [
            { key: "$binary_remote_addr", rate: "5r/s", burst: 5, list: "blocklist" },
          ],
        },
      }),
    ],
  });
  assert.match(text, /waf_local_rate \$binary_remote_addr rate=5r\/s burst=5 list=blocklist;/);
});

test("action=pass с автобаном -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("blocklist", { type: "ip", ttl: "5m" })],
        servers: [
          server({
            waf: {
              localRates: [
                {
                  key: "$binary_remote_addr",
                  rate: "5r/s",
                  burst: 5,
                  action: "pass",
                  list: "blocklist",
                },
              ],
            },
          }),
        ],
      }),
    (err: unknown) =>
      err instanceof WafCompileError && err.code === "local_rate_pass_with_list",
  );
});

test("снятие на пути печатается словом none", () => {
  // Наследование в модуле -- замена, и пустой список выражается только этим
  // словом: без него путь молча получил бы правила сервера.
  const { text } = compileHttp({
    wafHttp: SHM,
    datasets: [dataset("blocklist", { type: "ip" })],
    servers: [
      server(
        {
          waf: {
            localChecks: [
              { dataset: "blocklist", variable: "$binary_remote_addr", action: "block" },
            ],
            localRates: [{ key: "$binary_remote_addr", rate: "5r/s", burst: 5 }],
          },
        },
        [location({ localChecks: [], localRates: [] })],
      ),
    ],
  });
  // Отступ в 12 -- уровень location: снимает путь, а не сервер.
  assert.match(text, /^ {12}waf_local_check none;$/m);
  assert.match(text, /^ {12}waf_local_rate none;$/m);
});

test("пустой список печатается всегда: документ говорит «здесь правил нет»", () => {
  // Уровнем выше правил нет, и `none` ничего не снимает -- но и не врёт:
  // компилятор печатает то, что записано, а не догадку о родителе.
  const { text } = compileHttp({
    wafHttp: SHM,
    servers: [server({ waf: {} }, [location({ localChecks: [], localRates: [] })])],
  });
  assert.match(text, /waf_local_check none;/);
  assert.match(text, /waf_local_rate none;/);
});

test("условие печатается хвостом строки: check, rate и вызов инспектора", () => {
  const { text } = compileHttp({
    wafHttp: { ...SHM, ...BUS, agentSocket: "/tmp/waf.sock" },
    inspectors: [inspector("sqli")],
    waf: { inspectors: { sqli: {} } },
    datasets: [
      dataset("blocklist", { type: "ip" }),
      dataset("trusted"),
      dataset("api_paths"),
    ],
    servers: [
      server({
        waf: {
          enabled: true,
          requestInspectors: [
            {
              name: "sqli",
              wave: 0,
              conds: [{ value: "$uri", dataset: "api_paths" }],
            },
          ],
          localChecks: [
            {
              dataset: "blocklist",
              variable: "$binary_remote_addr",
              action: "block",
              conds: [{ value: "$waf_request_cookies.sid", dataset: "trusted", negate: true }],
            },
          ],
          localRates: [
            {
              key: "$binary_remote_addr",
              rate: "5r/s",
              burst: 5,
              conds: [
                { value: "$uri", dataset: "api_paths" },
                { value: "$http_x_api_key", dataset: "trusted", negate: true },
              ],
            },
          ],
        },
      }),
    ],
  });
  assert.match(text, /waf_inspect request sqli wave=0 if \$uri in api_paths;/);
  assert.match(
    text,
    /waf_local_check blocklist \$binary_remote_addr action=block if \$waf_request_cookies\.sid not in trusted;/,
  );
  assert.match(
    text,
    /waf_local_rate \$binary_remote_addr rate=5r\/s burst=5 if \$uri in api_paths if \$http_x_api_key not in trusted;/,
  );
});

test("условие по необъявленному набору -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("blocklist", { type: "ip" })],
        servers: [
          server({
            waf: {
              localChecks: [
                {
                  dataset: "blocklist",
                  variable: "$binary_remote_addr",
                  action: "block",
                  conds: [{ value: "$uri", dataset: "nosuch" }],
                },
              ],
            },
          }),
        ],
      }),
    (err: unknown) =>
      err instanceof WafCompileError && err.code === "local_dataset_not_declared",
  );
});

test("условие без значения -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("api_paths")],
        servers: [
          server({
            waf: {
              localRates: [
                {
                  key: "$binary_remote_addr",
                  rate: "5r/s",
                  burst: 5,
                  conds: [{ value: "  ", dataset: "api_paths" }],
                },
              ],
            },
          }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "cond_incomplete",
  );
});

test("ключ лимита -- одно значение, не множество", () => {
  // `.*` даёт столько значений, сколько пар в запросе: один запрос считался бы
  // в несколько счётчиков сразу.
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        servers: [
          server({
            waf: {
              localRates: [{ key: "$waf_request_args.*", rate: "5r/s", burst: 5 }],
            },
          }),
        ],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "local_rate_key_set",
  );
});

test("объявленный слот без зоны -- ошибка компиляции", () => {
  // `waf_local_dataset` без `waf_shm_zone` модуль отвергает на -t, даже если
  // ни одна проверка на набор не ссылается.
  assert.throws(
    () => compileHttp({ datasets: [dataset("blocklist", { type: "ip" })] }),
    (err: unknown) => err instanceof WafCompileError && err.code === "shm_zone_required",
  );
});

test("http объявляет инспекторов, но не назначает инспекцию", () => {
  // Реестр в http -- да: какие процессы есть в контуре.
  const registry = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: { inspectors: { modsec: { profile: "strict" } } },
    servers: [server({ waf: { requestInspectors: [{ name: "modsec" }] } })],
  });
  assert.match(registry.text, /waf_inspector modsec subject=waf\.req\.modsec profile=strict;/);
  // Набор -- на сервере, и только там.
  assert.match(registry.text, /^ {8}waf_inspect request modsec wave=0;$/m);
  assert.doesNotMatch(registry.text, /^ {4}waf_inspect /m);

  // Решение по запросу в http -- отказ, а не тихий пропуск: маршрут, заданный
  // не там, выглядел бы работающим и не работал.
  for (const stray of [
    { requestInspectors: [{ name: "modsec" }] },
    { enabled: true },
    { deadlineMs: 25 },
    { localChecks: [{ dataset: "blocklist", variable: "$remote_addr", action: "block" as const }] },
  ]) {
    assert.throws(
      () =>
        compileHttp({
          wafHttp: BUS,
          inspectors: [inspector()],
          waf: { inspectors: { modsec: {} }, ...stray },
        }),
      (err: unknown) => err instanceof WafCompileError && err.code === "route_at_http",
    );
  }
});

test("путь переопределяет набор сервера", () => {
  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000i2";
  ip.subject = "waf.req.ip";
  const loc: Location = {
    id: "loc",
    serverId: SERVER,
    match: "exact",
    path: "/healthz",
    position: 0,
    enabled: true,
    handler: "static",
    protocol: "http",
    nginx: {},
    waf: { requestInspectors: "none" },
    raw: false,
    rawNginx: "",
    builtin: false,
  };
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector(), ip],
    waf: { inspectors: { ip: {}, modsec: { after: ["ip"] } } },
    servers: [
      server(
        { waf: { requestInspectors: [{ name: "ip" }, { name: "modsec" }] } },
        [loc],
      ),
    ],
  });
  assert.match(text, /^ {8}waf_inspect request ip wave=0;$/m);
  assert.match(text, /^ {8}waf_inspect request modsec wave=1;$/m);
  assert.match(text, /^ {12}waf_inspect request none;$/m);
});

test("profile: разные наборы на одно имя -- отказ, а не первый попавшийся", () => {
  // Строка реестра печатается одна на имя, profile= в ней один. Раньше
  // выигрывал первый встреченный, и /modsec-deny/ молча уезжал на strict.
  const source = {
    wafHttp: BUS,
    inspectors: [inspector("modsec")],
    waf: { inspectors: { modsec: {} } },
    servers: [
      server({}, [
        location({ requestInspectors: [{ name: "modsec", profile: "strict" }] }, "/a/"),
        location({ requestInspectors: [{ name: "modsec", profile: "deny" }] }, "/b/"),
      ]),
    ],
  };
  assert.throws(
    () => compileHttp(source),
    (err: unknown) =>
      err instanceof WafCompileError &&
      err.code === "profile_conflict" &&
      /modsec \(deny, strict\)/.test(err.message),
  );
});

test("profile: заявка и умолчание -- тоже расхождение", () => {
  // Маршрут без profile= просит набор узла реестра, здесь его нет -- значит
  // default. Напечатать одной строкой и default, и api нельзя.
  const source = {
    wafHttp: BUS,
    inspectors: [inspector("modsec")],
    waf: { inspectors: { modsec: {} } },
    servers: [
      server({}, [
        location({ requestInspectors: [{ name: "modsec" }] }, "/a/"),
        location({ requestInspectors: [{ name: "modsec", profile: "api" }] }, "/b/"),
      ]),
    ],
  };
  assert.throws(
    () => compileHttp(source),
    (err: unknown) =>
      err instanceof WafCompileError && /modsec \(api, default\)/.test(err.message),
  );
});

test("profile: набор на узле реестра, маршруты молчат -- это не расхождение", () => {
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector("modsec")],
    waf: { inspectors: { modsec: { profile: "api" } } },
    servers: [
      server({}, [
        location({ requestInspectors: [{ name: "modsec" }] }, "/a/"),
        location({ requestInspectors: [{ name: "modsec", profile: "api" }] }, "/b/"),
      ]),
    ],
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec profile=api;/);
});

test("profile: два имени на один subject разводят наборы", () => {
  // Задуманный способ: имя -- ключ реестра, subject у обоих один.
  const strict = inspector("modsec-strict");
  strict.id = "00000000-0000-4000-8000-0000000000i9";
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector("modsec"), strict],
    waf: { inspectors: { modsec: {}, "modsec-strict": { profile: "strict" } } },
    servers: [
      server({}, [
        location({ requestInspectors: [{ name: "modsec" }] }, "/a/"),
        location({ requestInspectors: [{ name: "modsec-strict" }] }, "/b/"),
      ]),
    ],
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec;/);
  assert.match(text, /waf_inspector modsec-strict subject=waf\.req\.modsec profile=strict;/);
});

test("process=: объявление берёт subject процесса, копия каталога не нужна", () => {
  // Второе имя того же процесса -- узел графа со ссылкой, а не строка
  // каталога: тема и фазы у имени ровно те, что у процесса.
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [inspector()],
    waf: {
      inspectors: {
        modsec: {},
        "modsec-strict": { process: "modsec", profile: "strict" },
      },
    },
    servers: [
      server({}, [
        location({ requestInspectors: [{ name: "modsec" }] }, "/a/"),
        location({ requestInspectors: [{ name: "modsec-strict" }] }, "/b/"),
      ]),
    ],
  });
  assert.match(text, /waf_inspector modsec subject=waf\.req\.modsec;/);
  assert.match(text, /waf_inspector modsec-strict subject=waf\.req\.modsec profile=strict;/);
  assert.match(text, /waf_inspect request modsec-strict wave=0;/);
});

test("process= в никуда -- ошибка компиляции, как имя вне каталога", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: BUS,
        inspectors: [inspector()],
        waf: { inspectors: { "modsec-strict": { process: "ghost" } } },
      }),
    (err: unknown) =>
      err instanceof NginxCompileError && err.names.includes("modsec-strict"),
  );
});

test("вызов необъявленного имени -- отказ, а не тихое дообъявление", () => {
  // Раньше вызов с маршрута печатал waf_inspector прямо из каталога, мимо
  // объявлений: оператор объявлял auth2 со своим профилем, маршрут звал
  // auth -- и уезжал на default. Теперь реестр -- пространство имён набора.
  assert.throws(
    () =>
      compileHttp({
        wafHttp: BUS,
        inspectors: [inspector()],
        waf: { inspectors: {} },
        servers: [server({ waf: { requestInspectors: [{ name: "modsec" }] } })],
      }),
    (err: unknown) =>
      err instanceof WafCompileError &&
      err.code === "undeclared_inspector" &&
      /modsec/.test(err.message),
  );
});

test("all разворачивается по фазам процесса, а не имени", () => {
  const both = inspector();
  both.phases = ["request", "response"];
  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [both],
    waf: {
      inspectors: { "modsec-strict": { process: "modsec", profile: "strict" } },
    },
    servers: [
      server({ waf: { requestInspectors: "all", responseInspectors: "all" } }),
    ],
  });
  assert.match(text, /waf_inspect request modsec-strict wave=0;/);
  assert.match(text, /waf_inspect response modsec-strict wave=0;/);
});

/*
 * Фраза для клиента живёт у grpc и websocket. nginx режет строку по пробелам
 * раньше, чем её увидит модуль, поэтому пара с пробелом обязана уехать в
 * кавычках целиком: без них `message=Доступ закрыт` стало бы двумя аргументами
 * и `nginx -t` упал бы на втором.
 *
 * У http этого поля нет: текст отказа пишет сама страница. Значение, осевшее
 * в spec http-записи до снятия поля, в конфиг не едет -- иначе строка говорила
 * бы то, чего в панели уже не видно.
 */
test("message= с пробелами печатается парой в кавычках, у http не печатается", () => {
  const { text } = compileHttp({
    denyResponses: [
      {
        id: "d1",
        httpSpaceId: SPACE,
        name: "spoken",
        type: "grpc",
        spec: { status: 7, message: "Доступ закрыт. Позвоните нам." },
      },
      {
        id: "d2",
        httpSpaceId: SPACE,
        name: "plain",
        type: "grpc",
        spec: { status: 7, message: "blocked" },
      },
      {
        id: "d3",
        httpSpaceId: SPACE,
        name: "quoted",
        type: "grpc",
        spec: { status: 7, message: 'он сказал "нет"' },
      },
      {
        id: "d4",
        httpSpaceId: SPACE,
        name: "blocked",
        type: "http",
        spec: { status: 403, page: "@waf_deny", message: "давняя фраза" },
      },
    ],
    servers: [],
  });

  assert.match(
    text,
    /waf_deny_response spoken type=grpc status=7 "message=Доступ закрыт\. Позвоните нам\.";/,
  );
  // Значение без пробелов кавычек не получает: лишние кавычки в конфиге
  // читаются как часть значения теми, кто её глазами разбирает.
  assert.match(text, /waf_deny_response plain type=grpc status=7 message=blocked;/);
  assert.match(
    text,
    /waf_deny_response quoted type=grpc status=7 "message=он сказал \\"нет\\"";/,
  );
  assert.match(text, /waf_deny_response blocked status=403 page=@waf_deny;/);
  assert.ok(!/давняя фраза/.test(text));
});

/*
 * Переговоры представления -- свойство контура: одна карта на всех, а не
 * строка на маршруте. Пока её заводили поодиночке, капча умела отдать JSON, а
 * калитка тому же fetch отдавала вёрстку.
 */
test("каталог отказов приносит карту $waf_deny_ext, пустой -- нет", () => {
  const { text } = compileHttp({
    denyResponses: [
      {
        id: "d1",
        httpSpaceId: SPACE,
        name: "blocked",
        type: "http",
        spec: { status: 403 },
      },
    ],
    servers: [],
  });

  assert.match(text, /map \$http_accept \$waf_deny_ext \{/);
  assert.match(text, /default\s+"\.html";/);
  assert.match(text, /"~\*application\/json"\s+"\.json";/);

  // Без записей отказа страниц не бывает, и выбирать переменной нечего.
  assert.doesNotMatch(compileHttp({}).text, /waf_deny_ext/);
});

/*
 * params= -- что записи разрешено отдать клиенту. Печатается перечнем через
 * запятую; пустой перечень не печатается вовсе (равен незаданному), слово
 * мимо словаря роняет компиляцию, а не nginx -t на нодах.
 */
test("params= печатается перечнем, чужое слово роняет компиляцию", () => {
  const { text } = compileHttp({
    denyResponses: [
      {
        id: "d1",
        httpSpaceId: SPACE,
        name: "quiet",
        type: "http",
        spec: { status: 403, params: ["ray", "retry"] },
      },
      {
        id: "d2",
        httpSpaceId: SPACE,
        name: "open",
        type: "http",
        spec: { status: 403, params: [] },
      },
    ],
    servers: [],
  });

  assert.match(text, /waf_deny_response quiet status=403 params=ray,retry;/);
  assert.match(text, /waf_deny_response open status=403;/);

  assert.throws(
    () =>
      compileHttp({
        denyResponses: [
          {
            id: "d3",
            httpSpaceId: SPACE,
            name: "typo",
            type: "http",
            spec: { status: 403, params: ["rayy"] },
          },
        ],
        servers: [],
      }),
    /deny_params_unknown|unknown params/,
  );
});

/*
 * Фаза кадров: вызов печатается стороной (умолчание -- от клиента), снимок и
 * предел тела -- как записаны, бюджет и порог -- словом `frame` на обе
 * стороны сразу.
 */
test("frame: вызов, бюджет, порог и снимок печатаются по сторонам", () => {
  const json = inspector("json");
  json.id = "00000000-0000-4000-8000-0000000000f1";
  json.subject = "waf.req.json";
  json.phases = ["request", "frame"];

  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [json],
    waf: { inspectors: { json: {} } },
    denyResponses: [DENY_UPGRADE, DENY_WS],
    servers: [
      server({}, [
        location({
          frameInspectors: [{ name: "json", timeoutMs: 20 }],
          frameDeadlineMs: 50,
          exception: ["frame timeout deny"],
          frameScoreDeny: { threshold: 50, response: "ws_policy" },
          capture: ["frame:c2s body=64k"],
          bodyLimit: "frame:c2s 64k",
          bodyLimitPolicy: "block",
        }, "/ws/", "websocket"),
      ]),
    ],
  });

  assert.match(text, /waf_inspect frame:c2s json wave=0 timeout=20ms;/);
  assert.match(text, /waf_deadline frame 50ms;/);
  assert.match(text, /waf_score_deny frame 50 response=ws_policy;/);
  assert.match(text, /waf_capture frame:c2s body=64k;/);
  assert.match(text, /waf_body_limit frame:c2s 64k block;/);
  assert.doesNotMatch(text, /waf_inspect frame json/);
});

test("frame: сторона вызова -- s2c и обе, снимок обеих сторон", () => {
  const rewrite = inspector("rewrite");
  rewrite.id = "00000000-0000-4000-8000-0000000000f4";
  rewrite.subject = "waf.req.rewrite";
  rewrite.phases = ["response", "frame"];

  const counter = inspector("counter");
  counter.id = "00000000-0000-4000-8000-0000000000f5";
  counter.subject = "waf.req.counter";
  counter.phases = ["request", "response", "frame"];

  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [rewrite, counter],
    waf: { inspectors: { rewrite: {}, counter: {} } },
    denyResponses: [DENY_UPGRADE],
    servers: [
      server({}, [
        location({
          frameInspectors: [
            { name: "counter", stream: "both" },
            { name: "rewrite", stream: "s2c", wave: 1 },
          ],
          capture: ["frame body=32k"],
          bodyLimit: "frame:s2c 32k",
          bodyLimitPolicy: "pass",
        }, "/ws/", "websocket"),
      ]),
    ],
  });

  assert.match(text, /waf_inspect frame counter wave=0;/);
  assert.match(text, /waf_inspect frame:s2c rewrite wave=1;/);
  assert.match(text, /waf_capture frame body=32k;/);
  assert.match(text, /waf_body_limit frame:s2c 32k pass;/);
});

test("frame: none печатается стороной клиента, all берёт умеющих фазу", () => {
  const json = inspector("json");
  json.id = "00000000-0000-4000-8000-0000000000f2";
  json.subject = "waf.req.json";
  json.phases = ["frame"];

  const ip = inspector("ip");
  ip.id = "00000000-0000-4000-8000-0000000000f3";
  ip.subject = "waf.req.ip";
  ip.phases = ["request"];

  const { text } = compileHttp({
    wafHttp: BUS,
    inspectors: [json, ip],
    waf: { inspectors: { json: {}, ip: {} } },
    denyResponses: [DENY_UPGRADE],
    servers: [
      server({}, [
        location({ frameInspectors: "all" }, "/ws/", "websocket"),
        location({ frameInspectors: "none" }, "/api/", "websocket"),
      ]),
    ],
  });

  assert.match(text, /waf_inspect frame:c2s json wave=0;/);
  assert.doesNotMatch(text, /waf_inspect frame:c2s ip/);
  assert.match(text, /waf_inspect frame none;/);
});

test("hash=md5: набор строк печатает флаг, лимит -- свой, адресному набору нельзя", () => {
  const { text } = compileHttp({
    wafHttp: SHM,
    datasets: [
      dataset("sessions", { type: "string", ttl: "1h", hash: true }),
      dataset("badua", { type: "string" }),
    ],
    servers: [
      server({
        waf: {
          localChecks: [{ dataset: "sessions", variable: "$cookie_session", action: "block" }],
          localRates: [
            { key: "$cookie_session", rate: "10r/s", burst: 20, hash: true, list: "sessions" },
            { key: "$http_user_agent", rate: "1r/s", burst: 0, list: "badua", ttl: "5m" },
          ],
        },
      }),
    ],
  });
  // Флаг набора -- между limit= и ttl=, у набора без него слова нет.
  assert.match(text, /waf_local_dataset sessions type=string limit=1000 hash=md5 ttl=1h active;/);
  assert.match(text, /waf_local_dataset badua type=string limit=1000 active;/);
  // У лимита hash=md5 стоит перед list=: корзина по хешу, набор хеширует сам.
  assert.match(
    text,
    /waf_local_rate \$cookie_session rate=10r\/s burst=20 hash=md5 list=sessions;/,
  );
  assert.match(text, /waf_local_rate \$http_user_agent rate=1r\/s burst=0 list=badua ttl=5m;/);
  // Проверка флага не печатает: хеширует набор, а не строка.
  assert.match(text, /waf_local_check sessions \$cookie_session action=block;/);

  // Адресу md5 ничего не даёт, а префикс после него перестаёт быть префиксом.
  assert.throws(
    () =>
      compileHttp({
        wafHttp: SHM,
        datasets: [dataset("blocklist", { type: "ip", hash: true })],
      }),
    (err: unknown) => err instanceof WafCompileError && err.code === "dataset_hash_type",
  );
});

test("наборов в nginx не больше предела модуля: сверх -- datasets_too_many", () => {
  // Активные и внутренние вперемешку: потолок модуля -- на объявления вообще.
  const declared = (count: number): Dataset[] =>
    Array.from({ length: count }, (_, i) => dataset(`ds${i}`, { active: i % 2 === 0 }));

  const { text } = compileHttp({ wafHttp: SHM, datasets: declared(NGINX_MAX_DATASETS) });
  assert.equal(text.match(/waf_local_dataset \S+ type=/g)?.length, NGINX_MAX_DATASETS);

  // Наборы вне nginx и файлы в счёт не входят: `waf_local_dataset` у них нет.
  compileHttp({
    wafHttp: SHM,
    datasets: [
      ...declared(NGINX_MAX_DATASETS),
      dataset("compiler_pack", { inNginx: false }),
      dataset("page", { kind: "content" }),
    ],
  });

  assert.throws(
    () => compileHttp({ wafHttp: SHM, datasets: declared(NGINX_MAX_DATASETS + 1) }),
    (err: unknown) => {
      assert.ok(err instanceof WafCompileError);
      assert.equal(err.code, "datasets_too_many");
      assert.match(
        err.message,
        new RegExp(`^${NGINX_MAX_DATASETS + 1} datasets .* at most ${NGINX_MAX_DATASETS};`),
      );
      assert.deepEqual(err.params, { count: NGINX_MAX_DATASETS + 1, limit: NGINX_MAX_DATASETS });
      return true;
    },
  );
});

test("vars= объявления: стандартное поле, waf_var и all -- на waf_inspector", () => {
  const { text } = compileHttp({
    wafHttp: { ...BUS, vars: [{ name: "ja3", value: "$http_x_ja3" }] },
    inspectors: [inspector(), inspector("captcha")],
    waf: {
      inspectors: {
        modsec: { vars: ["all"] },
        captcha: { vars: ["user_agent", "accept_language", "ja3"] },
      },
    },
  });
  assert.match(text, /waf_inspector modsec\s+subject=waf\.req\.modsec\s+vars=all;/);
  assert.match(text, /waf_inspector captcha\s+subject=\S+\s+vars=user_agent,accept_language,ja3;/);
  assert.match(text, /waf_var ja3 \$http_x_ja3;/);
});

test("vars= с полем, которого нет ни в наборе, ни в waf_var, -- ошибка компиляции", () => {
  assert.throws(
    () =>
      compileHttp({
        wafHttp: BUS,
        inspectors: [inspector()],
        waf: { inspectors: { modsec: { vars: ["user_agent", "ua"] } } },
      }),
    (err: unknown) =>
      err instanceof WafCompileError && err.code === "unknown_var" && /ua/.test(err.message),
  );
});

test("waf_var под именем стандартного поля не печатается", () => {
  const { text } = compileHttp({
    wafHttp: {
      ...BUS,
      vars: [
        { name: "user_agent", value: "$http_user_agent" },
        { name: "via", value: "$http_via" },
      ],
    },
    inspectors: [inspector()],
    waf: { inspectors: { modsec: {} } },
  });
  assert.doesNotMatch(text, /waf_var user_agent/);
  assert.match(text, /waf_var via \$http_via;/);
  assert.doesNotMatch(text, /vars=/);
});
