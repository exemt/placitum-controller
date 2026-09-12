import type { PageBarCrumb } from "../components/PageBar.tsx";
import type { Translate } from "../i18n/index.ts";

type PageCrumb = {
  path: string;
  key: string;
  section?: "config" | "data" | "inspectors" | "ip" | "structure";
};

const SECTIONS: Record<
  NonNullable<PageCrumb["section"]>,
  { key: string; to: string }
> = {
  config: { key: "nav.config", to: "/config" },
  data: { key: "nav.datasets", to: "/datasets" },
  inspectors: { key: "nav.inspectors", to: "/inspectors" },
  ip: { key: "nav.ipData", to: "/ip" },
  structure: { key: "nav.structure", to: "/structure/ports" },
};

// Порядок -- как в меню (layout/AppShell.tsx).
const PAGES: PageCrumb[] = [
  { path: "/", key: "nav.fleet" },
  { path: "/incidents", key: "nav.incidents" },
  {
    path: "/inspectors",
    key: "nav.inspectorCatalog",
    section: "inspectors",
  },
  { path: "/rules/profiles", key: "nav.ruleSets", section: "inspectors" },
  { path: "/ip/profiles", key: "nav.ip", section: "inspectors" },
  { path: "/auth", key: "nav.auth", section: "inspectors" },
  { path: "/captcha", key: "nav.captcha", section: "inspectors" },
  { path: "/json", key: "nav.json", section: "inspectors" },
  { path: "/counter", key: "nav.counter", section: "inspectors" },
  { path: "/vlai", key: "nav.vlai", section: "inspectors" },
  { path: "/rewrite", key: "nav.rewrite", section: "inspectors" },
  { path: "/cookie", key: "nav.cookie", section: "inspectors" },
  { path: "/actions", key: "nav.actions", section: "inspectors" },
  { path: "/datasets", key: "nav.lists", section: "data" },
  { path: "/datasets/files", key: "nav.files", section: "data" },
  {
    path: "/datasets/certificates",
    key: "nav.certificates",
    section: "data",
  },
  { path: "/rules", key: "nav.rules" },
  { path: "/ip", key: "nav.ipCountries", section: "ip" },
  { path: "/ip/asn", key: "nav.ipAsns", section: "ip" },
  { path: "/ip/sets", key: "nav.ipSets", section: "ip" },
  { path: "/structure/ports", key: "nav.ports", section: "structure" },
  { path: "/structure/upstreams", key: "nav.upstreams", section: "structure" },
  { path: "/structure/servers", key: "nav.servers", section: "structure" },
  { path: "/structure/paths", key: "nav.paths", section: "structure" },
  { path: "/config/general", key: "nav.general", section: "config" },
  { path: "/config", key: "nav.http", section: "config" },
  { path: "/config/haproxy", key: "nav.haproxy", section: "config" },
  { path: "/config/agent", key: "nav.agent", section: "config" },
  { path: "/logs", key: "nav.logs" },
  { path: "/traffic", key: "nav.traffic" },
];

export function crumbsForPath(
  pathname: string,
  t: Translate,
  extra: PageBarCrumb[] = [],
): PageBarCrumb[] {
  // У справки адрес продолжается разделом, и раздел приходит крошкой от самой
  // страницы: перечислять их в PAGES значило бы держать список в двух местах.
  if (pathname === "/help" || pathname.startsWith("/help/")) {
    return [
      { label: t("nav.help"), to: extra.length > 0 ? "/help" : undefined },
      ...extra,
    ];
  }

  // Лицензия -- такая же ссылка под меню, как справка; адрес у неё один.
  if (pathname === "/license") {
    return [{ label: t("nav.license") }, ...extra];
  }

  const page = PAGES.find((row) => row.path === pathname);
  if (page === undefined) {
    return [{ label: t("nav.fleet"), to: "/" }, ...extra];
  }

  const crumbs: PageBarCrumb[] = [];
  if (page.section !== undefined) {
    const section = SECTIONS[page.section];
    crumbs.push({ label: t(section.key), to: section.to });
  }
  crumbs.push({
    label: t(page.key),
    to: extra.length > 0 ? page.path : undefined,
  });
  return [...crumbs, ...extra];
}
