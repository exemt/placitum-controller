import { useEffect, useState } from "react";
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
  type DatasetMode,
  type DatasetType,
  type DenyResponseRow,
  type DenyResponseUse,
  type LogFormatRow,
} from "../api.ts";
import { errorMessage } from "../errors.ts";
import { isNewRow, type CatalogDraft, type NewList } from "./catalog-draft.tsx";
import {
  dataActionCellSx,
  dataCellSx,
  dataHeadSx,
  dataInputSx,
} from "../components/settings-table.tsx";
import { SectionBleed } from "../components/settings-table.tsx";
import { Modal } from "../components/Modal.tsx";
import { TableIconButton } from "../components/data-table/index.ts";
import { HintMarkup } from "../components/fields.tsx";
import {
  DialogAlert,
  DialogInput,
  DialogLines,
  DialogPick,
  DialogRow,
  DialogSelect,
  DialogText,
  dialogInputSx,
  type DialogOption,
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
      {catalog.error !== null && (
        <Alert severity="error">{errorMessage(t, catalog.error)}</Alert>
      )}

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
  const [addOpen, setAddOpen] = useState(false);

  const rows = catalog.lists;
  const declared = rows.filter((row) => row.in_nginx !== false);
  const users = declared.filter((row) => row.auth_users === true);

  const save = (row: Dataset, patch: Parameters<CatalogDraft["patchList"]>[1]) =>
    catalog.patchList(row.uuid, patch);

  return (
    <Stack spacing={1}>
      {users.length > 0 && (
        <Alert severity="warning">
          {t("httpCat.listUsersDeclared", { lists: users.map((row) => row.name).join(", ") })}
        </Alert>
      )}
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
            <TableCell sx={{ ...headSx, width: 48, textAlign: "right" }}>
              <TableIconButton
                color="success"
                icon={<AddIcon sx={{ fontSize: 16 }} />}
                tooltip={t("httpCat.listAdd")}
                onClick={() => setAddOpen(true)}
              />
            </TableCell>
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
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>
                <Tooltip arrow placement="top" title={t(`datasets.types.${row.type}`)}>
                  <Box component="span">{directiveType(row.type)}</Box>
                </Tooltip>
              </TableCell>
              <TableCell sx={cellSx}>
                <Tooltip arrow placement="top" title={t(modeHint(row.active))}>
                  <Box sx={{ color: "text.secondary" }}>{t(modeLabel(row.active))}</Box>
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
      {addOpen && (
        <ListAddDialog
          rows={rows}
          taken={[...rows, ...catalog.pages].map((row) => row.name)}
          onClose={() => setAddOpen(false)}
          onDeclare={(row) => {
            save(row, { in_nginx: true });
            setAddOpen(false);
          }}
          onCreate={(input) => {
            catalog.addList(input);
            setAddOpen(false);
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
      help="05-protection#страницы-блокировки"
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
  const [creating, setCreating] = useState(false);

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
              <Button size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
                {t("httpCat.storeCreate")}
              </Button>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>

    {creating && (
      <StoreAddDialog
        onClose={() => setCreating(false)}
        onCreate={(spec) => {
          catalog.addStore(spec);
          setCreating(false);
        }}
      />
    )}

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

function storeLine(url: string, spec: BodyStoreRow["spec"]): string {
  const parts = ["driver=redis", `url=${url === "" ? "?" : url}`];
  for (const [key, value] of Object.entries(spec)) {
    parts.push(`${key}=${value}`);
  }
  return `waf_store ${parts.join(" ")};`;
}

const STORE_MAIN = ["ttl", "retain_ttl", "max"] as const;

const STORE_MAIN_HINT: Record<(typeof STORE_MAIN)[number], string> = {
  ttl: "httpCat.storeTtlHint",
  retain_ttl: "httpCat.storeRetainHint",
  max: "httpCat.storeMaxHint",
};

function StoreAddDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (spec: BodyStoreRow["spec"]) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Record<(typeof STORE_MAIN)[number], string>>({
    ...STORE_HINTS,
  } as Record<(typeof STORE_MAIN)[number], string>);

  const spec = (): BodyStoreRow["spec"] => {
    const out: BodyStoreRow["spec"] = {};
    for (const key of STORE_MAIN) {
      const value = draft[key].trim();
      if (value !== "") out[key] = value;
    }
    return out;
  };

  const line = storeLine("", spec());

  return (
    <Modal
      onClose={onClose}
      title={t("httpCat.storeAddTitle")}
      help="05-protection#копия-данных"
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onCreate(spec())}>{t("common.create")}</Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.75}>
        {STORE_MAIN.map((key) => (
          <DialogRow key={key} label={`${key}=`} hint={t(STORE_MAIN_HINT[key])}>
            <DialogText
              mono
              width={120}
              value={draft[key]}
              placeholder={STORE_HINTS[key]}
              onChange={(next) => setDraft((prev) => ({ ...prev, [key]: next }))}
            />
          </DialogRow>
        ))}
        <DialogLines title={t("httpCat.storeLine")} lines={[line]} />
      </Stack>
    </Modal>
  );
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
              {storeLine(row.url, draft)}
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
  const [addOpen, setAddOpen] = useState(false);

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
            <TableCell sx={{ ...headSx, width: 48, textAlign: "right" }}>
              <TableIconButton
                color="success"
                icon={<AddIcon sx={{ fontSize: 16 }} />}
                tooltip={t("httpCat.formatAdd")}
                onClick={() => setAddOpen(true)}
              />
            </TableCell>
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
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} sx={{ ...cellSx, color: "text.secondary" }}>
                {t("httpCat.formatsEmpty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </SectionBleed>

      {addOpen && (
        <FormatAddDialog
          taken={rows.map((row) => row.name)}
          onClose={() => setAddOpen(false)}
          onCreate={(input) => {
            catalog.addFormat(input);
            setAddOpen(false);
          }}
        />
      )}
    </Stack>
  );
}

const FORMAT_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function FormatAddDialog({
  taken,
  onClose,
  onCreate,
}: {
  taken: readonly string[];
  onClose: () => void;
  onCreate: (input: { name: string; format: string }) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  const nameBad = trimmedName !== "" && !FORMAT_NAME_RE.test(trimmedName);
  const nameTaken = taken.includes(trimmedName);
  const quoted = trimmedBody.includes("'");
  const ready = trimmedName !== "" && !nameBad && !nameTaken && trimmedBody !== "" && !quoted;

  const notice = nameBad
    ? t("httpCat.formatNameBad")
    : nameTaken
      ? t("httpCat.formatNameTaken")
      : quoted
        ? t("httpCat.formatQuote")
        : null;

  const create = () => {
    if (ready) {
      onCreate({ name: trimmedName, format: trimmedBody });
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={t("httpCat.formatAddTitle")}
      help="09-logs#куда-пишет-nginx"
      dirty={name !== "" || body !== ""}
      notice={notice === null ? null : { severity: "warning", text: notice }}
      onEnter={create}
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
        <DialogRow label={t("httpCat.name")} hint={t("httpCat.formatNameHint")}>
          <DialogText mono value={name} placeholder="main" onChange={setName} />
        </DialogRow>
        <DialogRow label={t("httpCat.body")} hint={t("httpCat.formatBodyHint")}>
          <DialogText
            mono
            width={340}
            value={body}
            placeholder="$remote_addr $status"
            onChange={setBody}
          />
        </DialogRow>
        <DialogLines
          title={t("httpCat.storeLine")}
          lines={[`log_format ${trimmedName === "" ? "?" : trimmedName} '${trimmedBody}';`]}
        />
      </Stack>
    </Modal>
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
    <Tooltip leaveDelay={200} arrow placement="top" title={<HintMarkup text={hint} />}>
      {cell}
    </Tooltip>
  );
}

const LIST_NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

const LIST_TTL_RE = /^[1-9][0-9]*[smhd]?$/i;

const LIST_TYPES: readonly DatasetType[] = ["ipv4", "ip", "string", "numeric"];

function directiveType(type: DatasetType): "cidr" | "string" {
  return type === "ipv4" || type === "ip" ? "cidr" : "string";
}

function modeLabel(active: boolean): string {
  return active ? "httpCat.modeActiveLabel" : "httpCat.modeInternalLabel";
}

function modeHint(active: boolean): string {
  return active ? "httpCat.modeActive" : "httpCat.modeInternal";
}

function listLine(list: {
  name: string;
  type: DatasetType;
  active: boolean;
  limit: number;
  ttl: string;
  hash: boolean;
}): string {
  const parts = [
    `waf_local_dataset ${list.name === "" ? "?" : list.name}`,
    `type=${directiveType(list.type)}`,
    `limit=${String(list.limit)}`,
  ];
  if (list.hash) {
    parts.push("hash=md5");
  }
  if (list.active && list.ttl !== "") {
    parts.push(`ttl=${list.ttl}`);
  }
  parts.push(list.active ? "active" : "internal");
  return `${parts.join(" ")};`;
}

function ListAddDialog({
  rows,
  taken,
  onClose,
  onDeclare,
  onCreate,
}: {
  rows: Dataset[];
  taken: readonly string[];
  onClose: () => void;
  onDeclare: (row: Dataset) => void;
  onCreate: (input: NewList) => void;
}) {
  const t = useT();
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<DatasetType>("ipv4");
  const [mode, setMode] = useState<DatasetMode>("internal");
  const [limit, setLimit] = useState("");
  const [ttl, setTtl] = useState("");
  const [hash, setHash] = useState(false);
  const [from, setFrom] = useState("");

  const spare = rows.filter((row) => row.in_nginx === false && row.auth_users !== true);
  const existing = spare.find((row) => row.uuid === pick);
  const active = mode === "active";
  const hashed = type === "string" && hash;
  const sources = rows.filter(
    (row) =>
      !row.active &&
      !isNewRow(row.uuid) &&
      row.auth_users !== true &&
      row.type === type &&
      (row.hash === true) === hashed,
  );
  const source = active ? undefined : sources.find((row) => row.uuid === from);

  const trimmed = name.trim();
  const limitN = limit.trim() === "" ? 1_000_000 : Number(limit.trim());
  const nameBad = trimmed !== "" && !LIST_NAME_RE.test(trimmed);
  const nameTaken = trimmed !== "" && taken.includes(trimmed);
  const limitBad = !Number.isInteger(limitN) || limitN <= 0;
  const ttlBad = active && ttl.trim() !== "" && !LIST_TTL_RE.test(ttl.trim());
  const ready =
    existing !== undefined ||
    (trimmed !== "" && !nameBad && !nameTaken && !limitBad && !ttlBad);

  const notice =
    existing !== undefined
      ? null
      : nameBad
        ? t("httpCat.listNameBad")
        : nameTaken
          ? t("httpCat.listNameTaken")
          : limitBad
            ? t("httpCat.listLimitBad")
            : ttlBad
              ? t("httpCat.listTtlBad")
              : null;

  const lines =
    existing !== undefined
      ? [
          listLine({
            name: existing.name,
            type: existing.type,
            active: existing.active,
            limit: existing.max_entries,
            ttl: existing.ttl ?? "",
            hash: existing.hash === true,
          }),
          ...(!existing.active && existing.size > 0
            ? [`# ${t("httpCat.listLineEntries", { n: existing.size })}`]
            : []),
        ]
      : [
          listLine({
            name: trimmed,
            type,
            active,
            limit: limitBad ? 1_000_000 : limitN,
            ttl: ttl.trim(),
            hash: hashed,
          }),
          ...(source !== undefined && source.size > 0
            ? [`# ${t("httpCat.listLineCopy", { name: source.name, n: source.size })}`]
            : []),
        ];

  const pickOptions: DialogOption[] = [
    { value: "", label: t("httpCat.listNew"), hint: t("httpCat.listNewHint") },
    ...spare.map((row) => ({
      value: row.uuid,
      label: row.name,
      tag: directiveType(row.type),
      hint: [
        t(row.active ? "datasets.dynamic" : "datasets.static"),
        t("httpCat.listEntries", { n: row.size }),
        row.description,
      ]
        .filter((item) => item !== "")
        .join(" · "),
    })),
  ];

  const sourceOptions: DialogOption[] = [
    { value: "", label: t("httpCat.listStartEmpty") },
    ...sources.map((row) => ({
      value: row.uuid,
      label: row.name,
      hint: t("httpCat.listEntries", { n: row.size }),
    })),
  ];

  const submit = () => {
    if (!ready) {
      return;
    }
    if (existing !== undefined) {
      onDeclare(existing);
      return;
    }
    onCreate({
      name: trimmed,
      type,
      mode,
      limit: limitN,
      ttl: active && ttl.trim() !== "" ? ttl.trim() : undefined,
      hash: hashed,
      copyFrom: source?.uuid,
    });
  };

  return (
    <Modal
      onClose={onClose}
      title={t("httpCat.listAddTitle")}
      help="07-data#списки-в-модуле"
      hint={t("httpCat.listAddHint")}
      dirty={pick !== "" || name !== "" || limit !== "" || ttl !== "" || from !== ""}
      notice={notice === null ? null : { severity: "warning", text: notice }}
      onEnter={submit}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.25}>
        {spare.length > 0 && (
          <DialogPick
            mono
            label={t("httpCat.listSource")}
            hint={t("httpCat.listSourceHint")}
            value={pick}
            options={pickOptions}
            onChange={setPick}
          />
        )}
        {existing !== undefined ? (
          <DialogAlert
            text={
              existing.active
                ? t("httpCat.listTakeDynamic")
                : t("httpCat.listTakeStatic", { n: existing.size })
            }
          />
        ) : (
          <>
            <DialogInput
              label={t("httpCat.name")}
              hint={t("httpCat.listNameHint")}
              placeholder="blocklist"
              value={name}
              error={nameBad || nameTaken}
              onChange={setName}
            />
            <DialogPick
              label={t("datasets.type")}
              hint={t("httpCat.listTypeHint")}
              value={type}
              options={LIST_TYPES.map((item) => ({
                value: item,
                label: t(`datasets.types.${item}`),
                tag: directiveType(item),
              }))}
              onChange={(next) => {
                setType(next);
                setFrom("");
                if (next !== "string") {
                  setHash(false);
                }
              }}
            />
            <DialogPick
              label={t("httpCat.listMode")}
              hint={t("httpCat.listModeNewHint")}
              value={mode}
              options={(["internal", "active"] as const).map((item) => ({
                value: item,
                label: t(modeLabel(item === "active")),
                tag: item,
                hint: t(modeHint(item === "active")),
              }))}
              onChange={(next) => {
                setMode(next);
                setFrom("");
              }}
            />
            <DialogInput
              label="limit="
              hint={t("httpCat.listLimitHint")}
              placeholder="1000000"
              value={limit}
              error={limitBad}
              onChange={setLimit}
            />
            {active && (
              <DialogInput
                label="ttl="
                hint={t("httpCat.listTtlHint")}
                placeholder="5m"
                value={ttl}
                error={ttlBad}
                onChange={setTtl}
              />
            )}
            {type === "string" && (
              <DialogPick
                mono
                label="hash="
                hint={t("httpCat.listHashNewHint")}
                value={hash ? "md5" : ""}
                options={[
                  { value: "", label: t("httpCat.listHashNone") },
                  { value: "md5", label: "md5" },
                ]}
                onChange={(next) => {
                  setHash(next === "md5");
                  setFrom("");
                }}
              />
            )}
            {!active && (
              <DialogPick
                mono
                label={t("httpCat.listStart")}
                hint={t("httpCat.listStartHint")}
                value={source?.uuid ?? ""}
                options={sourceOptions}
                onChange={setFrom}
              />
            )}
          </>
        )}
        <DialogLines title={t("httpCat.listLine")} lines={lines} />
      </Stack>
    </Modal>
  );
}
