import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

import { Form } from "../components/Form.tsx";
import { LockedNote, UnderlayTabs, lockedInputSx } from "../components/fields.tsx";
import { LongTextCell } from "../components/long-text-cell.tsx";
import {
  DataTable,
  EditorCellScope,
  FilterSelect,
  FilterText,
  FORM_PAGINATOR_ITEM_SIZE,
  Paginator,
  RowActionsHead,
  TableIconButton,
  TableNoticeRow,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { errorCode, thunkError } from "../errors.ts";
import {
  DatasetAddEntryForm,
  FORM_DATASET_ADD_ENTRY,
  helperFor,
  placeholderFor,
} from "./DatasetAddEntryForm.tsx";
import { onFormClose, onFormOpen } from "../store/forms.ts";
import { PagePreviewDialog } from "./PagePreview.tsx";
import { CopyNameModal } from "../components/CopyNameModal.tsx";

import {
  DATASET_TYPES,
  isTextContentType,
  type ContentType,
  type Dataset,
  type DatasetKind,
  type DatasetMode,
  type DatasetSetLink,
  type DatasetType,
} from "../api.ts";
import { downloadTextFile } from "../download.ts";
import { useT, type Translate } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  base64ToText,
  bytesToBase64,
  closePanel,
  loadDatasets,
  openPanel,
  copyDatasetRowThunk,
  copyDatasetThunk,
  parseDraftLines,
  removeDatasetThunk,
  saveDatasetThunk,
  textToBase64,
} from "../store/slices/pages/datasets.ts";

const PANEL_WIDTH = 560;
const SAVE_LOCK_MS = 1000;

function kindLabel(t: Translate, kind: DatasetKind): string {
  return t(`datasets.kinds.${kind}`);
}

function typeLabel(t: Translate, type: DatasetType): string {
  return t(`datasets.types.${type}`);
}

function contentTypeLabel(
  types: ContentType[],
  id: string | null,
): string {
  if (id === null) {
    return "";
  }
  return types.find((item) => item.uuid === id)?.name ?? id;
}

function appendDraftValue(text: string, value: string): string {
  const line = value.trim();
  if (line.length === 0 || parseDraftLines(text).includes(line)) {
    return text;
  }
  if (text.length === 0) {
    return `${line}\n`;
  }
  return text.endsWith("\n") ? `${text}${line}\n` : `${text}\n${line}\n`;
}

function removeDraftValue(text: string, value: string): string {
  let removed = false;
  return text
    .split(/\r?\n/)
    .filter((line) => {
      if (removed || line.trim() !== value) {
        return true;
      }
      removed = true;
      return false;
    })
    .join("\n");
}

/*
 * Правка значения на месте: строка черновика заменяется целиком.
 *
 * Многострочная замена ложится в черновик как есть -- parseDraftLines разложит
 * её по записям: вставить в окно кусок списка -- то же самое, что вставить его
 * во вкладку Raw. Пустая замена -- отказ от правки, а не удаление: удаление
 * стоит своей кнопкой в той же строке.
 */
function replaceDraftValue(text: string, from: string, to: string): string {
  const next = to.trim();
  if (next.length === 0 || next === from) {
    return text;
  }
  let done = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (done || line.trim() !== from) {
        return line;
      }
      done = true;
      return next;
    })
    .join("\n");
}

function listExportName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/^[.\s]+|[.\s]+$/g, "");
  const base = cleaned.length === 0 ? "list" : cleaned;
  return base.toLowerCase().endsWith(".txt") ? base : `${base}.txt`;
}

function formatSize(kind: DatasetKind, size: number): string {
  if (kind === "list") {
    return String(size);
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function profileLinksOf(row: Dataset): DatasetSetLink[] {
  return row.linked_sets ?? [];
}

function profileLinkLabel(t: Translate, link: DatasetSetLink): string {
  return link.exclude
    ? `${link.name} (${t("datasets.linkedExclude")})`
    : link.name;
}

function linkedTooltip(t: Translate, links: DatasetSetLink[]): ReactNode {
  return (
    <Stack spacing={0.25}>
      <span>{t("datasets.linkedHint")}</span>
      {links.map((link) => (
        <span key={`${link.uuid}:${link.exclude}`}>
          {profileLinkLabel(t, link)}
        </span>
      ))}
    </Stack>
  );
}

/*
 * Одна страница на два раздела данных: «Списки» и «Страницы». Вид приходит
 * пропом и не выбирается фильтром -- раздел уже сказал, что показывать, и
 * второй способ сказать то же самое только путал бы.
 */
export default function Datasets({ kind }: { kind: DatasetKind }) {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.datasets.rows);
  const contentTypes = useAppSelector((s) => s.pages.datasets.contentTypes);
  const panelId = useAppSelector((s) => s.pages.datasets.panelId);
  const loading = useAppSelector((s) => s.pages.datasets.loading);
  const error = useAppSelector((s) => s.pages.datasets.error);
  const [params, setParams] = useSearchParams();
  const openId = params.get("open");
  const [nameQuery, setNameQuery] = useState("");
  const [descQuery, setDescQuery] = useState("");
  const [typeQuery, setTypeQuery] = useState("");
  const [modeQuery, setModeQuery] = useState("");
  const typeOptions = useMemo(() => {
    const items = [{ value: "", label: t("datasets.type") }];

    if (kind === "list") {
      items.push(
        ...DATASET_TYPES.map((type) => ({
          value: type,
          label: typeLabel(t, type),
        })),
      );
    } else {
      items.push(
        ...contentTypes.map((item) => ({
          value: item.uuid,
          label: item.name,
        })),
      );
    }

    return items;
  }, [contentTypes, kind, t]);
  const modeOptions = useMemo(
    () => [
      { value: "", label: t("datasets.mode") },
      { value: "internal", label: t("datasets.internal") },
      { value: "active", label: t("datasets.active") },
    ],
    [t],
  );
  const filtered = useMemo(() => {
    const name = nameQuery.trim().toLowerCase();
    const desc = descQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.kind !== kind) {
        return false;
      }
      if (name.length > 0 && !row.name.toLowerCase().includes(name)) {
        return false;
      }
      if (desc.length > 0 && !row.description.toLowerCase().includes(desc)) {
        return false;
      }
      if (typeQuery !== "") {
        if (row.kind === "content") {
          if (row.content_type_id !== typeQuery) {
            return false;
          }
        } else if (row.type !== typeQuery) {
          return false;
        }
      }
      if (modeQuery === "active" && !(row.kind === "list" && row.active)) {
        return false;
      }
      if (modeQuery === "internal" && !(row.kind === "list" && !row.active)) {
        return false;
      }
      return true;
    });
  }, [descQuery, kind, modeQuery, nameQuery, rows, typeQuery]);
  const pager = usePager<Dataset>(filtered);
  const ops = useRowOps<Dataset>({
    nameOf: (row) => row.name,
    copy: async (row, name) =>
      thunkError(
        await dispatch(
          copyDatasetRowThunk({ scope: scope ?? "", source: row, name }),
        ),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeDatasetThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });
  const filtering =
    nameQuery.trim() !== "" || descQuery.trim() !== "" || typeQuery !== "" ||
    modeQuery !== "";

  const setName = (value: string) => {
    setNameQuery(value);
    pager.setPage(0);
  };
  const setDesc = (value: string) => {
    setDescQuery(value);
    pager.setPage(0);
  };
  const setType = (value: string) => {
    setTypeQuery(value);
    pager.setPage(0);
  };
  const setMode = (value: string) => {
    setModeQuery(value);
    pager.setPage(0);
  };

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadDatasets(scope));
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
  });

  // `?open=<uuid>` -- вход из другого раздела в конкретный набор: со страницы
  // http так открывают состав объявленного списка. Строки может ещё не быть на
  // руках, поэтому ждём загрузки, а открыв -- убираем параметр из адреса:
  // иначе закрытая панель вернётся на следующем рендере.
  useEffect(() => {
    if (openId === null || !rows.some((row: Dataset) => row.uuid === openId)) {
      return;
    }
    dispatch(openPanel(openId));
    const next = new URLSearchParams(params);
    next.delete("open");
    setParams(next, { replace: true });
  }, [dispatch, openId, params, rows, setParams]);

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      {error !== null && rows.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      <DataTable
        loading={loading}
        error={error}
        sx={{
          /*
            Колонка записей -- по содержимому: чип размера со скрепкой, а не
            доля ширины. Последняя теперь колонка действий, поэтому счёт идёт
            с конца через одну.
          */
          "& td:nth-last-of-type(2), & th:nth-last-of-type(2)": {
            width: "1%",
            whiteSpace: "nowrap",
          },
        }}
      >
        <DataTable.Head>
          <FilterText
            value={nameQuery}
            onChange={setName}
            placeholder={t("common.name")}
          />
          <FilterText
            value={descQuery}
            onChange={setDesc}
            placeholder={t("datasets.description")}
          />
          <FilterSelect
            value={typeQuery}
            onChange={setType}
            options={typeOptions}
            placeholder={t("datasets.type")}
            unset=""
            width={140}
          />
          {kind === "list" && (
            <FilterSelect
              value={modeQuery}
              onChange={setMode}
              options={modeOptions}
              placeholder={t("datasets.mode")}
              unset=""
              width={140}
            />
          )}
          <TableCell align="right">{t("datasets.records")}</TableCell>
          <RowActionsHead />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row: Dataset) => {
            const links = profileLinksOf(row);
            return (
              <TableRow
                key={row.uuid}
                hover
                selected={panelId === row.uuid}
                onClick={() => dispatch(openPanel(row.uuid))}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ alignItems: "center" }}
                  >
                    <span>{row.name}</span>
                    {/* Встроенную не удалить и не переименовать: замок стоит
                        у имени, потому что заперто именно оно. */}
                    {row.builtin === true && (
                      <LockOutlinedIcon
                        titleAccess={t(
                          row.kind === "content"
                            ? "datasets.builtinHint"
                            : "datasets.builtinListHint",
                        )}
                        sx={{ fontSize: 14, color: "text.disabled" }}
                      />
                    )}
                  </Stack>
                </TableCell>
                <TableCell>{row.description}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        row.kind === "content"
                          ? contentTypeLabel(contentTypes, row.content_type_id)
                          : typeLabel(t, row.type)
                      }
                    />
                    {/* Состав -- md5 значений: сравнение хеширует само. */}
                    {row.hash === true && (
                      <Chip size="small" variant="outlined" label="md5" />
                    )}
                  </Stack>
                </TableCell>
                {kind === "list" && (
                  <TableCell>
                    <Chip
                      size="small"
                      color={row.active ? "success" : "default"}
                      variant={row.active ? "filled" : "outlined"}
                      label={
                        row.active
                          ? t("datasets.active")
                          : t("datasets.internal")
                      }
                    />
                  </TableCell>
                )}
                <TableCell align="right">
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ justifyContent: "flex-end", alignItems: "center" }}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      label={formatSize(row.kind, row.size)}
                    />
                    {links.length > 0 ? (
                      <TableIconButton
                        icon={<AttachFileOutlinedIcon />}
                        tooltip={linkedTooltip(t, links)}
                        aria-label={t("datasets.linkedHint")}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <Box sx={{ width: 20, height: 20, flexShrink: 0 }} />
                    )}
                  </Stack>
                </TableCell>
                {ops.cell(row, {
                  remove:
                    row.builtin === true
                      ? t(
                          row.kind === "content"
                            ? "datasets.builtinHint"
                            : "datasets.builtinListHint",
                        )
                      : undefined,
                })}
              </TableRow>
            );
          })}
        </DataTable.Body>
        <DataTable.Empty
          kind={filtering ? "none" : "empty"}
          message={
            filtering
              ? t("table.none")
              : t(kind === "content" ? "datasets.emptyPages" : "datasets.empty")
          }
          actionLabel={filtering ? undefined : t("common.create")}
          onAction={
            filtering ? undefined : () => dispatch(openPanel(null))
          }
        />
        <DataTable.Error onRetry={() => void dispatch(loadDatasets(scope))} />
        <DataTable.Pager pager={pager} />
      </DataTable>
      {ops.modals}
      <Drawer
        anchor="right"
        open={panelId !== undefined}
        onClose={() => dispatch(closePanel())}
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
        {panelId !== undefined && (
          <DatasetForm
            key={panelId ?? "new"}
            scope={scope}
            id={panelId}
            kind={kind}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </>
  );
}

function DatasetForm({
  scope,
  id,
  kind,
  onClose,
}: {
  scope: string;
  id: string | null;
  kind: DatasetKind;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const openAdd = onFormOpen(FORM_DATASET_ADD_ENTRY);
  const closeAdd = onFormClose(FORM_DATASET_ADD_ENTRY);
  const uploadRef = useRef<HTMLInputElement>(null);
  const row = useAppSelector((s) =>
    id === null
      ? null
      : (s.pages.datasets.rows.find((item: Dataset) => item.uuid === id) ?? null),
  );
  const contentTypes = useAppSelector((s) => s.pages.datasets.contentTypes);
  const addresses = useAppSelector((s) => s.pages.datasets.addresses);
  const addressesId = useAppSelector((s) => s.pages.datasets.addressesId);
  const content = useAppSelector((s) => s.pages.datasets.content);
  const contentId = useAppSelector((s) => s.pages.datasets.contentId);
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [type, setType] = useState<DatasetType>(row?.type ?? "ipv4");
  const [contentTypeId, setContentTypeId] = useState(
    row?.content_type_id ?? contentTypes[0]?.uuid ?? "",
  );
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState("0");
  const [mode, setMode] = useState<DatasetMode>(
    row?.mode ?? (row?.active === true ? "active" : "internal"),
  );
  const [limit, setLimit] = useState(
    String(row?.limit ?? row?.max_entries ?? 1_000_000),
  );
  const [listTtl, setListTtl] = useState(row?.ttl ?? "");
  const [hash, setHash] = useState(row?.hash === true);
  const [view, setView] = useState<"table" | "raw">("table");
  const [fileText, setFileText] = useState("");
  const [fileBlob, setFileBlob] = useState<string | null>(null);
  const [contentFileName, setContentFileName] = useState("");
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lines = useMemo(() => parseDraftLines(text), [text]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return lines;
    }
    return lines.filter((line) => line.toLowerCase().includes(q));
  }, [lines, query]);
  /* Скроллер списка: по его высоте пагинатор считает размер страницы. */
  const addressBox = useRef<HTMLDivElement>(null);
  const pager = usePager(filtered);
  const searching = query.trim() !== "";
  /*
   * Встроенный набор. Страница отказа (content) заперта целиком: поставочный
   * образец, свой вариант получают кнопкой «Скопировать». Список-заготовка
   * заперт только именем: состав, лимит и режим -- рабочее состояние.
   */
  const builtin = row?.builtin === true;
  const contentLocked = builtin && kind === "content";
  /*
   * Причина запрета уходит во всплывающую подсказку замка, а не в строку под
   * полем: у имени и у тела она одна и та же, и напечатанная дважды занимала
   * бы больше места, чем сами значения.
   */
  const lockedNameHint = t(
    kind === "content" ? "datasets.builtinNameHint" : "datasets.builtinListNameHint",
  );
  const lockedContentHint = t("datasets.builtinHint");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const selectedContent = contentTypes.find((item: ContentType) => item.uuid === contentTypeId);
  const textContent = selectedContent !== undefined && isTextContentType(selectedContent.name);
  const waiting =
    id !== null &&
    (kind === "list" ? addressesId !== id : contentId !== id);

  useEffect(() => {
    if (id !== null || contentTypeId !== "" || contentTypes.length === 0) {
      return;
    }
    setContentTypeId(contentTypes[0].uuid);
  }, [id, contentTypeId, contentTypes]);

  useEffect(() => {
    if (id === null) {
      return;
    }
    if (kind === "list" && addressesId !== id) {
      return;
    }
    if (kind === "content" && contentId !== id) {
      return;
    }
    setName(row?.name ?? "");
    setDescription(row?.description ?? "");
    setType(row?.type ?? "ipv4");
    setMode(row?.mode ?? (row?.active === true ? "active" : "internal"));
    setLimit(String(row?.limit ?? row?.max_entries ?? 1_000_000));
    setListTtl(row?.ttl ?? "");
    setHash(row?.hash === true);
    setContentTypeId(row?.content_type_id ?? contentTypes[0]?.uuid ?? "");
    if (kind === "list") {
      setText(addresses.map((item: { address: string }) => item.address).join("\n"));
      return;
    }
    if (content !== null && textContent) {
      setFileText(base64ToText(content.blob));
      setFileBlob(content.blob);
      setContentFileName("");
    } else {
      setFileText("");
      setFileBlob(content?.blob ?? null);
      setContentFileName("");
    }
  }, [
    id,
    kind,
    addressesId,
    contentId,
    addresses,
    content,
    row,
    contentTypes,
    textContent,
  ]);

  useEffect(() => () => closeAdd(), [closeAdd]);

  const lockLeft = Math.max(0, lockUntil - now);
  useEffect(() => {
    if (lockLeft <= 0) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 16);
    return () => window.clearInterval(id);
  }, [lockLeft]);

  const canSave =
    name.trim() !== "" &&
    !waiting &&
    (kind === "list" || contentTypeId !== "");

  return (
    <>
    <Form id="dataset">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("datasets.newTitle") : t("datasets.editTitle")}
        </Typography>
        {id !== null && (
          <Chip
            size="small"
            variant="outlined"
            label={
              kind === "content"
                ? `${kindLabel(t, kind)} · ${contentTypeLabel(contentTypes, contentTypeId)}`
                : `${kindLabel(t, kind)} · ${typeLabel(t, type)}`
            }
          />
        )}
        <Form.Close onClick={onClose} aria-label={t("datasets.closeAria")} />
      </Form.Header>
      <Form.Body
        spacing={0}
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          p: 0,
          /*
           * Жёлоб полосы с обеих сторон. Прокручивается сам DialogContent, и
           * без жёлоба полоса выедает ~10px только справа: редактор стоит к
           * правому краю панели дальше, чем к левому.
           */
          scrollbarGutter: "stable both-edges",
        }}
      >
        <Stack spacing={1.5} sx={{ px: 2, pt: 1.5, pb: 1.5, flexShrink: 0 }}>
          <TextField
            size="small"
            label={t("common.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText={
              !builtin && kind === "content" ? t("datasets.contentNameHint") : undefined
            }
            slotProps={{
              input: {
                readOnly: builtin,
                endAdornment: builtin ? <LockedNote hint={lockedNameHint} /> : undefined,
              },
              htmlInput: { tabIndex: builtin ? -1 : undefined },
            }}
            sx={builtin ? lockedInputSx : undefined}
            required
          />
          <TextField
            size="small"
            label={t("datasets.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            slotProps={{
              input: {
                readOnly: contentLocked,
                endAdornment: contentLocked ? (
                  <LockedNote hint={lockedContentHint} />
                ) : undefined,
              },
              htmlInput: { tabIndex: contentLocked ? -1 : undefined },
            }}
            sx={contentLocked ? lockedInputSx : undefined}
          />
          {kind === "list" && id === null && (
            <TextField
              select
              size="small"
              label={t("datasets.type")}
              value={type}
              helperText={t("datasets.typeHint")}
              onChange={(e) => setType(e.target.value as DatasetType)}
            >
              {DATASET_TYPES.map((item) => (
                <MenuItem key={item} value={item}>
                  {typeLabel(t, item)}
                </MenuItem>
              ))}
            </TextField>
          )}
          {/*
            hash=md5 -- только у списка строк. Флаг переключается, пока набор
            пуст: сырые записи после смены не совпали бы ни разу, хеши стали бы
            мусором; контроллер отвечает hash_locked, панель не предлагает.
          */}
          {kind === "list" && type === "string" && (
            <FormControlLabel
              sx={{ alignItems: "flex-start", ml: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={hash}
                  disabled={row !== null && row !== undefined && row.size > 0}
                  onChange={(e) => setHash(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                    {t("datasets.hash")}
                  </Box>
                  <Box sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
                    {row !== null && row !== undefined && row.size > 0
                      ? t("datasets.hashLocked")
                      : t("datasets.hashHint")}
                  </Box>
                </Box>
              }
            />
          )}
          {kind === "list" && (
            <>
              <TextField
                select
                size="small"
                label={t("datasets.mode")}
                value={mode}
                helperText={
                  mode === "active"
                    ? t("datasets.activeHint")
                    : t("datasets.internalHint")
                }
                onChange={(e) => setMode(e.target.value as DatasetMode)}
              >
                <MenuItem value="internal">{t("datasets.internal")}</MenuItem>
                <MenuItem value="active">{t("datasets.active")}</MenuItem>
              </TextField>
              <TextField
                size="small"
                type="number"
                label={t("datasets.limit")}
                value={limit}
                helperText={t("datasets.limitHint")}
                onChange={(e) => setLimit(e.target.value)}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              {mode === "active" && (
                <TextField
                  size="small"
                  label={t("datasets.listTtl")}
                  value={listTtl}
                  helperText={t("datasets.listTtlHint")}
                  onChange={(e) => setListTtl(e.target.value)}
                  placeholder="5m"
                />
              )}
            </>
          )}
          {kind === "content" && id === null && (
            <TextField
              select
              size="small"
              label={t("datasets.contentType")}
              value={contentTypeId}
              helperText={t("datasets.typeHint")}
              onChange={(e) => setContentTypeId(e.target.value)}
            >
              {contentTypes.map((item: ContentType) => (
                <MenuItem key={item.uuid} value={item.uuid}>
                  {item.description.length > 0
                    ? `${item.name} — ${item.description}`
                    : item.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {kind === "list" && (
            <UnderlayTabs
              value={view}
              onChange={setView}
              items={[
                { value: "table", label: t("datasets.tabTable") },
                { value: "raw", label: t("datasets.tabRaw") },
              ]}
            />
          )}
        </Stack>
        {kind === "list" && (
          <input
            ref={uploadRef}
            type="file"
            accept=".txt,.csv,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file === undefined) {
                return;
              }
              void file.text().then(setText);
            }}
          />
        )}
        {kind === "list" && view === "table" ? (
          <>
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
                  /*
                   * Ширины колонок держит colgroup, а не содержимое: значение
                   * бывает длиннее панели (строка с хешем пароля), и при
                   * авторазметке оно растягивало таблицу, унося TTL и кнопки
                   * за правый край. Теперь хвост уходит за край поля, а
                   * целиком значение показывает окно по карандашу.
                   */
                  tableLayout: "fixed",
                  "& td, & th": { borderLeft: 0, borderRight: 0 },
                  "& .MuiTableCell-root:last-of-type": {
                    width: 104,
                    paddingLeft: 0.75,
                    paddingRight: 2,
                    textAlign: "right",
                  },
                }}
              >
                <colgroup>
                  <col />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 104 }} />
                </colgroup>
                <TableHead>
                  <TableRow>
                    <FilterText
                      value={query}
                      onChange={(value) => {
                        setQuery(value);
                        pager.setPage(0);
                      }}
                      placeholder={t("datasets.value")}
                      mono
                    />
                    <TableCell sx={{ width: 88 }}>{t("datasets.ttl")}</TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ justifyContent: "flex-end" }}
                      >
                        <TableIconButton
                          icon={<FileDownloadOutlinedIcon />}
                          tooltip={t("common.download")}
                          onClick={() =>
                            downloadTextFile(listExportName(name), text)
                          }
                        />
                        <TableIconButton
                          icon={<FileUploadOutlinedIcon />}
                          tooltip={t("common.upload")}
                          onClick={() => uploadRef.current?.click()}
                        />
                        <TableIconButton
                          color="success"
                          icon={<AddIcon />}
                          tooltip={t("datasets.addTitle")}
                          onClick={() =>
                            openAdd({
                              scope,
                              datasetId: id,
                              type,
                            })
                          }
                        />
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableHead>
                {/*
                  Строки состава -- редактор, а не фильтр: заполненная ячейка
                  здесь норма, и заливка «активной колонки» красила бы синим
                  весь список (см. EditorCellScope). У поля поиска в шапке она
                  остаётся -- оно и правда сужает выборку.
                */}
                <EditorCellScope>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableNoticeRow
                      colSpan={3}
                      kind={searching ? "none" : "empty"}
                      message={
                        searching ? t("table.none") : t("datasets.emptyEntries")
                      }
                    />
                  )}
                  {/*
                    Ключ -- место в списке, а не само значение: строка правится
                    на месте, и ключ-значение пересоздавал бы поле на каждой
                    набранной букве, теряя курсор.
                  */}
                  {pager.rows.map((line, index) => (
                    <TableRow key={index} hover>
                      {/* Длинное значение в строку не помещается: хвост уходит
                          за край поля, целиком его показывает окно по
                          карандашу ([LongTextCell]). */}
                      <LongTextCell
                        value={line}
                        placeholder={placeholderFor(t, type)}
                        title={t("datasets.value")}
                        hint={helperFor(t, type)}
                        rows={3}
                        onChange={(next) =>
                          setText(replaceDraftValue(text, line, next))
                        }
                      />
                      <TableCell sx={{ color: "text.secondary" }}>
                        {(() => {
                          const meta = addresses.find(
                            (item: { address: string; ttl_s?: number }) =>
                              item.address === line,
                          );
                          return meta !== undefined && (meta.ttl_s ?? 0) > 0
                            ? String(meta.ttl_s)
                            : t("datasets.ttlNone");
                        })()}
                      </TableCell>
                      <TableCell sx={{ py: 0 }}>
                        <TableIconButton
                          color="error"
                          icon={<DeleteIcon />}
                          tooltip={t("common.delete")}
                          onClick={() => setText(removeDraftValue(text, line))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </EditorCellScope>
              </Table>
            </TableContainer>
            {filtered.length > 0 && (
              <Paginator
                pager={pager}
                container={addressBox}
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
          </>
        ) : kind === "list" ? (
          <Box
            sx={{
              position: "relative",
              px: 2,
              pb: 2,
              flex: 1,
              minHeight: 0,
              display: "flex",
            }}
          >
            <TextField
              size="small"
              label={t("datasets.text")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              multiline
              minRows={8}
              placeholder={placeholderFor(t, type)}
              sx={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                "& .MuiInputBase-root": {
                  flexGrow: 1,
                  alignItems: "stretch",
                },
                "& textarea": {
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  lineHeight: 1.45,
                  pr: 6,
                },
              }}
            />
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                position: "absolute",
                top: 8,
                right: 24,
                zIndex: 1,
              }}
            >
              <TableIconButton
                icon={<FileDownloadOutlinedIcon />}
                tooltip={t("common.download")}
                onClick={() => downloadTextFile(listExportName(name), text)}
              />
              {!contentLocked && (
                <TableIconButton
                  icon={<FileUploadOutlinedIcon />}
                  tooltip={t("common.upload")}
                  onClick={() => uploadRef.current?.click()}
                />
              )}
            </Stack>
          </Box>
        ) : (
          <Box
            sx={{
              position: "relative",
              px: 2,
              pb: 2,
              flex: 1,
              minHeight: 0,
              display: "flex",
            }}
          >
            <input
              ref={uploadRef}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file === undefined) {
                  return;
                }
                if (textContent) {
                  void file.text().then((value) => {
                    setFileText(value);
                    setFileBlob(textToBase64(value));
                    setContentFileName("");
                  });
                  return;
                }
                void file.arrayBuffer().then((buf) => {
                  setFileBlob(bytesToBase64(new Uint8Array(buf)));
                  setFileText("");
                  setContentFileName(file.name);
                });
              }}
            />
            <TextField
              size="small"
              label={t("datasets.text")}
              value={
                textContent
                  ? fileText
                  : contentFileName !== ""
                    ? contentFileName
                    : fileBlob !== null && fileBlob.length > 0
                      ? t("datasets.file")
                      : ""
              }
              onChange={(e) => {
                if (!textContent || contentLocked) {
                  return;
                }
                setFileText(e.target.value);
                setFileBlob(textToBase64(e.target.value));
              }}
              multiline
              minRows={8}
              placeholder={t("datasets.emptyContent")}
              slotProps={{ htmlInput: { readOnly: !textContent || contentLocked } }}
              sx={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                "& .MuiInputBase-root": {
                  flexGrow: 1,
                  alignItems: "stretch",
                },
                "& textarea": {
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  lineHeight: 1.45,
                  pr: 6,
                },
              }}
            />
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                position: "absolute",
                top: 8,
                right: 24,
                zIndex: 1,
              }}
            >
              {/* Смотреть можно только текстовое: двоичному телу рендерить
                  нечего, а пустому -- нечем. */}
              {textContent && fileText.trim() !== "" && (
                <TableIconButton
                  icon={<VisibilityOutlinedIcon />}
                  tooltip={t("datasets.previewTitle")}
                  onClick={() => setPreviewOpen(true)}
                />
              )}
              {/* Залить поверх встроенной страницы нечего: ручка ответит
                  builtin_locked, а «Сохранить» у неё и так спрятана. Вместо
                  кнопки в том же слоте -- замок с причиной. */}
              {contentLocked ? (
                <LockedNote hint={lockedContentHint} />
              ) : (
                <TableIconButton
                  icon={<FileUploadOutlinedIcon />}
                  tooltip={t("common.upload")}
                  onClick={() => uploadRef.current?.click()}
                />
              )}
            </Stack>
          </Box>
        )}
      </Form.Body>
      <Form.Notice
        notice={
          formError === null ? null : { text: formError, code: errorCode(formError) }
        }
        onDismiss={() => setFormError(null)}
      />
      <Form.Actions>
        {/* Копия -- для любой существующей страницы: от образца
            отталкиваются, а свою размножают между пространствами. */}
        {id !== null && kind === "content" && (
          <Button
            size="small"
            startIcon={<ContentCopyOutlinedIcon />}
            disabled={saving || waiting}
            onClick={() => {
              setCopyError(null);
              setCopyOpen(true);
            }}
          >
            {t("copyModal.button")}
          </Button>
        )}
        {id !== null && !builtin && (
          <Button
            size="small"
            color="error"
            disabled={saving || waiting}
            onClick={() => {
              void (async () => {
                setFormError(null);
                const result = await dispatch(
                  removeDatasetThunk({ scope, id }),
                );
                if (removeDatasetThunk.rejected.match(result)) {
                  setFormError(
                    typeof result.payload === "string"
                      ? result.payload
                      : String(result.error.message ?? result.error),
                  );
                }
              })();
            }}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button size="small" onClick={onClose}>
          {t("common.close")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!canSave || saving || lockLeft > 0}
          sx={{
            position: "relative",
            fontVariantNumeric: "tabular-nums",
            ...(contentLocked ? { display: "none" } : {}),
          }}
          onClick={() => {
            void (async () => {
              setFormError(null);
              setSaving(true);
              try {
                const result = await dispatch(
                  saveDatasetThunk({
                    scope,
                    id,
                    name: name.trim(),
                    description,
                    kind,
                    type,
                    contentTypeId: kind === "content" ? contentTypeId : null,
                    mode: kind === "list" ? mode : "internal",
                    limit:
                      kind === "list"
                        ? Number.parseInt(limit, 10) || 1_000_000
                        : undefined,
                    ttl: kind === "list" && mode === "active" ? listTtl.trim() || undefined : undefined,
                    hash: kind === "list" && type === "string" ? hash : undefined,
                    ttlS: Number.parseInt(ttl, 10) || 0,
                    text,
                    blob: kind === "content" ? fileBlob : null,
                  }),
                );
                if (saveDatasetThunk.rejected.match(result)) {
                  const raw =
                    typeof result.payload === "string"
                      ? result.payload
                      : String(result.error.message ?? result.error);
                  setFormError(raw);
                  setLockUntil(Date.now() + SAVE_LOCK_MS);
                  setNow(Date.now());
                }
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          <Box
            component="span"
            sx={{ visibility: lockLeft > 0 ? "hidden" : "visible" }}
          >
            {id === null ? t("common.create") : t("common.save")}
          </Box>
          {lockLeft > 0 && (
            <Box
              component="span"
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {(lockLeft / 1000).toFixed(2)}
            </Box>
          )}
        </Button>
      </Form.Actions>
    </Form>
      <DatasetAddEntryForm
        onLocalAdd={(value, ttlS) => {
          setText(appendDraftValue(text, value));
          setTtl(String(ttlS));
        }}
      />
      {copyOpen && (
        <CopyNameModal
          title={t("copyModal.pageTitle")}
          source={name.trim()}
          busy={copyBusy}
          error={copyError}
          onClose={() => setCopyOpen(false)}
          onCopy={(next) => {
            void (async () => {
              setCopyBusy(true);
              setCopyError(null);
              try {
                const result = await dispatch(
                  copyDatasetThunk({
                    scope,
                    name: next,
                    description,
                    contentTypeId,
                    fileName: next,
                    blob: fileBlob ?? "",
                  }),
                );
                if (copyDatasetThunk.rejected.match(result)) {
                  setCopyError(
                    typeof result.payload === "string"
                      ? result.payload
                      : String(result.error.message ?? result.error),
                  );
                  return;
                }
                setCopyOpen(false);
              } finally {
                setCopyBusy(false);
              }
            })();
          }}
        />
      )}
      {previewOpen && (
        <PagePreviewDialog
          name={name.trim() === "" ? t("datasets.previewTitle") : name.trim()}
          typeName={selectedContent?.name ?? "text"}
          body={fileText}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
