import { useEffect } from "react";
import { Link as RouterLink, useLocation, useParams } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import Markdown from "../components/Markdown.tsx";
import { APP_HEADER_HEIGHT } from "../components/PageBar.tsx";
import {
  SECTIONS,
  headingsOf,
  numberOf,
  sectionBySlug,
  type HelpSection,
} from "../help/toc.ts";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppSelector } from "../store/hooks.ts";

const RAIL_WIDTH = 264;

/** Строки-разделы: подразделы висят под своим `no`. */
const TOP = SECTIONS.filter((row) => row.sub === undefined);

function childrenOf(no: number): HelpSection[] {
  return SECTIONS.filter((row) => row.sub !== undefined && row.no === no);
}

/**
 * Справка администратора внутри панели.
 *
 * Слева -- все разделы плана, а не только написанные: оператору важно видеть,
 * что раздел существует и до него ещё не дошли руки, иначе он ищет ответ там,
 * где его нет. Написанный раздел раскрывает под собой свои заголовки, раздел с
 * подразделами -- ещё и их.
 *
 * Тексты приезжают из бандла (см. `help/toc.ts`), поэтому страница открывается
 * и при мёртвом API -- ровно тогда, когда в справку и лезут.
 */
export default function Help() {
  const t = useT();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const section = slug === undefined ? undefined : sectionBySlug(slug);

  usePageBar({ crumb: section === undefined ? undefined : section.title });

  // Прыжок к якорю: роутер сам этого не делает, а ссылки внутри текстов
  // и из плана ведут именно на заголовки.
  useEffect(() => {
    if (location.hash === "") {
      window.scrollTo({ top: 0 });
      return;
    }
    const id = decodeURIComponent(location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [location.pathname, location.hash]);

  return (
    <Stack direction="row" spacing={4} sx={{ alignItems: "flex-start" }}>
      <Rail activeSlug={slug} />
      <Box sx={{ minWidth: 0, flexGrow: 1, pb: 6 }}>
        {slug === undefined ? (
          <Index />
        ) : section === undefined ? (
          <Alert severity="warning">{t("help.unknown")}</Alert>
        ) : section.body === undefined ? (
          <Stack spacing={2}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {section.title}
            </Typography>
            <Alert severity="info">{t("help.draft")}</Alert>
          </Stack>
        ) : (
          <Markdown text={section.body} />
        )}
      </Box>
    </Stack>
  );
}

function Index() {
  const t = useT();
  const locale = useAppSelector((s) => s.ui.locale);

  return (
    <Stack spacing={2} sx={{ maxWidth: "80ch" }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {t("help.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("help.blurb")}
      </Typography>
      {locale !== "ru" && <Alert severity="info">{t("help.ruOnly")}</Alert>}
      <Stack spacing={0} sx={{ mt: 1 }}>
        {SECTIONS.map((row) => (
          <Box
            key={row.slug}
            sx={{
              display: "flex",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: 1.5,
              py: 1,
              pl: row.sub === undefined ? 0 : 3,
              borderTop: 1,
              borderColor: "divider",
              "&:last-of-type": { borderBottom: 1, borderColor: "divider" },
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: "monospace", minWidth: 24 }}
            >
              {numberOf(row)}
            </Typography>
            {row.body === undefined ? (
              <Typography variant="body2" color="text.disabled">
                {row.title}
              </Typography>
            ) : (
              <Typography
                variant="body2"
                component={RouterLink}
                to={`/help/${row.slug}`}
                sx={{ color: "primary.main", textDecoration: "none" }}
              >
                {row.title}
              </Typography>
            )}
            {row.body === undefined && (
              <Chip
                label={t("help.draftShort")}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: "0.65rem" }}
              />
            )}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

/**
 * Строка рельса: ссылка на раздел и, когда он открыт, его заголовки второго
 * уровня. Ненаписанный раздел остаётся в списке серым -- он в плане.
 */
function RailRow({ row, active }: { row: HelpSection; active: boolean }) {
  if (row.body === undefined) {
    return (
      <Typography
        variant="body2"
        sx={{ color: "text.disabled", py: 0.4, fontSize: "0.8rem" }}
      >
        {row.title}
      </Typography>
    );
  }

  return (
    <>
      <Typography
        variant="body2"
        component={RouterLink}
        to={`/help/${row.slug}`}
        sx={{
          display: "block",
          py: 0.4,
          fontSize: "0.8rem",
          fontWeight: active ? 600 : 400,
          color: active ? "primary.main" : "text.primary",
          textDecoration: "none",
          "&:hover": { color: "primary.main" },
        }}
      >
        {row.title}
      </Typography>

      {active && (
        <Box sx={{ pl: 1.5, borderLeft: 1, borderColor: "divider", ml: 0.5 }}>
          {headingsOf(row.body).map((h) => (
            <Typography
              key={h.id}
              variant="body2"
              component={RouterLink}
              to={`/help/${row.slug}#${h.id}`}
              sx={{
                display: "block",
                py: 0.25,
                fontSize: "0.78rem",
                color: "text.secondary",
                textDecoration: "none",
                "&:hover": { color: "primary.main" },
              }}
            >
              {h.text}
            </Typography>
          ))}
        </Box>
      )}
    </>
  );
}

function Rail({ activeSlug }: { activeSlug?: string }) {
  const t = useT();

  return (
    <Box
      component="nav"
      aria-label={t("help.title")}
      sx={{
        width: RAIL_WIDTH,
        minWidth: RAIL_WIDTH,
        position: "sticky",
        top: APP_HEADER_HEIGHT + 16,
        maxHeight: `calc(100vh - ${APP_HEADER_HEIGHT + 48}px)`,
        overflowY: "auto",
        display: { xs: "none", md: "block" },
      }}
    >
      <Typography
        variant="caption"
        component={RouterLink}
        to="/help"
        sx={{
          display: "block",
          mb: 1,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: activeSlug === undefined ? "primary.main" : "text.secondary",
          textDecoration: "none",
        }}
      >
        {t("help.contents")}
      </Typography>

      {TOP.map((row) => {
        const kids = childrenOf(row.no);
        // Подразделы разворачиваются, только когда читают сам раздел или один
        // из них: иначе девять страниц инспекторов заняли бы весь рельс.
        const open =
          kids.length !== 0 &&
          (row.slug === activeSlug || kids.some((k) => k.slug === activeSlug));

        return (
          <Box key={row.slug} sx={{ mb: 0.25 }}>
            <RailRow row={row} active={row.slug === activeSlug} />
            {open && (
              <Box sx={{ pl: 1.5, ml: 0.5 }}>
                {kids.map((kid) => (
                  <RailRow
                    key={kid.slug}
                    row={kid}
                    active={kid.slug === activeSlug}
                  />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
