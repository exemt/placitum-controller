import { asUuid } from "./model/id.ts";
import type { CertificateKind, CertificateType } from "./model/listen.ts";
import type { ParseResult } from "./space-settings-parse.ts";

const CERT_KINDS: readonly CertificateKind[] = ["server", "client_ca", "trusted"];
const CERT_TYPES: readonly CertificateType[] = ["server", "client_ca"];

export interface CertificateCreateBody {
  name: string;
  type: CertificateType;
  certStoreId: string;
  keyStoreId?: string;
  chainStoreId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(error: string): ParseResult<never> {
  return { ok: false, error };
}

/** Пустая строка и null означают «не прислали», а не «прислали мусор». */
function optionalUuid(
  value: unknown,
): { ok: true; value?: string } | { ok: false } {
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }
  const parsed = asUuid(value);
  return parsed === undefined ? { ok: false } : { ok: true, value: parsed };
}

/**
 * Тип решает, какие поля обязательны:
 *
 * - `server`    -- нужен `key_store_id`, иначе nginx не сможет закрыть
 *                  handshake;
 * - `client_ca` -- ключа быть не должно. Молча игнорировать присланный ключ
 *                  нельзя: это значит, что оператор выгрузил приватную
 *                  половину CA в контур, и ему надо об этом сказать.
 *
 * Отсутствие `type` -- серверная пара: так вело себя API до появления mTLS,
 * и старые клиенты продолжают работать.
 */
export function parseCertificateCreate(body: unknown): ParseResult<CertificateCreateBody> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return fail("invalid_name");
  }

  let type: CertificateType = "server";
  if (body.type !== undefined && body.type !== null) {
    if (typeof body.type !== "string" || !CERT_TYPES.includes(body.type as CertificateType)) {
      return fail("invalid_type");
    }
    type = body.type as CertificateType;
  }

  const certStoreId = asUuid(body.cert_store_id);
  if (certStoreId === undefined) {
    return fail("invalid_cert_store_id");
  }

  const key = optionalUuid(body.key_store_id);
  if (!key.ok) {
    return fail("invalid_key_store_id");
  }

  if (type === "server" && key.value === undefined) {
    return fail("key_required");
  }

  if (type === "client_ca" && key.value !== undefined) {
    return fail("key_not_allowed");
  }

  const chain = optionalUuid(body.chain_store_id);
  if (!chain.ok) {
    return fail("invalid_chain_store_id");
  }

  return {
    ok: true,
    value: {
      name: body.name.trim(),
      type,
      certStoreId,
      keyStoreId: key.value,
      chainStoreId: chain.value,
    },
  };
}

export function parseCertificateBindCreate(body: unknown): ParseResult<{
  certificateId: string;
  kind: CertificateKind;
}> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }
  const certificateId = asUuid(body.certificate_id);
  if (certificateId === undefined) {
    return fail("invalid_certificate_id");
  }
  if (body.kind === undefined) {
    return { ok: true, value: { certificateId, kind: "server" } };
  }
  if (typeof body.kind !== "string" || !CERT_KINDS.includes(body.kind as CertificateKind)) {
    return fail("invalid_kind");
  }
  return {
    ok: true,
    value: { certificateId, kind: body.kind as CertificateKind },
  };
}

/** Тело `PUT /certificates/:uuid/crl`: ссылка на уже загруженный store-объект. */
export function parseCrlUpdate(body: unknown): ParseResult<{ crlStoreId: string }> {
  if (!isRecord(body)) {
    return fail("invalid_body");
  }

  const crlStoreId = asUuid(body.crl_store_id);
  if (crlStoreId === undefined) {
    return fail("invalid_crl_store_id");
  }

  return { ok: true, value: { crlStoreId } };
}
