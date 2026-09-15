import type { Uuid } from "./id.ts";

export const STORE_TYPES = [
  "certificate",
  "private_key",
  "chain",
  "ca",
  "crl",
  "creds",
  "dhparam",
  "deny_page",
  "other",
] as const;

export type StoreType = (typeof STORE_TYPES)[number];

export function isStoreType(value: string): value is StoreType {
  return (STORE_TYPES as readonly string[]).includes(value);
}

export interface StoreObject {
  id: Uuid;
  type: StoreType;
  metadata: Record<string, unknown>;
  blob: Buffer;
  createdAt: Date;
}

export interface StoreObjectMeta {
  id: Uuid;
  type: StoreType;
  metadata: Record<string, unknown>;
  size: number;
  createdAt: Date;
}
