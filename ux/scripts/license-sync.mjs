// Keeps ux/help/license*.md equal to LICENSE*.md: the panel shows the license without the API.

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ux = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(ux, "..");

const PAIRS = [
  ["LICENSE.md", "license.md"],
  ["LICENSE.ru.md", "license.ru.md"],
];

for (const [from, to] of PAIRS) {
  const src = join(root, from);
  const dst = join(ux, "help", to);
  if (!existsSync(src)) {
    continue;
  }
  if (existsSync(dst) && readFileSync(src, "utf8") === readFileSync(dst, "utf8")) {
    continue;
  }
  copyFileSync(src, dst);
  console.log(`license-sync: ${from} -> help/${to}`);
}
