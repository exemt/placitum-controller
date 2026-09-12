/**
 * Компилятор одной строки `locations` -> блок `location {}`.
 * Серверный компилятор вставляет этот текст внутрь `server {}`.
 */

import type { Inspector } from "../model/http-space.ts";
import type { InspectorDecl } from "../model/waf-route.ts";
import type { Location } from "../model/location.ts";
import type { NginxLocationSettings } from "../model/settings.ts";
import type { WafRouteSettings } from "../model/waf-route.ts";
import { type UpstreamWire, upstreamHost, upstreamSni } from "../model/upstream.ts";
import { alignColumns } from "./nginx-align.ts";
import {
  durationMs,
  emitGzip,
  emitLogs,
  emitRealIp,
  emitWafRoute,
  indentBlock,
  nestStore,
  type NginxCompileResult,
  presetProxyHeaders,
  type ProxyHeader,
  proxyVersionFor,
  putProxyHeader,
  type StoreRefs,
} from "./nginx-emit.ts";

export interface LocationUpstream extends UpstreamWire {
  id: string;
  name: string;
}

export interface LocationCompileSource {
  location: Location;
  inspectors?: Inspector[];
  upstreams?: LocationUpstream[];
  /**
   * Уровней отступа по 4 пробела. 0 -- сам блок (тесты);
   * 2 -- внутри `server {}`, как печатает общий компилятор.
   */
  indent?: number;
  store?: StoreRefs;
  graph?: Record<string, InspectorDecl>;
}

export function compileLocation(source: LocationCompileSource): NginxCompileResult {
  const loc = source.location;
  const inspectors = source.inspectors ?? [];
  const upstreams = source.upstreams ?? [];
  const indent = source.indent ?? 0;

  const storeRefs: string[] = [];
  const store = nestStore(storeRefs, source.store);

  const lines: string[] = [];
  const pad = "    ".repeat(indent);

  lines.push(`${pad}${locationHeader(loc)} {`);

  /*
    Uuid пути -- первой строкой блока и всегда, включая raw: модуль пишет его
    в запись аудита как route.id, и по нему журнал схлопывает трафик маршрута.
    Имя блока для этого не годится: regex-путь переписывают, а история должна
    остаться той же. У черновика без uuid строки нет -- печатать нечего.
  */
  if (loc.id !== "") {
    lines.push(`${pad}    waf_route_id ${loc.id};`);
  }

  /*
    Пул решает за путь две вещи: схему `proxy_pass` и имя защищаемого сервера
    -- в рукопожатии и в `Host:`. Ищется он один раз на оба печатника: у
    `proxy_ssl_*` и у `proxy_pass` источник обязан быть общим, иначе путь
    уйдёт по https к узлу, которому назвались чужим именем.
  */
  const pool =
    loc.handler === "proxy" && loc.upstreamId !== undefined
      ? upstreams.find((u) => u.id === loc.upstreamId)
      : undefined;

  if (loc.raw) {
    lines.push(indentBlock(loc.rawNginx, indent + 1));
    store.scan(loc.rawNginx);
  } else {
    emitNginxLocation(lines, nginxFor(loc), loc.handler, indent + 1, pool);
    emitWafRoute(lines, wafFor(loc), inspectors, indent + 1, source.graph, "location");
    emitLocationHandler(lines, loc, upstreams, indent + 1);
  }

  lines.push(`${pad}}`);

  return { text: alignColumns(lines).join("\n") + "\n", storeRefs };
}

/*
 * Умолчания websocket-пути. Апгрейд без `Upgrade`/`Connection` и версии 1.1
 * не состоится, а `proxy_read_timeout` в минуту рвал бы молчащие соединения:
 * их держат часами. Свои значения пути старше -- это умолчания, а не замена.
 */
function nginxFor(loc: Location): NginxLocationSettings {
  if (loc.protocol !== "websocket") {
    return loc.nginx;
  }
  return {
    proxyHeaders: "websocket",
    proxyReadTimeoutMs: 3600000,
    ...loc.nginx,
  };
}

/*
 * Фазы ответа у websocket-пути нет: 101 без тела, держать нечего. Набор
 * инспекторов ответа печатается пустым, даже если сервер его задал --
 * унаследованный `waf_inspect response modsec` ждал бы вердикта на пустом
 * месте. Прочие ключи ответа на таком пути отвергает validateWafCompile.
 */
function wafFor(loc: Location): WafRouteSettings {
  if (loc.protocol !== "websocket") {
    return loc.waf;
  }
  return {
    ...loc.waf,
    responseInspectors: loc.waf.responseInspectors ?? "none",
    /*
     * Рукопожатие защищено по умолчанию: обычный GET на websocket-путь --
     * 426, сжатие не согласуется. Снять -- явным false и пустым списком.
     */
    requireUpgrade: loc.waf.requireUpgrade ?? true,
    requireUpgradeResponse:
      loc.waf.requireUpgradeResponse ??
      (loc.waf.requireUpgrade === false ? undefined : "upgrade_required"),
    wsStripExtensions: loc.waf.wsStripExtensions ?? ["permessage-deflate"],
  };
}

function locationMatch(match: string): string {
  switch (match) {
    case "exact": return "= ";
    case "regex": return "~ ";
    case "regex_i": return "~* ";
    case "named": return "@";
    case "prefix":
    default: return "";
  }
}

/**
 * Заголовок блока без скобки: `location = /healthz`. Им открывается сам блок,
 * и им же подписывается заглушка пути в превью сервера.
 */
export function locationHeader(loc: Pick<Location, "match" | "path">): string {
  const path = loc.match === "named" ? loc.path.replace(/^@/, "") : loc.path;
  return `location ${locationMatch(loc.match)}${path}`;
}

function emitNginxLocation(
  lines: string[],
  nginx: NginxLocationSettings,
  handler: string,
  indent: number,
  pool?: LocationUpstream,
): void {
  if (!nginx) return;
  const p = "    ".repeat(indent);
  if (nginx.clientMaxBodySize) lines.push(`${p}client_max_body_size ${nginx.clientMaxBodySize};`);
  if (nginx.root) lines.push(`${p}root ${nginx.root};`);
  if (nginx.alias) lines.push(`${p}alias ${nginx.alias};`);
  if (nginx.index && nginx.index.length > 0) lines.push(`${p}index ${nginx.index.join(" ")};`);
  if (nginx.ssi !== undefined) lines.push(`${p}ssi ${nginx.ssi ? "on" : "off"};`);
  if (nginx.ssiTypes && nginx.ssiTypes.length > 0) {
    lines.push(`${p}ssi_types ${nginx.ssiTypes.join(" ")};`);
  }
  if (nginx.tryFiles && nginx.tryFiles.length > 0) lines.push(`${p}try_files ${nginx.tryFiles.join(" ")};`);
  if (nginx.internal) lines.push(`${p}internal;`);

  if (nginx.allow) {
    for (const a of nginx.allow) lines.push(`${p}allow ${a};`);
  }
  if (nginx.deny) {
    for (const d of nginx.deny) lines.push(`${p}deny ${d};`);
  }

  if (nginx.addHeaders) {
    for (const h of nginx.addHeaders) {
      const always = h.always ? " always" : "";
      lines.push(`${p}add_header ${h.name} ${h.value}${always};`);
    }
  }

  if (handler === "proxy") {
    if (nginx.proxyConnectTimeoutMs !== undefined) {
      lines.push(`${p}proxy_connect_timeout ${durationMs(nginx.proxyConnectTimeoutMs)};`);
    }
    if (nginx.proxyReadTimeoutMs !== undefined) {
      lines.push(`${p}proxy_read_timeout ${durationMs(nginx.proxyReadTimeoutMs)};`);
    }
    if (nginx.proxySendTimeoutMs !== undefined) {
      lines.push(`${p}proxy_send_timeout ${durationMs(nginx.proxySendTimeoutMs)};`);
    }
    if (nginx.proxyBuffering !== undefined) {
      lines.push(`${p}proxy_buffering ${nginx.proxyBuffering ? "on" : "off"};`);
    }
    if (nginx.proxyRequestBuffering !== undefined) {
      lines.push(`${p}proxy_request_buffering ${nginx.proxyRequestBuffering ? "on" : "off"};`);
    }
    const version = proxyVersionFor(nginx.proxyHttpVersion, nginx.proxyHeaders);
    if (version !== undefined) {
      lines.push(`${p}proxy_http_version ${version};`);
    }
    emitProxySsl(lines, pool, p);
    emitProxyHeaders(lines, nginx, pool, p);
  }

  emitGzip(lines, nginx, p);
  emitRealIp(lines, nginx, p);
  emitLogs(lines, nginx, p);
}

/*
 * Рукопожатие с защищаемым сервером. `proxy_ssl_server_name` по умолчанию
 * выключено -- SNI не уходит вовсе, и узел за общим адресом (любой CDN)
 * обрывает разговор, не дойдя до запроса. `proxy_ssl_name` без своего
 * значения берётся из `proxy_pass`, то есть равно ИМЕНИ ПУЛА: сертификата
 * на имя `lalafo` не выпишет никто.
 */
function emitProxySsl(
  lines: string[],
  pool: LocationUpstream | undefined,
  p: string,
): void {
  if (pool?.tls !== true) return;
  lines.push(`${p}proxy_ssl_server_name on;`);
  const sni = upstreamSni(pool);
  if (sni !== undefined) {
    lines.push(`${p}proxy_ssl_name ${sni};`);
  }
}

/*
 * Заголовки к защищаемому серверу собираются в три слоя, и каждый следующий
 * правит предыдущий по имени, а не дописывается к нему: два
 * `proxy_set_header Host` в одном `location` уедут на провод двумя
 * заголовками.
 *
 *   пресет      -- standard/websocket; `custom` значит «только мой список»;
 *   свой список -- правки к пресету, а при `custom` -- он сам;
 *   Host пула   -- старше обоих: имя внешнего ресурса знает пул, а путь знает
 *                  лишь то, каким именем пришли к нам, и `Host $host` увёл бы
 *                  к чужому виртуальному серверу.
 *
 * Пустой итог -- пустой блок: уровень заголовков не задаёт и наследует набор
 * сервера, как это и делает nginx.
 */
function emitProxyHeaders(
  lines: string[],
  nginx: NginxLocationSettings,
  pool: LocationUpstream | undefined,
  p: string,
): void {
  const rows: ProxyHeader[] = presetProxyHeaders(nginx.proxyHeaders);
  for (const h of nginx.proxySetHeaders ?? []) {
    putProxyHeader(rows, h);
  }
  const host = pool === undefined ? undefined : upstreamHost(pool);
  if (host !== undefined) {
    // Единственный заголовок, который приходит не с пути: он же и первый.
    if (rows.some((row) => row.name.toLowerCase() === "host")) {
      putProxyHeader(rows, { name: "Host", value: host });
    } else {
      rows.unshift({ name: "Host", value: host });
    }
  }
  for (const h of rows) {
    lines.push(`${p}proxy_set_header ${h.name} ${h.value};`);
  }
}

function emitLocationHandler(
  lines: string[],
  loc: Location,
  upstreams: LocationUpstream[],
  indent: number,
): void {
  const p = "    ".repeat(indent);
  switch (loc.handler) {
    case "proxy":
      if (loc.upstreamId) {
        const pool = upstreams.find((u) => u.id === loc.upstreamId);
        const name = pool?.name ?? loc.upstreamId;
        const uri = loc.upstreamUri ?? "";
        // Схему держит пул: порт 443 сам по себе для nginx ничего не значит.
        const scheme = pool?.tls === true ? "https" : "http";
        lines.push(`${p}proxy_pass ${scheme}://${name}${uri};`);
      }
      break;
    case "return":
      /*
        Тела строкой у return нет: страницу отдаёт именованный путь, а этот
        только уводит на него через error_page. `=<код>` обязателен -- без
        него try_files на той стороне нашёл бы файл и ответил 200, см.
        docs/deny-pages.md. У 3xx всё иначе: там второй аргумент return --
        адрес, и никакой страницы быть не может.
      */
      if (loc.returnStatus) {
        const status = loc.returnStatus;
        const redirect = status >= 300 && status < 400;
        if (!redirect && loc.returnPage) {
          lines.push(`${p}error_page ${status} =${status} ${loc.returnPage};`);
        }
        const url = redirect && loc.returnUrl ? ` "${loc.returnUrl}"` : "";
        lines.push(`${p}return ${status}${url};`);
      }
      break;
    case "static":
      break;
  }
}
