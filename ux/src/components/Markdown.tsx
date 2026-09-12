import { isValidElement, useMemo, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { slugify } from "../help/toc.ts";

/**
 * Разметка справки: markdown из `help/*.md` компонентами MUI.
 *
 * Не `dangerouslySetInnerHTML`: react-markdown строит дерево React, и сырой
 * HTML в него не попадает вовсе. Тексты наши и приезжают из бандла, но панель
 * этого продукта -- последнее место, где стоит заводить дорогу для чужой
 * разметки.
 *
 * Таблицы здесь свои, а не `components/table-block.tsx`: тот про таблицу-раздел
 * с действиями в строке, а здесь таблица -- часть текста.
 */

/** Текст заголовка из детей узла: нужен для якоря `#заголовок`. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

/**
 * Куда ведёт ссылка из текста.
 *
 * `08-events.md` -> `/help/08-events`: файлы ссылаются друг на друга так же,
 * как лежат на диске, и в редакторе эти ссылки живые. `#якорь` остаётся
 * якорем. Всё остальное считается внешним и открывается новой вкладкой.
 */
function resolveHref(href: string): { to?: string; external?: string } {
  if (href.startsWith("#")) {
    return { to: href };
  }
  if (/^https?:\/\//.test(href) || href.startsWith("mailto:")) {
    return { external: href };
  }
  const md = /^([\w.-]+)\.md(#.*)?$/.exec(href);
  if (md !== null) {
    return { to: `/help/${md[1]}${md[2] ?? ""}` };
  }
  return { external: href };
}

function heading(level: 1 | 2 | 3 | 4) {
  const style = {
    1: { variant: "h5" as const, mt: 0, mb: 2, weight: 600 },
    2: { variant: "h6" as const, mt: 4, mb: 1.5, weight: 600 },
    3: { variant: "subtitle1" as const, mt: 3, mb: 1, weight: 600 },
    4: { variant: "subtitle2" as const, mt: 2, mb: 1, weight: 600 },
  }[level];

  return function Heading({ children }: { children?: ReactNode }) {
    const text = textOf(children);
    return (
      <Typography
        id={level === 1 ? undefined : slugify(text)}
        variant={style.variant}
        sx={{
          mt: style.mt,
          mb: style.mb,
          fontWeight: style.weight,
          // Якорь под закреплённой шапкой: без отступа заголовок,
          // на который прыгнули, прячется под полосу крошек.
          scrollMarginTop: 96,
        }}
      >
        {children}
      </Typography>
    );
  };
}

const COMPONENTS: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),

  p: ({ children }) => (
    <Typography variant="body2" sx={{ mb: 1.5, maxWidth: "80ch", lineHeight: 1.7 }}>
      {children}
    </Typography>
  ),

  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 3, mb: 2, mt: 0, maxWidth: "80ch" }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 3, mb: 2, mt: 0, maxWidth: "80ch" }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box
      component="li"
      sx={{ mb: 0.75, fontSize: "0.875rem", lineHeight: 1.7 }}
    >
      {children}
    </Box>
  ),

  a: ({ href, children }) => {
    const target = resolveHref(href ?? "");
    if (target.to !== undefined) {
      return (
        <Link component={RouterLink} to={target.to} underline="hover">
          {children}
        </Link>
      );
    }
    return (
      <Link
        href={target.external}
        target="_blank"
        rel="noreferrer noopener"
        underline="hover"
      >
        {children}
      </Link>
    );
  },

  blockquote: ({ children }) => (
    <Box
      sx={{
        borderLeft: 3,
        borderColor: "primary.main",
        pl: 2,
        py: 0.5,
        my: 2,
        maxWidth: "80ch",
        "& p": { mb: 0 },
      }}
    >
      {children}
    </Box>
  ),

  code: ({ className, children }) => {
    // Фрагмент кода приезжает в <pre>, и класс у него language-*.
    const block = className !== undefined && className.startsWith("language-");
    if (block) {
      return <Box component="code">{children}</Box>;
    }
    return (
      <Box
        component="code"
        sx={{
          fontFamily: "monospace",
          fontSize: "0.85em",
          bgcolor: "action.hover",
          borderRadius: 0.5,
          px: 0.5,
          py: 0.1,
        }}
      >
        {children}
      </Box>
    );
  },
  pre: ({ children }) => (
    <Box
      component="pre"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.8rem",
        bgcolor: "action.hover",
        p: 1.5,
        my: 2,
        borderRadius: 1,
        overflowX: "auto",
      }}
    >
      {children}
    </Box>
  ),

  hr: () => <Divider sx={{ my: 3 }} />,

  // Таблица шире колонки прокручивается внутри себя: страница вбок не едет.
  table: ({ children }) => (
    <Box sx={{ overflowX: "auto", my: 2 }}>
      <Table size="small" sx={{ minWidth: 520 }}>
        {children}
      </Table>
    </Box>
  ),
  thead: ({ children }) => <TableHead>{children}</TableHead>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => (
    <TableCell sx={{ fontWeight: 600, verticalAlign: "top" }}>
      {children}
    </TableCell>
  ),
  td: ({ children }) => (
    <TableCell sx={{ verticalAlign: "top" }}>{children}</TableCell>
  ),
};

export default function Markdown({ text }: { text: string }) {
  const plugins = useMemo(() => [remarkGfm], []);

  return (
    <ReactMarkdown remarkPlugins={plugins} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}
