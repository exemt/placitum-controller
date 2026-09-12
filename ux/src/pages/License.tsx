import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import Markdown from "../components/Markdown.tsx";
import { useT } from "../i18n/index.ts";
import { LICENSE_VERSION, isCurrent, licenseText } from "../license.ts";
import { useAppSelector } from "../store/hooks.ts";

/**
 * Страница соглашения: тот же текст, что в окне согласия, на языке панели.
 *
 * Открывается ссылкой «Лицензия» внизу главного меню, рядом с документацией.
 * Не раздел справки: у справки свой план и своё оглавление, а соглашение --
 * документ, на который ссылаются, а не читают по порядку.
 */
export default function License() {
  const t = useT();
  const locale = useAppSelector((s) => s.ui.locale);
  const accepted = useAppSelector((s) => s.ui.license);

  const status = isCurrent(accepted)
    ? t("license.acceptedAt", {
        date: new Date(accepted!.at).toLocaleDateString(locale),
      })
    : t("license.notAccepted");

  return (
    <Stack spacing={2} sx={{ maxWidth: "80ch", pb: 6 }}>
      <Typography variant="caption" color="text.secondary">
        {t("license.version", { version: LICENSE_VERSION })} · {status}
      </Typography>
      <Box>
        <Markdown text={licenseText(locale)} />
      </Box>
    </Stack>
  );
}
