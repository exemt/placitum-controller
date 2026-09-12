/**
 * Превью одного узла дерева: что печатает открытая карточка.
 *
 * Уровни -- http {}, server {}, location {}, upstream {} -- показываются
 * каждый своим блоком, а вложенные в него узлы -- заглушками `include` по
 * uuid. Оператор правит сервер и хочет видеть сервер, а не файл, в котором
 * его блок -- один из десяти, и не пути, у которых есть свои карточки.
 *
 * Раньше блок вырезали из готового текста по `server_name` и заголовку пути.
 * Это ломалось на одинаковых именах, на выключенном сервере (его в тексте
 * нет -- превью молча показывало файл целиком) и на пути, чей заголовок
 * оператор как раз правит. Узел по uuid находится однозначно, и печатает его
 * тот же компилятор, что и файл: сервер сам по себе и сервер внутри `http {}`
 * -- один и тот же текст с точностью до отступа.
 */

import { compileLocation } from "./nginx-location.ts";
import { collectInspectorGraph, compileUpstream } from "./nginx-http.ts";
import { compileServer } from "./nginx-server.ts";
import type { NginxExport } from "./nginx-source.ts";
import { compileNginx, httpSourceOf } from "./nginx.ts";

/** Какой узел показать. Без узла -- файл целиком, как его напечатает `send`. */
export type PreviewNode =
  | { kind: "http" }
  | { kind: "server"; uuid: string }
  | { kind: "location"; uuid: string }
  | { kind: "upstream"; uuid: string };

export function previewBlock(source: NginxExport, node: PreviewNode | undefined): string {
  if (node === undefined) {
    return compileNginx(source).text;
  }

  if (node.kind === "http") {
    return compileNginx(source, { nested: "include" }).text;
  }

  if (node.kind === "upstream") {
    const up = source.upstreams.find((row) => row.id === node.uuid);
    return up === undefined ? "" : compileUpstream(up, 0).text;
  }

  /*
   * Реестр инспекторов -- тот же, что у `http {}`: по нему печатаются строки
   * `waf_inspect`, и без него сервер сам по себе выглядел бы иначе, чем в
   * файле. Обменник объектов здесь не нужен: ссылки `store:` считает
   * проверка дерева по полной печати.
   */
  const graph = collectInspectorGraph(httpSourceOf(source));

  if (node.kind === "server") {
    const srv = source.servers.find((row) => row.server.id === node.uuid);
    if (srv === undefined) {
      return "";
    }
    return compileServer({
      server: srv.server,
      listens: srv.listens,
      certificates: srv.certificates,
      locations: srv.locations,
      inspectors: source.inspectors,
      upstreams: source.upstreams,
      indent: 0,
      graph,
      nested: "include",
    }).text;
  }

  for (const srv of source.servers) {
    const loc = srv.locations.find((row) => row.id === node.uuid);
    if (loc === undefined) {
      continue;
    }
    return compileLocation({
      location: loc,
      inspectors: source.inspectors,
      upstreams: source.upstreams,
      indent: 0,
      graph,
    }).text;
  }

  return "";
}
