export const OBJECTS = ["headers", "args", "body"] as const;
export type ObjectName = (typeof OBJECTS)[number];

export type ListTarget = "headers" | "args";
export const LIST_TARGETS = ["headers", "args"] as const;

export const ARCHIVE_OUTCOMES = ["allow", "deny"] as const;
export type ArchiveOutcome = (typeof ARCHIVE_OUTCOMES)[number];

function outcomeSet(words: readonly string[]): ArchiveOutcome[] {
  return ARCHIVE_OUTCOMES.filter((name) => words.includes(name));
}

export function whenSummaryKey(when: readonly ArchiveOutcome[]): string {
  if (when.length === 0) return "tail.whenSummaryAny";
  if (when.length === 2) return "tail.whenSummaryBoth";
  return when[0] === "deny" ? "tail.whenSummaryDeny" : "tail.whenSummaryAllow";
}

export function sameOutcomes(
  a: readonly ArchiveOutcome[] | undefined,
  b: readonly ArchiveOutcome[] | undefined,
): boolean {
  return (a ?? []).join(",") === (b ?? []).join(",");
}

export const TAIL_PHASES = ["request", "response", "frame:c2s", "frame:s2c"] as const;
export type TailPhase = (typeof TAIL_PHASES)[number];

export const NONE_PHASES: readonly TailPhase[] = ["request", "response"];

export const PHASE_OBJECTS: Record<TailPhase, readonly ObjectName[]> = {
  request: OBJECTS,
  response: ["headers", "body"],
  "frame:c2s": ["body"],
  "frame:s2c": ["body"],
};

export function splitPhaseLine(raw: string): { phase: TailPhase; rest: string } | null {
  const t = raw.trim();
  const first = t.split(/\s+/, 1)[0] ?? "";
  if (
    first === "request" ||
    first === "response" ||
    first === "frame:c2s" ||
    first === "frame:s2c"
  ) {
    return { phase: first, rest: t.slice(first.length).trim() };
  }
  if (first.startsWith("frame")) {
    return null;
  }
  return { phase: "request", rest: t };
}

export interface ObjectSpec {
  on: boolean;
  size?: string;
  item?: string;
  none?: boolean;
  /** source=sent: the record shows the delivered body after a rewrite. */
  sent?: boolean;
  send?: SendSource;
  ttl?: string;
  when?: readonly ArchiveOutcome[];
}

export type SendSource = "original" | "store";

export type ListName = "allow" | "mask" | "deny";

export interface TailModel {
  objects: Record<ObjectName, ObjectSpec>;
  allow: Partial<Record<ListTarget, string[]>>;
  mask: Partial<Record<ListTarget, string[]>>;
  deny: Partial<Record<ListTarget, string[]>>;
  off: boolean;
}

export function emptyTail(): TailModel {
  return {
    objects: {
      headers: { on: false },
      args: { on: false },
      body: { on: false },
    },
    allow: {},
    mask: {},
    deny: {},
    off: false,
  };
}

function isObject(word: string): word is ObjectName {
  return (OBJECTS as readonly string[]).includes(word);
}

function isListTarget(word: string): word is ListTarget {
  return (LIST_TARGETS as readonly string[]).includes(word);
}

export function parseTail(lines: unknown, phase: TailPhase = "request"): TailModel {
  const model = emptyTail();
  const rows = Array.isArray(lines)
    ? lines
        .filter((x): x is string => typeof x === "string")
        .map(splitPhaseLine)
        .filter((row): row is { phase: TailPhase; rest: string } => row !== null)
        .filter((row) => row.phase === phase)
        .map((row) => row.rest)
    : [];

  if (rows.length === 0) {
    return model;
  }

  for (const raw of rows) {
    const words = raw.split(/\s+/).filter((w) => w !== "");
    let i = 0;
    if (words[i] === "none" || words[i] === "off") {
      const cleared = emptyTail();
      cleared.off = true;
      return cleared;
    }
    let listTarget: ListTarget | undefined;

    const head = words[i];
    if (
      words.length - i === 2
      && isListTarget(head)
      && /^(allow|mask|deny)=/.test(words[i + 1] ?? "")
    ) {
      listTarget = head;
      i += 1;
    }

    let rowTtl: string | undefined;
    let rowWhen: ArchiveOutcome[] | undefined;
    let rowSent: boolean | undefined;
    const rowObjects: ObjectName[] = [];

    for (; i < words.length; i += 1) {
      const word = words[i];

      if (word.startsWith("ttl=")) {
        rowTtl = word.slice(4);
        continue;
      }
      if (word.startsWith("when=")) {
        const set = outcomeSet(
          word
            .slice(5)
            .split(",")
            .map((name) => name.trim()),
        );
        rowWhen = set.length > 0 ? set : undefined;
        continue;
      }
      if (word.startsWith("source=")) {
        rowSent = word === "source=sent";
        continue;
      }
      if (/^(allow|mask|deny)=/.test(word)) {
        // A named list is the consumer's own even when empty: mask=none and
        // allow=* set it, and own lists replace the capture lists.
        const eq = word.indexOf("=");
        const list = word.slice(0, eq) as ListName;
        const bag = model[list];
        const value = word.slice(eq + 1);
        const names =
          value === "none" || (list === "allow" && value === "*")
            ? []
            : value.split(",").map((n) => n.trim()).filter((n) => n !== "");
        const target = listTarget ?? "headers";
        bag[target] = [...(bag[target] ?? []), ...names];
        continue;
      }

      const [name, value] = word.split("=", 2);
      if (!isObject(name)) {
        continue;
      }
      listTarget = isListTarget(name) ? name : undefined;
      if (value !== "none") {
        rowObjects.push(name);
      }
      const spec = model.objects[name];

      if (value === "none") {
        model.objects[name] = { on: false, none: true };
        continue;
      }
      if (value === "original" || value === "store") {
        model.objects[name] = { on: true, send: value };
        continue;
      }
      const [size, item] = (value ?? "").split("/", 2);
      model.objects[name] = {
        ...spec,
        on: true,
        none: undefined,
        size: size === "" ? undefined : size,
        item: item === "" || item === undefined ? undefined : item,
      };
    }

    for (const name of rowObjects) {
      const spec = model.objects[name];
      model.objects[name] = {
        ...spec,
        ttl: rowTtl ?? spec.ttl,
        when: rowWhen ?? spec.when,
        sent: rowSent === undefined ? spec.sent : rowSent || undefined,
      };
    }
  }

  return model;
}

export type TailKind = "capture" | "archive" | "preview" | "send";

export function listNames(kind: TailKind): readonly ListName[] {
  if (kind === "send") return [];
  return kind === "capture" ? ["mask", "deny"] : ["allow", "mask", "deny"];
}

export function formatTail(
  model: TailModel,
  kind: TailKind,
  phase: TailPhase = "request",
): string[] {
  return formatPhaseless(model, kind, phase).map((line) =>
    phase === "request" ? line : `${phase} ${line}`,
  );
}

export function formatTails(
  models: Record<TailPhase, TailModel>,
  kind: TailKind,
): string[] {
  return TAIL_PHASES.flatMap((phase) => formatTail(models[phase], kind, phase));
}

interface Word {
  text: string;
  opts: string[];
}

function groupWords(words: Word[]): string[][] {
  const groups: { key: string; words: string[]; opts: string[] }[] = [];
  for (const word of words) {
    const key = word.opts.join(" ");
    const group = groups.find((g) => g.key === key);
    if (group === undefined) {
      groups.push({ key, words: [word.text], opts: word.opts });
    } else {
      group.words.push(word.text);
    }
  }
  return groups.map((g) => [...g.words, ...g.opts]);
}

function formatPhaseless(model: TailModel, kind: TailKind, phase: TailPhase): string[] {
  if (model.off) {
    return [];
  }

  if (kind === "send") {
    const words: string[] = [];
    for (const name of PHASE_OBJECTS[phase]) {
      const spec = model.objects[name];
      if (spec.on && spec.send !== undefined) {
        words.push(`${name}=${spec.send}`);
      }
    }
    return words.length > 0 ? [words.join(" ")] : [];
  }

  const out: string[] = [];
  const words: Word[] = [];

  // ttl, when and source are properties of the object, not of the line:
  // objects that share them share a line.
  const paramsOf = (name: ObjectName, spec: ObjectSpec): string[] => {
    const opts: string[] = [];
    if (kind === "archive") {
      if (spec.ttl !== undefined && spec.ttl !== "") opts.push(`ttl=${spec.ttl}`);
      if (spec.when !== undefined && spec.when.length > 0) {
        opts.push(`when=${outcomeSet(spec.when).join(",")}`);
      }
    }
    if (kind === "preview" && name === "body" && spec.sent === true) opts.push("source=sent");
    return opts;
  };

  for (const name of PHASE_OBJECTS[phase]) {
    const spec = model.objects[name];
    if (spec.none === true) {
      words.push({ text: `${name}=none`, opts: [] });
      continue;
    }
    if (!spec.on) {
      continue;
    }
    const opts = paramsOf(name, spec);
    if (spec.size === undefined || spec.size === "") {
      words.push({ text: name, opts });
      continue;
    }
    words.push({
      text:
        kind === "preview" && spec.item
          ? `${name}=${spec.size}/${spec.item}`
          : `${name}=${spec.size}`,
      opts,
    });
  }

  for (const row of groupWords(words)) {
    out.push(row.join(" "));
  }

  for (const target of LIST_TARGETS) {
    if (!PHASE_OBJECTS[phase].includes(target)) continue;
    for (const list of listNames(kind)) {
      const names = model[list][target];
      if (names === undefined) continue;
      if (names.length > 0) {
        out.push(`${target} ${list}=${names.join(",")}`);
      } else if (kind !== "capture") {
        // An empty own list is still own: it keeps the capture lists out.
        out.push(`${target} ${list}=${list === "allow" ? "*" : "none"}`);
      }
    }
  }

  return out;
}

/** The consumer names its own lists for the object: any of the three is set. */
export function hasOwnLists(model: TailModel, target: ListTarget, kind: TailKind): boolean {
  return listNames(kind).some((list) => model[list][target] !== undefined);
}

/**
 * Names the capture hides from inspectors (masked or dropped) that the own
 * lists of the record or the archive leave in the clear. Own lists replace the
 * capture lists, so these travel open -- the panel says so before it happens.
 */
export function openedByOwnLists(capture: TailModel, own: TailModel, target: ListTarget): string[] {
  const has = (list: string[] | undefined, name: string) =>
    (list ?? []).some((item) => item.toLowerCase() === name.toLowerCase());
  const allow = own.allow[target] ?? [];
  const dropped = (name: string) =>
    has(own.deny[target], name) || (allow.length > 0 && !has(allow, name));
  const hidden = [...(capture.mask[target] ?? []), ...(capture.deny[target] ?? [])];
  const seen = new Set<string>();
  return hidden.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return !dropped(name) && !has(own.mask[target], name);
  });
}

export function sizeBytes(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === "") return undefined;
  const m = text.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)([kmg])?$/);
  if (m === null) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const mul = m[2] === "g" ? 1024 ** 3 : m[2] === "m" ? 1024 ** 2 : m[2] === "k" ? 1024 : 1;
  return Math.round(n * mul);
}

export type ProblemCode =
  | "overBodyLimit"
  | "overClientMax"
  | "notInCapture"
  | "widerThanCapture"
  | "budgetRequired"
  | "ownListsOpen"
  | "sendNotCaptured"
  | "sendPrefix";

export interface TailProblem {
  object: ObjectName;
  code: ProblemCode;
  level: "error" | "warn";
  params?: Record<string, string>;
}

export function checkTail(
  model: TailModel,
  kind: TailKind,
  ctx: {
    capture?: TailModel;
    bodyLimit?: string;
    clientMaxBody?: string;
    phase?: TailPhase;
    inspected?: boolean;
  },
): TailProblem[] {
  const problems: TailProblem[] = [];
  const limit = sizeBytes(ctx.bodyLimit);
  const clientMax = sizeBytes(ctx.clientMaxBody);
  const phase = ctx.phase ?? "request";
  const journal = ctx.inspected === false;

  if (kind === "send") {
    for (const name of PHASE_OBJECTS[phase]) {
      const spec = model.objects[name];
      if (!spec.on || spec.send !== "store") continue;
      const captured = ctx.capture?.objects[name];
      if (captured?.on !== true) {
        problems.push({ object: name, code: "sendNotCaptured", level: "error" });
        continue;
      }
      if (name === "body" && captured.size !== undefined && captured.size !== "") {
        problems.push({
          object: name,
          code: "sendPrefix",
          level: "warn",
          params: { size: captured.size },
        });
      }
    }
    return problems;
  }

  const overLimits = (name: ObjectName, text: string | undefined) => {
    const size = sizeBytes(text);
    if (size === undefined) return;
    if (limit !== undefined && size > limit) {
      problems.push({
        object: name,
        code: "overBodyLimit",
        level: "error",
        params: { size: text ?? "", limit: ctx.bodyLimit ?? "" },
      });
    }
    if (
      name === "body" &&
      clientMax !== undefined &&
      clientMax > 0 &&
      size > clientMax
    ) {
      problems.push({
        object: name,
        code: "overClientMax",
        level: "error",
        params: { size: text ?? "", limit: ctx.clientMaxBody ?? "" },
      });
    }
  };

  for (const name of PHASE_OBJECTS[phase]) {
    const spec = model.objects[name];
    if (!spec.on) continue;

    overLimits(name, spec.size);

    if (kind === "capture") continue;

    if (kind === "preview" && (spec.size === undefined || spec.size === "")) {
      problems.push({ object: name, code: "budgetRequired", level: "error" });
    }

    // Headers are in memory whole and the request body is in hand until the
    // end: those ride to the agent with the record at any size. Past the
    // request phase the module holds only the body it captures.
    if (journal || phase === "request" || name !== "body") continue;

    const frame = phase === "frame:c2s" || phase === "frame:s2c";
    const captured = ctx.capture?.objects[name];

    if (captured?.on !== true) {
      problems.push({ object: name, code: "notInCapture", level: "error" });
      continue;
    }

    if (frame) continue;

    const captureSize = sizeBytes(captured.size);
    const own = sizeBytes(spec.size);
    if (
      captured.size !== undefined &&
      captureSize !== undefined &&
      (own === undefined || own > captureSize)
    ) {
      problems.push({
        object: name,
        code: "widerThanCapture",
        level: "error",
        params: { size: spec.size ?? "", capture: captured.size },
      });
    }
  }

  return problems;
}

export function checkStoreCross(
  models: Record<TailKind, TailModel>,
  phase: TailPhase,
): (TailProblem & { kind: TailKind })[] {
  const problems: (TailProblem & { kind: TailKind })[] = [];
  for (const target of LIST_TARGETS) {
    if (!PHASE_OBJECTS[phase].includes(target)) continue;
    if (models.capture.off) continue;
    for (const kind of ["archive", "preview"] as const) {
      const model = models[kind];
      if (model.off || !model.objects[target].on) continue;
      if (!hasOwnLists(model, target, kind)) continue;
      const opened = openedByOwnLists(models.capture, model, target);
      if (opened.length === 0) continue;
      problems.push({
        kind,
        object: target,
        code: "ownListsOpen",
        level: "warn",
        params: { names: opened.join(", ") },
      });
    }
  }
  return problems;
}

export function mergeTail(parent: TailModel, own: TailModel | undefined): TailModel {
  if (own === undefined) {
    return parent;
  }
  if (own.off) {
    return own;
  }
  const objects = { ...parent.objects };
  for (const name of OBJECTS) {
    const spec = own.objects[name];
    if (spec.on || spec.none === true) {
      objects[name] = spec;
    }
  }
  return {
    objects,
    allow: { ...parent.allow, ...own.allow },
    mask: { ...parent.mask, ...own.mask },
    deny: { ...parent.deny, ...own.deny },
    off: false,
  };
}

export function overrideTail(parent: TailModel, next: TailModel, kind?: TailKind): TailModel {
  const objects = { ...next.objects };
  for (const name of OBJECTS) {
    const spec = next.objects[name];
    if (!spec.on && parent.objects[name].on && kind !== "send") {
      objects[name] = { on: false, none: true };
    } else if (!spec.on) {
      objects[name] = { on: false };
    }
  }
  return { ...next, objects, off: false };
}
