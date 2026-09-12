import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNginx, parseWaf, parseWafHttp } from "./space-settings-parse.ts";

test("parseWaf: inspectors graph with after and timeout", () => {
  const parsed = parseWaf({
    inspectors: {
      ip: { timeoutMs: 20, needs: "none" },
      modsec: {
        timeoutMs: 500,
        needs: "headers,args,body",
        body: "full",
        after: ["ip"],
        allowHeaders: ["x-request-id"],
      },
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.deepEqual(parsed.value.inspectors, {
    ip: { timeoutMs: 20, needs: "none" },
    modsec: {
      timeoutMs: 500,
      needs: "headers,args,body",
      body: "full",
      after: ["ip"],
      allowHeaders: ["x-request-id"],
    },
  });
});

test("parseWaf: profile on decl, wave/timeout/phase on ref", () => {
  const parsed = parseWaf({
    inspectors: { modsec: { profile: "strict", timeoutMs: 500, after: ["ip"] } },
    requestInspectors: [
      // weight старых документов не переносится: множителя у модуля нет.
      { name: "modsec", wave: 2, timeoutMs: 100, weight: 0, phase: "request" },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.inspectors?.modsec?.profile, "strict");
  assert.deepEqual(parsed.value.requestInspectors, [
    { name: "modsec", wave: 2, timeoutMs: 100, phase: "request" },
  ]);
});

test("parseWaf: mode vote on ref", () => {
  const parsed = parseWaf({
    requestInspectors: [{ name: "modsec", wave: 1, mode: "vote" }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.deepEqual(parsed.value.requestInspectors, [{ name: "modsec", wave: 1, mode: "vote" }]);
});

test("parseWaf: rejects wave above 64", () => {
  assert.deepEqual(parseWaf({ requestInspectors: [{ name: "ip", wave: 65 }] }), {
    ok: false,
    error: "invalid_inspector_wave",
  });
});

test("parseWaf: resume on response ref, rejected on request", () => {
  const parsed = parseWaf({
    responseInspectors: [{ name: "dlp", wave: 0, resume: "prefer" }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.deepEqual(parsed.value.responseInspectors, [
    { name: "dlp", wave: 0, resume: "prefer" },
  ]);
  // Фаза запроса продолжение выдаёт, а не потребляет: `resume=` там -- nginx -t.
  assert.deepEqual(
    parseWaf({ requestInspectors: [{ name: "ip", wave: 0, resume: "prefer" }] }),
    { ok: false, error: "resume_on_request" },
  );
  // Кадры инспектируются сами по себе, транзакцию рукопожатия не продолжают.
  assert.deepEqual(
    parseWaf({ frameInspectors: [{ name: "dlp", wave: 0, resume: "prefer" }] }),
    { ok: false, error: "resume_on_frame" },
  );
  assert.deepEqual(
    parseWaf({ responseInspectors: [{ name: "dlp", resume: "later" }] }),
    { ok: false, error: "invalid_inspector_resume" },
  );
});

test("parseWaf: keep on request ref, rejected on response", () => {
  const parsed = parseWaf({
    requestInspectors: [{ name: "modsec", wave: 0, keep: true }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.deepEqual(parsed.value.requestInspectors, [{ name: "modsec", wave: 0, keep: true }]);
  // Зеркало resume=: держать состояние просят ту фазу, что его выдаёт.
  assert.deepEqual(
    parseWaf({ responseInspectors: [{ name: "modsec", wave: 0, keep: true }] }),
    { ok: false, error: "keep_on_consumer" },
  );
  assert.deepEqual(
    parseWaf({ requestInspectors: [{ name: "modsec", keep: "on" }] }),
    { ok: false, error: "invalid_inspector_keep" },
  );
});

test("parseWaf: mode off на любой фазе, control снят и не хранится", () => {
  const parsed = parseWaf({
    frameInspectors: [{ name: "rewrite", wave: 1, mode: "off", control: ["counter", "ip"] }],
    responseInspectors: [{ name: "dlp", wave: 0 }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  // Ключ старых документов молча выбрасывается: гранта больше нет, и
  // сохранять его значило бы печатать директиву, которой модуль не знает.
  assert.deepEqual(parsed.value.frameInspectors, [
    { name: "rewrite", wave: 1, mode: "off" },
  ]);
  assert.deepEqual(parsed.value.responseInspectors, [{ name: "dlp", wave: 0 }]);
  assert.deepEqual(
    parseWaf({ requestInspectors: [{ name: "modsec", mode: "asked" }] }),
    { ok: false, error: "invalid_inspector_mode" },
  );
});

test("parseWaf: responseHold gate|monitor", () => {
  const parsed = parseWaf({ responseHold: "monitor" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.responseHold, "monitor");
  assert.deepEqual(parseWaf({ responseHold: "release" }), {
    ok: false,
    error: "invalid_response_hold",
  });
});

test("parseWaf: empty inspector decl is a valid graph node", () => {
  const parsed = parseWaf({ inspectors: { json: {} } });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.deepEqual(parsed.value.inspectors, { json: {} });
});

test("parseWaf: no inspectors key means inherit, not empty graph", () => {
  const parsed = parseWaf({ deadlineMs: 200 });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.inspectors, undefined);
});

test("parseWaf: process на объявлении читается и проверяется как имя", () => {
  const parsed = parseWaf({
    inspectors: { "modsec-strict": { process: "modsec", profile: "strict" } },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.deepEqual(parsed.value.inspectors, {
    "modsec-strict": { process: "modsec", profile: "strict" },
  });

  assert.deepEqual(parseWaf({ inspectors: { x: { process: "1bad" } } }), {
    ok: false,
    error: "invalid_inspector_process",
  });
});

test("parseWaf: rejects bad inspector name and body", () => {
  assert.deepEqual(parseWaf({ inspectors: { "1ip": {} } }), {
    ok: false,
    error: "invalid_inspector_name",
  });
  assert.deepEqual(parseWaf({ inspectors: { ip: { body: "all" } } }), {
    ok: false,
    error: "invalid_inspector_body",
  });
  assert.deepEqual(parseWaf({ inspectors: { ip: { breaker: { threshold: 5 } } } }), {
    ok: false,
    error: "invalid_inspector_breaker_threshold",
  });
  assert.deepEqual(parseWaf({ inspectors: [] }), {
    ok: false,
    error: "invalid_inspectors",
  });
});

/*
  Каталог печатается в конфиг как есть, поэтому проверяется на входе: иначе
  относительный путь дал бы каталог рядом с prefix nginx, а точка с запятой --
  чужую директиву в http {}.
*/
test("parseNginx: client_body_temp_path -- только абсолютный путь", () => {
  const good = parseNginx({ clientBodyTempPath: "/dev/shm/client_temp" });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.value.clientBodyTempPath, "/dev/shm/client_temp");
  }

  for (const bad of ["client_temp", "/tmp/a; server_tokens on", "/tmp/a b"]) {
    assert.deepEqual(parseNginx({ clientBodyTempPath: bad }), {
      ok: false,
      error: "invalid_client_body_temp_path",
    });
  }
});

test("action_max: голое число из jsonb стенда -- тот же размер, что строка", () => {
  assert.deepEqual(parseWaf({ actionMax: 192 }), { ok: true, value: { actionMax: "192" } });
  assert.deepEqual(parseWaf({ actionMax: "8k" }), { ok: true, value: { actionMax: "8k" } });
  assert.equal(parseWaf({ actionMax: -1 }).ok, false);
  assert.equal(parseWaf({ actionMax: true }).ok, false);
});

test("parseWaf: vars объявления -- имена полей или all, без повторов", () => {
  assert.deepEqual(parseWaf({ inspectors: { ip: { vars: ["user_agent", "all", "user_agent"] } } }), {
    ok: true,
    value: { inspectors: { ip: { vars: ["user_agent", "all"] } } },
  });
  assert.deepEqual(parseWaf({ inspectors: { ip: { vars: [] } } }), {
    ok: true,
    value: { inspectors: { ip: {} } },
  });
  assert.deepEqual(parseWaf({ inspectors: { ip: { vars: ["user agent"] } } }), {
    ok: false,
    error: "invalid_inspector_vars",
  });
  assert.deepEqual(parseWaf({ inspectors: { ip: { vars: "all" } } }), {
    ok: false,
    error: "invalid_inspector_vars",
  });
});

test("parseWafHttp: waf_var не берёт имя стандартного поля и мусор в имени", () => {
  assert.deepEqual(
    parseWafHttp({ vars: [{ name: "user_agent", value: "$http_user_agent" }] }),
    { ok: false, error: "reserved_waf_var" },
  );
  assert.deepEqual(parseWafHttp({ vars: [{ name: "$ja3", value: "$http_x_ja3" }] }), {
    ok: false,
    error: "invalid_waf_var_name",
  });
  assert.deepEqual(parseWafHttp({ vars: [{ name: "ja3", value: "$http_x_ja3" }] }), {
    ok: true,
    value: { vars: [{ name: "ja3", value: "$http_x_ja3" }] },
  });
});
