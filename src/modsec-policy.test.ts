/*
 * Политика профиля правил: нормализация, проверка и печать policy.yaml.
 *
 * Проверка здесь -- зеркало загрузчика инспектора
 * (inspectors/modsec/internal/prior). Расхождение между ними не стиль, а
 * поколение, которое инспектор отвергнет целиком: файл с опечаткой роняет
 * загрузку набора так же, как опечатка в SecLang, -- и узнать об этом из
 * панели было бы уже негде.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PolicyError,
  normalizePolicy,
  policyIsEmpty,
  renderPolicyYaml,
  validatePolicy,
} from "./modsec-policy-doc.ts";

test("normalizePolicy reads an empty document", () => {
  const policy = normalizePolicy(null);

  assert.deepEqual(policy, { prior: [], outcomes: [] });
  assert.equal(policyIsEmpty(policy), true);
});

test("normalizePolicy drops the dead ceiling keys", () => {
  const policy = normalizePolicy({
    prior: [
      { from: "ip", accept: ["threshold"], max_delta: 50 },
      { from: "action", accept: ["threshold"], maxPercent: 10 },
    ],
  });

  assert.deepEqual(policy.prior, [
    { from: "ip", accept: ["threshold"], codes: [] },
    { from: "action", accept: ["threshold"], codes: [] },
  ]);
});

test("validatePolicy accepts what the loader accepts", () => {
  const docs: unknown[] = [
    { prior: [{ from: "ip", accept: ["threshold"] }] },
    { prior: [{ from: "action", accept: ["skip"], codes: ["IP_ALLOWLIST"] }] },
    { outcomes: [{ on: "score", at: 30, to: "captcha", do: "challenge" }] },
    { outcomes: [{ on: "score", at: 5, below: true, to: "vlai", do: "skip" }] },
    { outcomes: [{ on: "allow", to: "vlai", do: "threshold", delta: -50 }] },
    { outcomes: [{ on: "deny", list: "hot", write: "net", ttl_s: 3600 }] },
    // Хард: все анонсы, накрывающие адрес, -- те же четыре охвата, что у капчи.
    { outcomes: [{ on: "deny", list: "hot", write: "net_all", ttl_s: 3600 }] },
    { outcomes: [{ on: "deny", list: "hot", write: "asn", ttl_s: 900, code: "MODSEC_HOT" }] },
    // Перегрузка: запрос снят на входе, и профиль вправе сбросить клиента в
    // набор либо рассказать соседям.
    { outcomes: [{ on: "overload", list: "hot", write: "addr", ttl_s: 600 }] },
    { outcomes: [{ on: "overload", to: "counter", do: "note", apply: "ip", value: 20 }] },
    /* Переключить группу модификаторов у rewrite: группа и сторона обе. */
    { outcomes: [{ on: "score", at: 40, to: "rewrite", do: "mutate", group: "mask", set: "on" }] },
  ];

  for (const doc of docs) {
    assert.doesNotThrow(() => validatePolicy(doc), JSON.stringify(doc));
  }
});

test("mutate needs a group and a side, and prints both", () => {
  assert.throws(
    () => validatePolicy({ outcomes: [{ on: "allow", to: "rewrite", do: "mutate", set: "on" }] }),
    /mutate needs a group/,
  );
  assert.throws(
    () => validatePolicy({ outcomes: [{ on: "allow", to: "rewrite", do: "mutate", group: "mask" }] }),
    /set: on or off/,
  );
  assert.throws(
    () => validatePolicy({ outcomes: [{ on: "allow", to: "vlai", do: "skip", group: "mask" }] }),
    /group is only for mutate/,
  );

  const yaml = renderPolicyYaml(
    "strict",
    validatePolicy({
      outcomes: [{ on: "allow", to: "rewrite", do: "mutate", group: "mask", set: "off" }],
    }),
  );

  assert.match(yaml, /do: mutate\n {4}group: "mask"\n {4}set: off\n/);
});

test("validatePolicy rejects what the loader rejects", () => {
  const docs: Record<string, unknown> = {
    // Приём: оба глагола ослабляют, поэтому отправитель всегда по имени.
    "broadcast sender": { prior: [{ from: "*", accept: ["skip"] }] },
    "empty sender": { prior: [{ from: "", accept: ["skip"] }] },
    "verb not ours": { prior: [{ from: "ip", accept: ["challenge"] }] },
    "broadcast threshold": { prior: [{ from: "*", accept: ["threshold"] }] },

    // Инициаторы.
    "unknown on": { outcomes: [{ on: "sneeze", list: "x", ttl_s: 60 }] },
    "score without at": { outcomes: [{ on: "score", list: "x", ttl_s: 60 }] },
    "at without score": { outcomes: [{ on: "allow", at: 30, list: "x", ttl_s: 60 }] },
    "at on overload": { outcomes: [{ on: "overload", at: 10, list: "x", ttl_s: 60 }] },
    "neither do nor list": { outcomes: [{ on: "allow" }] },
    "both do and list": {
      outcomes: [{ on: "allow", to: "captcha", do: "challenge", list: "x", ttl_s: 60 }],
    },
    "list without ttl": { outcomes: [{ on: "allow", list: "x" }] },
    "unknown write": { outcomes: [{ on: "allow", list: "x", ttl_s: 60, write: "soul" }] },
    "unknown verb": { outcomes: [{ on: "allow", to: "captcha", do: "nuke" }] },
    "note without axis": { outcomes: [{ on: "allow", to: "captcha", do: "note", value: 10 }] },
    "threshold without delta": { outcomes: [{ on: "allow", to: "vlai", do: "threshold" }] },
    "threshold zero delta": {
      outcomes: [{ on: "allow", to: "vlai", do: "threshold", delta: 0 }],
    },
    // Отказ обрывает фазу: просьбе с него уехать некуда.
    "ask on deny": { outcomes: [{ on: "deny", to: "captcha", do: "challenge" }] },
  };

  for (const [name, doc] of Object.entries(docs)) {
    assert.throws(() => validatePolicy(doc), PolicyError, name);
  }
});

test("renderPolicyYaml prints what the loader reads back", () => {
  const policy = validatePolicy({
    prior: [{ from: "ip", accept: ["threshold"], codes: ["IP_GREYLIST"] }],
    outcomes: [
      { on: "score", at: 30, to: "captcha", do: "challenge", code: "MODSEC_SUSPECT" },
      { on: "score", at: 5, below: true, to: "vlai", do: "threshold", delta: -50 },
      { on: "deny", list: "hot", write: "net", ttl_s: 3600 },
      { on: "deny", list: "wide", write: "net_all", ttl_s: 600 },
    ],
  });

  const yaml = renderPolicyYaml("strict", policy);

  assert.match(yaml, / {2}- on: deny\n {4}list: "wide"\n {4}write: net_all\n {4}ttl: "10m"\n/);

  assert.match(yaml, /\nprior:\n {2}- from: "ip"\n {4}accept: \["threshold"\]\n/);
  assert.match(yaml, / {4}codes: \["IP_GREYLIST"\]\n\n/);
  assert.ok(!yaml.includes("max_percent"), yaml);

  assert.match(yaml, /\noutcomes:\n {2}- on: score\n {4}at: 30\n {4}to: "captcha"\n {4}do: challenge\n/);
  assert.match(yaml, / {4}below: true\n/);
  assert.match(yaml, / {4}delta: -50\n/);
  assert.match(yaml, / {2}- on: deny\n {4}list: "hot"\n {4}write: net\n {4}ttl: "1h"\n/);

  // Пустые поля не печатаются: файл читают глазами.
  assert.equal(yaml.includes("value:"), false);
  assert.equal(yaml.includes("apply:"), false);
});

test("renderPolicyYaml of an empty policy carries only the header", () => {
  const yaml = renderPolicyYaml("default", normalizePolicy(null));

  assert.equal(yaml.includes("prior:"), false);
  assert.equal(yaml.includes("outcomes:"), false);
});

test("on: rule narrows by numbers and tags, and prints both", () => {
  const policy = validatePolicy({
    outcomes: [
      {
        on: "rule",
        rules: ["942100", "942000-942999"],
        tags: ["paranoia-level/1"],
        to: "captcha",
        do: "challenge",
      },
      { on: "rule", tags: ["attack-sqli"], list: "hot", write: "addr", ttl_s: 3600 },
    ],
  });

  const yaml = renderPolicyYaml("strict", policy);

  assert.match(
    yaml,
    / {2}- on: rule\n {4}rules: \["942100", "942000-942999"\]\n {4}tags: \["paranoia-level\/1"\]\n {4}to: "captcha"\n/,
  );
  assert.match(yaml, / {2}- on: rule\n {4}tags: \["attack-sqli"\]\n {4}list: "hot"\n/);

  // Фильтры пишутся только у своего повода: у прочих строк их нет вовсе.
  const plain = renderPolicyYaml(
    "strict",
    validatePolicy({ outcomes: [{ on: "score", at: 30, to: "captcha", do: "challenge" }] }),
  );

  assert.equal(plain.includes("rules:") || plain.includes("tags:"), false);
});

test("on: rule rejects what the loader rejects", () => {
  const docs: Record<string, unknown> = {
    // Строка без фильтра дёргалась бы любой находкой.
    "no filter": { outcomes: [{ on: "rule", list: "x", ttl_s: 60 }] },
    "reversed range": {
      outcomes: [{ on: "rule", rules: ["942999-942000"], list: "x", ttl_s: 60 }],
    },
    "not a number": { outcomes: [{ on: "rule", rules: ["sqli"], list: "x", ttl_s: 60 }] },
    "empty tag": { outcomes: [{ on: "rule", tags: [""], list: "x", ttl_s: 60 }] },
    "at on rule": {
      outcomes: [{ on: "rule", at: 30, tags: ["attack-sqli"], list: "x", ttl_s: 60 }],
    },
    "rules on score": {
      outcomes: [{ on: "score", at: 30, rules: ["942100"], list: "x", ttl_s: 60 }],
    },
    "tags on allow": { outcomes: [{ on: "allow", tags: ["attack-sqli"], list: "x", ttl_s: 60 }] },
  };

  for (const [name, doc] of Object.entries(docs)) {
    assert.throws(() => validatePolicy(doc), PolicyError, name);
  }
});
