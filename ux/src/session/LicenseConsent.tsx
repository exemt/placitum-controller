import { useState } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";

import Markdown from "../components/Markdown.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { LICENSE_VERSION, isCurrent, licenseText } from "../license.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { acceptLicense } from "../store/slices/ui.ts";

export function LicenseConsent() {
  const t = useT();
  const dispatch = useAppDispatch();
  const locale = useAppSelector((s) => s.ui.locale);
  const accepted = useAppSelector((s) => s.ui.license);
  const [agreed, setAgreed] = useState(false);

  if (isCurrent(accepted)) {
    return null;
  }

  return (
    <Modal
      title={t("license.title")}
      label={t("license.version", { version: LICENSE_VERSION })}
      hint={t("license.hint")}
      size="md"
      dismissable={false}
      closable={false}
      actions={
        <Modal.Submit disabled={!agreed} onClick={() => dispatch(acceptLicense())}>
          {t("license.accept")}
        </Modal.Submit>
      }
    >
      <Box>
        <Markdown text={licenseText(locale)} />
      </Box>
      <FormControlLabel
        control={
          <Checkbox
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
        }
        label={t("license.agree")}
      />
    </Modal>
  );
}
