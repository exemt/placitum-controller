import type { ChannelPlanError } from "./api.ts";
import type { Translate } from "./i18n/index.ts";

export function compileErrorText(t: Translate, row: ChannelPlanError): string {
  if (row.code === "datasets_too_many" && row.params !== undefined) {
    return t("compileErrors.datasetsTooMany", row.params);
  }
  return row.message;
}
