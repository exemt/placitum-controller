// Сверяет ссылки на документацию из панели с заголовками в ux/help.
// Ссылка живёт в трёх видах: атрибут help="06-ip#…" у блока или окна,
// константа *_HELP и разметка [текст](06-ip#…) внутри строк ru.ts / en.ts.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// повторяет slugify из src/help/toc.ts
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const anchors = new Map();
for (const file of readdirSync("help")) {
  if (!file.endsWith(".md")) continue;
  const slug = file.slice(0, -3);
  const set = new Set();
  let fenced = false;
  for (const line of readFileSync(join("help", file), "utf8").split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const head = /^(#{2,4})\s+(.+)$/.exec(line);
    if (head !== null) set.add(slugify(head[2]));
  }
  anchors.set(slug, set);
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(path)) files.push(path);
  }
})("src");

const targets = new Map();
const docLinks = new Map();
function note(target, where) {
  if (!targets.has(target)) targets.set(target, new Set());
  targets.get(target).add(where);
}

const PATTERNS = [
  /\bhelp[:=]\s*\{?"([0-9a-z][\w-]*(?:#[^"]+)?)"/g,
  /\b(?:to|help)=\{?\s*"([0-9a-z][\w-]*#[^"]+)"/g,
  /_HELP\s*=\s*"([^"]+)"/g,
  /"(\d{2}-[a-z-]+#[^"]+)"/g,
  /\]\(([0-9]{2}-[a-z-]+(?:#[^)\s]+)?)\)/g,
];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const pattern of PATTERNS) {
    for (const m of src.matchAll(pattern)) note(m[1], file);
  }
}

// ссылки между разделами самой документации
for (const file of readdirSync("help")) {
  if (!file.endsWith(".md")) continue;
  const text = readFileSync(join("help", file), "utf8");
  for (const m of text.matchAll(/\]\(([0-9a-z][\w-]*)\.md(#[^)\s]+)?\)/g)) {
    const target = m[1] + (m[2] ?? "");
    if (!docLinks.has(target)) docLinks.set(target, new Set());
    docLinks.get(target).add(`help/${file}`);
  }
}

const bad = [];
for (const [target, where] of [...targets, ...docLinks]) {
  const [slug, anchor] = target.split("#");
  const set = anchors.get(slug);
  if (set === undefined) {
    bad.push(`нет раздела ${slug}  ← ${[...where].join(", ")}`);
    continue;
  }
  if (anchor !== undefined && !set.has(anchor)) {
    bad.push(`нет заголовка ${target}  ← ${[...where].join(", ")}`);
  }
}

const linked = new Set([...targets.keys()].map((target) => target.split("#")[0]));
const orphans = [...anchors.keys()]
  .filter((slug) => !linked.has(slug) && !slug.startsWith("license"))
  .sort();

if (bad.length > 0) {
  console.error(bad.join("\n"));
  process.exit(1);
}
console.log(
  `ссылок из панели: ${targets.size}, разделов: ${linked.size} из ${anchors.size}; ` +
    `ссылок между разделами: ${docLinks.size}`,
);
if (orphans.length > 0) {
  console.log(`из панели не ссылаются: ${orphans.join(", ")}`);
}
