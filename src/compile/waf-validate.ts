/**
 * То, что модуль поймает на nginx -t, компилятор ловит здесь.
 * Вызывать из compileHttp, не из emitWafRoute: сокет и шина живут в http {}.
 */

import type { Dataset } from "../model/http-space.ts";
import type { Cond, LocalRate, ScoreDeny, WafRouteSettings } from "../model/waf-route.ts";
import { parseNginxTimeS } from "../nginx-time.ts";
import { WafCompileError, splitPhase } from "./nginx-emit.ts";
import type { HttpCompileSource } from "./nginx-http.ts";

export function validateWafCompile(source: HttpCompileSource, printed: string[]): void {

  /*
   * Адрес шины -- окружение контроллера (CONTROLLER_NATS_URL); сохранённый
   * список остаётся у пространств, заведённых до переноса. Проверять надо тот,
   * который напечатается, иначе контур с инспекторами перестал бы собираться
   * от одного лишь сохранения документа.
   */
  const busAddress =
    (source.infra?.natsUrl ?? "") !== "" || (source.wafHttp?.bus?.urls?.length ?? 0) > 0;

  if (printed.length > 0 && !busAddress) {
    throw new WafCompileError(
      "inspectors_need_bus",
      "inspectors are declared but waf_bus has no address (CONTROLLER_NATS_URL)",
    );
  }

  const on = routeOn(source);
  if (on && !source.wafHttp?.agentSocket) {
    throw new WafCompileError(
      "agent_socket_required",
      "waf_agent_socket is required when waf is on",
    );
  }

  checkProtocols(source);
  checkFrameExtras(source);

  const pages = new Set((source.denyResponses ?? []).map((row) => row.name));
  for (const waf of allRoutes(source)) {
    checkScorePage(waf.scoreDeny, pages);
    checkScorePage(waf.responseScoreDeny, pages);
    checkScorePage(waf.frameScoreDeny, pages);
    if (waf.requireUpgradeResponse !== undefined && !pages.has(waf.requireUpgradeResponse)) {
      throw new WafCompileError(
        "unknown_deny_response",
        `waf_require_upgrade response "${waf.requireUpgradeResponse}" is not declared`,
      );
    }
    if (waf.denyResponseDefault && !pages.has(waf.denyResponseDefault)) {
      throw new WafCompileError(
        "unknown_deny_response",
        `waf_deny_response "${waf.denyResponseDefault}" is not declared`,
      );
    }
    checkRouteSizes(waf);
    checkSend(waf);
    checkException(waf, pages);
  }

  if (on && hasArchive(source) && (source.bodyStores ?? []).length === 0) {
    throw new WafCompileError(
      "archive_needs_store",
      "waf_archive requires waf_store with an external driver",
    );
  }

  /*
   * Инспекторы архиву не нужны (archive.md, «без инспекторов»): фаза без волн
   * пишет журнал -- запрос и ответ кладут объекты после прохода, кадр -- по
   * своей записи (waf_audit_frames). Нужны обменник и сокет агента.
   */

  for (const ds of source.datasets ?? []) {
    if (ds.active && (ds.entries?.length ?? 0) > 0) {
      throw new WafCompileError(
        "dataset_entries_active",
        `dataset "${ds.name}": entries are not allowed on active`,
      );
    }
  }

  validateLocal(source, pages);
}

function allRoutes(source: HttpCompileSource): WafRouteSettings[] {
  const rows: WafRouteSettings[] = [];
  if (source.waf) rows.push(source.waf);
  for (const srv of source.servers ?? []) {
    rows.push(srv.server.waf);
    for (const loc of srv.locations) {
      rows.push(loc.waf);
    }
  }
  return rows;
}

function routeOn(source: HttpCompileSource): boolean {
  return allRoutes(source).some((waf) => waf.enabled === true);
}

type Phase = "request" | "response" | "frame";

function archiveOpen(waf: WafRouteSettings | undefined, phase?: Phase): boolean {
  return (waf?.archive ?? []).some((tail) => {
    if (tail.trim() === "") return false;
    const row = splitPhase(tail, "waf_archive");
    // Кадры -- одна фаза с двумя сторонами: `frame`, `frame:c2s`, `frame:s2c`.
    if (phase !== undefined && (phase === "frame" ? !row.phase.startsWith("frame") : row.phase !== phase)) {
      return false;
    }
    return row.rest !== "" && !/(^|\s)none$/.test(row.rest);
  });
}

function hasArchive(source: HttpCompileSource, phase?: Phase): boolean {
  return allRoutes(source).some((waf) => archiveOpen(waf, phase));
}

/* Словарь объектов фазы у `waf_send` -- тот же, что у снимка (capture.md). */
const SEND_OBJECTS: Record<string, readonly string[]> = {
  request: ["headers", "args", "body"],
  response: ["headers", "body"],
  frame: ["body"],
  "frame:c2s": ["body"],
  "frame:s2c": ["body"],
};

/*
 * `waf_send`: грамматика строки до `nginx -t`. Значение объекта только
 * `original`/`store`, объект -- из словаря своей фазы. Наличие снимка у
 * `store` проверяет модуль: набор снимка складывается по уровням, и здесь
 * его целиком не видно. Своего распоряжения на случай сбоя у директивы нет:
 * несостоявшаяся подмена -- ошибка обработки, и решает её
 * `waf_exception <фаза> body`.
 */
/* Классы события у `waf_exception`; строка без класса задаёт все шесть. */
const EXCEPTION_CLASSES = ["timeout", "absent", "bus", "body", "inspector", "overload"] as const;

/*
 * `waf_exception`: грамматика строки до `nginx -t`. Фаза первым словом, класс
 * необязателен вторым, исход -- `pass` либо `deny`, страница -- из каталога.
 * Класс, названный на уровне дважды (в том числе один раз строкой без
 * класса), -- ошибка: порядок строк в nginx.conf ничего не решает.
 */
function checkException(waf: WafRouteSettings, pages: Set<string>): void {
  const seen = new Set<string>();

  for (const line of waf.exception ?? []) {
    if (!line.trim()) continue;
    const { phase, rest } = splitPhase(line, "waf_exception");
    const words = rest.split(/\s+/).filter((w) => w !== "");

    let cls: string | undefined;
    if (words.length > 0 && (EXCEPTION_CLASSES as readonly string[]).includes(words[0]!)) {
      cls = words.shift();
    }

    const policy = words.shift();
    if (policy !== "pass" && policy !== "deny") {
      throw new WafCompileError(
        "exception_policy",
        `waf_exception ${phase}: write pass or deny${cls ? ` after ${cls}` : ""}`,
      );
    }

    for (const word of words) {
      const eq = word.indexOf("=");
      if (eq < 0 || word.slice(0, eq) !== "response") {
        throw new WafCompileError(
          "exception_syntax",
          `waf_exception ${phase} ${word}: write response=<name>`,
        );
      }
      const value = word.slice(eq + 1);
      if (policy === "pass") {
        throw new WafCompileError(
          "exception_pass_response",
          `waf_exception ${phase} pass: response= has no meaning, the request goes through`,
        );
      }
      if (!pages.has(value)) {
        throw new WafCompileError(
          "unknown_deny_response",
          `waf_exception ${phase} response "${value}" is not declared`,
        );
      }
    }

    for (const one of cls === undefined ? EXCEPTION_CLASSES : [cls]) {
      const key = `${phase}:${one}`;
      if (seen.has(key)) {
        throw new WafCompileError(
          "exception_duplicate",
          `waf_exception ${phase} ${one}: the class is already set on this level`,
        );
      }
      seen.add(key);
    }
  }
}


function checkSend(waf: WafRouteSettings): void {
  for (const line of waf.send ?? []) {
    if (!line.trim()) continue;
    const { phase, rest } = splitPhase(line, "waf_send");
    for (const word of rest.split(/\s+/).filter((w) => w !== "")) {
      const eq = word.indexOf("=");
      if (eq < 0) {
        throw new WafCompileError(
          "send_syntax",
          `waf_send ${phase} ${word}: write <object>=original|store`,
        );
      }
      const key = word.slice(0, eq);
      const value = word.slice(eq + 1);
      if (!(SEND_OBJECTS[phase] ?? []).includes(key)) {
        throw new WafCompileError(
          "send_object",
          `waf_send ${phase} ${key}: the ${phase} phase has no such object`,
        );
      }
      if (value !== "original" && value !== "store") {
        throw new WafCompileError(
          "send_value",
          `waf_send ${phase} ${key}=${value}: write original or store`,
        );
      }
    }
  }
}

function checkScorePage(score: ScoreDeny | undefined, pages: Set<string>): void {
  if (score?.response && !pages.has(score.response)) {
    throw new WafCompileError(
      "unknown_deny_response",
      `waf_deny_response "${score.response}" is not declared`,
    );
  }
}

function parseNginxSize(spec: string | undefined): number | undefined {
  if (!spec) return undefined;
  const m = /^(\d+)(k|m|g)?$/i.exec(spec.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "k") return n * 1024;
  if (unit === "m") return n * 1024 * 1024;
  if (unit === "g") return n * 1024 * 1024 * 1024;
  return n;
}

function sizesInTail(tail: string): number[] {
  const out: number[] = [];
  for (const part of tail.split(/\s+/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    if (!/^(headers|args|body)$/.test(key)) continue;
    const raw = part.slice(eq + 1).split("/")[0] ?? "";
    if (raw === "none" || raw === "capture") continue;
    const n = parseNginxSize(raw);
    if (n !== undefined) out.push(n);
  }
  return out;
}

/*
 * Предел и размеры сравниваются в пределах ОДНОЙ фазы: у запроса и ответа они
 * свои, и `body_limit response 4m` ничего не говорит о том, сколько снимают с
 * запроса. Фаза у предела и у хвостов -- первое слово, умолчание request.
 */
function checkRouteSizes(waf: WafRouteSettings): void {
  if (waf.bodyLimit === undefined || waf.bodyLimit === "") {
    return;
  }

  const { phase, rest } = splitPhase(waf.bodyLimit, "waf_body_limit");
  const limit = parseNginxSize(rest);

  if (limit === undefined) {
    return;
  }

  const tails = [...(waf.capture ?? []), ...(waf.archive ?? []), ...(waf.preview ?? [])];

  for (const tail of tails) {
    if (splitPhase(tail, "waf_capture").phase !== phase) {
      continue;
    }

    for (const n of sizesInTail(tail)) {
      if (n > limit) {
        throw new WafCompileError(
          "size_over_limit",
          `capture/archive/preview size exceeds body_limit ${waf.bodyLimit}`,
        );
      }
    }
  }
}


/* --- локальный слой -------------------------------------------------------
 *
 * Всё, что модуль проверяет при `nginx -t`, но что до сих пор выяснялось только
 * на ноде: набор объявлен слотом, страница отказа заведена, автобан пишет в
 * active-набор со сроком, зона существует. Ошибка здесь -- строка в превью;
 * ошибка там -- нода, которая не приняла поколение.
 */

/** Маршрут вместе с тем, как его назвать в сообщении, и его родителем. */
interface RoutePlace {
  waf: WafRouteSettings;
  label: string;
  /** Документ уровнем выше: у пути -- сервер. У сервера родителя нет: решений в http {} не бывает. */
  parent?: WafRouteSettings;
}

function routePlaces(source: HttpCompileSource): RoutePlace[] {
  const rows: RoutePlace[] = [];
  for (const srv of source.servers ?? []) {
    const name = srv.server.serverNames[0] ?? srv.server.name;
    rows.push({ waf: srv.server.waf, label: `server "${name}"` });
    for (const loc of srv.locations) {
      rows.push({
        waf: loc.waf,
        label: `location "${loc.path}" of server "${name}"`,
        parent: srv.server.waf,
      });
    }
  }
  return rows;
}

function hasLocal(waf: WafRouteSettings): boolean {
  return (waf.localChecks ?? []).length > 0 || (waf.localRates ?? []).length > 0;
}

function validateLocal(source: HttpCompileSource, pages: Set<string>): void {
  /*
   * Слот -- только набор-список, объявленный в шаблоне. Наборы ip-компилятора
   * (`in_nginx=false`) и содержимое (`kind=content`) слотом не печатаются, и
   * ссылка на них -- проверка, которой на ноде не будет.
   */
  const slots = new Map<string, Dataset>();
  for (const ds of source.datasets ?? []) {
    if (ds.kind === "list" && ds.inNginx !== false) {
      slots.set(ds.name, ds);
    }
  }

  const places = routePlaces(source);

  /*
   * Зона -- условие существования локального слоя: без неё модуль отвергает и
   * слот набора, и правило маршрута. `none` в это число не входит: правил нет,
   * в разделяемую память никто не ходит.
   */
  if ((slots.size > 0 || places.some((place) => hasLocal(place.waf))) && !source.wafHttp?.shmZone) {
    throw new WafCompileError(
      "shm_zone_required",
      "waf_local_dataset / waf_local_check / waf_local_rate need waf_shm_zone in http",
    );
  }

  for (const place of places) {
    for (const list of [place.waf.requestInspectors, place.waf.responseInspectors]) {
      if (!Array.isArray(list)) {
        continue;
      }
      for (const ref of list) {
        checkConds(ref.conds, `waf_inspect ${ref.name}`, place.label, slots);
      }
    }

    for (const c of place.waf.localChecks ?? []) {
      checkConds(c.conds, `waf_local_check ${c.dataset}`, place.label, slots);
      if (!slots.has(c.dataset)) {
        throw new WafCompileError(
          "local_dataset_not_declared",
          `waf_local_check "${c.dataset}" on ${place.label}: dataset is not declared as waf_local_dataset`,
        );
      }
      if (c.response && !pages.has(c.response)) {
        throw new WafCompileError(
          "unknown_deny_response",
          `waf_deny_response "${c.response}" is not declared`,
        );
      }
    }

    for (const r of place.waf.localRates ?? []) {
      checkConds(r.conds, `waf_local_rate ${r.key}`, place.label, slots);
      checkRate(r, place.label, slots, pages);
    }
  }
}

/**
 * Набор в условии -- тот же слот. Опечатка в имени была бы условием, которое
 * никогда не сходится: строка не работает ни разу, выглядя настроенной.
 */
function checkConds(
  conds: Cond[] | undefined,
  directive: string,
  label: string,
  slots: Map<string, Dataset>,
): void {
  for (const cond of conds ?? []) {
    if (cond.value.trim() === "") {
      throw new WafCompileError(
        "cond_incomplete",
        `${directive} on ${label}: "if" needs a value`,
      );
    }
    if (!slots.has(cond.dataset)) {
      throw new WafCompileError(
        "local_dataset_not_declared",
        `${directive} on ${label}: "if ... ${cond.dataset}" is not declared as waf_local_dataset`,
      );
    }
  }
}

function checkRate(
  rate: LocalRate,
  label: string,
  slots: Map<string, Dataset>,
  pages: Set<string>,
): void {
  /*
   * Ключ -- одно значение. Селектор со звёздочкой даёт их столько, сколько пар
   * в запросе, и один запрос считался бы сразу в несколько счётчиков: `rate=`
   * перестал бы значить написанное. Модуль такую строку отвергает.
   */
  if (/^\$waf_request_(args|cookies|headers)\.\*$/.test(rate.key.trim())) {
    throw new WafCompileError(
      "local_rate_key_set",
      `waf_local_rate on ${label}: key "${rate.key}" is a set; name the pair, e.g. $waf_request_cookies.sid`,
    );
  }

  // Единица обязательна: `rate=100` модуль отвергает, потому что толковать её
  // в пользу секунд значит лимит в шестьдесят раз жёстче задуманного.
  if (!/^\d+r\/[sm]$/.test(rate.rate.trim())) {
    throw new WafCompileError(
      "local_rate_invalid",
      `waf_local_rate on ${label}: rate="${rate.rate}" must be <n>r/s or <n>r/m`,
    );
  }
  if (!Number.isInteger(rate.burst) || rate.burst < 0) {
    throw new WafCompileError(
      "local_rate_invalid",
      `waf_local_rate on ${label}: burst=${String(rate.burst)} must be a non-negative integer`,
    );
  }
  if (rate.response && !pages.has(rate.response)) {
    throw new WafCompileError(
      "unknown_deny_response",
      `waf_deny_response "${rate.response}" is not declared`,
    );
  }

  if (!rate.list) {
    if (rate.ttl) {
      throw new WafCompileError(
        "local_rate_ttl_without_list",
        `waf_local_rate on ${label}: ttl= requires list=`,
      );
    }
    return;
  }

  const ds = slots.get(rate.list);
  if (ds === undefined) {
    throw new WafCompileError(
      "local_dataset_not_declared",
      `waf_local_rate list="${rate.list}" on ${label}: dataset is not declared as waf_local_dataset`,
    );
  }
  // Автобан пишет в overlay и публикует событие: у internal состав в конфиге,
  // писать некуда.
  if (!ds.active) {
    throw new WafCompileError(
      "local_rate_list_internal",
      `waf_local_rate list="${rate.list}" on ${label}: dataset must be active`,
    );
  }
  if (rate.action === "pass") {
    throw new WafCompileError(
      "local_rate_pass_with_list",
      `waf_local_rate list="${rate.list}" on ${label}: list= is meaningless with action=pass`,
    );
  }
  // Срок берётся у правила, иначе у набора. Нет ни там, ни там -- запись в
  // overlay была бы вечной, и модуль такую строку не принимает.
  if (parseNginxTimeS(rate.ttl ?? ds.ttl) === undefined) {
    throw new WafCompileError(
      "local_rate_list_ttl",
      `waf_local_rate list="${rate.list}" on ${label}: ttl= is required on the rule or on the dataset`,
    );
  }
}

/* --- протокол пути и фазы ---------------------------------------------------- */

const FRAME_KEYS = [
  "frameInspectors",
  "frameDeadlineMs",
  "frameScoreDeny",
  "requireUpgrade",
  "requireUpgradeResponse",
  "wsStripExtensions",
  "frameAudit",
  "frameAuditSample",
  "frameReassemble",
  "frameControlRate",
  "frameCacheTtl",
  "frameCacheStream",
] as const;

const RESPONSE_KEYS = [
  "responseHold",
  "responseDeadlineMs",
  "responseScoreDeny",
] as const;

function tailPhaseOf(line: string): string {
  return line.trim().split(/\s+/, 1)[0] ?? "";
}

/** Ключи и строки фазы кадров, названные на этом уровне. */
function frameKeysOf(waf: WafRouteSettings | undefined): string[] {
  if (!waf) return [];
  const out: string[] = FRAME_KEYS.filter((key) => waf[key] !== undefined);
  for (const key of ["capture", "archive", "preview", "send", "exception"] as const) {
    if ((waf[key] ?? []).some((line) => tailPhaseOf(line).startsWith("frame"))) {
      out.push(`${key} frame`);
    }
  }
  if (waf.bodyLimit !== undefined && tailPhaseOf(waf.bodyLimit).startsWith("frame")) {
    out.push("bodyLimit frame");
  }
  return out;
}

/** Ключи и строки фазы ответа; явное `responseInspectors: none` -- не ключ. */
function responseKeysOf(waf: WafRouteSettings | undefined): string[] {
  if (!waf) return [];
  const out: string[] = RESPONSE_KEYS.filter((key) => waf[key] !== undefined);
  if (waf.responseInspectors !== undefined && waf.responseInspectors !== "none") {
    out.push("responseInspectors");
  }
  for (const key of ["capture", "archive", "preview", "send", "exception"] as const) {
    if ((waf[key] ?? []).some((line) => tailPhaseOf(line) === "response")) {
      out.push(`${key} response`);
    }
  }
  if (waf.bodyLimit !== undefined && tailPhaseOf(waf.bodyLimit) === "response") {
    out.push("bodyLimit response");
  }
  return out;
}

/*
 * Фазы пути зависят от его протокола. Кадры бывают только у websocket-пути
 * -- на сервере и пространстве их не бывает: сервер смешивает пути обоих
 * протоколов, и унаследованный набор кадров печатался бы в каждый location.
 * У websocket-пути нет фазы ответа: 101 без тела, и ключи ответа там --
 * ожидание, которое никогда не сбудется.
 */
function checkProtocols(source: HttpCompileSource): void {
  const atHttp = frameKeysOf(source.waf);
  if (atHttp.length > 0) {
    throw new WafCompileError(
      "frame_at_server",
      `frame keys belong on a websocket location, not in http: ${atHttp.join(", ")}`,
    );
  }
  for (const srv of source.servers ?? []) {
    const atServer = frameKeysOf(srv.server.waf);
    if (atServer.length > 0) {
      throw new WafCompileError(
        "frame_at_server",
        `server "${srv.server.name}": frame keys belong on a websocket location, ` +
          `not on the server: ${atServer.join(", ")}`,
      );
    }
    for (const loc of srv.locations) {
      if (loc.raw) continue;
      const where = `location "${loc.path}" of server "${srv.server.name}"`;
      if (loc.protocol === "websocket") {
        if (loc.handler !== "proxy") {
          throw new WafCompileError(
            "websocket_needs_proxy",
            `${where}: a websocket location proxies to a pool; handler is ${loc.handler}`,
          );
        }
        const rsp = responseKeysOf(loc.waf);
        if (rsp.length > 0) {
          throw new WafCompileError(
            "websocket_no_response",
            `${where}: a websocket location has no response phase (101 without a body): ` +
              rsp.join(", "),
          );
        }
        continue;
      }
      const frm = frameKeysOf(loc.waf);
      if (frm.length > 0) {
        throw new WafCompileError(
          "frame_needs_websocket",
          `${where}: frame keys need protocol websocket on the location: ${frm.join(", ")}`,
        );
      }
      /*
       * count=frames считает кадры, а у http-пути их нет: правило бы
       * молчало, выглядя настроенным.
       */
      if ((loc.waf.localRates ?? []).some((r) => r.count === "frames")) {
        throw new WafCompileError(
          "frame_needs_websocket",
          `${where}: waf_local_rate count=frames needs protocol websocket on the location`,
        );
      }
    }
  }
}

/* --- кадры: сборка, контрольные кадры, кеш --------------------------------- */

/**
 * Значения печатаются в директивы как есть, поэтому форма проверяется здесь:
 * модуль отверг бы их на `nginx -t`, но ошибка компиляции дешевле ноды, не
 * принявшей поколение.
 */
function checkFrameExtras(source: HttpCompileSource): void {
  for (const place of routePlaces(source)) {
    const waf = place.waf;
    if (waf.frameControlRate !== undefined && waf.frameControlRate !== "") {
      const v = waf.frameControlRate.trim();
      if (v !== "off" && !/^[1-9]\d*r\/[sm]$/.test(v)) {
        throw new WafCompileError(
          "frame_control_rate_invalid",
          `waf_frame_control_rate on ${place.label}: "${waf.frameControlRate}" must be <n>r/s, <n>r/m or off`,
        );
      }
    }
    if (waf.frameCacheTtl !== undefined && waf.frameCacheTtl !== "") {
      const seconds = parseNginxTimeS(waf.frameCacheTtl);
      if (seconds === undefined || seconds <= 0 || seconds > 3600) {
        throw new WafCompileError(
          "frame_cache_ttl_invalid",
          `waf_frame_cache on ${place.label}: ttl="${waf.frameCacheTtl}" must be a time up to 1h`,
        );
      }
      // Таблица кеша живёт в зоне локального слоя: без неё модуль отвергает строку.
      if (!source.wafHttp?.shmZone) {
        throw new WafCompileError(
          "shm_zone_required",
          `waf_frame_cache on ${place.label} needs waf_shm_zone in http`,
        );
      }
    }
    if (
      waf.frameCacheStream !== undefined &&
      !["both", "c2s", "s2c"].includes(waf.frameCacheStream)
    ) {
      throw new WafCompileError(
        "frame_cache_stream_invalid",
        `waf_frame_cache on ${place.label}: side must be both, c2s or s2c`,
      );
    }
  }
}
