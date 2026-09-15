import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import SubjectIcon from "@mui/icons-material/Subject";

import type { InspectorView } from "../fleet.ts";
import {
  INSPECTOR_LOG_LEVELS,
  type InspectorLogLevel,
  type InspectorMeta,
} from "../api.ts";
import { Form, formDrawerPaperSx } from "../components/Form.tsx";
import {
  DataTable,
  RowActionsHead,
  TableIconButton,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  loadInspectorDetail,
  loadInspectors,
  openPanel,
  saveInspectorThunk,
} from "../store/slices/pages/inspector-catalog.ts";

const PANEL_WIDTH = 560;

export default function InspectorCatalog() {
  const t = useT();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const scope = useAppSelector((s) => s.session.scope);
  const error = useAppSelector((s) => s.pages.inspectorCatalog.error);
  const rows = useAppSelector((s) => s.pages.inspectorCatalog.rows);
  const loading = useAppSelector((s) => s.pages.inspectorCatalog.loading);
  const panelId = useAppSelector((s) => s.pages.inspectorCatalog.panelId);
  const replicas = useAppSelector((s) => s.inspectors.rows);
  const pager = usePager(rows);
  const ops = useRowOps<InspectorMeta>({
    nameOf: (row) => row.name,
  });

  usePageBar({
    flush: scope !== null,
    onUpdate: () => {
      void dispatch(loadInspectors(scope));
    },
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
          <TableCell>{t("inspectorCatalog.description")}</TableCell>
          <TableCell>{t("inspectorCatalog.instances")}</TableCell>
          <TableCell>{t("inspectorCatalog.subject")}</TableCell>
          <TableCell>{t("inspectorCatalog.phase")}</TableCell>
          <RowActionsHead extra={2} />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row) => {
            const live = replicas.filter((item) => item.subject === row.subject);
            return (
              <TableRow
                key={row.uuid}
                hover
                selected={panelId === row.uuid}
                onClick={() => {
                  dispatch(openPanel(row.uuid));
                  void dispatch(loadInspectorDetail({ scope, id: row.uuid }));
                }}
                sx={{ cursor: "pointer" }}
              >
                <TableCell sx={{ fontFamily: "monospace" }}>{row.name}</TableCell>
                <TableCell sx={{ color: "text.secondary" }}>
                  {row.description}
                </TableCell>
                <TableCell>
                  <Replicas live={live} />
                </TableCell>
                <TableCell sx={{ fontFamily: "monospace" }}>{row.subject}</TableCell>
                <TableCell>
                  {row.phases
                    .map((item) => t(`inspectorCatalog.phaseValue.${item}`))
                    .join(", ")}
                </TableCell>
                {ops.cell(
                  row,
                  {
                    copy: t("inspectorCatalog.copyOff"),
                    remove: t("inspectorCatalog.deleteOff"),
                  },
                  <>
                    <TableIconButton
                      icon={<SubjectIcon />}
                      tooltip={t("inspectorCatalog.logsLink")}
                      onClick={(e) => {
                        e.stopPropagation();
                        const service = live[0]?.name ?? row.name;
                        navigate(`/logs?service=${encodeURIComponent(service)}`);
                      }}
                    />
                    <TableIconButton
                      icon={<MenuBookOutlinedIcon />}
                      tooltip={
                        row.docs_url === ""
                          ? t("inspectorCatalog.docsNone")
                          : t("inspectorCatalog.docsOpen")
                      }
                      disabled={row.docs_url === ""}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(row.docs_url, "_blank", "noopener");
                      }}
                    />
                  </>,
                )}
              </TableRow>
            );
          })}
        </DataTable.Body>
        <DataTable.Empty message={t("inspectorCatalog.empty")} />
        <DataTable.Error onRetry={() => void dispatch(loadInspectors(scope))} />
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
              ...formDrawerPaperSx,
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {panelId !== undefined && (
          <InspectorForm
            key={panelId}
            scope={scope}
            id={panelId}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </>
  );
}

function Replicas({ live }: { live: InspectorView[] }) {
  if (live.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.disabled" }}>
        0
      </Typography>
    );
  }

  const degraded = live.some((item) => item.status === "degraded");
  const detail = live
    .map((item) => `${item.hostname} — ${item.status}`)
    .join(", ");

  return (
    <Tooltip title={detail}>
      <Typography
        variant="body2"
        sx={{ color: degraded ? "warning.main" : "success.main", width: "fit-content" }}
      >
        {live.length}
      </Typography>
    </Tooltip>
  );
}

function InspectorForm({
  scope,
  id,
  onClose,
}: {
  scope: string;
  id: string;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const detail = useAppSelector((s) => s.pages.inspectorCatalog.detail);
  const meta = useAppSelector((s) =>
    s.pages.inspectorCatalog.rows.find((row) => row.uuid === id),
  );
  const uploadRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [logLevel, setLogLevel] = useState<InspectorLogLevel>("info");
  const [conf, setConf] = useState("");

  useEffect(() => {
    if (detail !== null && detail.uuid === id) {
      setDescription(detail.description);
      setLogLevel(detail.log_level ?? "info");
      setConf(detail.conf);
    }
  }, [id, detail]);

  const waiting = detail === null || detail.uuid !== id;
  const readOnly = {
    htmlInput: { readOnly: true, tabIndex: -1 },
  };

  return (
    <Form id="inspector-catalog">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {t("inspectorCatalog.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body scroll>
        <TextField
          size="small"
          label={t("common.name")}
          value={meta?.name ?? ""}
          helperText={t("inspectorCatalog.nameHint")}
          slotProps={{ ...readOnly, input: { sx: { fontFamily: "monospace" } } }}
        />
        <TextField
          size="small"
          label={t("inspectorCatalog.description")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          minRows={2}
          helperText={t("inspectorCatalog.descriptionHint")}
        />
        <TextField
          select
          size="small"
          label={t("inspectorCatalog.logLevel")}
          value={logLevel}
          onChange={(e) => setLogLevel(e.target.value as InspectorLogLevel)}
          helperText={t("inspectorCatalog.logLevelHint")}
          slotProps={{ input: { sx: { fontFamily: "monospace" } } }}
        >
          {INSPECTOR_LOG_LEVELS.map((item) => (
            <MenuItem key={item} value={item} sx={{ fontFamily: "monospace" }}>
              {item}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ position: "relative", flexGrow: 1, display: "flex", minHeight: 0 }}>
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
              void file.text().then(setConf);
            }}
          />
          <TextField
            size="small"
            label={t("inspectorCatalog.conf")}
            value={conf}
            onChange={(e) => setConf(e.target.value)}
            multiline
            minRows={10}
            helperText={t("inspectorCatalog.confHint")}
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
              right: 8,
              zIndex: 1,
            }}
          >
            <TableIconButton
              icon={<FileUploadOutlinedIcon />}
              tooltip={t("inspectorCatalog.uploadHint")}
              onClick={() => uploadRef.current?.click()}
            />
          </Stack>
        </Box>
      </Form.Body>
      <Form.Actions>
        <Button size="small" onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          size="small"
          variant="contained"
          disabled={waiting}
          onClick={() => {
            void dispatch(
              saveInspectorThunk({
                scope,
                id,
                description,
                logLevel,
                conf,
              }),
            );
          }}
        >
          {t("common.save")}
        </Button>
      </Form.Actions>
    </Form>
  );
}
