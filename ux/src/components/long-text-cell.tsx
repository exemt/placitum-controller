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
  title: string;
  hint?: string;
  width?: number | string;
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
