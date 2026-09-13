/*
 * Загрузка выгрузки из панели: что отбивается до сверки, ход задачи, файл
 * кодеру.
 *
 * Сверка каталога -- SQL, он проверяется на стенде; здесь она подменена, а
 * файлы и KV -- в памяти.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import type { DesiredStore } from "./desired.ts";
import type { GeoDoc, GeoFileMeta, GeoFileRepo } from "./geo-files.ts";
import { GeoImportError, GeoImports, type CatalogDiff, type ImportCatalog } from "./geo-import.ts";
import { geoFilesRouter, geoImportRouter } from "./geo-import-http.ts";
import type { ServiceRecord } from "./model/fleet.ts";
import { buildMmdb } from "./testkit/mmdb.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";

const COUNTRY = buildMmdb({
  type: "GeoLite2-Country",
  networks: [{ cidr: "8.8.8.0/24", record: { country: { iso_code: "US" } } }],
});
const ASN = buildMmdb({
  type: "GeoLite2-ASN",
  networks: [{ cidr: "8.8.8.0/24", record: { autonomous_system_number: 15169 } }],
});

const DIFF: CatalogDiff = { networks: 1, keys: 1, added: 1, removed: 0 };
const instant: ImportCatalog = async () => DIFF;

interface JobJson {
  state: string;
  sha256: string;
  database_type: string;
  error?: string;
  detail?: string;
}

interface FileJson {
  sha256: string;
  published: boolean;
  coders: number;
}

interface ViewJson {
  jobs: Record<string, JobJson | null>;
  files: Record<string, FileJson | null>;
  coder: { replicas: number; rev: number };
}

function sha(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

async function harness(importCatalog: ImportCatalog) {
  const files = new Map<string, { meta: GeoFileMeta; data: Buffer }>();
  let doc: GeoDoc | null = null;
  let puts = 0;
  const changed: string[] = [];
  const coders: ServiceRecord[] = [];

  const repo = {
    list: async () => [...files.values()].map((row) => row.meta),
    data: async (kind: string) => files.get(kind) ?? null,
  } as unknown as GeoFileRepo;

  const desired = {
    getGeo: async () => doc,
    putGeo: async (next: GeoDoc) => {
      doc = next;
      puts += 1;
    },
  } as unknown as DesiredStore;

  const imports = new GeoImports({
    pool: {} as never,
    files: repo,
    desired,
    countriesChanged: async (spaceId) => {
      changed.push(spaceId);
    },
    // Файл ложится той же «транзакцией», что и сверка: не прошла -- файла нет.
    importCatalog: async (pool, input, progress) => {
      const diff = await importCatalog(pool, input, progress);

      if (input.file !== undefined) {
        files.set(input.kind, {
          meta: { ...input.file.meta, uploadedAt: new Date() },
          data: input.file.data,
        });
      }

      return diff;
    },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/geo/files", geoFilesRouter(repo));
  app.use(
    "/api/:scopeUuid/geo/import",
    geoImportRouter({ imports, files: repo, desired, coders: () => coders }),
  );

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");

  return {
    url: `http://127.0.0.1:${addr.port}`,
    doc: () => doc,
    puts: () => puts,
    changed,
    coders,
    close: async () => {
      imports.stop();
      server.close();
      await once(server, "close");
    },
  };
}

async function upload(
  url: string,
  kind: string,
  body: Buffer,
): Promise<{ status: number; body: { job?: JobJson; error?: string; detail?: string } }> {
  const res = await fetch(`${url}/api/${SCOPE}/geo/import/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body,
  });

  return { status: res.status, body: (await res.json()) as { job?: JobJson; error?: string } };
}

async function view(url: string): Promise<ViewJson> {
  const res = await fetch(`${url}/api/${SCOPE}/geo/import`);
  assert.equal(res.status, 200);
  return (await res.json()) as ViewJson;
}

async function settled(url: string, kind: string): Promise<ViewJson> {
  for (let i = 0; i < 200; i++) {
    const out = await view(url);

    if (out.jobs[kind] !== null && out.jobs[kind]?.state !== "running") {
      return out;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.fail(`${kind} import did not settle`);
}

test("вид не из словаря: 404 до чтения тела", async () => {
  const h = await harness(instant);

  try {
    const out = await upload(h.url, "city", COUNTRY);

    assert.equal(out.status, 404);
    assert.equal(out.body.error, "unknown_kind");
  } finally {
    await h.close();
  }
});

test("пустое тело, чужой файл и не тот вид отбиваются в ответ на POST", async () => {
  const h = await harness(instant);

  try {
    const empty = await upload(h.url, "country", Buffer.alloc(0));
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, "file_empty");

    const junk = await upload(h.url, "country", Buffer.from("not a database at all"));
    assert.equal(junk.status, 400);
    assert.equal(junk.body.error, "mmdb_invalid");

    const wrong = await upload(h.url, "country", ASN);
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error, "mmdb_kind_mismatch");
    assert.equal(wrong.body.detail, "asn");

    const out = await view(h.url);
    assert.equal(out.jobs.country, null);
    assert.equal(h.puts(), 0);
  } finally {
    await h.close();
  }
});

test("файл принят: задача доходит до конца, кодер получает документ; тот же файл ревизию не двигает", async () => {
  const h = await harness(instant);

  try {
    const first = await upload(h.url, "country", COUNTRY);
    assert.equal(first.status, 202);
    assert.equal(first.body.job?.state, "running");
    assert.equal(first.body.job?.database_type, "GeoLite2-Country");

    const done = await settled(h.url, "country");
    assert.equal(done.jobs.country?.state, "done");
    assert.deepEqual(h.changed, [SCOPE]);
    assert.equal(h.doc()?.rev, 1);
    assert.equal(h.doc()?.country?.sha256, sha(COUNTRY));
    assert.equal(done.files.country?.published, true);
    assert.equal(done.files.country?.coders, 0);

    // Кодер переключился: его кадр называет файл.
    h.coders.push({ name: "geo", work: { country_sha256: sha(COUNTRY) } } as unknown as ServiceRecord);
    const seen = await view(h.url);
    assert.equal(seen.coder.replicas, 1);
    assert.equal(seen.files.country?.coders, 1);

    assert.equal((await upload(h.url, "country", COUNTRY)).status, 202);
    await settled(h.url, "country");
    assert.equal(h.doc()?.rev, 1);
    assert.equal(h.puts(), 1);

    // ASN: модель стран не перечитывается, документ несёт оба файла.
    assert.equal((await upload(h.url, "asn", ASN)).status, 202);
    assert.equal((await settled(h.url, "asn")).jobs.asn?.state, "done");
    assert.equal(h.changed.length, 2);
    assert.equal(h.doc()?.rev, 2);
    assert.equal(h.doc()?.country?.sha256, sha(COUNTRY));
    assert.equal(h.doc()?.asn?.sha256, sha(ASN));
  } finally {
    await h.close();
  }
});

test("вторая загрузка вида, пока идёт первая: 409; другой вид не ждёт", async () => {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = await harness(async () => {
    await gate;
    return DIFF;
  });

  try {
    assert.equal((await upload(h.url, "country", COUNTRY)).status, 202);

    const second = await upload(h.url, "country", COUNTRY);
    assert.equal(second.status, 409);
    assert.equal(second.body.error, "import_running");

    assert.equal((await upload(h.url, "asn", ASN)).status, 202);

    release();
    assert.equal((await settled(h.url, "country")).jobs.country?.state, "done");
  } finally {
    release();
    await h.close();
  }
});

test("сверка упала: задача failed с кодом и причиной, кодеру ничего не уходит", async () => {
  const broken = await harness(async () => {
    throw new Error("deadlock detected");
  });

  try {
    assert.equal((await upload(broken.url, "country", COUNTRY)).status, 202);

    const out = await settled(broken.url, "country");
    assert.equal(out.jobs.country?.state, "failed");
    assert.equal(out.jobs.country?.error, "catalog_failed");
    assert.equal(out.jobs.country?.detail, "deadlock detected");
    assert.equal(out.files.country, null);
    assert.equal(broken.puts(), 0);
  } finally {
    await broken.close();
  }

  const empty = await harness(async () => {
    throw new GeoImportError(400, "mmdb_empty", "GeoLite2-Country has no country networks");
  });

  try {
    await upload(empty.url, "country", COUNTRY);
    assert.equal((await settled(empty.url, "country")).jobs.country?.error, "mmdb_empty");
  } finally {
    await empty.close();
  }
});

test("файл кодеру: 404 до загрузки, после -- те же байты и хеш", async () => {
  const h = await harness(instant);

  try {
    const missing = await fetch(`${h.url}/api/geo/files/country`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "geo_file_missing" });

    await upload(h.url, "country", COUNTRY);
    await settled(h.url, "country");

    const res = await fetch(`${h.url}/api/geo/files/country`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-geo-sha256"), sha(COUNTRY));
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), COUNTRY);

    assert.equal((await fetch(`${h.url}/api/geo/files/city`)).status, 404);
  } finally {
    await h.close();
  }
});
