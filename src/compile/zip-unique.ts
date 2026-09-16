import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { sha256, zipEntries, type ZipEntry } from "./zip.ts";

const root = process.argv[2];
if (root === undefined) {
  throw new Error("usage: zip-unique <rules-dir>");
}

const filesDir = join(root, "files");
const profilesDir = join(root, "profiles");
const unique = new Map<string, Buffer>();
const entries: ZipEntry[] = [];
let fileCopies = 0;

for (const name of await readdir(filesDir)) {
  const data = await readFile(join(filesDir, name));
  fileCopies += 1;
  unique.set(createHash("sha256").update(data).digest("hex"), data);
}

for (const name of await readdir(profilesDir)) {
  entries.push({
    name: `profiles/${name}`,
    data: await readFile(join(profilesDir, name)),
  });
}

let i = 0;
for (const data of unique.values()) {
  i += 1;
  entries.push({ name: `blobs/${String(i).padStart(3, "0")}`, data });
}

const all = zipEntries(await (async () => {
  const out: ZipEntry[] = [];
  for (const name of await readdir(filesDir)) {
    out.push({ name: `files/${name}`, data: await readFile(join(filesDir, name)) });
  }
  for (const name of await readdir(profilesDir)) {
    out.push({ name: `profiles/${name}`, data: await readFile(join(profilesDir, name)) });
  }
  return out;
})());

const dedup = zipEntries(entries);

process.stdout.write(
  JSON.stringify(
    {
      file_copies: fileCopies,
      unique_blobs: unique.size,
      zip_all_bytes: all.length,
      zip_unique_bytes: dedup.length,
      sha256_all: sha256(all),
      sha256_unique: sha256(dedup),
    },
    null,
    2,
  ) + "\n",
);
