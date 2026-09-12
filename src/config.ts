import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function defaultUxDir(): string | undefined {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "ux", "dist");
  return existsSync(join(dir, "index.html")) ? dir : undefined;
}

export interface Config {
  port: number;
  name: string;
  logLevel: string;
  /**
   * Журнал в waf.log (`WAF_LOG_SHIP`, ключ общий на контур): off — только
   * stdout. Писатель — `WAF_LOG_WRITER`, иначе имя машины (docs/logger/logs.md).
   */
  logShip: boolean;
  logWriter: string;
  /** origin UX в vite-dev; пустая строка — отражать любой (только отладка) */
  corsOrigin: string;
  /** Postgres контроллера. Схему накатывает сам контроллер при старте (migrate.ts). */
  databaseUrl: string;
  /** Каталог схемы: поставка 1.0 и миграции новее неё. В образе -- /app/schema. */
  schemaDir: string;
  /** База без журнала миграций: номер последней применённой, CONTROLLER_SCHEMA_BASE. */
  schemaBase?: string;
  /** Сборка: метки образа (CONTROLLER_VERSION/REVISION); dev/unknown без них. */
  version: string;
  revision: string;
  /** Потолок ciphertext одного объекта store. Страница отказа и PEM сюда влезают, GeoIP — нет. */
  storeMaxBytes: number;
  /**
   * Каталог `vite build` (index.html). Если задан и существует — `/` отдаёт UX,
   * `/api` остаётся API. Потом это разъедет nginx; пока один процесс.
   */
  uxDir?: string;
  /** Нет healthup столько — статус `degraded`. */
  fleetDegradedMs: number;
  /** Нет healthup столько — запись удаляется из стора. */
  fleetExpireMs: number;
  fleetTickMs: number;
  /** Пока нет шины — demo-пульсы воркеров, чтобы натянуть UX. */
  fleetDemo: boolean;
  /** NATS для WAF_STATUS. Пустая строка — не подключаться. */
  natsUrl: string;
  /** HTTP loadgen в deploy/. Пустая строка — кнопка нагрузки выключена. */
  loadgenUrl: string;
  /** HTTP поиска по waf.audit. Пустая строка — журнал в UX выключен. */
  searchUrl: string;
  /** HTTP geo/asn кодера. Пустая строка — флаг и ASN в UX не показываются. */
  geoUrl: string;
  /**
   * Публичный PEM контура или путь к файлу. Пусто — /crypto отдаёт 503.
   * Приватную половину контроллер не принимает.
   */
  cryptoPublicKey: string;
  /**
   * База URI crypto-сервиса (docs/crypto-service.md) для метаданных
   * сертификата при POST /certificates. Пусто — POST отвечает
   * 502 crypto_unavailable.
   */
  cryptoServiceUrl: string;
  /** Куда compile кладёт деревья. Потом сюда встанет упаковка/push. */
  compileDir: string;
  /**
   * Обменник (`CONTROLLER_REDIS_URL`): адрес, который печатается в `waf_store`
   * и который панель показывает у хранилища тел. Сам контроллер туда не ходит.
   */
  redisUrl: string;
  /**
   * Внутренний Redis контура (`CONTROLLER_REDIS_INTERNAL_URL`): блобы
   * поколений waf.blob.<sha256>, которые забирают агенты и инспекторы.
   * Пусто -- блобы кладутся в обменник, как до разделения; пусто и то и
   * другое -- только диск, рассылки нет.
   */
  redisInternalUrl: string;
}

export function load(env: NodeJS.ProcessEnv = process.env): Config {
  const fromEnv = env.CONTROLLER_UX_DIR;
  const uxDir =
    fromEnv !== undefined && fromEnv !== ""
      ? fromEnv
      : defaultUxDir();

  return {
    port: Number(env.CONTROLLER_PORT ?? env.PORT ?? 8080),
    name: env.CONTROLLER_NAME ?? "controller",
    logLevel: env.CONTROLLER_LOG ?? "info",
    logShip: !["off", "0", "no", "false"].includes(
      (env.WAF_LOG_SHIP ?? "").trim().toLowerCase(),
    ),
    logWriter: (env.WAF_LOG_WRITER ?? "").trim() || hostname(),
    corsOrigin: env.CONTROLLER_CORS_ORIGIN ?? "http://127.0.0.1:5173",
    databaseUrl:
      env.CONTROLLER_DATABASE_URL ??
      "postgres://waf:waf@127.0.0.1:5432/waf",
    /* Схема едет в образе (/app/schema); локально -- controller/schema. */
    schemaDir: env.CONTROLLER_SCHEMA_DIR ?? join(process.cwd(), "schema"),
    /* База старше поставки 1.0: номер последней применённой миграции, см. migrate.ts. */
    schemaBase: env.CONTROLLER_SCHEMA_BASE,
    version: env.CONTROLLER_VERSION ?? "dev",
    revision: env.CONTROLLER_REVISION ?? "unknown",
    storeMaxBytes: Number(env.CONTROLLER_STORE_MAX_BYTES ?? 2 * 1024 * 1024),
    uxDir:
      uxDir !== undefined && existsSync(join(uxDir, "index.html"))
        ? uxDir
        : undefined,
    fleetDegradedMs: Number(env.CONTROLLER_FLEET_DEGRADED_MS ?? 15_000),
    fleetExpireMs: Number(env.CONTROLLER_FLEET_EXPIRE_MS ?? 60_000),
    fleetTickMs: Number(env.CONTROLLER_FLEET_TICK_MS ?? 1_000),
    fleetDemo: env.CONTROLLER_FLEET_DEMO !== "0",
    natsUrl: env.CONTROLLER_NATS_URL ?? env.NATS_URL ?? "nats://127.0.0.1:4222",
    loadgenUrl: env.CONTROLLER_LOADGEN_URL ?? "",
    searchUrl: env.CONTROLLER_SEARCH_URL ?? "",
    geoUrl: env.CONTROLLER_GEO_URL ?? "",
    cryptoPublicKey: env.CONTROLLER_CRYPTO_PUBLIC_KEY ?? "",
    cryptoServiceUrl: env.CONTROLLER_CRYPTO_SERVICE_URL ?? "",
    compileDir: env.CONTROLLER_COMPILE_DIR ?? join(process.cwd(), "data", "compile"),
    redisUrl: env.CONTROLLER_REDIS_URL ?? "",
    redisInternalUrl:
      env.CONTROLLER_REDIS_INTERNAL_URL ?? env.CONTROLLER_REDIS_URL ?? "",
  };
}
