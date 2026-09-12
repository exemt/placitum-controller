import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { compileIp, emptyIpSet, profileMark, setMark } from "./ip.ts";

const office = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const bots = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";
const banned = "cccccccc-cccc-4ccc-8ccc-000000000003";
const OFFICE_TEXT = "10.0.0.0/8\n";

function source() {
  const set = {
    ...emptyIpSet("office"),
    lists: [office],
    countries: ["ru"],
    inverse: true,
    exclude: { lists: [bots], live: [], countries: [], asns: [] },
  };

  return {
    files: [
      { id: office, name: "office", text: "10.0.0.0/8\n" },
      { id: bots, name: "bots", text: "203.0.113.0/24\n" },
    ],
    countries: [{ code: "ru", text: "5.8.8.0/24\n" }],
    live: [{ id: banned, name: "banned" }],
    sets: [set],
    profiles: [
      {
        name: "default",
        rules: [
          /* Терминальная спрашивает про набор, накопительная -- про список. */
          { set: "office", action: "allow" },
          { dataset: office, action: "list", list: banned, ttl: "300s" },
        ],
        default: "allow",
      },
    ],
    set,
  };
}

test("compile writes ip lists by uuid, sets and profiles as json", async () => {
  const root = await mkdtemp(join(tmpdir(), "waf-ip-compile-"));
  const dest = join(root, "ip");

  try {
    const src = source();
    const out = await compileIp(dest, src);

    assert.equal(out.files, 2);
    assert.equal(out.sets, 1);
    assert.equal(out.profiles, 1);
    assert.equal(
      await readFile(join(dest, "files", office), "utf8"),
      "10.0.0.0/8\n",
    );
    assert.equal(
      await readFile(join(dest, "sets", "office"), "utf8"),
      setMark(src.set),
    );
    assert.equal(
      await readFile(join(dest, "profiles", "default"), "utf8"),
      profileMark(src.profiles[0]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("compile rejects a set that points at a missing list", async () => {
  const root = await mkdtemp(join(tmpdir(), "waf-ip-compile-"));

  await assert.rejects(
    () =>
      compileIp(join(root, "ip"), {
        files: [{ id: office, text: "10.0.0.0/8\n" }],
        sets: [{ ...emptyIpSet("office"), lists: [bots] }],
        profiles: [
          { name: "default", rules: [{ set: "office", action: "allow" }], default: "allow" },
        ],
      }),
    /unknown list/,
  );

  await rm(root, { recursive: true, force: true });
});

/*
 * Условие накопительной строки -- сырой список, и он обязан доехать: телом
 * либо темой. Не доехал -- строка не совпадёт никогда, и молча: ни вердикта,
 * ни находки она не даёт, а значит и следа в логе не оставит.
 */
test("compile rejects a rule whose dataset is not in the pack", async () => {
  const root = await mkdtemp(join(tmpdir(), "waf-ip-compile-"));

  await assert.rejects(
    () =>
      compileIp(join(root, "ip"), {
        files: [{ id: office, text: OFFICE_TEXT }],
        sets: [{ ...emptyIpSet("office"), lists: [office] }],
        profiles: [
          {
            name: "default",
            rules: [
              { dataset: bots, action: "request", to: "captcha", do: "challenge" },
            ],
            default: "allow",
          },
        ],
      }),
    /dataset .* not in the pack/,
  );

  await rm(root, { recursive: true, force: true });
});

test("compile rejects a rule that points at a missing set", async () => {
  const root = await mkdtemp(join(tmpdir(), "waf-ip-compile-"));

  await assert.rejects(
    () =>
      compileIp(join(root, "ip"), {
        files: [{ id: office, text: "10.0.0.0/8\n" }],
        sets: [{ ...emptyIpSet("office"), lists: [office] }],
        profiles: [
          { name: "default", rules: [{ set: "nosuch", action: "deny" }], default: "allow" },
        ],
      }),
    /unknown set/,
  );

  await rm(root, { recursive: true, force: true });
});

/*
 * Действие «внести в список» пишет в тему живого набора. Набор, которого нет
 * в реестре живых, означает запись в никуда -- то есть тихо потерянный бан.
 */
test("compile rejects a list action that writes to a set that is not live", async () => {
  const root = await mkdtemp(join(tmpdir(), "waf-ip-compile-"));

  await assert.rejects(
    () =>
      compileIp(join(root, "ip"), {
        files: [{ id: office, text: "10.0.0.0/8\n" }],
        sets: [{ ...emptyIpSet("office"), lists: [office] }],
        profiles: [
          {
            name: "default",
            rules: [{ dataset: office, action: "list", list: banned }],
            default: "allow",
          },
        ],
      }),
    /not live/,
  );

  await rm(root, { recursive: true, force: true });
});
