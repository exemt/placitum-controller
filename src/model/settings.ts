import type { AccessLog, ErrorLog } from "./log.ts";

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
  vars?: { name: string; value: string }[];
  bus?: {
    urls?: string[];
    name?: string;
    connectTimeoutMs?: number;
    reconnectWaitMs?: number;
    pingIntervalMs?: number;
    pendingMax?: string;
    payloadMax?: string;
    tls?: boolean;
    tlsCa?: string;
    tlsCert?: string;
    tlsKey?: string;
    creds?: string;
  };
  busFlushIntervalMs?: number;
  protocolVersions?: number[];
  replyMax?: string;
  headerValueMax?: string;
  maxInflight?: number;
  shmZone?: {
    name: string;
    size: string;
  };
  bodyMaxHolds?: number;
  bodyRemoteMinDeadlineMs?: number;
  agentSocket?: string;
}

export type ProxyHeaderPreset = "standard" | "websocket" | "none";

export interface NginxMainSettings {
  loadModules?: string[];
  workerProcesses?: number | "auto";
  workerRlimitNofile?: number;
  user?: string;
  pid?: string;
  errorLog?: string;
  errorLogShip?: boolean;
  events?: {
    workerConnections?: number;
    multiAccept?: boolean;
    use?: string;
  };
  includes?: string[];
}

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
  clientBodyTempPath?: string;
  largeClientHeaderBuffers?: { count: number; size: string };
  defaultType?: string;
  underscoresInHeaders?: boolean;
  ignoreInvalidHeaders?: boolean;
  mergeSlashes?: boolean;
  serverTokens?: boolean;
  serverNamesHashBucketSize?: string;
  serverNamesHashMaxSize?: string;
  typesHashBucketSize?: string;
  typesHashMaxSize?: string;
  resolver?: string[];
  resolverTimeoutMs?: number;
  realIpFrom?: string[];
  realIpHeader?: string;
  realIpRecursive?: boolean;
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
  addHeaders?: { name: string; value: string; always?: boolean }[];
  accessLog?: AccessLog;
  accessLogShip?: boolean;
  errorLog?: ErrorLog;
  includes?: string[];
}

export interface NginxServerSettings {
  clientMaxBodySize?: string;
  root?: string;
  charset?: string;
  httpsRedirect?: boolean;
  sslProtocols?: string[];
  sslCiphers?: string;
  sslPreferServerCiphers?: boolean;
  sslSessionCache?: string;
  sslSessionTimeout?: string;
  sslVerifyClient?: "on" | "off" | "optional";
  sslVerifyDepth?: number;
  realIpFrom?: string[];
  realIpHeader?: string;
  realIpRecursive?: boolean;
  gzip?: boolean;
  gzipTypes?: string[];
  gzipCompLevel?: number;
  gzipMinLength?: number;
  gzipVary?: boolean;
  accessLog?: AccessLog;
  errorLog?: ErrorLog;
  addHeaders?: { name: string; value: string; always?: boolean }[];
  errorPages?: { codes: number[]; status?: number; target: string }[];
  denyPages?: boolean;
  denyPageFiles?: Record<string, string>;
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
  ssi?: boolean;
  ssiTypes?: string[];
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
  gzip?: boolean;
  gzipTypes?: string[];
  gzipCompLevel?: number;
  gzipMinLength?: number;
  gzipVary?: boolean;
  accessLog?: AccessLog;
  errorLog?: ErrorLog;
}
