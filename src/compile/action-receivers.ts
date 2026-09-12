/*
 * Просьбы, которые некому поднять.
 *
 * Канал действий адресуется ИМЕНЕМ ОБЪЯВЛЕНИЯ, а не именем процесса: на
 * маршруте стоит `waf_inspect request captcha-guard`, и адресатом в профиле
 * отправителя обязано быть написано `captcha-guard`, а не `captcha`. Разница
 * появляется ровно тогда, когда процессу заводят второе имя со своим профилем,
 * -- то есть при первом же нетривиальном конфиге.
 *
 * Ошибку эту нечем поймать по факту: канал рекомендательный, и обе стороны
 * выглядят исправными -- отправитель записал просьбу, получатель ответил
 * штатным вердиктом, потому что ничего не получил. Модуль на краю про такую
 * просьбу предупреждает (`has no receiver on this route`), но это уже
 * продакшен и лог. Здесь то же самое проверяется до рассылки, по тем же
 * данным, которыми конфиг компилируется.
 *
 * Это предупреждение, а не ошибка. Один профиль живёт на многих маршрутах, и
 * маршрут, где адресата нет, -- законная конфигурация: просьба там просто
 * никого не касается.
 */

import { wavesFromAfter } from "../inspector-graph.ts";
import type { InspectorDecl, InspectorRef } from "../model/waf-route.ts";
import type { NginxExport } from "./nginx-source.ts";

export interface ActionWarning {
  code: string;
  message: string;
}

/** Кого адресует инспектор, объявленный под этим именем. */
export type ActionTargets = ReadonlyMap<string, readonly string[]>;

type Waf = NginxExport["servers"][number]["server"]["waf"];
type List = Waf["requestInspectors"];
type Phase = "request" | "response";

const PHASES: readonly Phase[] = ["request", "response"];

interface PhaseRows {
  rows: InspectorRef[];
  waves: Map<string, number>;
}

/** Счёт по паре «отправитель -> адресат» на весь конфиг. */
interface PairStat {
  sender: string;
  target: string;
  /** маршруты, где отправитель есть, а поднять просьбу некому */
  dead: string[];
  /** сколько маршрутов её всё-таки доставляют */
  alive: number;
}

/**
 * Набор фазы на листе. Ключа нет или он пуст -- берётся родительский: это то же
 * правило, по которому печатается `waf_inspect`, и другого здесь быть не может,
 * иначе проверка судила бы не тот маршрут, который уедет на ноду.
 */
function effective(own: List, parent: List): List {
  return own === undefined || (Array.isArray(own) && own.length === 0) ? parent : own;
}

function refs(list: List): InspectorRef[] {
  if (!Array.isArray(list)) {
    return [];
  }
  // `ignore` не печатается вовсе: такого вызова на маршруте нет, и ни
  // отправителем, ни получателем он быть не может.
  return list.filter((ref) => ref.mode !== "ignore");
}

/**
 * Волна вызова. Явная побеждает; иначе считается из `after` объявлений -- ровно
 * как в эмиттере, потому что сравнивать надо те номера, которые попадут в файл.
 */
function wavesOf(
  rows: InspectorRef[],
  graph: Record<string, InspectorDecl>,
): Map<string, number> {
  const computed = wavesFromAfter(
    rows.map((row) => row.name),
    (name) => graph[name]?.after ?? [],
  );
  const out = new Map<string, number>();

  for (const row of rows) {
    out.set(row.name, row.wave ?? computed.get(row.name) ?? 0);
  }

  return out;
}

/**
 * Доедет ли просьба с этой фазы: адресат либо стоит позже отправителя здесь,
 * либо вызывается на любой последующей фазе -- секция prior сквозная, и
 * просьба фазы запроса доживает до фазы ответа.
 */
function deliverableFrom(
  target: string,
  sender: string,
  phase: Phase,
  byPhase: Record<Phase, PhaseRows>,
): boolean {
  const here = byPhase[phase];

  if (here.rows.some((row) => row.name === target)) {
    const to = here.waves.get(target);
    const from = here.waves.get(sender);

    if (to !== undefined && from !== undefined && to > from) {
      return true;
    }
  }

  return PHASES.slice(PHASES.indexOf(phase) + 1).some((later) =>
    byPhase[later].rows.some((row) => row.name === target),
  );
}

/**
 * Маршрут судится целиком, а не по фазам порознь. Инспектора зовут на обеих
 * фазах (счётчик меряет на ответе и судит на запросе), но просьбы он шлёт с
 * одной; какой именно -- знает его профиль, а не конфигурация nginx. Считать
 * фазу, с которой просьба не доедет, ошибкой значило бы ругаться на исправный
 * конфиг: достаточно, что она доезжает хоть откуда.
 */
function deliverableOnRoute(
  target: string,
  sender: string,
  byPhase: Record<Phase, PhaseRows>,
): boolean {
  return PHASES.some(
    (phase) =>
      byPhase[phase].rows.some((row) => row.name === sender) &&
      deliverableFrom(target, sender, phase, byPhase),
  );
}

/** Выключенный маршрут не проверяется: инспекторов там не спрашивают вовсе. */
function enabled(own: Waf, parent: Waf): boolean {
  return (own.enabled ?? parent.enabled ?? true) !== false;
}

/**
 * `targets` -- кого адресует каждое объявленное имя. Пустая карта означает, что
 * профили отправителей не читались: проверять нечего, и это не молчаливый
 * пропуск, а отсутствие входных данных.
 */
export function actionReceiverWarnings(
  source: NginxExport,
  targets: ActionTargets,
): ActionWarning[] {
  if (targets.size === 0) {
    return [];
  }

  const graph = (source.space.waf?.inspectors ?? {}) as Record<string, InspectorDecl>;
  const stats = new Map<string, PairStat>();

  const checkLeaf = (where: string, request: List, response: List) => {
    const byPhase: Record<Phase, PhaseRows> = {
      request: { rows: refs(request), waves: new Map() },
      response: { rows: refs(response), waves: new Map() },
    };
    byPhase.request.waves = wavesOf(byPhase.request.rows, graph);
    byPhase.response.waves = wavesOf(byPhase.response.rows, graph);

    const senders = new Set(PHASES.flatMap((p) => byPhase[p].rows.map((r) => r.name)));

    for (const sender of senders) {
      for (const target of targets.get(sender) ?? []) {
        if (target === "") {
          continue;
        }

        const key = `${sender}\n${target}`;
        let stat = stats.get(key);

        if (stat === undefined) {
          stat = { sender, target, dead: [], alive: 0 };
          stats.set(key, stat);
        }

        if (deliverableOnRoute(target, sender, byPhase)) {
          stat.alive += 1;
        } else {
          stat.dead.push(where);
        }
      }
    }
  };

  const pick = (waf: Waf, phase: Phase) =>
    phase === "request" ? waf.requestInspectors : waf.responseInspectors;

  for (const srv of source.servers) {
    if (!srv.server.enabled || srv.server.raw) continue;

    const leaves = srv.locations.filter((loc) => loc.enabled && !loc.raw);

    if (leaves.length === 0) {
      if (enabled(srv.server.waf, {})) {
        checkLeaf(
          `server "${srv.server.name}"`,
          pick(srv.server.waf, "request"),
          pick(srv.server.waf, "response"),
        );
      }
      continue;
    }

    for (const loc of leaves) {
      if (!enabled(loc.waf, srv.server.waf)) continue;

      checkLeaf(
        `location "${loc.path}" of server "${srv.server.name}"`,
        effective(pick(loc.waf, "request"), pick(srv.server.waf, "request")),
        effective(pick(loc.waf, "response"), pick(srv.server.waf, "response")),
      );
    }
  }

  /*
   * По строке на пару, а не на маршрут. Один профиль стоит на десятке
   * маршрутов, и «адресата тут нет» -- это один факт про конфигурацию, а не
   * десять находок; повторить его десять раз значит утопить в нём остальное.
   * Разница, которая оператору важна, -- доезжает ли просьба хоть куда-нибудь:
   * нигде -- это опечатка в имени, где-то -- сознательная асимметрия маршрутов.
   */
  const warnings: ActionWarning[] = [];

  for (const stat of stats.values()) {
    if (stat.dead.length === 0) {
      continue;
    }

    const known = Object.prototype.hasOwnProperty.call(graph, stat.target);
    const where =
      stat.dead.length === 1
        ? stat.dead[0]
        : `${stat.dead[0]} and ${stat.dead.length - 1} more route(s)`;

    warnings.push({
      code: "action_no_receiver",
      message:
        `inspector "${stat.sender}" addresses its actions to "${stat.target}", ` +
        (stat.alive > 0
          ? `which is not asked after it in ${where} ` +
            `(it is reachable on ${stat.alive} other route(s), so this may be intended)`
          : known
            ? `but "${stat.target}" is never asked after it on any route ` +
              `(${where})`
            : `and "${stat.target}" is not a declared inspector name at all ` +
              `(${where}). The action channel is addressed by declared names, ` +
              `not by process names`),
    });
  }

  return warnings;
}
