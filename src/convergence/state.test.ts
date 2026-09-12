/**
 * Машина состояний сходимости. Таблицей, а не на стенде: состояний десяток,
 * и половину из них (чужой хеш, молчание, «издано и разошлось одновременно»)
 * на живом контуре воспроизводить дороже, чем описать.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consumerState,
  lampOf,
  viewChannel,
  worstState,
  type ChannelInput,
  type ChannelState,
  type ConsumerInput,
  type DesiredView,
  type DraftView,
} from "./state.ts";

const NEW = "sha256:new";
const OLD = "sha256:old";
const ALIEN = "sha256:alien";
const SRC = "sha256:source";

function draft(hash: string, over: Partial<DraftView> = {}): DraftView {
  return {
    hash,
    // По умолчанию отпечаток источника совпадает с sentSourceHash фикстуры:
    // «правок после рассылки не было».
    sourceHash: SRC,
    ok: true,
    empty: false,
    errors: [],
    at: "2026-08-23T00:00:00Z",
    ...over,
  };
}

function desired(hash: string, rev = 2): DesiredView {
  return { hash, rev };
}

function node(over: Partial<ConsumerInput> = {}): ConsumerInput {
  return { uuid: "n1", label: "node-1", degraded: false, ...over };
}

function input(over: Partial<ChannelInput> = {}): ChannelInput {
  return {
    id: "rules",
    delivered: true,
    draft: draft(NEW),
    desired: desired(NEW),
    sentSourceHash: SRC,
    consumers: [node({ hash: NEW })],
    ledger: [OLD, NEW],
    blocked: [],
    ...over,
  };
}

function stateOf(over: Partial<ChannelInput> = {}): ChannelState {
  return viewChannel(input(over)).state;
}

/* --- участник ------------------------------------------------------------ */

test("участник с хешем поколения -- ok", () => {
  assert.equal(consumerState(node({ hash: NEW }), desired(NEW), [OLD, NEW]), "ok");
});

test("прежнее поколение из журнала -- дренаж, не авария", () => {
  assert.equal(consumerState(node({ hash: OLD }), desired(NEW), [OLD, NEW]), "stale");
});

test("хеша нет в журнале -- на узле чужое", () => {
  assert.equal(consumerState(node({ hash: ALIEN }), desired(NEW), [OLD, NEW]), "foreign");
});

test("без журнала прежнее поколение неотличимо от чужого -- foreign", () => {
  // Ровно ради этого различия журнал и заведён: «подожди» и «иди смотреть на
  // узел» -- разные действия, и по одному KV их не разделить.
  assert.equal(consumerState(node({ hash: OLD }), desired(NEW), []), "foreign");
});

test("отказ применения перекрывает любой хеш", () => {
  const row = node({ hash: NEW, apply: "apply_failed" });
  assert.equal(consumerState(row, desired(NEW), [NEW]), "failed");
});

test("не тот ключ контура -- тот же отказ, что и упавший nginx -t", () => {
  const row = node({ hash: OLD, apply: "undecryptable" });
  assert.equal(consumerState(row, desired(NEW), [OLD, NEW]), "failed");
});

test("замолчавший с нужным хешем -- всё равно дыра", () => {
  const row = node({ hash: NEW, degraded: true });
  assert.equal(consumerState(row, desired(NEW), [NEW]), "silent");
});

test("отказ важнее молчания: замолчал уже после apply_failed", () => {
  const row = node({ hash: OLD, apply: "apply_failed", degraded: true });
  assert.equal(consumerState(row, desired(NEW), [OLD]), "failed");
});

test("живой, но ничего не применявший -- pending, не foreign", () => {
  assert.equal(consumerState(node({}), desired(NEW), [NEW]), "pending");
  assert.equal(consumerState(node({ hash: "" }), desired(NEW), [NEW]), "pending");
});

/* --- канал --------------------------------------------------------------- */

test("всё сошлось -- ok", () => {
  assert.equal(stateOf(), "ok");
});

test("сохранённое не разослано -- dirty", () => {
  assert.equal(stateOf({ draft: draft(NEW), desired: desired(OLD) }), "dirty");
});

test("ни разу не рассылали -- never, а не dirty", () => {
  // «Отличается от ничего» -- бесполезная формулировка: оператору надо знать,
  // что канала на флоте нет вовсе.
  assert.equal(stateOf({ desired: null, consumers: [] }), "never");
});

test("план не компилируется -- broken", () => {
  const broken = draft("", { ok: false, errors: [{ code: "x", message: "y" }] });
  assert.equal(stateOf({ draft: broken }), "broken");
});

test("отказ на ноде важнее незаконченной правки в форме", () => {
  const broken = draft("", { ok: false, errors: [{ code: "x", message: "y" }] });
  const failed = [node({ hash: OLD, apply: "apply_failed" })];
  assert.equal(stateOf({ draft: broken, consumers: failed }), "failed");
});

test("часть флота на старом -- converging", () => {
  const consumers = [node({ uuid: "a", hash: NEW }), node({ uuid: "b", hash: OLD })];
  assert.equal(stateOf({ consumers }), "converging");
});

test("dirty и converging одновременно: показывается dirty, счётчики целы", () => {
  const view = viewChannel(
    input({
      draft: draft("sha256:next"),
      desired: desired(NEW),
      consumers: [node({ uuid: "a", hash: NEW }), node({ uuid: "b", hash: OLD })],
    }),
  );

  assert.equal(view.state, "dirty");
  assert.equal(view.dirty, true);
  assert.equal(view.counts.ok, 1);
  assert.equal(view.counts.stale, 1);
});

test("издано, а участников нет вовсе -- nobody, не silent и не ok", () => {
  // Инспектора такого рода на контуре не подняли: рассылать некому, и это
  // не дыра, а отсутствие. Замолчавший участник -- другое дело (ниже).
  assert.equal(stateOf({ consumers: [] }), "nobody");
});

test("единственный участник замолчал -- silent, а не nobody", () => {
  assert.equal(stateOf({ consumers: [node({ hash: NEW, degraded: true })] }), "silent");
});

test("канал без читателя -- unmanaged, а не вечный drift", () => {
  const view = viewChannel(
    input({
      id: "ip",
      delivered: false,
      // Инспектор адреса докладывает отпечаток своего каталога: контроллер
      // такой хеш повторить не может по построению.
      consumers: [node({ hash: "sha256:local-fingerprint" })],
    }),
  );

  assert.equal(view.state, "unmanaged");
  assert.equal(view.consumers.length, 0, "участников у канала без читателя нет");
});

test("у канала без читателя правка всё равно видна как dirty", () => {
  const view = viewChannel(
    input({ id: "ip", delivered: false, draft: draft(NEW), desired: desired(OLD) }),
  );

  assert.equal(view.state, "dirty");
});

test("пустой источник и пустой флот -- тихо", () => {
  const view = viewChannel(
    input({ draft: draft("", { empty: true }), desired: null, consumers: [] }),
  );

  assert.equal(view.state, "empty");
  assert.equal(view.dirty, false, "рассылать нечего -- значит и кнопке гореть незачем");
});

test("источник опустел после рассылки -- отказ с читаемой причиной", () => {
  const view = viewChannel(input({ draft: draft("", { empty: true }) }));

  assert.equal(view.state, "broken");
  assert.equal(view.draft?.ok, false);
  assert.deepEqual(
    view.draft?.errors.map((row) => row.code),
    ["source_emptied"],
  );
});

/* --- правка, которую компилятор не печатает ------------------------------ */

test("источник правили, конфигурация та же -- no_effect, а не ok", () => {
  // Ровно тот случай, ради которого заведён второй хеш: поле сохранено,
  // компилятор его не читает, `config_hash` не двигается. Раньше это было
  // неотличимо от «ничего не меняли».
  const view = viewChannel(
    input({ draft: draft(NEW, { sourceHash: "sha256:edited" }) }),
  );

  assert.equal(view.state, "no_effect");
  assert.equal(view.sourceChanged, true);
  assert.equal(view.dirty, false, "на флот от этой правки ничего не уедет");
});

test("правка, которая доехала до конфигурации, -- обычный dirty", () => {
  const view = viewChannel(
    input({
      draft: draft("sha256:next", { sourceHash: "sha256:edited" }),
      desired: desired(NEW),
    }),
  );

  assert.equal(view.state, "dirty");
  assert.equal(view.sourceChanged, true);
});

test("отпечаток источника на момент рассылки неизвестен -- молчим", () => {
  // После рестарта контроллера сверять не с чем. Показать «не влияет» тут
  // значило бы пугать оператора на каждом рестарте.
  const view = viewChannel(
    input({ sentSourceHash: null, draft: draft(NEW, { sourceHash: "sha256:edited" }) }),
  );

  assert.equal(view.state, "ok");
  assert.equal(view.sourceChanged, false);
});

test("незаконченная правка важнее «не влияет»", () => {
  const broken = draft("", {
    ok: false,
    sourceHash: "sha256:edited",
    errors: [{ code: "x", message: "y" }],
  });

  assert.equal(stateOf({ draft: broken }), "broken");
});

test("отказ на ноде важнее «не влияет»", () => {
  const view = viewChannel(
    input({
      draft: draft(NEW, { sourceHash: "sha256:edited" }),
      consumers: [node({ hash: OLD, apply: "apply_failed" })],
    }),
  );

  assert.equal(view.state, "failed");
});

test("«не влияет» у канала без читателя тоже видно", () => {
  // Профиль адреса правят, доставки нет -- но правку заметить всё равно надо,
  // иначе канал молчит вдвойне.
  const view = viewChannel(
    input({
      id: "ip",
      delivered: false,
      draft: draft(NEW, { sourceHash: "sha256:edited" }),
      consumers: [],
    }),
  );

  assert.equal(view.state, "no_effect");
});

/* --- лампа --------------------------------------------------------------- */

test("лампа: отказ и чужой конфиг -- красное, ожидание -- жёлтое", () => {
  assert.equal(lampOf(["ok", "failed"]), "red");
  assert.equal(lampOf(["ok", "foreign"]), "red");
  assert.equal(lampOf(["ok", "dirty"]), "yellow");
  assert.equal(lampOf(["ok", "no_effect"]), "yellow");
  assert.equal(lampOf(["ok", "converging"]), "yellow");
  assert.equal(lampOf(["ok", "unmanaged", "empty", "nobody"]), "green");
});

test("худшее из каналов -- отказ, а не ожидание", () => {
  assert.equal(worstState(["dirty", "failed", "converging"]), "failed");
  assert.equal(worstState(["converging", "dirty"]), "dirty");
  assert.equal(worstState(["converging", "no_effect"]), "no_effect");
  assert.equal(worstState(["no_effect", "dirty"]), "dirty");
  assert.equal(worstState([]), "ok");
});
