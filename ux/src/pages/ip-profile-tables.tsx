import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";

import { TableNoticeRow } from "../components/data-table/index.ts";
import { BLEED, HeadCell, TableCols, flushTableSx } from "../components/table-block.tsx";
import { ACTIONS_W, AddCell, RowActions, TextCell } from "../components/rules-table.tsx";
import { GRIP_W, GripCell, dragSx, moveTo, useRowDrag } from "../components/row-drag.tsx";
import type { IpRuleInput, IpSetMeta } from "../api.ts";
import { useT, type Translate } from "../i18n/index.ts";
import { verbOf } from "./ip-profile-rule.ts";
import type { IpOutcomeInput } from "../api.ts";

export type RuleDraft = IpRuleInput & { key: string };

function setName(sets: IpSetMeta[], id: string): string {
  return sets.find((row) => row.uuid === id)?.name ?? id;
}

function ruleWhen(
  t: Translate,
  datasets: { uuid: string; name: string }[],
  rule: RuleDraft,
): string {
  const name =
    datasets.find((row) => row.uuid === rule.dataset)?.name
    ?? rule.dataset
    ?? "";

  return rule.not === true ? t("ipProfiles.notSetShort", { name }) : name;
}

function targetOf(
  t: Translate,
  rule: RuleDraft,
  live: { uuid: string; name: string }[],
): string {
  if (rule.action === "list") {
    return live.find((row) => row.uuid === rule.list)?.name ?? rule.list ?? "";
  }

  return (rule.to ?? "") === "" ? t("ipProfiles.toAll") : (rule.to as string);
}

function summaryOf(t: Translate, rule: RuleDraft): string {
  const parts: string[] = [];

  if (rule.action === "list") {
    parts.push(t(`outcomes.writes.${rule.write ?? "addr"}`));

    if ((rule.ttl ?? 0) > 0) {
      parts.push(t("ipProfiles.ttlShort", { n: String(rule.ttl) }));
    }

    return parts.join(" · ");
  }

  if (rule.action === "deny" && (rule.response ?? "") !== "") {
    parts.push(rule.response as string);
  }

  if (rule.action === "request") {
    if ((rule.apply ?? "request") !== "request") {
      parts.push(t(`actions.axes.${rule.apply}`));
    }

    if (rule.delta !== null && rule.delta !== undefined) {
      parts.push(t("ipProfiles.amountShort.delta", { n: String(rule.delta) }));
    }

    if (rule.value !== null && rule.value !== undefined) {
      parts.push(
        rule.do === "score"
          ? t("actions.score.summary", { n: `${rule.value > 0 ? "+" : ""}${rule.value}` })
          : t("ipProfiles.amountShort.value", { n: String(rule.value) }),
      );
    }

    if ((rule.marker ?? "") !== "") {
      parts.push(rule.marker as string);
    }
  }

  if ((rule.code ?? "") !== "") {
    parts.push(rule.code as string);
  }

  return parts.join(" · ");
}

const WHITE_COLS = [undefined, ACTIONS_W] as const;
const BLACK_COLS = [GRIP_W, undefined, 200, ACTIONS_W] as const;
const RULES_COLS = [GRIP_W, undefined, 120, 160, 170, ACTIONS_W] as const;

export function WhiteTable({
  rules,
  sets,
  onAdd,
  onEdit,
  onRemove,
}: {
  rules: RuleDraft[];
  sets: IpSetMeta[];
  onAdd: () => void;
  onEdit: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const t = useT();

  return (
    <Table size="small" sx={flushTableSx}>
      <TableCols widths={WHITE_COLS} />
      <TableHead>
        <TableRow>
          <HeadCell label={t("ipProfiles.set")} />
          <AddCell label={t("ipProfiles.add.white")} onAdd={onAdd} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rules.length === 0 && (
          <TableNoticeRow colSpan={2} kind="empty" message={t("ipProfiles.whiteEmpty")} />
        )}
        {rules.map((rule) => (
          <TableRow key={rule.key} hover>
            <TextCell text={setName(sets, rule.set ?? "")} />
            <RowActions
              onEdit={() => onEdit(rule.key)}
              onRemove={() => onRemove(rule.key)}
            />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function BlackTable({
  rules,
  sets,
  onAdd,
  onEdit,
  onReorder,
  onRemove,
}: {
  rules: RuleDraft[];
  sets: IpSetMeta[];
  onAdd: () => void;
  onEdit: (key: string) => void;
  onReorder: (keys: string[]) => void;
  onRemove: (key: string) => void;
}) {
  const t = useT();
  const drag = useRowDrag(rules.length, (from, to) =>
    onReorder(moveTo(rules, from, to).map((row) => row.key)),
  );

  return (
    <Table
      size="small"
      sx={{ ...flushTableSx, userSelect: drag.drag === null ? "auto" : "none" }}
    >
      <TableCols widths={BLACK_COLS} />
      <TableHead>
        <TableRow>
          <HeadCell label={t("ipProfiles.set")} colSpan={2} />
          <HeadCell label={t("ipProfiles.params")} />
          <AddCell label={t("ipProfiles.add.black")} onAdd={onAdd} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rules.length === 0 && (
          <TableNoticeRow colSpan={4} kind="empty" message={t("ipProfiles.blackEmpty")} />
        )}
        {rules.map((rule, index) => (
          <TableRow key={rule.key} data-rule="" hover sx={dragSx(drag, index)}>
            <GripCell index={index} drag={drag} title={t("ipProfiles.drag")} width={GRIP_W} />
            <TextCell text={setName(sets, rule.set ?? "")} />
            <TextCell text={summaryOf(t, rule)} muted />
            <RowActions
              onEdit={() => onEdit(rule.key)}
              onRemove={() => onRemove(rule.key)}
            />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const DATASET_COLS = [undefined, 120, ACTIONS_W] as const;

export function DatasetTable({
  datasets,
  declarable,
  onAdd,
  onRemove,
}: {
  datasets: { uuid: string; name: string; active: boolean }[];
  declarable: { uuid: string; name: string; active: boolean }[];
  onAdd: (uuid: string) => void;
  onRemove: (uuid: string) => void;
}) {
  const t = useT();

  return (
    <>
      <Table size="small" sx={flushTableSx}>
        <TableCols widths={DATASET_COLS} />
        <TableHead>
          <TableRow>
            <HeadCell label={t("ipProfiles.list")} />
            <HeadCell label={t("ipProfiles.listKind")} />
            <HeadCell label="" />
          </TableRow>
        </TableHead>
        <TableBody>
          {datasets.length === 0 && (
            <TableNoticeRow
              colSpan={3}
              kind="empty"
              message={t("ipProfiles.datasetsEmpty")}
            />
          )}
          {datasets.map((row) => (
            <TableRow key={row.uuid} hover>
              <TextCell text={row.name} />
              <TextCell
                text={t(
                  row.active ? "ipProfiles.listLive" : "ipProfiles.listStatic",
                )}
                muted
              />
              <RowActions onRemove={() => onRemove(row.uuid)} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {declarable.length > 0 && (
        <Box sx={{ px: BLEED, py: 1.25 }}>
          <TextField
            select
            size="small"
            fullWidth
            label={t("ipProfiles.addList")}
            value=""
            onChange={(event) => {
              if (event.target.value !== "") {
                onAdd(event.target.value);
              }
            }}
            slotProps={{
              inputLabel: { shrink: true },
              select: {
                displayEmpty: true,
                renderValue: () => (
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {t("ipProfiles.chooseList")}
                  </Box>
                ),
              },
            }}
          >
            <MenuItem value="" disabled>
              {t("ipProfiles.chooseList")}
            </MenuItem>
            {declarable.map((row) => (
              <MenuItem key={row.uuid} value={row.uuid}>
                {row.name}
                {row.active ? " · live" : ""}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      )}
    </>
  );
}

export function RulesTable({
  rules,
  outcomes,
  datasets,
  live,
  onAdd,
  onEdit,
  onEditOutcome,
  onReorder,
  onRemove,
  onRemoveOutcome,
}: {
  rules: RuleDraft[];
  outcomes: IpOutcomeInput[];
  datasets: { uuid: string; name: string }[];
  live: { uuid: string; name: string }[];
  onAdd: () => void;
  onEdit: (key: string) => void;
  onEditOutcome: (index: number) => void;
  onReorder: (keys: string[]) => void;
  onRemove: (key: string) => void;
  onRemoveOutcome: (index: number) => void;
}) {
  const t = useT();
  const drag = useRowDrag(rules.length, (from, to) =>
    onReorder(moveTo(rules, from, to).map((row) => row.key)),
  );

  const outcomeWhen = (row: IpOutcomeInput): string =>
    row.on === "overload"
      ? `${t("ipProfiles.triggers.overload")} · ${row.at ?? 100} %`
      : t(`ipProfiles.triggers.${row.on}`);

  const outcomeAsk = (row: IpOutcomeInput): boolean => (row.do ?? "") !== "";

  const outcomeTarget = (row: IpOutcomeInput): string => {
    if (!outcomeAsk(row)) {
      return t("ipProfiles.toDatasetShort");
    }

    return (row.to ?? "") === "" ? t("ipProfiles.toAll") : (row.to as string);
  };

  const outcomeParams = (row: IpOutcomeInput): string => {
    const parts: string[] = [];

    if (outcomeAsk(row)) {
      if ((row.apply ?? "request") !== "request") {
        parts.push(t(`actions.axes.${row.apply}`));
      }

      if (row.delta !== null && row.delta !== undefined) {
        parts.push(t("ipProfiles.amountShort.delta", { n: String(row.delta) }));
      }

      if (row.value !== null && row.value !== undefined) {
        parts.push(
          row.do === "score"
            ? t("actions.score.summary", { n: `${row.value > 0 ? "+" : ""}${row.value}` })
            : t("ipProfiles.amountShort.value", { n: String(row.value) }),
        );
      }

      if ((row.marker ?? "") !== "") {
        parts.push(row.marker as string);
      }
    } else {
      parts.push(live.find((item) => item.uuid === row.list)?.name ?? row.list);
      parts.push(t(`outcomes.writes.${row.write ?? "addr"}`));

      if (row.ttl > 0) {
        parts.push(t("ipProfiles.ttlShort", { n: String(row.ttl) }));
      }
    }

    if (row.code !== "") {
      parts.push(row.code);
    }

    return parts.join(" · ");
  };

  return (
    <Table
      size="small"
      sx={{ ...flushTableSx, userSelect: drag.drag === null ? "auto" : "none" }}
    >
      <TableCols widths={RULES_COLS} />
      <TableHead>
        <TableRow>
          <HeadCell label={t("ipProfiles.trigger")} colSpan={2} />
          <HeadCell label={t("ipProfiles.to")} />
          <HeadCell label={t("ipProfiles.verb")} />
          <HeadCell label={t("ipProfiles.params")} />
          <AddCell label={t("ipProfiles.add.rules")} onAdd={onAdd} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rules.length === 0 && outcomes.length === 0 && (
          <TableNoticeRow colSpan={6} kind="empty" message={t("ipProfiles.rulesEmpty")} />
        )}
        {rules.map((rule, index) => (
          <TableRow key={rule.key} data-rule="" hover sx={dragSx(drag, index)}>
            <GripCell index={index} drag={drag} title={t("ipProfiles.drag")} width={GRIP_W} />
            <TextCell text={ruleWhen(t, datasets, rule)} />
            <TextCell text={targetOf(t, rule, live)} />
            <TextCell text={t(`actions.verbs.${verbOf(rule)}.label`)} />
            <TextCell text={summaryOf(t, rule)} muted />
            <RowActions
              onEdit={() => onEdit(rule.key)}
              onRemove={() => onRemove(rule.key)}
            />
          </TableRow>
        ))}
        {outcomes.map((row, index) => (
          <TableRow key={`o:${index}`} hover>
            <TableCell sx={{ width: GRIP_W }} />
            <TextCell text={outcomeWhen(row)} />
            <TextCell text={outcomeTarget(row)} muted={!outcomeAsk(row)} />
            <TextCell
              text={t(`actions.verbs.${outcomeAsk(row) ? row.do : "list"}.label`)}
            />
            <TextCell text={outcomeParams(row)} muted />
            <RowActions
              onEdit={() => onEditOutcome(index)}
              onRemove={() => onRemoveOutcome(index)}
            />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
