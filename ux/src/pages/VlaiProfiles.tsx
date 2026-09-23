import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { Form } from "../components/Form.tsx";
import {
  DataTable,
  RowActionsHead,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import { SettingsTable } from "../components/settings-table.tsx";
import { Pick, Section, Text } from "../components/fields.tsx";
import { SignalsBlock } from "../components/signals-block.tsx";
import { OutcomesBlock } from "../components/outcomes-block.tsx";
import {
  fetchActions,
  fetchDatasets,
  verbsFor,
  weakeningVerbs,
  type ActionRegistry,
  type OutcomeRule,
  type VlaiPriorRule,
  type VlaiProfile,
  type VlaiProfileDoc,
} from "../api.ts";
import { verbLabel } from "../components/action-select.tsx";
import ChannelNotice, { pageNoticeSx } from "../components/ChannelNotice.tsx";
import { useT } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  clearSent,
  closePanel,
  copyVlaiProfile,
  loadVlaiProfileDetail,
  loadVlaiProfiles,
  openPanel,
  removeVlaiProfile,
  restoreVlaiProfileThunk,
  saveVlaiProfileThunk,
  sendVlai,
} from "../store/slices/pages/vlai-profiles.ts";

const PANEL_WIDTH = 720;
const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

const emptyDoc = (): VlaiProfileDoc => ({
  description: "",
  overload: "allow",
  trigger: { prior: [] },
  outcomes: [],
});

export default function VlaiProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.vlaiProfiles.rows);
  const loading = useAppSelector((s) => s.pages.vlaiProfiles.loading);
  const error = useAppSelector((s) => s.pages.vlaiProfiles.error);
  const panelId = useAppSelector((s) => s.pages.vlaiProfiles.panelId);
  const sending = useAppSelector((s) => s.pages.vlaiProfiles.sending);
  const sent = useAppSelector((s) => s.pages.vlaiProfiles.sent);
  const pager = usePager(rows);
  const ops = useRowOps<VlaiProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(copyVlaiProfile({ scope: scope ?? "", id: row.uuid, name })),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeVlaiProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => dispatch(openPanel(null)),
    onUpdate: () => void dispatch(loadVlaiProfiles(scope)),
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendVlai(scope));
      }
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
    sendDisabled: sending || scope === null || rows.length === 0,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      <ChannelNotice id="vlai" />
      {error !== null && (
        <Alert severity="error" icon={false} sx={pageNoticeSx}>
          {error}
        </Alert>
      )}
      {sent !== null && (
        <Alert
          severity="success"
          icon={false}
          sx={pageNoticeSx}
          onClose={() => dispatch(clearSent())}
        >
          {t("vlaiProfiles.sentHint")} {sent}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("common.name")}</TableCell>
          <TableCell>{t("vlaiProfiles.overload")}</TableCell>
          <TableCell>{t("vlaiProfiles.description")}</TableCell>
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
                void dispatch(loadVlaiProfileDetail({ scope, id: row.uuid }));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{row.name}</TableCell>
              <TableCell>
                {t(`vlaiProfiles.overloads.${row.doc.overload ?? "allow"}`)}
              </TableCell>
              <TableCell>{row.description}</TableCell>
              {ops.cell(row, {
                remove:
                  row.name === "default" ? t("vlaiProfiles.lockedDelete") : undefined,
              })}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("vlaiProfiles.empty")}
          actionLabel={t("common.create")}
          onAction={() => dispatch(openPanel(null))}
        />
        <DataTable.Error onRetry={() => void dispatch(loadVlaiProfiles(scope))} />
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
          <VlaiProfileForm
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

function VlaiProfileForm({
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
  const detail = useAppSelector((s) => s.pages.vlaiProfiles.detail);
  const inspectors = useAppSelector((s) => s.pages.vlaiProfiles.inspectors);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [doc, setDoc] = useState<VlaiProfileDoc>(emptyDoc);

  const [registry, setRegistry] = useState<ActionRegistry | null>(null);
  const [datasets, setDatasets] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;

    fetchActions()
      .then((reg) => {
        if (alive) {
          setRegistry(reg);
        }
      })
      .catch(() => {
      });

    fetchDatasets(scope)
      .then((rows) => {
        if (alive) {
          setDatasets(
            rows.filter((row) => row.kind === "list" && row.active).map((row) => row.name),
          );
        }
      })
      .catch(() => {
      });

    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    if (id === null || detail === null || detail.uuid !== id) {
      return;
    }

    setName(detail.name);
    setDescription(detail.description);
    setDoc({ ...emptyDoc(), ...detail.doc });
  }, [id, detail]);

  const loaded = id !== null && detail !== null && detail.uuid === id ? detail : null;
  const unknownTargets = loaded?.unknown_targets ?? [];
  const unknownSenders = loaded?.unknown_senders ?? [];
  const senderCodes = loaded?.sender_codes ?? [];

  const patch = (part: Partial<VlaiProfileDoc>) =>
    setDoc((prev) => ({ ...prev, ...part }));

  const nameOk = NAME_RE.test(name);

  const save = () => {
    void dispatch(
      saveVlaiProfileThunk({
        scope,
        id,
        name,
        description,
        doc: { ...doc, description },
      }),
    );
  };

  const isDefault = loaded?.name === "default";
  const banner = loaded?.modified === true ? t("profiles.defaultModified") : undefined;
  const restore =
    id === null
      ? undefined
      : () => {
          void dispatch(restoreVlaiProfileThunk({ scope, id }));
        };

  return (
    <Form id="vlai-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("vlaiProfiles.newTitle") : t("vlaiProfiles.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body
        spacing={2}
        scroll
        banner={banner}
        bannerActionLabel={t("common.restore")}
        onBannerAction={restore}
      >
        <Section
          title={t("vlaiProfiles.sectionProfile")}
          hint={t("vlaiProfiles.sectionProfileHint")}
          help="06-vlai#профиль"
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={isDefault ? t("profiles.defaultNameHint") : t("vlaiProfiles.nameHint")}
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("vlaiProfiles.description")}
              value={description}
              onChange={setDescription}
            />
            <Pick
              label={t("vlaiProfiles.overload")}
              helper={t("vlaiProfiles.overloadHint")}
              value={doc.overload}
              options={[
                { value: "wait", label: t("vlaiProfiles.overloads.wait") },
                { value: "shed", label: t("vlaiProfiles.overloads.shed") },
              ]}
              onChange={(value) =>
                patch({ overload: value as VlaiProfileDoc["overload"] })
              }
            />
          </SettingsTable>
        </Section>

        <Section
          title={t("channel.signals")}
          hint={t("vlaiProfiles.priorHint")}
          flush
          help="06-vlai#что-принимает"
        >
          <SignalsBlock
            help="06-vlai#что-принимает"
            embedded
            hint={t("vlaiProfiles.priorHint")}
            rules={doc.trigger.prior.map((row) => ({ ...row, accept: [...row.accept] }))}
            verbs={verbsFor(registry, "vlai").map((verb) => ({
              value: verb,
              label: verbLabel(t, verb),
            }))}
            weakening={weakeningVerbs(registry)}
            codes={senderCodes}
            unknown={unknownSenders}
            senders={inspectors}
            defaultRule={() => ({
              from: "ip",
              accept: ["threshold"],
              codes: [],
            })}
            onChange={(prior) =>
              patch({
                trigger: {
                  prior: prior.map((row) => ({
                    ...row,
                    accept: row.accept as VlaiPriorRule["accept"],
                  })),
                },
              })
            }
          />
        </Section>

        <Section
          title={t("channel.rules")}
          hint={t("vlaiProfiles.outcomesHint")}
          help="06-vlai#что-говорит-сам"
          flush
          defaultExpanded
        >
          {unknownTargets.length > 0 && (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              {t("vlaiProfiles.unknownTargets")}: {unknownTargets.join(", ")}
            </Alert>
          )}
          <OutcomesBlock
            help="06-vlai#что-говорит-сам"
            hint={t("vlaiProfiles.outcomesHint")}
            outcomes={doc.outcomes}
            datasets={datasets}
            inspectors={inspectors}
            registry={registry}
            ons={["score", "overload"]}
            onChange={(outcomes: OutcomeRule[]) => patch({ outcomes })}
          />
        </Section>

        {registry === null && (
          <Alert severity="warning">{t("vlaiProfiles.noRegistry")}</Alert>
        )}
      </Form.Body>
      <Form.Actions>
        {id !== null && !isDefault && (
          <Button
            color="error"
            onClick={() => void dispatch(removeVlaiProfile({ scope, id }))}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!nameOk} onClick={save}>
          {t("common.save")}
        </Button>
      </Form.Actions>
    </Form>
  );
}
