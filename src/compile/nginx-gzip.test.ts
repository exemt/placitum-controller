/**
 * Сжатие на сервере и пути. В nginx директивы работают в http, server и
 * location; в модели они были только на http, и выключить сжатие на одном
 * пути было нечем.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Location } from "../model/location.ts";
import type { Server } from "../model/server.ts";
import { compileLocation } from "./nginx-location.ts";
import { compileServer } from "./nginx-server.ts";

const SPACE = "00000000-0000-4000-8000-000000000001";
const SRV = "00000000-0000-4000-8000-000000000010";

function server(nginx: Server["nginx"]): Server {
  return {
    id: SRV,
    httpSpaceId: SPACE,
    name: "edge",
    serverNames: ["example.com"],
    enabled: true,
    nginx,
    waf: {},
    raw: false,
    rawNginx: "",
  };
}

function location(nginx: Location["nginx"]): Location {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    serverId: SRV,
    match: "prefix",
    path: "/static/",
    position: 0,
    enabled: true,
    handler: "static",
    protocol: "http",
    nginx,
    waf: {},
    raw: false,
    rawNginx: "",
    builtin: false,
  };
}

test("server: сжатие со своими типами и уровнем", () => {
  const text = compileServer({
    server: server({
      gzip: true,
      gzipCompLevel: 5,
      gzipMinLength: 1024,
      gzipVary: true,
      gzipTypes: ["text/css", "application/json"],
    }),
  }).text;

  assert.match(text, /^ {4}gzip on;$/m);
  assert.match(text, /^ {4}gzip_comp_level 5;$/m);
  assert.match(text, /^ {4}gzip_min_length 1024;$/m);
  assert.match(text, /^ {4}gzip_vary on;$/m);
  assert.match(text, /^ {4}gzip_types text\/css application\/json;$/m);
});

test("location: сжатие выключается на пути", () => {
  const text = compileLocation({ location: location({ gzip: false }) }).text;
  assert.equal(
    text,
    "location /static/ {\n    waf_route_id 00000000-0000-4000-8000-000000000020;\n    gzip off;\n}\n",
  );
});

test("ключа нет -- директивы нет, действует родительская", () => {
  const text = compileLocation({ location: location({}) }).text;
  assert.doesNotMatch(text, /gzip/);
});
