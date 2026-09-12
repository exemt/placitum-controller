/*
 * Состав наборов правил, как их ставит сид 012_rule_profiles.sql.
 *
 * Живёт отдельным модулем, потому что читателей двое: генератор сида
 * (`gen-profile-seed.ts`) и снимок поставки для кнопки «Восстановить»
 * (`../default-profile.ts`). Разъехавшись, они молча вернули бы default не в
 * то состояние, из которого он пришёл.
 */

export interface RuleSetSeed {
  id: string;
  name: string;
  description: string;
  files: string[];
}

export const RULE_SET_SEED: RuleSetSeed[] = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    name: "default",
    description: "Базовый CRS: XSS, SQLi, LFI, сканеры",
    files: [
      "engine",
      "setup-pl1",
      "crs-init",
      "crs-934",
      "crs-941",
      "crs-942",
      "crs-943",
      "crs-944",
      "crs-949",
      "extra-default",
    ],
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    name: "strict",
    description: "CRS паранойя 2 и доп. сканеры/LFI/RCE",
    files: [
      "engine",
      "setup-pl2",
      "crs-init",
      "crs-934",
      "crs-941",
      "crs-942",
      "crs-943",
      "crs-944",
      "crs-949",
      "extra-strict",
    ],
  },
  {
    id: "b0000000-0000-4000-8000-000000000003",
    name: "api",
    description: "CRS XSS/SQLi и правила API сверху",
    files: ["engine", "setup-pl1", "crs-init-api", "crs-941", "crs-942", "crs-949", "extra-api"],
  },
  {
    id: "b0000000-0000-4000-8000-000000000004",
    name: "allow",
    description: "Движок выключен",
    files: ["engine-allow"],
  },
  {
    id: "b0000000-0000-4000-8000-000000000005",
    name: "deny",
    description: "Отказ на любой запрос",
    files: ["engine-deny", "extra-deny"],
  },
];
