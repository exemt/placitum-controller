import {
  ARCHIVE_LIMIT_MAX,
  ASK_PHASES,
  POINTS_MAX,
  RECORD_OBJECTS,
  actionSpec,
  markerError,
  routeVerbs,
  type RecordObject,
} from "./actions.ts";

const COUNTER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

export interface Ask {
  do: string;
  to: string;
  apply: string;
  code?: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  set: string;
  ttlS: number;
  group?: string;
  phase?: string;
  when?: readonly string[];
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
}

export interface AskRules {
  fail: (message: string) => never;
  onDeny?: boolean;
  requireTo?: boolean;
  frame?: boolean;
  normalize?: boolean;
}

function checkRecordObject(
  at: string,
  o: RecordObject,
  fail: (message: string) => never,
): void {
  if (o.set !== "" && o.set !== "on" && o.set !== "off") {
    fail(`${at}.set must be on or off`);
  }

  if (o.limit !== null && (o.limit < 0 || o.limit > ARCHIVE_LIMIT_MAX)) {
    fail(`${at}.limit is out of 0..${ARCHIVE_LIMIT_MAX}`);
  }

  if (o.source !== "" && o.source !== "store" && o.source !== "original") {
    fail(`${at}.source must be store or original`);
  }
}

export function checkAsk(where: string, ask: Ask, rules: AskRules): void {
  const fail: (message: string) => never = rules.fail;
  const spec = actionSpec(ask.do);

  if (spec === undefined) {
    return fail(`${where}.do is not a verb of the actions channel`);
  }

  const record = spec.route === true;
  const writes = ask.do === "audit" || ask.do === "archive";

  if (rules.onDeny === true && !(routeVerbs() as string[]).includes(ask.do)) {
    fail(`${where}: deny ends the phase, an ask has nowhere to go`);
  }

  if (rules.requireTo === true && (ask.to === "" || ask.to === "*") && !record) {
    fail(`${where}: to is empty`);
  }

  const axis =
    ask.apply === "" && (spec.axes.length === 1 || writes) ? spec.axes[0] : ask.apply;

  if (axis === "" || !(spec.axes as readonly string[]).includes(axis)) {
    fail(`${where}: verb ${ask.do} does not take apply ${ask.apply}`);
  }

  if (axis === "conn" && rules.frame !== true) {
    fail(`${where}: apply conn is only for the frame phase`);
  }

  if (axis === "response" && rules.frame === true) {
    fail(`${where}: apply response is not for the frame phase: frames have no response record`);
  }

  if (rules.normalize === true) {
    ask.apply = axis;
  }

  if (spec.module === true && !record && (ask.to === "" || ask.to === "*")) {
    fail(`${where}: ${ask.do} needs to`);
  }

  checkPhase(where, ask, axis, spec.module === true && !record, fail);

  if (ask.delta !== null && ask.do !== "threshold") {
    fail(`${where}: delta is only for threshold`);
  }

  if (ask.delta !== null && (ask.delta < -100 || ask.delta > 900)) {
    fail(`${where}.delta is out of -100..900 percent`);
  }

  if (ask.do === "threshold" && (ask.delta === null || ask.delta === 0)) {
    fail(`${where}: threshold needs a non-zero delta`);
  }

  if (ask.value !== null && ask.do !== "note" && ask.do !== "score") {
    fail(`${where}: value is only for note and score`);
  }

  if (ask.value !== null && (ask.value < -POINTS_MAX || ask.value > POINTS_MAX)) {
    fail(`${where}.value is out of -100..100`);
  }

  if (ask.do === "note" && (ask.value === null || ask.value === 0)) {
    fail(`${where}: note needs a non-zero value`);
  }

  if (ask.do === "score") {
    if (ask.value === null || ask.value === 0) {
      fail(`${where}: score needs a non-zero value`);
    }

    if (ask.to !== "" && ask.to !== "*") {
      fail(`${where}: score takes no to: the module adds to the route's own sum`);
    }
  }

  if (ask.code !== undefined && ask.code !== "" && !CODE_RE.test(ask.code)) {
    fail(`${where}.code is not a valid reason code`);
  }

  if (ask.counter !== "") {
    if (ask.do !== "note") {
      fail(`${where}: counter is only for note`);
    }

    if (!COUNTER_NAME_RE.test(ask.counter)) {
      fail(`${where}: bad counter name "${ask.counter}"`);
    }
  }

  checkMutate(where, ask, rules);
  checkMarker(where, ask, fail);
  checkRecord(where, ask, axis, writes, rules);
}

function checkPhase(
  where: string,
  ask: Ask,
  axis: string,
  control: boolean,
  fail: (message: string) => never,
): void {
  const phase = ask.phase ?? "";

  if (phase === "") {
    return;
  }

  if (!control) {
    fail(`${where}: phase is only for active, passive, vote and off`);
  }

  if (!(ASK_PHASES as readonly string[]).includes(phase)) {
    fail(`${where}: phase must be request, response or frame, got "${phase}"`);
  }

  if (axis === "conn" && phase !== "frame") {
    fail(`${where}: apply conn needs phase frame`);
  }
}

function checkMutate(where: string, ask: Ask, rules: AskRules): void {
  if (ask.do !== "mutate") {
    if (ask.group !== undefined && ask.group !== "") {
      rules.fail(`${where}: group is only for mutate`);
    }

    return;
  }

  if (ask.group === undefined) {
    rules.fail(`${where}: this sender does not send mutate`);
  }

  if (ask.group === "") {
    rules.fail(`${where}: mutate needs a group`);
  } else if (!COUNTER_NAME_RE.test(ask.group)) {
    rules.fail(`${where}: bad group name "${ask.group}"`);
  }

  if (ask.set !== "on" && ask.set !== "off") {
    rules.fail(`${where}: mutate needs set: on or off`);
  }
}

function checkMarker(
  where: string,
  ask: Ask,
  fail: (message: string) => never,
): void {
  if (ask.do !== "mark") {
    if (ask.marker !== "") {
      fail(`${where}: marker is only for mark`);
    }

    return;
  }

  if (ask.to !== "" && ask.to !== "*") {
    fail(`${where}: mark takes no to: the module marks the route's own record`);
  }

  const bad = markerError(ask.marker);

  if (bad !== null) {
    fail(`${where}: ${bad}`);
  }
}

function checkRecord(
  where: string,
  ask: Ask,
  axis: string,
  writes: boolean,
  rules: AskRules,
): void {
  const { fail } = rules;
  const named = RECORD_OBJECTS.filter((name) => (ask[name] ?? null) !== null);

  if (!writes) {
    if (ask.set !== "" && ask.do !== "mutate") {
      fail(`${where}: set is only for audit and archive`);
    }

    if (named.length !== 0 || (ask.when ?? []).length !== 0) {
      fail(`${where}: when, headers, args and body are only for audit and archive`);
    }

    return;
  }

  if (ask.to !== "" && ask.to !== "*") {
    fail(`${where}: ${ask.do} takes no to: the module writes the route's own record`);
  }

  if (ask.set !== "on" && ask.set !== "off") {
    fail(`${where}: ${ask.do} needs set: on or off`);
  }

  const when = ask.when ?? [];

  if (ask.set === "off" && (ask.ttlS !== 0 || when.length !== 0 || named.length !== 0)) {
    fail(`${where}: ttl, when and objects are only for set on`);
  }

  if (ask.do === "audit" && (ask.ttlS !== 0 || when.length !== 0)) {
    fail(`${where}: ttl and when are only for archive`);
  }

  if (axis === "response" && (ask.args ?? null) !== null) {
    fail(`${where}: args has no meaning for the response record`);
  }

  for (const name of named) {
    checkRecordObject(`${where}.${name}`, ask[name] as RecordObject, fail);
  }
}
