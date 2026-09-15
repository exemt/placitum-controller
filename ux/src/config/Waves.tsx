import { useMemo, useState } from "react";
import Chip from "@mui/material/Chip";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { TableIconButton } from "../components/data-table/index.ts";
import { useT } from "../i18n/index.ts";

export interface WaveRow {
  name: string;
  wave: number;
  timeoutMs?: number;
  passive?: boolean;
}

function waveOf(row: WaveRow): number {
  return Number.isInteger(row.wave) && row.wave >= 0 ? row.wave : 0;
}

export function waveBudget(rows: WaveRow[]): number {
  const worst = new Map<number, number>();
  for (const row of rows) {
    const wave = waveOf(row);
    worst.set(wave, Math.max(worst.get(wave) ?? 0, row.timeoutMs ?? 0));
  }
  let budget = 0;
  for (const ms of worst.values()) {
    budget += ms;
  }
  return budget;
}

export type BudgetFrom = "http" | "server" | "module" | "request";

export interface BudgetEdit {
  own: boolean;
  from?: BudgetFrom;
  set: (ms: number) => void;
  drop: () => void;
}

const MAX_MS = 600000;

export function WaveBudget({
  rows,
  deadlineMs,
  edit,
}: {
  rows: WaveRow[];
  deadlineMs?: number;
  edit?: BudgetEdit;
}) {
  const t = useT();
  const budget = useMemo(() => waveBudget(rows), [rows]);
  const over = deadlineMs !== undefined && budget > deadlineMs;

  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft?.trim() ?? "";
  const ms = Number(typed);
  const ok = /^\d+$/.test(typed) && ms > 0 && ms <= MAX_MS;

  const leave = () => {
    if (ok) {
      edit?.set(ms);
    }
    setDraft(null);
  };

  const commit = () => {
    if (ok) {
      leave();
    }
  };

  return (
    <Stack
      direction="row"
      sx={{ alignItems: "center", gap: 0.75, flexWrap: "wrap", rowGap: 0.5 }}
    >
      <Typography variant="caption" color="text.secondary">
        {t("waves.budget", { budget: String(budget) })}
      </Typography>
      {draft === null ? (
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: edit?.own === true ? "text.primary" : "text.secondary",
          }}
        >
          {deadlineMs === undefined ? "—" : String(deadlineMs)}
        </Typography>
      ) : (
        <InputBase
          autoFocus
          value={draft}
          inputProps={{
            "aria-label": t("waves.edit"),
            inputMode: "numeric",
            title: t("waves.editHint", { max: String(MAX_MS) }),
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={leave}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              commit();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(null);
            }
          }}
          sx={{
            width: 68,
            height: 22,
            px: 0.75,
            fontSize: "0.75rem",
            fontWeight: 600,
            borderRadius: 0.5,
            border: 1,
            borderColor: ok ? "divider" : "error.main",
            "& .MuiInputBase-input": { p: 0, textAlign: "right" },
          }}
        />
      )}
      <Typography variant="caption" color="text.secondary">
        {t("waves.ms")}
      </Typography>
      {edit?.from !== undefined && draft === null && (
        <Tooltip arrow title={t(`inherit.fromHint.${edit.from}`)}>
          <Typography
            component="span"
            sx={{ fontSize: "0.7rem", color: "text.secondary", whiteSpace: "nowrap" }}
          >
            ({t(`inherit.tag.${edit.from}`)})
          </Typography>
        </Tooltip>
      )}
      {edit !== undefined && draft === null && (
        <TableIconButton
          icon={<EditOutlinedIcon />}
          tooltip={t("waves.edit")}
          onClick={() => setDraft(deadlineMs === undefined ? "" : String(deadlineMs))}
        />
      )}
      {edit?.own === true && draft === null && (
        <TableIconButton
          icon={<SettingsBackupRestoreIcon />}
          tooltip={t("inherit.revert")}
          onClick={() => edit.drop()}
        />
      )}
      {over && (
        <Chip
          size="small"
          color="warning"
          icon={<WarningAmberIcon sx={{ fontSize: 14 }} />}
          label={t("waves.over")}
          sx={{ height: 18, fontSize: "0.65rem" }}
        />
      )}
    </Stack>
  );
}
