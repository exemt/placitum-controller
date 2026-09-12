import assert from "node:assert/strict";
import { test } from "node:test";

import { checkAsk, type Ask } from "./action-ask.ts";

/*
 * Валидатор просьбы -- один на всех отправителей канала. До него та же сотня
 * строк лежала шестью копиями, и одна из них молча отстала: у профиля адреса
 * разошёлся словарь глаголов. Тесты здесь про сам валидатор; что каждый
 * отправитель зовёт его со своими опциями, проверяют тесты их документов.
 */

class TestError extends Error {}

function fail(message: string): never {
  throw new TestError(message);
}

const ask = (patch: Partial<Ask> = {}): Ask => ({
  do: "challenge",
  to: "captcha",
  apply: "request",
  delta: null,
  value: null,
  counter: "",
  marker: "",
  set: "",
  ttlS: 0,
  ...patch,
});

function why(patch: Partial<Ask>, rules: Partial<Parameters<typeof checkAsk>[2]> = {}) {
  try {
    checkAsk("x", ask(patch), { fail, ...rules });
  } catch (err) {
    return (err as Error).message;
  }

  return null;
}

test("глагол берётся из реестра канала, а не из своего списка", () => {
  assert.equal(why({ do: "challenge" }), null);
  // Управляющие и записи -- часть словаря: отдельного списка у отправителя нет.
  assert.equal(why({ do: "passive" }), null);
  assert.equal(why({ do: "vote" }), null);
  assert.match(why({ do: "vote", to: "" }) ?? "", /needs to/);
  // Очки: адресат -- сумма маршрута, value обязателен, знак свободен, сотня -- край.
  assert.equal(why({ do: "score", to: "", value: 30 }), null);
  assert.equal(why({ do: "score", to: "", value: -100 }), null);
  assert.match(why({ do: "score", to: "", value: null }) ?? "", /needs a non-zero value/);
  assert.match(why({ do: "score", to: "", value: 0 }) ?? "", /needs a non-zero value/);
  assert.match(why({ do: "score", to: "", value: 101 }) ?? "", /out of -100..100/);
  assert.match(why({ do: "score", to: "captcha", value: 30 }) ?? "", /takes no to/);
  assert.match(why({ do: "challenge", value: 5 }) ?? "", /only for note and score/);
  assert.equal(why({ do: "archive", to: "", set: "on" }), null);
  assert.match(why({ do: "bless" }) ?? "", /not a verb of the actions channel/);
});

test("ось: умолчание там, где она одна, и отбраковка чужой", () => {
  assert.equal(why({ do: "challenge", apply: "" }), null);
  assert.match(why({ do: "challenge", apply: "ip" }) ?? "", /does not take apply/);
  // У note осей четыре -- угадывать нельзя.
  assert.match(why({ do: "note", apply: "", value: 10 }) ?? "", /does not take apply/);
});

test("ось conn -- только у кадров, ось response -- только вне их", () => {
  assert.match(why({ do: "passive", apply: "conn" }) ?? "", /conn is only for the frame/);
  assert.equal(why({ do: "passive", apply: "conn" }, { frame: true }), null);

  const record: Partial<Ask> = { do: "archive", to: "", set: "on", apply: "response" };

  assert.equal(why(record), null);
  assert.match(why(record, { frame: true }) ?? "", /frames have no response record/);
});

test("на отказе просьба соседу не доедет, глаголы записи -- доедут", () => {
  assert.match(
    why({ do: "challenge" }, { onDeny: true }) ?? "",
    /deny ends the phase/,
  );
  assert.equal(why({ do: "archive", to: "", set: "on" }, { onDeny: true }), null);
  assert.equal(why({ do: "mark", to: "", marker: "hit" }, { onDeny: true }), null);
});

test("адресат: обязателен по требованию отправителя, у записи его не бывает", () => {
  assert.match(why({ to: "" }, { requireTo: true }) ?? "", /to is empty/);
  assert.equal(why({ to: "" }), null);
  // Глаголов записи требование адресата не касается -- их адресат маршрут.
  assert.equal(why({ do: "audit", to: "", set: "on" }, { requireTo: true }), null);
  // А названный сосед у них -- битая форма.
  assert.match(
    why({ do: "audit", to: "captcha", set: "on" }) ?? "",
    /takes no to/,
  );
});

test("управляющему глаголу нужно имя: режим ставят одному вызову", () => {
  assert.match(why({ do: "off", to: "" }) ?? "", /off needs to/);
  assert.match(why({ do: "off", to: "*" }) ?? "", /off needs to/);
  assert.equal(why({ do: "off", to: "modsec" }), null);
});

test("числа: своему глаголу, в своих границах и не ноль", () => {
  assert.match(why({ do: "note", apply: "ip", delta: 10 }) ?? "", /delta is only for threshold/);
  assert.match(why({ do: "threshold", value: 10, delta: 10 }) ?? "", /value is only for note/);
  assert.match(why({ do: "threshold", delta: 0 }) ?? "", /non-zero delta/);
  assert.match(why({ do: "note", apply: "ip", value: 0 }) ?? "", /non-zero value/);
  assert.match(why({ do: "threshold", delta: 5000 }) ?? "", /out of -100\.\.900/);
  assert.match(why({ do: "note", apply: "ip", value: 500 }) ?? "", /out of -100\.\.100/);
});

test("mutate: группу и сторону называет отправитель, и не всякий это умеет", () => {
  const to = { to: "rewrite", do: "mutate" };

  assert.equal(why({ ...to, group: "hdr", set: "on" }), null);
  assert.match(why({ ...to, group: "", set: "on" }) ?? "", /mutate needs a group/);
  assert.match(why({ ...to, group: "hdr", set: "" }) ?? "", /mutate needs set/);
  // Поля группы нет вовсе -- отправитель mutate не умеет.
  assert.match(why(to) ?? "", /does not send mutate/);
  assert.match(why({ group: "hdr" }) ?? "", /group is only for mutate/);
});

test("повод сверяется формой: его читает получатель, а не человек", () => {
  assert.equal(why({ code: "IP_GREY" }), null);
  assert.equal(why({ code: "" }), null);
  assert.match(why({ code: "lower" }) ?? "", /not a valid reason code/);
});

test("метка -- только у mark, и у mark она обязательна", () => {
  assert.equal(why({ do: "mark", to: "", marker: "hit" }), null);
  assert.match(why({ do: "mark", to: "", marker: "" }) ?? "", /marker/);
  assert.match(why({ marker: "hit" }) ?? "", /marker is only for mark/);
});

test("срок, исходы и объекты -- только у archive с set on", () => {
  const archive = (patch: Partial<Ask>) =>
    why({ do: "archive", to: "", set: "on", ...patch });

  assert.equal(archive({ ttlS: 60, when: ["deny"] }), null);
  assert.match(archive({ set: "off", ttlS: 60 }) ?? "", /only for set on/);
  assert.match(
    why({ do: "audit", to: "", set: "on", ttlS: 60 }) ?? "",
    /ttl and when are only for archive/,
  );
  assert.match(
    why({ when: ["deny"] }) ?? "",
    /only for audit and archive/,
  );
  /*
   * Форму объекта тип уже сузил, поэтому чужое слово подставляется мимо него:
   * документ приходит недоверенным JSON, и проверка нужна на значении, а не на
   * типе.
   */
  assert.match(
    archive({ headers: { set: "maybe", limit: null, source: "" } as never }) ?? "",
    /headers\.set must be on or off/,
  );
});

test("ось записывается обратно только по просьбе вызывающего", () => {
  const row = ask({ do: "challenge", apply: "" });

  checkAsk("x", row, { fail });
  assert.equal(row.apply, "");

  checkAsk("x", row, { fail, normalize: true });
  assert.equal(row.apply, "request");
});

/*
 * Фаза вызова адресата -- адрес управляющего глагола: у имени на двух фазах
 * вызова два. Без поля режим получают оба; у прочих глаголов поля нет.
 */
test("фаза вызова -- только у управляющих глаголов и из трёх слов", () => {
  const control = (patch: Partial<Ask>) => why({ do: "off", to: "json", apply: "request", ...patch });

  assert.equal(control({}), null);
  assert.equal(control({ phase: "" }), null);
  assert.equal(control({ phase: "request" }), null);
  assert.equal(control({ phase: "response" }), null);
  assert.equal(control({ phase: "frame" }), null);
  assert.match(control({ phase: "frame:c2s" }) ?? "", /phase must be request, response or frame/);
  assert.match(
    why({ do: "challenge", phase: "response" }) ?? "",
    /phase is only for active, passive, vote and off/,
  );
  assert.match(
    why({ do: "mark", to: "", marker: "x", phase: "request" }) ?? "",
    /phase is only for/,
  );

  /* Ось conn живёт только на кадрах, и фаза при ней -- только frame. */
  assert.equal(why({ do: "off", to: "json", apply: "conn", phase: "frame" }, { frame: true }), null);
  assert.equal(why({ do: "off", to: "json", apply: "conn" }, { frame: true }), null);
  assert.match(
    why({ do: "off", to: "json", apply: "conn", phase: "response" }, { frame: true }) ?? "",
    /apply conn needs phase frame/,
  );
});
