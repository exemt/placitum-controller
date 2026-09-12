/**
 * Компилятор сервера: listen, server_name, сертификаты, оверлеи и пути.
 * Пути печатает compileLocation. HTTP-компилятор вставляет этот блок
 * внутрь `http {}`.
 */

import type { Inspector } from "../model/http-space.ts";
import type { InspectorDecl } from "../model/waf-route.ts";
import type { Certificate, Port, ServerCertificate, ServerPort } from "../model/listen.ts";
import type { Location } from "../model/location.ts";
import type { Server } from "../model/server.ts";
import type { NginxServerSettings } from "../model/settings.ts";
import { alignColumns } from "./nginx-align.ts";
import {
  appendBlock,
  emitGzip,
  emitLogs,
  emitRealIp,
  emitWafRoute,
  includeStub,
  indentBlock,
  nestStore,
  type NestedBlocks,
  type NginxCompileResult,
  type StoreRefs,
} from "./nginx-emit.ts";
import { compileLocation, locationHeader, type LocationUpstream } from "./nginx-location.ts";

export interface ServerCompileSource {
  server: Server;
  listens?: (ServerPort & { port: Port })[];
  certificates?: (ServerCertificate & { certificate: Certificate })[];
  locations?: Location[];
  inspectors?: Inspector[];
  upstreams?: LocationUpstream[];
  /**
   * Уровней отступа по 4 пробела. 0 -- сам блок (тесты);
   * 1 -- внутри `http {}`.
   */
  indent?: number;
  store?: StoreRefs;
  graph?: Record<string, InspectorDecl>;
  /** Пути целиком (файл) или заглушками `include` по uuid (превью сервера). */
  nested?: NestedBlocks;
}

export function compileServer(source: ServerCompileSource): NginxCompileResult {
  const s = source.server;
  const inspectors = source.inspectors ?? [];
  const upstreams = source.upstreams ?? [];
  const indent = source.indent ?? 0;
  const storeRefs: string[] = [];
  const store = nestStore(storeRefs, source.store);

  const lines: string[] = [];
  const pad = "    ".repeat(indent);
  const inner = indent + 1;

  lines.push(`${pad}server {`);

  for (const lp of source.listens ?? []) {
    const addr = lp.port.address === "0.0.0.0" ? "" : `${lp.port.address}:`;
    const parts = [`${addr}${lp.port.port}`];
    if (lp.ssl || lp.port.ssl) parts.push("ssl");
    if (lp.http2 || lp.port.http2) parts.push("http2");
    if (lp.proxyProtocol || lp.port.proxyProtocol) parts.push("proxy_protocol");
    if (lp.defaultServer) parts.push("default_server");
    lines.push(`${"    ".repeat(inner)}listen ${parts.join(" ")};`);
  }

  if (s.serverNames.length > 0) {
    lines.push(`${"    ".repeat(inner)}server_name ${s.serverNames.join(" ")};`);
  }

  for (const sc of source.certificates ?? []) {
    emitServerCertificate(lines, sc, store, inner);
  }

  if (s.raw) {
    lines.push(indentBlock(s.rawNginx, inner));
    store.scan(s.rawNginx);
  } else {
    emitNginxServer(lines, s.nginx, inner);
    emitWafRoute(lines, s.waf, inspectors, inner, source.graph, "server");

    // Заглушки -- список, а не блоки: одна пустая строка перед ним, не между.
    let stubs = 0;
    for (const loc of source.locations ?? []) {
      if (source.nested === "include") {
        if (stubs === 0) lines.push("");
        stubs += 1;
        lines.push(
          `${"    ".repeat(inner)}${includeStub("location", loc.id, locationHeader(loc), loc.enabled)}`,
        );
        continue;
      }
      if (!loc.enabled) continue;
      const compiled = compileLocation({
        location: loc,
        inspectors,
        upstreams,
        indent: inner,
        store,
        graph: source.graph,
      });
      lines.push("");
      appendBlock(lines, compiled.text);
    }
  }

  lines.push(`${pad}}`);
  return { text: alignColumns(lines).join("\n") + "\n", storeRefs };
}

function emitServerCertificate(
  lines: string[],
  sc: ServerCertificate & { certificate: Certificate },
  store: StoreRefs,
  indent: number,
): void {
  const p = "    ".repeat(indent);
  const cert = sc.certificate;
  if (sc.kind === "server") {
    lines.push(`${p}ssl_certificate ${store.path(cert.certStoreId)};`);
    // keyStoreId у server-пары есть всегда (check-констрейнт в базе);
    // защита от строки, собранной в обход репозитория, -- в waf-validate.
    if (cert.keyStoreId) {
      lines.push(`${p}ssl_certificate_key ${store.path(cert.keyStoreId)};`);
    }
    if (cert.chainStoreId) {
      lines.push(`${p}ssl_trusted_certificate ${store.path(cert.chainStoreId)};`);
    }
  } else if (sc.kind === "client_ca") {
    lines.push(`${p}ssl_client_certificate ${store.path(cert.certStoreId)};`);
    // Список отзыва идёт вплотную к своему корню: nginx проверяет
    // предъявленный клиентом сертификат против ssl_client_certificate и
    // отсекает по ssl_crl. Без корня директива бессмысленна, поэтому она
    // живёт только в этой ветке.
    if (cert.crl !== undefined) {
      lines.push(`${p}ssl_crl ${store.path(cert.crl.storeId)};`);
    }
  } else if (sc.kind === "trusted") {
    lines.push(`${p}ssl_trusted_certificate ${store.path(cert.certStoreId)};`);
  }
}

function emitNginxServer(lines: string[], nginx: NginxServerSettings, indent: number): void {
  if (!nginx) return;
  const p = "    ".repeat(indent);
  if (nginx.clientMaxBodySize) lines.push(`${p}client_max_body_size ${nginx.clientMaxBodySize};`);
  if (nginx.root) lines.push(`${p}root ${nginx.root};`);
  if (nginx.charset) lines.push(`${p}charset ${nginx.charset};`);
  if (nginx.httpsRedirect) {
    lines.push(`${p}return 301 https://$host$request_uri;`);
  }
  if (nginx.sslProtocols && nginx.sslProtocols.length > 0) {
    lines.push(`${p}ssl_protocols ${nginx.sslProtocols.join(" ")};`);
  }
  if (nginx.sslCiphers) lines.push(`${p}ssl_ciphers ${nginx.sslCiphers};`);
  if (nginx.sslPreferServerCiphers !== undefined) {
    lines.push(`${p}ssl_prefer_server_ciphers ${nginx.sslPreferServerCiphers ? "on" : "off"};`);
  }
  if (nginx.sslSessionCache) lines.push(`${p}ssl_session_cache ${nginx.sslSessionCache};`);
  if (nginx.sslSessionTimeout) lines.push(`${p}ssl_session_timeout ${nginx.sslSessionTimeout};`);
  if (nginx.sslVerifyClient) lines.push(`${p}ssl_verify_client ${nginx.sslVerifyClient};`);
  if (nginx.sslVerifyDepth !== undefined) {
    lines.push(`${p}ssl_verify_depth ${nginx.sslVerifyDepth};`);
  }
  emitGzip(lines, nginx, p);
  emitRealIp(lines, nginx, p);
  emitLogs(lines, nginx, p);

  for (const h of nginx.addHeaders ?? []) {
    const always = h.always ? " always" : "";
    lines.push(`${p}add_header ${h.name} ${h.value}${always};`);
  }

  for (const ep of nginx.errorPages ?? []) {
    const status = ep.status === undefined ? "" : ` =${ep.status}`;
    lines.push(`${p}error_page ${ep.codes.join(" ")}${status} ${ep.target};`);
  }
}
