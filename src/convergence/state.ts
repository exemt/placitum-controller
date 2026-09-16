import type { ChannelId } from "./channels.ts";

export interface PlanError {
  code: string;
  message: string;
  params?: Record<string, string | number>;
}

export interface DraftView {
  hash: string;
  sourceHash: string;
  ok: boolean;
  empty: boolean;
  errors: PlanError[];
  at: string;
}

export interface DesiredView {
  hash: string;
  rev: number;
  at?: string;
  profiles?: string[];
}

export interface ConsumerInput {
  uuid: string;
  label: string;
  hash?: string;
  rev?: number;
  apply?: string;
  degraded: boolean;
}

export type ConsumerState =
  | "ok"
  | "stale"
  | "pending"
  | "failed"
  | "foreign"
  | "silent";

export type ChannelState =
  | "ok"
  | "empty"
  | "dirty"
  | "no_effect"
  | "broken"
  | "never"
  | "converging"
  | "failed"
  | "foreign"
  | "silent"
  | "nobody"
  | "unmanaged";

export const SOURCE_EMPTIED: PlanError = {
  code: "source_emptied",
  message: "источник пуст, а поколение на флоте стоит: send отвергнет пустой состав",
};

export interface Blocked {
  code: string;
  message: string;
  before?: ChannelId;
}

export interface ChannelInput {
  id: ChannelId;
  delivered: boolean;
  draft: DraftView | null;
  desired: DesiredView | null;
  sentSourceHash: string | null;
  consumers: ConsumerInput[];
  ledger: readonly string[];
  blocked: Blocked[];
}

export interface ConsumerView {
  uuid: string;
  label: string;
  state: ConsumerState;
  hash?: string;
  rev?: number;
  apply?: string;
}

export interface ChannelView {
  id: ChannelId;
  state: ChannelState;
  dirty: boolean;
  sourceChanged: boolean;
  delivered: boolean;
  draft: DraftView | null;
  desired: DesiredView | null;
  consumers: ConsumerView[];
  counts: Record<ConsumerState, number>;
  blocked: Blocked[];
}

const FAILED_APPLY = new Set(["apply_failed", "undecryptable"]);

export function consumerState(
  row: ConsumerInput,
  desired: DesiredView | null,
  ledger: readonly string[],
): ConsumerState {
  if (row.apply !== undefined && FAILED_APPLY.has(row.apply)) {
    return "failed";
  }

  if (row.degraded) {
    return "silent";
  }

  if (row.hash === undefined || row.hash === "") {
    return "pending";
  }

  if (desired !== null && row.hash === desired.hash) {
    return "ok";
  }

  return ledger.includes(row.hash) ? "stale" : "foreign";
}

function emptyCounts(): Record<ConsumerState, number> {
  return { ok: 0, stale: 0, pending: 0, failed: 0, foreign: 0, silent: 0 };
}

export function sourceChanged(input: ChannelInput): boolean {
  const { draft, sentSourceHash } = input;
  return (
    draft !== null &&
    sentSourceHash !== null &&
    draft.sourceHash !== "" &&
    draft.sourceHash !== sentSourceHash
  );
}

export function channelState(input: ChannelInput, counts: Record<ConsumerState, number>): ChannelState {
  const { draft, desired, delivered } = input;

  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.foreign > 0) {
    return "foreign";
  }

  if (draft !== null && !draft.ok) {
    return "broken";
  }

  if (draft !== null && draft.empty) {
    return desired === null ? "empty" : "broken";
  }

  if (desired === null) {
    return "never";
  }

  if (draft !== null && draft.ok && draft.hash !== desired.hash) {
    return "dirty";
  }

  if (sourceChanged(input)) {
    return "no_effect";
  }

  if (!delivered) {
    return "unmanaged";
  }

  if (counts.silent > 0) {
    return "silent";
  }

  if (counts.ok + counts.stale + counts.pending === 0) {
    return "nobody";
  }

  if (counts.stale > 0 || counts.pending > 0) {
    return "converging";
  }

  return "ok";
}

export function viewChannel(input: ChannelInput): ChannelView {
  const counts = emptyCounts();
  const consumers: ConsumerView[] = [];

  if (input.delivered) {
    for (const row of input.consumers) {
      const state = consumerState(row, input.desired, input.ledger);
      counts[state] += 1;
      consumers.push({
        uuid: row.uuid,
        label: row.label,
        state,
        hash: row.hash,
        rev: row.rev,
        apply: row.apply,
      });
    }
  }

  const dirty =
    input.draft !== null &&
    input.draft.ok &&
    !input.draft.empty &&
    (input.desired === null || input.draft.hash !== input.desired.hash);

  const state = channelState(input, counts);

  const draft =
    input.draft !== null && input.draft.empty && input.desired !== null
      ? { ...input.draft, ok: false, errors: [...input.draft.errors, SOURCE_EMPTIED] }
      : input.draft;

  return {
    id: input.id,
    state,
    dirty,
    sourceChanged: sourceChanged(input),
    delivered: input.delivered,
    draft,
    desired: input.desired,
    consumers,
    counts,
    blocked: input.blocked,
  };
}

const LAMP_ORDER: ChannelState[] = [
  "failed",
  "foreign",
  "broken",
  "silent",
  "never",
  "dirty",
  "no_effect",
  "converging",
  "unmanaged",
  "nobody",
  "empty",
  "ok",
];

export type ConvergenceLamp = "red" | "yellow" | "green";

const LAMP: Record<ChannelState, ConvergenceLamp> = {
  failed: "red",
  foreign: "red",
  broken: "yellow",
  silent: "yellow",
  never: "yellow",
  dirty: "yellow",
  no_effect: "yellow",
  converging: "yellow",
  unmanaged: "green",
  nobody: "green",
  empty: "green",
  ok: "green",
};

export function worstState(states: readonly ChannelState[]): ChannelState {
  for (const state of LAMP_ORDER) {
    if (states.includes(state)) {
      return state;
    }
  }
  return "ok";
}

export function lampOf(states: readonly ChannelState[]): ConvergenceLamp {
  return LAMP[worstState(states)];
}
