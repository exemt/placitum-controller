import assert from "node:assert/strict";
import { test } from "node:test";

import { parseLocationCreate, parseLocationPatch } from "./servers-parse.ts";

const SERVER = "3f2a9c1e-4b2a-41c0-8f3a-000000000002";

/*
  Панель шлёт одно и то же тело на создание и на правку, и пустое числовое поле
  уезжает в нём как null (ux/src/pages/Paths.tsx). Пока создание отвергало null,
  через панель не заводился ни один путь: код ответа нужен только
  handler=return, у proxy и static поле всегда пустое.
*/
test("create: пустой return_status приходит как null и значит «не задано»", () => {
  for (const value of [null, ""]) {
    const parsed = parseLocationCreate(
      { path: "/search", match: "prefix", handler: "proxy", return_status: value },
      SERVER,
    );
    assert.equal(parsed.ok, true, `return_status=${JSON.stringify(value)}`);
    if (parsed.ok) {
      assert.equal(parsed.value.returnStatus, undefined);
      assert.equal(parsed.value.path, "/search");
    }
  }
});

test("create: заданный return_status доезжает, мусорный отвергается", () => {
  const ok = parseLocationCreate(
    { path: "/gone", match: "exact", handler: "return", return_status: 410 },
    SERVER,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.returnStatus, 410);
  }

  for (const bad of [99, 600, "410", 4.5]) {
    const parsed = parseLocationCreate(
      { path: "/bad", match: "prefix", handler: "return", return_status: bad },
      SERVER,
    );
    assert.equal(parsed.ok, false, `return_status=${JSON.stringify(bad)}`);
    if (!parsed.ok) {
      assert.equal(parsed.error, "invalid_return_status");
    }
  }
});

/*
  На правке null -- это «очистить», а не «не задано»: поле, которого не
  присылали, трогать нельзя, а присланное пустым обязано стереться.
*/
test("patch: null очищает return_status, отсутствие поля его не трогает", () => {
  const cleared = parseLocationPatch({ return_status: null });
  assert.equal(cleared.ok, true);
  if (cleared.ok) {
    assert.equal(cleared.value.returnStatus, null);
  }

  const untouched = parseLocationPatch({ path: "/search" });
  assert.equal(untouched.ok, true);
  if (untouched.ok) {
    assert.equal("returnStatus" in untouched.value, false);
  }
});

test("protocol: умолчание http, websocket доезжает, чужое слово отвергается", () => {
  const def = parseLocationCreate({ path: "/a", match: "prefix", handler: "proxy" }, SERVER);
  assert.equal(def.ok, true);
  if (def.ok) {
    assert.equal(def.value.protocol, "http");
  }

  const ws = parseLocationCreate(
    { path: "/ws/", match: "prefix", handler: "proxy", protocol: "websocket" },
    SERVER,
  );
  assert.equal(ws.ok, true);
  if (ws.ok) {
    assert.equal(ws.value.protocol, "websocket");
  }

  const bad = parseLocationCreate(
    { path: "/ws/", match: "prefix", handler: "proxy", protocol: "grpc" },
    SERVER,
  );
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.error, "invalid_protocol");
  }

  const patch = parseLocationPatch({ protocol: "websocket" });
  assert.equal(patch.ok, true);
  if (patch.ok) {
    assert.equal(patch.value.protocol, "websocket");
  }
});
