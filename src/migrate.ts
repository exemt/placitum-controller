/*
 * Накатчик схемы Postgres.
 *
 * Схема принадлежит контроллеру: кто пишет в таблицы, тот их и объявляет.
 * Поэтому накатывает он сам, при старте, -- как логгер накатывает ClickHouse.
 * Файлы -- в CONTROLLER_SCHEMA_DIR (в образе /app/schema):
 *
 *   01-baseline.sql        структура поставки 1.0 -- только на пустую базу
 *   02-shipped.sql         данные поставки; несёт заполненный waf_schema_log
 *   migrations/NNN_*.sql   всё, что новее поставки, по журналу
 *
 * Три правила. Один проход за раз: pg_advisory_lock на время работы, две
 * реплики стартуют одновременно и обе видят непроведённую миграцию. Только
 * вперёд: откат -- отдельный файл, обратная миграция на живых данных теряет
 * их молча. Громко: ошибка миграции -- отказ старта, а не работа на схеме,
 * которой код не соответствует.
 *
 * База, поднятая раньше поставки 1.0, журнала не имеет, и по ней не видно,
 * где она остановилась: CONTROLLER_SCHEMA_BASE=NNN один раз называет
 * последнюю применённую миграцию, дальше журнал ведётся сам. Без него на
 * такой базе накатчик отказывается гадать.
 *
 * Скрипты (*.sh, гео-сид) накатчик не исполняет: каталог гео -- операторский
 * шаг, выгрузка лицензируется отдельно и в образ не едет.
 *
 * Отдельный запуск -- посмотреть, что бы накатилось, не применяя:
 *
 *     node src/migrate.ts --check
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type pg from "pg";

import { createPool } from "./db.ts";
import { load } from "./config.ts";
import { log, setLevel } from "./log.ts";

export type MigrateOptions = {
  schemaDir: string;
  /** Номер последней уже применённой миграции для базы без журнала. */
  base?: string;
  /** Только план: ничего не применять. */
  check?: boolean;
};

export type MigrateReport = {
  /** Поставка 1.0 накатана в этот проход (база была пустой). */
  baseline: boolean;
  applied: string[];
  pending: string[];
};

/* Ключ advisory-блокировки; произвольное число, одно на контур. */
const LOCK_KEY = 7413001;

const BASELINE = "01-baseline.sql";
const SHIPPED = "02-shipped.sql";
const MIGRATIONS = "migrations";

/* Таблица, по которой видно, что схема на месте, даже если журнала нет. */
const SENTINEL = "public.http_spaces";
const LOG = "public.waf_schema_log";

export async function migrate(pool: pg.Pool, opts: MigrateOptions): Promise<MigrateReport> {
  const dir = opts.schemaDir;

  if (!existsSync(join(dir, MIGRATIONS))) {
    throw new Error(`каталог схемы не найден: ${dir} (CONTROLLER_SCHEMA_DIR)`);
  }

  const files = readdirSync(join(dir, MIGRATIONS))
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();

  const client = await pool.connect();
  const report: MigrateReport = { baseline: false, applied: [], pending: [] };

  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query("set search_path to public");

    const hasLog = await exists(client, LOG);
    const hasSchema = await exists(client, SENTINEL);

    if (!hasLog && !hasSchema) {
      report.baseline = true;

      if (!opts.check) {
        await applyFile(client, dir, BASELINE);
        await applyFile(client, dir, SHIPPED);
        log("info", "schema baseline applied", { dir });
      }
    } else if (!hasLog) {
      /*
       * Схема есть, журнала нет: база старше поставки 1.0. Гадать, что в ней
       * применено, нельзя -- половина миграций не идемпотентна.
       */
      if (opts.base === undefined) {
        throw new Error(
          "журнал миграций пуст, а схема на месте: база поднята раньше поставки 1.0, и по ней " +
            "не видно, где она остановилась. Один раз укажите номер последней применённой " +
            "миграции: CONTROLLER_SCHEMA_BASE=099. Всё, что новее, накатчик применит сам.",
        );
      }

      if (!opts.check) {
        await client.query(
          "create table if not exists public.waf_schema_log (file text primary key, applied_at timestamptz not null default now())",
        );

        const seed = files.filter((f) => f.slice(0, 3) <= opts.base!.padStart(3, "0"));

        for (const f of seed) {
          await record(client, f);
        }

        log("info", "schema log seeded", { base: opts.base, files: seed.length });
      }
    }

    /*
     * Журнал читается только там, где он есть: на пустой базе в режиме проверки
     * его ещё нет, и план строится по поставке. Отказ чтения журнала -- отказ
     * накатчика: «пустой» журнал по ошибке означал бы повторный прогон всего
     * архива по живой базе.
     */
    const done = new Set<string>(
      opts.check && report.baseline
        ? []
        : (await client.query<{ file: string }>("select file from public.waf_schema_log")).rows.map((r) => r.file),
    );

    /*
     * В режиме проверки на пустой базе журнал ещё не заведён: считаем, что
     * поставка его заполнит, и в план идут только файлы новее неё.
     */
    if (opts.check && report.baseline) {
      const shipped = readFileSync(join(dir, SHIPPED), "utf8");

      for (const f of files) {
        if (shipped.includes(`('${f}')`)) {
          done.add(f);
        }
      }
    }

    report.pending = files.filter((f) => !done.has(f));

    if (opts.check) {
      return report;
    }

    for (const f of report.pending) {
      await applyFile(client, join(dir, MIGRATIONS), f);
      await record(client, f);
      report.applied.push(f);
      log("info", "schema migration applied", { file: f });
    }

    report.pending = [];

    return report;
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

async function exists(client: pg.PoolClient, name: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>("select to_regclass($1) is not null as ok", [name]);

  return rows[0]?.ok === true;
}

/*
 * Файл целиком одним запросом: без параметров pg шлёт его простым протоколом,
 * и несколько операторов идут одной неявной транзакцией -- упавшая посередине
 * миграция откатывается целиком. Файлы со своими begin/commit это не ломает.
 *
 * search_path возвращается после каждого файла: дамп поставки выставляет его
 * пустым (так делает pg_dump), и следующая миграция с неквалифицированным
 * create table ответила бы «no schema has been selected».
 */
async function applyFile(client: pg.PoolClient, dir: string, name: string): Promise<void> {
  const path = join(dir, name);

  if (!existsSync(path)) {
    throw new Error(`файл схемы не найден: ${path}`);
  }

  try {
    await client.query(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await client.query("set search_path to public");
  }
}

async function record(client: pg.PoolClient, file: string): Promise<void> {
  await client.query("insert into public.waf_schema_log (file) values ($1) on conflict do nothing", [file]);
}

/* --- отдельный запуск ------------------------------------------------------- */

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = load();
  const check = process.argv.includes("--check");

  setLevel(cfg.logLevel);

  const pool = createPool(cfg.databaseUrl);

  try {
    const report = await migrate(pool, { schemaDir: cfg.schemaDir, base: cfg.schemaBase, check });

    if (check) {
      process.stdout.write(
        report.baseline ? "база пустая: накатится поставка 1.0 и миграции новее неё\n" : "поставка на месте\n",
      );
      process.stdout.write(
        report.pending.length ? `к применению:\n  ${report.pending.join("\n  ")}\n` : "применять нечего\n",
      );
    } else {
      process.stdout.write(
        `${report.baseline ? "поставка накатана, " : ""}миграций применено: ${report.applied.length}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(`схема: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
