/**
 * Канон `config_hash` профилей: контроллер и инспекторы обязаны получить из
 * одного дерева один hex.
 *
 * Пара к нему -- inspectors/modsec/internal/desired/canon_test.go. Оба читают
 * одну фикстуру и оба сверяются с одним прибитым числом: это то место, где
 * реализации расходятся молча -- на экранировании `<` и `&`, на BOM, на CRLF,
 * на нормализации юникода. Расхождение здесь не падает нигде, оно просто
 * навсегда оставляет флот в `drift`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { hashProfiles, type ManifestProfile } from "../rules-manifest.ts";

const FIXTURE = fileURLToPath(
  new URL("../../../tests/fixtures/profiles-canon.json", import.meta.url),
);

interface Fixture {
  expect: string;
  profiles: Record<string, ManifestProfile>;
}

function fixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
}

test("канон профилей совпадает с прибитым числом", () => {
  const fx = fixture();
  assert.equal(hashProfiles(fx.profiles), fx.expect);
});

test("порядок профилей в объекте на хеш не влияет", () => {
  // Имена сортируются лексически: JSON.parse отдаёт ключи в порядке файла, и
  // если бы канон зависел от него, два контроллера с разной историей правок
  // считали бы разное.
  const fx = fixture();
  const reversed: Record<string, ManifestProfile> = {};
  for (const name of Object.keys(fx.profiles).reverse()) {
    reversed[name] = fx.profiles[name];
  }

  assert.equal(hashProfiles(reversed), fx.expect);
});

test("порядок файлов внутри профиля на хеш влияет", () => {
  // Файлы едут в порядке position: SecLang зависит от порядка Include, и
  // канон обязан это видеть.
  const fx = fixture();
  const name = "default";
  const swapped = {
    ...fx.profiles,
    [name]: { files: [...fx.profiles[name].files].reverse() },
  };

  assert.notEqual(hashProfiles(swapped), fx.expect);
});

test("пустой файл -- не то же самое, что отсутствующий", () => {
  const fx = fixture();
  const name = "default";
  const without = {
    ...fx.profiles,
    [name]: { files: fx.profiles[name].files.filter((f) => f.text !== "") },
  };

  assert.notEqual(hashProfiles(without), fx.expect);
});
