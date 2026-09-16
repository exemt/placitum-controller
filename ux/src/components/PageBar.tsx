import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { useT } from "../i18n/index.ts";

export type PageBarCrumb = {
  label: string;
  to?: string;
};

export type PageBarStatus = {
  key: string;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "error";
  title?: string;
  anchor?: string;
};

const STATUS_COLOR: Record<
  NonNullable<PageBarStatus["tone"]>,
  string
> = {
  default: "text.secondary",
  success: "success.main",
  warning: "warning.main",
  error: "error.main",
};

export const TOOLBAR_HEIGHT = 48;
export const PAGE_BAR_HEIGHT = 32;
export const APP_HEADER_HEIGHT = TOOLBAR_HEIGHT + PAGE_BAR_HEIGHT;

export const TABLE_RAIL = 16;
export const PAGE_RAIL = 24;

export const pageBarBtnSx = {
  height: 20,
  minHeight: 20,
  maxHeight: 20,
  minWidth: "auto",
  padding: "0 6px",
  fontSize: "0.7rem",
  fontWeight: 600,
  lineHeight: "20px",
  borderRadius: "2px",
  boxSizing: "border-box",
} as const;

function StatusItem({ item }: { item: PageBarStatus }) {
  const body = (
    <>
      <Box
        component="span"
        sx={{
          fontSize: "0.65rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "text.secondary",
          opacity: 0.75,
        }}
      >
        {item.label}
      </Box>
      <Box
        component="span"
        sx={{
          ml: 0.75,
          fontSize: "0.72rem",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: STATUS_COLOR[item.tone ?? "default"],
        }}
      >
        {item.value}
      </Box>
    </>
  );

  if (item.anchor === undefined) {
    return (
      <Box
        component="span"
        title={item.title}
        sx={{ whiteSpace: "nowrap", lineHeight: "20px" }}
      >
        {body}
      </Box>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      title={item.title}
      onClick={() => {
        document
          .getElementById(item.anchor ?? "")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      sx={{
        border: 0,
        p: 0,
        bgcolor: "transparent",
        cursor: "pointer",
        font: "inherit",
        whiteSpace: "nowrap",
        lineHeight: "20px",
        "&:hover": { textDecoration: "underline" },
      }}
    >
      {body}
    </Box>
  );
}

export default function PageBar({
  crumbs,
  flush = false,
  status,
  onCreate,
  onUpdate,
  onSave,
  onSend,
  onReset,
  onUpload,
  createDisabled,
  updateDisabled,
  saveDisabled,
  sendDisabled,
  resetDisabled,
  uploadDisabled,
  extra,
}: {
  crumbs: PageBarCrumb[];
  flush?: boolean;
  status?: PageBarStatus[];
  onCreate?: () => void;
  onUpdate?: () => void;
  onSave?: () => void;
  onSend?: () => void;
  onReset?: () => void;
  onUpload?: () => void;
  createDisabled?: boolean;
  updateDisabled?: boolean;
  saveDisabled?: boolean;
  sendDisabled?: boolean;
  resetDisabled?: boolean;
  uploadDisabled?: boolean;
  extra?: ReactNode;
}) {
  const t = useT();

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        height: PAGE_BAR_HEIGHT,
        minHeight: PAGE_BAR_HEIGHT,
        pl: `${flush ? TABLE_RAIL : PAGE_RAIL}px`,
        pr: `${PAGE_RAIL}px`,
        alignItems: "center",
      }}
    >
      <Breadcrumbs
        separator="›"
        sx={{
          minWidth: 0,
          "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap" },
          "& .MuiBreadcrumbs-separator": { mx: 0.75, color: "text.secondary" },
          fontSize: "0.8rem",
          lineHeight: "32px",
        }}
      >
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          if (!last && crumb.to !== undefined) {
            return (
              <Link
                key={`${crumb.label}:${crumb.to}`}
                component={RouterLink}
                to={crumb.to}
                underline="hover"
                color="text.secondary"
                sx={{ fontSize: "inherit", fontWeight: 500, whiteSpace: "nowrap" }}
              >
                {crumb.label}
              </Link>
            );
          }
          return (
            <Typography
              key={`${crumb.label}:${index}`}
              color="text.primary"
              sx={{ fontSize: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}
            >
              {crumb.label}
            </Typography>
          );
        })}
      </Breadcrumbs>
      <Box sx={{ flexGrow: 1 }} />
      {status?.map((item) => (
        <StatusItem key={item.key} item={item} />
      ))}
      {extra}
      {onReset !== undefined && (
        <Button
          size="small"
          variant="outlined"
          disabled={resetDisabled}
          onClick={onReset}
          sx={pageBarBtnSx}
        >
          {t("common.reset")}
        </Button>
      )}
      {onSave !== undefined && (
        <Button
          size="small"
          variant="contained"
          disabled={saveDisabled}
          onClick={onSave}
          sx={pageBarBtnSx}
        >
          {t("common.save")}
        </Button>
      )}
      {onUpdate !== undefined && (
        <Button
          size="small"
          variant="outlined"
          disabled={updateDisabled}
          onClick={onUpdate}
          sx={pageBarBtnSx}
        >
          {t("common.refresh")}
        </Button>
      )}
      {onUpload !== undefined && (
        <Button
          size="small"
          variant="contained"
          disabled={uploadDisabled}
          onClick={onUpload}
          sx={pageBarBtnSx}
        >
          {t("common.uploadData")}
        </Button>
      )}
      {onSend !== undefined && (
        <Button
          size="small"
          variant="outlined"
          disabled={sendDisabled}
          onClick={onSend}
          sx={pageBarBtnSx}
        >
          {t("common.send")}
        </Button>
      )}
      {onCreate !== undefined && (
        <Button
          size="small"
          variant="contained"
          disabled={createDisabled}
          onClick={onCreate}
          sx={pageBarBtnSx}
        >
          {t("common.create")}
        </Button>
      )}
    </Stack>
  );
}
