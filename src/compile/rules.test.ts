import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { compileRules } from "./rules.ts";
import { packSource, referencedDataFiles } from "./pack.ts";

const engine = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const policy = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";

test("compile writes files by uuid and profiles as uuid lists", async () => {
  const root = await mkdtemp(join(tmpdir(), "waf-compile-"));
  const dest = join(root, "rules");

  try {
    const out = await compileRules(dest, {
      files: [
        { id: engine, text: "SecRuleEngine On\n" },
        { id: policy, text: "SecRule ARGS \"@rx x\" \"id:1,deny\"\n" },
      ],
      profiles: [
        { name: "default", files: [engine, policy] },
        { name: "allow", files: [engine] },
      ],
    });

    assert.equal(out.files, 2);
    assert.equal(out.profiles, 2);
    assert.equal(
      await readFile(join(dest, "files", engine), "utf8"),
      "SecRuleEngine On\n",
    );
    assert.equal(
      await readFile(join(dest, "profiles", "default"), "utf8"),
      `${engine}\n${policy}\n`,
    );
    assert.equal(
      await readFile(join(dest, "profiles", "allow"), "utf8"),
      `${engine}\n`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("compile rejects a profile that points at a missing file", async () => {
  const root = await mkdtemp(join(tmpdir(), "waf-compile-"));

  await assert.rejects(
    () =>
      compileRules(join(root, "rules"), {
        files: [{ id: engine, text: "x" }],
        profiles: [{ name: "default", files: [policy] }],
      }),
    /unknown file/,
  );

  await rm(root, { recursive: true, force: true });
});

/*
 * Файлы данных, привязанные к профилю: секция data наполняется из привязок,
 * а не только сканом каталога правил. Список фраз не является правилом, и
 * включать его в профиль как правило нельзя -- до привязок сослаться на него
 * было нечем.
 */
test("packSource: привязанные файлы данных едут в секцию data", () => {
  const packed = packSource({
    files: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "10-sqli.conf",
        text: 'SecRule ARGS "@pmFromFile sqli_words.txt" "id:1,deny"',
      },
    ],
    profiles: [
      {
        name: "strict",
        files: ["11111111-1111-4111-8111-111111111111"],
        data: [{ name: "sqli_words.txt", text: "union select\n" }],
      },
    ],
  });

  assert.ok(packed.data["sqli_words.txt"] !== undefined);
  assert.equal(packed.blobs.get(packed.data["sqli_words.txt"])?.toString(), "union select\n");
});

/*
 * Секция data на ноде одна и раскладывается в каталог каждого профиля.
 * Одноимённые файлы с разными телами молча затёрли бы друг друга: один
 * профиль поехал бы со списком фраз другого.
 */
test("packSource: одноимённые файлы данных с разным телом -- отказ", () => {
  assert.throws(
    () =>
      packSource({
        files: [],
        profiles: [
          { name: "a", files: [], data: [{ name: "w.txt", text: "one" }] },
          { name: "b", files: [], data: [{ name: "w.txt", text: "two" }] },
        ],
      }),
    /differs between profiles/,
  );
});

// Сокращение @pmf и адресный оператор ловятся так же, как @pmFromFile.
test("referencedDataFiles: сокращения и ipMatchFromFile", () => {
  const names = referencedDataFiles(
    'SecRule ARGS "@pmf words.txt" "id:1"\n' +
      'SecRule REMOTE_ADDR "@ipMatchFromFile nets.txt" "id:2"',
  );

  assert.deepEqual(names.sort(), ["nets.txt", "words.txt"]);
});
