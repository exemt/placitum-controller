import assert from "node:assert/strict";
import { test } from "node:test";

import {
  afterAllowed,
  afterRejected,
  applyInspectorBody,
  applyInspectorNeeds,
  canMoveRow,
  findInspectorUses,
  isAfterAllowed,
  joinNeeds,
  mergeInspectorGraphs,
  moveRow,
  moveToIndex,
  needsList,
  parentsAbove,
  patchNeeds,
  placeBelowParents,
  stripFromAfter,
  wavesFromAfter,
} from "./inspector-graph.ts";

test("http ключи первыми, значение http побеждает", () => {
  const graph = mergeInspectorGraphs(
    { ip: { timeoutMs: 20 }, modsec: { timeoutMs: 500 } },
    [
      {
        locations: [{ ip: { timeoutMs: 5 } }],
      },
    ],
  );
  assert.deepEqual(Object.keys(graph), ["ip", "modsec"]);
  assert.equal(graph.ip?.timeoutMs, 20);
});

test("имя только на пути дописывается после http", () => {
  const graph = mergeInspectorGraphs({ modsec: { timeoutMs: 500 } }, [
    { locations: [{ ip: { timeoutMs: 5 } }] },
  ]);
  assert.deepEqual(Object.keys(graph), ["modsec", "ip"]);
  assert.equal(graph.ip?.timeoutMs, 5);
});

test("after ставит строку сразу под самым нижним родителем", () => {
  assert.deepEqual(placeBelowParents(["ip", "json", "modsec"], "modsec", ["ip"]), [
    "ip",
    "modsec",
    "json",
  ]);
  assert.deepEqual(placeBelowParents(["modsec", "ip"], "modsec", ["ip"]), ["ip", "modsec"]);
  assert.deepEqual(placeBelowParents(["ip", "modsec"], "ip", []), ["modsec", "ip"]);
});

test("parentsAbove: родители строго выше", () => {
  assert.equal(parentsAbove(["ip", "modsec"], "modsec", ["ip"]), true);
  assert.equal(parentsAbove(["modsec", "ip"], "modsec", ["ip"]), false);
  assert.equal(parentsAbove(["ip", "modsec"], "modsec", []), true);
});

test("moveToIndex не ставит ребёнка выше after", () => {
  const afterOf = (name: string) => (name === "modsec" ? ["ip"] : []);
  assert.equal(moveToIndex(["ip", "modsec"], "modsec", 0, afterOf), undefined);
  assert.deepEqual(moveToIndex(["ip", "json", "modsec"], "json", 0, afterOf), [
    "json",
    "ip",
    "modsec",
  ]);
});

test("move не перепрыгивает after", () => {
  const afterOf = (name: string) => (name === "modsec" ? ["ip"] : []);
  assert.equal(canMoveRow(["ip", "modsec"], 1, -1, afterOf), false);
  assert.equal(canMoveRow(["ip", "json", "modsec"], 1, -1, afterOf), true);
  assert.deepEqual(moveRow(["ip", "json"], 1, -1), ["json", "ip"]);
});

test("needs: none вытесняет остальные, остальное снимает none", () => {
  assert.deepEqual(patchNeeds(["headers"], ["headers", "none"]), ["none"]);
  assert.deepEqual(patchNeeds(["none"], ["none", "body"]), ["body"]);
  assert.deepEqual(patchNeeds(["headers"], []), []);
  assert.equal(joinNeeds(["headers", "args", "body"]), "headers,args,body");
  assert.deepEqual(needsList("headers,args,body"), ["headers", "args", "body"]);
  assert.deepEqual(needsList(["headers"]), ["headers"]);
});

test("body=none снимает body из needs, уровень добавляет", () => {
  assert.deepEqual(applyInspectorBody(["headers", "body"], "none"), { needs: "headers" });
  assert.deepEqual(applyInspectorBody(["headers"], "preview=8k"), {
    needs: "headers,body",
    body: "preview=8k",
  });
  assert.deepEqual(applyInspectorBody(["none"], "full"), { needs: "body", body: "full" });
  assert.deepEqual(applyInspectorNeeds(["headers"], ["headers", "body"], "meta"), {
    needs: "headers,body",
    body: "meta",
  });
  assert.deepEqual(applyInspectorNeeds(["headers", "body"], ["headers"], "full"), {
    needs: "headers",
  });
});

test("after: нельзя себя, advisory и того, с кем не пересекаешься по фазам", () => {
  const roleOf = (name: string) => (name === "ml" ? "advisory" : "mandatory");
  const phasesOf = (name: string) =>
    name === "dlp" ? ["response"] : ["request"];

  assert.equal(isAfterAllowed("sqli", "sqli", roleOf, phasesOf), false);
  assert.equal(isAfterAllowed("sqli", "ml", roleOf, phasesOf), false);
  assert.equal(isAfterAllowed("sqli", "dlp", roleOf, phasesOf), false);
  assert.equal(isAfterAllowed("sqli", "ip", roleOf, phasesOf), true);
  assert.deepEqual(afterAllowed("sqli", ["sqli", "ip", "ml", "dlp"], roleOf, phasesOf), ["ip"]);
  assert.deepEqual(afterRejected("sqli", ["ip", "ml"], roleOf, phasesOf), ["ml"]);
});

/*
 * Процесс, ведущий обе стороны, встречается с каждым: с инспектором запроса --
 * на запросе, с инспектором ответа -- на ответе. Равенство фаз запретило бы и
 * то, и другое, а порядок внутри общей фазы задать надо.
 */
test("after: общая фаза достаточна, полное совпадение не требуется", () => {
  const roleOf = () => "mandatory";
  const phasesOf = (name: string) =>
    name === "modsec"
      ? ["request", "response"]
      : name === "dlp"
        ? ["response"]
        : ["request"];

  assert.equal(isAfterAllowed("modsec", "ip", roleOf, phasesOf), true);
  assert.equal(isAfterAllowed("modsec", "dlp", roleOf, phasesOf), true);
  assert.equal(isAfterAllowed("dlp", "ip", roleOf, phasesOf), false);
});

test("wavesFromAfter: 0 без родителей в наборе, иначе 1 + max", () => {
  const afterOf = (name: string) =>
    name === "modsec" ? ["ip"] : name === "vlai" ? ["modsec"] : [];
  assert.deepEqual(
    [...wavesFromAfter(["ip", "modsec", "vlai"], afterOf).entries()],
    [
      ["ip", 0],
      ["modsec", 1],
      ["vlai", 2],
    ],
  );
  assert.equal(wavesFromAfter(["modsec"], afterOf).get("modsec"), 0);
});

test("wavesFromAfter: цикл не роняет компилятор", () => {
  const afterOf = (name: string) => (name === "a" ? ["b"] : ["a"]);
  const waves = wavesFromAfter(["a", "b"], afterOf);
  assert.equal(waves.size, 2);
  assert.ok([...waves.values()].every((wave) => Number.isInteger(wave) && wave >= 0));
});

test("stripFromAfter убирает имя из чужих after", () => {
  assert.deepEqual(
    stripFromAfter({ ip: {}, sqli: { after: ["ip", "ml"] }, ml: { after: ["ip"] } }, "ip"),
    { ip: {}, sqli: { after: ["ml"] }, ml: {} },
  );
});

test("findInspectorUses: узел реестра держит имя", () => {
  assert.deepEqual(
    findInspectorUses("json", [{ at: "space", waf: { inspectors: { json: {} } } }]),
    [{ at: "space", kind: "declared" }],
  );
});

test("findInspectorUses: чужой after -- тоже ссылка, и видно чей", () => {
  assert.deepEqual(
    findInspectorUses("ip", [
      { at: "space", waf: { inspectors: { modsec: { after: ["ip"] } } } },
    ]),
    [{ at: "space", kind: "after", by: "modsec" }],
  );
});

test("findInspectorUses: вызов на маршруте, обе фазы", () => {
  assert.deepEqual(
    findInspectorUses("modsec", [
      {
        at: "location /api/",
        waf: {
          requestInspectors: [{ name: "modsec" }],
          responseInspectors: [{ name: "modsec" }],
        },
      },
    ]),
    [
      { at: "location /api/", kind: "called" },
      { at: "location /api/", kind: "called" },
    ],
  );
});

test("findInspectorUses: all и none -- не ссылка на имя", () => {
  assert.deepEqual(
    findInspectorUses("modsec", [
      { at: "server web", waf: { requestInspectors: "all", responseInspectors: "none" } },
    ]),
    [],
  );
});

test("findInspectorUses: свободное имя -- пустой список", () => {
  assert.deepEqual(
    findInspectorUses("json", [
      { at: "space", waf: { inspectors: { ip: {}, modsec: { after: ["ip"] } } } },
      { at: "location /", waf: { requestInspectors: [{ name: "ip" }] } },
      { at: "server web", waf: undefined },
    ]),
    [],
  );
});
