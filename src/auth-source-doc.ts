import {
  bool,
  duration,
  fail,
  isBcrypt,
  isUuid,
  list,
  num,
  obj,
  q,
  seconds,
  seq,
  storeRef,
  str,
} from "./auth-doc-util.ts";
import {
  AUTH_APP_FIELD_SOURCES,
  AUTH_EXTERNAL_PROVIDERS,
  AUTH_JWT_ALGS,
  type AuthAppFieldSource,
  type AuthAppProvider,
  type AuthAppRoute,
  type AuthCodeProvider,
  type AuthJwtAlg,
  type AuthJwtProvider,
  type AuthLdapProvider,
  type AuthLdapSearch,
  type AuthNtlmProvider,
  type AuthProviderKind,
  type AuthSourceDoc,
} from "./model/auth-source.ts";

const PROVIDERS = new Set<AuthProviderKind>(["local", "code", "ldap", "ntlm", "jwt", "app"]);
const JWT_ALGS = new Set<string>(AUTH_JWT_ALGS);
const APP_FIELD_SOURCES = new Set<string>(AUTH_APP_FIELD_SOURCES);
const BINDS = new Set(["subnet", "ua"]);
const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const HOUR = 3600;

function searchOf(raw: unknown, path: string): AuthLdapSearch {
  const s = obj(raw, path);

  return {
    base: str(s.base, `${path}.base`),
    filter: str(s.filter, `${path}.filter`),
    bindDn: str(s.bind_dn ?? s.bindDn, `${path}.bind_dn`),
    passwordEnv: str(s.password_env ?? s.passwordEnv, `${path}.password_env`),
    passwordStore: storeRef(
      s.password_store ?? s.passwordStore,
      `${path}.password_store`,
    ),
  };
}

function tlsOf(raw: unknown, path: string) {
  const t = obj(raw, path);

  return {
    caFile: str(t.ca_file ?? t.caFile, `${path}.ca_file`),
    insecureSkipVerify: bool(
      t.insecure_skip_verify ?? t.insecureSkipVerify,
      `${path}.insecure_skip_verify`,
      false,
    ),
  };
}

function codeOf(raw: unknown): AuthCodeProvider {
  const c = obj(raw, "providers.code");

  return {
    kind: str(c.kind, "providers.code.kind", "totp") as "totp" | "static",
    digits: num(c.digits, "providers.code.digits", 6),
    periodS: seconds(c.period_s ?? c.periodS, "providers.code.period_s", 30),
    skew: num(c.skew, "providers.code.skew", 1),
    codes: list(c.codes, "providers.code.codes"),
    users: str(c.users, "providers.code.users"),
  };
}

function ldapOf(raw: unknown): AuthLdapProvider {
  const l = obj(raw, "providers.ldap");

  return {
    url: str(l.url, "providers.ldap.url"),
    startTls: bool(l.start_tls ?? l.startTls, "providers.ldap.start_tls", false),
    bind: str(l.bind, "providers.ldap.bind", "upn") as AuthLdapProvider["bind"],
    upnSuffix: str(l.upn_suffix ?? l.upnSuffix, "providers.ldap.upn_suffix"),
    dnTemplate: str(l.dn_template ?? l.dnTemplate, "providers.ldap.dn_template"),
    timeoutS: seconds(l.timeout_s ?? l.timeoutS, "providers.ldap.timeout_s", 3),
    groups: list(l.groups, "providers.ldap.groups"),
    search: searchOf(l.search, "providers.ldap.search"),
    tls: tlsOf(l.tls, "providers.ldap.tls"),
  };
}

function ntlmOf(raw: unknown): AuthNtlmProvider {
  const n = obj(raw, "providers.ntlm");

  return {
    url: str(n.url, "providers.ntlm.url"),
    domain: str(n.domain, "providers.ntlm.domain"),
    timeoutS: seconds(n.timeout_s ?? n.timeoutS, "providers.ntlm.timeout_s", 3),
    startTls: bool(n.start_tls ?? n.startTls, "providers.ntlm.start_tls", false),
    groups: list(n.groups, "providers.ntlm.groups"),
    search: searchOf(n.search, "providers.ntlm.search"),
    tls: tlsOf(n.tls, "providers.ntlm.tls"),
  };
}

function jwtOf(raw: unknown): AuthJwtProvider {
  const j = obj(raw, "providers.jwt");
  const verify = obj(j.verify, "providers.jwt.verify");
  const claims = obj(j.claims, "providers.jwt.claims");

  return {
    cookie: str(j.cookie, "providers.jwt.cookie"),
    header: str(j.header, "providers.jwt.header"),
    prefix: str(j.prefix, "providers.jwt.prefix"),
    verify: {
      alg: str(verify.alg, "providers.jwt.verify.alg", "none") as AuthJwtAlg,
      key: str(verify.key, "providers.jwt.verify.key"),
      secretEnv: str(verify.secret_env ?? verify.secretEnv, "providers.jwt.verify.secret_env"),
      issuer: str(verify.issuer, "providers.jwt.verify.issuer"),
      audience: str(verify.audience, "providers.jwt.verify.audience"),
      leewayS: seconds(verify.leeway_s ?? verify.leewayS, "providers.jwt.verify.leeway_s", 0),
    },
    claims: {
      user: str(claims.user, "providers.jwt.claims.user", "sub"),
      session: str(claims.session, "providers.jwt.claims.session", "sid"),
      groups: str(claims.groups, "providers.jwt.claims.groups"),
      issued: str(claims.issued, "providers.jwt.claims.issued", "iat"),
      expiry: str(claims.expiry, "providers.jwt.claims.expiry", "exp"),
    },
  };
}

function routeOf(raw: unknown, path: string): AuthAppRoute {
  const r = obj(raw, path);

  return {
    uri: str(r.uri, `${path}.uri`),
    method: str(r.method, `${path}.method`, "POST").toUpperCase(),
  };
}

function appOf(raw: unknown): AuthAppProvider {
  const a = obj(raw, "providers.app");
  const learn = obj(a.learn, "providers.app.learn");
  const success = obj(learn.success, "providers.app.learn.success");
  const user = obj(learn.user, "providers.app.learn.user");

  const status = Array.isArray(success.status)
    ? success.status.map((code) => num(code, "providers.app.learn.success.status", 0))
    : [];

  const json =
    success.json === undefined || success.json === null
      ? null
      : {
          path: str(obj(success.json, "providers.app.learn.success.json").path,
            "providers.app.learn.success.json.path"),
          equals: str(obj(success.json, "providers.app.learn.success.json").equals,
            "providers.app.learn.success.json.equals"),
        };

  return {
    cookie: str(a.cookie, "providers.app.cookie"),
    learn: {
      login: routeOf(learn.login, "providers.app.learn.login"),
      logout: routeOf(learn.logout, "providers.app.learn.logout"),
      success: {
        status: status.length === 0 ? [200, 302, 303] : status,
        cookieNew: bool(success.cookie_new ?? success.cookieNew,
          "providers.app.learn.success.cookie_new", true),
        json,
      },
      user: {
        from: str(user.from, "providers.app.learn.user.from") as AuthAppFieldSource,
        field: str(user.field, "providers.app.learn.user.field"),
      },
    },
  };
}

export function normalizeSourceDoc(raw: unknown): AuthSourceDoc {
  const d = obj(raw, "doc");

  const login = obj(d.login, "login");
  const session = obj(d.session, "session");
  const subnet = obj(session.subnet, "session.subnet");
  const ticket = obj(d.ticket, "ticket");
  const listCfg = obj(d.list, "list");
  const upstream = obj(d.upstream, "upstream");
  const providers = obj(d.providers, "providers");
  const lockout = obj(d.lockout, "lockout");
  const roster = obj(d.roster, "roster");
  const identity = obj(d.identity, "identity");

  const provider = str(d.provider, "provider");

  if (provider !== "" && !PROVIDERS.has(provider as AuthProviderKind)) {
    fail(`provider: unknown ${JSON.stringify(provider)}`);
  }

  const code = providers.code === undefined || providers.code === null
    ? null
    : codeOf(providers.code);

  const ldap = providers.ldap === undefined || providers.ldap === null
    ? null
    : ldapOf(providers.ldap);

  const ntlm = providers.ntlm === undefined || providers.ntlm === null
    ? null
    : ntlmOf(providers.ntlm);

  const local = providers.local === undefined || providers.local === null
    ? null
    : { users: str(obj(providers.local, "providers.local").users, "providers.local.users") };

  const jwt = providers.jwt === undefined || providers.jwt === null
    ? null
    : jwtOf(providers.jwt);

  const app = providers.app === undefined || providers.app === null
    ? null
    : appOf(providers.app);

  return {
    login: {
      uri: str(login.uri, "login.uri"),
      title: str(login.title, "login.title"),
      note: str(login.note, "login.note"),
      page: str(login.page, "login.page"),
    },
    session: {
      cookie: str(session.cookie, "session.cookie"),
      ttlS: seconds(session.ttl_s ?? session.ttlS, "session.ttl_s", 8 * HOUR),
      renewAfterS: seconds(
        session.renew_after_s ?? session.renewAfterS,
        "session.renew_after_s",
        0,
      ),
      bind: list(session.bind, "session.bind", ["subnet", "ua"]),
      subnet: {
        v4: num(subnet.v4, "session.subnet.v4", 24),
        v6: num(subnet.v6, "session.subnet.v6", 64),
      },
    },
    ticket: {
      cookie: str(ticket.cookie, "ticket.cookie"),
      ttlS: seconds(ticket.ttl_s ?? ticket.ttlS, "ticket.ttl_s", 600),
    },
    list: {
      sessions: str(listCfg.sessions, "list.sessions"),
      cookie: str(listCfg.cookie, "list.cookie", "waf_sess"),
      ttlS: seconds(listCfg.ttl_s ?? listCfg.ttlS, "list.ttl_s", 0),
      origin: str(listCfg.origin, "list.origin", "auth"),
      graceS: seconds(listCfg.grace_s ?? listCfg.graceS, "list.grace_s", 0),
    },
    upstream: {
      user: str(upstream.user, "upstream.user", "X-WAF-User"),
      groups: str(upstream.groups, "upstream.groups", "X-WAF-Groups"),
      method: str(upstream.method, "upstream.method", "X-WAF-Auth"),
      cookie: str(upstream.cookie, "upstream.cookie"),
      ttlS: seconds(upstream.ttl_s ?? upstream.ttlS, "upstream.ttl_s", 0),
    },
    provider: provider as AuthProviderKind,
    identity: { from: str(identity.from, "identity.from") },
    providers: { local, code, ldap, ntlm, jwt, app },
    lockout: {
      attempts: num(lockout.attempts, "lockout.attempts", 5),
      windowS: seconds(lockout.window_s ?? lockout.windowS, "lockout.window_s", 600),
      lockS: seconds(lockout.lock_s ?? lockout.lockS, "lockout.lock_s", 900),
    },
    roster: {
      store: str(roster.store, "roster.store", "redis") as "redis" | "memory",
      prefix: str(roster.prefix, "roster.prefix", "auth:"),
      revokeRefreshMs: num(
        roster.revoke_refresh_ms ?? roster.revokeRefreshMs,
        "roster.revoke_refresh_ms",
        2000,
      ),
    },
  };
}

export function validateLoginPage(text: string): void {
  if (!/<form[^>]*method=["']?post/i.test(text)) {
    fail('login page: no <form method="post">');
  }

  if (!/name=["']csrf["']/i.test(text)) {
    fail('login page: no field name="csrf"');
  }

  if (!/\{\{\s*\.Nonce\s*\}\}/.test(text)) {
    fail("login page: {{.Nonce}} is missing, the ticket cannot be checked");
  }

  if (!/name=["'](login|password|code)["']/i.test(text)) {
    fail("login page: no login, password or code field");
  }
}

export function isExternalProvider(provider: AuthProviderKind): boolean {
  return AUTH_EXTERNAL_PROVIDERS.has(provider);
}

export function validateSourceDoc(doc: AuthSourceDoc): void {
  if (doc.login.uri === "" && !isExternalProvider(doc.provider)) {
    fail("login.uri is empty: a source without a form cannot log anyone in");
  }

  if (doc.login.uri !== "") {
    if (!doc.login.uri.startsWith("/")) {
      fail("login.uri must be an absolute path");
    }

    if (doc.login.uri.includes("?") || doc.login.uri.includes("#")) {
      fail("login.uri must not carry a query or fragment");
    }
  }

  if (doc.session.cookie !== "" && doc.session.cookie === doc.ticket.cookie) {
    fail("session.cookie and ticket.cookie must differ");
  }

  if (doc.session.ttlS <= 0) {
    fail("session.ttl_s must be positive");
  }

  if (doc.session.renewAfterS !== 0 && doc.session.renewAfterS >= doc.session.ttlS) {
    fail("session.renew_after_s must be shorter than session.ttl_s");
  }

  for (const bind of doc.session.bind) {
    if (!BINDS.has(bind)) {
      fail(`session.bind: expected subnet or ua, got ${JSON.stringify(bind)}`);
    }
  }

  if (doc.session.subnet.v4 < 0 || doc.session.subnet.v4 > 32) {
    fail("session.subnet.v4 must be within 0..32");
  }

  if (doc.session.subnet.v6 < 0 || doc.session.subnet.v6 > 128) {
    fail("session.subnet.v6 must be within 0..128");
  }

  if (doc.ticket.ttlS <= 0) {
    fail("ticket.ttl_s must be positive");
  }

  if (doc.list.sessions !== "") {
    if (!NAME_RE.test(doc.list.sessions)) {
      fail("list.sessions must be a plain dataset name");
    }

    if (doc.list.cookie === "") {
      fail("list.cookie is empty: the dataset is keyed by it");
    }

    if (
      (doc.session.cookie !== "" && doc.list.cookie === doc.session.cookie) ||
      (doc.ticket.cookie !== "" && doc.list.cookie === doc.ticket.cookie)
    ) {
      fail("list.cookie must differ from session.cookie and ticket.cookie");
    }

    if (doc.list.graceS < 0 || doc.list.graceS > 300) {
      fail("list.grace_s must be within 0..300");
    }

    if (doc.list.ttlS > doc.session.ttlS) {
      fail("list.ttl_s must not outlive session.ttl_s");
    }
  }

  if (doc.upstream.cookie !== "") {
    if (
      (doc.session.cookie !== "" && doc.upstream.cookie === doc.session.cookie) ||
      (doc.ticket.cookie !== "" && doc.upstream.cookie === doc.ticket.cookie) ||
      (doc.list.sessions !== "" && doc.upstream.cookie === doc.list.cookie)
    ) {
      fail("upstream.cookie must differ from the gate cookies");
    }
  }

  if (doc.roster.store !== "redis" && doc.roster.store !== "memory") {
    fail("roster.store must be redis or memory");
  }

  if (doc.roster.revokeRefreshMs <= 0) {
    fail("roster.revoke_refresh_ms must be positive");
  }

  if (doc.lockout.attempts < 0) {
    fail("lockout.attempts must not be negative");
  }

  validateProvider(doc);
}

function validateProvider(doc: AuthSourceDoc): void {
  if ((doc.provider as string) === "") {
    fail("provider is empty: a form without a provider lets everyone in");
  }

  switch (doc.provider) {
    case "local":
      if (doc.providers.local === null || doc.providers.local.users === "") {
        fail("provider local: providers.local.users is not set");
      }

      break;

    case "code":
      validateCode(doc.providers.code, doc.identity.from);
      break;

    case "ldap":
      validateLdap(doc.providers.ldap);
      break;

    case "ntlm":
      if (doc.providers.ntlm === null || doc.providers.ntlm.url === "") {
        fail("provider ntlm: providers.ntlm.url is not set");
      }

      if (doc.providers.ntlm.domain === "") {
        fail("provider ntlm: providers.ntlm.domain is not set");
      }

      validateSearchSecret(doc.providers.ntlm.search, "providers.ntlm.search");
      break;

    case "jwt":
      validateJwt(doc);
      break;

    case "app":
      validateApp(doc);
      break;
  }

  const totp =
    doc.provider === "code" && doc.providers.code !== null && doc.providers.code.kind === "totp";

  if (doc.identity.from !== "" && !totp) {
    fail("identity.from is only for provider code with kind totp");
  }
}

function validateJwt(doc: AuthSourceDoc): void {
  const j = doc.providers.jwt;

  if (j === null) {
    fail("provider jwt: providers.jwt is not set");
  }

  if ((j.cookie === "") === (j.header === "")) {
    fail("providers.jwt: exactly one of cookie or header must name where the token lives");
  }

  if (
    j.cookie !== "" &&
    ((doc.session.cookie !== "" && j.cookie === doc.session.cookie) ||
      (doc.ticket.cookie !== "" && j.cookie === doc.ticket.cookie))
  ) {
    fail("providers.jwt.cookie must differ from the gate cookies");
  }

  if (!JWT_ALGS.has(j.verify.alg)) {
    fail(`providers.jwt.verify.alg: unsupported ${JSON.stringify(j.verify.alg)}`);
  }

  const key = j.verify.key !== "";
  const env = j.verify.secretEnv !== "";
  const hmac = j.verify.alg.startsWith("HS");

  if (j.verify.alg === "none") {
    if (key || env) {
      fail("providers.jwt.verify: alg none does not take a key");
    }
  } else if (hmac) {
    if (key) {
      fail("providers.jwt.verify: an HMAC secret is not stored in the document; name secret_env");
    }

    if (!env) {
      fail(`providers.jwt.verify: alg ${j.verify.alg} needs secret_env`);
    }
  } else {
    if (env) {
      fail(`providers.jwt.verify: secret_env is for HMAC algorithms; ${j.verify.alg} takes a public key`);
    }

    if (!key) {
      fail(`providers.jwt.verify: alg ${j.verify.alg} needs a public key`);
    }

    if (!j.verify.key.includes("-----BEGIN")) {
      fail("providers.jwt.verify.key must be PEM");
    }
  }

  if (j.verify.leewayS < 0) {
    fail("providers.jwt.verify.leeway_s must not be negative");
  }
}

function validateRoute(route: AuthAppRoute, path: string): void {
  if (route.uri === "") {
    return;
  }

  if (!route.uri.startsWith("/") || route.uri.includes("?") || route.uri.includes("#")) {
    fail(`${path}.uri must be an absolute path without query`);
  }

  if (route.method !== route.method.toUpperCase() || route.method === "") {
    fail(`${path}.method must be an upper-case HTTP method`);
  }
}

function validateApp(doc: AuthSourceDoc): void {
  const a = doc.providers.app;

  if (a === null) {
    fail("provider app: providers.app is not set");
  }

  if (a.cookie === "") {
    fail("providers.app.cookie is empty: name the application's session cookie");
  }

  if (
    (doc.session.cookie !== "" && a.cookie === doc.session.cookie) ||
    (doc.ticket.cookie !== "" && a.cookie === doc.ticket.cookie) ||
    a.cookie === doc.list.cookie
  ) {
    fail("providers.app.cookie must differ from the gate cookies");
  }

  if (doc.list.sessions === "") {
    fail("provider app needs list.sessions: the list is the set of trusted sessions");
  }

  if (a.learn.login.uri === "") {
    fail("providers.app.learn.login.uri is empty: where does the application log in");
  }

  validateRoute(a.learn.login, "providers.app.learn.login");
  validateRoute(a.learn.logout, "providers.app.learn.logout");

  if (!APP_FIELD_SOURCES.has(a.learn.user.from)) {
    fail("providers.app.learn.user.from: body.form, body.json, args or header");
  }

  if (a.learn.user.field === "") {
    fail("providers.app.learn.user.field is empty: which field carries the login");
  }

  for (const code of a.learn.success.status) {
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      fail(`providers.app.learn.success.status: ${code} is not an HTTP status`);
    }
  }

  if (a.learn.success.json !== null && a.learn.success.json.path === "") {
    fail("providers.app.learn.success.json.path is empty");
  }
}

function validateCode(code: AuthCodeProvider | null, from: string): void {
  if (code === null) {
    fail("provider code: providers.code is not set");
  }

  if (code.kind === "totp") {
    if (from === "") {
      fail("providers.code with kind totp needs identity.from: the source of the gate " +
        "that establishes the identity");
    }

    if (code.users === "") {
      fail("providers.code.users is not set: totp secrets live there");
    }

    if (code.digits < 6 || code.digits > 10) {
      fail("providers.code.digits must be within 6..10");
    }

    if (code.periodS <= 0) {
      fail("providers.code.period_s must be positive");
    }

    if (code.skew < 0 || code.skew > 5) {
      fail("providers.code.skew must be within 0..5");
    }

    return;
  }

  if (code.kind !== "static") {
    fail("providers.code.kind must be totp or static");
  }

  if (code.codes.length === 0) {
    fail("providers.code.codes is empty");
  }

  code.codes.forEach((hash, i) => {
    if (!isBcrypt(hash)) {
      fail(`providers.code.codes[${i}] is not a bcrypt hash; plain codes are rejected`);
    }
  });
}

function validateLdap(ldap: AuthLdapProvider | null): void {
  if (ldap === null || ldap.url === "") {
    fail("provider ldap: providers.ldap.url is not set");
  }

  switch (ldap.bind) {
    case "upn":
      if (ldap.upnSuffix === "") {
        fail("providers.ldap.upn_suffix is required for bind: upn");
      }

      break;

    case "dn_template":
      if (!ldap.dnTemplate.includes("%s")) {
        fail("providers.ldap.dn_template must contain %s");
      }

      break;

    case "search":
      if (ldap.search.base === "" || !ldap.search.filter.includes("%s")) {
        fail("providers.ldap.search needs base and a filter with %s");
      }

      break;

    default:
      fail("providers.ldap.bind must be upn, dn_template or search");
  }

  if (ldap.groups.length > 0 && ldap.bind !== "search") {
    fail("providers.ldap.groups requires bind: search");
  }

  validateSearchSecret(ldap.search, "providers.ldap.search");
}

function validateSearchSecret(search: AuthLdapSearch, path: string): void {
  if (search.bindDn === "") {
    return;
  }

  const env = search.passwordEnv !== "";
  const store = search.passwordStore !== null;

  if (env && store) {
    fail(`${path}: password_env and password_store are mutually exclusive`);
  }

  if (!env && !store) {
    fail(`${path}: bind_dn needs password_env or password_store`);
  }
}

function tlsBlock(out: string[], pad: string, tls: { caFile: string; insecureSkipVerify: boolean }): void {
  if (tls.caFile === "" && !tls.insecureSkipVerify) {
    return;
  }

  out.push(`${pad}tls:`);

  if (tls.caFile !== "") {
    out.push(`${pad}  ca_file: ${q(tls.caFile)}`);
  }

  if (tls.insecureSkipVerify) {
    out.push(`${pad}  insecure_skip_verify: true`);
  }
}

function searchBlock(out: string[], pad: string, search: AuthLdapSearch): void {
  if (
    search.base === "" &&
    search.filter === "" &&
    search.bindDn === "" &&
    search.passwordEnv === "" &&
    search.passwordStore === null
  ) {
    return;
  }

  out.push(`${pad}search:`);
  out.push(`${pad}  base: ${q(search.base)}`);
  out.push(`${pad}  filter: ${q(search.filter)}`);

  if (search.bindDn !== "") {
    out.push(`${pad}  bind_dn: ${q(search.bindDn)}`);
  }

  if (search.passwordEnv !== "") {
    out.push(`${pad}  password_env: ${q(search.passwordEnv)}`);
  }

  if (search.passwordStore !== null) {
    out.push(`${pad}  password_store: ${q(search.passwordStore)}`);
  }
}

export function renderSourceYaml(name: string, doc: AuthSourceDoc): string {
  const out: string[] = [];

  out.push(`# Источник входа ${name}. Собран контроллером, править здесь нечего:`);
  out.push("# источник -- таблица auth_sources, раздел /auth в UX.");
  out.push("");

  out.push("login:");
  out.push(`  uri: ${q(doc.login.uri)}`);
  out.push(`  title: ${q(doc.login.title)}`);
  out.push(`  note: ${q(doc.login.note)}`);
  out.push("");

  out.push("session:");

  if (doc.session.cookie !== "") {
    out.push(`  cookie: ${q(doc.session.cookie)}`);
  } else {
    out.push(`  # cookie: ${JSON.stringify(`waf_sid_${name}`)} -- умолчание на источник`);
  }

  out.push(`  ttl: ${q(duration(doc.session.ttlS))}`);
  out.push(`  renew_after: ${q(duration(doc.session.renewAfterS))}`);
  out.push(`  bind: ${seq(doc.session.bind)}`);
  out.push(`  subnet: { v4: ${doc.session.subnet.v4}, v6: ${doc.session.subnet.v6} }`);
  out.push("");

  out.push("ticket:");

  if (doc.ticket.cookie !== "") {
    out.push(`  cookie: ${q(doc.ticket.cookie)}`);
  }

  out.push(`  ttl: ${q(duration(doc.ticket.ttlS))}`);
  out.push("");

  out.push("upstream:");
  out.push(`  user: ${q(doc.upstream.user)}`);
  out.push(`  groups: ${q(doc.upstream.groups)}`);
  out.push(`  method: ${q(doc.upstream.method)}`);

  if (doc.upstream.cookie !== "") {
    out.push(`  cookie: ${q(doc.upstream.cookie)}`);
    out.push(`  ttl: ${q(duration(doc.upstream.ttlS))}`);
  }

  out.push("");

  if (doc.list.sessions !== "") {
    out.push("list:");
    out.push(`  sessions: ${q(doc.list.sessions)}`);
    out.push(`  cookie: ${q(doc.list.cookie)}`);
    out.push(`  ttl: ${q(duration(doc.list.ttlS))}`);
    out.push(`  origin: ${q(doc.list.origin)}`);

    if (doc.list.graceS > 0) {
      out.push(`  grace: ${q(duration(doc.list.graceS))}`);
    }
    out.push("");
  }

  out.push(`provider: ${doc.provider}`);

  if (doc.identity.from !== "") {
    out.push("");
    out.push("identity:");
    out.push(`  from: ${q(doc.identity.from)}`);
  }

  out.push("");
  out.push("providers:");

  if (doc.providers.local !== null) {
    out.push("  local:");
    out.push("    users: users.yaml");
  }

  if (doc.providers.code !== null) {
    const c = doc.providers.code;

    out.push("  code:");
    out.push(`    kind: ${c.kind}`);

    if (c.kind === "totp") {
      out.push(`    digits: ${c.digits}`);
      out.push(`    period: ${q(duration(c.periodS))}`);
      out.push(`    skew: ${c.skew}`);
      out.push("    users: users.yaml");
    } else {
      out.push("    codes:");

      for (const hash of c.codes) {
        out.push(`      - ${q(hash)}`);
      }
    }
  }

  if (doc.providers.ldap !== null) {
    const l = doc.providers.ldap;

    out.push("  ldap:");
    out.push(`    url: ${q(l.url)}`);
    out.push(`    start_tls: ${l.startTls}`);
    out.push(`    bind: ${l.bind}`);

    if (l.upnSuffix !== "") {
      out.push(`    upn_suffix: ${q(l.upnSuffix)}`);
    }

    if (l.dnTemplate !== "") {
      out.push(`    dn_template: ${q(l.dnTemplate)}`);
    }

    out.push(`    timeout: ${q(duration(l.timeoutS))}`);

    if (l.groups.length > 0) {
      out.push(`    groups: ${seq(l.groups)}`);
    }

    searchBlock(out, "    ", l.search);
    tlsBlock(out, "    ", l.tls);
  }

  if (doc.providers.ntlm !== null) {
    const n = doc.providers.ntlm;

    out.push("  ntlm:");
    out.push(`    url: ${q(n.url)}`);
    out.push(`    domain: ${q(n.domain)}`);
    out.push(`    start_tls: ${n.startTls}`);
    out.push(`    timeout: ${q(duration(n.timeoutS))}`);

    if (n.groups.length > 0) {
      out.push(`    groups: ${seq(n.groups)}`);
    }

    searchBlock(out, "    ", n.search);
    tlsBlock(out, "    ", n.tls);
  }

  if (doc.providers.jwt !== null) {
    const j = doc.providers.jwt;

    out.push("  jwt:");

    if (j.cookie !== "") {
      out.push(`    cookie: ${q(j.cookie)}`);
    }

    if (j.header !== "") {
      out.push(`    header: ${q(j.header)}`);
      out.push(`    prefix: ${q(j.prefix)}`);
    }

    out.push("    verify:");
    out.push(`      alg: ${j.verify.alg}`);

    if (j.verify.key !== "") {
      out.push("      key_file: jwt.key");
    }

    if (j.verify.secretEnv !== "") {
      out.push(`      secret_env: ${q(j.verify.secretEnv)}`);
    }

    if (j.verify.issuer !== "") {
      out.push(`      issuer: ${q(j.verify.issuer)}`);
    }

    if (j.verify.audience !== "") {
      out.push(`      audience: ${q(j.verify.audience)}`);
    }

    if (j.verify.leewayS > 0) {
      out.push(`      leeway: ${q(duration(j.verify.leewayS))}`);
    }

    out.push("    claims:");
    out.push(`      user: ${q(j.claims.user)}`);
    out.push(`      session: ${q(j.claims.session)}`);

    if (j.claims.groups !== "") {
      out.push(`      groups: ${q(j.claims.groups)}`);
    }

    out.push(`      issued: ${q(j.claims.issued)}`);
    out.push(`      expiry: ${q(j.claims.expiry)}`);
  }

  if (doc.providers.app !== null) {
    const a = doc.providers.app;
    const l = a.learn;

    out.push("  app:");
    out.push(`    cookie: ${q(a.cookie)}`);
    out.push("    learn:");
    out.push(`      login: { uri: ${q(l.login.uri)}, method: ${l.login.method} }`);

    if (l.logout.uri !== "") {
      out.push(`      logout: { uri: ${q(l.logout.uri)}, method: ${l.logout.method} }`);
    }

    out.push("      success:");
    out.push(`        status: [${l.success.status.join(", ")}]`);
    out.push(`        cookie_new: ${l.success.cookieNew}`);

    if (l.success.json !== null) {
      out.push(
        `        json: { path: ${q(l.success.json.path)}, equals: ${q(l.success.json.equals)} }`,
      );
    }

    out.push(`      user: { from: ${l.user.from}, field: ${q(l.user.field)} }`);
  }

  out.push("");
  out.push("lockout:");
  out.push(`  attempts: ${doc.lockout.attempts}`);
  out.push(`  window: ${q(duration(doc.lockout.windowS))}`);
  out.push(`  lock: ${q(duration(doc.lockout.lockS))}`);
  out.push("");

  out.push("roster:");
  out.push(`  store: ${doc.roster.store}`);
  out.push(`  prefix: ${q(doc.roster.prefix)}`);
  out.push(`  revoke_refresh: ${q(`${doc.roster.revokeRefreshMs}ms`)}`);
  out.push("");

  return out.join("\n");
}

export interface AuthUserLine {
  login: string;
  passwordHash: string;
  groups: string[];
  totpStore: string | null;
}

const USER_LOGIN = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/;
const BCRYPT = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function parseUserLine(raw: string): AuthUserLine | null {
  const line = raw.trim();

  if (line === "" || line.startsWith("#")) {
    return null;
  }

  const parts = line.split(":");

  if (parts.length < 2 || parts.length > 4) {
    fail(`users: ${JSON.stringify(raw)} is not login:hash[:groups[:store]]`);
  }

  const [login, hash, groups = "", store = ""] = parts;

  if (!USER_LOGIN.test(login)) {
    fail(`users: ${JSON.stringify(login)} is not a valid login`);
  }

  if (!BCRYPT.test(hash)) {
    fail(`users: ${login} has no bcrypt hash; the password is stored hashed only`);
  }

  if (store !== "" && !isUuid(store)) {
    fail(`users: ${login} has a totp reference that is not a uuid`);
  }

  return {
    login,
    passwordHash: hash,
    groups: groups
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""),
    totpStore: store === "" ? null : store,
  };
}

export function renderUsersYaml(lines: string[]): string {
  const out: string[] = [];

  out.push("# Пользователи провайдера local. Собрано контроллером из списка.");
  out.push("#");
  out.push("# Пароли -- только bcrypt: открытый пароль контроллер не хранит и");
  out.push("# не пересылает. Секрет TOTP -- ссылка store:<uuid>, его открывает");
  out.push("# процесс на ноде ключом контура.");
  out.push("");
  out.push("users:");

  const users = lines
    .map(parseUserLine)
    .filter((user): user is AuthUserLine => user !== null);

  if (users.length === 0) {
    out.push("  []");

    return out.join("\n");
  }

  for (const user of users) {
    out.push(`  - login: ${q(user.login)}`);
    out.push(`    password: ${q(user.passwordHash)}`);

    if (user.totpStore !== null) {
      out.push(`    totp_store: ${q(user.totpStore)}`);
    }

    if (user.groups.length > 0) {
      out.push(`    groups: ${seq(user.groups)}`);
    }

    out.push("    enabled: true");
  }

  return out.join("\n");
}
