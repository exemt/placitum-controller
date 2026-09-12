/**
 * Сходимость конфигурации в панели.
 *
 * Слайс, а не состояние страницы: сумма по контуру нужна шапке, то есть на
 * каждом экране. Считает всё контроллер -- здесь только последний снимок,
 * ошибка запроса и признак «идёт рассылка».
 */

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  fetchConvergence,
  refreshConvergence,
  sendChannel,
  type ChannelId,
  type ChannelView,
  type ConvergenceSnapshot,
} from "../../api.ts";

export interface ConvergenceState {
  snapshot: ConvergenceSnapshot | null;
  loading: boolean;
  error: string | null;
  /** Каналы, по которым сейчас идёт `send`: кнопка на них заблокирована. */
  sending: ChannelId[];
}

const initialState: ConvergenceState = {
  snapshot: null,
  loading: false,
  error: null,
  sending: [],
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const loadConvergence = createAsyncThunk(
  "convergence/load",
  async (arg: { scope: string; force?: boolean }) =>
    arg.force === true
      ? await refreshConvergence(arg.scope)
      : await fetchConvergence(arg.scope),
);

/**
 * Разослать канал и сразу пересчитать снимок. Пересчёт обязателен: `send`
 * отвечает своим форматом на каждый канал, и разбирать шесть разных ответов
 * ради одной строки состояния -- лишний повод разъехаться с контроллером.
 */
export const sendConvergenceChannel = createAsyncThunk(
  "convergence/send",
  async (arg: { scope: string; channel: ChannelView }, { rejectWithValue }) => {
    try {
      await sendChannel(arg.scope, arg.channel);
    } catch (err) {
      return rejectWithValue(messageOf(err));
    }
    return await refreshConvergence(arg.scope, arg.channel.id);
  },
);

const slice = createSlice({
  name: "convergence",
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    forget(state) {
      state.snapshot = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadConvergence.pending, (state) => {
        state.loading = true;
      })
      .addCase(
        loadConvergence.fulfilled,
        (state, action: PayloadAction<ConvergenceSnapshot>) => {
          state.loading = false;
          state.error = null;
          state.snapshot = action.payload;
        },
      )
      .addCase(loadConvergence.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "convergence unavailable";
      })
      .addCase(sendConvergenceChannel.pending, (state, action) => {
        state.sending = [...state.sending, action.meta.arg.channel.id];
        state.error = null;
      })
      .addCase(sendConvergenceChannel.fulfilled, (state, action) => {
        state.sending = state.sending.filter(
          (id) => id !== action.meta.arg.channel.id,
        );
        state.snapshot = action.payload;
      })
      .addCase(sendConvergenceChannel.rejected, (state, action) => {
        state.sending = state.sending.filter(
          (id) => id !== action.meta.arg.channel.id,
        );
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : (action.error.message ?? "send failed");
      });
  },
});

export const { clearError: clearConvergenceError, forget: forgetConvergence } =
  slice.actions;

export default slice.reducer;

export function selectChannel(
  state: { convergence: ConvergenceState },
  id: ChannelId,
): ChannelView | null {
  return state.convergence.snapshot?.channels.find((row) => row.id === id) ?? null;
}
