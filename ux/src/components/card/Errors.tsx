import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import { formatAge, type PulseError } from "../../fleet.ts";
import { useT } from "../../i18n/index.ts";
import { Block } from "./CardBody.tsx";

export function ErrorsBlock({ errors }: { errors?: PulseError[] }) {
  const t = useT();
  if (errors === undefined || errors.length === 0) {
    return null;
  }
  const shown = errors.slice(0, 5);

  return (
    <Block title={t("fleetPage.errorsBlock")} meta={String(errors.length)}>
      <Stack spacing={0.5}>
        {shown.map((error) => (
          <Stack
            key={`${error.source ?? ""}:${error.msg}`}
            direction="row"
            spacing={1}
            sx={{
              alignItems: "baseline",
              px: 1,
              py: 0.5,
              borderRadius: "3px",
              bgcolor: (theme) => alpha(theme.palette.error.main, 0.06),
              borderLeft: "2px solid",
              borderLeftColor: "error.main",
              minWidth: 0,
            }}
          >
            {error.source !== undefined && (
              <Typography
                component="span"
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "error.main",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {error.source}
              </Typography>
            )}
            <Typography
              component="span"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.72rem",
                lineHeight: 1.5,
                minWidth: 0,
                flexGrow: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={error.msg}
            >
              {error.msg}
            </Typography>
            {(error.count ?? 1) > 1 && (
              <Typography
                component="span"
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "error.main",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                ×{error.count}
              </Typography>
            )}
            <Typography
              component="span"
              sx={{
                fontSize: "0.68rem",
                color: "text.secondary",
                opacity: 0.7,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {errorAge(error.at)}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {errors.length > shown.length && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            +{errors.length - shown.length}
          </Typography>
        </Box>
      )}
    </Block>
  );
}

function errorAge(at: string): string {
  return formatAge(Math.max(0, Date.now() - Date.parse(at)));
}
