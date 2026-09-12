/**
 * Уровни журнала: документ policy/log-levels, словарь порога и пачка waf.log
 * контроллера.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  levelFor,
  LOG_SERVICES,
  parseLogLevelsBody,
  parseLogLevelsDoc,
} from "./log-levels.ts";
import { LogBatcher, logSubject } from "./log-ship.ts";
import { currentLevel, setLevel } from "./log.ts";

test("документ: чужой вид отвергается, мусорные слова выпадают по одному", () => {
  assert.equal(parseLogLevelsDoc({ v: 1, kind: "agent-conf", levels: {} }), null);
  assert.equal(parseLogLevelsDoc("debug"), null);

  const doc = parseLogLevelsDoc({
    v: 1,
    kind: "log-levels",
    rev: 4,
    levels: { keeper: "debug", geo: "loud", logger: "warn" },
  });

  assert.deepEqual(doc, {
    v: 1,
    kind: "log-levels",
    rev: 4,
    levels: { keeper: "debug", logger: "warn" },
  });
});

test("PUT: неизвестный сервис и чужое слово -- отказ, null снимает ключ", () => {
  assert.deepEqual(parseLogLevelsBody({ levels: { nginx: "debug" } }), {
    ok: false,
    error: "unknown_service",
  });
  assert.deepEqual(parseLogLevelsBody({ levels: { keeper: "emerg" } }), {
    ok: false,
    error: "invalid_log_level",
  });
  assert.deepEqual(parseLogLevelsBody({ levels: [] }), { ok: false, error: "invalid_levels" });
  assert.deepEqual(parseLogLevelsBody({ levels: { keeper: "debug", geo: null, logger: "" } }), {
    ok: true,
    levels: { keeper: "debug" },
  });
});

test("levelFor: свой ключ -- из документа, иначе стартовый", () => {
  const doc = parseLogLevelsDoc({ v: 1, kind: "log-levels", rev: 1, levels: { controller: "debug" } });

  assert.deepEqual(levelFor(doc, "controller", "info"), { level: "debug", source: "controller" });
  assert.deepEqual(levelFor(doc, "keeper", "warn"), { level: "warn", source: "env" });
  assert.deepEqual(levelFor(null, "controller", "info"), { level: "info", source: "env" });
});

test("сервисы: имена уникальны, у каждого своя переменная", () => {
  const names = LOG_SERVICES.map((row) => row.name);
  const envs = LOG_SERVICES.map((row) => row.env);

  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(envs).size, envs.length);
  assert.ok(names.includes("controller"));
});

test("setLevel: словарь nginx, warning -- синоним, чужое слово порог не трогает", () => {
  const was = currentLevel();

  try {
    assert.equal(setLevel("notice"), true);
    assert.equal(currentLevel(), "notice");
    assert.equal(setLevel("WARNING"), true);
    assert.equal(currentLevel(), "warn");
    assert.equal(setLevel("loud"), false);
    assert.equal(currentLevel(), "warn");
  } finally {
    setLevel(was);
  }
});

test("пачка: потолок буфера выбрасывает голову, партия не длиннее 500", () => {
  const batcher = new LogBatcher("controller");

  for (let i = 0; i < 20_010; i += 1) {
    batcher.add("info", `line ${i}`);
  }

  assert.equal(batcher.dropped, 10);
  assert.equal(batcher.length, 20_000);

  const first = batcher.take();
  assert.equal(first.length, 500);
  assert.equal(first[0].text, "line 10");
  assert.equal(first[0].service, "controller");
  assert.equal(first[0].severity, "info");
});

test("пачка: полная по числу строк просит отправки раньше таймера", () => {
  const batcher = new LogBatcher("controller");
  let full = false;

  for (let i = 0; i < 500; i += 1) {
    full = batcher.add("warn", "x");
  }

  assert.equal(full, true);
  assert.equal(batcher.add("info", ""), false);
});

test("subject: разделители шины в имени писателя заменяются", () => {
  assert.equal(logSubject("controller-1"), "waf.log.controller-1");
  assert.equal(logSubject("a b>c*"), "waf.log.a_b_c_");
  assert.equal(logSubject(""), "waf.log.unknown");
});
