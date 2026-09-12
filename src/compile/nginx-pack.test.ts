/**
 * Упаковка nginx: конфиг, шифрованные store-объекты и страницы отказа.
 * Страницы едут как файлы правил -- по имени и в открытую.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  packNginx,
  parseNginxPointer,
  pointerOf,
  hashNginxTree,
} from "./nginx-pack.ts";

const CERT = "00000000-0000-4000-8000-000000000001";

test("страница едет отдельным блобом под именем файла", () => {
  const packed = packNginx(
    "http {}\n",
    [{ uuid: CERT, type: "certificate", blob: Buffer.from("ciphertext") }],
    [
      { file: "malformed.html", content: "<h1>400</h1>" },
      { file: "error.html", content: "<h1>500</h1>" },
    ],
  );

  assert.deepEqual(Object.keys(packed.pages).sort(), ["error.html", "malformed.html"]);
  // Конфиг, сертификат и две страницы -- четыре тела, каждое своим ключом.
  assert.equal(packed.blobs.size, 4);

  for (const hash of Object.values(packed.pages)) {
    assert.ok(packed.blobs.has(hash), `тело страницы ${hash} не попало в пакет`);
  }
});

test("правка страницы меняет хеш дерева", () => {
  const one = packNginx("http {}\n", [], [{ file: "error.html", content: "a" }]);
  const two = packNginx("http {}\n", [], [{ file: "error.html", content: "b" }]);

  assert.notEqual(one.sha256, two.sha256);
});

test("одинаковое тело у двух страниц кладётся одним блобом", () => {
  const packed = packNginx(
    "http {}\n",
    [],
    [
      { file: "malformed.html", content: "same" },
      { file: "error.html", content: "same" },
    ],
  );

  assert.equal(packed.pages["malformed.html"], packed.pages["error.html"]);
  assert.equal(packed.blobs.size, 2);
});

test("секция страниц не путается со store при одинаковых ключах", () => {
  const hash = "sha256:aa";
  const withStore = hashNginxTree("sha256:cfg", { x: { hash, type: "deny_page" } }, {});
  const withPage = hashNginxTree("sha256:cfg", {}, { x: hash });

  assert.notEqual(withStore, withPage);
});

test("указатель без страниц читается как пустой набор", () => {
  const packed = packNginx("http {}\n", [], []);
  const pointer = pointerOf(packed, 1, 1, 0);
  const { pages: _drop, ...legacy } = pointer;

  const parsed = parseNginxPointer(JSON.parse(JSON.stringify(legacy)));

  assert.notEqual(parsed, null);
  assert.deepEqual(parsed?.pages, {});
});

test("указатель со страницами переживает разбор", () => {
  const packed = packNginx("http {}\n", [], [{ file: "error.html", content: "x" }]);
  const parsed = parseNginxPointer(JSON.parse(JSON.stringify(pointerOf(packed, 2, 1, 0))));

  assert.deepEqual(parsed?.pages, packed.pages);
});

test("страница с чужим хешем отвергается", () => {
  const packed = packNginx("http {}\n", [], [{ file: "error.html", content: "x" }]);
  const broken = { ...pointerOf(packed, 2, 1, 0), pages: { "error.html": "md5:x" } };

  assert.equal(parseNginxPointer(JSON.parse(JSON.stringify(broken))), null);
});
