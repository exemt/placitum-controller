/**
 * Наложение черновика и превью узла: то, чем живёт превью карточки.
 *
 * Проверяется главное свойство -- превью печатается тем же компилятором, что
 * и `send`, поэтому «текст на экране» и «текст, который уедет» отличаются
 * ровно на несохранённую правку и ни на что больше.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { flattenColumns } from "./nginx-align.ts";
import { applyDraft, DraftParseError } from "./nginx-draft.ts";
import { previewBlock, type PreviewNode } from "./nginx-preview.ts";
import { compileNginx } from "./nginx.ts";
import type { NginxExport } from "./nginx-source.ts";

const SPACE = "00000000-0000-4000-8000-000000000001";
const SRV = "00000000-0000-4000-8000-000000000010";
const LOC = "00000000-0000-4000-8000-000000000020";
const PORT = "00000000-0000-4000-8000-000000000030";
const UP = "00000000-0000-4000-8000-000000000050";
const NEW = "00000000-0000-4000-8000-0000000000ff";

/** Превью без колонок: проверки читают директивы, а не ширину столбика. */
const preview = (src: NginxExport, node?: PreviewNode) => flattenColumns(previewBlock(src, node));

function source(): NginxExport {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    space: {
      id: SPACE,
      name: "default",
      nginxMain: {},
      nginx: {},
      wafHttp: { agentSocket: "/var/run/waf/verdict.sock" },
      waf: {},
      raw: false,
      rawNginx: "",
      createdAt: now,
      updatedAt: now,
    },
    inspectors: [],
    datasets: [],
    denyResponses: [],
    bodyStores: [],
    logFormats: [],
    upstreams: [],
    // Каталог портов пространства: по нему разворачиваются привязки черновика.
    ports: [
      {
        id: PORT,
        httpSpaceId: SPACE,
        name: "http",
        address: "0.0.0.0",
        port: 80,
        ssl: false,
        http2: false,
        proxyProtocol: false,
      },
    ],
    certificates: [],
    contentObjects: [],
    servers: [
      {
        server: {
          id: SRV,
          httpSpaceId: SPACE,
          name: "edge",
          serverNames: ["example.com"],
          enabled: true,
          nginx: {},
          waf: { deadlineMs: 50, exception: ["request timeout deny"] },
          raw: false,
          rawNginx: "",
        },
        listens: [
          {
            id: "00000000-0000-4000-8000-000000000040",
            serverId: SRV,
            portId: PORT,
            ssl: false,
            http2: false,
            proxyProtocol: false,
            defaultServer: false,
            port: {
              id: PORT,
              httpSpaceId: SPACE,
              name: "http",
              address: "0.0.0.0",
              port: 80,
              ssl: false,
              http2: false,
              proxyProtocol: false,
            },
          },
        ],
        certificates: [],
        locations: [
          {
            id: LOC,
            serverId: SRV,
            match: "prefix",
            path: "/",
            position: 0,
            enabled: true,
            handler: "static",
            protocol: "http",
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
}

test("черновик пути виден в тексте, база не тронута", () => {
  const base = source();
  const next = applyDraft(base, {
    location: { uuid: LOC, waf: { enabled: false }, nginx: { accessLog: "off" } },
  });

  assert.match(compileNginx(next).text, /waf off;/);
  assert.match(compileNginx(next).text, /access_log off;/);
  assert.doesNotMatch(compileNginx(base).text, /waf off;/);
});

test("несохранённый путь появляется в своём сервере", () => {
  const next = applyDraft(source(), {
    location: {
      uuid: "00000000-0000-4000-8000-0000000000ff",
      server_id: SRV,
      match: "exact",
      path: "/healthz",
      handler: "return",
      protocol: "http",
      return_status: 200,
      waf: { enabled: false },
    },
  });

  assert.match(compileNginx(next).text, /location = \/healthz \{/);
});

test("черновик http заменяет только названные документы", () => {
  const next = applyDraft(source(), { http: { nginx: { sendfile: true } } });

  const text = compileNginx(next).text;
  assert.match(text, /sendfile on;/);
  // Сервер не называли -- его документ остался прежним.
  assert.match(text, /waf_deadline request 50ms;/);
});

test("кривой черновик -- ошибка формы, не сбой", () => {
  assert.throws(
    () => applyDraft(source(), { server: { uuid: SRV, waf: { deadlineMs: "скоро" } } }),
    (err: unknown) => err instanceof DraftParseError,
  );
});

test("превью пути -- только его блок, без сервера и http", () => {
  const src = applyDraft(source(), { location: { uuid: LOC, waf: { enabled: true } } });

  const block = preview(src, { kind: "location", uuid: LOC });
  assert.match(block, /^location \/ \{/);
  assert.match(block, /waf on;/);
  assert.doesNotMatch(block, /server_name/);
  assert.doesNotMatch(block, /^http \{/m);
});

test("превью сервера: сам блок, пути заглушками include по uuid", () => {
  const block = preview(source(), { kind: "server", uuid: SRV });
  assert.match(block, /^server \{/);
  assert.match(block, /listen 80;/);
  assert.match(block, /server_name example\.com;/);
  assert.match(block, /waf_deadline request 50ms;/);
  assert.match(block, new RegExp(`^    include locations/${LOC}\\.conf; +# location /$`, "m"));
  assert.doesNotMatch(block, /location \/ \{/);
  assert.doesNotMatch(block, /waf_route_id/);
});

test("превью http: апстримы и серверы заглушками, выключенный сервер закомментирован", () => {
  const src = applyDraft(source(), { http: { nginx: { sendfile: true } } });

  const block = preview(src, { kind: "http" });
  assert.match(block, /^http \{/m);
  assert.match(block, /sendfile on;/);
  assert.match(block, new RegExp(`^    include servers/${SRV}\\.conf; +# server example\\.com$`, "m"));
  // Решения по запросу в http не печатаются вовсе -- они на сервере.
  assert.doesNotMatch(block, /waf_deadline/);
  assert.doesNotMatch(block, /server_name/);

  const off = preview(applyDraft(src, { server: { uuid: SRV, enabled: false } }), { kind: "http" });
  assert.match(
    off,
    new RegExp(`^    # include servers/${SRV}\\.conf; +# server example\\.com \\(off\\)$`, "m"),
  );
});

test("без узла -- файл целиком, как на send: заглушек в нём нет", () => {
  const text = previewBlock(source(), undefined);
  assert.equal(text, compileNginx(source()).text);
  assert.doesNotMatch(text, /include servers\//);
  assert.doesNotMatch(compileNginx(source()).text, /include (servers|locations|upstreams)\//);
});

test("сервер сам по себе печатается как в файле, с точностью до отступа", () => {
  const file = compileNginx(source()).text;
  const block = previewBlock(source(), { kind: "server", uuid: SRV });
  // До первого пути тексты совпадают: заглушка стоит на его месте.
  const head = block
    .split("\n")
    .slice(0, 4)
    .map((line) => "    " + line)
    .join("\n");
  assert.ok(file.includes(head), `${head}\n--- not in ---\n${file}`);
});

test("черновик нового сервера встаёт в дерево со своими привязками", () => {
  const src = applyDraft(source(), {
    server: {
      uuid: "",
      server_names: ["new.example.com"],
      waf: { enabled: true },
      listens: [{ port_id: PORT, default_server: true }],
    },
  });

  const block = preview(src, { kind: "server", uuid: "" });
  assert.match(block, /listen 80 default_server;/);
  assert.match(block, /server_name new\.example\.com;/);
  assert.match(block, /waf on;/);
  // Сохранённый сервер не тронут, новый встал рядом с ним.
  assert.equal(src.servers.length, 2);
  assert.equal(src.servers[0].server.serverNames[0], "example.com");
  assert.equal(src.servers[1].server.name, "new.example.com");
});

test("привязки черновика заменяют сохранённые; чужой порт -- ошибка формы", () => {
  const src = applyDraft(source(), { server: { uuid: SRV, listens: [] } });
  assert.doesNotMatch(preview(src, { kind: "server", uuid: SRV }), /listen /);

  assert.throws(
    () => applyDraft(source(), { server: { uuid: SRV, listens: [{ port_id: NEW }] } }),
    (err: unknown) => err instanceof DraftParseError && err.code === "unknown_port",
  );
  assert.throws(
    () =>
      applyDraft(source(), {
        server: { uuid: SRV, certificates: [{ certificate_id: NEW, kind: "server" }] },
      }),
    (err: unknown) => err instanceof DraftParseError && err.code === "unknown_certificate",
  );
});

test("черновик пула: свой блок, заглушка в http, тот же uuid -- замена", () => {
  const src = applyDraft(source(), {
    upstream: {
      uuid: UP,
      name: "app",
      method: "least_conn",
      keepalive: 16,
      peers: [
        { host: "10.0.0.1", port: 8080 },
        { host: "10.0.0.2", port: 8080, backup: true },
      ],
    },
  });

  assert.equal(
    preview(src, { kind: "upstream", uuid: UP }),
    "upstream app {\n" +
      "    least_conn;\n" +
      "    server 10.0.0.1:8080;\n" +
      "    server 10.0.0.2:8080 backup;\n" +
      "    keepalive 16;\n" +
      "}\n",
  );
  assert.match(
    preview(src, { kind: "http" }),
    new RegExp(`^    include upstreams/${UP}\\.conf; +# upstream app$`, "m"),
  );
  assert.match(compileNginx(src).text, /^    upstream app \{$/m);

  const renamed = applyDraft(src, {
    upstream: { uuid: UP, name: "app2", peers: [{ host: "10.0.0.1", port: 80 }] },
  });
  assert.equal(renamed.upstreams.length, 1);
  assert.equal(renamed.upstreams[0].name, "app2");

  assert.throws(
    () => applyDraft(source(), { upstream: { uuid: UP, name: "", peers: [] } }),
    (err: unknown) => err instanceof DraftParseError && err.code === "invalid_name",
  );
});

test("неизвестный узел -- пустой текст, а не файл целиком", () => {
  assert.equal(previewBlock(source(), { kind: "server", uuid: NEW }), "");
  assert.equal(previewBlock(source(), { kind: "location", uuid: NEW }), "");
  assert.equal(previewBlock(source(), { kind: "upstream", uuid: NEW }), "");
});
