import {
  isUpstreamMethod,
  type UpstreamMethod,
} from "./model/upstream.ts";
import type { ParseResult } from "./space-settings-parse.ts";
import type { UpstreamInsert, UpstreamPatch, UpstreamPeerInsert } from "./upstreams.ts";

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

function parseMethod(value: unknown): UpstreamMethod | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && isUpstreamMethod(value) ? value : "bad";
}

function parseOptStr(value: unknown): string | null | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return "bad";
  }
  const text = value.trim();
  return text.length === 0 ? null : text;
}

function parseOptInt(
  value: unknown,
  min: number,
): number | null | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= min) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= min) {
      return n;
    }
  }
  return "bad";
}

function parsePort(value: unknown): number | undefined | "bad" {
  const n = parseOptInt(value, 1);
  if (n === undefined) {
    return undefined;
  }
  if (n === null || n === "bad" || n > 65535) {
    return "bad";
  }
  return n;
}

function parseBool(value: unknown): boolean | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : "bad";
}

function parseHostName(value: unknown): string | null | undefined | "bad" {
  const text = parseOptStr(value);
  if (text === "bad" || text === null || text === undefined) {
    return text;
  }
  return /^[A-Za-z0-9._:-]+$/.test(text) ? text : "bad";
}

function parsePeer(value: unknown): UpstreamPeerInsert | "bad" {
  if (!isRecord(value)) {
    return "bad";
  }
  const host = parseName(value.host);
  if (host === undefined || host === "bad") {
    return "bad";
  }
  const port = parsePort(value.port);
  if (port === undefined || port === "bad") {
    return "bad";
  }
  const weight = parseOptInt(value.weight, 1);
  if (weight === "bad") {
    return "bad";
  }
  const maxFails = parseOptInt(value.max_fails, 0);
  if (maxFails === "bad") {
    return "bad";
  }
  const failTimeoutMs = parseOptInt(value.fail_timeout_ms, 0);
  if (failTimeoutMs === "bad") {
    return "bad";
  }
  const backup = parseBool(value.backup);
  if (backup === "bad") {
    return "bad";
  }
  const down = parseBool(value.down);
  if (down === "bad") {
    return "bad";
  }
  const resolve = parseBool(value.resolve);
  if (resolve === "bad") {
    return "bad";
  }
  const peer: UpstreamPeerInsert = {
    host,
    port,
    weight: weight ?? 1,
    backup: backup ?? false,
    down: down ?? false,
    resolve: resolve ?? false,
  };
  if (maxFails !== undefined && maxFails !== null) {
    peer.maxFails = maxFails;
  }
  if (failTimeoutMs !== undefined && failTimeoutMs !== null) {
    peer.failTimeoutMs = failTimeoutMs;
  }
  return peer;
}

function parsePeers(value: unknown): UpstreamPeerInsert[] | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return "bad";
  }
  const peers: UpstreamPeerInsert[] = [];
  for (const item of value) {
    const peer = parsePeer(item);
    if (peer === "bad") {
      return "bad";
    }
    peers.push(peer);
  }
  return peers;
}

function hashKeyFor(
  method: UpstreamMethod,
  hashKey: string | null | undefined,
): ParseResult<string | undefined> {
  if (method !== "hash") {
    return { ok: true, value: undefined };
  }
  if (hashKey === undefined || hashKey === null) {
    return fail("invalid_hash_key");
  }
  return { ok: true, value: hashKey };
}

export function parseUpstreamCreate(
  body: unknown,
  httpSpaceId: string,
): ParseResult<UpstreamInsert> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const name = parseName(body.name);
  if (name === undefined || name === "bad") {
    return fail("invalid_name");
  }
  const method = parseMethod(body.method);
  if (method === "bad") {
    return fail("invalid_method");
  }
  const hashKey = parseOptStr(body.hash_key);
  if (hashKey === "bad") {
    return fail("invalid_hash_key");
  }
  const keepalive = parseOptInt(body.keepalive, 0);
  if (keepalive === "bad") {
    return fail("invalid_keepalive");
  }
  const keepaliveRequests = parseOptInt(body.keepalive_requests, 0);
  if (keepaliveRequests === "bad") {
    return fail("invalid_keepalive_requests");
  }
  const keepaliveTimeoutMs = parseOptInt(body.keepalive_timeout_ms, 0);
  if (keepaliveTimeoutMs === "bad") {
    return fail("invalid_keepalive_timeout_ms");
  }
  const tls = parseBool(body.tls);
  if (tls === "bad") {
    return fail("invalid_tls");
  }
  const tlsName = parseHostName(body.tls_name);
  if (tlsName === "bad") {
    return fail("invalid_tls_name");
  }
  const hostHeader = parseHostName(body.host_header);
  if (hostHeader === "bad") {
    return fail("invalid_host_header");
  }
  const peers = parsePeers(body.peers);
  if (peers === "bad") {
    return fail("invalid_peers");
  }

  const resolved = method ?? "round_robin";
  const key = hashKeyFor(resolved, hashKey);
  if (!key.ok) {
    return key;
  }

  const row: UpstreamInsert = {
    httpSpaceId,
    name,
    method: resolved,
    peers: peers ?? [],
  };
  if (key.value !== undefined) {
    row.hashKey = key.value;
  }
  if (keepalive !== undefined && keepalive !== null) {
    row.keepalive = keepalive;
  }
  if (keepaliveRequests !== undefined && keepaliveRequests !== null) {
    row.keepaliveRequests = keepaliveRequests;
  }
  if (keepaliveTimeoutMs !== undefined && keepaliveTimeoutMs !== null) {
    row.keepaliveTimeoutMs = keepaliveTimeoutMs;
  }
  if (tls !== undefined) {
    row.tls = tls;
  }
  if (tlsName !== undefined && tlsName !== null) {
    row.tlsName = tlsName;
  }
  if (hostHeader !== undefined && hostHeader !== null) {
    row.hostHeader = hostHeader;
  }
  return { ok: true, value: row };
}

export function parseUpstreamPatch(body: unknown): ParseResult<UpstreamPatch> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const patch: UpstreamPatch = {};
  const name = parseName(body.name);
  if (name === "bad") {
    return fail("invalid_name");
  }
  if (name !== undefined) {
    patch.name = name;
  }
  const method = parseMethod(body.method);
  if (method === "bad") {
    return fail("invalid_method");
  }
  if (method !== undefined) {
    patch.method = method;
  }
  const hashKey = parseOptStr(body.hash_key);
  if (hashKey === "bad") {
    return fail("invalid_hash_key");
  }
  if (hashKey !== undefined) {
    patch.hashKey = hashKey;
  }
  if ((patch.method ?? "round_robin") === "hash" && body.method !== undefined) {
    const key = hashKeyFor("hash", hashKey);
    if (!key.ok) {
      return key;
    }
  }
  const keepalive = parseOptInt(body.keepalive, 0);
  if (keepalive === "bad") {
    return fail("invalid_keepalive");
  }
  if (keepalive !== undefined) {
    patch.keepalive = keepalive;
  }
  const keepaliveRequests = parseOptInt(body.keepalive_requests, 0);
  if (keepaliveRequests === "bad") {
    return fail("invalid_keepalive_requests");
  }
  if (keepaliveRequests !== undefined) {
    patch.keepaliveRequests = keepaliveRequests;
  }
  const keepaliveTimeoutMs = parseOptInt(body.keepalive_timeout_ms, 0);
  if (keepaliveTimeoutMs === "bad") {
    return fail("invalid_keepalive_timeout_ms");
  }
  if (keepaliveTimeoutMs !== undefined) {
    patch.keepaliveTimeoutMs = keepaliveTimeoutMs;
  }
  const tls = parseBool(body.tls);
  if (tls === "bad") {
    return fail("invalid_tls");
  }
  if (tls !== undefined) {
    patch.tls = tls;
  }
  const tlsName = parseHostName(body.tls_name);
  if (tlsName === "bad") {
    return fail("invalid_tls_name");
  }
  if (tlsName !== undefined) {
    patch.tlsName = tlsName;
  }
  const hostHeader = parseHostName(body.host_header);
  if (hostHeader === "bad") {
    return fail("invalid_host_header");
  }
  if (hostHeader !== undefined) {
    patch.hostHeader = hostHeader;
  }
  const peers = parsePeers(body.peers);
  if (peers === "bad") {
    return fail("invalid_peers");
  }
  if (peers !== undefined) {
    patch.peers = peers;
  }
  return { ok: true, value: patch };
}
