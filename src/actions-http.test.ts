/*
 * Ручка словаря действий.
 *
 * Проверяется не «отдаёт 200», а то, ради чего она заведена: по ответу можно
 * собрать правило, которое загрузчик профиля примет, и нельзя собрать то,
 * которое он отвергнет. Пары глагол-ось и границы параметров -- это и есть
 * содержимое ручки; без них она была бы списком слов.
 */

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { actionsRouter } from "./actions-http.ts";

interface Param {
  name: string;
  type: string;
  required: boolean;
  min?: number;
  max?: number;
  signed?: boolean;
}

interface Spec {
  module?: boolean;
  route?: boolean;
  do: string;
  axes: string[];
  params: Param[];
  listeners: string[];
}

interface Body {
  v: number;
  axes: string[];
  verbs: Spec[];
  common: Param[];
}

async function ask(): Promise<{ status: number; body: Body; cache: string | null }> {
  const app = express();
  app.use("/api/actions", actionsRouter());

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");

  const { port } = server.address() as { port: number };

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/actions`);

    return {
      status: res.status,
      body: (await res.json()) as Body,
      cache: res.headers.get("cache-control"),
    };
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("отдаёт словарь целиком: оси, глаголы и общие поля", async () => {
  const { status, body, cache } = await ask();

  assert.equal(status, 200);
  assert.equal(body.v, 1);

  assert.deepEqual(body.axes, ["request", "response", "ip", "asn", "session", "conn"]);
  assert.deepEqual(
    body.verbs.map((v) => v.do),
    ["challenge", "threshold", "skip", "reauth", "mutate", "active", "passive", "vote", "off", "audit", "archive", "mark", "score", "ban", "note"],
  );
  // Управляющие глаголы помечены: панель не предлагает их «всем» и правилам приёма.
  assert.deepEqual(
    body.verbs.filter((v) => v.module === true).map((v) => v.do),
    ["active", "passive", "vote", "off", "audit", "archive", "mark", "score", "ban"],
  );
  // Адресат -- сам маршрут: запись (журнал, архив, маркер), сумма фазы (очки)
  // и живой набор (бан).
  assert.deepEqual(
    body.verbs.filter((v) => v.route === true).map((v) => v.do),
    ["audit", "archive", "mark", "score", "ban"],
  );

  assert.deepEqual(
    body.common.map((p) => p.name),
    ["to", "code"],
  );

  // Словарь меняется с выкаткой контроллера, а не с настройками.
  assert.match(cache ?? "", /max-age=\d+/);
});

test("по ответу видно, какая ось при каком глаголе", async () => {
  const { body } = await ask();
  const by = new Map(body.verbs.map((v) => [v.do, v]));

  // Выбор настоящий только у note; у остальных ось одна.
  assert.deepEqual(by.get("note")?.axes, ["request", "ip", "asn", "session"]);
  assert.deepEqual(by.get("challenge")?.axes, ["request"]);
  assert.deepEqual(by.get("threshold")?.axes, ["request"]);
  assert.deepEqual(by.get("skip")?.axes, ["request"]);
  assert.deepEqual(by.get("reauth")?.axes, ["session"]);
  // У маркера ось одна: помечают событие, а не адрес.
  assert.deepEqual(by.get("mark")?.axes, ["request"]);
  assert.deepEqual(by.get("mark")?.params.map((p) => p.name), ["marker"]);
});

test("параметры приезжают с теми же границами, что у модуля", async () => {
  const { body } = await ask();
  const by = new Map(body.verbs.map((v) => [v.do, v]));

  const delta = by.get("threshold")?.params[0];
  assert.equal(delta?.name, "delta");
  assert.equal(delta?.required, true, "threshold без delta -- полуфраза, модуль такой ответ бракует");
  assert.equal(delta?.min, -1000);
  assert.equal(delta?.max, 1000);
  assert.equal(delta?.signed, true, "знак у дельты выбирает направление");

  const value = by.get("note")?.params[0];
  assert.equal(value?.name, "value");
  assert.equal(value?.required, false);
  assert.equal(value?.min, -1000);
  assert.equal(value?.max, 1000);
  assert.equal(value?.signed, true, "знак выбирает направление изменения счётчика");

  /*
   * Параметров нет вовсе -- пустой массив, а не отсутствие поля. У challenge
   * их нет по существу: канал рекомендательный, и «сделай обязательно» --
   * рычаг, которого у отправителя быть не должно.
   */
  assert.deepEqual(by.get("challenge")?.params, []);
  assert.deepEqual(by.get("skip")?.params, []);
  assert.deepEqual(by.get("reauth")?.params, []);
});

test("listeners подсказывает адресата, но никого не запрещает", async () => {
  const { body } = await ask();
  const by = new Map(body.verbs.map((v) => [v.do, v]));

  assert.deepEqual(by.get("challenge")?.listeners, ["captcha"]);
  assert.deepEqual(by.get("reauth")?.listeners, ["auth"]);

  /*
   * Слушатели перечислены явно: у каждого получателя свой короткий список
   * входных действий, и панель не предлагает глагол тому, чей загрузчик его
   * отвергнет. Отказывает всё равно загрузчик -- список остаётся подсказкой.
   */
  // Капчи у threshold больше нет: её счёт-триггер умер, коэффициент
  // масштабировал бы пустоту; корзины двигают глаголом note. Счётчик
  // масштабирует счёт своих правил judge, а его skip снимает суд, но не учёт.
  assert.deepEqual(by.get("threshold")?.listeners, ["modsec", "json", "vlai", "counter"]);
  // skip слушает один счётчик: «не судить, но считать» управляющим глаголом не
  // заменить. Остальные принимают skip только на проводе (совместимость), а
  // панель даёт им off -- тот же смысл без круга по шине и без правила.
  assert.deepEqual(by.get("skip")?.listeners, ["counter"]);
  // Счётчик принимает note в корзины fill: note: у капчи перелив кончается
  // проверкой человека, у счётчика -- судом, и на машинных маршрутах работает
  // только второе.
  assert.deepEqual(by.get("note")?.listeners, ["captcha", "counter"]);
  // mutate переключает группы модификаторов: какие и куда, называет правило
  // приёма получателя по code -- параметров на проводе у глагола нет.
  assert.deepEqual(by.get("mutate")?.listeners, ["rewrite"]);
});
