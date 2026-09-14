import { useEffect, useMemo, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import { Form } from "../components/Form.tsx";
import {
  DataTable,
  RowActionsHead,
  TableIconButton,
  TableNotice,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import {
  AuthUsersDialog,
  FORM_AUTH_USERS,
  type AuthUsersPayload,
} from "./auth-users-dialog.tsx";
import type {
  ActionRegistry,
  AuthPriorRule,
  AuthProfile,
  AuthProfileDoc,
  AuthSource,
  AuthSourceDoc,
} from "../api.ts";
import {
  AUTH_JWT_ALGS,
  axesFor,
  fetchActions,
  fetchInspectors,
  verbsFor,
  weakeningVerbs,
  type InspectorMeta,
} from "../api.ts";
import { axisLabel, verbLabel } from "../components/action-select.tsx";
import { SignalsBlock } from "../components/signals-block.tsx";
import { AuthRulesBlock } from "./auth-rules.tsx";
import ChannelNotice, { pageNoticeSx } from "../components/ChannelNotice.tsx";
import {
  Chips,
  Flag,
  InlineFlag,
  Num,
  Pick,
  Section,
  Text,
  UnderlayTabs,
} from "../components/fields.tsx";
import { PAGE_RAIL, TABLE_RAIL } from "../components/PageBar.tsx";
import { SettingsRow, SettingsTable } from "../components/settings-table.tsx";
import { useLayerTab } from "../config/layer-tabs.tsx";
import { useT } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { onFormOpen } from "../store/forms.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  clearSent,
  closePanel,
  closeSourcePanel,
  copyAuthProfile,
  copyAuthSource,
  loadAuthDatasets,
  loadAuthDenyResponses,
  loadAuthLocations,
  loadAuthProfileDetail,
  loadAuthProfiles,
  loadAuthServers,
  loadAuthSourceDetail,
  loadAuthSources,
  openPanel,
  openSourcePanel,
  removeAuthProfile,
  removeAuthSource,
  restoreAuthProfileThunk,
  saveAuthProfileThunk,
  saveAuthSourceThunk,
  sendAuth,
} from "../store/slices/pages/auth.ts";

/* Та же ширина, что у капчи: таблица сигналов иначе не помещается. */
const PANEL_WIDTH = 680;
const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const PROVIDERS = ["local", "code", "ldap", "ntlm", "jwt", "app"] as const;

type ProviderKind = (typeof PROVIDERS)[number];

/*
 * Способ входа -- один провайдер на источник. Здесь их показывают человеческим
 * именем с пояснением: голые local/ldap/ntlm ничего не говорят тому, кто
 * настраивает калитку впервые, а выбор между ними -- главное решение
 * источника. «Пароль плюс TOTP» -- два источника и две калитки на маршруте.
 */
/*
 * Откуда берётся сессия -- первый выбор источника, и способов три, а не шесть.
 * У них разные поля целиком: своему входу нужны форма, кука и провайдер
 * пароля; чужому токену -- где он лежит, чем его проверять и какие поля
 * читать; сессии приложения -- его кука и то, как подсмотреть вход. Шесть
 * провайдеров одним списком показывали оператору поля, которых у его способа
 * нет, поэтому провайдер пароля выбирается вторым шагом и только у своего
 * входа.
 */
const MODE_ORDER = ["own", "jwt", "app"] as const;

type SourceMode = (typeof MODE_ORDER)[number];

/* Провайдеры своего входа: чем контур проверяет пароль. */
const OWN_PROVIDERS: ProviderKind[] = ["local", "ldap", "ntlm", "code"];

/* Внешние провайдеры: сессию выписывает не контур, формы и билета у них нет. */
const EXTERNAL: ReadonlySet<ProviderKind> = new Set(["jwt", "app"]);

function modeOf(provider: ProviderKind): SourceMode {
  return provider === "jwt" || provider === "app" ? provider : "own";
}

/*
 * Откуда источник читает сессию: своя кука контура, кука или заголовок чужого
 * токена, кука приложения. Одна колонка на все три способа -- вопрос у
 * оператора один, а «кука сессии» у внешних источников не существует.
 */
function sessionCookieOf(row: AuthSource): string {
  const doc = row.doc;

  if (doc?.provider === "jwt") {
    return doc.providers.jwt?.cookie !== ""
      ? (doc.providers.jwt?.cookie ?? "")
      : (doc.providers.jwt?.header ?? "");
  }

  if (doc?.provider === "app") {
    return doc.providers.app?.cookie ?? "";
  }

  return doc?.session?.cookie === ""
    ? `waf_sid_${row.name}`
    : (doc?.session?.cookie ?? "");
}

const APP_FIELD_SOURCES = ["body.form", "body.json", "args", "header"] as const;

const LDAP_BINDS = ["upn", "dn_template", "search"] as const;

/* Привязки куки сессии: адреса (ip) у калитки нет, только подсеть и браузер. */
const BINDS = ["subnet", "ua"] as const;

/*
 * Глаголы, которые калитка умеет применять. Словарь приезжает с /api/actions,
 * но он общий на контур и не знает, что у калитки нет ни порога (threshold),
 * ни памяти про субъектов (note); отказывает таким правилам её загрузчик.
 * Пересечение с этим множеством не даёт собрать мышью правило, которое потом
 * не сохранится.
 */
const AUTH_VERBS = new Set<string>(["reauth"]);

/*
 * Две вкладки, как у счётчика: источники объявляются один раз, профили лишь
 * ссылаются на них, и порядок вкладок повторяет порядок настройки.
 */
const AUTH_VIEWS = ["sources", "profiles"] as const;

type AuthView = (typeof AUTH_VIEWS)[number];

/** Выбранная вкладка переживает уход со страницы -- как разделы конфига. */
const VIEW_KEY = "waf.auth.view";

type CodeCfg = NonNullable<AuthSourceDoc["providers"]["code"]>;
type LdapCfg = NonNullable<AuthSourceDoc["providers"]["ldap"]>;
type NtlmCfg = NonNullable<AuthSourceDoc["providers"]["ntlm"]>;
type JwtCfg = NonNullable<AuthSourceDoc["providers"]["jwt"]>;
type AppCfg = NonNullable<AuthSourceDoc["providers"]["app"]>;

/*
 * Умолчания повторяют sourceDefaults() инспектора. Форма, создающая источник
 * не таким, каким его сделал бы файл, -- источник расхождений, которые
 * ловятся уже на стенде.
 */
function emptySourceDoc(): AuthSourceDoc {
  return {
    login: { uri: "", title: "", note: "", page: "" },
    /*
     * Кука пустая -- умолчание инспектора: waf_sid_<имя источника>. Кука
     * уникальна на источник, и печатать одинаковый литерал всем значило бы
     * склеить их куки в одну.
     */
    session: {
      cookie: "",
      ttlS: 8 * 3600,
      renewAfterS: 0,
      bind: ["subnet", "ua"],
      subnet: { v4: 24, v6: 64 },
    },
    ticket: { cookie: "", ttlS: 600 },
    list: {
      sessions: "",
      cookie: "waf_sess",
      ttlS: 0,
      origin: "auth",
      graceS: 0,
    },
    upstream: {
      user: "X-WAF-User",
      groups: "X-WAF-Groups",
      method: "X-WAF-Auth",
      cookie: "",
      ttlS: 0,
    },
    provider: "local",
    identity: { from: "" },
    providers: {
      local: { users: "" },
      code: null,
      ldap: null,
      ntlm: null,
      jwt: null,
      app: null,
    },
    lockout: { attempts: 5, windowS: 600, lockS: 900 },
    roster: { store: "redis", prefix: "auth:", revokeRefreshMs: 2000 },
  };
}

/* Секция провайдера заводится с умолчаниями инспектора при первом выборе. */
function codeDefaults(users: string): CodeCfg {
  return { kind: "totp", digits: 6, periodS: 30, skew: 1, codes: [], users };
}

function ldapDefaults(): LdapCfg {
  return {
    url: "",
    startTls: false,
    bind: "search",
    upnSuffix: "",
    dnTemplate: "",
    timeoutS: 3,
    groups: [],
    search: {
      base: "",
      filter: "(&(objectClass=inetOrgPerson)(uid=%s))",
      bindDn: "",
      passwordEnv: "",
      passwordStore: null,
    },
    tls: { caFile: "", insecureSkipVerify: false },
  };
}

function ntlmDefaults(): NtlmCfg {
  return {
    url: "",
    domain: "",
    timeoutS: 3,
    startTls: false,
    groups: [],
    search: {
      base: "",
      filter: "(&(objectClass=user)(sAMAccountName=%s))",
      bindDn: "",
      passwordEnv: "",
      passwordStore: null,
    },
    tls: { caFile: "", insecureSkipVerify: false },
  };
}

/* Умолчания claims -- имена RFC 7519; без ключа разбор без проверки. */
function jwtDefaults(): JwtCfg {
  return {
    cookie: "access_token",
    header: "",
    prefix: "Bearer",
    verify: {
      alg: "none",
      key: "",
      secretEnv: "",
      issuer: "",
      audience: "",
      leewayS: 0,
    },
    claims: {
      user: "sub",
      session: "sid",
      groups: "",
      issued: "iat",
      expiry: "exp",
    },
  };
}

function appDefaults(): AppCfg {
  return {
    cookie: "",
    learn: {
      login: { uri: "", method: "POST" },
      logout: { uri: "", method: "POST" },
      success: { status: [200, 302, 303], cookieNew: true, json: null },
      user: { from: "body.form", field: "username" },
    },
  };
}

/* Умолчания повторяют profileDefaults() инспектора. */
function emptyProfileDoc(): AuthProfileDoc {
  return {
    source: "",
    gate: {
      redirectMethods: ["GET", "HEAD"],
      redirectStatus: 303,
      denyResponse: "auth_required",
      htmlOnly: true,
      /* Допуска нет: новый профиль пускает всякого, кто прошёл вход. */
      groups: [],
      forbiddenResponse: "auth_forbidden",
      /* Умолчание -- редирект: форму телом ответа включают осознанно. */
      inline: false,
    },
    /*
     * Просьбу «спросить вход заново» новый профиль слушает от всех: reauth --
     * ужесточение, широковещательное правило для него безопасно (см.
     * docs/inspector-actions.md), а калитка, глухая к каналу по умолчанию,
     * свела бы его смысл к нулю.
     */
    rules: [],
    trigger: {
      prior: [{ from: "*", accept: ["reauth"], apply: [], codes: [] }],
      reauthAfterS: 300,
    },
  };
}

/** Число из строки поля: пустое и мусор -- ноль, как у капчи. */
function num(value: string): number {
  return Number(value) || 0;
}

/** Пункт «—» плюс имена: селектор без выбора показывает прочерк, а не пустоту. */
function nameOptions(
  names: readonly string[],
): { value: string; label: string }[] {
  return [
    { value: "", label: "—" },
    ...names.map((value) => ({ value, label: value })),
  ];
}

/*
 * Селектор с той же метрикой, что у строки `Pick select` в таблице: без рамки
 * и подчёркивания -- рамка вокруг значения читалась бы полем внутри таблицы.
 */
const selectRowSx = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  "& .MuiSelect-select": {
    py: 0,
    pl: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
} as const;

/**
 * Строка-селектор с кнопкой у правого края ячейки. Список пользователей
 * выбирают полем, а правят соседней шестерёнкой: записей в нём бывают сотни,
 * и в ячейке значения им места нет. У `Pick` такого слота нет намеренно --
 * кнопка в строке нужна одному полю на всю панель.
 */
function SelectActionRow({
  label,
  help,
  value,
  options,
  action,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  options: readonly { value: string; label: string }[];
  action: ReactNode;
  onChange: (next: string) => void;
}) {
  return (
    <SettingsRow label={label} help={help} end={action}>
      <Select
        value={value}
        variant="standard"
        disableUnderline
        fullWidth
        inputProps={{ "aria-label": label }}
        onChange={(e) => onChange(String(e.target.value))}
        sx={selectRowSx}
      >
        {options.map((option) => (
          <MenuItem
            key={option.value}
            value={option.value}
            sx={{ fontSize: "0.8rem" }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </SettingsRow>
  );
}

/** Замечание под таблицей секции: тот же отступ, что у капчи под адресом. */
function SectionNote({
  message,
  warning,
}: {
  message: string;
  warning?: boolean;
}) {
  return (
    <Box sx={{ px: 2, py: 1 }}>
      <TableNotice
        kind="info"
        severity={warning === true ? "warning" : undefined}
        message={message}
      />
    </Box>
  );
}

export default function AuthProfiles() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.auth.rows);
  const sources = useAppSelector((s) => s.pages.auth.sources);
  const loading = useAppSelector((s) => s.pages.auth.loading);
  const error = useAppSelector((s) => s.pages.auth.error);
  const panelId = useAppSelector((s) => s.pages.auth.panelId);
  const sourcePanelId = useAppSelector((s) => s.pages.auth.sourcePanelId);
  const sending = useAppSelector((s) => s.pages.auth.sending);
  const sent = useAppSelector((s) => s.pages.auth.sent);
  const servers = useAppSelector((s) => s.pages.auth.servers);
  const [view, setView] = useLayerTab<AuthView>(VIEW_KEY, AUTH_VIEWS);
  const pager = usePager(rows);
  const sourcePager = usePager(sources);
  const ops = useRowOps<AuthProfile>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.profileTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(
          copyAuthProfile({ scope: scope ?? "", id: row.uuid, name }),
        ),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeAuthProfile({ scope: scope ?? "", id: row.uuid })),
      ),
  });
  const sourceOps = useRowOps<AuthSource>({
    nameOf: (row) => row.name,
    copyTitle: t("copyModal.sourceTitle"),
    copy: async (row, name) =>
      thunkError(
        await dispatch(
          copyAuthSource({ scope: scope ?? "", id: row.uuid, name }),
        ),
      ),
    remove: async (row) =>
      thunkError(
        await dispatch(removeAuthSource({ scope: scope ?? "", id: row.uuid })),
      ),
  });

  usePageBar({
    flush: scope !== null,
    onCreate: () => {
      if (view === "sources") {
        dispatch(openSourcePanel(null));
        return;
      }

      dispatch(openPanel(null));
    },
    onUpdate: () => {
      void dispatch(loadAuthProfiles(scope));
      void dispatch(loadAuthSources(scope));
      void dispatch(loadAuthServers(scope));
      void dispatch(loadAuthDatasets(scope));
      void dispatch(loadAuthDenyResponses(scope));
    },
    onSend: () => {
      if (scope !== null) {
        void dispatch(sendAuth(scope));
      }
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
    sendDisabled: sending || scope === null || rows.length === 0,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      <ChannelNotice id="auth" />
      {error !== null && (
        <Alert severity="error" icon={false} sx={pageNoticeSx}>
          {error}
        </Alert>
      )}
      {sent !== null && (
        <Alert
          severity="success"
          icon={false}
          sx={pageNoticeSx}
          onClose={() => dispatch(clearSent())}
        >
          {t("auth.sentHint")} {sent}
        </Alert>
      )}
      <Box
        sx={{
          pl: `${TABLE_RAIL}px`,
          pr: `${PAGE_RAIL}px`,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <UnderlayTabs
          value={view}
          onChange={setView}
          items={[
            { value: "sources", label: t("auth.sectionSources") },
            { value: "profiles", label: t("auth.sectionProfiles") },
          ]}
        />
      </Box>

      {view === "sources" ? (
        <DataTable loading={loading} error={error}>
          <DataTable.Head>
            <TableCell>{t("common.name")}</TableCell>
            <TableCell>{t("auth.method")}</TableCell>
            <TableCell>{t("auth.server")}</TableCell>
            <TableCell>{t("auth.loginUri")}</TableCell>
            <TableCell>{t("auth.sessionCookie")}</TableCell>
            <RowActionsHead />
          </DataTable.Head>
          <DataTable.Body>
            {sourcePager.rows.map((row) => (
              <TableRow
                key={row.uuid}
                hover
                selected={sourcePanelId === row.uuid}
                onClick={() => {
                  dispatch(openSourcePanel(row.uuid));
                  void dispatch(loadAuthSourceDetail({ scope, id: row.uuid }));
                }}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Chip
                      size="small"
                      label={t(`auth.factor.${row.provider}`)}
                    />
                    {row.doc?.identity?.from ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={t("auth.after", { from: row.doc.identity.from })}
                      />
                    ) : null}
                  </Stack>
                </TableCell>
                <TableCell>
                  {servers.find((item) => item.uuid === row.server_id)?.name ??
                    ""}
                </TableCell>
                <TableCell>
                  {row.doc?.login?.uri === ""
                    ? "—"
                    : (row.doc?.login?.uri ?? "")}
                </TableCell>
                {/*
                  Откуда читается сессия, а не «кука контура»: у чужого токена
                  это его кука или заголовок, у сессии приложения -- кука
                  приложения. Печатать здесь waf_sid_<имя> означало бы назвать
                  куку, которой у источника нет.
                */}
                <TableCell>{sessionCookieOf(row)}</TableCell>
                {sourceOps.cell(row)}
              </TableRow>
            ))}
          </DataTable.Body>
          <DataTable.Empty
            message={t("auth.sourcesEmpty")}
            actionLabel={t("common.create")}
            onAction={() => dispatch(openSourcePanel(null))}
          />
          <DataTable.Error
            onRetry={() => void dispatch(loadAuthSources(scope))}
          />
          <DataTable.Pager pager={sourcePager} />
        </DataTable>
      ) : (
        <DataTable loading={loading} error={error}>
          <DataTable.Head>
            <TableCell>{t("common.name")}</TableCell>
            <TableCell>{t("auth.source")}</TableCell>
            <TableCell>{t("auth.gateGroups")}</TableCell>
            <RowActionsHead />
          </DataTable.Head>
          <DataTable.Body>
            {pager.rows.map((row) => (
              <TableRow
                key={row.uuid}
                hover
                selected={panelId === row.uuid}
                onClick={() => {
                  dispatch(openPanel(row.uuid));
                  void dispatch(loadAuthProfileDetail({ scope, id: row.uuid }));
                }}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.source}</TableCell>
                <TableCell>
                  {(row.doc?.gate?.groups ?? []).length > 0 ? (
                    <Stack direction="row" spacing={0.5}>
                      {row.doc.gate.groups.map((group) => (
                        <Chip key={group} size="small" label={group} />
                      ))}
                    </Stack>
                  ) : (
                    ""
                  )}
                </TableCell>
                {ops.cell(row, {
                  remove:
                    row.name === "default" ? t("auth.lockedDelete") : undefined,
                })}
              </TableRow>
            ))}
          </DataTable.Body>
          <DataTable.Empty
            message={t("auth.empty")}
            actionLabel={t("common.create")}
            onAction={() => dispatch(openPanel(null))}
          />
          <DataTable.Error
            onRetry={() => void dispatch(loadAuthProfiles(scope))}
          />
          <DataTable.Pager pager={pager} />
        </DataTable>
      )}
      {ops.modals}
      {sourceOps.modals}
      <Drawer
        anchor="right"
        open={sourcePanelId !== undefined}
        onClose={() => dispatch(closeSourcePanel())}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: PANEL_WIDTH },
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {sourcePanelId !== undefined && (
          <AuthSourceForm
            key={sourcePanelId ?? "new"}
            scope={scope}
            id={sourcePanelId}
            onClose={() => dispatch(closeSourcePanel())}
          />
        )}
      </Drawer>
      <Drawer
        anchor="right"
        open={panelId !== undefined}
        onClose={() => dispatch(closePanel())}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: PANEL_WIDTH },
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {panelId !== undefined && (
          <AuthProfileForm
            key={panelId ?? "new"}
            scope={scope}
            id={panelId}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </>
  );
}

/* --- форма источника -------------------------------------------------------- */

/*
 * Секции идут в порядке настройки, как у капчи: кто и как входит, где форма,
 * что потом -- сессия, живой список, приложение. Обязательное для рабочего
 * источника раскрыто сразу, остальное сложено: у нового источника разумные
 * умолчания, и разворачивают их, когда есть зачем.
 */
function AuthSourceForm({
  scope,
  id,
  onClose,
}: {
  scope: string;
  id: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const detail = useAppSelector((s) => s.pages.auth.sourceDetail);
  const sources = useAppSelector((s) => s.pages.auth.sources);
  const userLists = useAppSelector((s) => s.pages.auth.userLists);
  const servers = useAppSelector((s) => s.pages.auth.servers);
  const locations = useAppSelector((s) => s.pages.auth.locations);
  const datasets = useAppSelector((s) => s.pages.auth.datasets);
  const pages = useAppSelector((s) => s.pages.auth.pages);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serverId, setServerId] = useState<string | null>(null);
  const [doc, setDoc] = useState<AuthSourceDoc>(emptySourceDoc());

  useEffect(() => {
    if (id !== null && detail !== null && detail.uuid === id) {
      setName(detail.name);
      setDescription(detail.description);
      setServerId(detail.server_id);
      setDoc({ ...emptySourceDoc(), ...detail.doc });
    }
  }, [id, detail]);

  /*
   * Пользователи -- записи выбранного списка. Читаются тем же API, что и любой
   * другой набор: своей сущности у них больше нет. Сами записи форма не
   * показывает и не грузит -- их правят в окне за шестерёнкой
   * ([AuthUsersDialog]), форме от списка нужен только его uuid.
   */
  const usersList = useMemo(
    () =>
      userLists.find((row) => row.name === doc.providers.local?.users) ?? null,
    [userLists, doc.providers.local],
  );
  const openUsers = onFormOpen(FORM_AUTH_USERS);

  /* Список локейшенов принадлежит серверу и перезагружается вместе с ним. */
  useEffect(() => {
    void dispatch(loadAuthLocations({ scope, serverId }));
  }, [dispatch, scope, serverId]);

  const listNames = useMemo(
    () => userLists.map((row) => row.name),
    [userLists],
  );

  /*
   * Адрес формы выбирают только среди локейшенов с waf off: на маршруте с
   * включённой калиткой вход требовал бы входа. Локейшен без явного waf
   * наследует его от сервера, и полагаться на наследование тут нельзя.
   */
  const addressable = useMemo(
    () =>
      /* Именованный и регулярный location адресом формы быть не могут. */
      locations.filter(
        (row) => row.match === "prefix" || row.match === "exact",
      ),
    [locations],
  );

  /*
   * Любой адресуемый локейшен сервера: инспекторы на нём не помеха, калитка
   * узнаёт свой адрес сама и отвечает на нём allow.
   */
  const loginPaths = useMemo(
    () => addressable.map((row) => row.path),
    [addressable],
  );

  /* Личность стыкованному источнику приносит первый, не кодовый и не он сам. */
  const identitySources = useMemo(
    () =>
      sources
        .filter((row) => row.uuid !== id && row.provider !== "code")
        .map((row) => row.name),
    [sources, id],
  );

  const nameOk = NAME_RE.test(name);
  const waiting = id !== null && (detail === null || detail.uuid !== id);

  const patch = (next: Partial<AuthSourceDoc>) => setDoc({ ...doc, ...next });
  const patchLogin = (next: Partial<AuthSourceDoc["login"]>) =>
    patch({ login: { ...doc.login, ...next } });
  const patchSession = (next: Partial<AuthSourceDoc["session"]>) =>
    patch({ session: { ...doc.session, ...next } });
  const patchList = (next: Partial<AuthSourceDoc["list"]>) =>
    patch({ list: { ...doc.list, ...next } });
  const patchUpstream = (next: Partial<AuthSourceDoc["upstream"]>) =>
    patch({ upstream: { ...doc.upstream, ...next } });
  const patchLockout = (next: Partial<AuthSourceDoc["lockout"]>) =>
    patch({ lockout: { ...doc.lockout, ...next } });
  const patchProviders = (next: Partial<AuthSourceDoc["providers"]>) =>
    patch({ providers: { ...doc.providers, ...next } });

  const code = doc.providers.code;
  const ldap = doc.providers.ldap;
  const ntlm = doc.providers.ntlm;
  const patchCode = (next: Partial<CodeCfg>) =>
    code !== null && patchProviders({ code: { ...code, ...next } });
  const patchLdap = (next: Partial<LdapCfg>) =>
    ldap !== null && patchProviders({ ldap: { ...ldap, ...next } });
  const patchLdapSearch = (next: Partial<LdapCfg["search"]>) =>
    ldap !== null && patchLdap({ search: { ...ldap.search, ...next } });
  const patchNtlm = (next: Partial<NtlmCfg>) =>
    ntlm !== null && patchProviders({ ntlm: { ...ntlm, ...next } });

  const jwt = doc.providers.jwt;
  const app = doc.providers.app;
  const patchJwt = (next: Partial<JwtCfg>) =>
    jwt !== null && patchProviders({ jwt: { ...jwt, ...next } });
  const patchJwtVerify = (next: Partial<JwtCfg["verify"]>) =>
    jwt !== null && patchJwt({ verify: { ...jwt.verify, ...next } });
  const patchJwtClaims = (next: Partial<JwtCfg["claims"]>) =>
    jwt !== null && patchJwt({ claims: { ...jwt.claims, ...next } });
  const patchApp = (next: Partial<AppCfg>) =>
    app !== null && patchProviders({ app: { ...app, ...next } });
  const patchLearn = (next: Partial<AppCfg["learn"]>) =>
    app !== null && patchApp({ learn: { ...app.learn, ...next } });
  const patchSuccess = (next: Partial<AppCfg["learn"]["success"]>) =>
    app !== null && patchLearn({ success: { ...app.learn.success, ...next } });

  /* Секция провайдера показывается только для выбранного. */
  const has = (kind: ProviderKind) => doc.provider === kind;
  const external = EXTERNAL.has(doc.provider as ProviderKind);
  const mode = modeOf(doc.provider as ProviderKind);

  const setProvider = (provider: ProviderKind) => {
    const providers = { ...doc.providers };

    /* Выбрали провайдер -- заводим его секцию с умолчаниями, иначе источник не
     * пройдёт проверку на контроллере с невнятным "is not set". */
    if (provider === "local" && providers.local === null) {
      providers.local = { users: listNames[0] ?? "" };
    }

    if (provider === "code" && providers.code === null) {
      providers.code = codeDefaults(listNames[0] ?? "");
    }

    if (provider === "ldap" && providers.ldap === null) {
      providers.ldap = ldapDefaults();
    }

    if (provider === "ntlm" && providers.ntlm === null) {
      providers.ntlm = ntlmDefaults();
    }

    if (provider === "jwt" && providers.jwt === null) {
      providers.jwt = jwtDefaults();
    }

    if (provider === "app" && providers.app === null) {
      providers.app = appDefaults();
    }

    /* identity.from имеет смысл только для TOTP. */
    const identity = provider === "code" ? doc.identity : { from: "" };

    setDoc({ ...doc, provider, identity, providers });
  };

  /*
   * Смена способа. Свой вход возвращается на список контура: провайдер
   * пароля выбирается следующей строкой, и оставлять там прежний ldap с
   * пустым url значило бы отдать оператору форму, которая не сохранится.
   */
  const setMode = (next: SourceMode) => {
    if (next !== mode) {
      setProvider(next === "own" ? "local" : next);
    }
  };

  /*
   * Форма входа у своего способа и страница входа приложения у внешних --
   * одна секция: сервер и его локейшен. Место разное: своя форма стоит до
   * куки сессии, чужая страница -- в конце, когда сам способ уже описан.
   */
  const loginSection = (
    <Section
      title={external ? t("auth.sectionAppLogin") : t("auth.sectionLogin")}
      hint={
        external ? t("auth.sectionAppLoginHint") : t("auth.sectionLoginHint")
      }
      flush
      defaultExpanded
    >
      <SettingsTable aside={false}>
        <Pick
          select
          label={t("auth.server")}
          helper={t("auth.serverHint")}
          value={serverId ?? ""}
          options={[
            { value: "", label: "—" },
            ...servers.map((row) => ({ value: row.uuid, label: row.name })),
          ]}
          onChange={(value) => {
            setServerId(value === "" ? null : value);
            /* Сервер сменился -- прежний путь к нему не относится. */
            patchLogin({ uri: "" });
          }}
        />
        <Pick
          select
          label={external ? t("auth.appLoginPage") : t("auth.loginUri")}
          helper={t("auth.loginUriHint")}
          value={doc.login.uri}
          /*
                  Записанный адрес остаётся пунктом, даже если локейшены ещё не
                  доехали или его снесли: селектор молча показывал бы пустоту
                  вместо действующего значения.
                */
          options={nameOptions(
            doc.login.uri === "" || loginPaths.includes(doc.login.uri)
              ? loginPaths
              : [doc.login.uri, ...loginPaths],
          )}
          onChange={(uri) => patchLogin({ uri })}
        />
        {!external && (
          <>
            <Text
              label={t("auth.loginTitle")}
              value={doc.login.title}
              onChange={(title) => patchLogin({ title })}
            />
            <Text
              label={t("auth.loginNote")}
              value={doc.login.note}
              onChange={(note) => patchLogin({ note })}
            />
            <Pick
              select
              label={t("auth.loginPage")}
              helper={t("auth.loginPageHint")}
              value={doc.login.page}
              options={[
                { value: "", label: t("auth.loginPageBuiltin") },
                ...pages.map((row) => ({ value: row.uuid, label: row.name })),
              ]}
              onChange={(page) => patchLogin({ page })}
            />
          </>
        )}
      </SettingsTable>
      {serverId !== null && loginPaths.length === 0 && (
        <SectionNote message={t("auth.loginUriNone")} warning />
      )}
    </Section>
  );

  return (
    <Form id="auth-source">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("auth.newSourceTitle") : t("auth.editSourceTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body spacing={2} scroll>
        <Section
          title={t("auth.sectionSource")}
          hint={t("auth.sectionSourceHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={t("auth.sourceNameHint")}
              value={name}
              onChange={setName}
            />
            <Text
              label={t("auth.description")}
              value={description}
              onChange={setDescription}
            />
          </SettingsTable>
        </Section>

        {/*
          Способ и всё, что ему нужно. Наверху -- откуда берётся сессия, под
          ним у своего входа второй выбор: чем проверяем пароль. Поля чужого
          токена и сессии приложения живут своими секциями ниже: у них с
          формой и кукой контура нет ничего общего.
        */}
        <Section
          title={t("auth.sectionMode")}
          hint={t("auth.sectionModeHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Pick
              label={t("auth.mode")}
              helper={t(`auth.modeHint.${mode}`)}
              value={mode}
              options={MODE_ORDER.map((kind) => ({
                value: kind,
                label: t(`auth.modes.${kind}`),
              }))}
              onChange={setMode}
            />

            {mode === "own" && (
              <Pick
                select
                label={t("auth.provider")}
                helper={t(`auth.factorHint.${doc.provider}`)}
                value={doc.provider as ProviderKind}
                options={OWN_PROVIDERS.map((kind) => ({
                  value: kind,
                  label: t(`auth.factor.${kind}`),
                }))}
                onChange={setProvider}
              />
            )}

            {has("local") && (
              <SelectActionRow
                label={t("auth.localUsers")}
                help={t("auth.localUsersHint")}
                value={doc.providers.local?.users ?? ""}
                options={nameOptions(listNames)}
                onChange={(value) =>
                  patchProviders({ local: { users: value } })
                }
                action={
                  <TableIconButton
                    icon={<SettingsOutlinedIcon />}
                    tooltip={
                      usersList === null
                        ? t("auth.usersPick")
                        : t("auth.usersOpen")
                    }
                    disabled={usersList === null}
                    onClick={() => {
                      if (usersList !== null) {
                        openUsers({
                          scope,
                          datasetId: usersList.uuid,
                          name: usersList.name,
                        } satisfies AuthUsersPayload);
                      }
                    }}
                  />
                }
              />
            )}

            {has("code") && code !== null && (
              <>
                <Pick
                  label={t("auth.codeKind")}
                  helper={t("auth.codeKindHint")}
                  value={code.kind}
                  options={[
                    { value: "totp", label: t("auth.codeTotp") },
                    { value: "static", label: t("auth.codeStatic") },
                  ]}
                  onChange={(kind) => patchCode({ kind })}
                />
                {code.kind === "totp" && (
                  <>
                    {/* Личность приносит первый источник цепочки: пароль там, код здесь. */}
                    <Pick
                      select
                      label={t("auth.identityFrom")}
                      helper={t("auth.identityFromHint")}
                      value={doc.identity.from}
                      options={nameOptions(identitySources)}
                      onChange={(from) => patch({ identity: { from } })}
                    />
                    <Pick
                      select
                      label={t("auth.codeUsers")}
                      helper={t("auth.codeUsersHint")}
                      value={code.users}
                      options={nameOptions(listNames)}
                      onChange={(users) => patchCode({ users })}
                    />
                  </>
                )}
                {code.kind === "static" && (
                  <Chips
                    t={t}
                    freeSolo
                    label={t("auth.codeCodes")}
                    helper={t("auth.codeCodesHint")}
                    value={code.codes}
                    onChange={(codes) => patchCode({ codes: codes ?? [] })}
                  />
                )}
              </>
            )}

            {has("ldap") && ldap !== null && (
              <>
                <Text
                  label={t("auth.ldapUrl")}
                  helper={t("auth.ldapUrlHint")}
                  value={ldap.url}
                  onChange={(url) => patchLdap({ url })}
                />
                <Flag
                  label={t("auth.startTls")}
                  helper={t("auth.startTlsHint")}
                  checked={ldap.startTls}
                  onChange={(startTls) => patchLdap({ startTls })}
                />
                <Num
                  label={t("auth.timeoutS")}
                  value={String(ldap.timeoutS)}
                  onChange={(value) => patchLdap({ timeoutS: num(value) })}
                />
                <Pick
                  label={t("auth.ldapBind")}
                  helper={t("auth.ldapBindHint")}
                  value={ldap.bind}
                  options={LDAP_BINDS.map((bind) => ({
                    value: bind,
                    label: t(`auth.ldapBinds.${bind}`),
                  }))}
                  onChange={(bind) => patchLdap({ bind })}
                />
                {ldap.bind === "upn" && (
                  <Text
                    label={t("auth.ldapUpn")}
                    value={ldap.upnSuffix}
                    onChange={(upnSuffix) => patchLdap({ upnSuffix })}
                  />
                )}
                {ldap.bind === "dn_template" && (
                  <Text
                    label={t("auth.ldapDnTemplate")}
                    value={ldap.dnTemplate}
                    onChange={(dnTemplate) => patchLdap({ dnTemplate })}
                  />
                )}
                {ldap.bind === "search" && (
                  <>
                    <Text
                      label={t("auth.ldapBase")}
                      value={ldap.search.base}
                      onChange={(base) => patchLdapSearch({ base })}
                    />
                    <Text
                      label={t("auth.ldapFilter")}
                      helper={t("auth.ldapFilterHint")}
                      value={ldap.search.filter}
                      mono
                      onChange={(filter) => patchLdapSearch({ filter })}
                    />
                    <Text
                      label={t("auth.ldapBindDn")}
                      value={ldap.search.bindDn}
                      onChange={(bindDn) => patchLdapSearch({ bindDn })}
                    />
                    <Text
                      label={t("auth.ldapPasswordEnv")}
                      helper={t("auth.ldapPasswordHint")}
                      value={ldap.search.passwordEnv}
                      onChange={(passwordEnv) =>
                        patchLdapSearch({ passwordEnv, passwordStore: null })
                      }
                    />
                    <Chips
                      t={t}
                      freeSolo
                      label={t("auth.ldapGroups")}
                      helper={t("auth.ldapGroupsHint")}
                      value={ldap.groups}
                      onChange={(groups) => patchLdap({ groups: groups ?? [] })}
                    />
                  </>
                )}
              </>
            )}

            {has("ntlm") && ntlm !== null && (
              <>
                <Text
                  label={t("auth.ntlmUrl")}
                  value={ntlm.url}
                  onChange={(url) => patchNtlm({ url })}
                />
                <Text
                  label={t("auth.ntlmDomain")}
                  helper={t("auth.ntlmDomainHint")}
                  value={ntlm.domain}
                  onChange={(domain) => patchNtlm({ domain })}
                />
                <Flag
                  label={t("auth.startTls")}
                  helper={t("auth.startTlsHint")}
                  checked={ntlm.startTls}
                  onChange={(startTls) => patchNtlm({ startTls })}
                />
                <Num
                  label={t("auth.timeoutS")}
                  value={String(ntlm.timeoutS)}
                  onChange={(value) => patchNtlm({ timeoutS: num(value) })}
                />
              </>
            )}
          </SettingsTable>
          {external && <SectionNote message={t("auth.externalNote")} />}
          {(has("local") || (has("code") && code?.kind === "totp")) &&
            listNames.length === 0 && (
              <SectionNote message={t("auth.localUsersEmpty")} warning />
            )}
          {has("code") &&
            code?.kind === "totp" &&
            identitySources.length === 0 && (
              <SectionNote message={t("auth.identityFromEmpty")} warning />
            )}
        </Section>

        {/*
          Чужой токен: три вопроса подряд -- где он лежит, чем проверяем
          подпись и какие поля читаем. Формы, куки контура и списка живых
          сессий у этого способа нет вовсе, поэтому их секций ниже тоже нет.
        */}
        {mode === "jwt" && jwt !== null && (
          <>
            <Section
              title={t("auth.sectionToken")}
              hint={t("auth.sectionTokenHint")}
              flush
              defaultExpanded
            >
              <SettingsTable aside={false}>
                {/* Ровно одно место токена: кука либо заголовок. */}
                <Pick
                  label={t("auth.jwtWhere")}
                  helper={t("auth.jwtWhereHint")}
                  value={jwt.header === "" ? "cookie" : "header"}
                  options={[
                    { value: "cookie", label: t("auth.jwtInCookie") },
                    { value: "header", label: t("auth.jwtInHeader") },
                  ]}
                  onChange={(where) =>
                    patchJwt(
                      where === "cookie"
                        ? {
                            cookie:
                              jwt.cookie === "" ? "access_token" : jwt.cookie,
                            header: "",
                          }
                        : {
                            cookie: "",
                            header:
                              jwt.header === "" ? "authorization" : jwt.header,
                          },
                    )
                  }
                />
                {jwt.header === "" ? (
                  <Text
                    label={t("auth.jwtCookie")}
                    helper={t("auth.jwtCookieHint")}
                    value={jwt.cookie}
                    mono
                    onChange={(cookie) => patchJwt({ cookie })}
                  />
                ) : (
                  <>
                    <Text
                      label={t("auth.jwtHeader")}
                      value={jwt.header}
                      mono
                      onChange={(header) => patchJwt({ header })}
                    />
                    <Text
                      label={t("auth.jwtPrefix")}
                      helper={t("auth.jwtPrefixHint")}
                      value={jwt.prefix}
                      mono
                      onChange={(prefix) => patchJwt({ prefix })}
                    />
                  </>
                )}
              </SettingsTable>
            </Section>

            <Section
              title={t("auth.sectionVerify")}
              hint={t("auth.sectionVerifyHint")}
              flush
              defaultExpanded
            >
              <SettingsTable aside={false}>
                <Pick
                  label={t("auth.jwtAlg")}
                  helper={t("auth.jwtAlgHint")}
                  value={jwt.verify.alg}
                  options={AUTH_JWT_ALGS.map((alg) => ({
                    value: alg,
                    label: alg,
                  }))}
                  onChange={(alg) =>
                    patchJwtVerify({ alg, key: "", secretEnv: "" })
                  }
                />
                {jwt.verify.alg.startsWith("HS") && (
                  <Text
                    label={t("auth.jwtSecretEnv")}
                    helper={t("auth.jwtSecretEnvHint")}
                    value={jwt.verify.secretEnv}
                    mono
                    onChange={(secretEnv) => patchJwtVerify({ secretEnv })}
                  />
                )}
                {(jwt.verify.alg.startsWith("RS") ||
                  jwt.verify.alg.startsWith("ES")) && (
                  <SettingsRow
                    label={t("auth.jwtKey")}
                    help={t("auth.jwtKeyHint")}
                    grow
                  >
                    <TextField
                      size="small"
                      value={jwt.verify.key}
                      onChange={(e) => patchJwtVerify({ key: e.target.value })}
                      multiline
                      minRows={4}
                      placeholder="-----BEGIN PUBLIC KEY-----"
                      sx={{
                        width: "100%",
                        "& textarea": {
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        },
                      }}
                    />
                  </SettingsRow>
                )}
                <Text
                  label={t("auth.jwtIssuer")}
                  helper={t("auth.jwtIssuerHint")}
                  value={jwt.verify.issuer}
                  onChange={(issuer) => patchJwtVerify({ issuer })}
                />
                <Text
                  label={t("auth.jwtAudience")}
                  helper={t("auth.jwtAudienceHint")}
                  value={jwt.verify.audience}
                  onChange={(audience) => patchJwtVerify({ audience })}
                />
                <Num
                  label={t("auth.jwtLeewayS")}
                  helper={t("auth.jwtLeewayHint")}
                  value={String(jwt.verify.leewayS)}
                  onChange={(value) => patchJwtVerify({ leewayS: num(value) })}
                />
              </SettingsTable>
              {/*
                Без ключа claims написал клиент: сессия открывается, но
                доказательством не является. Оператор обязан это увидеть
                здесь, а не потом в журнале по звёздочке.
              */}
              {jwt.verify.alg === "none" && (
                <SectionNote message={t("auth.jwtNoneNote")} warning />
              )}
            </Section>

            <Section
              title={t("auth.sectionClaims")}
              hint={t("auth.sectionClaimsHint")}
              flush
              defaultExpanded
            >
              <SettingsTable aside={false}>
                <Text
                  label={t("auth.jwtClaimUser")}
                  helper={t("auth.jwtClaimsHint")}
                  value={jwt.claims.user}
                  mono
                  onChange={(user) => patchJwtClaims({ user })}
                />
                <Text
                  label={t("auth.jwtClaimSession")}
                  helper={t("auth.jwtClaimSessionHint")}
                  value={jwt.claims.session}
                  mono
                  onChange={(session) => patchJwtClaims({ session })}
                />
                <Text
                  label={t("auth.jwtClaimGroups")}
                  helper={t("auth.jwtClaimGroupsHint")}
                  value={jwt.claims.groups}
                  mono
                  onChange={(groups) => patchJwtClaims({ groups })}
                />
                <Text
                  label={t("auth.jwtClaimExpiry")}
                  helper={t("auth.jwtClaimExpiryHint")}
                  value={jwt.claims.expiry}
                  mono
                  onChange={(expiry) => patchJwtClaims({ expiry })}
                />
              </SettingsTable>
            </Section>
          </>
        )}

        {/*
          Сессия приложения: его кука и то, как калитка узнаёт вход. Пароль
          она не проверяет -- это делает приложение; она смотрит на фазе
          ответа, что вход принят, и с этого момента куке верит.
        */}
        {mode === "app" && app !== null && (
          <>
            <Section
              title={t("auth.sectionAppCookie")}
              hint={t("auth.sectionAppCookieHint")}
              flush
              defaultExpanded
            >
              <SettingsTable aside={false}>
                <Text
                  label={t("auth.appCookie")}
                  helper={t("auth.appCookieHint")}
                  value={app.cookie}
                  mono
                  onChange={(cookie) => patchApp({ cookie })}
                />
              </SettingsTable>
            </Section>

            <Section
              title={t("auth.sectionLearn")}
              hint={t("auth.sectionLearnHint")}
              flush
              defaultExpanded
            >
              <SettingsTable aside={false}>
                <Text
                  label={t("auth.appLoginUri")}
                  helper={t("auth.appLoginUriHint")}
                  value={app.learn.login.uri}
                  mono
                  onChange={(uri) =>
                    patchLearn({ login: { ...app.learn.login, uri } })
                  }
                />
                <Text
                  label={t("auth.appLoginMethod")}
                  value={app.learn.login.method}
                  mono
                  onChange={(method) =>
                    patchLearn({
                      login: {
                        ...app.learn.login,
                        method: method.toUpperCase(),
                      },
                    })
                  }
                />
                <Pick
                  label={t("auth.appUserFrom")}
                  helper={t("auth.appUserFromHint")}
                  value={app.learn.user.from}
                  options={APP_FIELD_SOURCES.map((from) => ({
                    value: from,
                    label: t(`auth.appUserFroms.${from.replace(".", "_")}`),
                  }))}
                  onChange={(from) =>
                    patchLearn({ user: { ...app.learn.user, from } })
                  }
                />
                <Text
                  label={t("auth.appUserField")}
                  helper={t("auth.appUserFieldHint")}
                  value={app.learn.user.field}
                  mono
                  onChange={(field) =>
                    patchLearn({ user: { ...app.learn.user, field } })
                  }
                />
                <Chips
                  t={t}
                  freeSolo
                  label={t("auth.appSuccessStatus")}
                  helper={t("auth.appSuccessStatusHint")}
                  value={app.learn.success.status.map(String)}
                  onChange={(codes) =>
                    patchSuccess({
                      status: (codes ?? [])
                        .map((code) => Number.parseInt(code, 10))
                        .filter((code) => Number.isInteger(code)),
                    })
                  }
                />
                <Flag
                  label={t("auth.appCookieNew")}
                  helper={t("auth.appCookieNewHint")}
                  checked={app.learn.success.cookieNew}
                  onChange={(cookieNew) => patchSuccess({ cookieNew })}
                />
                <Text
                  label={t("auth.appJsonPath")}
                  helper={t("auth.appJsonPathHint")}
                  value={app.learn.success.json?.path ?? ""}
                  mono
                  onChange={(path) =>
                    patchSuccess({
                      json:
                        path === ""
                          ? null
                          : {
                              path,
                              equals: app.learn.success.json?.equals ?? "true",
                            },
                    })
                  }
                />
                {app.learn.success.json !== null && (
                  <Text
                    label={t("auth.appJsonEquals")}
                    value={app.learn.success.json.equals}
                    mono
                    onChange={(equals) =>
                      patchSuccess({
                        json: {
                          path: app.learn.success.json?.path ?? "",
                          equals,
                        },
                      })
                    }
                  />
                )}
              </SettingsTable>
              {/*
                Снимок -- условие работы способа, а не тонкая настройка: без
                тела запроса и заголовков ответа калитке нечего подсматривать,
                и она молча никого не пустит.
              */}
              <SectionNote message={t("auth.learnCaptureNote")} />
            </Section>

            <Section
              title={t("auth.sectionAppLogout")}
              hint={t("auth.sectionAppLogoutHint")}
              flush
            >
              <SettingsTable aside={false}>
                <Text
                  label={t("auth.appLogoutUri")}
                  helper={t("auth.appLogoutUriHint")}
                  value={app.learn.logout.uri}
                  mono
                  onChange={(uri) =>
                    patchLearn({ logout: { ...app.learn.logout, uri } })
                  }
                />
                {app.learn.logout.uri !== "" && (
                  <Text
                    label={t("auth.appLogoutMethod")}
                    value={app.learn.logout.method}
                    mono
                    onChange={(method) =>
                      patchLearn({
                        logout: {
                          ...app.learn.logout,
                          method: method.toUpperCase(),
                        },
                      })
                    }
                  />
                )}
              </SettingsTable>
            </Section>
          </>
        )}

        {mode === "own" && loginSection}

        {/*
          Своя сессия -- кука контура со сроком, продлением и привязкой. У jwt
          сессию ведёт издатель, секции нет вовсе; у app от неё остаётся один
          срок: столько живёт запись о доверенной куке.
        */}
        {/* Своя кука сессии: только у своего входа -- её выписывает контур. */}
        {mode === "own" && (
          <Section
            title={t("auth.sectionSession")}
            hint={t("auth.sectionSessionHint")}
            flush
          >
            <SettingsTable aside={false}>
              <Text
                label={t("auth.sessionCookie")}
                helper={t("auth.sessionCookieHint")}
                value={doc.session.cookie}
                placeholder={name === "" ? "waf_sid_…" : `waf_sid_${name}`}
                onChange={(cookie) => patchSession({ cookie })}
              />
              <Num
                label={t("auth.sessionTtl")}
                value={String(doc.session.ttlS)}
                onChange={(value) => patchSession({ ttlS: num(value) })}
              />
              <Num
                label={t("auth.renewAfter")}
                helper={t("auth.renewAfterHint")}
                value={String(doc.session.renewAfterS)}
                onChange={(value) => patchSession({ renewAfterS: num(value) })}
              />
              <Chips
                t={t}
                freeSolo={false}
                label={t("auth.bind")}
                helper={t("auth.bindHint")}
                value={doc.session.bind}
                options={BINDS}
                optionLabel={(value) => t(`auth.binds.${value}`)}
                onChange={(bind) => patchSession({ bind: bind ?? [] })}
              />
            </SettingsTable>
          </Section>
        )}

        {/*
          Набор живых сессий. У своего входа он необязателен -- без него
          сессию не завершить снаружи; у сессии приложения он и есть
          множество доверенных кук, и без него способ не работает вовсе.
          Чужому токену списка не полагается: сессию ведёт издатель.
        */}
        {mode !== "jwt" && (
          <Section
            title={
              has("app") ? t("auth.sectionTrusted") : t("auth.sectionList")
            }
            hint={
              has("app")
                ? t("auth.sectionTrustedHint")
                : t("auth.sectionListHint")
            }
            flush
            defaultExpanded={has("app")}
          >
            <SettingsTable aside={false}>
              <Pick
                select
                label={
                  has("app")
                    ? t("auth.trustedSessions")
                    : t("auth.listSessions")
                }
                helper={
                  has("app")
                    ? t("auth.trustedSessionsHint")
                    : t("auth.listSessionsHint")
                }
                value={doc.list.sessions}
                options={[
                  ...(has("app")
                    ? []
                    : [{ value: "", label: t("auth.listSessionsNone") }]),
                  ...datasets.map((row) => ({
                    value: row.name,
                    label: row.name,
                  })),
                ]}
                onChange={(sessions) => patchList({ sessions })}
              />
              {doc.list.sessions !== "" && (
                <>
                  {/* Кука списка -- только у своей сессии: у приложения запись
                      адресуется хешем его собственной куки. */}
                  {!has("app") && (
                    <Text
                      label={t("auth.listCookie")}
                      helper={t("auth.listCookieHint")}
                      value={doc.list.cookie}
                      onChange={(cookie) => patchList({ cookie })}
                    />
                  )}
                  <Num
                    label={
                      has("app") ? t("auth.trustedTtl") : t("auth.listTtl")
                    }
                    helper={
                      has("app")
                        ? t("auth.trustedTtlHint")
                        : t("auth.listTtlHint")
                    }
                    value={String(doc.list.ttlS)}
                    onChange={(value) => patchList({ ttlS: num(value) })}
                  />
                  <Num
                    label={t("auth.listGrace")}
                    helper={t("auth.listGraceHint")}
                    value={String(doc.list.graceS)}
                    onChange={(value) => patchList({ graceS: num(value) })}
                  />
                </>
              )}
            </SettingsTable>
            {has("app") && doc.list.sessions === "" && (
              <SectionNote message={t("auth.appListRequired")} warning />
            )}
            {datasets.length === 0 && (
              <SectionNote message={t("auth.listSessionsEmpty")} />
            )}
          </Section>
        )}

        {external && loginSection}

        <Section
          title={t("auth.sectionUpstream")}
          hint={t("auth.sectionUpstreamHint")}
          flush
        >
          <SettingsTable aside={false}>
            <Text
              label={t("auth.upstreamUser")}
              helper={t("auth.upstreamHeaderHint")}
              value={doc.upstream.user}
              mono
              onChange={(user) => patchUpstream({ user })}
            />
            <Text
              label={t("auth.upstreamGroups")}
              helper={t("auth.upstreamHeaderHint")}
              value={doc.upstream.groups}
              mono
              onChange={(groups) => patchUpstream({ groups })}
            />
            <Text
              label={t("auth.upstreamMethod")}
              helper={t("auth.upstreamHeaderHint")}
              value={doc.upstream.method}
              mono
              onChange={(method) => patchUpstream({ method })}
            />
            <Text
              label={t("auth.upstreamCookie")}
              helper={t("auth.upstreamCookieHint")}
              value={doc.upstream.cookie}
              onChange={(cookie) => patchUpstream({ cookie })}
            />
          </SettingsTable>
        </Section>

        {/* Перебор формы и роутер -- свойства своей формы; у внешних её нет. */}
        {!external && (
          <Section
            title={t("auth.sectionExtra")}
            hint={t("auth.sectionExtraHint")}
            flush
          >
            <SettingsTable aside={false}>
              <Num
                label={t("auth.lockoutAttempts")}
                helper={t("auth.lockoutAttemptsHint")}
                value={String(doc.lockout.attempts)}
                onChange={(value) => patchLockout({ attempts: num(value) })}
              />
              <Num
                label={t("auth.lockoutWindow")}
                value={String(doc.lockout.windowS)}
                onChange={(value) => patchLockout({ windowS: num(value) })}
              />
              <Num
                label={t("auth.lockoutLock")}
                value={String(doc.lockout.lockS)}
                onChange={(value) => patchLockout({ lockS: num(value) })}
              />
            </SettingsTable>
          </Section>
        )}
      </Form.Body>
      <Form.Actions>
        {id !== null && (
          <Button
            size="small"
            color="error"
            onClick={() => void dispatch(removeAuthSource({ scope, id }))}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!nameOk || waiting}
          onClick={() => {
            void dispatch(
              saveAuthSourceThunk({
                scope,
                id,
                name,
                description,
                serverId,
                doc,
              }),
            );
          }}
        >
          {id === null ? t("common.create") : t("common.save")}
        </Button>
      </Form.Actions>
      {/* Пользователи выбранного списка: окно живёт в сторе, открывает его
          шестерёнка у селектора. */}
      <AuthUsersDialog />
    </Form>
  );
}

/* --- форма профиля ---------------------------------------------------------- */

function AuthProfileForm({
  scope,
  id,
  onClose,
}: {
  scope: string;
  id: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const detail = useAppSelector((s) => s.pages.auth.detail);
  const sources = useAppSelector((s) => s.pages.auth.sources);
  const denyResponses = useAppSelector((s) => s.pages.auth.denyResponses);
  /* Живые наборы контура: правило по событию умеет писать в них адрес. */
  const liveDatasets = useAppSelector((s) => s.pages.auth.datasets);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [doc, setDoc] = useState<AuthProfileDoc>(emptyProfileDoc());

  /*
   * Словарь действий. Ручка без области видимости и без базы -- это форма
   * провода, одна на все контуры, поэтому грузится один раз на страницу.
   * Не доехал -- селекторы пусты, и это честнее выдуманного списка: уже
   * записанные правила показываются как есть, новое не собрать.
   */
  const [actions, setActions] = useState<ActionRegistry | null>(null);

  useEffect(() => {
    let alive = true;

    fetchActions()
      .then((reg) => {
        if (alive) {
          setActions(reg);
        }
      })
      .catch(() => {
        /* Пустой словарь -- уже осмысленное состояние, ронять страницу незачем. */
      });

    return () => {
      alive = false;
    };
  }, []);

  /* Реестр контура: из него окно сигнала выбирает отправителя. */
  const [inspectors, setInspectors] = useState<InspectorMeta[]>([]);

  useEffect(() => {
    let alive = true;

    fetchInspectors(scope)
      .then((rows) => {
        if (alive) {
          setInspectors(rows);
        }
      })
      .catch(() => {
        /* Селектор отправителя без реестра -- страница живёт. */
      });

    return () => {
      alive = false;
    };
  }, [scope]);

  /*
   * Считает контроллер: только он видит обе стороны -- правила профиля и
   * реестр инспекторов. Пусто и у новой карточки, и когда всё сходится.
   */
  const unknownSenders =
    id !== null && detail !== null && detail.uuid === id
      ? (detail.unknown_senders ?? [])
      : [];

  /*
   * Подсказка автодополнения поводов: что отправители контура шлют калитке,
   * насколько это видит контроллер. Список неполон по построению -- профили,
   * приехавшие файлами, ему не видны, -- поэтому поле остаётся свободным.
   */
  const senderCodes =
    id !== null && detail !== null && detail.uuid === id
      ? (detail.sender_codes ?? [])
      : [];

  useEffect(() => {
    if (id !== null && detail !== null && detail.uuid === id) {
      setName(detail.name);
      setDescription(detail.description);
      setDoc({ ...emptyProfileDoc(), ...detail.doc });
    }
  }, [id, detail]);

  const nameOk = NAME_RE.test(name);
  const waiting = id !== null && (detail === null || detail.uuid !== id);

  const patch = (next: Partial<AuthProfileDoc>) => setDoc({ ...doc, ...next });
  const patchGate = (next: Partial<AuthProfileDoc["gate"]>) =>
    patch({ gate: { ...doc.gate, ...next } });

  /* Источник, на который смотрит профиль: от него подсказка под таблицей. */
  const source = useMemo(
    () => sources.find((row) => row.name === doc.source) ?? null,
    [sources, doc.source],
  );

  /*
   * Способ источника решает, что в профиле вообще имеет смысл. У чужого
   * токена и сессии приложения формы нет: показывать её нечем, и «как
   * показать форму» вместе с адресом возврата исчезает. Редирект остаётся
   * ровно там, где источник назвал страницу входа приложения; без неё
   * навигация получает тот же отказ, что и остальные методы.
   */
  const sourceMode: SourceMode =
    source === null ? "own" : modeOf(source.provider as ProviderKind);
  const externalSource = sourceMode !== "own";
  const loginTarget = source?.doc.login.uri ?? "";
  const canRedirect = !externalSource || loginTarget !== "";

  /*
   * Записи отказа выбирают из каталога: опечатка в свободном вводе доезжала бы
   * до ноды и оборачивалась голым 403. Имя из старого дока, которого каталог
   * не знает, остаётся видимым пунктом -- иначе селектор молча показал бы
   * пустоту вместо действующего значения.
   */
  const denyOptions = (current: string) => {
    const names = denyResponses.map((row) => row.name);

    if (current !== "" && !names.includes(current)) {
      names.push(current);
    }

    return names.map((value) => ({ value, label: value }));
  };

  /*
   * У default заперты имя и удаление, содержимое -- нет: объявление без
   * profile= читает именно его, и править его -- обычный ход, а не повод
   * заводить копию. Полоса над телом говорит, что профиль разошёлся с
   * поставкой, кнопка рядом возвращает его назад.
   */
  const loaded =
    id !== null && detail !== null && detail.uuid === id ? detail : null;
  const isDefault = loaded?.name === "default";
  const banner =
    loaded?.modified === true ? t("profiles.defaultModified") : undefined;
  const restore =
    id === null
      ? undefined
      : () => {
          void dispatch(restoreAuthProfileThunk({ scope, id }));
        };

  return (
    <Form id="auth-profile">
      <Form.Header>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {id === null ? t("auth.newTitle") : t("auth.editTitle")}
        </Typography>
        <Form.Close onClick={onClose} />
      </Form.Header>
      <Form.Body
        spacing={2}
        scroll
        banner={banner}
        bannerActionLabel={t("common.restore")}
        onBannerAction={restore}
      >
        {/*
          Источник -- главная ссылка профиля: чьи сессии он принимает и чья
          форма его обслуживает. Стоит рядом с именем и режимом, а не отдельной
          секцией: без него профиль не работает ни в каком режиме, кроме
          «Выключен».
        */}
        <Section
          title={t("auth.sectionProfile")}
          hint={t("auth.sectionProfileHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Text
              label={t("common.name")}
              helper={
                isDefault ? t("profiles.defaultNameHint") : t("auth.nameHint")
              }
              value={name}
              onChange={setName}
              readOnly={isDefault}
            />
            <Text
              label={t("auth.description")}
              value={description}
              onChange={setDescription}
            />
            <Pick
              select
              label={t("auth.source")}
              helper={t("auth.sourceHint")}
              value={doc.source}
              options={nameOptions(sources.map((row) => row.name))}
              onChange={(value) => patch({ source: value })}
            />
            {/*
              Способ показа -- рядом с источником: форма живёт на нём, а как
              её показать, решает профиль. На проводе gate.inline; редирект
              уводит на адрес формы, «телом ответа» отдаёт её на том же URI.
              У внешних источников формы нет вовсе -- показывать нечего.
            */}
            {!externalSource && (
              <Pick
                label={t("auth.deliver")}
                helper={t("auth.deliverHint")}
                value={doc.gate.inline ? "body" : "redirect"}
                options={[
                  { value: "redirect", label: t("auth.delivers.redirect") },
                  { value: "body", label: t("auth.delivers.body") },
                ]}
                onChange={(value) => patchGate({ inline: value === "body" })}
              />
            )}
          </SettingsTable>
          {source !== null && (
            <SectionNote
              message={
                externalSource
                  ? loginTarget === ""
                    ? t("auth.sourceSummaryExternal", {
                        provider: t(`auth.factor.${source.provider}`),
                      })
                    : t("auth.sourceSummaryPage", {
                        provider: t(`auth.factor.${source.provider}`),
                        uri: loginTarget,
                      })
                  : t("auth.sourceSummary", {
                      provider: t(`auth.factor.${source.provider}`),
                      uri: loginTarget,
                    })
              }
            />
          )}
          {sources.length === 0 && (
            <SectionNote message={t("auth.sourceEmpty")} warning />
          )}
        </Section>

        {/*
          Допуск отдельно от отказа: кого пускать -- политика маршрута, как
          отказывать -- механика ответа. Запись под 403 нужна только закрытой
          зоне: профилю без групп отказа «не та группа» не бывает.
        */}
        <Section
          title={t("auth.sectionAccess")}
          hint={t("auth.sectionAccessHint")}
          flush
          defaultExpanded
        >
          <SettingsTable aside={false}>
            <Chips
              t={t}
              freeSolo
              label={t("auth.gateGroups")}
              helper={t("auth.gateGroupsHint")}
              value={doc.gate.groups}
              onChange={(groups) => patchGate({ groups: groups ?? [] })}
            />
            {doc.gate.groups.length > 0 && (
              <Pick
                select
                label={t("auth.forbiddenResponse")}
                helper={t("auth.forbiddenResponseHint")}
                value={doc.gate.forbiddenResponse}
                options={denyOptions(doc.gate.forbiddenResponse)}
                onChange={(forbiddenResponse) =>
                  patchGate({ forbiddenResponse })
                }
              />
            )}
          </SettingsTable>
        </Section>

        <Section
          title={t("auth.sectionGate")}
          hint={
            externalSource ? t("auth.sectionGateExternalHint") : t("auth.sectionGateHint")
          }
          flush
        >
          <SettingsTable aside={false}>
            {/*
              Методы и Accept решают, кому показывают вход вообще, -- при
              любом способе показа; остальные получают 401 с записью отказа.
              У внешнего источника без страницы входа уводить некуда, и
              строка методов исчезает вместе с выбором.
            */}
            {canRedirect && (
              <Chips
                t={t}
                freeSolo
                label={
                  externalSource
                    ? t("auth.redirectMethodsExternal")
                    : t("auth.redirectMethods")
                }
                helper={
                  externalSource
                    ? t("auth.redirectMethodsExternalHint")
                    : t("auth.redirectMethodsHint")
                }
                value={doc.gate.redirectMethods}
                options={["GET", "HEAD", "OPTIONS"]}
                /* Accept -- оговорка к методам, а не второе правило: тумблер
                   стоит в хвосте той же строки. */
                flag={
                  <InlineFlag
                    label={t("auth.htmlOnly")}
                    help={t("auth.htmlOnlyHint")}
                    checked={doc.gate.htmlOnly}
                    onChange={(htmlOnly) => patchGate({ htmlOnly })}
                  />
                }
                onChange={(redirectMethods) =>
                  patchGate({ redirectMethods: redirectMethods ?? [] })
                }
              />
            )}
            <Pick
              select
              label={t("auth.denyResponse")}
              helper={t("auth.denyResponseHint")}
              value={doc.gate.denyResponse}
              options={denyOptions(doc.gate.denyResponse)}
              onChange={(denyResponse) => patchGate({ denyResponse })}
            />
          </SettingsTable>
          {externalSource && !canRedirect && (
            <SectionNote message={t("auth.gateNoLoginPage")} />
          )}
        </Section>

        {/*
          Канал действий: что принимаем от соседей и с какого возраста сессии
          просьба «прервать» действует. Своих правил у калитки нет -- она
          только слушает.
        */}
        <Section
          title={t("auth.sectionChannel")}
          hint={t("auth.sectionChannelHint")}
          flush
          defaultExpanded
        >
          <SignalsBlock
            hint={t("auth.priorHint")}
            rules={doc.trigger.prior.map((row) => ({
              from: row.from,
              accept: [...row.accept],
              apply: [...row.apply],
              codes: [...row.codes],
            }))}
            verbs={verbsFor(actions, "auth")
              .filter((verb) => AUTH_VERBS.has(verb))
              .map((verb) => ({ value: verb, label: verbLabel(t, verb) }))}
            weakening={weakeningVerbs(actions)}
            axes={(accept) =>
              axesFor(actions, accept).map((axis) => ({
                value: axis,
                label: axisLabel(t, axis),
              }))
            }
            codes={senderCodes}
            unknown={unknownSenders}
            senders={inspectors}
            defaultRule={() => ({
              from: "*",
              accept: ["reauth"],
              apply: [],
              codes: [],
            })}
            onChange={(prior) =>
              patch({
                trigger: {
                  ...doc.trigger,
                  prior: prior.map((row) => ({
                    from: row.from,
                    accept: row.accept as AuthPriorRule["accept"],
                    apply: (row.apply ?? []) as AuthPriorRule["apply"],
                    codes: row.codes,
                  })),
                },
              })
            }
          />
          <SettingsTable aside={false}>
            <Num
              label={t("auth.reauthAfter")}
              helper={t("auth.reauthAfterHint")}
              value={String(doc.trigger.reauthAfterS)}
              onChange={(value) =>
                patch({ trigger: { ...doc.trigger, reauthAfterS: num(value) } })
              }
            />
          </SettingsTable>
        </Section>

        {/*
          Что калитка говорит сама: правила по событиям волны -- вошёл,
          аноним, битая сессия, чужая группа. Просьба соседу доедет только с
          allow, остальным событиям остаются журнал, архив, метка и очки.
        */}
        <Section
          title={t("auth.sectionRules")}
          hint={t("auth.rulesSectionHint")}
          flush
          defaultExpanded
        >
          <AuthRulesBlock
            rules={doc.rules}
            datasets={liveDatasets.map((row) => row.name)}
            inspectors={inspectors}
            registry={actions}
            onChange={(rules) => patch({ rules })}
          />
        </Section>
      </Form.Body>
      <Form.Actions>
        {id !== null && !isDefault && (
          <Button
            size="small"
            color="error"
            onClick={() => void dispatch(removeAuthProfile({ scope, id }))}
          >
            {t("common.delete")}
          </Button>
        )}
        <Button size="small" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!nameOk || waiting}
          onClick={() => {
            void dispatch(
              saveAuthProfileThunk({ scope, id, name, description, doc }),
            );
          }}
        >
          {id === null ? t("common.create") : t("common.save")}
        </Button>
      </Form.Actions>
    </Form>
  );
}
