import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";

import { Form } from "../components/Form.tsx";
import { InlineRulesEditor } from "../components/rules-editor/InlineRulesEditor.tsx";
import { RulesEditorModal } from "../components/rules-editor/RulesEditorModal.tsx";
import {
  DataTable,
  RowActionsHead,
  TableIconButton,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { downloadTextFile } from "../download.ts";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  copyListThunk,
  loadListDetail,
  loadLists,
  openPanel,
  removeListThunk,
  saveListThunk,
} from "../store/slices/pages/lists.ts";
import type { RuleFileMeta } from "../api.ts";
import { errorCode, thunkError } from "../errors.ts";

const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PANEL_WIDTH = "clamp(520px, 60vw, 1280px)";

function suggestFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? raw;
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "");
  return cleaned.length === 0 ? "rules.conf" : cleaned;
}

function exportFileName(raw: string): string {
  const name = suggestFileName(raw);
  return name.includes(".") ? name : `${name}.conf`;
}

export default function Lists() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const error = useAppSelector((s) => s.pages.lists.error);
  const rows = useAppSelector((s) => s.pages.lists.rows);
  const loading = useAppSelector((s) => s.pages.lists.loading);
  const panelId = useAppSelector((s) => s.pages.lists.panelId);
  const pager = usePager(rows);
  const ops = useRowOps<RuleFileMeta>({
    nameOf: (row) => row.name,
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyListThunk({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeListThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadLists(scope));
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
  });

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
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("lists.description")}</TableCell>
          <RowActionsHead />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row) => (
            <TableRow
              key={row.uuid}
              hover
              selected={panelId === row.uuid}
              onClick={() => {
                dispatch(openPanel(row.uuid));
                void dispatch(loadListDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.description}</TableCell>
              {ops.cell(row)}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("lists.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadLists(scope))} />
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
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {panelId !== undefined && (
          <ListForm
            key={panelId ?? "new"}
            scope={scope}
            id={panelId}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </>
  );
}

function ListForm({
  scope,
  id,
  onClose,
}: {
  scope: string;
  id: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const detail = useAppSelector((s) => s.pages.lists.detail);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (id !== null && detail !== null && detail.uuid === id) {
      setName(detail.name);
      setDescription(detail.description);
      setText(detail.text_raw);
      setSavedText(detail.text_raw);
    }
  }, [id, detail]);

  const nameOk = FILE_NAME_RE.test(name);
  const waiting = id !== null && (detail === null || detail.uuid !== id);

  return (
    <>
    <Form id="list">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("lists.newTitle") : t("lists.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body spacing={0} flush>
        <Stack spacing={1.5} sx={{ px: 2, pt: 1.5, flexShrink: 0 }}>
          <TextField
            size="small"
            label={t("common.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            error={name !== "" && !nameOk}
            helperText={t("lists.nameHint")}
          />
          <TextField
            size="small"
            label={t("lists.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Stack>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            px: 2,
            pt: 1,
            pb: 2,
          }}
        >
          <input
            ref={uploadRef}
            type="file"
            hidden
            accept=".conf,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file === undefined) {
                return;
              }
              void file.text().then((body) => {
                setText(body);
                if (name === "" || name === "00-rules.conf") {
                  setName(suggestFileName(file.name));
                }
              });
            }}
          />
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              pb: 0.5,
              flexShrink: 0,
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("lists.text")}
            </Typography>
            <Stack direction="row" spacing={0.5}>
              <TableIconButton
                icon={<FileDownloadOutlinedIcon />}
                tooltip={t("common.download")}
                onClick={() => downloadTextFile(exportFileName(name), text)}
              />
              <TableIconButton
                icon={<FileUploadOutlinedIcon />}
                tooltip={t("common.upload")}
                onClick={() => uploadRef.current?.click()}
              />
              <TableIconButton
                icon={<EditNoteOutlinedIcon />}
                tooltip={
                  id === null ? t("rulesEditor.openNew") : t("rulesEditor.openHint")
                }
                aria-label={t("rulesEditor.open")}
                disabled={id === null || waiting}
                onClick={() => setEditorOpen(true)}
              />
            </Stack>
          </Stack>
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <InlineRulesEditor
              name={name === "" ? "rules.conf" : name}
              value={text}
              onChange={setText}
            />
          </Box>
        </Box>
      </Form.Body>
      <Form.Notice
        notice={
          formError === null
            ? null
            : { text: formError, code: errorCode(formError) }
        }
        onDismiss={() => setFormError(null)}
      />
      <Form.Actions>
        {id !== null && (
          <Button
            size="small"
            color="error"
            disabled={waiting}
            onClick={() => {
              void (async () => {
                setFormError(null);
                const result = await dispatch(removeListThunk({ scope, id }));
                if (removeListThunk.rejected.match(result)) {
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
        <Button size="small" onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          size="small"
          variant="contained"
          disabled={!nameOk || waiting}
          onClick={() => {
            void dispatch(
              saveListThunk({
                scope,
                id,
                name,
                description,
                text_raw: text,
              }),
            );
          }}
        >
          {id === null ? t("common.create") : t("common.save")}
        </Button>
      </Form.Actions>
    </Form>
    {editorOpen && id !== null && (
      <RulesEditorModal
        scope={scope}
        name={name}
        mode="file"
        load={() =>
          Promise.resolve([{ uuid: id, name, text, baseline: savedText }])
        }
        onClose={() => setEditorOpen(false)}
        onSaved={(saved) => {
          const file = saved.files[0];
          if (file !== undefined) {
            setText(file.text);
            setSavedText(file.text);
          }
        }}
      />
    )}
    </>
  );
}
