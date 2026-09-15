import { useEffect } from "react";
import { createPortal } from "react-dom";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { useFormActionsPortal } from "../Form.tsx";
import { PAGE_RAIL, TABLE_RAIL } from "../PageBar.tsx";
import { useAutoPageSize, type AutoTarget } from "./useAutoPageSize.ts";
import {
  AUTO_PAGE_SIZE,
  PAGE_SIZES,
  type PageSizeState,
  type PagerState,
} from "./usePager.ts";
import { useT } from "../../i18n/index.ts";

export const PAGINATOR_ITEM_SIZE = 18;
export const FORM_PAGINATOR_ITEM_SIZE = 20;

export type PaginatorProps = {
  pager?: PagerState;
  size?: PageSizeState;
  page?: number;
  pageSize?: number;
  total?: number;
  pageSizes?: readonly number[];
  disabled?: boolean;
  onPageChange?: (page: number) => void;
  onSizeChange?: (pageSize: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showPageSize?: boolean;
  showRange?: boolean;
  showEllipsis?: boolean;
  showFirstLast?: boolean;
  siblingCount?: number;
  boundaryCount?: number;
  itemSize?: number;
  variant?: "text" | "outlined";
  shape?: "circular" | "rounded";
  container?: AutoTarget;
  auto?: boolean;
  autoMin?: number;
  autoMax?: number;
  autoReserve?: number;
  rowHeight?: number;
  onAutoSize?: (pageSize: number) => void;
};

function itemSx(size: number, showEllipsis: boolean) {
  return {
    "& .MuiPagination-ul": {
      flexWrap: "nowrap",
    },
    "& .MuiPaginationItem-root": {
      minWidth: size,
      height: size,
      margin: "0 1px",
      padding: 0,
      fontSize: size > 20 ? "0.75rem" : "0.7rem",
      lineHeight: `${size}px`,
      borderRadius: "2px",
    },
    "& .MuiPaginationItem-icon": {
      fontSize: Math.round(size * 0.72),
    },
    ...(showEllipsis
      ? {}
      : {
          "& li:has(.MuiPaginationItem-ellipsis)": {
            display: "none",
          },
        }),
  };
}

export function Paginator({
  pager,
  size: sizeState,
  page,
  pageSize,
  total,
  pageSizes,
  disabled = false,
  onPageChange,
  onSizeChange,
  onPageSizeChange,
  showPageSize,
  showRange = true,
  showEllipsis = true,
  showFirstLast = true,
  siblingCount = 1,
  boundaryCount = 1,
  itemSize = PAGINATOR_ITEM_SIZE,
  variant = "outlined",
  shape = "rounded",
  container,
  auto,
  autoMin,
  autoMax,
  autoReserve,
  rowHeight,
  onAutoSize,
}: PaginatorProps) {
  const t = useT();
  const portal = useFormActionsPortal();

  const state = sizeState ?? pager;
  const pageValue = page ?? pager?.page ?? 0;
  const sizeValue = pageSize ?? state?.pageSize ?? PAGE_SIZES[0];
  const totalValue = total ?? pager?.total ?? 0;
  const sizes = pageSizes ?? pager?.pageSizes ?? PAGE_SIZES;
  const changePage = onPageChange ?? pager?.setPage;
  const changeSize = onSizeChange ?? onPageSizeChange ?? state?.setPageSize;
  const reportAuto = onAutoSize ?? state?.setAutoSize;
  const autoOn = (auto ?? state?.auto ?? false) && reportAuto !== undefined;

  const fit = useAutoPageSize({
    target: container,
    enabled: autoOn,
    rowHeight,
    reserve: autoReserve,
    min: autoMin,
    max: autoMax,
  });

  useEffect(() => {
    if (fit !== null && reportAuto !== undefined) {
      reportAuto(fit);
    }
  }, [fit, reportAuto]);

  const pageCount = Math.max(1, Math.ceil(totalValue / sizeValue));
  const safePage = Math.min(pageValue, pageCount - 1);
  const from = totalValue === 0 ? 0 : safePage * sizeValue + 1;
  const to = Math.min(totalValue, (safePage + 1) * sizeValue);
  const sizeVisible = showPageSize ?? changeSize !== undefined;
  const pagesVisible = pageCount > 1;

  if (portal === null) {
    return null;
  }

  if (!pagesVisible && !showRange && !sizeVisible) {
    return null;
  }

  const inPortal = portal !== undefined;
  const node = (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: "center",
        justifyContent: inPortal ? "flex-start" : "flex-end",
        pl: inPortal ? 0 : `${TABLE_RAIL}px`,
        pr: inPortal ? 0 : `${PAGE_RAIL}px`,
        py: inPortal ? 0 : 1,
        minWidth: 0,
      }}
    >
      {showRange && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
            {t("pager.range", { from, to, total: totalValue })}
          </Typography>
          {totalValue > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
              {t("pager.page", { page: safePage + 1, pages: pageCount })}
            </Typography>
          )}
        </>
      )}
      {pagesVisible && (
        <Pagination
          page={safePage + 1}
          count={pageCount}
          disabled={disabled}
          siblingCount={siblingCount}
          boundaryCount={boundaryCount}
          showFirstButton={showFirstLast}
          showLastButton={showFirstLast}
          variant={variant}
          shape={shape}
          size="small"
          onChange={(_, next) => changePage?.(next - 1)}
          getItemAriaLabel={(type) => {
            switch (type) {
              case "first":
                return t("pager.first");
              case "last":
                return t("pager.last");
              case "previous":
                return t("pager.prev");
              case "next":
                return t("pager.next");
              default:
                return "";
            }
          }}
          sx={itemSx(itemSize, showEllipsis)}
        />
      )}
      {sizeVisible && changeSize !== undefined && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <TextField
            select
            size="small"
            value={autoOn ? AUTO_PAGE_SIZE : sizeValue}
            disabled={disabled}
            onChange={(e) => changeSize(Number(e.target.value))}
            slotProps={{
              select: { sx: { fontSize: "0.7rem" } },
            }}
            sx={{
              minWidth: 52,
              "& .MuiInputBase-root": {
                height: 18,
                fontSize: "0.7rem",
              },
              "& .MuiSelect-select": {
                py: 0,
                px: 1,
              },
            }}
          >
            {state !== undefined && (
              <MenuItem value={AUTO_PAGE_SIZE} sx={{ fontSize: "0.7rem" }}>
                {t("pager.auto")}
              </MenuItem>
            )}
            {sizes.map((size) => (
              <MenuItem key={size} value={size} sx={{ fontSize: "0.7rem" }}>
                {size}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
            {t("pager.pageSize")}
          </Typography>
        </Stack>
      )}
    </Stack>
  );

  return inPortal ? createPortal(node, portal) : node;
}
