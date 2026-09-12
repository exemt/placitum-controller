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

/**
 * Цена фазы.
 *
 * `wave=` -- обязательная опция `waf_inspect` и задаётся явно:
 * «N стартует, когда предыдущая волна этой фазы завершилась; один номер у
 * нескольких -- параллельно; пустая волна пропускается»
 * ([docs/directives/list/inspect.md](../../../../docs/directives/list/inspect.md)).
 *
 * Волны идут последовательно, инспекторы внутри волны -- параллельно, поэтому
 * бюджет фазы это сумма максимумов по волнам. Больше `waf_deadline` -- часть
 * инспекторов гарантированно не успеет.
 *
 * Картинки волн у секции нет: набор редактируется таблицей, имена уже
 * перечислены в ней, и повторять их фишками значит показывать один список
 * дважды. Остаётся строка цены -- её таблица не считает.
 *
 * Второе число строки -- сам `waf_deadline`, и правится оно здесь же
 * ([BudgetEdit]): цена набора и потолок читаются вместе, а расходятся они
 * ровно в тот момент, когда в таблицу добавили строку. Отправлять оператора
 * за потолком в окно «Дополнительные параметры» -- значит уводить его от
 * числа, которое он только что увидел.
 */

export interface WaveRow {
  name: string;
  wave: number;
  timeoutMs?: number;
  passive?: boolean;
}

function waveOf(row: WaveRow): number {
  return Number.isInteger(row.wave) && row.wave >= 0 ? row.wave : 0;
}

/** Волны последовательны, инспекторы внутри волны -- нет: сумма максимумов. */
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

/**
 * Откуда приехал действующий бюджет, пока ключа на этом уровне нет.
 * `request` -- у фазы ответа и кадров нет своей строки, и они берут бюджет
 * запроса (docs/directives/list/deadline.md).
 */
export type BudgetFrom = "http" | "server" | "module" | "request";

/**
 * Бюджет как настройка: где он записан и чем его правят.
 *
 * Ключ живёт по тем же трём состояниям, что все решения маршрута
 * (`config/inherit.ts`): записан здесь -- значение своё, не записан --
 * приехало сверху либо это умолчание модуля. Снятого состояния у бюджета нет:
 * `waf_deadline` не выключается, у него всегда есть действующее значение.
 */
export interface BudgetEdit {
  /** Ключ фазы записан на этом уровне: значение своё, и его есть куда вернуть. */
  own: boolean;
  /** Источник действующего значения, пока своего ключа нет. */
  from?: BudgetFrom;
  set: (ms: number) => void;
  drop: () => void;
}

/** Потолок поля: больше десяти минут -- это уже не бюджет фазы, а опечатка. */
const MAX_MS = 600000;

/** Цена фазы одной строкой: сколько набор стоит и сколько ему отпущено. */
export function WaveBudget({
  rows,
  deadlineMs,
  edit,
}: {
  rows: WaveRow[];
  /** Бюджет фазы: `waf_deadline`, действующий на этом маршруте. */
  deadlineMs?: number;
  /** Правка бюджета на месте. Нет ключа -- строка только показывает. */
  edit?: BudgetEdit;
}) {
  const t = useT();
  const budget = useMemo(() => waveBudget(rows), [rows]);
  const over = deadlineMs !== undefined && budget > deadlineMs;

  /*
   * Черновик поля: `null` -- поле закрыто и на его месте стоит значение.
   *
   * Правка идёт по карандашу, а не полем, открытым всегда: строка цены -- это
   * подпись под таблицей, и поле ввода в ней читалось бы ещё одной ячейкой.
   * У строк решений (`InheritedRow`) наоборот -- там редактор открыт всегда,
   * потому что вся строка и есть настройка.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft?.trim() ?? "";
  const ms = Number(typed);
  const ok = /^\d+$/.test(typed) && ms > 0 && ms <= MAX_MS;

  /** Уход из поля: годное число записываем, поле закрываем в любом случае. */
  const leave = () => {
    if (ok) {
      edit?.set(ms);
    }
    setDraft(null);
  };

  /*
   * Enter записывает и закрывает -- но только годное число: набранное
   * «2000500» после него остаётся в поле красным, а не исчезает молча. Уход
   * из поля и Escape черновик выбрасывают: не дописал -- не записал.
   */
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
            // Приглушено, пока значение чужое: та же разница между «задано
            // здесь» и «пришло сверху», что у строк решений.
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
            /*
             * Клавиша не уходит выше поля: Escape в карточке маршрута
             * закрывает саму карточку (штатный Modal), и «передумал править
             * бюджет» уносило вместе с ней все несохранённые правки.
             */
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
            // Негодное значение видно сразу: по уходу из поля оно не запишется.
            borderColor: ok ? "divider" : "error.main",
            "& .MuiInputBase-input": { p: 0, textAlign: "right" },
          }}
        />
      )}
      <Typography variant="caption" color="text.secondary">
        {t("waves.ms")}
      </Typography>
      {/*
        Откуда приехало унаследованное -- той же скобкой, что у строк решений
        и у снимка: `(http)`, `(умолчание)`, `(как у запроса)`.
      */}
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
      {/*
        Вернуть наследование можно только там, где ключ записан здесь: у
        унаследованного значения возвращать нечего.
      */}
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
