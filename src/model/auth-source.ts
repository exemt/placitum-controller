/*
 * Источник входа калитки (inspectors/auth): провайдер, форма, сессии --
 * всё про сам вход. Объявляется отдельно от профилей и раньше них; профиль
 * ссылается на источник по имени (doc.source) и добавляет только политику
 * маршрута.
 *
 * Документ повторяет форму source.yaml инспектора один в один, кроме сроков:
 * в YAML они человеческие ("8h"), здесь -- секунды. Форме так проще (числовое
 * поле вместо разбора строки), а обратно в YAML их печатает рендер.
 *
 * Секреты сюда не попадают. Пароль служебной записи LDAP и секрет TOTP -- это
 * ссылки на store-объекты, зашифрованные в браузере ключом контура; контроллер
 * их не открывает, как не открывает PEM.
 */

/*
 * Четыре своих провайдера выписывают сессию сами; jwt и app -- внешние:
 * сессию выдаёт чужой издатель (токен по схеме claims) либо приложение
 * (кука, которой калитка верит после того, как подсмотрела вход). Формы и
 * билета у внешних нет, login.uri -- страница входа приложения.
 */
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
  /* Ровно одно место: кука либо заголовок (с префиксом схемы, «Bearer »). */
  cookie: string;
  header: string;
  prefix: string;
  verify: {
    alg: AuthJwtAlg;
    /*
     * PEM публичного ключа для RS и ES; уезжает файлом jwt.key рядом с
     * source.yaml. Секрет HMAC здесь не хранят -- он из окружения инспектора
     * (secretEnv), как пароль служебной записи LDAP.
     */
    key: string;
    secretEnv: string;
    issuer: string;
    audience: string;
    leewayS: number;
  };
  /* Имена claims; пусто -- умолчания RFC 7519 (sub, sid, iat, exp). */
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
    /* Пустой uri -- выход не подсматривается, запись живёт до срока. */
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
  /*
   * Своя форма входа -- uuid объекта содержимого пространства (раздел
   * «Страницы»). Пусто -- встроенная страница из образа формы.
   *
   * В source.yaml не печатается: инспектор не знает про каталог контроллера,
   * ему тело приезжает файлом login.html рядом с источником.
   */
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

/* Активный список локального слоя: пустое sessions -- списка нет. */
export interface AuthList {
  sessions: string;
  cookie: string;
  ttlS: number;
  origin: string;
  /*
   * Окно на доезд записи через секвенсор: сессия моложе него проходит по
   * одной подписи. 0 -- умолчание инспектора (15 с), а не запрет окна.
   */
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
  /* Имя набора пользователей пространства, не путь к файлу. */
  users: string;
}

export interface AuthCodeProvider {
  kind: "totp" | "static";
  digits: number;
  periodS: number;
  skew: number;
  /* bcrypt-хеши кодов доступа для kind: static. Открытых кодов здесь нет. */
  codes: string[];
  /* Набор пользователей с секретами TOTP (kind: totp), как у local. */
  users: string;
}

/*
 * Откуда стыкованный источник берёт личность: имя источника первой калитки
 * того же процесса. Нужно только провайдеру code с kind totp.
 */
export interface AuthIdentity {
  from: string;
}

export interface AuthLdapSearch {
  base: string;
  filter: string;
  bindDn: string;
  /* Одно из двух: имя переменной окружения либо store-объект. */
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
  revokeRefreshMs: number;
}

export interface AuthSourceDoc {
  login: AuthLogin;
  session: AuthSession;
  ticket: AuthTicket;
  list: AuthList;
  upstream: AuthUpstream;
  /* Один источник -- один способ входа; комбинации -- набором инспекторов на маршруте. */
  provider: AuthProviderKind;
  identity: AuthIdentity;
  providers: AuthProviders;
  lockout: AuthLockout;
  roster: AuthRoster;
}

export interface AuthSourceMeta {
  id: string;
  httpSpaceId: string;
  /*
   * Сервер, из локейшенов которого выбран адрес формы. На решение о допуске
   * не влияет, но задаёт список, из которого login.uri выбирают, и делает
   * проверку пути возможной до выкатки.
   */
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
