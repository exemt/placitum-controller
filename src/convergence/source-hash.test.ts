/**
 * Канон отпечатка источника. Проверяется одно свойство и три исключения:
 * любая значимая правка обязана двигать хеш, а незначимая -- нет.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { sourceHash, SOURCE_SKIP_KEYS } from "./source-hash.ts";

test("порядок ключей не влияет: он зависит от истории правок строки", () => {
  const a = { alpha: 1, beta: 2, gamma: { x: "1", y: "2" } };
  const b = { gamma: { y: "2", x: "1" }, beta: 2, alpha: 1 };

  assert.equal(sourceHash(a), sourceHash(b));
});

test("порядок массива влияет: это порядок Include и порядок волн", () => {
  assert.notEqual(sourceHash(["a", "b"]), sourceHash(["b", "a"]));
});

test("вложенность массивов не схлопывается", () => {
  assert.notEqual(sourceHash([["a"], ["b"]]), sourceHash([["a", "b"]]));
});

test("тип значения различим: 1 и \"1\" -- разные настройки", () => {
  assert.notEqual(sourceHash({ n: 1 }), sourceHash({ n: "1" }));
  assert.notEqual(sourceHash({ n: true }), sourceHash({ n: "true" }));
  assert.notEqual(sourceHash({ n: null }), sourceHash({ n: "null" }));
  assert.notEqual(sourceHash([]), sourceHash({}));
});

test("отсутствующее поле и undefined -- одно и то же", () => {
  // Иначе разбор строки из Postgres, который ставит undefined вместо
  // пропуска ключа, выглядел бы правкой.
  assert.equal(sourceHash({ a: 1 }), sourceHash({ a: 1, b: undefined }));
});

test("null и отсутствие поля -- разные вещи", () => {
  // «Ключ есть, значение пустое» в этой модели снимает настройку целиком,
  // а «ключа нет» -- берёт у родителя (docs/architecture наследование).
  assert.notEqual(sourceHash({ a: 1 }), sourceHash({ a: 1, b: null }));
});

test("правка любого вложенного поля двигает хеш", () => {
  const base = {
    space: { waf: { deadlineMs: 25, scoreDeny: 100 } },
    servers: [{ name: "one", locations: [{ match: "/", waf: { on: true } }] }],
  };

  const touched = structuredClone(base);
  touched.servers[0].locations[0].waf.on = false;

  assert.notEqual(sourceHash(base), sourceHash(touched));
});

test("время правки в отпечаток не входит", () => {
  const a = { name: "x", updatedAt: new Date(0), updated_at: "2026-01-01" };
  const b = { name: "x", updatedAt: new Date(1), updated_at: "2026-08-23" };

  assert.equal(sourceHash(a), sourceHash(b));
});

test("заметка оператора в отпечаток не входит", () => {
  // Иначе панель предлагала бы раскатывать флот из-за правки описания.
  assert.equal(
    sourceHash({ name: "x", description: "было" }),
    sourceHash({ name: "x", description: "стало" }),
  );
});

test("имя в отпечаток входит: от него зависит имя файла профиля", () => {
  assert.notEqual(sourceHash({ name: "a" }), sourceHash({ name: "b" }));
});

test("даты, не попавшие в список исключений, значимы", () => {
  assert.notEqual(
    sourceHash({ expiresAt: new Date(0) }),
    sourceHash({ expiresAt: new Date(1) }),
  );
});

test("тело объекта содержимого считается по своему sha256", () => {
  const one = sourceHash({ body: Buffer.from("<h1>403</h1>") });
  const two = sourceHash({ body: Buffer.from("<h1>404</h1>") });

  assert.notEqual(one, two);
  // Тот же байтовый смысл через Uint8Array -- тот же отпечаток.
  assert.equal(
    one,
    sourceHash({ body: new Uint8Array(Buffer.from("<h1>403</h1>")) }),
  );
});

test("список исключений короткий и осознанный", () => {
  // Каждое лишнее имя здесь -- класс правок, который панель перестанет
  // замечать. Тест стоит затем, чтобы список не рос молча.
  assert.deepEqual(
    [...SOURCE_SKIP_KEYS].sort(),
    ["created_at", "createdAt", "description", "updated_at", "updatedAt"].sort(),
  );
});

test("хеш повторяем", () => {
  const doc = { a: [1, "2", null], b: { c: new Date(5) } };
  assert.equal(sourceHash(doc), sourceHash(doc));
});
