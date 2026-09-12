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

/**
 * Модальное окно панели. Одно на все окна -- других в панели быть не должно.
 *
 * Устройство сверху вниз, и оно не обсуждается на месте:
 *
 * ```
 * заголовок · приписка · слот вставок · крестик
 * ─────────────────────────────────────────────
 * тело (прокручивается)
 * ─────────────────────────────────────────────
 * полоса: что сорвалось            (если есть)
 * ─────────────────────────────────────────────
 * кнопки
 * ```
 *
 * Порядок задан здесь, а не вызывающим кодом: тело и кнопки приходят разными
 * свойствами (`children` и `actions`) именно поэтому. Пока окна собирали из
 * `Dialog` + `DialogTitle` + `DialogContent` вручную, каждое второе теряло
 * крестик, каждое третье -- прокрутку, а полоса отказа вставала то внутрь
 * тела (уезжала со скроллом), то над кнопками без линейки.
 *
 * Открытость окна бывает двух видов, и оба нужны:
 *
 * - `id` -- окно в сторе (`store/slices/forms.ts`). Так открываются окна,
 *   которые зовут из строки таблицы или шапки раздела, и закрывает их thunk
 *   записи. Тогда занятость и полоса тоже приходят из стора -- см. [useModal].
 * - `open`/`onClose` -- окно, живущее в состоянии родителя: правка черновой
 *   строки, которую ещё не с чем сохранять. Такое окно родитель и монтирует.
 *
 * Смонтированное без обоих окно считается открытым: `{editing !== null &&
 * <Modal …/>}` -- обычный для панели способ показать окно правки строки.
 */

export type ModalSize = "xs" | "sm" | "md" | "lg" | "xl";

export type ModalProps = {
  /** Ключ окна в сторе. Тогда открытость, занятость и полоса -- оттуда. */
  id?: string;
  open?: boolean;
  /** Умолчание для окна с `id` -- закрыть его в сторе. */
  onClose?: () => void;

  title: ReactNode;
  label?: ReactNode;
  /** Строка под шапкой: зачем это окно. Не пересказ заголовка. */
  hint?: ReactNode;
  /** Кнопки шапки: левее крестика. Для вставок из глубины -- [Modal.Head]. */
  head?: ReactNode;

  size?: ModalSize;
  busy?: boolean;
  notice?: FormNotice | null;
  /** Крестик на полосе. У окна с `id` полоса убирается сама. */
  onNoticeClose?: () => void;

  /** Кнопки подвала. Без них окно закрывается только крестиком -- см. ниже. */
  actions?: ReactNode;
  /**
   * Enter в текстовом поле окна -- то же, что главная кнопка.
   *
   * Только из `input`: у селектора, галочки и тумблера Enter свой смысл
   * (открыть список, переключить), а событие всплывает по дереву React и
   * доходит сюда даже из меню, отрисованного порталом.
   */
  onEnter?: () => void;

  /** Расстояние между полями тела; `0` -- когда тело одно (таблица, редактор). */
  spacing?: number;
  /** Тело от края до края: таблица со своей шапкой, редактор конфига. */
  flush?: boolean;
  /** Прокрутка тела. Снимается, когда прокручивается что-то внутри тела. */
  scroll?: boolean;
  /**
   * Закрывать по клику мимо окна и по Esc. Снимается там, где закрытие само
   * по себе что-то значит (мастер в несколько шагов).
   */
  dismissable?: boolean;
  /**
   * В окне есть несохранённое. Тогда закрытие «мимоходом» -- промах мимо окна,
   * Esc, крестик -- сначала спрашивает. «Отмена» не спрашивает: она и значит
   * «выбросить».
   */
  dirty?: boolean;
  /**
   * Крестик в шапке. Снимается вместе с `dismissable` у окна, из которого
   * есть ровно один выход -- кнопка подвала (согласие с лицензией): крестик,
   * который ничего не делает, хуже отсутствующего.
   */
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

  /** Закрытие мимоходом: крестик, промах, Esc. */
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
          /*
           * Пока идёт запись, окно не закрывается ничем: ни промахом, ни Esc.
           * Иначе оператор теряет из виду и запрос, и его отказ.
           */
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
                /*
                 * Окно не встаёт в полный рост экрана: полоска фона сверху и
                 * снизу отделяет его от страницы, а тело прокручивается само.
                 */
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
          {/*
            Подвал есть всегда, даже когда кнопок не дали: в нём стоит слот
            пагинатора (`formActionsPortalId`), а окно без единого способа
            выйти, кроме крестика, -- не окно панели.
          */}
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

/** «Отмена»: уйти, ничего не записав. */
function ModalCancel({ children, ...props }: ButtonProps) {
  const t = useT();
  const { close, busy } = useModalCtx();
  return (
    <Button onClick={close} disabled={busy} {...props}>
      {children ?? t("common.cancel")}
    </Button>
  );
}

/** «Закрыть»: окно, которое ничего не меняет (просмотр, справка). */
function ModalClose({ children, ...props }: ButtonProps) {
  const t = useT();
  const { close, busy } = useModalCtx();
  return (
    <Button onClick={close} disabled={busy} {...props}>
      {children ?? t("common.close")}
    </Button>
  );
}

/**
 * Главное действие окна: «Сохранить», «Добавить», «Применить».
 *
 * Оно одно и стоит последним. Занятость гасит его само -- повторное нажатие
 * по неотвеченному запросу заводило вторую запись.
 */
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
  /** Вопрос целиком: что произойдёт и с чем. */
  text: ReactNode;
  label?: ReactNode;
  confirmLabel?: string;
  /** Действие необратимо: кнопка красная. */
  danger?: boolean;
  /** Когда `danger` слишком сильно: снятие ссылки, откат черновика. */
  color?: ButtonProps["color"];
  busy?: boolean;
  notice?: FormNotice | null;
  onConfirm: () => void;
};

/**
 * Подтверждение необратимого: снять сертификат, удалить путь, стереть правку.
 *
 * Отдельным компонентом, потому что таких окон в панели восемь и они
 * одинаковы во всём, кроме фразы. Своё тело им не нужно: как только в
 * подтверждении появляются поля, это уже форма -- [Modal].
 */
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
