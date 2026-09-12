import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseDatasetEntries,
  parseDatasetEntry,
  parseUploadLines,
} from "./dataset-entry.ts";
import { nginxDatasetType } from "./model/http-space.ts";

test("string keeps text and rejects empty or NUL", () => {
  assert.equal(parseDatasetEntry("string", "  bot/1.0  "), "bot/1.0");
  assert.equal(parseDatasetEntry("string", ""), null);
  assert.equal(parseDatasetEntry("string", "a\0b"), null);
});

test("numeric accepts integers and rejects the rest", () => {
  assert.equal(parseDatasetEntry("numeric", "42"), "42");
  assert.equal(parseDatasetEntry("numeric", "-7"), "-7");
  assert.equal(parseDatasetEntry("numeric", "0"), "0");
  assert.equal(parseDatasetEntry("numeric", "01"), null);
  assert.equal(parseDatasetEntry("numeric", "4.2"), null);
  assert.equal(parseDatasetEntry("numeric", "1e2"), null);
});

test("ipv4 stores CIDR and fills /32", () => {
  assert.equal(parseDatasetEntry("ipv4", "203.0.113.1"), "203.0.113.1/32");
  assert.equal(parseDatasetEntry("ipv4", "203.0.113.0/24"), "203.0.113.0/24");
  assert.equal(parseDatasetEntry("ipv4", "203.0.113.0/33"), null);
  assert.equal(parseDatasetEntry("ipv4", "2001:db8::1"), null);
  assert.equal(parseDatasetEntry("ipv4", "not-an-ip"), null);
});

test("ip accepts v4 and v6 with default masks", () => {
  assert.equal(parseDatasetEntry("ip", "10.0.0.1"), "10.0.0.1/32");
  assert.equal(parseDatasetEntry("ip", "2001:db8::1"), "2001:db8::1/128");
  assert.equal(parseDatasetEntry("ip", "2001:db8::/32"), "2001:db8::/32");
  assert.equal(parseDatasetEntry("ip", "2001:db8::/129"), null);
});

test("parseDatasetEntries reports invalid and dedups", () => {
  const bad = parseDatasetEntries("ipv4", ["10.0.0.1", "zz", "10.0.0.1/32"]);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.deepEqual(bad.invalid, ["zz"]);
  }

  const ok = parseDatasetEntries("ipv4", ["10.0.0.1", "10.0.0.1/32", "10.1.0.0/16"]);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.entries, ["10.0.0.1/32", "10.1.0.0/16"]);
  }
});

test("parseUploadLines skips blanks and comments", () => {
  assert.deepEqual(
    parseUploadLines("# header\n\n10.0.0.1\n  # note\n  10.0.0.2/32  \n"),
    ["10.0.0.1", "10.0.0.2/32"],
  );
});

test("nginxDatasetType maps catalog types to the directive", () => {
  assert.equal(nginxDatasetType("ipv4"), "cidr");
  assert.equal(nginxDatasetType("ip"), "cidr");
  assert.equal(nginxDatasetType("string"), "string");
  assert.equal(nginxDatasetType("numeric"), "string");
});
