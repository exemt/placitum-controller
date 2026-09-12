import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStore } from "./catalogs-http.ts";

/**
 * Обменник -- единственный каталог, у которого форма задаёт не всё. Адрес и
 * драйвер приходят из развёртывания, и держится это здесь: поле, снова
 * доехавшее до базы, разведёт модуль с агентом и инспекторами молча.
 */

test("parseStore: сроки и пределы проходят", () => {
  const parsed = parseStore({
    name: "hot",
    spec: { ttl: "30s", retain_ttl: "5m", max: "8m", pool: 4, op_timeout: "200ms" },
  });

  assert.deepEqual(parsed, {
    name: "hot",
    driver: "redis",
    spec: { ttl: "30s", retain_ttl: "5m", max: "8m", pool: 4, op_timeout: "200ms" },
  });
});

test("parseStore: url и driver из запроса до базы не доезжают", () => {
  const parsed = parseStore({
    name: "hot",
    driver: "inline",
    spec: { url: "redis://someone-elses:6379", driver: "none", ttl: "30s" },
  });

  assert.deepEqual(parsed, { name: "hot", driver: "redis", spec: { ttl: "30s" } });
});

test("parseStore: посторонний ключ spec -- ошибка, а не тихая запись", () => {
  assert.equal(parseStore({ name: "hot", spec: { password_file: "/etc/waf/redis.pass" } }), "invalid_spec");
});

test("parseStore: имя обязательно", () => {
  assert.equal(parseStore({ spec: { ttl: "30s" } }), "invalid_name");
});
