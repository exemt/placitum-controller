export type AuthProviderKind = "local" | "code" | "ldap" | "ntlm" | "jwt" | "app";

export const AUTH_EXTERNAL_PROVIDERS: ReadonlySet<AuthProviderKind> = new Set(["jwt", "app"]);

export const AUTH_JWT_ALGS = [
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "none",
] as const;

export type AuthJwtAlg = (typeof AUTH_JWT_ALGS)[number];

export interface AuthJwtProvider {
  cookie: string;
  header: string;
  prefix: string;
  verify: {
    alg: AuthJwtAlg;
    key: string;
    secretEnv: string;
    issuer: string;
    audience: string;
    leewayS: number;
  };
  claims: { user: string; session: string; groups: string; issued: string; expiry: string };
}

export const AUTH_APP_FIELD_SOURCES = ["body.form", "body.json", "args", "header"] as const;

export type AuthAppFieldSource = (typeof AUTH_APP_FIELD_SOURCES)[number];

export interface AuthAppRoute {
  uri: string;
  method: string;
}

export interface AuthAppProvider {
  cookie: string;
  learn: {
    login: AuthAppRoute;
    logout: AuthAppRoute;
    success: {
      status: number[];
      cookieNew: boolean;
      json: { path: string; equals: string } | null;
    };
    user: { from: AuthAppFieldSource; field: string };
  };
}

export interface AuthLogin {
  uri: string;
  title: string;
  note: string;
  page: string;
}

export interface AuthSubnet {
  v4: number;
  v6: number;
}

export interface AuthSession {
  cookie: string;
  ttlS: number;
  renewAfterS: number;
  bind: string[];
  subnet: AuthSubnet;
}

export interface AuthTicket {
  cookie: string;
  ttlS: number;
}

export interface AuthList {
  sessions: string;
  cookie: string;
  ttlS: number;
  origin: string;
  graceS: number;
}

export interface AuthUpstream {
  user: string;
  groups: string;
  method: string;
  cookie: string;
  ttlS: number;
}

export interface AuthLocalProvider {
  users: string;
}

export interface AuthCodeProvider {
  kind: "totp" | "static";
  digits: number;
  periodS: number;
  skew: number;
  codes: string[];
  users: string;
}

export interface AuthIdentity {
  from: string;
}

export interface AuthLdapSearch {
  base: string;
  filter: string;
  bindDn: string;
  passwordEnv: string;
  passwordStore: string | null;
}

export interface AuthLdapTls {
  caFile: string;
  insecureSkipVerify: boolean;
}

export interface AuthLdapProvider {
  url: string;
  startTls: boolean;
  bind: "upn" | "dn_template" | "search";
  upnSuffix: string;
  dnTemplate: string;
  timeoutS: number;
  groups: string[];
  search: AuthLdapSearch;
  tls: AuthLdapTls;
}

export interface AuthNtlmProvider {
  url: string;
  domain: string;
  timeoutS: number;
  startTls: boolean;
  groups: string[];
  search: AuthLdapSearch;
  tls: AuthLdapTls;
}

export interface AuthProviders {
  local: AuthLocalProvider | null;
  code: AuthCodeProvider | null;
  ldap: AuthLdapProvider | null;
  ntlm: AuthNtlmProvider | null;
  jwt: AuthJwtProvider | null;
  app: AuthAppProvider | null;
}

export interface AuthLockout {
  attempts: number;
  windowS: number;
  lockS: number;
}

export interface AuthRoster {
  store: "redis" | "memory";
  prefix: string;
}

export interface AuthSourceDoc {
  login: AuthLogin;
  session: AuthSession;
  ticket: AuthTicket;
  list: AuthList;
  upstream: AuthUpstream;
  provider: AuthProviderKind;
  identity: AuthIdentity;
  providers: AuthProviders;
  lockout: AuthLockout;
  roster: AuthRoster;
}

export interface AuthSourceMeta {
  id: string;
  httpSpaceId: string;
  serverId: string | null;
  name: string;
  description: string;
  provider: AuthProviderKind;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSource extends AuthSourceMeta {
  doc: AuthSourceDoc;
}
