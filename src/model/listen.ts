import type { Uuid } from "./id.ts";

/**
 * Адрес, который nginx может слушать. Сам порт трафик не принимает -- его
 * привязывают к серверу через `ServerPort`. Один порт на два сервера с разными
 * `server_name` -- обычные виртуальные хосты на одном listen.
 */
export interface Port {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  address: string;
  port: number;
  /** listen … ssl — свойство сокета, общее для всех server_name на этом адресе. */
  ssl: boolean;
  http2: boolean;
  proxyProtocol: boolean;
}

/**
 * `listen` конкретного сервера. `ssl` / `http2` / `default_server` живут здесь,
 * потому что в nginx они стоят на listen, а не на `server {}`. На одном порту
 * `default_server` может быть только у одной привязки.
 */
export interface ServerPort {
  id: Uuid;
  serverId: Uuid;
  portId: Uuid;
  ssl: boolean;
  http2: boolean;
  proxyProtocol: boolean;
  defaultServer: boolean;
}

/**
 * Что это за сертификат по существу, а не как его сегодня применили:
 *
 * - `server`    -- пара «лист + приватный ключ», уезжает в `ssl_certificate`
 *                  и `ssl_certificate_key`. Ключ обязателен;
 * - `client_ca` -- доверенный корень для mTLS, `ssl_client_certificate`.
 *                  Приватного ключа нет и быть не должно: в контур приезжает
 *                  только публичная половина, которой nginx проверяет
 *                  предъявленные клиентами сертификаты.
 *
 * Тип задаётся при загрузке и не меняется: он определяет, какие поля вообще
 * имеют смысл (ключ, CRL) и куда строку можно привязать.
 */
export type CertificateType = "server" | "client_ca";

/**
 * Список отзыва, приложенный к корню mTLS. `storeId` -- UUID
 * `store_objects` с ciphertext, как и у самого сертификата; остальное --
 * разбор crypto-сервиса (`POST /v1/crl/metadata`).
 *
 * Обновление CRL -- новый store-объект и новый `storeId`: блобы неизменяемы.
 */
export interface CertificateRevocationList {
  storeId: Uuid;
  issuer: string;
  thisUpdate?: Date;
  /** Опционален по RFC 5280, хотя на практике его ставят все. */
  nextUpdate?: Date;
  revoked?: number;
}

/**
 * Сертификат как объект контроллера. PEM сюда не кладётся: `certStoreId` и
 * `keyStoreId` -- UUID объектов `store_objects` (ciphertext в Postgres).
 * В шаблоне они станут `ssl_certificate store:<uuid>`. Срок, SAN,
 * `subject`/`issuer` и `fingerprint` -- из crypto-сервиса
 * (docs/crypto-service.md), не от браузера: контроллер не верит утверждениям
 * клиента о содержимом ciphertext, значения посчитаны по расшифрованному
 * сертификату.
 *
 * `keyStoreId` есть ровно у `type: "server"`, `crl` -- ровно у
 * `type: "client_ca"`; в базе это закреплено check-констрейнтами
 * (schema/01-schema.sql).
 */
export interface Certificate {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  type: CertificateType;
  certStoreId: Uuid;
  keyStoreId?: Uuid;
  chainStoreId?: Uuid;
  sans: string[];
  notBefore?: Date;
  notAfter?: Date;
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
  crl?: CertificateRevocationList;
}

/**
 * Назначение привязки к серверу -- в какую директиву nginx попадёт PEM.
 * `client_ca` и `trusted` печатаются из одного и того же файла корня,
 * поэтому это отдельное назначение привязки, а не отдельный тип загрузки.
 */
export type CertificateKind = "server" | "client_ca" | "trusted";

/** Какие типы сертификата допустимы для каждого назначения привязки. */
export const KIND_ACCEPTS: Record<CertificateKind, readonly CertificateType[]> = {
  server: ["server"],
  client_ca: ["client_ca"],
  trusted: ["client_ca", "server"],
};

export interface ServerCertificate {
  id: Uuid;
  serverId: Uuid;
  certificateId: Uuid;
  kind: CertificateKind;
}
