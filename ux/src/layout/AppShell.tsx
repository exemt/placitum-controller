import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Drawer from "@mui/material/Drawer";
import Link from "@mui/material/Link";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DnsIcon from "@mui/icons-material/Dns";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import LightModeIcon from "@mui/icons-material/LightMode";
import PolicyIcon from "@mui/icons-material/Policy";
import SettingsIcon from "@mui/icons-material/Settings";
import SubjectIcon from "@mui/icons-material/Subject";
import TranslateIcon from "@mui/icons-material/Translate";
import TuneIcon from "@mui/icons-material/Tune";

import { useT } from "../i18n/index.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setScope } from "../store/slices/session.ts";
import { toggleLocale, toggleTheme } from "../store/slices/ui.ts";
import ConfigLamp from "./ConfigLamp.tsx";
import FleetMenu from "./FleetMenu.tsx";
import Wordmark from "./Wordmark.tsx";
import { APP_HEADER_HEIGHT, PAGE_BAR_HEIGHT } from "../components/PageBar.tsx";
import { PageBarProvider, ShellPageBar, usePageLayout } from "./PageBarHost.tsx";

const DRAWER_WIDTH = 240;

type NavPage = {
  kind: "page";
  to: string;
  key: string;
  icon?: ReactNode;
  // Пути открываются и от сервера -- пункт подсвечиваем по хвосту адреса.
  alsoEndsWith?: string;
};

type NavGroup = {
  kind: "group";
  key: string;
  icon?: ReactNode;
  children: NavNode[];
};

type NavNode = NavPage | NavGroup;

// Порядок меню: сверху то, куда смотрят каждый день -- состояние и журнал.
// Дальше «Инспекторы»: каталог процессов и по странице профилей на каждого.
// За ними «Настройки» -- чем эти профили наполняют (данные, наборы правил,
// наборы адресов), структура контура, его конфигурация, и в самом конце
// наблюдение -- логи и трафик.
const NAV: NavNode[] = [
  { kind: "page", to: "/", key: "nav.fleet", icon: <DnsIcon /> },
  {
    kind: "page",
    to: "/incidents",
    key: "nav.incidents",
    icon: <HistoryIcon />,
  },
  /*
   * Инспекторы: пункт на процесс, а не на слово «профили». Список тот же, что
   * у каналов сходимости (controller/src/convergence/channels.ts): у кого есть
   * канал -- у того есть и страница профилей. Каталог первым: там объявляют
   * сам процесс, профиль -- уже его настройка.
   */
  {
    kind: "group",
    key: "nav.inspectors",
    icon: <PolicyIcon />,
    children: [
      { kind: "page", to: "/inspectors", key: "nav.inspectorCatalog" },
      { kind: "page", to: "/rules/profiles", key: "nav.ruleSets" },
      { kind: "page", to: "/ip/profiles", key: "nav.ip" },
      { kind: "page", to: "/auth", key: "nav.auth" },
      { kind: "page", to: "/captcha", key: "nav.captcha" },
      { kind: "page", to: "/json", key: "nav.json" },
      { kind: "page", to: "/counter", key: "nav.counter" },
      { kind: "page", to: "/vlai", key: "nav.vlai" },
      { kind: "page", to: "/rewrite", key: "nav.rewrite" },
      { kind: "page", to: "/cookie", key: "nav.cookie" },
      { kind: "page", to: "/actions", key: "nav.actions" },
    ],
  },
  // В «Настройках» остаётся то, чем наполняют профили: данные, наборы правил
  // и наборы адресов. Сами профили живут разделом выше.
  {
    kind: "group",
    key: "nav.settings",
    icon: <TuneIcon />,
    children: [
      {
        kind: "group",
        key: "nav.datasets",
        children: [
          { kind: "page", to: "/datasets", key: "nav.lists" },
          { kind: "page", to: "/datasets/files", key: "nav.files" },
          {
            kind: "page",
            to: "/datasets/certificates",
            key: "nav.certificates",
          },
        ],
      },
      { kind: "page", to: "/rules", key: "nav.rules" },
      {
        kind: "group",
        key: "nav.ipData",
        children: [
          { kind: "page", to: "/ip", key: "nav.ipCountries" },
          { kind: "page", to: "/ip/asn", key: "nav.ipAsns" },
          { kind: "page", to: "/ip/sets", key: "nav.ipSets" },
        ],
      },
    ],
  },
  // Структура -- физическая схема контура: порт, апстрим, сервер, путь.
  // Рядом «Конфигурация» правит текст самого nginx, и держать схему внутри
  // неё значило прятать сущности за файлом.
  {
    kind: "group",
    key: "nav.structure",
    icon: <AccountTreeIcon />,
    children: [
      { kind: "page", to: "/structure/ports", key: "nav.ports" },
      { kind: "page", to: "/structure/upstreams", key: "nav.upstreams" },
      { kind: "page", to: "/structure/servers", key: "nav.servers" },
      {
        kind: "page",
        to: "/structure/paths",
        key: "nav.paths",
        alsoEndsWith: "/paths",
      },
    ],
  },
  {
    kind: "group",
    key: "nav.config",
    icon: <SettingsIcon />,
    children: [
      { kind: "page", to: "/config/general", key: "nav.general" },
      { kind: "page", to: "/config", key: "nav.http" },
      { kind: "page", to: "/config/haproxy", key: "nav.haproxy" },
      { kind: "page", to: "/config/agent", key: "nav.agent" },
    ],
  },
  { kind: "page", to: "/logs", key: "nav.logs", icon: <SubjectIcon /> },
];

function pageSelected(node: NavPage, pathname: string): boolean {
  return (
    pathname === node.to ||
    (node.alsoEndsWith !== undefined && pathname.endsWith(node.alsoEndsWith))
  );
}

function groupActive(node: NavGroup, pathname: string): boolean {
  return node.children.some((child) =>
    child.kind === "page"
      ? pageSelected(child, pathname)
      : groupActive(child, pathname),
  );
}

// Значок есть только у верхнего уровня, поэтому первая вложенность отступает
// на его колонку (32px, MuiListItemIcon в theme.tsx) -- подпись встаёт под
// подпись родителя. Дальше хватает половины шага: список узкий, а уровень и
// так виден по шеврону родителя.
function navIndent(depth: number): number {
  return depth === 0 ? 2 : 4 + depth * 2;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const t = useT();
  const dispatch = useAppDispatch();
  const connection = useAppSelector((s) => s.session.connection);
  const themeMode = useAppSelector((s) => s.ui.themeMode);
  const locale = useAppSelector((s) => s.ui.locale);

  const chipColor =
    connection === "online"
      ? "success"
      : connection === "offline"
        ? "error"
        : "default";

  return (
    <PageBarProvider>
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{ zIndex: 1000 }}
      >
        <Toolbar>
          <Wordmark title={t("app.title")} />
          <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center" }}>
            <FleetMenu />
          </Box>
          <Tooltip
            title={locale === "ru" ? t("locale.switchToEn") : t("locale.switchToRu")}
          >
            <IconButton
              size="small"
              onClick={() => dispatch(toggleLocale())}
              sx={{ mr: 0.5 }}
            >
              <TranslateIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={themeMode === "dark" ? t("theme.toLight") : t("theme.toDark")}
          >
            <IconButton
              size="small"
              onClick={() => dispatch(toggleTheme())}
              sx={{ mr: 1 }}
            >
              {themeMode === "dark" ? (
                <LightModeIcon fontSize="small" />
              ) : (
                <DarkModeIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Chip
            size="small"
            variant="outlined"
            label={t("mode.debug")}
            sx={{ mr: 1 }}
          />
          {/* Живость -- лампа слева, сходимость -- свой чип, см. ConfigLamp.tsx. */}
          <ConfigLamp />
          <Chip
            size="small"
            color={chipColor}
            label={t(`connection.${connection}`)}
          />
        </Toolbar>
        <Box
          sx={{
            display: "flex",
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              width: DRAWER_WIDTH,
              minWidth: DRAWER_WIDTH,
              height: PAGE_BAR_HEIGHT,
              display: "flex",
              alignItems: "center",
              boxSizing: "border-box",
              borderRight: 1,
              borderColor: "divider",
            }}
          >
            <ScopeSelect />
          </Box>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <ShellPageBar />
          </Box>
        </Box>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            top: APP_HEADER_HEIGHT,
            height: `calc(100% - ${APP_HEADER_HEIGHT}px)`,
            borderRadius: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
          <NavList nodes={NAV} depth={0} pathname={location.pathname} />
        </Box>
        {/*
          Справка и лицензия -- не разделы панели, а ссылки под списком: у них
          нет объектов, состояния и кнопок, и значок в одном ряду с разделами
          обещал бы страницу того же рода.
        */}
        <Box
          sx={{
            borderTop: 1,
            borderColor: "divider",
            px: 2,
            py: 1.25,
            display: "flex",
            gap: 1.5,
          }}
        >
          <DrawerLink
            to="/help"
            label={t("nav.help")}
            pathname={location.pathname}
          />
          <DrawerLink
            to="/license"
            label={t("nav.license")}
            pathname={location.pathname}
          />
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}
      >
        <Toolbar />
        <Box sx={{ height: PAGE_BAR_HEIGHT, minHeight: PAGE_BAR_HEIGHT }} />
        <MainContent>{children}</MainContent>
      </Box>
      </Box>
    </PageBarProvider>
  );
}

/** Ссылка под списком разделов: подсвечена, пока открыт её адрес. */
function DrawerLink({
  to,
  label,
  pathname,
}: {
  to: string;
  label: string;
  pathname: string;
}) {
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      component={NavLink}
      to={to}
      underline="hover"
      sx={{
        fontSize: "0.8rem",
        color: active ? "primary.main" : "text.secondary",
      }}
    >
      {label}
    </Link>
  );
}

function MainContent({ children }: { children: ReactNode }) {
  const { flush } = usePageLayout();

  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        p: flush ? 0 : 3,
        bgcolor: flush
          ? (theme) =>
              theme.palette.mode === "light"
                ? "#ffffff"
                : theme.palette.background.paper
          : undefined,
      }}
    >
      {children}
    </Box>
  );
}

function ScopeSelect() {
  const dispatch = useAppDispatch();
  const spaces = useAppSelector((s) => s.session.spaces);
  const scope = useAppSelector((s) => s.session.scope);

  if (spaces.length === 0) {
    return null;
  }

  return (
    <Select
      value={scope ?? ""}
      onChange={(e) => {
        dispatch(setScope(e.target.value));
      }}
      displayEmpty
      fullWidth
      sx={{
        // Селектор -- левый край полосы крошек, а не поле в ней: он занимает
        // ячейку целиком, рамки не имеет, а снизу его подчёркивает рамка
        // самого AppBar -- своя добавила бы вторую линию рядом.
        height: PAGE_BAR_HEIGHT,
        borderRadius: 0,
        fontSize: "0.8rem",
        fontWeight: 600,
        "& .MuiSelect-select": {
          py: 0,
          // 16 -- вертикаль списка под полосой: имя области начинается там же,
          // где значки разделов.
          pl: 2,
          pr: 3,
          height: PAGE_BAR_HEIGHT,
          display: "flex",
          alignItems: "center",
        },
        "& .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&:hover": { bgcolor: "action.hover" },
        "& .MuiSelect-icon": {
          fontSize: 18,
          right: 6,
        },
      }}
    >
      {spaces.map((row) => (
        <MenuItem key={row.uuid} value={row.uuid} sx={{ fontSize: "0.8rem" }}>
          {row.name}
        </MenuItem>
      ))}
    </Select>
  );
}

function NavList({
  nodes,
  depth,
  pathname,
}: {
  nodes: readonly NavNode[];
  depth: number;
  pathname: string;
}) {
  return (
    <List dense disablePadding sx={depth === 0 ? { py: 0.5 } : undefined}>
      {nodes.map((node) =>
        node.kind === "page" ? (
          <NavRow key={node.to} node={node} depth={depth} pathname={pathname} />
        ) : (
          <NavSection
            key={node.key}
            node={node}
            depth={depth}
            pathname={pathname}
          />
        ),
      )}
    </List>
  );
}

function NavRow({
  node,
  depth,
  pathname,
}: {
  node: NavPage;
  depth: number;
  pathname: string;
}) {
  const t = useT();

  return (
    <ListItemButton
      component={NavLink}
      to={node.to}
      selected={pageSelected(node, pathname)}
      sx={{ pl: navIndent(depth) }}
    >
      {node.icon !== undefined ? (
        <ListItemIcon>{node.icon}</ListItemIcon>
      ) : null}
      <ListItemText primary={t(node.key)} />
    </ListItemButton>
  );
}

function NavSection({
  node,
  depth,
  pathname,
}: {
  node: NavGroup;
  depth: number;
  pathname: string;
}) {
  const t = useT();
  const active = groupActive(node, pathname);
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) {
      setOpen(true);
    }
  }, [active]);

  return (
    <>
      <ListItemButton
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        sx={{ pl: navIndent(depth) }}
      >
        {node.icon !== undefined ? (
          <ListItemIcon>{node.icon}</ListItemIcon>
        ) : null}
        <ListItemText primary={t(node.key)} />
        {open ? (
          <ExpandLessIcon fontSize="small" />
        ) : (
          <ExpandMoreIcon fontSize="small" />
        )}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <NavList nodes={node.children} depth={depth + 1} pathname={pathname} />
      </Collapse>
    </>
  );
}
