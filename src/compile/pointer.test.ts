import assert from "node:assert/strict";
import { test } from "node:test";

import { blobKey, hashTree, packSource, profileText } from "./pack.ts";
import { BLOB_PREFIX, parsePointer } from "./pointer.ts";
import { encode } from "./redis.ts";

const engine = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const policy = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";

test("blob key is content-addressed", () => {
  const hex = "a".repeat(64);
  assert.equal(blobKey(`sha256:${hex}`), `${BLOB_PREFIX}${hex}`);
});

test("identical lists share one blob", () => {
  const packed = packSource({
    files: [
      { id: engine, text: "SecRuleEngine On\n" },
      { id: policy, text: "SecRuleEngine On\n" },
    ],
    profiles: [{ name: "default", files: [engine] }],
  });

  assert.equal(packed.blobs.size, 2);
  assert.equal(packed.files[engine], packed.files[policy]);
  assert.equal(profileText([engine]), `${engine}\n`);
});

test("pmFromFile pulls named data blobs", () => {
  const data = "cccccccc-cccc-4ccc-8ccc-000000000003";
  const packed = packSource({
    files: [
      {
        id: engine,
        name: "crs-934",
        text: `SecRule ARGS "@pmFromFile ssrf.data" "id:1"\n`,
      },
      { id: data, name: "ssrf.data", text: "http://169.254.169.254/\n" },
    ],
    profiles: [{ name: "default", files: [engine] }],
  });

  assert.equal(packed.data["ssrf.data"], packed.files[data]);
});

test("tree hash is stable", () => {
  const source = {
    files: [{ id: engine, text: "x" }],
    profiles: [{ name: "default", files: [engine] }],
  };
  assert.equal(packSource(source).sha256, packSource(source).sha256);
  assert.equal(
    hashTree({ [engine]: "sha256:a" }, { default: "sha256:b" }),
    hashTree({ [engine]: "sha256:a" }, { default: "sha256:b" }),
  );
});

test("parsePointer accepts a blob tree", () => {
  const row = parsePointer({
    v: 1,
    kind: "rules-pack",
    rev: 2,
    sha256: "sha256:abc",
    prefix: BLOB_PREFIX,
    files: { [engine]: "sha256:aa" },
    profiles: { default: "sha256:bb" },
    data: { "ssrf.data": "sha256:cc" },
    blobs: 2,
    wrote: 1,
    reused: 1,
    bytes: 10,
  });

  assert.equal(row?.rev, 2);
  assert.equal(row?.files[engine], "sha256:aa");
  assert.equal(row?.data["ssrf.data"], "sha256:cc");
});

test("encode SET NX is a RESP array", () => {
  const raw = encode(["SET", "waf.blob.x", Buffer.from("ab"), "NX"]);
  assert.match(raw.toString("latin1"), /\$2\r\nNX/);
});
