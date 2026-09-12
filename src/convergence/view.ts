/**
 * Снимок сходимости: три уровня в одном документе.
 *
 * Отсюда живёт и лампа в шапке, и чип на странице, и `GET /convergence` для
 * раннера. Считается по состоянию процесса, ничего не запрашивая: планы уже
 * посчитаны службой, `desired` пришёл с публикации, участники -- из пульса.
 */

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

/**
 * Ведёт ли эта нода конфигурацию nginx. Поле в кадре -- источник истины; пока
 * его нет (агент старой сборки), роль выводится из того, что нода вообще
 * докладывает о применении. Вывод неточен ровно в одном случае -- managed-нода,
 * которая ещё ни разу ничего не применяла, -- и ради него поле и заведено.
 */
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

  /*
   * Сервис контура по имени пульса: так канал haproxy находит свой агент.
   * Поколение из секции `conf` кадра -- форма та же, что `agent_conf` у ноды.
   */
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

  /*
   * Настройку агента применяют все ноды, включая сайдкары без бинаря nginx:
   * раскатку ведёт одна нода контура, а архив -- каждая.
   */
  return agents.map((row) => ({
    uuid: row.id,
    label: row.node_id,
    hash: row.agent_conf?.sha256,
    rev: row.agent_conf?.rev,
    apply: row.agent_conf?.apply,
    degraded: row.status === "degraded",
  }));
}

/**
 * Межканальные препятствия. Шаблон nginx называет профиль тегом `profile=`;
 * инспектор отвечает вердиктом `error` на профиль, которого у него нет, --
 * отката на `default` больше не бывает. Разослать шаблон раньше профилей
 * значит положить маршрут при двух зелёных каналах по отдельности -- и это
 * дороже любого расхождения хешей.
 *
 * Переупорядочивать рассылку сама панель не должна: правильный порядок зависит
 * от того, добавляется профиль или убирается, и угадывание здесь стоит дороже
 * подсказки.
 */
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
