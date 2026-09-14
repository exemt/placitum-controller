/**
 * Документ профиля куки: метки правила против загрузчика инспектора.
 *
 * Метка (tags) сужает правило по читаемой половине значения предъявленной
 * куки. Загрузчик (inspectors/cookie/internal/policy/policy.go) отвергает
 * метку вне алфавита sanitizeTag, метки без куки и метки на absent и invalid;
 * контроллер обязан отвергнуть то же -- иначе поколение вернётся apply_failed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { DocError, renderProfileYaml, validateDoc } from "./cookie-profile-doc.ts";

const SRC = {
  name: "src",
  path: "/",
  maxAgeS: 30 * 24 * 3600,
  renewAfterS: 0,
  sign: "hmac",
  value: { from: "$arg_utm_source", default: "direct", random: 8, maxLen: 64 },
};

function docWith(rule: Record<string, unknown>, cookies: unknown[] = [SRC]): unknown {
  return {
    description: "",
    cookies,
    conditions: [],
    rules: [
      {
        name: "",
        match: { pathPrefix: "", suffixes: [], static: false, methods: [] },
        phase: "",
        status: [],
        actions: [],
        ...rule,
      },
    ],
  };
}

test("метки печатаются вместе с именем куки", () => {
  const doc = validateDoc(docWith({ tags: ["google", "yandex"], drop: "src" }));
  const yaml = renderProfileYaml("default", doc);

  assert.match(yaml, /tags: \["google", "yandex"\]/);
  assert.match(yaml, /cookie: "src"/);
  assert.match(yaml, /drop: "src"/);
});

test("правило без меток их не печатает", () => {
  const yaml = renderProfileYaml("default", validateDoc(docWith({ on: "absent", issue: "src" })));

  assert.doesNotMatch(yaml, /tags:/);
});

test("метки отбраковываются теми же случаями, что у загрузчика", () => {
  const two = [SRC, { ...SRC, name: "ab" }];
  const cases: [string, Record<string, unknown>, unknown[], RegExp][] = [
    ["алфавит", { tags: ["google.com"], drop: "src" }, [SRC], /is not \[A-Za-z0-9_-\]/],
    ["на absent", { on: "absent", tags: ["google"], issue: "src" }, [SRC], /tags never match on absent/],
    [
      "на invalid",
      { on: "invalid", cookie: "src", tags: ["google"], drop: "src" },
      [SRC],
      /tags never match on invalid/,
    ],
    ["без куки", { tags: ["google"] }, two, /tags need cookie/],
    ["у перегрузки", { on: "overload", tags: ["google"] }, [SRC], /takes only at and actions/],
  ];

  for (const [name, rule, cookies, want] of cases) {
    assert.throws(
      () => validateDoc(docWith(rule, cookies)),
      (err: unknown) => err instanceof DocError && want.test(err.message),
      name,
    );
  }
});
