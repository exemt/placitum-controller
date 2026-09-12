/*
 * Внешние провайдеры источника входа: jwt и app. Правила -- те же, что в
 * Validate() инспектора; здесь проверяется, что контроллер отказывает в
 * форме там же, где инспектор отверг бы поколение, и печатает source.yaml в
 * форме его загрузчика.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { DocError } from "./auth-doc-util.ts";
import {
  normalizeSourceDoc,
  renderSourceYaml,
  validateSourceDoc,
} from "./auth-source-doc.ts";

const PEM = "-----BEGIN PUBLIC KEY-----\nMFkw\n-----END PUBLIC KEY-----\n";

function jwtDoc(extra: Record<string, unknown> = {}, verify: Record<string, unknown> = {}) {
  return {
    provider: "jwt",
    providers: {
      jwt: {
        cookie: "access_token",
        verify: { alg: "HS256", secret_env: "WAF_JWT_SECRET", ...verify },
        ...extra,
      },
    },
  };
}

function appDoc(extra: Record<string, unknown> = {}, learn: Record<string, unknown> = {}) {
  return {
    login: { uri: "/login" },
    provider: "app",
    list: { sessions: "shop_sessions" },
    providers: {
      app: {
        cookie: "JSESSIONID",
        learn: {
          login: { uri: "/api/login" },
          user: { from: "body.form", field: "username" },
          ...learn,
        },
        ...extra,
      },
    },
  };
}

function rejects(raw: unknown, pattern: RegExp): void {
  assert.throws(() => validateSourceDoc(normalizeSourceDoc(raw)), (err: unknown) => {
    assert.ok(err instanceof DocError, `expected DocError, got ${String(err)}`);
    assert.match(err.message, pattern);

    return true;
  });
}

test("jwt: форма не нужна, claims получают имена RFC 7519", () => {
  const doc = normalizeSourceDoc(jwtDoc());

  validateSourceDoc(doc);

  assert.equal(doc.login.uri, "");
  assert.deepEqual(doc.providers.jwt?.claims, {
    user: "sub",
    session: "sid",
    groups: "",
    issued: "iat",
    expiry: "exp",
  });
});

test("jwt: отказы формы", () => {
  rejects(jwtDoc({ header: "authorization" }), /exactly one of cookie or header/);
  rejects(jwtDoc({ cookie: "" }), /exactly one of cookie or header/);
  rejects(jwtDoc({}, { alg: "HS256", secret_env: "" }), /needs secret_env/);
  rejects(jwtDoc({}, { alg: "HS256", key: PEM }), /HMAC secret is not stored/);
  rejects(jwtDoc({}, { alg: "RS256", secret_env: "" }), /needs a public key/);
  rejects(jwtDoc({}, { alg: "RS256", key: "not pem", secret_env: "" }), /must be PEM/);
  rejects(jwtDoc({}, { alg: "none" }), /does not take a key/);
  rejects(jwtDoc({}, { alg: "PS256", secret_env: "S" }), /unsupported/);
  rejects({ ...jwtDoc(), login: { uri: "login" } }, /absolute path/);
});

test("jwt: source.yaml в форме загрузчика", () => {
  const doc = normalizeSourceDoc(
    jwtDoc(
      { cookie: "", header: "authorization", prefix: "Bearer", claims: { groups: "roles" } },
      { alg: "RS256", secret_env: "", key: PEM, issuer: "idp", leeway_s: 30 },
    ),
  );

  validateSourceDoc(doc);

  const yaml = renderSourceYaml("idp", doc);

  assert.match(yaml, /provider: jwt/);
  assert.match(yaml, /  jwt:\n {4}header: "authorization"\n {4}prefix: "Bearer"/);
  assert.match(yaml, /verify:\n {6}alg: RS256\n {6}key_file: jwt.key\n {6}issuer: "idp"\n {6}leeway: "30s"/);
  assert.match(yaml, /claims:\n {6}user: "sub"\n {6}session: "sid"\n {6}groups: "roles"/);
  assert.doesNotMatch(yaml, /secret_env/);
  assert.doesNotMatch(yaml, /BEGIN PUBLIC KEY/);
});

test("app: умолчания и печать", () => {
  const doc = normalizeSourceDoc(appDoc({}, { logout: { uri: "/api/logout", method: "post" } }));

  validateSourceDoc(doc);

  const learn = doc.providers.app?.learn;
  assert.equal(learn?.login.method, "POST");
  assert.equal(learn?.logout.method, "POST");
  assert.deepEqual(learn?.success.status, [200, 302, 303]);
  assert.equal(learn?.success.cookieNew, true);

  const yaml = renderSourceYaml("shop", doc);

  assert.match(yaml, /provider: app/);
  assert.match(yaml, /  app:\n {4}cookie: "JSESSIONID"\n {4}learn:\n {6}login: \{ uri: "\/api\/login", method: POST \}/);
  assert.match(yaml, /logout: \{ uri: "\/api\/logout", method: POST \}/);
  assert.match(yaml, /status: \[200, 302, 303\]\n {8}cookie_new: true/);
  assert.match(yaml, /user: \{ from: body.form, field: "username" \}/);
  assert.match(yaml, /list:\n {2}sessions: "shop_sessions"/);
});

test("app: отказы формы", () => {
  rejects({ ...appDoc(), list: { sessions: "" } }, /needs list.sessions/);
  rejects(appDoc({ cookie: "" }), /providers.app.cookie is empty/);
  rejects(appDoc({ cookie: "waf_sess" }), /must differ from the gate cookies/);
  rejects(appDoc({}, { login: { uri: "" } }), /learn.login.uri is empty/);
  rejects(appDoc({}, { login: { uri: "/api/login?x=1" } }), /absolute path without query/);
  rejects(appDoc({}, { user: { from: "cookie", field: "u" } }), /body.form, body.json, args or header/);
  rejects(appDoc({}, { user: { from: "args", field: "" } }), /user.field is empty/);
  rejects(appDoc({}, { success: { status: [700] } }), /not an HTTP status/);
  rejects(appDoc({}, { success: { json: { equals: "true" } } }), /json.path is empty/);
});
