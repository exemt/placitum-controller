import {
  agentSelectors,
  inspectorSelectors,
  serviceSelectors,
} from "../state/slices/fleet.ts";
import {
  selectDesired,
  selectDrafts,
  selectLedger,
  selectSentSource,
} from "../state/slices/convergence.ts";
import type { RootState } from "../state/types.ts";
import {
  CHANNEL_IDS,
  CHANNELS,
  type ChannelId,
  type ChannelSpec,
} from "./channels.ts";
import {
  lampOf,
  viewChannel,
  worstState,
  type Blocked,
  type ChannelView,
  type ConsumerInput,
  type ConvergenceLamp,
  type DraftView,
} from "./state.ts";

export interface ConvergenceSnapshot {
  v: 1;
  at: string;
  seq: number;
  scope: string;
  lamp: ConvergenceLamp;
  worst: ChannelView["state"];
  channels: (ChannelView & { key: string; send: string; page: string })[];
}

function managesNginx(row: {
  nginx_manage?: boolean;
  config_hash?: string;
  apply?: string;
}): boolean {
  if (row.nginx_manage !== undefined) {
    return row.nginx_manage;
  }
  return row.config_hash !== undefined || row.apply !== undefined;
}

function consumersOf(state: RootState, spec: ChannelSpec): ConsumerInput[] {
  if (spec.consumer.kind === "inspector") {
    const name = spec.consumer.name;
    return inspectorSelectors
      .selectAll(state)
      .filter((row) => row.name === name)
      .map((row) => ({
        uuid: row.id,
        label: row.hostname === "" ? row.id : row.hostname,
        hash: row.config_hash,
        rev: row.rev,
        apply: row.apply,
        degraded: row.status === "degraded",
      }));
  }

  if (spec.consumer.kind === "service") {
    const name = spec.consumer.name;
    return serviceSelectors
      .selectAll(state)
      .filter((row) => row.name === name)
      .map((row) => ({
        uuid: row.id,
        label: row.hostname === "" ? row.id : row.hostname,
        hash: row.conf?.sha256,
        rev: row.conf?.rev,
        apply: row.conf?.apply,
        degraded: row.status === "degraded",
      }));
  }

  const agents = agentSelectors.selectAll(state);

  if (spec.consumer.nginx) {
    return agents.filter(managesNginx).map((row) => ({
      uuid: row.id,
      label: row.node_id,
      hash: row.config_hash,
      rev: row.rev,
      apply: row.apply,
      degraded: row.status === "degraded",
    }));
  }

  return agents.map((row) => ({
    uuid: row.id,
    label: row.node_id,
    hash: row.agent_conf?.sha256,
    rev: row.agent_conf?.rev,
    apply: row.agent_conf?.apply,
    degraded: row.status === "degraded",
  }));
}

function blockedOf(
  state: RootState,
  scope: string,
  spec: ChannelSpec,
): Blocked[] {
  if (spec.id !== "nginx") {
    return [];
  }

  const drafts = selectDrafts(state, scope);
  const requires = drafts.nginx?.requires ?? [];
  const out: Blocked[] = [];

  for (const need of requires) {
    const desired = selectDesired(state, need.channel);
    const published = desired?.profiles;

    if (desired === null) {
      out.push({
        code: "profile_not_published",
        before: need.channel,
        message: `шаблон ссылается на ${need.inspector} profile=${need.profile}, а канал ${need.channel} ещё ни разу не рассылали`,
      });
      continue;
    }

    if (published !== undefined && !published.includes(need.profile)) {
      out.push({
        code: "profile_missing",
        before: need.channel,
        message: `шаблон ссылается на ${need.inspector} profile=${need.profile}, а в изданном поколении ${need.channel} такого набора нет`,
      });
    }
  }

  return out;
}

function draftOf(state: RootState, scope: string, id: ChannelId): DraftView | null {
  const row = selectDrafts(state, scope)[id];
  if (row === undefined) {
    return null;
  }
  return {
    hash: row.hash,
    sourceHash: row.sourceHash,
    ok: row.ok,
    empty: row.empty,
    errors: row.errors,
    at: row.at,
  };
}

export function snapshotConvergence(
  state: RootState,
  scope: string,
  now = Date.now(),
): ConvergenceSnapshot {
  const channels = CHANNEL_IDS.map((id) => {
    const spec = CHANNELS[id];
    const view = viewChannel({
      id,
      delivered: spec.delivered,
      draft: draftOf(state, scope, id),
      desired: selectDesired(state, id),
      sentSourceHash: selectSentSource(state, scope, id),
      consumers: consumersOf(state, spec),
      ledger: selectLedger(state, id),
      blocked: blockedOf(state, scope, spec),
    });

    return { ...view, key: spec.key, send: spec.send, page: spec.page };
  });

  const states = channels.map((row) => row.state);

  return {
    v: 1,
    at: new Date(now).toISOString(),
    seq: state.convergence.seq,
    scope,
    lamp: lampOf(states),
    worst: worstState(states),
    channels,
  };
}
