import assert from "node:assert/strict";
import { test } from "node:test";

import { jsonAgentSettings, parseAgentSettingsBody } from "./agent-settings-parse.ts";
import { agentConfWire, buildAgentConf, hashAgentConf } from "./compile/agent-conf.ts";

test("parseAgentSettingsBody: полный документ проходит и нормализуется", () => {
  const parsed = parseAgentSettingsBody({
    s3: {
      endpoint: "http://minio:9000",
      region: "us-east-1",
      buckets: { headers: "waf-headers", args: "waf-args", body: "waf-bodies" },
    },
    archive: {
      workers: 4,
      queue: 1024,
      timeout_ms: 5000,
      batch: {
        headers: { size: 32, timeout_ms: 50 },
        body: { size: 8, timeout_ms: 100 },
      },
    },
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(parsed.value, {
    s3: {
      endpoint: "http://minio:9000",
      region: "us-east-1",
      buckets: { headers: "waf-headers", args: "waf-args", body: "waf-bodies" },
    },
    archive: {
      workers: 4,
      queue: 1024,
      timeoutMs: 5000,
      batch: {
        headers: { size: 32, timeoutMs: 50 },
        body: { size: 8, timeoutMs: 100 },
      },
    },
  });
});

test("parseAgentSettingsBody: пустой документ -- это не ошибка", () => {
  const parsed = parseAgentSettingsBody({});
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, {});
});

test("parseAgentSettingsBody: эндпоинт без бакетов отвергается", () => {
  // У агента такая пара валит Finish() ("no WAF_RETAIN_BUCKET_* is set"), и
  // настройка не применяется целиком -- поймать это в форме дешевле.
  const parsed = parseAgentSettingsBody({
    s3: { endpoint: "http://minio:9000" },
  });
  assert.deepEqual(parsed, { ok: false, error: "buckets_required" });
});

test("parseAgentSettingsBody: бакеты без эндпоинта -- допустимый черновик", () => {
  const parsed = parseAgentSettingsBody({
    s3: { buckets: { body: "waf-bodies" } },
  });
  assert.equal(parsed.ok, true);
});

test("parseAgentSettingsBody: адрес и имена проверяются", () => {
  assert.deepEqual(
    parseAgentSettingsBody({ s3: { endpoint: "minio:9000", buckets: { body: "b" } } }),
    { ok: false, error: "invalid_endpoint" },
  );
  assert.deepEqual(
    parseAgentSettingsBody({
      s3: { endpoint: "http://minio:9000", buckets: { body: "WAF-Bodies" } },
    }),
    { ok: false, error: "invalid_bucket_body" },
  );
  assert.deepEqual(
    parseAgentSettingsBody({
      s3: { endpoint: "http://minio:9000", buckets: { body: "waf..bodies" } },
    }),
    { ok: false, error: "invalid_bucket_body" },
  );
});

test("parseAgentSettingsBody: пределы темпа выгрузки", () => {
  assert.deepEqual(parseAgentSettingsBody({ archive: { workers: 0 } }), {
    ok: false,
    error: "invalid_workers",
  });
  assert.deepEqual(parseAgentSettingsBody({ archive: { workers: 65 } }), {
    ok: false,
    error: "invalid_workers",
  });
  assert.deepEqual(parseAgentSettingsBody({ archive: { timeout_ms: 10 } }), {
    ok: false,
    error: "invalid_timeout",
  });
  assert.deepEqual(
    parseAgentSettingsBody({ archive: { batch: { body: { size: 0 } } } }),
    { ok: false, error: "invalid_batch_body_size" },
  );
});

test("jsonAgentSettings: ответ читается тем же parse", () => {
  const parsed = parseAgentSettingsBody({
    s3: { endpoint: "https://s3.local", buckets: { headers: "waf-headers" } },
    archive: { batch: { headers: { timeout_ms: 0 } } },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const again = parseAgentSettingsBody(jsonAgentSettings(parsed.value));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.deepEqual(again.value, parsed.value);
});

test("hashAgentConf: порядок ключей на входе не меняет хеш", () => {
  const a = parseAgentSettingsBody({
    s3: { region: "us-east-1", endpoint: "http://minio:9000", buckets: { body: "waf-bodies" } },
    archive: { queue: 1024, workers: 4 },
  });
  const b = parseAgentSettingsBody({
    archive: { workers: 4, queue: 1024 },
    s3: { buckets: { body: "waf-bodies" }, endpoint: "http://minio:9000", region: "us-east-1" },
  });
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(hashAgentConf(a.value), hashAgentConf(b.value));
});

test("buildAgentConf: реквизитов в документе нет ни при каких условиях", () => {
  const parsed = parseAgentSettingsBody({
    s3: {
      endpoint: "http://minio:9000",
      buckets: { body: "waf-bodies" },
      access: "waf",
      secret: "wafwafwaf",
      credentials: "/run/secrets/waf_s3_creds",
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const wire = JSON.stringify(buildAgentConf(parsed.value, 1));
  assert.equal(wire.includes("wafwafwaf"), false);
  assert.equal(wire.includes("credentials"), false);
  assert.equal(wire.includes("access"), false);
  assert.deepEqual(agentConfWire(parsed.value).s3, {
    endpoint: "http://minio:9000",
    buckets: { body: "waf-bodies" },
  });
});
