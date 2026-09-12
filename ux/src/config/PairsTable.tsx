/*
  Список пар «имя / значение» таблицей во всю секцию: `add_header` на вкладке
  «Заголовки ответа». «Переменные» http {} — закрытый каталог, `VarsCatalog`.

  Раньше это была одна строка таблицы настроек с подписью директивы и списком
  пар внутри ячейки: у пар не было своих заголовков, а «+ добавить» ставил
  пустую строку, которую потом ещё надо было заполнить. Вкладка целиком про
  этот список, поэтому список и есть её содержимое -- таблица во всю секцию
  (см. docs/controller/ux/settings-table.md, «Таблицы данных внутри секции»).

  Пара заводится окном ([AddDialog]), а не черновой строкой внизу таблицы.
  Черновая строка держала имя и значение подсказками (`Strict-Transport-Security`,
  `max-age=…`): приглушённый текст читался уже заведённой записью, а «+» в её
  конце стоял погашенным, пока оба поля пусты, -- и на нажатие не отвечал
  ничем, потому что нажимать было не по чем. Кнопка в шапке таблицы такого
  вопроса не задаёт, а окно показывает готовую директиву до записи. Тем же
  движением ушла черновая строка у сервера пула (`pages/UpstreamPeerDialog.tsx`)
  и не заводилась у приёмника лога (`LogsTable`).

  Документ -- черновик страницы: правка в ячейке меняет черновик, сохраняет
  его общая строка состояния. Заведённая пара правится на месте, в своей
  строке: правка -- это одно поле, а не пара целиком.
*/
import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import {
  dataActionCellSx,
  dataCellSx,
  dataInputSx,
  SectionBleed,
} from "../components/settings-table.tsx";
import { TableIconButton, TableNoticeRow } from "../components/data-table/index.ts";
import {
  DialogLines,
  DialogRow,
  DialogText,
  dialogLabelSx,
} from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import { flushTableSx, headCellSx, HeadCell } from "../components/table-block.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { asString, type Doc } from "../pages/config-fields.tsx";

/* Таблица и есть содержимое секции: черту под шапкой рисует карточка. */
const tableSx = { ...flushTableSx, borderTop: 0 } as const;

const NAME_W = 240;
const FLAG_W = 90;
const ACTIONS_W = 48;

/** Колонка-флаг справа от значения: `always` у `add_header`. */
export type PairFlag = {
  key: string;
  label: string;
  help?: string;
};

/** Тексты окна «завести пару» и заметок таблицы -- словами того, чем пара станет. */
export type PairsAdd = {
  /** Кнопка «+» в шапке таблицы. */
  button: string;
  /** Заголовок окна и строка под ним. */
  title: string;
  hint: string;
  /** Директива, которой пара станет в файле: из неё собирается предпросмотр. */
  directive: string;
  /** Подпись блока с этой строкой и текст, пока строки нет. */
  emitted: string;
  nothing: string;
  /** Пустая таблица и попытка завести то, что уже есть. */
  empty: string;
  dup: string;
};

/**
 * Ключ пары для поиска дубля: имя без регистра, значение как набрали. Флаг в
 * ключ не входит -- две строки с одним именем и значением уйдут в ответ
 * дважды независимо от него.
 */
function pairKey(name: string, value: string): string {
  return `${name.trim().toLowerCase()} ${value.trim()}`;
}

/**
 * Окно новой пары.
 *
 * В таблице имя и значение стоят двумя ячейками, а флаг -- через колонку от
 * них, и пара, дописанная молча, показывала себя уже после нажатия. Окно
 * собирает её целиком и печатает внизу ту самую строку, какой она уйдёт в
 * файл: у `add_header` от порядка слов зависит, что попадёт в значение, а что
 * станет `always`.
 *
 * Дубль не заводится: одинаковые имя и значение -- это тот же заголовок,
 * отправленный клиенту дважды, и убирать потом придётся ту строку, которую не
 * отличить от соседней.
 */
function AddDialog({
  t,
  add,
  flag,
  nameHelp,
  valueLabel,
  valueHelp,
  namePlaceholder,
  valuePlaceholder,
  mono,
  taken,
  onClose,
  onAdd,
}: {
  t: Translate;
  add: PairsAdd;
  flag?: PairFlag;
  nameHelp: string;
  valueLabel: string;
  valueHelp?: string;
  namePlaceholder: string;
  valuePlaceholder: string;
  mono?: boolean;
  /** Пары, которые в списке уже есть ([pairKey]). */
  taken: readonly string[];
  onClose: () => void;
  onAdd: (row: Doc) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [flagOn, setFlagOn] = useState(false);

  const filled = name.trim() !== "" && value.trim() !== "";
  const dup = filled && taken.includes(pairKey(name, value));
  const ready = filled && !dup;
  const tail = flag !== undefined && flagOn ? ` ${flag.key}` : "";
  const line = `${add.directive} ${name.trim()} ${value.trim()}${tail};`;

  const submit = () => {
    const row: Doc = { name: name.trim(), value: value.trim() };
    if (flag !== undefined && flagOn) {
      row[flag.key] = true;
    }
    onAdd(row);
  };

  return (
    <Modal
      onClose={onClose}
      /* Набранное руками не выбрасывается промахом мимо окна. */
      dirty={name !== "" || value !== ""}
      title={add.title}
      hint={add.hint}
      onEnter={ready ? submit : undefined}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.5}>
        <DialogRow label={t("common.name")} hint={nameHelp}>
          <DialogText
            mono={mono}
            width={260}
            value={name}
            placeholder={namePlaceholder}
            onChange={setName}
          />
        </DialogRow>
        <DialogRow label={valueLabel} hint={valueHelp}>
          <DialogText
            mono={mono}
            width={260}
            value={value}
            placeholder={valuePlaceholder}
            onChange={setValue}
          />
        </DialogRow>
        {flag !== undefined && (
          <DialogRow label={flag.label} hint={flag.help}>
            <Checkbox
              size="small"
              checked={flagOn}
              onChange={(_, on) => setFlagOn(on)}
              slotProps={{ input: { "aria-label": flag.label } }}
              sx={{ p: 0.25 }}
            />
          </DialogRow>
        )}
        {dup && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <WarningAmberIcon color="warning" sx={{ fontSize: 15, flexShrink: 0 }} />
            <Typography
              sx={{ ...dialogLabelSx, color: "warning.main", whiteSpace: "normal" }}
            >
              {add.dup}
            </Typography>
          </Stack>
        )}
        {/*
          Строка показывается, как только пара набрана, -- и на дубле тоже:
          «записывать нечего» под заполненными полями читалось бы отказом
          показывать то, что уже набрано. Почему её нельзя завести, говорит
          предупреждение над ней.
        */}
        <DialogLines
          title={add.emitted}
          lines={filled ? [line] : []}
          empty={add.nothing}
        />
      </Stack>
    </Modal>
  );
}

export function PairsTable({
  rows,
  nameHelp,
  valueLabel,
  valueHelp,
  namePlaceholder,
  valuePlaceholder,
  flag,
  mono,
  add,
  onChange,
}: {
  rows: Doc[];
  /** Подсказка ⓘ у колонки имени: что это за директива. */
  nameHelp: string;
  valueLabel: string;
  valueHelp?: string;
  namePlaceholder: string;
  valuePlaceholder: string;
  flag?: PairFlag;
  mono?: boolean;
  add: PairsAdd;
  onChange: (next: Doc[]) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const inputSx = mono === true ? { ...dataInputSx, fontFamily: "monospace" } : dataInputSx;
  const span = flag === undefined ? 3 : 4;

  const patchAt = (index: number, patch: Doc) =>
    onChange(
      rows.map((row, i) => {
        if (i !== index) {
          return row;
        }
        const next = { ...row, ...patch };
        for (const key of Object.keys(patch)) {
          if (patch[key] === undefined) {
            delete next[key];
          }
        }
        return next;
      }),
    );

  const flagCell = (checked: boolean, onToggle: (on: boolean) => void): ReactNode =>
    flag === undefined ? null : (
      <TableCell sx={dataCellSx}>
        <Checkbox
          size="small"
          checked={checked}
          onChange={(_, on) => onToggle(on)}
          slotProps={{ input: { "aria-label": flag.label } }}
          sx={{ p: 0.25 }}
        />
      </TableCell>
    );

  return (
    <>
      <SectionBleed>
        <Table size="small" sx={tableSx}>
          <TableHead>
            <TableRow>
              <HeadCell label={t("common.name")} help={nameHelp} width={NAME_W} />
              <HeadCell label={valueLabel} help={valueHelp} />
              {flag !== undefined && (
                <HeadCell label={flag.label} help={flag.help} width={FLAG_W} />
              )}
              {/* «+» стоит в шапке, а не в конце списка: он заводит запись, а не продолжает её. */}
              <TableCell sx={{ ...headCellSx, width: ACTIONS_W, minWidth: ACTIONS_W }}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                  <TableIconButton
                    color="success"
                    icon={<AddIcon sx={{ fontSize: 16 }} />}
                    tooltip={add.button}
                    onClick={() => setAdding(true)}
                  />
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableNoticeRow colSpan={span} kind="empty" message={add.empty} />
            )}
            {rows.map((row, index) => (
              <TableRow key={index} hover>
                <TableCell sx={dataCellSx}>
                  <InputBase
                    value={asString(row.name)}
                    inputProps={{ "aria-label": t("common.name") }}
                    onChange={(e) => patchAt(index, { name: e.target.value })}
                    sx={inputSx}
                  />
                </TableCell>
                <TableCell sx={dataCellSx}>
                  <InputBase
                    value={asString(row.value)}
                    inputProps={{ "aria-label": valueLabel }}
                    onChange={(e) => patchAt(index, { value: e.target.value })}
                    sx={inputSx}
                  />
                </TableCell>
                {flag !== undefined &&
                  flagCell(row[flag.key] === true, (on) =>
                    patchAt(index, { [flag.key]: on ? true : undefined }),
                  )}
                <TableCell sx={dataActionCellSx}>
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                    tooltip={t("common.delete")}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionBleed>
      {adding && (
        <AddDialog
          t={t}
          add={add}
          flag={flag}
          nameHelp={nameHelp}
          valueLabel={valueLabel}
          valueHelp={valueHelp}
          namePlaceholder={namePlaceholder}
          valuePlaceholder={valuePlaceholder}
          mono={mono}
          taken={rows.map((row) => pairKey(asString(row.name), asString(row.value)))}
          onClose={() => setAdding(false)}
          onAdd={(row) => {
            setAdding(false);
            onChange([...rows, row]);
          }}
        />
      )}
    </>
  );
}
