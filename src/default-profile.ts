import { isDeepStrictEqual } from "node:util";

import { RULE_SET_SEED } from "./compile/rule-set-seed.ts";

export const DEFAULT_PROFILE_NAME = "default";

export function isDefaultRename(current: string, next: unknown): boolean {
  return (
    current === DEFAULT_PROFILE_NAME &&
    typeof next === "string" &&
    next !== DEFAULT_PROFILE_NAME
  );
}

export const DEFAULT_DOC_BASELINE = {
  description: "Default profile",
  doc: {},
} as const;

export const DEFAULT_IP_BASELINE = {
  description: "Default profile: no rules, allow otherwise",
  rules: [],
  datasets: [],
  outcomes: [],
  defaultAction: "allow",
  defaultCode: "",
} as const;

const shippedRuleSet = RULE_SET_SEED.find((set) => set.name === DEFAULT_PROFILE_NAME);

if (shippedRuleSet === undefined) {
  throw new Error("rule set seed has no default");
}

export const DEFAULT_RULE_SET_BASELINE = {
  description: shippedRuleSet.description,
  files: shippedRuleSet.files,
  dataFiles: [] as string[],
};

export function ipDiffersFromBaseline(row: {
  description: string;
  rules: readonly unknown[];
  datasets: readonly unknown[];
  outcomes: readonly unknown[];
  defaultAction: string;
  defaultCode: string;
}): boolean {
  return (
    row.description !== DEFAULT_IP_BASELINE.description ||
    row.rules.length > 0 ||
    row.datasets.length > 0 ||
    row.outcomes.length > 0 ||
    row.defaultAction !== DEFAULT_IP_BASELINE.defaultAction ||
    row.defaultCode !== DEFAULT_IP_BASELINE.defaultCode
  );
}

export function ruleSetDiffersFromBaseline(
  description: string,
  files: readonly string[],
  dataFiles: readonly string[],
  policyEmpty: boolean,
): boolean {
  return (
    description !== DEFAULT_RULE_SET_BASELINE.description ||
    !isDeepStrictEqual([...files], [...DEFAULT_RULE_SET_BASELINE.files]) ||
    dataFiles.length > 0 ||
    !policyEmpty
  );
}

export function docDiffersFromBaseline(
  description: string,
  doc: unknown,
  normalize: (raw: unknown) => unknown,
): boolean {
  return (
    description !== DEFAULT_DOC_BASELINE.description ||
    !isDeepStrictEqual(normalize(doc), normalize(DEFAULT_DOC_BASELINE.doc))
  );
}
