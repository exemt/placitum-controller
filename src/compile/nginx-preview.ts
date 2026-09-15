import { compileLocation } from "./nginx-location.ts";
import { collectInspectorGraph, compileUpstream } from "./nginx-http.ts";
import { compileServer } from "./nginx-server.ts";
import type { NginxExport } from "./nginx-source.ts";
import { compileNginx, httpSourceOf } from "./nginx.ts";

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
