import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import Button from "@mui/material/Button";
import type { ButtonProps } from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

import { Form, FormHead } from "./Form.tsx";
import { useT } from "../i18n/index.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closeForm,
  setFormNotice,
  type FormNotice,
} from "../store/slices/forms.ts";

export type ModalSize = "xs" | "sm" | "md" | "lg" | "xl";

export type ModalProps = {
  id?: string;
  open?: boolean;
  onClose?: () => void;

  title: ReactNode;
  label?: ReactNode;
  hint?: ReactNode;
  head?: ReactNode;

  size?: ModalSize;
  busy?: boolean;
  notice?: FormNotice | null;
  onNoticeClose?: () => void;

  actions?: ReactNode;
  onEnter?: () => void;

  spacing?: number;
  flush?: boolean;
  scroll?: boolean;
  dismissable?: boolean;
  dirty?: boolean;
  closable?: boolean;

  children: ReactNode;
  sx?: SxProps<Theme>;
};

type ModalCtxValue = { close: () => void; busy: boolean };

const ModalCtx = createContext<ModalCtxValue | null>(null);

function useModalCtx(): ModalCtxValue {
  const ctx = useContext(ModalCtx);
  if (ctx === null) {
    throw new Error("Modal.* must be used inside <Modal>");
  }
  return ctx;
}

function ModalRoot({
  id,
  open: openProp,
  onClose,
  title,
  label,
  hint,
  head,
  size = "sm",
  busy: busyProp,
  notice: noticeProp,
  onNoticeClose,
  actions,
  onEnter,
  spacing = 1.5,
  flush,
  scroll = true,
  dismissable = true,
  dirty,
  closable = true,
  children,
  sx,
}: ModalProps) {
  const t = useT();
  const dispatch = useAppDispatch();
  const auto = useId();
  const titleId = useId();
  const formId = id ?? auto;
  const [askDiscard, setAskDiscard] = useState(false);

  const entry = useAppSelector((s) =>
    id === undefined ? undefined : s.forms.byName[id],
  );

  const open = openProp ?? (id === undefined ? true : entry?.open === true);
  const busy = busyProp ?? entry?.busy === true;
  const notice = noticeProp !== undefined ? noticeProp : entry?.notice;

  const close = useCallback(() => {
    if (onClose !== undefined) {
      onClose();
      return;
    }
    if (id !== undefined) {
      dispatch(closeForm(id));
    }
  }, [onClose, id, dispatch]);

  const dismiss = useCallback(() => {
    if (dirty === true) {
      setAskDiscard(true);
      return;
    }
    close();
  }, [dirty, close]);

  const dismissNotice = useCallback(() => {
    if (onNoticeClose !== undefined) {
      onNoticeClose();
      return;
    }
    if (id !== undefined) {
      dispatch(setFormNotice({ name: id, notice: null }));
    }
  }, [onNoticeClose, id, dispatch]);

  const noticeDismissable =
    onNoticeClose !== undefined || (id !== undefined && noticeProp === undefined);

  const ctx = useMemo(() => ({ close, busy }), [close, busy]);

  return (
    <ModalCtx.Provider value={ctx}>
      <Dialog
        open={open}
        maxWidth={size}
        fullWidth
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (onEnter === undefined || event.key !== "Enter" || busy) {
            return;
          }
          const el = event.target as HTMLElement;
          if (
            el.tagName !== "INPUT" ||
            (el as HTMLInputElement).type === "checkbox"
          ) {
            return;
          }
          event.preventDefault();
          onEnter();
        }}
        onClose={(_event, reason) => {
          if (busy) {
            return;
          }
          if (
            !dismissable &&
            (reason === "backdropClick" || reason === "escapeKeyDown")
          ) {
            return;
          }
          dismiss();
        }}
        slotProps={{
          paper: {
            sx: [
              {
                maxHeight: "calc(100% - 64px)",
              },
              ...(Array.isArray(sx) ? sx : sx !== undefined ? [sx] : []),
            ],
          },
        }}
      >
        <Form id={formId}>
          <Form.Title
            id={titleId}
            title={title}
            label={label}
            busy={busy}
            onClose={closable ? dismiss : undefined}
            closeDisabled={busy}
          >
            {head}
          </Form.Title>
          <Form.Body spacing={spacing} scroll={scroll} flush={flush}>
            {hint !== undefined && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {hint}
              </Typography>
            )}
            {children}
          </Form.Body>
          <Form.Notice
            notice={notice}
            onDismiss={noticeDismissable ? dismissNotice : undefined}
          />
          <Form.Actions>{actions ?? <ModalClose />}</Form.Actions>
        </Form>
      </Dialog>
      {open && askDiscard && (
        <ConfirmModal
          open
          title={t("modal.dirtyTitle")}
          text={t("modal.dirtyText")}
          confirmLabel={t("modal.discard")}
          danger
          onClose={() => setAskDiscard(false)}
          onConfirm={() => {
            setAskDiscard(false);
            close();
          }}
        />
      )}
    </ModalCtx.Provider>
  );
}

function ModalCancel({ children, ...props }: ButtonProps) {
  const t = useT();
  const { close, busy } = useModalCtx();
  return (
    <Button onClick={close} disabled={busy} {...props}>
      {children ?? t("common.cancel")}
    </Button>
  );
}

function ModalClose({ children, ...props }: ButtonProps) {
  const t = useT();
  const { close, busy } = useModalCtx();
  return (
    <Button onClick={close} disabled={busy} {...props}>
      {children ?? t("common.close")}
    </Button>
  );
}

function ModalSubmit({ children, disabled, ...props }: ButtonProps) {
  const t = useT();
  const { busy } = useModalCtx();
  return (
    <Button
      variant="contained"
      disabled={disabled === true || busy}
      {...props}
    >
      {children ?? t("common.save")}
    </Button>
  );
}

type ModalComponent = ((props: ModalProps) => ReactElement) & {
  Cancel: typeof ModalCancel;
  Close: typeof ModalClose;
  Submit: typeof ModalSubmit;
  Head: typeof FormHead;
};

export const Modal = ModalRoot as ModalComponent;
Modal.Cancel = ModalCancel;
Modal.Close = ModalClose;
Modal.Submit = ModalSubmit;
Modal.Head = FormHead;

export type ConfirmModalProps = {
  id?: string;
  open?: boolean;
  onClose?: () => void;
  title: ReactNode;
  text: ReactNode;
  label?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  color?: ButtonProps["color"];
  busy?: boolean;
  notice?: FormNotice | null;
  onConfirm: () => void;
};

export function ConfirmModal({
  id,
  open,
  onClose,
  title,
  text,
  label,
  confirmLabel,
  danger,
  color,
  busy,
  notice,
  onConfirm,
}: ConfirmModalProps) {
  const t = useT();
  return (
    <Modal
      id={id}
      open={open}
      onClose={onClose}
      title={title}
      label={label}
      size="xs"
      busy={busy}
      notice={notice}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            color={color ?? (danger === true ? "error" : "primary")}
            onClick={onConfirm}
          >
            {confirmLabel ??
              (danger === true ? t("common.delete") : t("common.apply"))}
          </Modal.Submit>
        </>
      }
    >
      <Typography variant="body2">{text}</Typography>
    </Modal>
  );
}
