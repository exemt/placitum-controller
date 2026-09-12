/*
 * Адресаты просьб по всем отправителям канала.
 *
 * Карта «объявление -> адресаты» кормит предупреждение action_no_receiver, и
 * отправитель, которого загрузчики не знают, в него не попадает молча. Здесь
 * проверяется, что каждый процесс с исходящими просьбами читается из своей
 * таблицы и своего раздела документа -- в том числе капча и калитка, чьи
 * просьбы лежат в правилах по событиям рядом с зарядами и записями в набор.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { loadActionTargets } from "./action-targets.ts";
import type { Pool } from "./db.ts";

/** Пул из таблиц в памяти: запрос выбирается по имени таблицы в SQL. */
function poolOf(tables: Record<string, unknown[]>): Pool {
  return {
    async query(sql: string) {
      const found = Object.keys(tables).find((name) => sql.includes(`from ${name}`));

      return { rows: found === undefined ? [] : tables[found] };
    },
  } as unknown as Pool;
}

test("every sender process contributes its targets", async () => {
  const pool = poolOf({
    counter_profiles: [
      { name: "default", doc: { request: { outcomes: [{ to: "captcha" }] } } },
    ],
    rule_sets: [{ name: "default", policy: { outcomes: [{ to: "captcha" }, { to: "" }] } }],
    ip_profile_rules: [{ name: "default", to_inspector: "modsec" }],
    json_profiles: [
      {
        name: "default",
        doc: {
          request: { outcomes: [{ to: "captcha" }] },
          response: { outcomes: [{ to: "rewrite" }] },
          frame: { outcomes: [{ to: "counter" }] },
        },
      },
    ],
    vlai_profiles: [{ name: "default", doc: { outcomes: [{ to: "captcha" }] } }],
    action_profiles: [
      { name: "default", doc: { rules: [{ actions: [{ to: "modsec" }, { to: "vlai" }] }] } },
    ],
    captcha_profiles: [
      {
        name: "default",
        doc: {
          rules: [
            { on: "bucket_ban", do: "note", to: "counter" },
            /* Заряд корзины и запись в набор адресата не имеют. */
            { on: "fail", charge: "ip", percent: 20 },
            { on: "pass", list: "cleared", write: "cid", to: "ghost" },
          ],
        },
      },
    ],
    auth_profiles: [
      { name: "default", doc: { rules: [{ on: "authenticated", do: "skip", to: "captcha" }] } },
    ],
  });

  const decls = {
    counter: {},
    modsec: {},
    ip: {},
    json: {},
    vlai: {},
    action: {},
    captcha: {},
    auth: {},
    rewrite: {},
  };

  const targets = await loadActionTargets(pool, "space", decls);

  assert.deepEqual(targets.get("counter"), ["captcha"]);
  assert.deepEqual(targets.get("modsec"), ["captcha"]);
  assert.deepEqual(targets.get("ip"), ["modsec"]);
  assert.deepEqual(targets.get("json"), ["captcha", "rewrite", "counter"]);
  assert.deepEqual(targets.get("vlai"), ["captcha"]);
  assert.deepEqual(targets.get("action"), ["modsec", "vlai"]);
  assert.deepEqual(targets.get("captcha"), ["counter"]);
  assert.deepEqual(targets.get("auth"), ["captcha"]);
  assert.equal(targets.has("rewrite"), false);
});

test("a declared name resolves through process and profile", async () => {
  const pool = poolOf({
    captcha_profiles: [
      { name: "strict", doc: { rules: [{ on: "cleared", do: "skip", to: "vlai" }] } },
    ],
  });

  const targets = await loadActionTargets(pool, "space", {
    "captcha-strict": { process: "captcha", profile: "strict" },
    captcha: {},
  });

  assert.deepEqual(targets.get("captcha-strict"), ["vlai"]);
  assert.equal(targets.has("captcha"), false);
});
