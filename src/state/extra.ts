import type { CertificateRepo } from "../certificates.ts";
import type { DatasetRepo } from "../datasets.ts";
import type { InspectorRepo } from "../inspectors.ts";
import type { LocationRepo } from "../locations.ts";
import type { Dataset } from "../model/http-space.ts";
import type { IpCountryRepo } from "../ip-countries.ts";
import type { IpProfileRepo } from "../ip-profiles.ts";
import type { RuleFileRepo } from "../rule-files.ts";
import type { RuleSetRepo } from "../rule-sets.ts";
import type { PortRepo } from "../ports.ts";
import type { ServerRepo } from "../servers.ts";
import type { SpaceRepo } from "../spaces.ts";
import type { UpstreamRepo } from "../upstreams.ts";
import { log } from "../log.ts";

export interface KeeperReply {
  ok: boolean;
  error?: string;
  seq?: number;
  epoch?: string;
  limit?: number;
}

export interface ModelBus {
  hydrated(): void;
  datasetChanged(event: {
    op: "upsert" | "delete";
    spaceId: string;
    dataset: Dataset;
  }): void;
  datasetWrite(
    name: string,
    op: "add" | "remove",
    value: string,
    ttlS: number | undefined,
    meta: { origin?: string; reason?: string; hashed?: boolean },
  ): Promise<KeeperReply>;
  draftChanged(event: { spaceId: string; reason: string }): void;
}

export interface ThunkExtra {
  spaces: SpaceRepo;
  datasets: DatasetRepo;
  inspectors: InspectorRepo;
  ruleFiles: RuleFileRepo;
  ruleSets: RuleSetRepo;
  ipCountries: IpCountryRepo;
  ipProfiles: IpProfileRepo;
  servers: ServerRepo;
  locations: LocationRepo;
  ports: PortRepo;
  certificates: CertificateRepo;
  upstreams: UpstreamRepo;
  bus: ModelBus;
}

export function logModelBus(): ModelBus {
  return {
    hydrated() {
      log("info", "model hydrated");
    },
    datasetChanged(event) {
      log("debug", "dataset changed", {
        op: event.op,
        space: event.spaceId,
        dataset: event.dataset.id,
      });
    },
    datasetWrite(name, op, value) {
      log("debug", "dataset write", { dataset: name, op, value });
      return Promise.resolve({ ok: true });
    },
    draftChanged(event) {
      log("debug", "draft changed", {
        space: event.spaceId,
        reason: event.reason,
      });
    },
  };
}
