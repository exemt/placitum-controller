import type { RecordObject } from "./actions.ts";
import type { Uuid } from "./id.ts";

export interface AskObjects {
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
}

export const emptyAskObjects = (): AskObjects => ({
  headers: null,
  args: null,
  body: null,
});

export const IP_COUNTRY_TYPES = ["v4", "v6"] as const;

export type IpCountryType = (typeof IP_COUNTRY_TYPES)[number];

export function isIpCountryType(value: string): value is IpCountryType {
  return (IP_COUNTRY_TYPES as readonly string[]).includes(value);
}

export interface IpCountry {
  id: Uuid;
  httpSpaceId: Uuid;
  code: string;
  type: IpCountryType;
  description: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpCountryAddress {
  id: Uuid;
  countryId: Uuid;
  address: string;
}

export const IP_ASN_TYPES = IP_COUNTRY_TYPES;

export type IpAsnType = IpCountryType;

export function isIpAsnType(value: string): value is IpAsnType {
  return isIpCountryType(value);
}

export interface IpAsn {
  id: Uuid;
  httpSpaceId: Uuid;
  asn: number;
  type: IpAsnType;
  description: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpAsnAddress {
  id: Uuid;
  asnId: Uuid;
  address: string;
}

export interface IpSetList {
  datasetId: Uuid;
  name: string;
  type: string;
  active: boolean;
}

export interface IpSetMatch {
  lists: IpSetList[];
  countries: string[];
  asns: number[];
}

export interface IpSet extends IpSetMatch {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  inverse: boolean;
  exclude: IpSetMatch;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpSetMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  lists: number;
  live: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const IP_RULE_ACTIONS = ["allow", "deny", "request", "list"] as const;

export type IpRuleAction = (typeof IP_RULE_ACTIONS)[number];

export function isIpRuleAction(value: string): value is IpRuleAction {
  return (IP_RULE_ACTIONS as readonly string[]).includes(value);
}

export function isTerminalAction(action: IpRuleAction): boolean {
  return action === "allow" || action === "deny";
}

export interface IpRule {
  id: Uuid;
  position: number;
  setId: Uuid | null;
  setName: string;
  datasetId: Uuid | null;
  datasetName: string;
  not: boolean;
  action: IpRuleAction;

  response: string;
  code: string;

  to: string;
  verb: string;
  axis: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  askGroup: string;
  askPhase?: string;
  askSet: string;
  askTtlS: number;
  askWhen: string[];
  askObjects: AskObjects;

  listDatasetId: Uuid | null;
  listName: string;
  listTtlS: number;
  listWrite: IpWrite;

  enabled: boolean;
}

export const IP_WRITES = ["addr", "net", "net_all", "asn"] as const;

export type IpWrite = (typeof IP_WRITES)[number];

export function isIpWrite(value: string): value is IpWrite {
  return (IP_WRITES as readonly string[]).includes(value);
}

export const IP_OUTCOME_ONS = ["white", "black", "none", "overload"] as const;

export type IpOutcomeOn = (typeof IP_OUTCOME_ONS)[number];

export function isIpOutcomeOn(value: string): value is IpOutcomeOn {
  return (IP_OUTCOME_ONS as readonly string[]).includes(value);
}

export interface IpOutcome {
  on: IpOutcomeOn;

  at: number;

  to: string;
  verb: string;
  axis: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  askGroup: string;
  askPhase?: string;
  askSet: string;
  askTtlS: number;
  askWhen: string[];
  askObjects: AskObjects;

  list: Uuid;
  listName?: string;
  ttlS: number;
  write?: IpWrite;

  code: string;
}

export const IP_DEFAULT_ACTIONS = ["allow", "deny"] as const;

export type IpDefaultAction = (typeof IP_DEFAULT_ACTIONS)[number];

export function isIpDefaultAction(value: string): value is IpDefaultAction {
  return (IP_DEFAULT_ACTIONS as readonly string[]).includes(value);
}

export interface IpProfile {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  rules: IpRule[];
  datasets: IpProfileDataset[];
  outcomes: IpOutcome[];
  defaultAction: IpDefaultAction;
  defaultCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpProfileDataset {
  id: Uuid;
  name: string;
  active: boolean;
}

export interface IpProfileMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  rules: number;
  createdAt: Date;
  updatedAt: Date;
}
