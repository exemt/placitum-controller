import type { Uuid } from "./id.ts";

export interface Port {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxyProtocol: boolean;
}

export interface ServerPort {
  id: Uuid;
  serverId: Uuid;
  portId: Uuid;
  ssl: boolean;
  http2: boolean;
  proxyProtocol: boolean;
  defaultServer: boolean;
}

export type CertificateType = "server" | "client_ca";

export interface CertificateRevocationList {
  storeId: Uuid;
  issuer: string;
  thisUpdate?: Date;
  nextUpdate?: Date;
  revoked?: number;
}

export interface Certificate {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  type: CertificateType;
  certStoreId: Uuid;
  keyStoreId?: Uuid;
  chainStoreId?: Uuid;
  sans: string[];
  notBefore?: Date;
  notAfter?: Date;
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
  crl?: CertificateRevocationList;
}

export type CertificateKind = "server" | "client_ca" | "trusted";

export const KIND_ACCEPTS: Record<CertificateKind, readonly CertificateType[]> = {
  server: ["server"],
  client_ca: ["client_ca"],
  trusted: ["client_ca", "server"],
};

export interface ServerCertificate {
  id: Uuid;
  serverId: Uuid;
  certificateId: Uuid;
  kind: CertificateKind;
}
