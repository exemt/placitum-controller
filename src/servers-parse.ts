import type { LocationHandler, LocationMatch, LocationProtocol } from "./model/location.ts";
import { isLocationHandler, isLocationMatch, isLocationProtocol } from "./model/location.ts";
import { asUuid } from "./model/id.ts";
import type { NginxLocationSettings, NginxServerSettings } from "./model/settings.ts";
import type { WafRouteSettings } from "./model/waf-route.ts";
import type { LocationInsert, LocationPatch } from "./locations.ts";
import type { ServerInsert, ServerPatch } from "./servers.ts";
import {
  parseNginxLocation,
  parseNginxServer,
  parseRawPair,
  parseWaf,
  type ParseResult,
} from "./space-settings-parse.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(error: string): ParseResult<never> {
  return { ok: false, error };
}

function parseName(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return "bad";
  }
  const name = value.trim();
  return name.length === 0 ? "bad" : name;
}

function parseNames(value: unknown): string[] | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return "bad";
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return "bad";
    }
    const name = item.trim();
    if (name.length > 0 && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function parseBool(value: unknown): boolean | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : "bad";
}

function parseIntField(
  value: unknown,
  min: number,
): number | undefined | "bad" {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= min) {
    return value;
  }
  return "bad";
}

function parseOptUuid(value: unknown): string | null | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  return asUuid(value) ?? "bad";
}

function parseOptStr(value: unknown): string | null | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : "bad";
}

const RETURN_PAGE = /^(@[A-Za-z0-9_.-]+|\/[^\s;{}'"]*)$/;

function parseReturnPage(value: unknown): string | null | undefined | "bad" {
  const page = parseOptStr(value);
  if (page === "bad" || page === undefined || page === null) {
    return page;
  }
  const trimmed = page.trim();
  if (trimmed === "") {
    return null;
  }
  return RETURN_PAGE.test(trimmed) ? trimmed : "bad";
}

export function parseServerCreate(
  body: unknown,
  httpSpaceId: string,
): ParseResult<ServerInsert> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const serverNames = parseNames(body.server_names);
  if (serverNames === "bad" || serverNames === undefined || serverNames.length === 0) {
    return fail("invalid_server_names");
  }
  const name = parseName(body.name);
  if (name === "bad") {
    return fail("invalid_name");
  }
  const enabled = parseBool(body.enabled);
  if (enabled === "bad") {
    return fail("invalid_enabled");
  }
  const nginx =
    body.nginx === undefined ? { ok: true as const, value: {} } : parseNginxServer(body.nginx);
  if (!nginx.ok) {
    return nginx;
  }
  const waf = body.waf === undefined ? { ok: true as const, value: {} } : parseWaf(body.waf);
  if (!waf.ok) {
    return waf;
  }
  const raw = parseRawPair(body.raw, body.raw_nginx);
  if (!raw.ok) {
    return raw;
  }
  const upstreamId = parseOptUuid(body.upstream_id);
  if (upstreamId === "bad") {
    return fail("invalid_upstream_id");
  }
  return {
    ok: true,
    value: {
      httpSpaceId,
      name: name ?? serverNames[0],
      serverNames,
      enabled: enabled ?? true,
      ...(upstreamId === undefined || upstreamId === null ? {} : { upstreamId }),
      nginx: nginx.value,
      waf: waf.value,
      raw: raw.value?.raw ?? false,
      rawNginx: raw.value?.rawNginx ?? "",
    },
  };
}

export function parseServerPatch(body: unknown): ParseResult<ServerPatch> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const patch: ServerPatch = {};
  const name = parseName(body.name);
  if (name === "bad") {
    return fail("invalid_name");
  }
  if (name !== undefined) {
    patch.name = name;
  }
  const serverNames = parseNames(body.server_names);
  if (serverNames === "bad") {
    return fail("invalid_server_names");
  }
  if (serverNames !== undefined) {
    patch.serverNames = serverNames;
  }
  const enabled = parseBool(body.enabled);
  if (enabled === "bad") {
    return fail("invalid_enabled");
  }
  if (enabled !== undefined) {
    patch.enabled = enabled;
  }
  const upstreamId = parseOptUuid(body.upstream_id);
  if (upstreamId === "bad") {
    return fail("invalid_upstream_id");
  }
  if (upstreamId !== undefined) {
    patch.upstreamId = upstreamId;
  }
  if (body.nginx !== undefined) {
    const nginx = parseNginxServer(body.nginx);
    if (!nginx.ok) {
      return nginx;
    }
    patch.nginx = nginx.value;
  }
  if (body.waf !== undefined) {
    const waf = parseWaf(body.waf);
    if (!waf.ok) {
      return waf;
    }
    patch.waf = waf.value;
  }
  if (body.raw !== undefined || body.raw_nginx !== undefined) {
    const raw = parseRawPair(body.raw, body.raw_nginx);
    if (!raw.ok) {
      return raw;
    }
    if (raw.value !== undefined) {
      if (body.raw !== undefined) {
        patch.raw = raw.value.raw;
      }
      if (body.raw_nginx !== undefined) {
        patch.rawNginx = raw.value.rawNginx;
      }
    }
  }
  return { ok: true, value: patch };
}

function parseMatch(value: unknown): LocationMatch | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && isLocationMatch(value) ? value : "bad";
}

function parseProtocol(value: unknown): LocationProtocol | undefined | "bad" {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !isLocationProtocol(value)) {
    return "bad";
  }
  return value;
}

function parseHandler(value: unknown): LocationHandler | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && isLocationHandler(value) ? value : "bad";
}

export function parseLocationCreate(
  body: unknown,
  serverId: string,
): ParseResult<LocationInsert> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  if (typeof body.path !== "string" || body.path.trim().length === 0) {
    return fail("invalid_path");
  }
  const match = parseMatch(body.match);
  if (match === "bad") {
    return fail("invalid_match");
  }
  const handler = parseHandler(body.handler);
  if (handler === "bad") {
    return fail("invalid_handler");
  }
  const protocol = parseProtocol(body.protocol);
  if (protocol === "bad") {
    return fail("invalid_protocol");
  }
  const position = parseIntField(body.position, 0);
  if (position === "bad") {
    return fail("invalid_position");
  }
  const enabled = parseBool(body.enabled);
  if (enabled === "bad") {
    return fail("invalid_enabled");
  }
  const upstreamId = parseOptUuid(body.upstream_id);
  if (upstreamId === "bad") {
    return fail("invalid_upstream_id");
  }
  const upstreamUri = parseOptStr(body.upstream_uri);
  if (upstreamUri === "bad") {
    return fail("invalid_upstream_uri");
  }
  const returnStatus = parseIntField(body.return_status, 100);
  if (returnStatus === "bad" || (returnStatus !== undefined && returnStatus > 599)) {
    return fail("invalid_return_status");
  }
  const returnPage = parseReturnPage(body.return_page);
  if (returnPage === "bad") {
    return fail("invalid_return_page");
  }
  const returnUrl = parseOptStr(body.return_url);
  if (returnUrl === "bad") {
    return fail("invalid_return_url");
  }
  const nginx =
    body.nginx === undefined
      ? { ok: true as const, value: {} as NginxLocationSettings }
      : parseNginxLocation(body.nginx);
  if (!nginx.ok) {
    return nginx;
  }
  const waf =
    body.waf === undefined
      ? { ok: true as const, value: {} as WafRouteSettings }
      : parseWaf(body.waf);
  if (!waf.ok) {
    return waf;
  }
  const raw = parseRawPair(body.raw, body.raw_nginx);
  if (!raw.ok) {
    return raw;
  }

  const row: LocationInsert = {
    serverId,
    match: match ?? "prefix",
    path: body.path.trim(),
    position,
    enabled: enabled ?? true,
    handler: handler ?? "proxy",
    protocol: protocol ?? "http",
    nginx: nginx.value,
    waf: waf.value,
    raw: raw.value?.raw ?? false,
    rawNginx: raw.value?.rawNginx ?? "",
  };
  if (upstreamId !== undefined && upstreamId !== null) {
    row.upstreamId = upstreamId;
  }
  if (upstreamUri !== undefined && upstreamUri !== null && upstreamUri !== "") {
    row.upstreamUri = upstreamUri;
  }
  if (returnStatus !== undefined) {
    row.returnStatus = returnStatus;
  }
  if (returnPage !== undefined && returnPage !== null) {
    row.returnPage = returnPage;
  }
  if (returnUrl !== undefined && returnUrl !== null) {
    row.returnUrl = returnUrl;
  }
  return { ok: true, value: row };
}

export function parseLocationPatch(body: unknown): ParseResult<LocationPatch> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const patch: LocationPatch = {};
  if (body.path !== undefined) {
    if (typeof body.path !== "string" || body.path.trim().length === 0) {
      return fail("invalid_path");
    }
    patch.path = body.path.trim();
  }
  const match = parseMatch(body.match);
  if (match === "bad") {
    return fail("invalid_match");
  }
  if (match !== undefined) {
    patch.match = match;
  }
  const handler = parseHandler(body.handler);
  if (handler === "bad") {
    return fail("invalid_handler");
  }
  if (handler !== undefined) {
    patch.handler = handler;
  }
  const protocol = parseProtocol(body.protocol);
  if (protocol === "bad") {
    return fail("invalid_protocol");
  }
  if (protocol !== undefined) {
    patch.protocol = protocol;
  }
  const position = parseIntField(body.position, 0);
  if (position === "bad") {
    return fail("invalid_position");
  }
  if (position !== undefined) {
    patch.position = position;
  }
  const enabled = parseBool(body.enabled);
  if (enabled === "bad") {
    return fail("invalid_enabled");
  }
  if (enabled !== undefined) {
    patch.enabled = enabled;
  }
  const upstreamId = parseOptUuid(body.upstream_id);
  if (upstreamId === "bad") {
    return fail("invalid_upstream_id");
  }
  if (upstreamId !== undefined) {
    patch.upstreamId = upstreamId;
  }
  const upstreamUri = parseOptStr(body.upstream_uri);
  if (upstreamUri === "bad") {
    return fail("invalid_upstream_uri");
  }
  if (upstreamUri !== undefined) {
    patch.upstreamUri = upstreamUri;
  }
  if (body.return_status !== undefined) {
    if (body.return_status === null) {
      patch.returnStatus = null;
    } else {
      const status = parseIntField(body.return_status, 100);
      if (status === "bad" || status === undefined || status > 599) {
        return fail("invalid_return_status");
      }
      patch.returnStatus = status;
    }
  }
  const returnPage = parseReturnPage(body.return_page);
  if (returnPage === "bad") {
    return fail("invalid_return_page");
  }
  if (returnPage !== undefined) {
    patch.returnPage = returnPage;
  }
  const returnUrl = parseOptStr(body.return_url);
  if (returnUrl === "bad") {
    return fail("invalid_return_url");
  }
  if (returnUrl !== undefined) {
    patch.returnUrl = returnUrl;
  }
  if (body.nginx !== undefined) {
    const nginx = parseNginxLocation(body.nginx);
    if (!nginx.ok) {
      return nginx;
    }
    patch.nginx = nginx.value;
  }
  if (body.waf !== undefined) {
    const waf = parseWaf(body.waf);
    if (!waf.ok) {
      return waf;
    }
    patch.waf = waf.value;
  }
  if (body.raw !== undefined || body.raw_nginx !== undefined) {
    const raw = parseRawPair(body.raw, body.raw_nginx);
    if (!raw.ok) {
      return raw;
    }
    if (raw.value !== undefined) {
      if (body.raw !== undefined) {
        patch.raw = raw.value.raw;
      }
      if (body.raw_nginx !== undefined) {
        patch.rawNginx = raw.value.rawNginx;
      }
    }
  }
  return { ok: true, value: patch };
}

export type { NginxLocationSettings, NginxServerSettings };
