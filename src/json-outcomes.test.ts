/*
 * Инициаторы по исходу у профиля контракта: нормализация, проверка и печать.
 *
 * Проверка здесь -- зеркало validateOutcome загрузчика инспектора
 * (inspectors/json/internal/config/profile.go). Расхождение между ними не
 * стиль, а поколение, которое инспектор отвергнет как apply_failed, поэтому
 * набор случаев тот же, что в его таблицах.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { DocError, normalizeDoc, renderProfileYaml, validateDoc } from "./json-profile-doc.ts";

const SOURCE = "11111111-1111-4111-8111-111111111111";

const base = {
  mode: "enforce",
  schema: { kind: "openapi", source: SOURCE },
};

function withOutcomes(outcomes: unknown[], phase = "request"): unknown {
  return { ...base, [phase]: { enabled: true, outcomes } };
}

test("normalizeDoc keeps outcomes of both phases apart", () => {
  const doc = normalizeDoc({
    ...base,
    request: { outcomes: [{ on: "deny", list: "req", ttl_s: 3600 }] },
    response: { outcomes: [{ on: "allow", to: "vlai", do: "threshold", delta: 50 }] },
  });

  assert.equal(doc.request.outcomes.length, 1);
  assert.equal(doc.request.outcomes[0]?.list, "req");
  assert.equal(doc.request.outcomes[0]?.ttlS, 3600);

  assert.equal(doc.response.outcomes.length, 1);
  assert.equal(doc.response.outcomes[0]?.do, "threshold");
  assert.equal(doc.response.outcomes[0]?.delta, 50);
});

test("normalizeDoc leaves a profile without outcomes empty", () => {
  const doc = normalizeDoc(base);

  assert.deepEqual(doc.request.outcomes, []);
  assert.deepEqual(doc.response.outcomes, []);
});

test("validateDoc accepts the shapes the loader accepts", () => {
  const rows: unknown[][] = [
    [{ on: "score", at: 40, to: "captcha", do: "challenge" }],
    [{ on: "score", at: 10, below: true, to: "modsec", do: "skip" }],
    [{ on: "allow", to: "vlai", do: "threshold", delta: -50 }],
    [{ on: "score", at: 60, to: "captcha", do: "note", apply: "ip", value: 25 }],
    [{ on: "deny", list: "api_abusers", ttl_s: 3600 }],
    [{ on: "score", at: 80, list: "api_abusers", ttl_s: 900, code: "JSON_HOT" }],
    /* Подсеть и система -- те же охваты, что у капчи: разворачивает инспектор. */
    [{ on: "deny", list: "api_nets", write: "net", ttl_s: 3600 }],
    [{ on: "deny", list: "api_nets", write: "net_all", ttl_s: 3600 }],
    [{ on: "deny", list: "api_nets", write: "asn", ttl_s: 3600 }],
    /* Переключить группу модификаторов у rewrite: группа и сторона обе. */
    [{ on: "score", at: 40, to: "rewrite", do: "mutate", group: "mask", set: "on" }],
  ];

  for (const outcomes of rows) {
    assert.doesNotThrow(() => validateDoc(withOutcomes(outcomes)), JSON.stringify(outcomes));
  }
});

test("mutate needs a group and a side, and prints both", () => {
  assert.throws(
    () => validateDoc(withOutcomes([{ on: "allow", to: "rewrite", do: "mutate", set: "on" }])),
    /mutate needs a group/,
  );
  assert.throws(
    () => validateDoc(withOutcomes([{ on: "allow", to: "rewrite", do: "mutate", group: "mask" }])),
    /set: on or off/,
  );
  assert.throws(
    () => validateDoc(withOutcomes([{ on: "allow", to: "vlai", do: "skip", group: "mask" }])),
    /group is only for mutate/,
  );

  const yaml = renderProfileYaml(
    "api",
    validateDoc(
      withOutcomes([{ on: "allow", to: "rewrite", do: "mutate", group: "mask", set: "off" }]),
    ),
    new Map([[SOURCE, "api"]]),
  );

  assert.match(yaml, /do: mutate\n {6}group: "mask"\n {6}set: off\n/);
});

test("validateDoc rejects what the loader rejects", () => {
  const rows: Record<string, unknown[]> = {
    "unknown on": [{ on: "sneeze", list: "x", ttl_s: 60 }],
    "score without at": [{ on: "score", list: "x", ttl_s: 60 }],
    "at without score": [{ on: "allow", at: 40, list: "x", ttl_s: 60 }],
    "at out of range": [{ on: "score", at: 900, list: "x", ttl_s: 60 }],
    "below on allow": [{ on: "allow", below: true, list: "x", ttl_s: 60 }],
    "neither do nor list": [{ on: "allow" }],
    "both do and list": [
      { on: "allow", to: "captcha", do: "challenge", list: "x", ttl_s: 60 },
    ],
    "list without ttl": [{ on: "allow", list: "x" }],
    "unknown write": [{ on: "allow", list: "x", ttl_s: 60, write: "country" }],
    "unknown verb": [{ on: "allow", to: "captcha", do: "nuke" }],
    "bad axis": [{ on: "allow", to: "captcha", do: "challenge", apply: "asn" }],
    "note without axis": [{ on: "allow", to: "captcha", do: "note", value: 10 }],
    "threshold without delta": [{ on: "allow", to: "modsec", do: "threshold" }],
    "threshold zero delta": [{ on: "allow", to: "modsec", do: "threshold", delta: 0 }],
    "delta out of range": [{ on: "allow", to: "modsec", do: "threshold", delta: 1000 }],
    "note zero value": [{ on: "allow", to: "captcha", do: "note", apply: "ip", value: 0 }],
    "bad code": [{ on: "allow", list: "x", ttl_s: 60, code: "плохой повод" }],
    // Отказ обрывает фазу: просьбе с него уехать некуда.
    "ask on deny": [{ on: "deny", to: "captcha", do: "challenge" }],
  };

  for (const [name, outcomes] of Object.entries(rows)) {
    assert.throws(() => validateDoc(withOutcomes(outcomes)), DocError, name);
  }
});

test("validateDoc checks the response phase too", () => {
  assert.throws(
    () => validateDoc(withOutcomes([{ on: "deny", to: "captcha", do: "challenge" }], "response")),
    DocError,
  );
});

test("renderProfileYaml prints outcomes the loader can read back", () => {
  const doc = validateDoc({
    ...base,
    request: {
      enabled: true,
      outcomes: [
        { on: "score", at: 40, to: "captcha", do: "challenge" },
        { on: "deny", list: "api_abusers", ttl_s: 3600, code: "JSON_CONTRACT_BAN" },
      ],
    },
    response: {
      enabled: true,
      outcomes: [{ on: "score", at: 10, below: true, to: "modsec", do: "threshold", delta: -50 }],
    },
  });

  const yaml = renderProfileYaml("api", doc, new Map([[SOURCE, "api"]]));

  assert.match(yaml, /\n {2}outcomes:\n {4}- on: score\n {6}at: 40\n/);
  assert.match(yaml, / {6}to: "captcha"\n {6}do: challenge\n/);
  assert.match(yaml, / {4}- on: deny\n {6}list: "api_abusers"\n {6}ttl: "1h"\n/);
  assert.match(yaml, / {6}code: "JSON_CONTRACT_BAN"\n/);

  // Сравнение вниз и минусовой процент -- в той же записи, что читает Go.
  assert.match(yaml, / {6}below: true\n/);
  assert.match(yaml, / {6}delta: -50\n/);

  // Пустые поля не печатаются: строку профиля читают глазами.
  assert.equal(yaml.includes("value:"), false);
});

/*
 * Охват записи доезжает до загрузчика: прежде поле терялось в нормализации, и
 * строка «подсеть» из панели уезжала на ноду адресом. Адрес -- умолчание, его
 * ключ не печатается.
 */
test("renderProfileYaml carries the write scope", () => {
  const doc = validateDoc(
    withOutcomes([
      { on: "deny", list: "api_nets", write: "net_all", ttl_s: 3600 },
      { on: "deny", list: "api_abusers", ttl_s: 60 },
    ]),
  );

  assert.equal(doc.request.outcomes[0]?.write, "net_all");
  assert.equal(doc.request.outcomes[1]?.write, "addr");

  const yaml = renderProfileYaml("api", doc, new Map([[SOURCE, "api"]]));

  assert.match(yaml, / {4}- on: deny\n {6}list: "api_nets"\n {6}write: net_all\n {6}ttl: "1h"\n/);
  assert.match(yaml, / {4}- on: deny\n {6}list: "api_abusers"\n {6}ttl: "1m"\n/);
});

test("renderProfileYaml stays quiet without outcomes", () => {
  const yaml = renderProfileYaml("api", validateDoc(base), new Map([[SOURCE, "api"]]));

  assert.equal(yaml.includes("outcomes:"), false);
});
