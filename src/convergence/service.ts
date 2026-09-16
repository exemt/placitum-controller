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
  agent: [],
  haproxy: [],
  rules: ["ruleFiles", "ruleSets"],
  ip: ["ipProfiles", "ipCountries", "datasets"],
  auth: [],
  captcha: [],
  json: [],
  action: [],
  cookie: [],
  counter: [],
  vlai: [],
  rewrite: [],
};

export interface ConvergenceServiceOptions {
  ttlMs?: number;
}

export interface ConvergenceService {
  refresh(scope: string, force?: boolean): Promise<void>;
  invalidate(channels: ChannelId[], scope?: string): void;
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

  {
    const state = getState();
    for (const id of CHANNEL_IDS) {
      for (const key of FEEDS[id]) {
        seen[key] = state[key];
      }
    }
  }

  const inFlight = new Map<string, Promise<void>>();

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
