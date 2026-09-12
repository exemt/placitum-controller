import { writeFile } from "node:fs/promises";

import { sha256, zipDirectory, zipEntries } from "./zip.ts";

const root = process.argv[2];
const dest = process.argv[3];

if (root === undefined || dest === undefined) {
  throw new Error("usage: pack-dir <dir> <out.zip>");
}

const zip = zipEntries(await zipDirectory(root));
await writeFile(dest, zip);
process.stdout.write(
  JSON.stringify({ zip: dest, bytes: zip.length, sha256: sha256(zip) }) + "\n",
);
