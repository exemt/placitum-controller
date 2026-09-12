/*
 * API калитки: источники входа и профили.
 *
 * Остальное проверяется на стенде (tests/auth), здесь -- только то, что нельзя
 * увидеть снаружи без подготовки: отказ на адресе формы, которого у сервера
 * нет; адрес, где калитка включена; уникальность формы и кук между
 * источниками; ссылка профиля в пустоту и быстрый путь на закрытом профиле.
 */

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { DocError } from "./auth-doc-util.ts";
import { authRouter } from "./auth-http.ts";
import {
  normalizeDoc,
  renderProfileYaml,
  validateDoc,
} from "./auth-profile-doc.ts";
import type { AuthProfileRepo } from "./auth-profiles.ts";
import { normalizeSourceDoc, renderSourceYaml } from "./auth-source-doc.ts";
import type { AuthSourceRepo } from "./auth-sources.ts";
import type { DesiredStore } from "./desired.ts";
import { fixedInspectorSettings } from "./inspector-settings.ts";
import type { AuthProfile } from "./model/auth-profile.ts";
import type { AuthSource } from "./model/auth-source.ts";
import type { RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const EDGE = "3f2a9c1e-4b2a-41c0-8f3a-0000000000b1";
const OTHER = "3f2a9c1e-4b2a-41c0-8f3a-0000000000b2";
const SOURCE = "3f2a9c1e-4b2a-41c0-8f3a-0000000000a1";
const PROFILE = "3f2a9c1e-4b2a-41c0-8f3a-0000000000c1";

/*
 * Как на стенде: на форме инспекторов не спрашивают, приложение -- под
 * калиткой. Модуль на форме при этом включён (`wafEnabled: true`) -- локальный
 * слой там нужен, и проверка смотрит именно на набор инспекторов.
 */
const LOCATIONS: Record<
  string,
  { path: string; match: string; wafEnabled: boolean; inspected: boolean }[]
> = {
  [EDGE]: [
    // Старая форма: модуль выключен целиком.
    { path: "/waf/login", match: "prefix", wafEnabled: false, inspected: false },
    // Новая: модуль включён ради локального слоя, инспекторов не спрашивают.
    { path: "/waf/login-2", match: "prefix", wafEnabled: true, inspected: false },
    { path: "/app/", match: "prefix", wafEnabled: true, inspected: true },
    { path: "waf_deny", match: "named", wafEnabled: false, inspected: false },
  ],
  [OTHER]: [{ path: "/", match: "prefix", wafEnabled: true, inspected: true }],
};

function sourceDocWith(uri: string): unknown {
  return {
    login: { uri },
    provider: "code",
    providers: { code: { kind: "static", codes: ["$2a$10$stub"] } },
  };
}

function sourceRow(serverId: string | null, uri: string): AuthSource {
  return {
    id: SOURCE,
    httpSpaceId: SCOPE,
    serverId,
    name: "gate",
    description: "",
    provider: "code",
    doc: normalizeSourceDoc(sourceDocWith(uri)),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function profileRow(doc: unknown): AuthProfile {
  const parsed = normalizeDoc(doc);

  return {
    id: PROFILE,
    httpSpaceId: SCOPE,
    name: "gate",
    description: "",
    source: parsed.source,
    doc: parsed,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function fakeSources(state: { source: AuthSource }): AuthSourceRepo {
  return {
    async list() {
      return [state.source];
    },
    async get(id: string) {
      return id === SOURCE ? state.source : null;
    },
    async serverLocations(serverId: string, httpSpaceId: string) {
      if (httpSpaceId !== SCOPE) {
        return null;
      }

      return LOCATIONS[serverId] ?? null;
    },
    async insert(input: { serverId: string | null; doc: unknown }) {
      state.source = {
        ...state.source,
        serverId: input.serverId,
        doc: input.doc,
      } as AuthSource;

      return state.source;
    },
    async update(_id: string, patch: { serverId?: string | null }) {
      if (patch.serverId !== undefined) {
        state.source = { ...state.source, serverId: patch.serverId };
      }

      return state.source;
    },
    async uses() {
      return [];
    },
    async loginPage() {
      return null;
    },
    async usersByName() {
      return [];
    },
  } as unknown as AuthSourceRepo;
}

function fakeProfiles(state: { row: AuthProfile }): AuthProfileRepo {
  return {
    async list() {
      return [state.row];
    },
    async get(id: string) {
      return id === PROFILE ? state.row : null;
    },
    async insert(input: { doc: AuthProfile["doc"] }) {
      state.row = { ...state.row, doc: input.doc };

      return state.row;
    },
    async update() {
      return state.row;
    },
    async inspectorNames() {
      return ["ip", "captcha", "auth"];
    },
    async senderCodes() {
      return [{ code: "IP_GREYLIST", by: [{ inspector: "ip", profile: "default" }] }];
    },
    async denyResponses() {
      return ["auth_required", "auth_forbidden"];
    },
  } as unknown as AuthProfileRepo;
}

/*
 * Пустая модель: DELETE и проверка быстрого пути спрашивают waf-документы трёх
 * уровней, и тесту без маршрутов хватает пустых секций.
 */
function emptyState(): RootState {
  const empty = { ids: [], entities: {} };
  return {
    inspectors: empty,
    spaces: { ids: [SCOPE], entities: { [SCOPE]: { id: SCOPE, name: "default", waf: {} } } },
    servers: empty,
    locations: empty,
  } as unknown as RootState;
}

/*
 * Модель с маршрутом, где вызов закрытого профиля стоит под if-условием:
 * объявление admin-gate ссылается на профиль gate, а строка requestInspectors
 * несёт conds -- ровно та пара, которую нельзя выпустить.
 */
function fastPathState(): RootState {
  const empty = { ids: [], entities: {} };
  return {
    inspectors: {
      ids: ["i1"],
      entities: {
        i1: { id: "i1", httpSpaceId: SCOPE, name: "auth2", subject: "waf.req.auth" },
      },
    },
    spaces: {
      ids: [SCOPE],
      entities: {
        [SCOPE]: {
          id: SCOPE,
          name: "default",
          waf: { inspectors: { "admin-gate": { process: "auth2", profile: "gate" } } },
        },
      },
    },
    servers: empty,
    locations: {
      ids: ["l1"],
      entities: {
        l1: {
          id: "l1",
          httpSpaceId: SCOPE,
          serverId: EDGE,
          path: "/rest/admin/",
          waf: {
            requestInspectors: [
              {
                name: "admin-gate",
                wave: 1,
                conds: [{ value: "$cookie_waf_sess", dataset: "auth_sessions", negate: true }],
              },
            ],
          },
        },
      },
    },
  } as unknown as RootState;
}

async function withApp(
  state: { source: AuthSource; row: AuthProfile },
  run: (base: string) => Promise<void>,
  rootState: () => RootState = emptyState,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/:scopeUuid/auth",
    authRouter(
      rootState,
      fakeSources(state),
      fakeProfiles(state),
      {} as unknown as DesiredStore,
      fixedInspectorSettings(),
    ),
  );

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");

  try {
    await run(`http://127.0.0.1:${addr.port}/api/${SCOPE}/auth`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function fixture() {
  return {
    source: sourceRow(EDGE, "/waf/login"),
    row: profileRow({ mode: "enforce", source: "gate" }),
  };
}

function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* --- источники -------------------------------------------------------------- */

test("источник с формой требует сервера", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "sources", {
      name: "second",
      doc: sourceDocWith("/waf/login-2"),
    });

    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "server_required");
  });
});

/*
 * У внешнего провайдера формы нет: без страницы входа ни сервер, ни адрес не
 * нужны, и два таких источника не спорят за пустой адрес.
 */
test("внешний источник без страницы входа обходится без сервера", async () => {
  await withApp(fixture(), async (base) => {
    const jwt = {
      login: { uri: "" },
      provider: "jwt",
      providers: {
        jwt: { cookie: "access_token", verify: { alg: "none" } },
      },
    };

    const first = await post(base, "sources", { name: "idp", doc: jwt });
    assert.equal(first.status, 201, await first.text());

    const second = await post(base, "sources", {
      name: "idp2",
      doc: { ...jwt, providers: { jwt: { cookie: "other_token", verify: { alg: "none" } } } },
    });
    assert.equal(second.status, 201, await second.text());

    // А названная страница входа -- по-прежнему локейшен сервера.
    const named = await post(base, "sources", {
      name: "idp3",
      server_id: EDGE,
      doc: { ...jwt, login: { uri: "/waf/enter" } },
    });
    assert.equal(named.status, 400);
    assert.equal(((await named.json()) as { error: string }).error, "unknown_location");
  });
});

test("адрес формы обязан быть локейшеном названного сервера", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "sources", {
      name: "second",
      server_id: EDGE,
      doc: sourceDocWith("/waf/enter"),
    });

    assert.equal(res.status, 400);

    const body = (await res.json()) as { error: string; locations: string[] };

    assert.equal(body.error, "unknown_location");
    /*
     * В подсказке -- все адресуемые локейшены сервера: именованный отпадает
     * (браузеру туда не пойти), а закрытый калиткой годится -- свой адрес
     * калитка пропускает сама (AUTH_SELF).
     */
    assert.deepEqual(body.locations, ["/waf/login", "/waf/login-2", "/app/"]);
  });
});

/*
 * Форма на маршруте под калиткой -- законная конфигурация: рекурсию «вход
 * требует входа» снимает сам инспектор, отвечая на своём login.uri allow, а
 * списки, лимиты и modsec на форме только к месту.
 */
test("на маршруте под калиткой форму ставят", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "sources", {
      name: "second",
      server_id: EDGE,
      doc: sourceDocWith("/app/"),
    });

    assert.equal(res.status, 201);
  });
});

/*
 * Форма с включённым модулем -- законная и более защищённая конфигурация:
 * рекурсию создают инспекторы, а локальный слой на форме нужен. Раньше
 * проверка смотрела на выключатель и такую форму отвергала, заставляя
 * оставлять маршрут без наборов края вовсе.
 */
test("форма с waf on, но без инспекторов -- принимается", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "sources", {
      name: "second",
      server_id: EDGE,
      doc: sourceDocWith("/waf/login-2"),
    });

    assert.equal(res.status, 201);
  });
});

test("локейшен чужого сервера не подходит", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "sources", {
      name: "second",
      server_id: OTHER,
      doc: sourceDocWith("/waf/login-2"),
    });

    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "unknown_location");
  });
});

/*
 * Форма и куки уникальны между источниками: источник и есть пространство
 * сессий, и совпадение означало бы два множества пользователей, невольно
 * открывающие двери друг друга.
 */
test("общий login.uri и общая кука между источниками отвергаются", async () => {
  await withApp(fixture(), async (base) => {
    const dup = await post(base, "sources", {
      name: "second",
      server_id: EDGE,
      doc: sourceDocWith("/waf/login"),
    });

    assert.equal(dup.status, 400);
    assert.equal(((await dup.json()) as { error: string }).error, "login_uri_taken");

    const cookie = await post(base, "sources", {
      name: "second",
      server_id: EDGE,
      doc: {
        ...(sourceDocWith("/waf/login-2") as object),
        session: { cookie: "waf_sid_gate" },
      },
    });

    assert.equal(cookie.status, 400);
    assert.equal(
      ((await cookie.json()) as { error: string }).error,
      "session_cookie_taken",
    );
  });
});

test("форма на выключенном waf принимается", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "sources", {
      name: "second",
      server_id: EDGE,
      doc: sourceDocWith("/waf/login-2"),
    });

    assert.equal(res.status, 201);
    assert.equal(((await res.json()) as { server_id: string }).server_id, EDGE);
  });
});

/* Смена сервера в одиночку меняет список локейшенов под прежним адресом. */
test("смена сервера источника без правки документа тоже проверяется", async () => {
  await withApp(fixture(), async (base) => {
    const res = await fetch(`${base}/sources/${SOURCE}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ server_id: OTHER }),
    });

    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "unknown_location");
  });
});

/* Источник без формы не способен никого впустить -- отказ документа. */
test("источник без login.uri отвергается", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "sources", {
      name: "second",
      server_id: EDGE,
      doc: {
        provider: "code",
        providers: { code: { kind: "static", codes: ["$2a$10$stub"] } },
      },
    });

    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "invalid_source");
  });
});

/* --- профили ---------------------------------------------------------------- */

test("профиль со ссылкой в пустоту не сохраняется", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "profiles", {
      name: "admin",
      doc: { mode: "enforce", source: "ghost" },
    });

    assert.equal(res.status, 400);

    const body = (await res.json()) as { error: string; known: string[] };

    assert.equal(body.error, "unknown_source");
    assert.deepEqual(body.known, ["gate"]);
  });
});

test("профиль без источника живёт: он ничего не проверяет", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "profiles", {
      name: "idle",
      doc: {},
    });

    assert.equal(res.status, 201);
  });
});

/*
 * Быстрый путь на закрытом профиле: маршрут уже несёт if-условие на вызове,
 * и профиль нельзя закрыть группами, пока условие не снято, -- локальный слой
 * групп не проверяет.
 */
test("группы не сохраняются, пока маршрут держит быстрый путь", async () => {
  await withApp(
    fixture(),
    async (base) => {
      const res = await post(base, "profiles", {
        name: "gate",
        doc: { mode: "enforce", source: "gate", gate: { groups: ["admins"] } },
      });

      assert.equal(res.status, 409);

      const body = (await res.json()) as { error: string };

      assert.equal(body.error, "fast_path_gated");
    },
    fastPathState,
  );
});

/* Без условия на маршруте тот же профиль сохраняется. */
test("группы сохраняются на чистом маршруте", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "profiles", {
      name: "gate",
      doc: { mode: "enforce", source: "gate", gate: { groups: ["admins"] } },
    });

    assert.equal(res.status, 201);
  });
});

/*
 * Правила приёма чужих просьб. Ограничения повторяют загрузчик инспектора
 * (inspectors/auth/internal/config/profile.go): правило, которое инспектор не
 * примет, не должно уезжать на край -- там оно означает процесс, который не
 * поднялся.
 */
test("правила prior: послабление требует имени, чужие глаголы не грузятся", () => {
  const withPrior = (prior: unknown) =>
    normalizeDoc({ mode: "enforce", source: "gate", trigger: { prior } });

  /* Ужесточение от всех -- можно. */
  validateDoc(withPrior([{ from: "*", accept: ["reauth"] }]));

  /* Skip с именем и поводом -- можно. */
  validateDoc(
    withPrior([{ from: "edge", accept: ["skip"], codes: ["HEALTHCHECK"] }]),
  );

  const rejected = [
    [{ from: "*", accept: ["skip"] }],
    [{ from: "ip", accept: ["challenge"] }],
    [{ from: "ip", accept: ["threshold"] }],
    [{ from: "ip", accept: ["note"] }],
    [{ from: "ip", accept: ["block"] }],
    [{ from: "repu", accept: ["reauth"], apply: ["request"] }],
    [{ from: "", accept: ["reauth"] }],
    [{ from: "repu", accept: [] }],
  ];

  for (const prior of rejected) {
    assert.throws(() => validateDoc(withPrior(prior)), DocError);
  }
});

/* Секция trigger доезжает до profile.yaml ровно в форме загрузчика Go. */
test("правила prior печатаются в YAML профиля", () => {
  const doc = normalizeDoc({
    mode: "enforce",
    source: "gate",
    trigger: {
      reauth_after_s: 600,
      prior: [
        { from: "*", accept: ["reauth"], apply: ["session"], codes: ["SESSION_HIJACK"] },
        { from: "edge", accept: ["skip"] },
      ],
    },
  });

  const yaml = renderProfileYaml("default", doc);

  assert.match(yaml, /source: "gate"/);
  assert.match(yaml, /trigger:\n  reauth_after: "10m"\n  prior:\n/);
  assert.match(yaml, /- from: "\*"\n {6}accept: \["reauth"\]\n {6}apply: \["session"\]\n {6}codes: \["SESSION_HIJACK"\]/);
  assert.match(yaml, /- from: "edge"\n {6}accept: \["skip"\]/);

  /* Пустая секция не печатается: калитка без правил никого не слушает. */
  const empty = renderProfileYaml(
    "default",
    normalizeDoc({ mode: "enforce", source: "gate" }),
  );
  assert.doesNotMatch(empty, /trigger:/);
});

/*
 * Допуск по группам: пара профилей на один источник -- общий пускает всех
 * вошедших, закрытый только своих. В profile.yaml допуск едет вместе с записью
 * каталога под 403, а профиль без групп ни того, ни другого не печатает.
 */
test("допуск по группам печатается вместе с записью отказа", () => {
  const doc = normalizeDoc({
    mode: "enforce",
    source: "gate",
    gate: { groups: ["admins", "ops"] },
  });

  const yaml = renderProfileYaml("admin", doc);

  assert.match(yaml, /\n {2}groups: \["admins", "ops"\]\n/);
  assert.match(yaml, /\n {2}forbidden_response: "auth_forbidden"\n/);

  const open = renderProfileYaml(
    "default",
    normalizeDoc({ mode: "enforce", source: "gate" }),
  );

  assert.doesNotMatch(open, /\n {2}groups: \[/);
  assert.doesNotMatch(open, /forbidden_response:/);
});

test("пустая группа отвергается доком, профиль без источника -- инертный", () => {
  assert.throws(
    () =>
      validateDoc(
        normalizeDoc({ source: "gate", gate: { groups: ["admins", " "] } }),
      ),
    DocError,
  );

  /*
   * Режима у профиля нет: без источника он ничего не проверяет -- законное
   * состояние, а не ошибка; загрузчику калитки контроллер печатает такому
   * mode: "off".
   */
  validateDoc(normalizeDoc({}));
});

/* Записи каталога под 403 может не быть в пространстве -- это отказ записи. */
test("неизвестная запись отказа для чужой группы не сохраняется", async () => {
  await withApp(fixture(), async (base) => {
    const res = await post(base, "profiles", {
      name: "admin",
      doc: {
        mode: "enforce",
        source: "gate",
        gate: { groups: ["admins"], forbidden_response: "no_such_page" },
      },
    });

    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "deny_response_unknown");
  });
});

/* Карточка называет отправителей, которых нет в реестре, -- замечанием. */
test("карточка профиля несёт unknown_senders и sender_codes", async () => {
  const state = fixture();
  state.row.doc.trigger.prior = [
    { from: "repu", accept: ["reauth"], apply: [], codes: [] },
    { from: "*", accept: ["reauth"], apply: [], codes: [] },
  ];

  await withApp(state, async (base) => {
    const res = await fetch(`${base}/profiles/${PROFILE}`);

    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      unknown_senders: string[];
      sender_codes: { code: string; by: { inspector: string; profile: string }[] }[];
    };

    assert.deepEqual(body.unknown_senders, ["repu"]);
    assert.deepEqual(body.sender_codes, [
      { code: "IP_GREYLIST", by: [{ inspector: "ip", profile: "default" }] },
    ]);
  });
});

/* --- рендер источника ------------------------------------------------------- */

/* source.yaml несёт форму, куки и провайдера -- в форме загрузчика Go. */
test("источник печатается в source.yaml", () => {
  const doc = normalizeSourceDoc(sourceDocWith("/waf/login"));
  const yaml = renderSourceYaml("gate", doc);

  assert.match(yaml, /login:\n {2}uri: "\/waf\/login"/);
  assert.match(yaml, /# cookie: "waf_sid_gate" -- умолчание на источник/);
  assert.match(yaml, /provider: code/);
  assert.match(yaml, /kind: static/);
  assert.doesNotMatch(yaml, /mode:/);
  assert.doesNotMatch(yaml, /gate:/);
});
