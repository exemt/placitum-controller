/**
 * Компилятор пути: на входе строка как в таблице `locations`
 * (колонки + jsonb nginx/waf), на выходе блок `location {}`.
 *
 * Схема теста: ожидаемый текст -> параметры строки -> compileLocation.
 * Серверный компилятор потом вставит этот блок внутрь `server {}`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Inspector } from "../model/http-space.ts";
import type { Location, LocationHandler, LocationMatch } from "../model/location.ts";
import type { NginxLocationSettings } from "../model/settings.ts";
import type { WafRouteSettings } from "../model/waf-route.ts";
import { flattenColumns } from "./nginx-align.ts";
import {
  compileLocation as compileLocationColumns,
  type LocationUpstream,
} from "./nginx-location.ts";

/*
  Колонки печати -- забота nginx-align.ts, и проверяет их nginx-align.test.ts.
  Здесь текст читают по директивам, поэтому столбик схлопывается обратно в один
  пробел: иначе каждая проверка зависела бы от длины соседнего имени в том же
  блоке -- новое имя в наборе роняло бы те, что про него ничего не знают.
*/
const compileLocation: typeof compileLocationColumns = (...args) => {
  const out = compileLocationColumns(...args);
  return { ...out, text: flattenColumns(out.text) };
};


const SERVER = "00000000-0000-4000-8000-000000000010";
const UPSTREAM = "00000000-0000-4000-8000-000000000020";
const CERT = "00000000-0000-4000-8000-000000000099";

/** Строка `locations` после чтения из Postgres -- тот же документ, что пишет UX. */
interface LocationRow {
  id?: string;
  server_id?: string;
  match?: LocationMatch;
  path: string;
  position?: number;
  enabled?: boolean;
  handler?: LocationHandler;
  upstream_id?: string | null;
  upstream_uri?: string | null;
  return_status?: number | null;
  return_page?: string | null;
  return_url?: string | null;
  nginx?: NginxLocationSettings;
  waf?: WafRouteSettings;
  raw?: boolean;
  raw_nginx?: string;
}

function locationFromRow(row: LocationRow): Location {
  const loc: Location = {
    id: row.id ?? "00000000-0000-4000-8000-000000000001",
    serverId: row.server_id ?? SERVER,
    match: row.match ?? "prefix",
    path: row.path,
    position: row.position ?? 0,
    enabled: row.enabled ?? true,
    handler: row.handler ?? "proxy",
    protocol: "http",
    nginx: row.nginx ?? {},
    waf: row.waf ?? {},
    raw: row.raw ?? false,
    rawNginx: row.raw_nginx ?? "",
    builtin: false,
  };
  if (row.upstream_id) loc.upstreamId = row.upstream_id;
  if (row.upstream_uri !== undefined && row.upstream_uri !== null) {
    loc.upstreamUri = row.upstream_uri;
  }
  if (row.return_status != null) loc.returnStatus = row.return_status;
  if (row.return_page != null) loc.returnPage = row.return_page;
  if (row.return_url != null) loc.returnUrl = row.return_url;
  return loc;
}

function compile(
  row: LocationRow,
  extra: { upstreams?: LocationUpstream[]; inspectors?: Inspector[] } = {},
): string {
  return compileLocation({
    location: locationFromRow(row),
    upstreams: extra.upstreams,
    inspectors: extra.inspectors,
  }).text;
}

test("prefix proxy: uuid апстрима становится именем, хвост -- URI", () => {
  const expected = `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_pass http://backend/;
}
`;

  const text = compile(
    {
      match: "prefix",
      path: "/app/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      upstream_uri: "/",
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text, expected);
});

test("exact / regex / regex_i / named печатают оператор match", () => {
  assert.equal(
    compile({ match: "exact", path: "/healthz", handler: "return", return_status: 200 }),
    `location = /healthz {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    return 200;
}
`,
  );
  assert.equal(
    compile({ match: "regex", path: "\\.php$", handler: "return", return_status: 403 }),
    `location ~ \\.php$ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    return 403;
}
`,
  );
  assert.equal(
    compile({ match: "regex_i", path: "\\.(jpg|png)$", handler: "static", nginx: { alias: "/var/www/img/" } }),
    `location ~* \\.(jpg|png)$ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    alias /var/www/img/;
}
`,
  );
  assert.equal(
    compile({ match: "named", path: "waf_deny", handler: "static" }),
    `location @waf_deny {
    waf_route_id 00000000-0000-4000-8000-000000000001;
}
`,
  );
  assert.equal(
    compile({ match: "named", path: "@waf_deny", handler: "static" }),
    `location @waf_deny {
    waf_route_id 00000000-0000-4000-8000-000000000001;
}
`,
  );
});

test("return со страницей уводит на именованный путь через error_page", () => {
  assert.equal(
    compile({
      path: "/gone",
      handler: "return",
      return_status: 410,
      return_page: "@waf_deny",
    }),
    `location /gone {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    error_page 410 =410 @waf_deny;
    return 410;
}
`,
  );
});

/*
  У 3xx второй аргумент return -- адрес, и страницы там быть не может: даже
  если она в строке осталась от прежнего кода, печатать её значило бы увести
  редирект на error_page.
*/
test("return 3xx печатает адрес, а не страницу", () => {
  assert.equal(
    compile({
      path: "/old",
      handler: "return",
      return_status: 301,
      return_url: "https://example.com/new",
      return_page: "@waf_deny",
    }),
    `location /old {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    return 301 "https://example.com/new";
}
`,
  );

  assert.equal(
    compile({ path: "/bare", handler: "return", return_status: 204, return_url: "/ignored" }),
    `location /bare {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    return 204;
}
`,
  );
});

test("static -- только nginx", () => {
  assert.equal(
    compile({
      path: "/",
      handler: "static",
      nginx: { tryFiles: ["$uri", "$uri/", "/index.html"] },
    }),
    `location / {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    try_files $uri $uri/ /index.html;
}
`,
  );
});

test("без upstream_id proxy_pass не печатается", () => {
  assert.equal(
    compile({ path: "/app/", handler: "proxy" }),
    `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
}
`,
  );
});

test("неизвестный uuid апстрима уходит в текст как есть", () => {
  assert.equal(
    compile({ path: "/app/", handler: "proxy", upstream_id: UPSTREAM }),
    `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_pass http://${UPSTREAM};
}
`,
  );
});

test("страница отказа: named + ssi + try_files + waf off", () => {
  const expected = `location @waf_deny {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    root /usr/share/waf/pages;
    ssi on;
    ssi_types *;
    try_files /$waf_deny_name.html /blocked.html;
    waf off;
}
`;

  const text = compile({
    match: "named",
    path: "waf_deny",
    handler: "static",
    nginx: {
      root: "/usr/share/waf/pages",
      ssi: true,
      ssiTypes: ["*"],
      tryFiles: ["/$waf_deny_name.html", "/blocked.html"],
    },
    waf: { enabled: false },
  });

  assert.equal(text, expected);
});

test("прокси /app/: таймаут, заголовки, http/1.1, имя апстрима", () => {
  const expected = `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_read_timeout 90s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://backend/;
}
`;

  const text = compile(
    {
      match: "prefix",
      path: "/app/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      upstream_uri: "/",
      nginx: {
        proxyHttpVersion: "1.1",
        proxyReadTimeoutMs: 90_000,
        proxySetHeaders: [
          { name: "Host", value: "$host" },
          { name: "X-Forwarded-For", value: "$proxy_add_x_forwarded_for" },
          { name: "X-Forwarded-Proto", value: "$scheme" },
        ],
      },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text, expected);
});

test("пул за TLS: https, SNI и Host именем узла вместо $host", () => {
  const expected = `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_ssl_name lalafo.kg;
    proxy_set_header Host lalafo.kg;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass https://lalafo/;
}
`;

  const text = compile(
    {
      match: "prefix",
      path: "/app/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      upstream_uri: "/",
      nginx: {
        proxyHttpVersion: "1.1",
        proxySetHeaders: [
          { name: "Host", value: "$host" },
          { name: "X-Forwarded-For", value: "$proxy_add_x_forwarded_for" },
        ],
      },
    },
    {
      upstreams: [
        {
          id: UPSTREAM,
          name: "lalafo",
          tls: true,
          peers: [{ host: "lalafo.kg" }],
        },
      ],
    },
  );

  assert.equal(text, expected);
});

test("своё имя рукопожатия и свой Host старше хоста узла", () => {
  const expected = `location / {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_ssl_server_name on;
    proxy_ssl_name origin.example;
    proxy_set_header Host www.example;
    proxy_pass https://pool;
}
`;

  const text = compile(
    { match: "prefix", path: "/", handler: "proxy", upstream_id: UPSTREAM },
    {
      upstreams: [
        {
          id: UPSTREAM,
          name: "pool",
          tls: true,
          tlsName: "origin.example",
          hostHeader: "www.example",
          peers: [{ host: "10.0.0.7" }, { host: "10.0.0.8" }],
        },
      ],
    },
  );

  assert.equal(text, expected);
});

/*
  Разные узлы -- разные имена, и решать за оператора тут нечего: без своего
  имени печатается только `proxy_ssl_server_name on`, а SNI остаётся
  умолчанием nginx. Пустой Host у пула значит «заголовок -- дело пути».
*/
test("пул из разных хостов без своего имени не печатает proxy_ssl_name", () => {
  const expected = `location / {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_ssl_server_name on;
    proxy_set_header Host $host;
    proxy_pass https://pool;
}
`;

  const text = compile(
    {
      match: "prefix",
      path: "/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: { proxySetHeaders: [{ name: "Host", value: "$host" }] },
    },
    {
      upstreams: [
        {
          id: UPSTREAM,
          name: "pool",
          tls: true,
          peers: [{ host: "a.example" }, { host: "b.example" }],
        },
      ],
    },
  );

  assert.equal(text, expected);
});

test("Host пула без TLS: заголовок есть, схема остаётся http", () => {
  const expected = `location / {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_set_header Host app.internal;
    proxy_pass http://backend;
}
`;

  const text = compile(
    { match: "prefix", path: "/", handler: "proxy", upstream_id: UPSTREAM },
    {
      upstreams: [
        {
          id: UPSTREAM,
          name: "backend",
          hostHeader: "app.internal",
          peers: [{ host: "10.0.0.1" }],
        },
      ],
    },
  );

  assert.equal(text, expected);
});

test("пресет standard: три заголовка, которых нет в умолчаниях nginx", () => {
  const expected = `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://backend;
}
`;

  const text = compile(
    {
      match: "prefix",
      path: "/app/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: { proxyHeaders: "standard" },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text, expected);
});

/*
  Апгрейд без HTTP/1.1 невозможен, поэтому версию печатает сам пресет -- но
  только когда своей на уровне нет: две строки `proxy_http_version` в одном
  блоке спорят между собой, и выигрывает не та, которую выбрал оператор.
*/
test("пресет websocket: апгрейд, Connection из map и версия 1.1", () => {
  const expected = `location /ws {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_pass http://backend;
}
`;

  const text = compile(
    {
      match: "prefix",
      path: "/ws",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: { proxyHeaders: "websocket" },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text, expected);
});

test("своя версия старше пресета: 1.0 остаётся 1.0", () => {
  const text = compile(
    {
      match: "prefix",
      path: "/ws",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: { proxyHeaders: "websocket", proxyHttpVersion: "1.0" },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text.match(/proxy_http_version/g)?.length, 1);
  assert.match(text, /proxy_http_version 1\.0;/);
});

test("свой список правит пресет по имени, а не дописывается к нему", () => {
  const expected = `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_set_header Host api.internal;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $waf_ray;
    proxy_pass http://backend;
}
`;

  const text = compile(
    {
      match: "prefix",
      path: "/app/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: {
        proxyHeaders: "standard",
        proxySetHeaders: [
          { name: "Host", value: "api.internal" },
          { name: "X-Request-Id", value: "$waf_ray" },
        ],
      },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text, expected);
});

test("custom -- только свой список; none и отсутствие ключа -- пусто", () => {
  const custom = compile(
    {
      match: "prefix",
      path: "/app/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: {
        proxyHeaders: "custom",
        proxySetHeaders: [{ name: "X-Request-Id", value: "$waf_ray" }],
      },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );
  assert.equal(
    custom,
    `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_set_header X-Request-Id $waf_ray;
    proxy_pass http://backend;
}
`,
  );

  const bare = `location /app/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_pass http://backend;
}
`;
  for (const nginx of [{ proxyHeaders: "none" as const }, {}]) {
    assert.equal(
      compile(
        { match: "prefix", path: "/app/", handler: "proxy", upstream_id: UPSTREAM, nginx },
        { upstreams: [{ id: UPSTREAM, name: "backend" }] },
      ),
      bare,
    );
  }
});

test("Host пула старше пресета: имя узла вместо $host", () => {
  const text = compile(
    {
      match: "prefix",
      path: "/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: { proxyHeaders: "standard" },
    },
    {
      upstreams: [
        { id: UPSTREAM, name: "lalafo", tls: true, peers: [{ host: "lalafo.kg" }] },
      ],
    },
  );

  assert.equal(text.match(/proxy_set_header Host/g)?.length, 1);
  assert.match(text, /proxy_set_header Host lalafo\.kg;/);
  assert.match(text, /proxy_set_header X-Forwarded-Proto \$scheme;/);
});

test("nginx jsonb пути: allow/deny, internal, add_header, body size", () => {
  const expected = `location /admin/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    client_max_body_size 2m;
    internal;
    allow 10.0.0.0/8;
    deny all;
    add_header X-Frame-Options DENY always;
}
`;

  const text = compile({
    path: "/admin/",
    handler: "static",
    nginx: {
      clientMaxBodySize: "2m",
      internal: true,
      allow: ["10.0.0.0/8"],
      deny: ["all"],
      addHeaders: [{ name: "X-Frame-Options", value: "DENY", always: true }],
    },
  });

  assert.equal(text, expected);
});

test("proxy jsonb: таймауты в ms, если не кратны секунде", () => {
  const expected = `location /slow/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_connect_timeout 1500ms;
    proxy_send_timeout 2s;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_pass http://backend;
}
`;

  const text = compile(
    {
      path: "/slow/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      nginx: {
        proxyConnectTimeoutMs: 1500,
        proxySendTimeoutMs: 2000,
        proxyBuffering: false,
        proxyRequestBuffering: false,
      },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text, expected);
});

test("waf jsonb пути: инспектор, порог, захват", () => {
  const expected = `location /body/inline/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    waf_score_deny request 50 response=suspicious;
    waf_inspect request modsec wave=0;
    waf_capture request headers args body;
    proxy_pass http://backend/echo;
}
`;

  const text = compile(
    {
      path: "/body/inline/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      upstream_uri: "/echo",
      waf: {
        requestInspectors: [{ name: "modsec" }],
        scoreDeny: { threshold: 50, response: "suspicious" },
        capture: ["headers", "args", "body"],
      },
    },
    { upstreams: [{ id: UPSTREAM, name: "backend" }] },
  );

  assert.equal(text, expected);
});

test("пустой capture на пути -- это off, а не молчание", () => {
  assert.equal(
    compile({ path: "/static/", handler: "static", waf: { capture: [] } }),
    `location /static/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    waf_capture request none;
    waf_capture response none;
}
`,
  );
});

test("raw заменяет внутренности, скелет match/path остаётся", () => {
  const expected = `location /legacy/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    proxy_pass http://old;
    add_header X-Legacy 1;
}
`;

  const text = compile({
    path: "/legacy/",
    handler: "proxy",
    upstream_id: UPSTREAM,
    nginx: { root: "/var/www" },
    waf: { enabled: true },
    raw: true,
    raw_nginx: "proxy_pass http://old;\nadd_header X-Legacy 1;",
  });

  assert.equal(text, expected);
  assert.doesNotMatch(text, /root |waf /);
});

test("raw собирает store:<uuid> из текста оператора", () => {
  const { text, storeRefs } = compileLocation({
    location: locationFromRow({
      path: "/secure/",
      handler: "static",
      raw: true,
      raw_nginx: `ssl_certificate store:${CERT};`,
    }),
  });

  assert.match(text, new RegExp(`store:${CERT}`));
  assert.deepEqual(storeRefs, [CERT]);
});

test("внутри server {} блок сдвигается на два уровня", () => {
  const { text } = compileLocation({
    location: locationFromRow({
      path: "/app/",
      handler: "proxy",
      upstream_id: UPSTREAM,
      upstream_uri: "/",
    }),
    upstreams: [{ id: UPSTREAM, name: "backend" }],
    indent: 2,
  });

  assert.equal(
    text,
    `        location /app/ {
            waf_route_id 00000000-0000-4000-8000-000000000001;
            proxy_pass http://backend/;
        }
`,
  );
});

/*
 * Пределы канала просьб между инспекторами. Ноль у waf_actions_max печатается
 * наравне с прочими значениями: это «канал выключен здесь», а не «ключа нет»,
 * и родительский предел он обязан перебить.
 */
test("waf_action_max / waf_actions_max печатаются на пути, ноль тоже", () => {
  const expected = `location /api/ {
    waf_route_id 00000000-0000-4000-8000-000000000001;
    waf_action_max 256;
    waf_actions_max 32;
    return 204;
}
`;

  const text = compile({
    path: "/api/",
    handler: "return",
    return_status: 204,
    waf: { actionMax: "256", actionsMax: 32 },
  });

  assert.equal(text, expected);

  const off = compile({
    path: "/static/",
    handler: "return",
    return_status: 204,
    waf: { actionsMax: 0 },
  });

  assert.match(off, /waf_actions_max 0;/);
  assert.doesNotMatch(off, /waf_action_max /);
});
