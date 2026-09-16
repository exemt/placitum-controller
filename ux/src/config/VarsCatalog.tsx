import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import DeleteIcon from "@mui/icons-material/Delete";

import { dataActionCellSx, dataCellSx, SectionBleed } from "../components/settings-table.tsx";
import { TableIconButton } from "../components/data-table/index.ts";
import { flushTableSx, HeadCell, TableCols } from "../components/table-block.tsx";
import { useT } from "../i18n/index.ts";
import { asString, type Doc } from "../pages/config-fields.tsx";

export const VAR_MAX = 16;

export const BUILTIN_VARS = [
  { name: "user_agent", value: "$http_user_agent" },
  { name: "referer", value: "$http_referer" },
  { name: "xff", value: "$http_x_forwarded_for" },
  { name: "accept_language", value: "$http_accept_language" },
  { name: "origin", value: "$http_origin" },
  { name: "content_type", value: "$content_type" },
  { name: "accept", value: "$http_accept" },
  { name: "request_id", value: "$request_id" },
] as const;

export function isBuiltinVar(name: string): boolean {
  return BUILTIN_VARS.some((v) => v.name === name);
}

export const VAR_CATALOG = [
  { name: "protocol", value: "$server_protocol" },
  { name: "connection_requests", value: "$connection_requests" },
  { name: "ssl_cipher", value: "$ssl_cipher" },
  { name: "ssl_client_dn", value: "$ssl_client_s_dn" },
] as const;

const COLS = [48, 180, 240, undefined] as const;
const tableSx = { ...flushTableSx, borderTop: 0 } as const;
const monoSx = { ...dataCellSx, fontFamily: "monospace" } as const;
const aboutSx = { ...dataCellSx, fontWeight: 400, color: "text.secondary" } as const;

export function VarsCatalog({
  rows,
  onChange,
}: {
  rows: Doc[];
  onChange: (next: Doc[]) => void;
}) {
  const t = useT();
  const names = new Set(rows.map((row) => asString(row.name)));
  const full = rows.length >= VAR_MAX;
  const extra = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !isBuiltinVar(asString(row.name)) &&
        !VAR_CATALOG.some((v) => v.name === asString(row.name)),
    );

  const toggle = (entry: (typeof VAR_CATALOG)[number], on: boolean) =>
    onChange(
      on
        ? [...rows, { name: entry.name, value: entry.value }]
        : rows.filter((row) => asString(row.name) !== entry.name),
    );

  return (
    <SectionBleed>
      <Table size="small" sx={tableSx}>
        <TableCols widths={COLS} />
        <TableHead>
          <TableRow>
            <HeadCell label="" />
            <HeadCell label={t("config.vars.field")} help={t("config.vars.fieldHelp")} />
            <HeadCell label={t("config.vars.source")} help={t("config.vars.sourceHelp")} />
            <HeadCell label={t("config.vars.about")} />
          </TableRow>
        </TableHead>
        <TableBody>
          {BUILTIN_VARS.map((entry) => (
            <TableRow key={entry.name} hover>
              <TableCell sx={dataCellSx}>
                <Checkbox
                  size="small"
                  checked
                  disabled
                  slotProps={{ input: { "aria-label": entry.name } }}
                  sx={{ p: 0.25 }}
                />
              </TableCell>
              <TableCell sx={monoSx}>{entry.name}</TableCell>
              <TableCell sx={monoSx}>{entry.value}</TableCell>
              <TableCell sx={aboutSx}>
                {t(`config.vars.hint.${entry.name}`)}
                <Box
                  component="span"
                  title={t("config.vars.alwaysHelp")}
                  sx={{ ml: 1, color: "text.disabled", cursor: "help" }}
                >
                  {t("config.vars.always")}
                </Box>
              </TableCell>
            </TableRow>
          ))}
          {VAR_CATALOG.map((entry) => {
            const on = names.has(entry.name);
            return (
              <TableRow key={entry.name} hover>
                <TableCell sx={dataCellSx}>
                  <Checkbox
                    size="small"
                    checked={on}
                    disabled={!on && full}
                    onChange={(_, next) => toggle(entry, next)}
                    slotProps={{ input: { "aria-label": entry.name } }}
                    sx={{ p: 0.25 }}
                  />
                </TableCell>
                <TableCell sx={monoSx}>{entry.name}</TableCell>
                <TableCell sx={monoSx}>{entry.value}</TableCell>
                <TableCell sx={aboutSx}>{t(`config.vars.hint.${entry.name}`)}</TableCell>
              </TableRow>
            );
          })}
          {extra.map(({ row, index }) => (
            <TableRow key={`extra-${index}`} hover>
              <TableCell sx={dataCellSx} />
              <TableCell sx={monoSx}>{asString(row.name)}</TableCell>
              <TableCell sx={monoSx}>{asString(row.value)}</TableCell>
              <TableCell sx={{ ...dataCellSx, ...dataActionCellSx, width: undefined }}>
                <TableIconButton
                  color="error"
                  icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                  tooltip={t("common.delete")}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionBleed>
  );
}
