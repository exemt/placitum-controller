/**
 * Сходимость конфигурации: что издано, что запланировано и что контроллер
 * когда-либо издавал.
 *
 * Раньше `desired` был один на всех инспекторов (`fleet.rulesDesired`) и
 * заполнялся из канала правил. Для modsec это верно, для `auth`, `captcha` и
 * `ip` -- нет: у них свои манифесты, и исправные реплики вечно светились
 * `drift`. Здесь он по каналам, и канал инспектора выбирается по имени.
 *
 * Журнал изданного (`ledger`) -- кольцо хешей на канал. Он отвечает на вопрос,
 * на который KV ответить не может: хеш на узле -- моё прежнее поколение
 * (дренаж) или то, чего я не издавал (правка руками, чужой контур). Живёт в
 * памяти процесса и подтягивается на старте из истории бакета; переживать
 * рестарт ему незачем -- поколения старше этого окна на живом узле означают,
 * что дренаж давно не дренаж.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { CHANNEL_IDS, type ChannelId } from "../../convergence/channels.ts";
import type { ChannelRequirement } from "../../convergence/planner.ts";
import type { DesiredView, DraftView } from "../../convergence/state.ts";

/** Глубина кольца журнала на канал. */
export const LEDGER_MAX = 32;

export interface DraftEntry extends DraftView {
  /** План устарел: источник тронули, пересчёт ещё не дошёл. */
  stale: boolean;
  tookMs: number;
  /** Имена наборов этого поколения. */
  profiles: string[];
  /** Чего этот канал требует от других: `profile=` в шаблоне nginx. */
  requires: ChannelRequirement[];
}

export type ChannelDrafts = Partial<Record<ChannelId, DraftEntry>>;

/** Отпечаток источника на момент последней рассылки: по каналу. */
export type ChannelSent = Partial<Record<ChannelId, string>>;

export interface ConvergenceState {
  desired: Partial<Record<ChannelId, DesiredView>>;
  ledger: Partial<Record<ChannelId, string[]>>;
  /** По пространству: у каждого свой черновик и свой хеш. */
  drafts: Record<string, ChannelDrafts>;
  /**
   * Что было в базе, когда канал рассылали. Живёт в памяти процесса: после
   * рестарта неизвестно, и тогда правки сверять не с чем -- молчать честнее,
   * чем показать расхождение, которого, может, и нет.
   */
  sent: Record<string, ChannelSent>;
  seq: number;
}

const initialState: ConvergenceState = {
  desired: {},
  ledger: {},
  drafts: {},
  sent: {},
  seq: 0,
};

function remember(state: ConvergenceState, channel: ChannelId, hash: string): void {
  if (hash === "") {
    return;
  }
  const ring = state.ledger[channel] ?? [];
  if (ring[ring.length - 1] === hash) {
    return;
  }
  state.ledger[channel] = [...ring.filter((row) => row !== hash), hash].slice(
    -LEDGER_MAX,
  );
}

const slice = createSlice({
  name: "convergence",
  initialState,
  reducers: {
    /**
     * Поколение в KV. `published` -- контроллер сам его туда положил, значит
     * хеш идёт в журнал. Чужая запись в тот же ключ в журнал не попадает: она
     * ровно то, что журнал и должен помочь заметить.
     */
    desiredSeen(
      state,
      action: PayloadAction<{
        channel: ChannelId;
        hash: string;
        rev: number;
        profiles?: string[];
        at?: string;
        published: boolean;
      }>,
    ) {
      const { channel, hash, rev, profiles, at, published } = action.payload;
      const cur = state.desired[channel];

      if (published) {
        remember(state, channel, hash);
      }

      if (cur !== undefined && cur.hash === hash && cur.rev === rev) {
        return;
      }

      state.desired[channel] = {
        hash,
        rev,
        at: at ?? new Date().toISOString(),
        ...(profiles === undefined ? {} : { profiles }),
      };
      state.seq += 1;
    },

    /** Хеш из истории бакета на старте: поколение, но не «только что издано». */
    ledgerSeen(
      state,
      action: PayloadAction<{ channel: ChannelId; hashes: string[] }>,
    ) {
      for (const hash of action.payload.hashes) {
        remember(state, action.payload.channel, hash);
      }
    },

    draftPlanned(
      state,
      action: PayloadAction<{
        scope: string;
        channel: ChannelId;
        draft: DraftEntry;
      }>,
    ) {
      const { scope, channel, draft } = action.payload;
      const bucket = (state.drafts[scope] ??= {});
      const cur = bucket[channel];

      if (
        cur !== undefined &&
        !cur.stale &&
        cur.hash === draft.hash &&
        cur.ok === draft.ok &&
        cur.empty === draft.empty &&
        cur.errors.length === draft.errors.length
      ) {
        return;
      }

      bucket[channel] = draft;
      state.seq += 1;
    },

    /**
     * Источник канала тронули. Хеш пока прежний -- он и остаётся на экране,
     * помеченный как устаревший: мигать «неизвестно» на каждое нажатие в
     * форме хуже, чем показать прошлое значение и досчитать.
     */
    draftStale(
      state,
      action: PayloadAction<{ scope?: string; channels: ChannelId[] }>,
    ) {
      const { scope, channels } = action.payload;
      const scopes = scope === undefined ? Object.keys(state.drafts) : [scope];
      let changed = false;

      for (const key of scopes) {
        const bucket = (state.drafts[key] ??= {});
        for (const channel of channels) {
          const cur = bucket[channel];
          if (cur === undefined) {
            continue;
          }
          if (!cur.stale) {
            cur.stale = true;
            changed = true;
          }
        }
      }

      if (changed) {
        state.seq += 1;
      }
    },

    /**
     * Канал разослан: запомнить, что было в базе в этот момент. Иначе правка,
     * которую компилятор не печатает, осталась бы невидимой навсегда --
     * `config_hash` на неё не двигается по построению.
     */
    sentSource(
      state,
      action: PayloadAction<{ scope: string; channel: ChannelId; sourceHash: string }>,
    ) {
      const { scope, channel, sourceHash } = action.payload;
      const bucket = (state.sent[scope] ??= {});

      if (bucket[channel] === sourceHash) {
        return;
      }

      bucket[channel] = sourceHash;
      state.seq += 1;
    },

    forgetScope(state, action: PayloadAction<string>) {
      if (state.drafts[action.payload] !== undefined) {
        delete state.drafts[action.payload];
        delete state.sent[action.payload];
        state.seq += 1;
      }
    },
  },
});

export const convergenceReducer = slice.reducer;
export const {
  desiredSeen: convergenceDesiredSeen,
  ledgerSeen: convergenceLedgerSeen,
  draftPlanned: convergenceDraftPlanned,
  draftStale: convergenceDraftStale,
  sentSource: convergenceSentSource,
  forgetScope: convergenceForgetScope,
} = slice.actions;

export function selectDesired(
  state: { convergence: ConvergenceState },
  channel: ChannelId,
): DesiredView | null {
  return state.convergence.desired[channel] ?? null;
}

export function selectLedger(
  state: { convergence: ConvergenceState },
  channel: ChannelId,
): readonly string[] {
  return state.convergence.ledger[channel] ?? [];
}

export function selectSentSource(
  state: { convergence: ConvergenceState },
  scope: string,
  channel: ChannelId,
): string | null {
  return state.convergence.sent[scope]?.[channel] ?? null;
}

export function selectDrafts(
  state: { convergence: ConvergenceState },
  scope: string,
): ChannelDrafts {
  return state.convergence.drafts[scope] ?? {};
}

/** Каналы, чей план пора пересчитать. */
export function selectStaleChannels(
  state: { convergence: ConvergenceState },
  scope: string,
): ChannelId[] {
  const bucket = state.convergence.drafts[scope];
  return CHANNEL_IDS.filter((id) => {
    const row = bucket?.[id];
    return row === undefined || row.stale;
  });
}
