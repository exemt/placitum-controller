import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

import { Form } from "../components/Form.tsx";
import {
  DataTable,
  FilterSelect,
  FilterText,
  FORM_PAGINATOR_ITEM_SIZE,
  Paginator,
  TableIconButton,
  TableNoticeRow,
  usePager,
  useServerPager,
} from "../components/data-table/index.ts";
import { downloadTextFile } from "../download.ts";
import { useT } from "../i18n/index.ts";

const PANEL_WIDTH = 560;
const ADDRESS_PAGE_SIZE = 10;

export type CatalogRow = {
  uuid: string;
  key: string;
  type: string;
  description: string;
  size: number;
};

export type CatalogAddress = {
  uuid: string;
  address: string;
};

/**
 * Список наборов каталога: страницы стран и ASN -- один и тот же список.
 *
 * Каталог собран из GeoLite2: свои строки в него не заводят и чужие не
 * удаляют. Колонки действий у него нет вовсе -- как у журналов: копия и
 * удаление стояли бы двумя серыми кнопками на всю страницу ([RowActionsCell]).
 */
export function IpSetCatalog({
  formId,
  keyLabel,
  empty,
  noAddresses,
  error,
  rows,
  loading,
  selectedId,
  addresses,
  addressesTotal,
  addressesLoading,
  onSelect,
  onReload,
  onLoadAddresses,
  onExportAddresses,
}: {
  formId: string;
  keyLabel: string;
  empty: string;
  noAddresses: string;
  error: string | null;
  rows: CatalogRow[];
  loading: boolean;
  selectedId: string | null;
  addresses: CatalogAddress[];
  addressesTotal: number;
  addressesLoading: boolean;
  onSelect: (id: string | null) => void;
  onReload: () => void;
  onLoadAddresses: (id: string, page: number, pageSize: number, q: string) => void;
  onExportAddresses: (id: string) => Promise<string>;
}) {
  const t = useT();
  const [keyQuery, setKeyQuery] = useState("");
  const [typeQuery, setTypeQuery] = useState("");
  const [descQuery, setDescQuery] = useState("");
  const selected = rows.find((row) => row.uuid === selectedId) ?? null;
  const types = useMemo(
    () => [
      { value: "", label: t("ipCatalog.type") },
      { value: "v4", label: "v4" },
      { value: "v6", label: "v6" },
    ],
    [t],
  );
  const filtered = useMemo(() => {
    const key = keyQuery.trim().toLowerCase();
    const desc = descQuery.trim().toLowerCase();

    return rows.filter((row) => {
      if (key.length > 0 && !row.key.toLowerCase().includes(key)) {
        return false;
      }
      if (typeQuery !== "" && row.type !== typeQuery) {
        return false;
      }
      if (desc.length > 0 && !row.description.toLowerCase().includes(desc)) {
        return false;
      }
      return true;
    });
  }, [descQuery, keyQuery, rows, typeQuery]);
  const pager = usePager(filtered);
  const active =
    keyQuery.trim() !== "" || typeQuery !== "" || descQuery.trim() !== "";

  const setKey = (value: string) => {
    setKeyQuery(value);
    pager.setPage(0);
  };
  const setType = (value: string) => {
    setTypeQuery(value);
    pager.setPage(0);
  };
  const setDesc = (value: string) => {
    setDescQuery(value);
    pager.setPage(0);
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {error !== null && rows.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      <DataTable loading={loading} error={error} flush>
        <DataTable.Head>
          <FilterText
            value={keyQuery}
            onChange={setKey}
            placeholder={keyLabel}
            width={120}
            mono
          />
          <FilterSelect
            value={typeQuery}
            onChange={setType}
            options={types}
            placeholder={t("ipCatalog.type")}
            unset=""
            width={88}
          />
          <FilterText
            value={descQuery}
            onChange={setDesc}
            placeholder={t("ipCatalog.description")}
          />
          <TableCell align="right">{t("ipCatalog.records")}</TableCell>
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row) => (
            <TableRow
              key={row.uuid}
              hover
              selected={selectedId === row.uuid}
              onClick={() => onSelect(selectedId === row.uuid ? null : row.uuid)}
              sx={{ cursor: "pointer" }}
            >
              <TableCell sx={{ fontFamily: "monospace" }}>{row.key}</TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={row.type} />
              </TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell align="right">{row.size}</TableCell>
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          kind={active ? "none" : "empty"}
          message={active ? t("table.none") : empty}
        />
        <DataTable.Error onRetry={onReload} />
        <DataTable.Pager pager={pager} />
      </DataTable>
      <Drawer
        anchor="right"
        open={selected !== null}
        onClose={() => onSelect(null)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: PANEL_WIDTH },
              height: "100%",
              display: "flex",
              flexDirection: "column",
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {selected !== null && (
          <SetAddresses
            key={selected.uuid}
            formId={formId}
            id={selected.uuid}
            title={`${selected.key} · ${selected.type}`}
            fileName={`${selected.key}-${selected.type}`}
            setSize={selected.size}
            addresses={addresses}
            total={addressesTotal}
            loading={addressesLoading}
            noAddresses={noAddresses}
            onClose={() => onSelect(null)}
            onLoad={onLoadAddresses}
            onExport={onExportAddresses}
          />
        )}
      </Drawer>
    </Box>
  );
}

function SetAddresses({
  formId,
  id,
  title,
  fileName,
  setSize,
  addresses,
  total,
  loading,
  noAddresses,
  onClose,
  onLoad,
  onExport,
}: {
  formId: string;
  id: string;
  title: string;
  fileName: string;
  setSize: number;
  addresses: CatalogAddress[];
  total: number;
  loading: boolean;
  noAddresses: string;
  onClose: () => void;
  onLoad: (id: string, page: number, pageSize: number, q: string) => void;
  onExport: (id: string) => Promise<string>;
}) {
  const t = useT();
  /* Скроллер списка: по его высоте пагинатор считает размер страницы. */
  const addressBox = useRef<HTMLDivElement>(null);
  /*
   * Страницу режет сервер, размер считает пагинатор по высоте окна;
   * `ADDRESS_PAGE_SIZE` -- запасное значение, пока мерить нечего.
   */
  const pager = useServerPager({ fallback: ADDRESS_PAGE_SIZE });
  const { page, setPage } = pager;
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 300);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const searching = search.trim() !== "";

  useEffect(() => {
    if (!pager.ready) {
      return;
    }
    onLoad(id, page, pager.pageSize, search);
  }, [id, page, pager.pageSize, pager.ready, search, onLoad]);

  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      downloadTextFile(`${fileName}.txt`, await onExport(id));
    } catch (err: unknown) {
      setExportError(String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Form id={formId}>
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body
        spacing={0}
        sx={{ display: "flex", flexDirection: "column", minHeight: 0, p: 0 }}
      >
        {exportError !== null && (
          <Alert severity="error" sx={{ borderRadius: 0 }}>
            {exportError}
          </Alert>
        )}
        <TableContainer
          ref={addressBox}
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            width: "100%",
            border: 0,
            boxShadow: "none",
          }}
        >
          <Table
            size="small"
            stickyHeader
            sx={{
              width: "100%",
              "& td, & th": { borderLeft: 0, borderRight: 0 },
              "& .MuiTableCell-root:last-of-type": {
                width: 30,
                paddingLeft: 0.75,
                paddingRight: 0.75,
                textAlign: "right",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <FilterText
                  value={query}
                  onChange={(value) => {
                    setQuery(value);
                    setPage(0);
                  }}
                  placeholder={t("ipCatalog.search")}
                  mono
                />
                <TableCell sx={{ py: 0.5 }}>
                  <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                    <TableIconButton
                      icon={<FileDownloadOutlinedIcon />}
                      tooltip={t("common.download")}
                      disabled={setSize === 0 || exporting}
                      onClick={() => void download()}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && addresses.length === 0 && (
                <TableNoticeRow colSpan={2} kind="loading" />
              )}
              {!loading && total === 0 && (
                <TableNoticeRow
                  colSpan={2}
                  kind={searching ? "none" : "empty"}
                  message={searching ? t("table.none") : noAddresses}
                />
              )}
              {addresses.map((row) => (
                <TableRow key={row.uuid} hover>
                  <TableCell sx={{ fontFamily: "monospace" }}>
                    {row.address}
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {total > 0 && (
          <Paginator
            page={page}
            size={pager}
            container={addressBox}
            total={total}
            disabled={loading || exporting}
            onPageChange={setPage}
            showPageSize={false}
            showRange={false}
            showEllipsis={false}
            showFirstLast
            itemSize={FORM_PAGINATOR_ITEM_SIZE}
            siblingCount={1}
            boundaryCount={1}
            variant="outlined"
          />
        )}
      </Form.Body>
      <Form.Actions>
        <Button size="small" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Form.Actions>
    </Form>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [ms, value]);

  return debounced;
}
