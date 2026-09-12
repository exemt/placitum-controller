import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inheritFromHttp,
  inheritFromHttpAndServer,
  resolveRoute,
} from "./resolve.ts";

test("resolveRoute replaces a key, empty array clears the parent", () => {
  assert.deepEqual(
    resolveRoute(
      {
        enabled: true,
        deadlineMs: 50,
        localChecks: [
          { dataset: "allow", variable: "$binary_remote_addr", action: "allow" },
        ],
      },
      { deadlineMs: 30 },
      { localChecks: [] },
    ),
    { enabled: true, deadlineMs: 30, localChecks: [] },
  );
});

test("inheritFromHttp lists waf and server-applicable nginx, skips http-only", () => {
  const rows = inheritFromHttp(
    { enabled: true, deadlineMs: 50 },
    {
      sendfile: true,
      clientMaxBodySize: "10m",
      addHeaders: [{ name: "X-Frame-Options", value: "DENY" }],
      realIpHeader: "X-Real-IP",
    },
  );

  assert.deepEqual(rows, [
    { section: "waf", key: "deadlineMs", from: "http", value: 50 },
    { section: "waf", key: "enabled", from: "http", value: true },
    { section: "nginx", key: "clientMaxBodySize", from: "http", value: "10m" },
    { section: "nginx", key: "realIpHeader", from: "http", value: "X-Real-IP" },
  ]);
});

test("inheritFromHttpAndServer lets the server win and keeps http-only location keys", () => {
  const rows = inheritFromHttpAndServer(
    {
      enabled: true,
      deadlineMs: 50,
      localChecks: [
        { dataset: "allow", variable: "$binary_remote_addr", action: "allow" },
      ],
    },
    {
      sendfile: true,
      clientMaxBodySize: "10m",
      addHeaders: [{ name: "X-Frame-Options", value: "DENY" }],
      realIpHeader: "X-Real-IP",
    },
    { deadlineMs: 30, localChecks: [] },
    { root: "/var/www", clientMaxBodySize: "2m" },
  );

  assert.deepEqual(
    rows.filter((row) => row.section === "waf"),
    [
      { section: "waf", key: "deadlineMs", from: "server", value: 30 },
      { section: "waf", key: "enabled", from: "http", value: true },
      { section: "waf", key: "localChecks", from: "server", value: [] },
    ],
  );
  assert.deepEqual(
    rows.filter((row) => row.section === "nginx"),
    [
      { section: "nginx", key: "addHeaders", from: "http", value: [
        { name: "X-Frame-Options", value: "DENY" },
      ] },
      { section: "nginx", key: "clientMaxBodySize", from: "server", value: "2m" },
      { section: "nginx", key: "realIpHeader", from: "http", value: "X-Real-IP" },
      { section: "nginx", key: "root", from: "server", value: "/var/www" },
    ],
  );
});
