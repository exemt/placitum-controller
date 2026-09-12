/**
 * Сходимость в панели: опрос, словарь состояний и хук страницы.
 *
 * Опрос, а не сокет: снимок считается по запросу (планы дорогие, `packIp`
 * ходит по всем наборам адресов), и гонять их фоном на контуре, куда никто не
 * смотрит, незачем. Открытая панель -- и есть «смотрят».
 */

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

/** Как часто перечитывать снимок при открытой панели. */
const POLL_MS = 10_000;

/**
 * Пауза после правки перед пересчётом. Сохранение карточки часто идёт серией
 * запросов (сервер, потом его listen, потом сертификат); считать план на
 * каждый -- дорого и бессмысленно, важен итог серии.
 */
const AFTER_EDIT_MS = 400;

export type Tone = "default" | "info" | "warning" | "error" | "success";

/**
 * Цвет состояния. Красное -- то, что чинят руками: поколение не встало или на
 * узле лежит не наше. Жёлтое -- то, что проходит само или одной кнопкой.
 * Серое -- «этого канала тут нет», и оно обязано быть серым: канал, которым
 * контур не пользуется, покрашенный в жёлтый, отучает смотреть на цвет.
 */
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

/**
 * Состояния, в которых кнопка «Разослать» осмысленна.
 *
 * `converging` сюда не входит: поколение уже едет, и повторная публикация
 * того же хеша только сбросит счётчик ожидания. `silent` -- тоже: рассылать
 * тому, кто молчит, бессмысленно, там ищут узел. `unmanaged` -- канал, у
 * которого нет читателя: предлагать «разослать» в пустоту хуже, чем не
 * предлагать ничего.
 */
const SENDABLE = new Set<ChannelState>([
  "dirty",
  "never",
  "failed",
  "foreign",
  /*
   * `no_effect` -- правка, которую компилятор не печатает. Рассылка её не
   * «доставит», но снимет отметку: контроллер запомнит новый отпечаток
   * источника, и оператор увидит честное «разослано, конфигурация прежняя»
   * вместо вечного предупреждения.
   */
  "no_effect",
]);

export function channelLabel(t: Translate, id: ChannelId): string {
  return t(`convergence.channel.${id}`);
}

export function channelStateLabel(t: Translate, state: ChannelState): string {
  return t(`convergence.state.${state}`);
}

/**
 * Наблюдатель за конфигурацией. Висит один раз рядом с сокетом флота и знает
 * два повода пересчитать: любая успешная правка через API -- сразу, и опрос
 * по таймеру -- на случай правок из другой вкладки или другим оператором.
 */
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
      // Свои же запросы пересчёта в пересчёт не вводим: получилась бы петля.
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
  /** Кнопке есть что делать: расхождение и оно лечится рассылкой. */
  canSend: boolean;
  send: () => void;
  /** Пересчитать план этого канала прямо сейчас: после «Сохранить». */
  refresh: () => void;
}

/**
 * Состояние своего канала для страницы. Ничего не считает: и хеш, и вердикт
 * приходят от контроллера -- иначе панель однажды начнёт спорить с рассылкой.
 */
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

/** Человеческая причина под чипом: почему не зелено. */
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
