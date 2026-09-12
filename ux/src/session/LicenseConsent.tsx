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

/**
 * Окно согласия с лицензией на входе в панель.
 *
 * Стоит поверх оболочки и не закрывается ничем, кроме кнопки «Принять»: ни
 * крестика, ни Esc, ни промаха мимо окна -- иначе это не согласие, а
 * баннер. Кнопка оживает после галочки «прочитал и принимаю».
 *
 * Отметка о принятии живёт в браузере (`license.ts`): у панели нет учётных
 * записей, и хранить согласие «на контроллере» значило бы приписать его всем,
 * кто откроет панель после первого. Новая версия текста -- новое окно.
 */
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
