export const ACTION_AXES = ["request", "response", "ip", "asn", "session", "conn"] as const;

export type ActionAxis = (typeof ACTION_AXES)[number];

export const ACTION_VERBS = [
  "challenge",
  "threshold",
  "skip",
  "reauth",
  "note",
  "mutate",
  "active",
  "passive",
  "off",
  "vote",
  "audit",
  "archive",
  "mark",
  "score",
] as const;

export type ActionVerb = (typeof ACTION_VERBS)[number];

export interface ActionParam {
  name: string;
  type: "int" | "bool" | "string" | "object";
  required: boolean;
  min?: number;
  max?: number;
  signed?: boolean;
}

export interface ActionSpec {
  do: ActionVerb;
  axes: readonly ActionAxis[];
  params: readonly ActionParam[];
  weakens: boolean;
  listeners: readonly string[];
  module?: boolean;
  route?: boolean;
  fromPassive?: boolean;
}

export const THRESHOLD_PERCENT_MIN = -100;
export const THRESHOLD_PERCENT_MAX = 900;

export const POINTS_MAX = 100;

export const ASK_PHASES = ["request", "response", "frame"] as const;

export type AskPhase = (typeof ASK_PHASES)[number];

const CONTROL_PARAMS: readonly ActionParam[] = [
  { name: "phase", type: "string", required: false },
];

export const ACTIONS: readonly ActionSpec[] = [
  {
    do: "challenge",
    axes: ["request"],
    weakens: false,
    params: [],
    listeners: ["captcha"],
  },
  {
    do: "threshold",
    axes: ["request"],
    weakens: true,
    params: [
      { name: "delta", type: "int", required: true, min: -1000, max: 1000, signed: true },
    ],
    listeners: ["modsec", "json", "vlai", "counter"],
  },
  {
    do: "skip",
    axes: ["request"],
    weakens: true,
    params: [],
    listeners: ["counter"],
  },
  { do: "reauth", axes: ["session"], params: [], weakens: false, listeners: ["auth"] },
  {
    do: "mutate",
    axes: ["request"],
    weakens: true,
    params: [
      { name: "group", type: "string", required: true },
      { name: "set", type: "string", required: true },
    ],
    listeners: ["rewrite"],
  },
  { do: "active", axes: ["request", "conn"], params: CONTROL_PARAMS, weakens: false, listeners: [], module: true },
  { do: "passive", axes: ["request", "conn"], params: CONTROL_PARAMS, weakens: true, listeners: [], module: true },
  { do: "vote", axes: ["request", "conn"], params: CONTROL_PARAMS, weakens: true, listeners: [], module: true },
  { do: "off", axes: ["request", "conn"], params: CONTROL_PARAMS, weakens: true, listeners: [], module: true },
  {
    do: "audit",
    axes: ["request", "response"],
    params: [
      { name: "set", type: "string", required: true },
      { name: "headers", type: "object", required: false },
      { name: "args", type: "object", required: false },
      { name: "body", type: "object", required: false },
    ],
    weakens: true,
    listeners: [],
    module: true,
    route: true,
    fromPassive: true,
  },
  {
    do: "archive",
    axes: ["request", "response"],
    params: [
      { name: "set", type: "string", required: true },
      { name: "ttl", type: "int", required: false, min: 0, max: 315360000 },
      { name: "when", type: "object", required: false },
      { name: "headers", type: "object", required: false },
      { name: "args", type: "object", required: false },
      { name: "body", type: "object", required: false },
    ],
    weakens: true,
    listeners: [],
    module: true,
    route: true,
    fromPassive: true,
  },
  {
    do: "mark",
    axes: ["request"],
    weakens: false,
    params: [{ name: "marker", type: "string", required: true }],
    listeners: [],
    module: true,
    route: true,
    fromPassive: true,
  },
  {
    do: "score",
    axes: ["request"],
    weakens: true,
    params: [
      { name: "value", type: "int", required: true, min: -1000, max: 1000, signed: true },
    ],
    listeners: [],
    module: true,
    route: true,
  },
  {
    do: "note",
    axes: ["request", "ip", "asn", "session"],
    weakens: true,
    params: [
      { name: "value", type: "int", required: false, min: -1000, max: 1000, signed: true },
      { name: "counter", type: "string", required: false },
    ],
    listeners: ["captcha", "counter"],
  },
];

export const ACTION_COMMON: readonly ActionParam[] = [
  { name: "to", type: "string", required: false },
  { name: "code", type: "string", required: false },
];


export interface RecordObject {
  set: "" | "on" | "off";
  limit: number | null;
  source: "" | "store" | "original";
}

export const MARKER_MAX_BYTES = 128;

export function markerError(marker: string): string | null {
  if (marker === "") {
    return "mark needs a marker";
  }

  if (new TextEncoder().encode(marker).length > MARKER_MAX_BYTES) {
    return `marker is longer than ${MARKER_MAX_BYTES} bytes`;
  }

  for (const ch of marker) {
    const code = ch.codePointAt(0) ?? 0;

    if (code < 0x20 || code === 0x7f) {
      return "marker has a control character";
    }
  }

  if (marker !== marker.trim()) {
    return "marker has a leading or trailing space";
  }

  return null;
}

export const RECORD_OBJECTS = ["headers", "args", "body"] as const;

export const ARCHIVE_LIMIT_MAX = 1073741824;

export const ARCHIVE_WHEN = ["allow", "deny"] as const;
export type ArchiveWhen = (typeof ARCHIVE_WHEN)[number];

export function axesFor(verbs: readonly string[]): ActionAxis[] {
  const out = new Set<ActionAxis>();

  for (const spec of ACTIONS) {
    if (!verbs.includes(spec.do)) {
      continue;
    }

    for (const axis of spec.axes) {
      out.add(axis);
    }
  }

  return ACTION_AXES.filter((axis) => out.has(axis));
}

export function actionSpec(verb: string): ActionSpec | undefined {
  return ACTIONS.find((spec) => spec.do === verb);
}

export function verbsFor(inspector: string): ActionVerb[] {
  return ACTIONS.filter(
    (spec) =>
      spec.module !== true &&
      (spec.listeners.length === 0 || spec.listeners.includes(inspector)),
  ).map((spec) => spec.do);
}

export function moduleVerbs(): ActionVerb[] {
  return ACTIONS.filter((spec) => spec.module === true).map((spec) => spec.do);
}

export function routeVerbs(): ActionVerb[] {
  return ACTIONS.filter((spec) => spec.route === true).map((spec) => spec.do);
}
