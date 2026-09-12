/**
 * Служба планов: держит `hash_draft` каждого канала свежим.
 *
 * Два источника свежести, и второй нужен именно потому, что первый неполон.
 *
 *   1. Живая модель. Правка, прошедшая через thunk, меняет ссылку на свою
 *      секцию стора; секции разложены по каналам, и канал помечается
 *      устаревшим сразу. Это то, из-за чего лампа в шапке загорается на
 *      «Сохранить», а не через минуту.
 *   2. Срок годности. Часть источников правится роутерами мимо Redux --
 *      каталоги, настройки агента, профили калитки. Ловить их поимённо значит
 *      однажды забыть новый роутер и получить панель, которая молчит о
 *      реальном расхождении. Поэтому план старше `ttlMs` считается негодным
 *      независимо ни от чего.
 *
 * Пересчёт идёт только когда снимок кто-то спрашивает. Фонового счёта нет:
 * `packIp` ходит по всем наборам адресов, и крутить его вхолостую на контуре,
 * куда никто не смотрит, незачем.
 */

import { log } from "../log.ts";
import {
  convergenceDraftPlanned,
  convergenceDraftStale,
  convergenceSentSource,
  selectDrafts,
} from "../state/slices/convergence.ts";
import { spaceSelectors } from "../state/slices/spaces.ts";
import type { AppDispatch, RootState } from "../state/types.ts";
import { CHANNEL_IDS, type ChannelId } from "./channels.ts";
import type { Planner } from "./planner.ts";

/** Какие секции живой модели кормят какой канал. */
const FEEDS: Record<ChannelId, readonly (keyof RootState)[]> = {
  nginx: [
    "spaces",
    "inspectors",
    "datasets",
    "servers",
    "locations",
    "ports",
    "upstreams",
    "certificates",
  ],
  // Настройки агента правятся своим роутером мимо живой модели: ловит срок.
  agent: [],
  // Настройки haproxy -- тем же роутерным путём: ловит срок.
  haproxy: [],
  rules: ["ruleFiles", "ruleSets"],
  ip: ["ipProfiles", "ipCountries", "datasets"],
  auth: [],
  captcha: [],
  // Профили контракта правятся своим роутером мимо живой модели, как auth и
  // капча: расхождение ловит срок, а не подписка на срез.
  json: [],
  // Профили действий -- тем же роутерным путём: ловит срок.
  action: [],
  cookie: [],
  // Профили и общая секция счётчика -- тем же роутерным путём: ловит срок.
  counter: [],
  // Профили vlai -- тем же роутерным путём: ловит срок.
  vlai: [],
  // Профили модификатора -- тем же роутерным путём: ловит срок.
  rewrite: [],
};

export interface ConvergenceServiceOptions {
  ttlMs?: number;
}

export interface ConvergenceService {
  /** Досчитать всё, что устарело, и вернуть управление. */
  refresh(scope: string, force?: boolean): Promise<void>;
  /** Пометить каналы негодными: после `send` или правки мимо модели. */
  invalidate(channels: ChannelId[], scope?: string): void;
  /**
   * Канал только что опубликован. Пересчитать его план и запомнить отпечаток
   * источника: с этого момента любая правка базы -- правка «после рассылки»,
   * даже если компилятор её не печатает.
   */
  published(channel: ChannelId): Promise<void>;
  stop(): void;
}

export function startConvergenceService(
  planners: Record<ChannelId, Planner>,
  dispatch: AppDispatch,
  getState: () => RootState,
  subscribe: (listener: () => void) => () => void,
  options: ConvergenceServiceOptions = {},
): ConvergenceService {
  const ttlMs = options.ttlMs ?? 10_000;

  /*
   * Ссылки на секции с прошлого прохода. Сравниваются по идентичности: тулкит
   * возвращает новый объект секции ровно тогда, когда она изменилась, поэтому
   * «поменялось ли» стоит одно сравнение, а не обход строк.
   */
  let seen: Partial<Record<keyof RootState, unknown>> = {};

  const unsubscribe = subscribe(() => {
    const state = getState();
    const touched: ChannelId[] = [];

    for (const id of CHANNEL_IDS) {
      for (const key of FEEDS[id]) {
        if (seen[key] !== undefined && seen[key] !== state[key]) {
          touched.push(id);
          break;
        }
      }
    }

    for (const key of Object.keys(FEEDS) as ChannelId[]) {
      for (const slice of FEEDS[key]) {
        seen[slice] = state[slice];
      }
    }

    if (touched.length > 0) {
      dispatch(convergenceDraftStale({ channels: touched }));
    }
  });

  // Первый проход: запомнить ссылки, ничего не помечая.
  {
    const state = getState();
    for (const id of CHANNEL_IDS) {
      for (const key of FEEDS[id]) {
        seen[key] = state[key];
      }
    }
  }

  /** Один пересчёт на канал в момент времени: параллельные GET не удваивают. */
  const inFlight = new Map<string, Promise<void>>();

  /**
   * `fresh` -- пересчитать по состоянию базы на момент вызова, а не
   * присоединиться к уже идущему счёту.
   *
   * Разница не косметическая. План пространства считается сотни миллисекунд;
   * если за это время правку сохранили, присоединившийся вызов вернёт план,
   * снятый ДО правки, и панель покажет «сошлось» на изменённой конфигурации --
   * ровно та ложь, против которой весь механизм. Поэтому принудительный
   * пересчёт дожидается текущего и запускает свой.
   */
  const planOne = async (
    scope: string,
    id: ChannelId,
    fresh = false,
  ): Promise<void> => {
    const key = `${scope}:${id}`;
    const running = inFlight.get(key);

    if (running !== undefined) {
      if (!fresh) {
        return running;
      }
      await running.catch(() => {});
    }

    const task = (async () => {
      try {
        const plan = await planners[id](scope);
        dispatch(
          convergenceDraftPlanned({
            scope,
            channel: id,
            draft: {
              hash: plan.hash,
              sourceHash: plan.sourceHash,
              ok: plan.ok,
              empty: plan.empty,
              errors: plan.errors,
              profiles: plan.profiles,
              requires: plan.requires,
              at: new Date().toISOString(),
              tookMs: plan.tookMs,
              stale: false,
            },
          }),
        );
      } catch (err) {
        /*
         * Сорванный план -- не пустой план: показать «нечего рассылать» там,
         * где просто отвалилась база, значит соврать в самую опасную сторону.
         */
        dispatch(
          convergenceDraftPlanned({
            scope,
            channel: id,
            draft: {
              hash: "",
              sourceHash: "",
              ok: false,
              empty: false,
              errors: [
                {
                  code: "plan_failed",
                  message: err instanceof Error ? err.message : String(err),
                },
              ],
              profiles: [],
              requires: [],
              at: new Date().toISOString(),
              tookMs: 0,
              stale: false,
            },
          }),
        );
        log("warn", "convergence plan failed", {
          scope,
          channel: id,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, task);
    return task;
  };

  const expired = (scope: string, id: ChannelId, now: number): boolean => {
    const row = selectDrafts(getState(), scope)[id];
    if (row === undefined || row.stale) {
      return true;
    }
    return now - Date.parse(row.at) >= ttlMs;
  };

  return {
    async refresh(scope, force = false) {
      const now = Date.now();
      const todo = CHANNEL_IDS.filter((id) => force || expired(scope, id, now));
      await Promise.all(todo.map((id) => planOne(scope, id, force)));
    },
    invalidate(channels, scope) {
      dispatch(convergenceDraftStale({ channels, scope }));
    },
    async published(channel) {
      /*
       * Пространства KV сейчас одно на контур: ключ `policy/<канал>` не несёт
       * scope. Поэтому отметка ставится всем известным пространствам; когда
       * ключи станут scoped (docs/inspector-config-distribution.md), сюда
       * придёт конкретное.
       */
      {
        for (const space of spaceSelectors.selectAll(getState())) {
          try {
            const plan = await planners[channel](space.id);
            dispatch(
              convergenceSentSource({
                scope: space.id,
                channel,
                sourceHash: plan.sourceHash,
              }),
            );
          } catch (err) {
            log("warn", "convergence sent-source skipped", {
              scope: space.id,
              channel,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    },
    stop() {
      unsubscribe();
      seen = {};
    },
  };
}
