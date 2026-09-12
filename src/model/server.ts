import type { Uuid } from "./id.ts";
import type { Certificate, Port, ServerCertificate, ServerPort } from "./listen.ts";
import type { Location } from "./location.ts";
import type { NginxServerSettings } from "./settings.ts";
import type { WafRouteSettings } from "./waf-route.ts";

/**
 * Блок `server {}`. Имена хостов -- массив, listen и сертификаты -- отдельные
 * привязки: порт и сертификат имеют собственный срок жизни (перевыпуск, смена
 * 443 на другой сервер) и не должны переписываться вместе с `server_name`.
 *
 * `waf` -- разреженный оверлей над `HttpSpace.waf`. Пустой объект -- сервер
 * целиком живёт значениями пространства.
 *
 * `raw` -- внутри `server {}` оператор пишет текст сам. Скелет остаётся:
 * listen, server_name, сертификаты. `nginx`/`waf` и пути не печатаются.
 */
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
