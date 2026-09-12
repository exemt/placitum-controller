/**
 * Просьбы без получателя: сверка адресатов профиля с набором маршрута.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { actionReceiverWarnings } from "./action-receivers.ts";
import type { NginxExport } from "./nginx.ts";
import type { WafRouteSettings } from "../model/waf-route.ts";

function source(
  serverWaf: WafRouteSettings,
  locations: { path: string; waf: WafRouteSettings }[],
  decls: NginxExport["space"]["waf"] = {},
): NginxExport {
  return {
    space: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "default",
      nginxMain: {},
      nginx: {},
      wafHttp: {},
      waf: decls,
      raw: false,
      rawNginx: "",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    inspectors: [],
    datasets: [],
    denyResponses: [],
    bodyStores: [],
    logFormats: [],
    upstreams: [],
    ports: [],
    certificates: [],
    contentObjects: [],
    servers: [
      {
        server: {
          id: "srv",
          httpSpaceId: "s",
          name: "main",
          serverNames: ["a"],
          enabled: true,
          nginx: {},
          waf: serverWaf,
          raw: false,
          rawNginx: "",
        },
        listens: [],
        certificates: [],
        locations: locations.map((loc, i) => ({
          id: `loc${i}`,
          serverId: "srv",
          match: "prefix" as const,
          path: loc.path,
          position: i,
          enabled: true,
          handler: "static" as const,
          protocol: "http",
          nginx: {},
          waf: loc.waf,
          raw: false,
          rawNginx: "",
          builtin: false,
        })),
      },
    ],
  };
}

const decls = {
  inspectors: {
    counter: {},
    "counter-cards": { process: "counter", profile: "juice" },
    captcha: { profile: "login" },
    "captcha-guard": { process: "captcha", profile: "guard" },
  },
};

const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);

test("адресат стоит позже отправителя -- чисто", () => {
  const src = source({}, [
    {
      path: "/shop/",
      waf: {
        requestInspectors: [
          { name: "counter-cards", wave: 2 },
          { name: "captcha-guard", wave: 3 },
        ],
      },
    },
  ], decls);

  assert.deepEqual(
    actionReceiverWarnings(src, new Map([["counter-cards", ["captcha-guard"]]])),
    [],
  );
});

test("адресован процесс, а на маршруте другое имя -- предупреждение", () => {
  // Ровно та ошибка, ради которой проверка и заведена: профиль писали от имени
  // процесса ("captcha"), а маршрут зовёт объявление ("captcha-guard").
  const src = source({}, [
    {
      path: "/shop/",
      waf: {
        requestInspectors: [
          { name: "counter-cards", wave: 2 },
          { name: "captcha-guard", wave: 3 },
        ],
      },
    },
  ], decls);

  const warnings = actionReceiverWarnings(
    src,
    new Map([["counter-cards", ["captcha"]]]),
  );

  assert.deepEqual(codes(warnings), ["action_no_receiver"]);
  assert.match(warnings[0].message, /"captcha"/);
  assert.match(warnings[0].message, /location "\/shop\/"/);
});

test("адресат раньше отправителя -- его волна уже высказалась", () => {
  const src = source({}, [
    {
      path: "/shop/",
      waf: {
        requestInspectors: [
          { name: "captcha-guard", wave: 0 },
          { name: "counter-cards", wave: 2 },
        ],
      },
    },
  ], decls);

  assert.deepEqual(
    codes(actionReceiverWarnings(src, new Map([["counter-cards", ["captcha-guard"]]]))),
    ["action_no_receiver"],
  );
});

test("адресат на фазе ответа -- prior сквозная, доедет", () => {
  const src = source({}, [
    {
      path: "/shop/",
      waf: {
        requestInspectors: [{ name: "counter-cards", wave: 2 }],
        responseInspectors: [{ name: "captcha-guard", wave: 0 }],
      },
    },
  ], decls);

  assert.deepEqual(
    actionReceiverWarnings(src, new Map([["counter-cards", ["captcha-guard"]]])),
    [],
  );
});

test("набор унаследован с сервера -- проверяется лист, а не уровень", () => {
  const src = source(
    {
      requestInspectors: [
        { name: "counter-cards", wave: 2 },
        { name: "captcha-guard", wave: 3 },
      ],
    },
    [{ path: "/shop/", waf: {} }],
    decls,
  );

  assert.deepEqual(
    actionReceiverWarnings(src, new Map([["counter-cards", ["captcha-guard"]]])),
    [],
  );
});

test("маршрут перебил набор своим -- адресата там уже нет", () => {
  const src = source(
    {
      requestInspectors: [
        { name: "counter-cards", wave: 2 },
        { name: "captcha-guard", wave: 3 },
      ],
    },
    [{ path: "/api/", waf: { requestInspectors: [{ name: "counter-cards", wave: 0 }] } }],
    decls,
  );

  assert.deepEqual(
    codes(actionReceiverWarnings(src, new Map([["counter-cards", ["captcha-guard"]]]))),
    ["action_no_receiver"],
  );
});

test("широковещание проверять нечего", () => {
  const src = source({}, [
    { path: "/shop/", waf: { requestInspectors: [{ name: "counter-cards", wave: 2 }] } },
  ], decls);

  assert.deepEqual(actionReceiverWarnings(src, new Map([["counter-cards", [""]]])), []);
});

test("имя адресата вообще не объявлено -- об этом говорится отдельно", () => {
  const src = source({}, [
    { path: "/shop/", waf: { requestInspectors: [{ name: "counter-cards", wave: 2 }] } },
  ], decls);

  const warnings = actionReceiverWarnings(
    src,
    new Map([["counter-cards", ["nosuch"]]]),
  );

  assert.deepEqual(codes(warnings), ["action_no_receiver"]);
  assert.match(warnings[0].message, /not a declared inspector name/);
});

test("отправитель на обеих фазах: доезжает с запроса -- чисто", () => {
  // Счётчик меряет на ответе и судит на запросе, а просьбы шлёт с одной фазы.
  // С фазы ответа адресата после него нет, и раньше это давало ложную тревогу
  // на исправном конфиге.
  const src = source({}, [
    {
      path: "/shop/",
      waf: {
        requestInspectors: [
          { name: "counter-cards", wave: 2 },
          { name: "captcha-guard", wave: 3 },
        ],
        responseInspectors: [{ name: "counter-cards", wave: 1 }],
      },
    },
  ], decls);

  assert.deepEqual(
    actionReceiverWarnings(src, new Map([["counter-cards", ["captcha-guard"]]])),
    [],
  );
});

test("одна пара -- одна строка, сколько бы маршрутов ни было", () => {
  const src = source({}, [
    { path: "/a/", waf: { requestInspectors: [{ name: "counter-cards", wave: 0 }] } },
    { path: "/b/", waf: { requestInspectors: [{ name: "counter-cards", wave: 0 }] } },
    { path: "/c/", waf: { requestInspectors: [{ name: "counter-cards", wave: 0 }] } },
  ], decls);

  const warnings = actionReceiverWarnings(src, new Map([["counter-cards", ["captcha"]]]));

  assert.deepEqual(codes(warnings), ["action_no_receiver"]);
  assert.match(warnings[0].message, /2 more route\(s\)/);
  assert.match(warnings[0].message, /never asked after it on any route/);
});

test("доезжает хоть где-то -- сказано мягче", () => {
  const src = source({}, [
    {
      path: "/shop/",
      waf: {
        requestInspectors: [
          { name: "counter-cards", wave: 2 },
          { name: "captcha-guard", wave: 3 },
        ],
      },
    },
    { path: "/api/", waf: { requestInspectors: [{ name: "counter-cards", wave: 0 }] } },
  ], decls);

  const warnings = actionReceiverWarnings(
    src,
    new Map([["counter-cards", ["captcha-guard"]]]),
  );

  assert.deepEqual(codes(warnings), ["action_no_receiver"]);
  assert.match(warnings[0].message, /may be intended/);
});

test("маршрут с выключенным waf не проверяется", () => {
  const src = source({}, [
    {
      path: "/pages/",
      waf: { enabled: false, requestInspectors: [{ name: "counter-cards", wave: 0 }] },
    },
  ], decls);

  assert.deepEqual(actionReceiverWarnings(src, new Map([["counter-cards", ["captcha"]]])), []);
});

test("без карты адресатов проверка молчит", () => {
  const src = source({}, [
    { path: "/shop/", waf: { requestInspectors: [{ name: "counter-cards", wave: 2 }] } },
  ], decls);

  assert.deepEqual(actionReceiverWarnings(src, new Map()), []);
});
