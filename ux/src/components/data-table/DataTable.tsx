import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import type { SxProps, Theme } from "@mui/material/styles";

import { FocusScope } from "../FocusContext.tsx";
import { PAGE_RAIL } from "../PageBar.tsx";
import { Paginator, type PaginatorProps } from "./Paginator.tsx";
import { TableViewportCtx } from "./useAutoPageSize.ts";
import { TableNotice, type TableNoticeProps } from "./TableNotice.tsx";

export type TableStatus = "loading" | "error" | "empty" | "ready";
type Slot = "head" | "body" | "empty" | "loader" | "error" | "pager";

type TableCtx = {
  colSpan: number;
  status: TableStatus;
  error: string | null;
  flush: boolean;
};

const Ctx = createContext<TableCtx>({
  colSpan: 1,
  status: "ready",
  error: null,
  flush: false,
});

function useTable(): TableCtx {
  return useContext(Ctx);
}

/**
 * Состояние таблицы для ячейки шапки.
 *
 * Ширины колонкам задаёт тело: строк не осталось -- шапка стоит одна, и
 * колонка без своей ширины схлопывается вместе с полем фильтра. Ячейка
 * подставляет пол ширины на это состояние, см. `FilterCell`.
 */
export function useTableStatus(): TableStatus {
  return useContext(Ctx).status;
}

function markSlot<C>(slot: Slot, Component: C): C {
  (Component as C & { slot: Slot }).slot = slot;
  return Component;
}

function slotOf(child: ReactElement): Slot | undefined {
  const type = child.type;
  if (typeof type === "function" && "slot" in type) {
    return (type as { slot: Slot }).slot;
  }
  return undefined;
}

function collectSlots(children: ReactNode): Partial<Record<Slot, ReactElement>> {
  const slots: Partial<Record<Slot, ReactElement>> = {};
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    const slot = slotOf(child);
    if (slot !== undefined) {
      slots[slot] = child;
    }
  });
  return slots;
}

function elementChildren(node: ReactElement | undefined): ReactNode {
  if (node === undefined) {
    return undefined;
  }
  const props = node.props as { children?: ReactNode };
  return props.children;
}

function childCount(node: ReactNode): number {
  return Children.toArray(node).length;
}

/**
 * Правая вертикаль страницы-таблицы.
 *
 * Ячейка держит свои 16px, и прижатая вправо колонка кончалась на 8px правее
 * кнопок полосы: у списка и у его же заголовка получались два разных края.
 * Последняя колонка встаёт на `PAGE_RAIL` -- и `th`/`td`, и внутренний `Box`
 * ячейки фильтра (`FilterCell` обнуляет отступы самой ячейки).
 *
 * Строка состояния (`colspan`) вертикали не берёт: «нет данных» рисует
 * `Alert` со своими полями, и рельс сложился бы с ними.
 */
const railSx = {
  "& th:last-of-type, & td:not([colspan]):last-of-type": {
    paddingRight: `${PAGE_RAIL}px`,
  },
  "& th:last-of-type > .MuiBox-root, & td:last-of-type > .MuiBox-root": {
    paddingRight: `${PAGE_RAIL}px`,
  },
} as const;

const statusCellSx = {
  py: 1,
  px: 1,
  borderBottom: 0,
  textAlign: "left",
} as const;

function StatusRow({ children }: { children: ReactNode }) {
  const { colSpan } = useTable();
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={statusCellSx}>
        {children}
      </TableCell>
    </TableRow>
  );
}

function noticeOrDefault(
  slot: ReactElement | undefined,
  custom: ReactNode | undefined,
  fallback: ReactElement,
): ReactNode {
  if (slot !== undefined) {
    return slot;
  }
  if (custom !== undefined) {
    return <StatusRow>{custom}</StatusRow>;
  }
  return fallback;
}

function DataTableHead({ children }: { children: ReactNode }) {
  const { flush } = useTable();
  return (
    <TableHead>
      <TableRow
        sx={
          flush
            ? {
                "& th": {
                  bgcolor: (theme) =>
                    theme.palette.mode === "light"
                      ? "#ffffff"
                      : theme.palette.background.paper,
                },
              }
            : undefined
        }
      >
        {children}
      </TableRow>
    </TableHead>
  );
}

function DataTableBody({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function DataTableEmpty({
  children,
  kind = "empty",
  title,
  message,
  action,
  actionLabel,
  actionDisabled,
  onAction,
}: TableNoticeProps & { children?: ReactNode }) {
  return (
    <StatusRow>
      {children ?? (
        <TableNotice
          kind={kind}
          title={title}
          message={message}
          action={action}
          actionLabel={actionLabel}
          actionDisabled={actionDisabled}
          onAction={onAction}
        />
      )}
    </StatusRow>
  );
}

function DataTableLoader({
  children,
  title,
  message,
}: {
  children?: ReactNode;
  title?: string;
  message?: string;
}) {
  return (
    <StatusRow>
      {children ?? <TableNotice kind="loading" title={title} message={message} />}
    </StatusRow>
  );
}

function DataTableError({
  children,
  title,
  message,
  onRetry,
}: {
  children?: ReactNode;
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { error } = useTable();
  return (
    <StatusRow>
      {children ?? (
        <TableNotice
          kind="error"
          title={title}
          message={message ?? error ?? undefined}
          onAction={onRetry}
        />
      )}
    </StatusRow>
  );
}

export type DataTableProps = {
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  colSpan?: number;
  size?: "small" | "medium";
  flush?: boolean;
  sx?: SxProps<Theme>;
  empty?: ReactNode;
  loader?: ReactNode;
  errorNotice?: ReactNode;
};

function DataTableRoot({
  children,
  loading = false,
  error = null,
  colSpan: colSpanProp,
  size = "small",
  flush = true,
  sx,
  empty,
  loader,
  errorNotice,
}: DataTableProps) {
  const slots = collectSlots(children);
  /*
   * Блок с прокруткой отдаётся пагинатору: по его высоте считается размер
   * страницы. Только `flush`-таблица годится -- у неё высота задана снаружи
   * (`flex: 1`), а таблица в карточке растёт по содержимому, и расчёт «сколько
   * влезет» ходил бы по кругу.
   */
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const rows = childCount(elementChildren(slots.body));
  const inferred =
    colSpanProp ?? Math.max(1, childCount(elementChildren(slots.head)));
  const status: TableStatus =
    loading && rows === 0
      ? "loading"
      : error !== null && rows === 0
        ? "error"
        : rows === 0
          ? "empty"
          : "ready";

  const table = (
    <Table size={size} stickyHeader={flush} sx={flush ? railSx : undefined}>
      {slots.head}
      <TableBody>
        {status === "loading" &&
          noticeOrDefault(slots.loader, loader, <DataTableLoader />)}
        {status === "error" &&
          noticeOrDefault(slots.error, errorNotice, <DataTableError />)}
        {status === "empty" &&
          noticeOrDefault(slots.empty, empty, <DataTableEmpty />)}
        {status === "ready" && slots.body}
      </TableBody>
    </Table>
  );

  const pager =
    slots.pager !== undefined && status !== "loading" ? (
      flush ? (
        <Box sx={{ borderTop: 1, borderColor: "divider" }}>{slots.pager}</Box>
      ) : (
        slots.pager
      )
    ) : null;

  const surfaceSx = [
    flush
      ? {
          borderRadius: 0,
          overflow: "hidden",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: (theme: Theme) =>
            theme.palette.mode === "light"
              ? "#ffffff"
              : theme.palette.background.paper,
        }
      : {
          borderRadius: "3px",
          overflow: "hidden",
          bgcolor: (theme: Theme) =>
            theme.palette.mode === "light"
              ? "#ffffff"
              : theme.palette.background.paper,
        },
    ...(Array.isArray(sx) ? sx : sx != null ? [sx] : []),
  ];

  return (
    <Ctx.Provider value={{ colSpan: inferred, status, error, flush }}>
      <TableViewportCtx.Provider value={flush ? viewport : null}>
      <FocusScope>
      {flush ? (
        <Box sx={surfaceSx}>
          <Box ref={setViewport} sx={{ flex: 1, overflow: "auto" }}>
            {table}
          </Box>
          {pager}
        </Box>
      ) : (
        <Paper elevation={0} variant="outlined" sx={surfaceSx}>
          {table}
          {pager}
        </Paper>
      )}
      </FocusScope>
      </TableViewportCtx.Provider>
    </Ctx.Provider>
  );
}

type DataTableComponent = ((props: DataTableProps) => ReactElement) & {
  Head: typeof DataTableHead;
  Body: typeof DataTableBody;
  Empty: typeof DataTableEmpty;
  Loader: typeof DataTableLoader;
  Error: typeof DataTableError;
  Pager: typeof Paginator;
};

export const DataTable = DataTableRoot as DataTableComponent;
DataTable.Head = markSlot("head", DataTableHead);
DataTable.Body = markSlot("body", DataTableBody);
DataTable.Empty = markSlot("empty", DataTableEmpty);
DataTable.Loader = markSlot("loader", DataTableLoader);
DataTable.Error = markSlot("error", DataTableError);
DataTable.Pager = markSlot("pager", Paginator);

export type { PaginatorProps };
