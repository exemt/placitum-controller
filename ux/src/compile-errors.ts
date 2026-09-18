import type { ChannelPlanError } from "./api.ts";
import type { Translate } from "./i18n/index.ts";

export function compileErrorText(t: Translate, row: ChannelPlanError): string {
  if (row.code === "datasets_too_many" && row.params !== undefined) {
    return t("compileErrors.datasetsTooMany", row.params);
  }
  if (row.code === "shm_zone_too_small" && row.params !== undefined) {
    return t("compileErrors.shmZoneTooSmall", row.params);
  }
  return row.message;
}
