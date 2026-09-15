import type { LogLevel } from "../inspector-settings.ts";
import type { Uuid } from "./id.ts";
import type { NginxHttpSettings, NginxMainSettings, WafHttpSettings } from "./settings.ts";
import type { WafRouteSettings } from "./waf-route.ts";

export interface HttpSpace {
  id: Uuid;
  name: string;
  nginxMain: NginxMainSettings;
  nginx: NginxHttpSettings;
  wafHttp: WafHttpSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
  createdAt: Date;
  updatedAt: Date;
}

export type InspectorPhase = "request" | "response" | "frame";

export interface InspectorMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  subject: string;
  phases: InspectorPhase[];
  description?: string;
  docsUrl?: string;
  logLevel?: LogLevel;
  position?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Inspector extends InspectorMeta {
  conf?: string;
}

export const DATASET_KINDS = ["list", "content"] as const;

export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DEFAULT_DATASET_KIND: DatasetKind = "list";

export function isDatasetKind(value: string): value is DatasetKind {
  return (DATASET_KINDS as readonly string[]).includes(value);
}

export const DATASET_TYPES = ["string", "numeric", "ipv4", "ip"] as const;

export type DatasetType = (typeof DATASET_TYPES)[number];

export const DEFAULT_DATASET_TYPE: DatasetType = "ipv4";

export function isDatasetType(value: string): value is DatasetType {
  return (DATASET_TYPES as readonly string[]).includes(value);
}

export function nginxDatasetType(type: DatasetType): "cidr" | "string" {
  return type === "ipv4" || type === "ip" ? "cidr" : "string";
}

export const NGINX_MAX_DATASETS = 128;

export const TEXT_CONTENT_TYPES = ["text", "html", "json", "xml"] as const;

export function isTextContentType(name: string): boolean {
  return (TEXT_CONTENT_TYPES as readonly string[]).includes(name);
}

export interface ContentType {
  id: Uuid;
  name: string;
  mime: string;
  description: string;
}

export interface Dataset {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  kind: DatasetKind;
  type: DatasetType;
  contentTypeId?: Uuid;
  maxEntries: number;
  liveMax?: number;
  ttl?: string;
  hash?: boolean;
  entries?: string[];
  inNginx?: boolean;
  position?: number;
  active: boolean;
  builtin?: boolean;
  size: number;
  vars?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DatasetAddress {
  id: Uuid;
  datasetId: Uuid;
  address: string;
  ttlS: number;
  expiresAt?: Date;
  origin: string;
  reason: string;
}

export interface DatasetContent {
  datasetId: Uuid;
  name: string;
  body: Buffer;
  size: number;
  updatedAt: Date;
}

export interface DenyResponse {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  type: "http" | "grpc" | "websocket";
  spec: {
    status?: number;
    page?: string;
    message?: string;
    code?: number;
    reason?: string;
    params?: string[];
  };
}

export interface BodyStore {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  driver: "redis";
  spec: Record<string, string | number | boolean>;
}

export interface LogFormat {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  kind: "nginx";
  fields: string[];
  format: string;
}
