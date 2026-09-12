/**
 * План канала: хеш того, что уедет, если нажать «Разослать» прямо сейчас.
 *
 * Каждый пункт зовёт ту же функцию, которой пользуется `send`, -- иначе через
 * месяц панель начнёт врать в одну сторону, а рассылка работать в другую.
 * Записей здесь нет ни одной: ни Redis, ни KV, ни диск. Чтения из Postgres
 * есть -- источник канала там и лежит.
 */

import { hashAgentConf } from "../compile/agent-conf.ts";
import { hashHaproxyConf } from "../compile/haproxy.ts";
import { exportNginx } from "../compile/nginx.ts";
import { actionDatasetsOf, buildActionManifest } from "../action-manifest.ts";
import { cookieDatasetsOf, buildCookieManifest } from "../cookie-manifest.ts";
import { buildAuthManifest } from "../auth-manifest.ts";
import { buildCaptchaManifest } from "../captcha-manifest.ts";
import { buildJsonManifest } from "../json-manifest.ts";
import { buildCounterManifest } from "../counter-manifest.ts";
import { buildVlaiManifest } from "../vlai-manifest.ts";
import { buildRewriteManifest } from "../rewrite-manifest.ts";
import type { ActionProfileRepo } from "../action-profiles.ts";
import type { CookieProfileRepo } from "../cookie-profiles.ts";
import type { DatasetRepo } from "../datasets.ts";
import type { AgentSettingsRepo } from "../agent-settings.ts";
import type { HaproxySettingsRepo } from "../haproxy-settings.ts";
import type { AuthProfileRepo } from "../auth-profiles.ts";
import type { AuthSourceRepo } from "../auth-sources.ts";
import type { CaptchaProfileRepo } from "../captcha-profiles.ts";
import type { CounterProfileRepo } from "../counter-profiles.ts";
import type { JsonProfileRepo } from "../json-profiles.ts";
import type { VlaiProfileRepo } from "../vlai-profiles.ts";
import type { RewriteProfileRepo } from "../rewrite-profiles.ts";
import type { IpCompiler, NginxCompiler, RulesCompiler } from "../compile.ts";
import type { Pool } from "../db.ts";
import type { InspectorSettingsSource } from "../inspector-settings.ts";
import { channelOfProfileTag, type ChannelId } from "./channels.ts";
import { sourceHash } from "./source-hash.ts";
import type { PlanError } from "./state.ts";

export interface ChannelRequirement {
  /** Канал, который обязан издать этот профиль. */
  channel: ChannelId;
  inspector: string;
  profile: string;
}

export interface ChannelPlan {
  hash: string;
  /**
   * Отпечаток источника в базе. Двигается на любую правку, в том числе на ту,
   * которую компилятор не печатает; расхождение с `hash` -- сигнал «сохранено,
   * но в конфигурацию не попадает».
   */
  sourceHash: string;
  /** План посчитан. Ложь -- компиляция не прошла, рассылать нечего. */
  ok: boolean;
  /**
   * Источника нет вовсе: ни одного профиля. Не ошибка -- контур просто не
   * пользуется этой проверкой, и красить такой канал жёлтым значит приучить
   * оператора не смотреть на цвет.
   */
  empty: boolean;
  errors: PlanError[];
  profiles: string[];
  requires: ChannelRequirement[];
  /** Сколько считался план: панель показывает дорогие каналы честно. */
  tookMs: number;
}

export interface PlannerDeps {
  pool: Pool;
  nginx: NginxCompiler;
  rules: RulesCompiler;
  ip: IpCompiler;
  auth: AuthProfileRepo;
  authSources: AuthSourceRepo;
  captcha: CaptchaProfileRepo;
  json: JsonProfileRepo;
  action: ActionProfileRepo;
  cookie: CookieProfileRepo;
  /** Каталог наборов: условия профилей действий печатаются с типом и хешем набора. */
  datasets: DatasetRepo;
  counter: CounterProfileRepo;
  vlai: VlaiProfileRepo;
  rewrite: RewriteProfileRepo;
  agent: AgentSettingsRepo;
  haproxy: HaproxySettingsRepo;
  /**
   * Настройки процесса из каталога инспекторов -- уровень журнала. Часть
   * источника каждого канала с инспектором: они входят и в `config_hash`
   * (иначе флот не заметит правку), и в отпечаток источника (иначе правка
   * каталога не читалась бы как «сохранено, не разослано»).
   */
  settings: InspectorSettingsSource;
}

type Draft = Omit<ChannelPlan, "tookMs">;

function ok(
  hash: string,
  source: unknown,
  profiles: string[] = [],
  requires: ChannelRequirement[] = [],
): Draft {
  return {
    hash,
    sourceHash: sourceHash(source),
    ok: true,
    empty: false,
    errors: [],
    profiles,
    requires,
  };
}

function empty(source: unknown): Draft {
  return {
    hash: "",
    sourceHash: sourceHash(source),
    ok: true,
    empty: true,
    errors: [],
    profiles: [],
    requires: [],
  };
}

/**
 * Несобираемый план. Отпечаток источника считается всё равно: правка, которая
 * сломала компиляцию, -- это тоже правка, и «ничего не изменилось» про неё
 * было бы неправдой.
 */
function failed(errors: PlanError[], source: unknown): Draft {
  return {
    hash: "",
    sourceHash: sourceHash(source),
    ok: false,
    empty: false,
    errors,
    profiles: [],
    requires: [],
  };
}

/**
 * Отказ сборки манифеста профилей в форму ошибки плана. `no_profiles` сюда не
 * попадает: пустой источник -- не отказ, см. `empty`.
 */
function manifestError(row: {
  error: string;
  source?: string;
  profile?: string;
  detail?: string;
}): PlanError {
  const at = row.profile ?? row.source;
  const where = at === undefined ? "" : ` (${at})`;
  const why = row.detail === undefined ? "" : `: ${row.detail}`;
  return { code: row.error, message: `${row.error}${where}${why}` };
}

export type Planner = (scope: string) => Promise<ChannelPlan>;

export function createPlanners(deps: PlannerDeps): Record<ChannelId, Planner> {
  const timed =
    (body: (scope: string) => Promise<Omit<ChannelPlan, "tookMs">>): Planner =>
    async (scope) => {
      const started = performance.now();
      const plan = await body(scope);
      return {
        ...plan,
        tookMs: Math.round((performance.now() - started) * 10) / 10,
      };
    };

  return {
    nginx: timed(async (scope) => {
      const source = await exportNginx(deps.pool, scope);
      const plan = await deps.nginx.plan(source);

      if (plan.errors.length > 0 || plan.packed === null) {
        return failed(plan.errors, source);
      }

      const requires: ChannelRequirement[] = [];
      for (const [inspector, profile] of plan.requires) {
        const channel = channelOfProfileTag(inspector);
        if (channel !== null) {
          requires.push({ channel, inspector, profile });
        }
      }

      return ok(plan.sha256, source, [], requires);
    }),

    agent: timed(async (scope) => {
      const row = await deps.agent.get(scope);
      return ok(hashAgentConf(row.settings), row.settings);
    }),

    // Хеш считается по тексту haproxy.cfg -- тому же, что печатает send.
    haproxy: timed(async (scope) => {
      const row = await deps.haproxy.get(scope);
      return ok(hashHaproxyConf(row.settings), row.settings);
    }),

    /*
     * У каналов с инспектором источник -- строки профилей вместе с настройками
     * процесса из каталога: уровень журнала едет в поколении и обязан двигать
     * отпечаток так же, как правка профиля.
     */
    rules: timed(async (scope) => {
      const plan = await deps.rules.plan(scope);
      const source = { rows: plan.source, settings: plan.settings };
      return plan.profiles.length === 0
        ? empty(source)
        : ok(plan.sha256, source, plan.profiles);
    }),

    ip: timed(async (scope) => {
      const plan = await deps.ip.plan(scope);
      const source = { rows: plan.source, settings: plan.settings };
      return plan.profiles.length === 0
        ? empty(source)
        : ok(plan.sha256, source, plan.profiles);
    }),

    auth: timed(async (scope) => {
      /*
       * Источник плана -- строки источников и профилей как есть, а не
       * собранный манифест: в манифест едут только те поля, которые печатает
       * рендер, и правка непечатаемого поля иначе была бы невидима.
       */
      const rows = [
        ...(await deps.authSources.list(scope)),
        ...(await deps.auth.list(scope)),
      ];
      // rev в хеш не входит: канон считается по составу поколения.
      const built = await buildAuthManifest(
        deps.authSources,
        deps.auth,
        scope,
        1,
        deps.settings,
      );

      return manifestPlan(rows, built);
    }),

    captcha: timed(async (scope) => {
      const rows = await deps.captcha.list(scope);
      const built = await buildCaptchaManifest(deps.captcha, scope, 1, deps.settings);

      return manifestPlan(rows, built);
    }),

    json: timed(async (scope) => {
      const rows = await deps.json.list(scope);
      const built = await buildJsonManifest(deps.json, scope, 1, deps.settings);

      return manifestPlan(rows, built);
    }),

    action: timed(async (scope) => {
      const rows = await deps.action.list(scope);
      const built = await buildActionManifest(
        deps.action,
        scope,
        1,
        deps.settings,
        actionDatasetsOf(deps.datasets),
      );

      return manifestPlan(rows, built);
    }),

    cookie: timed(async (scope) => {
      const rows = await deps.cookie.list(scope);
      const built = await buildCookieManifest(
        deps.cookie,
        scope,
        1,
        deps.settings,
        cookieDatasetsOf(deps.datasets),
      );

      return manifestPlan(rows, built);
    }),

    vlai: timed(async (scope) => {
      const rows = await deps.vlai.list(scope);
      const built = await buildVlaiManifest(deps.vlai, scope, 1, deps.settings);

      return manifestPlan(rows, built);
    }),

    rewrite: timed(async (scope) => {
      const rows = await deps.rewrite.list(scope);
      const built = await buildRewriteManifest(deps.rewrite, scope, 1, deps.settings);

      return manifestPlan(rows, built);
    }),

    counter: timed(async (scope) => {
      // Отпечаток источника считается по профилям вместе с общей секцией:
      // правка объявлений счётчиков -- такая же правка канала, как правка
      // профиля.
      const rows = [await deps.counter.shared(scope), ...(await deps.counter.list(scope))];
      const built = await buildCounterManifest(deps.counter, scope, 1, deps.settings);

      return manifestPlan(rows, built);
    }),
  };
}

/**
 * План канала из собранного манифеста профилей. Отпечаток источника -- строки
 * как есть плюс блок настроек, который сборщик достал из каталога: правка
 * уровня журнала обязана читаться как правка канала, а не теряться между
 * «сохранено» и «разослано».
 */
function manifestPlan(
  rows: unknown[],
  built:
    | { manifest: { config_hash: string; profiles: Record<string, unknown>; settings?: unknown } }
    | { error: string; source?: string; profile?: string; detail?: string },
): Draft {
  if ("error" in built) {
    return built.error === "no_profiles"
      ? empty(rows)
      : failed([manifestError(built)], rows);
  }

  return ok(
    built.manifest.config_hash,
    { rows, settings: built.manifest.settings },
    Object.keys(built.manifest.profiles).sort(),
  );
}
