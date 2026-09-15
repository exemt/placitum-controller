/*
 * Сборка поставочной базы: структура и данные одним снимком.
 *
 * Зачем. До 1.0 «поставка» была суммой ста трёх миграций: postgres катал
 * controller/schema целиком из initdb.d, и что именно окажется в базе, можно
 * было узнать только накатив. Вместе с моделью приезжало стендовое дерево --
 * серверы edge/shadow, сорок три пути, наборы e2e_cidr и list-21..24, полсотни
 * профилей адреса «для compile». Клиентская установка получала это как данность.
 *
 * Теперь поставка -- два файла рядом с этим скриптом:
 *
 *   01-baseline.sql -- структура, машинный pg_dump со снимка;
 *   02-shipped.sql  -- данные поставки, тот же дамп, отфильтрованный по правилам
 *                      ниже;
 *   stand/stand.sql -- всё остальное: стендовое дерево, которое катает предполёт
 *                      e2e и никогда не видит клиент.
 *
 * Снимок берётся не из живой базы стенда (она уходит вперёд руками), а из
 * пустого тома, прокатанного архивом миграций.
 * Поэтому пересборка воспроизводима: тот же архив -- те же три файла.
 *
 * Как пересобрать (нужен docker):
 *
 *   node controller/schema/build/baseline.mjs
 *
 * Когда пересобирать. Не после каждой миграции: 1.0 зафиксирована, дальше всё
 * едет файлами в migrations/, которые предполёт и установщик катают поверх
 * baseline. Пересборка -- это срезание следующей версии (2.0), осознанный шаг.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, "..");
const MIGRATIONS = join(SCHEMA, "migrations");
const STAND_DIR = join(SCHEMA, "stand");

const IMAGE = "postgres:16-alpine";
const BOX = "waf-schema-build";
const SPACE = "default";

/*
 * Пространству в поставке даётся постоянный uuid, остальные строки ищут его
 * подзапросом по имени. Так файл ложится и на пустой том, и на базу, заведённую
 * раньше (там пространство своё, случайное, и вставка по имени ничего не делает).
 */
const SPACE_ID = "00000000-0000-4000-8000-000000000001";

/* Версия поставки: попадает в шапки файлов. */
const VERSION = "1.0";

/*
 * Поставка: какие строки таблицы едут клиенту.
 *
 * Правило одно -- в поставке остаётся то, без чего установка не работает или
 * с чего оператор начинает свою настройку. Всё, что описывает чью-то конкретную
 * конфигурацию (серверы, пути, апстримы, чьи-то списки адресов), -- не поставка.
 *
 *   http_spaces      пространство одно, других не бывает;
 *   content_types    справочник типов содержимого;
 *   log_formats      формат access_log по умолчанию;
 *   body_stores      обменник тел (адрес Redis приезжает из окружения);
 *   counter_shared   общие оси счётчика: на них опирается проба healthcheck;
 *   deny_responses   каталог отказов -- на него ссылаются все инспекторы;
 *   datasets         builtin-страницы и два пресета списков; captcha_page и
 *                    login_form -- заготовки, с которых копируют свои;
 *   rule_*           CRS: файлы, наборы и их состав;
 *   inspectors       каталог процессов -- строки с описанием. Объявления
 *                    стенда (modsec-e2e, ip-heavy и прочие) описания не имеют;
 *   *_profiles       неуничтожимый default каждой подсистемы и проба счётчика.
 *
 * Тела наборов (dataset_addresses), наборы адресов (ip_sets) и всё дерево
 * nginx в поставку не входят вовсе -- их здесь просто нет.
 */
const SHIPPED = {
  http_spaces: "true",
  waf_schema_log: "true",
  content_types: "true",
  log_formats: "true",
  body_stores: "true",
  counter_shared: "true",
  deny_responses: "true",
  datasets: "builtin or name in ('captcha_page', 'login_form')",
  dataset_contents:
    "dataset_id in (select id from public.datasets where builtin or name in ('captcha_page', 'login_form'))",
  rule_files: "true",
  rule_sets: "true",
  rule_set_files: "true",
  inspectors: "description <> ''",
  auth_profiles: "name = 'default'",
  captcha_profiles: "name = 'default'",
  json_profiles: "name = 'default'",
  counter_profiles: "name in ('default', '_probe')",
  action_profiles: "name = 'default'",
  rewrite_profiles: "name = 'default'",
  vlai_profiles: "name = 'default'",
  cookie_profiles: "name = 'default'",
  ip_profiles: "name = 'default'",
};

/*
 * Гео живёт отдельно от обоих файлов.
 *
 * Каталог стран и ASN -- это выгрузка MaxMind, её кладёт 03-geo.sh из
 * schema/seed. Миграции 011 и 014 заводили три выдуманные страны
 * («Тестовая выгрузка ru/en/jp») по фикстуре deploy/ip/data/geo, и на
 * живом стенде настоящая выгрузка их уже переписала -- кроме `en`, страны с
 * таким кодом в ISO нет. Класть их в stand.sql нельзя: на базе с GeoLite2
 * страна с тем же кодом уже есть, вставка ничего не делает, а её префиксы
 * падают на внешнем ключе. Поэтому фикстура -- третий файл, для базы без
 * выгрузки.
 */
const GEO = ["ip_countries", "ip_country_addresses", "ip_asns", "ip_asn_addresses"];

/* Таблицы, которых в стенде нет вовсе: они целиком поставочные. */
const SHIPPED_WHOLE = [
  "rule_set_files",
  "rule_sets",
  "rule_files",
  "content_types",
  "log_formats",
  "body_stores",
  "counter_shared",
  "deny_responses",
  "waf_schema_log",
];

/*
 * Приведение поставочных строк к тому, что считает поставкой код.
 *
 * Сиды подсистем (044, 050, 054, 057) и стендовый 017 переписали default под
 * свои демонстрации: у капчи в документе оказался виджет с порогами, у профиля
 * адреса -- описание «office + bot-a». Панель сверяет default с
 * controller/src/default-profile.ts и на свежей установке сразу говорила бы
 * «профиль отличается от поставки». Здесь default возвращается к образцу.
 *
 * Тексты -- слово в слово из DEFAULT_DOC_BASELINE и DEFAULT_IP_BASELINE.
 */
const NORMALIZE = `
begin;

update public.auth_profiles    set description = 'Профиль по умолчанию', doc = '{}'::jsonb where name = 'default';
update public.captcha_profiles set description = 'Профиль по умолчанию', doc = '{}'::jsonb, server_id = null where name = 'default';
update public.json_profiles    set description = 'Профиль по умолчанию', doc = '{}'::jsonb where name = 'default';
update public.counter_profiles set description = 'Профиль по умолчанию', doc = '{}'::jsonb where name = 'default';
update public.action_profiles  set description = 'Профиль по умолчанию', doc = '{}'::jsonb where name = 'default';
update public.rewrite_profiles set description = 'Профиль по умолчанию', doc = '{}'::jsonb where name = 'default';
update public.vlai_profiles    set description = 'Профиль по умолчанию', doc = '{}'::jsonb where name = 'default';

update public.ip_profiles set
    description    = 'Профиль по умолчанию: без правил, иначе allow',
    default_action = 'allow',
    default_code   = '',
    outcomes       = '[]'::jsonb
  where name = 'default';

/*
 * Граф waf_inspector -- это чья-то конфигурация, а не поставка: он называет,
 * какие объявления с какими таймаутами стоят в http {}. Каталог процессов
 * (таблица inspectors) остаётся, граф уезжает в стенд.
 */
update public.http_spaces set waf = jsonb_build_object('inspectors', '{}'::jsonb);

commit;
`;

/* Наборы, активные на стенде, поставка держит пустыми и выключенными. */
const NL = String.fromCharCode(10);

const run = (cmd, args, opts = {}) =>
  new Promise((ok, fail) => {
    execFile(cmd, args, { maxBuffer: 512 * 1024 * 1024, ...opts }, (err, out, errOut) => {
      if (err) {
        fail(new Error(`${cmd} ${args.slice(0, 3).join(" ")}: ${String(errOut || err.message).slice(0, 400)}`));
        return;
      }
      ok(out);
    });
  });

const docker = (args) => run("docker", args);
const psql = (db, sql) => docker(["exec", "-i", BOX, "psql", "-v", "ON_ERROR_STOP=1", "-U", "waf", "-d", db, "-tAc", sql]);
const say = (m) => process.stdout.write(`${m}${NL}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- одноразовая база ----------------------------------------------------- */

/*
 * Том поднимается пустым, initdb катает архив миграций. Готовность ловится по
 * строке entrypoint, а не по psql: сокет отвечает уже посреди наката, и дамп
 * снялся бы с половины схемы.
 */
async function boot() {
  await docker(["rm", "-f", BOX]).catch(() => {});
  await docker([
    "run", "-d", "--name", BOX,
    "-e", "POSTGRES_USER=waf",
    "-e", "POSTGRES_PASSWORD=waf",
    "-e", "POSTGRES_DB=waf",
    "-v", `${MIGRATIONS}:/docker-entrypoint-initdb.d:ro`,
    IMAGE,
  ]);

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).length;
  say(`одноразовый postgres поднят, катаю ${files} миграций`);

  const until = Date.now() + 900_000;

  for (;;) {
    const log = await docker(["logs", BOX]).catch(() => "");

    if (log.includes("init process complete")) break;

    const failed = log.match(/^psql:.*(ERROR|FATAL).*$/mu);

    if (failed) throw new Error(`накат сорвался: ${failed[0]}`);
    if (Date.now() > until) throw new Error("миграции не накатились за 15 минут");

    await sleep(3000);
  }

  say("миграции накатаны");
}

/* --- порядок таблиц ------------------------------------------------------- */

/*
 * Данные печатаются в порядке зависимостей: родитель раньше ребёнка. pg_dump
 * этого не обещает (для --data-only он сортирует по имени), а отключать
 * триггеры на клиентской установке нечем -- там не обязательно суперпользователь.
 */
async function tableOrder() {
  const tables = (await psql("waf", `
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by c.relname`))
    .split(NL).map((s) => s.trim()).filter(Boolean);

  const edges = (await psql("waf", `
    select c.conrelid::regclass::text || ' ' || c.confrelid::regclass::text
      from pg_constraint c where c.contype = 'f' and c.conrelid <> c.confrelid`))
    .split(NL).map((s) => s.trim()).filter(Boolean)
    .map((l) => l.split(" ").map((t) => t.replace(/^public\./u, "")));

  const parents = new Map(tables.map((t) => [t, new Set()]));

  for (const [child, parent] of edges) parents.get(child)?.add(parent);

  const done = new Set();
  const order = [];

  while (order.length < tables.length) {
    const next = tables.filter((t) => !done.has(t) && [...parents.get(t)].every((p) => done.has(p)));

    if (next.length === 0) throw new Error("цикл во внешних ключах");

    for (const t of next) {
      done.add(t);
      order.push(t);
    }
  }

  return order;
}

/* --- дамп ----------------------------------------------------------------- */

const TAIL = "ON CONFLICT DO NOTHING;";

/*
 * Строки одной таблицы печатаются отсортированными. pg_dump отдаёт их в порядке
 * heap -- он меняется от пересборки к пересборке, и файл диффился бы целиком.
 *
 * Оператор собирается до хвоста `${TAIL}`, а не по строкам: в conf инспектора
 * лежит текст с переводами строк, и построчная сортировка растащила бы вставку
 * по файлу. Всё, что вне операторов (SET, \\restrict, комментарии дампа), --
 * отбрасывается: шапку пишет этот скрипт.
 */
async function dumpRows(db, table, spaceId) {
  const out = await docker([
    "exec", BOX, "pg_dump", "-U", "waf", "-d", db,
    "--data-only", "--column-inserts", "--on-conflict-do-nothing",
    "--no-owner", "--no-privileges", "--table", `public.${table}`,
  ]);

  /* Сама строка пространства -- единственная, где uuid остаётся литералом. */
  const space = table === "http_spaces"
    ? `'${SPACE_ID}'`
    : `(select id from public.http_spaces where name = '${SPACE}')`;

  const rows = [];
  let statement = [];

  for (const line of out.split(NL)) {
    if (statement.length === 0 && !line.startsWith("INSERT INTO ")) continue;

    statement.push(line.trimEnd());

    if (!line.trimEnd().endsWith(TAIL)) continue;

    rows.push(statement.join(NL).replaceAll(`'${spaceId}'`, space));
    statement = [];
  }

  if (statement.length > 0) throw new Error(`${table}: дамп оборвался посреди вставки`);

  return rows.sort();
}

/* --- сборка --------------------------------------------------------------- */

async function main() {
  await boot();

  const spaceId = (await psql("waf", `select id from public.http_spaces where name = '${SPACE}'`)).trim();

  /*
   * Журнал применённых миграций заводится здесь, а не предполётом e2e: он --
   * часть поставки. baseline приходит с отметками обо всех файлах архива, и
   * следующая миграция (100 и дальше) ложится поверх без вопросов о том, где
   * база остановилась.
   */
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

  await psql("waf", `
    create table if not exists public.waf_schema_log (
        file       text primary key,
        applied_at timestamptz not null default now());
    insert into public.waf_schema_log (file) values
      ${files.map((f) => `('${f}')`).join(", ")}
      on conflict do nothing;`);

  /* Поставка -- копия базы, из которой вычищено всё стендовое. */
  await psql("postgres", "drop database if exists shipped");
  await psql("postgres", "create database shipped template waf");
  await psql("shipped", NORMALIZE);

  const order = await tableOrder();

  const cuts = [...order].reverse().map((t) => {
    const keep = SHIPPED[t];

    if (keep === undefined) return `delete from public.${t};`;
    if (keep === "true") return null;

    return `delete from public.${t} where not (${keep});`;
  }).filter(Boolean);

  await psql("shipped", `begin;${NL}${cuts.join(NL)}${NL}commit;`);
  say("поставочная копия вычищена");

  /*
   * Стенд -- та же база, из которой вычищено всё поставочное. Наборы уходят
   * раньше справочника типов: на content_types смотрит datasets.content_type_id.
   */
  await psql("waf", `begin;
    delete from public.datasets where builtin or name in ('captcha_page', 'login_form');
    delete from public.inspectors where description <> '';
    ${SHIPPED_WHOLE.map((t) => `delete from public.${t};`).join(NL)}${NL}commit;`);
  say("стендовая копия вычищена");

  await writeStructure(spaceId);
  await writeShipped(order, spaceId);
  await writeStand(order, spaceId);

  await docker(["rm", "-f", BOX]);
  say("готово");
}

async function writeStructure(spaceId) {
  const dump = await docker([
    "exec", BOX, "pg_dump", "-U", "waf", "-d", "shipped",
    "--schema-only", "--no-owner", "--no-privileges",
  ]);

  const body = dump.split(NL)
    .filter((l) => !/^\\(restrict|unrestrict)/u.test(l))
    .join(NL)
    .replace(/\n{3,}/gu, `${NL}${NL}`);

  const head = `--
-- Поставочная структура Placitum ${VERSION}.
--
-- Машинный снимок: pg_dump со схемы, прокатанной архивом controller/schema/migrations.
-- Правок руками не держит -- пересобирается скриптом build/baseline.mjs. Проза о
-- том, почему таблицы такие, живёт в самих миграциях: 001_init.sql -- модель
-- конфигурации nginx, дальше по номерам.
--
-- Едет из initdb.d первым файлом, только на пустой том. Данные -- следом,
-- в 02-shipped.sql. Всё, что новее ${VERSION}, приезжает миграциями из
-- migrations/ поверх: журнал применённых (waf_schema_log) приходит заполненным.
--
`;

  await writeFile(join(SCHEMA, "01-baseline.sql"), head + body, "utf8");
  say(`01-baseline.sql: ${(head + body).split(NL).length} строк`);
}

async function writeShipped(order, spaceId) {
  const parts = [];

  /* Пространство раньше всего: на него смотрит каждая следующая вставка. */
  for (const table of ["http_spaces", ...order.filter((t) => t !== "http_spaces")]) {
    if (SHIPPED[table] === undefined || table === "waf_schema_log") continue;

    const rows = await dumpRows("shipped", table, spaceId);

    if (rows.length === 0) continue;

    parts.push(`-- ${table}: ${rows.length}`);
    parts.push(...rows);
    parts.push("");
  }

  /*
   * Журнал печатается руками, а не дампом: в нём важны имена файлов, а не
   * время, в которое их накатил сборщик.
   */
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

  parts.push(`-- waf_schema_log: ${files.length}`);
  parts.push("INSERT INTO public.waf_schema_log (file) VALUES");
  parts.push(files.map((f) => `    ('${f}')`).join(`,${NL}`));
  parts.push("    ON CONFLICT DO NOTHING;");
  parts.push("");

  const head = `--
-- Поставочные данные Placitum ${VERSION}: с чем установка поднимается на пустом томе.
--
-- Что здесь есть: пространство http, справочник типов содержимого, формат
-- журнала, обменник тел, каталог отказов, страницы отказа и две заготовки
-- (виджет капчи, форма входа), пресеты списков адресов, CRS с наборами правил,
-- каталог процессов-инспекторов и неуничтожимый default каждой подсистемы.
--
-- Чего здесь нет: серверов, путей, апстримов, сертификатов, чьих-то списков
-- адресов и объявлений инспекторов. Пустая установка не слушает ничего --
-- конфигурацию заводит оператор. Стендовое дерево лежит в stand/stand.sql.
--
-- Файл машинный, пересобирается build/baseline.mjs. Пространство везде ищется
-- по имени '${SPACE}', а не по uuid: файл переживает базу, заведённую раньше.
--
`;

  const body = `${head}${NL}${parts.join(NL)}${NL}`;

  await writeFile(join(SCHEMA, "02-shipped.sql"), body, "utf8");
  say(`02-shipped.sql: ${body.split(NL).length} строк`);
}

/*
 * Строки default и _probe подсистемы, без служебных полей: по ним считается,
 * чем стендовая демонстрация отличается от поставочного образца.
 */
async function profileRows(db, table) {
  const out = await psql(db, `
    select (to_jsonb(t) - 'id' - 'created_at' - 'updated_at' - 'http_space_id')::text
      from public.${table} t where t.name in ('default', '_probe') order by t.name`);

  return new Map(out.split(NL).filter(Boolean).map((line) => {
    const row = JSON.parse(line);

    return [row.name, row];
  }));
}

async function columnTypes(table) {
  const out = await psql("waf", `
    select column_name || ' ' || data_type from information_schema.columns
     where table_schema = 'public' and table_name = '${table}'`);

  return new Map(out.split(NL).filter(Boolean).map((l) => l.trim().split(" ")));
}

/* Значение строки таблицы в виде литерала SQL: тип берётся из каталога. */
function literal(value, type) {
  if (value === null || value === undefined) return "null";
  if (type === "jsonb" || type === "json") return `'${JSON.stringify(value).replaceAll("'", "''")}'::${type}`;
  if (typeof value === "boolean" || typeof value === "number") return String(value);

  return `'${String(value).replaceAll("'", "''")}'${type === "uuid" ? "::uuid" : ""}`;
}

async function writeStand(order, spaceId) {
  const parts = [];

  /* Граф инспекторов и демонстрационные default-профили -- правка, не вставка. */
  const graph = (await psql("waf", "select waf::text from public.http_spaces")).trim();

  parts.push("-- граф объявлений http {}: чем стенд отличается от пустой поставки");
  parts.push(`update public.http_spaces set waf = '${graph.replaceAll("'", "''")}'::jsonb`);
  parts.push(`  where name = '${SPACE}';`);
  parts.push("");

  const drifted = [];

  for (const table of ["auth_profiles", "captcha_profiles", "json_profiles", "counter_profiles",
    "action_profiles", "rewrite_profiles", "vlai_profiles", "cookie_profiles", "ip_profiles"]) {
    const now = await profileRows("waf", table);
    const base = await profileRows("shipped", table);
    const types = await columnTypes(table);

    for (const [name, row] of now) {
      const was = base.get(name);

      if (was === undefined) continue;

      const changed = Object.keys(row).filter((k) => JSON.stringify(row[k]) !== JSON.stringify(was[k]));

      if (changed.length === 0) continue;

      const sets = changed.map((k) => `${k} = ${literal(row[k], types.get(k))}`);

      drifted.push(`update public.${table} set ${sets.join(", ")}${NL}`
        + `  where name = '${name}' and http_space_id = (select id from public.http_spaces where name = '${SPACE}');`);
    }
  }

  if (drifted.length > 0) {
    parts.push("-- профили default, переписанные стендом под демонстрацию");
    parts.push(...drifted);
    parts.push("");
  }

  const geo = [];

  for (const table of order) {
    if (table === "http_spaces") continue;

    const rows = await dumpRows("waf", table, spaceId);

    if (rows.length === 0) continue;

    const into = GEO.includes(table) ? geo : parts;

    into.push(`-- ${table}: ${rows.length}`);
    into.push(...rows);
    into.push("");
  }

  await mkdir(STAND_DIR, { recursive: true });
  await writeGeoFixture(geo);

  const head = `--
-- Стенд Placitum: дерево, с которого живёт deploy/docker-compose.yml.
--
-- Это не поставка и не пример в документации: те же серверы, пути, апстримы и
-- списки, что раньше приезжали сидами 011, 017, 018, 024, 041, 042, 045, 051,
-- 070, 072 и 074. Клиенту они не едут -- initdb.d читает только верхний уровень
-- controller/schema, а этот файл лежит в подкаталоге.
--
-- Кто катает: предполёт e2e (tests/lib/bootstrap.mjs) после пересоздания тома.
-- Руками -- psql -f /docker-entrypoint-initdb.d/stand/stand.sql изнутри
-- контейнера postgres.
--
-- Идемпотентен: вставки с on conflict do nothing, правки -- по имени. Ложится
-- поверх 02-shipped.sql, отдельно от него не применяется.
--
`;

  const body = `${head}${NL}${parts.join(NL)}${NL}`;

  await writeFile(join(STAND_DIR, "stand.sql"), body, "utf8");
  say(`stand/stand.sql: ${body.split(NL).length} строк`);
}

/*
 * Три выдуманные страны из 011 и 014 -- для базы, которой не досталось выгрузки
 * MaxMind (schema/seed пуст: дампы не в git, лицензия и размер).
 */
async function writeGeoFixture(rows) {
  if (rows.length === 0) return;

  const head = `--
-- Тестовое гео стенда: страны «Тестовая выгрузка» по фикстуре
-- deploy/ip/data/geo.
--
-- Нужно только базе без выгрузки MaxMind. Если 03-geo.sh нашёл дампы в
-- schema/seed, этот файл катать не надо и нельзя: страна с тем же кодом уже
-- заведена настоящая, вставка пройдёт мимо, а префиксы упадут на внешнем ключе.
--
-- Кода 'en' в ISO нет, и в выгрузке MaxMind его тоже нет: на стенде с полным
-- гео эта страна остаётся единственной тестовой.
--
`;

  await writeFile(join(STAND_DIR, "geo-test.sql"), `${head}${NL}${rows.join(NL)}${NL}`, "utf8");
  say(`stand/geo-test.sql: ${rows.length} строк`);
}

await main();
