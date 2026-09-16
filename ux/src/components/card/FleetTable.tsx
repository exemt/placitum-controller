import type { ReactNode } from "react";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import {
  formatAge,
  formatBytes,
  formatCpu,
  type FleetMemberView,
} from "../../fleet.ts";
import type { Translate } from "../../i18n/index.ts";
import { StatusMark, toHeadStatus } from "../BlockHead.tsx";
import { MiniBar } from "../MetricBar.tsx";

export interface FleetColumn<Row> {
  key: string;
  label: string;
  align?: "left" | "right";
  has?: (row: Row) => boolean;
  stretch?: boolean;
  cell: (row: Row) => ReactNode;
}

export function FleetTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: FleetColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {empty}
      </Typography>
    );
  }

  const shown = columns.filter(
    (column) => column.has === undefined || rows.some(column.has),
  );

  return (
    <TableContainer sx={{ overflowX: "auto", overflowY: "hidden" }}>
      <Table size="small" sx={{ width: "100%", tableLayout: "auto" }}>
        <TableHead>
          <TableRow>
            {shown.map((column) => (
              <TableCell
                key={column.key}
                align={column.align}
                sx={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: column.stretch === true ? "100%" : "1px",
                }}
              >
                {column.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} hover>
              {shown.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.align}
                  sx={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    verticalAlign: "middle",
                    width: column.stretch === true ? "100%" : "1px",
                  }}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function CellName({
  title,
  sub,
  mono = true,
}: {
  title: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        component="div"
        noWrap
        sx={{
          fontSize: "0.8rem",
          fontWeight: 600,
          fontFamily: mono ? "monospace" : undefined,
        }}
      >
        {title}
      </Typography>
      {sub !== undefined && sub !== "" && (
        <Typography
          component="div"
          noWrap
          sx={{
            fontSize: "0.7rem",
            color: "text.secondary",
            opacity: 0.7,
            fontFamily: mono ? "monospace" : undefined,
          }}
        >
          {sub}
        </Typography>
      )}
    </Box>
  );
}

export function CellStatus({
  status,
  label,
}: {
  status: "up" | "degraded";
  label: string;
}) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <StatusMark status={toHeadStatus(status)} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

export function CellBar({
  value,
  caption,
  tone,
}: {
  value: number;
  caption: string;
  tone?: "primary" | "success" | "warning" | "error";
}) {
  return <MiniBar value={value} caption={caption} color={tone} />;
}

export function CellMono({ text, sub }: { text: string; sub?: string }) {
  return <CellName title={text} sub={sub} />;
}

export function CellValue({ text, tone }: { text: string; tone?: string }) {
  return (
    <Typography
      component="div"
      noWrap
      sx={{
        fontSize: "0.8rem",
        fontVariantNumeric: "tabular-nums",
        color: tone,
      }}
    >
      {text}
    </Typography>
  );
}

export function CellChip({
  label,
  tone,
}: {
  label: string;
  tone: "default" | "success" | "warning" | "error";
}) {
  return (
    <Chip
      size="small"
      color={tone}
      variant={tone === "default" ? "outlined" : "filled"}
      label={label}
    />
  );
}

export function instanceColumn<Row>(
  label: string,
  get: (row: Row) => { title: string; sub?: string },
): FleetColumn<Row> {
  return {
    key: "instance",
    label,
    cell: (row) => {
      const name = get(row);
      return <CellName title={name.title} sub={name.sub} />;
    },
  };
}

export function statusColumn<Row>(
  t: Translate,
  get: (row: Row) => "up" | "degraded",
): FleetColumn<Row> {
  return {
    key: "status",
    label: t("fleetPage.status"),
    cell: (row) => (
      <CellStatus status={get(row)} label={t(`fleetPage.${get(row)}`)} />
    ),
  };
}

export function hostColumns<Row>(
  t: Translate,
  get: (row: Row) => FleetMemberView["host"],
): FleetColumn<Row>[] {
  return [
    {
      key: "cpu",
      label: t("fleetPage.cpu"),
      has: (row) => get(row) !== undefined,
      cell: (row) => {
        const host = get(row);
        return host === undefined ? (
          <CellValue text="—" />
        ) : (
          <CellBar value={host.cpu.usage} caption={formatCpu(host.cpu.usage)} />
        );
      },
    },
    {
      key: "memory",
      label: t("fleetPage.memory"),
      has: (row) => get(row) !== undefined,
      cell: (row) => {
        const host = get(row);
        return host === undefined ? (
          <CellValue text="—" />
        ) : (
          <CellBar
            value={
              host.memory.total === 0
                ? 0
                : host.memory.used / host.memory.total
            }
            caption={`${formatBytes(host.memory.used)} / ${formatBytes(host.memory.total)}`}
          />
        );
      },
    },
  ];
}

export function memberColumns<Row>(
  t: Translate,
  parts: {
    nameLabel: string;
    name: (row: Row) => { title: string; sub?: string };
    status: (row: Row) => "up" | "degraded";
    middle?: FleetColumn<Row>[];
    tail?: FleetColumn<Row>[];
    seen: (row: Row) => string;
  },
): FleetColumn<Row>[] {
  return [
    statusColumn(t, parts.status),
    instanceColumn(parts.nameLabel, parts.name),
    ...(parts.middle ?? []),
    { key: "gap", label: "", stretch: true, cell: () => null },
    ...(parts.tail ?? []),
    seenColumn(t, parts.seen),
  ];
}

export function seenColumn<Row>(
  t: Translate,
  get: (row: Row) => string,
): FleetColumn<Row> {
  return {
    key: "seen",
    label: t("fleetPage.seen"),
    align: "right",
    cell: (row) => (
      <CellValue
        text={formatAge(Math.max(0, Date.now() - Date.parse(get(row))))}
      />
    ),
  };
}
