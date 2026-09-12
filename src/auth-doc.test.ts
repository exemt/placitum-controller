/*
 * Правила калитки по событиям: то же, чем отвергает загрузчик инспектора.
 *
 * Просьба соседу доедет только с allow, поэтому вне authenticated пускаются
 * лишь глаголы записи маршрута; сама просьба -- общий валидатор канала; запись
 * в набор требует срока. И печать: то, что уедет инспектору, обязано читаться
 * его загрузчиком.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeDoc, renderProfileYaml, validateDoc } from "./auth-profile-doc.ts";

function docWith(rules: Record<string, unknown>[]) {
  return normalizeDoc({ source: "default", rules });
}

test("asks travel only with a signed-in client", () => {
  validateDoc(docWith([{ on: "authenticated", to: "captcha", do: "skip" }]));

  for (const on of ["anonymous", "invalid", "forbidden"]) {
    assert.throws(
      () => validateDoc(docWith([{ on, to: "captcha", do: "skip" }])),
      /nowhere to go/,
      on,
    );

    /* Глаголы записи исполняет модуль: отказ для них главный случай. */
    validateDoc(docWith([{ on, do: "mark", marker: `gate ${on}` }]));
    validateDoc(docWith([{ on, do: "score", value: 30 }]));
    validateDoc(docWith([{ on, do: "archive", set: "on", ttlS: 600, when: ["deny"] }]));
  }
});

test("a set write needs a name and a ttl", () => {
  validateDoc(docWith([{ on: "anonymous", list: "gate_anon", ttlS: 600 }]));
  assert.throws(
    () => validateDoc(docWith([{ on: "anonymous", list: "gate_anon" }])),
    /ttl is required/,
  );
  assert.throws(
    () => validateDoc(docWith([{ on: "anonymous" }])),
    /exactly one of do or list/,
  );
});

/*
 * Кого писать -- те же четыре охвата, что у остальных отправителей: подсеть и
 * систему инспектор берёт у кодера гео. Адрес -- умолчание, его ключ не
 * печатается; у просьбы слово записи -- битая форма.
 */
test("a set write names its scope", () => {
  const doc = docWith([
    { on: "invalid", list: "gate_nets", write: "net_all", ttlS: 3600 },
    { on: "anonymous", list: "gate_anon", ttlS: 600 },
  ]);

  validateDoc(doc);

  const yaml = renderProfileYaml("default", doc);

  assert.match(yaml, /- on: invalid\n {4}list: "gate_nets"\n {4}write: net_all\n {4}ttl: "1h"/);
  assert.match(yaml, /- on: anonymous\n {4}list: "gate_anon"\n {4}ttl: "10m"/);

  assert.throws(
    () => validateDoc(docWith([{ on: "invalid", list: "x", write: "country", ttlS: 60 }])),
    /write must be addr, net, net_all or asn/,
  );
  assert.throws(
    () => validateDoc(docWith([{ on: "authenticated", to: "captcha", do: "skip", write: "asn" }])),
    /write is only for a list write/,
  );
});

test("the full ask form is accepted and printed", () => {
  const doc = docWith([
    { on: "authenticated", to: "captcha", do: "skip", code: "SIGNED_IN" },
    { on: "authenticated", to: "counter", do: "note", apply: "session", value: -100, counter: "abuse" },
    { on: "authenticated", to: "rewrite", do: "mutate", group: "mask", set: "off" },
    { on: "authenticated", to: "vlai", do: "off" },
    { on: "forbidden", do: "mark", marker: "wrong door" },
    { on: "anonymous", list: "gate_anon", ttlS: 600, code: "GATE_ANON" },
  ]);

  validateDoc(doc);

  const yaml = renderProfileYaml("default", doc);

  assert.match(yaml, /rules:\n {2}- on: authenticated\n {4}to: "captcha"\n {4}do: skip\n {4}apply: request\n {4}code: "SIGNED_IN"/);
  assert.match(yaml, /do: note\n {4}apply: session\n {4}value: -100\n {4}counter: "abuse"/);
  assert.match(yaml, /do: mutate\n {4}apply: request\n {4}group: "mask"\n {4}set: off/);
  assert.match(yaml, /to: "vlai"\n {4}do: off\n {4}apply: request/);
  assert.match(yaml, /- on: forbidden\n {4}do: mark\n {4}apply: request\n {4}marker: "wrong door"/);
  assert.match(yaml, /- on: anonymous\n {4}list: "gate_anon"\n {4}ttl: "10m"\n {4}code: "GATE_ANON"/);
});

test("the ask form is rejected the way the module would reject it", () => {
  const bad: [Record<string, unknown>, RegExp][] = [
    [{ on: "sneeze", to: "captcha", do: "skip" }, /on must be/],
    [{ on: "authenticated", to: "captcha", do: "nuke" }, /not a verb/],
    [{ on: "authenticated", do: "off" }, /off needs to/],
    [{ on: "authenticated", to: "vlai", do: "off", apply: "conn" }, /conn is only for the frame/],
    [{ on: "authenticated", to: "rewrite", do: "mutate", set: "on" }, /mutate needs a group/],
    [{ on: "authenticated", do: "audit" }, /audit needs set/],
    [{ on: "authenticated", do: "mark" }, /mark needs a marker/],
    [{ on: "authenticated", to: "vlai", do: "score", value: 10 }, /takes no to/],
    [{ on: "authenticated", to: "vlai", do: "skip", ttlS: 60 }, /ttl is only for/],
    [{ on: "authenticated", to: "modsec", do: "threshold" }, /non-zero delta/],
  ];

  for (const [rule, why] of bad) {
    assert.throws(() => validateDoc(docWith([rule])), why, JSON.stringify(rule));
  }
});

test("a profile without rules prints no rules section", () => {
  const yaml = renderProfileYaml("default", docWith([]));

  assert.doesNotMatch(yaml, /^rules:/m);
});
