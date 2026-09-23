import type { DenyResponse, Inspector } from "../model/http-space.ts";
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
  WafCompileError,
} from "./nginx-emit.ts";
import { compileLocation, locationHeader, type LocationUpstream } from "./nginx-location.ts";

export interface ServerCompileSource {
  server: Server;
  listens?: (ServerPort & { port: Port })[];
  certificates?: (ServerCertificate & { certificate: Certificate })[];
  locations?: Location[];
  inspectors?: Inspector[];
  upstreams?: LocationUpstream[];
  denyResponses?: DenyResponse[];
  indent?: number;
  store?: StoreRefs;
  graph?: Record<string, InspectorDecl>;
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
    const denyCodes =
      s.nginx?.denyPages === false ? [] : denyPageCodes(source.denyResponses ?? []);
    if (denyCodes.length > 0) {
      checkDenyPagesPath(source.locations ?? []);
    }
    emitNginxServer(lines, s.nginx, inner);
    emitDenyPageErrors(lines, denyCodes, inner);
    emitWafRoute(lines, s.waf, inspectors, inner, source.graph, "server");

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
        serverUpstreamId: s.upstreamId,
        indent: inner,
        store,
        graph: source.graph,
      });
      lines.push("");
      appendBlock(lines, compiled.text);
    }

    if (denyCodes.length > 0) {
      lines.push("");
      const own = Object.keys(denyPageFilesOf(s)).length > 0 ? denyPagesVar(s.id) : undefined;
      emitDenyPagesLocation(lines, inner, own);
    }
  }

  lines.push(`${pad}}`);
  return { text: alignColumns(lines).join("\n") + "\n", storeRefs };
}

// Deny pages of the server: the codes of the catalog's http records go through error_page into the
// internal path /waf/deny/, where nginx serves the page of the record from the pages directory of
// the node, or the shipped page of the code when the record has none ($waf_deny_fallback comes with
// the catalog in http {}). On unless the server says otherwise; nothing without a catalog. The URI
// form rather than a named location: on the way nginx turns the method into GET, while in a named
// location a static file answers POST with 405.
export const DENY_PAGES_PATH = "/waf/deny/";

export function denyPageCodes(responses: readonly DenyResponse[]): number[] {
  const codes = new Set<number>();
  for (const dr of responses) {
    if (dr.type !== "http") continue;
    const status = dr.spec.status ?? 403;
    // 5xx besides 503 nginx answers itself when the application is down: a deny page there would lie.
    if ((status >= 400 && status < 500) || status === 503) codes.add(status);
  }
  return [...codes].sort((a, b) => a - b);
}

function checkDenyPagesPath(locations: readonly Location[]): void {
  const taken = locations.find(
    (loc) => loc.enabled && loc.match !== "named" && loc.path === DENY_PAGES_PATH,
  );
  if (taken !== undefined) {
    throw new WafCompileError(
      "deny_pages_path_taken",
      `location ${DENY_PAGES_PATH} belongs to the deny pages of the server: move the path or turn deny_pages off`,
    );
  }
}

function emitDenyPageErrors(lines: string[], codes: readonly number[], indent: number): void {
  const p = "    ".repeat(indent);
  for (const code of codes) {
    lines.push(`${p}error_page ${code} =${code} ${DENY_PAGES_PATH};`);
  }
}

// Own pages of a server: catalog record -> content dataset of the space. The map by $waf_deny_name
// is printed in http {} under a name of the server's own, and the location looks there first.
export function denyPageFilesOf(server: Pick<Server, "nginx">): Record<string, string> {
  if (server.nginx?.denyPages === false) return {};
  const files: Record<string, string> = {};
  for (const [name, file] of Object.entries(server.nginx?.denyPageFiles ?? {})) {
    if (typeof file === "string" && file !== "") files[name] = file;
  }
  return files;
}

export function denyPagesVar(serverId: string): string {
  return `$waf_deny_page_${serverId.replace(/-/g, "").slice(0, 12)}`;
}

function emitDenyPagesLocation(lines: string[], indent: number, own?: string): void {
  const p = "    ".repeat(indent);
  const q = "    ".repeat(indent + 1);
  const first = own === undefined ? "" : `/${own}.html /${own}.json `;
  lines.push(
    `${p}location = ${DENY_PAGES_PATH} {`,
    `${q}internal;`,
    `${q}waf off;`,
    `${q}ssi on;`,
    `${q}ssi_types *;`,
    `${q}root pages:;`,
    `${q}try_files ${first}/$waf_deny_name.html /$waf_deny_name.json /$waf_deny_fallback.html =404;`,
    `${p}}`,
  );
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
    if (cert.keyStoreId) {
      lines.push(`${p}ssl_certificate_key ${store.path(cert.keyStoreId)};`);
    }
    if (cert.chainStoreId) {
      lines.push(`${p}ssl_trusted_certificate ${store.path(cert.chainStoreId)};`);
    }
  } else if (sc.kind === "client_ca") {
    lines.push(`${p}ssl_client_certificate ${store.path(cert.certStoreId)};`);
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
