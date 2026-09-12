/*
  Ядро nginx: что каждый уровень может переопределить -- и форма из этого.

  Сначала матрица, потом поля. Уровней три (`http {}`, `server {}`,
  `location {}`), и на каждом свой набор ключей: он взят из модели
  (`controller/src/model/settings.ts`, `NginxHttpSettings` /
  `NginxServerSettings` / `NginxLocationSettings`) и из того, что печатает
  компилятор (`compile/nginx-http.ts`, `nginx-server.ts`, `nginx-location.ts`).
  Раздел объявляет `keys` по уровням -- из этого получаются и вкладки формы, и
  счётчик заданных ключей на кнопке. Ключа нет в матрице -- его нет ни в форме,
  ни в счёте.

  Раздел один на все уровни: «TLS» у http и у сервера -- один компонент, просто
  на сервере в нём на две строки больше (`ssl_verify_client`, `ssl_verify_depth`
  живут только там). Так наследование видно сверху вниз: раздел, которого у
  уровня нет, не показывается вовсе, а не показывается пустым.

  Форма собирается одинаково везде: страница http (`pages/Config.tsx`) --
  вкладками слоя, сервер и путь -- тем же слоем на вкладке nginx окна
  «Дополнительные параметры» (`pages/route-fields.tsx`), где первый ряд --
  WAF или nginx, а второй -- раздел. Всё, что печатается директивой nginx,
  правится здесь, включая gzip и логи сервера и пути: раньше они стояли
  строками «Основных настроек» ради подписи «откуда приехало значение», но
  одна директива в двух вкладках читалась хуже.

  Чего здесь нет намеренно: `error_page` сервера. Модель его хранит и
  компилятор печатает, но редактора списка кодов ещё нет -- помечен `later`,
  чтобы не выглядеть забытым.
*/
import type { ReactNode } from "react";

import {
  Bytes,
  Chips,
  Choice,
  Duration,
  InheritModeProvider,
  Num,
  Text,
  Tri,
} from "../components/fields.tsx";
import {
  SettingsGroup,
  SettingsTable,
  UnitLabel,
} from "../components/settings-table.tsx";
import type { Translate } from "../i18n/index.ts";
import {
  asNumText,
  asOptBool,
  asOptNum,
  asRecord,
  asString,
  asStringList,
  MS_PRESETS,
  parseNum,
  S_PRESETS,
  setKey,
  setNested,
  SizeField,
  SIZE_HINTS,
  type Doc,
} from "../pages/config-fields.tsx";
import { asPairs, EditorRow, PairRows } from "./http-draft.tsx";
import { PairsTable } from "./PairsTable.tsx";
import type { ParentChain } from "./inherit.ts";
import type { LayerItem } from "./layer-tabs.tsx";
import { LogsTable } from "./LogsTable.tsx";

/** Уровень блока: где директива окажется в файле. */
export type NginxLevel = "http" | "server" | "location";

const LINGERING = ["on", "off", "always"] as const;
const PROXY_VER = ["1.0", "1.1"] as const;
const PROXY_HDR = ["standard", "websocket", "none"] as const;
/** У пути пресет можно снять совсем: заголовки перечисляются руками. */
const PROXY_HDR_LOC = ["standard", "websocket", "none", "custom"] as const;
const GZIP_TYPES = [
  "text/plain",
  "text/css",
  "text/xml",
  "text/javascript",
  "application/json",
  "application/javascript",
  "application/xml",
  "image/svg+xml",
];
const SSL_PROTO = ["TLSv1.2", "TLSv1.3"];
const SSL_CIPHERS = [
  "HIGH:!aNULL:!MD5",
  "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256",
];
const SSL_CACHES = ["shared:SSL:10m", "shared:SSL:50m", "off"];
/** Умолчание директивы -- 5m; подстановки те же, что были строками. */
const SSL_TIMEOUT_S = 300;
const SSL_TIMEOUTS_S = [300, 3600, 86400];
const SSL_VERIFY = ["on", "off", "optional"] as const;
const VERIFY_DEPTH = [1, 2, 3];
const DEFAULT_TYPES = ["text/html", "text/plain", "application/octet-stream"];
/* Каталог из сборки nginx и два обычных места, где под ним tmpfs. */
const BODY_TEMP_PATHS = [
  "/var/cache/nginx/client_temp",
  "/dev/shm/client_temp",
  "/run/nginx/client_temp",
];
const REAL_IP_HEADERS = [
  "X-Forwarded-For",
  "X-Real-IP",
  "CF-Connecting-IP",
  "proxy_protocol",
];
const RESOLVERS = ["1.1.1.1", "8.8.8.8", "9.9.9.9"];
const PRIVATE_NETS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
const ROOTS = ["/usr/share/nginx/html", "/var/www/html"];
const CHARSETS = ["utf-8", "windows-1251", "off"];
const INDEXES = ["index.html", "index.htm"];
const TRY_FILES = ["$uri", "$uri/", "=404"];
const SSI_TYPES = ["text/html", "text/plain"];
const NETS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "all"];
const ROLES = ["none", "healthz", "challenge", "metrics", "deny_page"] as const;

interface SectionProps {
  t: Translate;
  level: NginxLevel;
  value: Doc;
  onChange: (next: Doc) => void;
}

/**
 * Раздел директив: что он даёт каждому уровню и чем это правят.
 *
 * `keys` -- ответ на вопрос «что этот уровень может переопределить». Уровня
 * нет в `keys` -- раздела у него нет. `elsewhere: later` -- ключи уровень
 * задавать умеет, модель их хранит, но редактора ещё нет.
 */
export interface NginxSection {
  id: string;
  keys: Partial<Record<NginxLevel, readonly string[]>>;
  elsewhere?: Partial<Record<NginxLevel, "later">>;
  Fields: (props: SectionProps) => ReactNode;
  /**
   * Раздел -- одна таблица во всю секцию, а не строки таблицы настроек:
   * `NginxSectionBody` не оборачивает его в `SettingsTable`.
   */
  table?: boolean;
}

/** Строка показывается только на тех уровнях, где ключ вообще существует. */
function at(level: NginxLevel, ...levels: NginxLevel[]): boolean {
  return levels.includes(level);
}

function field(t: Translate, key: string): string {
  return t(`config.field.${key}`);
}

function help(t: Translate, key: string): string {
  return t(`config.help.${key}`);
}

function group(t: Translate, key: string): string {
  return t(`config.group.${key}`);
}

function groupHint(t: Translate, key: string): string | undefined {
  const path = `config.group.${key}Hint`;
  const text = t(path);
  return text === path ? undefined : text;
}

/**
 * Пустое поле на маршруте значит «взять у родителя», а не «умолчание nginx».
 * Галочка там есть у каждого поля (её включает режим наследования, см.
 * `InheritModeProvider` в `NginxSectionBody`), но подпись
 * `<значение> (по умолчанию)` и `fallback` -- только на http: умолчание
 * приезжает сверху, а не из директивы, и значения в скобках поле не знает.
 */
function inheritable(level: NginxLevel): boolean {
  return level !== "http";
}

/** Суффиксы времени nginx, которые встречаются в этих директивах. */
const NGINX_TIME_S: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * Время nginx строкой -- в секунды. Регистр значащий: `m` -- минуты, `M` --
 * месяцы, и разбирать их одинаково значит промахнуться на два порядка.
 * Строка, которой здесь нет (`1d12h`, `2w`), в поле не читается: `undefined`
 * покажет умолчание, а в документе останется прежнее значение.
 */
function parseNginxTimeS(raw: string): number | undefined {
  const match = raw.trim().match(/^(\d+)([smhd])?$/);
  if (match === null) {
    return undefined;
  }
  const n = Number(match[1]);
  return Number.isFinite(n) ? n * (NGINX_TIME_S[match[2] ?? "s"] ?? 1) : undefined;
}

/** Обратно: секунды -- самой крупной единицей, в которой они целые. */
function formatNginxTimeS(seconds: number): string {
  if (seconds !== 0 && seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds !== 0 && seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

/*
  Матрица. Порядок разделов -- порядок чтения: что за соединение, что от
  клиента, что отдаём, кому можно, чем шифруем, куда проксируем, что дописываем
  в ответ, чем сжимаем, чей адрес считаем клиентским, что пишем в лог.
*/
export const NGINX_SECTIONS: readonly NginxSection[] = [
  {
    id: "conn",
    keys: {
      http: [
        "sendfile",
        "tcpNopush",
        "tcpNodelay",
        "keepaliveTimeoutS",
        "keepaliveRequests",
        "keepaliveTimeS",
        "resetTimedoutConnection",
        "lingeringClose",
        "lingeringTimeMs",
        "lingeringTimeoutMs",
      ],
    },
    Fields: ConnFields,
  },
  {
    id: "client",
    keys: {
      http: [
        "clientMaxBodySize",
        "clientHeaderBufferSize",
        "clientBodyBufferSize",
        "clientBodyTempPath",
        "largeClientHeaderBuffers",
        "clientHeaderTimeoutMs",
        "clientBodyTimeoutMs",
        "sendTimeoutMs",
        "defaultType",
        "underscoresInHeaders",
        "ignoreInvalidHeaders",
        "mergeSlashes",
        "serverTokens",
        "serverNamesHashBucketSize",
        "serverNamesHashMaxSize",
        "typesHashBucketSize",
        "typesHashMaxSize",
      ],
      server: ["clientMaxBodySize"],
      location: ["clientMaxBodySize"],
    },
    Fields: ClientFields,
  },
  {
    id: "files",
    keys: {
      server: ["root", "charset", "httpsRedirect"],
      location: [
        "root",
        "alias",
        "index",
        "tryFiles",
        "internal",
        "ssi",
        "ssiTypes",
        "role",
      ],
    },
    Fields: FilesFields,
  },
  {
    id: "access",
    keys: { location: ["allow", "deny"] },
    Fields: AccessFields,
  },
  {
    id: "tls",
    keys: {
      http: [
        "sslProtocols",
        "sslCiphers",
        "sslPreferServerCiphers",
        "sslSessionCache",
        "sslSessionTimeout",
      ],
      server: [
        "sslProtocols",
        "sslCiphers",
        "sslPreferServerCiphers",
        "sslSessionCache",
        "sslSessionTimeout",
        "sslVerifyClient",
        "sslVerifyDepth",
      ],
    },
    Fields: TlsFields,
  },
  {
    id: "proxy",
    keys: {
      http: ["proxyHttpVersion", "proxyHeaders"],
      location: [
        "proxyConnectTimeoutMs",
        "proxyReadTimeoutMs",
        "proxySendTimeoutMs",
        "proxyBuffering",
        "proxyRequestBuffering",
        "proxyHttpVersion",
        "proxyHeaders",
        "proxySetHeaders",
      ],
    },
    Fields: ProxyFields,
  },
  {
    id: "headers",
    keys: { http: ["addHeaders"], server: ["addHeaders"], location: ["addHeaders"] },
    Fields: HeadersFields,
    table: true,
  },
  {
    id: "gzip",
    keys: {
      http: ["gzip", "gzipCompLevel", "gzipMinLength", "gzipVary", "gzipTypes"],
      server: ["gzip", "gzipCompLevel", "gzipMinLength", "gzipVary", "gzipTypes"],
      location: ["gzip", "gzipCompLevel", "gzipMinLength", "gzipVary", "gzipTypes"],
    },
    Fields: GzipFields,
  },
  {
    id: "net",
    keys: {
      http: [
        "resolver",
        "resolverTimeoutMs",
        "realIpFrom",
        "realIpHeader",
        "realIpRecursive",
      ],
      server: ["realIpFrom", "realIpHeader", "realIpRecursive"],
      location: ["realIpFrom", "realIpHeader", "realIpRecursive"],
    },
    Fields: NetFields,
  },
  {
    id: "logs",
    keys: {
      http: ["errorLog", "accessLog"],
      server: ["errorLog", "accessLog"],
      location: ["errorLog", "accessLog"],
    },
    Fields: LogsFields,
    table: true,
  },
  {
    /*
      `error_page 403 =403 @waf_deny;` -- список кодов, необязательный код
      подмены и цель. Редактора под это ещё нет; ключ объявлен, чтобы матрица
      не врала, будто сервер этого не умеет.
    */
    id: "errorPages",
    keys: { server: ["errorPages"] },
    elsewhere: { server: "later" },
    Fields: () => null,
  },
];

/** Разделы, которые уровень правит этой формой. */
export function nginxSectionsFor(level: NginxLevel): NginxSection[] {
  return NGINX_SECTIONS.filter(
    (section) =>
      (section.keys[level] ?? []).length > 0 && section.elsewhere?.[level] === undefined,
  );
}

/** Вкладки слоя: имя раздела и его подсказка. */
export function nginxItems(t: Translate, level: NginxLevel): LayerItem<string>[] {
  return nginxSectionsFor(level).map((section) => ({
    id: section.id,
    label: t(`config.section.${section.id}`),
    hint: t(`config.section.${section.id}Hint`),
  }));
}

/** Ключи, за которые отвечает форма уровня: из них считается счётчик. */
export function nginxKeys(level: NginxLevel): string[] {
  return nginxSectionsFor(level).flatMap((section) => [...(section.keys[level] ?? [])]);
}

function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Сколько ключей уровня задано: столько же строк уедет в файл. */
export function nginxCount(level: NginxLevel, value: Doc): number {
  return nginxKeys(level).filter((key) => isSet(value[key])).length;
}

/** Строки выбранного раздела. Внутри -- обычные строки таблицы настроек. */
export function NginxSectionFields({
  t,
  level,
  section,
  value,
  onChange,
}: SectionProps & { section: string }) {
  const found = NGINX_SECTIONS.find((row) => row.id === section);
  if (found === undefined) {
    return null;
  }
  return <found.Fields t={t} level={level} value={value} onChange={onChange} />;
}

/**
 * Содержимое карточки раздела: строки в таблице настроек или, у разделов с
 * `table`, таблица во всю секцию. Решает здесь, а не у вызывающего: страница
 * http и диалог параметров сервера и пути рисуют один и тот же раздел.
 */
export function NginxSectionBody(
  props: SectionProps & { section: string; parents?: ParentChain },
) {
  const { parents, ...rest } = props;
  const found = NGINX_SECTIONS.find((row) => row.id === props.section);
  // Ниже http {} пустое поле значит «взять у родителя»: галочка и подписи
  // полей переключаются на слово «наследовать» (InheritModeProvider).
  const body =
    found?.table === true ? (
      <NginxSectionFields {...rest} />
    ) : (
      <SettingsTable>
        <NginxSectionFields {...rest} />
      </SettingsTable>
    );
  return (
    <InheritModeProvider value={inheritable(props.level) ? (parents ?? {}) : null}>
      {body}
    </InheritModeProvider>
  );
}

function ConnFields({ t, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  return (
    <>
      <SettingsGroup title={group(t, "tcp")}>
        <Tri
          name="sendfile"
          fallback="off"
          optional
          t={t}
          label={field(t, "sendfile")}
          helper={help(t, "sendfile")}
          value={asOptBool(value.sendfile)}
          onChange={(v) => set("sendfile", v)}
        />
        <Tri
          name="tcpNopush"
          fallback="off"
          optional
          t={t}
          label={field(t, "tcpNopush")}
          helper={help(t, "tcpNopush")}
          value={asOptBool(value.tcpNopush)}
          onChange={(v) => set("tcpNopush", v)}
        />
        <Tri
          name="tcpNodelay"
          fallback="on"
          optional
          t={t}
          label={field(t, "tcpNodelay")}
          helper={help(t, "tcpNodelay")}
          value={asOptBool(value.tcpNodelay)}
          onChange={(v) => set("tcpNodelay", v)}
        />
      </SettingsGroup>
      <SettingsGroup title={group(t, "keepalive")}>
        <Duration
          name="keepaliveTimeoutS"
          base="s"
          presets={S_PRESETS.keepalive}
          optional
          fallback={75}
          label={field(t, "keepaliveTimeoutS")}
          helper={help(t, "keepaliveTimeoutS")}
          value={asOptNum(value.keepaliveTimeoutS)}
          onChange={(v) => set("keepaliveTimeoutS", v)}
        />
        <Num
          name="keepaliveRequests"
          optional
          fallback={1000}
          presets={[100, 1000, 10000]}
          label={field(t, "keepaliveRequests")}
          helper={help(t, "keepaliveRequests")}
          value={asNumText(value.keepaliveRequests)}
          end={<UnitLabel>req</UnitLabel>}
          onChange={(v) => set("keepaliveRequests", parseNum(v))}
        />
        <Duration
          name="keepaliveTimeS"
          base="s"
          presets={S_PRESETS.keepaliveTime}
          optional
          fallback={3600}
          label={field(t, "keepaliveTimeS")}
          helper={help(t, "keepaliveTimeS")}
          value={asOptNum(value.keepaliveTimeS)}
          onChange={(v) => set("keepaliveTimeS", v)}
        />
      </SettingsGroup>
      <SettingsGroup title={group(t, "lingering")} hint={groupHint(t, "lingering")}>
        <Tri
          name="resetTimedoutConnection"
          fallback="off"
          optional
          t={t}
          label={field(t, "resetTimedoutConnection")}
          helper={help(t, "resetTimedoutConnection")}
          value={asOptBool(value.resetTimedoutConnection)}
          onChange={(v) => set("resetTimedoutConnection", v)}
        />
        <Choice
          name="lingeringClose"
          fallback="on"
          optional
          t={t}
          label={field(t, "lingeringClose")}
          helper={help(t, "lingeringClose")}
          value={asString(value.lingeringClose)}
          options={LINGERING}
          onChange={(v) => set("lingeringClose", v)}
        />
        <Duration
          name="lingeringTimeMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          optional
          fallback={30000}
          label={field(t, "lingeringTimeMs")}
          helper={help(t, "lingeringTimeMs")}
          value={asOptNum(value.lingeringTimeMs)}
          onChange={(v) => set("lingeringTimeMs", v)}
        />
        <Duration
          name="lingeringTimeoutMs"
          base="ms"
          presets={MS_PRESETS.short}
          optional
          fallback={5000}
          label={field(t, "lingeringTimeoutMs")}
          helper={help(t, "lingeringTimeoutMs")}
          value={asOptNum(value.lingeringTimeoutMs)}
          onChange={(v) => set("lingeringTimeoutMs", v)}
        />
      </SettingsGroup>
    </>
  );
}

function ClientFields({ t, level, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  const buffers = asRecord(value.largeClientHeaderBuffers);
  const optional = !inheritable(level);
  const body = (
    <SizeField
      name="clientMaxBodySize"
      optional={optional}
      label={field(t, "clientMaxBodySize")}
      helper={help(t, "clientMaxBodySize")}
      value={value.clientMaxBodySize}
      units={["gb", "mb", "kb"]}
      hints={SIZE_HINTS.body}
      onChange={(v) => set("clientMaxBodySize", v)}
    />
  );

  /*
    У сервера и пути ключ ровно один: `client_max_body_size`. Буферы и таймауты
    ниже http {} nginx не пускает вовсе; `client_body_temp_path` пустил бы, но
    он здесь не про запрос, а про файловую систему ноды -- см. модель. Заголовок
    группы над одной строкой был бы вывеской ни о чём.
  */
  if (!at(level, "http")) {
    return body;
  }

  return (
    <>
      <SettingsGroup title={group(t, "clientBody")}>
        {body}
        <SizeField
          name="clientHeaderBufferSize"
          optional
          label={field(t, "clientHeaderBufferSize")}
          helper={help(t, "clientHeaderBufferSize")}
          value={value.clientHeaderBufferSize}
          units={["mb", "kb"]}
          hints={SIZE_HINTS.headerBuffer}
          onChange={(v) => set("clientHeaderBufferSize", v)}
        />
        <SizeField
          name="clientBodyBufferSize"
          optional
          label={field(t, "clientBodyBufferSize")}
          helper={help(t, "clientBodyBufferSize")}
          value={value.clientBodyBufferSize}
          units={["mb", "kb"]}
          hints={SIZE_HINTS.bodyBuffer}
          onChange={(v) => set("clientBodyBufferSize", v)}
        />
        <Text
          name="clientBodyTempPath"
          optional
          mono
          fallback="/var/cache/nginx/client_temp"
          presets={BODY_TEMP_PATHS}
          label={field(t, "clientBodyTempPath")}
          helper={help(t, "clientBodyTempPath")}
          value={asString(value.clientBodyTempPath)}
          onChange={(v) => set("clientBodyTempPath", v)}
        />
        <Num
          optional
          fallback={4}
          presets={[2, 4, 8]}
          label={field(t, "largeHeaderCount")}
          helper={help(t, "largeHeaderCount")}
          value={asNumText(buffers.count)}
          end={<UnitLabel>buf</UnitLabel>}
          onChange={(v) =>
            onChange(
              setNested(
                value,
                "largeClientHeaderBuffers",
                setKey(
                  setKey(buffers, "count", parseNum(v)),
                  "size",
                  asString(buffers.size),
                ),
              ),
            )
          }
        />
        <SizeField
          optional
          label={field(t, "largeHeaderSize")}
          helper={help(t, "largeHeaderSize")}
          value={buffers.size}
          units={["mb", "kb"]}
          hints={SIZE_HINTS.header}
          defaultSize="8k"
          onChange={(v) =>
            onChange(
              setNested(
                value,
                "largeClientHeaderBuffers",
                setKey(setKey(buffers, "count", buffers.count), "size", v),
              ),
            )
          }
        />
      </SettingsGroup>
      <SettingsGroup title={group(t, "clientTimeouts")}>
        <Duration
          name="clientHeaderTimeoutMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          optional
          fallback={60000}
          label={field(t, "clientHeaderTimeoutMs")}
          helper={help(t, "clientHeaderTimeoutMs")}
          value={asOptNum(value.clientHeaderTimeoutMs)}
          onChange={(v) => set("clientHeaderTimeoutMs", v)}
        />
        <Duration
          name="clientBodyTimeoutMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          optional
          fallback={60000}
          label={field(t, "clientBodyTimeoutMs")}
          helper={help(t, "clientBodyTimeoutMs")}
          value={asOptNum(value.clientBodyTimeoutMs)}
          onChange={(v) => set("clientBodyTimeoutMs", v)}
        />
        <Duration
          name="sendTimeoutMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          optional
          fallback={60000}
          label={field(t, "sendTimeoutMs")}
          helper={help(t, "sendTimeoutMs")}
          value={asOptNum(value.sendTimeoutMs)}
          onChange={(v) => set("sendTimeoutMs", v)}
        />
      </SettingsGroup>
      <SettingsGroup title={group(t, "clientHeaders")}>
        <Text
          name="defaultType"
          optional
          fallback="text/html"
          presets={DEFAULT_TYPES}
          label={field(t, "defaultType")}
          helper={help(t, "defaultType")}
          value={asString(value.defaultType)}
          onChange={(v) => set("defaultType", v)}
        />
        <Tri
          name="underscoresInHeaders"
          fallback="off"
          optional
          t={t}
          label={field(t, "underscoresInHeaders")}
          helper={help(t, "underscoresInHeaders")}
          value={asOptBool(value.underscoresInHeaders)}
          onChange={(v) => set("underscoresInHeaders", v)}
        />
        <Tri
          name="ignoreInvalidHeaders"
          fallback="on"
          optional
          t={t}
          label={field(t, "ignoreInvalidHeaders")}
          helper={help(t, "ignoreInvalidHeaders")}
          value={asOptBool(value.ignoreInvalidHeaders)}
          onChange={(v) => set("ignoreInvalidHeaders", v)}
        />
        <Tri
          name="mergeSlashes"
          fallback="on"
          optional
          t={t}
          label={field(t, "mergeSlashes")}
          helper={help(t, "mergeSlashes")}
          value={asOptBool(value.mergeSlashes)}
          onChange={(v) => set("mergeSlashes", v)}
        />
        <Tri
          name="serverTokens"
          fallback="on"
          optional
          t={t}
          label={field(t, "serverTokens")}
          helper={help(t, "serverTokens")}
          value={asOptBool(value.serverTokens)}
          onChange={(v) => set("serverTokens", v)}
        />
      </SettingsGroup>
      <SettingsGroup title={group(t, "hash")} hint={groupHint(t, "hash")}>
        <SizeField
          name="serverNamesHashBucketSize"
          optional
          label={field(t, "serverNamesHashBucketSize")}
          helper={help(t, "serverNamesHashBucketSize")}
          value={value.serverNamesHashBucketSize}
          units={["kb", "b"]}
          hints={SIZE_HINTS.hashBucket}
          onChange={(v) => set("serverNamesHashBucketSize", v)}
        />
        <SizeField
          name="serverNamesHashMaxSize"
          optional
          label={field(t, "serverNamesHashMaxSize")}
          helper={help(t, "serverNamesHashMaxSize")}
          value={value.serverNamesHashMaxSize}
          units={["kb", "b"]}
          hints={SIZE_HINTS.hashMax}
          onChange={(v) => set("serverNamesHashMaxSize", v)}
        />
        <SizeField
          name="typesHashBucketSize"
          optional
          label={field(t, "typesHashBucketSize")}
          helper={help(t, "typesHashBucketSize")}
          value={value.typesHashBucketSize}
          units={["kb", "b"]}
          hints={SIZE_HINTS.hashBucket}
          onChange={(v) => set("typesHashBucketSize", v)}
        />
        <SizeField
          name="typesHashMaxSize"
          optional
          label={field(t, "typesHashMaxSize")}
          helper={help(t, "typesHashMaxSize")}
          value={value.typesHashMaxSize}
          units={["kb", "b"]}
          hints={SIZE_HINTS.hashMax}
          defaultSize="1024"
          onChange={(v) => set("typesHashMaxSize", v)}
        />
      </SettingsGroup>
    </>
  );
}

function FilesFields({ t, level, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  return (
    <>
      <Text
        name="root"
        mono
        presets={ROOTS}
        label={field(t, "root")}
        helper={help(t, "root")}
        value={asString(value.root)}
        placeholder={ROOTS[0]}
        onChange={(v) => set("root", v)}
      />
      {at(level, "location") && (
        <Text
          name="alias"
          mono
          label={field(t, "alias")}
          helper={help(t, "alias")}
          value={asString(value.alias)}
          onChange={(v) => set("alias", v)}
        />
      )}
      {at(level, "location") && (
        <Chips
          name="index"
          t={t}
          label={field(t, "index")}
          helper={help(t, "index")}
          value={asStringList(value.index)}
          options={INDEXES}
          onChange={(v) => set("index", v)}
        />
      )}
      {at(level, "location") && (
        <Chips
          name="tryFiles"
          t={t}
          label={field(t, "tryFiles")}
          helper={help(t, "tryFiles")}
          value={asStringList(value.tryFiles)}
          options={TRY_FILES}
          onChange={(v) => set("tryFiles", v)}
        />
      )}
      {at(level, "location") && (
        <Tri
          name="internal"
          fallback="off"
          t={t}
          label={field(t, "internal")}
          helper={help(t, "internal")}
          value={asOptBool(value.internal)}
          onChange={(v) => set("internal", v)}
        />
      )}
      {/*
        SSI страница отказа подставляет `$waf_ray` и `$waf_deny_name`: без него
        оператор видит на странице голые переменные.
      */}
      {at(level, "location") && (
        <Tri
          name="ssi"
          fallback="off"
          t={t}
          label={field(t, "ssi")}
          helper={help(t, "ssi")}
          value={asOptBool(value.ssi)}
          onChange={(v) => set("ssi", v)}
        />
      )}
      {at(level, "location") && (
        <Chips
          name="ssiTypes"
          t={t}
          label={field(t, "ssiTypes")}
          helper={help(t, "ssiTypes")}
          value={asStringList(value.ssiTypes)}
          options={SSI_TYPES}
          onChange={(v) => set("ssiTypes", v)}
        />
      )}
      {at(level, "server") && (
        <Text
          name="charset"
          presets={CHARSETS}
          label={field(t, "charset")}
          helper={help(t, "charset")}
          value={asString(value.charset)}
          placeholder="utf-8"
          onChange={(v) => set("charset", v)}
        />
      )}
      {at(level, "server") && (
        <Tri
          name="httpsRedirect"
          fallback="off"
          t={t}
          label={field(t, "httpsRedirect")}
          helper={help(t, "httpsRedirect")}
          value={asOptBool(value.httpsRedirect)}
          onChange={(v) => set("httpsRedirect", v)}
        />
      )}
      {at(level, "location") && (
        <Choice
          name="role"
          fallback="none"
          t={t}
          label={field(t, "role")}
          helper={help(t, "role")}
          value={asString(value.role)}
          options={ROLES}
          onChange={(v) => set("role", v)}
        />
      )}
    </>
  );
}

function AccessFields({ t, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  return (
    <>
      <Chips
        name="allow"
        t={t}
        label={field(t, "allow")}
        helper={help(t, "allow")}
        value={asStringList(value.allow)}
        options={NETS}
        onChange={(v) => set("allow", v)}
      />
      <Chips
        name="deny"
        t={t}
        label={field(t, "deny")}
        helper={help(t, "deny")}
        value={asStringList(value.deny)}
        options={NETS}
        onChange={(v) => set("deny", v)}
      />
    </>
  );
}

function TlsFields({ t, level, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  const optional = !inheritable(level);
  return (
    <>
      <Chips
        name="sslProtocols"
        t={t}
        optional={optional}
        fallback={SSL_PROTO}
        label={field(t, "sslProtocols")}
        helper={help(t, "sslProtocols")}
        value={asStringList(value.sslProtocols)}
        options={SSL_PROTO}
        onChange={(v) => set("sslProtocols", v)}
      />
      <Text
        name="sslCiphers"
        mono
        optional={optional}
        presets={SSL_CIPHERS}
        label={field(t, "sslCiphers")}
        helper={help(t, "sslCiphers")}
        value={asString(value.sslCiphers)}
        onChange={(v) => set("sslCiphers", v)}
      />
      <Tri
        name="sslPreferServerCiphers"
        fallback="off"
        optional={optional}
        t={t}
        label={field(t, "sslPreferServerCiphers")}
        helper={help(t, "sslPreferServerCiphers")}
        value={asOptBool(value.sslPreferServerCiphers)}
        onChange={(v) => set("sslPreferServerCiphers", v)}
      />
      <Text
        name="sslSessionCache"
        optional={optional}
        fallback={"shared:SSL:10m"}
        presets={SSL_CACHES}
        label={field(t, "sslSessionCache")}
        helper={help(t, "sslSessionCache")}
        value={asString(value.sslSessionCache)}
        placeholder={SSL_CACHES[0]}
        onChange={(v) => set("sslSessionCache", v)}
      />
      {/*
        Время сессии директива хранит строкой nginx (`5m`, `1d`), но правится
        оно тем же полем, что и остальные длительности: голым текстом единица
        стояла в самом значении, и колонка единиц у строки пустовала. Наружу
        снова уезжает строка -- модель и компилятор её не знают числом.
      */}
      <Duration
        name="sslSessionTimeout"
        base="s"
        optional={optional}
        fallback={SSL_TIMEOUT_S}
        presets={SSL_TIMEOUTS_S}
        label={field(t, "sslSessionTimeout")}
        helper={help(t, "sslSessionTimeout")}
        value={parseNginxTimeS(asString(value.sslSessionTimeout))}
        onChange={(v) =>
          set("sslSessionTimeout", v === undefined ? undefined : formatNginxTimeS(v))
        }
      />
      {/*
        Клиентские сертификаты проверяет только `server {}`: корень и список
        отзыва живут в его карточке, и глубина цепочки -- там же.
      */}
      {at(level, "server") && (
        <Choice
          name="sslVerifyClient"
          fallback="off"
          t={t}
          label={field(t, "sslVerifyClient")}
          helper={help(t, "sslVerifyClient")}
          value={asString(value.sslVerifyClient)}
          options={SSL_VERIFY}
          onChange={(v) => set("sslVerifyClient", v)}
        />
      )}
      {/*
        Глубина -- число, и модель хранит её числом: текстовое поле читало
        `asString` от числа и показывало пустую строку на заданной директиве.
      */}
      {at(level, "server") && (
        <Num
          name="sslVerifyDepth"
          fallback={1}
          presets={VERIFY_DEPTH}
          label={field(t, "sslVerifyDepth")}
          helper={help(t, "sslVerifyDepth")}
          value={asNumText(value.sslVerifyDepth)}
          end={<UnitLabel>certs</UnitLabel>}
          onChange={(v) => set("sslVerifyDepth", parseNum(v))}
        />
      )}
    </>
  );
}

function ProxyFields({ t, level, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  const loc = at(level, "location");
  const optional = !inheritable(level);
  return (
    <>
      {loc && (
        <Duration
          name="proxyConnectTimeoutMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          label={field(t, "proxyConnectTimeoutMs")}
          helper={help(t, "proxyConnectTimeoutMs")}
          value={asOptNum(value.proxyConnectTimeoutMs)}
          onChange={(v) => set("proxyConnectTimeoutMs", v)}
        />
      )}
      {loc && (
        <Duration
          name="proxyReadTimeoutMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          label={field(t, "proxyReadTimeoutMs")}
          helper={help(t, "proxyReadTimeoutMs")}
          value={asOptNum(value.proxyReadTimeoutMs)}
          onChange={(v) => set("proxyReadTimeoutMs", v)}
        />
      )}
      {loc && (
        <Duration
          name="proxySendTimeoutMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          label={field(t, "proxySendTimeoutMs")}
          helper={help(t, "proxySendTimeoutMs")}
          value={asOptNum(value.proxySendTimeoutMs)}
          onChange={(v) => set("proxySendTimeoutMs", v)}
        />
      )}
      {loc && (
        <Tri
          name="proxyBuffering"
          fallback="on"
          t={t}
          label={field(t, "proxyBuffering")}
          helper={help(t, "proxyBuffering")}
          value={asOptBool(value.proxyBuffering)}
          onChange={(v) => set("proxyBuffering", v)}
        />
      )}
      {loc && (
        <Tri
          name="proxyRequestBuffering"
          fallback="on"
          t={t}
          label={field(t, "proxyRequestBuffering")}
          helper={help(t, "proxyRequestBuffering")}
          value={asOptBool(value.proxyRequestBuffering)}
          onChange={(v) => set("proxyRequestBuffering", v)}
        />
      )}
      <Choice
        name="proxyHttpVersion"
        fallback="1.0"
        optional={optional}
        t={t}
        label={field(t, "proxyHttpVersion")}
        helper={help(t, "proxyHttpVersion")}
        value={asString(value.proxyHttpVersion)}
        options={PROXY_VER}
        onChange={(v) => set("proxyHttpVersion", v)}
      />
      <Choice
        name="proxyHeaders"
        /* Ключа нет -- строк нет: набор берётся с родителя, как в nginx. */
        fallback="none"
        optional={optional}
        t={t}
        label={field(t, "proxyHeaders")}
        helper={help(t, "proxyHeaders")}
        value={asString(value.proxyHeaders)}
        options={loc ? PROXY_HDR_LOC : PROXY_HDR}
        onChange={(v) => set("proxyHeaders", v)}
      />
      {loc && (
        <HeaderRow
          t={t}
          label={field(t, "proxySetHeader")}
          help={help(t, "proxySetHeader")}
          value={value}
          fieldKey="proxySetHeaders"
          onChange={onChange}
        />
      )}
    </>
  );
}

/*
  Заголовки ответа -- таблица во всю секцию (раздел с `table`): имя,
  значение, флаг `always`, «+» в шапке. Секция целиком про этот список, и
  строка настройки с парами внутри ячейки занимала место подписью директивы,
  которую таблица держит в ⓘ колонки имени.
*/
function HeadersFields({ t, value, onChange }: SectionProps) {
  return (
    <PairsTable
      rows={asPairs(value.addHeaders)}
      nameHelp={help(t, "addHeaders")}
      valueLabel={t("config.varValue")}
      namePlaceholder="Strict-Transport-Security"
      valuePlaceholder="max-age=31536000"
      add={{
        button: t("config.header.add"),
        title: t("config.header.addTitle"),
        hint: t("config.header.addHint"),
        directive: "add_header",
        emitted: t("config.header.emitted"),
        nothing: t("config.header.nothing"),
        empty: t("config.header.empty"),
        dup: t("config.header.dup"),
      }}
      flag={{
        key: "always",
        label: t("config.addHeaderAlways"),
        help: help(t, "addHeaderAlways"),
      }}
      onChange={(next) =>
        onChange(setKey(value, "addHeaders", next.length === 0 ? undefined : next))
      }
    />
  );
}

function GzipFields({ t, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  return (
    <>
      <Tri
        name="gzip"
        fallback="off"
        optional
        t={t}
        label={field(t, "gzip")}
        helper={help(t, "gzip")}
        value={asOptBool(value.gzip)}
        onChange={(v) => set("gzip", v)}
      />
      <Num
        name="gzipCompLevel"
        optional
        fallback={1}
        presets={[1, 4, 6, 9]}
        label={field(t, "gzipCompLevel")}
        helper={help(t, "gzipCompLevel")}
        value={asNumText(value.gzipCompLevel)}
        end={<UnitLabel>lvl</UnitLabel>}
        onChange={(v) => set("gzipCompLevel", parseNum(v))}
      />
      {/*
        Порог -- байты, и правится он тем же полем, что остальные размеры:
        числом без единицы «256» читалось килобайтами ровно так же, как
        байтами. Модель хранит число -- `Bytes` его и отдаёт.
      */}
      <Bytes
        name="gzipMinLength"
        optional
        units={["kb", "b"]}
        hints={SIZE_HINTS.gzipMin}
        label={field(t, "gzipMinLength")}
        helper={help(t, "gzipMinLength")}
        value={asOptNum(value.gzipMinLength)}
        onChange={(v) => set("gzipMinLength", v)}
      />
      <Tri
        name="gzipVary"
        fallback="off"
        optional
        t={t}
        label={field(t, "gzipVary")}
        helper={help(t, "gzipVary")}
        value={asOptBool(value.gzipVary)}
        onChange={(v) => set("gzipVary", v)}
      />
      <Chips
        name="gzipTypes"
        t={t}
        optional
        fallback={GZIP_TYPES}
        label={field(t, "gzipTypes")}
        helper={help(t, "gzipTypes")}
        value={asStringList(value.gzipTypes)}
        options={GZIP_TYPES}
        onChange={(v) => set("gzipTypes", v)}
      />
    </>
  );
}

function NetFields({ t, level, value, onChange }: SectionProps) {
  const set = (key: string, next: unknown) => onChange(setKey(value, key, next));
  const optional = !inheritable(level);
  return (
    <>
      {/* Резолвер -- свойство процесса: ниже http {} nginx его не наследует. */}
      {at(level, "http") && (
        <Chips
          name="resolver"
          t={t}
          optional
          fallback={RESOLVERS}
          label={field(t, "resolver")}
          helper={help(t, "resolver")}
          value={asStringList(value.resolver)}
          options={RESOLVERS}
          placeholder="1.1.1.1"
          onChange={(v) => set("resolver", v)}
        />
      )}
      {at(level, "http") && (
        <Duration
          name="resolverTimeoutMs"
          base="ms"
          presets={MS_PRESETS.timeout}
          optional
          fallback={30000}
          label={field(t, "resolverTimeoutMs")}
          helper={help(t, "resolverTimeoutMs")}
          value={asOptNum(value.resolverTimeoutMs)}
          onChange={(v) => set("resolverTimeoutMs", v)}
        />
      )}
      <Chips
        name="realIpFrom"
        t={t}
        optional={optional}
        fallback={PRIVATE_NETS}
        label={field(t, "realIpFrom")}
        helper={help(t, "realIpFrom")}
        value={asStringList(value.realIpFrom)}
        options={PRIVATE_NETS}
        placeholder="10.0.0.0/8"
        onChange={(v) => set("realIpFrom", v)}
      />
      <Text
        name="realIpHeader"
        optional={optional}
        fallback={"X-Forwarded-For"}
        presets={REAL_IP_HEADERS}
        label={field(t, "realIpHeader")}
        helper={help(t, "realIpHeader")}
        value={asString(value.realIpHeader)}
        placeholder="X-Forwarded-For"
        onChange={(v) => set("realIpHeader", v)}
      />
      <Tri
        name="realIpRecursive"
        fallback="off"
        optional={optional}
        t={t}
        label={field(t, "realIpRecursive")}
        helper={help(t, "realIpRecursive")}
        value={asOptBool(value.realIpRecursive)}
        onChange={(v) => set("realIpRecursive", v)}
      />
    </>
  );
}

/*
  error_log в модели -- {path, level}, access_log -- список приёмников или off.
  Текстовое поле поверх этих форм показывало пустоту при заполненном значении.
*/
/** Раздел -- два блока с таблицами, см. LogsTable.tsx. */
function LogsFields({ level, value, onChange }: SectionProps) {
  return <LogsTable level={level} value={value} onChange={onChange} />;
}

/*
  Заголовки к апстриму (`proxy_set_header`) -- список пар в одной строке
  таблицы настроек: они стоят среди других полей прокси. Глобальные
  `add_header` живут своей таблицей ([HeadersFields]). Раньше это был блок из `TextField` со
  своими подписями: он выпадал из таблицы и занимал вчетверо больше места.
*/
function HeaderRow({
  t,
  label,
  help: hint,
  value,
  fieldKey,
  onChange,
}: {
  t: Translate;
  label: string;
  help?: string;
  value: Doc;
  fieldKey: string;
  onChange: (next: Doc) => void;
}) {
  const rows = asPairs(value[fieldKey]);

  return (
    <EditorRow label={label} help={hint}>
      <PairRows
        rows={rows}
        namePlaceholder="X-Real-IP"
        valuePlaceholder="$remote_addr"
        addLabel={t("common.add")}
        onChange={(next) =>
          onChange(setKey(value, fieldKey, next.length === 0 ? undefined : next))
        }
      />
    </EditorRow>
  );
}
