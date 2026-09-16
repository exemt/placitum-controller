import type { Uuid } from "./id.ts";
import type { Certificate, Port, ServerCertificate, ServerPort } from "./listen.ts";
import type { Location } from "./location.ts";
import type { NginxServerSettings } from "./settings.ts";
import type { WafRouteSettings } from "./waf-route.ts";

export interface Server {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  serverNames: string[];
  enabled: boolean;
  nginx: NginxServerSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
}

export interface BoundPort extends ServerPort {
  port: Port;
}

export interface BoundCertificate extends ServerCertificate {
  certificate: Certificate;
}

export interface ServerTree extends Server {
  listens: BoundPort[];
  certificates: BoundCertificate[];
  locations: Location[];
}
