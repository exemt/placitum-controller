import type { Uuid } from "./id.ts";

/**
 * Зачем объект, не формат байтов. Контроллер по type не открывает blob:
 * `certificate` и `private_key` для него одинаково непрозрачный ciphertext.
 */
export const STORE_TYPES = [
  "certificate",
  "private_key",
  "chain",
  "ca",
  "crl",
  "creds",
  "dhparam",
  "deny_page",
  "other",
] as const;

export type StoreType = (typeof STORE_TYPES)[number];

export function isStoreType(value: string): value is StoreType {
  return (STORE_TYPES as readonly string[]).includes(value);
}

/**
 * Файл для шаблона `store:<uuid>`. Живёт в Postgres, не в S3: объекты мелкие
 * (PEM, страница отказа), шифрованы в браузере, и агенту проще забрать их
 * тем же API, что отдаёт поколение, чем гоняться за presign.
 *
 * `blob` в JSON API уезжает base64. Список и meta blob не содержат.
 * Ряд не обновляется -- замена это новый uuid.
 */
export interface StoreObject {
  id: Uuid;
  type: StoreType;
  metadata: Record<string, unknown>;
  blob: Buffer;
  createdAt: Date;
}

export interface StoreObjectMeta {
  id: Uuid;
  type: StoreType;
  metadata: Record<string, unknown>;
  size: number;
  createdAt: Date;
}
