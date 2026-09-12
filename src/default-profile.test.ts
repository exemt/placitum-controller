import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_DOC_BASELINE,
  DEFAULT_RULE_SET_BASELINE,
  docDiffersFromBaseline,
  ipDiffersFromBaseline,
  isDefaultRename,
  ruleSetDiffersFromBaseline,
} from "./default-profile.ts";

/*
 * У default заперто имя, а не содержимое: правка -- обычный ход, переименование
 * равносильно удалению.
 */
test("переименованием считается только другое имя", () => {
  assert.equal(isDefaultRename("default", "own"), true);
  assert.equal(isDefaultRename("default", "default"), false);
  // Тело без имени -- правка одного документа.
  assert.equal(isDefaultRename("default", undefined), false);
  assert.equal(isDefaultRename("own", "other"), false);
});

/*
 * Сид кладёт короткое `{"mode":"off"}`, панель сохраняет полную форму с
 * умолчаниями: без нормализации восстановленный профиль сразу считался бы
 * изменённым.
 */
test("документ сравнивается нормализованным", () => {
  const normalize = (raw: unknown) => ({
    mode: "off",
    ...(raw as Record<string, unknown>),
    rules: (raw as { rules?: unknown[] }).rules ?? [],
  });

  assert.equal(
    docDiffersFromBaseline(
      DEFAULT_DOC_BASELINE.description,
      { mode: "off", rules: [] },
      normalize,
    ),
    false,
  );
  assert.equal(
    docDiffersFromBaseline(DEFAULT_DOC_BASELINE.description, { mode: "on" }, normalize),
    true,
  );
  // Описание -- часть поставки: восстановление возвращает и его.
  assert.equal(docDiffersFromBaseline("своё", { mode: "off" }, normalize), true);
});

test("профиль адреса: поставка -- пустой профиль с allow", () => {
  const pristine = {
    description: "Профиль по умолчанию: без правил, иначе allow",
    rules: [],
    datasets: [],
    outcomes: [],
    defaultAction: "allow",
    defaultCode: "",
  };

  assert.equal(ipDiffersFromBaseline(pristine), false);
  assert.equal(ipDiffersFromBaseline({ ...pristine, rules: [{}] }), true);
  assert.equal(ipDiffersFromBaseline({ ...pristine, defaultAction: "deny" }), true);
  // Объявленный список -- тоже правка: его повезут на ноду.
  assert.equal(ipDiffersFromBaseline({ ...pristine, datasets: [{}] }), true);
});

test("набор правил сверяется именами файлов и их порядком", () => {
  const files = DEFAULT_RULE_SET_BASELINE.files;

  assert.equal(
    ruleSetDiffersFromBaseline(DEFAULT_RULE_SET_BASELINE.description, files, [], true),
    false,
  );
  assert.equal(
    ruleSetDiffersFromBaseline(
      DEFAULT_RULE_SET_BASELINE.description,
      [...files].reverse(),
      [],
      true,
    ),
    true,
  );
  assert.equal(
    ruleSetDiffersFromBaseline(
      DEFAULT_RULE_SET_BASELINE.description,
      files,
      ["ssrf.data"],
      true,
    ),
    true,
  );
  // Непустая политика -- тоже правка: сид кладёт пустую.
  assert.equal(
    ruleSetDiffersFromBaseline(DEFAULT_RULE_SET_BASELINE.description, files, [], false),
    true,
  );
});
