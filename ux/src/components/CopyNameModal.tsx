import { useState } from "react";
import TextField from "@mui/material/TextField";

import { Modal } from "./Modal.tsx";
import { useT } from "../i18n/index.ts";
import { errorCode } from "../errors.ts";

export function CopyNameModal({
  title,
  source,
  busy,
  error,
  nameLabel,
  nameHint,
  onCopy,
  onClose,
}: {
  title: string;
  source: string;
  busy?: boolean;
  error?: string | null;
  nameLabel?: string;
  nameHint?: string;
  onCopy: (name: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(`${source}_copy`);
  const ready = name.trim() !== "" && name.trim() !== source;

  return (
    <Modal
      onClose={onClose}
      title={title}
      label={source}
      hint={t("copyModal.hint")}
      busy={busy}
      notice={error == null ? null : { text: error, code: errorCode(error) }}
      onEnter={() => ready && onCopy(name.trim())}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready || busy === true} onClick={() => onCopy(name.trim())}>
            {t("copyModal.submit")}
          </Modal.Submit>
        </>
      }
    >
      <TextField
        size="small"
        autoFocus
        label={nameLabel ?? t("copyModal.name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        helperText={nameHint ?? t("copyModal.nameHint")}
      />
    </Modal>
  );
}
