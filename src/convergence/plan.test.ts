/**
 * План и рассылка обязаны давать один хеш.
 *
 * Это единственная проверка, ради которой компиляторы вообще разрезаны надвое:
 * сверка «сохранённое против изданного» зовёт `plan`, а `send` -- `plan` и
 * следом публикацию. Разъедься они -- и панель будет врать в одну сторону,
 * а флот работать в другую. Ровно так уже случилось с превью конфига, у
 * которого был свой компилятор (ux/src/config/PreviewDock.tsx).
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { NginxCompiler, RulesCompiler } from "../compile.ts";
import type { NginxExport } from "../compile/nginx.ts";
import { fixedInspectorSettings } from "../inspector-settings.ts";
import { NGINX_MAX_DATASETS } from "../model/http-space.ts";
import type { RuleFileRepo } from "../rule-files.ts";
import type { RuleSetRepo } from "../rule-sets.ts";
import type { StoreRepo } from "../store.ts";

const SPACE = "00000000-0000-4000-8000-000000000001";
const CERT = "00000000-0000-4000-8000-0000000000c1";
const FILE_A = "00000000-0000-4000-8000-00000000000a";
const FILE_B = "00000000-0000-4000-8000-00000000000b";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "waf-plan-"));
  roots.push(dir);
  return dir;
}

/* --- nginx --------------------------------------------------------------- */

function space(): NginxExport["space"] {
  return {
    id: SPACE,
    name: "default",
    nginxMain: {},
    nginx: { sendfile: true },
    wafHttp: {},
    waf: {},
    raw: false,
    rawNginx: "",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function nginxSource(): NginxExport {
  return {
    space: space(),
    inspectors: [],
    datasets: [],
    denyResponses: [],
    bodyStores: [],
    logFormats: [],
    upstreams: [],
    ports: [],
    certificates: [],
    servers: [],
    contentObjects: [],
  };
}

function fakeStore(): StoreRepo {
  return {
    async get(uuid: string) {
      return { id: uuid, type: "certificate", blob: Buffer.from(`cipher:${uuid}`) };
    },
  } as unknown as StoreRepo;
}

test("nginx: план и рассылка считают один хеш", async () => {
  const compiler = new NginxCompiler(fakeStore());
  const source = nginxSource();

  const planned = await compiler.plan(source);
  const compiled = await compiler.compile(source);

  assert.notEqual(planned.sha256, "");
  assert.equal(planned.sha256, compiled.sha256);
});

test("nginx: план повторяется байт в байт", async () => {
  const compiler = new NginxCompiler(fakeStore());

  const one = await compiler.plan(nginxSource());
  const two = await compiler.plan(nginxSource());

  assert.equal(one.sha256, two.sha256);
});

test("nginx: правка шаблона двигает хеш", async () => {
  const compiler = new NginxCompiler(fakeStore());
  const other = nginxSource();
  other.space.nginx = { sendfile: false };

  const one = await compiler.plan(nginxSource());
  const two = await compiler.plan(other);

  assert.notEqual(one.sha256, two.sha256);
});

test("nginx: несобираемый шаблон не даёт хеша, а называет причину", async () => {
  const compiler = new NginxCompiler(fakeStore());
  const source = nginxSource();
  source.space.waf = { inspectors: { nosuch: {} } };

  // Незаконченная правка -- нормальное состояние формы: план обязан вернуться
  // с причиной, а не улететь исключением в 500.
  const planned = await compiler.plan(source);

  assert.equal(planned.sha256, "");
  assert.ok(planned.errors.length > 0);
  assert.equal(planned.errors[0].code, "unknown_inspector");
});

test("nginx: наборов сверх предела модуля -- причина в плане, а не исключение", async () => {
  const compiler = new NginxCompiler(fakeStore());
  const source = nginxSource();
  // Без зоны план споткнётся раньше: локальный слой требует waf_shm_zone.
  source.space.wafHttp = { shmZone: { name: "waf", size: "32m" } };
  source.datasets = Array.from(
    { length: NGINX_MAX_DATASETS + 1 },
    (_, i): NginxExport["datasets"][number] => ({
      id: `ds${i}`,
      httpSpaceId: SPACE,
      name: `ds${i}`,
      description: "",
      kind: "list",
      type: "ip",
      maxEntries: 16,
      inNginx: true,
      active: false,
      size: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }),
  );

  // По этому списку `send` отвечает 422, а сверка показывает «не собирается».
  const planned = await compiler.plan(source);

  assert.equal(planned.sha256, "");
  assert.equal(planned.errors.length, 1);
  assert.equal(planned.errors[0].code, "datasets_too_many");
  assert.deepEqual(planned.errors[0].params, {
    count: NGINX_MAX_DATASETS + 1,
    limit: NGINX_MAX_DATASETS,
  });
});

/* --- правила ------------------------------------------------------------- */

function fakeSets(text: string): RuleSetRepo {
  return {
    async exportCompile() {
      return {
        files: [
          { id: FILE_A, name: "00-engine.conf", text: "SecRuleEngine On\n" },
          { id: FILE_B, name: "30-policy.conf", text },
        ],
        profiles: [{ name: "default", files: [FILE_A, FILE_B] }],
      };
    },
  } as unknown as RuleSetRepo;
}

test("правила: план и рассылка считают один хеш", async () => {
  const root = await tempRoot();
  const compiler = new RulesCompiler(
    root,
    {} as RuleFileRepo,
    fakeSets("SecRule ARGS \"@contains x\" \"id:1,phase:2,deny\"\n"),
    fixedInspectorSettings(),
  );

  const planned = await compiler.plan(SPACE);
  const compiled = await compiler.compile(SPACE);

  assert.equal(planned.sha256, compiled.sha256);
  assert.deepEqual(planned.profiles, ["default"]);
});

test("правила: правка текста двигает хеш, повтор -- нет", async () => {
  const root = await tempRoot();
  const settings = fixedInspectorSettings();
  const one = new RulesCompiler(root, {} as RuleFileRepo, fakeSets("A\n"), settings);
  const two = new RulesCompiler(root, {} as RuleFileRepo, fakeSets("B\n"), settings);

  const a1 = await one.plan(SPACE);
  const a2 = await one.plan(SPACE);
  const b = await two.plan(SPACE);

  assert.equal(a1.sha256, a2.sha256);
  assert.notEqual(a1.sha256, b.sha256);
});

test("правила: уровень журнала процесса двигает хеш пака", async () => {
  // Уровень едет в поколении и входит в канон: иначе «Разослать» после
  // правки каталога ничего бы не изменило, а флот остался бы на прежнем.
  const root = await tempRoot();
  const info = new RulesCompiler(root, {} as RuleFileRepo, fakeSets("A\n"),
    fixedInspectorSettings({ log_level: "info" }));
  const warn = new RulesCompiler(root, {} as RuleFileRepo, fakeSets("A\n"),
    fixedInspectorSettings({ log_level: "warn" }));

  const a = await info.plan(SPACE);
  const b = await warn.plan(SPACE);

  assert.notEqual(a.sha256, b.sha256);
  assert.deepEqual(b.packed.settings, { log_level: "warn" });
});

/* --- межканальное -------------------------------------------------------- */

test("план nginx достаёт из шаблона теги profile=", async () => {
  const compiler = new NginxCompiler(fakeStore());
  const source = nginxSource();
  source.infra = { natsUrl: "nats://nats:4222" };
  source.inspectors = [
    { name: "modsec", subject: "waf.req.modsec" },
  ] as unknown as NginxExport["inspectors"];
  source.space.waf = { inspectors: { modsec: { profile: "shop" } } };

  const planned = await compiler.plan(source);

  assert.equal(planned.requires.get("modsec"), "shop");
});

test("store: подмена шифротекста меняет хеш дерева", async () => {
  // Шифротекст входит в хеш дерева: замена файла обязана выглядеть новым
  // поколением, иначе нода не заметит подмену сертификата.
  const source = nginxSource();
  source.space.rawNginx = `ssl_certificate store:${CERT};\n`;
  source.space.raw = true;
  source.certificates = [
    { certStoreId: CERT },
  ] as unknown as NginxExport["certificates"];

  const one = await new NginxCompiler(fakeStore()).plan(source);
  const two = await new NginxCompiler({
    async get(uuid: string) {
      return { id: uuid, type: "certificate", blob: Buffer.from("other") };
    },
  } as unknown as StoreRepo).plan(source);

  assert.notEqual(one.sha256, "");
  assert.notEqual(one.sha256, two.sha256);
});
