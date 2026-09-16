import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

export interface MetaItem {
  label: string;
  value: string;
  tone?: "warning" | "error" | "success";
}

const LABEL_SX = {
  plain: { color: "text.secondary", opacity: 0.7 },
  toned: { color: "inherit", opacity: 0.8 },
} as const;

export function MetaChips({ items }: { items: (MetaItem | null)[] }) {
  const shown = items.filter((row): row is MetaItem => row !== null);

  if (shown.length === 0) {
    return null;
  }

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
      {shown.map((item) => (
        <Chip
          key={`${item.label}:${item.value}`}
          size="small"
          variant={item.tone === undefined ? "outlined" : "filled"}
          color={item.tone ?? "default"}
          label={
            <Box component="span" sx={{ display: "inline-flex", gap: 0.75 }}>
              <Box
                component="span"
                sx={item.tone === undefined ? LABEL_SX.plain : LABEL_SX.toned}
              >
                {item.label}
              </Box>
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {item.value}
              </Box>
            </Box>
          }
        />
      ))}
    </Stack>
  );
}

export function meta(
  label: string,
  value: string | undefined,
  tone?: MetaItem["tone"],
): MetaItem | null {
  return value === undefined || value === "" ? null : { label, value, tone };
}
