import { createHash } from "node:crypto";

import {
  type IpCompileMatch,
  type IpCompileOutcome,
  type IpCompileProfile,
  type IpCompileRule,
  type IpCompileSet,
  type IpCompileSource,
  checkIp,
} from "./ip.ts";
import {
  hashInspectorSettings,
  parseInspectorSettings,
  type InspectorSettings,
} from "../inspector-settings.ts";
import type { RecordObject } from "../model/actions.ts";
import { blobKey } from "./pack.ts";
import { BLOB_PREFIX, BLOB_TTL_SEC } from "./pointer.ts";
import { sha256 } from "./zip.ts";

/**
 * Пак политики адреса: в KV указатель, тела -- в Redis по sha256.
 *
 * Живые наборы едут ссылкой (uuid + имя у keeper), а не составом: их
 * содержимое приезжает инспектору с keeper, и вторая копия разъехалась бы с
 * ним молча.
 *
 * Канон хеша обязан совпасть с инспектором байт в байт --
 * inspectors/ip/internal/desired/pack.go.
 */

export const IP_PACK_KEY = "policy/ip-pack";
export const IP_PACK_SUBJECT = "waf.desired.ip";
/** Срок блобов ip -- общий для всех поколений, см. BLOB_TTL_SEC. */
export const IP_BLOB_TTL_SEC = BLOB_TTL_SEC;
/** Имя процесса в каталоге инспекторов: чьи настройки едут в поколении. */
export const IP_PROCESS = "ip";

export interface IpPackSet {
  lists?: string[];
  live?: string[];
  countries?: string[];
  asns?: number[];
  inverse?: boolean;
  exclude?: IpPackMatch;
}

export interface IpPackMatch {
  lists?: string[];
  live?: string[];
  countries?: string[];
  asns?: number[];
}

export interface IpPackRule extends IpCompileRule {}

export interface IpPackProfile {
  rules: IpPackRule[];
  default?: string;
  default_code?: string;
  /* Последними: канон хеша старых поколений без них не меняется. */
  outcomes?: IpCompileOutcome[];
}

export interface IpPackPointer {
  v: 1;
  kind: "ip-pack";
  rev: number;
  sha256: string;
  prefix: string;
  lists: Record<string, string>;
  countries: Record<string, string>;
  asns: Record<string, string>;
  live: Record<string, string>;
  sets: Record<string, IpPackSet>;
  profiles: Record<string, IpPackProfile>;
  /** Настройки процесса из каталога; в паках прошлых поколений блока нет. */
  settings?: InspectorSettings;
  blobs: number;
  wrote: number;
  reused: number;
  bytes: number;
  ttl: number;
}

export interface PackedIp {
  sha256: string;
  lists: Record<string, string>;
  countries: Record<string, string>;
  asns: Record<string, string>;
  live: Record<string, string>;
  sets: Record<string, IpPackSet>;
  profiles: Record<string, IpPackProfile>;
  /** Настройки процесса из каталога: в канон входят, телом не едут. */
  settings?: InspectorSettings;
  blobs: Map<string, Buffer>;
  bytes: number;
}

function matchOf(match: IpCompileMatch): IpPackMatch {
  const out: IpPackMatch = {};

  if (match.lists.length !== 0) {
    out.lists = [...match.lists];
  }

  if (match.live.length !== 0) {
    out.live = [...match.live];
  }

  if (match.countries.length !== 0) {
    out.countries = [...match.countries];
  }

  if (match.asns.length !== 0) {
    out.asns = [...match.asns];
  }

  return out;
}

function setOf(set: IpCompileSet): IpPackSet {
  const out: IpPackSet = matchOf(set);

  if (set.inverse) {
    out.inverse = true;
  }

  const exclude = matchOf(set.exclude);

  if (Object.keys(exclude).length !== 0) {
    out.exclude = exclude;
  }

  return out;
}

function profileOf(profile: IpCompileProfile): IpPackProfile {
  const out: IpPackProfile = { rules: profile.rules };

  if (profile.default !== "" && profile.default !== undefined) {
    out.default = profile.default;
  }

  if (profile.defaultCode !== undefined && profile.defaultCode !== "") {
    out.default_code = profile.defaultCode;
  }

  if (profile.outcomes !== undefined && profile.outcomes.length !== 0) {
    out.outcomes = profile.outcomes;
  }

  return out;
}

/*
 * Канон поколения. Не JSON целиком по двум причинам: экранирование `<` и `&`
 * разъезжается между языками, а порядок ключей в объекте JS зависит от того,
 * как этот объект собрали. Хеш обязан совпасть с инспектором байт в байт, и
 * зависеть он должен от содержимого, а не от способа сборки.
 *
 * Поэтому наборы и правила пересобираются здесь в фиксированном порядке
 * полей -- том же, в каком их печатает Go
 * (inspectors/ip/internal/desired/pack.go). Пустое не пишется вовсе: там
 * `omitempty`.
 */
function canonMatch(match: IpPackMatch | undefined): Record<string, unknown> | undefined {
  if (match === undefined) {
    return undefined;
  }

  const out: Record<string, unknown> = {};

  if (match.lists !== undefined && match.lists.length !== 0) {
    out.lists = match.lists;
  }

  if (match.live !== undefined && match.live.length !== 0) {
    out.live = match.live;
  }

  if (match.countries !== undefined && match.countries.length !== 0) {
    out.countries = match.countries;
  }

  if (match.asns !== undefined && match.asns.length !== 0) {
    out.asns = match.asns;
  }

  return Object.keys(out).length === 0 ? undefined : out;
}

function canonSet(set: IpPackSet): Record<string, unknown> {
  const out = canonMatch(set) ?? {};

  if (set.inverse === true) {
    out.inverse = true;
  }

  const exclude = canonMatch(set.exclude);

  if (exclude !== undefined) {
    out.exclude = exclude;
  }

  return out;
}

function canonRule(rule: IpPackRule): Record<string, unknown> {
  /*
   * Порядок ключей -- канон хеша: тот же, что у полей структуры Rule в
   * инспекторе (set, dataset, not, action, ...). Условие ровно одно, пустое
   * не пишется вовсе.
   */
  const out: Record<string, unknown> = {};

  if (rule.set !== undefined && rule.set !== "") {
    out.set = rule.set;
  }

  if (rule.dataset !== undefined && rule.dataset !== "") {
    out.dataset = rule.dataset;
  }

  if (rule.not === true) {
    out.not = true;
  }

  out.action = rule.action;

  if (rule.response !== undefined && rule.response !== "") {
    out.response = rule.response;
  }

  if (rule.code !== undefined && rule.code !== "") {
    out.code = rule.code;
  }

  if (rule.to !== undefined && rule.to !== "") {
    out.to = rule.to;
  }

  if (rule.do !== undefined && rule.do !== "") {
    out.do = rule.do;
  }

  if (rule.apply !== undefined && rule.apply !== "") {
    out.apply = rule.apply;
  }

  if (rule.delta !== undefined) {
    out.delta = rule.delta;
  }

  if (rule.value !== undefined) {
    out.value = rule.value;
  }

  if (rule.counter !== undefined && rule.counter !== "") {
    out.counter = rule.counter;
  }

  if (rule.marker !== undefined && rule.marker !== "") {
    out.marker = rule.marker;
  }

  if (rule.group !== undefined && rule.group !== "") {
    out.group = rule.group;
  }

  if (rule.phase !== undefined && rule.phase !== "") {
    out.phase = rule.phase;
  }

  if (rule.side !== undefined && rule.side !== "") {
    out.side = rule.side;
  }

  /*
   * Объекты просьбы записи: порядок и здесь канон -- headers, args, body, --
   * и пустой объект не пишется вовсе.
   */
  for (const name of ["headers", "args", "body"] as const) {
    const item = rule[name];

    if (item !== undefined && item !== null) {
      out[name] = canonObject(item);
    }
  }

  if (rule.when !== undefined && rule.when.length !== 0) {
    out.when = [...rule.when];
  }

  if (rule.list !== undefined && rule.list !== "") {
    out.list = rule.list;
  }

  /*
   * Охват записи -- сразу за набором, как поле Write в Go. Адрес -- умолчание
   * загрузчика: его ключ не пишется вовсе, и канон прежних поколений не
   * меняется.
   */
  if (rule.write !== undefined && rule.write !== "" && rule.write !== "addr") {
    out.write = rule.write;
  }

  if (rule.ttl !== undefined && rule.ttl !== "") {
    out.ttl = rule.ttl;
  }

  return out;
}

/*
 * Порядок ключей инициатора закреплён каноном: тот же, что у полей структуры
 * Outcome в Go (on, to, do, ..., list, ttl, code), пустое не пишется вовсе.
 */
/* Объект просьбы записи: только названные поля, в порядке структуры Go. */
function canonObject(o: RecordObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (o.set !== "") {
    out.set = o.set;
  }

  if (o.limit !== null && o.limit !== 0) {
    out.limit = o.limit;
  }

  if (o.source !== "") {
    out.source = o.source;
  }

  return out;
}

function canonOutcome(outcome: IpCompileOutcome): Record<string, unknown> {
  const out: Record<string, unknown> = { on: outcome.on };

  if (outcome.to !== undefined && outcome.to !== "") {
    out.to = outcome.to;
  }

  if (outcome.do !== undefined && outcome.do !== "") {
    out.do = outcome.do;
  }

  if (outcome.apply !== undefined && outcome.apply !== "") {
    out.apply = outcome.apply;
  }

  if (outcome.delta !== undefined) {
    out.delta = outcome.delta;
  }

  if (outcome.value !== undefined) {
    out.value = outcome.value;
  }

  if (outcome.counter !== undefined && outcome.counter !== "") {
    out.counter = outcome.counter;
  }

  if (outcome.marker !== undefined && outcome.marker !== "") {
    out.marker = outcome.marker;
  }

  if (outcome.group !== undefined && outcome.group !== "") {
    out.group = outcome.group;
  }

  if (outcome.phase !== undefined && outcome.phase !== "") {
    out.phase = outcome.phase;
  }

  if (outcome.set !== undefined && outcome.set !== "") {
    out.set = outcome.set;
  }

  for (const name of ["headers", "args", "body"] as const) {
    const item = outcome[name];

    if (item !== undefined && item !== null) {
      out[name] = canonObject(item);
    }
  }

  if (outcome.when !== undefined && outcome.when.length !== 0) {
    out.when = [...outcome.when];
  }

  if (outcome.list !== undefined && outcome.list !== "") {
    out.list = outcome.list;
  }

  /* Охват -- как у правила: сразу за набором, адрес без ключа. */
  if (outcome.write !== undefined && outcome.write !== "" && outcome.write !== "addr") {
    out.write = outcome.write;
  }

  if (outcome.ttl !== undefined && outcome.ttl !== "") {
    out.ttl = outcome.ttl;
  }

  if (outcome.code !== undefined && outcome.code !== "") {
    out.code = outcome.code;
  }

  return out;
}

function canonProfile(profile: IpPackProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {
    rules: (profile.rules ?? []).map(canonRule),
  };

  if (profile.default !== undefined && profile.default !== "") {
    out.default = profile.default;
  }

  if (profile.default_code !== undefined && profile.default_code !== "") {
    out.default_code = profile.default_code;
  }

  if (profile.outcomes !== undefined && profile.outcomes.length !== 0) {
    out.outcomes = profile.outcomes.map(canonOutcome);
  }

  return out;
}

export function hashIpTree(
  lists: Record<string, string>,
  countries: Record<string, string>,
  asns: Record<string, string>,
  live: Record<string, string>,
  sets: Record<string, IpPackSet>,
  profiles: Record<string, IpPackProfile>,
  settings?: InspectorSettings,
): string {
  const digest = createHash("sha256");

  const writeMap = (label: string, map: Record<string, string>) => {
    digest.update(label);
    digest.update("\0");

    for (const key of Object.keys(map).sort()) {
      digest.update(key);
      digest.update("\0");
      digest.update(map[key]);
      digest.update("\0");
    }
  };

  writeMap("lists", lists);
  writeMap("countries", countries);
  writeMap("asns", asns);
  writeMap("live", live);

  digest.update("sets");
  digest.update("\0");

  for (const name of Object.keys(sets).sort()) {
    digest.update(name);
    digest.update("\0");
    digest.update(JSON.stringify(canonSet(sets[name])));
    digest.update("\0");
  }

  digest.update("profiles");
  digest.update("\0");

  for (const name of Object.keys(profiles).sort()) {
    digest.update(name);
    digest.update("\0");
    digest.update(JSON.stringify(canonProfile(profiles[name])));
    digest.update("\0");
  }

  /*
   * Настройки процесса -- последней секцией, и только когда блок есть: пак
   * без них хешируется как раньше (inspectors/ip/internal/desired/pack.go).
   */
  hashInspectorSettings(digest, settings);

  return `sha256:${digest.digest("hex")}`;
}

export function packIp(
  source: IpCompileSource,
  settings?: InspectorSettings,
): PackedIp {
  checkIp(source);

  const blobs = new Map<string, Buffer>();
  const lists: Record<string, string> = {};
  const countries: Record<string, string> = {};
  const asns: Record<string, string> = {};
  const live: Record<string, string> = {};
  const sets: Record<string, IpPackSet> = {};
  const profiles: Record<string, IpPackProfile> = {};

  function put(text: string): string {
    const buf = Buffer.from(text);
    const hash = sha256(buf);

    if (!blobs.has(hash)) {
      blobs.set(hash, buf);
    }

    return hash;
  }

  for (const file of source.files) {
    lists[file.id] = put(file.text);
  }

  for (const row of source.countries ?? []) {
    countries[row.code] = put(row.text);
  }

  for (const row of source.asns ?? []) {
    asns[String(row.asn)] = put(row.text);
  }

  for (const row of source.live ?? []) {
    live[row.id] = row.name;
  }

  for (const set of source.sets) {
    sets[set.name] = setOf(set);
  }

  for (const profile of source.profiles) {
    profiles[profile.name] = profileOf(profile);
  }

  let bytes = 0;
  for (const buf of blobs.values()) {
    bytes += buf.length;
  }

  return {
    sha256: hashIpTree(lists, countries, asns, live, sets, profiles, settings),
    lists,
    countries,
    asns,
    live,
    sets,
    profiles,
    ...(settings === undefined ? {} : { settings }),
    blobs,
    bytes,
  };
}

/**
 * Указатель поколения: то, что ложится в KV. Тела остаются в Redis, здесь
 * только имена, хеши и разметка.
 */
export function pointerOf(
  packed: PackedIp,
  rev: number,
  wrote: number,
  reused: number,
): IpPackPointer {
  return {
    v: 1,
    kind: "ip-pack",
    rev,
    sha256: packed.sha256,
    prefix: BLOB_PREFIX,
    lists: packed.lists,
    countries: packed.countries,
    asns: packed.asns,
    live: packed.live,
    sets: packed.sets,
    profiles: packed.profiles,
    ...(packed.settings === undefined ? {} : { settings: packed.settings }),
    blobs: packed.blobs.size,
    wrote,
    reused,
    bytes: packed.bytes,
    ttl: IP_BLOB_TTL_SEC,
  };
}

export function ipBlobItems(
  packed: PackedIp,
): { key: string; value: Buffer }[] {
  return [...packed.blobs.entries()].map(([hash, value]) => ({
    key: blobKey(hash),
    value,
  }));
}

export function jsonSendIpPack(row: IpPackPointer, took?: IpPackTook) {
  return {
    v: 1 as const,
    rev: row.rev,
    config_hash: row.sha256,
    profiles: Object.keys(row.profiles).sort(),
    sets: Object.keys(row.sets).length,
    lists: Object.keys(row.lists).length,
    live: Object.keys(row.live).length,
    countries: Object.keys(row.countries).length,
    asns: Object.keys(row.asns).length,
    blobs: row.blobs,
    wrote: row.wrote,
    reused: row.reused,
    bytes: row.bytes,
    ttl: row.ttl,
    ...(took ?? {}),
  };
}

export interface IpPackTook {
  load_ms: number;
  pack_ms: number;
  write_ms: number;
  redis_ms: number;
  kv_ms: number;
  total_ms: number;
}

export function parseIpPointer(input: unknown): IpPackPointer | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const row = input as Record<string, unknown>;

  if (
    row.v !== 1 ||
    row.kind !== "ip-pack" ||
    typeof row.rev !== "number" ||
    !Number.isInteger(row.rev) ||
    row.rev < 1 ||
    typeof row.sha256 !== "string" ||
    typeof row.prefix !== "string" ||
    typeof row.lists !== "object" ||
    row.lists === null ||
    typeof row.countries !== "object" ||
    row.countries === null ||
    typeof row.asns !== "object" ||
    row.asns === null ||
    typeof row.live !== "object" ||
    row.live === null ||
    typeof row.sets !== "object" ||
    row.sets === null ||
    typeof row.profiles !== "object" ||
    row.profiles === null ||
    typeof row.blobs !== "number" ||
    typeof row.wrote !== "number" ||
    typeof row.reused !== "number" ||
    typeof row.bytes !== "number" ||
    typeof row.ttl !== "number"
  ) {
    return null;
  }

  const lists = hashesOf(row.lists);
  const countries = hashesOf(row.countries);
  const asns = hashesOf(row.asns);
  const live = stringsOf(row.live);
  const sets = setsOf(row.sets);
  const profiles = profilesOf(row.profiles);
  const settings = parseInspectorSettings(row.settings);

  if (
    lists === null ||
    countries === null ||
    asns === null ||
    live === null ||
    sets === null ||
    profiles === null ||
    settings === null
  ) {
    return null;
  }

  return {
    v: 1,
    kind: "ip-pack",
    rev: row.rev,
    sha256: row.sha256,
    prefix: row.prefix,
    lists,
    countries,
    asns,
    live,
    sets,
    profiles,
    ...(settings === undefined ? {} : { settings }),
    blobs: row.blobs,
    wrote: row.wrote,
    reused: row.reused,
    bytes: row.bytes,
    ttl: row.ttl,
  };
}

export const IP_PACK_PREFIX = BLOB_PREFIX;

function hashesOf(value: object): Record<string, string> | null {
  const out: Record<string, string> = {};

  for (const [key, hash] of Object.entries(value)) {
    if (typeof hash !== "string" || !hash.startsWith("sha256:")) {
      return null;
    }

    out[key] = hash;
  }

  return out;
}

function stringsOf(value: object): Record<string, string> | null {
  const out: Record<string, string> = {};

  for (const [key, subject] of Object.entries(value)) {
    if (typeof subject !== "string") {
      return null;
    }

    out[key] = subject;
  }

  return out;
}

function setsOf(value: object): Record<string, IpPackSet> | null {
  const out: Record<string, IpPackSet> = {};

  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }

    out[name] = raw as IpPackSet;
  }

  return out;
}

function profilesOf(value: object): Record<string, IpPackProfile> | null {
  const out: Record<string, IpPackProfile> = {};

  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }

    const row = raw as { rules?: unknown };

    if (!Array.isArray(row.rules)) {
      return null;
    }

    out[name] = raw as IpPackProfile;
  }

  return out;
}
