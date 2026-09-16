export interface AgentBatch {
  size?: number;
  timeoutMs?: number;
}

export type ArchiveKind = "headers" | "args" | "body";

export const ARCHIVE_KINDS: readonly ArchiveKind[] = ["headers", "args", "body"];

export interface AgentS3 {
  endpoint?: string;
  region?: string;
  buckets?: Partial<Record<ArchiveKind, string>>;
}

export interface AgentArchive {
  workers?: number;
  queue?: number;
  timeoutMs?: number;
  batch?: Partial<Record<ArchiveKind, AgentBatch>>;
}

export interface AgentSettings {
  s3?: AgentS3;
  archive?: AgentArchive;
}
