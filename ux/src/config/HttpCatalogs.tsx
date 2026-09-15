import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InputBase from "@mui/material/InputBase";
import Checkbox from "@mui/material/Checkbox";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import {
  type BodyStoreRow,
  type Dataset,
  type DatasetType,
  type DenyResponseRow,
  type DenyResponseUse,
  type LogFormatRow,
} from "../api.ts";
import { isNewRow, type CatalogDraft } from "./catalog-draft.tsx";
import {
  dataActionCellSx,
  dataCellSx,
  dataHeadSx,
  dataInputSx,
} from "../components/settings-table.tsx";
import { SectionBleed } from "../components/settings-table.tsx";
import { Modal } from "../components/Modal.tsx";
import { DraftAddCell, draftKey } from "../components/table-block.tsx";
import { TableIconButton } from "../components/data-table/index.ts";
import {
  DialogLines,
  DialogRow,
  DialogSelect,
  DialogText,
  dialogInputSx,
} from "../components/dialog-kit.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import type { LayerItem } from "./layer-tabs.tsx";
import { Picker } from "./Picker.tsx";

const headSx = dataHeadSx;
const cellSx = dataCellSx;
const actionCellSx = dataActionCellSx;

export const HTTP_CATALOG_IDS = ["lists", "deny", "advanced"] as const;

export type HttpCatalogId = (typeof HTTP_CATALOG_IDS)[number];

export function httpCatalogItems(t: Translate): LayerItem<HttpCatalogId>[] {
  return HTTP_CATALOG_IDS.map((id) => ({
    id,
    label: t(`httpCat.${id}`),
    hint: t(`httpCat.${id}Hint`),
  }));
}

export function HttpCatalogs({
  catalog,
  only,
}: {
  catalog: CatalogDraft;
  only: HttpCatalogId;
}) {
  const t = useT();

  return (
    <>
      {catalog.error !== null && <Alert severity="error">{catalog.error}</Alert>}

      {only === "lists" && <ListsSection catalog={catalog} />}

      {only === "deny" && <DenySection catalog={catalog} />}

      {only === "advanced" && (
        <Stack spacing={3}>
          <Stack spacing={1}>
            <SubHead title={t("httpCat.store")} hint={t("httpCat.storeHint")} />
            {catalog.stores.length > 1 && (
              <Alert severity="error">{t("httpCat.storeMany")}</Alert>
            )}
            {catalog.loaded && catalog.stores.length === 0 && (
              <Alert severity="warning">{t("httpCat.storeNone")}</Alert>
            )}
            {catalog.stores.some((row) => !isNewRow(row.uuid) && row.url === "") && (
              <Alert severity="warning">{t("httpCat.storeUrlUnset")}</Alert>
            )}
            <StoreSection catalog={catalog} />
          </Stack>
          <Stack spacing={1}>
            <SubHead title={t("httpCat.formats")} hint={t("httpCat.formatsHint")} />
            <FormatSection catalog={catalog} />
          </Stack>
        </Stack>
      )}
    </>
  );
}

function SubHead({ title, hint }: { title: string; hint: string }) {
  return (
    <Box>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {hint}
      </Typography>
    </Box>
  );
}

function ListsSection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const [adding, setAdding] = useState<string | null>(null);

  const rows = catalog.lists;
  const declared = rows.filter((row) => row.in_nginx !== false);
  const spare = rows.filter((row) => row.in_nginx === false);


  const save = (row: Dataset, patch: Parameters<CatalogDraft["patchList"]>[1]) =>
    catalog.patchList(row.uuid, patch);

  return (
    <Stack spacing={1}>
      <SectionBleed scroll>
      <Table size="small">
        <TableHead>
          <TableRow>
            <Head width={200} hint={t("httpCat.listNameHint")}>{t("httpCat.name")}</Head>
            <Head width={120} hint={t("httpCat.listTypeHint")}>type=</Head>
            <Head width={140} hint={t("httpCat.listModeHint")}>{t("httpCat.listMode")}</Head>
            <Head width={120} hint={t("httpCat.listLimitHint")}>limit=</Head>
            <Head width={100} hint={t("httpCat.listTtlHint")}>ttl=</Head>
            <Head width={80} hint={t("httpCat.listHashHint")}>hash=</Head>
            <Head width={120} hint={t("httpCat.listSizeHint")}>{t("httpCat.listSize")}</Head>
            <Head width={48} />
          </TableRow>
        </TableHead>
        <TableBody>
          {declared.map((row) => (
            <TableRow key={row.uuid} hover>
              <TableCell sx={cellSx}>
                <InlineText
                  value={row.name}
                  mono
                  onCommit={(name) => name !== row.name && save(row, { name })}
                />
              </TableCell>
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>{row.type}</TableCell>
              <TableCell sx={cellSx}>
                <Tooltip
                  arrow
                  placement="top"
                  title={t(row.active ? "httpCat.modeActive" : "httpCat.modeInternal")}
                >
                  <Box sx={{ color: "text.secondary" }}>
                    {row.active ? "active" : "internal"}
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell sx={cellSx}>
                <InlineText
                  value={String(row.max_entries)}
                  placeholder="1000000"
                  onCommit={(raw) => {
                    const n = Number(raw);
                    if (Number.isInteger(n) && n > 0) save(row, { limit: n });
                  }}
                />
              </TableCell>
              <TableCell sx={cellSx}>
                {row.active ? (
                  <InlineText
                    value={row.ttl ?? ""}
                    placeholder="5m"
                    onCommit={(ttl) => save(row, { ttl: ttl.trim() })}
                  />
                ) : (
                  <Box sx={{ color: "text.disabled" }}>—</Box>
                )}
              </TableCell>
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>
                {row.hash === true ? "md5" : <Box sx={{ color: "text.disabled" }}>—</Box>}
              </TableCell>
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>
                {row.size}
              </TableCell>
              <TableCell sx={actionCellSx}>
                <TableIconButton
                  icon={<LinkOffIcon sx={{ fontSize: 16 }} />}
                  tooltip={t("httpCat.undeclare")}
                  onClick={() => save(row, { in_nginx: false })}
                />
              </TableCell>
            </TableRow>
          ))}
          {declared.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} sx={{ ...cellSx, color: "text.secondary" }}>
                {t("httpCat.listsEmpty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </SectionBleed>
      {adding === null ? (
        <DeclareListRow
          spare={spare}
          onDeclare={(row) => save(row, { in_nginx: true })}
          onNew={() => setAdding("")}
        />
      ) : (
        <NewListRow
          value={adding}
          onValue={setAdding}
          onCancel={() => setAdding(null)}
          sources={rows}
          onCreate={(name, type, copyFrom) => {
            catalog.addList({ name, type: type as DatasetType, copyFrom });
            setAdding(null);
          }}
        />
      )}
    </Stack>
  );
}

function DenySection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const rows = catalog.deny;
  const pages = catalog.pages;
  const [addOpen, setAddOpen] = useState(false);
  const create = (input: Omit<DenyResponseRow, "uuid">) => {
    catalog.addDeny(input);
    setAddOpen(false);
  };

  const save = (row: DenyResponseRow, patch: Partial<Omit<DenyResponseRow, "uuid">>) =>
    catalog.patchDeny(row.uuid, patch);

  const pageOptions = pages.map((p) => ({
    value: `@${p.name}`,
    hint: t("httpCat.fromPages"),
  }));

  const varsOf = (page: string | undefined): string[] | null =>
    pages.find((p) => `@${p.name}` === page)?.vars ?? null;

  return (
    <Stack spacing={1}>
      <SectionBleed scroll>
      <Table size="small">
        <TableHead>
          <TableRow>
            <Head hint={t("httpCat.denyNameHint")}>{t("httpCat.name")}</Head>
            <Head width={120} hint={t("httpCat.denyTypeHint")}>type=</Head>
            <Head width={90} hint={t("httpCat.denyStatusHint")}>{t("httpCat.denyCode")}</Head>
            <Head hint={t("httpCat.denyBodyHint")}>{t("httpCat.denyBody")}</Head>
            <Head width={180} hint={t("httpCat.denyParamsHint")}>params=</Head>
            <TableCell sx={{ ...headSx, width: 48, textAlign: "right" }}>
              <TableIconButton
                color="success"
                icon={<AddIcon sx={{ fontSize: 16 }} />}
                tooltip={t("httpCat.denyAdd")}
                onClick={() => setAddOpen(true)}
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const http = row.type === "http";
            const uses = row.uses ?? [];
            return (
              <TableRow key={row.uuid} hover>
                <TableCell sx={cellSx}>
                  <InlineText
                    value={row.name}
                    mono
                    onCommit={(name) => name !== row.name && save(row, { name })}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  <InlineSelect
                    value={row.type}
                    options={["http", "grpc", "websocket"]}
                    onChange={(type) =>
                      save(row, { type: type as DenyResponseRow["type"] })
                    }
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  <InlineText
                    value={String((http ? row.spec.status : row.spec.code) ?? "")}
                    placeholder={http ? "403" : "7"}
                    onCommit={(raw) => {
                      const n = raw.trim() === "" ? undefined : Number(raw);
                      if (raw.trim() !== "" && !Number.isInteger(n)) return;
                      const spec = { ...row.spec };
                      if (http) spec.status = n;
                      else spec.code = n;
                      save(row, { spec });
                    }}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  {http ? (
                    <Picker
                      free
                      plain
                      value={row.spec.page ?? ""}
                      placeholder={t("httpCat.denyPagePick")}
                      options={pageOptions}
                      onChange={(page) =>
                        save(row, {
                          spec: { ...row.spec, page: page === "" ? undefined : page },
                        })
                      }
                    />
                  ) : (
                    <InlineText
                      value={row.spec.message ?? ""}
                      placeholder={t("httpCat.denyMessagePlaceholder")}
                      onCommit={(message) =>
                        save(row, {
                          spec: {
                            ...row.spec,
                            message: message.trim() === "" ? undefined : message,
                          },
                        })
                      }
                    />
                  )}
                </TableCell>
                <TableCell sx={cellSx}>
                  {http ? (
                    <InlineParams
                      value={row.spec.params ?? []}
                      vars={varsOf(row.spec.page)}
                      onChange={(params) =>
                        save(row, {
                          spec: {
                            ...row.spec,
                            params: params.length === 0 ? undefined : params,
                          },
                        })
                      }
                    />
                  ) : (
                    <Tooltip arrow placement="top" title={t("httpCat.denyParamsOff")}>
                      <Box sx={{ color: "text.disabled", width: "fit-content" }}>—</Box>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell sx={actionCellSx}>
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                    disabled={uses.length > 0}
                    tooltip={
                      uses.length > 0
                        ? `${t("httpCat.denyInUse")} ${denyUsesLine(uses)}`
                        : t("common.delete")
                    }
                    onClick={() => catalog.removeDeny(row.uuid)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </SectionBleed>

      {addOpen && (
        <DenyAddDialog
          pages={pageOptions}
          varsOf={varsOf}
          onClose={() => setAddOpen(false)}
          onCreate={create}
        />
      )}
    </Stack>
  );
}

function DenyAddDialog({
  pages,
  varsOf,
  onClose,
  onCreate,
}: {
  pages: { value: string; hint?: string }[];
  varsOf: (page: string | undefined) => string[] | null;
  onClose: () => void;
  onCreate: (input: Omit<DenyResponseRow, "uuid">) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState({
    name: "",
    type: "http" as DenyResponseRow["type"],
    code: "",
    body: "",
    params: [] as string[],
  });

  const http = draft.type === "http";
  const code = draft.code.trim() === "" ? undefined : Number(draft.code);
  const ready = draft.name.trim() !== "" && (code === undefined || Number.isInteger(code));

  const line = () => {
    const name = draft.name.trim() === "" ? "?" : draft.name.trim();
    const body = draft.body.trim();
    const parts = [`waf_deny_response ${name}`];
    if (http) {
      parts.push(`status=${String(code ?? 403)}`);
      if (body !== "") parts.push(`page=${body}`);
      if (draft.params.length > 0) parts.push(`params=${draft.params.join(",")}`);
    } else {
      parts.push(`type=${draft.type}`, `code=${String(code ?? 7)}`);
      if (body !== "") parts.push(`message="${body}"`);
    }
    return `${parts.join(" ")};`;
  };

  const create = () => {
    const body = draft.body.trim() === "" ? undefined : draft.body.trim();
    onCreate({
      name: draft.name.trim(),
      type: draft.type,
      spec: http
        ? {
            status: code ?? 403,
            page: body,
            params: draft.params.length > 0 ? draft.params : undefined,
          }
        : { code: code ?? 7, message: body },
    });
  };

  return (
    <Modal
      onClose={onClose}
      title={t("httpCat.denyAddTitle")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={create}>
            {t("common.create")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={1.75}>
          <DialogRow label={t("httpCat.name")} hint={t("httpCat.denyNameHint")}>
            <DialogText
              mono
              value={draft.name}
              placeholder="blocked"
              onChange={(name) => setDraft({ ...draft, name })}
            />
          </DialogRow>

          <DialogRow label="type=">
            <DialogSelect
              value={draft.type}
              width={140}
              options={(["http", "grpc", "websocket"] as const).map((type) => ({
                value: type,
                label: type,
              }))}
              onChange={(type) =>
                setDraft((prev) => ({
                  ...prev,
                  type,
                  body: (prev.type === "http") === (type === "http") ? prev.body : "",
                }))
              }
            />
          </DialogRow>

          <DialogRow
            label={t("httpCat.denyCode")}
            hint={http ? t("httpCat.denyStatusHint") : undefined}
          >
            <DialogText
              value={draft.code}
              width={80}
              placeholder={http ? "403" : "7"}
              onChange={(next) => setDraft({ ...draft, code: next })}
            />
          </DialogRow>

          <DialogRow
            label={t("httpCat.denyBody")}
            hint={t(http ? "httpCat.denyPageHint" : "httpCat.denyMessageHint")}
          >
            {http ? (
              <Box sx={{ ...dialogInputSx, width: 220, display: "flex", alignItems: "center" }}>
                <Picker
                  free
                  plain
                  value={draft.body}
                  placeholder={t("httpCat.denyPagePick")}
                  options={pages}
                  onChange={(page) => setDraft({ ...draft, body: page })}
                />
              </Box>
            ) : (
              <DialogText
                value={draft.body}
                width={220}
                placeholder={t("httpCat.denyMessagePlaceholder")}
                onChange={(body) => setDraft({ ...draft, body })}
              />
            )}
          </DialogRow>

          {http && (
            <DialogRow
              label="params="
              hint={t("httpCat.denyParamsHint")}
            >
              <Box sx={{ ...dialogInputSx, width: 220, display: "flex", alignItems: "center" }}>
                <InlineParams
                  value={draft.params}
                  vars={varsOf(draft.body.trim())}
                  onChange={(params) => setDraft({ ...draft, params })}
                />
              </Box>
            </DialogRow>
          )}

          <DialogLines title={t("httpCat.denyLine")} lines={[line()]} />
        </Stack>
    </Modal>
  );
}

function InlineText({
  value,
  placeholder,
  mono,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  mono?: boolean;
  onCommit: (next: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <InputBase
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      sx={{
        ...dataInputSx,
        fontFamily: mono === true ? "monospace" : undefined,
      }}
    />
  );
}

function denyUsesLine(uses: DenyResponseUse[]): string {
  const shown = uses.slice(0, 5).map((use) => {
    const place = use.by === undefined ? use.at : `${use.by} @ ${use.at}`;
    return `${use.kind} ${place}`;
  });
  const more = uses.length - shown.length;
  return more > 0 ? `${shown.join(", ")} +${more}` : shown.join(", ");
}

const DENY_PARAMS = ["ray", "addr", "scope", "subject", "retry"] as const;

function denyVar(word: string): string {
  return `waf_deny_${word}`;
}

const DENY_DIAG_VARS = [
  "waf_ray",
  "waf_rid",
  "waf_reason",
  "waf_score",
  "waf_node_id",
];

function InlineParams({
  value,
  onChange,
  vars,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  vars: string[] | null;
}) {
  const t = useT();

  const prints = (word: string) => vars !== null && vars.includes(denyVar(word));

  const silenced =
    value.length === 0 ? [] : DENY_PARAMS.filter((w) => prints(w) && !value.includes(w));

  const diag = vars === null ? [] : DENY_DIAG_VARS.filter((v) => vars.includes(v));

  const warning =
    silenced.length === 0 && diag.length === 0 ? null : (
      <>
        {silenced.length > 0 && (
          <Box>
            {t("httpCat.denyParamsSilenced", {
              list: silenced.map((w) => denyVar(w)).join(", "),
            })}
          </Box>
        )}
        {diag.length > 0 && (
          <Box>{t("httpCat.denyParamsDiag", { list: diag.join(", ") })}</Box>
        )}
      </>
    );

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
    <Select
      multiple
      displayEmpty
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        const next = typeof raw === "string" ? raw.split(",") : raw;
        onChange(DENY_PARAMS.filter((w) => next.includes(w)));
      }}
      renderValue={(selected) =>
        selected.length === 0 ? (
          <Box component="span" sx={{ color: "text.disabled" }}>
            {t("httpCat.denyParamsAll")}
          </Box>
        ) : (
          `params=${selected.join(",")}`
        )
      }
      variant="outlined"
      fullWidth
      sx={{
        fontSize: "0.8rem",
        "& .MuiSelect-select": { py: 0, pl: 0, minHeight: "unset" },
        "& .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
      }}
    >
      {DENY_PARAMS.map((w) => (
        <MenuItem key={w} value={w} sx={{ fontSize: "0.8rem" }}>
          <Checkbox size="small" checked={value.includes(w)} sx={{ p: 0.25, mr: 0.75 }} />
          {t(`httpCat.denyParam.${w}`)}
          {vars !== null && !prints(w) && (
            <Box component="span" sx={{ ml: 0.75, color: "text.disabled" }}>
              {t("httpCat.denyParamUnused")}
            </Box>
          )}
        </MenuItem>
      ))}
    </Select>
    {warning !== null && (
      <Tooltip arrow placement="top" title={warning}>
        <WarningAmberIcon color="warning" sx={{ fontSize: 15, flexShrink: 0 }} />
      </Tooltip>
    )}
    </Stack>
  );
}


function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(String(e.target.value))}
      variant="outlined"
      fullWidth
      sx={{
        fontSize: "0.8rem",
        "& .MuiSelect-select": { py: 0, pl: 0, minHeight: "unset" },
        "& .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
      }}
    >
      {options.map((o) => (
        <MenuItem key={o} value={o} sx={{ fontSize: "0.8rem" }}>
          {o}
        </MenuItem>
      ))}
    </Select>
  );
}

function StoreSection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const rows = catalog.stores;
  const [more, setMore] = useState<BodyStoreRow | null>(null);

  const save = (row: BodyStoreRow, spec: BodyStoreRow["spec"]) =>
    catalog.patchStore(row.uuid, spec);

  const commit = (row: BodyStoreRow, key: string, next: string) => {
    const spec = { ...row.spec };
    if (next.trim() === "") delete spec[key];
    else spec[key] = next.trim();
    save(row, spec);
  };

  return (
    <SectionBleed scroll>
    <Table size="small">
      <TableHead>
        <TableRow>
          <Head hint={t("httpCat.storeWhereHint")}>{t("httpCat.storeWhere")}</Head>
          <Head width={100} hint={t("httpCat.storeTtlHint")}>ttl=</Head>
          <Head width={110} hint={t("httpCat.storeRetainHint")}>retain_ttl=</Head>
          <Head width={100} hint={t("httpCat.storeMaxHint")}>max=</Head>
          <Head width={48} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.uuid} hover>
            <TableCell sx={cellSx}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                <Box sx={{ fontSize: "0.75rem" }}>redis</Box>
                <Box
                  component="code"
                  sx={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    color: row.url === "" ? "warning.main" : "text.secondary",
                  }}
                >
                  {row.url === "" ? "—" : row.url}
                </Box>
              </Stack>
            </TableCell>
            {(["ttl", "retain_ttl", "max"] as const).map((key) => (
              <TableCell key={key} sx={cellSx}>
                <InlineText
                  value={String(row.spec[key] ?? "")}
                  placeholder={STORE_HINTS[key]}
                  onCommit={(next) => commit(row, key, next)}
                />
              </TableCell>
            ))}
            <TableCell sx={actionCellSx}>
              <TableIconButton
                icon={<SettingsOutlinedIcon sx={{ fontSize: 16 }} />}
                tooltip={t("httpCat.storeMoreHint")}
                aria-label={t("httpCat.storeMore")}
                onClick={() => setMore(row)}
              />
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} sx={cellSx}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => catalog.addStore()}>
                {t("httpCat.storeCreate")}
              </Button>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>

    {more !== null && (
      <StoreDialog
        row={more}
        onClose={() => setMore(null)}
        onApply={(spec) => {
          save(more, spec);
          setMore(null);
        }}
      />
    )}
    </SectionBleed>
  );
}

const STORE_MORE = ["pool", "connect_timeout", "op_timeout", "reconnect_wait", "db"] as const;

const STORE_MORE_HINT: Record<(typeof STORE_MORE)[number], string> = {
  pool: "httpCat.storePoolHint",
  connect_timeout: "httpCat.storeConnectHint",
  op_timeout: "httpCat.storeOpHint",
  reconnect_wait: "httpCat.storeReconnectHint",
  db: "httpCat.storeDbHint",
};

function storeLine(row: BodyStoreRow, spec: BodyStoreRow["spec"]): string {
  const parts = ["driver=redis", `url=${row.url === "" ? "?" : row.url}`];
  for (const [key, value] of Object.entries(spec)) {
    parts.push(`${key}=${value}`);
  }
  return `waf_store ${parts.join(" ")};`;
}

function StoreDialog({
  row,
  onClose,
  onApply,
}: {
  row: BodyStoreRow;
  onClose: () => void;
  onApply: (spec: BodyStoreRow["spec"]) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<BodyStoreRow["spec"]>(row.spec);

  const patch = (key: string, next: string) => {
    const spec = { ...draft };
    if (next.trim() === "") delete spec[key];
    else spec[key] = next.trim();
    setDraft(spec);
  };

  const fieldSx = { "& .MuiInputBase-input": { fontSize: "0.85rem" } } as const;

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={t("httpCat.storeDialog")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(draft)}>
            {t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2.5}>
          {STORE_MORE.map((key) => (
            <TextField
              key={key}
              size="small"
              label={`${key}=`}
              value={String(draft[key] ?? "")}
              helperText={t(STORE_MORE_HINT[key])}
              sx={fieldSx}
              onChange={(e) => patch(key, e.target.value)}
            />
          ))}

          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              px: 1.5,
              py: 1,
              bgcolor: "background.default",
            }}
          >
            <Typography
              variant="caption"
              sx={{ display: "block", color: "text.secondary", pb: 0.5 }}
            >
              {t("httpCat.storeLine")}
            </Typography>
            <Box
              component="code"
              sx={{
                display: "block",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {storeLine(row, draft)}
            </Box>
          </Box>
        </Stack>
    </Modal>
  );
}

const STORE_HINTS: Record<string, string> = {
  ttl: "30s",
  retain_ttl: "5m",
  max: "8m",
};

function FormatSection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const rows = catalog.formats;
  const [draft, setDraft] = useState({ name: "", body: "" });
  const nameRef = useRef<HTMLInputElement>(null);
  const ready = draft.name.trim() !== "";
  const create = () => {
    catalog.addFormat({ name: draft.name.trim(), format: draft.body });
    setDraft({ name: "", body: "" });
    nameRef.current?.focus();
  };
  const onKey = draftKey(ready, create);

  const save = (row: LogFormatRow, patch: Partial<Omit<LogFormatRow, "uuid">>) =>
    catalog.patchFormat(row.uuid, patch);

  return (
    <Stack spacing={1}>
      <SectionBleed scroll>
      <Table size="small">
        <TableHead>
          <TableRow>
            <Head width={180} hint={t("httpCat.formatNameHint")}>
              {t("httpCat.name")}
            </Head>
            <Head hint={t("httpCat.formatBodyHint")}>{t("httpCat.body")}</Head>
            <Head width={48} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            return (
              <TableRow key={row.uuid} hover>
                <TableCell sx={cellSx}>
                  <InlineText
                    value={row.name}
                    mono
                    onCommit={(name) => name !== row.name && save(row, { name })}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  <InlineText
                    value={row.format}
                    placeholder="$remote_addr $status"
                    onCommit={(next) => save(row, { format: next })}
                  />
                </TableCell>
                <TableCell sx={actionCellSx}>
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                    tooltip={t("common.delete")}
                    onClick={() => catalog.removeFormat(row.uuid)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell sx={cellSx}>
              <InputBase
                inputRef={nameRef}
                value={draft.name}
                placeholder="main"
                inputProps={{ "aria-label": t("httpCat.name") }}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={onKey}
                sx={{ ...dataInputSx, fontFamily: "monospace" }}
              />
            </TableCell>
            <TableCell sx={cellSx}>
              <InputBase
                value={draft.body}
                placeholder="$remote_addr $status"
                inputProps={{ "aria-label": t("httpCat.body") }}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                onKeyDown={onKey}
                sx={dataInputSx}
              />
            </TableCell>
            <DraftAddCell label={t("common.create")} ready={ready} onAdd={create} />
          </TableRow>
        </TableBody>
      </Table>
      </SectionBleed>
    </Stack>
  );
}

function Head({
  children,
  hint,
  width,
}: {
  children?: React.ReactNode;
  hint?: string;
  width?: number;
}) {
  const cell = (
    <TableCell sx={{ ...headSx, width, minWidth: width }}>{children}</TableCell>
  );
  if (hint === undefined) {
    return cell;
  }
  return (
    <Tooltip arrow placement="top" title={hint}>
      {cell}
    </Tooltip>
  );
}

const NEW_LIST = " new";

function DeclareListRow({
  spare,
  onDeclare,
  onNew,
}: {
  spare: Dataset[];
  onDeclare: (row: Dataset) => void;
  onNew: () => void;
}) {
  const t = useT();
  const [seq, setSeq] = useState(0);

  return (
    <Box sx={{ width: 320 }}>
      <Picker
        key={seq}
        value=""
        placeholder={t("httpCat.declareList")}
        options={[
          ...spare.map((row) => ({
            value: row.name,
            hint: `${row.type} · ${row.active ? "active" : "internal"} · ${row.size}`,
          })),
          { value: NEW_LIST, label: t("httpCat.newList") },
        ]}
        onChange={(picked) => {
          if (picked === "") {
            return;
          }
          setSeq((n) => n + 1);
          if (picked === NEW_LIST) {
            onNew();
            return;
          }
          const row = spare.find((item) => item.name === picked);
          if (row !== undefined) {
            onDeclare(row);
          }
        }}
      />
    </Box>
  );
}

function NewListRow({
  value,
  onValue,
  onCancel,
  sources,
  onCreate,
}: {
  value: string;
  onValue: (next: string) => void;
  onCancel: () => void;
  sources: Dataset[];
  onCreate: (name: string, type: string, copyFrom?: string) => void;
}) {
  const t = useT();
  const [type, setType] = useState("ipv4");
  const [from, setFrom] = useState("");

  const same = sources.filter((r) => r.type === type);

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap" }}
    >
      <TextField
        size="small"
        autoFocus
        placeholder="blocklist"
        label={t("httpCat.name")}
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
      <Box sx={{ width: 130 }}>
        <Picker
          value={type}
          onChange={(next) => {
            if (next !== "") {
              setType(next);
              setFrom("");
            }
          }}
          options={["ipv4", "ip", "string", "numeric"].map((o) => ({ value: o }))}
        />
      </Box>
      <Tooltip arrow title={t("httpCat.copyFromHint")}>
        <Box sx={{ width: 220 }}>
          <Picker
            value={from}
            placeholder={t("httpCat.copyFrom")}
            options={same.map((r) => ({ value: r.name, hint: String(r.size) }))}
            onChange={setFrom}
          />
        </Box>
      </Tooltip>
      <Button size="small" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button
        size="small"
        variant="contained"
        disabled={value.trim() === ""}
        onClick={() =>
          onCreate(
            value.trim(),
            type,
            same.find((r) => r.name === from)?.uuid,
          )
        }
      >
        {t("common.create")}
      </Button>
    </Stack>
  );
}
