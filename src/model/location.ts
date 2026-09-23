import type { Uuid } from "./id.ts";
import type { NginxLocationSettings } from "./settings.ts";
import type { WafRouteSettings } from "./waf-route.ts";

export const LOCATION_MATCHES = [
  "prefix",
  "exact",
  "regex",
  "regex_i",
  "named",
] as const;

export type LocationMatch = (typeof LOCATION_MATCHES)[number];

export const LOCATION_HANDLERS = [
  "proxy",
  "static",
  "return",
] as const;

export type LocationHandler = (typeof LOCATION_HANDLERS)[number];

export function isLocationMatch(value: string): value is LocationMatch {
  return (LOCATION_MATCHES as readonly string[]).includes(value);
}

export function isLocationHandler(value: string): value is LocationHandler {
  return (LOCATION_HANDLERS as readonly string[]).includes(value);
}

export const LOCATION_PROTOCOLS = ["http", "websocket"] as const;

export type LocationProtocol = (typeof LOCATION_PROTOCOLS)[number];

export function isLocationProtocol(value: string): value is LocationProtocol {
  return (LOCATION_PROTOCOLS as readonly string[]).includes(value);
}

export interface Location {
  id: Uuid;
  serverId: Uuid;
  match: LocationMatch;
  path: string;
  position: number;
  enabled: boolean;
  handler: LocationHandler;
  protocol: LocationProtocol;
  upstreamId?: Uuid;
  upstreamUri?: string;
  returnStatus?: number;
  returnPage?: string;
  returnUrl?: string;
  staticFile?: string;
  nginx: NginxLocationSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
  builtin: boolean;
}
