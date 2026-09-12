import type { ReactNode } from "react";
import Alert, { type AlertColor } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import type { SxProps, Theme } from "@mui/material/styles";

import { useT } from "../../i18n/index.ts";

export type TableNoticeKind = "empty" | "none" | "loading" | "error" | "info";

export type TableNoticeProps = {
  kind?: TableNoticeKind;
  severity?: AlertColor;
  icon?: ReactNode;
  title?: string;
  message?: ReactNode;
  action?: ReactNode;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  sx?: SxProps<Theme>;
};

const kindSeverity: Record<TableNoticeKind, AlertColor> = {
  empty: "info",
  none: "info",
  loading: "info",
  error: "error",
  info: "info",
};

const noticeSx = {
  width: "100%",
  py: 1,
  px: 1.5,
  alignItems: "flex-start",
  textAlign: "left",
  "& .MuiAlert-icon": {
    py: 0.25,
    mr: 1.25,
  },
  "& .MuiAlert-message": {
    py: 0,
    minWidth: 0,
    flex: 1,
  },
  "& .MuiAlert-action": {
    pt: 0.25,
    pr: 0,
    mr: 0,
    ml: 1,
    alignItems: "flex-start",
  },
  "& .MuiAlertTitle-root": {
    fontSize: "0.8125rem",
    fontWeight: 600,
    lineHeight: 1.3,
  },
} as const;

/**
 * Пустая таблица -- состояние, а не сообщение.
 *
 * Иконка уровня и цвет `info` делали из «нет данных» второй по яркости объект
 * секции: взгляд шёл к пустой строке раньше, чем к тому, что в таблице есть.
 * Остаётся тот же текст, приглушённый до вторичного.
 */
const quietSx = {
  bgcolor: "transparent",
  color: "text.secondary",
  /*
   * Своих полей нет: заметка лежит в ячейке таблицы, у которой они уже есть
   * (`flushTableSx`, `td[colspan]`), и вторые отодвигали «Нет данных» вправо
   * от шапки колонки, под которой она стоит.
   */
  px: 0,
  "& .MuiAlertTitle-root": { color: "text.secondary", opacity: 0.85 },
  /* Подпись мельче заголовка: иначе заголовок читается подписью к подписи. */
  "& .MuiAlert-message": { fontSize: "0.75rem", opacity: 0.75 },
} as const;

function defaultTitle(kind: TableNoticeKind): string {
  switch (kind) {
    case "loading":
      return "table.loadingTitle";
    case "error":
      return "table.errorTitle";
    case "none":
      return "table.noneTitle";
    case "empty":
      return "table.emptyTitle";
    default:
      return "";
  }
}

function defaultMessage(kind: TableNoticeKind): string {
  switch (kind) {
    case "loading":
      return "table.loading";
    case "error":
      return "table.error";
    case "none":
      return "table.none";
    case "empty":
      return "table.empty";
    default:
      return "";
  }
}

export function TableNotice({
  kind = "info",
  severity,
  icon,
  title,
  message,
  action,
  actionLabel,
  actionDisabled,
  onAction,
  sx,
}: TableNoticeProps) {
  const t = useT();
  const heading = title ?? (defaultTitle(kind) !== "" ? t(defaultTitle(kind)) : "");
  const label = message ?? (defaultMessage(kind) !== "" ? t(defaultMessage(kind)) : "");
  const hasLabel = label !== "" && label !== undefined;
  /*
   * «Нет данных» и «набор снят» -- пустые состояния: у них нет иконки и нет
   * цвета уровня (см. [quietSx]). Уровень, заданный руками (`severity`),
   * остаётся сообщением: предупреждение без иконки не читается предупреждением.
   */
  const quiet = (kind === "empty" || kind === "none") && severity === undefined;
  const resolvedIcon =
    icon !== undefined
      ? icon
      : kind === "loading"
        ? <CircularProgress size={16} color="inherit" />
        : quiet
          ? false
          : undefined;
  const end =
    action ??
    (onAction !== undefined ? (
      <Button
        size="small"
        variant={kind === "error" ? "outlined" : "contained"}
        color={kind === "error" ? "error" : "primary"}
        disabled={actionDisabled}
        onClick={onAction}
      >
        {actionLabel ?? (kind === "error" ? t("table.retry") : t("common.create"))}
      </Button>
    ) : undefined);

  return (
    <Alert
      severity={severity ?? kindSeverity[kind]}
      icon={resolvedIcon}
      action={end}
      sx={[
        noticeSx,
        ...(quiet ? [quietSx] : []),
        ...(Array.isArray(sx) ? sx : sx !== undefined ? [sx] : []),
      ]}
    >
      {heading !== "" && (
        <AlertTitle sx={{ mb: hasLabel ? 0.25 : 0 }}>{heading}</AlertTitle>
      )}
      {label}
    </Alert>
  );
}

export function TableNoticeRow({
  colSpan,
  ...props
}: TableNoticeProps & { colSpan: number }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        sx={{ py: 1, px: 1, borderBottom: 0, textAlign: "left" }}
      >
        <TableNotice {...props} />
      </TableCell>
    </TableRow>
  );
}
