/**
 * Причина отказа компилятора словами панели. Контроллер отвечает кодом и
 * английской строкой; перевод есть у кодов, где оператору нужно не только
 * «что сломано», но и «что делать», -- остальные идут как пришли.
 *
 * Один на превью и полосу канала: одна причина не должна читаться по-разному
 * в двух местах экрана.
 */

import type { ChannelPlanError } from "./api.ts";
import type { Translate } from "./i18n/index.ts";

export function compileErrorText(t: Translate, row: ChannelPlanError): string {
  if (row.code === "datasets_too_many" && row.params !== undefined) {
    return t("compileErrors.datasetsTooMany", row.params);
  }
  return row.message;
}
