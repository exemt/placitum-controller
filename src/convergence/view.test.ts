/**
 * Снимок сходимости на живом редьюсере.
 *
 * Главное здесь -- изоляция каналов. Раньше `desired` был один на всех
 * инспекторов и заполнялся каналом правил; `auth`, `captcha` и `ip` возят свои
 * манифесты и потому вечно светились расхождением на исправных репликах.
 * Индикатор, который врёт на трёх инспекторах из четырёх, оператор отключает в
 * первую неделю, и дальше на нём ничего не построить.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentPulse, InspectorPulse } from "../model/fleet.ts";
import { rootReducer } from "../state/root.ts";
import { fleetAgentUp, fleetInspectorUp } from "../state/slices/fleet.ts";
import {
  convergenceDesiredSeen,
  convergenceDraftPlanned,
} from "../state/slices/convergence.ts";
import type { RootState } from "../state/types.ts";
import type { ChannelId } from "./channels.ts";
import { snapshotConvergence } from "./view.ts";

const SCOPE = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-08-23T12:00:00.000Z";

type Action = Parameters<typeof rootReducer>[1];

function reduce(actions: Action[]): RootState {
  let state = rootReducer(undefined, { type: "@@init" } as Action);
  for (const action of actions) {
    state = rootReducer(state, action);
  }
  return state;
}

function inspector(
  name: string,
  id: string,
  over: Partial<InspectorPulse> = {},
): Action {
  const pulse: InspectorPulse = {
    v: 1,
    kind: "inspector",
    id,
    name,
    subject: `waf.req.${name}`,
    queue: name,
    hostname: id,
    ready: true,
    at: NOW,
    ...over,
  };
  return fleetInspectorUp(pulse) as Action;
}

function agent(nodeId: string, over: Partial<AgentPulse> = {}): Action {
  const pulse: AgentPulse = {
    v: 1,
    kind: "agent",
    id: nodeId,
    node_id: nodeId,
    hostname: nodeId,
    at: NOW,
    host: {
      cpu: { cores: 1, usage: 0, load1: 0, load5: 0, load15: 0 },
      memory: { total: 1, used: 0, available: 1 },
      uptime_s: 10,
    },
    ...over,
  };
  return fleetAgentUp(pulse) as Action;
}

function published(channel: ChannelId, hash: string, rev = 1, profiles?: string[]): Action {
  return convergenceDesiredSeen({
    channel,
    hash,
    rev,
    profiles,
    published: true,
  }) as Action;
}

function planned(
  channel: ChannelId,
  hash: string,
  over: Partial<{ profiles: string[]; requires: { channel: ChannelId; inspector: string; profile: string }[] }> = {},
): Action {
  return convergenceDraftPlanned({
    scope: SCOPE,
    channel,
    draft: {
      hash,
      sourceHash: `src:${hash}`,
      ok: true,
      empty: false,
      errors: [],
      profiles: over.profiles ?? [],
      requires: over.requires ?? [],
      at: NOW,
      tookMs: 1,
      stale: false,
    },
  }) as Action;
}

function channelOf(state: RootState, id: ChannelId) {
  const snap = snapshotConvergence(state, SCOPE);
  const row = snap.channels.find((c) => c.id === id);
  assert.ok(row !== undefined, `канал ${id} пропал из снимка`);
  return row;
}

test("хеш канала правил не сравнивается с инспектором калитки", () => {
  const state = reduce([
    published("rules", "sha256:rules", 5, ["default"]),
    published("auth", "sha256:auth", 3, ["default"]),
    planned("rules", "sha256:rules"),
    planned("auth", "sha256:auth"),
    // Каждый докладывает хеш своего манифеста -- и оба правы.
    inspector("modsec", "modsec-1", { config_hash: "sha256:rules", apply: "ok" }),
    inspector("auth", "auth-1", { config_hash: "sha256:auth", apply: "ok" }),
  ]);

  assert.equal(channelOf(state, "rules").state, "ok");
  assert.equal(channelOf(state, "auth").state, "ok");
});

/*
 * Инспектор адреса читает поколение сам. Пока он на дереве из образа, в пульсе
 * стоит локальный отпечаток -- и это настоящее расхождение: поколения на ноде
 * нет. Прежний unmanaged скрывал бы ровно ту аварию, ради которой канал завели.
 */
test("инспектор адреса с локальным отпечатком -- расхождение, а не unmanaged", () => {
  const state = reduce([
    published("ip", "sha256:ip-pack", 2, ["default"]),
    planned("ip", "sha256:ip-pack"),
    inspector("ip", "ip-1", { config_hash: "sha256:directory-fingerprint", apply: "ok" }),
  ]);

  const row = channelOf(state, "ip");
  assert.notEqual(row.state, "unmanaged");
  assert.equal(row.counts.foreign, 1, "поколения на ноде нет -- это чужой хеш");
});

test("инспектор адреса с хешем поколения -- ok", () => {
  const state = reduce([
    published("ip", "sha256:ip-pack", 2, ["default"]),
    planned("ip", "sha256:ip-pack"),
    inspector("ip", "ip-1", { config_hash: "sha256:ip-pack", rev: 2, apply: "ok" }),
  ]);

  assert.equal(channelOf(state, "ip").state, "ok");
});

test("инспектор без своего канала в сходимость не попадает вовсе", () => {
  const state = reduce([
    published("rules", "sha256:rules", 1, ["default"]),
    planned("rules", "sha256:rules"),
    inspector("modsec", "modsec-1", { config_hash: "sha256:rules", apply: "ok" }),
    // `challenge` конфигурацию с шины не возит -- и не обязан.
    inspector("challenge", "chal-1", { config_hash: "sha256:whatever" }),
  ]);

  const row = channelOf(state, "rules");
  assert.equal(row.state, "ok");
  assert.deepEqual(row.consumers.map((c) => c.uuid), ["modsec-1"]);
});

test("сайдкар без бинаря nginx не держит канал шаблона в ожидании", () => {
  const state = reduce([
    published("nginx", "sha256:pack", 7),
    planned("nginx", "sha256:pack"),
    agent("edge-managed", {
      nginx_manage: true,
      config_hash: "sha256:pack",
      rev: 7,
      apply: "ok",
    }),
    agent("nginx-1", { nginx_manage: false }),
    agent("nginx-2", { nginx_manage: false }),
  ]);

  const row = channelOf(state, "nginx");
  assert.equal(row.state, "ok");
  assert.deepEqual(row.consumers.map((c) => c.label), ["edge-managed"]);
});

test("настройку агента применяют все ноды, включая сайдкары", () => {
  const state = reduce([
    published("agent", "sha256:conf", 4),
    planned("agent", "sha256:conf"),
    agent("edge-managed", {
      nginx_manage: true,
      agent_conf: { rev: 4, sha256: "sha256:conf", apply: "ok" },
    }),
    agent("nginx-1", {
      nginx_manage: false,
      agent_conf: { rev: 3, sha256: "sha256:old", apply: "ok" },
    }),
  ]);

  const row = channelOf(state, "agent");
  assert.equal(row.consumers.length, 2);
  // Прежнее поколение не в журнале этого процесса -- значит чужое, и это
  // честнее, чем молча звать своим что попало.
  assert.equal(row.state, "foreign");
});

test("правка одного канала не делает грязными остальные", () => {
  const before = reduce([
    published("rules", "sha256:r1", 1, ["default"]),
    published("auth", "sha256:a1", 1, ["default"]),
    published("nginx", "sha256:n1", 1),
    planned("rules", "sha256:r1"),
    planned("auth", "sha256:a1"),
    planned("nginx", "sha256:n1"),
  ]);

  for (const id of ["rules", "auth", "nginx"] as const) {
    assert.equal(channelOf(before, id).state, "nobody", `${id}: исходно всё издано, участников нет`);
  }

  const after = rootReducer(before, planned("rules", "sha256:r2"));

  assert.equal(channelOf(after, "rules").dirty, true);
  assert.equal(channelOf(after, "auth").dirty, false);
  assert.equal(channelOf(after, "nginx").dirty, false);
});

test("шаблон сослался на неизданный профиль -- препятствие с указанием канала", () => {
  const state = reduce([
    published("nginx", "sha256:n1", 1),
    published("rules", "sha256:r1", 1, ["default"]),
    planned("nginx", "sha256:n1", {
      requires: [{ channel: "rules", inspector: "modsec", profile: "shop" }],
    }),
    planned("rules", "sha256:r1", { profiles: ["default", "shop"] }),
  ]);

  const row = channelOf(state, "nginx");
  assert.equal(row.blocked.length, 1);
  assert.equal(row.blocked[0].code, "profile_missing");
  assert.equal(row.blocked[0].before, "rules");
});

test("профиль издан -- препятствия нет", () => {
  const state = reduce([
    published("nginx", "sha256:n1", 1),
    published("rules", "sha256:r1", 1, ["default", "shop"]),
    planned("nginx", "sha256:n1", {
      requires: [{ channel: "rules", inspector: "modsec", profile: "shop" }],
    }),
  ]);

  assert.deepEqual(channelOf(state, "nginx").blocked, []);
});

test("канал профилей ни разу не рассылали -- препятствие называет его", () => {
  const state = reduce([
    published("nginx", "sha256:n1", 1),
    planned("nginx", "sha256:n1", {
      requires: [{ channel: "rules", inspector: "modsec", profile: "shop" }],
    }),
  ]);

  const row = channelOf(state, "nginx");
  assert.equal(row.blocked[0].code, "profile_not_published");
  assert.equal(row.blocked[0].before, "rules");
});

test("лампа контура -- худшее из каналов", () => {
  const state = reduce([
    published("rules", "sha256:r1", 1, ["default"]),
    planned("rules", "sha256:r1"),
    inspector("modsec", "modsec-1", {
      config_hash: "sha256:r0",
      apply: "apply_failed",
    }),
  ]);

  const snap = snapshotConvergence(state, SCOPE);
  assert.equal(snap.worst, "failed");
  assert.equal(snap.lamp, "red");
});
