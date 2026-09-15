import { useEffect, useState } from "react";
import TextField from "@mui/material/TextField";

import { Modal } from "../components/Modal.tsx";
import type { DatasetType } from "../api.ts";
import { useT, type Translate } from "../i18n/index.ts";
import { useModal } from "../store/forms.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { addAddressThunk } from "../store/slices/pages/datasets.ts";

export const FORM_DATASET_ADD_ENTRY = "dataset-add-entry";

export type DatasetAddEntryPayload = {
  scope: string;
  datasetId: string | null;
  type: DatasetType;
};

export function placeholderFor(t: Translate, type: DatasetType): string {
  switch (type) {
    case "numeric":
      return t("datasets.placeholderNumeric");
    case "ipv4":
      return t("datasets.placeholderIpv4");
    case "ip":
      return t("datasets.placeholderIp");
    default:
      return t("datasets.placeholderString");
  }
}

export function helperFor(t: Translate, type: DatasetType): string {
  switch (type) {
    case "numeric":
      return t("datasets.helperNumeric");
    case "ipv4":
      return t("datasets.helperIpv4");
    case "ip":
      return t("datasets.helperIp");
    default:
      return t("datasets.helperString");
  }
}

export function DatasetAddEntryForm({
  onLocalAdd,
}: {
  onLocalAdd?: (value: string, ttlS: number) => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const modal = useModal<DatasetAddEntryPayload>(FORM_DATASET_ADD_ENTRY);
  const { open, payload, busy } = modal;
  const [value, setValue] = useState("");
  const [ttl, setTtl] = useState("0");
  const type = payload?.type ?? "ipv4";

  useEffect(() => {
    if (!open) {
      return;
    }
    setValue("");
    setTtl("0");
  }, [open]);

  const canSubmit = value.trim() !== "" && !busy;

  function submit() {
    const line = value.trim();
    const ttlS = Number.parseInt(ttl, 10) || 0;
    if (payload !== undefined && payload.datasetId !== null) {
      const target = { scope: payload.scope, datasetId: payload.datasetId };
      void modal.submit(async () => {
        await dispatch(
          addAddressThunk({ ...target, address: line, ttlS }),
        ).unwrap();
      });
      return;
    }
    onLocalAdd?.(line, ttlS);
    modal.close();
  }

  return (
    <Modal
      id={FORM_DATASET_ADD_ENTRY}
      title={t("datasets.addTitle")}
      size="xs"
      dirty={value.trim() !== ""}
      onEnter={() => {
        if (canSubmit) {
          submit();
        }
      }}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!canSubmit} onClick={submit}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
      <TextField
        size="small"
        autoFocus
        fullWidth
        label={t("datasets.value")}
        placeholder={placeholderFor(t, type)}
        helperText={helperFor(t, type)}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <TextField
        size="small"
        label={t("datasets.ttl")}
        helperText={t("datasets.ttlHint")}
        value={ttl}
        onChange={(e) => setTtl(e.target.value)}
      />
    </Modal>
  );
}
