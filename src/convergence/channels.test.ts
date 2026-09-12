/**
 * Реестр каналов. Проверяется не содержимое таблицы, а её инварианты: ключи
 * уникальны, каждый инспектор ведёт ровно в один канал, и ни один канал не
 * остался без адреса рассылки.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { AGENT_CONF_KEY } from "../compile/agent-conf.ts";
import { NGINX_PACK_KEY } from "../compile/nginx-pack.ts";
import { RULES_PACK_KEY } from "../compile/pointer.ts";
import {
  CHANNELS,
  CHANNEL_IDS,
  CHANNEL_LIST,
  channelOfInspector,
  channelOfProfileTag,
  isChannelId,
} from "./channels.ts";

test("ключи KV не пересекаются: два канала в один ключ -- потеря поколения", () => {
  const keys = CHANNEL_LIST.map((row) => row.key);
  assert.equal(new Set(keys).size, keys.length, keys.join(", "));
});

test("ключи совпадают с теми, что читают агент и инспекторы", () => {
  assert.equal(CHANNELS.nginx.key, NGINX_PACK_KEY);
  assert.equal(CHANNELS.agent.key, AGENT_CONF_KEY);
  assert.equal(CHANNELS.rules.key, RULES_PACK_KEY);
});

test("инспектор ведёт ровно в один канал", () => {
  for (const name of ["modsec", "ip", "auth", "captcha"]) {
    const matched = CHANNEL_LIST.filter(
      (row) => row.consumer.kind === "inspector" && row.consumer.name === name,
    );
    assert.equal(matched.length, 1, `${name}: каналов ${matched.length}`);
    assert.equal(channelOfInspector(name), matched[0].id);
  }
});

test("инспектор без канала -- не расхождение, а отсутствие канала", () => {
  for (const name of ["challenge", "unknown"]) {
    assert.equal(channelOfInspector(name), null, name);
  }
  // У vlai канал появился: поколение профилей едет ключом policy/vlai.
  assert.equal(channelOfInspector("vlai"), "vlai");
});

test("каналы агента: шаблон читает управляющая нода, настройку -- все", () => {
  assert.deepEqual(CHANNELS.nginx.consumer, { kind: "agent", nginx: true });
  assert.deepEqual(CHANNELS.agent.consumer, { kind: "agent", nginx: false });
});

test("тег profile= ведёт в канал профилей того же инспектора", () => {
  assert.equal(channelOfProfileTag("modsec"), "rules");
  assert.equal(channelOfProfileTag("auth"), "auth");
  assert.equal(channelOfProfileTag("captcha"), "captcha");
  assert.equal(channelOfProfileTag("nosuch"), null);
});

test("у каждого канала есть куда нажать", () => {
  for (const spec of CHANNEL_LIST) {
    assert.ok(spec.send.length > 0, `${spec.id}: нет адреса send`);
    assert.ok(spec.page.startsWith("/"), `${spec.id}: нет страницы`);
    assert.ok(spec.key.startsWith("policy/"), `${spec.id}: ключ не из policy/`);
  }
});

test("доставляются все каналы, включая адрес", () => {
  // Инспектор адреса читает поколение сам и кладёт в пульс его хеш; до первой
  // рассылки там остаётся локальный отпечаток, и расхождение честное --
  // поколения на ноде действительно нет.
  for (const id of CHANNEL_IDS) {
    assert.equal(CHANNELS[id].delivered, true, id);
  }
});

test("isChannelId не пропускает чужое", () => {
  assert.equal(isChannelId("rules"), true);
  assert.equal(isChannelId("modsec"), false);
  assert.equal(isChannelId(""), false);
});
