import { useState, type ReactNode } from "react";

import { ConfirmModal } from "../Modal.tsx";
import { CopyNameModal } from "../CopyNameModal.tsx";
import { RowActionsCell, type RowAction } from "./RowActions.tsx";
import { useT } from "../../i18n/index.ts";
import { errorCode } from "../../errors.ts";

export type RowOpsConfig<Row> = {
  nameOf: (row: Row) => string;
  deleteText?: (row: Row) => ReactNode;
  copy?: (row: Row, name: string) => Promise<string | null>;
  remove?: (row: Row) => Promise<string | null>;
  copyTitle?: string;
  copyNameLabel?: string;
  copyNameHint?: string;
  deleteTitle?: string;
};

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
