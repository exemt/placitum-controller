/*
 * Копия лицензии для бандла панели.
 *
 * Текст соглашения живёт в корне репозитория -- `LICENSE.md` (английский,
 * он же юридически главный) и `LICENSE.ru.md` (перевод), там его ждут люди и
 * GitHub. Панели он нужен внутри бандла (окно согласия и
 * страница /license обязаны открываться при мёртвом API), а образ контроллера
 * собирается из `controller/` и корня не видит. Поэтому копии лежат в
 * `ux/help/` и коммитятся вместе с оригиналом, а этот скрипт держит их равными:
 * он бежит перед `dev` и `build` (pre-скрипты package.json).
 *
 * Нет корня -- сборка образа: копии уже на месте, ничего не делаем.
 *
 *     node scripts/license-sync.mjs
 */

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ux = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(ux, "..", "..");

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
