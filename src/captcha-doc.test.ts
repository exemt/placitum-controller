/*
 * Правила капчи по событиям: полная форма просьбы канала и событие cleared.
 *
 * Проверяется то же, чем отвергает загрузчик инспектора: просьба только на
 * событиях волны, селектор корзины только у порогов, cid -- где куку выдали
 * или предъявили, а сама просьба -- общий валидатор канала (mutate с группой
 * и стороной, глаголы записи со стороной, маркер, очки). И печать: то, что
 * уедет инспектору, обязано читаться его загрузчиком.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeDoc, renderProfileYaml, validateDoc } from "./captcha-profile-doc.ts";

function docWith(rules: Record<string, unknown>[]) {
  return normalizeDoc({ path: "/captcha", rules });
}

test("asks live on the wave: bucket thresholds and clearance, present or not", () => {
  for (const on of ["bucket_captcha", "bucket_ban", "cleared", "uncleared"]) {
    validateDoc(docWith([{ on, to: "vlai", do: "skip" }]));
  }

  for (const on of ["fail", "pass"]) {
    assert.throws(
      () => validateDoc(docWith([{ on, to: "vlai", do: "skip" }])),
      /needs the wave/,
    );
  }
});

test("bucket selector belongs to threshold events only", () => {
  for (const on of ["cleared", "uncleared"]) {
    assert.throws(
      () => validateDoc(docWith([{ on, bucket: "ip", charge: "ip", percent: -10 }])),
      /threshold events only/,
    );
  }
});

test("write cid lives where the cookie is known", () => {
  validateDoc(docWith([{ on: "pass", list: "seen", write: "cid", ttlS: 60 }]));
  validateDoc(docWith([{ on: "cleared", list: "seen", write: "cid", ttlS: 60 }]));

  /* У клиента без клиренса куки нет: писать нечего. */
  for (const on of ["bucket_ban", "uncleared"]) {
    assert.throws(
      () => validateDoc(docWith([{ on, list: "seen", write: "cid", ttlS: 60 }])),
      /cid lives on pass and cleared/,
    );
  }
});

test("a client without a clearance steers the neighbours down the chain", () => {
  const doc = docWith([
    { on: "uncleared", to: "vlai", do: "active" },
    { on: "uncleared", to: "rewrite", do: "mutate", group: "prices", set: "on", code: "NO_CLEARANCE" },
    { on: "uncleared", do: "score", value: 20 },
    { on: "uncleared", do: "mark", marker: "no clearance" },
    { on: "uncleared", list: "seen", write: "addr", ttlS: 60 },
    { on: "uncleared", charge: "ip", percent: 5 },
  ]);

  validateDoc(doc);

  const yaml = renderProfileYaml("test", doc);

  assert.match(yaml, /- on: uncleared\n {4}to: "vlai"\n {4}do: active\n {4}apply: request/);
  assert.match(
    yaml,
    /- on: uncleared\n {4}to: "rewrite"\n {4}do: mutate\n {4}apply: request\n {4}group: "prices"\n {4}set: on/,
  );
});

test("the full ask form is accepted and printed", () => {
  const doc = docWith([
    { on: "cleared", to: "counter", do: "note", apply: "ip", value: -100, counter: "scraper" },
    { on: "cleared", to: "rewrite", do: "mutate", group: "mask", set: "off" },
    { on: "cleared", to: "vlai", do: "off" },
    { on: "cleared", do: "audit", set: "off" },
    {
      on: "cleared",
      do: "archive",
      set: "on",
      ttlS: 3600,
      when: ["deny", "allow"],
      body: { set: "on", limit: 4096 },
    },
    { on: "cleared", do: "mark", marker: "human verified" },
    { on: "cleared", do: "score", value: -30, code: "HUMAN" },
  ]);

  validateDoc(doc);

  const yaml = renderProfileYaml("test", doc);

  assert.match(yaml, /- on: cleared\n {4}to: "counter"\n {4}do: note\n {4}apply: ip\n {4}value: -100\n {4}counter: "scraper"/);
  assert.match(yaml, /do: mutate\n {4}apply: request\n {4}group: "mask"\n {4}set: off/);
  assert.match(yaml, /do: off\n {4}apply: request/);
  assert.match(yaml, /do: audit\n {4}apply: request\n {4}set: off/);
  assert.match(yaml, /do: archive\n {4}apply: request\n {4}set: on\n {4}ttl: "1h"\n {4}when: \["allow", "deny"\]\n {4}body: \{ set: on, limit: 4096 \}/);
  assert.match(yaml, /do: mark\n {4}apply: request\n {4}marker: "human verified"/);
  assert.match(yaml, /do: score\n {4}apply: request\n {4}value: -30\n {4}code: "HUMAN"/);
});

test("the ask form is rejected the way the module would reject it", () => {
  const bad: [Record<string, unknown>, RegExp][] = [
    [{ on: "cleared", to: "rewrite", do: "mutate", set: "on" }, /mutate needs a group/],
    [{ on: "cleared", to: "rewrite", do: "mutate", group: "mask" }, /set: on or off/],
    [{ on: "cleared", do: "off" }, /off needs to/],
    [{ on: "cleared", to: "vlai", do: "off", apply: "conn" }, /conn is only for the frame/],
    [{ on: "cleared", do: "audit" }, /audit needs set/],
    [{ on: "cleared", to: "vlai", do: "audit", set: "on" }, /takes no to/],
    [{ on: "cleared", do: "audit", set: "on", apply: "response" }, /request phase only/],
    [{ on: "cleared", do: "mark" }, /mark needs a marker/],
    [{ on: "cleared", to: "vlai", do: "score", value: -10 }, /takes no to/],
    [{ on: "cleared", to: "vlai", do: "skip", ttlS: 60 }, /ttl is only for/],
  ];

  for (const [rule, why] of bad) {
    assert.throws(() => validateDoc(docWith([rule])), why, JSON.stringify(rule));
  }
});

test("next narrows by the ladder decision where it can go either way", () => {
  const doc = docWith([
    { on: "uncleared", next: "challenge", charge: "ip", percent: 30 },
    { on: "uncleared", next: "allow", to: "rewrite", do: "mutate", group: "prices", set: "on" },
    { on: "bucket_captcha", bucket: "ip", next: "allow", to: "rewrite", do: "mutate", group: "prices", set: "on" },
    { on: "bucket_ban", next: "challenge", list: "ban", write: "addr", ttlS: 60 },
  ]);

  validateDoc(doc);

  const yaml = renderProfileYaml("test", doc);

  assert.match(yaml, /- on: uncleared\n {4}next: challenge\n/);
  assert.match(yaml, /- on: bucket_captcha\n {4}bucket: ip\n {4}next: allow\n {4}to: "rewrite"/);

  const bad: [Record<string, unknown>, RegExp][] = [
    [{ on: "cleared", next: "allow", charge: "ip", percent: -10 }, /next is for uncleared and bucket thresholds/],
    [{ on: "fail", next: "challenge", charge: "ip", percent: 10 }, /next is for uncleared and bucket thresholds/],
    [{ on: "uncleared", next: "maybe", charge: "ip", percent: 10 }, /next must be allow or challenge/],
  ];

  for (const [rule, why] of bad) {
    assert.throws(() => validateDoc(docWith([rule])), why, JSON.stringify(rule));
  }
});
