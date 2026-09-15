import { useCallback, useEffect } from "react";

import { onMutation, type ChannelId, type ChannelState, type ChannelView } from "./api.ts";
import { compileErrorText } from "./compile-errors.ts";
import type { Translate } from "./i18n/index.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import {
  loadConvergence,
  selectChannel,
  sendConvergenceChannel,
} from "./store/slices/convergence.ts";

const POLL_MS = 10_000;

const AFTER_EDIT_MS = 400;

export type Tone = "default" | "info" | "warning" | "error" | "success";

export const CHANNEL_TONE: Record<ChannelState, Tone> = {
  ok: "success",
  empty: "default",
  unmanaged: "default",
  nobody: "default",
  dirty: "warning",
  no_effect: "warning",
  never: "warning",
  converging: "info",
  broken: "warning",
  silent: "warning",
  failed: "error",
  foreign: "error",
};

const SENDABLE = new Set<ChannelState>([
  "dirty",
  "never",
  "failed",
  "foreign",
  "no_effect",
]);

export function channelLabel(t: Translate, id: ChannelId): string {
  return t(`convergence.channel.${id}`);
}

export function channelStateLabel(t: Translate, state: ChannelState): string {
  return t(`convergence.state.${state}`);
}

export function ConvergenceWatch() {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    if (scope === null) {
      return;
    }

    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const tick = (force: boolean) => {
      if (alive) {
        void dispatch(loadConvergence({ scope, force }));
      }
    };

    onMutation((path) => {
      if (path.includes("/convergence")) {
        return;
      }
      if (debounce !== null) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(() => tick(true), AFTER_EDIT_MS);
    });

    tick(false);
    const timer = setInterval(() => tick(false), POLL_MS);

    return () => {
      alive = false;
      onMutation(null);
      clearInterval(timer);
      if (debounce !== null) {
        clearTimeout(debounce);
      }
    };
  }, [dispatch, scope]);

  return null;
}

export interface ChannelBar {
  channel: ChannelView | null;
  state: ChannelState | null;
  sending: boolean;
  canSend: boolean;
  send: () => void;
  refresh: () => void;
}

export function useChannel(id: ChannelId): ChannelBar {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const channel = useAppSelector((s) => selectChannel(s, id));
  const sending = useAppSelector((s) => s.convergence.sending.includes(id));

  const refresh = useCallback(() => {
    if (scope !== null) {
      void dispatch(loadConvergence({ scope, force: true }));
    }
  }, [dispatch, scope]);

  const send = useCallback(() => {
    if (scope !== null && channel !== null) {
      void dispatch(sendConvergenceChannel({ scope, channel }));
    }
  }, [dispatch, scope, channel]);

  return {
    channel,
    state: channel?.state ?? null,
    sending,
    canSend: channel !== null && !sending && SENDABLE.has(channel.state),
    send,
    refresh,
  };
}

export function channelReason(t: Translate, channel: ChannelView | null): string | null {
  if (channel === null) {
    return null;
  }

  if (channel.blocked.length > 0) {
    return channel.blocked[0].message;
  }

  if (channel.draft !== null && !channel.draft.ok && channel.draft.errors.length > 0) {
    return channel.draft.errors.map((row) => compileErrorText(t, row)).join("; ");
  }

  if (channel.counts.failed > 0) {
    const failed = channel.consumers.filter((row) => row.state === "failed");
    return t("convergence.reason.failed", {
      nodes: failed.map((row) => row.label).join(", "),
    });
  }

  if (channel.counts.foreign > 0) {
    const foreign = channel.consumers.filter((row) => row.state === "foreign");
    return t("convergence.reason.foreign", {
      nodes: foreign.map((row) => row.label).join(", "),
    });
  }

  if (channel.state === "dirty") {
    return t("convergence.reason.dirty");
  }

  if (channel.state === "no_effect") {
    return t("convergence.reason.noEffect");
  }

  if (channel.state === "never") {
    return t("convergence.reason.never");
  }

  if (channel.state === "silent") {
    return t("convergence.reason.silent");
  }

  if (channel.state === "converging") {
    return t("convergence.reason.converging");
  }

  return null;
}

export function useConvergence() {
  const snapshot = useAppSelector((s) => s.convergence.snapshot);
  const error = useAppSelector((s) => s.convergence.error);
  return { snapshot, error };
}

export function canSendState(state: ChannelState): boolean {
  return SENDABLE.has(state);
}
