import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { PreviewDraft, PreviewNode } from "../api.ts";
import { compileErrorText } from "../compile-errors.ts";
import { NginxEditor } from "../components/nginx-editor/NginxEditor.tsx";
import { useT } from "../i18n/index.ts";
import { usePreview } from "./usePreview.ts";

export function PreviewDock({
  scope,
  draft,
  node,
  enabled = true,
}: {
  scope: string | null;
  draft: PreviewDraft;
  node?: PreviewNode;
  enabled?: boolean;
}) {
  const t = useT();
  const { result, error, pending } = usePreview(scope, draft, node, enabled);

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {error !== null && <Alert severity="error">{error}</Alert>}

      {result !== null && result.errors.length > 0 && (
        <Alert severity="warning">
          <Stack spacing={0.25}>
            {result.errors.map((row, i) => (
              <Typography key={i} variant="body2">
                {compileErrorText(t, row)}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {result !== null && (result.warnings ?? []).length > 0 && (
        <Alert severity="info">
          <Stack spacing={0.25}>
            {(result.warnings ?? []).map((row, i) => (
              <Typography key={i} variant="body2">
                {row.message}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      <Box sx={{ position: "relative", minWidth: 0 }}>
        {pending && (
          <LinearProgress
            sx={{
              position: "absolute",
              top: 1,
              left: 1,
              right: 1,
              height: 2,
              borderRadius: 1,
              zIndex: 1,
            }}
          />
        )}
        <NginxEditor label="" readOnly fill minRows={10} value={result?.text ?? ""} />
      </Box>
    </Stack>
  );
}
