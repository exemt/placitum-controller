import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { useT } from "../i18n/index.ts";

export default function Placeholder({
  page,
}: {
  page: "inspectors" | "traffic";
}) {
  const t = useT();

  return (
    <Stack spacing={2}>
      <Typography variant="h5">{t(`nav.${page}`)}</Typography>
      <Alert severity="info">{t("placeholder.body")}</Alert>
    </Stack>
  );
}
