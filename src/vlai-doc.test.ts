/*
 * Документ профиля vlai: проверка повторяет загрузчик инспектора
 * (inspectors/vlai/src/profiles.py), печать читается его же разбором. Ловится
 * здесь то, что иначе всплыло бы как apply_failed в пульсе через минуту после
 * send.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DocError,
  normalizeDoc,
  renderProfileYaml,
  validateDoc,
} from "./vlai-profile-doc.ts";
import { hashVlaiProfiles } from "./vlai-manifest.ts";

const doc = {
  mode: "enforce",
  description: "тест",
  overload: "shed",
  trigger: {
    prior: [
      { from: "ip", accept: ["threshold", "skip"], codes: ["IP_ALLOWLIST"] },
    ],
  },
  outcomes: [
    { on: "score", at: 60, to: "captcha", do: "challenge", code: "VLAI_HOT" },
    {
      on: "overload",
      to: "counter",
      do: "note",
      apply: "ip",
      value: 20,
      counter: "abuse",
      code: "VLAI_OVERLOAD",
    },
  ],
};

test("валидный документ проходит и достраивается умолчаниями", () => {
  const out = validateDoc(doc);

  assert.equal(out.overload, "shed");
  assert.deepEqual(out.trigger.prior[0], {
    from: "ip",
    accept: ["threshold", "skip"],
    codes: ["IP_ALLOWLIST"],
  });
  // Ось challenge единственная и проставляется словарём.
  assert.equal(out.outcomes[0].apply, "request");
  assert.equal(out.outcomes[1].apply, "ip");
});

test("пустой документ читается умолчаниями: enforce, overload shed", () => {
  const out = normalizeDoc({});

  assert.equal(out.overload, "shed");
  assert.deepEqual(out.trigger.prior, []);
  assert.deepEqual(out.outcomes, []);
});

test("послабление требует имени: широковещательное правило не грузится", () => {
  assert.throws(
    () =>
      validateDoc({
        ...doc,
        trigger: { prior: [{ from: "*", accept: ["skip"] }] },
      }),
    DocError,
  );
});

test("мёртвый потолок в старой строке читается и отбрасывается", () => {
  const out = validateDoc({
    ...doc,
    trigger: { prior: [{ from: "ip", accept: ["threshold"], max_percent: 50 }] },
  });

  assert.deepEqual(out.trigger.prior, [{ from: "ip", accept: ["threshold"], codes: [] }]);
});

test("чужой глагол в приёме не грузится", () => {
  assert.throws(
    () =>
      validateDoc({
        ...doc,
        trigger: { prior: [{ from: "ip", accept: ["challenge"] }] },
      }),
    DocError,
  );
});

test("инициатор on: score требует порога, on: overload его отвергает", () => {
  assert.throws(
    () =>
      validateDoc({
        ...doc,
        outcomes: [{ on: "score", to: "captcha", do: "challenge" }],
      }),
    DocError,
  );

  assert.throws(
    () =>
      validateDoc({
        ...doc,
        outcomes: [{ on: "overload", at: 10, to: "captcha", do: "challenge" }],
      }),
    DocError,
  );
});

test("инициатор без адресата не грузится: «всем» здесь нет", () => {
  assert.throws(
    () =>
      validateDoc({
        ...doc,
        outcomes: [{ on: "overload", to: "", do: "challenge" }],
      }),
    DocError,
  );
});

test("threshold без delta и note без value не грузятся", () => {
  assert.throws(
    () =>
      validateDoc({
        ...doc,
        outcomes: [{ on: "overload", to: "modsec", do: "threshold" }],
      }),
    DocError,
  );

  assert.throws(
    () =>
      validateDoc({
        ...doc,
        outcomes: [{ on: "overload", to: "counter", do: "note", apply: "ip" }],
      }),
    DocError,
  );
});

test("overload вне словаря не грузится", () => {
  assert.throws(() => validateDoc({ ...doc, overload: "drop" }), DocError);
});

test("запись в набор: охват из четырёх слов, срок обязателен, действие ровно одно", () => {
  const out = validateDoc({
    ...doc,
    outcomes: [
      { on: "overload", list: "hot", ttl_s: 600 },
      { on: "score", at: 80, list: "hot", write: "net_all", ttl_s: 3600, code: "VLAI_HOT" },
    ],
  });

  assert.equal(out.outcomes[0].list, "hot");
  assert.equal(out.outcomes[0].write, "addr");
  assert.equal(out.outcomes[0].ttlS, 600);
  assert.equal(out.outcomes[1].write, "net_all");

  const bad: unknown[] = [
    // Действие ровно одно: просьба либо запись.
    [{ on: "overload", to: "captcha", do: "challenge", list: "hot", ttl_s: 600 }],
    [{ on: "overload" }],
    // Запись без срока пережила бы свою причину.
    [{ on: "overload", list: "hot" }],
    // Охват -- одно из четырёх слов: чужое загрузчик не прочтёт.
    [{ on: "overload", list: "hot", ttl_s: 600, write: "country" }],
    [{ on: "overload", list: "плохое имя", ttl_s: 600 }],
  ];

  for (const outcomes of bad) {
    assert.throws(() => validateDoc({ ...doc, outcomes }), DocError, JSON.stringify(outcomes));
  }
});

test("печать записи читается разбором инспектора", () => {
  const yaml = renderProfileYaml(
    "strict",
    validateDoc({
      ...doc,
      outcomes: [{ on: "overload", list: "hot", ttl_s: 600, code: "VLAI_OVERLOAD" }],
    }),
  );

  assert.match(yaml, /- on: overload\n {4}list: "hot"\n {4}write: addr\n {4}ttl: "10m"\n {4}code: "VLAI_OVERLOAD"\n/);
  assert.equal(yaml.includes("to:"), false);
  assert.equal(yaml.includes("do:"), false);
});

test("печать читается глазами и стабильна", () => {
  const yaml = renderProfileYaml("strict", validateDoc(doc));

  assert.match(yaml, /mode: enforce/);
  assert.match(yaml, /overload: shed/);
  assert.match(yaml, /- from: "ip"/);
  assert.match(yaml, /accept: \[threshold, skip\]/);
  assert.ok(!yaml.includes("max_percent"), yaml);
  assert.match(yaml, /- on: overload/);
  assert.match(yaml, /counter: "abuse"/);

  // Повторная печать того же документа обязана дать тот же текст: на ней
  // держится хеш поколения.
  assert.equal(yaml, renderProfileYaml("strict", validateDoc(doc)));
});

test("хеш поколения детерминирован и не зависит от порядка ключей", () => {
  const files = { files: [{ name: "profile.yaml", text: "mode: enforce\n" }] };

  assert.equal(
    hashVlaiProfiles({ a: files, b: files }),
    hashVlaiProfiles({ b: files, a: files }),
  );
});

test("mutate: группа и сторона обязательны, обе печатаются", () => {
  const withMutate = (outcome: Record<string, unknown>) => ({
    ...doc,
    outcomes: [outcome],
  });

  assert.throws(
    () => validateDoc(withMutate({ on: "overload", to: "rewrite", do: "mutate", set: "on" })),
    /mutate needs a group/,
  );
  assert.throws(
    () => validateDoc(withMutate({ on: "overload", to: "rewrite", do: "mutate", group: "mask" })),
    /set: on or off/,
  );
  assert.throws(
    () => validateDoc(withMutate({ on: "overload", to: "vlai", do: "skip", group: "mask" })),
    /group is only for mutate/,
  );

  const out = validateDoc(
    withMutate({ on: "overload", to: "rewrite", do: "mutate", group: "mask", set: "off" }),
  );
  const yaml = renderProfileYaml("m", out);

  assert.equal(out.outcomes[0].apply, "request");
  assert.match(yaml, /do: mutate\n {4}apply: request\n {4}group: "mask"\n {4}set: off\n/);
});
