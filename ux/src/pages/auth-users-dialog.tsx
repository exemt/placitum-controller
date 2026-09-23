import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import AddIcon from "@mui/icons-material/Add";

import type { Address } from "../api.ts";
import { Modal } from "../components/Modal.tsx";
import {
  DataTable,
  FilterText,
  TableIconButton,
  rowActionsWidth,
  usePager,
  useRowOps,
} from "../components/data-table/index.ts";
import { thunkError } from "../errors.ts";
import { useT } from "../i18n/index.ts";
import { onFormOpen, useModal } from "../store/forms.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  addAuthUser,
  loadAuthUsers,
  removeAuthUser,
} from "../store/slices/pages/auth.ts";

export const FORM_AUTH_USERS = "auth-users";
export const FORM_AUTH_USER_ADD = "auth-user-add";

export type AuthUsersPayload = {
  scope: string;
  datasetId: string;
  name: string;
};

const BODY_H = 380;

type UserRow = {
  id: string;
  login: string;
  groups: string[];
  totp: boolean;
  off: boolean;
  ok: boolean;
  raw: string;
};

function parseUser(row: Address): UserRow {
  const value = row.address.trim();
  const off = value.startsWith("#");
  const parts = (off ? value.slice(1).trim() : value).split(":");

  return {
    id: row.uuid,
    login: parts[0] ?? value,
    groups: (parts[2] ?? "").split(",").filter((item) => item !== ""),
    totp: (parts[3] ?? "") !== "",
    off,
    ok: parts.length >= 2 && (parts[1] ?? "").startsWith("$2"),
    raw: value,
  };
}

export function AuthUsersDialog() {
  const t = useT();
  const dispatch = useAppDispatch();
  const modal = useModal<AuthUsersPayload>(FORM_AUTH_USERS);
  const { open, payload } = modal;
  const openAdd = onFormOpen(FORM_AUTH_USER_ADD);
  const users = useAppSelector((s) => s.pages.auth.users);
  const usersListId = useAppSelector((s) => s.pages.auth.usersListId);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || payload === undefined) {
      return;
    }
    void dispatch(
      loadAuthUsers({ scope: payload.scope, datasetId: payload.datasetId }),
    );
  }, [dispatch, open, payload]);

  useEffect(() => {
    if (open) {
      setQuery("");
    }
  }, [open]);

  const mine = payload !== undefined && usersListId === payload.datasetId;
  const rows = useMemo(
    () => (mine ? users.map(parseUser) : []),
    [mine, users],
  );

  const searching = query.trim() !== "";
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return rows;
    }
    return rows.filter(
      (row) =>
        row.login.toLowerCase().includes(needle) ||
        row.groups.some((group) => group.toLowerCase().includes(needle)),
    );
  }, [rows, query]);

  const pager = usePager(filtered);
  const { setPage } = pager;

  const ops = useRowOps<UserRow>({
    nameOf: (row) => (row.ok ? row.login : row.raw),
    remove:
      payload === undefined
        ? undefined
        : async (row) =>
            thunkError(
              await dispatch(
                removeAuthUser({
                  scope: payload.scope,
                  datasetId: payload.datasetId,
                  addressId: row.id,
                }),
              ),
            ),
  });

  return (
    <>
      <Modal
        id={FORM_AUTH_USERS}
        title={t("auth.users")}
        help="06-auth#вход-через-waf"
        label={payload?.name}
        size="md"
        spacing={0}
        flush
        scroll={false}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: BODY_H }}>
          <DataTable loading={open && payload !== undefined && !mine}>
            <DataTable.Head>
              <FilterText
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(0);
                }}
                placeholder={t("auth.login")}
                clearable
              />
              <TableCell>{t("auth.groups")}</TableCell>
              <TableCell
                sx={{ width: rowActionsWidth(0), minWidth: rowActionsWidth(0), py: 0.5 }}
              >
                <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                  <TableIconButton
                    color="success"
                    icon={<AddIcon />}
                    tooltip={t("auth.userAddTitle")}
                    disabled={payload === undefined}
                    onClick={() => openAdd(payload)}
                  />
                </Stack>
              </TableCell>
            </DataTable.Head>
            <DataTable.Body>
              {pager.rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell
                    sx={{
                      fontFamily: row.ok ? undefined : "monospace",
                      color: row.ok ? undefined : "warning.main",
                      textDecoration: row.off ? "line-through" : undefined,
                    }}
                  >
                    {row.ok ? row.login : row.raw}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      {row.groups.map((group) => (
                        <Chip
                          key={group}
                          size="small"
                          variant="outlined"
                          label={group}
                        />
                      ))}
                      {row.totp && (
                        <Chip size="small" variant="outlined" label="TOTP" />
                      )}
                    </Stack>
                  </TableCell>
                  {ops.cell(row)}
                </TableRow>
              ))}
            </DataTable.Body>
            <DataTable.Empty
              kind={searching ? "none" : "empty"}
              message={searching ? t("table.none") : t("auth.usersEmpty")}
              actionLabel={searching ? undefined : t("common.add")}
              onAction={
                searching || payload === undefined
                  ? undefined
                  : () => openAdd(payload)
              }
            />
            <DataTable.Pager pager={pager} />
          </DataTable>
        </Box>
      </Modal>
      {ops.modals}
      <AuthUserAddDialog />
    </>
  );
}

function AuthUserAddDialog() {
  const t = useT();
  const dispatch = useAppDispatch();
  const modal = useModal<AuthUsersPayload>(FORM_AUTH_USER_ADD);
  const { open, payload, busy } = modal;
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [groups, setGroups] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setLogin("");
    setPassword("");
    setGroups("");
  }, [open]);

  const ready =
    payload !== undefined && login.trim() !== "" && password.length >= 8 && !busy;

  const submit = () => {
    if (payload === undefined) {
      return;
    }
    void modal.submit(async () => {
      await dispatch(
        addAuthUser({
          scope: payload.scope,
          datasetId: payload.datasetId,
          login: login.trim(),
          password,
          groups: groups
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== ""),
        }),
      ).unwrap();
    });
  };

  return (
    <Modal
      id={FORM_AUTH_USER_ADD}
      title={t("auth.userAddTitle")}
      label={payload?.name}
      size="xs"
      dirty={login.trim() !== "" || password !== "" || groups.trim() !== ""}
      onEnter={() => {
        if (ready) {
          submit();
        }
      }}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <TextField
        size="small"
        autoFocus
        label={t("auth.login")}
        value={login}
        onChange={(e) => setLogin(e.target.value)}
      />
      <TextField
        size="small"
        type="password"
        label={t("auth.password")}
        helperText={t("auth.passwordHint")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        size="small"
        label={t("auth.groups")}
        helperText={t("auth.groupsHint")}
        value={groups}
        onChange={(e) => setGroups(e.target.value)}
      />
    </Modal>
  );
}
