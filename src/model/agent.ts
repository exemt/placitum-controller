/**
 * Настройки агента контура.
 *
 * Это не документ nginx: агент применяет их сам, без `nginx -t` и без reload.
 * Поэтому здесь только то, что одинаково у всех нод контура и меняется без
 * захода на машину, -- назначения архива и темп выгрузки.
 *
 * Реквизитов S3 здесь нет и не будет: ключи остаются секретом ноды
 * (`WAF_RETAIN_S3_CREDENTIALS_FILE`). Контроллер называет хранилище, но не
 * открывает его -- та же граница, что у приватного ключа контура.
 */

/** Корзина PUT по виду объекта. Пусто -- сразу, без накопления. */
export interface AgentBatch {
  /** Вспышка, когда в корзине столько объектов. */
  size?: number;
  /** Вспышка, если с первого объекта в корзине прошло столько мс. */
  timeoutMs?: number;
}

export type ArchiveKind = "headers" | "args" | "body";

export const ARCHIVE_KINDS: readonly ArchiveKind[] = ["headers", "args", "body"];

export interface AgentS3 {
  endpoint?: string;
  region?: string;
  /** Три бакета: разная чувствительность -- разные правила удаления. */
  buckets?: Partial<Record<ArchiveKind, string>>;
}

export interface AgentArchive {
  workers?: number;
  queue?: number;
  /** Потолок одной операции с хранилищем. */
  timeoutMs?: number;
  batch?: Partial<Record<ArchiveKind, AgentBatch>>;
}

export interface AgentSettings {
  s3?: AgentS3;
  archive?: AgentArchive;
}
