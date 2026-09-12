/**
 * Экспорт пространства из Postgres. Компиляторы location / server / http
 * читают этот документ, в текст секреты не кладут.
 */

import type { BodyStore, Dataset, DenyResponse, HttpSpace, Inspector, LogFormat } from "../model/http-space.ts";
import type { Certificate, Port, ServerCertificate, ServerPort } from "../model/listen.ts";
import type { Location } from "../model/location.ts";
import type { Server } from "../model/server.ts";

export interface Upstream {
  id: string;
  name: string;
  method: string;
  hashKey?: string;
  keepalive?: number;
  keepaliveRequests?: number;
  keepaliveTimeoutMs?: number;
  tls?: boolean;
  tlsName?: string;
  hostHeader?: string;
  peers: UpstreamPeer[];
}

export interface UpstreamPeer {
  host: string;
  port: number;
  weight: number;
  maxFails?: number;
  failTimeoutMs?: number;
  backup: boolean;
  down: boolean;
}

export interface ServerExport {
  server: Server;
  listens: (ServerPort & { port: Port })[];
  certificates: (ServerCertificate & { certificate: Certificate })[];
  locations: Location[];
}

/**
 * Объект содержимого пространства -- набор `kind=content`. В текст
 * конфигурации не попадает: на ноду он едет отдельным файлом, а шаблон
 * ссылается на каталог через `pages:`.
 *
 * `file` -- имя в каталоге ноды: имя набора плюс расширение по типу. Оно же
 * цель `try_files /$waf_deny_name.html`, поэтому страница отказа обязана
 * называться как запись каталога, ради которой её завели.
 */
export interface ContentObjectExport {
  id: string;
  name: string;
  file: string;
  body: Buffer;
}

/**
 * Адреса инфраструктуры контура. Настройкой панели они не являются: тот же
 * redis знают агент (`agent.conf`) и инспекторы (`REDIS_URL`), и разъехаться
 * им нельзя -- модуль клал бы объект в одно хранилище, а читали бы из другого.
 * Поэтому адрес приезжает окружением контроллера, а не из `body_stores`.
 */
export interface InfraUrls {
  /** `CONTROLLER_REDIS_URL`: `url=` горячего обменника. */
  redisUrl?: string;
  /**
   * `CONTROLLER_REDIS_INTERNAL_URL`: `url=` внутреннего Redis контура, где
   * keeper держит пакеты и снапшоты активных наборов -- `waf_sets_store`.
   */
  redisInternalUrl?: string;
  /** `CONTROLLER_NATS_URL`: адрес шины. Её же слушает агент и инспекторы. */
  natsUrl?: string;
  /**
   * Реквизиты шины: `CONTROLLER_NATS_USER` / `_PASS` / `_TOKEN`. Из панели их
   * тоже не задают -- граница та же, что у реквизитов S3 у агента: контроллер
   * называет шину, но открывает её развёртывание.
   */
  natsUser?: string;
  natsPass?: string;
  natsToken?: string;
}

export interface NginxExport {
  space: HttpSpace;
  inspectors: Inspector[];
  datasets: Dataset[];
  denyResponses: DenyResponse[];
  bodyStores: BodyStore[];
  logFormats: LogFormat[];
  upstreams: Upstream[];
  ports: Port[];
  certificates: Certificate[];
  servers: ServerExport[];
  contentObjects: ContentObjectExport[];
  infra?: InfraUrls;
}
