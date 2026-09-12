import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import type { RecordObject } from "../model/actions.ts";
import { join } from "node:path";

/**
 * Сборка политики адреса в дерево: тела наборов по uuid, составные наборы
 * реестром, профили правилами.
 *
 * Состав активного набора сюда не попадает вовсе -- только uuid и тема:
 * копия разъехалась бы с шиной на первом же автобане. См. docs/profiles.md репозитория ip.
 */

export interface IpCompileFile {
  id: string;
  name?: string;
  text: string;
}

export interface IpCompileCountry {
  code: string;
  text: string;
}

export interface IpCompileAsn {
  asn: number;
  text: string;
}

/* Живой набор: состав приезжает с keeper по имени (waf.sets.<name>). */
export interface IpCompileLive {
  id: string;
  name: string;
}

export interface IpCompileMatch {
  lists: string[];
  live: string[];
  countries: string[];
  asns: number[];
}

export interface IpCompileSet extends IpCompileMatch {
  name: string;
  inverse: boolean;
  exclude: IpCompileMatch;
}

export interface IpCompileRule {
  /** Условие терминальной строки: имя составного набора. */
  set?: string;
  /** Условие накопительной строки: uuid сырого списка. */
  dataset?: string;
  /** «Адрес не в списке»: условие наоборот. Только у request и list. */
  not?: boolean;
  action: string;
  response?: string;
  code?: string;
  to?: string;
  do?: string;
  apply?: string;
  delta?: number;
  value?: number;
  /** note: имя корзины получателя -- селектор поверх его правил приёма. */
  counter?: string;
  /** mark: метка события на записи. */
  marker?: string;
  /** mutate: группа модификаторов получателя; куда переключить -- `side`. */
  group?: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /*
   * Сторона mutate и просьбы записи (audit, archive). У строки ключ `set`
   * занят набором, поэтому сторона здесь -- `side`, как её и читает
   * загрузчик инспектора; срок, исходы и объекты -- только у archive с side on.
   */
  side?: string;
  when?: string[];
  headers?: RecordObject;
  args?: RecordObject;
  body?: RecordObject;
  list?: string;
  /** Кого писать: net | net_all | asn; адрес -- умолчание без ключа. */
  write?: string;
  ttl?: string;
}

/**
 * Инициатор по исходу в форме пака: то, что ляжет в profile.yaml инспектора.
 * ttl -- строкой, как у правил ("300s"); on -- место, где нашёлся адрес
 * (white | black | none).
 */
export interface IpCompileOutcome {
  on: string;
  /**
   * Только у `overload`: с какого заполнения очереди инспектора строка
   * срабатывает, 25..100 процентов. Сотня -- край: запрос сброшен, вердикта
   * нет. Нет ключа -- край, как у пака, изданного до порога.
   */
  at?: number;
  /** Просьба соседу -- либо запись в набор (list): ровно одно из двух. */
  to?: string;
  do?: string;
  apply?: string;
  delta?: number;
  value?: number;
  /** note: имя корзины получателя -- селектор поверх его правил приёма. */
  counter?: string;
  /** mark: метка события на записи. */
  marker?: string;
  /** mutate: группа модификаторов получателя; куда переключить -- `set`. */
  group?: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /* У инициатора ключ `set` свободен: набора-условия у него нет. */
  set?: string;
  when?: string[];
  headers?: RecordObject;
  args?: RecordObject;
  body?: RecordObject;
  list?: string;
  /** Кого писать: net | net_all | asn; адрес -- умолчание без ключа. */
  write?: string;
  ttl?: string;
  code?: string;
}

export interface IpCompileProfile {
  name: string;
  rules: IpCompileRule[];
  outcomes?: IpCompileOutcome[];
  default: string;
  defaultCode?: string;
}

export interface IpCompileSource {
  files: IpCompileFile[];
  countries?: IpCompileCountry[];
  asns?: IpCompileAsn[];
  live?: IpCompileLive[];
  sets: IpCompileSet[];
  profiles: IpCompileProfile[];
}

export interface IpCompileResult {
  root: string;
  filesDir: string;
  profilesDir: string;
  files: number;
  sets: number;
  profiles: number;
}

export const emptyIpMatch = (): IpCompileMatch => ({
  lists: [],
  live: [],
  countries: [],
  asns: [],
});

export const emptyIpSet = (name: string): IpCompileSet => ({
  name,
  ...emptyIpMatch(),
  inverse: false,
  exclude: emptyIpMatch(),
});

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function listIdsOf(set: IpCompileSet): string[] {
  return [...set.lists, ...set.exclude.lists];
}

function liveIdsOf(set: IpCompileSet): string[] {
  return [...set.live, ...set.exclude.live];
}

export function setMark(set: IpCompileSet): string {
  return `${JSON.stringify(
    {
      lists: set.lists,
      live: set.live,
      countries: set.countries,
      asns: set.asns,
      inverse: set.inverse,
      exclude: set.exclude,
    },
    null,
    2,
  )}\n`;
}

export function profileMark(profile: IpCompileProfile): string {
  return `${JSON.stringify(
    {
      rules: profile.rules,
      default: profile.default,
      default_code: profile.defaultCode,
    },
    null,
    2,
  )}\n`;
}

/**
 * Проверка ссылочной целостности. Отдельно от записи на диск: тем же набором
 * правил пользуется упаковщик, а дерево на диске -- только отладочный вывод.
 */
export function checkIp(source: IpCompileSource): Set<string> {
  const files = new Set<string>();

  for (const file of source.files) {
    if (!FILE_ID.test(file.id)) {
      throw new Error(`compile: invalid file id "${file.id}"`);
    }

    if (files.has(file.id)) {
      throw new Error(`compile: duplicate file ${file.id}`);
    }

    files.add(file.id);
  }

  const live = new Set((source.live ?? []).map((row) => row.id));
  const countries = new Set((source.countries ?? []).map((row) => row.code));
  const asns = new Set((source.asns ?? []).map((row) => row.asn));
  const sets = new Set<string>();

  for (const set of source.sets) {
    if (!SET_NAME.test(set.name)) {
      throw new Error(`compile: invalid set name "${set.name}"`);
    }

    if (sets.has(set.name)) {
      throw new Error(`compile: duplicate set ${set.name}`);
    }

    sets.add(set.name);

    for (const id of listIdsOf(set)) {
      if (!files.has(id)) {
        throw new Error(`compile: set ${set.name} references unknown list ${id}`);
      }
    }

    for (const id of liveIdsOf(set)) {
      if (!live.has(id)) {
        throw new Error(
          `compile: set ${set.name} references unknown live dataset ${id}`,
        );
      }
    }

    for (const code of [...set.countries, ...set.exclude.countries]) {
      if (!countries.has(code)) {
        throw new Error(`compile: set ${set.name} references unknown country ${code}`);
      }
    }

    for (const asn of [...set.asns, ...set.exclude.asns]) {
      if (!asns.has(asn)) {
        throw new Error(`compile: set ${set.name} references unknown asn ${asn}`);
      }
    }
  }

  for (const profile of source.profiles) {
    if (!PROFILE_NAME.test(profile.name)) {
      throw new Error(`compile: invalid profile name "${profile.name}"`);
    }

    for (const rule of profile.rules) {
      /*
       * Условие спрашивают одним из двух ключей, и каким -- решает действие.
       * Терминальная строка выносит вердикт: ей нужно выражение над сырьём,
       * то есть составной набор. Накопительная вердикта не выносит: ей нужен
       * состав, то есть сырой список -- он обязан доехать телом либо темой,
       * иначе строка не совпадёт никогда, и молча.
       */
      if (rule.action === "allow" || rule.action === "deny") {
        if (rule.set === undefined || !sets.has(rule.set)) {
          throw new Error(
            `compile: profile ${profile.name} references unknown set ${rule.set}`,
          );
        }
      } else if (
        rule.dataset === undefined
        || (!files.has(rule.dataset) && !live.has(rule.dataset))
      ) {
        throw new Error(
          `compile: profile ${profile.name} references dataset ${rule.dataset}`
            + ` that is not in the pack`,
        );
      }

      /*
       * Действие «внести в список» пишет в тему живого набора. Набор без темы
       * означает запись в никуда, то есть тихо потерянный бан.
       */
      if (rule.action === "list" && (rule.list === undefined || !live.has(rule.list))) {
        throw new Error(
          `compile: profile ${profile.name} writes to a dataset that is not live`,
        );
      }
    }
  }

  return files;
}

export async function compileIp(
  dest: string,
  source: IpCompileSource,
): Promise<IpCompileResult> {
  const tmp = `${dest}.tmp`;
  const filesDir = join(dest, "files");
  const profilesDir = join(dest, "profiles");

  checkIp(source);

  await rm(tmp, { recursive: true, force: true });
  await mkdir(join(tmp, "files"), { recursive: true });
  await mkdir(join(tmp, "sets"), { recursive: true });
  await mkdir(join(tmp, "profiles"), { recursive: true });

  for (const file of source.files) {
    await writeFile(join(tmp, "files", file.id), file.text);
  }

  for (const set of source.sets) {
    await writeFile(join(tmp, "sets", set.name), setMark(set));
  }

  for (const profile of source.profiles) {
    await writeFile(join(tmp, "profiles", profile.name), profileMark(profile));
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(join(dest, ".."), { recursive: true });
  await rename(tmp, dest);

  return {
    root: dest,
    filesDir,
    profilesDir,
    files: source.files.length,
    sets: source.sets.length,
    profiles: source.profiles.length,
  };
}
