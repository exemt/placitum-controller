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
    description: "Base CRS: XSS, SQLi, LFI, scanners",
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
    description: "CRS paranoia 2 plus extra scanners/LFI/RCE",
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
    description: "CRS XSS/SQLi with API rules on top",
    files: ["engine", "setup-pl1", "crs-init-api", "crs-941", "crs-942", "crs-949", "extra-api"],
  },
];
