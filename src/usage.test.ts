import assert from "node:assert/strict";
import { test } from "node:test";

import type { RootState } from "./state/types.ts";
import { datasetWafUses, denyResponseUses, profileUses, usesDetail } from "./usage.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";

/*
 * Ссылки на профиль и на набор живут в waf-документах трёх уровней, поэтому
 * состояние собирается как в inspectors-http.test.ts: пространство, серверы,
 * пути и каталог, где `modsec` и `ip` -- процессы своих подсистем.
 */
interface Refs {
  space?: unknown;
  servers?: unknown[];
  locations?: unknown[];
}

function stateWith(refs: Refs = {}): RootState {
  return {
    inspectors: {
      ids: ["ins-1", "ins-2"],
      entities: {
        "ins-1": {
          id: "ins-1",
          httpSpaceId: SCOPE,
          name: "modsec",
          subject: "waf.req.modsec",
          phases: ["request"],
        },
        "ins-2": {
          id: "ins-2",
          httpSpaceId: SCOPE,
          name: "ip-ext",
          subject: "waf.req.ip",
          phases: ["request"],
        },
      },
    },
    spaces: {
      ids: [SCOPE],
      entities: {
        [SCOPE]: { id: SCOPE, name: "default", waf: refs.space ?? {} },
      },
    },
    servers: {
      ids: (refs.servers ?? []).map((_, i) => `srv-${i}`),
      entities: Object.fromEntries(
        (refs.servers ?? []).map((waf, i) => [
          `srv-${i}`,
          { id: `srv-${i}`, httpSpaceId: SCOPE, name: `web-${i}`, waf },
        ]),
      ),
    },
    locations: {
      ids: (refs.locations ?? []).map((_, i) => `loc-${i}`),
      entities: Object.fromEntries(
        (refs.locations ?? []).map((waf, i) => [
          `loc-${i}`,
          { id: `loc-${i}`, httpSpaceId: SCOPE, path: `/p${i}/`, waf },
        ]),
      ),
    },
  } as unknown as RootState;
}

test("profileUses находит profile= на всех уровнях", () => {
  const state = stateWith({
    space: { inspectors: { modsec: { profile: "strict" } } },
    locations: [{ inspectors: { modsec: { profile: "strict" } } }],
  });

  assert.deepEqual(profileUses(state, SCOPE, "modsec", "strict"), [
    { at: "space", kind: "profile", by: "modsec" },
    { at: "location /p0/", kind: "profile", by: "modsec" },
  ]);
});

test("объявление без profile= держит default", () => {
  const state = stateWith({ space: { inspectors: { modsec: {} } } });

  assert.deepEqual(profileUses(state, SCOPE, "modsec", "default"), [
    { at: "space", kind: "profile", by: "modsec" },
  ]);
  assert.deepEqual(profileUses(state, SCOPE, "modsec", "strict"), []);
});

test("второе имя через process= держит профиль своей подсистемы", () => {
  const state = stateWith({
    space: {
      inspectors: { "ip-admin": { process: "ip-ext", profile: "office" } },
    },
  });

  assert.deepEqual(profileUses(state, SCOPE, "ip", "office"), [
    { at: "space", kind: "profile", by: "ip-admin" },
  ]);
  // Та же строка чужую подсистему не держит: сервис смотрит тему процесса.
  assert.deepEqual(profileUses(state, SCOPE, "modsec", "office"), []);
});

test("объявление с неизвестным процессом профиль не держит", () => {
  const state = stateWith({
    space: { inspectors: { ghost: { process: "nope", profile: "strict" } } },
  });

  assert.deepEqual(profileUses(state, SCOPE, "modsec", "strict"), []);
});

test("datasetWafUses видит проверку, лимит и if-условия", () => {
  const state = stateWith({
    space: {
      localChecks: [
        { dataset: "blocklist", variable: "$remote_addr", action: "block" },
      ],
    },
    servers: [
      {
        localRates: [
          {
            key: "$remote_addr",
            rate: "10r/s",
            burst: 0,
            list: "blocklist",
          },
        ],
      },
    ],
    locations: [
      {
        requestInspectors: [
          {
            name: "modsec",
            conds: [{ value: "$cookie_sid", dataset: "blocklist" }],
          },
        ],
      },
    ],
  });

  assert.deepEqual(datasetWafUses(state, SCOPE, "blocklist"), [
    { at: "space", kind: "check", by: "$remote_addr" },
    { at: "server web-0", kind: "rate", by: "$remote_addr" },
    { at: "location /p0/", kind: "cond", by: "modsec" },
  ]);
  assert.deepEqual(datasetWafUses(state, SCOPE, "allowlist"), []);
});

test("denyResponseUses видит умолчание, пороги счёта и локальный слой", () => {
  const state = stateWith({
    space: { denyResponseDefault: "blocked" },
    servers: [
      {
        scoreDeny: { threshold: 5, response: "blocked" },
        responseScoreDeny: { threshold: 7, response: "blocked" },
      },
    ],
    locations: [
      {
        localChecks: [
          {
            dataset: "blocklist",
            variable: "$remote_addr",
            action: "block",
            response: "blocked",
          },
        ],
        localRates: [
          { key: "$remote_addr", rate: "10r/s", burst: 0, response: "blocked" },
        ],
      },
    ],
  });

  assert.deepEqual(denyResponseUses(state, SCOPE, "blocked"), [
    { at: "space", kind: "default" },
    { at: "server web-0", kind: "score", by: "request" },
    { at: "server web-0", kind: "score", by: "response" },
    { at: "location /p0/", kind: "check", by: "$remote_addr" },
    { at: "location /p0/", kind: "rate", by: "$remote_addr" },
  ]);
  assert.deepEqual(denyResponseUses(state, SCOPE, "too_many"), []);
});

test("usesDetail режет длинный список и считает остаток", () => {
  const uses = Array.from({ length: 7 }, (_, i) => ({
    at: `s${i}`,
    kind: "set",
  }));

  assert.equal(
    usesDetail(uses),
    "set s0, set s1, set s2, set s3, set s4 +2",
  );
  assert.equal(
    usesDetail([{ at: "space", kind: "profile", by: "modsec" }]),
    "profile modsec @ space",
  );
});
