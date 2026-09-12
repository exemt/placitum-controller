/**
 * Реестр против схемы провода.
 *
 * Реестр отдаётся панели и API, а разбирает по-настоящему модуль, и сверять их
 * глазами бессмысленно: расходятся такие копии не в момент правки, а через два
 * месяца после неё. Источник здесь один -- `docs/messages/inspector.schema.json`,
 * тот же, который в заголовке своего `protocol.go` называет источником истины
 * каждый инспектор.
 *
 * Схема лежит вне контекста сборки контроллера и в образ не попадает. Это
 * правильно: в проде она не нужна -- реестр уже сверен здесь.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ACTIONS,
  ACTION_AXES,
  ACTION_COMMON,
  actionSpec,
  axesFor,
  moduleVerbs,
  routeVerbs,
  verbsFor,
} from "./actions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

interface WireSchema {
  $defs: {
    action: {
      required: string[];
      properties: Record<string, { enum?: string[]; minimum?: number; maximum?: number }>;
      allOf: {
        if: { properties: { do: { const?: string; not?: { const?: string; enum?: string[] } } } };
        then: {
          properties?: { apply?: { const?: string; enum?: string[] } };
          required?: string[];
          not?: { required: string[] };
        };
      }[];
    };
  };
}

function schema(): WireSchema {
  const raw = readFileSync(join(root, "docs", "messages", "inspector.schema.json"), "utf8");
  return JSON.parse(raw) as WireSchema;
}

test("глаголы и оси реестра -- ровно те, что принимает провод", () => {
  const action = schema().$defs.action;

  assert.deepEqual(
    ACTIONS.map((spec) => spec.do).sort(),
    [...(action.properties.do.enum ?? [])].sort(),
    "в реестре и в схеме разные глаголы",
  );

  assert.deepEqual(
    [...ACTION_AXES].sort(),
    [...(action.properties.apply.enum ?? [])].sort(),
    "в реестре и в схеме разные оси",
  );
});

test("матрица глагол-ось совпадает с блоками if/then схемы", () => {
  const action = schema().$defs.action;

  for (const spec of ACTIONS) {
    const block = action.allOf.find((b) => b.if.properties.do.const === spec.do);

    assert.ok(block !== undefined, `в схеме нет блока для ${spec.do}`);

    const apply = block.then.properties?.apply;
    const axes = apply?.const !== undefined ? [apply.const] : (apply?.enum ?? []);

    assert.deepEqual(
      [...spec.axes].sort(),
      [...axes].sort(),
      `оси ${spec.do} расходятся с проводом`,
    );
  }
});

test("обязательный параметр в реестре -- обязательный и на проводе", () => {
  const action = schema().$defs.action;

  for (const spec of ACTIONS) {
    const block = action.allOf.find((b) => b.if.properties.do.const === spec.do);
    const required = new Set(block?.then.required ?? []);

    for (const param of spec.params) {
      assert.equal(
        param.required,
        required.has(param.name),
        `${spec.do}.${param.name}: обязательность расходится с проводом`,
      );
    }
  }
});

test("диапазоны параметров -- те же числа, которыми модуль отбраковывает ответ", () => {
  const props = schema().$defs.action.properties;

  for (const spec of ACTIONS) {
    for (const param of spec.params) {
      if (param.type !== "int") {
        continue;
      }

      const wire = props[param.name];

      assert.ok(wire !== undefined, `${param.name} нет в схеме`);
      assert.equal(param.min, wire.minimum, `${param.name}: нижняя граница`);
      assert.equal(param.max, wire.maximum, `${param.name}: верхняя граница`);
    }
  }
});

test("параметр принадлежит своему глаголу и никому больше", () => {
  const action = schema().$defs.action;

  for (const spec of ACTIONS) {
    for (const param of spec.params) {
      /*
       * Блок «у всех, кроме X, этого поля быть не должно» -- то самое место,
       * где провод запрещает threshold с force. Если параметр объявлен у двух
       * глаголов, такого блока не найдётся, и реестр придётся чинить.
       */
      /*
       * Параметр, общий у нескольких глаголов (set у mutate и глаголов записи),
       * закрыт одним блоком с перечислением: «у всех, кроме этих».
       */
      const guard = action.allOf.find(
        (b) =>
          (b.if.properties.do.not?.const === spec.do ||
            b.if.properties.do.not?.enum?.includes(spec.do) === true) &&
          b.then.not !== undefined,
      );

      assert.ok(
        guard !== undefined,
        `${param.name} у ${spec.do}: на проводе нет запрета для остальных глаголов`,
      );
    }
  }
});

test("общие поля не пересекаются с параметрами глаголов", () => {
  const own = new Set(ACTIONS.flatMap((spec) => spec.params.map((p) => p.name)));

  for (const param of ACTION_COMMON) {
    assert.ok(!own.has(param.name), `${param.name} объявлен и общим, и у глагола`);
  }
});

test("axesFor не предлагает пар, которые загрузчик потом отвергнет", () => {
  // Ровно тот случай, ради которого реестр и заведён: панель показывала asn
  // рядом с challenge, а профиль с такой парой не грузился.
  assert.deepEqual(axesFor(["challenge"]), ["request"]);
  assert.deepEqual(axesFor(["challenge", "note"]), ["request", "ip", "asn", "session"]);
  assert.deepEqual(axesFor(["reauth"]), ["session"]);
  assert.deepEqual(axesFor([]), []);
  assert.deepEqual(axesFor(["нетакого"]), []);
});

test("verbsFor не предлагает получателю чужого глагола", () => {
  const captcha = verbsFor("captcha");

  assert.ok(captcha.includes("challenge"), "капча обязана слышать просьбу о проверке");
  assert.ok(!captcha.includes("reauth"), "reauth -- дело auth, загрузчик капчи его отвергнет");
  // threshold капче больше не предлагается: её счёт-триггер умер вместе с
  // порогом фазы, коэффициент масштабировал бы пустоту.
  assert.ok(!captcha.includes("threshold"), "капче нечего масштабировать");
  assert.ok(captcha.includes("note"));
  // skip капче не предлагается: «не проверяй» для неё то же, что off.
  assert.ok(!captcha.includes("skip"), "капче вместо skip -- off");

  // Слушатели перечислены явно: у каждого получателя свой список входных
  // действий, и панель не должна предлагать то, что загрузчик отвергнет.
  assert.deepEqual(verbsFor("auth").sort(), ["reauth"]);
  assert.deepEqual(verbsFor("modsec").sort(), ["threshold"]);
  assert.deepEqual(verbsFor("json").sort(), ["threshold"]);
  assert.deepEqual(verbsFor("vlai").sort(), ["threshold"]);
  assert.deepEqual(verbsFor("rewrite").sort(), ["mutate"]);
  // Единственный, кому skip нужен: не судить, но считать.
  assert.deepEqual(verbsFor("counter").sort(), ["note", "skip", "threshold"]);
  assert.deepEqual(verbsFor("challenge").sort(), [], "challenge в канале не участвует");
});

/*
 * Схема агента -- третья копия словаря, и живёт она в zod, которого в
 * контроллере нет. Поэтому здесь чтение текстом, а не импорт: перечисление в
 * z.enum([...]) -- форма устойчивая, а если она изменится, тест упадёт, и это
 * ровно то, чего от него ждут. Молча разойтись копии не смогут.
 */
test("словарь в схеме агента -- тот же", () => {
  const raw = readFileSync(join(root, "docs", "messages", "agent.schema.ts"), "utf8");

  function enumAfter(field: string): string[] {
    const at = raw.indexOf(`${field}: z.enum([`);
    assert.ok(at !== -1, `в схеме агента не найдено ${field}: z.enum([`);

    const from = at + `${field}: z.enum([`.length;
    const to = raw.indexOf("])", from);

    return [...raw.slice(from, to).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  }

  assert.deepEqual(
    enumAfter("do").sort(),
    ACTIONS.map((spec) => spec.do).sort(),
    "глаголы в схеме агента разошлись с реестром",
  );

  assert.deepEqual(
    enumAfter("apply").sort(),
    [...ACTION_AXES].sort(),
    "оси в схеме агента разошлись с реестром",
  );
});

/*
 * Широковещательное «всем» осмысленно только у глаголов, которые слушает
 * больше одного получателя: адресный глагол, отправленный всем, -- это тот же
 * адресный глагол плюс шум в чужих аудитах. Панель фильтрует по этому правилу,
 * и словарь обязан его держать: появление второго слушателя у challenge --
 * осознанное решение, а не побочный эффект правки списка. У note второй
 * слушатель уже появился (счётчик), и широковещательный note легален: обе
 * стороны принимают его только правилом с именем отправителя.
 */
test("всем предлагаются только note и threshold", () => {
  // Управляющие глаголы (module) адресата требуют: режим «всем» не ставят.
  // skip слушает один счётчик -- широковещательным быть перестал.
  const broadcast = ACTIONS.filter(
    (spec) =>
      spec.module !== true && (spec.listeners.length === 0 || spec.listeners.length > 1),
  ).map((spec) => spec.do);

  assert.deepEqual(broadcast.sort(), ["note", "threshold"]);
});

test("управляющие глаголы исполняет модуль: любому адресату, никому из получателей", () => {
  assert.deepEqual(moduleVerbs().sort(), [
    "active", "archive", "audit", "ban", "mark", "off", "passive", "score", "vote",
  ]);
  /*
   * Адресат -- сам маршрут -- у глаголов записи, у маркера и у очков: журнал и
   * архив переопределяют то, что стоит на маршруте, маркер добавляет метку,
   * очки двигают сумму фазы. Гранта не требует ни одно.
   */
  assert.deepEqual(routeVerbs().sort(), ["archive", "audit", "ban", "mark", "score"]);
  /*
   * От пассивного отправителя модуль исполняет только запись маршрута и
   * маркер: очки и управляющие глаголы влияли бы на трафик чужими руками, и
   * их он отвергает. По этому признаку карточка события говорит «исполнил
   * модуль» либо «не исполнено: отправитель пассивен».
   */
  assert.deepEqual(
    ACTIONS.filter((spec) => spec.fromPassive === true).map((spec) => spec.do).sort(),
    ["archive", "audit", "mark"],
  );

  for (const verb of moduleVerbs()) {
    const spec = actionSpec(verb);
    // Управляющим доступна ось соединения; у глаголов записи ось называет
    // запись -- запроса либо ответа; у маркера и очков ось одна -- это
    // событие.
    assert.deepEqual(
      spec?.axes,
      spec?.route !== true
        ? ["request", "conn"]
        : verb === "ban"
          // Бан -- про адрес клиента: другого субъекта у модуля нет.
          ? ["ip"]
          : verb === "mark" || verb === "score"
            ? ["request"]
            : ["request", "response"],
      `${verb}: оси`,
    );
    // У управляющих один необязательный параметр -- фаза вызова адресата
    // (без него режим получают все вызовы имени); у глаголов записи --
    // сторона set, а у archive ещё объекты, срок и предел; у маркера -- сама
    // метка; у очков -- число со знаком; у бана -- имя набора.
    if (spec?.route !== true) {
      assert.deepEqual(
        spec?.params,
        [{ name: "phase", type: "string", required: false }],
        `${verb}: единственный параметр -- фаза вызова, необязательна`,
      );
    } else {
      assert.equal(
        spec.params[0]?.name,
        verb === "mark"
          ? "marker"
          : verb === "score"
            ? "value"
            : verb === "ban"
              ? "list"
              : "set",
        `${verb}: первым параметром сторона, метка, очки либо набор`,
      );
      assert.equal(spec.params[0]?.required, true, `${verb}: параметр обязателен`);
    }
    // Правил приёма у получателей нет -- в их списки глагол не попадает.
    assert.equal(verbsFor("rewrite").includes(verb), false);
    assert.equal(verbsFor("counter").includes(verb), false);
  }

  // conn -- только у них: остальным осям соединения не бывает.
  for (const spec of ACTIONS) {
    if (spec.module !== true) {
      assert.equal(spec.axes.includes("conn"), false, `${spec.do}: conn`);
    }
  }
});

/*
 * Признак «ослабляет» -- не украшение: по нему панель решает, что предлагать
 * широковещательному правилу, а загрузчики получателей отвергают такие правила
 * с ошибкой. Разойдись эти два места -- и оператор собирает мышью правило,
 * которое не сохранится (ровно это и случилось с капчей).
 */
test("ослабляющими помечены те, кому загрузчики требуют имени отправителя", () => {
  const weakens = ACTIONS.filter((spec) => spec.weakens).map((spec) => spec.do).sort();

  // skip ослабляет всегда; у threshold, note и score знак выбирает
  // отправитель; правило приёма mutate может гасить группу, то есть снимать
  // маскировку; off, passive и vote снимают инспектора с решения -- то же
  // тихое послабление. audit и archive умеют прятать улики (set off) --
  // послабление того же рода.
  assert.deepEqual(weakens, [
    "archive", "audit", "mutate", "note", "off", "passive", "score", "skip", "threshold", "vote",
  ]);

  // Ужесточение имени не требует: лишняя проверка видна в первую же минуту.
  assert.equal(actionSpec("challenge")?.weakens, false);
  assert.equal(actionSpec("reauth")?.weakens, false);
});

test("actionSpec отвечает по имени глагола", () => {
  assert.equal(actionSpec("threshold")?.params[0].name, "delta");
  assert.equal(actionSpec("нетакого"), undefined);
});

/*
 * skip на проводе принимают семь загрузчиков, а нужен он одному: для остальных
 * «не проверяй» и «не звать» -- одно и то же, и панель даёт им off
 * (docs/inspector-actions.md, «off против skip»). Слушатель в реестре один,
 * чтобы skip не всплывал ни у отправителя, ни в правилах приёма, ни у «всем».
 */
test("skip в словаре панели -- только у счётчика", () => {
  assert.deepEqual(actionSpec("skip")?.listeners, ["counter"]);

  for (const name of ["modsec", "captcha", "json", "auth", "vlai", "rewrite"]) {
    assert.ok(!verbsFor(name).includes("skip"), `${name}: вместо skip -- off`);
  }
});
