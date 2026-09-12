import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { inspectorsRouter } from "./inspectors-http.ts";
import type { Inspector } from "./model/http-space.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const ID = "3f2a9c1e-4b2a-41c0-8f3a-0000000000f1";

const row: Inspector = {
  id: ID,
  httpSpaceId: SCOPE,
  name: "modsec",
  subject: "waf.req.modsec",
  phases: ["request"],
  conf: "queue_max 16;\n",
  position: 10,
};

/*
 * Реестр живёт не в каталоге, а в `*.waf.inspectors` пространства, сервера и
 * пути -- их DELETE и опрашивает. Пустые секции здесь не украшение: без них
 * обработчик снял бы запись, на которую кто-то ссылается.
 */
interface Refs {
  space?: unknown;
  servers?: unknown[];
  locations?: unknown[];
}

function getStateWith(refs: Refs = {}): () => RootState {
  return () =>
    ({
      inspectors: {
        ids: [ID],
        entities: {
          [ID]: {
            id: ID,
            httpSpaceId: SCOPE,
            name: row.name,
            subject: row.subject,
            phases: row.phases,
            position: 10,
          },
        },
      },
      spaces: {
        ids: [SCOPE],
        entities: {
          [SCOPE]: { id: SCOPE, name: "default", waf: refs.space ?? {} },
        },
      },
      servers: {
        ids: (refs.servers ?? []).map((_, i) => `srv-${i}`),
        entities: Object.fromEntries(
          (refs.servers ?? []).map((waf, i) => [
            `srv-${i}`,
            { id: `srv-${i}`, httpSpaceId: SCOPE, name: `web-${i}`, waf },
          ]),
        ),
      },
      locations: {
        ids: (refs.locations ?? []).map((_, i) => `loc-${i}`),
        entities: Object.fromEntries(
          (refs.locations ?? []).map((waf, i) => [
            `loc-${i}`,
            { id: `loc-${i}`, httpSpaceId: SCOPE, path: `/p${i}/`, waf },
          ]),
        ),
      },
    }) as unknown as RootState;
}

const getState = getStateWith();

async function withApp(
  run: (base: string) => Promise<void>,
  state: () => RootState = getState,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/:scopeUuid/inspectors",
    inspectorsRouter(
      /*
       * Поддельный dispatch: не async -- обработчик зовёт .unwrap() на
       * результате, а у промиса его нет. Разбор запроса при этом проверяется
       * целиком, а сохранение -- дело репозитория и его собственных тестов.
       */
      ((action: unknown) => {
        const type = (action as { type?: string }).type ?? "";
        if (type.endsWith("/rejected")) {
          throw { status: 409, error: "name_taken" };
        }
        return {
          unwrap: async () => row,
        };
      }) as unknown as AppDispatch,
      state,
      {
        get: async (id: string) => (id === ID ? row : null),
      } as never,
    ),
  );

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("GET /inspectors lists catalog meta", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/inspectors`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { inspectors: { name: string; subject: string }[] };
    assert.deepEqual(body.inspectors, [
      {
        uuid: ID,
        http_space_id: SCOPE,
        name: "modsec",
        subject: "waf.req.modsec",
        phases: ["request"],
        description: "",
        docs_url: "",
        // Снимок без колонки -- строка с умолчанием: уровень всегда в ответе.
        log_level: "info",
        position: 10,
      },
    ]);
  });
});

/*
 * Объявленные инспекторы: то, к чему маршрут вправе привязаться. Имя со
 * ссылкой `process` разворачивается темой и фазами процесса; объявление без
 * процесса за ним не прячется -- `known=false`, сборка на нём падает.
 */
test("GET /inspectors/declared разворачивает объявления через процесс", async () => {
  await withApp(
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/inspectors/declared`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        declared: [
          {
            name: "modsec",
            process: "modsec",
            subject: "waf.req.modsec",
            phases: ["request"],
            profile: "default",
            known: true,
          },
          {
            name: "modsec-strict",
            process: "modsec",
            subject: "waf.req.modsec",
            phases: ["request"],
            profile: "strict",
            known: true,
          },
          {
            name: "ghost2",
            process: "nope",
            subject: null,
            phases: [],
            profile: "default",
            known: false,
          },
        ],
      });
    },
    getStateWith({
      space: {
        inspectors: {
          modsec: {},
          "modsec-strict": { process: "modsec", profile: "strict" },
          ghost2: { process: "nope" },
        },
      },
    }),
  );
});

test("GET /inspectors/:uuid returns conf", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/inspectors/${ID}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { conf: string; subject: string };
    assert.equal(body.subject, "waf.req.modsec");
    assert.equal(body.conf, "queue_max 16;\n");
  });
});

/*
 * Фазы -- набор: процесс, ведущий обе стороны, объявляется один раз, а не
 * двумя именами на одну тему.
 */
test("POST принимает набор фаз", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/inspectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "modsec",
        subject: "waf.req.modsec",
        phases: ["response", "request"],
      }),
    });

    assert.equal(res.status, 201);
  });
});

// Одиночное phase= остаётся понятным: им пользуются записи, заведённые до
// того, как у процесса появилось право вести обе стороны.
test("POST принимает одиночное phase как набор из одного", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/inspectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "json",
        subject: "waf.req.json",
        phase: "response",
      }),
    });

    assert.equal(res.status, 201);
  });
});

/*
 * Пустой набор -- ошибка, а не умолчание. Процесс, не умеющий ни одной фазы,
 * никто никогда не позовёт, и подставить за оператора "request" значило бы
 * принять решение, которого он не принимал.
 */
test("POST отвергает пустой набор фаз и неизвестную фазу", async () => {
  await withApp(async (base) => {
    for (const phases of [[], ["request", "trailers"]]) {
      const res = await fetch(`${base}/api/${SCOPE}/inspectors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", subject: "waf.req.x", phases }),
      });

      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "invalid_phase" });
    }
  });
});

test("POST rejects a bad subject", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/inspectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "modsec", subject: "waf req" }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_subject" });
  });
});

test("DELETE снимает запись, на которую никто не ссылается", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/inspectors/${ID}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { uuid: string; name: string };
    assert.equal(body.uuid, ID);
    assert.equal(body.name, "modsec");
  });
});

test("DELETE отказывает, пока имя объявлено в реестре пространства", async () => {
  await withApp(
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/inspectors/${ID}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 409);
      assert.deepEqual(await res.json(), {
        error: "inspector_in_use",
        uses: [{ at: "space", kind: "declared" }],
      });
    },
    getStateWith({ space: { inspectors: { modsec: {} } } }),
  );
});

/*
 * Уборка копии каталога: объявление уехало на `process=`, и запись с тем же
 * именем больше никому не нужна -- ни объявлению, ни вызовам с маршрутов
 * (они идут через объявление). Держит запись только ссылка-процесс.
 */
test("DELETE снимает копию, когда объявление глядит в другой процесс", async () => {
  await withApp(
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/inspectors/${ID}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 200);
    },
    getStateWith({
      // Запись каталога зовётся modsec (см. фикстуру row); объявление modsec
      // слушает другой процесс, маршрут зовёт объявление -- запись свободна.
      space: { inspectors: { modsec: { process: "modsec-next" } } },
      locations: [{ requestInspectors: [{ name: "modsec" }] }],
    }),
  );
});

test("DELETE отказывает, пока запись слушают как процесс", async () => {
  await withApp(
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/inspectors/${ID}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 409);
      assert.deepEqual(await res.json(), {
        error: "inspector_in_use",
        uses: [{ at: "space", kind: "process", by: "modsec-strict" }],
      });
    },
    getStateWith({
      space: { inspectors: { "modsec-strict": { process: "modsec" } } },
    }),
  );
});

test("DELETE отказывает, пока имя зовут с маршрута", async () => {
  await withApp(
    async (base) => {
      const res = await fetch(`${base}/api/${SCOPE}/inspectors/${ID}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 409);
      const body = (await res.json()) as { uses: { at: string; kind: string }[] };
      assert.deepEqual(body.uses, [{ at: "location /p0/", kind: "called" }]);
    },
    getStateWith({ locations: [{ requestInspectors: [{ name: "modsec" }] }] }),
  );
});

test("DELETE неизвестной записи -- 404, а не 409", async () => {
  await withApp(async (base) => {
    const res = await fetch(
      `${base}/api/${SCOPE}/inspectors/3f2a9c1e-4b2a-41c0-8f3a-0000000000ff`,
      { method: "DELETE" },
    );
    assert.equal(res.status, 404);
  });
});
