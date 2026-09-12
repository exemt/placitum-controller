import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addressSearchSql,
  escapeLike,
  parseAddressQuery,
} from "./address-query.ts";

test("parseAddressQuery treats a host as containment", () => {
  assert.deepEqual(parseAddressQuery("192.168.18.21"), {
    kind: "host",
    value: "192.168.18.21",
  });
  assert.deepEqual(parseAddressQuery("  2001:db8::1  "), {
    kind: "host",
    value: "2001:db8::1",
  });
});

test("parseAddressQuery treats a masked prefix as overlap", () => {
  assert.deepEqual(parseAddressQuery("120.0.0.0/12"), {
    kind: "net",
    value: "120.0.0.0/12",
  });
  assert.deepEqual(parseAddressQuery("192.168.18.21/32"), {
    kind: "net",
    value: "192.168.18.21/32",
  });
  assert.deepEqual(parseAddressQuery("2001:db8::/32"), {
    kind: "net",
    value: "2001:db8::/32",
  });
});

test("parseAddressQuery falls back to a right-anchored text prefix", () => {
  assert.deepEqual(parseAddressQuery(""), { kind: "none" });
  assert.deepEqual(parseAddressQuery("   "), { kind: "none" });
  assert.deepEqual(parseAddressQuery("192.16"), { kind: "text", value: "192.16" });
  assert.deepEqual(parseAddressQuery("10.0.0.1/33"), {
    kind: "text",
    value: "10.0.0.1/33",
  });
});

test("addressSearchSql binds inet operators and escaped LIKE", () => {
  assert.deepEqual(addressSearchSql({ kind: "none" }, "address", 2), {
    sql: "",
    values: [],
  });
  assert.deepEqual(
    addressSearchSql({ kind: "host", value: "10.0.0.1" }, "address", 2),
    { sql: "and address::cidr >>= $2::inet", values: ["10.0.0.1"] },
  );
  assert.deepEqual(
    addressSearchSql({ kind: "net", value: "10.0.0.0/8" }, "address", 2),
    { sql: "and address::cidr && $2::inet", values: ["10.0.0.0/8"] },
  );
  assert.deepEqual(
    addressSearchSql({ kind: "text", value: "192.16" }, "address", 2),
    { sql: "and address like $2 escape '\\'", values: ["192.16%"] },
  );
  assert.equal(escapeLike("10_%"), "10\\_\\%");
});
