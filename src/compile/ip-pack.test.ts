import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyIpSet } from "./ip.ts";
import { hashIpTree, packIp, parseIpPointer, pointerOf } from "./ip-pack.ts";
import { BLOB_PREFIX } from "./pointer.ts";
import { encode } from "./redis.ts";

const office = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const banned = "cccccccc-cccc-4ccc-8ccc-000000000003";

test("packIp stores lists and geo, sets and rules stay inline", () => {
  const packed = packIp({
    files: [{ id: office, text: "10.0.0.0/8\n" }],
    countries: [{ code: "ru", text: "5.8.8.0/24\n" }],
    asns: [{ asn: 15169, text: "8.8.8.0/24\n" }],
    sets: [
      {
        ...emptyIpSet("office"),
        lists: [office],
        countries: ["ru"],
        inverse: true,
        exclude: { lists: [], live: [], countries: [], asns: [15169] },
      },
    ],
    profiles: [
      {
        name: "default",
        rules: [{ set: "office", action: "deny", response: "blocked" }],
        default: "allow",
      },
    ],
  });

  assert.equal(packed.blobs.size, 3);
  assert.ok(packed.lists[office].startsWith("sha256:"));
  assert.ok(packed.countries.ru.startsWith("sha256:"));
  assert.ok(packed.asns["15169"].startsWith("sha256:"));
  assert.deepEqual(packed.sets.office.countries, ["ru"]);
  assert.equal(packed.sets.office.inverse, true);
  assert.equal(packed.profiles.default.rules[0].action, "deny");
});

/*
 * Состав живого набора в пак не кладут вовсе -- только uuid и тема. Копия
 * разъехалась бы с шиной на первом же автобане, и разъехалась бы молча.
 */
test("live datasets travel by name, not as a body", () => {
  const packed = packIp({
    files: [],
    live: [{ id: banned, name: "banned" }],
    sets: [{ ...emptyIpSet("banned"), live: [banned] }],
    profiles: [
      {
        name: "default",
        rules: [{ set: "banned", action: "deny" }],
        default: "allow",
      },
    ],
  });

  assert.equal(packed.blobs.size, 0);
  assert.equal(packed.live[banned], "banned");
  assert.deepEqual(packed.sets.banned.live, [banned]);
});

/*
 * Охват записи -- часть канона хеша: подсеть и система дают другой пак, а
 * адрес ключа не пишет вовсе -- поколение, собранное до поля, хешируется как
 * прежде, и ноды не перекачивают его зря.
 */
test("the write scope is part of the canon, the address prints no key", () => {
  const packOf = (write?: string) =>
    packIp({
      files: [{ id: office, text: "10.0.0.0/8\n" }],
      live: [{ id: banned, name: "banned" }],
      sets: [],
      profiles: [
        {
          name: "default",
          rules: [
            {
              dataset: office,
              action: "list",
              list: banned,
              ttl: "60s",
              ...(write === undefined ? {} : { write }),
            },
          ],
          outcomes: [
            { on: "black", list: banned, ttl: "60s", ...(write === undefined ? {} : { write }) },
          ],
          default: "allow",
        },
      ],
    });

  assert.equal(packOf().sha256, packOf("addr").sha256);
  assert.notEqual(packOf().sha256, packOf("net_all").sha256);
  assert.notEqual(packOf("net").sha256, packOf("asn").sha256);
});

test("identical prefix texts share one blob", () => {
  const packed = packIp({
    files: [{ id: office, text: "10.0.0.0/8\n" }],
    countries: [{ code: "xx", text: "10.0.0.0/8\n" }],
    sets: [{ ...emptyIpSet("office"), lists: [office] }],
    profiles: [{ name: "default", rules: [], default: "allow" }],
  });

  assert.equal(packed.blobs.size, 1);
  assert.equal(packed.lists[office], packed.countries.xx);
});

test("packIp rejects a country that was not dumped", () => {
  assert.throws(
    () =>
      packIp({
        files: [],
        countries: [],
        sets: [{ ...emptyIpSet("ru"), countries: ["ru"] }],
        profiles: [{ name: "default", rules: [], default: "allow" }],
      }),
    /unknown country ru/,
  );
});

test("tree hash is stable", () => {
  const source = {
    files: [{ id: office, text: "x" }],
    countries: [{ code: "ru", text: "y" }],
    asns: [{ asn: 1, text: "z" }],
    sets: [{ ...emptyIpSet("office"), lists: [office] }],
    profiles: [
      {
        name: "default",
        rules: [{ set: "office", action: "allow" }],
        default: "allow",
      },
    ],
  };

  assert.equal(packIp(source).sha256, packIp(source).sha256);

  const lists = { [office]: "sha256:a" };
  const countries = { ru: "sha256:b" };
  const asns = { "1": "sha256:c" };
  const live = { [banned]: "banned" };
  const sets = { office: { lists: [office] } };
  const profiles = {
    default: { rules: [{ set: "office", action: "allow" }], default: "allow" },
  };

  assert.equal(
    hashIpTree(lists, countries, asns, live, sets, profiles),
    hashIpTree(lists, countries, asns, live, sets, profiles),
  );

  assert.notEqual(
    hashIpTree(lists, countries, asns, live, sets, profiles),
    hashIpTree(lists, countries, asns, {}, sets, profiles),
  );
});

test("parseIpPointer keeps inline sets and rules", () => {
  const packed = packIp({
    files: [{ id: office, text: "10.0.0.0/8\n" }],
    countries: [{ code: "ru", text: "5.8.8.0/24\n" }],
    sets: [{ ...emptyIpSet("office"), lists: [office], countries: ["ru"] }],
    profiles: [
      {
        name: "default",
        rules: [{ set: "office", action: "allow" }],
        default: "allow",
      },
    ],
  });
  const row = parseIpPointer(pointerOf(packed, 1, 2, 0));

  assert.equal(row?.kind, "ip-pack");
  assert.equal(row?.prefix, BLOB_PREFIX);
  assert.deepEqual(row?.sets.office.countries, ["ru"]);
  assert.equal(row?.profiles.default.rules[0].set, "office");
  assert.equal(row?.lists[office], packed.lists[office]);
});

test("encode SET NX EX is a RESP array", () => {
  const raw = encode([
    "SET",
    "waf.blob.x",
    Buffer.from("ab"),
    "NX",
    "EX",
    "300",
  ]);
  assert.match(raw.toString("latin1"), /\$2\r\nNX/);
  assert.match(raw.toString("latin1"), /\$2\r\nEX/);
  assert.match(raw.toString("latin1"), /\$3\r\n300/);
});
