import type { ModsecPolicy } from "../modsec-policy-doc.ts";

import type { Uuid } from "./id.ts";

export interface RuleFile {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  textRaw: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleFileMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleSet {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  files: RuleSetMember[];
  data: RuleSetDataFile[];
  policy: ModsecPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleSetMember {
  fileId: Uuid;
  name: string;
}

export interface RuleSetDataFile {
  datasetId: Uuid;
  name: string;
  file: string;
}

export interface RuleSetMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  files: number;
  createdAt: Date;
  updatedAt: Date;
}
