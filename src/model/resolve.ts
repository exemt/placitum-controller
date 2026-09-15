import type {
  NginxHttpSettings,
  NginxLocationSettings,
  NginxServerSettings,
} from "./settings.ts";
import type { WafRouteSettings } from "./waf-route.ts";

export function resolveRoute(
  http: WafRouteSettings,
  server: WafRouteSettings,
  location: WafRouteSettings,
): WafRouteSettings {
  return { ...http, ...server, ...location };
}

export const NGINX_HTTP_TO_SERVER = [
  "clientMaxBodySize",
  "sslProtocols",
  "sslCiphers",
  "sslPreferServerCiphers",
  "sslSessionCache",
  "sslSessionTimeout",
  "realIpFrom",
  "realIpHeader",
  "realIpRecursive",
  "gzip",
  "gzipTypes",
  "gzipCompLevel",
  "gzipMinLength",
  "gzipVary",
  "accessLog",
  "errorLog",
] as const satisfies readonly (keyof NginxHttpSettings &
  keyof NginxServerSettings)[];

export const NGINX_HTTP_TO_LOCATION = [
  "clientMaxBodySize",
  "realIpFrom",
  "realIpHeader",
  "realIpRecursive",
  "addHeaders",
  "proxyHttpVersion",
  "proxyHeaders",
  "gzip",
  "gzipTypes",
  "gzipCompLevel",
  "gzipMinLength",
  "gzipVary",
  "accessLog",
  "errorLog",
] as const satisfies readonly (keyof NginxHttpSettings &
  keyof NginxLocationSettings)[];

export const NGINX_SERVER_TO_LOCATION = [
  "clientMaxBodySize",
  "root",
  "realIpFrom",
  "realIpHeader",
  "realIpRecursive",
  "gzip",
  "gzipTypes",
  "gzipCompLevel",
  "gzipMinLength",
  "gzipVary",
  "accessLog",
  "errorLog",
] as const satisfies readonly (keyof NginxServerSettings &
  keyof NginxLocationSettings)[];

export type InheritFrom = "http" | "server";
export type InheritSection = "waf" | "nginx";

export interface InheritedField {
  section: InheritSection;
  key: string;
  from: InheritFrom;
  value: unknown;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function pickDefined<T extends object, K extends keyof T>(
  doc: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = doc[key];
    if (present(value)) {
      out[key] = value;
    }
  }
  return out;
}

function fieldsFrom(
  section: InheritSection,
  from: InheritFrom,
  doc: object,
): InheritedField[] {
  return Object.entries(doc)
    .filter(([, value]) => present(value))
    .map(([key, value]) => ({ section, key, from, value }));
}

function overlayFields(
  into: Map<string, InheritedField>,
  fields: InheritedField[],
): void {
  for (const field of fields) {
    into.set(`${field.section}.${field.key}`, field);
  }
}

function sortedInherited(map: Map<string, InheritedField>): InheritedField[] {
  return [...map.values()].sort((a, b) => {
    if (a.section !== b.section) {
      return a.section === "waf" ? -1 : 1;
    }
    return a.key.localeCompare(b.key);
  });
}

const REGISTRY_KEYS = new Set(["inspectors", "inspectorProfiles"]);

function routeOnly(waf: WafRouteSettings): WafRouteSettings {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(waf)) {
    if (!REGISTRY_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out as WafRouteSettings;
}

export function inheritFromHttp(
  httpWaf: WafRouteSettings,
  httpNginx: NginxHttpSettings,
): InheritedField[] {
  const map = new Map<string, InheritedField>();
  overlayFields(map, fieldsFrom("waf", "http", routeOnly(httpWaf)));
  overlayFields(
    map,
    fieldsFrom("nginx", "http", pickDefined(httpNginx, NGINX_HTTP_TO_SERVER)),
  );
  return sortedInherited(map);
}

export function inheritFromHttpAndServer(
  httpWaf: WafRouteSettings,
  httpNginx: NginxHttpSettings,
  serverWaf: WafRouteSettings,
  serverNginx: NginxServerSettings,
): InheritedField[] {
  const map = new Map<string, InheritedField>();
  overlayFields(map, fieldsFrom("waf", "http", routeOnly(httpWaf)));
  overlayFields(
    map,
    fieldsFrom("nginx", "http", pickDefined(httpNginx, NGINX_HTTP_TO_LOCATION)),
  );
  overlayFields(map, fieldsFrom("waf", "server", serverWaf));
  overlayFields(
    map,
    fieldsFrom(
      "nginx",
      "server",
      pickDefined(serverNginx, NGINX_SERVER_TO_LOCATION),
    ),
  );
  return sortedInherited(map);
}
