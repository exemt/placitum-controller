/*
 * Тело раскрытой карточки флота: лента показателей, блок с таблицей, строка
 * чипов. Порядок один у агента, хранилища, инспектора и сервиса — глазу не
 * приходится заново искать, где что, переходя от карточки к карточке.
 */

import type { ReactNode } from "react";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export function CardBody({ children }: { children: ReactNode }) {
  return <Stack spacing={1.5}>{children}</Stack>;
}

/**
 * Блок с именем: строка-подпись и содержимое под ней. Подпись занимает одну
 * строку в 16 px и тянет линию до края — это дешевле колонки слева и не
 * отъедает ширину у таблицы.
 */
export function Block({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", mb: 0.75 }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "secondary.main",
            whiteSpace: "nowrap",
            lineHeight: 1.4,
          }}
        >
          {title}
          {meta !== undefined && meta !== "" && (
            <Box
              component="span"
              sx={{ color: "text.secondary", opacity: 0.6, ml: 0.75 }}
            >
              {meta}
            </Box>
          )}
        </Typography>
        <Box sx={{ flexGrow: 1, height: "1px", bgcolor: "divider" }} />
      </Stack>
      {children}
    </Box>
  );
}
