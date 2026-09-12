/**
 * Общие куски печати nginx: отступ, store:<uuid>, наследуемый waf-маршрут.
 * Компиляторы location / server / http собирают из них свой блок.
 */

import { wavesFromAfter } from "../inspector-graph.ts";
import type { Inspector } from "../model/http-space.ts";
import { accessLogTails, errorLogTail } from "../model/log.ts";
import type {
  Cond,
  CookieDefaults,
  InspectorDecl,
  InspectorMode,
  InspectorPhase,
  InspectorRef,
  LocalCheck,
  LocalRate,
  ScoreDeny,
  WafRouteSettings,
} from "../model/waf-route.ts";

export interface ProxyHeader {
  name: string;
  value: string;
}

/*
 * Умолчания nginx для заголовков к защищаемому серверу -- `Host $proxy_host`
 * и `Connection close`: в Host уезжает ИМЯ ПУЛА, а соединение закрывается
 * после ответа. Приложению за WAF нужно не это, поэтому три строки ниже
 * оператор пишет в каждом втором конфиге руками; пресет -- те же три строки
 * одним выбором.
 */
const STANDARD_HEADERS: readonly ProxyHeader[] = [
  { name: "Host", value: "$host" },
  { name: "X-Forwarded-For", value: "$proxy_add_x_forwarded_for" },
  { name: "X-Forwarded-Proto", value: "$scheme" },
];

/**
 * Заголовки пресета. `none` и отсутствие ключа дают один и тот же файл:
 * уровень заголовков не задаёт. Иначе и быть не может -- в nginx набор
 * `proxy_set_header` наследуется целиком и заменяется целиком, и «ни одного
 * заголовка на этом уровне» от «ключа здесь нет» неотличимо.
 *
 * `custom` (только путь) -- «печатать нечего, кроме моего списка».
 */
export function presetProxyHeaders(preset: string | undefined): ProxyHeader[] {
  switch (preset) {
    case "standard":
      return [...STANDARD_HEADERS];
    case "websocket":
      /*
        Апгрейд соединения -- это ровно две строки поверх обычных, и обе
        обязательны: без Upgrade узел не поймёт, о чём его просят, без
        Connection закроет соединение сразу после ответа. `$connection_upgrade`
        -- переменная map'а, который печатает компилятор http (upgradeMapUsed).
      */
      return [
        ...STANDARD_HEADERS,
        { name: "Upgrade", value: "$http_upgrade" },
        { name: "Connection", value: "$connection_upgrade" },
      ];
    default:
      return [];
  }
}

/**
 * Заголовок в набор: с тем же именем -- заменяет на месте, новый -- в хвост.
 * Два `proxy_set_header Host` в одном блоке уедут на провод двумя заголовками,
 * поэтому список правится, а не дополняется.
 */
export function putProxyHeader(rows: ProxyHeader[], header: ProxyHeader): void {
  const at = rows.findIndex(
    (row) => row.name.toLowerCase() === header.name.toLowerCase(),
  );
  if (at === -1) {
    rows.push(header);
  } else {
    rows[at] = header;
  }
}

/** Пресет websocket без 1.1 не работает: апгрейда в HTTP/1.0 нет. */
export function proxyVersionFor(
  version: string | undefined,
  preset: string | undefined,
): string | undefined {
  return version ?? (preset === "websocket" ? "1.1" : undefined);
}

export interface NginxCompileResult {
  text: string;
  storeRefs: string[];
}

export class WafCompileError extends Error {
  readonly code: string;
  /** Числа и имена причины -- панели для перевода; в message они уже есть. */
  readonly params?: Record<string, string | number>;

  constructor(code: string, message: string, params?: Record<string, string | number>) {
    super(message);
    this.code = code;
    this.name = "WafCompileError";
    if (params !== undefined) {
      this.params = params;
    }
  }
}

export interface StoreRefs {
  path(uuid: string): string;
  scan(text: string): void;
}

export function createStoreRefs(storeRefs: string[]): StoreRefs {
  return {
    path(uuid: string): string {
      if (!storeRefs.includes(uuid)) {
        storeRefs.push(uuid);
      }
      return `store:${uuid}`;
    },
    scan(text: string): void {
      extractStoreRefs(text, storeRefs);
    },
  };
}

/** Свой список ссылок плюс проброс в родительский store, если он есть. */
export function nestStore(local: string[], parent?: StoreRefs): StoreRefs {
  const own = createStoreRefs(local);
  if (!parent) return own;
  return {
    path(uuid: string): string {
      own.path(uuid);
      return parent.path(uuid);
    },
    scan(text: string): void {
      own.scan(text);
      parent.scan(text);
    },
  };
}

/** Вставить уже собранный блок в общий список строк без лишнего перевода. */
export function appendBlock(lines: string[], text: string): void {
  lines.push(text.endsWith("\n") ? text.slice(0, -1) : text);
}

/**
 * Как печатать вложенные блоки: целиком (файл, который уедет на ноды) или
 * заглушкой `include` по uuid (превью одного уровня дерева).
 *
 * В превью http {} серверы и апстримы -- чужие карточки: их текст прячет
 * настройки самого блока за три экрана, а увидеть, что изменилось, можно
 * только в них самих. Заглушка называет узел так, как его ищет панель, -- по
 * uuid -- и в комментарии подписывает именем, чтобы найти карточку глазами.
 * В файл заглушка не попадает: `send` печатает дерево целиком.
 */
export type NestedBlocks = "print" | "include";

export function includeStub(
  kind: "upstream" | "server" | "location",
  id: string,
  title: string,
  enabled = true,
): string {
  const line = `include ${kind}s/${id}.conf;  # ${title}`;
  // Выключенный узел в файле не печатается -- и заглушка его закомментирована,
  // а не пропущена: карточка есть, и оператор должен её видеть.
  return enabled ? line : `# ${line} (off)`;
}

/**
 * Уровень, на котором печатается документ.
 *
 * Граница проходит между «что объявлено» и «что делается с запросом».
 *
 * `http {}` -- конфигурация контура: процесс, шина, зона, каталоги и реестр
 * инспекторов (`waf_inspector`). Он говорит, какие инспекторы вообще есть,
 * под каким subject и с каким профилем.
 *
 * Сервер и путь -- решения по запросу: включён ли WAF, кого звать
 * (`waf_inspect`), что блокировать локально, каков бюджет, чем отвечать на
 * отказ. Это не может быть общим для контура: на проде серверы принадлежат
 * разным клиентам, и один набор политик для них либо избыточен, либо
 * недостаточен.
 *
 * Поэтому документ маршрута печатается только на сервере и пути, а всё, что
 * попало на пространство, компилятор отвергает, а не применяет молча.
 */
export type RouteLevel = "http" | "server" | "location";

/**
 * Ключи `WafRouteSettings`, которые допустимы на `http_spaces.waf`.
 * Реестр -- объявление, а не решение, поэтому он и остаётся.
 */
export const HTTP_WAF_KEYS = new Set(["inspectors", "inspectorProfiles"]);

/** Решения по запросу, оказавшиеся на пространстве. */
export function routeKeysAtHttp(waf: WafRouteSettings | undefined): string[] {
  if (!waf) return [];
  return Object.keys(waf).filter(
    (key) => !HTTP_WAF_KEYS.has(key) && (waf as Record<string, unknown>)[key] !== undefined,
  );
}

export function emitWafRoute(
  lines: string[],
  waf: WafRouteSettings,
  inspectors: Inspector[],
  indent = 1,
  graph: Record<string, InspectorDecl> = {},
  level: RouteLevel = "http",
): void {
  if (!waf) return;

  // На пространстве документ маршрута не печатается вовсе: там только реестр,
  // а он едет отдельной директивой. Ключи решения отсекает compileHttp -- до
  // остальных проверок, чтобы ошибка называла причину, а не последствие.
  if (level === "http") {
    return;
  }

  const p = "    ".repeat(indent);

  if (waf.enabled !== undefined) {
    lines.push(`${p}waf ${waf.enabled ? "on" : "off"};`);
  }
  emitDeadline(lines, p, "request", waf.deadlineMs);
  emitDeadline(lines, p, "response", waf.responseDeadlineMs);
  emitDeadline(lines, p, "frame", waf.frameDeadlineMs);
  // На запросе выбора нет (`request monitor` -- это mode=passive), на кадрах
  // модуль ведёт только gate, поэтому печатается только фаза ответа.
  if (waf.responseHold) {
    lines.push(`${p}waf_hold response ${waf.responseHold};`);
  }
  if (waf.denyMode) lines.push(`${p}waf_deny_mode request ${waf.denyMode};`);
  // Исключения: хвост целиком, как у waf_send и waf_archive.
  emitTails(lines, p, "waf_exception", waf.exception);

  emitScoreDeny(lines, "request", waf.scoreDeny, p);
  emitScoreDeny(lines, "response", waf.responseScoreDeny, p);
  emitScoreDeny(lines, "frame", waf.frameScoreDeny, p);
  // Ось «Отдать»: фаза первым словом, объекты со значением original/store.
  emitSend(lines, p, waf.send);
  emitHandshake(lines, waf, p);
  emitFrameAudit(lines, waf, p);
  emitFrameExtras(lines, waf, p);

  if (waf.denyResponseDefault) {
    lines.push(`${p}waf_deny_response_default ${waf.denyResponseDefault};`);
  }

  // Ноль печатается наравне с прочими значениями: это «канал выключен здесь»,
  // а не отсутствие ключа, и родительский предел он обязан перебить.
  if (waf.actionMax) lines.push(`${p}waf_action_max ${waf.actionMax};`);
  if (waf.actionsMax !== undefined) {
    lines.push(`${p}waf_actions_max ${waf.actionsMax};`);
  }
  if (waf.bodyLimit) {
    /*
     * Фаза -- часть директивы, а не украшение: модуль объявляет её TAKE23 и
     * форму без фазы отвергает на `nginx -t`. Значение приходит из карточки
     * размером ("1m") либо с фазой ("response 4m"), поэтому умолчание --
     * request, как у остальных фазовых директив.
     *
     * Ответ здесь не роскошь: как только на маршруте появляется фаза ответа,
     * начинает действовать умолчание модуля (1m block), и страница крупнее
     * мегабайта уходит клиенту отказом. Задать другой предел иначе нечем.
     */
    const policy = waf.bodyLimitPolicy ? ` ${waf.bodyLimitPolicy}` : "";
    const { phase, rest } = splitPhase(
      `${waf.bodyLimit}${policy}`,
      "waf_body_limit",
    );

    lines.push(`${p}waf_body_limit ${phase} ${rest};`);
  }
  // Хвост директивы печатается как есть: объект, размеры и списки имён читаются
  // вместе, и разбирать их здесь значило бы держать грамматику в двух местах.
  // По строке на объект: строки одного уровня складываются, а не вытесняются.
  emitTailsPhased(lines, p, "waf_archive", waf.archive);
  emitTailsPhased(lines, p, "waf_preview", waf.preview);

  if (waf.redirectAllow && waf.redirectAllow.length > 0) {
    lines.push(`${p}waf_redirect_allow ${waf.redirectAllow.join(" ")};`);
  }

  emitCookieDefaults(lines, waf.cookieDefaults, p);

  if (waf.debugHeader !== undefined) {
    lines.push(`${p}waf_debug_header ${waf.debugHeader ? "on" : "off"};`);
  }

  emitInspects(lines, waf, graph, inspectors, p);

  // Пустой набор -- это `off`, а не отсутствие ключа: маршрут снимает захват,
  // разрешённый выше, и это должно быть видно в тексте. Имена без области
  // получают `request`: фаза ответа появится, и молчаливое умолчание тогда
  // пришлось бы либо ломать, либо оставлять двусмысленным.
  if (waf.capture !== undefined) {
    emitCapture(lines, waf.capture, p);
  }

  emitLocalChecks(lines, waf.localChecks, p);
  emitLocalRates(lines, waf.localRates, p);
}

/*
 * Рукопожатие websocket-пути. Ключи печатаются только когда названы: их
 * умолчания для websocket-пути подставляет compileLocation (wafFor), а на
 * http-пути их не бывает вовсе -- validateWafCompile отвергает.
 */
function emitHandshake(lines: string[], waf: WafRouteSettings, p: string): void {
  if (waf.requireUpgrade !== undefined) {
    const resp =
      waf.requireUpgrade && waf.requireUpgradeResponse
        ? ` response=${waf.requireUpgradeResponse}`
        : "";
    lines.push(`${p}waf_require_upgrade ${waf.requireUpgrade ? "on" : "off"}${resp};`);
  }
  if (waf.wsStripExtensions !== undefined) {
    const words = waf.wsStripExtensions.length === 0 ? "off" : waf.wsStripExtensions.join(" ");
    lines.push(`${p}waf_ws_strip_extensions ${words};`);
  }
}

/*
 * Аудит кадров. Печатается только когда назван: умолчание модуля -- `deny`.
 * Сэмпл есть только у `all` (модуль отвергает его у deny на nginx -t), и с
 * другими значениями он не печатается.
 */
function emitFrameAudit(lines: string[], waf: WafRouteSettings, p: string): void {
  if (waf.frameAudit === undefined) {
    return;
  }
  const sample =
    waf.frameAudit === "all" && waf.frameAuditSample !== undefined && waf.frameAuditSample > 1
      ? ` sample=${waf.frameAuditSample}`
      : "";
  lines.push(`${p}waf_audit_frames ${waf.frameAudit}${sample};`);
}

/*
 * Сборка фрагментов, ограничитель контрольных кадров и кеш вердикта.
 * Печатаются только когда названы: умолчания модуля -- off, 10r/s и
 * выключенный кеш. Кеш без срока не печатается вовсе: модуль такую строку
 * отвергает, а срок -- единственный её рычаг.
 */
function emitFrameExtras(lines: string[], waf: WafRouteSettings, p: string): void {
  if (waf.frameReassemble !== undefined) {
    lines.push(`${p}waf_frame_reassemble ${waf.frameReassemble ? "on" : "off"};`);
  }
  if (waf.frameControlRate !== undefined && waf.frameControlRate !== "") {
    lines.push(`${p}waf_frame_control_rate ${waf.frameControlRate};`);
  }
  if (waf.frameCacheTtl !== undefined && waf.frameCacheTtl !== "") {
    const stream = waf.frameCacheStream ?? "both";
    const phase = stream === "both" ? "frame" : `frame:${stream}`;
    lines.push(`${p}waf_frame_cache ${phase} ttl=${waf.frameCacheTtl};`);
  }
}

/**
 * Фаза -- первое слово хвоста. Без неё действует `request`: так хранятся
 * строки, заведённые до фазы ответа. Кадры пишутся стороной (`frame:c2s`,
 * `frame:s2c`) либо обеими сразу (`frame`) -- у снимка, предела тела, архива
 * и превью одинаково: у кадра те же три оси, что у тела запроса, только без
 * `reload` (оригинала у кадра нет -- это ловит модуль на `nginx -t`).
 */
export type TailPhase = "request" | "response" | "frame:c2s" | "frame:s2c" | "frame";

const FRAME_TAIL_PHASES: readonly TailPhase[] = ["frame:c2s", "frame:s2c", "frame"];

export function splitPhase(tail: string, name: string): { phase: TailPhase; rest: string } {
  const t = tail.trim();
  const first = t.split(/\s+/, 1)[0] ?? "";
  if (first === "frame:c2s" || first === "frame:s2c" || first === "frame") {
    return { phase: first, rest: t.slice(first.length).trim() };
  }
  if (first.startsWith("frame")) {
    throw new WafCompileError(
      "phase_unknown",
      `${name} ${first}: write frame, frame:c2s or frame:s2c`,
    );
  }
  if (first === "request" || first === "response") {
    return { phase: first, rest: t.slice(first.length).trim() };
  }
  return { phase: "request", rest: t };
}

/*
 * Фазы, у которых «пустой ключ» печатается как `none`: у кадров умолчание
 * модуля и так «не снимать», а строка `frame:c2s none` на маршруте без
 * кадров читалась бы как настройка сокетов там, где сокетов нет.
 */
const TAIL_PHASES: readonly TailPhase[] = ["request", "response"];

/*
 * Строки одной фазы складываются по объектам: сначала перечисление объектов,
 * затем списки имён -- у `mask=`/`deny=` первым словом стоит свой объект, и
 * смешать их с общим перечислением нельзя. `none`/`off` снимает фазу целиком.
 */
function emitCapture(lines: string[], items: string[], p: string): void {
  if (items.length === 0) {
    for (const phase of TAIL_PHASES) {
      lines.push(`${p}waf_capture ${phase} none;`);
    }
    return;
  }

  // Кадры складываются как остальные фазы, но `none` за отсутствие строк у
  // них не печатается: см. TAIL_PHASES.
  for (const phase of [...TAIL_PHASES, ...FRAME_TAIL_PHASES]) {
    const objects: string[] = [];
    const lists: string[] = [];
    let off = false;

    for (const item of items) {
      const row = splitPhase(item, "waf_capture");
      if (row.phase !== phase || row.rest === "") continue;
      if (row.rest === "off" || row.rest === "none") {
        off = true;
      } else if (/^(headers|args)\s+(mask|deny)=/.test(row.rest)) {
        lists.push(row.rest);
      } else {
        objects.push(row.rest);
      }
    }

    if (off) {
      lines.push(`${p}waf_capture ${phase} none;`);
      continue;
    }
    if (objects.length > 0) {
      lines.push(`${p}waf_capture ${phase} ${objects.join(" ")};`);
    }
    for (const list of lists) {
      lines.push(`${p}waf_capture ${phase} ${list};`);
    }
  }
}

/**
 * `access_log` и `error_log` блока. Печатаются в http, server и location
 * одинаково: одна функция, потому что и директива одна, и наследование у неё
 * общее для ядра nginx.
 *
 * Строк `access_log` может быть несколько -- это допускает сам nginx, и на
 * краю это два приёмника: общий лог и лог хоста. `off` -- отдельная форма
 * директивы, а не пустой список: пустой означал бы «ключа нет».
 */
export function emitLogs(
  lines: string[],
  nginx: { accessLog?: unknown; errorLog?: unknown },
  p: string,
): void {
  for (const tail of accessLogTails(nginx.accessLog)) {
    lines.push(`${p}access_log ${tail};`);
  }
  const err = errorLogTail(nginx.errorLog);
  if (err !== undefined) {
    lines.push(`${p}error_log ${err};`);
  }
}

/**
 * Сжатие блока. Печатается одинаково в http, server и location -- директивы
 * одни и те же, различается только отступ.
 */
export function emitGzip(
  lines: string[],
  nginx: {
    gzip?: boolean;
    gzipTypes?: string[];
    gzipCompLevel?: number;
    gzipMinLength?: number;
    gzipVary?: boolean;
  },
  p: string,
): void {
  if (nginx.gzip !== undefined) {
    lines.push(`${p}gzip ${nginx.gzip ? "on" : "off"};`);
  }
  if (typeof nginx.gzipCompLevel === "number") {
    lines.push(`${p}gzip_comp_level ${nginx.gzipCompLevel};`);
  }
  if (typeof nginx.gzipMinLength === "number") {
    lines.push(`${p}gzip_min_length ${nginx.gzipMinLength};`);
  }
  if (nginx.gzipVary !== undefined) {
    lines.push(`${p}gzip_vary ${nginx.gzipVary ? "on" : "off"};`);
  }
  if (nginx.gzipTypes && nginx.gzipTypes.length > 0) {
    lines.push(`${p}gzip_types ${nginx.gzipTypes.join(" ")};`);
  }
}

export function emitRealIp(
  lines: string[],
  nginx: { realIpFrom?: string[]; realIpHeader?: string; realIpRecursive?: boolean },
  p: string,
): void {
  if (nginx.realIpFrom) {
    for (const net of nginx.realIpFrom) {
      lines.push(`${p}set_real_ip_from ${net};`);
    }
  }
  if (nginx.realIpHeader) {
    lines.push(`${p}real_ip_header ${nginx.realIpHeader};`);
  }
  if (nginx.realIpRecursive !== undefined) {
    lines.push(`${p}real_ip_recursive ${nginx.realIpRecursive ? "on" : "off"};`);
  }
}

export function durationMs(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

export function ind(lines: string[], text: string, level = 1): void {
  lines.push("    ".repeat(level) + text);
}

export function optStr(lines: string[], name: string, value: string | undefined | null): void {
  if (value) ind(lines, `${name} ${value};`);
}

/**
 * Только бюджет фазы: исход без вердикта называет `waf_exception`, и держать
 * его в хвосте времени значило бы, что у одного класса события рычаг свой, а у
 * трёх остальных общий.
 */
export function emitDeadline(
  lines: string[],
  p: string,
  phase: InspectorPhase | "frame:c2s",
  ms: number | undefined,
): void {
  if (typeof ms !== "number") return;
  lines.push(`${p}waf_deadline ${phase} ${ms}ms;`);
}

export function emitTails(lines: string[], p: string, name: string, tails: string[] | undefined): void {
  for (const tail of tails ?? []) {
    if (tail) lines.push(`${p}${name} ${tail};`);
  }
}

function emitTailsPhased(
  lines: string[],
  p: string,
  name: string,
  tails: string[] | undefined,
): void {
  // Пустой набор -- это `none` на каждой фазе, а не отсутствие ключа (см.
  // `isOff` в форме): путь снимает архив или превью, разрешённые выше, и модуль
  // должен это прочитать -- иначе он дольёт родительские объекты при слиянии.
  if (tails !== undefined && tails.length === 0) {
    for (const phase of TAIL_PHASES) {
      lines.push(`${p}${name} ${phase} none;`);
    }
    return;
  }
  for (const tail of tails ?? []) {
    if (!tail.trim()) continue;
    const { phase, rest } = splitPhase(tail, name);
    lines.push(`${p}${name} ${phase} ${rest};`);
  }
}

/*
 * `waf_send`: откуда отдать объект получателю. Печатается как хвосты снимка,
 * с фазой первым словом. Пустой набор ничего не печатает: `none` у этой оси
 * нет, снятая строка просто возвращает умолчание модуля.
 */
function emitSend(lines: string[], p: string, tails: string[] | undefined): void {
  for (const tail of tails ?? []) {
    if (!tail.trim()) continue;
    const { phase, rest } = splitPhase(tail, "waf_send");
    lines.push(`${p}waf_send ${phase} ${rest};`);
  }
}

export function optNum(
  lines: string[],
  name: string,
  value: number | undefined | null,
  suffix = "",
): void {
  if (typeof value === "number") ind(lines, `${name} ${value}${suffix};`);
}

export function optFlag(lines: string[], name: string, value: boolean | undefined | null): void {
  if (value === true) ind(lines, `${name} on;`);
  else if (value === false) ind(lines, `${name} off;`);
}

export function indentBlock(text: string, level: number): string {
  const p = "    ".repeat(level);
  return text
    .split("\n")
    .map(line => (line.trim() === "" ? "" : p + line))
    .join("\n");
}

const STORE_RE = /store:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

export function extractStoreRefs(text: string, refs: string[]): void {
  for (const m of text.matchAll(STORE_RE)) {
    const uuid = m[1].toLowerCase();
    if (!refs.includes(uuid)) {
      refs.push(uuid);
    }
  }
}

function emitScoreDeny(
  lines: string[],
  phase: InspectorPhase | "frame:c2s",
  score: ScoreDeny | undefined,
  p: string,
): void {
  if (!score || typeof score.threshold !== "number") return;
  const resp = score.response ? ` response=${score.response}` : "";
  lines.push(`${p}waf_score_deny ${phase} ${score.threshold}${resp};`);
}

function emitCookieDefaults(lines: string[], cookie: CookieDefaults | undefined, p: string): void {
  if (!cookie) return;
  const opts: string[] = [];
  if (cookie.secure === true) opts.push("secure=on");
  else if (cookie.secure === false) opts.push("secure=off");
  if (cookie.httpOnly === true) opts.push("http_only=on");
  else if (cookie.httpOnly === false) opts.push("http_only=off");
  if (cookie.sameSite) opts.push(`same_site=${cookie.sameSite}`);
  if (opts.length > 0) {
    lines.push(`${p}waf_cookie_defaults ${opts.join(" ")};`);
  }
}

type PhaseList = InspectorRef[] | "none" | "all" | undefined;

function expandInspects(
  list: PhaseList,
  phase: InspectorPhase,
  graph: Record<string, InspectorDecl>,
  inspectors: Inspector[],
): InspectorRef[] | "none" | undefined {
  if (list === undefined) {
    return undefined;
  }
  // Пустой набор -- это явное «никого», а не «наследовать». Оператор открыл
  // «задать» и очистил список; наследование выражается отсутствием ключа
  // (undefined). Схлопывать `[]` в undefined значило бы молча вернуть набор
  // родителя вместо пустого, выбранного оператором, -- печатаем waf_inspect
  // <phase> none, как и для строкового "none".
  if (list === "none" || (Array.isArray(list) && list.length === 0)) {
    return "none";
  }
  if (list === "all") {
    /*
     * «Все» на фазе -- это все объявленные, чей процесс её умеет: инспектор
     * запроса в наборе фазы ответа означал бы вызов, на который никто не
     * ответит, и политика дедлайна этой фазы отработала бы на пустом месте.
     * Фазы -- свойство процесса, поэтому имя смотрит в каталог через
     * `process` своего объявления, а не напрямую.
     */
    const byName = new Map(inspectors.map((row) => [row.name, row]));
    return Object.keys(graph)
      .filter((name) => {
        const row = byName.get(graph[name]?.process ?? name);
        return (row?.phases ?? ["request"]).includes(phase);
      })
      .map((name) => ({ name, phase }));
  }
  return list.map((ref) => (ref.phase ? ref : { ...ref, phase }));
}

/**
 * Набор маршрута -- строки waf_inspect. Ключа нет -- наследовать.
 * none / все ignore -- `waf_inspect <фаза> none`. wave из after, если не задан.
 * ignore снят в модуле: такой вызов просто не печатается.
 */
function emitInspects(
  lines: string[],
  waf: WafRouteSettings,
  graph: Record<string, InspectorDecl>,
  inspectors: Inspector[],
  p: string,
): void {
  const req = expandInspects(waf.requestInspectors, "request", graph, inspectors);
  const rsp = expandInspects(waf.responseInspectors, "response", graph, inspectors);
  const frm = expandInspects(waf.frameInspectors, "frame", graph, inspectors);

  if (req === undefined && rsp === undefined && frm === undefined) {
    return;
  }

  const rows: InspectorRef[] = [];
  if (Array.isArray(req)) {
    rows.push(...req);
  }
  if (Array.isArray(rsp)) {
    rows.push(...rsp);
  }
  if (Array.isArray(frm)) {
    rows.push(...frm);
  }

  const afterOf = (name: string) => graph[name]?.after ?? [];
  const wavesOf = (phase: InspectorPhase) =>
    wavesFromAfter(
      rows.filter((r) => (r.phase ?? "request") === phase).map((r) => r.name),
      afterOf,
    );
  const waves = {
    request: wavesOf("request"),
    response: wavesOf("response"),
    frame: wavesOf("frame"),
  };

  for (const ref of rows) {
    const decl = graph[ref.name] ?? {};
    const mode: InspectorMode | undefined =
      ref.mode ??
      waf.inspectorModes?.[ref.name] ??
      (decl.role === "advisory" ? "passive" : undefined);
    if (mode === "ignore") {
      continue;
    }

    const phase = ref.phase ?? "request";
    const wave = ref.wave ?? waves[phase].get(ref.name) ?? 0;
    const timeoutMs = ref.timeoutMs ?? decl.timeoutMs;

    // Кадры печатаются стороной вызова: от клиента (умолчание), от
    // приложения или обеими -- `frame` настраивает у модуля оба слота.
    const parts = [phase === "frame" ? frameWord(ref.stream) : phase, ref.name, `wave=${wave}`];
    if (typeof timeoutMs === "number") {
      parts.push(`timeout=${timeoutMs}ms`);
    }
    if (mode && mode !== "active") {
      parts.push(`mode=${mode}`);
    }
    // `keep=` -- только фаза запроса, `resume=` -- только ответ (кадры
    // транзакцию рукопожатия не продолжают); off и keep=off -- умолчания, их
    // не пишем. Парность двух строк печать не проверяет: это дело
    // validateNginxExport, до рассылки.
    if (ref.keep === true && phase === "request") {
      parts.push("keep=on");
    }
    if (ref.resume && ref.resume !== "off" && phase === "response") {
      parts.push(`resume=${ref.resume}`);
    }
    parts.push(...condTail(ref.conds));
    lines.push(`${p}waf_inspect ${parts.join(" ")};`);
  }

  if (req === "none" || (Array.isArray(req) && activeInspects(rows, "request", waf, graph) === 0)) {
    lines.push(`${p}waf_inspect request none;`);
  }
  if (rsp === "none" || (Array.isArray(rsp) && activeInspects(rows, "response", waf, graph) === 0)) {
    lines.push(`${p}waf_inspect response none;`);
  }
  if (frm === "none" || (Array.isArray(frm) && activeInspects(rows, "frame", waf, graph) === 0)) {
    lines.push(`${p}waf_inspect frame none;`);
  }
}

/** Первое слово вызова кадров по стороне: без ключа -- от клиента. */
function frameWord(stream: InspectorRef["stream"]): string {
  switch (stream) {
    case "s2c":
      return "frame:s2c";
    case "both":
      return "frame";
    default:
      return "frame:c2s";
  }
}

function activeInspects(
  rows: InspectorRef[],
  phase: InspectorPhase,
  waf: WafRouteSettings,
  graph: Record<string, InspectorDecl>,
): number {
  let n = 0;
  for (const ref of rows) {
    if ((ref.phase ?? "request") !== phase) continue;
    const decl = graph[ref.name] ?? {};
    const mode: InspectorMode | undefined =
      ref.mode ??
      waf.inspectorModes?.[ref.name] ??
      (decl.role === "advisory" ? "passive" : undefined);
    if (mode !== "ignore") n += 1;
  }
  return n;
}

/**
 * Хвост условий строки: `if <значение> in|not in <набор>`.
 *
 * Условия печатаются последними: опции директивы разбираются по имени, а
 * условие -- три слова подряд, и строка читается «правило, а при каком условии
 * -- в конце».
 */
function condTail(conds: Cond[] | undefined): string[] {
  const parts: string[] = [];
  for (const cond of conds ?? []) {
    parts.push("if", cond.value, cond.negate === true ? "not in" : "in", cond.dataset);
  }
  return parts;
}

/**
 * Пустой список -- `none`: снять родительские проверки. Наследование в модуле
 * замена, поэтому отсутствие строк означает не «проверок нет», а «проверки
 * сверху», и разница выражается только этим словом.
 */
function emitLocalChecks(lines: string[], checks: LocalCheck[] | undefined, p: string): void {
  if (!checks) return;
  if (checks.length === 0) {
    lines.push(`${p}waf_local_check none;`);
    return;
  }
  for (const c of checks) {
    if (c.response && c.action !== "block") {
      throw new WafCompileError(
        "response_only_with_block",
        `waf_local_check ${c.dataset}: response= is only valid with action=block`,
      );
    }
    const parts = [c.dataset, c.variable, `action=${c.action}`];
    if (c.response) parts.push(`response=${c.response}`);
    parts.push(...condTail(c.conds));
    lines.push(`${p}waf_local_check ${parts.join(" ")};`);
  }
}

function emitLocalRates(lines: string[], rates: LocalRate[] | undefined, p: string): void {
  if (!rates) return;
  if (rates.length === 0) {
    lines.push(`${p}waf_local_rate none;`);
    return;
  }
  for (const r of rates) {
    const parts = [r.key, `rate=${r.rate}`, `burst=${r.burst}`];
    if (r.count) parts.push(`count=${r.count}`);
    if (r.action) parts.push(`action=${r.action}`);
    if (r.response) parts.push(`response=${r.response}`);
    if (r.hash) parts.push("hash=md5");
    if (r.list) parts.push(`list=${r.list}`);
    if (r.ttl) parts.push(`ttl=${r.ttl}`);
    parts.push(...condTail(r.conds));
    lines.push(`${p}waf_local_rate ${parts.join(" ")};`);
  }
}
