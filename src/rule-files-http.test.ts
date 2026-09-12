import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { ruleFilesRouter } from "./rule-files-http.ts";
import type { RuleFileRepo } from "./rule-files.ts";
import type { RuleFile } from "./model/rule-set.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const SCOPE = "3f2a9c1e-4b2a-41c0-8f3a-000000000001";
const FILE = "3f2a9c1e-4b2a-41c0-8f3a-000000000061";
const NOW = new Date("2026-08-17T12:00:00.000Z");

const row: RuleFile = {
  id: FILE,
  httpSpaceId: SCOPE,
  name: "30-policy.conf",
  description: "",
  textRaw: "SecRuleEngine On\n",
  createdAt: NOW,
  updatedAt: NOW,
};

function getState(): RootState {
  return {
    ruleFiles: {
      ids: [FILE],
      entities: {
        [FILE]: {
          id: FILE,
          httpSpaceId: SCOPE,
          name: row.name,
          description: "",
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
  } as unknown as RootState;
}

async function withApp(
  uses: { at: string; kind: string }[],
  run: (base: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/:scopeUuid/rule-files",
    ruleFilesRouter(
      ((() => ({
        unwrap: async () => row,
      })) as unknown) as AppDispatch,
      getState,
      {
        get: async (id: string) => (id === FILE ? row : null),
        setUses: async () => uses,
      } as unknown as RuleFileRepo,
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

test("DELETE снимает файл, который не включён ни в один профиль", async () => {
  await withApp([], async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-files/${FILE}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { uuid: string; name: string };
    assert.equal(body.uuid, FILE);
    assert.equal(body.name, "30-policy.conf");
  });
});

test("DELETE отказывает, пока файл в составе профиля", async () => {
  await withApp([{ at: "strict", kind: "included" }], async (base) => {
    const res = await fetch(`${base}/api/${SCOPE}/rule-files/${FILE}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      error: string;
      detail: string;
      uses: unknown;
    };
    assert.equal(body.error, "in_use");
    assert.equal(body.detail, "included strict");
    assert.deepEqual(body.uses, [{ at: "strict", kind: "included" }]);
  });
});

test("DELETE неизвестного файла -- 404", async () => {
  await withApp([], async (base) => {
    const res = await fetch(
      `${base}/api/${SCOPE}/rule-files/3f2a9c1e-4b2a-41c0-8f3a-0000000000ff`,
      { method: "DELETE" },
    );
    assert.equal(res.status, 404);
  });
});
