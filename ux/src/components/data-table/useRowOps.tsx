import { useState, type ReactNode } from "react";

import { ConfirmModal } from "../Modal.tsx";
import { CopyNameModal } from "../CopyNameModal.tsx";
import { RowActionsCell, type RowAction } from "./RowActions.tsx";
import { useT } from "../../i18n/index.ts";
import { errorCode } from "../../errors.ts";

/**
 * Копия и удаление строки списка -- одним куском на все страницы.
 *
 * Оба действия устроены одинаково везде: кнопка в колонке действий, окно с
 * вопросом (удаление) или с именем копии, и отказ сервера, который надо
 * показать в том же окне, а не в полосе страницы за ним. Своими руками это
 * пятнадцать одинаковых `useState` по страницам, и на пятнадцатой они уже
 * разные.
 *
 * Страница описывает только своё: как зовут строку, что случится при
 * удалении и какие ручки дёргать. Ручка возвращает текст ошибки или `null`
 * -- окно само решит, закрыться ему или показать отказ.
 */

export type RowOpsConfig<Row> = {
  /** Имя строки: заготовка имени копии и подлежащее в вопросе удаления. */
  nameOf: (row: Row) => string;
  /**
   * Вопрос удаления целиком: что исчезнет и с чем. Без него -- общая фраза
   * `table.deleteAsk`: своё пишут там, где удаление тянет за собой соседей.
   */
  deleteText?: (row: Row) => ReactNode;
  /**
   * Копия. `undefined` -- копии у этого списка нет вовсе (каталожная
   * запись, сертификат): кнопка серая с общей причиной.
   */
  copy?: (row: Row, name: string) => Promise<string | null>;
  /** Удаление. `undefined` -- строку не удаляют: кнопка серая. */
  remove?: (row: Row) => Promise<string | null>;
  /** Заголовок окна копии. По умолчанию -- «Скопировать». */
  copyTitle?: string;
  /** Подпись поля в окне копии, когда «имя» строки -- не имя (путь маршрута). */
  copyNameLabel?: string;
  copyNameHint?: string;
  /** Заголовок окна удаления. По умолчанию -- «Удалить». */
  deleteTitle?: string;
};

/** Причины серости кнопок конкретной строки: заперта, на неё ссылаются. */
export type RowGuard = {
  copy?: string;
  remove?: string;
};

export function useRowOps<Row>(cfg: RowOpsConfig<Row>): {
  cell: (row: Row, guard?: RowGuard, extra?: ReactNode) => ReactNode;
  modals: ReactNode;
} {
  const t = useT();
  const [copying, setCopying] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setCopying(null);
    setRemoving(null);
    setBusy(false);
    setError(null);
  };

  const run = (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    void (async () => {
      const failed = await fn();
      setBusy(false);
      if (failed === null) {
        close();
      } else {
        setError(failed);
      }
    })();
  };

  /*
   * Причина из `guard` сильнее общей: страница знает, почему кнопка серая
   * именно здесь («набор собран из GeoLite2»), а `table.copyOff` -- то, что
   * остаётся сказать, когда не знает никто.
   */
  const action = (
    have: boolean,
    reason: string | undefined,
    open: () => void,
  ): RowAction | undefined => {
    if (!have) {
      return reason === undefined
        ? undefined
        : { onClick: () => {}, disabled: true, tooltip: reason };
    }
    return { onClick: open, disabled: reason !== undefined, tooltip: reason };
  };

  const cell = (row: Row, guard?: RowGuard, extra?: ReactNode) => (
    <RowActionsCell
      extra={extra}
      copy={action(cfg.copy !== undefined, guard?.copy, () => {
        setError(null);
        setCopying(row);
      })}
      remove={action(cfg.remove !== undefined, guard?.remove, () => {
        setError(null);
        setRemoving(row);
      })}
    />
  );

  const modals = (
    <>
      {copying !== null && cfg.copy !== undefined && (
        <CopyNameModal
          title={cfg.copyTitle ?? t("copyModal.button")}
          source={cfg.nameOf(copying)}
          nameLabel={cfg.copyNameLabel}
          nameHint={cfg.copyNameHint}
          busy={busy}
          error={error}
          onClose={close}
          onCopy={(name) => run(() => cfg.copy!(copying, name))}
        />
      )}
      {removing !== null && cfg.remove !== undefined && (
        <ConfirmModal
          title={cfg.deleteTitle ?? t("common.delete")}
          label={cfg.nameOf(removing)}
          text={
            cfg.deleteText === undefined
              ? t("table.deleteAsk", { name: cfg.nameOf(removing) })
              : cfg.deleteText(removing)
          }
          danger
          busy={busy}
          notice={error === null ? null : { text: error, code: errorCode(error) }}
          onClose={close}
          onConfirm={() => run(() => cfg.remove!(removing))}
        />
      )}
    </>
  );

  return { cell, modals };
}
