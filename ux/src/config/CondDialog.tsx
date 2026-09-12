import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import {
  FilterCell,
  FilterSelect,
  TableIconButton,
  TableNoticeRow,
  type FilterOption,
} from "../components/data-table/index.ts";
import { DialogAlert, DialogLines } from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import { flushTableSx, HeadCell, headCellSx } from "../components/table-block.tsx";
import { GRIP_W } from "../components/row-drag.tsx";
import type { Translate } from "../i18n/index.ts";
import { useCatalog } from "./editors.tsx";
import { VariableEdit } from "./VariableEdit.tsx";

/**
 * Условия строки: `if <значение> in|not in <набор>`.
 *
 * Их принимают `waf_inspect`, `waf_local_check` и `waf_local_rate`
 * (`local/ngx_http_waf_select.c`, `ngx_http_waf_cond_parse`), поэтому редактор
 * общий -- один на вызовы инспекторов и правила локального слоя. Несколько
 * условий -- И: строка работает, только если сошлись все.
 *
 * Не колонкой, а отдельным местом: у условия три собственных поля, и в ячейке
 * они прятались бы за многоточием -- при том, что именно от них зависит,
 * работает строка или молчит. В строке таблицы остаётся иконка, по ней видно,
 * есть условия или нет.
 *
 * Наружу выходят два куска. [CondTable] -- сама таблица: ручка `if`, значение,
 * оператор, набор, корзина; черновик держит хозяин, потому что у вызова
 * инспектора условия стоят в одном окне с управлением ([CallDialog] на
 * странице защиты) и сохраняются вместе с ним. [CondDialog] -- то же окно
 * целиком, для правил локального слоя, где условия -- единственное, что в нём
 * правится. Плавающие подписи полей тут не живут: у селектора набора подпись
 * наезжала на «выбрать набор», а поле значения (составной редактор
 * переменной) подписи и вовсе не имело.
 */

/**
 * Раздел справки про условия -- один на оба окна: у вызова инспектора и у
 * правил локального слоя условие устроено одинаково, и объяснено оно в одном
 * месте («Настройка защиты веб-приложений» -> «Условия вызова»).
 */
export const CONDS_HELP = "05-protection#условия-вызова";

export interface Cond {
  /** Переменная nginx или селектор `$waf_request_cookies.sid`. */
  value: string;
  dataset: string;
  /** `not in`. */
  negate?: boolean;
}

/** Хвост строки: то, что окажется в файле после опций директивы. */
export function condTail(conds: Cond[] | undefined): string {
  return (conds ?? [])
    .map((cond) => ` if ${cond.value} ${cond.negate === true ? "not in" : "in"} ${cond.dataset}`)
    .join("");
}

export function asConds(value: unknown): Cond[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: Cond[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const text = typeof rec.value === "string" ? rec.value : "";
    const dataset = typeof rec.dataset === "string" ? rec.dataset : "";
    const row: Cond = { value: text, dataset };
    if (rec.negate === true) {
      row.negate = true;
    }
    rows.push(row);
  }
  return rows;
}

/** Пустой список условий -- отсутствие ключа: строка работает на всяком запросе. */
export function withConds<T extends { conds?: Cond[] }>(row: T, conds: Cond[]): T {
  const next = { ...row };
  if (conds.length === 0) {
    delete next.conds;
  } else {
    next.conds = conds;
  }
  return next;
}

/** Новое условие: путь запроса против набора -- самый частый случай. */
const NEW_COND: Cond = { value: "$uri", dataset: "" };

/**
 * Условия, которые доедут до файла.
 *
 * Недобранное условие не сохраняем: компилятор такую строку не соберёт
 * (`cond_incomplete`), а в форме она выглядела бы рабочей.
 */
export function readyConds(conds: Cond[]): Cond[] {
  return conds.filter((cond) => cond.value.trim() !== "" && cond.dataset !== "");
}

/** Черновик таблицы: пустому списку -- заготовка, её открывают, чтобы завести. */
export function condsDraft(conds: Cond[]): Cond[] {
  return conds.length === 0 ? [NEW_COND] : conds;
}

const OP_OPTIONS: FilterOption<"in" | "not in">[] = [
  { value: "in", label: "in" },
  { value: "not in", label: "not in" },
];

/** Колонка корзины и «+»: одна кнопка, ширины строк правил здесь много. */
const ACTIONS_W = 56;

const frameSx = {
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  bgcolor: "background.default",
  overflow: "hidden",
} as const;

function ActionCell({
  color,
  icon,
  tooltip,
  onClick,
}: {
  color: "success" | "error";
  icon: ReactNode;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <FilterCell width={ACTIONS_W}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <TableIconButton color={color} icon={icon} tooltip={tooltip} onClick={onClick} />
      </Box>
    </FilterCell>
  );
}

/**
 * Таблица условий. Черновик приходит снаружи: у вызова инспектора условия
 * сохраняются вместе с управлением, одной кнопкой окна.
 */
export function CondTable({
  t,
  conds,
  onChange,
}: {
  t: Translate;
  conds: Cond[];
  onChange: (next: Cond[]) => void;
}) {
  const catalog = useCatalog();

  /*
   * Набор -- только объявленный слотом `waf_local_dataset`: наборы
   * ip-компилятора (`in_nginx=false`) и содержимое в конфиг не едут, и условие
   * по ним не собралось бы на ноде.
   */
  const datasets = (catalog?.datasets ?? []).filter(
    (row) => row.kind === "list" && row.in_nginx !== false,
  );
  const names = datasets.map((row) => row.name);

  const datasetOptions = (current: string): FilterOption<string>[] => {
    const options: FilterOption<string>[] = [{ value: "", label: t("cond.pickList") }];
    for (const name of names) {
      options.push({ value: name, label: name });
    }
    // Имя из документа, которого в каталоге нет, не выбрасываем: иначе поле
    // показывало бы пустоту там, где в базе ссылка.
    if (current !== "" && !names.includes(current)) {
      options.push({ value: current, label: `${current} — ${t("cond.notDeclared")}` });
    }
    return options;
  };

  const patch = (index: number, edit: (row: Cond) => void) =>
    onChange(
      conds.map((item, i) => {
        if (i !== index) {
          return item;
        }
        const next = { ...item };
        edit(next);
        return next;
      }),
    );

  return (
    <Box sx={{ ...frameSx, overflowX: "auto", overflowY: "hidden" }}>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...headCellSx, width: GRIP_W, px: 1 }} />
            <HeadCell label={t("cond.value")} />
            <HeadCell label="" width={96} />
            <HeadCell label={t("cond.dataset")} width={150} />
            <ActionCell
              color="success"
              icon={<AddIcon />}
              tooltip={t("cond.add")}
              onClick={() => onChange([...conds, NEW_COND])}
            />
          </TableRow>
        </TableHead>
        <TableBody>
          {conds.length === 0 && (
            <TableNoticeRow colSpan={5} kind="empty" message={t("cond.empty")} />
          )}
          {conds.map((cond, index) => (
            <TableRow key={index}>
              <FilterCell width={GRIP_W}>
                <Box
                  sx={{
                    fontSize: "0.72rem",
                    color: "text.secondary",
                    fontFamily: "monospace",
                  }}
                >
                  if
                </Box>
              </FilterCell>
              <FilterCell active={cond.value !== ""} grow>
                <VariableEdit
                  value={cond.value}
                  datasetType={datasets.find((row) => row.name === cond.dataset)?.type}
                  onChange={(value) =>
                    patch(index, (next) => {
                      next.value = value;
                    })
                  }
                />
              </FilterCell>
              <FilterSelect
                value={cond.negate === true ? "not in" : "in"}
                width={96}
                options={OP_OPTIONS}
                unset="in"
                onChange={(op) =>
                  patch(index, (next) => {
                    if (op === "not in") {
                      next.negate = true;
                    } else {
                      delete next.negate;
                    }
                  })
                }
              />
              <FilterSelect
                value={cond.dataset}
                width={150}
                options={datasetOptions(cond.dataset)}
                unset=""
                onChange={(dataset) =>
                  patch(index, (next) => {
                    next.dataset = dataset;
                  })
                }
              />
              <ActionCell
                color="error"
                icon={<DeleteIcon />}
                tooltip={t("common.delete")}
                onClick={() => onChange(conds.filter((_, i) => i !== index))}
              />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export function CondDialog({
  t,
  title,
  conds,
  line,
  onClose,
  onApply,
}: {
  t: Translate;
  /** Чьи условия правим: имя набора или ключа лимита. */
  title: string;
  conds: Cond[];
  /** Строка директивы целиком -- чтобы видеть, что получится. */
  line: (conds: Cond[]) => string;
  onClose: () => void;
  onApply: (next: Cond[]) => void;
}) {
  const [draft, setDraft] = useState<Cond[]>(condsDraft(conds));
  const done = readyConds(draft);

  return (
    <Modal
      onClose={onClose}
      title={t("cond.title", { name: title })}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(done)}>
            {t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
      {/*
        Как это устроено -- правилом под шапкой, а не припиской к заголовку:
        это не событие и не пересказ окна, а то, что условия делают всегда.
      */}
      <DialogAlert text={t("cond.alert")} help={CONDS_HELP} />
      <CondTable t={t} conds={draft} onChange={setDraft} />
      <DialogLines title={t("cond.lineTitle")} lines={[line(done)]} />
    </Modal>
  );
}
