/**
 * Канон блока настроек процесса: контроллер и инспекторы обязаны получить из
 * одного манифеста один hex.
 *
 * Пара к нему -- inspectors/action/internal/desired/settings_test.go: оба
 * считают один и тот же манифест и оба сверяются с одним прибитым числом.
 * Расхождение здесь не падает нигде -- оно навсегда оставляет канал в drift.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { hashActionProfiles, parseActionManifest } from "./action-manifest.ts";
import { hashAuthManifest } from "./auth-manifest.ts";
import { hashIpTree } from "./compile/ip-pack.ts";
import { hashTree } from "./compile/pack.ts";
import {
  isLogLevel,
  LOG_LEVELS,
  parseInspectorSettings,
} from "./inspector-settings.ts";

const PROFILES = {
  default: { files: [{ name: "profile.yaml", text: "mode: off\n" }] },
};

/* sha256("default\0profile.yaml\0mode: off\n\0settings\0log_level\0warn\0") */
const WITH_SETTINGS =
  "sha256:b3dcfa221226d021d1fa1e7bf04536ebc4e4795adb2828b7d8c7a0e3e8118746";
/* sha256("default\0profile.yaml\0mode: off\n\0") */
const WITHOUT_SETTINGS =
  "sha256:68835a28c97dfeb4b3a193e741d79d6d0f9bfb10027ac486f40668b632073340";

test("канон с блоком настроек совпадает с прибитым числом", () => {
  assert.equal(hashActionProfiles(PROFILES, { log_level: "warn" }), WITH_SETTINGS);
});

test("без блока канон прежний: старое поколение сходится со своим хешем", () => {
  assert.equal(hashActionProfiles(PROFILES), WITHOUT_SETTINGS);
  assert.equal(hashActionProfiles(PROFILES, undefined), WITHOUT_SETTINGS);
});

test("уровень двигает хеш у каждого канона", () => {
  const info = { log_level: "info" as const };
  const warn = { log_level: "warn" as const };

  assert.notEqual(hashActionProfiles(PROFILES, info), hashActionProfiles(PROFILES, warn));
  assert.notEqual(hashAuthManifest({}, PROFILES, info), hashAuthManifest({}, PROFILES, warn));
  assert.notEqual(
    hashTree({}, { default: "sha256:x" }, {}, {}, info),
    hashTree({}, { default: "sha256:x" }, {}, {}, warn),
  );
  assert.notEqual(
    hashIpTree({}, {}, {}, {}, {}, { default: { rules: [] } }, info),
    hashIpTree({}, {}, {}, {}, {}, { default: { rules: [] } }, warn),
  );
});

test("словарь -- error_log nginx без emerg, в его порядке", () => {
  assert.deepEqual([...LOG_LEVELS], [
    "debug", "info", "notice", "warn", "error", "crit", "alert",
  ]);
  assert.ok(!isLogLevel("emerg"));
  assert.ok(!isLogLevel("warning"));
});

test("разбор блока: нет -- норма, мусор -- отказ", () => {
  assert.equal(parseInspectorSettings(undefined), undefined);
  assert.deepEqual(parseInspectorSettings({ log_level: "crit" }), { log_level: "crit" });
  assert.equal(parseInspectorSettings({ log_level: "emerg" }), null);
  assert.equal(parseInspectorSettings("warn"), null);

  const manifest = {
    v: 1,
    rev: 3,
    config_hash: WITH_SETTINGS,
    profiles: PROFILES,
    settings: { log_level: "warn" },
  };
  assert.deepEqual(parseActionManifest(manifest)?.settings, { log_level: "warn" });
  assert.equal(parseActionManifest({ ...manifest, settings: { log_level: "loud" } }), null);
  assert.equal(parseActionManifest({ ...manifest, settings: undefined })?.settings, undefined);
});
