import type { BodyStore, Dataset, DenyResponse, HttpSpace, Inspector, LogFormat } from "../model/http-space.ts";
import type { Certificate, Port, ServerCertificate, ServerPort } from "../model/listen.ts";
import type { Location } from "../model/location.ts";
import type { Server } from "../model/server.ts";

export interface Upstream {
  id: string;
  name: string;
  method: string;
  hashKey?: string;
  keepalive?: number;
  keepaliveRequests?: number;
  keepaliveTimeoutMs?: number;
  tls?: boolean;
  tlsName?: string;
  hostHeader?: string;
  peers: UpstreamPeer[];
}

export interface UpstreamPeer {
  host: string;
  port: number;
  weight: number;
  maxFails?: number;
  failTimeoutMs?: number;
  backup: boolean;
  down: boolean;
  resolve?: boolean;
}

export interface ServerExport {
  server: Server;
  listens: (ServerPort & { port: Port })[];
  certificates: (ServerCertificate & { certificate: Certificate })[];
  locations: Location[];
}

export interface ContentObjectExport {
  id: string;
  name: string;
  file: string;
  body: Buffer;
}

export interface InfraUrls {
  redisUrl?: string;
  redisInternalUrl?: string;
  natsUrl?: string;
  natsUser?: string;
  natsPass?: string;
  natsToken?: string;
}

export interface NginxExport {
  space: HttpSpace;
  inspectors: Inspector[];
  datasets: Dataset[];
  denyResponses: DenyResponse[];
  bodyStores: BodyStore[];
  logFormats: LogFormat[];
  upstreams: Upstream[];
  ports: Port[];
  certificates: Certificate[];
  servers: ServerExport[];
  contentObjects: ContentObjectExport[];
  infra?: InfraUrls;
}
