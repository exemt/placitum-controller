/*
 * Разбор MaxMind DB: вид базы, сети, страна и система, отказ на чужом файле.
 *
 * Базу собирает testkit/mmdb.ts: выгрузок MaxMind в репозитории нет.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { Mmdb, MmdbError, type MmdbErrorCode } from "./geo-mmdb.ts";
import { buildMmdb, TEST_BUILD_EPOCH } from "./testkit/mmdb.ts";

const US = { country: { iso_code: "US", names: { en: "United States", ru: "США" } } };
const RU = { country: { iso_code: "RU", names: { en: "Russia", ru: "Россия" } } };

function refused(code: MmdbErrorCode) {
  return (err: unknown) => err instanceof MmdbError && err.code === code;
}

test("страны: вид из метаданных, сети по возрастанию, IPv4 один раз при псевдонимах", () => {
  const db = new Mmdb(
    buildMmdb({
      type: "GeoLite2-Country",
      alias: true,
      networks: [
        { cidr: "8.8.8.0/24", record: US },
        { cidr: "2a02:6b8::/32", record: RU },
        {
          // Страны пользователя нет -- берётся страна регистрации анонса.
          cidr: "1.0.0.0/24",
          record: {
            country: { geoname_id: 2077456 },
            registered_country: { iso_code: "AU", names: { en: "Australia" } },
          },
        },
        { cidr: "10.0.0.0/8", record: {} },
      ],
    }),
  );

  assert.equal(db.kind, "country");
  assert.equal(db.meta.databaseType, "GeoLite2-Country");
  assert.equal(db.meta.buildEpoch, TEST_BUILD_EPOCH);
  assert.deepEqual(
    [...db.networks()],
    [
      { code: "au", type: "v4", address: "1.0.0.0/24", name: "Australia" },
      { code: "us", type: "v4", address: "8.8.8.0/24", name: "США" },
      { code: "ru", type: "v6", address: "2a02:6b8::/32", name: "Россия" },
    ],
  );
});

test("ASN: номер и организация; без номера -- мимо, без организации -- AS<номер>", () => {
  const db = new Mmdb(
    buildMmdb({
      type: "GeoLite2-ASN",
      networks: [
        {
          cidr: "8.8.8.0/24",
          record: { autonomous_system_number: 15169, autonomous_system_organization: "GOOGLE" },
        },
        { cidr: "9.9.9.0/24", record: { autonomous_system_number: 19281 } },
        { cidr: "192.0.2.0/24", record: { autonomous_system_organization: "TEST-NET-1" } },
        {
          cidr: "2606:4700::/32",
          record: {
            autonomous_system_number: 13335,
            autonomous_system_organization: "CLOUDFLARENET",
          },
        },
      ],
    }),
  );

  assert.equal(db.kind, "asn");
  assert.deepEqual(
    [...db.networks()],
    [
      { code: "15169", type: "v4", address: "8.8.8.0/24", name: "GOOGLE" },
      { code: "19281", type: "v4", address: "9.9.9.0/24", name: "AS19281" },
      { code: "13335", type: "v6", address: "2606:4700::/32", name: "CLOUDFLARENET" },
    ],
  );
});

test("не MaxMind DB: mmdb_invalid ещё в конструкторе", () => {
  assert.throws(() => new Mmdb(Buffer.from("definitely not a database")), refused("mmdb_invalid"));
  assert.throws(() => new Mmdb(Buffer.alloc(0)), refused("mmdb_invalid"));
});

test("база не стран и не ASN: mmdb_unsupported", () => {
  assert.throws(() => new Mmdb(buildMmdb({ type: "GeoLite2-City" })), refused("mmdb_unsupported"));
});

test("запись за краем файла: mmdb_invalid при обходе, а не мусор в каталоге", () => {
  const db = new Mmdb(
    buildMmdb({
      type: "GeoLite2-Country",
      brokenPointer: true,
      networks: [{ cidr: "8.8.8.0/24", record: US }],
    }),
  );

  assert.throws(() => [...db.networks()], refused("mmdb_invalid"));
});
