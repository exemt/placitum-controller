import type { HttpSpace } from "./model/http-space.ts";
import {
  inheritFromHttp,
  inheritFromHttpAndServer,
  type InheritedField,
} from "./model/resolve.ts";
import type { Server } from "./model/server.ts";

export type InheritanceLayer = {
  uuid: string;
  name: string;
  waf: HttpSpace["waf"];
  nginx: HttpSpace["nginx"] | Server["nginx"];
};

export type HttpInheritance = {
  http: InheritanceLayer;
  inherited: InheritedField[];
};

export type RouteInheritance = {
  http: InheritanceLayer;
  server: InheritanceLayer;
  inherited: InheritedField[];
};

function jsonHttpLayer(space: HttpSpace): InheritanceLayer {
  return {
    uuid: space.id,
    name: space.name,
    waf: space.waf,
    nginx: space.nginx,
  };
}

function jsonServerLayer(server: Server): InheritanceLayer {
  return {
    uuid: server.id,
    name: server.name,
    waf: server.waf,
    nginx: server.nginx,
  };
}

export function jsonHttpInheritance(space: HttpSpace): HttpInheritance {
  return {
    http: jsonHttpLayer(space),
    inherited: inheritFromHttp(space.waf, space.nginx),
  };
}

export function jsonRouteInheritance(
  space: HttpSpace,
  server: Server,
): RouteInheritance {
  return {
    http: jsonHttpLayer(space),
    server: jsonServerLayer(server),
    inherited: inheritFromHttpAndServer(
      space.waf,
      space.nginx,
      server.waf,
      server.nginx,
    ),
  };
}
