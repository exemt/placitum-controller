/*
 * default: что в нём заперто и чем он поставлен.
 *
 * Правится default свободно. Это рабочая политика пространства, а не
 * запертый образец: маршрут, не назвавший `profile=`, читает именно его, и
 * запрет правки заставлял заводить копию ради одной галочки, а потом
 * называть её на каждом маршруте. Заперты две вещи, и обе -- про исчезновение
 * точки опоры, а не про содержимое:
 *
 *   - имя (`default_name_locked`): объявление без `profile=` ищет профиль по
 *     имени "default", переименование равносильно удалению;
 *   - удаление: манифест подсистемы без default не собирается -- отвечают
 *     сами ручки (`default_required` / `default_is_required`).
 *
 * Здесь же снимок поставки: чем default приходит из сида
 * (`schema/migrations/060_default_profiles.sql`, у наборов правил -- `012_rule_profiles`).
 * Панели он нужен дважды -- сказать «профиль отличается от поставки» и
 * вернуть его как было. Источник правды -- код, а не снятая с базы копия: у
 * всех пространств и у свежей установки образец обязан быть один, а снимок
 * строки разъехался бы по установкам.
 */

import { isDeepStrictEqual } from "node:util";

import { RULE_SET_SEED } from "./compile/rule-set-seed.ts";

export const DEFAULT_PROFILE_NAME = "default";

/**
 * Правка PUT переименовывает default?
 *
 * `next` приходит сырым телом или уже разобранным именем: не строка -- имя не
 * трогают. Совпадение с прежним именем правкой не считается: PUT с полным
 * телом шлёт имя всегда.
 */
export function isDefaultRename(current: string, next: unknown): boolean {
  return (
    current === DEFAULT_PROFILE_NAME &&
    typeof next === "string" &&
    next !== DEFAULT_PROFILE_NAME
  );
}

/**
 * Поставка профиля с документом: auth, captcha, json, counter, action, rewrite,
 * vlai.
 *
 * Документ пуст: у профиля больше нет режима, включён ли инспектор, решает
 * вызов на маршруте (waf_inspect … mode=). Старые строки с `{"mode":"off"}`
 * нормализация читает так же -- ключ выброшен. Описание -- слово в слово из
 * 081_default_profiles_unmoded.sql.
 */
export const DEFAULT_DOC_BASELINE = {
  description: "Профиль по умолчанию",
  doc: {},
} as const;

/** Поставка профиля адреса: без правил и списков, иначе allow. */
export const DEFAULT_IP_BASELINE = {
  description: "Профиль по умолчанию: без правил, иначе allow",
  rules: [],
  datasets: [],
  outcomes: [],
  defaultAction: "allow",
  defaultCode: "",
} as const;

/**
 * Поставка набора правил. Состав -- имена файлов из
 * `src/compile/rule-set-seed.ts`, откуда его берёт и сид 012: файлы приходят
 * с фиксированными uuid, но искать их по имени честнее -- восстановление
 * работает и там, где каталог пересобрали.
 *
 * Файла может не оказаться (его снесли из каталога): восстановление ставит
 * то, что нашлось, и говорит, чего не хватило, -- набор без единого файла
 * роняет рендер манифеста.
 */
const shippedRuleSet = RULE_SET_SEED.find((set) => set.name === DEFAULT_PROFILE_NAME);

if (shippedRuleSet === undefined) {
  throw new Error("rule set seed has no default");
}

export const DEFAULT_RULE_SET_BASELINE = {
  description: shippedRuleSet.description,
  files: shippedRuleSet.files,
  dataFiles: [] as string[],
};

/**
 * Профиль адреса отличается от поставки?
 *
 * Сравнивается всё, что перезапишет восстановление: правила, инициаторы,
 * строка «иначе» и описание. Пустой профиль с `allow` -- ровно то, что кладёт
 * сид.
 */
export function ipDiffersFromBaseline(row: {
  description: string;
  rules: readonly unknown[];
  datasets: readonly unknown[];
  outcomes: readonly unknown[];
  defaultAction: string;
  defaultCode: string;
}): boolean {
  return (
    row.description !== DEFAULT_IP_BASELINE.description ||
    row.rules.length > 0 ||
    row.datasets.length > 0 ||
    row.outcomes.length > 0 ||
    row.defaultAction !== DEFAULT_IP_BASELINE.defaultAction ||
    row.defaultCode !== DEFAULT_IP_BASELINE.defaultCode
  );
}

/**
 * Набор правил отличается от поставки?
 *
 * Состав сверяется именами файлов и их порядком: uuid у файлов свои в каждом
 * пространстве, а имя -- то, чем набор описан в сиде.
 */
export function ruleSetDiffersFromBaseline(
  description: string,
  files: readonly string[],
  dataFiles: readonly string[],
  policyEmpty: boolean,
): boolean {
  return (
    description !== DEFAULT_RULE_SET_BASELINE.description ||
    !isDeepStrictEqual([...files], [...DEFAULT_RULE_SET_BASELINE.files]) ||
    dataFiles.length > 0 ||
    !policyEmpty
  );
}

/**
 * Профиль отличается от поставки?
 *
 * Документ сравнивается нормализованным, не как лежит в базе: сид кладёт
 * короткое `{"mode":"off"}`, а сохранение из панели -- полную форму с
 * умолчаниями. Без нормализации восстановленный профиль сразу же снова
 * считался бы изменённым.
 */
export function docDiffersFromBaseline(
  description: string,
  doc: unknown,
  normalize: (raw: unknown) => unknown,
): boolean {
  return (
    description !== DEFAULT_DOC_BASELINE.description ||
    !isDeepStrictEqual(normalize(doc), normalize(DEFAULT_DOC_BASELINE.doc))
  );
}
