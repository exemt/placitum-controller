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

/**
 * Эффекты модели. Listener вызывает их после того, как редьюсер принял
 * закоммиченную строку. Сюда потом встанет публикация в шину; nginx `send`
 * отсюда не вызывают: сохранить черновик ≠ разослать поколение.
 */
/** Ответ keeper на событие записи (docs/spec.md репозитория keeper). */
export interface KeeperReply {
  ok: boolean;
  error?: string;
  seq?: number;
  epoch?: string;
  limit?: number;
}

export interface ModelBus {
  hydrated(): void;
  /**
   * Определение набора создано, изменено или снято. Докладывается keeper
   * (docs/spec.md репозитория keeper): он перечитывает набор и раздаёт зеркалам новую эпоху.
   */
  datasetChanged(event: {
    op: "upsert" | "delete";
    spaceId: string;
    dataset: Dataset;
  }): void;
  /**
   * Запись в активный набор -- через keeper, с ответом. Состав активных
   * наборов контроллер не пишет: keeper кладёт запись в Postgres сам, а
   * панель читает её оттуда.
   */
  datasetWrite(
    name: string,
    op: "add" | "remove",
    value: string,
    ttlS: number | undefined,
    /** hashed -- значение уже md5: у набора с hash=md5 keeper не считает его снова. */
    meta: { origin?: string; reason?: string; hashed?: boolean },
  ): Promise<KeeperReply>;
  /** Дерево/каталог, из которого собирается шаблон. До `send` на агентов не едет. */
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
