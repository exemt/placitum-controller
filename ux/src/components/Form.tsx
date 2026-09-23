import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Box from "@mui/material/Box";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { type SxProps, type Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";

import { TableIconButton } from "./data-table/TableIconButton.tsx";
import { TableNotice } from "./data-table/TableNotice.tsx";
import { FocusScope } from "./FocusContext.tsx";
import { scrollbarSx } from "./scrollbar.ts";
import { errorMessage } from "../errors.ts";
import { useT } from "../i18n/index.ts";
import type { FormNotice as FormNoticeValue } from "../store/slices/forms.ts";

export type FormCtx = {
  id: string;
  actionsEl: HTMLElement | null;
  setActionsEl: (el: HTMLElement | null) => void;
  headEl: HTMLElement | null;
  setHeadEl: (el: HTMLElement | null) => void;
};

const Ctx = createContext<FormCtx | null>(null);

export function formActionsPortalId(formId: string): string {
  return `${formId}-actions-portal`;
}

export function formHeadPortalId(formId: string): string {
  return `${formId}-head-portal`;
}

export function useForm(): FormCtx {
  const ctx = useContext(Ctx);
  if (ctx === null) {
    throw new Error("Form.* must be used inside <Form>");
  }
  return ctx;
}

export function useFormActionsPortal(): HTMLElement | null | undefined {
  const ctx = useContext(Ctx);
  if (ctx === null) {
    return undefined;
  }
  return ctx.actionsEl;
}

export function useFormHeadPortal(): HTMLElement | null | undefined {
  const ctx = useContext(Ctx);
  if (ctx === null) {
    return undefined;
  }
  return ctx.headEl;
}

export function FormHead({ children }: { children: ReactNode }) {
  const el = useFormHeadPortal();
  if (el === null || el === undefined) {
    return null;
  }
  return createPortal(children, el);
}

export type FormProps = {
  id: string;
  children: ReactNode;
  sx?: SxProps<Theme>;
};

export function formScrollSx(theme: Theme) {
  return {
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable both-edges",
    ...scrollbarSx(theme),
  } as const;
}

export const formDrawerPaperSx = {
  height: "100%",
  maxHeight: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  overflowY: "hidden",
  flex: "1 1 auto",
} as const;

function FormRoot({ id, children, sx }: FormProps) {
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const [headEl, setHeadEl] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ id, actionsEl, setActionsEl, headEl, setHeadEl }),
    [id, actionsEl, headEl],
  );

  return (
    <Ctx.Provider value={value}>
      <FocusScope>
      <Box
        id={id}
        sx={[
          {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxHeight: "100%",
            minHeight: 0,
            flex: "1 1 auto",
            overflow: "hidden",
          },
          ...(Array.isArray(sx) ? sx : sx !== undefined ? [sx] : []),
        ]}
      >
        {children}
      </Box>
      </FocusScope>
    </Ctx.Provider>
  );
}

function mergeSx(base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> {
  return [base, ...(Array.isArray(sx) ? sx : sx !== undefined ? [sx] : [])];
}

function FormHeader({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  useForm();
  return (
    <DialogTitle component="div" sx={mergeSx({ flexShrink: 0 }, sx)}>
      {children}
    </DialogTitle>
  );
}

function FormClose({
  onClick,
  disabled,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const t = useT();
  const label = ariaLabel ?? t("common.close");
  return (
    <TableIconButton
      icon={<CloseIcon />}
      tooltip={label}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    />
  );
}

export type FormTitleProps = {
  title: ReactNode;
  label?: ReactNode;
  help?: ReactNode;
  id?: string;
  onClose?: () => void;
  closeDisabled?: boolean;
  busy?: boolean;
  children?: ReactNode;
  sx?: SxProps<Theme>;
};

function FormTitle({
  title,
  label,
  help,
  id,
  onClose,
  closeDisabled,
  busy,
  children,
  sx,
}: FormTitleProps) {
  const { id: formId, setHeadEl } = useForm();
  return (
    <DialogTitle
      component="div"
      sx={mergeSx({ flexShrink: 0, position: "relative" }, sx)}
    >
      <Typography
        id={id}
        variant="subtitle1"
        noWrap
        sx={{ fontWeight: 600, minWidth: 0, flexShrink: 0 }}
      >
        {title}
      </Typography>
      {label !== undefined &&
        (typeof label === "string" ? (
          <Typography
            variant="caption"
            noWrap
            sx={{ color: "text.secondary", minWidth: 0 }}
          >
            {label}
          </Typography>
        ) : (
          label
        ))}
      {help}
      <Box sx={{ flex: 1, minWidth: 8 }} />
      <Box
        id={formHeadPortalId(formId)}
        ref={setHeadEl}
        sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}
      />
      {children}
      {onClose !== undefined && (
        <FormClose onClick={onClose} disabled={closeDisabled} />
      )}
      {busy === true && (
        <LinearProgress
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -1,
            height: 2,
          }}
        />
      )}
    </DialogTitle>
  );
}

const stripSx = {
  flexShrink: 0,
  borderRadius: 0,
  px: 2,
  py: 1.25,
} as const;

function stripEdge(side: "top" | "bottom") {
  return {
    ...(side === "top" ? { borderTop: 1 } : { borderBottom: 1 }),
    borderColor: "divider",
  } as const;
}

function FormNotice({
  notice,
  onDismiss,
  action,
  sx,
}: {
  notice: FormNoticeValue | null | undefined;
  onDismiss?: () => void;
  action?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const t = useT();
  if (notice === null || notice === undefined) {
    return null;
  }
  const severity = notice.severity ?? "error";
  const text =
    notice.code !== undefined && notice.code !== ""
      ? errorMessage(t, notice.code)
      : notice.text;
  const title =
    notice.title ?? (severity === "error" ? t("modal.errorTitle") : "");
  return (
    <TableNotice
      severity={severity}
      kind={severity === "error" ? "error" : "info"}
      title={title}
      message={text}
      action={
        action ??
        (onDismiss === undefined ? undefined : (
          <TableIconButton
            icon={<CloseIcon />}
            tooltip={t("common.close")}
            color={severity === "error" ? "error" : "primary"}
            onClick={onDismiss}
          />
        ))
      }
      sx={mergeSx({ ...stripSx, ...stripEdge("bottom") }, sx)}
    />
  );
}

function FormBody({
  children,
  spacing = 1.5,
  scroll,
  flush,
  banner,
  bannerActionLabel,
  onBannerAction,
  sx,
}: {
  children: ReactNode;
  spacing?: number;
  scroll?: boolean;
  flush?: boolean;
  banner?: ReactNode;
  bannerActionLabel?: string;
  onBannerAction?: () => void;
  sx?: SxProps<Theme>;
}) {
  useForm();
  const strip =
    banner === undefined || banner === null ? null : (
      <TableNotice
        severity="info"
        message={banner}
        actionLabel={bannerActionLabel}
        onAction={onBannerAction}
        sx={{ ...stripSx, ...stripEdge("top") }}
      />
    );
  return (
    <>
      {strip}
      <DialogContent
        dividers
        sx={mergeSx(
          {
            flex: "1 1 auto",
            minHeight: 0,
            minWidth: 0,
            ...(scroll === true
              ? { overflowY: "auto", overflowX: "hidden" }
              : {}),
            ...(flush === true ? { p: 0 } : {}),
          },
          sx,
        )}
      >
        <Stack
          spacing={spacing}
          sx={[...(spacing === 0 ? [{ flex: 1, minHeight: 0 }] : [])]}
        >
          {children}
        </Stack>
      </DialogContent>
    </>
  );
}

function FormActions({
  children,
  sx,
}: {
  children?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const { id, setActionsEl } = useForm();
  return (
    <DialogActions
      sx={mergeSx({ flexShrink: 0, justifyContent: "flex-start" }, sx)}
    >
      <Box
        id={formActionsPortalId(id)}
        ref={setActionsEl}
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
        }}
      />
      {children}
    </DialogActions>
  );
}

type FormComponent = ((props: FormProps) => ReactElement) & {
  Header: typeof FormHeader;
  Title: typeof FormTitle;
  Body: typeof FormBody;
  Notice: typeof FormNotice;
  Actions: typeof FormActions;
  Close: typeof FormClose;
  Head: typeof FormHead;
};

export const Form = FormRoot as FormComponent;
Form.Header = FormHeader;
Form.Title = FormTitle;
Form.Body = FormBody;
Form.Notice = FormNotice;
Form.Actions = FormActions;
Form.Close = FormClose;
Form.Head = FormHead;
