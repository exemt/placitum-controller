import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { DEFAULT_RULE_SET_BASELINE } from "./default-profile.ts";
import { ruleSetsRouter } from "./rule-sets-http.ts";
import type { RuleSetRepo } from "./rule-sets.ts";
import { normalizePolicy } from "./modsec-policy-doc.ts";
import type { RuleSet } from "./model/rule-set.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const STRICT = "3f2a9c1e-4b2a-41c0-8f3a-000000000051";
const DEFAULT = "3f2a9c1e-4b2a-41c0-8f3a-000000000052";
const NOW = new Date("2026-08-17T12:00:00.000Z");

const strict: RuleSet = {
  id: STRICT,
  httpSpaceId: SCOPE,
  name: "strict",
  description: "",
  files: [],
  data: [],
  policy: normalizePolicy(null),
  createdAt: NOW,
  updatedAt: NOW,
};

/*
 * Профиль держат объявления реестра: `profile=` и неявный default. Каталог
 * нужен, чтобы объявление modsec разворачивалось в подсистему modsec.
 */
/*
 * Каталог файлов правил: восстановление default ищет поставочный состав по
 * именам, поэтому его состояние -- часть стенда, а не деталь.
 */
function ruleFileCatalog(names: readonly string[]) {
  return names.map((name, i) => ({
    id: `3f2a9c1e-4b2a-41c0-8f3a-0000000001${String(i).padStart(2, "0")}`,
    httpSpaceId: SCOPE,
    name,
    description: "",
    createdAt: NOW,
    updatedAt: NOW,
  }));
}

function stateWith(
  space: unknown = {},
  catalog = ruleFileCatalog(DEFAULT_RULE_SET_BASELINE.files),
): () => RootState {
  return () =>
    ({
      ruleSets: {
        ids: [STRICT, DEFAULT],
        entities: {
          [STRICT]: {
            id: STRICT,
            httpSpaceId: SCOPE,
            name: "strict",
            description: "",
            files: 0,
            createdAt: NOW,
            updatedAt: NOW,
          },
          [DEFAULT]: {
            id: DEFAULT,
            httpSpaceId: SCOPE,
            name: "default",
            description: "",
            files: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
        },
      },
      ruleFiles: {
        ids: catalog.map((file) => file.id),
        entities: Object.fromEntries(catalog.map((file) => [file.id, file])),
      },
      inspectors: {
        ids: ["ins-1"],
        entities: {
          "ins-1": {
            id: "ins-1",
            httpSpaceId: SCOPE,
            name: "modsec",
            subject: "waf.req.modsec",
            phases: ["request"],
          },
        },
      },
      spaces: {
        ids: [SCOPE],
        entities: { [SCOPE]: { id: SCOPE, name: "default", waf: space } },
      },
      servers: { ids: [], entities: {} },
      locations: { ids: [], entities: {} },
    }) as unknown as RootState;
}

async function withApp(
  state: () => RootState,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/:scopeUuid/rule-sets",
    ruleSetsRouter(
      ((() => ({
        unwrap: async () => strict,
      })) as unknown) as AppDispatch,
      state,
      {
        get: async (id: string) => (id === STRICT ? strict : null),
        senderCodes: async () => [
          { code: "IP_GREYLIST", by: [{ inspector: "ip", profile: "default" }] },
        ],
      } as unknown as RuleSetRepo,
    ),
  );

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");
  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("DELETE снимает профиль, которого никто не зовёт", async () => {
  await withApp(stateWith(), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-sets/${STRICT}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { uuid: string; name: string };
    assert.equal(body.uuid, STRICT);
    assert.equal(body.name, "strict");
  });
});

test("DELETE отказывает default: манифест без него не собирается", async () => {
  await withApp(stateWith(), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-sets/${DEFAULT}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "default_required" });
  });
});

test("DELETE отказывает, пока профиль назван через profile=", async () => {
  await withApp(
    stateWith({ inspectors: { modsec: { profile: "strict" } } }),
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/rule-sets/${STRICT}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 409);
      const body = (await res.json()) as {
        error: string;
        uses: { at: string; kind: string; by?: string }[];
      };
      assert.equal(body.error, "in_use");
      assert.deepEqual(body.uses, [
        { at: "space", kind: "profile", by: "modsec" },
      ]);
    },
  );
});

/*
 * У default заперто имя, а не содержимое: объявление без profile= ищет набор
 * по имени, переименование равносильно удалению. Всё остальное правится --
 * default здесь рабочий состав пространства, а не запертый образец.
 */
test("PUT не переименовывает default, но правит его", async () => {
  await withApp(stateWith(), async (base) => {
    const renamed = await fetch(`${base}/api/${SCOPE}/rule-sets/${DEFAULT}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "renamed" }),
    });
    assert.equal(renamed.status, 400);
    assert.deepEqual(await renamed.json(), { error: "default_name_locked" });

    const touched = await fetch(`${base}/api/${SCOPE}/rule-sets/${DEFAULT}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "своё описание" }),
    });
    // Строку возвращает заглушка dispatch, поэтому проверяем сам исход записи.
    assert.equal(touched.status, 200);
  });
});

/*
 * Восстановление возвращает default к составу из сида. Своего профиля оно не
 * касается: он не приходил из поставки, и «как было» у него нет.
 */
test("restore не трогает свой набор", async () => {
  await withApp(stateWith(), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-sets/${STRICT}/restore`, {
      method: "POST",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "not_default" });
  });
});

test("restore возвращает default к поставке", async () => {
  await withApp(stateWith(), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-sets/${DEFAULT}/restore`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { missing_files: string[] };
    assert.deepEqual(body.missing_files, []);
  });
});

/*
 * Каталог без поставочных файлов: пустой состав уронил бы рендер манифеста,
 * поэтому отказ, а не тихая запись.
 */
test("restore отказывает, когда поставочных файлов не осталось", async () => {
  await withApp(stateWith({}, []), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-sets/${DEFAULT}/restore`, {
      method: "POST",
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: string; detail: string };
    assert.equal(body.error, "baseline_files_gone");
    assert.ok(body.detail.includes("engine"));
  });
});

test("DELETE неизвестного профиля -- 404", async () => {
  await withApp(stateWith(), async (base) => {
    const res = await fetch(
      `${base}/api/${SCOPE}/rule-sets/3f2a9c1e-4b2a-41c0-8f3a-0000000000ff`,
      { method: "DELETE" },
    );
    assert.equal(res.status, 404);
  });
});

/*
 * Подсказка поля поводов приезжает с карточкой: правила приёма modsec живут в
 * той же политике, и без неё оператор набирал бы повод соседа по памяти.
 */
test("карточка набора несёт sender_codes", async () => {
  await withApp(stateWith(), async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-sets/${STRICT}`);

    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      sender_codes: { code: string; by: { inspector: string; profile: string }[] }[];
    };

    assert.deepEqual(body.sender_codes, [
      { code: "IP_GREYLIST", by: [{ inspector: "ip", profile: "default" }] },
    ]);
  });
});
