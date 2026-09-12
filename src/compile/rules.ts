import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { profileText } from "./pack.ts";

/**
 * Упаковка правил в два каталога. Тела списков — по uuid, профиль —
 * последовательность uuid файлов. Что делать с деревом дальше — отдельно.
 */
export interface RuleCompileFile {
  id: string;
  name?: string;
  text: string;
}

export interface RuleCompileProfile {
  name: string;
  files: string[];
  /**
   * Файлы данных профиля для операторов `*FromFile`: имя на диске и текст.
   * В пак попадают общей секцией data -- инспектор раскладывает её в каталог
   * каждого профиля, поэтому одноимённые файлы двух профилей обязаны
   * совпадать телом (packSource это проверяет).
   */
  data?: { name: string; text: string }[];
  /**
   * Текст policy.yaml профиля: правила приёма чужих просьб и инициаторы по
   * исходу. Пусто -- файла не будет вовсе, и это обычное состояние: профиль
   * никого не слушает и никого не просит.
   */
  policy?: string;
}

export interface RuleCompileSource {
  files: RuleCompileFile[];
  profiles: RuleCompileProfile[];
}

export interface RuleCompileResult {
  root: string;
  filesDir: string;
  profilesDir: string;
  files: number;
  profiles: number;
}

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function compileRules(
  dest: string,
  source: RuleCompileSource,
): Promise<RuleCompileResult> {
  const tmp = `${dest}.tmp`;
  const filesDir = join(dest, "files");
  const profilesDir = join(dest, "profiles");

  await rm(tmp, { recursive: true, force: true });
  await mkdir(join(tmp, "files"), { recursive: true });
  await mkdir(join(tmp, "profiles"), { recursive: true });

  const seen = new Set<string>();

  for (const file of source.files) {
    if (!FILE_ID.test(file.id)) {
      throw new Error(`compile: invalid file id "${file.id}"`);
    }

    if (seen.has(file.id)) {
      throw new Error(`compile: duplicate file ${file.id}`);
    }

    seen.add(file.id);
    await writeFile(join(tmp, "files", file.id), file.text);

    if (file.name !== undefined && file.name.endsWith(".data")) {
      await mkdir(join(tmp, "data"), { recursive: true });
      await writeFile(join(tmp, "data", basename(file.name)), file.text);
    }
  }

  for (const profile of source.profiles) {
    if (!PROFILE_NAME.test(profile.name)) {
      throw new Error(`compile: invalid profile name "${profile.name}"`);
    }

    for (const id of profile.files) {
      if (!seen.has(id)) {
        throw new Error(
          `compile: profile ${profile.name} references unknown file ${id}`,
        );
      }
    }

    await writeFile(join(tmp, "profiles", profile.name), profileText(profile.files));
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(join(dest, ".."), { recursive: true });
  await rename(tmp, dest);

  return {
    root: dest,
    filesDir,
    profilesDir,
    files: source.files.length,
    profiles: source.profiles.length,
  };
}
