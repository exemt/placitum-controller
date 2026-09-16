import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { UnderlayTabs } from "../components/fields.tsx";
import { FlushSectionProvider } from "../components/settings-table.tsx";

export interface LayerItem<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

export function useLayerTab<T extends string>(
  key: string,
  ids: readonly T[],
): [T, (next: T) => void] {
  const [tab, setTab] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null && (ids as readonly string[]).includes(raw)) {
        return raw as T;
      }
    } catch {
    }
    return ids[0];
  });

  return [
    tab,
    (next: T) => {
      setTab(next);
      try {
        localStorage.setItem(key, next);
      } catch {
      }
    },
  ];
}

export function LayerBar({ children }: { children: ReactNode }) {
  return <Stack spacing={1}>{children}</Stack>;
}

export function LayerTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly LayerItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <UnderlayTabs
      wrap
      value={value}
      onChange={onChange}
      items={items.map((item) => ({ value: item.id, label: item.label }))}
    />
  );
}

export function LayerCard({
  title,
  hint,
  flush,
  children,
}: {
  title: string;
  hint?: string;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: "5px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.1,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(0, 0, 0, 0.35)"
              : "rgba(19, 32, 44, 0.05)",
        }}
      >
        <Typography
          component="div"
          sx={{
            color: "secondary.main",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
            lineHeight: 1.25,
          }}
        >
          {title}
        </Typography>
        {hint !== undefined && hint !== "" && (
          <Typography
            component="div"
            sx={{
              mt: 0.25,
              fontSize: "0.7rem",
              lineHeight: 1.3,
              fontWeight: 500,
              color: "text.secondary",
              opacity: 0.55,
            }}
          >
            {hint}
          </Typography>
        )}
      </Box>
      <FlushSectionProvider value={flush === true}>
        <Box sx={flush === true ? undefined : { p: 2 }}>
          <Stack spacing={flush === true ? 0 : 1.5}>{children}</Stack>
        </Box>
      </FlushSectionProvider>
    </Box>
  );
}
