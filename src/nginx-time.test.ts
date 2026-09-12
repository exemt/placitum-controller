import assert from "node:assert/strict";
import { test } from "node:test";

import { eventTtlS, parseNginxTimeS } from "./nginx-time.ts";

test("parseNginxTimeS: 5m, 1h, голое число", () => {
  assert.equal(parseNginxTimeS("5m"), 300);
  assert.equal(parseNginxTimeS("1h"), 3600);
  assert.equal(parseNginxTimeS("30s"), 30);
  assert.equal(parseNginxTimeS("180d"), 180 * 86400);
  assert.equal(parseNginxTimeS("300"), 300);
  assert.equal(parseNginxTimeS("foo"), undefined);
  assert.equal(parseNginxTimeS(""), undefined);
});

test("eventTtlS: своё, иначе список, иначе отказ", () => {
  assert.equal(eventTtlS(12, "5m"), 12);
  assert.equal(eventTtlS(0, "5m"), 300);
  assert.equal(eventTtlS(undefined, "5m"), 300);
  assert.equal(eventTtlS(undefined, undefined), undefined);
  assert.equal(eventTtlS(0, undefined), undefined);
});
