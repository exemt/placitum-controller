import type { MouseEvent } from "react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Tooltip from "@mui/material/Tooltip";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";

import { sectionBySlug } from "./toc.ts";
import { useT, type Translate } from "../i18n/index.ts";

// Цель ссылки: «06-ip» или «06-ip#списки-для-условий».
// Якорь совпадает с заголовком раздела, приведённым slugify из toc.ts.
export function helpHref(target: string): string {
  return `/help/${target}`;
}

export function helpTitle(t: Translate, target: string): string {
  const section = sectionBySlug(target.split("#")[0]);
  return section === undefined
    ? t("nav.help")
    : t("common.helpSection", { name: section.title });
}

const stop = (event: MouseEvent) => event.stopPropagation();

// Значок «?» у заголовка блока или страницы. Открывает раздел в соседней
// вкладке: незаполненная форма при этом остаётся на месте.
export function HelpMark({
  to,
  title,
  size = 14,
}: {
  to: string;
  title?: string;
  size?: number;
}) {
  const t = useT();
  const label = title ?? helpTitle(t, to);

  return (
    <Tooltip arrow title={label} placement="top" enterDelay={200}>
      <Box
        component="a"
        href={helpHref(to)}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={label}
        onClick={stop}
        onMouseDown={stop}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          color: "text.secondary",
          opacity: 0.45,
          "&:hover, &:focus-visible": { opacity: 1, color: "primary.main" },
        }}
      >
        <HelpOutlineIcon sx={{ fontSize: size }} />
      </Box>
    </Tooltip>
  );
}

// Ссылка словами — внутри подсказки, сноски под полем или врезки.
export function HelpLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      href={helpHref(to)}
      target="_blank"
      rel="noreferrer noopener"
      underline="hover"
      onClick={stop}
      sx={{ fontSize: "inherit", fontWeight: 500 }}
    >
      {label}
    </Link>
  );
}
