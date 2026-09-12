/**
 * Компилятор блока `http {}`: настройки, каталоги, апстримы и серверы.
 * Серверы печатает compileServer. Общий compileNginx ставит перед этим
 * скелет файла (`load_module`, `events {}`).
 *
 * Реестр директив и откуда берётся каталог инспекторов — waf-directives.md.
 */

import type {
  BodyStore,
  Dataset,
  DenyResponse,
  Inspector,
  LogFormat,
} from "../model/http-space.ts";
import { DENY_PARAMS } from "../catalogs.ts";
import { NGINX_MAX_DATASETS, nginxDatasetType } from "../model/http-space.ts";
import {
  BUILTIN_VARS,
  isBuiltinVar,
  type NginxHttpSettings,
  type WafHttpSettings,
} from "../model/settings.ts";
import { mergeInspectorGraphs } from "../inspector-graph.ts";
import type { InspectorDecl, WafRouteSettings } from "../model/waf-route.ts";
import { alignColumns } from "./nginx-align.ts";
import {
  appendBlock,
  emitLogs,
  emitWafRoute,
  includeStub,
  ind,
  routeKeysAtHttp,
  nestStore,
  optFlag,
  optNum,
  optStr,
  presetProxyHeaders,
  proxyVersionFor,
  WafCompileError,
  type NestedBlocks,
  type NginxCompileResult,
  type StoreRefs,
} from "./nginx-emit.ts";
import { compileServer } from "./nginx-server.ts";
import type { InfraUrls, ServerExport, Upstream } from "./nginx-source.ts";
import { validateWafCompile } from "./waf-validate.ts";

export interface HttpCompileSource {
  nginx?: NginxHttpSettings;
  wafHttp?: WafHttpSettings;
  waf?: WafRouteSettings;
  inspectors?: Inspector[];
  datasets?: Dataset[];
  denyResponses?: DenyResponse[];
  bodyStores?: BodyStore[];
  logFormats?: LogFormat[];
  upstreams?: Upstream[];
  servers?: ServerExport[];
  store?: StoreRefs;
  /** Адреса развёртывания: `url=` обменника панель не задаёт. */
  infra?: InfraUrls;
  /**
   * Апстримы и серверы целиком (файл) или заглушками `include` по uuid
   * (превью http {}). Проверки дерева идут по полному источнику в любом
   * случае: заглушка меняет печать, а не то, что считается ошибкой.
   */
  nested?: NestedBlocks;
}

export class NginxCompileError extends Error {
  readonly code = "unknown_inspector";
  readonly names: string[];

  constructor(names: string[]) {
    super(`inspector not in catalog: ${names.join(", ")}`);
    this.names = names;
  }
}

export { WafCompileError };

export function collectInspectorGraph(source: HttpCompileSource): Record<string, InspectorDecl> {
  return mergeInspectorGraphs(
    source.waf?.inspectors,
    (source.servers ?? []).map((srv) => ({
      server: srv.server.waf.inspectors,
      locations: srv.locations.map((loc) => loc.waf.inspectors),
    })),
  );
}

function setNamesOf(waf?: WafRouteSettings): string[] {
  const names: string[] = [];
  for (const key of ["requestInspectors", "responseInspectors", "frameInspectors"] as const) {
    const refs = waf?.[key];
    if (Array.isArray(refs)) {
      for (const ref of refs) {
        names.push(ref.name);
      }
    }
  }
  return names;
}

export function collectInspectorProfiles(
  source: HttpCompileSource,
  graph: Record<string, InspectorDecl>,
): Map<string, string> {
  const out = new Map<string, string>();
  const add = (name: string, profile?: string) => {
    if (profile && !out.has(name)) {
      out.set(name, profile);
    }
  };
  for (const [name, decl] of Object.entries(graph)) {
    add(name, decl.profile);
  }
  const walk = (waf?: WafRouteSettings) => {
    if (!waf) {
      return;
    }
    for (const [name, profile] of Object.entries(waf.inspectorProfiles ?? {})) {
      add(name, profile);
    }
    for (const key of ["requestInspectors", "responseInspectors", "frameInspectors"] as const) {
      const refs = waf[key];
      if (!Array.isArray(refs)) {
        continue;
      }
      for (const ref of refs) {
        add(ref.name, ref.profile);
      }
    }
  };
  walk(source.waf);
  for (const srv of source.servers ?? []) {
    walk(srv.server.waf);
    for (const loc of srv.locations) {
      walk(loc.waf);
    }
  }
  return out;
}

/**
 * Профиль -- опция реестра, а не вызова: `profile=` печатается один раз на
 * строке `waf_inspector <name>`, и на `waf_inspect` его нет вовсе. Значит на
 * одно имя во всём конфиге приходится ровно один профиль.
 *
 * Маршруты между тем его просят: `requestInspectors: [{name, profile}]`
 * читается как заявка (`InspectorRef.profile` помечен снятым и лежит там
 * только затем, чтобы старый jsonb дочитался). Пока таких заявок одна, всё
 * сходится. Разных -- нет: собрать их в одну строку директивы нельзя, а
 * `collectInspectorProfiles` берёт первую попавшуюся и молчит.
 *
 * Молча -- худший из исходов: половина маршрутов уезжает на чужом наборе
 * правил, конфиг при этом валиден и `nginx -t` его принимает. Поэтому здесь
 * считаем, чего просит каждый вызов: свой `profile`, иначе тот, что стоит на
 * узле реестра, иначе `default`. Разошлись -- имя надо разводить на два, как
 * и задумано: «два имени на один subject -- один процесс, разный profile».
 */
export function inspectorProfileConflicts(
  source: HttpCompileSource,
  graph: Record<string, InspectorDecl>,
): Map<string, string[]> {
  const asked = new Map<string, Set<string>>();

  const want = (name: string, profile?: string) => {
    const value = profile ?? graph[name]?.profile ?? "default";
    const set = asked.get(name) ?? new Set<string>();
    set.add(value);
    asked.set(name, set);
  };

  const walk = (waf?: WafRouteSettings) => {
    if (!waf) {
      return;
    }
    for (const [name, profile] of Object.entries(waf.inspectorProfiles ?? {})) {
      want(name, profile);
    }
    for (const key of ["requestInspectors", "responseInspectors", "frameInspectors"] as const) {
      const refs = waf[key];
      if (!Array.isArray(refs)) {
        continue;
      }
      for (const ref of refs) {
        want(ref.name, ref.profile);
      }
    }
  };

  for (const srv of source.servers ?? []) {
    walk(srv.server.waf);
    for (const loc of srv.locations) {
      walk(loc.waf);
    }
  }

  const out = new Map<string, string[]>();
  for (const [name, set] of asked) {
    if (set.size > 1) {
      out.set(name, [...set].sort());
    }
  }
  return out;
}

export function collectInspectorSetNames(source: HttpCompileSource): string[] {
  const names = new Set<string>(setNamesOf(source.waf));
  for (const srv of source.servers ?? []) {
    for (const name of setNamesOf(srv.server.waf)) {
      names.add(name);
    }
    for (const loc of srv.locations) {
      for (const name of setNamesOf(loc.waf)) {
        names.add(name);
      }
    }
  }
  return [...names];
}

/**
 * Имя объявления слушает процесс: `decl.process`, а без него -- само имя.
 * Тема, фазы и conf берутся со строки каталога этого процесса.
 */
export function processOf(name: string, decl: InspectorDecl | undefined): string {
  return decl?.process ?? name;
}

/**
 * Объявления, за которыми нет процесса: `process` (или само имя) не находит
 * строку каталога. Печатать такой узел нечем -- `subject=` взять неоткуда.
 */
export function unknownInspectors(
  catalog: Inspector[],
  graph: Record<string, InspectorDecl>,
): string[] {
  const known = new Set(catalog.map((row) => row.name));
  return Object.keys(graph)
    .filter((name) => !known.has(processOf(name, graph[name])))
    .sort();
}

/**
 * Вызовы с маршрутов, которых нет среди объявлений. Реестр -- пространство
 * имён набора: раньше такой вызов молча дообъявлял `waf_inspector` из
 * каталога, и объявленное оператором имя (со своим профилем и breaker)
 * оставалось в стороне. Теперь это отказ сборки, а не тихая строка.
 */
export function undeclaredInspectors(
  graph: Record<string, InspectorDecl>,
  setNames: string[],
): string[] {
  return setNames.filter((name) => graph[name] === undefined).sort();
}

export function compileHttp(source: HttpCompileSource): NginxCompileResult {
  // Раньше всех прочих проверок: ключ решения, попавший на пространство, надо
  // назвать тем, чем он является, а не последствием. `waf on` в http иначе
  // отвечает «нет сокета агента», и оператор чинит не то.
  const stray = routeKeysAtHttp(source.waf);
  if (stray.length > 0) {
    throw new WafCompileError(
      "route_at_http",
      `these belong on a server, not in http: ${stray.sort().join(", ")}`,
    );
  }

  const inspectors = source.inspectors ?? [];
  const graph = collectInspectorGraph(source);
  const unknown = unknownInspectors(inspectors, graph);
  if (unknown.length > 0) {
    throw new NginxCompileError(unknown);
  }
  const undeclared = undeclaredInspectors(graph, collectInspectorSetNames(source));
  if (undeclared.length > 0) {
    throw new WafCompileError(
      "undeclared_inspector",
      `routes call inspectors that are not declared in http {}: ${undeclared.join(", ")}`,
    );
  }
  const doubled = singletonServiceDoubles(source, graph, inspectors);
  if (doubled.length > 0) {
    throw new WafCompileError(
      "captcha_duplicate",
      `one captcha per route: a second one issues its own ticket and clearance ` +
        `under the same cookies, and the client loops between the widgets; ` +
        `${doubled.join("; ")}`,
    );
  }
  const clashes = inspectorProfileConflicts(source, graph);
  if (clashes.size > 0) {
    throw new WafCompileError(
      "profile_conflict",
      `one waf_inspector name prints one profile=; split the name: ${[...clashes]
        .map(([name, profiles]) => `${name} (${profiles.join(", ")})`)
        .sort()
        .join("; ")}`,
    );
  }
  if ((source.bodyStores ?? []).length > 1) {
    throw new WafCompileError(
      "multiple_stores",
      "only one waf_store is allowed",
    );
  }
  const printed = Object.keys(graph).filter((name) =>
    inspectors.some((row) => row.name === processOf(name, graph[name])),
  );
  validateWafCompile(source, printed);
  const upstreams = source.upstreams ?? [];
  const storeRefs: string[] = [];
  const store = nestStore(storeRefs, source.store);
  const lines: string[] = ["http {"];

  // `log_format` печатается до всего остального: nginx разбирает файл
  // последовательно и ищет имя формата в момент разбора `access_log`,
  // поэтому объявление ниже по файлу для него не существует.
  emitNginxLogFormats(lines, source.logFormats ?? []);
  emitUpgradeMap(lines, source);
  emitNginxHttp(lines, source.nginx ?? {});
  emitWafHttp(lines, source.wafHttp ?? {}, source.infra ?? {}, printed.length > 0);
  emitInspectors(
    lines,
    inspectors,
    graph,
    collectInspectorProfiles(source, graph),
    knownVarNames(source.wafHttp ?? {}),
  );
  emitDenyResponses(lines, source.denyResponses ?? []);
  emitWafRoute(lines, source.waf ?? {}, inspectors, 1, graph);
  emitDatasets(lines, source.datasets ?? []);
  emitBodyStores(lines, source.bodyStores ?? [], source.infra ?? {});
  emitSetsStore(lines, source.datasets ?? [], source.infra ?? {});

  // Заглушки -- список, а не блоки: пустая строка перед группой, не между.
  const stubs = source.nested === "include";

  if (stubs && upstreams.length > 0) lines.push("");
  for (const up of upstreams) {
    if (stubs) {
      ind(lines, includeStub("upstream", up.id, `upstream ${up.name}`));
      continue;
    }
    lines.push("");
    appendBlock(lines, compileUpstream(up, 1).text);
  }

  if (stubs && (source.servers ?? []).length > 0) lines.push("");
  for (const srv of source.servers ?? []) {
    if (stubs) {
      ind(lines, includeStub("server", srv.server.id, serverTitle(srv.server), srv.server.enabled));
      continue;
    }
    if (!srv.server.enabled) continue;
    const compiled = compileServer({
      server: srv.server,
      listens: srv.listens,
      certificates: srv.certificates,
      locations: srv.locations,
      inspectors,
      upstreams,
      indent: 1,
      store,
      graph,
    });
    lines.push("");
    appendBlock(lines, compiled.text);
  }

  lines.push("}");
  return { text: alignColumns(lines).join("\n") + "\n", storeRefs };
}

/**
 * Директивы модуля уровня `http {}`.
 *
 * Адрес шины сюда приходит из окружения контроллера, а не из документа
 * пространства: NATS у контура один, и его же знают агент (`agent.conf`) и
 * инспекторы. Настройка шины в панели -- имя подключения, таймауты и потолки
 * кадра; реквизиты, как и адрес, приезжают развёртыванием.
 *
 * `waf_bus` печатается, когда адрес есть и шиной кто-то пользуется: пространство
 * с инспекторами (без шины они не публикуют -- `nginx -t`) или уже настроенная
 * шина. На ноде, которой поколение не управляет, директива приезжает своим
 * include'ом (`waf-node.conf`), и второй в шаблоне сделал бы `nginx -t`
 * ошибкой `is duplicate` -- поэтому у управляемой ноды в include остаётся
 * только `waf_node_id`.
 */
function emitWafHttp(
  lines: string[],
  wh: WafHttpSettings,
  infra: InfraUrls,
  hasInspectors: boolean,
): void {
  if (!wh) return;

  if (wh.nodeId) {
    ind(lines, `waf_node_id ${wh.nodeId};`);
  }

  if (wh.shmZone) {
    const z = wh.shmZone;
    if (z.name && z.size) {
      ind(lines, `waf_shm_zone ${z.name} ${z.size};`);
    }
  }

  if (typeof wh.maxInflight === "number") {
    ind(lines, `waf_max_inflight ${wh.maxInflight};`);
  }
  if (wh.agentSocket) {
    ind(lines, `waf_agent_socket ${wh.agentSocket};`);
  }
  optStr(lines, "waf_reply_max", wh.replyMax);
  optStr(lines, "waf_header_value_max", wh.headerValueMax);
  optNum(lines, "waf_body_max_holds", wh.bodyMaxHolds);

  // Адрес из окружения; сохранённый список остаётся запасным ходом для
  // пространств, заведённых до переноса, и для тестов компилятора.
  const busUrls = infra.natsUrl !== undefined && infra.natsUrl !== ""
    ? [infra.natsUrl]
    : (wh.bus?.urls ?? []);

  if (busUrls.length > 0 && (wh.bus !== undefined || hasInspectors)) {
    const opts: string[] = [];
    if (wh.bus?.name) opts.push(`name=${wh.bus.name}`);
    if (infra.natsUser) opts.push(`user=${infra.natsUser}`);
    if (infra.natsPass) opts.push(`pass=${infra.natsPass}`);
    if (infra.natsToken) opts.push(`token=${infra.natsToken}`);
    if (typeof wh.bus?.connectTimeoutMs === "number") opts.push(`connect_timeout=${wh.bus.connectTimeoutMs}ms`);
    if (typeof wh.bus?.reconnectWaitMs === "number") opts.push(`reconnect_wait=${wh.bus.reconnectWaitMs}ms`);
    if (typeof wh.bus?.pingIntervalMs === "number") opts.push(`ping_interval=${wh.bus.pingIntervalMs}ms`);
    if (wh.bus?.pendingMax) opts.push(`pending_max=${wh.bus.pendingMax}`);
    if (wh.bus?.payloadMax) opts.push(`payload_max=${wh.bus.payloadMax}`);
    const tail = opts.length > 0 ? " " + opts.join(" ") : "";
    ind(lines, `waf_bus ${busUrls.join(",")}${tail};`);
  }

  for (const v of wh.vars ?? []) {
    // Стандартное поле едет само; пара под его именем -- из документа, заведённого
    // до набора, и на ноде дала бы `nginx -t`. Разбор новых документов её не пускает.
    if (isBuiltinVar(v.name)) {
      continue;
    }
    ind(lines, `waf_var ${v.name} ${v.value};`);
  }
}

/**
 * Имена, которые вправе стоять в `vars=` объявления: стандартный набор модуля
 * и `waf_var` пространства. Проверяется здесь, а не на ноде: ошибка компиляции
 * называет объявление и поле, `nginx -t` -- то же, но уже после издания.
 */
function knownVarNames(wh: WafHttpSettings): Set<string> {
  return new Set<string>([
    ...BUILTIN_VARS,
    ...(wh.vars ?? []).map((v) => v.name).filter((name) => !isBuiltinVar(name)),
  ]);
}

/*
 * `$connection_upgrade` для пресета websocket: `Connection upgrade` строкой
 * сломал бы keepalive всем остальным запросам того же пути, поэтому значение
 * приходит из map'а -- «просят апгрейд -> upgrade, не просят -> close».
 *
 * Печатается один раз на файл и только когда пресет где-то взят: map с именем,
 * которого никто не читает, -- строка в конфиге и вопрос у того, кто его
 * откроет. Порядок значения не имеет: nginx связывает переменные после
 * разбора файла, а не по ходу.
 */
function emitUpgradeMap(lines: string[], source: HttpCompileSource): void {
  const used =
    source.nginx?.proxyHeaders === "websocket" ||
    (source.servers ?? []).some((srv) =>
      srv.locations.some(
        (loc) => !loc.raw && (loc.protocol === "websocket" || loc.nginx?.proxyHeaders === "websocket"),
      ),
    );
  if (!used) return;
  lines.push("");
  ind(lines, "map $http_upgrade $connection_upgrade {");
  ind(lines, "    default upgrade;", 1);
  ind(lines, '    ""      close;', 1);
  ind(lines, "}");
}

function emitNginxHttp(lines: string[], nginx: NginxHttpSettings): void {
  if (!nginx) return;

  if (nginx.includes) {
    for (const inc of nginx.includes) {
      ind(lines, `include ${inc};`);
    }
  }

  /*
   * Всегда, а не по ключу: контур отдаёт относительные Location (redirect-режим
   * калитки, продление сессии, виджет капчи), а nginx по умолчанию достраивает
   * их до абсолютных портом своего listen. Клиент за балансировщиком или
   * пробросом портов этого порта не видит -- редирект уезжает мимо контура.
   * Случая, где абсолютная форма была бы правильнее, у управляемого края нет.
   */
  ind(lines, "absolute_redirect off;");

  optFlag(lines, "sendfile", nginx.sendfile);
  optFlag(lines, "tcp_nopush", nginx.tcpNopush);
  optFlag(lines, "tcp_nodelay", nginx.tcpNodelay);
  optNum(lines, "keepalive_timeout", nginx.keepaliveTimeoutS, "s");
  optNum(lines, "keepalive_requests", nginx.keepaliveRequests);
  optNum(lines, "keepalive_time", nginx.keepaliveTimeS, "s");
  optStr(lines, "client_max_body_size", nginx.clientMaxBodySize);
  optStr(lines, "client_header_buffer_size", nginx.clientHeaderBufferSize);
  optStr(lines, "client_body_buffer_size", nginx.clientBodyBufferSize);
  optStr(lines, "client_body_temp_path", nginx.clientBodyTempPath);
  if (nginx.largeClientHeaderBuffers) {
    const b = nginx.largeClientHeaderBuffers;
    ind(lines, `large_client_header_buffers ${b.count} ${b.size};`);
  }
  optNum(lines, "client_header_timeout", nginx.clientHeaderTimeoutMs, "ms");
  optNum(lines, "client_body_timeout", nginx.clientBodyTimeoutMs, "ms");
  optNum(lines, "send_timeout", nginx.sendTimeoutMs, "ms");
  optStr(lines, "default_type", nginx.defaultType);
  optFlag(lines, "underscores_in_headers", nginx.underscoresInHeaders);
  optFlag(lines, "ignore_invalid_headers", nginx.ignoreInvalidHeaders);
  optFlag(lines, "merge_slashes", nginx.mergeSlashes);
  optFlag(lines, "server_tokens", nginx.serverTokens);
  optStr(lines, "server_names_hash_bucket_size", nginx.serverNamesHashBucketSize);
  optStr(lines, "server_names_hash_max_size", nginx.serverNamesHashMaxSize);
  optStr(lines, "types_hash_bucket_size", nginx.typesHashBucketSize);
  optStr(lines, "types_hash_max_size", nginx.typesHashMaxSize);

  if (nginx.resolver && nginx.resolver.length > 0) {
    ind(lines, `resolver ${nginx.resolver.join(" ")};`);
  }
  optNum(lines, "resolver_timeout", nginx.resolverTimeoutMs, "ms");

  if (nginx.realIpFrom) {
    for (const net of nginx.realIpFrom) {
      ind(lines, `set_real_ip_from ${net};`);
    }
  }
  optStr(lines, "real_ip_header", nginx.realIpHeader);
  optFlag(lines, "real_ip_recursive", nginx.realIpRecursive);

  optFlag(lines, "reset_timedout_connection", nginx.resetTimedoutConnection);
  optStr(lines, "lingering_close", nginx.lingeringClose);
  optNum(lines, "lingering_time", nginx.lingeringTimeMs, "ms");
  optNum(lines, "lingering_timeout", nginx.lingeringTimeoutMs, "ms");

  optFlag(lines, "gzip", nginx.gzip);
  optNum(lines, "gzip_comp_level", nginx.gzipCompLevel);
  optNum(lines, "gzip_min_length", nginx.gzipMinLength);
  optFlag(lines, "gzip_vary", nginx.gzipVary);
  if (nginx.gzipTypes && nginx.gzipTypes.length > 0) {
    ind(lines, `gzip_types ${nginx.gzipTypes.join(" ")};`);
  }

  if (nginx.sslProtocols && nginx.sslProtocols.length > 0) {
    ind(lines, `ssl_protocols ${nginx.sslProtocols.join(" ")};`);
  }
  optStr(lines, "ssl_ciphers", nginx.sslCiphers);
  optFlag(lines, "ssl_prefer_server_ciphers", nginx.sslPreferServerCiphers);
  optStr(lines, "ssl_session_cache", nginx.sslSessionCache);
  optStr(lines, "ssl_session_timeout", nginx.sslSessionTimeout);
  optStr(
    lines,
    "proxy_http_version",
    proxyVersionFor(nginx.proxyHttpVersion, nginx.proxyHeaders),
  );
  for (const h of presetProxyHeaders(nginx.proxyHeaders)) {
    ind(lines, `proxy_set_header ${h.name} ${h.value};`);
  }
  emitLogs(lines, nginx, "    ");

  if (nginx.addHeaders) {
    for (const h of nginx.addHeaders) {
      const always = h.always ? " always" : "";
      ind(lines, `add_header ${h.name} ${h.value}${always};`);
    }
  }
}

function emitInspectors(
  lines: string[],
  catalog: Inspector[],
  graph: Record<string, InspectorDecl>,
  profiles: Map<string, string>,
  knownVars: Set<string>,
): void {
  const byName = new Map(catalog.map((row) => [row.name, row]));

  // Печатаются ровно объявления: имя -- ключ графа, subject -- со строки
  // каталога его процесса. Вызов с маршрута реестр не пополняет.
  for (const name of Object.keys(graph)) {
    const decl = graph[name] ?? {};
    const row = byName.get(processOf(name, decl));
    if (row === undefined) {
      continue;
    }
    const parts = [`subject=${row.subject}`];
    const profile = decl.profile ?? profiles.get(name);
    if (profile && profile !== "default") {
      parts.push(`profile=${profile}`);
    }
    if (decl.audit) {
      parts.push(`audit=${decl.audit}`);
    }

    // `vars=` -- поля секции vars этого имени. `all` -- набор целиком; остальное
    // обязано существовать: стандартное поле либо `waf_var` пространства.
    const vars = decl.vars ?? [];
    if (vars.length > 0) {
      const unknown = vars.filter((v) => v !== "all" && !knownVars.has(v));
      if (unknown.length > 0) {
        throw new WafCompileError(
          "unknown_var",
          `inspector ${name} asks for fields that are neither built-in nor ` +
            `declared with waf_var: ${unknown.join(", ")}`,
        );
      }
      parts.push(`vars=${vars.join(",")}`);
    }

    const breaker = decl.breaker ?? {};
    if (breaker.enabled !== undefined) {
      parts.push(`breaker=${breaker.enabled ? "on" : "off"}`);
    }
    if (typeof breaker.threshold === "number") {
      parts.push(`breaker_threshold=${breaker.threshold}`);
    }
    if (typeof breaker.windowMs === "number") {
      parts.push(`breaker_window=${breaker.windowMs}ms`);
    }
    if (typeof breaker.probeMs === "number") {
      parts.push(`breaker_probe=${breaker.probeMs}ms`);
    }

    ind(lines, `waf_inspector ${name} ${parts.join(" ")};`);
  }
}

/*
 * Права на подмену в реестре больше нет: `mutate=on` снят у директивы, и
 * секцию rewrite модуль принимает от любой декларации -- версию объекта
 * называет тот, кто опубликовал новую ссылку. Печатать здесь нечего.
 */

/*
 * Сервисы, которых на одном маршруте бывает не больше одного. Капча: у каждой
 * декларации свой профиль, а куки билета и клиренса у профилей одноимённые
 * (waf_cap, waf_clr) -- второй виджет затирает первый, и клиент ходит по
 * кругу между ними. Калитка сюда не входит намеренно: две калитки на маршруте
 * -- это стыковка факторов (пароль, затем код), у каждого источника своя кука.
 */
const SINGLETON_SERVICES = new Set(["captcha"]);

/**
 * Маршруты, где сервис из SINGLETON_SERVICES вызван дважды на одной фазе.
 * Набор листа считается как у эмиттера: свой, а пустой -- родительский.
 * Возвращает строки «где: имена», по одной на маршрут.
 */
export function singletonServiceDoubles(
  source: HttpCompileSource,
  graph: Record<string, InspectorDecl>,
  catalog: Inspector[],
): string[] {
  const serviceOfName = (name: string): string => {
    const process = processOf(name, graph[name]);
    const row = catalog.find((item) => item.name === process);
    return row === undefined ? process : serviceOfSubject(row.subject);
  };

  const doubles = (list: unknown): string[] => {
    if (!Array.isArray(list)) {
      return [];
    }
    const byService = new Map<string, string[]>();
    for (const ref of list as { name: string; mode?: string }[]) {
      if (ref.mode === "ignore") continue;
      const service = serviceOfName(ref.name);
      if (!SINGLETON_SERVICES.has(service)) continue;
      byService.set(service, [...(byService.get(service) ?? []), ref.name]);
    }
    return [...byService.values()].filter((names) => names.length > 1).map((names) => names.join(", "));
  };

  const effective = (own: unknown, parent: unknown): unknown =>
    own === undefined || (Array.isArray(own) && own.length === 0) ? parent : own;

  const out: string[] = [];

  for (const srv of source.servers ?? []) {
    if (!srv.server.enabled || srv.server.raw) continue;
    const leaves = srv.locations.filter((loc) => loc.enabled && !loc.raw);
    if (leaves.length === 0) {
      for (const names of doubles(srv.server.waf.requestInspectors)) {
        out.push(`server "${srv.server.name}": ${names}`);
      }
      continue;
    }
    for (const loc of leaves) {
      const list = effective(loc.waf.requestInspectors, srv.server.waf.requestInspectors);
      for (const names of doubles(list)) {
        out.push(`location "${loc.path}" of server "${srv.server.name}": ${names}`);
      }
    }
  }

  return out;
}

/** Сервис процесса: последнее звено темы, `waf.req.rewrite` -- `rewrite`. */
function serviceOfSubject(subject: string): string {
  const at = subject.lastIndexOf(".");
  return at < 0 ? subject : subject.slice(at + 1);
}

function emitDatasets(lines: string[], datasets: Dataset[]): void {
  const declared = datasets.filter((ds) => ds.kind === "list" && ds.inNginx !== false);

  // Потолок модуля -- на число объявлений. Сверх него `nginx -t` падает на
  // каждом краю, и поколение, которое нигде не встанет, уезжать не должно.
  if (declared.length > NGINX_MAX_DATASETS) {
    throw new WafCompileError(
      "datasets_too_many",
      `${declared.length} datasets are declared in nginx, the module accepts at most ` +
        `${NGINX_MAX_DATASETS}; take some off nginx (in_nginx=false) or delete them`,
      { count: declared.length, limit: NGINX_MAX_DATASETS },
    );
  }

  for (const ds of declared) {
    const parts = [`type=${nginxDatasetType(ds.type)}`, `limit=${ds.maxEntries}`];

    // Хешируются только строки: адресу md5 ничего не даёт, а префикс после
    // него перестаёт быть префиксом. API такой набор не заведёт; здесь --
    // чтобы строка из базы, обошедшей API, не уронила -t на узле.
    if (ds.hash) {
      if (nginxDatasetType(ds.type) !== "string") {
        throw new WafCompileError(
          "dataset_hash_type",
          `hash=md5 on dataset "${ds.name}" requires type=string`,
        );
      }
      parts.push("hash=md5");
    }

    if (ds.active) {
      if (ds.ttl) {
        parts.push(`ttl=${ds.ttl}`);
      }
      parts.push("active");
      ind(lines, `waf_local_dataset ${ds.name} ${parts.join(" ")};`);
      continue;
    }

    if (ds.ttl) {
      throw new WafCompileError(
        "dataset_ttl_internal",
        `ttl= is not allowed on internal dataset "${ds.name}"`,
      );
    }

    parts.push("internal");
    ind(lines, `waf_local_dataset ${ds.name} ${parts.join(" ")};`);

    const entries = ds.entries ?? [];
    if (entries.length > ds.maxEntries) {
      throw new WafCompileError(
        "dataset_overflow",
        `dataset "${ds.name}" has more than limit=${ds.maxEntries} entries`,
      );
    }
    if (entries.length > 0) {
      ind(lines, `waf_local_dataset ${ds.name} ${entries.join(" ")};`);
    }
  }
}

/*
 * Пара `ключ=значение` в аргументе директивы. nginx режет строку по пробелам
 * раньше, чем её увидит модуль, поэтому пара с пробелом внутри обязана уехать
 * в кавычках целиком -- `"message=Доступ закрыт"`, а не `message="..."`:
 * разбор ищет `=` в аргументе, а не в паре аргументов.
 *
 * Актуально для `message=` у type=grpc / websocket: фразу для клиента пишет
 * человек, и она с пробелами по определению.
 */
function denyOption(name: string, value: string): string {
  const pair = `${name}=${value}`;

  if (!/[\s"'\\;{}]/.test(value)) {
    return pair;
  }

  return `"${pair.replace(/(["\\])/g, "\\$1")}"`;
}

function emitDenyResponses(lines: string[], responses: DenyResponse[]): void {
  if (responses.length === 0) {
    return;
  }

  /*
   * Представление страницы отказа по Accept -- свойство контура, а не
   * отдельного маршрута. Калитка и капча обязаны отвечать одинаково: браузеру
   * страницу, а fetch -- машиночитаемый отказ, из которого фронтенд узнаёт,
   * куда идти дальше. Пока переменную заводили маршруты поодиночке, капча
   * умела оба представления, а калитка отдавала API-клиенту вёрстку -- и
   * увидеть эту разницу можно было только на живом трафике.
   *
   * Печатается рядом с каталогом и по его наличию: без записей отказа
   * страниц не бывает вовсе, и переменной нечего выбирать. Маршрут, которому
   * переговоры не нужны, по-прежнему пишет ".html" вместо неё.
   */
  ind(lines, "map $http_accept $waf_deny_ext {");
  ind(lines, 'default              ".html";', 2);
  ind(lines, '"~*application/json" ".json";', 2);
  ind(lines, "}");

  for (const dr of responses) {
    const parts: string[] = [];
    if (dr.type !== "http") parts.push(`type=${dr.type}`);
    if (dr.spec.status !== undefined) parts.push(`status=${dr.spec.status}`);
    if (dr.spec.page) parts.push(denyOption("page", dr.spec.page));
    /*
     * `message=` -- только grpc и websocket: у http текст отказа пишет сама
     * страница (встроенные страницы $waf_deny_message больше не печатают).
     * Давнее значение, оставшееся в spec http-записи, не печатается: строка
     * конфига обязана говорить то же, что показывает панель, а поля там
     * больше нет.
     */
    if (dr.type !== "http" && dr.spec.message) {
      parts.push(denyOption("message", dr.spec.message));
    }
    if (dr.spec.code !== undefined) parts.push(`code=${dr.spec.code}`);
    if (dr.spec.reason) parts.push(denyOption("reason", dr.spec.reason));
    if (dr.spec.params !== undefined && dr.spec.params.length > 0) {
      // Словарь проверен на входе (parseDeny); здесь -- страховка от строки,
      // приехавшей в базу мимо ручки: слово мимо словаря уронило бы nginx -t
      // на каждой ноде разом.
      for (const word of dr.spec.params) {
        if (!(DENY_PARAMS as readonly string[]).includes(word)) {
          throw new WafCompileError(
            "deny_params_unknown",
            `deny response "${dr.name}" has unknown params= word "${word}"`,
          );
        }
      }
      parts.push(`params=${dr.spec.params.join(",")}`);
    }
    const body = parts.length > 0 ? " " + parts.join(" ") : "";
    ind(lines, `waf_deny_response ${dr.name}${body};`);
  }
}

/**
 * `waf_store`: драйвер и адрес печатаются не из каталога.
 *
 * Тот же redis знают агент (`agent.conf`) и инспекторы (`REDIS_URL`): адрес
 * тут -- одно из трёх объявлений одного узла, и правка только этого поля
 * развела бы их. Поэтому `url=` приезжает окружением контроллера
 * (`CONTROLLER_REDIS_URL`), а драйвер всегда `redis`: `none` и `inline` на
 * горячем пути не участвуют вовсе (nginx/docs/module/known-issues.md), и
 * маршрут со снимком при них не проходит `nginx -t`. Из каталога едут только
 * сроки и пределы.
 */
function emitBodyStores(lines: string[], stores: BodyStore[], infra: InfraUrls): void {
  for (const bs of stores) {
    // spec.url остаётся у пространств, заведённых до переноса адреса в
    // окружение: пустой CONTROLLER_REDIS_URL не должен печатать `url=`.
    const url = infra.redisUrl !== undefined && infra.redisUrl !== ""
      ? infra.redisUrl
      : String(bs.spec.url ?? "");
    if (url === "") {
      throw new WafCompileError(
        "store_url_unset",
        "waf_store url comes from CONTROLLER_REDIS_URL",
      );
    }
    const parts: string[] = ["driver=redis", `url=${url}`];
    for (const [key, val] of Object.entries(bs.spec)) {
      if (key === "url" || key === "driver") continue;
      parts.push(`${key}=${val}`);
    }
    ind(lines, `waf_store ${parts.join(" ")};`);
  }
}

/**
 * `waf_sets_store`: внутренний Redis контура, откуда край читает пакеты и
 * снапшоты активных наборов keeper. Печатается, когда есть хоть один
 * активный набор в nginx; адрес -- только из окружения, как у `waf_store`.
 * Потолок объекта и таймаут чтения -- под снапшот миллиона записей: ~30 МБ
 * двоичных адресов за одно чтение.
 */
function emitSetsStore(lines: string[], datasets: Dataset[], infra: InfraUrls): void {
  const active = datasets.some((ds) => ds.kind === "list" && ds.inNginx !== false && ds.active);
  if (!active) return;
  const url = infra.redisInternalUrl ?? "";
  if (url === "") {
    throw new WafCompileError(
      "sets_store_url_unset",
      "active datasets need waf_sets_store; its url comes from CONTROLLER_REDIS_INTERNAL_URL",
    );
  }
  ind(lines, `waf_sets_store driver=redis url=${url} pool=2 max=512m get_timeout=30s;`);
}

/**
 * `log_format` самого nginx. Тело в одинарных кавычках: в нём переменные и
 * пробелы, а экранировать одинарную кавычку внутри нечем -- такой формат
 * пропускается, а не печатается сломанным.
 */
function emitNginxLogFormats(lines: string[], formats: LogFormat[]): void {
  for (const lf of formats) {
    if (lf.kind !== "nginx") continue;
    const body = (lf.format ?? "").trim();
    if (body === "" || body.includes("'")) continue;
    ind(lines, `log_format ${lf.name} '${body}';`);
  }
}

/** Подпись заглушки сервера: его имена, а без них -- имя карточки. */
function serverTitle(server: ServerExport["server"]): string {
  const names = server.serverNames.join(" ");
  return `server ${names !== "" ? names : server.name}`;
}

/**
 * Блок `upstream {}`. Отступ уровнями по 4 пробела: 1 -- внутри `http {}`,
 * 0 -- сам блок (превью карточки пула). В `store` пулу класть нечего.
 */
export function compileUpstream(up: Upstream, indent = 0): NginxCompileResult {
  const lines: string[] = [];
  const inner = indent + 1;

  ind(lines, `upstream ${up.name} {`, indent);
  if (up.method === "least_conn") ind(lines, "least_conn;", inner);
  if (up.method === "ip_hash") ind(lines, "ip_hash;", inner);
  if (up.method === "hash" && up.hashKey) ind(lines, `hash ${up.hashKey};`, inner);

  for (const peer of up.peers) {
    const parts = [`${peer.host}:${peer.port}`];
    if (peer.weight !== 1) parts.push(`weight=${peer.weight}`);
    if (peer.maxFails !== undefined) parts.push(`max_fails=${peer.maxFails}`);
    if (peer.failTimeoutMs !== undefined) parts.push(`fail_timeout=${peer.failTimeoutMs}ms`);
    if (peer.backup) parts.push("backup");
    if (peer.down) parts.push("down");
    ind(lines, `server ${parts.join(" ")};`, inner);
  }

  if (typeof up.keepalive === "number") {
    ind(lines, `keepalive ${up.keepalive};`, inner);
    if (typeof up.keepaliveRequests === "number") {
      ind(lines, `keepalive_requests ${up.keepaliveRequests};`, inner);
    }
    if (typeof up.keepaliveTimeoutMs === "number") {
      ind(lines, `keepalive_timeout ${up.keepaliveTimeoutMs}ms;`, inner);
    }
  }

  ind(lines, "}", indent);
  return { text: alignColumns(lines).join("\n") + "\n", storeRefs: [] };
}
