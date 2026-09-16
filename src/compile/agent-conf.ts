import { sha256 } from "./zip.ts";
import {
  ARCHIVE_KINDS,
  type AgentSettings,
  type ArchiveKind,
} from "../model/agent.ts";

export const AGENT_CONF_KEY = "policy/agent-conf";
export const AGENT_CONF_SUBJECT = "waf.desired.agent";

export interface AgentConfBatchWire {
  size?: number;
  timeout_ms?: number;
}

export interface AgentConfWire {
  s3?: {
    endpoint?: string;
    region?: string;
    buckets?: Partial<Record<ArchiveKind, string>>;
  };
  archive?: {
    workers?: number;
    queue?: number;
    timeout_ms?: number;
    batch?: Partial<Record<ArchiveKind, AgentConfBatchWire>>;
  };
}

export interface AgentConfPointer extends AgentConfWire {
  v: 1;
  kind: "agent-conf";
  rev: number;
  sha256: string;
}

export function agentConfWire(settings: AgentSettings): AgentConfWire {
  const out: AgentConfWire = {};

  if (settings.s3 !== undefined) {
    const s3: NonNullable<AgentConfWire["s3"]> = {};
    if (settings.s3.endpoint !== undefined) s3.endpoint = settings.s3.endpoint;
    if (settings.s3.region !== undefined) s3.region = settings.s3.region;
    if (settings.s3.buckets !== undefined) {
      const buckets: Partial<Record<ArchiveKind, string>> = {};
      for (const kind of ARCHIVE_KINDS) {
        const name = settings.s3.buckets[kind];
        if (name !== undefined) buckets[kind] = name;
      }
      if (Object.keys(buckets).length > 0) s3.buckets = buckets;
    }
    if (Object.keys(s3).length > 0) out.s3 = s3;
  }

  if (settings.archive !== undefined) {
    const archive: NonNullable<AgentConfWire["archive"]> = {};
    if (settings.archive.workers !== undefined) {
      archive.workers = settings.archive.workers;
    }
    if (settings.archive.queue !== undefined) {
      archive.queue = settings.archive.queue;
    }
    if (settings.archive.timeoutMs !== undefined) {
      archive.timeout_ms = settings.archive.timeoutMs;
    }
    if (settings.archive.batch !== undefined) {
      const batch: Partial<Record<ArchiveKind, AgentConfBatchWire>> = {};
      for (const kind of ARCHIVE_KINDS) {
        const policy = settings.archive.batch[kind];
        if (policy === undefined) continue;
        const row: AgentConfBatchWire = {};
        if (policy.size !== undefined) row.size = policy.size;
        if (policy.timeoutMs !== undefined) row.timeout_ms = policy.timeoutMs;
        batch[kind] = row;
      }
      if (Object.keys(batch).length > 0) archive.batch = batch;
    }
    if (Object.keys(archive).length > 0) out.archive = archive;
  }

  return out;
}

export function hashAgentConf(settings: AgentSettings): string {
  return sha256(Buffer.from(JSON.stringify(agentConfWire(settings)), "utf8"));
}

export function buildAgentConf(
  settings: AgentSettings,
  rev: number,
): AgentConfPointer {
  return {
    v: 1,
    kind: "agent-conf",
    rev,
    sha256: hashAgentConf(settings),
    ...agentConfWire(settings),
  };
}

export function parseAgentConfPointer(input: unknown): AgentConfPointer | null {
  if (typeof input !== "object" || input === null) return null;

  const row = input as Record<string, unknown>;

  if (
    row.v !== 1 ||
    row.kind !== "agent-conf" ||
    typeof row.rev !== "number" ||
    !Number.isInteger(row.rev) ||
    row.rev < 1 ||
    typeof row.sha256 !== "string"
  ) {
    return null;
  }

  return input as AgentConfPointer;
}

export function jsonAgentConf(pointer: AgentConfPointer): Record<string, unknown> {
  return { rev: pointer.rev, sha256: pointer.sha256 };
}
