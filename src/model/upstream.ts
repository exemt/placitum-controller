import type { Uuid } from "./id.ts";

export const UPSTREAM_METHODS = [
  "round_robin",
  "least_conn",
  "ip_hash",
  "hash",
] as const;

export type UpstreamMethod = (typeof UPSTREAM_METHODS)[number];

export function isUpstreamMethod(value: string): value is UpstreamMethod {
  return (UPSTREAM_METHODS as readonly string[]).includes(value);
}

export interface Upstream {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  method: UpstreamMethod;
  hashKey?: string;
  keepalive?: number;
  keepaliveRequests?: number;
  keepaliveTimeoutMs?: number;
  tls?: boolean;
  tlsName?: string;
  hostHeader?: string;
}

export interface UpstreamPeer {
  id: Uuid;
  upstreamId: Uuid;
  host: string;
  port: number;
  weight: number;
  maxFails?: number;
  failTimeoutMs?: number;
  backup: boolean;
  down: boolean;
  resolve: boolean;
  position: number;
}

export interface UpstreamTree extends Upstream {
  peers: UpstreamPeer[];
}

export interface UpstreamWire {
  tls?: boolean;
  tlsName?: string;
  hostHeader?: string;
  peers?: readonly { host: string }[];
}

function soleHost(up: UpstreamWire): string | undefined {
  const hosts = new Set((up.peers ?? []).map((peer) => peer.host));
  const [first] = hosts;
  return hosts.size === 1 ? first : undefined;
}

export function upstreamSni(up: UpstreamWire): string | undefined {
  const own = up.tlsName?.trim();
  return own !== undefined && own !== "" ? own : soleHost(up);
}

export function upstreamHost(up: UpstreamWire): string | undefined {
  const own = up.hostHeader?.trim();
  if (own !== undefined && own !== "") {
    return own;
  }
  return up.tls === true ? upstreamSni(up) : undefined;
}
