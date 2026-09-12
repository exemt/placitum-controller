/*
 * Исход просьбы архива (`when`) во всех документах-отправителях: разбор,
 * отбраковка и печать. Правила повторяют загрузчики инспекторов
 * (protocol.CheckArchiveWhen у Go, _archive_when у vlai) и отбраковку модуля
 * на проводе -- поймать ошибку оператора надо в панели, а не в пульсе через
 * минуту после send.
 */

import assert from "node:assert/strict";
import test from "node:test";

import * as action from "./action-profile-doc.ts";
import * as counter from "./counter-profile-doc.ts";
import * as json from "./json-profile-doc.ts";
import * as vlai from "./vlai-profile-doc.ts";
import * as modsec from "./modsec-policy-doc.ts";

/** Просьба архива с исходом -- как её кладёт панель. */
function ask(extra: Record<string, unknown> = {}) {
  return {
    to: "",
    do: "archive",
    apply: "request",
    set: "on",
    ttl_s: 2592000,
    when: ["deny"],
    body: { set: "on", limit: 65536, source: "original" },
    code: "MODSEC_HIT",
    ...extra,
  };
}

test("исход разбирается, приводится к каноническому порядку и печатается", () => {
  const doc = action.validateDoc({
    description: "",
    rules: [{ name: "all", match: {}, actions: [ask({ when: ["deny", "allow"] })] }],
  });

  assert.deepEqual(doc.rules[0].actions[0].when, ["allow", "deny"]);

  const yaml = action.renderProfileYaml("p", doc);

  assert.match(yaml, /when: \["allow", "deny"\]/);
});

test("пустой исход в файл не печатается: любой -- это отсутствие ключа", () => {
  const doc = action.validateDoc({
    description: "",
    rules: [{ name: "all", match: {}, actions: [ask({ when: [] })] }],
  });

  assert.deepEqual(doc.rules[0].actions[0].when, []);
  assert.equal(action.renderProfileYaml("p", doc).includes("when:"), false);
});

test("чужое слово в исходе не грузится", () => {
  assert.throws(
    () =>
      action.validateDoc({
        description: "",
        rules: [{ name: "all", match: {}, actions: [ask({ when: ["redirect"] })] }],
      }),
    action.DocError,
  );
});

test("исход только у archive с set on", () => {
  assert.throws(
    () =>
      action.validateDoc({
        description: "",
        rules: [{ name: "all", match: {}, actions: [ask({ do: "audit", ttl_s: 0 })] }],
      }),
    action.DocError,
  );

  assert.throws(
    () =>
      action.validateDoc({
        description: "",
        rules: [
          { name: "all", match: {}, actions: [ask({ set: "off", ttl_s: 0, body: null })] },
        ],
      }),
    action.DocError,
  );

  assert.throws(
    () =>
      action.validateDoc({
        description: "",
        rules: [
          {
            name: "all",
            match: {},
            actions: [
              {
                to: "counter",
                do: "skip",
                apply: "request",
                when: ["deny"],
              },
            ],
          },
        ],
      }),
    action.DocError,
  );
});

/*
 * Отправителей у канала пять, форма строки у всех одна, и разъехаться она
 * может только по недосмотру: у каждого свой разбор и своя печать.
 */
test("исход есть у всех отправителей канала", () => {
  const outcome = (extra: Record<string, unknown> = {}) => ({
    on: "deny",
    ...ask(),
    ...extra,
  });

  const counterDoc = counter.validateDoc({
    request: { enabled: true, outcomes: [outcome()] },
  });
  assert.deepEqual(counterDoc.request.outcomes[0].when, ["deny"]);
  assert.match(counter.renderProfileYaml("p", counterDoc), /when: \["deny"\]/);

  const SOURCE = "11111111-1111-4111-8111-111111111111";
  const jsonDoc = json.validateDoc({
    schema: { kind: "openapi", source: SOURCE },
    request: { enabled: true, outcomes: [outcome()] },
  });
  assert.deepEqual(jsonDoc.request.outcomes[0].when, ["deny"]);
  assert.match(
    json.renderProfileYaml("p", jsonDoc, new Map([[SOURCE, "api"]])),
    /when: \["deny"\]/,
  );

  // У vlai свои поводы срабатывания: счёт с порогом либо перегрузка.
  const vlaiDoc = vlai.validateDoc({ outcomes: [outcome({ on: "score", at: 60 })] });
  assert.deepEqual(vlaiDoc.outcomes[0].when, ["deny"]);
  assert.match(vlai.renderProfileYaml("p", vlaiDoc), /when: \["deny"\]/);

  const modsecDoc = modsec.validatePolicy({ outcomes: [outcome()] });
  assert.deepEqual(modsecDoc.outcomes[0].when, ["deny"]);
  assert.match(modsec.renderPolicyYaml("p", modsecDoc), /when: \["deny"\]/);
});
