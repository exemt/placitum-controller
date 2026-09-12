import { asUuid } from "./model/id.ts";
import type { PortInsert, PortPatch } from "./ports.ts";
import type { ParseResult } from "./space-settings-parse.ts";

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

function parseAddress(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return "bad";
  }
  const address = value.trim();
  return address.length === 0 ? "bad" : address;
}

function parsePortNum(value: unknown): number | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    if (n >= 1 && n <= 65535) {
      return n;
    }
  }
  return "bad";
}

function parseBool(value: unknown): boolean | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : "bad";
}

export function parsePortCreate(
  body: unknown,
  httpSpaceId: string,
): ParseResult<PortInsert> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const name = parseName(body.name);
  if (name === undefined || name === "bad") {
    return fail("invalid_name");
  }
  const address = parseAddress(body.address);
  if (address === "bad") {
    return fail("invalid_address");
  }
  const port = parsePortNum(body.port);
  if (port === undefined || port === "bad") {
    return fail("invalid_port");
  }
  const ssl = parseBool(body.ssl);
  if (ssl === "bad") {
    return fail("invalid_ssl");
  }
  const http2 = parseBool(body.http2);
  if (http2 === "bad") {
    return fail("invalid_http2");
  }
  const proxyProtocol = parseBool(body.proxy_protocol);
  if (proxyProtocol === "bad") {
    return fail("invalid_proxy_protocol");
  }
  return {
    ok: true,
    value: {
      httpSpaceId,
      name,
      address: address ?? "0.0.0.0",
      port,
      ssl: ssl ?? false,
      http2: http2 ?? false,
      proxyProtocol: proxyProtocol ?? false,
    },
  };
}

export function parsePortPatch(body: unknown): ParseResult<PortPatch> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const patch: PortPatch = {};
  const name = parseName(body.name);
  if (name === "bad") {
    return fail("invalid_name");
  }
  if (name !== undefined) {
    patch.name = name;
  }
  const address = parseAddress(body.address);
  if (address === "bad") {
    return fail("invalid_address");
  }
  if (address !== undefined) {
    patch.address = address;
  }
  const port = parsePortNum(body.port);
  if (port === "bad") {
    return fail("invalid_port");
  }
  if (port !== undefined) {
    patch.port = port;
  }
  const ssl = parseBool(body.ssl);
  if (ssl === "bad") {
    return fail("invalid_ssl");
  }
  if (ssl !== undefined) {
    patch.ssl = ssl;
  }
  const http2 = parseBool(body.http2);
  if (http2 === "bad") {
    return fail("invalid_http2");
  }
  if (http2 !== undefined) {
    patch.http2 = http2;
  }
  const proxyProtocol = parseBool(body.proxy_protocol);
  if (proxyProtocol === "bad") {
    return fail("invalid_proxy_protocol");
  }
  if (proxyProtocol !== undefined) {
    patch.proxyProtocol = proxyProtocol;
  }
  return { ok: true, value: patch };
}

export function parseBindCreate(body: unknown): ParseResult<{
  portId: string;
  defaultServer: boolean;
}> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const portId = asUuid(body.port_id);
  if (portId === undefined) {
    return fail("invalid_port_id");
  }
  const defaultServer = parseBool(body.default_server);
  if (defaultServer === "bad") {
    return fail("invalid_default_server");
  }
  return {
    ok: true,
    value: { portId, defaultServer: defaultServer ?? false },
  };
}

export function parseBindPatch(body: unknown): ParseResult<{ defaultServer: boolean }> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const defaultServer = parseBool(body.default_server);
  if (defaultServer === undefined || defaultServer === "bad") {
    return fail("invalid_default_server");
  }
  return { ok: true, value: { defaultServer } };
}
