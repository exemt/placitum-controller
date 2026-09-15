import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})("src");

const used = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) used.add(m[1]);
}

const { ru } = await import("../src/i18n/ru.ts");
const { en } = await import("../src/i18n/en.ts");

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const bad = [];
for (const key of [...used].sort()) {
  if (get(ru, key) === undefined) bad.push(["ru", key]);
  if (get(en, key) === undefined) bad.push(["en", key]);
}
console.log(bad.length === 0 ? "все ключи на месте: " + used.size : bad.map(b => b.join(" ")).join("\n"));
