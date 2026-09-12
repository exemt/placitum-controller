import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { Form } from "../components/Form.tsx";
import { Flag } from "../components/fields.tsx";
import {
  DataTable,
  RowActionsHead,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import type { Dataset, IpAsn, IpCountry, IpSetMatch, IpSetMeta } from "../api.ts";
import { useT } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  copyIpSetThunk,
  deleteIpSetThunk,
  loadIpSetDetail,
  loadIpSets,
  openPanel,
  saveIpSetThunk,
} from "../store/slices/pages/ip-sets.ts";

const PANEL_WIDTH = 560;

type MatchDraft = {
  lists: string[];
  countries: string[];
  asns: number[];
};

type AsnChoice = { asn: number; label: string };
type ListChoice = { id: string; label: string };

function emptyMatch(): MatchDraft {
  return { lists: [], countries: [], asns: [] };
}

function matchFrom(match: IpSetMatch | undefined): MatchDraft {
  if (match === undefined) {
    return emptyMatch();
  }

  // Поля с провода: пропуск любого из них не должен ронять страницу.
  return {
    lists: (match.lists ?? []).map((list) => list.uuid),
    countries: match.countries ?? [],
    asns: match.asns ?? [],
  };
}

function countryCodes(rows: IpCountry[]): string[] {
  return [...new Set(rows.map((row) => row.code))].sort();
}

function asnChoices(rows: IpAsn[]): AsnChoice[] {
  const names = new Map<number, string>();

  for (const row of rows) {
    if (!names.has(row.asn)) {
      names.set(row.asn, `${row.asn} · ${row.description}`);
    }
  }

  return [...names.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([asn, label]) => ({ asn, label }));
}

function filterAsns(options: AsnChoice[], input: string): AsnChoice[] {
  const q = input.trim().toLowerCase();
  const matched =
    q.length === 0
      ? options
      : options.filter(
          (row) =>
            String(row.asn).includes(q) || row.label.toLowerCase().includes(q),
        );

  return matched.slice(0, 50);
}

function listChoices(rows: Dataset[]): ListChoice[] {
  return rows
    .map((row) => ({
      id: row.uuid,
      label: `${row.name} · ${row.type}${row.active ? " · live" : ""}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function IpSets() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const error = useAppSelector((s) => s.pages.ipSets.error);
  const rows = useAppSelector((s) => s.pages.ipSets.rows);
  const loading = useAppSelector((s) => s.pages.ipSets.loading);
  const panelId = useAppSelector((s) => s.pages.ipSets.panelId);
  const pager = usePager(rows);
  const ops = useRowOps<IpSetMeta>({
    nameOf: (row) => row.name,
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyIpSetThunk({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(deleteIpSetThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => {
      void dispatch(loadIpSets(scope));
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
          <TableCell>{t("ipSetsPage.description")}</TableCell>
          <TableCell align="right">{t("ipSetsPage.lists")}</TableCell>
          <TableCell>{t("ipSetsPage.live")}</TableCell>
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
                void dispatch(loadIpSetDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell align="right">{row.list_count}</TableCell>
              <TableCell>
                {row.live && (
                  <Chip size="small" label={t("ipSetsPage.liveChip")} />
                )}
              </TableCell>
              {ops.cell(row)}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("ipSetsPage.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadIpSets(scope))} />
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
          <IpSetForm
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

function IpSetForm({
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
  const lists = useAppSelector((s) => s.pages.ipSets.lists);
  const countries = useAppSelector((s) => s.pages.ipSets.countries);
  const asns = useAppSelector((s) => s.pages.ipSets.asns);
  const detail = useAppSelector((s) => s.pages.ipSets.detail);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inverse, setInverse] = useState(false);
  const [match, setMatch] = useState<MatchDraft>(() => emptyMatch());
  const [exclude, setExclude] = useState<MatchDraft>(() => emptyMatch());
  const codes = useMemo(() => countryCodes(countries), [countries]);
  const asnOptions = useMemo(() => asnChoices(asns), [asns]);
  const listOptions = useMemo(() => listChoices(lists), [lists]);

  useEffect(() => {
    if (id !== null && detail !== null && detail.uuid === id) {
      setName(detail.name);
      setDescription(detail.description);
      setInverse(detail.inverse === true);
      setMatch(
        matchFrom({
          lists: detail.lists,
          countries: detail.countries,
          asns: detail.asns,
        }),
      );
      setExclude(matchFrom(detail.exclude));
    }
  }, [id, detail]);

  const waiting = id !== null && (detail === null || detail.uuid !== id);
  const nameOk = name.trim() !== "";

  /*
   * Пустой набор не совпадает ни с чем, а inverse от него -- со всем. Кнопка
   * гаснет здесь же, чтобы не ловить это отказом сервера.
   */
  const filled =
    match.lists.length > 0 ||
    match.countries.length > 0 ||
    match.asns.length > 0;

  const live = lists.some(
    (row) => row.active && match.lists.includes(row.uuid),
  );

  return (
    <Form id="ip-set">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("ipSetsPage.newTitle") : t("ipSetsPage.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body spacing={2} scroll>
        <TextField
          size="small"
          label={t("common.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          helperText={t("ipSetsPage.nameHint")}
        />
        <TextField
          size="small"
          label={t("ipSetsPage.description")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {live && <Alert severity="info">{t("ipSetsPage.liveHint")}</Alert>}
        <Flag
          label={t("ipSetsPage.inverse")}
          checked={inverse}
          onChange={setInverse}
          helper={t("ipSetsPage.inverseHint")}
        />
        <MatchEditor
          draft={match}
          codes={codes}
          asnOptions={asnOptions}
          listOptions={listOptions}
          onChange={setMatch}
        />
        <Divider sx={{ pt: 1 }}>{t("ipSetsPage.exclude")}</Divider>
        <Typography variant="caption" color="text.secondary">
          {t("ipSetsPage.excludeHint")}
        </Typography>
        <MatchEditor
          draft={exclude}
          codes={codes}
          asnOptions={asnOptions}
          listOptions={listOptions}
          onChange={setExclude}
        />
        {lists.length === 0 && codes.length === 0 && asnOptions.length === 0 && (
          <Alert severity="info">{t("ipSetsPage.needSources")}</Alert>
        )}
      </Form.Body>
      <Form.Actions>
        {id !== null && (
          <Button
            size="small"
            color="error"
            onClick={() => {
              void dispatch(deleteIpSetThunk({ scope, id }));
            }}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!nameOk || !filled || waiting}
          onClick={() => {
            void dispatch(
              saveIpSetThunk({
                scope,
                id,
                name: name.trim(),
                description,
                inverse,
                match,
                exclude,
              }),
            );
          }}
        >
          {id === null ? t("common.create") : t("common.save")}
        </Button>
      </Form.Actions>
    </Form>
  );
}

function MatchEditor({
  draft,
  codes,
  asnOptions,
  listOptions,
  onChange,
}: {
  draft: MatchDraft;
  codes: string[];
  asnOptions: AsnChoice[];
  listOptions: ListChoice[];
  onChange: (next: MatchDraft) => void;
}) {
  const t = useT();

  return (
    <Stack spacing={2}>
      <Autocomplete
        multiple
        size="small"
        filterSelectedOptions
        options={codes}
        value={draft.countries}
        onChange={(_e, countries) => onChange({ ...draft, countries })}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t("ipSetsPage.countries")}
            helperText={t("ipSetsPage.countriesHint")}
          />
        )}
      />
      <Autocomplete
        multiple
        size="small"
        filterSelectedOptions
        options={asnOptions}
        value={asnOptions.filter((row) => draft.asns.includes(row.asn))}
        onChange={(_e, next) =>
          onChange({ ...draft, asns: next.map((row) => row.asn) })
        }
        getOptionLabel={(row) => row.label}
        isOptionEqualToValue={(a, b) => a.asn === b.asn}
        filterOptions={(options, state) => filterAsns(options, state.inputValue)}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t("ipSetsPage.asns")}
            helperText={t("ipSetsPage.asnsHint")}
          />
        )}
      />
      <Autocomplete
        multiple
        size="small"
        filterSelectedOptions
        options={listOptions}
        value={listOptions.filter((row) => draft.lists.includes(row.id))}
        onChange={(_e, next) =>
          onChange({ ...draft, lists: next.map((row) => row.id) })
        }
        getOptionLabel={(row) => row.label}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t("ipSetsPage.addList")}
            helperText={t("ipSetsPage.listHint")}
          />
        )}
      />
    </Stack>
  );
}
