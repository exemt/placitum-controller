/*
 * Документ профиля действий: условия. Проверка повторяет загрузчик инспектора
 * (inspectors/action/internal/policy/cond.go), печать читается его же разбором.
 * Ловится здесь то, что иначе всплыло бы как apply_failed в пульсе через
 * минуту после send.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DocError,
  docDatasets,
  normalizeDoc,
  renderProfileYaml,
  validateDoc,
} from "./action-profile-doc.ts";
import { parseActionValue } from "./model/action-cond.ts";

const datasets = [
  { name: "api_keys", type: "string", kind: "list", active: true, hash: false },
  { name: "hashed", type: "string", kind: "list", active: true, hash: true },
  { name: "office", type: "ipv4", kind: "list", active: true, hash: false },
  { name: "static", type: "string", kind: "list", active: false, hash: false },
  { name: "page", type: "string", kind: "content", active: false, hash: false },
];

const ask = { to: "modsec", do: "skip", apply: "request", code: "TRUSTED" };

function doc(conditions: unknown[], rules: unknown[]) {
  return { description: "", conditions, rules };
}

test("parseActionValue: the loader's grammar", () => {
  assert.deepEqual(parseActionValue("$uri"), { kind: "field", name: "uri", all: false });
  assert.deepEqual(parseActionValue("$http_X_Api_Key"), { kind: "header", name: "x_api_key", all: false });
  assert.deepEqual(parseActionValue("$cookie_sid"), { kind: "cookie", name: "sid", all: false });
  assert.deepEqual(parseActionValue("$arg_token"), { kind: "arg", name: "token", all: false });
  assert.deepEqual(parseActionValue("$waf_request_headers.X-Ja3"), { kind: "headers", name: "x-ja3", all: false });
  assert.deepEqual(parseActionValue("$waf_request_args.*"), { kind: "args", name: "", all: true });
  assert.deepEqual(parseActionValue("$waf_var.ja3"), { kind: "var", name: "ja3", all: false });

  for (const bad of ["", "uri", "$nope", "$http_", "$http_x-api-key", "$waf_request_args.", "$waf_var.*", "$binary_remote_addr"]) {
    assert.ok("error" in parseActionValue(bad), bad);
  }
});

test("normalizeDoc: conditions and if/unless of a hand-written document", () => {
  const out = normalizeDoc({
    conditions: [{ name: "a", all: [{ value: "$uri", op: "not in", dataset: "d" }] }],
    rules: [
      { actions: [ask] },
      { if: "a", actions: [ask] },
      { unless: "a", actions: [ask] },
      { cond: "a", negate: true, actions: [ask] },
    ],
  });

  assert.equal(out.conditions[0].rows[0].op, "not_in");
  assert.equal(out.conditions[0].any, false);
  assert.deepEqual(
    out.rules.map((rule) => [rule.cond, rule.negate]),
    [["", false], ["a", false], ["a", true], ["a", true]],
  );
});

/*
 * Запись в набор -- строка правила без адресата и глагола: те же четыре
 * охвата, что у остальных отправителей, срок обязателен, набор -- активный
 * список, а подсеть и систему -- только в набор адресов. Печатается словами
 * загрузчика (list / write / ttl), адрес -- умолчание без ключа.
 */
test("list writes: validation and print", () => {
  const writes = doc(
    [{ name: "bot", all: [{ value: "$arg_bot", op: "eq", text: "1" }] }],
    [
      { cond: "bot", actions: [{ list: "office", ttl_s: 600 }] },
      { cond: "bot", actions: [{ list: "office", write: "net_all", ttl_s: 3600, code: "E2E_BAN" }] },
      { cond: "bot", actions: [ask] },
    ],
  );

  const good = validateDoc(writes, datasets);

  assert.equal(good.rules[0].actions[0].write, "addr");
  assert.equal(good.rules[1].actions[0].write, "net_all");

  const yaml = renderProfileYaml("bans", good, datasets);

  assert.match(yaml, /actions:\n {6}- list: "office"\n {8}ttl: "10m"\n/);
  assert.match(yaml, /- list: "office"\n {8}write: net_all\n {8}ttl: "1h"\n {8}code: "E2E_BAN"\n/);
  assert.match(yaml, /- to: "modsec"\n {8}do: skip\n/);

  const rejects: [string, unknown][] = [
    ["no ttl", doc([], [{ actions: [{ list: "office" }] }])],
    ["unknown scope", doc([], [{ actions: [{ list: "office", write: "country", ttl_s: 60 }] }])],
    ["with a verb", doc([], [{ actions: [{ list: "office", do: "skip", to: "modsec", ttl_s: 60 }] }])],
    ["not a list", doc([], [{ actions: [{ list: "page", ttl_s: 60 }] }])],
    ["static list", doc([], [{ actions: [{ list: "static", ttl_s: 60 }] }])],
    ["prefix into strings", doc([], [{ actions: [{ list: "api_keys", write: "asn", ttl_s: 60 }] }])],
    ["bad code", doc([], [{ actions: [{ list: "office", ttl_s: 60, code: "ban" }] }])],
  ];

  for (const [name, bad] of rejects) {
    assert.throws(() => validateDoc(bad, datasets), DocError, name);
  }

  // Адрес пишется и в набор строк: точное совпадение ему не мешает.
  assert.doesNotThrow(() =>
    validateDoc(doc([], [{ actions: [{ list: "api_keys", ttl_s: 60 }] }]), datasets),
  );
});

test("validateDoc: the clause form", () => {
  const good = validateDoc(
    doc(
      [
        {
          name: "trusted_key",
          all: [
            { value: "$http_x_api_key", op: "in", dataset: "api_keys" },
            { value: "$request_method", op: "eq", text: "POST" },
          ],
        },
        { name: "from_office", all: [{ value: "$remote_addr", op: "in", dataset: "office" }] },
      ],
      [{ cond: "trusted_key", negate: false, actions: [ask] }],
    ),
    datasets,
  );

  assert.equal(good.conditions.length, 2);
  assert.deepEqual(docDatasets(good), ["api_keys", "office"]);

  const rejects: [string, unknown][] = [
    ["undeclared", doc([], [{ cond: "nope", actions: [ask] }])],
    ["duplicate", doc([
      { name: "a", all: [{ value: "$uri", op: "eq", text: "/x" }] },
      { name: "a", all: [{ value: "$uri", op: "eq", text: "/y" }] },
    ], [])],
    ["empty clauses", doc([{ name: "a", all: [] }], [])],
    ["bad name", doc([{ name: "a b", all: [{ value: "$uri", op: "eq", text: "/x" }] }], [])],
    ["in without dataset", doc([{ name: "a", all: [{ value: "$uri", op: "in" }] }], [])],
    ["eq without text", doc([{ name: "a", all: [{ value: "$uri", op: "eq" }] }], [])],
    ["eq with dataset", doc([{ name: "a", all: [{ value: "$uri", op: "eq", text: "x", dataset: "api_keys" }] }], [])],
    ["bad op", doc([{ name: "a", all: [{ value: "$uri", op: "like", text: "x" }] }], [])],
    ["bad value", doc([{ name: "a", all: [{ value: "$nope", op: "eq", text: "x" }] }], [])],
    ["both if and unless", doc([{ name: "a", all: [{ value: "$uri", op: "eq", text: "x" }] }], [{ if: "a", unless: "a", actions: [ask] }])],
    ["unknown dataset", doc([{ name: "a", all: [{ value: "$uri", op: "in", dataset: "nope" }] }], [])],
    ["static dataset", doc([{ name: "a", all: [{ value: "$uri", op: "in", dataset: "static" }] }], [])],
    ["content dataset", doc([{ name: "a", all: [{ value: "$uri", op: "in", dataset: "page" }] }], [])],
    ["address set with a path", doc([{ name: "a", all: [{ value: "$uri", op: "in", dataset: "office" }] }], [])],
  ];

  for (const [name, input] of rejects) {
    assert.throws(() => validateDoc(input, datasets), DocError, name);
  }

  /* Без каталога ссылки не проверяются: документ из базы читается всегда. */
  assert.doesNotThrow(() =>
    validateDoc(doc([{ name: "a", all: [{ value: "$uri", op: "in", dataset: "nope" }] }], [])),
  );
});

test("renderProfileYaml: conditions with the dataset's type and hash, if/unless on rules", () => {
  const yaml = renderProfileYaml(
    "p",
    validateDoc(
      doc(
        [
          {
            name: "trusted_key",
            all: [
              { value: "$http_x_api_key", op: "in", dataset: "hashed" },
              { value: "$request_method", op: "eq", text: "POST" },
            ],
          },
          { name: "from_office", all: [{ value: "$remote_addr", op: "not_in", dataset: "office" }] },
        ],
        [
          { actions: [ask] },
          { cond: "trusted_key", negate: false, actions: [ask] },
          { cond: "from_office", negate: true, actions: [ask] },
        ],
      ),
      datasets,
    ),
    datasets,
  );

  assert.equal(
    yaml,
    [
      "# Профиль действий p. Собран контроллером, править здесь нечего:",
      "# источник -- таблица action_profiles, раздел /actions в UX.",
      "",
      "mode: enforce",
      "",
      "conditions:",
      '  - name: "trusted_key"',
      "    all:",
      '      - value: "$http_x_api_key"',
      "        op: in",
      '        dataset: "hashed"',
      "        hash: md5",
      '      - value: "$request_method"',
      "        op: eq",
      '        text: "POST"',
      '  - name: "from_office"',
      "    all:",
      '      - value: "$remote_addr"',
      "        op: not_in",
      '        dataset: "office"',
      "        type: cidr",
      "",
      "rules:",
      "  - actions:",
      '      - to: "modsec"',
      "        do: skip",
      "        apply: request",
      '        code: "TRUSTED"',
      '  - if: "trusted_key"',
      "    actions:",
      '      - to: "modsec"',
      "        do: skip",
      "        apply: request",
      '        code: "TRUSTED"',
      '  - unless: "from_office"',
      "    actions:",
      '      - to: "modsec"',
      "        do: skip",
      "        apply: request",
      '        code: "TRUSTED"',
      "",
    ].join("\n"),
  );
});

test("normalizeDoc: any of the loader and the panel's pair", () => {
  const out = normalizeDoc({
    conditions: [
      { name: "a", any: [{ cond: "b", op: "is not" }] },
      { name: "b", any: true, rows: [{ value: "$uri", op: "eq", text: "/x" }] },
      { name: "c", all: [{ value: "$uri", op: "eq", text: "/x" }] },
    ],
  });

  assert.deepEqual(
    out.conditions.map((cond) => [cond.name, cond.any, cond.rows[0].op, cond.rows[0].cond]),
    [["a", true, "is_not", "b"], ["b", true, "eq", ""], ["c", false, "eq", ""]],
  );
});

test("validateDoc: references between conditions", () => {
  const good = validateDoc(
    doc(
      [
        { name: "risky", any: true, rows: [{ cond: "trusted", op: "is_not" }, { cond: "debug", op: "is" }] },
        {
          name: "trusted",
          any: true,
          rows: [
            { value: "$http_x_api_key", op: "in", dataset: "api_keys" },
            { value: "$arg_key", op: "eq", text: "k1" },
          ],
        },
        { name: "debug", rows: [{ value: "$arg_debug", op: "eq", text: "1" }] },
      ],
      [{ cond: "risky", actions: [ask] }],
    ),
    datasets,
  );

  assert.equal(good.conditions[0].rows[0].cond, "trusted");

  const rejects: [string, unknown][] = [
    ["undeclared ref", doc([{ name: "a", rows: [{ cond: "nope", op: "is" }] }], [])],
    ["self ref", doc([{ name: "a", rows: [{ cond: "a", op: "is" }] }], [])],
    ["cycle", doc([
      { name: "a", rows: [{ cond: "b", op: "is" }] },
      { name: "b", rows: [{ cond: "c", op: "is_not" }] },
      { name: "c", any: true, rows: [{ cond: "a", op: "is" }] },
    ], [])],
    ["ref with value", doc([
      { name: "a", rows: [{ value: "$uri", op: "eq", text: "x" }] },
      { name: "b", rows: [{ cond: "a", op: "is", value: "$uri" }] },
    ], [])],
    ["ref with wrong op", doc([
      { name: "a", rows: [{ value: "$uri", op: "eq", text: "x" }] },
      { name: "b", rows: [{ cond: "a", op: "eq" }] },
    ], [])],
    ["is without cond", doc([{ name: "a", rows: [{ value: "$uri", op: "is" }] }], [])],
    ["all and any", doc([{ name: "a", all: [{ value: "$uri", op: "eq", text: "x" }], any: [{ value: "$uri", op: "eq", text: "y" }] }], [])],
  ];

  for (const [name, input] of rejects) {
    assert.throws(() => validateDoc(input, datasets), DocError, name);
  }
});

test("renderProfileYaml: any and cond rows", () => {
  const yaml = renderProfileYaml(
    "p",
    validateDoc(
      doc(
        [
          { name: "risky", any: true, rows: [{ cond: "trusted", op: "is_not" }, { value: "$arg_debug", op: "eq", text: "1" }] },
          { name: "trusted", rows: [{ value: "$arg_key", op: "eq", text: "k1" }] },
        ],
        [{ cond: "risky", actions: [ask] }],
      ),
      datasets,
    ),
    datasets,
  );

  assert.ok(
    yaml.includes(
      [
        "conditions:",
        '  - name: "risky"',
        "    any:",
        '      - cond: "trusted"',
        "        op: is_not",
        '      - value: "$arg_debug"',
        "        op: eq",
        '        text: "1"',
        '  - name: "trusted"',
        "    all:",
      ].join("\n"),
    ),
    yaml,
  );
});

test("renderProfileYaml: a document without conditions prints as before", () => {
  const yaml = renderProfileYaml("p", validateDoc(doc([], [{ actions: [ask] }])));

  assert.ok(!yaml.includes("conditions"));
  assert.ok(!yaml.includes("if:"));
});
