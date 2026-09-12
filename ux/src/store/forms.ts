import { useCallback, useMemo } from "react";

import { useAppDispatch, useAppSelector } from "./hooks.ts";
import {
  closeForm,
  noticeOfError,
  openForm,
  setFormBusy,
  setFormNotice,
  type FormNotice,
} from "./slices/forms.ts";

export type { FormNotice, FormSeverity } from "./slices/forms.ts";

export function onFormOpen(name: string): (payload?: unknown) => void {
  const dispatch = useAppDispatch();
  return useCallback(
    (payload?: unknown) => {
      dispatch(openForm({ name, payload }));
    },
    [dispatch, name],
  );
}

export function onFormClose(name?: string): () => void {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    dispatch(closeForm(name));
  }, [dispatch, name]);
}

export function onFormIsOpen(name: string): boolean {
  return useAppSelector((s) => s.forms.byName[name]?.open === true);
}

export function onFormPayload<T = unknown>(name: string): T | undefined {
  return useAppSelector((s) => s.forms.byName[name]?.payload as T | undefined);
}

export function onFormBusy(name: string): boolean {
  return useAppSelector((s) => s.forms.byName[name]?.busy === true);
}

export function onFormNotice(name: string): FormNotice | undefined {
  return useAppSelector((s) => s.forms.byName[name]?.notice);
}

export const useFormOpen = onFormOpen;
export const useFormClose = onFormClose;
export const useFormIsOpen = onFormIsOpen;
export const useFormPayload = onFormPayload;
export const useFormBusy = onFormBusy;
export const useFormNotice = onFormNotice;

export type ModalCtl<T> = {
  open: boolean;
  /** Чем открыли: строка таблицы, уровень конфига, тип набора. */
  payload: T | undefined;
  busy: boolean;
  notice: FormNotice | undefined;
  close: () => void;
  /** Показать полосу под телом; `null` -- убрать. */
  notify: (notice: FormNotice | null) => void;
  /** Полоса из отказа контроллера: код переведётся сам. */
  fail: (err: unknown) => void;
  /**
   * Запись из окна: занятость на время запроса, полоса на отказе, закрытие
   * на успехе. Возвращает, дошло ли дело до конца.
   *
   * `stay` оставляет окно открытым (список, который пополняют не выходя).
   */
  submit: (
    task: () => unknown | Promise<unknown>,
    opts?: { stay?: boolean },
  ) => Promise<boolean>;
};

/**
 * Ручка окна целиком: открытость, полезная нагрузка, занятость, полоса.
 *
 * Собрана в один хук, потому что порядок этих четырёх шагов у всех окон
 * одинаковый, а руками его каждый раз писали по-своему: где-то `busy` не
 * снимался на отказе, где-то полоса оставалась висеть после повторной
 * удачной записи.
 */
export function useModal<T = unknown>(name: string): ModalCtl<T> {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((s) => s.forms.byName[name]);

  const close = useCallback(() => {
    dispatch(closeForm(name));
  }, [dispatch, name]);

  const notify = useCallback(
    (notice: FormNotice | null) => {
      dispatch(setFormNotice({ name, notice }));
    },
    [dispatch, name],
  );

  const fail = useCallback(
    (err: unknown) => {
      dispatch(setFormNotice({ name, notice: noticeOfError(err) }));
    },
    [dispatch, name],
  );

  const submit = useCallback(
    async (
      task: () => unknown | Promise<unknown>,
      opts?: { stay?: boolean },
    ): Promise<boolean> => {
      dispatch(setFormBusy({ name, busy: true }));
      dispatch(setFormNotice({ name, notice: null }));
      try {
        await task();
      } catch (err: unknown) {
        dispatch(setFormBusy({ name, busy: false }));
        dispatch(setFormNotice({ name, notice: noticeOfError(err) }));
        return false;
      }
      if (opts?.stay === true) {
        dispatch(setFormBusy({ name, busy: false }));
      } else {
        dispatch(closeForm(name));
      }
      return true;
    },
    [dispatch, name],
  );

  return useMemo(
    () => ({
      open: entry?.open === true,
      payload: entry?.payload as T | undefined,
      busy: entry?.busy === true,
      notice: entry?.notice,
      close,
      notify,
      fail,
      submit,
    }),
    [entry, close, notify, fail, submit],
  );
}
