/**
 * Компилятор сервера: параметры как в `servers` + `server_ports` +
 * `server_certificates` + `locations`. На выходе блок `server {}`.
 * Пути собирает compileLocation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Certificate, Port, ServerCertificate, ServerPort } from "../model/listen.ts";
import type { Location } from "../model/location.ts";
import type { Server } from "../model/server.ts";
import type { NginxServerSettings } from "../model/settings.ts";
import type { WafRouteSettings } from "../model/waf-route.ts";
import { flattenColumns } from "./nginx-align.ts";
import { compileServer as compileServerColumns } from "./nginx-server.ts";

/*
  Колонки печати -- забота nginx-align.ts, и проверяет их nginx-align.test.ts.
  Здесь текст читают по директивам, поэтому столбик схлопывается обратно в один
  пробел: иначе каждая проверка зависела бы от длины соседнего имени в том же
  блоке -- новое имя в наборе роняло бы те, что про него ничего не знают.
*/
const compileServer: typeof compileServerColumns = (...args) => {
  const out = compileServerColumns(...args);
  return { ...out, text: flattenColumns(out.text) };
};


const SPACE = "00000000-0000-4000-8000-000000000001";
const SERVER = "00000000-0000-4000-8000-000000000010";
const PORT = "00000000-0000-4000-8000-000000000030";
const UPSTREAM = "00000000-0000-4000-8000-000000000020";
const CERT_STORE = "00000000-0000-4000-8000-0000000000aa";
const KEY_STORE = "00000000-0000-4000-8000-0000000000bb";
const CHAIN_STORE = "00000000-0000-4000-8000-0000000000cc";

interface ServerRow {
  id?: string;
  name?: string;
  server_names?: string[];
  enabled?: boolean;
  nginx?: NginxServerSettings;
  waf?: WafRouteSettings;
  raw?: boolean;
  raw_nginx?: string;
}

function serverFromRow(row: ServerRow = {}): Server {
  return {
    id: row.id ?? SERVER,
    httpSpaceId: SPACE,
    name: row.name ?? "edge",
    serverNames: row.server_names ?? [],
    enabled: row.enabled ?? true,
    nginx: row.nginx ?? {},
    waf: row.waf ?? {},
    raw: row.raw ?? false,
    rawNginx: row.raw_nginx ?? "",
  };
}

function listen(
  port: number,
  extra: Partial<ServerPort> & { address?: string; portSsl?: boolean; portHttp2?: boolean } = {},
): ServerPort & { port: Port } {
  return {
    id: extra.id ?? "00000000-0000-4000-8000-000000000031",
    serverId: extra.serverId ?? SERVER,
    portId: extra.portId ?? PORT,
    ssl: extra.ssl ?? false,
    http2: extra.http2 ?? false,
    proxyProtocol: extra.proxyProtocol ?? false,
    defaultServer: extra.defaultServer ?? false,
    port: {
      id: extra.portId ?? PORT,
      httpSpaceId: SPACE,
      name: "http",
      address: extra.address ?? "0.0.0.0",
      port,
      ssl: extra.portSsl ?? false,
      http2: extra.portHttp2 ?? false,
      proxyProtocol: false,
    },
  };
}

function location(path: string, extra: Partial<Location> = {}): Location {
  return {
    id: extra.id ?? "00000000-0000-4000-8000-000000000040",
    serverId: SERVER,
    match: extra.match ?? "prefix",
    path,
    position: extra.position ?? 0,
    enabled: extra.enabled ?? true,
    handler: extra.handler ?? "static",
    protocol: "http",
    upstreamId: extra.upstreamId,
    upstreamUri: extra.upstreamUri,
    nginx: extra.nginx ?? {},
    waf: extra.waf ?? {},
    raw: extra.raw ?? false,
    rawNginx: extra.rawNginx ?? "",
    builtin: false,
  };
}

function compile(input: {
  server?: ServerRow;
  listens?: (ServerPort & { port: Port })[];
  certificates?: (ServerCertificate & { certificate: Certificate })[];
  locations?: Location[];
  indent?: number;
}): ReturnType<typeof compileServer> {
  return compileServer({
    server: serverFromRow(input.server),
    listens: input.listens,
    certificates: input.certificates,
    locations: input.locations,
    indent: input.indent,
    upstreams: [{ id: UPSTREAM, name: "backend" }],
  });
}

test("listen на 0.0.0.0 печатает только порт", () => {
  const expected = `server {
    listen 8080;
}
`;
  assert.equal(compile({ listens: [listen(8080)] }).text, expected);
});

test("listen: адрес, ssl, http2, proxy_protocol, default_server", () => {
  const expected = `server {
    listen 127.0.0.1:8443 ssl http2 proxy_protocol default_server;
}
`;
  assert.equal(
    compile({
      listens: [
        listen(8443, {
          address: "127.0.0.1",
          ssl: true,
          http2: true,
          proxyProtocol: true,
          defaultServer: true,
        }),
      ],
    }).text,
    expected,
  );
});

test("ssl на порту тоже включает listen ssl", () => {
  assert.match(
    compile({ listens: [listen(443, { portSsl: true })] }).text,
    /listen 443 ssl;/,
  );
});

test("server_name из массива имён", () => {
  const expected = `server {
    listen 8080;
    server_name example.com www.example.com;
}
`;
  assert.equal(
    compile({
      server: { server_names: ["example.com", "www.example.com"] },
      listens: [listen(8080)],
    }).text,
    expected,
  );
});

test("сертификат сервера -- store:<uuid>, без PEM", () => {
  const expected = `server {
    listen 443 ssl;
    ssl_certificate store:${CERT_STORE};
    ssl_certificate_key store:${KEY_STORE};
    ssl_trusted_certificate store:${CHAIN_STORE};
}
`;
  const { text, storeRefs } = compile({
    listens: [listen(443, { ssl: true })],
    certificates: [
      {
        id: "00000000-0000-4000-8000-000000000050",
        serverId: SERVER,
        certificateId: "00000000-0000-4000-8000-000000000051",
        kind: "server",
        certificate: {
          id: "00000000-0000-4000-8000-000000000051",
          httpSpaceId: SPACE,
          name: "edge",
          type: "server",
          certStoreId: CERT_STORE,
          keyStoreId: KEY_STORE,
          chainStoreId: CHAIN_STORE,
          sans: [],
          fingerprint: "ab",
          subject: "CN=edge",
          issuer: "CN=Test CA",
          serial: "1",
        },
      },
    ],
  });
  assert.equal(text, expected);
  assert.deepEqual(storeRefs, [CERT_STORE, KEY_STORE, CHAIN_STORE]);
});

test("стендовый edge: root, real_ip, error_page, waf, путь /app/", () => {
  const expected = `server {
    listen 8080;
    root /var/www;
    set_real_ip_from 0.0.0.0/0;
    set_real_ip_from ::/0;
    real_ip_header X-Forwarded-For;
    error_page 400 =400 @waf_deny;
    error_page 403 =403 @waf_deny;
    waf on;
    waf_inspect request ip wave=0;

    location @waf_deny {
        waf_route_id 00000000-0000-4000-8000-000000000040;
        ssi on;
        ssi_types *;
        try_files /blocked.html;
        waf off;
    }

    location /app/ {
        waf_route_id 00000000-0000-4000-8000-000000000040;
        proxy_pass http://backend/;
    }
}
`;

  const { text } = compile({
    server: {
      name: "edge",
      nginx: {
        root: "/var/www",
        realIpFrom: ["0.0.0.0/0", "::/0"],
        realIpHeader: "X-Forwarded-For",
        errorPages: [
          { codes: [400], status: 400, target: "@waf_deny" },
          { codes: [403], status: 403, target: "@waf_deny" },
        ],
      },
      waf: { enabled: true, requestInspectors: [{ name: "ip" }] },
    },
    listens: [listen(8080)],
    locations: [
      location("waf_deny", {
        match: "named",
        handler: "static",
        protocol: "http",
        nginx: { ssi: true, ssiTypes: ["*"], tryFiles: ["/blocked.html"] },
        waf: { enabled: false },
      }),
      location("/app/", {
        handler: "proxy",
        protocol: "http",
        upstreamId: UPSTREAM,
        upstreamUri: "/",
      }),
    ],
  });

  assert.equal(text, expected);
});

test("выключенный путь не печатается", () => {
  const { text } = compile({
    listens: [listen(8080)],
    locations: [
      location("/hidden/", { enabled: false, handler: "return", returnStatus: 404 }),
      location("/ok/", { handler: "return", returnStatus: 200 }),
    ],
  });
  assert.doesNotMatch(text, /hidden/);
  assert.match(text, /location \/ok\//);
});

test("raw заменяет внутренности, listen и server_name остаются", () => {
  const expected = `server {
    listen 8080;
    server_name raw.example;
    return 204;
}
`;
  const { text } = compile({
    server: {
      server_names: ["raw.example"],
      nginx: { root: "/var/www" },
      waf: { enabled: true },
      raw: true,
      raw_nginx: "return 204;",
    },
    listens: [listen(8080)],
    locations: [location("/app/", { handler: "proxy", upstreamId: UPSTREAM })],
  });
  assert.equal(text, expected);
  assert.doesNotMatch(text, /root |waf |location /);
});

test("httpsRedirect -- return 301, не полноценный сервер", () => {
  assert.match(
    compile({
      server: { nginx: { httpsRedirect: true } },
      listens: [listen(80)],
    }).text,
    /return 301 https:\/\/\$host\$request_uri;/,
  );
});

test("add_header сервера -- HSTS на весь хост, always по флагу", () => {
  const text = compile({
    server: {
      nginx: {
        addHeaders: [
          { name: "Strict-Transport-Security", value: "max-age=31536000", always: true },
          { name: "X-Frame-Options", value: "DENY" },
        ],
      },
    },
    listens: [listen(80)],
  }).text;
  assert.match(text, /add_header Strict-Transport-Security max-age=31536000 always;/);
  assert.match(text, /add_header X-Frame-Options DENY;/);
});

test("внутри http {} блок сдвигается на один уровень", () => {
  const { text } = compile({ listens: [listen(8080)], indent: 1 });
  assert.equal(
    text,
    `    server {
        listen 8080;
    }
`,
  );
});

// mTLS: корень для проверки клиентов и его список отзыва печатаются рядом.
// ssl_crl без ssl_client_certificate nginx применить не к чему, поэтому
// компилятор их не разделяет.
test("mTLS -- ssl_client_certificate и ssl_crl из store", () => {
  const CA_STORE = "00000000-0000-4000-8000-000000000060";
  const CRL_STORE = "00000000-0000-4000-8000-000000000061";

  const expected = `server {
    listen 443 ssl;
    ssl_certificate store:${CERT_STORE};
    ssl_certificate_key store:${KEY_STORE};
    ssl_client_certificate store:${CA_STORE};
    ssl_crl store:${CRL_STORE};
    ssl_verify_client on;
    ssl_verify_depth 2;
}
`;

  const { text, storeRefs } = compile({
    // depth 2 -- клиентов подписал промежуточный CA; с дефолтной единицей
    // nginx отверг бы валидный сертификат.
    server: { nginx: { sslVerifyClient: "on", sslVerifyDepth: 2 } },
    listens: [listen(443, { ssl: true })],
    certificates: [
      {
        id: "00000000-0000-4000-8000-000000000052",
        serverId: SERVER,
        certificateId: "00000000-0000-4000-8000-000000000053",
        kind: "server",
        certificate: {
          id: "00000000-0000-4000-8000-000000000053",
          httpSpaceId: SPACE,
          name: "edge",
          type: "server",
          certStoreId: CERT_STORE,
          keyStoreId: KEY_STORE,
          sans: [],
          fingerprint: "ab",
          subject: "CN=edge",
          issuer: "CN=Test CA",
          serial: "1",
        },
      },
      {
        id: "00000000-0000-4000-8000-000000000054",
        serverId: SERVER,
        certificateId: "00000000-0000-4000-8000-000000000055",
        kind: "client_ca",
        certificate: {
          id: "00000000-0000-4000-8000-000000000055",
          httpSpaceId: SPACE,
          name: "clients-root",
          type: "client_ca",
          certStoreId: CA_STORE,
          sans: [],
          fingerprint: "cd",
          subject: "CN=Clients Root CA",
          issuer: "CN=Clients Root CA",
          serial: "9",
          crl: {
            storeId: CRL_STORE,
            issuer: "CN=Clients Root CA",
            revoked: 2,
          },
        },
      },
    ],
  });

  assert.equal(text, expected);
  assert.deepEqual(storeRefs, [CERT_STORE, KEY_STORE, CA_STORE, CRL_STORE]);
});

// Корень без списка отзыва -- обычный случай: ssl_crl не печатается вовсе,
// пустая директива nginx не устроит.
test("client_ca без CRL не печатает ssl_crl", () => {
  const CA_STORE = "00000000-0000-4000-8000-000000000060";

  const { text } = compile({
    listens: [listen(443, { ssl: true })],
    certificates: [
      {
        id: "00000000-0000-4000-8000-000000000054",
        serverId: SERVER,
        certificateId: "00000000-0000-4000-8000-000000000055",
        kind: "client_ca",
        certificate: {
          id: "00000000-0000-4000-8000-000000000055",
          httpSpaceId: SPACE,
          name: "clients-root",
          type: "client_ca",
          certStoreId: CA_STORE,
          sans: [],
          fingerprint: "cd",
          subject: "CN=Clients Root CA",
          issuer: "CN=Clients Root CA",
          serial: "9",
        },
      },
    ],
  });

  assert.match(text, /ssl_client_certificate store:/);
  assert.doesNotMatch(text, /ssl_crl/);
});

test("nested=include: пути заглушками по uuid, выключенный закомментирован", () => {
  const api = "00000000-0000-4000-8000-000000000041";
  const off = "00000000-0000-4000-8000-000000000042";
  const { text } = compileServer({
    server: serverFromRow({ server_names: ["edge.test"], waf: { enabled: true } }),
    listens: [listen(8080)],
    locations: [
      location("/", { nginx: { root: "/var/www" } }),
      location("/api/", { id: api, match: "exact", handler: "proxy", upstreamId: UPSTREAM }),
      location("/old/", { id: off, enabled: false }),
    ],
    upstreams: [{ id: UPSTREAM, name: "backend" }],
    nested: "include",
  });

  // Обёртка схлопывает двойной пробел перед комментарием заглушки. Заглушки --
  // список: одна пустая строка перед ним, между строками пустых нет.
  const expected = `server {
    listen 8080;
    server_name edge.test;
    waf on;

    include locations/00000000-0000-4000-8000-000000000040.conf; # location /
    include locations/${api}.conf; # location = /api/
    # include locations/${off}.conf; # location /old/ (off)
}
`;
  assert.equal(text, expected);
});
