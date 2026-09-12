import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseCertificateBindCreate,
  parseCertificateCreate,
  parseCrlUpdate,
} from "./certificates-parse.ts";

const CERT_ID = "9b1c70aa-0e11-4d2c-9c01-000000000018";
const KEY_ID = "9b1c70aa-0e11-4d2c-9c01-000000000019";
const CHAIN_ID = "9b1c70aa-0e11-4d2c-9c01-00000000001a";

test("accepts a minimal valid body", () => {
  const parsed = parseCertificateCreate({
    name: "shop",
    cert_store_id: CERT_ID,
    key_store_id: KEY_ID,
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, {
      name: "shop",
      type: "server",
      certStoreId: CERT_ID,
      keyStoreId: KEY_ID,
      chainStoreId: undefined,
    });
  }
});

test("accepts an optional chain_store_id", () => {
  const parsed = parseCertificateCreate({
    name: "shop",
    cert_store_id: CERT_ID,
    key_store_id: KEY_ID,
    chain_store_id: CHAIN_ID,
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.chainStoreId, CHAIN_ID);
  }
});

test("treats empty chain_store_id as absent", () => {
  const parsed = parseCertificateCreate({
    name: "shop",
    cert_store_id: CERT_ID,
    key_store_id: KEY_ID,
    chain_store_id: "",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.chainStoreId, undefined);
  }
});

test("rejects a missing or blank name", () => {
  assert.equal(
    parseCertificateCreate({ cert_store_id: CERT_ID, key_store_id: KEY_ID }).ok,
    false,
  );
  assert.equal(
    parseCertificateCreate({
      name: "   ",
      cert_store_id: CERT_ID,
      key_store_id: KEY_ID,
    }).ok,
    false,
  );
});

test("rejects invalid store ids", () => {
  assert.equal(
    parseCertificateCreate({
      name: "shop",
      cert_store_id: "not-a-uuid",
      key_store_id: KEY_ID,
    }).ok,
    false,
  );
  assert.equal(
    parseCertificateCreate({
      name: "shop",
      cert_store_id: CERT_ID,
      key_store_id: "not-a-uuid",
    }).ok,
    false,
  );
  assert.equal(
    parseCertificateCreate({
      name: "shop",
      cert_store_id: CERT_ID,
      key_store_id: KEY_ID,
      chain_store_id: "not-a-uuid",
    }).ok,
    false,
  );
});

test("rejects a non-object body", () => {
  assert.equal(parseCertificateCreate(null).ok, false);
  assert.equal(parseCertificateCreate("nope").ok, false);
});

test("bind defaults kind to server", () => {
  const parsed = parseCertificateBindCreate({ certificate_id: CERT_ID });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, { certificateId: CERT_ID, kind: "server" });
  }
});

test("bind accepts client_ca", () => {
  const parsed = parseCertificateBindCreate({
    certificate_id: CERT_ID,
    kind: "client_ca",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.kind, "client_ca");
  }
});

test("bind rejects a bad certificate id or kind", () => {
  assert.equal(parseCertificateBindCreate({ certificate_id: "nope" }).ok, false);
  assert.equal(
    parseCertificateBindCreate({ certificate_id: CERT_ID, kind: "sni" }).ok,
    false,
  );
});

test("client_ca загружается без приватного ключа", () => {
  const parsed = parseCertificateCreate({
    name: "clients-root",
    type: "client_ca",
    cert_store_id: CERT_ID,
  });

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok && parsed.value, {
    name: "clients-root",
    type: "client_ca",
    certStoreId: CERT_ID,
    keyStoreId: undefined,
    chainStoreId: undefined,
  });
});

// Приватная половина доверенного корня в контуре -- это утечка, а не
// лишнее поле: молча её проглотить нельзя.
test("client_ca с приватным ключом отклоняется", () => {
  const parsed = parseCertificateCreate({
    name: "clients-root",
    type: "client_ca",
    cert_store_id: CERT_ID,
    key_store_id: KEY_ID,
  });

  assert.equal(parsed.ok, false);
  assert.equal(!parsed.ok && parsed.error, "key_not_allowed");
});

test("server без ключа отклоняется", () => {
  const parsed = parseCertificateCreate({
    name: "shop",
    type: "server",
    cert_store_id: CERT_ID,
  });

  assert.equal(parsed.ok, false);
  assert.equal(!parsed.ok && parsed.error, "key_required");
});

// Тип по умолчанию -- серверная пара: API до mTLS вело себя так, и старые
// клиенты не должны сломаться.
test("отсутствие type означает серверную пару", () => {
  const parsed = parseCertificateCreate({
    name: "shop",
    cert_store_id: CERT_ID,
    key_store_id: KEY_ID,
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value.type, "server");
});

test("неизвестный type отклоняется", () => {
  const parsed = parseCertificateCreate({
    name: "shop",
    type: "trusted",
    cert_store_id: CERT_ID,
    key_store_id: KEY_ID,
  });

  assert.equal(parsed.ok, false);
  assert.equal(!parsed.ok && parsed.error, "invalid_type");
});

test("parseCrlUpdate принимает uuid и отвергает мусор", () => {
  const ok = parseCrlUpdate({ crl_store_id: CERT_ID });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.value.crlStoreId, CERT_ID);

  assert.equal(parseCrlUpdate({ crl_store_id: "nope" }).ok, false);
  assert.equal(parseCrlUpdate({}).ok, false);
  assert.equal(parseCrlUpdate(null).ok, false);
});
