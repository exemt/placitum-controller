/*
 * Документы счётчика: проверка повторяет загрузчик инспектора, печать читается
 * его же разбором. Ловится здесь то, что иначе всплыло бы как apply_failed в
 * пульсе через минуту после send.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkReferences,
  DocError,
  renderCountersYaml,
  renderProfileYaml,
  validateDoc,
  validateShared,
} from "./counter-profile-doc.ts";
import { hashCounterProfiles } from "./counter-manifest.ts";

const shared = {
  counters: {
    objects: {
      unit: "obj",
      axes: {
        ip: { max: 1000, loss: 2 },
        sess: { max: 800, loss: 2 },
      },
    },
    abuse: {
      fill: "note",
      axes: {
        ip: { max: 100, loss: 1 },
        asn_net: { max: 500, loss: 1 },
      },
    },
  },
  subjects: {
    sess: { cookie: "waf_cid" },
    user: { from: "" },
  },
};

const doc = {
  mode: "enforce",
  description: "тест",
  request: {
    enabled: true,
    judge: [
      { counter: "objects", axis: "ip", at: 60, action: "score", score: 40, code: "CNT_HOT" },
      { counter: "objects", axis: "sess", at: 90, action: "deny" },
    ],
    deny_response: "counter_limit",
    outcomes: [
      { on: "score", at: 40, to: "captcha", do: "challenge", code: "CNT_SCRAPER" },
      { on: "deny", list: "blacklist", write: "addr", ttl_s: 3600 },
    ],
  },
  response: {
    enabled: true,
    measure: [
      {
        if: { status: [200], content_type: ["application/json", "+json"] },
        source: "regex_count",
        regex: '"id"\\s*:',
        counter: "objects",
        axes: ["ip"],
      },
    ],
  },
};

test("исправный профиль проходит и печатается", () => {
  const parsed = validateDoc(doc);
  checkReferences(parsed, validateShared(shared));

  const yaml = renderProfileYaml("api", parsed);

  for (const line of [
    "mode: enforce",
    '    - counter: "objects"',
    "      axis: ip",
    "      at: 60",
    "      action: score",
    "      score: 40",
    'deny_response: "counter_limit"',
    "      do: challenge",
    '      list: "blacklist"',
    '      ttl: "1h"',
    "source: regex_count",
    "      axes: [ip]",
  ]) {
    assert.ok(yaml.includes(line), `нет строки: ${line}\n${yaml}`);
  }

  // deny без score: число ничего не значит и не печатается.
  assert.ok(!yaml.includes("action: deny\n      score"));
});

test("общая секция печатается файлом counters.yaml", () => {
  const yaml = renderCountersYaml(validateShared(shared));

  for (const line of [
    "counters:",
    "  objects:",
    "      ip: { max: 1000, loss: 2 }",
    "  abuse:",
    "    fill: note",
    '  sess: { cookie: "waf_cid" }',
  ]) {
    assert.ok(yaml.includes(line), `нет строки: ${line}\n${yaml}`);
  }

  // fill: measure -- умолчание и не печатается: старые инспекторы читают
  // counters.yaml с KnownFields, лишний ключ уронил бы их поколение.
  assert.ok(!yaml.includes("fill: measure"), yaml);

  // Свои источники не объявлены -- ключ subjects у счётчика не печатается
  // по той же причине.
  assert.ok(!yaml.includes("    subjects:"), yaml);
});

/*
 * Свои источники ключей в объявлении счётчика: «на эту куку заведён счётчик».
 * Ось user жива от собственного источника даже при пустом общем; битый свой
 * источник -- отказ записи, как и битый общий.
 */
test("свои источники ключей счётчика: разбор, печать, ось user", () => {
  const own = validateShared({
    counters: {
      sessions: {
        axes: { sess: { max: 100, loss: 1 } },
        subjects: { sess: { cookie: "waf_sid_default" } },
      },
      api_calls: {
        axes: { user: { max: 100, loss: 1 } },
        subjects: { user: { from: "header:x-api-key" } },
      },
    },
    subjects: { sess: { cookie: "waf_cid" }, user: { from: "" } },
  });

  assert.equal(own.counters.sessions.subjects?.sess.cookie, "waf_sid_default");

  const yaml = renderCountersYaml(own);

  assert.ok(yaml.includes('      sess: { cookie: "waf_sid_default" }'), yaml);
  assert.ok(yaml.includes('      user: { from: "header:x-api-key" }'), yaml);

  // Пустой объект subjects равен отсутствию: «свои» пустые источники панель
  // включить не может.
  const empty = validateShared({
    counters: {
      x: { axes: { ip: { max: 1, loss: 1 } }, subjects: {} },
    },
    subjects: { sess: { cookie: "waf_cid" }, user: { from: "" } },
  });

  assert.equal(empty.counters.x.subjects, null);

  assert.throws(
    () =>
      validateShared({
        counters: {
          x: {
            axes: { ip: { max: 1, loss: 1 } },
            subjects: { user: { from: "jwt:sub" } },
          },
        },
        subjects: { sess: { cookie: "waf_cid" }, user: { from: "" } },
      }),
    DocError,
  );
});

test("инициатор по уровню корзины: условие, печать и связность", () => {
  const parsed = validateDoc({
    ...doc,
    request: {
      enabled: true,
      judge: [],
      deny_response: "counter_limit",
      outcomes: [
        {
          on: "level",
          if: { counter: "abuse", axis: "ip" },
          at: 40,
          list: "banned",
          write: "addr",
          ttl_s: 3600,
          code: "CNT_ABUSE_HOT",
        },
      ],
    },
  });

  checkReferences(parsed, validateShared(shared));

  const yaml = renderProfileYaml("api", parsed);

  for (const line of [
    "    - on: level",
    '      if: { counter: "abuse", axis: ip }',
    "      at: 40",
    '      list: "banned"',
  ]) {
    assert.ok(yaml.includes(line), "нет строки: " + line);
  }

  // Ссылка на необъявленную корзину молчала бы навсегда -- ловится связностью.
  const ghost = validateDoc({
    ...doc,
    request: {
      enabled: true,
      judge: [],
      deny_response: "counter_limit",
      outcomes: [
        { on: "level", if: { counter: "ghosts", axis: "ip" }, at: 40, list: "b", ttl_s: 60 },
      ],
    },
  });

  assert.throws(() => checkReferences(ghost, validateShared(shared)), /ghosts/);

  // Форма: без if, без at, с eq (уровень непрерывен), if не при level.
  for (const bad of [
    { on: "level", at: 40, list: "b", ttl_s: 60 },
    { on: "level", if: { counter: "abuse", axis: "ip" }, list: "b", ttl_s: 60 },
    { on: "level", if: { counter: "abuse", axis: "ip" }, at: 40, eq: true, list: "b", ttl_s: 60 },
    { on: "allow", if: { counter: "abuse", axis: "ip" }, list: "b", ttl_s: 60 },
  ]) {
    assert.throws(
      () =>
        validateDoc({
          ...doc,
          request: {
            enabled: true,
            judge: [],
            deny_response: "counter_limit",
            outcomes: [bad],
          },
        }),
      DocError,
      JSON.stringify(bad),
    );
  }
});

test("инициатор: точное сравнение и корзина-селектор печатаются", () => {
  const parsed = validateDoc({
    ...doc,
    request: {
      enabled: true,
      judge: [],
      deny_response: "counter_limit",
      outcomes: [
        {
          on: "score", at: 40, eq: true,
          to: "counter", do: "note", apply: "ip", value: 25, counter: "abuse",
          code: "CNT_EXACT",
        },
      ],
    },
  });

  const yaml = renderProfileYaml("api", parsed);

  for (const line of ["      at: 40", "      eq: true", '      counter: "abuse"']) {
    assert.ok(yaml.includes(line), `нет строки: ${line}\n${yaml}`);
  }

  // Сравнение одно: «ровно at» и «ниже at» разом не бывают.
  assert.throws(
    () =>
      validateDoc({
        ...doc,
        request: {
          enabled: true,
          judge: [],
          deny_response: "counter_limit",
          outcomes: [{ on: "score", at: 40, eq: true, below: true, list: "x", ttl_s: 60 }],
        },
      }),
    DocError,
  );

  // Корзина -- селектор note: у прочих глаголов ей нечего значить.
  assert.throws(
    () =>
      validateDoc({
        ...doc,
        request: {
          enabled: true,
          judge: [],
          deny_response: "counter_limit",
          outcomes: [{ on: "allow", to: "modsec", do: "skip", counter: "abuse" }],
        },
      }),
    DocError,
  );
});

test("правило note: корзина в правиле, оси провода, печать один в один", () => {
  const parsed = validateDoc({
    ...doc,
    trigger: {
      prior: [
        {
          from: "modsec",
          accept: ["note"],
          apply: ["ip", "asn"],
          codes: ["MODSEC_SQLI"],
          counter: "abuse",
        },
      ],
    },
  });

  checkReferences(parsed, validateShared(shared));

  const yaml = renderProfileYaml("api", parsed);

  for (const line of [
    '    - from: "modsec"',
    '      accept: ["note"]',
    "      apply: [ip, asn]",
    '      codes: ["MODSEC_SQLI"]',
    '      counter: "abuse"',
  ]) {
    assert.ok(yaml.includes(line), `нет строки: ${line}\n${yaml}`);
  }

  // Потолков у правил нет вовсе: границы держат отправитель и ёмкость.
  assert.ok(!yaml.includes("max_percent"), yaml);
});

test("форма отвергает то, что отвергнет загрузчик", () => {
  const bad: [string, unknown][] = [
    ["judge без счётчика", {
      ...doc,
      request: { enabled: true, judge: [{ axis: "ip", at: 10, action: "deny" }] },
    }],
    ["чужая ось", {
      ...doc,
      request: {
        enabled: true,
        judge: [{ counter: "objects", axis: "moon", at: 10, action: "deny" }],
      },
    }],
    ["score вне 1..100", {
      ...doc,
      request: {
        enabled: true,
        judge: [{ counter: "objects", axis: "ip", at: 10, action: "score", score: 200 }],
      },
    }],
    ["regex_count без regex", {
      ...doc,
      response: {
        enabled: true,
        measure: [{ source: "regex_count", counter: "objects" }],
      },
    }],
    ["нулевой per", {
      ...doc,
      response: {
        enabled: true,
        measure: [{ source: "const", per: 0, counter: "objects" }],
      },
    }],
    ["все фазы выключены", {
      mode: "enforce",
      request: { enabled: false },
      response: { enabled: false },
      frame: { enabled: false },
    }],
    ["просьба на deny", {
      ...doc,
      request: {
        enabled: true,
        judge: [],
        outcomes: [{ on: "deny", to: "captcha", do: "challenge" }],
      },
    }],
    ["широковещательный prior", {
      ...doc,
      trigger: { prior: [{ from: "*", accept: ["skip"] }] },
    }],
    ["note без корзины", {
      ...doc,
      trigger: { prior: [{ from: "modsec", accept: ["note"] }] },
    }],
    ["корзина не у note", {
      ...doc,
      trigger: { prior: [{ from: "ip", accept: ["skip"], counter: "abuse" }] },
    }],
    ["мёртвая пара: note с осью request", {
      ...doc,
      trigger: {
        prior: [{ from: "modsec", accept: ["note"], apply: ["request"], counter: "abuse" }],
      },
    }],
  ];

  for (const [name, input] of bad) {
    assert.throws(() => validateDoc(input), DocError, name);
  }
});

test("владение шкалой: один вход, и связность это держит", () => {
  const sharedDoc = validateShared(shared);

  // note в мерную корзину -- второй владелец.
  const noteIntoMeasure = validateDoc({
    ...doc,
    trigger: { prior: [{ from: "modsec", accept: ["note"], counter: "objects" }] },
  });

  assert.throws(() => checkReferences(noteIntoMeasure, sharedDoc), /second owner/);

  // measure в сигнальную корзину -- тоже.
  const measureIntoNote = validateDoc({
    ...doc,
    response: {
      enabled: true,
      measure: [{ source: "const", counter: "abuse" }],
    },
  });

  assert.throws(() => checkReferences(measureIntoNote, sharedDoc), /second owner/);

  // Судить сигнальную корзину можно: суд -- не наполнение.
  const judged = validateDoc({
    ...doc,
    request: {
      enabled: true,
      judge: [{ counter: "abuse", axis: "ip", at: 90, action: "score", score: 40 }],
      deny_response: "counter_limit",
      outcomes: [],
    },
  });

  checkReferences(judged, sharedDoc);

  // Корзина из одной оси user словам соседей недоступна.
  const userOnly = validateShared({
    counters: {
      hidden: { fill: "note", axes: { user: { max: 100, loss: 1 } } },
    },
    subjects: { sess: { cookie: "waf_cid" }, user: { from: "header:x-api-key" } },
  });

  const unreachable = validateDoc({
    ...doc,
    trigger: { prior: [{ from: "modsec", accept: ["note"], counter: "hidden" }] },
    request: { enabled: true, judge: [], deny_response: "counter_limit", outcomes: [] },
    response: { enabled: true, measure: [] },
  });

  assert.throws(() => checkReferences(unreachable, userOnly), /can reach/);
});

test("общая секция отвергает то, что отвергнет ParseCounters", () => {
  const bad: [string, unknown][] = [
    ["пусто", {}],
    ["без осей", { counters: { x: { axes: {} } } }],
    ["чужая ось", { counters: { x: { axes: { moon: { max: 1, loss: 1 } } } } }],
    ["нулевая ёмкость", { counters: { x: { axes: { ip: { max: 0, loss: 1 } } } } }],
    ["потери за пределом", { counters: { x: { axes: { ip: { max: 1, loss: 200 } } } } }],
    ["user без источника", { counters: { x: { axes: { user: { max: 1, loss: 1 } } } } }],
    ["битый источник user", {
      counters: { x: { axes: { ip: { max: 1, loss: 1 } } } },
      subjects: { user: { from: "jwt:sub" } },
    }],
    ["чужое владение", {
      counters: { x: { fill: "wind", axes: { ip: { max: 1, loss: 1 } } } },
    }],
  ];

  for (const [name, input] of bad) {
    assert.throws(() => validateShared(input), DocError, name);
  }
});

test("ссылка на необъявленное ловится связностью, а не send", () => {
  const parsed = validateDoc({
    ...doc,
    request: {
      enabled: true,
      judge: [{ counter: "ghosts", axis: "ip", at: 10, action: "score", score: 20 }],
    },
    response: { enabled: false },
  });

  assert.throws(() => checkReferences(parsed, validateShared(shared)), /ghosts/);
});

test("канон хеша не зависит от порядка профилей", () => {
  const a = {
    x: { files: [{ name: "profile.yaml", text: "a" }] },
    _shared: { files: [{ name: "counters.yaml", text: "c" }] },
  };
  const b = {
    _shared: { files: [{ name: "counters.yaml", text: "c" }] },
    x: { files: [{ name: "profile.yaml", text: "a" }] },
  };

  assert.equal(hashCounterProfiles(a), hashCounterProfiles(b));
  assert.match(hashCounterProfiles(a), /^sha256:[0-9a-f]{64}$/);
});

/*
 * Секция кадров: правила меряют и судят один кадр, селекторы -- направление
 * и опкод, ось conn -- только здесь. Печатается только заполненной: у
 * профиля без кадров файл прежний, и его читает счётчик до фазы кадров.
 */
test("секция кадров: селекторы, ось conn, печать и связность", () => {
  const withFrame = {
    ...doc,
    frame: {
      enabled: true,
      measure: [
        { if: { direction: ["c2s"], opcode: ["text"] }, source: "const", counter: "frames" },
        { if: { direction: ["s2c"] }, source: "bytes", counter: "frames", axes: ["conn"] },
      ],
      judge: [{ counter: "frames", axis: "conn", at: 90, action: "deny", code: "WS_FLOOD" }],
      deny_response: "ws_policy",
    },
  };

  const sharedWithConn = {
    ...shared,
    counters: {
      ...shared.counters,
      frames: { unit: "frm", axes: { conn: { max: 100, loss: 10 }, ip: { max: 1000, loss: 5 } } },
    },
  };

  const parsed = validateDoc(withFrame);
  checkReferences(parsed, validateShared(sharedWithConn));

  const yaml = renderProfileYaml("ws", parsed);

  for (const line of [
    "frame:",
    "  enabled: true",
    "    - if: { direction: [c2s], opcode: [text] }",
    "      source: const",
    "      source: bytes",
    "      axes: [conn]",
    '    - counter: "frames"',
    "      axis: conn",
    "      action: deny",
    '  deny_response: "ws_policy"',
  ]) {
    assert.ok(yaml.includes(line), `нет строки: ${line}\n${yaml}`);
  }

  // Профиль без кадров печатается как прежде: секции frame в файле нет.
  assert.ok(!renderProfileYaml("api", validateDoc(doc)).includes("frame:"));

  // Селекторы кадров вне кадров и наоборот -- отбраковка.
  assert.throws(
    () => validateDoc({ ...doc, response: { enabled: true, measure: [
      { if: { direction: ["c2s"] }, source: "const", counter: "objects" },
    ] } }),
    DocError,
  );
  assert.throws(
    () => validateDoc({ ...doc, request: { enabled: true, judge: [
      { counter: "objects", axis: "conn", at: 10, action: "deny" },
    ], deny_response: "counter_limit" } }),
    DocError,
  );
  assert.throws(
    () => validateDoc({ ...doc, frame: { enabled: true, measure: [
      { if: { status: [200] }, source: "const", counter: "objects" },
    ] } }),
    DocError,
  );

  // Связность: ось conn у корзины должна быть объявлена.
  assert.throws(
    () => checkReferences(parsed, validateShared(shared)),
    DocError,
  );
});

/*
 * Личность как источник оси user: счётчик заведён на то, что о клиенте сказала
 * калитка, а не на то, что прислал клиент. Формы две -- логин и сессия, --
 * и обе печатаются в общую секцию как есть; выдуманное поле отвергается.
 */
test("источник оси user: личность от калитки", () => {
  const shared = validateShared({
    counters: {
      people: {
        axes: { user: { max: 2000, loss: 0.1 } },
      },
      logins: {
        axes: { user: { max: 50, loss: 1 } },
        subjects: { user: { from: "session:sid" } },
      },
    },
    subjects: { sess: { cookie: "waf_cid" }, user: { from: "session:user" } },
  });

  const yaml = renderCountersYaml(shared);

  assert.ok(yaml.includes('      user: { from: "session:sid" }'), yaml);
  assert.ok(yaml.includes('  user: { from: "session:user" }'), yaml);

  for (const from of ["session:login", "session:", "session"]) {
    assert.throws(
      () =>
        validateShared({
          counters: { x: { axes: { ip: { max: 1, loss: 1 } } } },
          subjects: { sess: { cookie: "waf_cid" }, user: { from } },
        }),
      DocError,
      from,
    );
  }
});
