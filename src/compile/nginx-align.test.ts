/**
 * Колонки печати: что сводится в столбик, а что нет.
 *
 * Проверки соседних компиляторов читают текст через `flattenColumns` -- там
 * важно, какая директива напечатана. Здесь важно обратное: где именно встают
 * пробелы и чего пасс не касается.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { alignColumns, flattenColumns } from "./nginx-align.ts";

const text = (lines: string[]) => alignColumns(lines).join("\n");

test("соседние строки одной директивы встают в колонки", () => {
  assert.equal(
    text([
      "    waf_inspector ip subject=waf.req.ip;",
      "    waf_inspector modsec subject=waf.req.modsec profile=strict;",
      "    waf_inspector ip-ext subject=waf.req.ip profile=ext;",
    ]),
    [
      "    waf_inspector ip     subject=waf.req.ip;",
      "    waf_inspector modsec subject=waf.req.modsec profile=strict;",
      "    waf_inspector ip-ext subject=waf.req.ip     profile=ext;",
    ].join("\n"),
  );
});

test("последнее слово строки колонку не раздвигает", () => {
  // subject=waf.req.modsec длиннее subject=waf.req.ip, но за ним ничего нет:
  // profile= второй строки встаёт по своему соседу, а не по точке с запятой.
  assert.equal(
    text([
      "waf_inspector modsec subject=waf.req.modsec;",
      "waf_inspector api subject=waf.req.ip profile=api;",
    ]),
    [
      "waf_inspector modsec subject=waf.req.modsec;",
      "waf_inspector api    subject=waf.req.ip profile=api;",
    ].join("\n"),
  );
});

test("разные директивы рядом -- не столбик", () => {
  const lines = ["worker_processes 2;", "error_log /var/log/nginx/error.log info;"];
  assert.deepEqual(alignColumns(lines), lines);
});

test("разный отступ -- разные столбики", () => {
  const lines = ["    listen 80;", "        listen 443 ssl;"];
  assert.deepEqual(alignColumns(lines), lines);
});

test("одинокая строка остаётся как есть", () => {
  const lines = ["    waf_inspector ip subject=waf.req.ip;", "}"];
  assert.deepEqual(alignColumns(lines), lines);
});

test("кавычки не трогаем: внутри значения бывает пробел", () => {
  const lines = [
    'add_header X-Robots-Tag "noindex, nofollow";',
    'add_header X-Frame-Options-Long "DENY";',
  ];
  assert.deepEqual(alignColumns(lines), lines);
});

test("готовый блок и raw оператора идут как написаны", () => {
  // Вложенный блок и текст raw приходят одним элементом с переводами строк:
  // такой элемент пасс не разбирает вовсе.
  const raw = "    set $a 1;\n    set $bbbb 2;";
  const lines = ["    listen 80;", raw, "    listen 443;"];
  assert.deepEqual(alignColumns(lines), lines);
});

test("скобки, комментарии и пустые строки рвут столбик", () => {
  const lines = [
    "    waf_inspector ip subject=waf.req.ip;",
    "    # сюда смотрит оператор",
    "    waf_inspector modsec-unknown subject=waf.req.modsec;",
  ];
  assert.deepEqual(alignColumns(lines), lines);
});

test("колонка шире предела -- столбика нет", () => {
  const long = `waf_local_dataset ${"x".repeat(41)} type=active;`;
  const lines = [long, "waf_local_dataset ip type=internal;"];
  assert.deepEqual(alignColumns(lines), lines);
});

test("второй проход ничего не меняет", () => {
  const once = alignColumns([
    "waf_inspector ip subject=waf.req.ip;",
    "waf_inspector modsec subject=waf.req.modsec profile=strict;",
  ]);
  assert.deepEqual(alignColumns(once), once);
});

test("flattenColumns возвращает один пробел и не трогает отступ", () => {
  const aligned = "    waf_inspector ip     subject=waf.req.ip;";
  assert.equal(
    flattenColumns(aligned),
    "    waf_inspector ip subject=waf.req.ip;",
  );
});
