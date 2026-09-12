/*
 * Редактор `waf_exception`: что делать, когда вердикта нет.
 *
 * Значение ключа -- массив хвостов директивы (`request timeout deny`,
 * `response bus pass response=error`), как у `send` и `archive`. Набирать их
 * руками значит помнить и словарь классов, и порядок слов, поэтому строка
 * показывает сводку, а правится окном: секция на фазу, внутри шесть классов
 * события и страница отказа.
 *
 * Строки чужих фаз окно не трогает: оператор правит фазу запроса, а фаза
 * ответа, записанная выше или соседней секцией, остаётся как была.
 */

import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import { Modal } from "../components/Modal.tsx";
import {
  DialogInput,
  DialogPick,
  DialogSection,
  dialogLabelSx,
} from "../components/dialog-kit.tsx";
import { TableIconButton } from "../components/data-table/index.ts";
import { useT, type Translate } from "../i18n/index.ts";

/** Классы события. Порядок -- как в модуле и в docs/directives/list/deadline.md. */
export const EXCEPTION_CLASSES = ["timeout", "absent", "bus", "body", "inspector", "overload"] as const;
export type ExceptionClass = (typeof EXCEPTION_CLASSES)[number];

/** Фазы, у которых своя строка. `frame` задаёт обе стороны сразу. */
const PHASES = ["request", "response", "frame"] as const;
type Phase = (typeof PHASES)[number];

type Policy = "pass" | "deny";

interface Rule {
  policy: Policy;
  response?: string;
}

/** Что действует, когда не сказано ничего: умолчания модуля. */
const DEFAULTS: Record<ExceptionClass, Policy> = {
  timeout: "deny",
  absent: "deny",
  bus: "pass",
  body: "deny",
  inspector: "deny",
  overload: "deny",
};

type Table = Record<Phase, Partial<Record<ExceptionClass, Rule>>>;

function emptyTable(): Table {
  return { request: {}, response: {}, frame: {} };
}

function linesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

/*
 * Разбор хвостов в таблицу. Строка без класса задаёт все шесть -- так её
 * понимает и модуль; обратно она соберётся тем же одним словом, если у всех
 * классов фазы совпали и политика, и страница.
 */
export function parseException(value: unknown): { table: Table; rest: string[] } {
  const table = emptyTable();
  const rest: string[] = [];

  for (const line of linesOf(value)) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    const phase = words.shift();

    if (phase === undefined || !(PHASES as readonly string[]).includes(phase)) {
      rest.push(line);
      continue;
    }

    let classes: readonly ExceptionClass[] = EXCEPTION_CLASSES;

    if (words.length > 0 && (EXCEPTION_CLASSES as readonly string[]).includes(words[0]!)) {
      classes = [words.shift() as ExceptionClass];
    }

    const policy = words.shift();

    if (policy !== "pass" && policy !== "deny") {
      rest.push(line);
      continue;
    }

    let response: string | undefined;

    for (const word of words) {
      if (word.startsWith("response=")) response = word.slice("response=".length);
    }

    for (const cls of classes) {
      table[phase as Phase][cls] = { policy, response };
    }
  }

  return { table, rest };
}

/** Обратно в хвосты: класс за классом, фазы в порядке словаря. */
export function formatException(table: Table, rest: string[]): string[] {
  const out = [...rest];

  for (const phase of PHASES) {
    const rules = table[phase];
    const named = EXCEPTION_CLASSES.filter((cls) => rules[cls] !== undefined);

    if (named.length === 0) continue;

    const first = rules[named[0]!]!;
    const same =
      named.length === EXCEPTION_CLASSES.length &&
      named.every(
        (cls) =>
          rules[cls]!.policy === first.policy && (rules[cls]!.response ?? "") === (first.response ?? ""),
      );

    /* Все пять одинаковы -- одна строка без класса, как её пишут руками. */
    if (same) {
      out.push(tail(phase, undefined, first));
      continue;
    }

    for (const cls of named) out.push(tail(phase, cls, rules[cls]!));
  }

  return out;
}

function tail(phase: Phase, cls: ExceptionClass | undefined, rule: Rule): string {
  const page = rule.policy === "deny" && rule.response ? ` response=${rule.response}` : "";
  return `${phase}${cls ? ` ${cls}` : ""} ${rule.policy}${page}`;
}

/** Сводка в строке настроек: только то, что задано, и только словами. */
export function exceptionSummary(t: Translate, value: unknown): string {
  const { table } = parseException(value);
  const parts: string[] = [];

  for (const phase of PHASES) {
    for (const cls of EXCEPTION_CLASSES) {
      const rule = table[phase][cls];
      if (rule === undefined) continue;

      const where = phase === "request" ? "" : `${t(`tail.phase.${phase}`)} `;
      const page = rule.response ? ` → ${rule.response}` : "";
      parts.push(`${where}${t(`exception.class.${cls}`)} ${t(`exception.${rule.policy}`)}${page}`);
    }
  }

  return parts.join(" · ");
}

export function ExceptionEdit({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const summary = exceptionSummary(t, value);

  return (
    <>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
        <Typography
          sx={{
            ...dialogLabelSx,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: summary === "" ? "text.disabled" : "text.primary",
          }}
        >
          {summary === "" ? t("exception.none") : summary}
        </Typography>
        <TableIconButton
          icon={<SettingsOutlinedIcon />}
          tooltip={t("exception.edit")}
          aria-label={t("exception.edit")}
          onClick={() => setOpen(true)}
        />
      </Stack>
      {open && (
        <ExceptionDialog
          t={t}
          value={value}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ExceptionDialog({
  t,
  value,
  onClose,
  onApply,
}: {
  t: Translate;
  value: unknown;
  onClose: () => void;
  onApply: (next: string[]) => void;
}) {
  const parsed = parseException(value);
  const [table, setTable] = useState<Table>(parsed.table);

  const put = (phase: Phase, cls: ExceptionClass, rule: Rule | undefined) => {
    setTable((prev) => {
      const rules = { ...prev[phase] };
      if (rule === undefined) delete rules[cls];
      else rules[cls] = rule;
      return { ...prev, [phase]: rules };
    });
  };

  return (
    <Modal
      onClose={onClose}
      title={t("exception.title")}
      hint={t("exception.hint")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(formatException(table, parsed.rest))}>
            {t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.25}>
        {PHASES.map((phase) => (
          <DialogSection
            key={phase}
            title={t(`tail.phase.${phase}`)}
            hint={t(`exception.phase.${phase}`)}
            summary={phaseSummary(t, table[phase])}
            defaultOpen={phase === "request"}
          >
            <Stack spacing={0.75}>
              {EXCEPTION_CLASSES.map((cls) => {
                const rule = table[phase][cls];
                const picked = rule?.policy ?? "";

                return (
                  <Box key={cls}>
                    <DialogPick
                      label={t(`exception.class.${cls}`)}
                      hint={t(`exception.classHint.${cls}`)}
                      value={picked}
                      options={[
                        { value: "", label: t(`exception.inherit.${DEFAULTS[cls]}`) },
                        { value: "pass", label: t("exception.pass") },
                        { value: "deny", label: t("exception.deny") },
                      ]}
                      onChange={(next) =>
                        put(
                          phase,
                          cls,
                          next === ""
                            ? undefined
                            : { policy: next as Policy, response: rule?.response },
                        )
                      }
                    />
                    {/*
                      Страница -- только у отказа: пропущенному запросу
                      отвечать нечем, и модуль такую строку не примет.
                    */}
                    {picked === "deny" && (
                      <DialogInput
                        label={t("exception.response")}
                        hint={t("exception.responseHint")}
                        value={rule?.response ?? ""}
                        placeholder={t("exception.responseNone")}
                        onChange={(next) =>
                          put(phase, cls, {
                            policy: "deny",
                            response: next.trim() === "" ? undefined : next.trim(),
                          })
                        }
                      />
                    )}
                  </Box>
                );
              })}
            </Stack>
          </DialogSection>
        ))}
      </Stack>
    </Modal>
  );
}

function phaseSummary(t: Translate, rules: Partial<Record<ExceptionClass, Rule>>): string {
  const named = EXCEPTION_CLASSES.filter((cls) => rules[cls] !== undefined);
  if (named.length === 0) return t("exception.none");

  return named
    .map((cls) => `${t(`exception.class.${cls}`)} ${t(`exception.${rules[cls]!.policy}`)}`)
    .join(" · ");
}
