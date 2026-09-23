import type { PageBarCrumb } from "../components/PageBar.tsx";
import type { Translate } from "../i18n/index.ts";

type PageCrumb = {
  path: string;
  key: string;
  section?: "config" | "data" | "inspectors" | "ip" | "structure";
  // раздел документации, который открывает значок «?» в полосе крошек
  help?: string;
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

const PAGES: PageCrumb[] = [
  { path: "/", key: "nav.fleet", help: "10-monitoring" },
  { path: "/incidents", key: "nav.incidents", help: "08-events" },
  {
    path: "/inspectors",
    key: "nav.inspectorCatalog",
    section: "inspectors",
    help: "06-inspectors#каталог-объявление-вызов",
  },
  {
    path: "/rules/profiles",
    key: "nav.ruleSets",
    section: "inspectors",
    help: "06-modsec",
  },
  { path: "/ip/profiles", key: "nav.ip", section: "inspectors", help: "06-ip" },
  { path: "/auth", key: "nav.auth", section: "inspectors", help: "06-auth" },
  { path: "/captcha", key: "nav.captcha", section: "inspectors", help: "06-captcha" },
  { path: "/json", key: "nav.json", section: "inspectors", help: "06-json" },
  { path: "/counter", key: "nav.counter", section: "inspectors", help: "06-counter" },
  { path: "/vlai", key: "nav.vlai", section: "inspectors", help: "06-vlai" },
  { path: "/rewrite", key: "nav.rewrite", section: "inspectors", help: "06-rewrite" },
  { path: "/cookie", key: "nav.cookie", section: "inspectors", help: "06-cookie" },
  { path: "/actions", key: "nav.actions", section: "inspectors", help: "06-action" },
  { path: "/datasets", key: "nav.lists", section: "data", help: "07-data#списки" },
  {
    path: "/datasets/files",
    key: "nav.files",
    section: "data",
    help: "07-data#файлы-и-сертификаты",
  },
  {
    path: "/datasets/certificates",
    key: "nav.certificates",
    section: "data",
    help: "05-protection#сертификаты-и-закрытые-ключи",
  },
  { path: "/rules", key: "nav.rules", help: "06-modsec#редактор-правил" },
  {
    path: "/ip",
    key: "nav.ipCountries",
    section: "ip",
    help: "06-ip#сырьё-списки-страны-автономные-системы",
  },
  {
    path: "/ip/asn",
    key: "nav.ipAsns",
    section: "ip",
    help: "06-ip#сырьё-списки-страны-автономные-системы",
  },
  { path: "/ip/sets", key: "nav.ipSets", section: "ip", help: "06-ip#составной-набор" },
  {
    path: "/structure/ports",
    key: "nav.ports",
    section: "structure",
    help: "05-protection#адреса-для-прослушивания",
  },
  {
    path: "/structure/upstreams",
    key: "nav.upstreams",
    section: "structure",
    help: "05-protection#защищаемые-серверы",
  },
  {
    path: "/structure/servers",
    key: "nav.servers",
    section: "structure",
    help: "05-protection#виртуальные-серверы",
  },
  {
    path: "/structure/paths",
    key: "nav.paths",
    section: "structure",
    help: "05-protection#маршруты",
  },
  {
    path: "/config/general",
    key: "nav.general",
    section: "config",
    help: "05-config#общая-скелет-файла-память-и-шина",
  },
  {
    path: "/config",
    key: "nav.http",
    section: "config",
    help: "05-config#http-инспекторы-и-справочники",
  },
  {
    path: "/config/haproxy",
    key: "nav.haproxy",
    section: "config",
    help: "05-config#балансировщик-перед-узлами",
  },
  {
    path: "/config/agent",
    key: "nav.agent",
    section: "config",
    help: "05-config#агент-узла-архив-и-темп-выгрузки",
  },
  { path: "/logs", key: "nav.logs", help: "09-logs" },
];

export function helpForPath(pathname: string): string | undefined {
  if (pathname === "/help" || pathname.startsWith("/help/")) {
    return undefined;
  }
  return PAGES.find((row) => row.path === pathname)?.help;
}

export function crumbsForPath(
  pathname: string,
  t: Translate,
  extra: PageBarCrumb[] = [],
): PageBarCrumb[] {
  if (pathname === "/help" || pathname.startsWith("/help/")) {
    return [
      { label: t("nav.help"), to: extra.length > 0 ? "/help" : undefined },
      ...extra,
    ];
  }

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
