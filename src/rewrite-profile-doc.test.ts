/**
 * Документ профиля rewrite против загрузчика инспектора.
 *
 * YAML, который печатает renderProfileYaml, читает строгий загрузчик
 * (inspectors/rewrite/internal/config/profile.go, KnownFields): расхождение --
 * не стиль, а apply_failed канала. Поэтому печать проверяется дословно, а
 * отбраковка -- теми же случаями, что и у Go-тестов инспектора.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DocError,
  normalizeDoc,
  renderProfileYaml,
  validateDoc,
} from "./rewrite-profile-doc.ts";

const SAMPLE = {
  mode: "enforce",
  deny_response: "rewrite_failed",
  groups: [
    {
      name: "mask",
      default: true,
      status: [200],
      content_type: ["application/json", "+json"],
      body: [
        { op: "replace", pattern: "canary-([a-z0-9]+)", to: "masked-$1" },
        { op: "insert_before", pattern: "</body>", text: "<!-- x -->", max_matches: 1 },
      ],
    },
    {
      name: "hdrs",
      default: false,
      headers: [
        { op: "set", name: "X-Frame-Options", value: "DENY" },
        { op: "unset", name: "Server" },
      ],
    },
  ],
  prior: [
    {
      from: "action",
      accept: ["mutate"],
      codes: ["pii_suspect"],
    },
    { from: "modsec", accept: ["skip"] },
  ],
};

test("нормализация достраивает умолчания и понимает обе записи ключей", () => {
  const doc = normalizeDoc({});

  assert.equal(doc.denyResponse, "rewrite_failed");

  const camel = normalizeDoc({ denyResponse: "blocked" });
  assert.equal(camel.denyResponse, "blocked");

  // Поводы приводятся к верхнему регистру, как у остальных получателей.
  const doc2 = validateDoc(SAMPLE);
  assert.deepEqual(doc2.prior[0].codes, ["PII_SUSPECT"]);
});

test("печать -- дословно то, что читает загрузчик инспектора", () => {
  const yaml = renderProfileYaml("stand", validateDoc(SAMPLE));

  assert.equal(
    yaml,
    `# Профиль rewrite stand. Собран контроллером, править здесь нечего:
# источник -- таблица rewrite_profiles, раздел «Инспекторы» в UX.

mode: "enforce"
deny_response: "rewrite_failed"

groups:
  - name: mask
    default: true
    status: [200]
    content_type: ["application/json", "+json"]
    body:
      - op: replace
        pattern: "canary-([a-z0-9]+)"
        to: "masked-$1"
      - op: insert_before
        pattern: "</body>"
        text: "<!-- x -->"
        max_matches: 1
  - name: hdrs
    default: false
    headers:
      - { op: set, name: "X-Frame-Options", value: "DENY" }
      - { op: unset, name: "Server" }

trigger:
  prior:
    - from: "action"
      accept: [mutate]
      codes: ["PII_SUSPECT"]
    - from: "modsec"
      accept: [skip]
`,
  );
});

function rejects(doc: unknown, why: RegExp): void {
  assert.throws(() => validateDoc(doc), DocError);
  try {
    validateDoc(doc);
  } catch (err) {
    assert.match((err as Error).message, why);
  }
}

test("отбраковка повторяет загрузчик инспектора", () => {
  // Битое выражение валит профиль при сохранении, а не apply_failed позже.
  rejects(
    { groups: [{ name: "g", body: [{ op: "remove", pattern: "([" }] }] },
    /pattern/,
  );

  // Оба глагола умеют ослаблять: послабление требует имени.
  rejects(
    {
      groups: [{ name: "g", headers: [{ op: "unset", name: "Server" }] }],
      prior: [{ from: "*", accept: ["skip"] }],
    },
    /named sender/,
  );

  // Чужой глагол канала правилу приёма не положен.
  rejects(
    {
      groups: [{ name: "g", headers: [{ op: "unset", name: "Server" }] }],
      prior: [{ from: "action", accept: ["note"] }],
    },
    /not ours/,
  );

  // Асимметрия заголовков: подставить Set-Cookie нельзя, снять -- можно.
  rejects(
    { groups: [{ name: "g", headers: [{ op: "set", name: "Set-Cookie", value: "x" }] }] },
    /cookie channel/,
  );
  validateDoc({
    groups: [{ name: "g", headers: [{ op: "unset", name: "Set-Cookie" }] }],
  });

  // Content-Type наоборот: ставить можно, снимать нечем.
  validateDoc({
    groups: [{ name: "g", headers: [{ op: "set", name: "Content-Type", value: "text/html" }] }],
  });
  rejects(
    { groups: [{ name: "g", headers: [{ op: "unset", name: "Content-Type" }] }] },
    /content type/,
  );

  // Механикой длины владеет модуль.
  rejects(
    { groups: [{ name: "g", headers: [{ op: "set", name: "Content-Length", value: "0" }] }] },
    /not ours to change/,
  );

  // Группа без операций ничего не меняет -- это не группа.
  rejects({ groups: [{ name: "g" }] }, /no operations/);

  // replace и text взаимоисключимы, как в Go.
  rejects(
    { groups: [{ name: "g", body: [{ op: "replace", pattern: "x", text: "y" }] }] },
    /text is only for insert/,
  );
});

/*
 * Кадровая группа: on: frame, селекторы -- направление и опкод, заголовков
 * нет. Печать -- ключи только у кадровых групп: старый загрузчик их не знает.
 */
test("кадровая группа: разбор, отбраковка и печать", () => {
  const doc = validateDoc({
    groups: [
      {
        name: "ws_mask",
        default: true,
        on: "frame",
        direction: ["s2c"],
        body: [{ op: "replace", pattern: "secret-[0-9]+", to: "secret-***" }],
      },
      { name: "hdrs", headers: [{ op: "unset", name: "Server" }] },
    ],
  });

  assert.equal(doc.groups[0].on, "frame");
  assert.equal(doc.groups[1].on, "response");

  const yaml = renderProfileYaml("ws", doc);
  assert.ok(yaml.includes("    on: frame\n    direction: [s2c]\n"), yaml);
  assert.ok(!/name: hdrs\n    default: false\n    on:/.test(yaml), yaml);

  rejects(
    { groups: [{ name: "g", on: "frame", headers: [{ op: "unset", name: "Server" }] }] },
    /no headers/,
  );
  rejects(
    { groups: [{ name: "g", on: "frame", status: [200], body: [{ op: "remove", pattern: "x" }] }] },
    /response selectors/,
  );
  rejects(
    { groups: [{ name: "g", direction: ["c2s"], body: [{ op: "remove", pattern: "x" }] }] },
    /frame selectors/,
  );
  rejects(
    { groups: [{ name: "g", on: "frame", opcode: ["ping"], body: [{ op: "remove", pattern: "x" }] }] },
    /opcode/,
  );
});
