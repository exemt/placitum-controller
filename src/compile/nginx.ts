/**
 * Основной компилятор: скелет файла + `http {}`.
 * Дерево: location -> server -> http -> main + http.
 */

import { createStoreRefs, type NestedBlocks, type NginxCompileResult } from "./nginx-emit.ts";
import {
  collectInspectorGraph,
  collectInspectorProfiles,
  compileHttp,
  NginxCompileError,
  WafCompileError,
  type HttpCompileSource,
} from "./nginx-http.ts";
import { compileMain } from "./nginx-main.ts";
import type { NginxExport } from "./nginx-source.ts";

export type { NginxCompileResult };
export type { NginxExport, ServerExport, Upstream, UpstreamPeer } from "./nginx-source.ts";
export { compileHttp, compileUpstream, NginxCompileError, WafCompileError } from "./nginx-http.ts";
export { compileMain } from "./nginx-main.ts";
export { compileServer } from "./nginx-server.ts";
export { compileLocation } from "./nginx-location.ts";
export { exportNginx } from "./nginx-export.ts";

/**
 * Дерево пространства в форме, которую понимает компилятор `http {}`. Отдельной
 * функцией потому, что по нему ходит не только печать: межканальная проверка
 * читает из него теги `profile=`, и собирать источник во второй раз значило бы
 * завести второй компилятор. Превью одного блока берёт отсюда же реестр
 * инспекторов -- иначе сервер сам по себе печатался бы не так, как в файле.
 */
export function httpSourceOf(
  source: NginxExport,
  store?: HttpCompileSource["store"],
): HttpCompileSource {
  const space = source.space;
  return {
    nginx: space.nginx,
    wafHttp: space.wafHttp,
    waf: space.waf,
    inspectors: source.inspectors,
    datasets: source.datasets,
    denyResponses: source.denyResponses,
    bodyStores: source.bodyStores,
    logFormats: source.logFormats,
    upstreams: source.upstreams,
    servers: source.servers,
    store,
    infra: source.infra,
  };
}

/**
 * Какой профиль какого инспектора называет шаблон. Ключ -- имя инспектора,
 * значение -- имя набора: `waf_inspector modsec profile=e2e`. Пустая карта у
 * `raw`-пространства: там шаблон пишет оператор, и разбирать его текст
 * контроллер не берётся.
 */
export function inspectorProfilesOf(source: NginxExport): Map<string, string> {
  if (source.space.raw) {
    return new Map();
  }

  const http = httpSourceOf(source);
  return collectInspectorProfiles(http, collectInspectorGraph(http));
}

/**
 * Файл целиком. `nested: "include"` -- превью верхнего уровня: апстримы и
 * серверы заглушками по uuid; на `send` опция не передаётся никогда.
 */
export function compileNginx(
  source: NginxExport,
  options: { nested?: NestedBlocks } = {},
): NginxCompileResult {
  const storeRefs: string[] = [];
  const store = createStoreRefs(storeRefs);
  const space = source.space;

  if (space.raw) {
    store.scan(space.rawNginx);
    return { text: space.rawNginx + "\n", storeRefs };
  }

  const main = compileMain(space.nginxMain);
  const http = compileHttp({ ...httpSourceOf(source, store), nested: options.nested });

  return { text: main.text + http.text, storeRefs };
}

export interface ValidationError {
  code: string;
  message: string;
}

/**
 * Парность `keep=` и `resume=` по эффективным маршрутам -- то же, что
 * `nginx -t` делает на ноде (`ngx_http_waf_check_resume_pairs`), но до
 * рассылки: иначе первое известие об ошибке пришло бы из лога агента.
 *
 * Эффективный набор -- как в модуле: строка своей фазы на location заменяет
 * серверный набор целиком, нет строки -- берётся серверный. Проверяются
 * листья: location сервера и сам сервер, если у него location нет. Сервер с
 * `keep=on` на запросе и `resume=` в каждом location согласован, хотя сам по
 * себе пары не составляет.
 *
 * `keep=on` без потребителя держит память на каждый запрос впустую; `resume=`
 * без `keep=on` у того же имени на запросе не продолжит никогда. Обе --
 * ошибки, не предупреждения.
 */
function resumePairErrors(source: NginxExport): ValidationError[] {
  const errors: ValidationError[] = [];

  type Phase = "request" | "response";
  type List = NginxExport["servers"][number]["server"]["waf"]["requestInspectors"];

  const effective = (own: List, parent: List): List =>
    own === undefined || (Array.isArray(own) && own.length === 0) ? parent : own;

  const refs = (list: List) => (Array.isArray(list) ? list : []);

  const checkLeaf = (where: string, request: List, response: List) => {
    for (const ref of refs(request)) {
      if (ref.keep !== true) continue;
      const consumer = refs(response).find(
        (row) => row.name === ref.name && row.resume !== undefined && row.resume !== "off",
      );
      if (consumer === undefined) {
        errors.push({
          code: "keep_without_resume",
          message:
            `inspector "${ref.name}" keeps its state on request (keep=on) ` +
            `but no later phase resumes it in ${where}`,
        });
      }
    }
    for (const ref of refs(response)) {
      if (ref.resume === undefined || ref.resume === "off") continue;
      const producer = refs(request).find((row) => row.name === ref.name);
      if (producer === undefined || producer.keep !== true) {
        errors.push({
          code: "resume_without_keep",
          message:
            `inspector "${ref.name}" resumes on response but its request ` +
            `line does not keep the state (keep=on) in ${where}`,
        });
      }
    }
  };

  const pick = (waf: NginxExport["servers"][number]["server"]["waf"], phase: Phase) =>
    phase === "request" ? waf.requestInspectors : waf.responseInspectors;

  for (const srv of source.servers) {
    if (!srv.server.enabled || srv.server.raw) continue;

    const leaves = srv.locations.filter((loc) => loc.enabled && !loc.raw);
    if (leaves.length === 0) {
      checkLeaf(
        `server "${srv.server.name}"`,
        pick(srv.server.waf, "request"),
        pick(srv.server.waf, "response"),
      );
      continue;
    }

    for (const loc of leaves) {
      // У websocket-пути фазы ответа нет: компилятор печатает `response none`,
      // и унаследованный с сервера `resume=` там никого не продолжит. Кадры
      // транзакцию рукопожатия не продолжают, потребителя у `keep=on` нет.
      const response =
        loc.protocol === "websocket"
          ? "none"
          : effective(pick(loc.waf, "response"), pick(srv.server.waf, "response"));
      checkLeaf(
        `location "${loc.path}" of server "${srv.server.name}"`,
        effective(pick(loc.waf, "request"), pick(srv.server.waf, "request")),
        response,
      );
    }
  }

  return errors;
}

/**
 * Все store-объекты, на которые ссылаются сертификаты пространства: сам
 * сертификат, приватный ключ (только у server), chain и список отзыва
 * (только у client_ca). Отсюда берётся набор, против которого
 * validateNginxExport ловит висячие `store:<uuid>`.
 */
export function certificateStoreIds(source: NginxExport): Set<string> {
  const ids = new Set<string>();

  for (const cert of source.certificates) {
    ids.add(cert.certStoreId);
    if (cert.keyStoreId) ids.add(cert.keyStoreId);
    if (cert.chainStoreId) ids.add(cert.chainStoreId);
    if (cert.crl !== undefined) ids.add(cert.crl.storeId);
  }

  return ids;
}

export function validateNginxExport(source: NginxExport, storeIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  let result: NginxCompileResult;
  try {
    result = compileNginx(source);
  } catch (err) {
    if (err instanceof NginxCompileError) {
      for (const name of err.names) {
        errors.push({
          code: err.code,
          message: `inspector "${name}" is not in the catalog`,
        });
      }
      return errors;
    }
    if (err instanceof WafCompileError) {
      errors.push({ code: err.code, message: err.message });
      return errors;
    }
    throw err;
  }
  for (const uuid of result.storeRefs) {
    if (!storeIds.has(uuid)) {
      errors.push({
        code: "missing_store_object",
        message: `store:${uuid} references a non-existent store object`,
      });
    }
  }

  for (const srv of source.servers) {
    if (!srv.server.enabled) continue;
    const hasSsl = srv.listens.some(lp => lp.ssl || lp.port.ssl);
    if (hasSsl && srv.certificates.length === 0) {
      errors.push({
        code: "ssl_no_certificate",
        message: `server "${srv.server.name}" listens on SSL but has no certificate`,
      });
    } else if (hasSsl && !srv.certificates.some(sc => sc.kind === "server")) {
      // Один client_ca без серверной пары -- рабочая с виду конфигурация,
      // которая не поднимется: nginx нечем закрыть handshake. Ловим здесь,
      // а не в `nginx -t` на ноде.
      errors.push({
        code: "ssl_no_server_certificate",
        message:
          `server "${srv.server.name}" listens on SSL but has no ` +
          `server certificate (only client_ca/trusted are bound)`,
      });
    }

    // ssl_verify_client без корня, которым проверять, -- mTLS, который
    // ничего не проверяет: nginx откажется стартовать.
    const verify = srv.server.nginx?.sslVerifyClient;
    if (
      verify !== undefined &&
      verify !== "off" &&
      !srv.certificates.some(sc => sc.kind === "client_ca")
    ) {
      errors.push({
        code: "mtls_no_client_ca",
        message:
          `server "${srv.server.name}" sets ssl_verify_client ${verify} ` +
          `but has no client_ca certificate bound`,
      });
    }

    const hasSharedPort = srv.listens.some(lp => {
      return source.servers.some(other =>
        other.server.id !== srv.server.id &&
        other.server.enabled &&
        other.listens.some(olp => olp.portId === lp.portId),
      );
    });
    if (hasSharedPort && srv.server.serverNames.length === 0) {
      errors.push({
        code: "shared_port_no_server_name",
        message: `server "${srv.server.name}" shares a port but has no server_name`,
      });
    }
  }

  errors.push(...resumePairErrors(source));

  const PEM_RE = /BEGIN\s+(RSA\s+)?PRIVATE\s+KEY/;
  for (const srv of source.servers) {
    if (srv.server.raw && PEM_RE.test(srv.server.rawNginx)) {
      errors.push({
        code: "raw_contains_private_key",
        message: `server "${srv.server.name}" raw block contains a private key`,
      });
    }
    for (const loc of srv.locations) {
      if (loc.raw && PEM_RE.test(loc.rawNginx)) {
        errors.push({
          code: "raw_contains_private_key",
          message: `location "${loc.path}" in server "${srv.server.name}" raw block contains a private key`,
        });
      }
    }
  }

  return errors;
}
