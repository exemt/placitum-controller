/**
 * Ячейка таблицы для значения, которое в строку не помещается.
 *
 * Выражение, шаблон замены, вставляемый кусок разметки -- всё это правится в
 * ячейке, пока оно короткое, и перестаёт читаться, как только вырастает: в
 * колонке видно первые двадцать символов, а сколько там за краем -- неизвестно.
 * Поэтому у поля появляется карандаш: он открывает то же значение окном, где
 * оно лежит целиком, многострочно и моноширинно.
 *
 * Само поле остаётся рабочим: короткое значение по-прежнему быстрее набрать на
 * месте, чем открывать окно ради двух слов. Окно -- второй вход к тому же
 * значению, а не замена первого; ровно так же устроены остальные окна по
 * шестерёнке.
 */

import { useState, type ReactNode } from "react";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import { DraftCell } from "./data-table/index.ts";
import { Modal } from "./Modal.tsx";
import { useT } from "../i18n/index.ts";

export function LongTextCell({
  value,
  placeholder,
  title,
  hint,
  width,
  rows,
  mono = true,
  disabled = false,
  onChange,
}: {
  value: string;
  placeholder: string;
  /** Заголовок окна: подпись колонки, к которой относится значение. */
  title: string;
  /** Строка под заголовком окна: чем это значение является. */
  hint?: string;
  width?: number | string;
  /** Высота поля в окне: у значения в одну строку десяти строк не нужно. */
  rows?: number;
  mono?: boolean;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <DraftCell
        value={value}
        placeholder={placeholder}
        width={width}
        mono={mono}
        disabled={disabled}
        onChange={onChange}
        action={
          /*
           * Карандаш -- значок в поле, а не кнопка рядом с ним: обведённый
           * квадрат читался вторым объектом строки и спорил с крестиком
           * очистки, который стоит тут же. Набивка гасится тем же
           * отрицательным полем, что у крестика (см. FilterText).
           *
           * Слева -- зазор: значок стоит в потоке за полем, и обрезанный текст
           * упирался в него вплотную, читаясь вместе с ним одним словом.
           */
          <Tooltip title={t("common.edit")}>
            <span style={{ display: "inline-flex" }}>
              <IconButton
                size="small"
                aria-label={t("common.edit")}
                disabled={disabled}
                onClick={() => setOpen(true)}
                sx={{ p: 0.25, ml: 0.75, mr: -0.5 }}
              >
                <EditOutlinedIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </span>
          </Tooltip>
        }
      />
      {open && (
        <TextModal
          title={title}
          hint={hint}
          value={value}
          mono={mono}
          rows={rows}
          onClose={() => setOpen(false)}
          onSave={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * Окно правки текста: заголовок, поле во всю ширину, две кнопки.
 *
 * Ничего сверх этого здесь нет намеренно -- ни подсветки, ни нумерации строк.
 * Значение приезжает сюда за тем, чтобы его увидеть целиком и поправить, а
 * редактор кода в окне на четверть экрана мешал бы обеим задачам.
 */
export function TextModal({
  title,
  hint,
  value,
  mono = true,
  rows = 10,
  onClose,
  onSave,
}: {
  title: string;
  hint?: string;
  value: string;
  mono?: boolean;
  rows?: number;
  onClose: () => void;
  onSave: (next: string) => void;
}): ReactNode {
  const t = useT();
  const [draft, setDraft] = useState(value);

  return (
    <Modal
      onClose={onClose}
      size="md"
      title={title}
      hint={hint}
      /* Enter в многострочном поле -- перевод строки, а не сохранение. */
      dirty={draft !== value}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onSave(draft)}>
            {t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        multiline
        minRows={rows}
        maxRows={rows * 2}
        size="small"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        slotProps={{
          htmlInput: { "aria-label": title, spellCheck: false },
        }}
        sx={
          mono
            ? {
                "& .MuiInputBase-input": {
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  lineHeight: 1.5,
                },
              }
            : undefined
        }
      />
    </Modal>
  );
}
