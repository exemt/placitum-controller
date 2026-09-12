import type {
  Cond,
  InspectorRef,
  WafRouteSettings,
} from "./model/waf-route.ts";
import { selectInspectorsInSpace } from "./state/slices/inspectors.ts";
import { selectLocationsInSpace } from "./state/slices/locations.ts";
import { selectServersInSpace } from "./state/slices/servers.ts";
import { spaceSelectors } from "./state/slices/spaces.ts";
import type { RootState } from "./state/types.ts";

/*
 * Кто держит объект: общий отчёт для всех DELETE панели. Форма та же, что у
 * каталога инспекторов (`InspectorUse`): место, вид ссылки и, где есть, чьё
 * это поле. Снимать ссылки за оператора нельзя -- маршрут без профиля или
 * проверка без набора это другая политика, а не уборка, поэтому занятый
 * объект отвечает 409 со списком мест, а не каскадом.
 */
export interface Use {
  /**
   * Место: уровень конфигурации (`space`, `server <name>`, `location <path>`)
   * или имя сущности-держателя (`set office`, `auth default`).
   */
  at: string;
  /**
   * Вид ссылки: `profile` -- `profile=` объявления реестра; `check`, `rate`,
   * `cond` -- локальный слой; остальное -- имя подсистемы, чей документ или
   * строка ссылается (`set`, `ip_profile`, `auth`, `captcha`, `json`,
   * `counter`, `deny`, `included`).
   */
  kind: string;
  /** Для уровневых ссылок -- чьё поле: имя объявления, переменная, ключ. */
  by?: string;
}

interface UseScope {
  at: string;
  waf?: WafRouteSettings;
}

function scopesOf(state: RootState, scope: string): UseScope[] {
  const space = spaceSelectors.selectById(state, scope);
  const servers = selectServersInSpace(state, scope);
  const locations = selectLocationsInSpace(state, scope);

  return [
    { at: "space", waf: space?.waf },
    ...servers.map((row) => ({ at: `server ${row.name}`, waf: row.waf })),
    ...locations.map((row) => ({ at: `location ${row.path}`, waf: row.waf })),
  ];
}

/**
 * Где профиль подсистемы назван с маршрута. Ссылка -- `profile=` объявления
 * реестра, и объявление без `profile=` тоже ссылка: инспектор читает его как
 * `default`. Подсистему объявления даёт каталог: process -> subject, сервис --
 * последнее звено темы (`waf.req.ip` -> `ip`), как везде в панели.
 *
 * Объявление, чей процесс каталогу неизвестен, не считается: сборка на нём
 * падает раньше, чем профиль кому-то понадобится.
 */
export function profileUses(
  state: RootState,
  scope: string,
  service: string,
  profile: string,
): Use[] {
  const serviceByName = new Map(
    selectInspectorsInSpace(state, scope).map((row) => [
      row.name,
      row.subject.split(".").pop() ?? "",
    ]),
  );

  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const graph = level.waf?.inspectors ?? {};

    for (const [name, decl] of Object.entries(graph)) {
      const process = decl.process ?? name;

      if (serviceByName.get(process) !== service) {
        continue;
      }

      const named =
        decl.profile === undefined || decl.profile === ""
          ? "default"
          : decl.profile;

      if (named === profile) {
        out.push({ at: level.at, kind: "profile", by: name });
      }
    }
  }

  return out;
}

function condsHold(conds: Cond[] | undefined, dataset: string): boolean {
  return (conds ?? []).some((cond) => cond.dataset === dataset);
}

/**
 * Где вызов калитки этого профиля стоит под if-условием (быстрый путь).
 *
 * Для профиля с допуском по группам это дыра, а не оптимизация: условие
 * отвечает локальным слоем, инспектора не спрашивая, -- то есть и групп не
 * проверяя. Раньше пару ловила проверка внутри одного документа (список и
 * группы жили в профиле); теперь список объявлен на источнике, и единственное
 * место, где пара сходится, -- маршрут. Поэтому обход маршрутов, а не документ.
 */
export function authFastPathUses(
  state: RootState,
  scope: string,
  profile: string,
): Use[] {
  const gates = new Set(
    profileUses(state, scope, "auth", profile).map((use) => use.by ?? ""),
  );

  if (gates.size === 0) {
    return [];
  }

  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const list = level.waf?.requestInspectors;

    if (!Array.isArray(list)) {
      continue;
    }

    for (const ref of list as InspectorRef[]) {
      if (gates.has(ref.name) && (ref.conds ?? []).length > 0) {
        out.push({ at: level.at, kind: "cond", by: ref.name });
      }
    }
  }

  return out;
}

/**
 * Где набор данных назван в waf-документах трёх уровней: проверки локального
 * слоя (`waf_local_check`), автобан лимитов (`waf_local_rate list=`) и
 * if-условия строк -- у проверок, лимитов и вызовов инспекторов. Ссылки эти
 * по имени и без FK, поэтому SQL их не видит -- только обход документов.
 */
export function datasetWafUses(
  state: RootState,
  scope: string,
  name: string,
): Use[] {
  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const waf = level.waf;

    if (waf === undefined) {
      continue;
    }

    for (const check of waf.localChecks ?? []) {
      if (check.dataset === name) {
        out.push({ at: level.at, kind: "check", by: check.variable });
      } else if (condsHold(check.conds, name)) {
        out.push({ at: level.at, kind: "cond", by: check.variable });
      }
    }

    for (const rate of waf.localRates ?? []) {
      if (rate.list === name) {
        out.push({ at: level.at, kind: "rate", by: rate.key });
      } else if (condsHold(rate.conds, name)) {
        out.push({ at: level.at, kind: "cond", by: rate.key });
      }
    }

    for (const list of [waf.requestInspectors, waf.responseInspectors, waf.frameInspectors]) {
      if (!Array.isArray(list)) {
        continue;
      }

      for (const ref of list as InspectorRef[]) {
        if (condsHold(ref.conds, name)) {
          out.push({ at: level.at, kind: "cond", by: ref.name });
        }
      }
    }
  }

  return out;
}

/**
 * Где ответ отказа назван в waf-документах трёх уровней: умолчание маршрута
 * (`waf_deny_response_default`), пороги счёта обеих фаз и `response=` строк
 * локального слоя. Ссылки эти по имени и без FK, поэтому SQL их не видит --
 * только обход документов. Запись, которую кто-то держит, снимать нельзя:
 * сборка падает на `unknown_deny_response` у всего контура сразу (см.
 * compile/waf-validate.ts).
 */
export function denyResponseUses(
  state: RootState,
  scope: string,
  name: string,
): Use[] {
  const out: Use[] = [];

  for (const level of scopesOf(state, scope)) {
    const waf = level.waf;

    if (waf === undefined) {
      continue;
    }

    if (waf.denyResponseDefault === name) {
      out.push({ at: level.at, kind: "default" });
    }

    if (waf.scoreDeny?.response === name) {
      out.push({ at: level.at, kind: "score", by: "request" });
    }

    if (waf.responseScoreDeny?.response === name) {
      out.push({ at: level.at, kind: "score", by: "response" });
    }

    for (const check of waf.localChecks ?? []) {
      if (check.response === name) {
        out.push({ at: level.at, kind: "check", by: check.variable });
      }
    }

    for (const rate of waf.localRates ?? []) {
      if (rate.response === name) {
        out.push({ at: level.at, kind: "rate", by: rate.key });
      }
    }
  }

  return out;
}

/**
 * Строка для `detail` ответа 409: первые места списком, по-английски, как
 * остальные detail контроллера. Полный список едет рядом в `uses` -- строка
 * лишь даёт полосе отказа фразу, не заставляя панель разбирать структуру.
 */
export function usesDetail(uses: Use[]): string {
  const shown = uses.slice(0, 5).map((use) => {
    const place = use.by === undefined ? use.at : `${use.by} @ ${use.at}`;
    return `${use.kind} ${place}`;
  });

  const more = uses.length - shown.length;

  return more > 0 ? `${shown.join(", ")} +${more}` : shown.join(", ");
}
