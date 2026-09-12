/*
 * Сборка подсказки поводов. Проверяется группировка -- то, что превращает
 * строки запроса в список «повод и кто его объявил». Сам запрос покрыт
 * стендом: шесть источников в одном union all тестом с поддельным пулом
 * не проверить, а поддельный пул проверял бы текст SQL, а не базу.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { groupSenderCodes } from "./sender-codes.ts";

test("один повод -- одна запись, объявители перечислены рядом", () => {
  const codes = groupSenderCodes([
    { code: "IP_GREYLIST", inspector: "ip", profile: "default" },
    { code: "IP_GREYLIST", inspector: "action", profile: "api" },
    { code: "RATE_HOT", inspector: "counter", profile: "default" },
  ]);

  assert.deepEqual(codes, [
    {
      code: "IP_GREYLIST",
      by: [
        { inspector: "ip", profile: "default" },
        { inspector: "action", profile: "api" },
      ],
    },
    { code: "RATE_HOT", by: [{ inspector: "counter", profile: "default" }] },
  ]);
});

/*
 * Один профиль объявляет повод и в нескольких разделах сразу (счётчик -- в
 * запросе и на кадрах), и такие строки приходят запросом порознь. В списке
 * объявитель обязан остаться одной подписью.
 */
test("повторный объявитель не множится", () => {
  const codes = groupSenderCodes([
    { code: "WS_FLOOD", inspector: "counter", profile: "ws" },
    { code: "WS_FLOOD", inspector: "counter", profile: "ws" },
  ]);

  assert.deepEqual(codes, [{ code: "WS_FLOOD", by: [{ inspector: "counter", profile: "ws" }] }]);
});
