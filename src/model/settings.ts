import type { AccessLog, ErrorLog } from "./log.ts";

/**
 * Директивы модуля, которые живут только в http {}. Их нельзя повесить на
 * server или location: шина, зона и каталог инспекторов -- свойства процесса,
 * не маршрута.
 *
 * Каталоги (инспекторы, наборы, ответы отказа, хранилища, форматы логов) в
 * этот документ не входят -- у них свои таблицы, потому что на них ссылаются.
 * Здесь только скаляры.
 */
/**
 * Стандартный набор секции `vars`: поля, которые модуль считает сам, без
 * `waf_var`, и всегда кладёт в запись аудита; инспектору они едут по `vars=`
 * его объявления. Имена заняты: `waf_var` с таким именем модуль отвергает на
 * `nginx -t`, а разбор документа -- раньше. Зеркало таблицы
 * `ngx_http_waf_std_vars` модуля и `BUILTIN_VARS` панели
 * (controller/ux/src/config/VarsCatalog.tsx): три копии одного списка, менять
 * вместе.
 */
export const BUILTIN_VARS = [
  "user_agent",
  "referer",
  "xff",
  "accept_language",
  "origin",
  "content_type",
  "accept",
  "request_id",
] as const;

export function isBuiltinVar(name: string): boolean {
  return (BUILTIN_VARS as readonly string[]).includes(name);
}

export interface WafHttpSettings {
  nodeId?: string;
  /**
   * `waf_var <name> <value>`: поле запроса, которого модуль сам не знает.
   * Имена стандартного набора (`BUILTIN_VARS`) здесь недопустимы.
   */
  vars?: { name: string; value: string }[];
  bus?: {
    /**
     * Адрес шины документом пространства не задаётся: NATS у контура один, и
     * его же знают агент (`agent.conf`) и инспекторы. Компилятор печатает
     * `CONTROLLER_NATS_URL`, а сохранённый список остаётся только у
     * пространств, заведённых до переноса. Реквизиты (`user=` / `pass=` /
     * `token=`) приезжают оттуда же и в документе не лежат вовсе.
     */
    urls?: string[];
    name?: string;
    connectTimeoutMs?: number;
    reconnectWaitMs?: number;
    pingIntervalMs?: number;
    pendingMax?: string;
    /**
     * `payload_max=` -- потолок кадра шины. Умолчание модуля (1m) совпадает с
     * `max_payload` сервера NATS, но `nginx -t` считает худший inspect-пакет от
     * размера буферов заголовков, и нода с крупными `large_client_header_buffers`
     * без поднятого потолка не стартует.
     */
    payloadMax?: string;
    tls?: boolean;
    tlsCa?: string;
    tlsCert?: string;
    tlsKey?: string;
    creds?: string;
  };
  busFlushIntervalMs?: number;
  /** Снято: модуль принимает одну версию схемы. Из jsonb ещё читается, не печатается. */
  protocolVersions?: number[];
  replyMax?: string;
  headerValueMax?: string;
  maxInflight?: number;
  shmZone?: {
    name: string;
    size: string;
  };
  bodyMaxHolds?: number;
  /** Снято вместе с классом remote у драйверов. Из jsonb ещё читается, не печатается. */
  bodyRemoteMinDeadlineMs?: number;
  /** Сокет локального агента: итог фазы не на шину вердиктов. */
  agentSocket?: string;
}

export type ProxyHeaderPreset = "standard" | "websocket" | "none";

/**
 * Скелет файла, а не блока `http {}`. Агент пишет текст компилятора целиком в
 * `nginx.conf` и проверяет его `nginx -t -c`: без `events {}` мастер не
 * стартует, без `load_module` модуля в процессе нет.
 *
 * Идентичность ноды сюда не входит. `waf_node_id` и `waf_bus` приезжают
 * include'ом с самой ноды (`nginx.includes`), потому что шаблон один на флот, а
 * инбокс у каждой ноды свой.
 */
export interface NginxMainSettings {
  loadModules?: string[];
  workerProcesses?: number | "auto";
  workerRlimitNofile?: number;
  user?: string;
  pid?: string;
  /** Путь и уровень одной строкой: `/var/log/nginx/error.log info`. */
  errorLog?: string;
  /**
   * Копия главного error_log в сокет агента, оттуда — в waf.log. Ключа нет —
   * копия есть: в главный журнал пишет всё, что модуль делает вне запроса
   * (шина, подписки наборов, предохранитель), и сам мастер (reload, упавший
   * воркер). false — только файл.
   */
  errorLogShip?: boolean;
  events?: {
    workerConnections?: number;
    multiAccept?: boolean;
    use?: string;
  };
  includes?: string[];
}

/**
 * Ядро nginx на уровне http. Поля -- то, без чего боевой край либо не
 * стартует, либо врёт про клиента, либо ломается на медленном клиенте.
 * Всё, что является мини-языком или целым подсистемом (map/geo/if, lua,
 * cache, include, perl), живёт в `raw` пространства, не здесь.
 *
 * worker_processes / events -- карточка ноды, не http.
 */
export interface NginxHttpSettings {
  sendfile?: boolean;
  tcpNopush?: boolean;
  tcpNodelay?: boolean;
  keepaliveTimeoutS?: number;
  keepaliveRequests?: number;
  keepaliveTimeS?: number;
  clientMaxBodySize?: string;
  clientHeaderTimeoutMs?: number;
  clientBodyTimeoutMs?: number;
  sendTimeoutMs?: number;
  clientHeaderBufferSize?: string;
  clientBodyBufferSize?: string;
  /**
   * Каталог для тел, не влезших в буфер. Только http: путь ведёт на
   * смонтированную файловую систему ноды, а монтирование одно на ноду --
   * разные каталоги у разных серверов означали бы разные монтирования,
   * которых панель не делает. Смысл настройки -- увести файл на tmpfs.
   */
  clientBodyTempPath?: string;
  largeClientHeaderBuffers?: { count: number; size: string };
  defaultType?: string;
  underscoresInHeaders?: boolean;
  ignoreInvalidHeaders?: boolean;
  mergeSlashes?: boolean;
  serverTokens?: boolean;
  /** Иначе nginx не соберёт hash при длинных / многочисленных server_name. */
  serverNamesHashBucketSize?: string;
  serverNamesHashMaxSize?: string;
  typesHashBucketSize?: string;
  typesHashMaxSize?: string;
  resolver?: string[];
  resolverTimeoutMs?: number;
  realIpFrom?: string[];
  realIpHeader?: string;
  realIpRecursive?: boolean;
  /** Slowloris / полузакрытые клиенты -- свойство WAF-края, не кэша. */
  resetTimedoutConnection?: boolean;
  lingeringClose?: "on" | "off" | "always";
  lingeringTimeMs?: number;
  lingeringTimeoutMs?: number;
  gzip?: boolean;
  gzipTypes?: string[];
  gzipCompLevel?: number;
  gzipMinLength?: number;
  gzipVary?: boolean;
  sslProtocols?: string[];
  sslCiphers?: string;
  sslPreferServerCiphers?: boolean;
  sslSessionCache?: string;
  sslSessionTimeout?: string;
  proxyHttpVersion?: "1.0" | "1.1";
  proxyHeaders?: ProxyHeaderPreset;
  /** Глобальные заголовки (HSTS). Наследование как у nginx: ребёнок заменяет. */
  addHeaders?: { name: string; value: string; always?: boolean }[];
  /**
   * Логи блока. Наследуются на server и location по общему правилу ядра:
   * ключа нет -- родительские, ключ есть -- заменяет. `access_log: "off"` --
   * форма директивы, а не пустой список.
   */
  accessLog?: AccessLog;
  errorLog?: ErrorLog;
  /** `include` в http {}: mime.types, waf-node.conf. Не мини-язык. */
  includes?: string[];
}

export interface NginxServerSettings {
  clientMaxBodySize?: string;
  root?: string;
  charset?: string;
  /** Только редирект на HTTPS: не полноценный WAF-сервер на :80. */
  httpsRedirect?: boolean;
  sslProtocols?: string[];
  sslCiphers?: string;
  sslPreferServerCiphers?: boolean;
  sslSessionCache?: string;
  sslSessionTimeout?: string;
  sslVerifyClient?: "on" | "off" | "optional";
  /**
   * Глубина цепочки, которую nginx готов пройти от клиентского сертификата к
   * доверенному корню. По умолчанию у nginx 1 -- этого хватает, только если
   * клиентов подписал сам корень. Промежуточный CA -- уже длина 2, и без
   * этой директивы валидные клиенты получают отказ.
   */
  sslVerifyDepth?: number;
  realIpFrom?: string[];
  realIpHeader?: string;
  realIpRecursive?: boolean;
  /**
   * Сжатие. В nginx директивы работают в http, server и location, поэтому и
   * здесь они на всех трёх: статике сжатие нужно, а проксируемому JSON или
   * уже сжатому телу -- нет, и решается это на пути.
   */
  gzip?: boolean;
  gzipTypes?: string[];
  gzipCompLevel?: number;
  gzipMinLength?: number;
  gzipVary?: boolean;
  /** Лог виртуального хоста. `"off"` глушит унаследованный из http. */
  accessLog?: AccessLog;
  errorLog?: ErrorLog;
  /**
   * `add_header` виртуального хоста -- HSTS, X-Frame-Options, CSP на весь
   * server {}. В nginx директива живёт на всех трёх уровнях, и наследование у
   * неё своё: ребёнок с хотя бы одним add_header заменяет родительский набор
   * целиком, поэтому путь, которому нужен свой заголовок, повторяет и эти.
   */
  addHeaders?: { name: string; value: string; always?: boolean }[];
  /**
   * `error_page 403 =403 @waf_deny;` -- то, чем страница отказа подключается к
   * коду, который вернул модуль. Именованный путь -- обычный location в
   * `locations`, здесь только ссылка на него.
   */
  errorPages?: { codes: number[]; status?: number; target: string }[];
}

export interface NginxLocationSettings {
  clientMaxBodySize?: string;
  root?: string;
  alias?: string;
  index?: string[];
  tryFiles?: string[];
  allow?: string[];
  deny?: string[];
  internal?: boolean;
  /** Страница отказа подставляет `$waf_ray` и `$waf_deny_name` через SSI. */
  ssi?: boolean;
  ssiTypes?: string[];
  /** Служебный путь: UX не предлагает инспекторов на captcha/healthz. */
  role?: "none" | "healthz" | "challenge" | "metrics" | "deny_page";
  addHeaders?: { name: string; value: string; always?: boolean }[];
  proxyConnectTimeoutMs?: number;
  proxyReadTimeoutMs?: number;
  proxySendTimeoutMs?: number;
  proxyBuffering?: boolean;
  proxyRequestBuffering?: boolean;
  proxyHttpVersion?: "1.0" | "1.1";
  proxyHeaders?: ProxyHeaderPreset | "custom";
  proxySetHeaders?: { name: string; value: string }[];
  realIpFrom?: string[];
  realIpHeader?: string;
  realIpRecursive?: boolean;
  /**
   * Сжатие. В nginx директивы работают в http, server и location, поэтому и
   * здесь они на всех трёх: статике сжатие нужно, а проксируемому JSON или
   * уже сжатому телу -- нет, и решается это на пути.
   */
  gzip?: boolean;
  gzipTypes?: string[];
  gzipCompLevel?: number;
  gzipMinLength?: number;
  gzipVary?: boolean;
  /**
   * Лог пути. Ради него директива и заводилась на этом уровне:
   * `access_log: "off"` на `= /healthz` -- то, что операторы пишут первым.
   */
  accessLog?: AccessLog;
  errorLog?: ErrorLog;
}
